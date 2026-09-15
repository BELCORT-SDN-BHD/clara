// #643 — the periodic-adjustment form's validation and derivation, under test. Pure functions, so
// every cell here is about a RULE rather than about a rendering; the component's own cells prove
// the rules reach a control and move focus.
//
// THE ORDER OF `validateAdjustmentDraft`'S OUTPUT IS PART OF ITS CONTRACT and is asserted
// directly: "focus the first invalid field" is only meaningful if the list is in the order a human
// reads the form.
//
// AND THE DERIVATION IS PINNED AGAINST WHAT THE DATABASE WILL ASSERT. `derivedLines` and
// `clara._assert_adjustment_relationships` are two statements of ONE contract — the lines must say
// what the particulars say — so these cells spell the expected legs out by hand rather than
// re-deriving them, which is the only way a wrong derivation can fail here instead of at commit.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COUNT_REFERENCE_MAX_CHARS,
  INSTRUCTION_MAX_CHARS,
  OBLIGATION_EXPENSE_DEFAULTS,
  PARTICULARS_SOURCE_MAX_CHARS,
  STATUTORY_LIABILITY_DEFAULTS,
  defaultMemo,
  derivedLines,
  emptyAdjustmentDraft,
  fieldForAdjustmentLineOrdinal,
  fieldForAdjustmentPath,
  firstInvalidAdjustmentField,
  isCalendarDate,
  movementCents,
  toAdjustmentWire,
  validateAdjustmentDraft,
  type AdjustmentDraft,
} from "./periodic-adjustment";

const CHART = new Set(["1200", "5040", "6010", "2100", "1185", "1150", "4100"]);

/** A clean stocktake: RM 4,000.00 opening, RM 6,500.00 closing — a RM 2,500.00 rise. */
function stockDraft(over: Partial<AdjustmentDraft> = {}): AdjustmentDraft {
  return {
    ...emptyAdjustmentDraft(),
    purpose: "periodic_stock_adjustment",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    instruction: "Posting the 2026 year-end stocktake the supervisor signed off.",
    method: "opening_closing_count",
    openingCents: 400_000,
    closingCents: 650_000,
    countedAt: "2026-12-31",
    countReference: "STOCKTAKE-2026-12",
    inventoryAccountCode: "1200",
    costAccountCode: "5040",
    ...over,
  };
}

/** A clean supplied EPF obligation of RM 1,300.00. */
function payrollDraft(over: Partial<AdjustmentDraft> = {}): AdjustmentDraft {
  return {
    ...emptyAdjustmentDraft(),
    purpose: "payroll_obligation",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    instruction: "Book the employer EPF contribution for August 2026 as an accrued liability.",
    obligationKind: "epf",
    expenseAccountCode: "6010",
    liabilityAccountCode: "2100",
    amountCents: 130_000,
    particularsSource: "Payroll summary for August 2026 supplied by the client's HR officer",
    ...over,
  };
}

// ===========================================================================================
// 1 · Validation.
// ===========================================================================================

test("643.web: a clean draft of either shape carries no issues", () => {
  assert.deepEqual(validateAdjustmentDraft(stockDraft(), CHART), []);
  assert.deepEqual(validateAdjustmentDraft(payrollDraft(), CHART), []);
});

test("643.web: issues come back in DOM order — the period, then the active half, then the instruction", () => {
  const issues = validateAdjustmentDraft(
    stockDraft({ periodStart: "", inventoryAccountCode: "", instruction: "" }), CHART);
  assert.deepEqual(issues.map((i) => i.field), ["periodStart", "inventoryAccountCode", "instruction"]);
  assert.equal(firstInvalidAdjustmentField(issues), "periodStart",
    "the form focuses the FIRST invalid control, which only means anything if this list is ordered");
});

test("643.web: every rule mirrors one the database enforces, and names the control that holds it", () => {
  const cases: Array<[AdjustmentDraft, string, string]> = [
    [stockDraft({ periodEnd: "31-12-2026" }), "periodEnd", "invalidDate"],
    [stockDraft({ periodEnd: "2025-12-31" }), "periodEnd", "periodOrder"],
    [stockDraft({ costAccountCode: "1200" }), "costAccountCode", "accountsMustDiffer"],
    [stockDraft({ inventoryAccountCode: "9999" }), "inventoryAccountCode", "accountUnknown"],
    // `adjustment_all_zero`, beside the figure a preparer would change.
    [stockDraft({ closingCents: 400_000 }), "closingCents", "amountRequired"],
    // `stale_basis` — a count taken outside the period it is offered for.
    [stockDraft({ countedAt: "2027-02-01" }), "countedAt", "countedOutsidePeriod"],
    [stockDraft({ countReference: "x".repeat(COUNT_REFERENCE_MAX_CHARS + 1) }), "countReference", "tooLong"],
    [stockDraft({ instruction: "x".repeat(INSTRUCTION_MAX_CHARS + 1) }), "instruction", "tooLong"],
    [payrollDraft({ amountCents: 0 }), "amountCents", "amountRequired"],
    [payrollDraft({ liabilityAccountCode: "6010" }), "liabilityAccountCode", "accountsMustDiffer"],
    [payrollDraft({ settledCents: 30_000 }), "paymentAccountCode", "settlementNeedsAccount"],
    // `adjustment_lines_mismatch` / `payment_leg`: a named leg the entry never touches.
    [payrollDraft({ paymentAccountCode: "1150" }), "settledCents", "paymentLegUnused"],
    [payrollDraft({ paymentAccountCode: "1150", settledCents: 200_000 }), "settledCents", "overSettled"],
    [payrollDraft({ particularsSource: "  " }), "particularsSource", "required"],
    [payrollDraft({ particularsSource: "x".repeat(PARTICULARS_SOURCE_MAX_CHARS + 1) }), "particularsSource", "tooLong"],
    [payrollDraft({ advanceAccountCode: "9999" }), "advanceAccountCode", "accountUnknown"],
    // `_assert_adjustment_relationships`'s `distinct`: the advance leg repeats another named
    // account (0194: `v_adv in (v_exp, v_liab)`).
    [payrollDraft({ advanceAccountCode: "2100" }), "advanceAccountCode", "accountsMustDiffer"],
    [payrollDraft({ advanceAccountCode: "6010" }), "advanceAccountCode", "accountsMustDiffer"],
    // `_assert_adjustment_relationships`'s `advance_leg`: an account is named but the entry would
    // carry nothing on it — the SAME shape `paymentLegUnused` mirrors for the payment leg.
    [payrollDraft({ advanceAccountCode: "1185" }), "advanceCents", "advanceLegUnused"],
    [payrollDraft({ advanceAccountCode: "1185", advanceCents: 999_999 }), "advanceCents", "overAdvanced"],
  ];
  for (const [draft, field, code] of cases) {
    const issues = validateAdjustmentDraft(draft, CHART);
    const found = issues.find((i) => i.field === field && i.code === code);
    assert.ok(found, `${field}/${code} — got ${JSON.stringify(issues)}`);
  }
});

test("643.web: an unreadable chart SKIPS the unknown-account rule rather than guessing", () => {
  const issues = validateAdjustmentDraft(stockDraft({ inventoryAccountCode: "9999" }), null);
  assert.deepEqual(issues, [],
    "refusing every account because a READ failed would block a preparer over the UI's own problem; "
    + "the commit rechecks each code against the live chart anyway");
});

test("643.web: a period ordering rule waits until both dates are real dates", () => {
  const issues = validateAdjustmentDraft(stockDraft({ periodEnd: "2026-1" }), CHART);
  assert.equal(issues.filter((i) => i.code === "periodOrder").length, 0,
    "'the period ends before it starts' is not something to say about a field nobody has finished typing");
});

test("643.web: the two halves are independent — a switch does not validate the other one", () => {
  // The payroll half is left at its empty defaults; a stock draft must still read clean.
  const draft = stockDraft({ expenseAccountCode: "", liabilityAccountCode: "", particularsSource: "" });
  assert.deepEqual(validateAdjustmentDraft(draft, CHART), []);
});

// ===========================================================================================
// 2 · Derivation — the same contract `clara._assert_adjustment_relationships` re-derives.
// ===========================================================================================

test("643.web: the movement is the accountant's own subtraction, signed", () => {
  assert.equal(movementCents(stockDraft()), 250_000);
  assert.equal(movementCents(stockDraft({ openingCents: 650_000, closingCents: 400_000 })), -250_000);
  assert.equal(movementCents(stockDraft({ method: "explicit_adjustment", adjustmentCents: -90_000 })), -90_000);
  assert.equal(isCalendarDate("2026-02-31"), false, "…and a date is round-tripped, never Date.parse'd");
});

test("643.web: a RISE debits inventory and credits the cost account; a FALL is its mirror", () => {
  assert.deepEqual(
    derivedLines(stockDraft()).map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["1200", 250_000, 0], ["5040", 0, 250_000]]);
  assert.deepEqual(
    derivedLines(stockDraft({ openingCents: 650_000, closingCents: 400_000 })).map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["1200", 0, 250_000], ["5040", 250_000, 0]]);
});

test("643.web: the payroll expense leg carries the whole obligation and the liability takes the remainder", () => {
  assert.deepEqual(
    derivedLines(payrollDraft()).map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130_000, 0], ["2100", 0, 130_000]]);
  const settled = derivedLines(payrollDraft({ paymentAccountCode: "1150", settledCents: 30_000 }));
  assert.deepEqual(settled.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130_000, 0], ["2100", 0, 100_000], ["1150", 0, 30_000]]);
  assert.equal(
    settled.reduce((n, l) => n + l.debit_cents, 0),
    settled.reduce((n, l) => n + l.credit_cents, 0),
    "every derived basis balances to the cent");
});

test("643.web: choosing an advance account derives its leg — the gap named, not fixed, by v19", () => {
  // v19's report (`docs/plan/active/refresh-wave-2026-09-14/reports/v19-final.md`) named this
  // exactly: the form offered `advanceAccountCode` but `derivedLines` derived no leg for it, so a
  // preparer who picked one earned 0194's `advance_leg` refusal at admission. The fix mirrors the
  // chat lane's `basisFromAdjustment` (`packages/runtime/lib/periodic-adjustment-basis.ts`): the
  // liability leg's credit is `amount - settled - advance`, and the advance leg rides its own line,
  // BEFORE the settlement leg — the SAME three (or four) lines for the SAME particulars.
  const lines = derivedLines(payrollDraft({ advanceAccountCode: "1185", advanceCents: 40_000 }));
  assert.deepEqual(lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130_000, 0], ["2100", 0, 90_000], ["1185", 0, 40_000]]);
  assert.equal(
    lines.reduce((n, l) => n + l.debit_cents, 0),
    lines.reduce((n, l) => n + l.credit_cents, 0),
    "every derived basis balances to the cent");

  const wire = toAdjustmentWire(payrollDraft({ advanceAccountCode: "1185", advanceCents: 40_000 }), CHART);
  assert.equal(wire?.advanceAccountCode, "1185", "the particular itself is recorded");
  assert.equal("advanceCents" in (wire ?? {}), false,
    "advanceCents is a DERIVATION INPUT ONLY — the staff-advance register stays the authority on "
    + "what a movement on its accounts requires, so no server particular carries it and neither "
    + "does the wire body (#797 deliberately left this asymmetric with settledCents)");

  // ADVANCE, SETTLEMENT AND PAYMENT TOGETHER — all four legs, in the chat lane's own order.
  const both = derivedLines(payrollDraft({
    advanceAccountCode: "1185", advanceCents: 40_000, paymentAccountCode: "1150", settledCents: 30_000,
  }));
  assert.deepEqual(both.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130_000, 0], ["2100", 0, 60_000], ["1185", 0, 40_000], ["1150", 0, 30_000]]);
});

test("643.web: an advance account named with nothing carried on it is refused LOCALLY, not at admission", () => {
  // The exact gap v19 named: choosing the control with no `advanceCents` must never reach the
  // wire, because 0194's `_assert_adjustment_relationships` would refuse it `advance_leg` (a named
  // leg carrying nothing) at admission. `toAdjustmentWire` returns null for an invalid draft for
  // the same reason it does for any other local refusal.
  const draft = payrollDraft({ advanceAccountCode: "1185" }); // advanceCents left at its default, 0
  const issues = validateAdjustmentDraft(draft, CHART);
  assert.ok(issues.some((i) => i.field === "advanceCents" && i.code === "advanceLegUnused"));
  assert.equal(toAdjustmentWire(draft, CHART), null);
});

// ===========================================================================================
// 3 · The wire body, the defaults, and the field mapper.
// ===========================================================================================

test("643.web: the wire body carries only the ACTIVE half, and only the optionals that were filled", () => {
  const stock = toAdjustmentWire(stockDraft(), CHART);
  assert.deepEqual(stock, {
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    instruction: "Posting the 2026 year-end stocktake the supervisor signed off.",
    method: "opening_closing_count",
    inventoryAccountCode: "1200",
    costAccountCode: "5040",
    adjustmentCents: 250_000,
    openingCents: 400_000,
    closingCents: 650_000,
    countedAt: "2026-12-31",
    countReference: "STOCKTAKE-2026-12",
  });
  const explicit = toAdjustmentWire(
    stockDraft({ method: "explicit_adjustment", adjustmentCents: -90_000, countedAt: "", countReference: "" }), CHART);
  assert.equal("openingCents" in (explicit ?? {}), false,
    "an explicit adjustment carries no count — the database refuses one that carries both");
  assert.equal("countedAt" in (explicit ?? {}), false);

  const payroll = toAdjustmentWire(payrollDraft(), CHART);
  assert.equal("advanceAccountCode" in (payroll ?? {}), false);
  assert.equal("inventoryAccountCode" in (payroll ?? {}), false, "the purpose decides which keys are sent at all");
  // #797 · AND `settledCents` IS OMITTED WHEN NOTHING WAS SETTLED, exactly as an unfilled payment
  // account is. 0212 refuses an explicit `0` beside a named payment account by name, and a draft
  // with neither has nothing to state — sending `0` would be asking the database to refuse
  // something the form could have caught.
  assert.equal("settledCents" in (payroll ?? {}), false);
});

test("797.web: a stated settlement rides the wire as settledCents, the casing this function uses", () => {
  const wire = toAdjustmentWire(payrollDraft({ paymentAccountCode: "1150", settledCents: 30_000 }), CHART);
  assert.equal(wire?.settledCents, 30_000,
    "the split is a particular now — the history states it rather than leaving it to be re-read "
    + "off the posted entry's lines");
  assert.equal(wire?.paymentAccountCode, "1150");
  assert.equal("settled_cents" in (wire ?? {}), false, "camelCase on the wire; the route re-spells it");
});

test("643.web: an invalid draft produces NO wire body", () => {
  assert.equal(toAdjustmentWire(stockDraft({ instruction: "" }), CHART), null,
    "a wire body assembled from an invalid draft is how a UI ends up asking the database to refuse "
    + "something it could have caught");
});

test("643.web: the statutory defaults are the starter chart's own accounts, for all seven kinds", () => {
  assert.deepEqual(STATUTORY_LIABILITY_DEFAULTS, {
    epf: "2100", socso: "2110", eis: "2120", pcb_mtd: "2130", hrdf: "2140",
    salary: "2020", other_supplied: "2020",
  });
  assert.deepEqual(OBLIGATION_EXPENSE_DEFAULTS, {
    epf: "6010", socso: "6020", eis: "6030", pcb_mtd: "6000", hrdf: "6040",
    salary: "6000", other_supplied: "6000",
  });
});

test("643.web: a server field path lands on a control in BOTH spellings of one path", () => {
  // The DATABASE raises `adjustment.period_end`; the route's `toWireField` re-spells it
  // `adjustment.periodEnd`. Recognising both is the same reading `fieldForServerPath` gives
  // `source_refs[N]` / `sourceRefs[N]` — one path either side of one translator.
  assert.equal(fieldForAdjustmentPath("adjustment.period_end"), "periodEnd");
  assert.equal(fieldForAdjustmentPath("adjustment.periodEnd"), "periodEnd");
  assert.equal(fieldForAdjustmentPath("adjustment.advance_account_code"), "advanceAccountCode");
  assert.equal(fieldForAdjustmentPath("adjustment.corrects_adjustment_id"), null,
    "a path with no control of its own renders as a form-level message, never a focused guess");
  // #797 · `settledCents` IS NOW A SERVER PATH, in BOTH spellings. Migration 0212 made the
  // settlement split an optional particular of `clara._assert_adjustment_basis` and the route's
  // `ADJUSTMENT_CENTS` table carries the key, so a refusal really can arrive on it — `over_settled`
  // and `payment_leg_unused` on this path, `settlement_needs_account` on the account's. Listing it
  // is therefore a claim with something behind it, which is exactly the test the roster applies.
  assert.equal(fieldForAdjustmentPath("adjustment.settled_cents"), "settledCents",
    "0212 made it a particular — a refusal naming it must land on the control");
  assert.equal(fieldForAdjustmentPath("adjustment.settledCents"), "settledCents");
  // `advanceCents` IS STILL ABSENT, for the chat lane's own stated reason
  // (`packages/runtime/lib/periodic-adjustment-basis.ts`'s `advance_cents` never enters
  // `p_adjustment`): a derivation input, never a wire path, so no refusal can ever name it.
  // `advanceAccountCode` stays mapped above — it IS a 0194 particular.
  assert.equal(fieldForAdjustmentPath("adjustment.advance_cents"), null);
  assert.equal(fieldForAdjustmentPath("adjustment.advanceCents"), null);
  assert.equal(fieldForAdjustmentPath("adjustment"), null);
  assert.equal(fieldForAdjustmentPath("lines[1].account_code"), null, "the basis keeps its own mapper");
  assert.equal(fieldForAdjustmentPath(null), null);
});

test("643.web: the default memo names the period it is about", () => {
  assert.equal(defaultMemo(stockDraft()), "Periodic stock adjustment 2026-01-01 to 2026-12-31");
  assert.equal(defaultMemo(payrollDraft()), "epf obligation 2026-08-01 to 2026-08-31");
});

test("799: a stock-adjustment commit-time ordinal resolves 1 to inventory, 2 to cost, anything else to null", () => {
  assert.equal(fieldForAdjustmentLineOrdinal(1, "periodic_stock_adjustment", null), "inventoryAccountCode");
  assert.equal(fieldForAdjustmentLineOrdinal(2, "periodic_stock_adjustment", null), "costAccountCode");
  assert.equal(fieldForAdjustmentLineOrdinal(3, "periodic_stock_adjustment", null), null);
  assert.equal(fieldForAdjustmentLineOrdinal(0, "periodic_stock_adjustment", null), null, "lines[0] never occurs");
  assert.equal(fieldForAdjustmentLineOrdinal(-1, "periodic_stock_adjustment", null), null);
});

test("799: the obligation legs resolve in order, and the third leg reads the basis to tell advance from settlement", () => {
  assert.equal(fieldForAdjustmentLineOrdinal(1, "payroll_obligation", []), "expenseAccountCode");
  assert.equal(fieldForAdjustmentLineOrdinal(2, "payroll_obligation", []), "liabilityAccountCode");

  // A basis with ONLY the advance leg (no settlement): ordinal 3 is the advance leg, and there is
  // no ordinal 4 at all.
  const advanceOnly = [
    { description: "epf" },
    { description: "obligation" },
    { description: "staff advance" },
  ];
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", advanceOnly), "advanceAccountCode");
  assert.equal(fieldForAdjustmentLineOrdinal(4, "payroll_obligation", advanceOnly), null);

  // A basis with ONLY the settlement leg (no advance): ordinal 3 is the settlement leg.
  const settlementOnly = [
    { description: "epf" },
    { description: "obligation" },
    { description: "settled" },
  ];
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", settlementOnly), "paymentAccountCode");

  // A basis with BOTH conditional legs: advance before settlement, matching `derivedLines`'s own
  // order — ordinal 3 is the advance leg, ordinal 4 is the settlement leg.
  const both = [
    { description: "epf" },
    { description: "obligation" },
    { description: "staff advance" },
    { description: "settled" },
  ];
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", both), "advanceAccountCode");
  assert.equal(fieldForAdjustmentLineOrdinal(4, "payroll_obligation", both), "paymentAccountCode");
});

test("799: no mapping for a journal_entry Work, an absent basis, or an ordinal the basis does not reach", () => {
  assert.equal(fieldForAdjustmentLineOrdinal(1, "journal_entry", null), null);
  assert.equal(fieldForAdjustmentLineOrdinal(2, "journal_entry", [{ description: "epf" }, { description: "obligation" }]), null);
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", null), null);
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", undefined), null);
  assert.equal(fieldForAdjustmentLineOrdinal(3, "payroll_obligation", []), null);
});
