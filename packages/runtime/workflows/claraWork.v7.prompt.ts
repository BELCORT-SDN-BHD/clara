// @frozen
//
// FROZEN — part of the claraWork_v7 closure. THE INSTRUCTIONS, THE SKILL AND THE TOOL ROSTER.
//
// THE ROSTER DOES NOT MOVE, AND NEITHER DO THE INSTRUCTIONS. That is the honest description of
// this cut: v7's one change is a STEP BODY (`loadFaProposalInputsStepV7`, which gathers two more
// grounds for the dependent-particulars proposal and applies the estate's own six-condition
// completeness predicate), and a step body is something the model never sees. Its capabilities are
// v6's ten and its standing instructions are v6's text.
//
// SO WHY A MODULE AT ALL. Because the bundle hashes `{id, names, schemas, dependencies}` and the
// ids are this closure's own: a v7 run stamped with v6's identity is a run whose receipt names a
// contract it was not served under (`tests/pinned-work-bundle.mjs` compares `work.bundle.id`,
// `work.bundle.digest`, `operation_receipts.bundle_digest` and `work_execution_traces.bundle_id`
// against the PINNED version's own bundle module). Every unchanged symbol is reached by import and
// re-exported under this closure's names, exactly as v6 did over v5, so the bundle hashes the
// roster it actually serves rather than a copy that could drift from it.

import {
  CLARA_WORK_INSTRUCTIONS_V6,
  CLARA_WORK_TOOL_DEPENDENCIES_V6,
  CLARA_WORK_TOOL_NAMES_V6,
  CLARA_WORK_TOOL_SCHEMAS_V6,
  JOURNAL_ENTRY_SKILL_V6,
} from "./claraWork.v6.prompt.js";

export {
  ANSWER_ACCRUAL_TERM_TOOL,
  ANSWER_PREPAYMENT_TERM_TOOL,
  ASK_KNOWLEDGE_CONFLICT_TOOL,
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  PREPAYMENT_TERM_FIELDS,
  PREPAYMENT_TERM_QUESTION,
  READ_KNOWLEDGE_HISTORY_DOOR,
  READ_KNOWLEDGE_HISTORY_TOOL,
  READ_KNOWLEDGE_RECORD_DOOR,
  READ_KNOWLEDGE_SOURCE_TOOL,
  READ_PREPAYMENT_SOURCE_DOOR,
  READ_PREPAYMENT_SOURCE_TOOL,
  READ_REVENUE_RECOGNITION_SOURCE_DOOR,
  READ_REVENUE_RECOGNITION_SOURCE_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
  SOURCE_CORRECTION_SUCCESSOR_STANZA,
  PREPAYMENT_SOURCE_STANZA,
  answerPrepaymentTermInputSchemaV6,
  readKnowledgeInputSchemaV6,
  readPrepaymentSourceInputSchema,
  readRevenueRecognitionSourceInputSchema,
} from "./claraWork.v6.prompt.js";
export type {
  AnswerPrepaymentTermInputV6,
  ReadKnowledgeInputV6,
  ReadPrepaymentSourceInput,
  ReadRevenueRecognitionSourceInput,
} from "./claraWork.v6.prompt.js";

/** v6's roster, unchanged and reached by reference. A second copy of ten zod objects is how two
 *  versions come to disagree about the same contract. */
export const CLARA_WORK_TOOL_NAMES_V7 = CLARA_WORK_TOOL_NAMES_V6;

export const CLARA_WORK_TOOL_SCHEMAS_V7: Readonly<Record<string, unknown>> = CLARA_WORK_TOOL_SCHEMAS_V6;

export const CLARA_WORK_TOOL_DEPENDENCIES_V7: Readonly<Record<string, readonly string[]>> =
  CLARA_WORK_TOOL_DEPENDENCIES_V6;

/** The skill is v6's, byte for byte: what a journal entry IS did not change. */
export const JOURNAL_ENTRY_SKILL_V7 = JOURNAL_ENTRY_SKILL_V6;

/**
 * v7's instructions: v6's text, unchanged and reached by import.
 *
 * NOTHING IS ADDED, and that is stated here rather than left to a reader's inference. The step this
 * cut changes gathers two more GROUNDS for a proposal the workflow body attaches to a question it
 * already opens; the model neither reads those grounds nor acts on them, so an instruction about
 * them would describe a capability it does not have. The DIGEST still moves, because the bundle's
 * own ids are v7's — which is exactly what a receipt should say: a different contract served the
 * run.
 */
export const CLARA_WORK_INSTRUCTIONS_V7 = CLARA_WORK_INSTRUCTIONS_V6;
