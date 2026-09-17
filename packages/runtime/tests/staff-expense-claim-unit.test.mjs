// #638 — THE STAFF-EXPENSE-CLAIM DOOR'S WIRE CONTRACT AND THE CHAT LANE'S CLAIM MODULE, driven as
// pure functions.
//
// TWO SUBJECTS, ONE FILE, because they are two halves of ONE contract: `src/workRoutes.ts`'s
// `toDbClaim` is what the BROWSER's claim becomes, and `lib/staff-expense-claim-basis.ts` is what
// the MODEL's becomes. Migration 0221 re-validates both and is the authority; these are the
// earlier, more legible halves whose job is to name the field.
//
// WHAT EACH CELL PINS:
//   route.*   every field path this door emits is the DATABASE's key re-spelled camelCase under the
//             one `claim.` prefix — because `apps/web/lib/work/staff-expense-claim.ts`'s
//             `fieldForClaimPath` is ONE mapper written against that one vocabulary, and a second
//             spelling is a mapper that is right half the time (#634's lesson, restated).
//   basis.*   the module the shared successor will import: the discriminated union refuses a
//             reimbursement wearing advance fields, the derivations are exact-cent, and the local
//             refusals carry the database's own reason tokens.
//   parity.*  the two halves land on the SAME database shape for the same claim, so a preparer
//             typing a claim into the form and a human dictating it to Clara admit ONE accounting
//             claim and not two — and BOTH agree with `clara._claim_journal_basis`'s derivation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const { toDbClaim, workErrorStatus, workErrorResponse } = await import("../src/workRoutes.ts");

/** The route's `toWireField` is private, so it is driven through the ONE public consumer that
 *  calls it — `workErrorResponse`'s 400 body. Testing the exported surface rather than widening it
 *  keeps the shared file's API exactly where #634 left it. */
function wireFieldOf(dbPath) {
  const err = Object.assign(new Error("probe"), {
    code: "CLR10",
    detail: JSON.stringify({ reason: "invalid_claim", field: dbPath, constraint: "nonempty" }),
  });
  return workErrorResponse(err).body.field;
}
const mod = await import("../lib/staff-expense-claim-basis.ts");

/** The canonical wire claim: two itemised expense lines, reimbursed onto a non-control payable. */
const WIRE = () => ({
  claimant: {
    accountCode: "1190",
    personLabel: "Farah binti Idris",
    attestation: "Dedicated to Farah; she is not a director and this is not a related-party balance.",
    confirmDedicated: true,
    identifier: "EMP-0042",
  },
  sourceKind: "instruction",
  instruction: "Farah's March travel claim, two receipts attached to the email she sent.",
  incurredDate: "2026-03-04",
  postingDate: "2026-03-31",
  items: [
    {
      description: "KL–Penang return flight",
      expenseAccountCode: "6200",
      amountCents: 48000,
      suppliedTax: { stated_code: "SR", stated_cents: 2880 },
    },
    { description: "Client dinner", expenseAccountCode: "6210", amountCents: 12500 },
  ],
  settlement: "reimbursement",
  payableAccountCode: "2010",
});

/** The same claim in the MODEL's spelling (the module's zod shape is snake_case throughout). */
const TOOL = () => ({
  settlement: "reimbursement",
  claimant: {
    account_code: "1190",
    person_label: "Farah binti Idris",
    attestation: "Dedicated to Farah; she is not a director and this is not a related-party balance.",
    confirm_dedicated: true,
    identifier: "EMP-0042",
  },
  source_kind: "instruction",
  instruction: "Farah's March travel claim, two receipts attached to the email she sent.",
  incurred_date: "2026-03-04",
  posting_date: "2026-03-31",
  items: [
    {
      description: "KL–Penang return flight",
      expense_account_code: "6200",
      amount_cents: 48000,
      supplied_tax: { stated_code: "SR", stated_cents: 2880 },
    },
    { description: "Client dinner", expense_account_code: "6210", amount_cents: 12500 },
  ],
  payable_account_code: "2010",
});

// ===========================================================================================
// route.* — POST /api/work/staff-expense-claim's own translation
// ===========================================================================================

test("route.shape: a well-formed claim becomes the database's own field spelling, total DERIVED", () => {
  const out = toDbClaim(WIRE());
  assert.equal(out.ok, true);
  assert.deepEqual(out.claim.claimant, {
    account_code: "1190",
    person_label: "Farah binti Idris",
    attestation: "Dedicated to Farah; she is not a director and this is not a related-party balance.",
    identifier: "EMP-0042",
    confirm_dedicated: true,
  });
  assert.equal(out.claim.source_kind, "instruction");
  assert.equal(out.claim.incurred_date, "2026-03-04");
  assert.equal(out.claim.posting_date, "2026-03-31");
  assert.equal(out.claim.currency, "MYR");
  assert.equal(out.claim.settlement, "reimbursement");
  assert.equal(out.claim.payable_account_code, "2010");
  // THE TOTAL IS NOT A WIRE FIELD. The database refuses a claim whose items do not sum to it, so
  // there is exactly one honest value and the door derives it.
  assert.equal(out.claim.amount_cents, 60500);
  assert.equal(out.claim.items.length, 2);
  assert.equal(out.claim.items[0].expense_account_code, "6200");
  assert.deepEqual(out.claim.items[0].supplied_tax, { stated_code: "SR", stated_cents: 2880 },
    "supplied tax facts are carried VERBATIM — this beta has no vocabulary to validate them against");
  assert.equal(out.claim.items[1].amount_cents, 12500);
});

test("route.claimant: a claim that does not say who claimed is refused by the database's own token", () => {
  const wire = WIRE();
  delete wire.claimant.accountCode;
  const out = toDbClaim(wire);
  assert.equal(out.ok, false);
  assert.equal(out.error.field, "claim.claimant");
  assert.equal(out.error.reason, "claimant_missing");
});

test("route.dates: the two dates are different facts, and money cannot be booked before it was spent", () => {
  const missing = toDbClaim({ ...WIRE(), incurredDate: "" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.field, "claim.incurred_date");
  assert.equal(missing.error.reason, "incurred_date_missing");

  const backwards = toDbClaim({ ...WIRE(), incurredDate: "2026-04-30", postingDate: "2026-03-31" });
  assert.equal(backwards.ok, false);
  assert.equal(backwards.error.field, "claim.incurred_date");
  assert.equal(backwards.error.reason, "incurred_after_posting");

  const notADate = toDbClaim({ ...WIRE(), postingDate: "31/03/2026" });
  assert.equal(notADate.ok, false);
  assert.equal(notADate.error.field, "claim.posting_date");
  assert.equal(notADate.error.reason, "iso_date");
});

test("route.items: a pending item waits alone, carries no amount, and cannot be the WHOLE claim", () => {
  const wire = WIRE();
  wire.items = [
    { description: "KL–Penang return flight", expenseAccountCode: "6200", amountCents: 48000 },
    { description: "Taxi, receipt undated", pendingFact: "incurred_date" },
  ];
  const out = toDbClaim(wire);
  assert.equal(out.ok, true);
  assert.equal(out.claim.amount_cents, 48000, "the pending item contributes NOTHING to the total");
  assert.equal(out.claim.items[1].pending_fact, "incurred_date");
  assert.equal(out.claim.items[1].amount_cents, undefined);

  const withAmount = toDbClaim({
    ...WIRE(),
    items: [{ description: "Taxi", pendingFact: "incurred_date", amountCents: 900 }],
  });
  assert.equal(withAmount.ok, false);
  assert.equal(withAmount.error.field, "claim.items[1].amount_cents");
  assert.equal(withAmount.error.reason, "absent");

  const allPending = toDbClaim({
    ...WIRE(),
    items: [{ description: "Taxi", pendingFact: "incurred_date" }],
  });
  assert.equal(allPending.ok, false);
  assert.equal(allPending.error.field, "claim.items");
  assert.equal(allPending.error.reason, "claim_all_zero");
});

test("route.cents: an amount that is not a positive whole number of cents never reaches the database", () => {
  for (const [amount, reason] of [["48000", "integer_cents"], [480.5, "integer_cents"], [0, "positive_integer_cents"], [-1, "positive_integer_cents"]]) {
    const out = toDbClaim({
      ...WIRE(),
      items: [{ description: "Flight", expenseAccountCode: "6200", amountCents: amount }],
    });
    assert.equal(out.ok, false, `amountCents=${JSON.stringify(amount)} must be refused`);
    assert.equal(out.error.field, "claim.items[1].amount_cents");
    assert.equal(out.error.reason, reason);
  }
});

test("route.settlement: each settlement names its own leg, and the advance arm names WHICH advance", () => {
  const unknown = toDbClaim({ ...WIRE(), settlement: "netted_off" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.field, "claim.settlement");
  assert.equal(unknown.error.reason, "settlement");

  const noLeg = { ...WIRE(), settlement: "already_settled" };
  delete noLeg.payableAccountCode;
  const missingLeg = toDbClaim(noLeg);
  assert.equal(missingLeg.ok, false);
  assert.equal(missingLeg.error.field, "claim.payment_account_code");
  assert.equal(missingLeg.error.reason, "nonempty");

  const noAdvance = { ...WIRE(), settlement: "advance_application", advanceAccountCode: "1190" };
  delete noAdvance.payableAccountCode;
  const fifo = toDbClaim(noAdvance);
  assert.equal(fifo.ok, false, "no silent FIFO: a claim says which advance it discharges");
  assert.equal(fifo.error.field, "claim.advance_id");
  assert.equal(fifo.error.reason, "advance_allocation_mismatch");

  const advance = toDbClaim({
    ...noAdvance, advanceId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(advance.ok, true);
  assert.equal(advance.claim.advance_account_code, "1190");
  assert.equal(advance.claim.advance_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(advance.claim.payable_account_code, undefined,
    "the settlement decides which leg exists; a reimbursement key would be a second answer");
});

test("route.field: every path the database can raise re-spells onto a control, including the nested ones", () => {
  // The ONE mapper's vocabulary, both directions. A refusal raised by migration 0221 arrives in the
  // DATABASE's snake_case and must land on the control the browser rendered.
  for (const [db, wire] of [
    ["claim.incurred_date", "claim.incurredDate"],
    ["claim.amount_cents", "claim.amountCents"],
    ["claim.claimant.person_label", "claim.claimant.personLabel"],
    ["claim.claimant.confirm_dedicated", "claim.claimant.confirmDedicated"],
    ["claim.items[2].expense_account_code", "claim.items[2].expenseAccountCode"],
    ["claim.payable_account_code", "claim.payableAccountCode"],
    ["claim.advance_id", "claim.advanceId"],
    ["claim.corrects_claim_id", "claim.correctsClaimId"],
    // untouched vocabularies stay untouched
    ["posting_date", "posting_date"],
    ["adjustment.period_end", "adjustment.periodEnd"],
  ]) {
    assert.equal(wireFieldOf(db), wire, `${db} must re-spell to ${wire}`);
  }
});

test("route.fold: a database `invalid_claim` folds to its constraint, exactly as invalid_basis does", () => {
  const err = Object.assign(new Error("nope"), {
    code: "CLR10",
    detail: JSON.stringify({ reason: "invalid_claim", field: "claim.items[1].description", constraint: "nonempty" }),
  });
  const out = workErrorResponse(err);
  assert.equal(out.status, 400);
  assert.equal(out.body.error, "invalid_basis");
  assert.equal(out.body.field, "claim.items[1].description");
  assert.equal(out.body.reason, "nonempty", "one vocabulary, whichever half caught it");

  // A NAMED token rides back under its own name rather than folding to a bare constraint.
  const named = Object.assign(new Error("nope"), {
    code: "CLR10",
    detail: JSON.stringify({ reason: "payable_account_is_control", field: "claim.payable_account_code", account_code: "2000" }),
  });
  const out2 = workErrorResponse(named);
  assert.equal(out2.body.reason, "payable_account_is_control");
  assert.equal(out2.body.field, "claim.payableAccountCode");
  assert.equal(workErrorStatus("CLR10", "payable_account_is_control"), 400);
});

// ===========================================================================================
// basis.* — the module the shared successor imports
// ===========================================================================================

test("basis.schema: the discriminated union refuses a reimbursement wearing advance fields", () => {
  const ok = mod.startStaffExpenseClaimWorkInputSchema.safeParse(TOOL());
  assert.equal(ok.success, true, JSON.stringify(ok.error?.issues ?? null));

  const mixed = { ...TOOL(), advance_id: "11111111-1111-4111-8111-111111111111" };
  assert.equal(mod.startStaffExpenseClaimWorkInputSchema.safeParse(mixed).success, false,
    "a reimbursement carrying an advance id is not a shape the door may ever produce");

  const invented = { ...TOOL(), claimant: { ...TOOL().claimant, employee_id: "E-1" } };
  assert.equal(mod.startStaffExpenseClaimWorkInputSchema.safeParse(invented).success, false,
    ".strict(): an invented key is refused rather than silently dropped into a durable record");
});

test("basis.refusals: every local refusal carries the database's own reason token and field path", () => {
  const cases = [
    [{ claimant: {} }, "claimant_missing", "claim.claimant"],
    [{ claimant: { account_code: "1191" } }, "claimant_missing", "claim.claimant.person_label"],
    [{ claimant: { account_code: "1191", person_label: "New" } }, "claimant_missing", "claim.claimant.attestation"],
    [{ claimant: { account_code: "1191", person_label: "New", attestation: "dedicated" } },
      "claimant_missing", "claim.claimant.confirm_dedicated"],
    [{ incurred_date: "2026-04-30" }, "incurred_after_posting", "claim.incurred_date"],
    [{ items: [{ description: "Taxi", pending_fact: "incurred_date" }] }, "claim_all_zero", "claim.items"],
    [{ items: [{ description: "Flight", expense_account_code: "6200" }] }, "invalid_claim", "claim.items[1].amount_cents"],
    [{ items: [{ description: "Flight", amount_cents: 100 }] }, "invalid_claim", "claim.items[1].expense_account_code"],
    [{ payable_account_code: "6200" }, "invalid_claim", "claim.payable_account_code"],
  ];
  for (const [over, reason, field] of cases) {
    const refusal = mod.localClaimRefusal({ ...TOOL(), ...over });
    assert.ok(refusal, `${reason} must refuse (${field})`);
    assert.equal(refusal.reason, reason);
    assert.equal(refusal.details.field, field);
    assert.equal(refusal.code, "CLR10");
    assert.ok(refusal.fix.length > 0, "a refusal a model can act on names the next step");
  }
  assert.equal(mod.localClaimRefusal(TOOL()), null, "the canonical claim refuses nothing locally");
});

test("basis.claim: claimFromInput is the p_claim argument, with the total derived and tax carried", () => {
  const claim = mod.claimFromInput(TOOL());
  assert.equal(claim.amount_cents, 60500);
  assert.equal(claim.currency, "MYR");
  assert.equal(claim.settlement, "reimbursement");
  assert.equal(claim.payable_account_code, "2010");
  assert.deepEqual(claim.items[0].supplied_tax, { stated_code: "SR", stated_cents: 2880 });
  assert.equal(claim.claimant.confirm_dedicated, true);
});

test("basis.derivation: the journal a claim implies is item debits plus ONE settlement credit", () => {
  const basis = mod.basisFromClaim(TOOL());
  assert.equal(basis.posting_date, "2026-03-31");
  assert.equal(basis.currency, "MYR");
  assert.equal(basis.lines.length, 3);
  assert.deepEqual(basis.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]), [
    ["6200", 48000, 0],
    ["6210", 12500, 0],
    ["2010", 0, 60500],
  ]);

  // `already_settled` is NOT "no journal": the expense debits land against the payment account.
  const settled = { ...TOOL(), settlement: "already_settled", payment_account_code: "1150" };
  delete settled.payable_account_code;
  const settledBasis = mod.basisFromClaim(settled);
  assert.equal(settledBasis.lines.length, 3);
  assert.deepEqual(settledBasis.lines[2], {
    account_code: "1150", debit_cents: 0, credit_cents: 60500, description: "already_settled",
  });

  // A pending item posts no line at all.
  const waiting = {
    ...TOOL(),
    items: [
      { description: "Flight", expense_account_code: "6200", amount_cents: 48000 },
      { description: "Taxi", pending_fact: "incurred_date" },
    ],
  };
  assert.equal(mod.basisFromClaim(waiting).lines.length, 2);
  assert.equal(mod.claimTotalCents(waiting), 48000);
});

// ===========================================================================================
// parity.* — the two halves are one contract
// ===========================================================================================

test("parity: the browser's claim and the model's claim land on the SAME database shape", () => {
  const fromWire = toDbClaim(WIRE());
  assert.equal(fromWire.ok, true);
  const fromTool = mod.claimFromInput(TOOL());
  // The key ORDER differs (two independent builders); the CONTENT may not.
  assert.deepEqual(JSON.parse(JSON.stringify(fromWire.claim)), JSON.parse(JSON.stringify(fromTool)),
    "one accounting claim, whichever door the human came through");
});

test("parity: the successor contract carries NO WORK_ACCEPTED_PURPOSES widening", async () => {
  // THE ONE THING THE 2026-09-15 AMENDMENT MADE CHEAPER. A staff expense claim is admitted with
  // purpose `journal_entry`, which the frozen v19 parts vocabulary ALREADY names — so chatTurn_v20
  // wires this tool with no change to `WORK_ACCEPTED_PURPOSES_V19` and p6-1-parts-parity stays
  // green. Asserted against the frozen export itself rather than against prose.
  const parts = await import("../workflows/chatTurn.v19.parts.ts");
  assert.ok(parts.WORK_ACCEPTED_PURPOSES_V19.includes("journal_entry"),
    "a claim Work's purpose is journal_entry, and v19 already accepts it");
  assert.equal(parts.WORK_ACCEPTED_PURPOSES_V19.includes("staff_expense_claim"), false,
    "…and no claim purpose exists to widen it with — migration 0221 widened nothing");
  assert.equal(mod.START_STAFF_EXPENSE_CLAIM_WORK_TOOL, "start_staff_expense_claim_work");
});
