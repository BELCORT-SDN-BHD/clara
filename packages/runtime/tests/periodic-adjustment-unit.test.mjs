// #643 — THE PERIODIC-ADJUSTMENT DOOR'S WIRE CONTRACT AND THE CHAT LANE'S BASIS MODULE, driven as
// pure functions.
//
// TWO SUBJECTS, ONE FILE, because they are two halves of ONE contract: `src/workRoutes.ts`'s
// `toDbAdjustment` is what the BROWSER's particulars become, and
// `lib/periodic-adjustment-basis.ts` is what the MODEL's become. Migration 0194 re-validates both
// and is the authority; these are the earlier, more legible halves whose job is to name the field.
//
// WHAT EACH CELL PINS:
//   route.*   every field path this door emits is the DATABASE's key re-spelled camelCase under
//             the one `adjustment.` prefix — because `apps/web/lib/work/periodic-adjustment.ts`'s
//             `fieldForAdjustmentPath` is ONE mapper written against that one vocabulary, and a
//             second spelling is a mapper that is right half the time (#634's lesson, restated).
//   basis.*   the module chatTurn v19 will import: the discriminated union refuses a payroll
//             obligation wearing stock fields, the derivations are exact-cent and sign-correct,
//             and the local refusals carry the database's own reason tokens.
//   parity.*  the two halves land on the SAME database shape for the same particulars, so a
//             preparer typing figures into the form and a human dictating them to Clara admit one
//             accounting claim and not two.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const { toDbAdjustment, toDbBasis, workErrorStatus, WORK_MAPPED_CODES } = await import("../src/workRoutes.ts");
const mod = await import("../lib/periodic-adjustment-basis.ts");

const STOCK = {
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  method: "opening_closing_count",
  openingCents: 400000,
  closingCents: 650000,
  adjustmentCents: 250000,
  countedAt: "2026-12-31",
  countReference: "STOCKTAKE-2026-12",
  inventoryAccountCode: "1200",
  costAccountCode: "5040",
  instruction: "Posting the 2026 year-end stocktake the supervisor signed off.",
};

const PAYROLL = {
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  obligationKind: "epf",
  expenseAccountCode: "6010",
  liabilityAccountCode: "2100",
  amountCents: 130000,
  particularsSource: "Payroll summary for August 2026 supplied by the client's HR officer",
  instruction: "Book the employer EPF contribution for August 2026 as an accrued liability.",
};

// ==============================================================================================
// 1 · The ROUTE's translation.
// ==============================================================================================

test("643.route: a stock payload lands on the DATABASE's own snake_case shape, with MYR supplied", () => {
  const out = toDbAdjustment("periodic_stock_adjustment", STOCK);
  assert.equal(out.ok, true);
  assert.deepEqual(out.adjustment, {
    currency: "MYR",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    method: "opening_closing_count",
    inventory_account_code: "1200",
    cost_account_code: "5040",
    counted_at: "2026-12-31",
    count_reference: "STOCKTAKE-2026-12",
    instruction: STOCK.instruction,
    opening_cents: 400000,
    closing_cents: 650000,
    adjustment_cents: 250000,
  });
});

test("643.route: a payroll payload keeps its optional legs only when they are given", () => {
  const bare = toDbAdjustment("payroll_obligation", PAYROLL);
  assert.equal(bare.ok, true);
  assert.equal("advance_account_code" in bare.adjustment, false);
  assert.equal("payment_account_code" in bare.adjustment, false);
  assert.equal(bare.adjustment.amount_cents, 130000);

  const withLegs = toDbAdjustment("payroll_obligation", {
    ...PAYROLL, advanceAccountCode: "1185", paymentAccountCode: "1150",
  });
  assert.equal(withLegs.ok, true);
  assert.equal(withLegs.adjustment.advance_account_code, "1185");
  assert.equal(withLegs.adjustment.payment_account_code, "1150");
});

test("643.route: every refusal names its field under the ONE `adjustment.` prefix, in the DB's spelling", () => {
  const cases = [
    [["periodic_stock_adjustment", null], "adjustment", "object"],
    [["periodic_stock_adjustment", { ...STOCK, periodStart: undefined }], "adjustment.period_start", "present"],
    [["periodic_stock_adjustment", { ...STOCK, periodEnd: "31-12-2026" }], "adjustment.period_end", "iso_date"],
    [["periodic_stock_adjustment", { ...STOCK, periodEnd: "2025-12-31" }], "adjustment.period_end", "order"],
    [["periodic_stock_adjustment", { ...STOCK, method: undefined }], "adjustment.method", "present"],
    [["periodic_stock_adjustment", { ...STOCK, instruction: "   " }], "adjustment.instruction", "nonempty"],
    [["periodic_stock_adjustment", { ...STOCK, instruction: "x".repeat(4001) }], "adjustment.instruction", "max_length"],
    [["periodic_stock_adjustment", { ...STOCK, countedAt: "2026/12/31" }], "adjustment.counted_at", "iso_date"],
    [["periodic_stock_adjustment", { ...STOCK, inventoryAccountCode: 1200 }], "adjustment.inventory_account_code", "text"],
    [["periodic_stock_adjustment", { ...STOCK, adjustmentCents: undefined }], "adjustment.adjustment_cents", "present"],
    [["periodic_stock_adjustment", { ...STOCK, adjustmentCents: 250000.5 }], "adjustment.adjustment_cents", "integer_cents"],
    // A STRING THAT LOOKS LIKE A NUMBER is refused rather than coerced — jsonb's `->>` would have
    // handed the database the text form and stored a figure nobody typed.
    [["periodic_stock_adjustment", { ...STOCK, openingCents: "400000" }], "adjustment.opening_cents", "integer_cents"],
    [["periodic_stock_adjustment", { ...STOCK, openingCents: -1 }], "adjustment.opening_cents", "nonnegative_integer_cents"],
    [["payroll_obligation", { ...PAYROLL, amountCents: -100 }], "adjustment.amount_cents", "nonnegative_integer_cents"],
    [["payroll_obligation", { ...PAYROLL, particularsSource: "" }], "adjustment.particulars_source", "present"],
    [["periodic_stock_adjustment", { ...STOCK, correctsAdjustmentId: "not-a-uuid" }], "adjustment.corrects_adjustment_id", "uuid"],
  ];
  for (const [[purpose, payload], field, reason] of cases) {
    const out = toDbAdjustment(purpose, payload);
    assert.equal(out.ok, false, `${field}/${reason} must be refused`);
    assert.equal(out.error.error, "invalid_basis");
    assert.equal(out.error.field, field);
    assert.equal(out.error.reason, reason);
  }
});

test("643.route: a SIGNED stock movement is admitted; only the counted figures are unsigned", () => {
  const fall = toDbAdjustment("periodic_stock_adjustment", {
    ...STOCK, method: "explicit_adjustment", openingCents: undefined, closingCents: undefined,
    adjustmentCents: -90000, countedAt: undefined, countReference: undefined,
  });
  assert.equal(fall.ok, true);
  assert.equal(fall.adjustment.adjustment_cents, -90000,
    "a count below opening is a real, negative movement — refusing it would make the form lie about what a count can say");
});

test("643.route: the purpose decides which keys are read at all", () => {
  // A stock field on a payroll payload is DROPPED rather than forwarded: the database's own
  // `_assert_adjustment_basis` reads only the keys its arm names, so forwarding it would put a
  // value in `adjustment_basis` that nothing ever validates.
  const out = toDbAdjustment("payroll_obligation", { ...PAYROLL, inventoryAccountCode: "1200" });
  assert.equal(out.ok, true);
  assert.equal("inventory_account_code" in out.adjustment, false);
});

test("643.route: CLR19 is mapped, so a locked period is a named 400 rather than a bare 500", () => {
  assert.equal(workErrorStatus("CLR19", "write_into_closed_period"), 400);
  assert.ok(WORK_MAPPED_CODES.includes("CLR19"));
});

// ==============================================================================================
// 2 · The MODEL's half — the module chatTurn v19 imports.
// ==============================================================================================

const stockInput = {
  purpose: "periodic_stock_adjustment",
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  method: "opening_closing_count",
  opening_cents: 400000,
  closing_cents: 650000,
  counted_at: "2026-12-31",
  count_reference: "STOCKTAKE-2026-12",
  inventory_account_code: "1200",
  cost_account_code: "5040",
  instruction: STOCK.instruction,
};

const payrollInput = {
  purpose: "payroll_obligation",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  obligation_kind: "epf",
  expense_account_code: "6010",
  liability_account_code: "2100",
  amount_cents: 130000,
  instruction: PAYROLL.instruction,
};

test("643.basis: the schema is a DISCRIMINATED UNION — a payroll obligation may not wear stock fields", () => {
  assert.equal(mod.startPeriodicAdjustmentWorkInputSchema.safeParse(stockInput).success, true);
  assert.equal(mod.startPeriodicAdjustmentWorkInputSchema.safeParse(payrollInput).success, true);
  assert.equal(
    mod.startPeriodicAdjustmentWorkInputSchema.safeParse({ ...payrollInput, inventory_account_code: "1200" }).success,
    false, "a flat schema would have let a model fill in whichever fields it recognised");
  assert.equal(
    mod.startPeriodicAdjustmentWorkInputSchema.safeParse({ ...stockInput, purpose: "journal_entry" }).success,
    false, "the journal purpose has its own tool and carries no particulars");
  assert.equal(
    mod.startPeriodicAdjustmentWorkInputSchema.safeParse({ ...stockInput, opening_cents: 400000.5 }).success,
    false, "cents are integers, never rounded");
});

test("643.basis: the movement is DERIVED from the count when the model leaves it out", () => {
  assert.equal(mod.stockMovementCents(stockInput), 250000);
  assert.equal(mod.stockMovementCents({ ...stockInput, adjustment_cents: 250000 }), 250000);
  assert.equal(mod.adjustmentFromInput(stockInput).adjustment_cents, 250000);
});

test("643.basis: the local refusals carry the DATABASE's own reason tokens and field paths", () => {
  const cases = [
    [{ ...stockInput, period_end: "2025-12-31" }, "invalid_adjustment", "adjustment.period_end"],
    [{ ...stockInput, cost_account_code: "1200" }, "invalid_adjustment", "adjustment.cost_account_code"],
    [{ ...stockInput, adjustment_cents: 250001 }, "invalid_adjustment", "adjustment.adjustment_cents"],
    [{ ...stockInput, counted_at: "2027-02-01" }, "stale_basis", "adjustment.counted_at"],
    [{ ...stockInput, closing_cents: 400000 }, "adjustment_all_zero", "adjustment.adjustment_cents"],
    [{ ...stockInput, method: "explicit_adjustment" }, "invalid_adjustment", "adjustment.opening_cents"],
    [{ ...payrollInput, amount_cents: 0 }, "adjustment_all_zero", "adjustment.amount_cents"],
    [{ ...payrollInput, liability_account_code: "6010" }, "invalid_adjustment", "adjustment.liability_account_code"],
    [{ ...payrollInput, settled_cents: 100 }, "invalid_adjustment", "adjustment.payment_account_code"],
    [{ ...payrollInput, payment_account_code: "1150" }, "adjustment_lines_mismatch", "adjustment.payment_account_code"],
    [{ ...payrollInput, payment_account_code: "1150", settled_cents: 200000 }, "invalid_adjustment", "adjustment.settled_cents"],
  ];
  for (const [input, reason, field] of cases) {
    const out = mod.localAdjustmentRefusal(input);
    assert.ok(out, `${reason}/${field} must be refused locally`);
    assert.equal(out.reason, reason);
    assert.equal(out.details.field, field);
    assert.ok(out.fix.length > 0, "a refusal a model can act on names the next move");
  }
  assert.equal(mod.localAdjustmentRefusal(stockInput), null, "the canonical stock input is clean");
  assert.equal(mod.localAdjustmentRefusal(payrollInput), null, "the canonical payroll input is clean");
});

test("643.basis: the journal lines a set of particulars implies, exact-cent and sign-correct", () => {
  const rise = mod.basisFromAdjustment(stockInput);
  assert.equal(rise.posting_date, "2026-12-31");
  assert.equal(rise.currency, "MYR");
  assert.deepEqual(rise.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["1200", 250000, 0], ["5040", 0, 250000]], "a RISE debits inventory and credits the cost account");

  const fall = mod.basisFromAdjustment({
    ...stockInput, method: "explicit_adjustment", opening_cents: undefined, closing_cents: undefined,
    adjustment_cents: -90000,
  });
  assert.deepEqual(fall.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["1200", 0, 90000], ["5040", 90000, 0]], "a FALL is its mirror");

  const accrued = mod.basisFromAdjustment(payrollInput);
  assert.deepEqual(accrued.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130000, 0], ["2100", 0, 130000]]);

  const settled = mod.basisFromAdjustment({
    ...payrollInput, payment_account_code: "1150", settled_cents: 30000,
  });
  assert.deepEqual(settled.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [["6010", 130000, 0], ["2100", 0, 100000], ["1150", 0, 30000]],
    "the liability takes the remainder — the split is the accountant's, not the module's");
  const debits = settled.lines.reduce((n, l) => n + l.debit_cents, 0);
  const credits = settled.lines.reduce((n, l) => n + l.credit_cents, 0);
  assert.equal(debits, credits, "every derived basis balances to the cent");
});

test("643.basis: a payroll obligation always carries a stated source, and it is never invented", () => {
  const fromInstruction = mod.adjustmentFromInput(payrollInput);
  assert.equal(fromInstruction.particulars_source, payrollInput.instruction,
    "with nothing else supplied the human's own words are the source — never a fabricated citation");
  const fromCaller = mod.adjustmentFromInput(payrollInput, { particularsSource: "Told to Clara in conversation abc" });
  assert.equal(fromCaller.particulars_source, "Told to Clara in conversation abc");
});

// ==============================================================================================
// 3 · The two halves land on ONE shape.
// ==============================================================================================

test("643.parity: the browser's particulars and the model's land on the SAME database object", () => {
  const viaRoute = toDbAdjustment("periodic_stock_adjustment", STOCK);
  assert.equal(viaRoute.ok, true);
  const viaModel = mod.adjustmentFromInput(stockInput);
  assert.deepEqual(viaModel, viaRoute.adjustment,
    "one accounting claim, whether it was typed into the form or dictated to Clara — the digest "
    + "and the intent-payload comparison both read this object, so a divergence here would make "
    + "the same figures two different intents");

  const payrollRoute = toDbAdjustment("payroll_obligation", PAYROLL);
  const payrollModel = mod.adjustmentFromInput(payrollInput, { particularsSource: PAYROLL.particularsSource });
  assert.deepEqual(payrollModel, payrollRoute.adjustment);
});

test("643.parity: the derived basis passes the route's own basis translator", () => {
  // The lines the module derives must survive `toDbBasis` — the SAME door the browser's basis goes
  // through — or the chat lane would admit a basis the direct lane could not.
  const derived = mod.basisFromAdjustment(stockInput);
  const wire = {
    postingDate: derived.posting_date,
    memo: derived.memo,
    currency: "MYR",
    lines: derived.lines.map((l) => ({
      accountCode: l.account_code, debitCents: l.debit_cents, creditCents: l.credit_cents, description: l.description,
    })),
  };
  const out = toDbBasis(wire);
  assert.equal(out.ok, true, `the derived basis must translate cleanly: ${JSON.stringify(out.error ?? {})}`);
  assert.equal(out.basis.lines.length, 2);
});
