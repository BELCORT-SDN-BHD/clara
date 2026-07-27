// X6 — the deterministic vendor-identity reader. Pure unit tests, no DB.
//
// The letterhead polygons below are COPIED from the real Azure capture of the Gate-P vehicle
// (api 2024-11-30, `unit: "inch"`, 8.2639 x 11.6806): the same `Company No.` line appears in
// the letterhead of BOTH pages at y≈0.88, and its digits normalize to the registry's
// `registration_normalized` exactly. That registration is already public in the diagnosis
// receipt under docs/plan/research/extraction-slice; the raw capture stays out of the repo.
//
// THE DANGEROUS DIRECTION HERE IS NOT A MISSING FACT — it is the BUYER'S registration filed as
// the vendor's, which resolves the counterparty to the wrong party and poisons every coding
// decision downstream. A missing registration merely leaves the lane where it already was. So
// the majority of these cells assert that nothing is emitted.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readVendorIdentityFromLines,
  splitRegistrationLabel,
  looksLikeRegistration,
  registrationKey,
} from "../lib/invoice-vendor-identity.mjs";
import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";

const line = (content, polygon) => ({ content, polygon });
const A4 = { width: 8.2639, height: 11.6806 };
const page = (lines, pageNumber = 1, extra = {}) => ({ pageNumber, lines, unit: "inch", ...A4, ...extra });

/** The measured letterhead line, page 1 and page 2 of the real vehicle. */
const LETTERHEAD_P1 = line("Company No. 202401047756 (1593602-X)", [2.7122, 0.886, 4.9757, 0.8825, 4.976, 1.0382, 2.7124, 1.0417]);
const LETTERHEAD_P2 = line("Company No. 202401047756 (1593602-X)", [2.7045, 0.8641, 4.9668, 0.8644, 4.9668, 1.0161, 2.7045, 1.0158]);
/** The vendor name line above it, and the buyer block lower down (measured y values). */
const VENDOR_NAME = line("BRIGHTPATH CONSULTANCY SDN. BHD.", [2.7156, 0.6562, 5.5, 0.6562, 5.5, 0.81, 2.7156, 0.81]);
const BUYER_NAME = line("ROME PROPERTIES SDN BHD", [0.7179, 2.3752, 2.9, 2.3752, 2.9, 2.52, 0.7179, 2.52]);

test("the real letterhead is read, and the two-page repeat collapses to ONE emission", () => {
  const { fields, receipt } = readVendorIdentityFromLines([
    page([VENDOR_NAME, LETTERHEAD_P1, BUYER_NAME], 1),
    page([LETTERHEAD_P2], 2),
  ]);
  assert.equal(fields.length, 1, "the same registration printed twice is one fact");
  assert.equal(fields[0].field_path, "invoice.vendor_registration");
  assert.equal(fields[0].value_raw, "202401047756 (1593602-X)", "the label is stripped, the value stays verbatim");
  assert.equal(fields[0].page, 1);
  // The emission rides the letterhead line's own polygon — never fabricated.
  assert.deepEqual(fields[0].polygon, [2.7122, 0.886, 4.9757, 0.8825, 4.976, 1.0382, 2.7124, 1.0417]);
  assert.equal(fields[0].confidence, null, "Azure returns no confidence on lines[]");
  assert.equal(receipt.outcome, "matched");
  assert.equal(receipt.occurrences, 2);
  assert.equal(receipt.ambiguous, 0);
});

test("the emitted value normalizes to the registry key the resolver actually matches on", () => {
  // `_resolve_counterparty` compares lower(regexp_replace(reg,'[^a-zA-Z0-9]','','g')). This is
  // the whole point of the block: the registry row for this vendor is 2024010477561593602x.
  const { fields } = readVendorIdentityFromLines([page([LETTERHEAD_P1])]);
  assert.equal(registrationKey(fields[0].value_raw), "2024010477561593602x");
});

test("TWO DISTINCT registrations emit NOTHING — the buyer's must never become the vendor's", () => {
  // A bill-to block that prints its own company number is the realistic shape of this hazard.
  // Placed inside the top band deliberately, so uniqueness is doing the work here, not the band.
  const buyerReg = line("Company No. 199801009999 (470001-A)", [5.4, 1.2, 7.6, 1.2, 7.6, 1.35, 5.4, 1.35]);
  const { fields, receipt } = readVendorIdentityFromLines([page([VENDOR_NAME, LETTERHEAD_P1, buyerReg])]);
  assert.equal(fields.length, 0, "no identity beats the wrong identity");
  assert.equal(receipt.outcome, "ambiguous");
  assert.equal(receipt.ambiguous, 1);
  assert.deepEqual(receipt.distinct_keys.sort(), ["199801009999470001a", "2024010477561593602x"]);
});

test("a registration below the top band is not a letterhead and is refused", () => {
  // The band is the second defense: a bill-to or footer registration sits down the page, and a
  // letterhead by convention does not. Measured at y≈0.88 of 11.68in — the default is 25%.
  const footer = line("Company No. 199801009999 (470001-A)", [0.7, 9.5, 2.9, 9.5, 2.9, 9.65, 0.7, 9.65]);
  const { fields, receipt } = readVendorIdentityFromLines([page([footer])]);
  assert.equal(fields.length, 0);
  assert.equal(receipt.below_band, 1);
  assert.equal(receipt.outcome, "absent");
  // It is an opt, so a document that genuinely prints its letterhead lower can be re-measured
  // rather than argued about.
  const relaxed = readVendorIdentityFromLines([page([footer])], { topBandFraction: 0.95 });
  assert.equal(relaxed.fields.length, 1);
});

test("an SST registration is NOT a company registration — one letter from `ssm no`", () => {
  // Measured on the real receipt: `SST Number : W10-2408-32000157` sits at y=3.16 of a 17.78in
  // page, INSIDE the top band, and looksLikeRegistration accepts that token quite happily.
  // Nothing but the vocabulary stops a tax registration being filed as a company registration.
  assert.equal(splitRegistrationLabel("SST Number : W10-2408-32000157"), null);
  assert.equal(splitRegistrationLabel("SST No. W10-2408-32000157"), null);
  assert.equal(looksLikeRegistration("W10-2408-32000157"), true, "the GATE would have taken it");
  const sst = line("SST Number : W10-2408-32000157", [5.2097, 3.4108, 8.7642, 3.1613, 8.7828, 3.4242, 5.2282, 3.6746]);
  const { fields, receipt } = readVendorIdentityFromLines([page([sst], 1, { width: 13.3333, height: 17.7778 })]);
  assert.equal(fields.length, 0, "the vocabulary is the only thing standing here, and it holds");
  assert.equal(receipt.outcome, "absent");
  // The genuine SSM form still reads.
  assert.equal(splitRegistrationLabel("SSM No. 202401047756").remainder, "202401047756");
});

test("the label vocabulary reads the printed variants, and only those", () => {
  for (const [text, expected] of [
    ["Company No. 202401047756", "202401047756"],
    ["COMPANY  NO : 202401047756", "202401047756"],
    ["Co. Reg. No. 1593602-X", "1593602-X"],
    ["Registration No: 202401047756", "202401047756"],
    ["Reg. No. 1593602-X", "1593602-X"],
    ["No. Syarikat 202401047756", "202401047756"],
    ["No. Pendaftaran 202401047756", "202401047756"],
    ["Company Registration No. 202401047756", "202401047756"],
  ]) {
    assert.equal(splitRegistrationLabel(text)?.remainder, expected, text);
  }
  for (const text of ["Invoice No. INV-001", "Our D/O No. : DO-9001", "Account No. 8011408205", "Tel : 017-472 9637"]) {
    assert.equal(splitRegistrationLabel(text), null, text);
  }
});

test("the accept gate refuses a remainder that is not a registration", () => {
  // Same gate the v3 typed emit uses — moved, not rewritten, so the two can never drift.
  const dated = line("Company No. 2025-10-14", [2.7, 0.88, 4.9, 0.88, 4.9, 1.03, 2.7, 1.03]);
  const priced = line("Company No. RM 5,000.00", [2.7, 1.2, 4.9, 1.2, 4.9, 1.35, 2.7, 1.35]);
  const stub = line("Company No. --", [2.7, 1.5, 4.9, 1.5, 4.9, 1.65, 2.7, 1.65]);
  const { fields, receipt } = readVendorIdentityFromLines([page([dated, priced, stub])]);
  assert.equal(fields.length, 0);
  assert.equal(receipt.rejected_gate, 3);
  assert.equal(receipt.outcome, "absent");
});

test("a SPLIT-LINE registration is absent, not guessed at (v1 scope)", () => {
  // Unlike the totals block, a letterhead prints label and number on ONE line. A split shape is
  // out of scope rather than paired by geometry, so nothing is invented.
  const label = line("Company No.", [2.7, 0.88, 3.6, 0.88, 3.6, 1.03, 2.7, 1.03]);
  const value = line("202401047756 (1593602-X)", [3.8, 0.88, 5.5, 0.88, 5.5, 1.03, 3.8, 1.03]);
  const { fields, receipt } = readVendorIdentityFromLines([page([label, value])]);
  assert.equal(fields.length, 0);
  assert.equal(receipt.rejected_gate, 1, "the bare label's remainder is empty and the gate refuses it");
});

test("a line with no usable geometry can never anchor an identity", () => {
  assert.deepEqual(readVendorIdentityFromLines(null).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([]).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([page([line("Company No. 202401047756", [])])]).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([page([line("Company No. 202401047756", [1, 2, 3, 4])])]).fields, []);
});

// ======================================================================================
// The mapper: reconciliation against Azure's typed VendorTaxId
// ======================================================================================

const TOTAL = {
  content: "435,560.00",
  valueCurrency: { amount: 435560, currencyCode: "MYR" },
  boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
  confidence: 0.9,
};
const payload = (typed, lines) => ({
  status: "succeeded",
  analyzeResult: {
    documents: [{ fields: { InvoiceTotal: TOTAL, ...typed } }],
    pages: [page(lines)],
  },
});
const regOf = (out) => out.fields.find((f) => f.field_path === "invoice.vendor_registration");

test("typed VendorTaxId ABSENT: the reader supplies the identity — the measured vehicle case", () => {
  const out = normalizeAzureInvoice(payload({}, [VENDOR_NAME, LETTERHEAD_P1]));
  assert.equal(regOf(out).value_raw, "202401047756 (1593602-X)");
  assert.equal(out.envelope.vendor_identity.emitted, 1);
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v7");
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v7");
});

test("typed and reader AGREEING collapse to one row, compared the DB's way", () => {
  // `invoice.vendor_registration` is in the DB's TEXT conflicting-duplicate set, compared on
  // the trimmed value — so two rows differing by a hyphen would forfeit the WHOLE extraction.
  // Comparison is therefore on the registration key, which is what resolution itself uses.
  const out = normalizeAzureInvoice(
    payload({ VendorTaxId: { content: "2024-01047756 1593602X", confidence: 0.7 } }, [LETTERHEAD_P1]),
  );
  const rows = out.fields.filter((f) => f.field_path === "invoice.vendor_registration");
  assert.equal(rows.length, 1, "never two rows for one field_path");
  assert.equal(rows[0].value_raw, "2024-01047756 1593602X", "the TYPED row survives, with Azure's own region");
  assert.equal(out.envelope.vendor_identity.typed_collapsed, 1);
  assert.equal(out.envelope.vendor_identity.typed_disagreement, 0);
});

test("typed and reader DISAGREEING emit NEITHER", () => {
  const out = normalizeAzureInvoice(
    payload({ VendorTaxId: { content: "199801009999", confidence: 0.7 } }, [LETTERHEAD_P1]),
  );
  assert.equal(regOf(out), undefined, "a contested identity resolves nothing on its own authority");
  assert.equal(out.envelope.vendor_identity.typed_disagreement, 1);
  // The rest of the extraction is untouched — one contested field never costs the document.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00");
});

test("a MULTI-DOCUMENT bundle runs no identity reader at all", () => {
  // Typed fields come from documents[0] while pages span the scan, so document B's letterhead
  // would be filed as document A's supplier — a wrong identity, the exact hazard.
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: TOTAL } }, { fields: { InvoiceTotal: TOTAL } }],
      pages: [page([], 1), page([LETTERHEAD_P1], 2)],
    },
  });
  assert.equal(regOf(out), undefined);
  assert.equal(out.envelope.vendor_identity.outcome, "multi_document");
  assert.equal(out.envelope.vendor_identity.emitted, 0);
});

test("a payload with NO pages[].lines[] is a pure widening of v6", () => {
  const legacy = {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: TOTAL,
        VendorTaxId: { content: "201801000900", boundingRegions: [{ pageNumber: 1, polygon: [0.2, 0.2, 0.3, 0.3] }], confidence: 0.88 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  };
  const out = normalizeAzureInvoice(legacy);
  assert.equal(regOf(out).value_raw, "201801000900", "the typed emit is untouched");
  assert.equal(regOf(out).confidence, 0.88);
  const receipt = out.envelope.vendor_identity;
  assert.equal(receipt.outcome, "absent");
  assert.equal(receipt.emitted, 0);
  assert.equal(receipt.typed_collapsed, 0);
  assert.deepEqual(receipt.candidates, []);
});
