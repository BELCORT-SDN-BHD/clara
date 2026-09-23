// #655 — THE TRADE-INVOICE DOOR'S WIRE CONTRACT AND THE CHAT LANE'S PARTICULARS MODULE, driven as
// pure functions.
//
// TWO SUBJECTS, ONE FILE, because they are two halves of ONE contract: `src/workRoutes.ts`'s
// `toDbTradeInvoice` is what the BROWSER's invoice becomes, and `lib/trade-invoice-basis.ts` is
// what the MODEL's becomes. Migration 0225 re-validates both and is the authority; these are the
// earlier, more legible halves whose job is to NAME THE FIELD.
//
// WHAT EACH CELL PINS:
//   route.*   every field path this door emits is the DATABASE's key re-spelled under the one
//             `invoice.` prefix, and every `reason` it emits is one the migration actually raises
//             — a second vocabulary is a mapper that is right half the time (#634's lesson).
//   basis.*   the module the successor will import: `.strict()` refuses an invented key, the local
//             refusals carry the database's own reason tokens, and `counterparty_terms` is refused
//             as a CALLER's claim because only the database holds the party's agreed terms.
//   parity.*  the two halves land on the SAME database shape for the same invoice, so a preparer
//             typing it into the form and a human dictating it to Clara admit ONE trade invoice
//             and not two.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const { toDbTradeInvoice, toAcknowledgedInvoiceIds } = await import("../src/workRoutes.ts");
const ti = await import("../lib/trade-invoice-basis.ts");

const PARTY = "11111111-2222-4333-8444-555555555555";
const DOC = "99999999-8888-4777-8666-555555555555";

const wire = (over = {}) => ({
  counterparty: { id: PARTY },
  documentDate: "2026-03-04",
  dueDate: "2026-04-03",
  dueDateSource: "stated",
  reference: "ALPHA-2026-0042",
  currency: "MYR",
  totalCents: 106000,
  taxFacts: { stated_code: "SR", stated_cents: 6000 },
  ...over,
});

const toolInput = (over = {}) => ({
  kind: "supplier_bill",
  counterparty: { id: PARTY },
  document_date: "2026-03-04",
  due_date: "2026-04-03",
  due_date_source: "stated",
  reference: "ALPHA-2026-0042",
  currency: "MYR",
  total_cents: 106000,
  tax_facts: { stated_code: "SR", stated_cents: 6000 },
  posting_date: "2026-03-31",
  memo: "Alpha Supplies bill, office paper and SST",
  lines: [
    { account_code: "6300", debit_cents: 100000, credit_cents: 0, description: "office supplies" },
    { account_code: "6310", debit_cents: 6000, credit_cents: 0, description: "SST on purchases" },
    { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "payable" },
  ],
  document_id: null,
  basis_origin: "user_direct",
  ...over,
});

// ===========================================================================================
// route.* — the browser's half.
// ===========================================================================================

test("route.translates camelCase in, the database's own snake_case out", () => {
  const out = toDbTradeInvoice(wire());
  assert.equal(out.ok, true);
  assert.deepEqual(out.invoice, {
    counterparty: { id: PARTY },
    document_date: "2026-03-04",
    due_date: "2026-04-03",
    reference: "ALPHA-2026-0042",
    currency: "MYR",
    total_cents: 106000,
    tax_facts: { stated_code: "SR", stated_cents: 6000 },
    due_date_source: "stated",
  });
});

test("route.party a named party translates to the identity keys 0215's surface is read by", () => {
  const out = toDbTradeInvoice(wire({
    counterparty: { name: "  Alpha Supplies Sdn Bhd  ", registrationNo: "200101000001", tin: "C1234" },
  }));
  assert.equal(out.ok, true);
  assert.deepEqual(out.invoice.counterparty,
    { name: "Alpha Supplies Sdn Bhd", registration_no: "200101000001", tin: "C1234" });
});

test("route.party a counterparty naming nothing at all is party_unresolved, never an invented one", () => {
  for (const cp of [undefined, null, {}, { name: "   " }, "nope"]) {
    const out = toDbTradeInvoice(wire({ counterparty: cp }));
    assert.equal(out.ok, false, `counterparty ${JSON.stringify(cp)} is refused`);
    assert.equal(out.error.reason, "party_unresolved");
    assert.ok(out.error.field.startsWith("invoice."), "…under the one invoice. prefix");
  }
});

test("route.total a non-integer, a zero and a negative total are all invalid_total, never rounded", () => {
  for (const v of [106000.5, 0, -106000, "106000", null, undefined]) {
    const out = toDbTradeInvoice(wire({ totalCents: v }));
    assert.equal(out.ok, false, `totalCents ${String(v)} is refused`);
    assert.equal(out.error.reason, "invalid_total");
    assert.equal(out.error.field, "invoice.total_cents");
  }
});

test("route.shape the wire half names the SAME four shape failures the door does -- never one token for all of them", () => {
  // F2 (fix round 1), the route's half. This function's own contract is "it refuses in the door's
  // own vocabulary, never in a private one" — so when the door stopped answering four different
  // failures with `invalid_kind`, this half had to stop too, or a browser CAN tell the two halves
  // of one validation apart, which is the exact thing the contract forbids.
  assert.equal(toDbTradeInvoice(null).error.reason, "invalid_particulars");
  assert.equal(toDbTradeInvoice("a bill").error.reason, "invalid_particulars");
  assert.equal(toDbTradeInvoice([]).error.reason, "invalid_particulars");
  const cur = toDbTradeInvoice(wire({ currency: "SGD" }));
  assert.equal(cur.error.reason, "invalid_currency");
  assert.equal(cur.error.field, "invoice.currency");
  const tax = toDbTradeInvoice(wire({ taxFacts: ["SR", 6000] }));
  assert.equal(tax.error.reason, "invalid_tax_facts");
  assert.equal(tax.error.field, "invoice.tax_facts");
  // The document number is a PARTICULARS-shape failure too: the door has no reference token, and
  // inventing one the database never raises would break the same contract from the other side.
  assert.equal(toDbTradeInvoice(wire({ reference: 42 })).error.reason, "invalid_particulars");
  assert.equal(toDbTradeInvoice(wire({ reference: "x".repeat(65) })).error.reason, "invalid_particulars");
  // AND THE KIND STILL MEANS THE KIND.
  for (const [, token] of Object.entries({ a: "invalid_particulars", b: "invalid_currency", c: "invalid_tax_facts" })) {
    assert.ok(ti.isTradeInvoiceRefusal(token), `${token} is in the door's raise ladder`);
  }
});

test("route.dates a due date before the document date, and a declaration that contradicts the payload, are invalid_due_date", () => {
  assert.equal(toDbTradeInvoice(wire({ dueDate: "2026-03-01" })).error.reason, "invalid_due_date");
  assert.equal(toDbTradeInvoice(wire({ documentDate: "04/03/2026" })).error.reason, "invalid_due_date");
  assert.equal(toDbTradeInvoice(wire({ dueDate: null, dueDateSource: "stated" })).error.reason,
    "invalid_due_date");
  assert.equal(toDbTradeInvoice(wire({ dueDateSource: "absent" })).error.reason, "invalid_due_date");
});

test("route.dates `counterparty_terms` is not a claim the caller may make -- the door derives it", () => {
  const out = toDbTradeInvoice(wire({ dueDate: null, dueDateSource: "counterparty_terms" }));
  assert.equal(out.ok, false,
    "only the database holds clara.counterparties.payment_terms_days, so a caller asserting the terms basis has invented a fact");
  assert.equal(out.error.reason, "invalid_due_date");
});

test("route.dates an ABSENT due date is lawful and leaves the basis for the door to derive", () => {
  const out = toDbTradeInvoice(wire({ dueDate: null, dueDateSource: undefined }));
  assert.equal(out.ok, true);
  assert.equal(out.invoice.due_date, null);
  assert.equal(Object.prototype.hasOwnProperty.call(out.invoice, "due_date_source"), false,
    "the wire says nothing, so the door's stated -> counterparty_terms -> absent derivation decides");
});

test("route.taxfacts are carried, never validated -- and an array is not an object", () => {
  const facts = { anything: { nested: [1, 2, 3] }, myinvois_type: "01" };
  assert.deepEqual(toDbTradeInvoice(wire({ taxFacts: facts })).invoice.tax_facts, facts);
  assert.equal(toDbTradeInvoice(wire({ taxFacts: null })).invoice.tax_facts, null);
  assert.equal(toDbTradeInvoice(wire({ taxFacts: [1] })).ok, false);
  assert.equal(toDbTradeInvoice(wire({ taxFacts: "SR" })).ok, false);
});

test("route.vocabulary every reason this translator emits is one the door's own ladder raises", () => {
  const emitted = new Set();
  for (const bad of [
    wire({ counterparty: {} }), wire({ totalCents: -1 }), wire({ dueDate: "2020-01-01" }),
    wire({ reference: "x".repeat(100) }), wire({ currency: "SGD" }), wire({ taxFacts: 7 }),
    "not-an-object",
  ]) {
    const out = toDbTradeInvoice(bad);
    assert.equal(out.ok, false);
    emitted.add(out.error.reason);
  }
  for (const reason of emitted) {
    assert.ok(ti.isTradeInvoiceRefusal(reason),
      `${reason} is in the door's raise ladder (0225 section B / TRADE_INVOICE_REFUSALS)`);
  }
});

// ===========================================================================================
// basis.* — the model's half.
// ===========================================================================================

test("basis.schema .strict() refuses an invented key rather than silently dropping it", () => {
  const ok = ti.startTradeInvoiceWorkInputSchema.safeParse(toolInput());
  assert.equal(ok.success, true, ok.success ? "" : JSON.stringify(ok.error.issues));
  const bad = ti.startTradeInvoiceWorkInputSchema.safeParse(
    toolInput({ line_items: [{ description: "paper", qty: 3 }] }));
  assert.equal(bad.success, false,
    "line items are #782's, not this lane's -- a model that invents them is refused by the schema");
});

test("basis.schema a credit-note kind is not in the enum at all", () => {
  assert.equal(ti.startTradeInvoiceWorkInputSchema.safeParse(
    toolInput({ kind: "sales_credit_note" })).success, false);
  assert.deepEqual([...ti.TRADE_INVOICE_KINDS], ["sales_invoice", "supplier_bill"]);
});

test("basis.schema a non-positive or fractional total is refused by the schema", () => {
  for (const v of [0, -1, 1060.5]) {
    assert.equal(ti.startTradeInvoiceWorkInputSchema.safeParse(toolInput({ total_cents: v })).success,
      false, `total_cents ${v}`);
  }
});

test("basis.local a MyInvois type-02 payload is credit_shape_not_admitted however it is labelled", () => {
  const r = ti.localTradeInvoiceRefusal(toolInput({ tax_facts: { type_code: "02" } }));
  assert.equal(r.reason, "credit_shape_not_admitted");
});

test("basis.local an unbalanced basis, a two-sided line and a zero entry are refused by name", () => {
  assert.equal(ti.localTradeInvoiceRefusal(toolInput({
    lines: [
      { account_code: "6300", debit_cents: 100000, credit_cents: 0, description: null },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: null },
    ],
  })).reason, "unbalanced_basis");
  assert.equal(ti.localTradeInvoiceRefusal(toolInput({
    lines: [
      { account_code: "6300", debit_cents: 100, credit_cents: 100, description: null },
      { account_code: "2000", debit_cents: 0, credit_cents: 0, description: null },
    ],
  })).reason, "unbalanced_basis");
});

test("basis.local a total larger than the whole entry cannot tie to any control leg", () => {
  assert.equal(ti.localTradeInvoiceRefusal(toolInput({ total_cents: 200000 })).reason, "invalid_total");
});

test("basis.local `counterparty_terms` from a caller is refused: only the database can derive it", () => {
  const r = ti.localTradeInvoiceRefusal(toolInput({ due_date: null, due_date_source: "counterparty_terms" }));
  assert.equal(r.reason, "invalid_due_date");
  assert.equal(r.detail.constraint, "derived_by_the_database");
});

test("basis.local a lawful invoice returns null -- which never means the door will admit it", () => {
  assert.equal(ti.localTradeInvoiceRefusal(toolInput()), null);
  assert.equal(ti.localTradeInvoiceRefusal(toolInput({ due_date: null, due_date_source: "absent" })), null);
});

test("basis.map the refusal map IS the door's raise ladder -- fourteen tokens plus the four the door measurably raises", () => {
  const names = Object.keys(ti.TRADE_INVOICE_REFUSALS).sort();
  assert.deepEqual(names, [
    "client_inactive", "control_leg_missing", "credit_shape_not_admitted", "insufficient_role",
    "intent_payload_conflict", "invalid_currency", "invalid_due_date", "invalid_intent_key",
    "invalid_kind", "invalid_particulars", "invalid_tax_facts", "invalid_total",
    "party_ambiguous", "party_unresolved", "period_locked",
    "source_already_posted", "unbalanced_basis", "wrong_control_domain",
  ]);
  assert.equal(names.length, 18,
    "DECISIONS.md:50 fixes the map at FOURTEEN; 0225's measured door raises four more -- the ladder binds, the number describes");
  for (const [, message] of Object.entries(ti.TRADE_INVOICE_REFUSALS)) {
    assert.ok(typeof message === "string" && message.length > 10, "every token carries a human message");
  }
  // ONE REASON, ONE THING (review finding F2). The three payload-shape tokens `invalid_kind` used
  // to answer for must each say what they are about, or the map is a lie with a green census.
  assert.match(ti.TRADE_INVOICE_REFUSALS.invalid_currency, /MYR|currency/i);
  assert.match(ti.TRADE_INVOICE_REFUSALS.invalid_tax_facts, /tax/i);
  assert.match(ti.TRADE_INVOICE_REFUSALS.invalid_particulars, /read|shape|object|particulars/i);
  for (const token of ["invalid_currency", "invalid_tax_facts", "invalid_particulars"]) {
    assert.notEqual(ti.TRADE_INVOICE_REFUSALS[token], ti.TRADE_INVOICE_REFUSALS.invalid_kind,
      `${token} may not render the sentence about sales invoices and supplier bills`);
  }
});

test("basis.display basisFromTradeInvoice states the accounting fact without naming a chart account", () => {
  const bill = ti.basisFromTradeInvoice(toolInput());
  assert.deepEqual(bill, {
    kind: "supplier_bill", domain: "ap", control_account_class: "payable", item_kind: "bill",
    total_cents: 106000, document_date: "2026-03-04", due_date: "2026-04-03", due_date_source: "stated",
  });
  const inv = ti.basisFromTradeInvoice(toolInput({ kind: "sales_invoice" }));
  assert.equal(inv.domain, "ar");
  assert.equal(inv.item_kind, "invoice");
  assert.equal(inv.control_account_class, "receivable");
  // IT NAMES NO ACCOUNT CODE. Which account is the control account is a fact about the client's
  // chart, and this module has no chart — the #638 footer rule, restated.
  assert.equal(JSON.stringify(bill).includes("2000"), false);
});

// ===========================================================================================
// parity.* — the two halves land on ONE database shape.
// ===========================================================================================

test("parity.particulars the browser's invoice and the model's produce the SAME p_particulars", () => {
  const fromRoute = toDbTradeInvoice(wire()).invoice;
  const fromTool = ti.tradeInvoiceFromInput(toolInput());
  // The route omits `due_date_source` when the wire says nothing; here the wire says `stated`, so
  // both halves carry it and every other key must match exactly.
  assert.deepEqual(fromTool, {
    counterparty: { id: PARTY },
    document_date: "2026-03-04",
    due_date: "2026-04-03",
    due_date_source: "stated",
    reference: "ALPHA-2026-0042",
    currency: "MYR",
    total_cents: 106000,
    tax_facts: { stated_code: "SR", stated_cents: 6000 },
  });
  for (const key of Object.keys(fromTool)) {
    assert.deepEqual(fromRoute[key], fromTool[key],
      `${key} is the same fact whichever door a person came through`);
  }
});

test("parity.basis the model's journal basis is the shape clara._assert_journal_basis reads", () => {
  const b = ti.journalBasisFromInput(toolInput());
  assert.equal(b.posting_date, "2026-03-31");
  assert.equal(b.currency, "MYR");
  assert.equal(b.lines.length, 3);
  const debit = b.lines.reduce((n, l) => n + l.debit_cents, 0);
  const credit = b.lines.reduce((n, l) => n + l.credit_cents, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 106000);
  for (const l of b.lines) {
    assert.deepEqual(Object.keys(l).sort(),
      ["account_code", "credit_cents", "debit_cents", "description"],
      "four fields only -- clara._validate_entry_lines drops every other key anyway");
  }
});

test("parity.document a cited document travels as a source ref, never inside the particulars", () => {
  const p = ti.tradeInvoiceFromInput(toolInput({ document_id: DOC }));
  assert.equal(JSON.stringify(p).includes(DOC), false,
    "the document is p_source_refs' business (clara._journal_source_document reads it there), which is what lets one predicate check every lane's evidence");
});

// ===========================================================================================
// 1007.route.* — the "recorded anyway" list on the way IN.
//
// The browser sends the earlier invoices the person was SHOWN, by their own ids, and the route
// keeps that choice BEFORE it admits. This helper is the shape guard: what it admits reaches
// clara.record_trade_invoice_duplicate_ack, which re-reads every id against THIS client's books
// and is the authority on whether the person could have been shown it.
// ===========================================================================================

test("1007.route: an ABSENT list is the ordinary recording -- nobody was warned, nothing is acknowledged", () => {
  for (const raw of [undefined, null, []]) {
    const out = toAcknowledgedInvoiceIds(raw);
    assert.equal(out.ok, true, `1007.route: ${JSON.stringify(raw) ?? "undefined"} is lawful`);
    assert.deepEqual(out.ids, [],
      "1007.route: …and yields NO ids, so the route writes no acknowledgement at all");
  }
});

test("1007.route: the ids ride through untouched, de-duplicated, and a repeat is not two acknowledgements", () => {
  const out = toAcknowledgedInvoiceIds([PARTY, DOC, PARTY]);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, [PARTY, DOC],
    "1007.route: the same invoice named twice on one screen is ONE thing the person was shown");
});

test("1007.route: a malformed list is refused BY NAME, on its own field, before any Work is admitted", () => {
  // ONE VOCABULARY WHICHEVER HALF CAUGHT IT (#634's lesson, restated by this file's header): the
  // token is the DATABASE's own `unknown_acknowledged_invoice`, and the path rides this lane's
  // `invoice.` namespace — which is also what keeps a trade-invoice path out of the JOURNAL
  // composer's refusal roster (apps/web/tests/journal-refusal-roster.test.ts reads every bare
  // `invalid("…")` literal in this file as a path THAT composer must map to a control).
  const notAList = toAcknowledgedInvoiceIds("65509aaa-6550-4655-8655-655065509aaa");
  assert.equal(notAList.ok, false);
  assert.deepEqual(notAList.error,
    { error: "invalid_basis", field: "invoice.acknowledge_duplicates", reason: "unknown_acknowledged_invoice" },
    "1007.route: a bare string is not a list of what somebody was shown");
  const notAnId = toAcknowledgedInvoiceIds([PARTY, "the first one"]);
  assert.equal(notAnId.ok, false);
  assert.deepEqual(notAnId.error,
    { error: "invalid_basis", field: "invoice.acknowledge_duplicates[2]", reason: "unknown_acknowledged_invoice" },
    "1007.route: …and the path is 1-BASED, like every other list path this door emits");
});
