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

// ---------------------------------------------------------------------------
// FIX-7 — the parser is a WELL-FORMEDNESS / NAMESPACE / SCHEMA boundary. A document that
// is not a well-formed, correctly-namespaced, approved MyInvois UBL invoice is REFUSED
// (terminal bad_type → the task fails cleanly / NEEDS YOU), NEVER converted to facts.
// ---------------------------------------------------------------------------

test("FIX-7: malformed XML (mismatched close tag) is refused before any facts", () => {
  const malformed = SAMPLE.replace("</cac:LegalMonetaryTotal>", "</cac:LegalMonetaryTotals>");
  assert.throws(() => parseUblFacts(malformed, {}), (err) => err.code === "bad_type");
  assert.throws(() => parseUblIdentity(malformed, {}), (err) => err.code === "bad_type");
});

test("FIX-7: unclosed root (non-empty stack at EOF) is refused", () => {
  const unclosed = SAMPLE.replace("</Invoice>", "");
  assert.throws(() => parseXml(unclosed), (err) => err.code === "bad_type");
});

test("FIX-7 (finding #5 attack): an attacker-namespaced document named Invoice/TaxTotal is refused", () => {
  const attacker = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:attacker">
  <InvoiceTypeCode listVersionID="1.1">01</InvoiceTypeCode>
  <ID>INV-EVIL</ID>
  <AccountingSupplierParty><Party>
    <PartyIdentification><ID schemeID="TIN">C1234567890</ID></PartyIdentification>
  </Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party>
    <PartyIdentification><ID schemeID="TIN">C9998887770</ID></PartyIdentification>
  </Party></AccountingCustomerParty>
  <TaxTotal><TaxAmount currencyID="MYR">60.00</TaxAmount></TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount currencyID="MYR">1000.00</TaxExclusiveAmount>
    <TaxInclusiveAmount currencyID="MYR">1060.00</TaxInclusiveAmount>
    <PayableAmount currencyID="MYR">1060.00</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>`;
  assert.throws(() => parseUblFacts(attacker, {}), (err) => err.code === "bad_type");
  assert.throws(() => parseUblIdentity(attacker, {}), (err) => err.code === "bad_type");
});

test("FIX-7 / RESIDUAL-5: the right prefix bound to the WRONG URI is refused (URI, not prefix, is the boundary)", () => {
  // `cbc` spelled correctly but bound to a hostile URI — the real cbc URI is now bound to
  // NO prefix, so the document is refused (namespace matched by URI, not by prefix spelling).
  const rebound = SAMPLE.replace(
    'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    'xmlns:cbc="urn:attacker"',
  );
  assert.throws(() => parseUblFacts(rebound, {}), (err) => err.code === "bad_type");
  assert.throws(() => extractUblModel(parseXml(rebound)), (err) => err.code === "bad_type");
});

test("FIX-7: a missing cbc namespace binding is refused (not a UBL document)", () => {
  const noCbc = SAMPLE.replace(
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    "",
  );
  assert.throws(() => extractUblModel(parseXml(noCbc)), (err) => err.code === "bad_type");
});

test("FIX-7: an unsupported MyInvois version (listVersionID) is refused", () => {
  const badVersion = SAMPLE.replace('listVersionID="1.1"', 'listVersionID="9.9"');
  assert.throws(() => parseUblFacts(badVersion, {}), (err) => err.code === "bad_type");
});

test("FIX-7: a document missing a mandatory total (TaxInclusiveAmount) is refused", () => {
  const missingTotal = SAMPLE.replace(/\s*<cbc:TaxInclusiveAmount[\s\S]*?<\/cbc:TaxInclusiveAmount>/, "");
  assert.throws(() => parseUblFacts(missingTotal, {}), (err) => err.code === "bad_type");
});

test("FIX-7: a well-formed MyInvois invoice still parses to the full vocabulary", () => {
  // The happy path is unchanged after hardening: the standard SAMPLE yields facts.
  const f = byPath(parseUblFacts(SAMPLE, {}).fields);
  assert.equal(f["invoice.invoice_id"], "INV-2025-001");
  assert.equal(f["invoice.total"], "1060.00");
  assert.equal(f["invoice.vendor_name"], "ROME PROPERTIES SDN BHD");
});

// ---------------------------------------------------------------------------
// FIX-8 — a CONSOLIDATED (B2C aggregate) document must NEVER auto-attribute a client:
// the identity pass emits NO attribution-bearing regions (it goes to NEEDS YOU).
// ---------------------------------------------------------------------------

test("FIX-8: a consolidated document's identity pass emits NO regions (no supplier attribution)", () => {
  const consolidated = SAMPLE.replace("C9998887770", "EI00000000010");
  const { regions, envelope } = parseUblIdentity(consolidated, { engineId: MYINVOIS_ENGINE_ID, versionN: 1 });
  assert.equal(regions.length, 0, "a consolidated aggregate must emit no identity regions");
  assert.equal(envelope.myinvois.consolidated, true);
  // Belt-and-braces: the real supplier TIN/BRN never leak into an attributing region.
  assert.ok(!regions.some((r) => r.field_path === "myinvois.supplier_tin" || r.field_path === "myinvois.supplier_brn"));
});

test("FIX-8: a consolidated document detected by classification 004 also emits no identity regions", () => {
  // Inject a consolidated line classification (004) into the otherwise-standard sample.
  const with004 = SAMPLE.replace(
    "</cac:LegalMonetaryTotal>",
    `</cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cac:Item><cac:CommodityClassification>
    <cbc:ItemClassificationCode listID="CLASS">004</cbc:ItemClassificationCode>
  </cac:CommodityClassification></cac:Item></cac:InvoiceLine>`,
  );
  const model = extractUblModel(parseXml(with004));
  assert.equal(detectConsolidated(model), true);
  assert.equal(parseUblIdentity(with004, {}).regions.length, 0);
  assert.equal(parseUblFacts(with004, {}).envelope.corroboration_ineligible, "consolidated");
});

// ---------------------------------------------------------------------------
// FIX-9 — the rounding fact (PayableRoundingAmount) is emitted RAW so the DB tie can
// enforce net + tax + rounding = gross.
// ---------------------------------------------------------------------------

test("FIX-9: invoice.rounding is emitted RAW when PayableRoundingAmount is present", () => {
  const rounded = SAMPLE.replace(
    '<cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>',
    '<cbc:PayableAmount currencyID="MYR">1060.03</cbc:PayableAmount>\n    <cbc:PayableRoundingAmount currencyID="MYR">0.03</cbc:PayableRoundingAmount>',
  );
  const f = byPath(parseUblFacts(rounded, {}).fields);
  assert.equal(f["invoice.rounding"], "0.03"); // RAW — the DB owns the sign/cents
});

test("FIX-9: a negative PayableRoundingAmount stays byte-exact (no number computed)", () => {
  const rounded = SAMPLE.replace(
    '<cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>',
    '<cbc:PayableAmount currencyID="MYR">1059.98</cbc:PayableAmount>\n    <cbc:PayableRoundingAmount currencyID="MYR">-0.02</cbc:PayableRoundingAmount>',
  );
  assert.equal(byPath(parseUblFacts(rounded, {}).fields)["invoice.rounding"], "-0.02");
});

test("FIX-9: no rounding fact is emitted when PayableRoundingAmount is absent", () => {
  assert.equal(byPath(parseUblFacts(SAMPLE, {}).fields)["invoice.rounding"], undefined);
  // invoice.rounding must not collide with the attribution patterns.
  assert.ok(!/tin|ssm|account/.test("invoice.rounding"));
});

// ---------------------------------------------------------------------------
// RESIDUAL-5 — XML namespace prefixes are ARBITRARY: the namespace boundary is matched by
// URI, not by the literal `cbc`/`cac` spelling. A legitimate UBL document that binds the
// correct URIs to different prefixes MUST parse; a document that uses the right prefixes
// bound to the WRONG URIs must still be refused.
// ---------------------------------------------------------------------------

// The SAMPLE rebound to the arbitrary (but namespace-equivalent) prefixes b:/a: — the
// declarations AND the element prefixes are renamed; the URIs are unchanged. A correct
// parser must resolve these by URI and accept the document.
const ARBITRARY_PREFIX = SAMPLE
  .replaceAll("xmlns:cbc", "xmlns:b")
  .replaceAll("xmlns:cac", "xmlns:a")
  .replaceAll("cbc:", "b:")
  .replaceAll("cac:", "a:");

test("RESIDUAL-5: a valid UBL doc with arbitrary prefixes (b:/a:) parses to the full vocabulary", () => {
  const m = extractUblModel(parseXml(ARBITRARY_PREFIX));
  assert.equal(m.invoiceId, "INV-2025-001");
  assert.equal(m.typeCode, "01");
  assert.equal(m.supplier.tin, "C1234567890");
  assert.equal(m.supplier.name, "ROME PROPERTIES SDN BHD");
  assert.equal(m.buyer.tin, "C9998887770");
  assert.equal(m.totals.taxInclusive.raw, "1060.00");
  assert.equal(m.taxAmount.raw, "60.00");
  const f = byPath(parseUblFacts(ARBITRARY_PREFIX, {}).fields);
  assert.equal(f["invoice.total"], "1060.00");
  assert.equal(f["invoice.vendor_name"], "ROME PROPERTIES SDN BHD");
});

test("RESIDUAL-5: the arbitrary-prefix doc still emits the identity regions (supplier attributes)", () => {
  const { regions } = parseUblIdentity(ARBITRARY_PREFIX, { engineId: MYINVOIS_ENGINE_ID, versionN: 1 });
  const paths = regions.map((r) => r.field_path).sort();
  assert.deepEqual(paths, [
    "myinvois.buyer_id_primary",
    "myinvois.buyer_id_secondary",
    "myinvois.supplier_brn",
    "myinvois.supplier_tin",
  ]);
});

test("RESIDUAL-5: an arbitrary-prefixed ROOT element (resolved by URI) parses", () => {
  const prefixedRoot = SAMPLE
    .replace(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      '<doc:Invoice xmlns:doc="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    )
    .replace("</Invoice>", "</doc:Invoice>");
  const m = extractUblModel(parseXml(prefixedRoot));
  assert.equal(m.documentLocal, "Invoice");
  assert.equal(m.invoiceId, "INV-2025-001");
});

test("RESIDUAL-5: a nested rebinding of a resolved prefix to a hostile URI is refused", () => {
  // cbc is bound correctly at the root, then rebound to a hostile URI on a nested element —
  // no hostile namespace may be smuggled under a trusted, already-resolved prefix.
  const nestedRebind = SAMPLE.replace(
    "<cac:LegalMonetaryTotal>",
    '<cac:LegalMonetaryTotal xmlns:cbc="urn:attacker">',
  );
  assert.throws(() => parseUblFacts(nestedRebind, {}), (err) => err.code === "bad_type");
});

// ---------------------------------------------------------------------------
// RESIDUAL-6 — the parser is a COMPLETE type boundary: exactly-one header TaxTotal, the
// document type is root-bound (no cross-root fallback) and drawn from the approved code
// set. A schema-invalid document is refused before any fact is emitted.
// ---------------------------------------------------------------------------

test("RESIDUAL-6a: more than one header TaxTotal is refused (no silent dedupe)", () => {
  const twoTaxTotals = SAMPLE.replace(
    "</cac:TaxTotal>",
    `</cac:TaxTotal>
  <cac:TaxTotal><cbc:TaxAmount currencyID="MYR">0.00</cbc:TaxAmount></cac:TaxTotal>`,
  );
  assert.throws(() => parseUblFacts(twoTaxTotals, {}), (err) => err.code === "bad_type");
});

test("RESIDUAL-6b: a CreditNote root carrying cbc:InvoiceTypeCode (no CreditNoteTypeCode) is refused", () => {
  const cnRootWithInvoiceType = SAMPLE
    .replace(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    )
    .replace("</Invoice>", "</CreditNote>");
  // The root is a CreditNote but the type element is still cbc:InvoiceTypeCode — the
  // cross-root fallback is gone, so the strict per-root type element is missing → refused.
  assert.throws(() => parseUblFacts(cnRootWithInvoiceType, {}), (err) => err.code === "bad_type");
});

test("RESIDUAL-6b: a CreditNote root whose code contradicts its polarity (01) is refused", () => {
  const cnRootBadCode = SAMPLE
    .replace(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    )
    .replace("</Invoice>", "</CreditNote>")
    .replace(
      '<cbc:InvoiceTypeCode listVersionID="1.1">01</cbc:InvoiceTypeCode>',
      '<cbc:CreditNoteTypeCode listVersionID="1.1">01</cbc:CreditNoteTypeCode>',
    );
  assert.throws(() => parseUblFacts(cnRootBadCode, {}), (err) => err.code === "bad_type");
});

test("RESIDUAL-6b: a well-formed CreditNote root with a credit-note code (02) parses", () => {
  const cnRootValid = SAMPLE
    .replace(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    )
    .replace("</Invoice>", "</CreditNote>")
    .replace(
      '<cbc:InvoiceTypeCode listVersionID="1.1">01</cbc:InvoiceTypeCode>',
      '<cbc:CreditNoteTypeCode listVersionID="1.1">02</cbc:CreditNoteTypeCode>',
    );
  const res = parseUblFacts(cnRootValid, {});
  assert.equal(byPath(res.fields)["invoice.type_code"], "02");
  assert.equal(res.envelope.corroboration_ineligible, "credit_note");
});

test("RESIDUAL-6c: an unknown InvoiceTypeCode (99) is refused (not from the approved set)", () => {
  const unknownType = SAMPLE.replace(">01<", ">99<");
  assert.throws(() => parseUblFacts(unknownType, {}), (err) => err.code === "bad_type");
});

// FIX-5 / FIX-6 (v3) — canonicalization keys STRICTLY by resolved URI (no decoy-prefix
// collision), single-cardinality survives same-URI aliasing, and mandatory monetary values
// are validated as well-formed decimals BEFORE any fact is emitted.
const CBC_URI = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC_URI = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
test("FIX-5: the decoy-prefix collision (real cbc bound to `b`, literal `cbc` bound to a hostile URI) is REFUSED", () => {
  // The attack: bind `b` to the REAL cbc URI as a decoy that satisfies URI discovery, bind the
  // literal prefix `cbc` to an ATTACKER URI, then smuggle hostile `cbc:*` elements spelled
  // exactly like the trusted canonical keys. A key named `cbc:X` must come ONLY from the real
  // cbc URI, and a literal trusted prefix bound to a non-matching URI is refused outright.
  const decoy = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:b="${CBC_URI}"
         xmlns:a="${CAC_URI}"
         xmlns:cbc="urn:attacker">
  <b:ID>INV-REAL</b:ID>
  <cbc:ID>INV-EVIL</cbc:ID>
  <b:InvoiceTypeCode listVersionID="1.1">01</b:InvoiceTypeCode>
  <a:AccountingSupplierParty><a:Party>
    <a:PartyIdentification><b:ID schemeID="TIN">C1234567890</b:ID></a:PartyIdentification>
  </a:Party></a:AccountingSupplierParty>
  <a:AccountingCustomerParty><a:Party>
    <a:PartyIdentification><b:ID schemeID="TIN">C9998887770</b:ID></a:PartyIdentification>
  </a:Party></a:AccountingCustomerParty>
  <a:TaxTotal><b:TaxAmount currencyID="MYR">60.00</b:TaxAmount></a:TaxTotal>
  <a:LegalMonetaryTotal>
    <b:TaxExclusiveAmount currencyID="MYR">1000.00</b:TaxExclusiveAmount>
    <b:TaxInclusiveAmount currencyID="MYR">1060.00</b:TaxInclusiveAmount>
    <b:PayableAmount currencyID="MYR">1060.00</b:PayableAmount>
  </a:LegalMonetaryTotal>
</Invoice>`;
  assert.throws(() => parseUblFacts(decoy, {}), (err) => err.code === "bad_type");
  assert.throws(() => extractUblModel(parseXml(decoy)), (err) => err.code === "bad_type");
});

test("FIX-5: a literal trusted prefix bound to a non-trusted URI is refused (root AND nested)", () => {
  // Reserved cbc/cac/ext, if declared at ANY depth, must be bound to their own URI.
  const cacWrong = SAMPLE.replace(`xmlns:cac="${CAC_URI}"`, 'xmlns:cac="urn:attacker"');
  const nested = SAMPLE.replace("<cac:TaxTotal>", '<cac:TaxTotal xmlns:cbc="urn:attacker">');
  assert.throws(() => parseUblFacts(cacWrong, {}), (err) => err.code === "bad_type");
  assert.throws(() => parseUblFacts(nested, {}), (err) => err.code === "bad_type");
});

test("FIX-6a: a header TaxTotal duplicated under TWO same-URI aliases is refused (requireSingle fires)", () => {
  // `cac` and `cac2` both resolve to the REAL cac URI; canonicalization arrays the same-URI
  // same-local siblings so requireSingle sees the duplicate instead of overwriting the first.
  const dupAlias = SAMPLE
    .replace(`xmlns:cbc="${CBC_URI}"`, `xmlns:cbc="${CBC_URI}"\n         xmlns:cac2="${CAC_URI}"`)
    .replace("</cac:TaxTotal>", `</cac:TaxTotal>\n  <cac2:TaxTotal><cbc:TaxAmount currencyID="MYR">0.00</cbc:TaxAmount></cac2:TaxTotal>`);
  assert.throws(() => parseUblFacts(dupAlias, {}), (err) => err.code === "bad_type");
});

test("FIX-6a: a legitimate multi-alias document (same URI, each local name once) still parses", () => {
  // Arraying must fire ONLY on genuine duplicates — a document using two prefixes for the same
  // URI without duplicating a singleton must still parse.
  const multiAlias = SAMPLE
    .replace(`xmlns:cbc="${CBC_URI}"`, `xmlns:cbc="${CBC_URI}"\n         xmlns:cac2="${CAC_URI}"`)
    .replace("<cac:LegalMonetaryTotal>", "<cac2:LegalMonetaryTotal>")
    .replace("</cac:LegalMonetaryTotal>", "</cac2:LegalMonetaryTotal>");
  const m = extractUblModel(parseXml(multiAlias));
  assert.equal(m.totals.taxInclusive.raw, "1060.00");
  assert.equal(m.totals.payable.raw, "1060.00");
});

test("FIX-6b: more than one header TaxAmount inside the TaxTotal is refused (was `child`, now requireSingle)", () => {
  const twoTaxAmounts = SAMPLE.replace(
    '<cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>\n    <cac:TaxSubtotal>',
    '<cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>\n    <cbc:TaxAmount currencyID="MYR">0.00</cbc:TaxAmount>\n    <cac:TaxSubtotal>',
  );
  assert.throws(() => parseUblFacts(twoTaxAmounts, {}), (err) => err.code === "bad_type");
});

test("FIX-6c: non-numeric mandatory monetary values (comma, free text, sci-notation) are refused", () => {
  const comma = SAMPLE.replace(">1060.00</cbc:PayableAmount>", ">1,060.00</cbc:PayableAmount>");
  const text = SAMPLE.replace(">1060.00</cbc:TaxInclusiveAmount>", ">N/A</cbc:TaxInclusiveAmount>");
  const sci = SAMPLE.replace(">1000.00</cbc:TaxableAmount>", ">1e3</cbc:TaxableAmount>"); // subtotal amounts validated too
  for (const bad of [comma, text, sci]) assert.throws(() => parseUblFacts(bad, {}), (err) => err.code === "bad_type");
});

test("FIX-6c: a well-formed value with a leading minus (negative rounding) stays byte-exact RAW", () => {
  const rounded = SAMPLE.replace(
    '<cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>',
    '<cbc:PayableAmount currencyID="MYR">1059.98</cbc:PayableAmount>\n    <cbc:PayableRoundingAmount currencyID="MYR">-0.02</cbc:PayableRoundingAmount>',
  );
  assert.equal(extractUblModel(parseXml(rounded)).totals.rounding.raw, "-0.02"); // not reformatted
});
