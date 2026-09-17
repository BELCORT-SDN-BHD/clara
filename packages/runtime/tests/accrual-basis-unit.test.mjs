// #652 — THE ACCRUAL LANE'S NON-FROZEN BASIS MODULE, driven as pure functions.
//
// WHAT THIS FILE PINS. `lib/accrual-basis.ts` is what a MODEL's words become on their way to
// `clara.create_accrual_adjustment_for`, and migration 0207 re-validates every rule in it and is
// the authority. These cells are the earlier, more legible half, and their job is to prove three
// things a review cannot check by reading:
//
//   schema.*  the `.strict()` contract — an unknown key is a refusal rather than a silently
//             dropped particular, `term_source` admits ONE literal so a model cannot express a
//             period it derived from a document, and the closed method set is the migration's.
//   refusal.* every local refusal carries the DATABASE's own reason token and `accrual.<key>`
//             field path, because `apps/web/lib/work/accrual-draft.ts`'s `fieldForAccrualPath` is
//             ONE mapper written against ONE vocabulary and a second spelling is a mapper that is
//             right half the time (#634's lesson, restated).
//   emit.*    `accrualFromInput` emits ONLY what 0207 reads, and `basisFromAccrual` derives the
//             SAME two lines `clara._accrual_journal_basis` derives — pinned against the live
//             function on a rig in `tests/accrual-e2e.mjs`, and here against its shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const mod = await import("../lib/accrual-basis.ts");

const INPUT = {
  purpose: "Monthly office rent accrual",
  expense_account_code: "6100",
  liability_account_code: "2020",
  amount_cents: 120000,
  service_period_start: "2026-07-01",
  service_period_end: "2026-07-31",
  term_source: "human_stated",
  method: "stated_amount",
  instruction: "the client's standing instruction of 2026-06-30, minuted by the engagement partner",
  authority_work_id: "11111111-1111-4111-8111-111111111111",
  effective_from: "2026-07-01",
  effective_to: "2026-07-31",
  frequency: "monthly",
  day_rule: "last_day_of_month",
};

const parse = (over = {}) => mod.startAccrualWorkInputSchema.safeParse({ ...INPUT, ...over });
const ok = (over = {}) => {
  const r = parse(over);
  assert.equal(r.success, true, `expected the input to parse: ${JSON.stringify(r.error?.issues ?? null)}`);
  return r.data;
};

// ==============================================================================================
// 1 · The schema contract.
// ==============================================================================================

test("652.schema: the canonical accrual parses, and the defaults are the plan lane's own", () => {
  const bare = Object.fromEntries(
    Object.entries(INPUT).filter(([k]) => k !== "frequency" && k !== "day_rule"));
  const r = mod.startAccrualWorkInputSchema.safeParse(bare);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues ?? null));
  assert.equal(r.data.frequency, "monthly");
  assert.equal(r.data.day_rule, "last_day_of_month",
    "a month-end accrual is the default because it is exact in every month; a day-of-month one "
    + "has to be asked for");
});

test("652.schema: an unknown key is REFUSED, not silently dropped", () => {
  const r = parse({ accrual_basis: { smuggled: true } });
  assert.equal(r.success, false,
    ".strict() is the whole point: a key the database never reads would be a figure nobody can be "
    + "held to");
  assert.ok(r.error.issues.some((i) => i.code === "unrecognized_keys"),
    `expected an unrecognized_keys issue, got ${JSON.stringify(r.error.issues)}`);
});

test("652.schema: term_source admits ONE literal, so a model cannot express a period it derived", () => {
  for (const bad of ["extracted", "inferred", "clara_interpreted", "model_derived"]) {
    assert.equal(parse({ term_source: bad }).success, false,
      `${bad} must not parse: 0140's law is that a model-derived period is not an anchored fact`);
  }
  assert.equal(parse({ term_source: "human_stated" }).success, true);
});

test("652.schema: the method set is closed, and it is exactly the rule the schedule performs", () => {
  assert.deepEqual([...mod.ACCRUAL_METHODS], ["stated_amount"],
    "one rule is offered because one rule is performed: the configuration freezes the stated amount "
    + "into the revision basis and clara._plan_occurrence_basis only moves the posting date");
  assert.equal(parse({ method: "stated_amount" }).success, true);
  for (const drafted of ["stated_period_amount", "source_document_amount", "prior_period_amount"]) {
    assert.equal(parse({ method: drafted }).success, false,
      `${drafted} was drafted for a successor and posts nothing different here; the tool must not offer it`);
  }
  assert.equal(parse({ method: "straight_line_over_term" }).success, false,
    "a formula is not a selection rule and has no home on this lane");
});

test("652.schema: the authority window is REQUIRED and bracketed by the stated term", () => {
  const bare = Object.fromEntries(Object.entries(INPUT).filter(([k]) => k !== "effective_to"));
  assert.equal(mod.startAccrualWorkInputSchema.safeParse(bare).success, false,
    "an accrual for a term that ENDS cannot authorise a schedule that does not (0207's SIXTH MEASUREMENT)");
});

test("652.schema: an accrual of zero or a negative amount never even parses", () => {
  assert.equal(parse({ amount_cents: 0 }).success, false);
  assert.equal(parse({ amount_cents: -1 }).success, false);
  assert.equal(parse({ amount_cents: 1200.5 }).success, false, "exact minor units, never a float");
});

// ==============================================================================================
// 2 · The local refusals — the database's own tokens, before any round trip.
// ==============================================================================================

test("652.refusal: a clean accrual is refused nothing", () => {
  assert.equal(mod.localAccrualRefusal(ok()), null);
});

test("652.refusal: a service period that ends before it starts names its own control", () => {
  const r = mod.localAccrualRefusal(ok({ service_period_start: "2026-07-31", service_period_end: "2026-07-01" }));
  assert.equal(r.reason, "invalid_accrual");
  assert.equal(r.details.field, "accrual.service_period_end");
  assert.equal(r.code, "CLR10");
});

test("652.refusal: one account cannot play both legs", () => {
  const r = mod.localAccrualRefusal(ok({ liability_account_code: "6100" }));
  assert.equal(r.reason, "invalid_accrual");
  assert.equal(r.details.field, "accrual.liability_account_code");
  assert.equal(r.details.constraint, "distinct");
});

test("652.refusal: a schedule that starts before its own stated term is refused BY NAME", () => {
  // MEASURED on a rig before this wall existed: an authority from June under a July term posted
  // three entries, two of them describing a period they did not accrue for (review round 1, A1).
  const r = mod.localAccrualRefusal(ok({ effective_from: "2026-06-01" }));
  assert.equal(r.reason, "accrual_term_window_mismatch");
  assert.equal(r.details.field, "effective_from");
  assert.equal(r.details.constraint, "within_term");
  assert.equal(r.details.service_period_start, "2026-07-01",
    "…and it hands back the boundary it was measured against, so a model can correct in one step");
});

test("652.refusal: a schedule that would still be accruing after its term ends is refused BY NAME", () => {
  const r = mod.localAccrualRefusal(ok({ effective_to: "2026-12-31" }));
  assert.equal(r.reason, "accrual_term_window_mismatch");
  assert.equal(r.details.field, "effective_to");
  assert.equal(r.details.constraint, "within_term");
});

test("652.refusal: a term too short for its own schedule is refused BY NAME at the day rule", () => {
  // MEASURED on a rig before this wall existed (review round 2, NB1): term and window both
  // 2026-07-01..2026-07-15 on a month-end rule were ACCEPTED, and the plan then held ZERO
  // occurrences for ever — an accrual that can never accrue.
  const r = mod.localAccrualRefusal(ok({
    service_period_end: "2026-07-15", effective_to: "2026-07-15",
  }));
  assert.equal(r.reason, "accrual_schedule_yields_no_occurrence");
  assert.equal(r.details.field, "day_rule", "the control that makes this a wall rather than a ban");
  assert.equal(r.details.constraint, "yields_occurrence");

  // A one-day term is the same shape at the smallest scale.
  const oneDay = mod.localAccrualRefusal(ok({
    service_period_start: "2026-07-10", service_period_end: "2026-07-10",
    effective_from: "2026-07-10", effective_to: "2026-07-10",
  }));
  assert.equal(oneDay.reason, "accrual_schedule_yields_no_occurrence");

  // …and under a day-of-month rule the DAY is the number to change, so that is what it names.
  const wrongDay = mod.localAccrualRefusal(ok({
    service_period_end: "2026-07-15", effective_to: "2026-07-15",
    day_rule: "day_of_month", day_of_month: 20,
  }));
  assert.equal(wrongDay.details.field, "day_of_month");

  // IT IS A WALL, NOT A BAN: the same half-month term with a rule that reaches inside it passes.
  assert.equal(mod.localAccrualRefusal(ok({
    service_period_end: "2026-07-15", effective_to: "2026-07-15",
    day_rule: "day_of_month", day_of_month: 15,
  })), null);
});

test("652.schedule: the mirrored due-date walk answers the plan lane's own question", () => {
  const yields = mod.accrualScheduleYields;
  // A month end is reached by a term that reaches a month end, and not by one that stops short.
  assert.equal(yields("monthly", "last_day_of_month", undefined, "2026-07-01", "2026-07-31"), true);
  assert.equal(yields("monthly", "last_day_of_month", undefined, "2026-07-01", "2026-07-30"), false);
  // February's short month is why `day_of_month` stops at 28 — the 28th is always reachable.
  assert.equal(yields("monthly", "day_of_month", 28, "2026-02-01", "2026-02-28"), true);
  // THE FIRST PERIOD IS THE MONTH OF `from`, AND A QUARTERLY SCHEDULE STEPS THREE MONTHS FROM
  // THERE. So a window that opens AFTER its own month's due day waits a whole quarter — which is
  // exactly the arithmetic `clara._plan_due_nth` does, and I had it wrong until this cell measured
  // it against the database's own walk.
  assert.equal(yields("quarterly", "last_day_of_month", undefined, "2026-01-01", "2026-01-31"), true);
  assert.equal(yields("quarterly", "day_of_month", 10, "2026-01-15", "2026-03-31"), false);
  assert.equal(yields("quarterly", "day_of_month", 10, "2026-01-15", "2026-04-30"), true);
  // An annual schedule reaches its own first date, and nothing else inside a short window.
  assert.equal(yields("annual", "last_day_of_month", undefined, "2026-01-01", "2026-01-31"), true);
  // A window that ends before it starts reaches nothing (0193's own validator names that one).
  assert.equal(yields("monthly", "last_day_of_month", undefined, "2026-07-31", "2026-07-01"), false);
});

test("652.refusal: a term anchored to a document must name the document", () => {
  const r = mod.localAccrualRefusal(ok({ document_service_period_id: "33333333-3333-4333-8333-333333333333" }));
  assert.equal(r.details.field, "accrual.source_document_id");
  assert.equal(r.details.constraint, "required_by_term");
});

test("652.refusal: the schedule's two day-rule halves, and 0193's own reversal collision", () => {
  const missing = mod.localAccrualRefusal(ok({ day_rule: "day_of_month" }));
  assert.equal(missing.details.field, "day_of_month");
  assert.equal(missing.details.constraint, "present");

  const stray = mod.localAccrualRefusal(ok({ day_rule: "last_day_of_month", day_of_month: 15 }));
  assert.equal(stray.details.constraint, "absent");

  // THE ONE COLLIDING SHAPE, mirrored from 0193:1606 so the model is told before the round trip.
  const collides = mod.localAccrualRefusal(ok({ frequency: "monthly", day_rule: "day_of_month", day_of_month: 1 }));
  assert.equal(collides.reason, "reversal_collides_with_next_occurrence",
    "a monthly accrual on the 1st would put period k's reversal on period k+1's own day");
  assert.equal(mod.localAccrualRefusal(ok({ frequency: "monthly", day_rule: "day_of_month", day_of_month: 2 })), null);
  assert.equal(mod.localAccrualRefusal(ok({ frequency: "quarterly", day_rule: "day_of_month", day_of_month: 1 })), null,
    "…and a quarterly one on the 1st does not collide, because its next accrual is three months away");
});

test("652.refusal: an authority window that ends before it starts", () => {
  const r = mod.localAccrualRefusal(ok({ effective_from: "2026-07-31", effective_to: "2026-06-30" }));
  assert.equal(r.reason, "invalid_schedule");
  assert.equal(r.details.field, "effective_to");
});

// ==============================================================================================
// 3 · What is emitted.
// ==============================================================================================

test("652.emit: accrualFromInput lands on the DATABASE's own snake_case shape and emits nothing else", () => {
  const out = mod.accrualFromInput(ok());
  assert.deepEqual(Object.keys(out).sort(), [
    "amount_cents", "currency", "expense_account_code", "instruction", "liability_account_code",
    "memo", "method", "service_period_end", "service_period_start", "term_source",
  ].filter((k) => k !== "memo").sort(),
    "the door's OWN arguments (authority, schedule, window) are not folded in: a key the database "
    + "never reads could carry no refusal");
  assert.equal(out.currency, "MYR");
  assert.deepEqual(out.method, { rule: "stated_amount" },
    "the method crosses as the object 0207's CHECK admits — `{rule}` and nothing else");
  assert.equal(out.amount_cents, 120000);
});

test("652.emit: the optional particulars appear only when they were given", () => {
  const bare = mod.accrualFromInput(ok());
  assert.equal("memo" in bare, false);
  assert.equal("source_document_id" in bare, false);
  assert.equal("document_service_period_id" in bare, false);

  const full = mod.accrualFromInput(ok({
    memo: "July rent",
    source_document_id: "44444444-4444-4444-8444-444444444444",
    document_service_period_id: "55555555-5555-4555-8555-555555555555",
  }));
  assert.equal(full.memo, "July rent");
  assert.equal(full.source_document_id, "44444444-4444-4444-8444-444444444444");
  assert.equal(full.document_service_period_id, "55555555-5555-4555-8555-555555555555");
});

test("652.emit: basisFromAccrual derives ONE debit on the expense leg and ONE credit on the liability leg", () => {
  const b = mod.basisFromAccrual(ok());
  assert.equal(b.currency, "MYR");
  assert.equal(b.memo, "Monthly office rent accrual", "the purpose is the memo when none was given");
  assert.equal(b.posting_date, "2026-07-01",
    "…and the posting date is a PLACEHOLDER: every occurrence replaces it with its own due date");
  assert.equal(b.lines.length, 2);
  assert.equal(b.lines[0].account_code, "6100");
  assert.equal(b.lines[0].debit_cents, 120000);
  assert.equal(b.lines[0].credit_cents, 0);
  assert.equal(b.lines[1].account_code, "2020");
  assert.equal(b.lines[1].debit_cents, 0);
  assert.equal(b.lines[1].credit_cents, 120000);
  assert.equal(b.lines[0].description, "one period of the accrual term 2026-07-01 to 2026-07-31",
    "the term travels on the line — and says what is true of EVERY occurrence, because the basis is "
    + "frozen on the revision and each occurrence posts one PERIOD of that term (0207's SIXTH "
    + "MEASUREMENT, and clara._accrual_journal_basis's own wording)");
  const debits = b.lines.reduce((n, l) => n + l.debit_cents, 0);
  const credits = b.lines.reduce((n, l) => n + l.credit_cents, 0);
  assert.equal(debits, credits, "balanced to the cent, with no rounding line invented");
  assert.ok(debits > 0, "…and it moves money: 0178's own nonzero rule, mirrored");
});

test("652.emit: the tool name and the timezone are the ones the successor wires", () => {
  assert.equal(mod.START_ACCRUAL_WORK_TOOL, "start_accrual_work");
  assert.equal(mod.ACCRUAL_TIMEZONE, "Asia/Kuala_Lumpur");
  assert.equal(mod.ACCRUAL_DAY_OF_MONTH_MAX, 28);
});
