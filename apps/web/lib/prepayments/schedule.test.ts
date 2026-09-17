// #653 — THE FORM'S PURE MIRROR, driven as pure functions.
//
// WHAT EACH CELL PINS:
//   tokens.*     every refusal token this surface renders a message for is one migration 0223's
//                door actually raises, spelled the DATABASE's way. A token this file invented would
//                be a message that never appears; a token it missed would be a refusal the surface
//                cannot name.
//   mirror.*     the validator refuses only what the door refuses, and nothing the door accepts. It
//                is deliberately shallow: everything that needs a row is the database's.
//   derived.*    the cadence is a CONSTANT, not a control, and the constants are the ones 0223
//                derives.
//   allocation.* the ONE arithmetic a surface may assert about numbers it did not derive — do the
//                lines the database sent add up to the total it sent — and which line carries the
//                residual.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_PREPAYMENT_DRAFT, PREPAYMENT_DAY_RULE, PREPAYMENT_FREQUENCY, PREPAYMENT_REFUSAL,
  PREPAYMENT_TIMEZONE, allocationIsExact, firstInvalidPrepaymentField, occurrenceStage,
  prepaymentFieldElementId, prepaymentRefusalKey, residualIndex, validatePrepaymentDraft,
  type PeriodLine, type PrepaymentDraft,
} from "./schedule";

const VALID: PrepaymentDraft = {
  sourceEntryId: "9f1d8e2c-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  authorityWorkId: "2b7c6d5e-4f3a-4b2c-8d1e-0f9a8b7c6d5e",
  expenseAccountCode: "59000001",
  expenseAccountBasis: "the invoice narrates a twelve-month subscription",
  purpose: "Prepaid subscription amortisation",
};

const CHART = new Set(["59000001", "59000002"]);

const line = (start: string, end: string, cents: number): PeriodLine => ({
  period_start: start, period_end: end, amount_cents: cents, credit_cents: cents,
  account_code: "19000001", prepaid_account_code: "19000001", expense_account_code: "59000001",
});

// ==============================================================================================
// 1 · The tokens.
// ==============================================================================================

test("tokens.database — every token this surface can render a message for is one migration 0223's door raises, in the DATABASE's own spelling", () => {
  assert.deepEqual(Object.values(PREPAYMENT_REFUSAL).sort(), [
    "amortisation_period_line_missing",
    "authority_ref_unresolved",
    "client_inactive",
    "client_not_found",
    "invalid_purpose",
    "operation_in_flight",
    "prepayment_amount_below_period_granularity",
    "prepayment_schedule_exists",
    "prepayment_schedule_not_found",
    "prepayment_source_unfit",
    "prepayment_target_ineligible",
    "prepayment_target_underivable",
    "prepayment_term_underivable",
  ]);
});

test("tokens.messages — the eight refusals this build enumerates map to their own key, and ANYTHING else answers `unknown` so the database's own words are what reach the screen", () => {
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.sourceUnfit), "refusalSourceUnfit");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.termUnderivable), "refusalTermUnderivable");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.targetIneligible), "refusalTargetIneligible");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.targetUnderivable), "refusalTargetUnderivable");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.belowGranularity), "refusalBelowGranularity");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.scheduleExists), "refusalScheduleExists");
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.periodLineMissing), "refusalPeriodLineMissing");
  // THE FORM CAN PRODUCE THIS ONE ITSELF, so it needs a next act rather than the raw sentence: the
  // door RESOLVES `p_authority_ref` against this client's own Work and refuses when it names none.
  assert.equal(prepaymentRefusalKey(PREPAYMENT_REFUSAL.authorityRefUnresolved),
    "refusalAuthorityUnresolved");
  // A refusal this build has not enumerated must still be LEGIBLE, never reduced to a key path.
  assert.equal(prepaymentRefusalKey("something_a_later_migration_adds"), "unknown");
  assert.equal(prepaymentRefusalKey(null), "unknown");
  assert.equal(prepaymentRefusalKey(undefined), "unknown");
});

// ==============================================================================================
// 2 · The mirror.
// ==============================================================================================

test("mirror.accepts — a well-formed draft passes, and passes WITHOUT a chart too (a failed chart read must not refuse every account)", () => {
  assert.deepEqual(validatePrepaymentDraft(VALID, CHART), []);
  assert.deepEqual(validatePrepaymentDraft(VALID, null), [],
    "when the chart could not be read the check is SKIPPED rather than guessed");
});

test("mirror.refuses — each of the five fields is refused when blank, with the code the form renders", () => {
  const cases: [Partial<PrepaymentDraft>, string, string][] = [
    [{ sourceEntryId: "  " }, "sourceEntry", "sourceRequired"],
    // THE AUTHORITY IS A FIELD, not a fallback. `clara.create_accounting_plan` RESOLVES the
    // reference against this client's own `clara.accounting_work`; a form that invented one from
    // the recognition entry's id could only ever be refused, and a blocked submit beats a
    // fabricated authority.
    [{ authorityWorkId: "  " }, "authority", "authorityRequired"],
    [{ expenseAccountCode: "  " }, "expenseAccount", "accountRequired"],
    [{ expenseAccountBasis: "  " }, "expenseBasis", "basisRequired"],
    [{ purpose: "  " }, "purpose", "purposeRequired"],
  ];
  for (const [over, field, code] of cases) {
    const issues = validatePrepaymentDraft({ ...VALID, ...over }, CHART);
    assert.deepEqual(issues, [{ field, code }], `${field} must be refused when blank`);
  }
});

test("mirror.account_unknown — a code this client's chart does not hold is named HERE, because the door answers prepayment_target_ineligible/account_unknown for it", () => {
  assert.deepEqual(validatePrepaymentDraft({ ...VALID, expenseAccountCode: "59999999" }, CHART),
    [{ field: "expenseAccount", code: "accountUnknown" }]);
});

test("mirror.shallow — the mirror NEVER claims an entry is unfit, a term missing or an amount below granularity: all three need a row and are the database's", () => {
  const codes = new Set<string>();
  for (const over of [
    {}, { sourceEntryId: "" }, { expenseAccountCode: "" }, { expenseAccountBasis: "" },
    { purpose: "" }, { expenseAccountCode: "59999999" },
  ]) {
    for (const i of validatePrepaymentDraft({ ...VALID, ...over }, CHART)) codes.add(i.code);
  }
  assert.deepEqual([...codes].sort(), [
    "accountRequired", "accountUnknown", "basisRequired", "purposeRequired", "sourceRequired",
  ]);
});

test("mirror.focus_order — a failed submit focuses the FIRST invalid control in the order the form reads, and the empty draft starts at the recognition", () => {
  const all = validatePrepaymentDraft(EMPTY_PREPAYMENT_DRAFT, CHART);
  assert.equal(firstInvalidPrepaymentField(all), "sourceEntry");
  assert.equal(
    firstInvalidPrepaymentField(validatePrepaymentDraft({ ...VALID, purpose: "" }, CHART)),
    "purpose");
  assert.equal(
    firstInvalidPrepaymentField(validatePrepaymentDraft({ ...VALID, expenseAccountBasis: "", purpose: "" }, CHART)),
    "expenseBasis", "the earlier field wins, so the walk is the reading order");
  assert.equal(
    firstInvalidPrepaymentField(validatePrepaymentDraft({ ...VALID, authorityWorkId: "", expenseAccountCode: "" }, CHART)),
    "authority", "the instruction is read before the account it charges");
  assert.equal(firstInvalidPrepaymentField([]), "sourceEntry",
    "an empty issue list still answers a field rather than undefined");
});

test("mirror.element_ids — each field's control id is stable, so a failed submit's focus target and its aria-describedby cannot drift apart", () => {
  assert.equal(prepaymentFieldElementId("sourceEntry"), "prepayment-sourceEntry");
  assert.equal(prepaymentFieldElementId("authority"), "prepayment-authority");
  assert.equal(prepaymentFieldElementId("expenseAccount"), "prepayment-expenseAccount");
  assert.equal(prepaymentFieldElementId("expenseBasis"), "prepayment-expenseBasis");
  assert.equal(prepaymentFieldElementId("purpose"), "prepayment-purpose");
});

// ==============================================================================================
// 3 · The derived cadence.
// ==============================================================================================

test("derived.cadence — the cadence is a CONSTANT this module states rather than a control the form offers, and it is the one 0223 derives", () => {
  assert.equal(PREPAYMENT_FREQUENCY, "monthly");
  assert.equal(PREPAYMENT_DAY_RULE, "last_day_of_month");
  assert.equal(PREPAYMENT_TIMEZONE, "Asia/Kuala_Lumpur");
  // And the draft carries NO cadence field at all — an absence this cell makes checkable. The
  // five it DOES carry are the five human judgements: which recognition, under whose instruction,
  // to which expense account, on what grounds, and what for.
  assert.deepEqual(Object.keys(EMPTY_PREPAYMENT_DRAFT).sort(), [
    "authorityWorkId", "expenseAccountBasis", "expenseAccountCode", "purpose", "sourceEntryId",
  ]);
});

// ==============================================================================================
// 4 · The allocation.
// ==============================================================================================

test("allocation.exact — the lines the database sent must sum to the total it sent; one cent out is NOT exact", () => {
  const lines = [
    line("2026-01-01", "2026-01-31", 33333),
    line("2026-02-01", "2026-02-28", 33333),
    line("2026-03-01", "2026-03-31", 33334),
  ];
  assert.equal(allocationIsExact(lines, 100000), true);
  assert.equal(allocationIsExact(lines, 99999), false);
  assert.equal(allocationIsExact([], 100000), false,
    "an empty allocation is never 'exact' — it is a read that returned nothing");
});

test("allocation.residual — the FINAL line carries the remainder, and an evenly divided term has no residual to name", () => {
  assert.equal(residualIndex([
    line("2026-01-01", "2026-01-31", 33333),
    line("2026-02-01", "2026-02-28", 33333),
    line("2026-03-01", "2026-03-31", 33334),
  ]), 2);
  assert.equal(residualIndex([
    line("2026-01-01", "2026-01-31", 50000),
    line("2026-02-01", "2026-02-28", 50000),
  ]), -1, "an even split has no residual, so nothing is labelled as one");
  assert.equal(residualIndex([line("2026-01-01", "2026-01-31", 100000)]), -1,
    "a one-period term's only line is not a 'remainder'");
  assert.equal(residualIndex([]), -1);
});

// ==============================================================================================
// 5 · Where a period stopped.
// ==============================================================================================

test("stage — a refused OCCURRENCE stopped at admission; anything else that failed stopped at posting, and the next act differs", () => {
  assert.equal(occurrenceStage("refused"), "admission");
  assert.equal(occurrenceStage("admitted"), "posting");
  assert.equal(occurrenceStage("pending"), "posting");
  assert.equal(occurrenceStage(null), "posting");
  assert.equal(occurrenceStage(undefined), "posting");
});
