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
  anchorsFromTypedFields,
} from "../lib/invoice-vendor-identity.mjs";
import { DASH_CHARS } from "../lib/invoice-amount-grammar.mjs";
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

/** The typed VendorName / CustomerName regions, measured on the vehicle. VendorName's CONTENT
 *  there is the OCR garbage (a two-line VendorName) — its GEOMETRY is what attribution
 *  uses, and it sits 0.015in from the letterhead against 1.33in to the customer block. */
const ANCHORS = Object.freeze({
  vendor: { page: 1, xmin: 1.645, xmax: 2.6207, ymin: 1.0569, ymax: 1.4968 },
  customer: { page: 1, xmin: 0.7176, xmax: 2.6083, ymin: 2.3748, ymax: 2.5232 },
});

test("the real letterhead is read, and the two-page repeat collapses to ONE emission", () => {
  const { fields, receipt } = readVendorIdentityFromLines([
    page([VENDOR_NAME, LETTERHEAD_P1, BUYER_NAME], 1),
    page([LETTERHEAD_P2], 2),
  ], ANCHORS);
  assert.equal(fields.length, 1, "the same registration printed twice is one fact");
  assert.equal(fields[0].field_path, "invoice.vendor_registration");
  assert.equal(fields[0].value_raw, "202401047756 (1593602-X)", "the label is stripped, the value stays verbatim");
  assert.equal(fields[0].page, 1);
  // The emission rides the letterhead line's own polygon — never fabricated.
  assert.deepEqual(fields[0].polygon, [2.7122, 0.886, 4.9757, 0.8825, 4.976, 1.0382, 2.7124, 1.0417]);
  assert.equal(fields[0].confidence, null, "Azure returns no confidence on lines[]");
  assert.equal(receipt.outcome, "matched");
  assert.equal(receipt.ambiguous, 0);
  // Page 2 prints the SAME letterhead, but Azure types VendorName on page 1 only — so the
  // page-2 candidate carries no attribution evidence and is refused rather than assumed.
  // Page 1 already carries the fact, so the document still reads.
  assert.equal(receipt.occurrences, 1);
  assert.equal(receipt.no_vendor_anchor, 1);
});

test("the emitted value normalizes to the registry key the resolver actually matches on", () => {
  // `_resolve_counterparty` compares lower(regexp_replace(reg,'[^a-zA-Z0-9]','','g')). This is
  // the whole point of the block: the registry row for this vendor is 2024010477561593602x.
  const { fields } = readVendorIdentityFromLines([page([LETTERHEAD_P1])], ANCHORS);
  assert.equal(registrationKey(fields[0].value_raw), "2024010477561593602x");
});

test("TWO DISTINCT registrations emit NOTHING — the buyer's must never become the vendor's", () => {
  // BOTH sit inside the vendor block — overlapping the vendor-name anchor in x as well as y —
  // so attribution passes both and UNIQUENESS is the wall that refuses. (Placed deliberately:
  // a second registration off to the right would be caught by the 2D anchor distance instead,
  // which is a different cell.)
  const buyerReg = line("Company No. 199801009999 (470001-A)", [1.7, 1.3, 3.5, 1.3, 3.5, 1.45, 1.7, 1.45]);
  const { fields, receipt } = readVendorIdentityFromLines([page([VENDOR_NAME, LETTERHEAD_P1, buyerReg])], ANCHORS);
  assert.equal(fields.length, 0, "no identity beats the wrong identity");
  assert.equal(receipt.outcome, "ambiguous");
  assert.equal(receipt.ambiguous, 1);
  assert.deepEqual(receipt.distinct_keys.sort(), ["199801009999470001a", "2024010477561593602x"]);
});

test("a registration below the top band is not a letterhead and is refused", () => {
  // The band is the second defense: a bill-to or footer registration sits down the page, and a
  // letterhead by convention does not. Measured at y≈0.88 of 11.68in — the default is 25%.
  const footer = line("Company No. 199801009999 (470001-A)", [0.7, 9.5, 2.9, 9.5, 2.9, 9.65, 0.7, 9.65]);
  const { fields, receipt } = readVendorIdentityFromLines([page([footer])], ANCHORS);
  assert.equal(fields.length, 0);
  assert.equal(receipt.below_band, 1);
  assert.equal(receipt.outcome, "absent");
  // It is an opt, so a document that genuinely prints its letterhead lower can be re-measured
  // rather than argued about.
  // Attribution is a SEPARATE wall and still applies, so this sub-case relaxes both opts:
  // the point being pinned is that the band is a threshold, not a hard-coded law.
  const relaxed = readVendorIdentityFromLines([page([footer])], { vendor: { page: 1, xmin: 0.7, xmax: 2.9, ymin: 9.3, ymax: 9.45 }, customer: null }, { topBandFraction: 0.95 });
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
  const { fields, receipt } = readVendorIdentityFromLines([page([sst], 1, { width: 13.3333, height: 17.7778 })], ANCHORS);
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
  const { fields, receipt } = readVendorIdentityFromLines([page([dated, priced, stub])], ANCHORS);
  assert.equal(fields.length, 0);
  // The ISO date and the dash stub reach the gate; the currency amount leads with `RM`, a word
  // carrying no digit, so the label-continuation guard stops it one step earlier. Two walls,
  // both counted — which is the point of counting them separately.
  assert.equal(receipt.rejected_gate, 2);
  assert.equal(receipt.label_continuation, 1);
  assert.equal(receipt.outcome, "absent");
});

test("a SPLIT-LINE registration is absent, not guessed at (v1 scope)", () => {
  // Unlike the totals block, a letterhead prints label and number on ONE line. A split shape is
  // out of scope rather than paired by geometry, so nothing is invented.
  const label = line("Company No.", [2.7, 0.88, 3.6, 0.88, 3.6, 1.03, 2.7, 1.03]);
  const value = line("202401047756 (1593602-X)", [3.8, 0.88, 5.5, 0.88, 5.5, 1.03, 3.8, 1.03]);
  const { fields, receipt } = readVendorIdentityFromLines([page([label, value])], ANCHORS);
  assert.equal(fields.length, 0);
  assert.equal(receipt.rejected_gate, 1, "the bare label's remainder is empty and the gate refuses it");
});

test("a line with no usable geometry can never anchor an identity", () => {
  assert.deepEqual(readVendorIdentityFromLines(null, ANCHORS).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([], ANCHORS).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([page([line("Company No. 202401047756", [])])], ANCHORS).fields, []);
  assert.deepEqual(readVendorIdentityFromLines([page([line("Company No. 202401047756", [1, 2, 3, 4])])], ANCHORS).fields, []);
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
/** Azure's typed VendorName, measured on the vehicle: garbage content, exact geometry. */
const TYPED_VENDOR_NAME = {
  content: "CONSULTANCY\nrightpath",
  boundingRegions: [{ pageNumber: 1, polygon: [1.645, 1.0569, 2.6207, 1.0569, 2.6207, 1.4968, 1.645, 1.4968] }],
  confidence: 0.922,
};
const payload = (typed, lines) => ({
  status: "succeeded",
  analyzeResult: {
    documents: [{ fields: { InvoiceTotal: TOTAL, VendorName: TYPED_VENDOR_NAME, ...typed } }],
    pages: [page(lines)],
  },
});
const regOf = (out) => out.fields.find((f) => f.field_path === "invoice.vendor_registration");

test("typed VendorTaxId ABSENT: the reader supplies the identity — the measured vehicle case", () => {
  const out = normalizeAzureInvoice(payload({}, [VENDOR_NAME, LETTERHEAD_P1]));
  assert.equal(regOf(out).value_raw, "202401047756 (1593602-X)");
  assert.equal(out.envelope.vendor_identity.emitted, 1);
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v10");
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v10");
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

// ======================================================================================
// The adversarial-review regressions (each cell reproduces a REFUSED finding)
// ======================================================================================

test("a SOLE BUYER registration is refused — uniqueness and the band both pass it", () => {
  // The executed wrong-party path: a compact invoice whose only registration sits in a
  // top-band bill-to block. One key, inside the band, gate-accepted — and resolved to the
  // WRONG counterparty. Only attribution to the vendor block refuses it.
  const buyerOnly = line("Company No. 199801009999 (470001-A)", [0.72, 2.55, 2.9, 2.55, 2.9, 2.7, 0.72, 2.7]);
  const { fields, receipt } = readVendorIdentityFromLines([page([buyerOnly])], ANCHORS);
  assert.equal(fields.length, 0, "no identity beats the wrong party");
  // 1.05in from the vendor name, so the gap wall catches it first. That ordering is the point
  // of the 0.5in default: it holds even when Azure fails to type CustomerName and there is no
  // customer anchor to be "closer to".
  assert.equal(receipt.vendor_anchor_far, 1);
  assert.equal(receipt.outcome, "absent");

  // With NO customer anchor at all — the shape that survives when CustomerName goes untyped —
  // the gap is the only wall left standing, and it still holds.
  const noCustomer = readVendorIdentityFromLines([page([buyerOnly])], { vendor: ANCHORS.vendor, customer: null });
  assert.equal(noCustomer.fields.length, 0);
  assert.equal(noCustomer.receipt.vendor_anchor_far, 1);
});

test("a candidate INSIDE the gap but nearer the customer block is still refused", () => {
  // Both attribution terms are load-bearing, and only this geometry exercises the second one:
  // 0.40in from the vendor name (inside the 0.5in gap) but 0.32in from the customer's.
  const between = line("Company No. 199801009999 (470001-A)", [0.72, 1.9, 2.9, 1.9, 2.9, 2.05, 0.72, 2.05]);
  const { fields, receipt } = readVendorIdentityFromLines([page([between])], ANCHORS);
  assert.equal(fields.length, 0);
  assert.equal(receipt.closer_to_customer, 1, "nearer the buyer means it is the buyer's");
  assert.equal(receipt.vendor_anchor_far, 0, "the gap alone would have let this through");
});

test("attribution FAILS CLOSED — no typed VendorName region means no evidence, so no emission", () => {
  const { fields, receipt } = readVendorIdentityFromLines([page([LETTERHEAD_P1])], { vendor: null, customer: null });
  assert.equal(fields.length, 0);
  assert.equal(receipt.no_vendor_anchor, 1);
  // And a vendor region on ANOTHER page is not evidence about this one.
  const otherPage = readVendorIdentityFromLines([page([LETTERHEAD_P1])], { vendor: { page: 2, xmin: 1.645, xmax: 2.6207, ymin: 1.05, ymax: 1.49 }, customer: null });
  assert.equal(otherPage.receipt.no_vendor_anchor, 1);
});

test("attribution uses VendorName's GEOMETRY, never its content", () => {
  // The insight the whole defense rests on: on the vehicle that typed field reads as OCR
  // garbage at confidence 0.922 while its region is exact.
  const anchors = anchorsFromTypedFields({
    VendorName: { content: "CONSULTANCY\nrightpath", boundingRegions: [{ pageNumber: 1, polygon: [1.645, 1.0569, 2.6207, 1.0569, 2.6207, 1.4968, 1.645, 1.4968] }] },
    CustomerName: { content: "ROME PROPERTIES SDN BHD", boundingRegions: [{ pageNumber: 1, polygon: [0.7176, 2.3748, 2.6083, 2.3748, 2.6083, 2.5232, 0.7176, 2.5232] }] },
  });
  assert.deepEqual(anchors.vendor, { page: 1, xmin: 1.645, xmax: 2.6207, ymin: 1.0569, ymax: 1.4968 });
  assert.deepEqual(anchors.customer, { page: 1, xmin: 0.7176, xmax: 2.6083, ymin: 2.3748, ymax: 2.5232 });
  const { fields } = readVendorIdentityFromLines([page([LETTERHEAD_P1])], anchors);
  assert.equal(fields[0].value_raw, "202401047756 (1593602-X)", "garbage content, sound geometry, correct read");
  // A typed field with no region yields no anchor at all.
  assert.equal(anchorsFromTypedFields({ VendorName: { content: "X" } }).vendor, null);
});

test("a CONTESTED document withdraws the typed row too", () => {
  // Reader finds two distinct registrations, Azure typed one of them. The typed value is not a
  // tie-break — it is one of the contested readings, and on this shape it is the wrong one.
  const second = line("Company No. 199801009999 (470001-A)", [2.7122, 1.3, 4.9757, 1.3, 4.976, 1.45, 2.7124, 1.45]);
  const out = normalizeAzureInvoice(
    payload({ VendorTaxId: { content: "199801009999 (470001-A)", confidence: 0.7 } }, [LETTERHEAD_P1, second]),
  );
  assert.equal(regOf(out), undefined, "a contested identity resolves nothing");
  assert.equal(out.envelope.vendor_identity.outcome, "ambiguous");
  assert.equal(out.envelope.vendor_identity.typed_vs_ambiguous, 1);
  // The rest of the extraction is untouched.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00");
});

test("a reader refusal that is NOT a contest leaves the typed row standing (v6 behaviour)", () => {
  // `absent` / `rejected_gate` / the attribution refusals are the reader having nothing to say.
  // Only a genuine contest carries the authority to withdraw Azure's typed identity.
  const out = normalizeAzureInvoice(
    payload({ VendorTaxId: { content: "201801000900", confidence: 0.88 } }, [line("Tel : 017-472 9637", [2.7, 0.88, 4.9, 0.88, 4.9, 1.03, 2.7, 1.03])]),
  );
  assert.equal(regOf(out).value_raw, "201801000900");
  assert.equal(out.envelope.vendor_identity.typed_vs_ambiguous, 0);
});

test("a page with no usable HEIGHT refuses its candidates — the band never becomes a no-op", () => {
  // bandLimit=null used to disable the wall silently, which readmitted a footer registration
  // anywhere on the page. A wall that vanishes when its input goes missing is not a wall.
  const footer = line("Company No. 199801009999 (470001-A)", [0.7, 9.5, 2.9, 9.5, 2.9, 9.65, 0.7, 9.65]);
  for (const bad of [{ height: undefined }, { height: 0 }, { height: Number.NaN }]) {
    const { fields, receipt } = readVendorIdentityFromLines(
      [{ pageNumber: 1, lines: [footer], unit: "inch", width: 8.2639, ...bad }],
      { vendor: { page: 1, xmin: 0.7, xmax: 2.9, ymin: 9.3, ymax: 9.45 }, customer: null },
    );
    assert.equal(fields.length, 0, `height=${bad.height} must refuse, not admit`);
    assert.equal(receipt.height_missing, 1);
  }
});

test("a tax-qualified LABEL CONTINUATION is not a registration", () => {
  // Prefix matching alone let the vocabulary's own exclusion be walked around: both of these
  // emitted an SST registration as the company registration.
  for (const text of [
    "Registration No. (SST): W10-2408-32000157",
    "No. Pendaftaran Cukai Perkhidmatan: W10-2408-32000157",
    "Company No. GST 001234567890",
    "Reg No (Tax) 12345678",
  ]) {
    const hit = splitRegistrationLabel(text);
    assert.equal(hit?.continuation, true, `${text} must be flagged as a continuation`);
    const l = line(text, [2.7122, 0.886, 4.9757, 0.8825, 4.976, 1.0382, 2.7124, 1.0417]);
    const { fields, receipt } = readVendorIdentityFromLines([page([l])], ANCHORS);
    assert.equal(fields.length, 0, `${text} must not emit`);
    assert.equal(receipt.label_continuation, 1);
  }
  // The genuine forms still read — a registration begins with its number.
  for (const [text, expected] of [["SSM No. 202401047756", "202401047756"], ["Co. Reg. No. 1593602-X", "1593602-X"], ["Company No. IG12345678900", "IG12345678900"]]) {
    const hit = splitRegistrationLabel(text);
    assert.equal(hit.continuation, false, text);
    assert.equal(hit.remainder, expected);
  }
});

test("a recognised label with unusable geometry is COUNTED, never silently dropped", () => {
  const { fields, receipt } = readVendorIdentityFromLines([page([line("Company No. 202401047756", [])])], ANCHORS);
  assert.equal(fields.length, 0);
  assert.equal(receipt.no_geometry, 1, "a readable document must not look like one that printed nothing");
  assert.deepEqual(receipt.candidates, [{ label: "company no", outcome: "no_geometry", page: 1 }]);
});

// ======================================================================================
// Round-three regressions: proximity is TWO-DIMENSIONAL, and thresholds are unit-normalized
// ======================================================================================

test("a registration far to the RIGHT is not adjacent, however well its y lines up", () => {
  // A vendor name on the left and a buyer registration on the right can share a horizontal
  // band exactly. Measuring y alone calls that adjacency — distance 0 — and emits the buyer's.
  const farX = line("Company No. 199801009999 (470001-A)", [5.4, 1.1, 7.6, 1.1, 7.6, 1.25, 5.4, 1.25]);
  const { fields, receipt } = readVendorIdentityFromLines([page([farX])], ANCHORS);
  assert.equal(fields.length, 0, "same band, three inches away, is not the vendor block");
  assert.equal(receipt.vendor_anchor_far, 1);
});

test("a remote registration cannot manufacture a false ambiguity that withdraws a correct row", () => {
  // The dual of the same defect, and the more expensive one: the buyer's registration became a
  // second "vendor" candidate, the document read as contested, and the CORRECT typed row was
  // withdrawn — forfeiting an identity the page stated plainly.
  const farX = line("Company No. 199801009999 (470001-A)", [5.4, 1.1, 7.6, 1.1, 7.6, 1.25, 5.4, 1.25]);
  const out = normalizeAzureInvoice(
    payload({ VendorTaxId: { content: "202401047756 (1593602-X)", confidence: 0.8 } }, [LETTERHEAD_P1, farX]),
  );
  assert.equal(regOf(out).value_raw, "202401047756 (1593602-X)", "the correct identity survives");
  assert.notEqual(out.envelope.vendor_identity.outcome, "ambiguous");
  assert.equal(out.envelope.vendor_identity.typed_vs_ambiguous, 0);
});

test("an equidistant candidate is refused — a tie decided by rounding is still a tie", () => {
  // Measured float dust on this exact geometry: 0.024201648132237796 vs 0.024201648132237852,
  // a difference of 5.6e-17 that a bare `<` resolved in the vendor's favour.
  const between = line("Company No. 199801009999 (470001-A)", [0.72, 2.0, 2.9, 2.0, 2.9, 2.15, 0.72, 2.15]);
  const anchors = {
    vendor: { page: 1, xmin: 0.72, xmax: 2.9, ymin: 1.5, ymax: 1.8 },
    customer: { page: 1, xmin: 0.72, xmax: 2.9, ymin: 2.35, ymax: 2.6 },
  };
  const { fields, receipt } = readVendorIdentityFromLines([page([between])], anchors);
  assert.equal(fields.length, 0);
  assert.equal(receipt.closer_to_customer, 1);
});

test("a PIXEL page reads exactly what the same geometry in inches reads", () => {
  // The X2 unit lesson, fired a second time: an inch threshold compared against raw pixels
  // makes a legitimate 2px gap look like a 2-inch one, refusing every candidate on a
  // photographed bill. The normalization is imported from the X2 reader, not rewritten.
  const scale = 1100 / 8.2639; // an A4 page rendered 1100px wide
  const px = (l) => line(l.content, l.polygon.map((n) => n * scale));
  const pixelAnchors = {
    vendor: { page: 1, xmin: 1.645 * scale, xmax: 2.6207 * scale, ymin: 1.0569 * scale, ymax: 1.4968 * scale },
    customer: null,
  };
  const inches = readVendorIdentityFromLines([page([LETTERHEAD_P1])], { vendor: ANCHORS.vendor, customer: null });
  const pixels = readVendorIdentityFromLines(
    [{ pageNumber: 1, lines: [px(LETTERHEAD_P1)], unit: "pixel", width: 1100, height: 11.6806 * scale }],
    pixelAnchors,
  );
  assert.equal(pixels.fields.length, 1, "same document, same reading, whichever unit the engine chose");
  assert.equal(pixels.fields[0].value_raw, inches.fields[0].value_raw);
  // Polygons stay in the page's OWN coordinates — scaling is internal to the comparison.
  assert.equal(pixels.fields[0].polygon[0], 2.7122 * scale);
});

test("a pixel page with no usable width is refused, not measured in the wrong unit", () => {
  const scale = 1100 / 8.2639;
  const { fields, receipt } = readVendorIdentityFromLines(
    [{ pageNumber: 1, lines: [line(LETTERHEAD_P1.content, LETTERHEAD_P1.polygon.map((n) => n * scale))], unit: "pixel", height: 11.6806 * scale }],
    ANCHORS,
  );
  assert.equal(fields.length, 0);
  assert.equal(receipt.unit_unresolved, 1);
});

test("the shared dash class is safe to interpolate into another character class", () => {
  // It is exported as a class BODY, so an unescaped leading `-` would become a RANGE operator
  // wherever it lands mid-class: `[#-<U+2010>]` spans every character from `#` to U+2010 and
  // swallows digits and letters whole. That is not hypothetical — it silently emptied every
  // registration remainder until the hyphen was escaped.
  const built = new RegExp(`^[ \t.:#${DASH_CHARS}]+`);
  assert.equal("202401047756".replace(built, ""), "202401047756", "digits must survive the class");
  assert.equal(". 202401047756".replace(built, ""), "202401047756");
  assert.equal("- 1234567-A".replace(built, ""), "1234567-A");
  assert.equal(splitRegistrationLabel("Company No. 202401047756 (1593602-X)").remainder, "202401047756 (1593602-X)");
});
