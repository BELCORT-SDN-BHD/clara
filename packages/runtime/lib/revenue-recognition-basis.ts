// #941 — THE TYPED PARTICULARS OF A DEFERRED-REVENUE RECOGNITION SCHEDULE, for `chatTurn_v22`.
//
// A NEW MODULE BESIDE `prepayment-schedule-basis.ts` RATHER THAN A WIDENING OF IT — #941's own
// follow-up 3 asks for exactly that. The two lanes mirror each other (a posted entry, an account a
// person chose, a basis they stated, a frozen evaluator that derives everything else), but they
// are two families with two doors, two refusal vocabularies and two rosters, and one module
// serving both would make every future change to either a change to both.
//
// WHAT THE MODEL CONTRIBUTES IS TWO THINGS AND A NAME: WHICH revenue account each period credits,
// WHY that account, and what the schedule is for. It contributes NO amount (the receipt's own
// credited liability leg), NO term (the carrier's), NO cadence and NO pattern (the frozen
// evaluator's, which offers exactly one). A model-supplied date is what hard constraint 2 forbids,
// and a schema with nowhere to put one is how that rule stops being a convention.
//
// THIS MODULE IS NON-FROZEN ONLY UNTIL `chatTurn_v22` IMPORTS IT. From that moment every byte here
// is hash-locked in `frozen-workflows.json` and a changed rule ships as a new module beside this
// one. It is written to be final.
//
// NO OBJECT SPREAD ANYWHERE IN THIS FILE — `check-parts-parity.mjs` refuses an unclassifiable
// spread in any module it walks, and this module enters that walk at the cut.

import { z } from "zod";

export const START_REVENUE_RECOGNITION_WORK_TOOL = "start_revenue_recognition_work";

/** The plan kind migration 0308 mints. Named here so a part payload can echo it without
 *  re-spelling a string the database owns. */
export const RECOGNITION_PLAN_KIND = "revenue_recognition_schedule";

/** The ONE pattern 0308 offers. It is NOT an argument of the tool: `p_pattern` defaults to it and
 *  no other value is accepted, so a key here could only ever produce a refusal. */
export const RECOGNITION_PATTERN = "straight_line";

/**
 * THE TOOL'S INPUT, `.strict()`.
 *
 * WHAT IS DELIBERATELY ABSENT, because each absence is a rule:
 *   · no amount — it is the source entry's own credited liability leg;
 *   · no term and no dates — the term is the carrier's, and a service period a model read off a
 *     document is a model-generated value entering a durable artifact;
 *   · no cadence and no pattern — the frozen evaluator derives both;
 *   · no authority reference — the chat lane's authority is the CONVERSATION, supplied from the
 *     turn's own context. A tool that accepted one would let a model name the instruction that
 *     authorises its own act.
 */
export const startRevenueRecognitionWorkInputSchema = z
  .object({
    source_entry_id: z
      .string()
      .uuid()
      .describe(
        "The POSTED entry that recognised the advance. The model picks it from what the "
        + "conversation already showed it; it never invents a uuid, and the door refuses one that "
        + "is not this client's.",
      ),
    revenue_account_code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .describe(
        "The INCOME account each period credits — a judgement, offered to the person and confirmed "
        + "by them in the turn, never chosen by the model from a chart it read.",
      ),
    revenue_account_basis: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .describe(
        "WHY that account, in the person's own words as recorded in the turn. Required: the door "
        + "refuses a blank basis.",
      ),
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("What this schedule is FOR, in the firm's own words. It names the plan."),
  })
  .strict();

export type StartRevenueRecognitionWorkInput = z.infer<typeof startRevenueRecognitionWorkInputSchema>;

/**
 * THE FOURTEEN TYPED `detail.reason` TOKENS migration 0308's doors raise.
 *
 * They are the SAME fourteen `apps/web/lib/deferred-revenue/schedule.ts` spells, and a cell holds
 * this list against that file so the two surfaces cannot drift. None of them is a new error CLASS,
 * which is why `claraWork.v1.errors.ts` needs no change for this entry.
 */
export const RECOGNITION_REFUSAL_TOKENS = Object.freeze([
  "deferred_revenue_source_unfit",
  "deferred_revenue_term_underivable",
  "revenue_target_ineligible",
  "revenue_target_underivable",
  "deferred_revenue_amount_below_period_granularity",
  "deferred_revenue_schedule_exists",
  "revenue_recognition_schedule_not_found",
  "revenue_recognition_period_line_missing",
  "recognition_pattern_unsupported",
  "invalid_purpose",
  "client_not_found",
  "client_inactive",
  "authority_ref_unresolved",
  "operation_in_flight",
]);

/** The axis a `deferred_revenue_source_unfit` refusal carries when the account is simply not on
 *  this client's deferred-revenue roster. It is a GATE a bookkeeper clears, not a ban — and under
 *  D2 (#940) it is never a thing Clara offers to clear herself. */
export const NOT_ENROLLED_AXIS = "deferred_account_not_enrolled";

export type LocalRecognitionRefusal = { refusal: string; axis?: string; message: string };

/**
 * THE LOCAL MIRROR, deliberately shallow. Everything that needs a row — is the entry posted, does
 * it credit exactly one liability, is the account an income account, is the account enrolled, does
 * the term charge a positive amount every period — is the DATABASE's, and asking a model to guess
 * any of it would be the invention this lane exists to prevent. What is left is the shape.
 */
export function localRecognitionRefusal(
  input: StartRevenueRecognitionWorkInput,
): LocalRecognitionRefusal | null {
  if (input.revenue_account_code.trim() === "") {
    return {
      refusal: "revenue_target_underivable",
      axis: "account_missing",
      message: "Name the income account each period's recognition credits.",
    };
  }
  if (input.revenue_account_basis.trim() === "") {
    return {
      refusal: "revenue_target_underivable",
      axis: "basis_missing",
      message: "Say why that income account, in the terms the human gave you.",
    };
  }
  if (input.purpose.trim() === "") {
    return {
      refusal: "invalid_purpose",
      message: "Give the schedule a purpose — it is what the plan is called.",
    };
  }
  return null;
}

/**
 * WHAT A REFUSAL MEANS TO A PERSON, and what to do next. Every message names an ACT rather than a
 * state; the term arm names the HUMAN door by its verb, since no agent path to it exists or ever
 * will (D1, #939), and the enrolment arm names the PANEL for the same reason (D2, #940).
 */
export function recognitionRefusalMessage(reason: string, detail?: Record<string, unknown>): string {
  const bag = detail ?? {};
  switch (reason) {
    case "deferred_revenue_source_unfit":
      if (bag.axis === NOT_ENROLLED_AXIS) {
        return (
          `Account ${String(bag.deferred_account_code ?? "that account")} is not on this client's `
          + "deferred-revenue roster, so I cannot recognise against it. A bookkeeper enrols it on "
          + "the client's Registers page, with their reason — enrolling an account is a judgement "
          + "about this client's chart, and it is theirs to make."
        );
      }
      return (
        "That entry cannot carry a recognition schedule: a schedule recognises a POSTED entry that "
        + "credits exactly one deferred-revenue liability. Approve the entry first, or name the "
        + "entry that actually carries the advance."
      );
    case "deferred_revenue_term_underivable":
      return bag.missing === "prepayment_stated_terms" || bag.missing === "document_service_periods"
        ? (
          "Nothing records the period this advance covers, so there is no term to recognise over. "
          + "A person records it — the service period is a human-stated fact and I never supply one."
        )
        : (
          "The term for that advance cannot be derived: "
          + String(bag.reason_text ?? "the source entry binds no document, or its fiscal year has no open successor.")
        );
    case "revenue_target_ineligible":
      return (
        `That account cannot carry a recognition credit (${String(bag.axis ?? "ineligible")}). `
        + "Name an active income account from this client's chart."
      );
    case "revenue_target_underivable":
      return bag.axis === "basis_missing"
        ? "Say why that income account before I record the classification."
        : "Name the income account each period's recognition credits.";
    case "deferred_revenue_amount_below_period_granularity":
      return (
        `That term recognises nothing in at least one period: ${String(bag.total_cents ?? "the amount")} `
        + `cents over ${String(bag.period_count ?? "the term")} periods truncates to zero. A shorter `
        + "term, or simply recognising it at once, is a judgement for a person to make."
      );
    case "deferred_revenue_schedule_exists":
      return "That advance already has a recognition schedule.";
    case "revenue_recognition_schedule_not_found":
      return "I cannot see a recognition schedule for that advance.";
    case "revenue_recognition_period_line_missing":
      return "That schedule has no line for the period asked about.";
    case "recognition_pattern_unsupported":
      return "This estate recognises deferred revenue on a straight line only.";
    case "invalid_purpose":
      return "Give the schedule a purpose — it is what the plan is called.";
    case "client_not_found":
    case "client_inactive":
      return "I cannot act on that client here.";
    case "authority_ref_unresolved":
      return "This conversation is not an instruction this database holds, so it cannot authorise a schedule.";
    case "operation_in_flight":
      return "That same request is already in flight; I am waiting for it rather than asking twice.";
    default:
      return "I could not configure that recognition schedule.";
  }
}

export type RecognitionDoorPayload = {
  p_client: string;
  p_source_entry: string;
  p_revenue_account: string;
  p_revenue_basis: string;
  p_purpose: string;
  /** The CONVERSATION is the instruction. A model never names the row that authorises its act. */
  p_authority_ref: { kind: "chat_task"; id: string };
  p_op_key: string;
};

/**
 * THE DOOR PAYLOAD, in the DATABASE's own parameter names and argument order — the shape
 * `clara.create_revenue_recognition_schedule_for(p_client, p_author, p_source_entry,
 * p_revenue_account, p_revenue_basis, p_purpose, p_authority_ref, p_op_key)` takes, minus
 * `p_author`, which the CALLER supplies from its own context and no payload builder may.
 */
export function recognitionDoorPayload(
  input: StartRevenueRecognitionWorkInput,
  ctx: { clientId: string; taskId: string; opKey: string },
): RecognitionDoorPayload {
  return {
    p_client: ctx.clientId,
    p_source_entry: input.source_entry_id,
    p_revenue_account: input.revenue_account_code.trim(),
    p_revenue_basis: input.revenue_account_basis.trim(),
    p_purpose: input.purpose.trim(),
    p_authority_ref: { kind: "chat_task", id: ctx.taskId },
    p_op_key: ctx.opKey,
  };
}

/** One period of the schedule, as the door returns it. */
export type RecognitionPeriodLine = { dueDate: string; amountCents: number };

/**
 * THE PAYLOAD A SUCCESSFUL CALL RIDES BACK ON. It is a CONFIGURATION receipt and it says so: the
 * boundary between "an accepted schedule" and "a posted recognition" is the one thing a chat
 * surface must never blur, because the first period's own Work is what puts it on the books.
 *
 * `kind`, NOT `type`. The parts census's discriminant is `type`, and this payload rides INSIDE the
 * tool result rather than becoming a wire part the web has to render — which is why this cut adds
 * no part kind and owes no web census.
 */
export type RevenueRecognitionPart = {
  kind: "revenue_recognition_configured";
  scheduleId: string;
  planId: string;
  planKind: typeof RECOGNITION_PLAN_KIND;
  totalCents: number;
  periodCount: number;
  termStart: string;
  termEnd: string;
  deferredAccountCode: string;
  revenueAccountCode: string;
  periodLines: RecognitionPeriodLine[];
  /** Always true. Configuring records what WILL be recognised; nothing has posted. */
  configurationOnly: true;
  /** A live sibling plan moving one of the same accounts, when the estate raised one. */
  overlapWarning: string | null;
};

export function revenueRecognitionPart(answer: Record<string, unknown>): RevenueRecognitionPart {
  const raw = Array.isArray(answer.period_lines) ? (answer.period_lines as Record<string, unknown>[]) : [];
  const lines: RecognitionPeriodLine[] = [];
  for (const line of raw) {
    lines.push({ dueDate: String(line.due_date), amountCents: Number(line.amount_cents) });
  }
  return {
    kind: "revenue_recognition_configured",
    scheduleId: String(answer.schedule_id),
    planId: String(answer.plan_id),
    planKind: RECOGNITION_PLAN_KIND,
    totalCents: Number(answer.total_cents),
    periodCount: Number(answer.period_count),
    termStart: String(answer.term_start),
    termEnd: String(answer.term_end),
    deferredAccountCode: String(answer.deferred_account_code),
    revenueAccountCode: String(answer.revenue_account_code),
    periodLines: lines,
    configurationOnly: true,
    overlapWarning: answer.overlap_warning == null ? null : String(answer.overlap_warning),
  };
}

/**
 * THE WORK-LANE READ, #941 item 2. `clara.read_revenue_recognition_source_for(p_firm, p_client,
 * p_source_entry)` — `clara_runtime` only, and NO DOCUMENT BYTES, EVER: the byte door stays 0190's
 * and is unreachable from here.
 */
export const READ_REVENUE_RECOGNITION_SOURCE_TOOL = "read_revenue_recognition_source";
export const READ_REVENUE_RECOGNITION_SOURCE_DOOR = "clara.read_revenue_recognition_source_for";

export const readRevenueRecognitionSourceInputSchema = z
  .object({
    source_entry_id: z
      .string()
      .uuid()
      .describe(
        "The POSTED entry this Work's recognition stands on. The Work's own client and firm come "
        + "from the run's context and are never model-supplied.",
      ),
  })
  .strict();

export type ReadRevenueRecognitionSourceInput = z.infer<typeof readRevenueRecognitionSourceInputSchema>;

/** What the Work-lane read says when it cannot answer. CLR11 is also the answer for another firm's
 *  entry: there is no existence oracle here. CLR10 is an internal wiring error and is never shown. */
export const RECOGNITION_READ_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  revenue_recognition_source_not_found: "I cannot see that advance for this client.",
  revenue_recognition_read_scope_required:
    "The recognition read was not given a firm, a client and an entry. Nothing was read.",
});
