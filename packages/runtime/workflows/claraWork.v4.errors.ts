// @frozen
//
// FROZEN — part of the claraWork_v4 closure. THE REPAIR ROUTER, v4.
//
// IT IS A DELEGATION AND IT OVERRIDES NOTHING — the discipline v2's and v3's headers state, taken
// one step further because this cut needs no override at all. v3's classifier is asked (which asks
// v2's, which asks v1's) and its answer is returned unchanged, so "every v1, v2 and v3 mapping is
// preserved" is true BY CONSTRUCTION rather than by a transcription that would drift the first time
// any of those tables gained a row.
//
// WHY THIS FILE EXISTS IF IT ADDS NO ROW. Two reasons, and neither is symmetry for its own sake.
// First, the closure must not reach into a predecessor for its ERROR CONTRACT by accident: v4's
// impl imports from HERE, so the day v4 does need a pair of its own there is one place to put it
// and no deployed body to edit. Second, the absence is a CLAIM this cut is making and ought to be
// legible: every refusal v4's two new question tools can provoke is one 0180 already raises through
// `clara.open_work_question`, which `claraWork.v2.errors.ts` already classifies — CLR10
// `invalid_hook_token` / `invalid_fields` / `wrong_task_kind` / `work_unbound`, CLR13
// `hook_token_bound` / `question_already_pending` / `task_not_running`, CLR11 `task_not_found`. And
// every refusal the #639 particulars apply can provoke is a CLR37/CLR04/CLR10/CLR11 the same
// tables already route. No new error CLASS ships with this cut.
//
// THE ONE ROW A FUTURE READER WILL LOOK FOR AND NOT FIND. #639's own follow-up asks for
// `(CLR40, fa_cost_adjustment_deferred) → refusal` — today it falls to the CLR40 default and
// settles the Work `failed`/`internal`/not-recoverable, although the belt itself gives the human a
// remedy. It is NOT taken here, deliberately: the ticket filed it as a follow-up for a lane that
// owns the fixed-asset belt's vocabulary, the wave's DECISIONS name no ruling on it, and a
// classification change is a behavioural change to every Work that hits that code — not a free
// ride on a cut made for something else. `clr40.cost_adjustment` pins today's behaviour so the
// change, when it comes, is deliberate.

import {
  budgetExhaustedPayload,
  classifyWorkError as classifyWorkErrorV3,
  egressRefusalPayload,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  EGRESS_NOT_AUTHORIZED,
  type WorkErrorClass,
  type WorkErrorKind,
} from "./claraWork.v3.errors.js";

export {
  budgetExhaustedPayload,
  egressRefusalPayload,
  taskErrorCodeFor,
  workErrorPayload,
  workOutcomeFor,
  EGRESS_NOT_AUTHORIZED,
};
export type { WorkErrorClass, WorkErrorKind };

/**
 * THE ROUTER, v4. Pure — an error object in, a classification out.
 *
 * v3 (and through it v2 and v1) decides everything. This function exists so the v4 closure has one
 * import site for its error contract; it deliberately adds no pair of its own (see the header).
 */
export function classifyWorkError(error: unknown): WorkErrorClass {
  return classifyWorkErrorV3(error);
}

/**
 * The payload a run settles with when the #639 dependent particulars question could not be
 * ANSWERED — it expired, or the Work was cancelled while it was open.
 *
 * THE ENTRY IS ALREADY ON THE BOOKS AND THAT DECIDES THE OUTCOME. v1's law — "a committed effect
 * ends the Work, whatever else the segment did" — is not softened by a question opened after the
 * commit: settling `cancelled` or `expired` here would tell a human that nothing happened while the
 * acquisition sits in their ledger. So the Work settles COMPLETED with its real effect, and this
 * payload rides in the result as the honest remainder: the register row exists, its depreciation
 * particulars are still pending, and the human completes them from the asset's own page.
 */
export function particularsPendingNote(
  assetId: string,
  reason: "expired" | "cancelled" | "not_opened",
): Record<string, unknown> {
  const reasons = {
    expired: "question_expired",
    cancelled: "question_cancelled",
    not_opened: "question_not_opened",
  } as const;
  const messages = {
    expired:
      "The acquisition posted. The question about this asset's depreciation particulars expired "
      + "before it was answered, so they are still pending on the fixed-asset register.",
    cancelled:
      "The acquisition posted. The question about this asset's depreciation particulars was "
      + "cancelled, so they are still pending on the fixed-asset register.",
    not_opened:
      "The acquisition posted. The question about this asset's depreciation particulars could not "
      + "be opened, so nobody was asked and they are still pending on the fixed-asset register. "
      + "They can be completed from the asset's own page.",
  } as const;
  return {
    asset_id: assetId,
    particulars_complete: false,
    reason: reasons[reason],
    message: messages[reason],
  };
}

/**
 * The payload a run settles with when `clara.open_work_question` REFUSED to open the question the
 * segment asked for — and nothing has been posted.
 *
 * WHY THIS EXISTS RATHER THAN THE GENERIC CATCH. `openWorkQuestionStep` is a door call, and a door
 * call raises: a hook token already bound, a question already pending on this task, a field array
 * 0180's grammar refuses (option values that are not distinct is the one the successor review
 * found). Unwrapped, every one of those reached the body's outer catch and settled the Work
 * `failed`/`internal` with "This Work run failed before it could record an entry" — true about the
 * entry, useless about the cause, and not recoverable-looking to the person holding it. This says
 * what actually happened, in the vocabulary `workErrorPayload` uses, and says it is recoverable:
 * the Work can be re-run, and nothing was written.
 */
export function questionNotOpenedPayload(): Record<string, unknown> {
  return {
    code: "internal",
    reason: "question_not_opened",
    message:
      "This Work needed to ask a question and the question could not be opened, so nothing was "
      + "posted and nobody was asked. Re-running the Work is safe.",
    recoverable: true,
  };
}
