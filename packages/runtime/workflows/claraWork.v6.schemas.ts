// @frozen
//
// FROZEN — part of the claraWork_v6 closure. THE THREE NAMES, SCHEMAS AND DOORS #1135 ADDS.
//
// WHY THEY LIVE HERE AND NOT IN `claraWork.v6.tools.ts`. `claraWork.v6.prompt.ts` declares the
// roster the bundle digest hashes, and `claraWork.v6.tools.ts` builds the tools. If the prompt
// module imported the schemas from the tools module, the two would import each other; if the tools
// module declared them, the prompt would be hashing a copy. v5 solved the same problem by putting
// its inspection-read schema in its prompt module; this cut solves it by putting all three in a
// module of their own, which is the shape that stays honest when a fourth arrives.
//
// EVERY ONE OF THE THREE IS A READ OR A QUESTION. Nothing here writes, and nothing here decides:
//
//   · `read_prepayment_source` (#915 item 2) and `read_revenue_recognition_source` (#941 item 2)
//     each take ONE uuid. The Work's firm and client come from the RUN's context and are never
//     model-supplied, and neither read has a bytes key — the byte door stays 0190's and is
//     unreachable from this lane.
//
//   · `answer_prepayment_term` (#915's question, #653's shape) carries NO DATE FIELD and never
//     will. #939's ruling, and the owner's default 6 of 2026-09-18 behind it: a service period a
//     model supplied is a model-generated value entering a durable artifact. The three fields the
//     question opens with are CONSTANTS of this closure, so there is no path from a tool input to
//     a period — which is where the rule actually lives, rather than in a sentence.

import { z } from "zod";
import { workQuestionSourceRefSchema } from "./claraWork.v3.tools.js";

// ---------------------------------------------------------------------------
// #915 item 2 — the prepayment source read
// ---------------------------------------------------------------------------

export const READ_PREPAYMENT_SOURCE_TOOL = "read_prepayment_source";
export const READ_PREPAYMENT_SOURCE_DOOR = "clara.read_prepayment_source_for";

export const readPrepaymentSourceInputSchema = z
  .object({
    source_entry_id: z
      .string()
      .uuid()
      .describe(
        "The POSTED entry that recognised this prepayment. The Work's own client and firm come "
        + "from the run's context and are never yours to name.",
      ),
  })
  .strict();

export type ReadPrepaymentSourceInput = z.infer<typeof readPrepaymentSourceInputSchema>;

// ---------------------------------------------------------------------------
// #941 item 2 — the deferred-revenue source read
// ---------------------------------------------------------------------------

export const READ_REVENUE_RECOGNITION_SOURCE_TOOL = "read_revenue_recognition_source";
export const READ_REVENUE_RECOGNITION_SOURCE_DOOR = "clara.read_revenue_recognition_source_for";

export const readRevenueRecognitionSourceInputSchema = z
  .object({
    source_entry_id: z
      .string()
      .uuid()
      .describe(
        "The POSTED entry that recognised the advance. The Work's own client and firm come from "
        + "the run's context and are never yours to name.",
      ),
  })
  .strict();

export type ReadRevenueRecognitionSourceInput = z.infer<typeof readRevenueRecognitionSourceInputSchema>;

// ---------------------------------------------------------------------------
// #915's term question — #653's fields, #939's prohibition
// ---------------------------------------------------------------------------

export const ANSWER_PREPAYMENT_TERM_TOOL = "answer_prepayment_term";

/**
 * THE THREE FIELDS, AS CONSTANTS. They are #653's own, restated in #915's contract, and the model
 * cannot reach them: `findQuestionCallV6` supplies them from here, never from the call.
 *
 * `basis` is a TEXT field because a service period a person states needs the grounds they state it
 * on — #939's own third question — and 0180's closed field kinds hold no account picker or date
 * range, so three plain fields is what the database will actually accept.
 */
export const PREPAYMENT_TERM_FIELDS = Object.freeze([
  Object.freeze({
    key: "period_start",
    label: "First day the payment covers",
    kind: "date" as const,
    required: true,
  }),
  Object.freeze({
    key: "period_end",
    label: "Last day the payment covers",
    kind: "date" as const,
    required: true,
  }),
  Object.freeze({
    key: "basis",
    label: "How you know that period",
    kind: "text" as const,
    required: true,
    max: 4000,
  }),
]);

/** The question text a prepayment term park always asks. ONE sentence, spelled once, so the parked
 *  question, a Needs-you row and the Work detail all read the same words. */
export const PREPAYMENT_TERM_QUESTION = "Over what service period does this prepayment run?";

/**
 * THE MODEL SUPPLIES THE REASON, NEVER THE ANSWER. There is no date field in this schema and there
 * never will be: #939's ruling is that a service period a model derived may not become a durable
 * accounting fact, and a schema that could carry one would make that rule a convention.
 */
export const answerPrepaymentTermInputSchemaV6 = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe(
        "WHY the service period is absent and what you already read looking for it — what the "
        + "source read returned, and what it did and did not record.",
      ),
    context: z
      .string()
      .max(4000)
      .optional()
      .describe("What you already know about the prepayment, so the human is not asked to repeat it."),
    source_ref: workQuestionSourceRefSchema
      .optional()
      .describe("The document, chat task or basis line this prepayment came from, where there is one."),
  })
  .strict();

export type AnswerPrepaymentTermInputV6 = z.infer<typeof answerPrepaymentTermInputSchemaV6>;
