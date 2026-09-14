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

test("643.web: a staff-advance recovery is NOT derived — the register owns the allocation", () => {
  // `clara._adv_on_approve` refuses a credit on an enrolled staff-advance account that does not
  // say WHICH advance it discharges; `clara.book_staff_advance_application` is that door. So the
  // advance account rides as a PARTICULAR and never appears as a derived credit leg — a form that
  // invented one would be fabricating a missing settlement fact.
  const lines = derivedLines(payrollDraft({ advanceAccountCode: "1185" }));
  assert.equal(lines.some((l) => l.account_code === "1185"), false);
  const wire = toAdjustmentWire(payrollDraft({ advanceAccountCode: "1185" }), CHART);
  assert.equal(wire?.advanceAccountCode, "1185", "…while the particular itself is still recorded");
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
  // `settledCents` IS NOT A SERVER PATH (adversarial migration-safety review, N3). It is a
  // client-side derivation input: neither `packages/runtime/src/workRoutes.ts`'s `ADJUSTMENT_CENTS`
  // table nor migration 0194's `clara._assert_adjustment_basis` has a `settled_cents` particular, so
  // no refusal can ever carry that path — and a mapper that claimed it would be promising to focus a
  // control for something that cannot arrive. Its LOCAL validation still names it, which is a
  // different thing and is pinned by the issue table above.
  assert.equal(fieldForAdjustmentPath("adjustment.settled_cents"), null,
    "no DB particular, no server path — the roster claims only what the server can name");
  assert.equal(fieldForAdjustmentPath("adjustment.settledCents"), null);
  assert.equal(fieldForAdjustmentPath("adjustment"), null);
  assert.equal(fieldForAdjustmentPath("lines[1].account_code"), null, "the basis keeps its own mapper");
  assert.equal(fieldForAdjustmentPath(null), null);
});

test("643.web: the default memo names the period it is about", () => {
  assert.equal(defaultMemo(stockDraft()), "Periodic stock adjustment 2026-01-01 to 2026-12-31");
  assert.equal(defaultMemo(payrollDraft()), "epf obligation 2026-08-01 to 2026-08-31");
});
