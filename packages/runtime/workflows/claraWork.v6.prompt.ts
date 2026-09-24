// @frozen
//
// FROZEN — part of the claraWork_v6 closure. THE INSTRUCTIONS, THE SKILL AND THE TOOL ROSTER.
//
// THE ROSTER DOES NOT MOVE. v6 adds no tool, widens no schema and repoints no door: every name,
// every input schema and every declared dependency is v5's, reached by import and re-exported
// under this closure's own names so `claraWork.v6.bundle.ts` hashes the roster it actually serves
// rather than a copy that could drift from it. A second copy of seven zod objects is how two
// versions come to disagree about the same contract.
//
// WHAT DOES MOVE IS ONE STANZA, and it is the point of the cut. #1030's successor is a Work
// somebody's correction produced: its basis was RE-DERIVED from the corrected document by the
// runtime, and a person has CONFIRMED it on a question that named both figures before this run was
// allowed to reach a model at all. The model must be told that in the words it will act on —
// otherwise its standing instruction ("the human's basis was accepted and digested before this run
// started") is subtly false for exactly this Work, and the one thing worse than an uninstructed
// model is a correctly-instructed one whose instruction does not describe the case in front of it.
//
// THE STANZA ADDS NO CAPABILITY AND REMOVES NONE. It does not let the model re-derive, re-read the
// document, change an account or move a figure; it says the opposite, in the imperative, and it
// names the confirmation as the authority the basis now carries.

import {
  CLARA_WORK_INSTRUCTIONS_V5,
  CLARA_WORK_TOOL_DEPENDENCIES_V5,
  CLARA_WORK_TOOL_NAMES_V5,
  CLARA_WORK_TOOL_SCHEMAS_V5,
  JOURNAL_ENTRY_SKILL_V5,
} from "./claraWork.v5.prompt.js";

export {
  ANSWER_ACCRUAL_TERM_TOOL,
  ASK_KNOWLEDGE_CONFLICT_TOOL,
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  READ_KNOWLEDGE_HISTORY_DOOR,
  READ_KNOWLEDGE_HISTORY_TOOL,
  READ_KNOWLEDGE_RECORD_DOOR,
  READ_KNOWLEDGE_SOURCE_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
} from "./claraWork.v5.prompt.js";
import { readKnowledgeInputSchemaV5 } from "./claraWork.v5.prompt.js";
import type { ReadKnowledgeInputV5 } from "./claraWork.v5.prompt.js";

/** v5's inspection-read schema, unchanged, carried under this closure's own name so
 *  `claraWork.v6.tools.ts` names one version throughout and the bundle hashes what it serves. */
export const readKnowledgeInputSchemaV6 = readKnowledgeInputSchemaV5;
export type ReadKnowledgeInputV6 = ReadKnowledgeInputV5;

/** v5's roster, unchanged and reached by import — see this file's header for why it is not copied. */
export const CLARA_WORK_TOOL_NAMES_V6 = CLARA_WORK_TOOL_NAMES_V5;
export const CLARA_WORK_TOOL_SCHEMAS_V6 = CLARA_WORK_TOOL_SCHEMAS_V5;
export const CLARA_WORK_TOOL_DEPENDENCIES_V6 = CLARA_WORK_TOOL_DEPENDENCIES_V5;

/** The skill is v5's, byte for byte: what a journal entry IS did not change. */
export const JOURNAL_ENTRY_SKILL_V6 = JOURNAL_ENTRY_SKILL_V5;

/**
 * The one stanza v6 adds. Exported on its own so a cell can assert its text without re-deriving
 * the whole instruction blob, and so a reviewer can read the delta rather than diff 100 lines.
 */
export const SOURCE_CORRECTION_SUCCESSOR_STANZA = [
  "WHEN THIS WORK REPLACES ONE A DOCUMENT CORRECTION RETIRED.",
  "Somebody corrected what a document SAYS, and the Work that stood on the old reading was",
  "retired. The basis you are holding was RE-DERIVED from the corrected document — the figures",
  "came from the document's live facts, the accounts and the memo from the instruction the person",
  "originally gave — and a human has already been shown BOTH figures, the one the retired Work was",
  "admitted on and the one the document now says, and has CONFIRMED this basis. That confirmation",
  "is the authority this basis carries; it happened before you were called.",
  "",
  "So nothing changes for you: record THIS basis, verbatim, exactly as you would any other. Do not",
  "re-read the document, do not re-derive a figure, do not 'improve' an account code because the",
  "amount moved, and never post the earlier figure — it is the reading that was corrected. If the",
  "basis in front of you looks wrong, say so and stop; do not fix it.",
].join("\n");

/**
 * v6's instructions: v5's text, unchanged and reached by import, plus the one stanza above.
 *
 * COMPOSED RATHER THAN RETYPED, deliberately. A copied blob is a second place the standing
 * instructions can drift, and #791's whole lesson is that a contract nobody can see change is a
 * contract that changes. The bundle digest covers this string, so the addition MOVES the digest
 * and the receipt says a different contract served the run — which is exactly true.
 */
export const CLARA_WORK_INSTRUCTIONS_V6 = [
  CLARA_WORK_INSTRUCTIONS_V5,
  "",
  SOURCE_CORRECTION_SUCCESSOR_STANZA,
].join("\n");
