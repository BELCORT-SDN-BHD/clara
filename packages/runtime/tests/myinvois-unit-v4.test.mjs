// Wave A2 — MyInvois UBL parser boundary, FIX-7 v4 (codex-reverify4 item 7). Closes the two
// remaining type-boundary gaps: a MANDATORY element/amount that is present-but-EMPTY must be
// REFUSED (not coerced to a trusted NULL and skipped), and duplicated supplier/customer party
// elements must be REFUSED (exactly one of each) rather than silently first-selected. PURE
// (no DB, no worker). value_raw stays byte-exact — the DB owns cents.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXml, extractUblModel, parseUblFacts, parseUblIdentity } from "../lib/myinvois.mjs";

// A minimal well-formed MyInvois UBL invoice with every mandatory element present.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-2025-001</cbc:ID>
  <cbc:IssueDate>2025-04-30</cbc:IssueDate>
  <cbc:InvoiceTypeCode listVersionID="1.1">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>ROME PROPERTIES SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C9998887770</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>DARE TO DREAM REAL ESTATE SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">1000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>02</cbc:ID><cbc:Percent>6</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="MYR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">1060.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

const bad = (err) => err.code === "bad_type";

// ---------------------------------------------------------------------------
// FIX-7a — an EMPTY (blank / whitespace-only) mandatory element/amount is REFUSED, never
// coerced to a silently-trusted NULL fact. Both passes go through extractUblModel, so the
// document is refused for the facts pass AND the identity pass.
// ---------------------------------------------------------------------------

test("FIX-7a: an empty mandatory TaxInclusiveAmount is refused (not NULL-coerced)", () => {
  const empty = SAMPLE.replace(
    '<cbc:TaxInclusiveAmount currencyID="MYR">1060.00</cbc:TaxInclusiveAmount>',
    '<cbc:TaxInclusiveAmount currencyID="MYR"></cbc:TaxInclusiveAmount>',
  );
  assert.throws(() => parseUblFacts(empty), bad);
  assert.throws(() => parseUblIdentity(empty, {}), bad); // the identity pass refuses it too
});

test("FIX-7a: a whitespace-only mandatory PayableAmount is refused", () => {
  const blank = SAMPLE.replace(
    '<cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>',
    '<cbc:PayableAmount currencyID="MYR">   </cbc:PayableAmount>',
  );
  assert.throws(() => parseUblFacts(blank), bad);
});

test("FIX-7a: an empty mandatory TaxExclusiveAmount is refused", () => {
  const empty = SAMPLE.replace(
    '<cbc:TaxExclusiveAmount currencyID="MYR">1000.00</cbc:TaxExclusiveAmount>',
    '<cbc:TaxExclusiveAmount currencyID="MYR"></cbc:TaxExclusiveAmount>',
  );
  assert.throws(() => parseUblFacts(empty), bad);
});

test("FIX-7a: an empty header total TaxAmount is refused (the header one, not the subtotal)", () => {
  const empty = SAMPLE.replace(
    '<cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>\n    <cac:TaxSubtotal>',
    '<cbc:TaxAmount currencyID="MYR"></cbc:TaxAmount>\n    <cac:TaxSubtotal>',
  );
  assert.throws(() => parseUblFacts(empty), bad);
});

test("FIX-7a: an empty invoice ID (cbc:ID) is refused", () => {
  const empty = SAMPLE.replace("<cbc:ID>INV-2025-001</cbc:ID>", "<cbc:ID>   </cbc:ID>");
  assert.throws(() => parseUblFacts(empty), bad);
  assert.throws(() => parseUblIdentity(empty, {}), bad);
});

// ---------------------------------------------------------------------------
// FIX-7b — a genuine invoice has EXACTLY ONE supplier and ONE customer accounting party.
// A duplicated party element is REFUSED (was first-selected via child()/descend()).
// ---------------------------------------------------------------------------

test("FIX-7b: more than one AccountingSupplierParty is refused", () => {
  const twoSuppliers = SAMPLE.replace(
    "</cac:AccountingSupplierParty>",
    `</cac:AccountingSupplierParty>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C0000000000</cbc:ID></cac:PartyIdentification>
  </cac:Party></cac:AccountingSupplierParty>`,
  );
  assert.throws(() => parseUblFacts(twoSuppliers), bad);
  assert.throws(() => extractUblModel(parseXml(twoSuppliers)), bad);
});

test("FIX-7b: more than one AccountingCustomerParty is refused", () => {
  const twoCustomers = SAMPLE.replace(
    "</cac:AccountingCustomerParty>",
    `</cac:AccountingCustomerParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C0000000000</cbc:ID></cac:PartyIdentification>
  </cac:Party></cac:AccountingCustomerParty>`,
  );
  assert.throws(() => parseUblFacts(twoCustomers), bad);
});

test("FIX-7b: two cac:Party inside one supplier accounting party is refused", () => {
  const twoParties = SAMPLE.replace(
    "  </cac:Party></cac:AccountingSupplierParty>",
    `  </cac:Party>
  <cac:Party><cac:PartyIdentification><cbc:ID schemeID="TIN">C0000000000</cbc:ID></cac:PartyIdentification></cac:Party></cac:AccountingSupplierParty>`,
  );
  assert.throws(() => parseUblFacts(twoParties), bad);
});

// ---------------------------------------------------------------------------
// The happy path is unchanged: a legit single-party invoice with all mandatory amounts
// present still PARSES to the full model (value_raw byte-exact).
// ---------------------------------------------------------------------------

test("FIX-7 v4: a well-formed single-party invoice still parses (all mandatory amounts present)", () => {
  const m = extractUblModel(parseXml(SAMPLE));
  assert.equal(m.invoiceId, "INV-2025-001");
  assert.equal(m.totals.taxExclusive.raw, "1000.00");
  assert.equal(m.totals.taxInclusive.raw, "1060.00");
  assert.equal(m.totals.payable.raw, "1060.00");
  assert.equal(m.taxAmount.raw, "60.00");
  assert.equal(m.supplier.tin, "C1234567890");
  assert.equal(m.buyer.tin, "C9998887770");
  // optional amounts are legitimately absent → NULL, not a refusal
  assert.equal(m.totals.prepaid, null);
  assert.equal(m.totals.rounding, null);
  const f = Object.fromEntries(parseUblFacts(SAMPLE).fields.map((x) => [x.field_path, x.value_raw]));
  assert.equal(f["invoice.total"], "1060.00");
});
