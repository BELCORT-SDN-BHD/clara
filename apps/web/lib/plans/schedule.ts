// #640 — THE PLAN FORM'S OWN VALIDATION: pure functions over a draft, no React, no DB, no fetch.
// Split out of the component for the reason lib/work/journal-basis.ts gives for its own split: a
// rule about a SCHEDULE that lives inside a render body is a rule nobody can test without a DOM.
//
// WHAT THIS IS NOT. It is not the authority on whether a plan may be created.
// `clara._assert_plan_schedule` revalidates every rule below at the door, and
// `clara._plan_admit_occurrence` rechecks the authority window again at every due event. Every
// rule here is a MIRROR of one the database enforces, never a rule of its own — it exists so a
// preparer sees a mistake beside the field that holds it instead of as a refusal a second later.
//
// THE TWO CLOSED ONE-MEMBER SETS ARE THE DATABASE'S, RESTATED. `timezone` is
// `Asia/Kuala_Lumpur` and the reversal rule is `next_period_first_day`, both CHECK-constrained in
// 0193 so a later file can widen them additively. They are constants here rather than form
// controls, because a select with one option is a control that can only ever be obeyed.

import { isCalendarDate } from "../work/journal-basis";

export const PLAN_TIMEZONE = "Asia/Kuala_Lumpur";
export const PLAN_REVERSAL_DAY_RULE = "next_period_first_day";

export const PLAN_KINDS = ["recurring_journal", "reversing_journal"] as const;
export const PLAN_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export const PLAN_DAY_RULES = ["day_of_month", "last_day_of_month"] as const;

export type PlanKindId = (typeof PLAN_KINDS)[number];
export type PlanFrequencyId = (typeof PLAN_FREQUENCIES)[number];
export type PlanDayRuleId = (typeof PLAN_DAY_RULES)[number];

/**
 * THE DAY-OF-MONTH CEILING IS 28, AND IT IS THE POINT RATHER THAN A LIMITATION (0193's own
 * column CHECK): a "31st of every month" schedule has no unambiguous February, and silently
 * clamping it would make the recorded schedule and the dates it produces two different facts. A
 * month-end schedule spells itself `last_day_of_month`, which is exact in every month.
 */
export const PLAN_DAY_OF_MONTH_MAX = 28;

export type PlanFieldId =
  | "purpose"
  | "authority"
  | "kind"
  | "frequency"
  | "dayRule"
  | "dayOfMonth"
  | "effectiveFrom"
  | "effectiveTo";

export type PlanIssueCode =
  | "purposeRequired"
  | "authorityRequired"
  | "frequencyInvalid"
  | "dayRuleInvalid"
  | "dayOfMonthRange"
  | "effectiveFromRequired"
  | "effectiveFromInvalid"
  | "effectiveFromBeforeAuthority"
  | "periodAlreadyCovered"
  | "effectiveToInvalid"
  | "effectiveToBeforeFrom"
  | "reversalCollides";

export type PlanIssue = { field: PlanFieldId; code: PlanIssueCode };

export type PlanScheduleDraft = {
  purpose: string;
  kind: PlanKindId | string;
  /** The id of the Work carrying the instruction. Empty means the preparer has not chosen one —
   *  and the door would refuse `authority_ref_unresolved`, so the form says so first. */
  authorityWorkId: string;
  frequency: PlanFrequencyId | string;
  dayRule: PlanDayRuleId | string;
  /** Kept as the raw string the control holds, so a half-typed "1" is not silently a number. */
  dayOfMonth: string;
  effectiveFrom: string;
  effectiveTo: string;
};

/** An ISO calendar date, and a REAL one: `2026-02-30` parses in JavaScript and is not a date.
 *  RE-EXPORTED rather than re-implemented — `lib/work/journal-basis.ts` already owns this test for
 *  a posting date, and two spellings of "is this a real day" is exactly how a form and the door
 *  behind it end up disagreeing about February. */
export { isCalendarDate };

/**
 * THE PERIOD A DATE BELONGS TO, anchored on the plan's own `authority_from` rather than on the
 * calendar — `clara._plan_period_start`'s mirror, and the arithmetic the alignment wall below
 * stands on. A quarterly plan anchored in February has periods Feb–Apr, May–Jul, …, which
 * `Date`-based quarter arithmetic would answer Jan, Apr, … instead.
 *
 * Integer months, never a `Date`: a date built from `new Date("2026-03-01")` is UTC midnight and
 * reading its month back in MYT (UTC+8) is still March, but adding months across a DST-free zone
 * by milliseconds is how a schedule quietly slips a day. The whole lane is about exact dates.
 */
export function planPeriodStart(anchor: string, frequency: PlanFrequencyId | string, on: string): string | null {
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "annual" ? 12 : null;
  if (step === null || !isCalendarDate(anchor) || !isCalendarDate(on)) return null;
  const ay = Number(anchor.slice(0, 4));
  const am = Number(anchor.slice(5, 7));
  const months = (Number(on.slice(0, 4)) - ay) * 12 + (Number(on.slice(5, 7)) - am);
  // FLOOR, not truncate-toward-zero: a date before the anchor belongs to an EARLIER period, and
  // JavaScript's `/` plus `Math.trunc` would pull it forward into the anchor's own.
  const k = months >= 0 ? Math.floor(months / step) : -Math.ceil(-months / step);
  const total = am - 1 + k * step;
  const year = ay + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Every schedule rule 0193's `clara._assert_plan_schedule` enforces, in the order a preparer
 * should read them. The list's order IS the focus order (`firstInvalidPlanField`).
 */
export function validatePlanSchedule(
  draft: PlanScheduleDraft,
  opts: {
    requireAuthority: boolean;
    /** THE PLAN'S OWN AUTHORITY FLOOR on a REVISION — `accounting_plans.authority_from`, written
     *  once at creation and frozen. `clara.revise_accounting_plan` refuses an `effective_from`
     *  below it (CLR10 `effective_from_before_authority`), because a revision that could move the
     *  authority backwards would dissolve `catch_up_before_authority` with it. Null on CREATE,
     *  where the draft's own `effective_from` IS the floor being set. */
    authorityFrom?: string | null;
    /** THE LIVE REVISION'S frequency, and how far this plan has already run
     *  (`get_accounting_plan.covered_through`). Together they mirror 0193's
     *  `period_already_covered`: a frequency CHANGE re-aligns every period key, so a revision whose
     *  new alignment's first period starts on or before the end of the last period already run
     *  would post that period a second time. Both null on CREATE, where there is no predecessor
     *  alignment and nothing has run. */
    currentFrequency?: PlanFrequencyId | string | null;
    coveredThrough?: string | null;
  },
): PlanIssue[] {
  const issues: PlanIssue[] = [];

  if (draft.purpose.trim() === "") issues.push({ field: "purpose", code: "purposeRequired" });

  // Only CREATE carries an authority: a revision changes the schedule of an already authorised
  // plan and cannot move the instruction it was authorised by (0193 freezes `authority_ref`).
  if (opts.requireAuthority && draft.authorityWorkId.trim() === "") {
    issues.push({ field: "authority", code: "authorityRequired" });
  }

  if (!(PLAN_FREQUENCIES as readonly string[]).includes(draft.frequency)) {
    issues.push({ field: "frequency", code: "frequencyInvalid" });
  }
  if (!(PLAN_DAY_RULES as readonly string[]).includes(draft.dayRule)) {
    issues.push({ field: "dayRule", code: "dayRuleInvalid" });
  }
  if (draft.dayRule === "day_of_month") {
    const day = Number(draft.dayOfMonth);
    if (!Number.isInteger(day) || draft.dayOfMonth.trim() === "" || day < 1 || day > PLAN_DAY_OF_MONTH_MAX) {
      issues.push({ field: "dayOfMonth", code: "dayOfMonthRange" });
    }
  }

  if (draft.effectiveFrom.trim() === "") issues.push({ field: "effectiveFrom", code: "effectiveFromRequired" });
  else if (!isCalendarDate(draft.effectiveFrom)) issues.push({ field: "effectiveFrom", code: "effectiveFromInvalid" });
  // THE AUTHORITY FLOOR, mirrored (0193's `effective_from_before_authority`). ISO dates compare
  // lexicographically exactly as they compare chronologically — the same test
  // `validateCatchUpWindow` below makes against the catch-up window's own wall.
  else if (
    opts.authorityFrom !== undefined && opts.authorityFrom !== null
    && draft.effectiveFrom < opts.authorityFrom
  ) {
    issues.push({ field: "effectiveFrom", code: "effectiveFromBeforeAuthority" });
  }
  // THE ALIGNMENT WALL, mirrored (0193's `period_already_covered`). Only a FREQUENCY CHANGE
  // re-aligns the period keys; with the frequency unchanged the period a due day belongs to is
  // unchanged and 0193's own `period_already_admitted` still binds a moved due day.
  else if (
    opts.currentFrequency !== undefined && opts.currentFrequency !== null
    && opts.coveredThrough !== undefined && opts.coveredThrough !== null
    && opts.authorityFrom !== undefined && opts.authorityFrom !== null
    && draft.frequency !== opts.currentFrequency
    && (PLAN_FREQUENCIES as readonly string[]).includes(draft.frequency)
  ) {
    const first = planPeriodStart(opts.authorityFrom, draft.frequency, draft.effectiveFrom);
    if (first !== null && first <= opts.coveredThrough) {
      issues.push({ field: "effectiveFrom", code: "periodAlreadyCovered" });
    }
  }

  if (draft.effectiveTo.trim() !== "") {
    if (!isCalendarDate(draft.effectiveTo)) issues.push({ field: "effectiveTo", code: "effectiveToInvalid" });
    else if (isCalendarDate(draft.effectiveFrom) && draft.effectiveTo < draft.effectiveFrom) {
      issues.push({ field: "effectiveTo", code: "effectiveToBeforeFrom" });
    }
  }

  // THE ONE COLLIDING SHAPE (0193's `reversal_collides_with_next_occurrence`): a monthly reversing
  // plan accruing on the 1st would put period k's reversal and period k+1's accrual on the same
  // day. Named beside the control that causes it rather than left to arrive as a refusal.
  if (
    draft.kind === "reversing_journal"
    && draft.frequency === "monthly"
    && draft.dayRule === "day_of_month"
    && Number(draft.dayOfMonth) === 1
  ) {
    issues.push({ field: "dayOfMonth", code: "reversalCollides" });
  }

  return issues;
}

/** The control a failed submit moves focus to. Null when the draft is clean. */
export function firstInvalidPlanField(issues: readonly PlanIssue[]): PlanFieldId | null {
  return issues[0]?.field ?? null;
}

/** The DOM id of one control — used for `aria-describedby`, and as the label a test reads back off
 *  a focused node. The same idiom `journal-basis-fields.tsx`'s `fieldElementId` uses. */
export function planFieldElementId(field: PlanFieldId): string {
  return `plan-${field}`;
}

/** `day_of_month` carries a number; `last_day_of_month` carries none (0193 refuses one). */
export function dayOfMonthForWire(draft: PlanScheduleDraft): number | null {
  return draft.dayRule === "day_of_month" ? Number(draft.dayOfMonth) : null;
}

export function effectiveToForWire(draft: PlanScheduleDraft): string | null {
  return draft.effectiveTo.trim() === "" ? null : draft.effectiveTo;
}

/**
 * Which lifecycle controls a plan's CURRENT status makes worth offering.
 *
 * OFFERING A CONTROL IS NOT RE-DERIVING THE DOOR'S JUDGEMENT (lib/work/types.ts states the same
 * law for Retry and Cancel): every door rechecks the plan's live status and the caller's live role
 * and answers a typed refusal when it disagrees, which the surface renders verbatim. This only
 * decides whether a button is worth showing — and an ENDED plan offers none of them, because
 * every one of the three would refuse `plan_ended`.
 */
export function planControls(status: string): { pause: boolean; resume: boolean; end: boolean; revise: boolean; catchUp: boolean } {
  if (status === "ended") return { pause: false, resume: false, end: false, revise: false, catchUp: false };
  if (status === "paused") return { pause: false, resume: true, end: true, revise: true, catchUp: false };
  return { pause: true, resume: false, end: true, revise: true, catchUp: true };
}

export type CatchUpIssueCode = "fromRequired" | "toRequired" | "fromInvalid" | "toInvalid" | "toBeforeFrom" | "beforeAuthority";
export type CatchUpIssue = { field: "catchUpFrom" | "catchUpTo"; code: CatchUpIssueCode };

/**
 * The catch-up window's own rules, mirroring `clara.request_plan_catch_up`'s refusals — including
 * the one that matters most: a window that starts before the live revision's `effective_from` is
 * asking a schedule to authorise periods it was never authorised for, and the door refuses it
 * `catch_up_before_authority`. The form says so at the field instead.
 */
export function validateCatchUpWindow(from: string, to: string, effectiveFrom: string | null): CatchUpIssue[] {
  const issues: CatchUpIssue[] = [];
  if (from.trim() === "") issues.push({ field: "catchUpFrom", code: "fromRequired" });
  else if (!isCalendarDate(from)) issues.push({ field: "catchUpFrom", code: "fromInvalid" });
  if (to.trim() === "") issues.push({ field: "catchUpTo", code: "toRequired" });
  else if (!isCalendarDate(to)) issues.push({ field: "catchUpTo", code: "toInvalid" });
  if (issues.length > 0) return issues;
  if (to < from) issues.push({ field: "catchUpTo", code: "toBeforeFrom" });
  if (effectiveFrom !== null && from < effectiveFrom) {
    issues.push({ field: "catchUpFrom", code: "beforeAuthority" });
  }
  return issues;
}
