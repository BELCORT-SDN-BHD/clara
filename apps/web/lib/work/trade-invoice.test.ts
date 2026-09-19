// #655 — the trade invoice's rules, driven as pure functions. No React, no DOM, no fetch.
//
// WHAT THIS IS NOT. It is not the authority on whether a trade invoice may be admitted.
// `clara.admit_trade_invoice_work` re-validates every rule below at admission and
// `clara._record_journal_entry_core` re-validates the accounting ones AGAIN at commit, against the
// client's live chart, the live identity surface and the live fiscal calendar. This module exists so
// a preparer sees a mistake beside the field that holds it, and every cell here pins that the LOCAL
// answer and the DOOR'S answer are the same sentence — never two vocabularies for one refusal.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DUE_DATE_SOURCES,
  REFERENCE_MAX_CHARS,
  TRADE_INVOICE_KINDS,
  controlAccountClassFor,
  counterpartyKindFor,
  domainFor,
  emptyTradeInvoiceDraft,
  fieldForServerPath,
  firstInvalidTradeInvoiceField,
  parseTaxFacts,
  toTradeInvoiceWire,
  validateTradeInvoiceDraft,
  type TradeInvoiceDraft,
} from "./trade-invoice";

const PARTY = "11111111-2222-4333-8444-555555555555";
const CODES = new Set(["6300", "6310", "2000", "1200", "4100"]);

/** A clean supplier bill: Dr 1,000 expense / Dr 60 SST / Cr 1,060 payable, total RM 1,060.00. */
function bill(over: Partial<TradeInvoiceDraft> = {}): TradeInvoiceDraft {
  return {
    ...emptyTradeInvoiceDraft(),
    kind: "supplier_bill",
    counterpartyId: PARTY,
    counterpartyQuery: "Alpha Supplies",
    documentDate: "2026-03-04",
    dueDate: "2026-04-15",
    reference: "ALPHA-2026-0042",
    totalCents: 106000,
    taxFactsJson: '{"stated_code":"SR","stated_cents":6000}',
    postingDate: "2026-03-31",
    memo: "Alpha Supplies bill, office paper and SST",
    lines: [
      { account_code: "6300", debit_cents: 100000, credit_cents: 0, description: "office supplies" },
      { account_code: "6310", debit_cents: 6000, credit_cents: 0, description: "SST on purchases" },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "payable" },
    ],
    ...over,
  };
}

test("the two kinds, their control class, their domain and their party kind are one mapping", () => {
  assert.deepEqual([...TRADE_INVOICE_KINDS], ["sales_invoice", "supplier_bill"]);
  assert.equal(controlAccountClassFor("supplier_bill"), "payable");
  assert.equal(controlAccountClassFor("sales_invoice"), "receivable");
  assert.equal(domainFor("supplier_bill"), "ap");
  assert.equal(domainFor("sales_invoice"), "ar");
  assert.equal(counterpartyKindFor("supplier_bill"), "vendor");
  assert.equal(counterpartyKindFor("sales_invoice"), "customer");
  // The three-valued basis the DATABASE owns. The browser may only ever assert two of them.
  assert.deepEqual([...DUE_DATE_SOURCES], ["stated", "counterparty_terms", "absent"]);
});

test("a clean bill has no issues and produces the wire the route takes", () => {
  assert.deepEqual(validateTradeInvoiceDraft(bill(), CODES), []);
  const wire = toTradeInvoiceWire(bill(), CODES);
  assert.ok(wire);
  assert.equal(wire.kind, "supplier_bill");
  assert.deepEqual(wire.invoice.counterparty, { id: PARTY });
  assert.equal(wire.invoice.documentDate, "2026-03-04");
  assert.equal(wire.invoice.dueDate, "2026-04-15");
  assert.equal(wire.invoice.dueDateSource, "stated");
  assert.equal(wire.invoice.reference, "ALPHA-2026-0042");
  assert.equal(wire.invoice.currency, "MYR");
  assert.equal(wire.invoice.totalCents, 106000);
  assert.deepEqual(wire.invoice.taxFacts, { stated_code: "SR", stated_cents: 6000 });
  assert.equal(wire.basis.lines.length, 3);
  const debit = wire.basis.lines.reduce((n, l) => n + l.debitCents, 0);
  const credit = wire.basis.lines.reduce((n, l) => n + l.creditCents, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 106000);
});

test("a BLANK due date is `absent`, and the browser NEVER asserts `counterparty_terms`", () => {
  const wire = toTradeInvoiceWire(bill({ dueDate: "" }), CODES);
  assert.ok(wire);
  assert.equal(wire.invoice.dueDate, null);
  assert.equal(wire.invoice.dueDateSource, "absent",
    "only the database holds clara.counterparties.payment_terms_days, so a browser claiming the terms basis would be inventing a fact");
  // …and there is no path through this module that produces the third value.
  for (const d of ["", "2026-04-15"]) {
    const w = toTradeInvoiceWire(bill({ dueDate: d }), CODES);
    assert.notEqual(w?.invoice.dueDateSource, "counterparty_terms");
  }
});

test("a due date before the document date is refused by the DOOR'S OWN token", () => {
  const issues = validateTradeInvoiceDraft(bill({ dueDate: "2026-03-01" }), CODES);
  assert.deepEqual(issues.map((i) => [i.field, i.code]), [["dueDate", "invalid_due_date"]],
    "the local code IS the door's reason, so one refusal has one sentence wherever it is caught");
  assert.equal(toTradeInvoiceWire(bill({ dueDate: "2026-03-01" }), CODES), null,
    "a wire body is never assembled from an invalid draft");
});

test("a zero, a negative and an unreachable total are all `invalid_total`", () => {
  for (const total of [0, -106000]) {
    const issues = validateTradeInvoiceDraft(bill({ totalCents: total }), CODES);
    assert.ok(issues.some((i) => i.field === "totalCents" && i.code === "invalid_total"),
      `totalCents ${total}`);
  }
  // A total LARGER than the whole entry cannot tie to any control leg. The EXACT tie needs the
  // chart to know which account is the control account, and that stays the door's answer.
  const big = validateTradeInvoiceDraft(bill({ totalCents: 200000 }), CODES);
  assert.ok(big.some((i) => i.field === "totalCents" && i.code === "invalid_total"));
  // A total SMALLER than the entry is NOT refused here: a bill whose total is one leg of a larger
  // entry is a shape only the chart can adjudicate.
  assert.deepEqual(
    validateTradeInvoiceDraft(bill({ totalCents: 100000 }), CODES).filter((i) => i.field === "totalCents"),
    [],
  );
});

test("the basis rules are the COMPOSER'S, not a second set", () => {
  const unbalanced = bill({
    lines: [
      { account_code: "6300", debit_cents: 100000, credit_cents: 0, description: "" },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "" },
    ],
  });
  const issues = validateTradeInvoiceDraft(unbalanced, CODES);
  assert.ok(issues.some((i) => i.field === "lines" && i.code === "unbalanced"),
    "the composer's own `unbalanced` code, not a private one");
  const unknown = bill({
    lines: [
      { account_code: "9999", debit_cents: 106000, credit_cents: 0, description: "" },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "" },
    ],
  });
  assert.ok(validateTradeInvoiceDraft(unknown, CODES).some((i) => i.code === "accountUnknown"));
  // A NULL chart (the read failed) must not manufacture an `accountUnknown` — the form does not
  // know what this client's chart holds, and saying so would be a guess.
  assert.equal(validateTradeInvoiceDraft(unknown, null).some((i) => i.code === "accountUnknown"), false);
});

test("a party that was never picked is `party_unresolved`, and it is the FIRST control focused", () => {
  const issues = validateTradeInvoiceDraft(bill({ counterpartyId: null }), CODES);
  assert.ok(issues.some((i) => i.field === "counterparty" && i.code === "party_unresolved"));
  assert.equal(firstInvalidTradeInvoiceField(issues), "counterparty");
  // Document order, not object-literal order: a draft missing BOTH the party and the total focuses
  // the party, because that is the control a reader reaches first.
  const both = validateTradeInvoiceDraft(bill({ counterpartyId: null, totalCents: 0 }), CODES);
  assert.equal(firstInvalidTradeInvoiceField(both), "counterparty");
  // …and a draft whose only fault is in the grid focuses the grid.
  const gridOnly = validateTradeInvoiceDraft(bill({
    lines: [
      { account_code: "", debit_cents: 106000, credit_cents: 0, description: "" },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "" },
    ],
  }), CODES);
  assert.equal(firstInvalidTradeInvoiceField(gridOnly), "line.0.account");
});

test("tax facts are carried, never validated — but they must be an OBJECT, as the column's CHECK says", () => {
  assert.deepEqual(parseTaxFacts(""), { ok: true, value: null });
  assert.deepEqual(parseTaxFacts('{"anything":{"nested":[1,2,3]}}'),
    { ok: true, value: { anything: { nested: [1, 2, 3] } } });
  assert.deepEqual(parseTaxFacts("[1,2,3]"), { ok: false });
  assert.deepEqual(parseTaxFacts('"SR"'), { ok: false });
  assert.deepEqual(parseTaxFacts("{not json"), { ok: false });
  assert.ok(validateTradeInvoiceDraft(bill({ taxFactsJson: "[1]" }), CODES)
    .some((i) => i.field === "taxFacts" && i.code === "taxFactsNotAnObject"));
  // An empty box is a real answer: a document that states no tax carries none.
  assert.deepEqual(validateTradeInvoiceDraft(bill({ taxFactsJson: "" }), CODES), []);
  assert.equal(toTradeInvoiceWire(bill({ taxFactsJson: "" }), CODES)?.invoice.taxFacts, null);
});

test("a too-long reference is refused rather than truncated", () => {
  const long = "R".repeat(REFERENCE_MAX_CHARS + 1);
  assert.ok(validateTradeInvoiceDraft(bill({ reference: long }), CODES)
    .some((i) => i.field === "reference" && i.code === "referenceTooLong"));
  // An EMPTY reference is lawful: not every document carries a number.
  assert.deepEqual(validateTradeInvoiceDraft(bill({ reference: "" }), CODES), []);
  assert.equal(toTradeInvoiceWire(bill({ reference: "  " }), CODES)?.invoice.reference, null);
});

test("ONE mapper, ONE vocabulary: every path the route emits lands on a control this form renders", () => {
  assert.equal(fieldForServerPath("kind"), "kind");
  assert.equal(fieldForServerPath("invoice.counterparty"), "counterparty");
  assert.equal(fieldForServerPath("invoice.counterparty.id"), "counterparty");
  assert.equal(fieldForServerPath("invoice.document_date"), "documentDate");
  assert.equal(fieldForServerPath("invoice.due_date"), "dueDate");
  assert.equal(fieldForServerPath("invoice.due_date_source"), "dueDate");
  assert.equal(fieldForServerPath("invoice.reference"), "reference");
  assert.equal(fieldForServerPath("invoice.total_cents"), "totalCents");
  assert.equal(fieldForServerPath("invoice.tax_facts"), "taxFacts");
  // The BASIS half goes through the composer's own mapper, so the 1-BASED line arithmetic has
  // exactly one definition in this app.
  assert.equal(fieldForServerPath("posting_date"), "postingDate");
  assert.equal(fieldForServerPath("memo"), "memo");
  assert.equal(fieldForServerPath("lines[1].account_code"), "line.0.account");
  assert.equal(fieldForServerPath("lines[3].credit_cents"), "line.2.credit");
  // An unrecognised path is NULL — a form-level message carrying the server's own reason, never a
  // guess at which control a future build added.
  assert.equal(fieldForServerPath("invoice.something_new"), null);
  assert.equal(fieldForServerPath(null), null);
  assert.equal(fieldForServerPath(""), null);
});
