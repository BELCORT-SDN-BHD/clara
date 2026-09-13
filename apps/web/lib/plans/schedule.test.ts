// #640 — the plan form's own rules, proven against the DATABASE's rules they mirror.
//
// Every cell here names the refusal `clara._assert_plan_schedule` (0193) would raise for the same
// draft. That is the whole point of the module under test: a rule the form catches must be the
// SAME rule the door enforces, never a stricter one the door would have allowed and never a looser
// one that turns a field error into a refusal thirty seconds later.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_DAY_OF_MONTH_MAX, PLAN_TIMEZONE,
  firstInvalidPlanField, dayOfMonthForWire, effectiveToForWire, isCalendarDate, planControls,
  validateCatchUpWindow, validatePlanSchedule, type PlanScheduleDraft,
} from "./schedule";

const CLEAN: PlanScheduleDraft = {
  purpose: "Monthly office rent",
  kind: "recurring_journal",
  authorityWorkId: "11111111-2222-4333-8444-555555555555",
  frequency: "monthly",
  dayRule: "day_of_month",
  dayOfMonth: "1",
  effectiveFrom: "2026-09-01",
  effectiveTo: "",
};
const draft = (over: Partial<PlanScheduleDraft> = {}): PlanScheduleDraft => ({ ...CLEAN, ...over });
const codes = (d: PlanScheduleDraft, requireAuthority = true) =>
  validatePlanSchedule(d, { requireAuthority }).map((i) => `${i.field}:${i.code}`);

test("a clean draft raises nothing, and the wire shaping matches the door's argument types", () => {
  assert.deepEqual(codes(draft()), []);
  assert.equal(dayOfMonthForWire(draft()), 1);
  assert.equal(effectiveToForWire(draft()), null, "an empty end date crosses as NULL, never as an empty string");
  assert.equal(effectiveToForWire(draft({ effectiveTo: "2027-01-31" })), "2027-01-31");
  assert.equal(
    dayOfMonthForWire(draft({ dayRule: "last_day_of_month", dayOfMonth: "5" })),
    null,
    "a last-day rule carries NO day number — 0193 refuses one (invalid_schedule / day_of_month / absent)",
  );
  assert.equal(PLAN_TIMEZONE, "Asia/Kuala_Lumpur", "the one closed member 0193's CHECK admits");
});

test("the authority is required on CREATE and absent on a REVISION — a revision cannot move a frozen authority_ref", () => {
  assert.deepEqual(codes(draft({ authorityWorkId: "" })), ["authority:authorityRequired"],
    "the door would refuse authority_ref_unresolved; the form says so at the control instead");
  assert.deepEqual(codes(draft({ authorityWorkId: "" }), false), [],
    "a revision does not carry an authority at all");
});

test("a REVISION cannot start before the plan's own authority floor, and a CREATE has no floor to be below", () => {
  // 0193's `clara.revise_accounting_plan` refuses CLR10 `effective_from_before_authority` when a
  // revision's `effective_from` falls below the plan's frozen `accounting_plans.authority_from`
  // (review finding B3) — without that wall a plan authorised today could be revised to 2020 and
  // then catch up a decade of back-dated Work. The form says so at the control instead of letting
  // the door say it after a submit.
  const floor = "2026-07-01";
  assert.deepEqual(
    validatePlanSchedule(draft({ effectiveFrom: "2020-01-15" }), { requireAuthority: false, authorityFrom: floor })
      .map((i) => `${i.field}:${i.code}`),
    ["effectiveFrom:effectiveFromBeforeAuthority"],
  );
  assert.deepEqual(
    validatePlanSchedule(draft({ effectiveFrom: floor }), { requireAuthority: false, authorityFrom: floor }).map((i) => i.code),
    [],
    "the floor itself is admissible — the door's test is `<`, not `<=`",
  );
  assert.deepEqual(
    validatePlanSchedule(draft({ effectiveFrom: "2027-03-01" }), { requireAuthority: false, authorityFrom: floor }).map((i) => i.code),
    [],
    "moving the schedule FORWARD is what a revision is for",
  );
  // A CREATE sets the floor; it cannot be below one.
  assert.deepEqual(codes(draft({ effectiveFrom: "2020-01-15" })), [],
    "creating a plan whose authority starts in the past is the human's own explicit scope, not a refusal");
  // …and an INVALID date still reports as invalid rather than as "before the authority".
  assert.deepEqual(
    validatePlanSchedule(draft({ effectiveFrom: "2026-02-30" }), { requireAuthority: false, authorityFrom: floor })
      .map((i) => i.code),
    ["effectiveFromInvalid"],
  );
});

test("every schedule rule 0193 enforces is mirrored, and each names its own control", () => {
  assert.deepEqual(codes(draft({ purpose: "   " })), ["purpose:purposeRequired"]);
  assert.deepEqual(codes(draft({ frequency: "weekly" })), ["frequency:frequencyInvalid"]);
  assert.deepEqual(codes(draft({ dayRule: "nth_weekday" })), ["dayRule:dayRuleInvalid"]);

  // 1..28 — the ceiling is 0193's own column CHECK: a 31st-of-the-month schedule has no
  // unambiguous February, and a month end spells itself `last_day_of_month`.
  assert.equal(PLAN_DAY_OF_MONTH_MAX, 28);
  assert.deepEqual(codes(draft({ dayOfMonth: "29" })), ["dayOfMonth:dayOfMonthRange"]);
  assert.deepEqual(codes(draft({ dayOfMonth: "31" })), ["dayOfMonth:dayOfMonthRange"]);
  assert.deepEqual(codes(draft({ dayOfMonth: "0" })), ["dayOfMonth:dayOfMonthRange"]);
  assert.deepEqual(codes(draft({ dayOfMonth: "" })), ["dayOfMonth:dayOfMonthRange"]);
  assert.deepEqual(codes(draft({ dayOfMonth: "2.5" })), ["dayOfMonth:dayOfMonthRange"]);
  assert.deepEqual(codes(draft({ dayOfMonth: "28" })), [], "28 is admitted — the ceiling is inclusive");
  assert.deepEqual(codes(draft({ dayRule: "last_day_of_month", dayOfMonth: "99" })), [],
    "a month-end rule ignores the day box entirely; `dayOfMonthForWire` drops it");

  assert.deepEqual(codes(draft({ effectiveFrom: "" })), ["effectiveFrom:effectiveFromRequired"]);
  assert.deepEqual(codes(draft({ effectiveFrom: "2026-02-30" })), ["effectiveFrom:effectiveFromInvalid"],
    "a date that parses in JavaScript and is not a real day is still refused");
  assert.deepEqual(codes(draft({ effectiveTo: "2026-13-01" })), ["effectiveTo:effectiveToInvalid"]);
  assert.deepEqual(codes(draft({ effectiveTo: "2026-08-31" })), ["effectiveTo:effectiveToBeforeFrom"]);
  assert.deepEqual(codes(draft({ effectiveTo: "2026-09-01" })), [], "an end ON the start day is admitted");
});

test("the ONE colliding reversing shape is named at the control rather than arriving as a refusal", () => {
  // 0193: a monthly reversing plan accruing on the 1st would put period k's reversal and period
  // k+1's accrual on the same day, which `unique (plan_id, due_date)` cannot hold.
  assert.deepEqual(
    codes(draft({ kind: "reversing_journal", dayOfMonth: "1" })),
    ["dayOfMonth:reversalCollides"],
  );
  assert.deepEqual(codes(draft({ kind: "reversing_journal", dayOfMonth: "2" })), [],
    "every other monthly day is collision-free: a reversal is always the 1st of the following month");
  assert.deepEqual(codes(draft({ kind: "reversing_journal", dayRule: "last_day_of_month", dayOfMonth: "" })), [],
    "a month-end accrual reverses on the 1st and never collides");
  assert.deepEqual(codes(draft({ kind: "reversing_journal", frequency: "quarterly", dayOfMonth: "1" })), [],
    "quarterly accruals are three months apart, so the 1st is fine");
  assert.deepEqual(codes(draft({ kind: "reversing_journal", frequency: "annual", dayOfMonth: "1" })), []);
});

test("the first invalid field is the focus target, and the order is the reading order", () => {
  const issues = validatePlanSchedule(
    draft({ purpose: "", authorityWorkId: "", dayOfMonth: "40", effectiveFrom: "" }),
    { requireAuthority: true },
  );
  assert.equal(firstInvalidPlanField(issues), "purpose",
    "a failed submit focuses the FIRST control a preparer would read, not the last rule to fire");
  assert.equal(firstInvalidPlanField([]), null);
});

test("planControls offers only what the doors would accept — an ended plan offers nothing", () => {
  assert.deepEqual(planControls("active"), { pause: true, resume: false, end: true, revise: true, catchUp: true });
  assert.deepEqual(planControls("paused"), { pause: false, resume: true, end: true, revise: true, catchUp: false },
    "a paused plan catches nothing up: request_plan_catch_up refuses plan_paused");
  assert.deepEqual(planControls("ended"), { pause: false, resume: false, end: false, revise: false, catchUp: false },
    "every control on an ended plan could only ever refuse plan_ended (裁-187)");
});

test("the catch-up window mirrors request_plan_catch_up's own refusals, including the authority floor", () => {
  const at = (from: string, to: string, effectiveFrom: string | null) =>
    validateCatchUpWindow(from, to, effectiveFrom).map((i) => `${i.field}:${i.code}`);
  assert.deepEqual(at("2026-06-01", "2026-09-01", "2026-06-01"), []);
  assert.deepEqual(at("", "2026-09-01", "2026-06-01"), ["catchUpFrom:fromRequired"]);
  assert.deepEqual(at("2026-06-01", "", "2026-06-01"), ["catchUpTo:toRequired"]);
  assert.deepEqual(at("2026-02-30", "2026-09-01", "2026-06-01"), ["catchUpFrom:fromInvalid"]);
  assert.deepEqual(at("2026-09-01", "2026-06-01", "2026-06-01"), ["catchUpTo:toBeforeFrom"]);
  // THE ONE THAT MATTERS: a schedule does not authorise its own history.
  assert.deepEqual(at("2026-05-01", "2026-09-01", "2026-06-01"), ["catchUpFrom:beforeAuthority"],
    "0193 refuses this CLR10 catch_up_before_authority; the dialog says so at the field");
  assert.deepEqual(at("2026-05-01", "2026-09-01", null), [],
    "with no live revision to compare against, the floor is the door's to enforce, not the form's");
});

test("isCalendarDate is the composer's own test, not a second spelling of it", () => {
  assert.equal(isCalendarDate("2026-09-01"), true);
  assert.equal(isCalendarDate("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("2026-9-1"), false, "an unpadded date is not the ISO shape a date column takes");
  assert.equal(isCalendarDate(""), false);
});
