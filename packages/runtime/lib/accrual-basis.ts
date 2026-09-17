// #652 — THE TYPED PARTICULARS OF AN ACCRUAL, as a schema and a pair of builders.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. The chat tool `start_accrual_work` ships in ONE shared
// `chatTurn` successor that carries other tickets' tools too, and a frozen workflow version is
// expensive to mint twice. So everything that tool needs which is NOT the frozen tool body lives
// here, in non-frozen infrastructure, tested on its own: the `.strict()` zod schema, the
// `p_accrual` builder in the DATABASE's own field spelling, the derivation of the two journal
// lines those particulars imply, and the shape refusals a model can act on without a database
// round trip. The successor's job is then the stanza at the foot of this file.
//
// IT IS A NEW SIBLING OF `lib/periodic-adjustment-basis.ts`, NEVER AN EDIT OF IT. That module is
// FROZEN BY IMPORT — `chatTurn.v19.tools.ts` imports it and `scripts/check-frozen-workflows.mjs`
// freezes the transitive relative-import closure of every frozen file — so a rule added there is a
// change to a deployed body. This file is its own module for exactly that reason, and it stays
// non-frozen only until the successor imports it. **No frozen file may import this module before
// that cut**: an accidental import is a hard CI reject, not a re-baseline.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. `clara._assert_accrual_particulars` and
// `clara._assert_accrual_world` (migration 0222) re-check every rule below — at the door, against
// the client's live chart, the live filings and the live 0140 term carrier. Nothing here is a rule
// of its own: every check is a MIRROR of one the database enforces, so a preparer or a model sees
// the mistake beside the thing that caused it instead of as a refusal a round trip later.
//
// AND NOTHING HERE INVENTS A TERM. #652's own boundary, and 0140's CONFIRMED-AS-LAW prohibition:
// a service period a MODEL read off a document may not enter the durable record. `term_source` is
// a ONE-MEMBER literal here for that reason — a model relaying a period a HUMAN stated in the
// conversation is lawful (the estate already admits `period_start`/`period_end` through the frozen
// `periodic-adjustment-basis.ts:57-58`), and a period the model derived from a document is not.
// The tool cannot express the second, because the schema has no other value to put there.

import { z } from "zod";

export const START_ACCRUAL_WORK_TOOL = "start_accrual_work";

/**
 * The CLOSED selection-rule set `accrual.method.rule` admits — migration 0222's own enum, restated
 * here so the tool offers exactly what the schedule performs and a refusal can list it.
 *
 * IT SELECTS AMONG AMOUNTS A HUMAN STATED; IT COMPUTES NOTHING. That is why this is an enum rather
 * than a registered `clara.evaluator_versions` closure: the estate's house home for a FORMULA is a
 * frozen single-member evaluator with "a changed formula is a _v2, never an edit"
 * (`clara.prepayment_schedule_v1`, 0140:962-1201; the freeze verb is 0059:248), and that freeze
 * exists because a prepayment schedule turns one term and one amount into n period amounts. An
 * accrual method turns nothing into anything — it names WHICH stated figure the schedule uses.
 *
 * ONE MEMBER, BECAUSE ONE MEMBER IS WHAT THE LEDGER DOES. The configuration freezes the stated
 * amount into the plan revision's basis and `clara._plan_occurrence_basis` only moves the posting
 * date, so `stated_amount` — "the amount stated here, every period" — is the whole of what this
 * slice selects. `stated_period_amount`, `source_document_amount` and `prior_period_amount` were
 * drafted beside it and would each have posted the SAME cents; offering a model a rule nothing
 * performs is a promise the ledger does not keep (review round 1, A2). They are a successor
 * residual and return with the lane that honours them.
 */
export const ACCRUAL_METHODS = ["stated_amount"] as const;
export type AccrualMethod = (typeof ACCRUAL_METHODS)[number];

/** The plan schedule an accrual rides. `reversing_journal` IS the accrual→reversal pair (0193),
 *  so these are the shared plan contract's own values rather than a second vocabulary. */
export const ACCRUAL_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export const ACCRUAL_DAY_RULES = ["day_of_month", "last_day_of_month"] as const;
export const ACCRUAL_TIMEZONE = "Asia/Kuala_Lumpur";
/** The database's own ceiling (0193's `ck_plan_revisions_day_of_month`), and the ceiling is the
 *  point: a "31st of every month" schedule has no unambiguous February. */
export const ACCRUAL_DAY_OF_MONTH_MAX = 28;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one.");

const accountCode = z.string().trim().min(1).max(64);

/**
 * `.strict()` ON PURPOSE. An unknown key is a refusal rather than a silently dropped particular:
 * this schema is the whole contract between a model's words and a durable accounting record, and
 * a key the database never reads would be a figure nobody can be held to.
 */
export const startAccrualWorkInputSchema = z
  .object({
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("What this accrual is FOR, in the firm's own words — it names the schedule."),
    expense_account_code: accountCode.describe("The expense account this accrual charges."),
    liability_account_code: accountCode.describe(
      "The NON-CONTROL liability account it accrues into. A payables control account is refused: "
      + "a control reconciles to identified open items and an accrual has none.",
    ),
    amount_cents: z
      .number()
      .int()
      .positive()
      .describe("The accrued amount in exact minor units. An accrual of zero is refused, by name."),
    service_period_start: isoDate.describe("The first day of the period the accrued cost belongs to."),
    service_period_end: isoDate.describe("The last day of that period."),
    /**
     * ONE LITERAL, and the schema shape is the law. A model cannot express a period it derived
     * from a document, because there is no value here that would let it.
     */
    term_source: z
      .literal("human_stated")
      .describe("Always `human_stated`: the term is one a person stated, never one you derived."),
    method: z
      .enum(ACCRUAL_METHODS)
      .describe(
        "Which STATED amount each period uses. One rule is admitted: `stated_amount`, the figure "
        + "given here, accrued in every period of the window. It computes nothing.",
      ),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .describe("What the human asked for, in their own terms. This is the basis on the record."),
    authority_work_id: z
      .string()
      .uuid()
      .describe(
        "The accounting Work of THIS client that carries the instruction authorising the accrual. "
        + "The database RESOLVES it; a Knowledge preference or a remembered sentence cannot supply it.",
      ),
    effective_from: isoDate.describe("The day this accrual's authority starts. It never reaches back past this."),
    // REQUIRED, and bracketed by the stated term (0222's SIXTH MEASUREMENT). An accrual for a
    // service period that ends cannot authorise a schedule that does not: every occurrence must
    // post inside the term its own line names, so an open-ended accrual is a refusal rather than a
    // default. Ask the human when it stops.
    effective_to: isoDate.describe(
      "The day the authority stops. It is required, and it must fall on or before "
      + "`service_period_end`: the schedule runs INSIDE the term it names.",
    ),
    frequency: z.enum(ACCRUAL_FREQUENCIES).default("monthly"),
    day_rule: z.enum(ACCRUAL_DAY_RULES).default("last_day_of_month"),
    day_of_month: z
      .number()
      .int()
      .min(1)
      .max(ACCRUAL_DAY_OF_MONTH_MAX)
      .optional()
      .describe("1..28 only, and required when the day rule is `day_of_month`."),
    memo: z.string().trim().min(1).max(4000).optional().describe("The posted entry's memo; defaults to the purpose."),
    source_document_id: z.string().uuid().optional().describe("A document already FILED to this client."),
    document_service_period_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "The 0140 service-period row a human anchored to that document. Bind it rather than "
        + "restating the dates; a disagreement between the two is refused.",
      ),
  })
  .strict();

export type StartAccrualWorkInput = z.infer<typeof startAccrualWorkInputSchema>;

/** A shape refusal in the shape `chatTurn.v18.tools.ts`'s `localBasisRefusal` returns, so the
 *  successor can hand it straight back to the model. */
export type AccrualRefusal = {
  ok: false;
  code: string;
  reason: string;
  fix: string;
  message: string;
  details: Record<string, unknown>;
};

// `Object.assign` RATHER THAN A SPREAD, deliberately. `scripts/check-parts-parity.mjs` refuses an
// unclassifiable object spread anywhere under `packages/runtime/**` and admits one only through a
// sha-pinned tuple in `parts-parity-exemptions.mjs` — a shared registry three other lanes are
// editing this wave. Assembling the same object without a spread needs no entry there at all,
// which is one less contended file for one less line of expressiveness.
function refuse(
  reason: string,
  field: string,
  message: string,
  fix: string,
  extra: Record<string, unknown> = {},
): AccrualRefusal {
  return { ok: false, code: "CLR10", reason, fix, message, details: Object.assign({ field }, extra) };
}

/**
 * THE PLAN LANE'S OWN DUE-DATE ARITHMETIC, mirrored for the local half — `clara._plan_due_nth`
 * (0193:791) and the window walk of `clara._plan_due_events` (0193:845). It is arithmetic, not a
 * second rule: the database re-asks the same question and is the authority.
 *
 * `k` periods after the MONTH of `from`, on that month's last day or on the named day, never past
 * the month's own last day.
 */
function accrualDueNth(
  from: string,
  frequency: (typeof ACCRUAL_FREQUENCIES)[number],
  dayRule: (typeof ACCRUAL_DAY_RULES)[number],
  dayOfMonth: number | undefined,
  k: number,
): string {
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const total = year * 12 + (month - 1) + k * step;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = dayRule === "last_day_of_month" ? last : Math.min(dayOfMonth ?? 1, last);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Whether this schedule reaches at least one ACCRUAL date inside `[from, to]` (0222's SEVENTH
 * MEASUREMENT). A term shorter than one period of its own schedule reaches none — measured on a rig
 * before the wall existed: a 2026-07-01..2026-07-15 term on a month-end rule was accepted, and its
 * plan then held zero occurrences for ever.
 */
export function accrualScheduleYields(
  frequency: (typeof ACCRUAL_FREQUENCIES)[number],
  dayRule: (typeof ACCRUAL_DAY_RULES)[number],
  dayOfMonth: number | undefined,
  from: string,
  to: string,
): boolean {
  if (to < from) return false;
  for (let k = 0; k < 4096; k += 1) {
    const due = accrualDueNth(from, frequency, dayRule, dayOfMonth, k);
    if (due > to) return false;
    if (due >= from) return true;
  }
  return false;
}

/**
 * Every shape refusal a model can act on WITHOUT a database round trip, in the DATABASE's own
 * `field` vocabulary (`accrual.<key>`, migration 0222's own spelling) so one mapper serves both
 * halves of the validation. The database re-checks all of these and is the authority.
 */
export function localAccrualRefusal(input: StartAccrualWorkInput): AccrualRefusal | null {
  if (input.service_period_end < input.service_period_start) {
    return refuse(
      "invalid_accrual",
      "accrual.service_period_end",
      `The service period ends (${input.service_period_end}) before it starts (${input.service_period_start}).`,
      "Give a period whose end is on or after its start.",
      { constraint: "after_start" },
    );
  }
  if (input.expense_account_code.trim() === input.liability_account_code.trim()) {
    return refuse(
      "invalid_accrual",
      "accrual.liability_account_code",
      "The expense and liability legs name one account.",
      "Name the expense account and the liability account separately.",
      { constraint: "distinct" },
    );
  }
  if (input.document_service_period_id !== undefined && input.source_document_id === undefined) {
    return refuse(
      "invalid_accrual",
      "accrual.source_document_id",
      "A term anchored to a document does not name that document.",
      "Give the document id the anchored term belongs to.",
      { constraint: "required_by_term" },
    );
  }
  if (input.day_rule === "day_of_month" && input.day_of_month === undefined) {
    return refuse(
      "invalid_schedule",
      "day_of_month",
      "A day-of-month schedule needs the day.",
      `Ask the human which day of the month, 1 to ${ACCRUAL_DAY_OF_MONTH_MAX}.`,
      { constraint: "present" },
    );
  }
  if (input.day_rule === "last_day_of_month" && input.day_of_month !== undefined) {
    return refuse(
      "invalid_schedule",
      "day_of_month",
      "A last-day-of-month schedule carries no day number.",
      "Leave the day out, or use `day_of_month` and name it.",
      { constraint: "absent" },
    );
  }
  // 0193's own colliding shape, mirrored here so a model is told BEFORE the round trip: a monthly
  // reversing plan accruing on the 1st would put period k's reversal on period k+1's own day, and
  // `unique (plan_id, due_date)` would refuse the second.
  if (input.frequency === "monthly" && input.day_rule === "day_of_month" && input.day_of_month === 1) {
    return refuse(
      "reversal_collides_with_next_occurrence",
      "day_of_month",
      "A monthly accrual on the 1st would have its reversal land on the next accrual's own day.",
      "Accrue on the month end, or on a day between 2 and 28.",
      { constraint: "reversal_collision" },
    );
  }
  if (input.effective_to < input.effective_from) {
    return refuse(
      "invalid_schedule",
      "effective_to",
      `The authority ends (${input.effective_to}) before it starts (${input.effective_from}).`,
      "Give an end on or after the start.",
      { constraint: "after_effective_from" },
    );
  }
  // THE SCHEDULE RUNS INSIDE THE TERM IT NAMES (0222's SIXTH MEASUREMENT, mirrored here so a model
  // is told before the round trip). Otherwise an occurrence posts a line naming a period it did
  // not accrue for — measured on a rig: a June entry carrying "2026-07-01 to 2026-07-31".
  if (input.effective_from < input.service_period_start) {
    return refuse(
      "accrual_term_window_mismatch",
      "effective_from",
      `The authority starts (${input.effective_from}) before the service period it accrues for `
      + `(${input.service_period_start}).`,
      "Start the authority on or after the first day of the service period.",
      { constraint: "within_term", service_period_start: input.service_period_start },
    );
  }
  if (input.effective_to > input.service_period_end) {
    return refuse(
      "accrual_term_window_mismatch",
      "effective_to",
      `The authority would still be accruing on ${input.effective_to}, after the term it names `
      + `ends (${input.service_period_end}).`,
      "End the authority on or before the last day of the service period.",
      { constraint: "within_term", service_period_end: input.service_period_end },
    );
  }
  // …AND IT REACHES A DATE INSIDE THAT WINDOW (0222's SEVENTH MEASUREMENT). A term shorter than one
  // period of its own schedule was ACCEPTED before this wall and could never post: the accrual was
  // recorded, the plan went live, and no due date was ever reached. The refusal names the DAY RULE,
  // because the same term with a rule that falls inside it is configured — this is a wall, not a
  // ban.
  if (!accrualScheduleYields(input.frequency, input.day_rule, input.day_of_month,
        input.effective_from, input.effective_to)) {
    return refuse(
      "accrual_schedule_yields_no_occurrence",
      input.day_rule === "day_of_month" ? "day_of_month" : "day_rule",
      `This schedule reaches no accrual date between ${input.effective_from} and `
      + `${input.effective_to}, so the accrual would be recorded and never post.`,
      "Use a day rule that falls inside the term — a month-end rule needs a term reaching a month end.",
      { constraint: "yields_occurrence", frequency: input.frequency, day_rule: input.day_rule },
    );
  }
  return null;
}

/**
 * The `p_accrual` jsonb, in the DATABASE's own field spelling — the fourth argument of
 * `clara.create_accrual_adjustment_for`.
 *
 * IT EMITS ONLY WHAT 0222 READS. `authority_work_id`, `frequency`, `day_rule`, `day_of_month`,
 * `effective_from` and `effective_to` are separate arguments of that door and are deliberately NOT
 * folded in here: a key the database never reads could carry no refusal and would be a figure
 * nobody can be held to (`periodic-adjustment-basis.ts`'s own `settled_cents` rule).
 */
export function accrualFromInput(input: StartAccrualWorkInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    expense_account_code: input.expense_account_code.trim(),
    liability_account_code: input.liability_account_code.trim(),
    amount_cents: input.amount_cents,
    currency: "MYR",
    service_period_start: input.service_period_start,
    service_period_end: input.service_period_end,
    term_source: input.term_source,
    method: { rule: input.method },
    instruction: input.instruction,
  };
  if (input.memo !== undefined) out.memo = input.memo;
  if (input.source_document_id !== undefined) out.source_document_id = input.source_document_id;
  if (input.document_service_period_id !== undefined) {
    out.document_service_period_id = input.document_service_period_id;
  }
  return out;
}

/**
 * The JOURNAL BASIS those particulars imply — one debit on the expense leg, one credit on the
 * liability leg, exact minor units.
 *
 * IT IS A DERIVATION, NOT A PROPOSAL, and it is here for a DIFFERENT reason than its sibling's.
 * `clara.create_accrual_adjustment` derives the same basis itself, in SQL
 * (`clara._accrual_journal_basis`), and the door never takes a basis argument — so nothing this
 * function returns is ever sent. It exists so a surface can render the two lines the accrual will
 * post BEFORE it is configured, from the same rule the database will apply, and
 * `accrual-basis.test.mjs` pins the two against each other on a live rig. A change to either
 * without the other is caught by that cell rather than by a reviewer.
 *
 * THE POSTING DATE IS A PLACEHOLDER. Every occurrence replaces it with its own due date
 * (`clara._plan_occurrence_basis`, 0193:1037), and the reversal leg is that basis with both sides
 * exchanged and the reversed entry named in the memo — which is why this function derives no
 * reversal of its own.
 */
export function basisFromAccrual(
  input: StartAccrualWorkInput,
  { postingDate, memo }: { postingDate?: string; memo?: string } = {},
): Record<string, unknown> {
  return {
    posting_date: postingDate ?? input.effective_from,
    memo: memo ?? input.memo ?? input.purpose.trim(),
    currency: "MYR",
    lines: [
      {
        account_code: input.expense_account_code.trim(),
        debit_cents: input.amount_cents,
        credit_cents: 0,
        // WHAT IS TRUE OF EVERY OCCURRENCE, and the database's own wording
        // (`clara._accrual_journal_basis`): the revision's basis is FROZEN and each occurrence
        // posts one PERIOD of the stated term, not the whole of it.
        description:
          `one period of the accrual term ${input.service_period_start} to ${input.service_period_end}`,
      },
      {
        account_code: input.liability_account_code.trim(),
        debit_cents: 0,
        credit_cents: input.amount_cents,
        description: "accrual",
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// WHAT THE `chatTurn` SUCCESSOR MUST WIRE, and nothing more. Recorded here as well as in #652's
// report so the two cannot drift.
//
//   1. `tool({ inputSchema: startAccrualWorkInputSchema, execute })` under the name
//      `START_ACCRUAL_WORK_TOOL`, registered beside `start_journal_work` and
//      `start_periodic_adjustment_work` (both stay exactly as v19 has them).
//   2. In `execute`: the v18 client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localAccrualRefusal(input); if (local) return local;`.
//   3. `const opKey = stableOpKey(ctx.taskId, START_ACCRUAL_WORK_TOOL, input);` — the SAME identity
//      discipline `start_journal_work` uses, so a re-run turn resolves to the configuration it
//      already made instead of making a second one.
//   4. ONE query, with the actor taken from the CONTEXT and passed as an ARGUMENT:
//
//        select clara.create_accrual_adjustment_for(
//          $1::uuid,   -- ctx.clientId
//          $2::uuid,   -- ctx.createdBy            <- the human this turn acts for
//          $3::text,   -- input.purpose
//          $4::jsonb,  -- { kind: 'accounting_work', id: input.authority_work_id }
//          $5::jsonb,  -- accrualFromInput(input)
//          $6::text,   -- input.frequency
//          $7::text,   -- input.day_rule
//          $8::int,    -- input.day_of_month ?? null
//          $9::text,   -- ACCRUAL_TIMEZONE
//          $10::date,  -- input.effective_from
//          $11::date,  -- input.effective_to  (required: the schedule runs inside its term)
//          $12::text   -- opKey
//        ) as r
//
//   5. `WORK_ACCEPTED_PURPOSES` NEEDS NO WIDENING. The occurrence this configuration admits is a
//      `journal_entry` Work — 0193's `clara._plan_admit_occurrence` admits every occurrence
//      through `clara.admit_journal_work` with `adjustment_basis` NULL — so the `work_accepted`
//      part the tool emits is the one v19 already emits, and
//      `packages/runtime/tests/p6-1-parts-parity.test.mjs:548`'s pin does not move.
//   6. The SAME result mapping `runStartJournalWork` already has: a `WorkAcceptedPart` on success
//      (naming `answer.occurrence.work_id`, which is NULL when the authority starts in the future
//      — say "configured, nothing due yet" rather than inventing a Work id), and the database's
//      typed `(code, detail.reason)` handed back on a refusal. Every reason token this lane raises
//      is listed in migration 0222's header; none of them is a new CLASS of error, so
//      `claraWork.v1.errors.ts` needs no change.
//
// WHAT THE SUCCESSOR MUST NOT DO: mint a new claraWork bundle. An accrual occurrence runs through
// the EXISTING frozen claraWork body byte for byte — the typed particulars live in
// `clara.accrual_adjustments`, a relation the run never reads and never echoes.
// ---------------------------------------------------------------------------------------------
