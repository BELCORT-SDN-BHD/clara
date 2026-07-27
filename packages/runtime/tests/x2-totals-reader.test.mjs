// X2 — the deterministic totals reader. PURE unit tests, no DB (the wave-b-prior-gl-cells
// style). Every polygon below is COPIED from a real Azure prebuilt-invoice capture
// (api 2024-11-30, `unit: "inch"`) of two documents in the live corpus: a 1-page F&B receipt
// (LAI LOU MEI, page angle -1.31 deg) and page 2 of a 2-page consultancy invoice (BRIGHTPATH,
// +0.21 deg). Only the geometry and the totals figures are reproduced — the figures already
// appear in the Wave-B receipts under docs/plan/research — and identifying detail
// (addresses, the real SST registration) is sanitized or dropped. The raw captures stay OUT
// of the repo; `scripts/measure-invoice-id-capture.mjs --totals` runs this same reader
// against them locally.
//
// THE DANGEROUS DIRECTION IS A WRONG FIGURE, not a missing one — a stated component feeds a
// posting-control identity that the DB checks to the sen. So most cells below assert that the
// reader emits NOTHING, and two of them pin the exact real-world geometry that would produce
// a wrong number if a pairing term were dropped.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { readTotalsFromLines, matchTotalsLabel, centsOfRaw } from "../lib/invoice-totals-reader.mjs";
import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";

const line = (content, polygon) => ({ content, polygon });
const onePage = (lines, pageNumber = 1) => [{ pageNumber, lines }];
const byPath = (fields) => Object.fromEntries(fields.map((f) => [f.field_path, f]));

// --- the real LAI LOU MEI totals block (measured) --------------------------------------
// Labels sit at x~4.3-4.7 and right-aligned amounts at x~9.2-9.4; the receipt's skew puts
// each amount's top-left y 0.07-0.11in ABOVE its own label's, which is why the window is on
// |delta| and why the row test is box overlap rather than a shared baseline.
const LAI_LOU_MEI = [
  line("SST Number : W10-2408-00000000", [5.2097, 3.4108, 8.7642, 3.1613, 8.7828, 3.4242, 5.2282, 3.6746]),
  line("INVOICE", [6.5144, 3.861, 7.3585, 3.7969, 7.3778, 4.0501, 6.5336, 4.1142]),
  line("11 SubTotal", [4.2849, 10.7628, 5.6325, 10.7236, 5.6405, 10.9989, 4.2929, 11.0381]),
  line("94.30", [9.2381, 10.6241, 9.891, 10.6134, 9.8953, 10.8778, 9.2424, 10.8884]),
  line("Service Charge@4%:", [4.6354, 11.0671, 6.8599, 10.9881, 6.8698, 11.2659, 4.6441, 11.3449]),
  line("3.77", [9.3868, 10.9297, 9.904, 10.921, 9.9084, 11.1856, 9.3913, 11.1943]),
  line("Service Tax@6%:", [4.6382, 11.37, 6.5022, 11.3085, 6.5112, 11.5818, 4.6472, 11.6433]),
  line("5.66", [9.4184, 11.2351, 9.9424, 11.2294, 9.9457, 11.4925, 9.4213, 11.4989]),
  line("Rounding Adj", [4.6405, 11.6722, 6.1412, 11.6311, 6.1488, 11.9098, 4.6481, 11.9503]),
  line("0.02", [9.4394, 11.544, 9.962, 11.5398, 9.964, 11.7938, 9.4414, 11.798]),
  line("Net Total", [4.6553, 11.9596, 6.8507, 11.8895, 6.8602, 12.1862, 4.6648, 12.2542]),
  line("103.75", [8.4781, 11.8575, 9.9649, 11.8374, 9.9693, 12.1113, 8.4824, 12.1327]),
  line("Tax Summary", [4.2865, 13.8624, 5.705, 13.8547, 5.7065, 14.1375, 4.288, 14.1452]),
  line("Taxable", [8.4077, 13.7859, 9.3394, 13.7695, 9.3444, 14.053, 8.4126, 14.0694]),
  line("Tax", [10.1108, 13.7509, 10.5315, 13.7499, 10.5322, 14.0162, 10.1114, 14.0172]),
  line("ervice Tax@6%", [4.3283, 14.1864, 6.097, 14.1581, 6.1016, 14.4482, 4.3329, 14.4689]),
  line("94.30", [8.5495, 14.1185, 9.2231, 14.1056, 9.2285, 14.3873, 8.5549, 14.3994]),
  line("5.66", [10.0044, 14.0753, 10.5366, 14.0694, 10.5404, 14.3455, 10.0082, 14.3528]),
];

// --- the real BRIGHTPATH totals block (measured, page 2) --------------------------------
// The face prints Rounding as "- 0.40" with the minus in its OWN narrow table column, and
// the Service Tax amount as a dash. OCR captured NEITHER glyph: no dash line, no dash word,
// and even the table cell for the tax comes back as "". So the fixture is faithful only if
// it omits them too.
const BRIGHTPATH = [
  line("Ringgit Malaysia : Four Hundred Thirty Five Thousand Five", [0.7148, 8.2393, 4.153, 8.2494, 4.1525, 8.3954, 0.7143, 8.3886]),
  line("Sub Total (Excluding Tax)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
  line("435,560.40", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
  line("Hundred Sixty Only", [0.6803, 8.4063, 1.8293, 8.415, 1.8282, 8.5595, 0.6792, 8.5508]),
  line("Rounding", [6.313, 8.4327, 6.8735, 8.4366, 6.8727, 8.561, 6.3122, 8.557]),
  line("0.40", [7.4649, 8.441, 7.6985, 8.4406, 7.6987, 8.5521, 7.465, 8.5525]),
  line("Service Tax (8%)", [5.8782, 8.5907, 6.8636, 8.5971, 6.8628, 8.726, 5.8774, 8.7196]),
  line("Total (Inclusive of Tax)", [5.545, 8.7832, 6.8652, 8.7905, 6.8644, 8.9228, 5.5443, 8.9155]),
  line("435,560.00", [7.1032, 8.7961, 7.6987, 8.7976, 7.6984, 8.918, 7.103, 8.9166]),
  line("Notes :", [0.6782, 8.958, 1.0629, 8.9619, 1.0617, 9.0808, 0.6771, 9.077]),
];

// ======================================================================================
// CELL 1 — the receipt geometry
// ======================================================================================

test("LAI LOU MEI: every stated component is read off its own line at the measured offsets", () => {
  const { fields, receipt } = readTotalsFromLines(onePage(LAI_LOU_MEI));
  const got = byPath(fields);

  assert.equal(got["invoice.total_excl_tax"].value_raw, "94.30", "'11 SubTotal' — the leading item count is stripped");
  assert.equal(got["invoice.service_charge"].value_raw, "3.77");
  assert.equal(got["invoice.tax_total"].value_raw, "5.66");
  assert.equal(got["invoice.rounding"].value_raw, "0.02");
  assert.equal(fields.length, 4, "four components printed, four emitted — nothing else");

  // Every emission rides the AMOUNT line's own polygon, never the label's and never invented.
  assert.deepEqual(got["invoice.tax_total"].polygon, [9.4184, 11.2351, 9.9424, 11.2294, 9.9457, 11.4925, 9.4213, 11.4989]);
  assert.equal(got["invoice.tax_total"].page, 1);
  // Measured: Azure returns no confidence on lines[]. Null is the honest value.
  assert.equal(got["invoice.tax_total"].confidence, null);

  assert.equal(receipt.sst_rate, 6, "the printed rate is captured as diagnostics, not as a region");
  assert.equal(receipt.matched, 4);
  assert.equal(receipt.ambiguous, 0);
  assert.equal(receipt.unparseable, 0);

  // The document's own identity holds to the sen on what was read — which is the whole point:
  // 94.30 + 3.77 + 5.66 + 0.02 = 103.75, the stated gross. (The DB owns this tie; asserting
  // it here only proves the reader picked the right four lines.)
  const sum = ["invoice.total_excl_tax", "invoice.service_charge", "invoice.tax_total", "invoice.rounding"]
    .reduce((acc, p) => acc + centsOfRaw(got[p].value_raw), 0);
  assert.equal(sum, centsOfRaw("103.75"));
});

test("LAI LOU MEI: 'Net Total' is the GROSS and must never be read as the net of tax", () => {
  const { fields } = readTotalsFromLines(onePage(LAI_LOU_MEI));
  for (const f of fields) {
    assert.notEqual(f.value_raw, "103.75", "103.75 is the tax-inclusive total; only invoice.total may carry it");
  }
  assert.equal(matchTotalsLabel("Net Total"), null, "'net total' is not in the vocabulary, deliberately");
});

test("an OCR fragment that lost its first letter matches NOTHING", () => {
  // Real noise: the receipt's Tax Summary block came back as "ervice Tax@6%". Exact-prefix
  // matching after the noise strip gives this for free — but it is the difference between
  // skipping a block and anchoring a tax figure to the wrong column, so it is pinned.
  assert.equal(matchTotalsLabel("ervice Tax@6%"), null);
  assert.equal(matchTotalsLabel("ubtotal"), null);
  assert.equal(matchTotalsLabel("ounding"), null);
  assert.equal(matchTotalsLabel("11 SubTotal").field_path, "invoice.total_excl_tax");
});

test("'SST Number : ...' is a registration, not a tax amount", () => {
  // Every SST-registered Malaysian vendor prints this line, and it prefix-matches `sst`.
  assert.equal(matchTotalsLabel("SST Number : W10-2408-00000000"), null);
  assert.equal(matchTotalsLabel("Delivery Order No. : DO-9001"), null);
  assert.equal(matchTotalsLabel("Discount Code"), null);
  assert.equal(matchTotalsLabel("SST @ 6%").field_path, "invoice.tax_total");
});

test("an AGREEING repeat of a totals line collapses to ONE emission", () => {
  // The DB collapses identical duplicates and forfeits the extraction on differing ones, so
  // the reader must behave the same way before it ever gets there.
  const repeated = [
    ...LAI_LOU_MEI,
    line("Service Tax@6%:", [4.6382, 15.37, 6.5022, 15.3085, 6.5112, 15.5818, 4.6472, 15.6433]),
    line("5.66", [9.4184, 15.2351, 9.9424, 15.2294, 9.9457, 15.4925, 9.4213, 15.4989]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(repeated));
  const hits = fields.filter((f) => f.field_path === "invoice.tax_total");
  assert.equal(hits.length, 1, "two readings of the same figure are one fact");
  assert.equal(hits[0].value_raw, "5.66");
  assert.equal(receipt.fields["invoice.tax_total"].occurrences, 2);
  assert.equal(receipt.ambiguous, 0);
});

test("a repeat that DISAGREES drops the field — measured on the real Tax Summary geometry", () => {
  // Had OCR read the Tax Summary label correctly, its index+1 neighbour is the TAXABLE
  // column (94.30), not the tax (5.66) — the two columns are two lines apart. The reader must
  // refuse the field rather than pick a side: 94.30 as a tax on a 103.75 document would tie
  // to nothing and post a large wrong figure.
  const corrected = LAI_LOU_MEI.map((l) => (l.content === "ervice Tax@6%" ? line("Service Tax@6%", l.polygon) : l));
  const { fields, receipt } = readTotalsFromLines(onePage(corrected));
  assert.equal(byPath(fields)["invoice.tax_total"], undefined, "conflicting readings emit NOTHING");
  assert.equal(receipt.ambiguous, 1);
  assert.deepEqual(receipt.fields["invoice.tax_total"].values.sort(), ["5.66", "94.30"]);
  // The other three components are unaffected — one bad field never voids the batch.
  assert.equal(fields.length, 3);
});

// ======================================================================================
// CELL 2 — the invoice geometry, and the two glyphs OCR lost
// ======================================================================================

test("BRIGHTPATH: subtotal and rounding are read; the NIL tax is never invented", () => {
  const { fields, receipt } = readTotalsFromLines(onePage(BRIGHTPATH, 2));
  const got = byPath(fields);

  assert.equal(got["invoice.total_excl_tax"].value_raw, "435,560.40");
  assert.equal(got["invoice.total_excl_tax"].page, 2);
  assert.equal(got["invoice.rounding"].value_raw, "0.40");
  assert.equal(got["invoice.tax_total"], undefined, "the tax amount is a dash OCR never captured — emit nothing");
  assert.notEqual(receipt.fields["invoice.tax_total"].outcome, "matched");
  assert.equal(receipt.fields["invoice.tax_total"].outcome, "absent");
  assert.equal(receipt.sst_rate, 8, "the 8% rate is still captured off the label");

  // Never 0.00: a zero would satisfy an identity the document does not state.
  for (const f of fields) assert.notEqual(centsOfRaw(f.value_raw), 0);
  // And the tax-inclusive total is NOT harvested — invoice.total is the typed field's job.
  assert.equal(fields.some((f) => f.value_raw === "435,560.00"), false);
});

test("the measured near-miss: the nil tax label sits INSIDE the top-delta window of the rounding figure", () => {
  // The number that made the row test necessary. `Service Tax (8%)` and the rounding row's
  // `0.40` are 0.1497in apart on their top edges — inside the ratified 0.15in window, by
  // three ten-thousandths of an inch — and 0.40 is to the label's right. Only the fact that
  // their boxes share no vertical band separates a nil tax from a RM0.40 one.
  const taxTop = BRIGHTPATH[6].polygon[1];
  const amountTop = BRIGHTPATH[5].polygon[1];
  assert.ok(Math.abs(taxTop - amountTop) <= 0.15, "the top-delta window alone does NOT separate them");
  const ys = (p) => [p[1], p[3], p[5], p[7]];
  const overlap = Math.min(...[Math.max(...ys(BRIGHTPATH[6].polygon)), Math.max(...ys(BRIGHTPATH[5].polygon))])
    - Math.max(...[Math.min(...ys(BRIGHTPATH[6].polygon)), Math.min(...ys(BRIGHTPATH[5].polygon))]);
  assert.ok(overlap < 0, "their boxes share no vertical band — different printed rows");
});

test("the vertical-overlap term is load-bearing: without it a nil tax becomes RM0.40", () => {
  // Azure emitted these lines sorted by y, which happens to put the rounding figure BEFORE
  // the tax label; a page whose reading order puts the label first is equally ordinary. This
  // fixture is the same measured geometry in that order, so the only thing left refusing the
  // pair is the row test.
  const reordered = [BRIGHTPATH[4], BRIGHTPATH[6], BRIGHTPATH[5], BRIGHTPATH[7], BRIGHTPATH[8]];
  const shipped = readTotalsFromLines(onePage(reordered, 2));
  assert.equal(byPath(shipped.fields)["invoice.tax_total"], undefined, "the nil tax stays nil");

  const withoutRowTest = readTotalsFromLines(onePage(reordered, 2), { requireVerticalOverlap: false });
  assert.equal(
    byPath(withoutRowTest.fields)["invoice.tax_total"]?.value_raw,
    "0.40",
    "drop the row test and the reader states a tax the document does not — the regression being prevented",
  );
});

test("a printed DASH is NIL, never 0.00", () => {
  const withDash = [...BRIGHTPATH];
  withDash.splice(7, 0, line("-", [7.5649, 8.5907, 7.6985, 8.5907, 7.6987, 8.7196, 7.565, 8.7196]));
  const { fields, receipt } = readTotalsFromLines(onePage(withDash, 2));
  assert.equal(byPath(fields)["invoice.tax_total"], undefined, "a dash states nothing — it does not state zero");
  assert.equal(receipt.fields["invoice.tax_total"].outcome, "nil");
  assert.equal(receipt.absent, 1);
});

test("a DETACHED minus glyph signs the rounding token", () => {
  // The shape the BRIGHTPATH face actually prints (minus in its own table column) — modelled
  // here because OCR captured no minus at all on the real page. `_normalize_invoice_cents`
  // accepts "-0.40", and rounding is the one component the DB's non-negative guard excludes.
  const withMinus = [...BRIGHTPATH];
  withMinus.splice(5, 0, line("-", [7.0, 8.441, 7.1, 8.441, 7.1, 8.5525, 7.0, 8.5525]));
  const { fields } = readTotalsFromLines(onePage(withMinus, 2));
  assert.equal(byPath(fields)["invoice.rounding"].value_raw, "-0.40");
  assert.equal(centsOfRaw("-0.40"), -40);
});

test("a detached minus on a stated COMPONENT refuses the field — components are positive by law", () => {
  // 0022 check (b2) rejects negative cents for service_charge / discount / delivery at the
  // write boundary; emitting one would forfeit the whole extraction, so refuse here first.
  const lines = [
    line("Service Charge@4%:", [4.6354, 11.0671, 6.8599, 10.9881, 6.8698, 11.2659, 4.6441, 11.3449]),
    line("-", [9.0, 10.98, 9.1, 10.98, 9.1, 11.15, 9.0, 11.15]),
    line("3.77", [9.3868, 10.9297, 9.904, 10.921, 9.9084, 11.1856, 9.3913, 11.1943]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(lines));
  assert.equal(fields.length, 0);
  assert.equal(receipt.unparseable, 1);
  assert.equal(receipt.fields["invoice.service_charge"].reason, "detached_minus_on_component");
});

// ======================================================================================
// CELL 3 — uniqueness-or-nothing
// ======================================================================================

test("two labels claiming the same field with different figures emit NEITHER", () => {
  const lines = [
    line("Sub Total", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
    line("435,560.40", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
    line("Subtotal", [5.3297, 9.257, 6.8238, 9.2669, 6.8229, 9.3988, 5.3288, 9.389]),
    line("435,560.90", [7.105, 9.2704, 7.7038, 9.2739, 7.7031, 9.3954, 7.1043, 9.3921]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(lines));
  assert.equal(fields.length, 0, "0016 forfeits the WHOLE extraction on conflicting duplicates");
  assert.equal(receipt.ambiguous, 1);
  assert.equal(receipt.matched, 0);
});

test("a stated figure contradicted by a printed dash emits NEITHER", () => {
  const lines = [
    line("Service Tax (6%)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
    line("5.66", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
    line("Service Tax (6%)", [5.3297, 9.257, 6.8238, 9.2669, 6.8229, 9.3988, 5.3288, 9.389]),
    line("-", [7.105, 9.2704, 7.2038, 9.2739, 7.2031, 9.3954, 7.1043, 9.3921]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(lines));
  assert.equal(fields.length, 0);
  assert.equal(receipt.ambiguous, 1);
  assert.equal(receipt.fields["invoice.tax_total"].reason, "value_vs_nil");
});

test("two acceptable amounts inside one pairing window emit NEITHER", () => {
  // Reading-order adjacency normally makes this unreachable, so the window is widened here to
  // prove the uniqueness rule itself, not the adjacency shortcut.
  const lines = [
    line("Rounding", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("0.40", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    line("0.50", [7.5, 8.27, 7.9, 8.27, 7.9, 8.39, 7.5, 8.39]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(lines), { requireIndexAdjacent: false });
  assert.equal(fields.length, 0);
  assert.equal(receipt.ambiguous, 1);
});

// ======================================================================================
// CELL 4 — reconciliation with Azure's own typed fields
// ======================================================================================

/** A full analyzeResult carrying typed fields AND layout lines. */
function payloadWith(typedFields, lines, pageNumber = 2) {
  return {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: typedFields }],
      pages: [{ pageNumber, lines }],
    },
  };
}

const TYPED_TOTAL = {
  content: "435,560.00",
  valueCurrency: { amount: 435560, currencyCode: "MYR" },
  boundingRegions: [{ pageNumber: 2, polygon: [7.1, 8.79, 7.7, 8.79, 7.7, 8.92, 7.1, 8.92] }],
  confidence: 0.656,
};

test("typed and reader agreeing on a figure yields ONE emission (the typed one)", () => {
  // Measured hazard: Azure typed SubTotal 435,560.40 on a fresh call to the very document
  // where the production extraction had none. The collision is real and nondeterministic.
  const out = normalizeAzureInvoice(
    payloadWith(
      {
        InvoiceTotal: TYPED_TOTAL,
        SubTotal: { content: "435,560.40", boundingRegions: [{ pageNumber: 2, polygon: [7.105, 8.27, 7.7, 8.27, 7.7, 8.4, 7.105, 8.4] }], confidence: 0.839 },
      },
      BRIGHTPATH,
    ),
  );
  const nets = out.fields.filter((f) => f.field_path === "invoice.total_excl_tax");
  assert.equal(nets.length, 1, "duplicate distinct facts forfeit the extraction — never emit two");
  assert.equal(nets[0].confidence, 0.839, "the TYPED row survives: it carries Azure's own region + score");
  assert.equal(out.envelope.totals_reader.typed_collapsed, 1);
  assert.equal(out.envelope.totals_reader.typed_disagreement, 0);
  // The reader still contributes the field Azure never typed.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.rounding").value_raw, "0.40");
});

test("typed and reader DISAGREEING emits neither, and says so", () => {
  const out = normalizeAzureInvoice(
    payloadWith(
      { InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "435,999.99", confidence: 0.84 } },
      BRIGHTPATH,
    ),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.total_excl_tax"), false, "the typed row is withdrawn too");
  assert.equal(out.envelope.totals_reader.typed_disagreement, 1);
  // invoice.total is untouched — a disagreement on one field never costs the extraction.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00");
});

test("a typed field with a region but NO value is filled by the reader, not duplicated", () => {
  const out = normalizeAzureInvoice(
    payloadWith(
      { InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "", boundingRegions: [{ pageNumber: 2, polygon: [] }], confidence: 0.3 } },
      BRIGHTPATH,
    ),
  );
  const nets = out.fields.filter((f) => f.field_path === "invoice.total_excl_tax");
  assert.equal(nets.length, 1);
  assert.equal(nets[0].value_raw, "435,560.40", "an empty typed hit is a hole, not a disagreement");
  assert.equal(out.envelope.totals_reader.typed_recovered, 1);
});

// ======================================================================================
// CELL 5 — the accept grammar
// ======================================================================================

test("only a grouped two-decimal amount is accepted; everything else is refused and counted", () => {
  // A present-but-unparseable monetary value forfeits the WHOLE extraction at the DB
  // (0022, check b), so the reader's grammar is a strict SUBSET of _normalize_invoice_cents:
  // no negatives, no accounting parentheses, no bare integers, exactly two decimals.
  for (const bad of ["-5.00", "(5.00)", "1234", "1,234", "12.5", "12.345", "94.3O", "RM", "N/A"]) {
    const lines = [
      line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
      line(bad, [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    ];
    const { fields } = readTotalsFromLines(onePage(lines));
    assert.equal(fields.length, 0, `${bad} must never be emitted`);
  }
  for (const good of ["0.02", "94.30", "435,560.40", "RM 1,000.00"]) {
    const lines = [
      line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
      line(good, [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    ];
    const { fields } = readTotalsFromLines(onePage(lines));
    assert.equal(fields[0]?.value_raw, good);
  }
});

test("an amount-SHAPED refusal is counted as unparseable; plain text is simply not an amount", () => {
  const shaped = readTotalsFromLines(onePage([
    line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("(5.00)", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ]));
  assert.equal(shaped.receipt.unparseable, 1, "a refusal must be visible, never a silent absence");
  assert.equal(shaped.receipt.absent, 0);

  const prose = readTotalsFromLines(onePage([
    line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("carried forward", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ]));
  assert.equal(prose.receipt.absent, 1);
  assert.equal(prose.receipt.unparseable, 0);
});

test("no emitted component is ever negative", () => {
  // Belt for the DB's buckle: 0022 refuses negative cents for the three stated components
  // outright. Rounding is the deliberate exception and is covered by the detached-minus cell.
  const { fields } = readTotalsFromLines(onePage([
    ...LAI_LOU_MEI,
    line("Discount", [4.6405, 12.6722, 6.1412, 12.6311, 6.1488, 12.9098, 4.6481, 12.9503]),
    line("-1.00", [9.4394, 12.544, 9.962, 12.5398, 9.964, 12.7938, 9.4414, 12.798]),
  ]));
  for (const f of fields) {
    if (f.field_path === "invoice.rounding") continue;
    assert.ok(centsOfRaw(f.value_raw) >= 0, `${f.field_path} must be non-negative`);
  }
  assert.equal(byPath(fields)["invoice.discount"], undefined);
});

test("a line without usable geometry is never an anchor and never an amount", () => {
  assert.deepEqual(readTotalsFromLines(null).fields, []);
  assert.deepEqual(readTotalsFromLines([]).fields, []);
  assert.deepEqual(readTotalsFromLines(onePage([line("Sub Total", []), line("94.30", [])])).fields, []);
  assert.deepEqual(readTotalsFromLines(onePage([line("Sub Total", [1, 2, 3, 4]), line("94.30", [1, 2, 3, 4])])).fields, []);
});

// ======================================================================================
// CELL 6 — the mapper: a widening, not a change
// ======================================================================================

test("the mapper merges reader emissions and folds the receipt into the envelope at v6", () => {
  const out = normalizeAzureInvoice(payloadWith({ InvoiceTotal: TYPED_TOTAL }, BRIGHTPATH));
  const got = byPath(out.fields);
  assert.equal(got["invoice.total"].value_raw, "435,560.00", "the typed total is untouched");
  assert.equal(got["invoice.currency"].value_raw, "MYR");
  assert.equal(got["invoice.total_excl_tax"].value_raw, "435,560.40", "the reader supplies what Azure never typed");
  assert.equal(got["invoice.rounding"].value_raw, "0.40");
  assert.equal(got["invoice.tax_total"], undefined);
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v6");
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v6");
  assert.equal(out.envelope.totals_reader.emitted, 2);
  assert.equal(out.envelope.totals_reader.sst_rate, 8);
  assert.equal(out.pagesUsed, 1, "pagesUsed still counts pages, not lines");
});

test("a payload with NO pages[].lines[] behaves exactly as v5 plus an all-absent receipt", () => {
  // Every pre-X2 fixture and every non-layout engine result has this shape. The reader must
  // be a PURE WIDENING: same fields, same order, same geometry, no throw.
  const legacy = {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "435,560.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }], confidence: 0.98 },
        InvoiceId: { content: "BINV202510-018", confidence: 0.9 },
        SubTotal: { content: "410,000.00", confidence: 0.9 },
        TotalTax: { content: "25,560.00", confidence: 0.9 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  };
  const out = normalizeAzureInvoice(legacy);
  assert.deepEqual(
    out.fields.map((f) => [f.field_path, f.value_raw]),
    [
      ["invoice.total", "435,560.00"],
      ["invoice.invoice_id", "BINV202510-018"],
      ["invoice.total_excl_tax", "410,000.00"],
      ["invoice.tax_total", "25,560.00"],
      ["invoice.currency", "MYR"],
    ],
    "typed vocabulary, values and ORDER are byte-for-byte what v5 produced",
  );
  const receipt = out.envelope.totals_reader;
  assert.deepEqual(
    { matched: receipt.matched, absent: receipt.absent, ambiguous: receipt.ambiguous, unparseable: receipt.unparseable, emitted: receipt.emitted },
    { matched: 0, absent: 0, ambiguous: 0, unparseable: 0, emitted: 0 },
  );
  assert.deepEqual(receipt.fields, {});
  assert.equal(out.pagesUsed, 1);
});

test("the reader never touches the corroboration-ineligibility envelope", () => {
  const credit = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ docType: "invoice.creditNote", fields: { InvoiceTotal: TYPED_TOTAL } }],
      pages: [{ pageNumber: 2, lines: BRIGHTPATH }],
    },
  });
  assert.equal(credit.envelope.corroboration_ineligible, "credit_note");
  assert.equal(credit.envelope.totals_reader.emitted, 2, "facts are still captured; the DB decides eligibility");
});
