// @frozen
//
// FROZEN — part of the claraWork_v7 closure. THE ERROR VOCABULARY.
//
// v6's whole vocabulary, reached by import and re-exported under this closure's own module: v7
// adds no way for a run to stop that v6 did not already have, so there is nothing here to add. A
// second copy of the taxonomy is how two versions come to disagree about what "recoverable" means.
//
// WHY THE MODULE EXISTS AT ALL rather than v7's impl importing v6's directly: the closure is what
// the freeze lint walks, and a version whose error vocabulary is reached through its own module is
// a version whose vocabulary can be widened later without touching a deployed file. v6 made the
// same choice over v5 and then used the room it bought.

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
  sourceCorrectionProbeFailedPayload,
  sourceCorrectionDeclinedPayload,
} from "./claraWork.v6.errors.js";
export type { WorkErrorClass, WorkErrorKind } from "./claraWork.v6.errors.js";
