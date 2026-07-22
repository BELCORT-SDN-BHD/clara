// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE
// once any run can be in flight. autoDraft_v2 is a NEW frozen closure (registry adds
// `autoDraft: autoDraft_v2`); chatTurn_v3 and every other export are byte-untouched. Do NOT
// edit this file or its import closure (autoDraft.v2.impl / .tools / .infra / .prompt / .errors)
// once deployed — ship a behavioural change as autoDraft_v2.
//
// autoDraft_v2 — the UNATTENDED auto-draft sweep (contract §3 / companion §4-5). One admitted
// READY bill per task: claim (begin_autodraft_task: CAS queued->running + context + reserved
// tokens) -> recover a completed attempt (kill-after-draft resume, no re-model) -> run the
// coding model client-pinned (drafts ONLY) -> settle_autodraft_task with actuals. BOTH
// double_coded reasons map to a SUCCESS-shaped noop_existing settle (WA-L8). A question-shaped
// non-draft MAY open a scoped open-question (origin sweep_refusal) then settles failed with the
// refusal. Kill/replay-safe at every step boundary (begin/settle are idempotent; the model
// step is guarded by the op_key + the get_coding_attempt recovery).

import {
  claimAutoDraftStep,
  recoverAutoDraftStep,
  runAutoDraftModelStep,
  settleAutoDraftStep,
  openSweepQuestionStep,
  closeAutoDraftStreamStep,
} from "./autoDraft.v2.impl.js";
import { isQuestionShaped } from "./autoDraft.v2.prompt.js";
import { noDraftRefusal } from "./autoDraft.v2.errors.js";

export async function autoDraft_v2(input: { taskId: string }): Promise<{ taskId: string; outcome: string }> {
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
