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
// when the message carries one, per the R-round F1 finding below) into the settle call. The
// WDK-facing throw is UNCHANGED (still re-throws the original error/wraps a non-Error
// unchanged) — this only widens what the DB-facing settle record says; retry/FatalError
// semantics are untouched.
//
// R-round F1 (Codex, confirmed against @workflow/core@4.6.0's own dist/step.js AND
// dist/runtime/step-handler.js): a caught error's `.code` property NEVER survives to this
// catch for a step-originated failure, and the surviving MESSAGE is not bare either. Two
// stages, both real, both required to reproduce:
//   (1) step-handler.js:507 (the retry-exhaustion branch, :489/:497) — BEFORE the failure
//       is even written to the event log, it PREPENDS `Step "<stepName>" failed after
//       <N> retr(y|ies): ` to the thrown error's own `.message`, discarding every other
//       property, and stores that whole STRING as `eventData.error`.
//   (2) step.js's `step_failed` event consumer — reconstructs `new FatalError(errorMessage)`
//       from that stored string, copying ONLY `.message` (+ `.stack`, when present); no
//       `.code`, no `.cause` ever exists on the object this catch actually receives.
// So the tag consumeAutoDraftModelResult (autoDraft.v4.impl.ts) writes onto its own thrown
// message survives stage (1) intact (still inside `.message`) but is no longer at the
// message's own start — it now sits immediately after the "Step ... failed after N
// retries: " prefix stage (1) added. AUTODRAFT_MODEL_ERROR_PATTERN below matches the tag
// at EITHER position — `^` directly (a message that never went through stage 1, e.g. a
// direct/non-terminal catch) OR immediately following that exact WDK prefix shape — and
// nowhere else: the whole pattern stays `^`-anchored throughout, with the prefix itself
// matched literally (step name in quotes, a digit count, retry/retries) rather than a
// wildcard scan, so an unrelated vendor message that merely CONTAINS the tag text
// somewhere in its middle can never match (see this file's own tests for the boundary
// cases this closes, and the one residual it does NOT — a message that is ITSELF,
// verbatim, tag-shaped at one of the two valid positions, without ever passing through
// consumeAutoDraftModelResult, would still parse; the consequence is a mislabeled `code`
// string in a diagnostic settle record only — never an authority or write-path decision).
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
  AUTODRAFT_MODEL_ERROR_TAG,
  claimAutoDraftStep,
  recoverAutoDraftStep,
  runAutoDraftModelStep,
  settleAutoDraftStep,
  openSweepQuestionStep,
  closeAutoDraftStreamStep,
} from "./autoDraft.v4.impl.js";
import { isQuestionShaped } from "./autoDraft.v4.prompt.js";
import { noDraftRefusal } from "./autoDraft.v4.errors.js";

/** The EXACT literal shape step-handler.js:507 prepends on retry exhaustion — `Step "<any
 *  step name>" failed after <N> retry`/`retries`: ` — matched literally (a quoted step
 *  name, a digit count, the two pluralize('retry','retries',N) outputs), never a wildcard
 *  gap, so this can only recognise WDK's OWN exact wrapper text, nothing merely similar. */
const WDK_RETRY_PREFIX_SOURCE = `Step "[^"]*" failed after \\d+ retr(?:y|ies): `;

/** Matches consumeAutoDraftModelResult's own `[autodraft_model:<code>] <message>` tag at
 *  EITHER of exactly two positions — the message's own start, or immediately after WDK's
 *  retry-exhaustion prefix (R-round F1: that prefix is what step-handler.js actually
 *  prepends before the tag ever reaches step.js's FatalError reconstruction). The pattern
 *  stays `^`-anchored across BOTH branches, with the prefix branch matched by the literal
 *  shape above rather than `.*` or any other free-floating scan — an arbitrary vendor
 *  message that happens to CONTAIN the tag text somewhere in its middle, with no exact
 *  prefix immediately before it, can never match. This is deliberate: an unanchored search
 *  would let a vendor's own error text forge a settle-record diagnostic code. */
const AUTODRAFT_MODEL_ERROR_PATTERN = new RegExp(
  `^(?:${WDK_RETRY_PREFIX_SOURCE})?\\[${AUTODRAFT_MODEL_ERROR_TAG}:([^\\]]+)\\]\\s(.*)$`,
  "s",
);

/** ledger #44 (the third swallow + the R-round F1 fix): reduce a caught top-level error into
 *  the settle record's refusal shape. A message carrying consumeAutoDraftModelResult's own
 *  `[autodraft_model:<code>]` tag is parsed back into {code, message} — the tag, not the
 *  `.code` property, since `.code` never survives a step-originated failure crossing the WDK
 *  boundary (see this file's own header). Anything else falls back to the error's own `.code`
 *  property when present (harmless, though no current caller in this function crosses zero
 *  step boundaries), then to "internal". "sweep draft failed" is the TRUE last resort (an
 *  empty/unreadable message), never the default. Pure — no WDK-ambient call, directly
 *  unit-testable. */
export function refusalFromCaughtError(err: unknown): { code: string; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const tagged = AUTODRAFT_MODEL_ERROR_PATTERN.exec(rawMessage);
  if (tagged) {
    // The regex's own two capture groups both matched for `tagged` to be non-null at all —
    // the `?? "internal"` on group 1 is defensive typing hygiene only, never expected to fire.
    return { code: tagged[1] ?? "internal", message: tagged[2] || "sweep draft failed" };
  }
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "internal";
  return { code, message: rawMessage || "sweep draft failed" };
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
