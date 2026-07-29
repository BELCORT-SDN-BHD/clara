// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE
// once any run can be in flight. autoDraft_v4 is a NEW frozen closure (registry repoints
// `autoDraft: autoDraft_v4`); autoDraft_v3/v2/v1 and every other export are byte-untouched. Do
// NOT edit this file or its import closure (autoDraft.v4.impl / .tools / .infra / .prompt /
// .errors) once deployed — ship a behavioural change as autoDraft_v5.
//
// autoDraft_v4 (ledger #44 / GitHub #42) — fixes the first-ever production one-click autodraft
// failure. Full diagnosis + the model-step half of the fix (capturing fullStream's own error
// part so a bad/retired model id or any other vendor fault is never masked by ai@7's generic
// NoOutputGeneratedError fallback) live in autoDraft.v4.impl.ts's own header; the corrected
// admission-time model-id DEFAULT ships alongside as migration 0033 (config-only).
//
// THE THIRD SWALLOW (fixed HERE): v3's top-level catch recorded EVERY failure's settle with
// the hardcoded `{code:"internal", message:"sweep draft failed"}`, discarding whatever the
// caught error actually said — so even with the step-level fix, a bookkeeper reading
// autodraft_attempts/sweep_run_items after a failure saw nothing but that one fixed phrase,
// regardless of cause. This catch now forwards the REAL caught error's own message (and code,
// when the error carries one — e.g. runAutoDraftModelStep's "model_stream_error") into the
// settle call. The WDK-facing throw is UNCHANGED (still re-throws the original error/wraps a
// non-Error unchanged) — this only widens what the DB-facing settle record says; retry/
// FatalError semantics are untouched.
//
// Schema + steps are otherwise byte-identical to v3: one admitted READY bill per task: claim
// (begin_autodraft_task: CAS queued->running + context + reserved tokens) -> recover a
// completed attempt (kill-after-draft resume, no re-model) -> run the coding model
// client-pinned (drafts ONLY) -> settle_autodraft_task with actuals. BOTH double_coded reasons
// map to a SUCCESS-shaped noop_existing settle (WA-L8). A question-shaped non-draft MAY open a
// scoped open-question (origin sweep_refusal) then settles failed with the refusal.
// Kill/replay-safe at every step boundary (begin/settle are idempotent; the model step is
// guarded by the op_key + the get_coding_attempt recovery).

import {
  claimAutoDraftStep,
  recoverAutoDraftStep,
  runAutoDraftModelStep,
  settleAutoDraftStep,
  openSweepQuestionStep,
  closeAutoDraftStreamStep,
} from "./autoDraft.v4.impl.js";
import { isQuestionShaped } from "./autoDraft.v4.prompt.js";
import { noDraftRefusal } from "./autoDraft.v4.errors.js";

/** ledger #44 (the third swallow): reduce a caught top-level error into the settle record's
 *  refusal shape — the error's own code (when it carries a readable string one, e.g.
 *  runAutoDraftModelStep's "model_stream_error") and its own message. "sweep draft failed"
 *  is the TRUE last resort (an empty/unreadable message), never the default. Pure — no
 *  WDK-ambient call, directly unit-testable. */
export function refusalFromCaughtError(err: unknown): { code: string; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "internal";
  return { code, message: message || "sweep draft failed" };
}

export async function autoDraft_v4(input: { taskId: string }): Promise<{ taskId: string; outcome: string }> {
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
    await settle("failed", 0, null, refusalFromCaughtError(err)).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeAutoDraftStreamStep().catch(() => {});
  }
}
