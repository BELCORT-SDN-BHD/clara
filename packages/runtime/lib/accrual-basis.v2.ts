// #937 + #942 — THE ACCRUAL CARRIER'S SUCCESSOR: a figure for each period, and two ways to run.
//
// WHY A NEW FILE. `lib/accrual-basis.ts` entered the frozen closure when `chatTurn.v20.tools.ts`
// imported it, so the two deltas ship beside it. `reports/wave4-lane03-fix.md` is explicit that
// they ship TOGETHER — "#937's `period_amounts` key and #942's `side` key land on the same
// `p_accrual` jsonb" — so the carrier is minted ONCE and both land in it, in the lane's own build
// order (937 then 942).
//
// WHAT DOES NOT MOVE, AND WHY IT CANNOT. `expense_account_code` and `liability_account_code` keep
// their names. They are the DATABASE's own wire keys on `p_accrual`, and renaming them to
// `pl_account_code` / `bs_account_code` — proposed in `wave4-lane03-fix.md` follow-up 2 "at the
// chatTurn_v22 cut" — needs a migration nobody reserved for this phase (CUT-PLAN §1.8 G2). What
// they get instead is a SIDE-AWARE description, which is what #942's own contract writes.
//
// NO OBJECT SPREAD ANYWHERE IN THIS FILE — the predecessor's own rule, and its own reason: the
// parts-parity census refuses one, and `Object.assign` costs nothing.

import { z } from "zod";
import {
  localAccrualRefusal,
  startAccrualWorkInputSchema,
  accrualFromInput,
  type AccrualRefusal,
} from "./accrual-basis.js";

export {
  ACCRUAL_DAY_OF_MONTH_MAX,
  ACCRUAL_DAY_RULES,
  ACCRUAL_FREQUENCIES,
  ACCRUAL_TIMEZONE,
  START_ACCRUAL_WORK_TOOL,
  accrualFromInput,
  accrualScheduleYields,
  basisFromAccrual,
  localAccrualRefusal,
  startAccrualWorkInputSchema,
} from "./accrual-basis.js";
export type { AccrualRefusal, StartAccrualWorkInput } from "./accrual-basis.js";

/** #937 — TWO RULES NOW. `stated_amount` is the figure accrued in EVERY period of the window;
 *  `stated_period_amount` is a figure a person states for EACH period, with `amount_cents` the
 *  window's total. Neither computes anything. */
export const ACCRUAL_METHODS_V2 = ["stated_amount", "stated_period_amount"] as const;
export type AccrualMethodV2 = (typeof ACCRUAL_METHODS_V2)[number];

/** #942 — TWO SIDES. `expense`: a cost the period incurred that nobody has billed yet.
 *  `revenue`: work delivered that nobody has invoiced yet, sitting in an accrued-income ASSET. */
export const ACCRUAL_SIDES = ["expense", "revenue"] as const;
export type AccrualSide = (typeof ACCRUAL_SIDES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one.");

const accountCode = z.string().trim().min(1).max(64);

/** ONE STATED PERIOD FIGURE: a due date of this schedule, and what that period accrues. */
export const accrualPeriodAmountSchema = z
  .object({
    due_date: isoDate.describe("A due date of this schedule inside the authority window."),
    amount_cents: z.number().int().positive(),
  })
  .strict();

export type AccrualPeriodAmount = z.infer<typeof accrualPeriodAmountSchema>;

/**
 * THE INPUT, with #937's `period_amounts` and #942's `side`. Everything else is the frozen
 * schema's own shape, taken from it rather than re-typed, so the two files cannot drift on a rule
 * neither ticket touched.
 */
export const startAccrualWorkInputSchemaV2 = z
  .object({
    purpose: startAccrualWorkInputSchema.shape.purpose,
    expense_account_code: accountCode.describe(
      "The profit-and-loss account: the EXPENSE account this accrual charges under "
      + "`side: \"expense\"`, or the INCOME account it earns under `side: \"revenue\"`.",
    ),
    liability_account_code: accountCode.describe(
      "The balance-sheet account: the non-control LIABILITY this accrual accrues into under "
      + "`side: \"expense\"`, or the non-control ASSET (accrued income) it accrues into under "
      + "`side: \"revenue\"`. 1180 Accrued Income is the standard chart's own; the accountant may "
      + "name another suitable account the client already has.",
    ),
    amount_cents: startAccrualWorkInputSchema.shape.amount_cents,
    service_period_start: startAccrualWorkInputSchema.shape.service_period_start,
    service_period_end: startAccrualWorkInputSchema.shape.service_period_end,
    term_source: startAccrualWorkInputSchema.shape.term_source,
    method: z
      .enum(ACCRUAL_METHODS_V2)
      .describe(
        "Which stated amount each period uses. `stated_amount`: the figure in `amount_cents`, "
        + "accrued in every period of the window. `stated_period_amount`: the accountant states a "
        + "figure for EACH period; `amount_cents` is then the TOTAL for the window and "
        + "`period_amounts` carries the periods. It computes nothing either way.",
      ),
    period_amounts: z
      .array(accrualPeriodAmountSchema)
      .min(1)
      .optional()
      .describe(
        "Required when `method` is `stated_period_amount`, and refused under any other rule. One "
        + "entry per due date the schedule reaches; they must sum EXACTLY to `amount_cents`. Ask "
        + "the human for any period you do not have — never invent one, never average, and never "
        + "read one off a document.",
      ),
    side: z
      .enum(ACCRUAL_SIDES)
      .default("expense")
      .describe(
        "Which way this accrual runs. `expense`: a cost the period incurred that nobody has "
        + "billed yet — Dr `expense_account_code` / Cr `liability_account_code`. `revenue`: a "
        + "service delivered that nobody has invoiced yet — Dr `liability_account_code` (the "
        + "accrued-income ASSET) / Cr `expense_account_code` (the INCOME account). Omitting it "
        + "means `expense`.",
      ),
    instruction: startAccrualWorkInputSchema.shape.instruction,
    authority_work_id: startAccrualWorkInputSchema.shape.authority_work_id,
    effective_from: startAccrualWorkInputSchema.shape.effective_from,
    effective_to: startAccrualWorkInputSchema.shape.effective_to,
    frequency: startAccrualWorkInputSchema.shape.frequency,
    day_rule: startAccrualWorkInputSchema.shape.day_rule,
    day_of_month: startAccrualWorkInputSchema.shape.day_of_month,
    memo: startAccrualWorkInputSchema.shape.memo,
    source_document_id: startAccrualWorkInputSchema.shape.source_document_id,
    document_service_period_id: startAccrualWorkInputSchema.shape.document_service_period_id,
  })
  .strict();

export type StartAccrualWorkInputV2 = z.infer<typeof startAccrualWorkInputSchemaV2>;

/** The v1 view of a v2 accrual. The frozen helpers read neither `period_amounts` nor `side`, and
 *  `method` is a string to all of them. */
type AccrualLike = Parameters<typeof accrualFromInput>[0];

/**
 * `p_accrual`, with the two new keys in the DATABASE's own spelling.
 *
 * `period_amounts` rides ONLY under the per-period rule: an empty array beside `stated_amount`
 * would be a key the door has to interpret, and an absent key is the honest shape for "there is no
 * per-period set".
 */
export function accrualFromInputV2(input: StartAccrualWorkInputV2): Record<string, unknown> {
  const out = accrualFromInput(input as AccrualLike);
  out.side = input.side;
  if (input.method === "stated_period_amount" && input.period_amounts !== undefined) {
    const lines: Array<Record<string, unknown>> = [];
    for (const line of input.period_amounts) {
      lines.push({ due_date: line.due_date, amount_cents: line.amount_cents });
    }
    out.period_amounts = lines;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// THE DUE-DATE WALK. `clara._plan_due_nth` (0193:791) and the window walk of
// `clara._plan_due_events` (0193:845), mirrored — the same arithmetic the frozen module's own
// `accrualScheduleYields` answers a boolean from. It is NOT a second rule: the database re-asks
// the same question and is the authority; a cell holds the two against each other on every window
// so a drift is a red rather than a discovery.
// ---------------------------------------------------------------------------------------------

function dueNth(
  from: string,
  frequency: "monthly" | "quarterly" | "annual",
  dayRule: "day_of_month" | "last_day_of_month",
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

/** Every due date this schedule reaches inside `[from, to]`, in order. */
export function accrualDueDates(
  frequency: "monthly" | "quarterly" | "annual",
  dayRule: "day_of_month" | "last_day_of_month",
  dayOfMonth: number | undefined,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  if (to < from) return out;
  for (let k = 0; k < 4096; k += 1) {
    const due = dueNth(from, frequency, dayRule, dayOfMonth, k);
    if (due > to) break;
    if (due >= from) out.push(due);
  }
  return out;
}

/** The due dates THIS accrual's authority window reaches. */
export function accrualScheduleDueDates(input: StartAccrualWorkInputV2): string[] {
  return accrualDueDates(
    input.frequency,
    input.day_rule,
    input.day_of_month,
    input.effective_from,
    input.effective_to,
  );
}

function refuseV2(
  reason: string,
  field: string,
  message: string,
  fix: string,
  extra: Record<string, unknown>,
): AccrualRefusal {
  return { ok: false, code: "CLR10", reason, fix, message, details: Object.assign({ field }, extra) };
}

/** RM 3,000.00 from 300000 — a display figure for a refusal sentence, never one on the wire. */
function ringgit(cents: number): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const sen = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}RM ${whole.toLocaleString("en-MY")}.${sen}`;
}

/**
 * THE FROZEN MIRROR, PLUS #937's EIGHT AND #942's ONE — all of them CLR10, all of them raised
 * LOCALLY before any round trip, and all of them on the field path the door itself uses
 * (`accrual.period_amounts`, indexed where the fault is one element's).
 *
 * `accrual_period_amount_missing` IS THE ASK. #937's AC4 asks the tool to ask when a period is
 * missing, and the detail hands the model the exact dates so it asks about a date rather than
 * about "a period".
 */
export function localAccrualRefusalV2(input: StartAccrualWorkInputV2): AccrualRefusal | null {
  // THE SIDE FIRST, because everything below it reads the accrual as a thing that runs one way.
  if (!(ACCRUAL_SIDES as readonly string[]).includes(input.side)) {
    return refuseV2(
      "accrual_side_unsupported",
      "accrual.side",
      `An accrual accrues an expense or revenue; I cannot record a ${String(input.side)} one.`,
      "Ask the accountant whether this is a cost nobody has billed yet or work nobody has invoiced yet.",
      { supported: ["expense", "revenue"], side: input.side },
    );
  }

  const inherited = localAccrualRefusal(input as AccrualLike);
  if (inherited) return inherited;

  const set = input.period_amounts;
  if (input.method !== "stated_period_amount") {
    if (set !== undefined) {
      // A BUG IN THE TOOL, NEVER A SENTENCE TO A PERSON — #937's own words for this token.
      return refuseV2(
        "accrual_period_amounts_unexpected",
        "accrual.period_amounts",
        "Per-period amounts were sent for an accrual that states one amount for every period.",
        "Send period_amounts only under `method: \"stated_period_amount\"`.",
        { method: input.method },
      );
    }
    return null;
  }
  if (set === undefined || set.length === 0) {
    return refuseV2(
      "accrual_period_amounts_absent",
      "accrual.period_amounts",
      "Which amount does each period accrue? I have none.",
      "Ask the accountant for the figure each period accrues, by date.",
      { method: input.method },
    );
  }

  for (const [index, line] of set.entries()) {
    if (!Number.isInteger(line.amount_cents) || line.amount_cents <= 0) {
      return refuseV2(
        "accrual_period_amount_invalid",
        `accrual.period_amounts[${index + 1}].amount_cents`,
        "This period's figure is not an exact amount in cents.",
        "Ask for the exact amount in cents; a period that accrues nothing is left out of the set.",
        { due_date: line.due_date, amount_cents: line.amount_cents },
      );
    }
  }

  const seen = new Set<string>();
  for (const [index, line] of set.entries()) {
    if (seen.has(line.due_date)) {
      return refuseV2(
        "accrual_period_amount_duplicate",
        `accrual.period_amounts[${index + 1}].due_date`,
        `Two amounts are stated for ${line.due_date}. Which one is right?`,
        "One line per due date. Ask which of the two figures that period accrues.",
        { due_date: line.due_date },
      );
    }
    seen.add(line.due_date);
  }

  const scheduled = accrualScheduleDueDates(input);
  const scheduledSet = new Set(scheduled);
  for (const [index, line] of set.entries()) {
    if (!scheduledSet.has(line.due_date)) {
      return refuseV2(
        "accrual_period_amount_not_scheduled",
        `accrual.period_amounts[${index + 1}].due_date`,
        `${line.due_date} is not a due date of this schedule.`,
        "Name a due date this schedule reaches, or change the schedule.",
        { due_date: line.due_date, scheduled },
      );
    }
  }

  let stated = 0;
  for (const line of set) stated += line.amount_cents;
  if (stated !== input.amount_cents) {
    return refuseV2(
      "accrual_period_amounts_unbalanced",
      "accrual.period_amounts",
      `The periods come to ${ringgit(stated)}; the accrual totals ${ringgit(input.amount_cents)}. `
      + "Which should I change?",
      "Ask the accountant whether a period's figure or the window's total is the one to correct.",
      {
        stated_cents: stated,
        total_cents: input.amount_cents,
        difference_cents: input.amount_cents - stated,
      },
    );
  }

  const missing = scheduled.filter((due) => !seen.has(due));
  if (missing.length > 0) {
    // THE ASK. The first date so the model can ask about one thing, and all of them so it can ask
    // about them together — #937's AC4, and the reason this is not a bare "a period is missing".
    return refuseV2(
      "accrual_period_amount_missing",
      "accrual.period_amounts",
      `What should ${missing[0]} accrue?`,
      "Ask the accountant for that period's figure by date — never average, and never carry a "
      + "previous period forward.",
      { due_date: missing[0], missing },
    );
  }

  // THE ODD CENT. An even split of a total that does not divide leaves a remainder, and by the
  // estate's convention it belongs to the FINAL period. The check only fires on a set that IS an
  // even split: a set of genuinely different stated figures is nobody's arithmetic to correct.
  const n = set.length;
  const base = Math.floor(input.amount_cents / n);
  const remainder = input.amount_cents - base * n;
  if (remainder > 0 && remainder < n) {
    const finalDue = scheduled.length === 0 ? null : scheduled[scheduled.length - 1];
    const carriers = set.filter((line) => line.amount_cents !== base);
    const carrier = carriers.length === 1 ? carriers[0] : undefined;
    const isEvenSplit = carrier !== undefined && carrier.amount_cents === base + remainder;
    if (finalDue !== null && isEvenSplit && carrier.due_date !== finalDue) {
      return refuseV2(
        "accrual_period_remainder_misplaced",
        "accrual.period_amounts",
        `An even split leaves ${remainder} cent${remainder === 1 ? "" : "s"}; by convention they `
        + `belong to ${finalDue}.`,
        `Move the odd ${remainder === 1 ? "cent" : "cents"} onto ${finalDue}, or state figures that are not an even split.`,
        { remainder_cents: remainder, final_due_date: finalDue, stated_on: carrier.due_date },
      );
    }
  }
  return null;
}

/**
 * WHAT THE DOOR'S OWN SIDE AND ACCOUNT REFUSALS MEAN TO A PERSON. `accrual_side_immutable` and the
 * two changed-shape `accrual_account_relationship` constraints are raised by the DATABASE, so they
 * arrive as a typed `(reason, detail)` rather than as anything this module decided.
 *
 * `expense_account` and `non_control_liability` are UNCHANGED on the expense side, and
 * `non_control_liability` in particular renders byte-identically to what it always did (#942).
 */
export function accrualRefusalMessageV2(reason: string, detail?: Record<string, unknown>): string {
  const bag = detail ?? {};
  const code = String(bag.account_code ?? "that account");
  if (reason === "accrual_side_immutable") {
    const side = String(bag.side ?? "one-sided");
    const article = /^[aeiou]/i.test(side) ? "an" : "a";
    return (
      `This is ${article} ${side} accrual. A correction restates it; to accrue the other way, let `
      + "this authority end and configure a new accrual."
    );
  }
  if (reason === "accrual_account_relationship") {
    const constraint = String(bag.constraint ?? "");
    if (constraint === "income_account") {
      return `${code} is not an income account. Which revenue account does this fee belong to?`;
    }
    if (constraint === "non_control_asset") {
      return (
        `${code} is the ${String(bag.account_class ?? "control")} control account; an accrual `
        + "carries no identified open item. 1180 Accrued Income is the usual one."
      );
    }
    if (constraint === "expense_account") {
      return `${code} is not an expense account. Which expense account does this cost belong to?`;
    }
    if (constraint === "non_control_liability") {
      return (
        `${code} is a control account; an accrual accrues into a non-control liability, because a `
        + "control reconciles to identified open items and an accrual has none."
      );
    }
    return `${code} cannot carry this accrual's leg.`;
  }
  return "I could not configure that accrual.";
}
