// #638 — the claim form's own rules, as pure functions, plus the Work purpose vocabulary this
// ticket owns across four surfaces.
//
// WHAT EACH GROUP PINS:
//   validate.*  every rule is a MIRROR of one migration 0221 enforces, and it names the control
//               that holds it. The ORDER matters too: the form focuses `issues[0].field`, so "the
//               first invalid field" only means anything if the list is in DOM order.
//   derive.*    the journal a claim implies is exactly what `clara._claim_journal_basis` and
//               `packages/runtime/lib/staff-expense-claim-basis.ts` derive — three statements of
//               ONE contract, and the database refuses any disagreement.
//   wire.*      what crosses `POST /api/work/staff-expense-claim`, including what deliberately does
//               NOT (the total, which the door derives, and a pending item's amount, which does not
//               exist).
//   field.*     the ONE mapper from a server `field` path onto a control, in BOTH spellings the
//               wire can carry.
//   purpose.*   the four surfaces DECISIONS §1.7 gives this ticket: `purpose-label.ts`'s SUFFIX,
//               the Work list's label set, the Work list filter's option set, and
//               `messages/en.json`'s `WorkList.purposeLabels`. All four must name the SAME three
//               values the database's CHECK admits — and none of them may name a claim purpose,
//               because there is none.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  claimTotalCents,
  derivedLines,
  emptyClaimDraft,
  emptyClaimItem,
  fieldForClaimPath,
  firstInvalidClaimField,
  isPendingItem,
  settlementAccountCode,
  toClaimWire,
  validateClaimDraft,
  type ClaimDraft,
  type ClaimFieldId,
} from "./staff-expense-claim";
import { isKnownWorkPurpose } from "./purpose-label";
import messages from "../../messages/en.json";

const CHART = new Set(["6200", "6210", "2010", "2000", "1150", "1190", "1191"]);
const ENROLLED = new Set(["1190"]);

/** A clean reimbursement: two itemised lines, RM 605.00, credited to a non-control payable. */
function good(over: Partial<ClaimDraft> = {}): ClaimDraft {
  return {
    ...emptyClaimDraft(),
    claimantAccountCode: "1190",
    claimantIdentifier: "EMP-0042",
    incurredDate: "2026-03-04",
    postingDate: "2026-03-31",
    instruction: "Farah's March travel claim.",
    payableAccountCode: "2010",
    items: [
      { ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000 },
      { ...emptyClaimItem(), description: "Dinner", expenseAccountCode: "6210", amountCents: 12500 },
    ],
    ...over,
  };
}

// ===========================================================================================
// validate.*
// ===========================================================================================

test("validate.clean: the canonical claim raises nothing", () => {
  assert.deepEqual(validateClaimDraft(good(), CHART, ENROLLED), []);
});

test("validate.claimant: a NEW claimant is asked for the three things the register requires", () => {
  // `1191` carries no live enrolment, so recording this claim would ENROL it — and 0043's register
  // will not enrol without a name, a written attestation and an explicit dedication.
  const issues = validateClaimDraft(good({ claimantAccountCode: "1191" }), CHART, ENROLLED);
  assert.deepEqual(issues.map((i) => [i.field, i.code]), [
    ["claimantPersonLabel", "required"],
    ["claimantAttestation", "attestationRequired"],
    ["claimantConfirmDedicated", "confirmDedicatedRequired"],
  ]);

  // …and an EXISTING one is asked for none of them.
  assert.deepEqual(validateClaimDraft(good({ claimantAccountCode: "1190" }), CHART, ENROLLED), []);

  // AN UNREADABLE REGISTER ASKS ANYWAY — the conservative direction, stated in
  // `listStaffAdvanceEnrolments`' own note: the door ignores the extra answers when the enrolment
  // already exists, so asking costs a sentence and NOT asking costs a refused admission.
  assert.equal(validateClaimDraft(good(), CHART, null).length, 3);
});

test("validate.dates: two dates, and money cannot be booked before it was spent", () => {
  assert.deepEqual(
    validateClaimDraft(good({ incurredDate: "" }), CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["incurredDate", "required"]],
  );
  assert.deepEqual(
    validateClaimDraft(good({ postingDate: "2026-02-30" }), CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["postingDate", "invalidDate"]],
    "a date the calendar does not have is refused, never coerced",
  );
  assert.deepEqual(
    validateClaimDraft(good({ incurredDate: "2026-04-30" }), CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["incurredDate", "incurredAfterPosting"]],
  );
});

test("validate.items: a pending item waits alone, carries no amount, and cannot be the whole claim", () => {
  const waiting = good({
    items: [
      { ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000 },
      { ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date" },
    ],
  });
  assert.deepEqual(validateClaimDraft(waiting, CHART, ENROLLED), [],
    "an item that names the fact it lacks is a valid claim line, not an error");
  assert.equal(claimTotalCents(waiting), 48000, "…and contributes nothing to the total");
  assert.equal(isPendingItem(waiting.items[1]!), true);

  const withAmount = good({
    items: [{ ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date", amountCents: 900 }],
  });
  assert.deepEqual(
    validateClaimDraft(withAmount, CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["items.0.amountCents", "pendingItemHasAmount"], ["items", "everyItemPending"]],
  );

  const allWaiting = good({
    items: [{ ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date" }],
  });
  assert.deepEqual(
    validateClaimDraft(allWaiting, CHART, ENROLLED).map((i) => i.code),
    ["everyItemPending"],
  );
});

test("validate.items: a live item needs an account this client has and an exact positive amount", () => {
  const noAccount = good({
    items: [{ ...emptyClaimItem(), description: "Flight", amountCents: 100 }],
  });
  assert.deepEqual(
    validateClaimDraft(noAccount, CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["items.0.expenseAccountCode", "accountRequired"]],
  );
  const unknown = good({
    items: [{ ...emptyClaimItem(), description: "Flight", expenseAccountCode: "9999", amountCents: 100 }],
  });
  assert.deepEqual(
    validateClaimDraft(unknown, CHART, ENROLLED).map((i) => i.code), ["accountUnknown"]);
  const zero = good({
    items: [{ ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 0 }],
  });
  assert.deepEqual(validateClaimDraft(zero, CHART, ENROLLED).map((i) => i.code), ["amountRequired"]);

  // AN UNREADABLE CHART SKIPS THE UNKNOWN-ACCOUNT RULE rather than guessing: refusing every account
  // because a read failed would block a preparer over the UI's own problem, and the commit rechecks
  // each code against the live chart anyway.
  assert.deepEqual(validateClaimDraft(unknown, null, ENROLLED), []);
});

test("validate.settlement: each arm names its own leg, and the advance arm names WHICH advance", () => {
  const noLeg = good({ payableAccountCode: "" });
  assert.deepEqual(validateClaimDraft(noLeg, CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["payableAccountCode", "accountRequired"]]);

  const advance = good({ settlement: "advance_application", advanceAccountCode: "1190", payableAccountCode: "" });
  assert.deepEqual(validateClaimDraft(advance, CHART, ENROLLED).map((i) => [i.field, i.code]),
    [["advanceId", "advanceRequired"]], "no silent FIFO: the claim says which advance it discharges");
  assert.deepEqual(
    validateClaimDraft({ ...advance, advanceId: "11111111-1111-4111-8111-111111111111" }, CHART, ENROLLED),
    []);

  const settled = good({ settlement: "already_settled", paymentAccountCode: "1150", payableAccountCode: "" });
  assert.deepEqual(validateClaimDraft(settled, CHART, ENROLLED), []);

  // THE SETTLEMENT LEG MAY NOT REPEAT AN ITEM'S OWN ACCOUNT: an entry that debits and credits one
  // account for the same claim says nothing.
  const same = good({ payableAccountCode: "6200" });
  assert.deepEqual(validateClaimDraft(same, CHART, ENROLLED).map((i) => i.code), ["accountsMustDiffer"]);
});

test("validate.order: the issue list is in DOM order, so `issues[0]` is the FIRST invalid control", () => {
  const empty = emptyClaimDraft();
  const fields = validateClaimDraft(empty, CHART, ENROLLED).map((i) => i.field);
  assert.equal(firstInvalidClaimField(validateClaimDraft(empty, CHART, ENROLLED)), "claimantAccountCode");
  const order: ClaimFieldId[] = ["claimantAccountCode", "incurredDate", "postingDate",
    "items.0.description", "items.0.expenseAccountCode", "items.0.amountCents",
    "payableAccountCode", "instruction"];
  const seen = order.filter((f) => fields.includes(f));
  assert.deepEqual(seen, order.filter((f) => fields.includes(f)));
  assert.deepEqual(fields.filter((f) => order.includes(f)), seen,
    "no rule fires out of the order a human reads the form");
});

// ===========================================================================================
// derive.*
// ===========================================================================================

test("derive.lines: item debits plus ONE settlement credit, exact to the cent", () => {
  assert.deepEqual(derivedLines(good()).map((l) => [l.account_code, l.debit_cents, l.credit_cents]), [
    ["6200", 48000, 0],
    ["6210", 12500, 0],
    ["2010", 0, 60500],
  ]);
  // `already_settled` IS NOT "no journal": the expense debits land against the payment account.
  const settled = good({ settlement: "already_settled", paymentAccountCode: "1150", payableAccountCode: "" });
  assert.equal(settlementAccountCode(settled), "1150");
  assert.deepEqual(derivedLines(settled).at(-1)!, {
    account_code: "1150", debit_cents: 0, credit_cents: 60500, description: "already_settled",
  });
  // A PENDING ITEM POSTS NO LINE AT ALL.
  const waiting = good({
    items: [
      { ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000 },
      { ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date" },
    ],
  });
  assert.equal(derivedLines(waiting).length, 2);
});

// ===========================================================================================
// wire.*
// ===========================================================================================

test("wire.body: the claim crosses the wire and the TOTAL deliberately does not", () => {
  const wire = toClaimWire(good(), CHART, ENROLLED);
  assert.ok(wire);
  assert.deepEqual(wire.claimant, { accountCode: "1190", identifier: "EMP-0042" },
    "only the keys the preparer filled in; an existing enrolment needs no enrol answers");
  assert.equal(wire.settlement, "reimbursement");
  assert.equal(wire.payableAccountCode, "2010");
  assert.equal(wire.advanceAccountCode, undefined, "the settlement decides which leg is sent");
  assert.equal((wire as { amountCents?: unknown }).amountCents, undefined,
    "the DOOR derives the total from the items; a browser-supplied one could only ever disagree");
  assert.equal((wire as { lines?: unknown }).lines, undefined,
    "and the browser sends no lines at all — the door derives the journal");
  assert.deepEqual(wire.items, [
    { description: "Flight", expenseAccountCode: "6200", amountCents: 48000 },
    { description: "Dinner", expenseAccountCode: "6210", amountCents: 12500 },
  ]);
});

test("wire.tax: a supplied tax note is carried verbatim, and a pending item sends no amount", () => {
  const wire = toClaimWire(good({
    items: [
      { ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000,
        suppliedTaxNote: "SR 6% shown as RM28.80" },
      { ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date" },
    ],
  }), CHART, ENROLLED);
  assert.ok(wire);
  assert.deepEqual((wire.items as Array<Record<string, unknown>>)[0]!.suppliedTax,
    { note: "SR 6% shown as RM28.80" });
  assert.deepEqual((wire.items as Array<Record<string, unknown>>)[1]!,
    { description: "Taxi", pendingFact: "incurred_date" });
});

test("wire.invalid: an invalid draft assembles NO body at all", () => {
  assert.equal(toClaimWire(emptyClaimDraft(), CHART, ENROLLED), null);
});

// ===========================================================================================
// field.*
// ===========================================================================================

test("field.map: every server path the door can raise lands on a control, in BOTH spellings", () => {
  for (const [path, field] of [
    ["claim.incurred_date", "incurredDate"],
    ["claim.incurredDate", "incurredDate"],
    ["claim.posting_date", "postingDate"],
    // `amount_cents` has no control of its own — the door derives the total from the items, so a
    // refusal about it lands on the item block a preparer would actually change.
    ["claim.amount_cents", "items"],
    ["claim.claimant", "claimantAccountCode"],
    ["claim.claimant.person_label", "claimantPersonLabel"],
    ["claim.claimant.personLabel", "claimantPersonLabel"],
    ["claim.claimant.attestation", "claimantAttestation"],
    ["claim.claimant.confirm_dedicated", "claimantConfirmDedicated"],
    ["claim.payable_account_code", "payableAccountCode"],
    ["claim.advance_account_code", "advanceAccountCode"],
    ["claim.advance_id", "advanceId"],
    ["claim.payment_account_code", "paymentAccountCode"],
    ["claim.settlement", "settlement"],
    ["claim.items", "items"],
    // 1-BASED ON THE WIRE, 0-BASED IN THE DOM: SQL's `with ordinality` counts from one and the form
    // iterates a JavaScript array. The arithmetic happens in ONE place.
    ["claim.items[1].expense_account_code", "items.0.expenseAccountCode"],
    ["claim.items[3].amount_cents", "items.2.amountCents"],
    ["claim.items[2]", "items"],
    ["claim.items[2].pending_fact", "items.1.pendingFact"],
  ] as const) {
    assert.equal(fieldForClaimPath(path), field, `${path} must land on ${field}`);
  }
});

test("field.map: anything it cannot name answers null rather than focusing a near-miss", () => {
  for (const path of ["claim", "claim.invented_key", "claim.items[0].amount_cents", "posting_date",
    "adjustment.period_end", "sourceRefs[1]", null]) {
    assert.equal(fieldForClaimPath(path), null, `${String(path)} must not be claimed by this mapper`);
  }
});

// ===========================================================================================
// purpose.* — the four surfaces DECISIONS §1.7 gives this ticket
// ===========================================================================================

// #984 · RE-DERIVED ONCE, DELIBERATELY. This list was the three values 0194 admitted; migration
// 0239 widened `clara.accounting_work.purpose` to a FOURTH, `opening_balance`, so that approving an
// opening seed or an opening correction mints a real Work and a real operation receipt for the
// batch (the owner's ruling of 2026-09-20 on #984). The cell was not deleted and not skipped: the
// claim-lane arms below are untouched, and the point of the census is unchanged — every surface
// must name the SAME set as the column, whatever that set is.
const PURPOSES = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation",
  "opening_balance"] as const;

test("purpose.four: all four surfaces name the SAME four values the column admits", () => {
  // (1) `lib/work/purpose-label.ts`'s SUFFIX, through its own predicate.
  for (const p of PURPOSES) assert.equal(isKnownWorkPurpose(p), true, `${p} has a label`);
  assert.equal(isKnownWorkPurpose("staff_expense_claim"), false,
    "there is NO claim purpose — a claim is a journal_entry Work (migration 0221)");

  // (2) and (3): the Work list's label set and the filter's option set, read from their own source
  // rather than from a copy of it — a census that trusted a second list would prove nothing.
  const listSrc = readFileSync(new URL("../../components/work/accounting-work-list.tsx", import.meta.url), "utf8");
  const filterSrc = readFileSync(new URL("../../components/work/work-list-filters.tsx", import.meta.url), "utf8");
  for (const p of PURPOSES) {
    assert.ok(listSrc.includes(`"${p}"`), `accounting-work-list.tsx must know ${p}`);
    assert.ok(filterSrc.includes(`"${p}"`), `work-list-filters.tsx must know ${p}`);
  }
  assert.equal(listSrc.includes("staff_expense_claim"), false);
  assert.equal(filterSrc.includes("staff_expense_claim"), false);

  // (4) the message file.
  const labels = (messages as { WorkList: { purposeLabels: Record<string, string> } }).WorkList.purposeLabels;
  assert.deepEqual(Object.keys(labels).sort(), [...PURPOSES].sort());
});

test("purpose.claim: a claim Work is labelled from its ORIGIN, not from a purpose value", () => {
  // The copy that names it exists, and it takes the two facts `clara.get_work_claim_origin` answers
  // with. A build that had the read but no words for it would show a claim as a plain journal entry.
  const sec = (messages as { StaffExpenseClaim: { origin: Record<string, string> } }).StaffExpenseClaim.origin;
  assert.equal(typeof sec.label, "string");
  assert.ok(sec.value !== undefined, "the claim-origin sentence exists");
  assert.match(String(sec.value), /\{claimant\}/);
  assert.match(String(sec.value), /\{settlement\}/);
});
