// @frozen
//
// FROZEN — part of the claraWork_v6 closure. THE INSTRUCTIONS, THE SKILL AND THE TOOL ROSTER.
//
// THE ROSTER GROWS BY THREE, AND BY EXACTLY THREE. v5's seven are reached by import and
// re-exported under this closure's own names so `claraWork.v6.bundle.ts` hashes the roster it
// actually serves rather than a copy that could drift from it; a second copy of seven zod objects
// is how two versions come to disagree about the same contract. What #1135 adds is:
//
//   - `read_prepayment_source` (#915 item 2) and `read_revenue_recognition_source` (#941 item 2):
//     two READS, one uuid each, no document bytes ever. Both doors are `clara_runtime`-granted, so
//     unlike the seven contracts this cut deferred they can actually answer something.
//   - `answer_prepayment_term` (#915's question, #653's shape, bound by #939's ruling): an
//     execute-less question tool whose FIELDS are this closure's own constants. There is no path
//     from a tool input to a service period, which is where "the model never supplies a term"
//     actually lives.
//
// The three declarations move TOGETHER, names, schemas and dependencies, because the bundle digest
// hashes `{id, names, schemas, dependencies}` and a name with no schema would let a roster change
// ship under a digest that describes the previous one.
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
import {
  ANSWER_PREPAYMENT_TERM_TOOL,
  READ_PREPAYMENT_SOURCE_DOOR,
  READ_PREPAYMENT_SOURCE_TOOL,
  READ_REVENUE_RECOGNITION_SOURCE_DOOR,
  READ_REVENUE_RECOGNITION_SOURCE_TOOL,
  answerPrepaymentTermInputSchemaV6,
  readPrepaymentSourceInputSchema,
  readRevenueRecognitionSourceInputSchema,
} from "./claraWork.v6.schemas.js";

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

export {
  ANSWER_PREPAYMENT_TERM_TOOL,
  PREPAYMENT_TERM_FIELDS,
  PREPAYMENT_TERM_QUESTION,
  READ_PREPAYMENT_SOURCE_DOOR,
  READ_PREPAYMENT_SOURCE_TOOL,
  READ_REVENUE_RECOGNITION_SOURCE_DOOR,
  READ_REVENUE_RECOGNITION_SOURCE_TOOL,
  answerPrepaymentTermInputSchemaV6,
  readPrepaymentSourceInputSchema,
  readRevenueRecognitionSourceInputSchema,
} from "./claraWork.v6.schemas.js";
export type {
  AnswerPrepaymentTermInputV6,
  ReadPrepaymentSourceInput,
  ReadRevenueRecognitionSourceInput,
} from "./claraWork.v6.schemas.js";

/** v5's roster plus this cut's three. */
export const CLARA_WORK_TOOL_NAMES_V6 = Object.freeze([
  ...CLARA_WORK_TOOL_NAMES_V5,
  READ_PREPAYMENT_SOURCE_TOOL,
  READ_REVENUE_RECOGNITION_SOURCE_TOOL,
  ANSWER_PREPAYMENT_TERM_TOOL,
]);

// BUILT WITH A LOOP RATHER THAN A SPREAD. `check-parts-parity.mjs` refuses an unclassifiable
// object spread anywhere under `packages/runtime`, and a merge nobody has to review in the
// exemption ledger is the cheaper of the two.
function schemasV6(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(CLARA_WORK_TOOL_SCHEMAS_V5)) out[name] = schema;
  out[READ_PREPAYMENT_SOURCE_TOOL] = readPrepaymentSourceInputSchema;
  out[READ_REVENUE_RECOGNITION_SOURCE_TOOL] = readRevenueRecognitionSourceInputSchema;
  out[ANSWER_PREPAYMENT_TERM_TOOL] = answerPrepaymentTermInputSchemaV6;
  return out;
}

export const CLARA_WORK_TOOL_SCHEMAS_V6: Readonly<Record<string, unknown>> = Object.freeze(schemasV6());

function dependenciesV6(): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const [name, doors] of Object.entries(CLARA_WORK_TOOL_DEPENDENCIES_V5)) out[name] = doors;
  out[READ_PREPAYMENT_SOURCE_TOOL] = Object.freeze([READ_PREPAYMENT_SOURCE_DOOR]);
  out[READ_REVENUE_RECOGNITION_SOURCE_TOOL] = Object.freeze([READ_REVENUE_RECOGNITION_SOURCE_DOOR]);
  // NO `execute`, so it reaches no door itself: it names the door its CALL causes the workflow to
  // reach, exactly as v4's three question tools do. A receipt that said it depended on nothing
  // would be describing a park that does in fact write a row.
  out[ANSWER_PREPAYMENT_TERM_TOOL] = Object.freeze(["clara.open_work_question"]);
  return out;
}

export const CLARA_WORK_TOOL_DEPENDENCIES_V6: Readonly<Record<string, readonly string[]>> =
  Object.freeze(dependenciesV6());

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
 * #915 ITEM 2's STANZA — the replacement for `claraWork.v1.prompt.ts`'s "There is no source
 * document for this Work and you must never invent one".
 *
 * That sentence was true while the run had no document read at all. It is not true for a Work that
 * stands on a prepayment or a deferred-revenue advance: the entry BINDS a document, and the run can
 * now read what a PERSON recorded about it. What it still cannot do is read the document itself,
 * and what it must never do is state a service period — #939's ruling, and the reason the term
 * question carries no date field.
 */
export const PREPAYMENT_SOURCE_STANZA = [
  "WHEN THIS WORK STANDS ON A PREPAYMENT OR AN ADVANCE A CUSTOMER PAID.",
  "The document this Work's entry binds is the only source you may cite, and only by its RECORDED",
  "facts: the service period a person recorded, the kind of basis it rests on, and the grounds",
  "they wrote. You never read the document itself; there is no tool that would let you, and the",
  "reads you do have return no bytes and never will.",
  "",
  "AND YOU NEVER STATE A SERVICE PERIOD. If none is recorded, say so and ask the fixed two-date",
  "question: the first day the payment covers, the last, and the reason the person knows them. You",
  "supply the reason you are asking and nothing else — the dates are theirs. Never propose them,",
  "never infer them from a memo line, a bank narrative, a filename or anything you have read, and",
  "never offer to record them yourself. A service period you derived cannot become a durable",
  "accounting fact, and this question is the whole of what you may do about it.",
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
  "",
  PREPAYMENT_SOURCE_STANZA,
].join("\n");
