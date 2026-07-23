// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE
// once any run can be in flight. autoDraft_v3 is a NEW frozen closure (registry repoints
// `autoDraft: autoDraft_v3`); autoDraft_v2/v1 and every other export are byte-untouched. Do NOT
// edit this file or its import closure (autoDraft.v3.impl / .tools / .infra / .prompt / .errors)
// once deployed — ship a behavioural change as autoDraft_v4.
//
// autoDraft_v3 (Wave B, ADR-032 WB-R7, FORK-6, AMB-1/AMB-2, WB-R6(4)) — the UNATTENDED
// auto-draft sweep, shipped wiki-aware in the SAME ceremony as chatTurn_v7 (WB-R7: sweep
// drafts remain human-reviewed under the acknowledgement floors; the eval carries a
// sweep-specific W2 probe). The get_context_pack TOOL fetches purpose "wiki_coding" (AMB-1)
// instead of v2's "coding" default, with the txn-local `clara.pack_consumer = 'v25'` GUC
// (FORK-6) set immediately before that fetch, in the SAME transaction, and its `purpose`
// input is pinned to the literal enum "wiki_coding" (z.literal). The server-side
// draft-wrapper re-fetch stays purpose "coding" and never sets the GUC (AMB-1, wiki-dark —
// it only needs books_version). The prompt adds the WB-R6(4) wiki framing adapted for this
// unattended lane (wiki citations land in the entry's memo, since this lane persists no
// transcript). Schema + steps are otherwise byte-identical to v2: one admitted READY bill
// per task: claim (begin_autodraft_task: CAS queued->running + context + reserved tokens)
// -> recover a completed attempt (kill-after-draft resume, no re-model) -> run the coding
// model client-pinned (drafts ONLY) -> settle_autodraft_task with actuals. BOTH double_coded
// reasons map to a SUCCESS-shaped noop_existing settle (WA-L8). A question-shaped non-draft
// MAY open a scoped open-question (origin sweep_refusal) then settles failed with the
// refusal. Kill/replay-safe at every step boundary (begin/settle are idempotent; the model
// step is guarded by the op_key + the get_coding_attempt recovery).

import {
  claimAutoDraftStep,
  recoverAutoDraftStep,
  runAutoDraftModelStep,
  settleAutoDraftStep,
  openSweepQuestionStep,
  closeAutoDraftStreamStep,
} from "./autoDraft.v3.impl.js";
import { isQuestionShaped } from "./autoDraft.v3.prompt.js";
import { noDraftRefusal } from "./autoDraft.v3.errors.js";

export async function autoDraft_v3(input: { taskId: string }): Promise<{ taskId: string; outcome: string }> {
  "use workflow";
  const taskId = input.taskId;
  let settled = false;
  const settle = async (
    outcome: "drafted" | "skipped_lane" | "noop_existing" | "failed",
    tokens: number,
    entryId: string | null,
    refusal: unknown | null,
  ) => {
    if (settled) return;
    settled = true;
    await settleAutoDraftStep(taskId, outcome, tokens, entryId, refusal);
  };

  try {
    const claim = await claimAutoDraftStep(taskId);
    if (!claim.claimed || !claim.ctx) return { taskId, outcome: "deduped" };
    const ctx = {
      firmId: claim.ctx.firmId,
      clientId: claim.ctx.clientId,
      documentId: claim.ctx.documentId,
      filingId: claim.ctx.filingId,
      taskId,
    };

    // Kill-after-draft resume: a persisted attempt short-circuits to the drafted settle.
    const recovered = await recoverAutoDraftStep(taskId);
    if (recovered) {
      await settle("drafted", 0, recovered.entry_id, null);
      return { taskId, outcome: "drafted" };
    }

    const seg = await runAutoDraftModelStep(ctx, claim.ctx.model);
    const outcome = seg.outcome;

    if (outcome.kind === "drafted") {
      await settle("drafted", seg.usageTokens, outcome.entryId, null);
      return { taskId, outcome: "drafted" };
    }
    if (outcome.kind === "noop_existing") {
      // BOTH double_coded reasons -> success-shaped settle (WA-L8): the bill is already coded.
      await settle("noop_existing", seg.usageTokens, null, { code: "CLR29", reason: outcome.reason });
      return { taskId, outcome: "noop_existing" };
    }

    // No lawful draft. A question-shaped block opens a scoped open-question, then a failed
    // settle records the refusal; any other block settles failed with a terminal refusal.
    const refusal = outcome.kind === "refused" ? outcome.refusal : noDraftRefusal();
    if (outcome.kind === "refused" && isQuestionShaped(outcome.refusal)) {
      await openSweepQuestionStep(ctx, outcome.refusal.message);
    }
    await settle("failed", seg.usageTokens, null, refusal);
    return { taskId, outcome: "failed" };
  } catch (err) {
    await settle("failed", 0, null, { code: "internal", message: "sweep draft failed" }).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeAutoDraftStreamStep().catch(() => {});
  }
}
