// @frozen
//
// FROZEN — part of the claraWork_v6 closure. THE ERROR VOCABULARY.
//
// v5's whole classification, reached by import and re-exported: nothing about how a door refusal,
// a transport fault or a spent budget is read has changed, and a second copy of that taxonomy is
// how two versions come to disagree about what "recoverable" means.
//
// v6 ADDS ONE PAYLOAD, and it is the settle for the one new way a v6 run can stop before it starts:
// the successor probe could not be read. See `loadSourceCorrectionBriefStepV6` for why that must
// be terminal rather than swallowed — it is not a diagnostic, it is the check that decides whether
// a human confirms a figure before it can be posted.

export {
  classifyWorkError,
  egressRefusalPayload,
  knowledgeReadFailedPayload,
  workErrorPayload,
  budgetExhaustedPayload,
  particularsPendingNote,
  questionNotOpenedPayload,
  taskErrorCodeFor,
  workOutcomeFor,
  FA_COST_ADJUSTMENT_DEFERRED,
} from "./claraWork.v5.errors.js";
export type { WorkErrorClass, WorkErrorKind } from "./claraWork.v5.errors.js";

/**
 * The settle payload for a run whose source-correction probe could not be read.
 *
 * RECOVERABLE, and the word is load-bearing: nothing was posted, the Work is intact, and a Retry
 * against a database that carries 0321 runs it to completion. The one way to reach it is a
 * deploy-order mistake — the image live before the migration — and this sentence is what an
 * operator reads on a whole lane of stopped Work, which is the correct, loud failure for that
 * mistake.
 */
export function sourceCorrectionProbeFailedPayload(reason: string): Record<string, unknown> {
  return {
    code: "internal",
    reason: "source_correction_probe_failed",
    message:
      "This Work could not be checked for a document correction it may be replacing, so nothing "
      + "was posted. Nothing is wrong with the Work itself — retry it once the runtime can read "
      + "that check again.",
    detail: reason,
    recoverable: true,
  };
}

/**
 * The settle payload for a successor whose confirmation question a person answered with "stop".
 *
 * NOT A FAILURE AND NOT AN ERROR: a professional looked at both figures and decided the re-derived
 * basis is not what should be recorded. Nothing is posted and the instruction is theirs to give
 * again through the doors that exist for it. Recoverable, because a Retry is meaningless here but
 * a new instruction is not, and calling it unrecoverable would tell them the opposite.
 */
export function sourceCorrectionDeclinedPayload(): Record<string, unknown> {
  return {
    code: "cancelled",
    reason: "source_correction_not_confirmed",
    message:
      "You chose not to record the corrected figures, so nothing was posted. The document's "
      + "reading has changed; state the instruction again when you are ready.",
    recoverable: true,
  };
}
