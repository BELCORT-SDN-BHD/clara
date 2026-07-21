// Wave A2 — the MyInvois UBL engine (lib/myinvois.mjs), PURE (no DB, no worker). Proves the
// two-extraction split: the identity pass emits supplier-attributing / buyer-non-attributing
// regions; the facts pass emits the §3.2 vocabulary with RAW monetary values (the DB owns
// cents/ties). Also pins the AB-3 naming boundary (review L5) + parser edge cases.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseXml,
  extractUblModel,
  parseUblIdentity,
  parseUblFacts,
  mapFactsFields,
  detectConsolidated,
  stripUblSignature,
  MYINVOIS_ENGINE_ID,
  MYINVOIS_NORMALIZATION_VERSION,
} from "../lib/myinvois.mjs";

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
    <cac:PartyIdentification><cbc:ID schemeID="BRN">202001234567</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>ROME PROPERTIES SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C9998887770</cbc:ID></cac:PartyIdentification>
    <cac:PartyIdentification><cbc:ID schemeID="BRN">201901111111</cbc:ID></cac:PartyIdentification>
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

const byPath = (fields) => Object.fromEntries(fields.map((f) => [f.field_path, f.value_raw]));

test("extractUblModel reads the parties, totals, type, and SST breakdown", () => {
  const m = extractUblModel(parseXml(SAMPLE));
  assert.equal(m.invoiceId, "INV-2025-001");
  assert.equal(m.issueDate, "2025-04-30");
  assert.equal(m.typeCode, "01");
  assert.equal(m.documentCurrency, "MYR");
  assert.equal(m.supplier.name, "ROME PROPERTIES SDN BHD");
  assert.equal(m.supplier.tin, "C1234567890");
  assert.equal(m.supplier.brn, "202001234567");
  assert.equal(m.buyer.name, "DARE TO DREAM REAL ESTATE SDN BHD");
  assert.equal(m.buyer.tin, "C9998887770");
  assert.equal(m.totals.taxExclusive.raw, "1000.00");
  assert.equal(m.totals.taxInclusive.raw, "1060.00");
  assert.equal(m.taxAmount.raw, "60.00"); // header total tax, NOT the nested subtotal
  assert.equal(m.taxBreakdown.length, 1);
  assert.deepEqual(m.taxBreakdown[0], { type: "02", rate: "6", taxable: "1000.00", amount: "60.00", exempt_reason: null });
});

test("identity pass: supplier attributes (%tin% + allowlisted), buyer identifiers NEVER match the patterns", () => {
  const { regions } = parseUblIdentity(SAMPLE, { engineId: MYINVOIS_ENGINE_ID, versionN: 1 });
  const paths = regions.map((r) => r.field_path);
  assert.deepEqual(
    paths.sort(),
    ["myinvois.buyer_id_primary", "myinvois.buyer_id_secondary", "myinvois.supplier_brn", "myinvois.supplier_tin"],
  );
  // The inversion guard (§3.1): the ONLY field_path matching the attribution patterns is
  // supplier_tin (allowlisted). No buyer field may match %tin%/%ssm%/%account%.
  const matches = (p) => /tin|ssm|account/.test(p);
  assert.ok(matches("myinvois.supplier_tin"), "supplier_tin deliberately matches %tin%");
  for (const p of paths.filter((p) => p.startsWith("myinvois.buyer_id"))) {
    assert.ok(!matches(p), `${p} must never match the attribution patterns`);
  }
  // Every identity region is the honest geometry-less marker.
  for (const r of regions) {
    assert.equal(r.locator_kind, "page_polygon");
    assert.deepEqual(r.locator, { page: 1, polygon: [] });
    assert.equal(r.monetary_cents, null);
  }
});

test("facts pass: full §3.2 vocabulary, RAW monetary values, supplier+buyer both emitted", () => {
  const res = parseUblFacts(SAMPLE, { engineId: MYINVOIS_ENGINE_ID, versionN: 1 });
  assert.equal(res.normalizationVersion, MYINVOIS_NORMALIZATION_VERSION);
  assert.equal(res.pagesUsed, 1);
  const f = byPath(res.fields);
  assert.equal(f["invoice.vendor_name"], "ROME PROPERTIES SDN BHD");
  assert.equal(f["invoice.vendor_registration"], "202001234567");
  assert.equal(f["invoice.customer_name"], "DARE TO DREAM REAL ESTATE SDN BHD");
  assert.equal(f["invoice.customer_registration"], "201901111111");
  assert.equal(f["invoice.customer_taxid"], "C9998887770");
  assert.equal(f["invoice.type_code"], "01");
  assert.equal(f["invoice.total"], "1060.00"); // RAW — the DB owns cents
  assert.equal(f["invoice.total_excl_tax"], "1000.00");
  assert.equal(f["invoice.tax_total"], "60.00");
  assert.deepEqual(JSON.parse(f["invoice.tax_breakdown"]), [
    { type: "02", rate: "6", taxable: "1000.00", amount: "60.00", exempt_reason: null },
  ]);
  // Corroborable standard invoice (type 01, MYR) — no ineligibility marker.
  assert.equal(res.envelope.corroboration_ineligible, undefined);
});

test("AB-3 boundary (permanent, review L5): NO facts-pass key matches %tin%/%ssm%/%account%", () => {
  const res = parseUblFacts(SAMPLE, {});
  for (const fld of res.fields) {
    assert.ok(!/tin|ssm|account/.test(fld.field_path), `facts key ${fld.field_path} must avoid the attribution patterns`);
  }
});

test("credit note (type 02) is corroboration-ineligible", () => {
  const res = parseUblFacts(SAMPLE.replace(">01<", ">02<"), {});
  assert.equal(res.envelope.corroboration_ineligible, "credit_note");
});

test("consolidated (General Public TIN) is detected and marked non-corroborable", () => {
  const consolidated = SAMPLE.replace("C9998887770", "EI00000000010");
  const m = extractUblModel(parseXml(consolidated));
  assert.equal(detectConsolidated(m), true);
  assert.equal(mapFactsFields(m).find((x) => x.field_path === "invoice.customer_taxid").value_raw, "EI00000000010");
  assert.equal(parseUblFacts(consolidated, {}).envelope.corroboration_ineligible, "consolidated");
});

test("mixed-currency amounts are refused (terminal parse error)", () => {
  const mixed = SAMPLE.replace('TaxInclusiveAmount currencyID="MYR"', 'TaxInclusiveAmount currencyID="USD"');
  assert.throws(() => parseUblFacts(mixed, {}), (err) => err.code === "bad_type");
});

test("DOCTYPE/ENTITY declarations are refused (defence-in-depth XXE guard)", () => {
  const xxe = `<!DOCTYPE x [<!ENTITY y "z">]>\n${SAMPLE}`;
  assert.throws(() => parseXml(xxe), (err) => err.code === "bad_type");
});

test("stripUblSignature removes the enveloped XAdES block before hashing", () => {
  const signed = SAMPLE.replace(
    "<cbc:ID>INV-2025-001</cbc:ID>",
    "<ext:UBLExtensions><ext:UBLExtension>SIG-BYTES</ext:UBLExtension></ext:UBLExtensions><cbc:ID>INV-2025-001</cbc:ID>",
  );
  const stripped = stripUblSignature(signed);
  assert.ok(!/SIG-BYTES/.test(stripped), "signature bytes are stripped");
  // The content hash is stable whether or not the signature block is present.
  assert.equal(parseUblFacts(signed, {}).rawSha256, parseUblFacts(SAMPLE, {}).rawSha256);
});
