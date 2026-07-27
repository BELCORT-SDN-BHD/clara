// X2 — the deterministic totals reader: GEOMETRY and GRAMMAR. Pure unit tests, no DB (the
// wave-b-prior-gl-cells style). Fixtures are the real measured polygons; see the testkit.
//
// THE DANGEROUS DIRECTION IS A WRONG FIGURE, not a missing one — a stated component feeds a
// posting-control identity that the DB checks to the sen. So most cells below assert that the
// reader emits NOTHING, and several pin the exact real-world geometry that would produce a
// wrong number if a pairing term were dropped. The typed-field reconciliation and the mapper
// live in `x2-totals-mapper.test.mjs`.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { readTotalsFromLines, matchTotalsLabel, centsOfRaw } from "../lib/invoice-totals-reader.mjs";
import { line, onePage, byPath, LAI_LOU_MEI, BRIGHTPATH } from "./x2-totals-testkit.mjs";

// ======================================================================================
// CELL 1 — the receipt geometry
// ======================================================================================

test("LAI LOU MEI: every stated component is read off its own line at the measured offsets", () => {
  const { fields, receipt } = readTotalsFromLines(onePage(LAI_LOU_MEI));
  const got = byPath(fields);

  assert.equal(got["invoice.total_excl_tax"].value_raw, "94.30", "'11 SubTotal' — the leading item count is stripped");
  assert.equal(got["invoice.service_charge"].value_raw, "3.77");
  assert.equal(got["invoice.tax_total"].value_raw, "5.66");
  // The receipt's `Rounding Adj 0.02` IS genuinely positive, and it is still refused: nothing
  // in the OCR states its sign, and the reader does not get to assume one. See the
  // sign_unknown cell for why an unsigned rounding is not refusal-safe downstream.
  assert.equal(got["invoice.rounding"], undefined);
  assert.equal(receipt.fields["invoice.rounding"].outcome, "sign_unknown");
  assert.equal(fields.length, 3, "four components printed, three readable — the fourth is refused, not guessed");

  // Every emission rides the AMOUNT line's own polygon, never the label's and never invented.
  assert.deepEqual(got["invoice.tax_total"].polygon, [9.4184, 11.2351, 9.9424, 11.2294, 9.9457, 11.4925, 9.4213, 11.4989]);
  assert.equal(got["invoice.tax_total"].page, 1);
  // Measured: Azure returns no confidence on lines[]. Null is the honest value.
  assert.equal(got["invoice.tax_total"].confidence, null);

  assert.equal(receipt.sst_rate, 6, "the printed rate is captured as diagnostics, not as a region");
  assert.equal(receipt.matched, 3);
  assert.equal(receipt.sign_unknown, 1);
  assert.equal(receipt.ambiguous, 0);
  assert.equal(receipt.unparseable, 0);

  // The three readable components pick out exactly the right lines: 94.30 + 3.77 + 5.66 is
  // 103.73, two sen short of the stated 103.75 gross — the gap being precisely the rounding
  // the reader refused. So X3's sum-of-components tie REFUSES this document and it goes to a
  // human. That is the designed outcome, not a defect: the alternative is asserting a sign
  // the page never states. (The DB owns the tie; this assertion only pins which lines were
  // read.)
  const sum = ["invoice.total_excl_tax", "invoice.service_charge", "invoice.tax_total"]
    .reduce((acc, p) => acc + centsOfRaw(got[p].value_raw), 0);
  assert.equal(sum, centsOfRaw("103.73"));
  assert.equal(centsOfRaw("103.75") - sum, 2, "the shortfall is exactly the unreadable rounding");
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

test("a Tax Summary block can never anchor a totals field — the neighbouring column is the BASE", () => {
  // Inside the summary table the columns are Taxable | Tax, so the line immediately after the
  // rate label is 94.30 (the base) while the real tax, 5.66, is one further right. The reader
  // refuses to anchor anywhere in the block; the MAIN totals block still supplies 5.66.
  const corrected = LAI_LOU_MEI.map((l) => (l.content === "ervice Tax@6%" ? line("Service Tax@6%", l.polygon) : l));
  const { fields, receipt } = readTotalsFromLines(onePage(corrected));
  assert.equal(byPath(fields)["invoice.tax_total"].value_raw, "5.66", "read from the main block, not the summary");
  assert.equal(receipt.tax_summary_suppressed, 1);
  assert.equal(receipt.fields["invoice.tax_total"].occurrences, 1, "the summary label never became an occurrence");
});

test("with the MAIN label gone, the Tax Summary still cannot supply the taxable base as tax", () => {
  // The dangerous variant, and the reason suppression beats relying on a second opinion: an
  // OCR run that mangles the main label leaves the summary block as the only candidate, and
  // its adjacent column is 94.30 — a figure 17x the real tax on a 103.75 document.
  const summaryOnly = LAI_LOU_MEI
    .filter((l) => !["Service Tax@6%:", "5.66"].includes(l.content) || l.polygon[1] > 13)
    .map((l) => (l.content === "ervice Tax@6%" ? line("Service Tax@6%", l.polygon) : l));
  const { fields, receipt } = readTotalsFromLines(onePage(summaryOnly));
  assert.equal(byPath(fields)["invoice.tax_total"], undefined, "no tax at all beats the wrong tax");
  assert.equal(receipt.tax_summary_suppressed, 1);
  assert.equal(fields.some((f) => f.value_raw === "94.30" && f.field_path === "invoice.tax_total"), false);
});

// ======================================================================================
// CELL 2 — the invoice geometry, and the two glyphs OCR lost
// ======================================================================================

test("BRIGHTPATH: subtotal and rounding are read; the NIL tax is never invented", () => {
  const { fields, receipt } = readTotalsFromLines(onePage(BRIGHTPATH, 2));
  const got = byPath(fields);

  assert.equal(got["invoice.total_excl_tax"].value_raw, "435,560.40");
  assert.equal(got["invoice.total_excl_tax"].page, 2);
  // The face reads "- 0.40" with the minus in its own table column; OCR captured no minus
  // anywhere on the page, so the magnitude survives and the sign does not. Refused.
  assert.equal(got["invoice.rounding"], undefined);
  assert.equal(receipt.fields["invoice.rounding"].outcome, "sign_unknown");
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
  assert.equal(receipt.fields["invoice.tax_total"].unparseable_attempt, undefined, "a clean nil, nothing refused beside it");
  // absent-class covers both the nil tax and the unsigned rounding on this page.
  assert.equal(receipt.absent, 2);
  assert.equal(receipt.sign_unknown, 1);
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
// CELL 7 — the adversarial-review regressions (each cell reproduces a REFUSED finding)
// ======================================================================================

test("a Unicode space the DB will not strip can never be emitted", () => {
  // `_normalize_invoice_cents` strips `[,[:space:]]`, a POSIX class. U+FEFF is not POSIX
  // space (Unicode removed it from White_Space), so `RM<U+FEFF>1,234.56` survives the strip,
  // fails the DB's numeric regex, normalizes to NULL and forfeits the ENTIRE extraction —
  // taking the good invoice.total with it. JavaScript's `\s` matches U+FEFF, so a `\s` in the
  // accept grammar admitted exactly that byte.
  for (const gap of ["\uFEFF", "\u00A0", "\u2009", "\u2007", "\u3000"]) {
    const { fields, receipt } = readTotalsFromLines(onePage([
      line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
      line(`RM${gap}1,234.56`, [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    ]));
    assert.equal(fields.length, 0, `U+${gap.codePointAt(0).toString(16).toUpperCase()} must not reach the DB`);
    assert.equal(receipt.unparseable, 1, "and the refusal is visible, not silent");
  }
  // ASCII space and tab are stripped by the DB under every locale, so they stay acceptable.
  for (const gap of [" ", "  ", "\t"]) {
    const { fields } = readTotalsFromLines(onePage([
      line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
      line(`RM${gap}1,234.56`, [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    ]));
    assert.equal(fields.length, 1);
  }
});

test("centsOfRaw is byte-aligned to the DB: narrower is safe, wider is not", () => {
  assert.equal(centsOfRaw("RM 1,234.56"), 123456);
  assert.equal(centsOfRaw("-0.40"), -40);
  assert.equal(centsOfRaw("(5.00)"), -500, "the accounting parenthesis form, exactly as the DB reads it");
  // Anything carrying a non-ASCII space normalizes to null HERE even though JS `\s` would
  // have swallowed it — that is the whole point: refuse rather than hand the DB a NULL.
  for (const bad of ["RM\uFEFF1.00", "1\u00A0234.00", "12.345", "abc", "", null]) {
    assert.equal(centsOfRaw(bad), null, `${JSON.stringify(bad)} must not normalize`);
  }
});

test("the EMIT GATE re-validates the composed value, including a synthesized sign", () => {
  // `-${token}` is assembled AFTER the accept grammar ran, so without the gate it would reach
  // the DB unchecked. Every emitted byte normalizes, or nothing is emitted.
  const withMinus = [
    line("Rounding", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("-", [6.2, 8.26, 6.3, 8.26, 6.3, 8.39, 6.2, 8.39]),
    line("0.40", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ];
  const [emitted] = readTotalsFromLines(onePage(withMinus)).fields;
  assert.equal(emitted.value_raw, "-0.40");
  assert.notEqual(centsOfRaw(emitted.value_raw), null, "the EXACT emitted bytes normalize");
  assert.equal(centsOfRaw(emitted.value_raw), -40);
});

test("a PIXEL-unit page reads exactly what the same geometry in inches reads", () => {
  // Azure reports PDF geometry in inches and IMAGE geometry in pixels, and image invoices are
  // a supported intake type. Comparing an inch tolerance against raw pixel counts refuses
  // every pair on a photographed bill while looking like a clean read.
  const scale = 150; // 150 dpi
  const toPixels = (l) => line(l.content, l.polygon.map((n) => n * scale));
  const inches = readTotalsFromLines(onePage(LAI_LOU_MEI, 1, { unit: "inch", width: 13.3333 }));
  const pixels = readTotalsFromLines(onePage(LAI_LOU_MEI.map(toPixels), 1, { unit: "pixel", width: 13.3333 * scale }));
  assert.deepEqual(
    pixels.fields.map((f) => [f.field_path, f.value_raw]),
    inches.fields.map((f) => [f.field_path, f.value_raw]),
    "same document, same reading, whichever unit the engine chose",
  );
  assert.ok(pixels.fields.length >= 3);
  assert.deepEqual(pixels.receipt.units, ["pixel"]);
  // Polygons stay in the page's OWN coordinates — scaling is internal to the comparison.
  assert.equal(byPath(pixels.fields)["invoice.tax_total"].polygon[0], 9.4184 * scale);
});

test("a pixel page with no width is refused rather than measured in the wrong unit", () => {
  const { fields, receipt } = readTotalsFromLines(onePage(LAI_LOU_MEI, 1, { unit: "pixel" }));
  assert.equal(fields.length, 0);
  assert.deepEqual(receipt.units, ["pixel:no-width"]);
});

test("unsigned rounding is REFUSED — it is not refusal-safe downstream", () => {
  // Face: subtotal 100.04, rounding -0.04, tax nil, gross 100.00. OCR loses the minus. On a
  // taxless supplier bill no identity constrains the rounding leg, so a +0.04 lets the
  // supplier floor accept a draft whose expense is understated with rounding on the wrong
  // side — every figure "read off the document" and the posting still wrong.
  const face = [
    line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("100.04", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    line("Rounding", [5.0, 8.45, 6.0, 8.45, 6.0, 8.6, 5.0, 8.6]),
    line("0.04", [6.5, 8.46, 6.9, 8.46, 6.9, 8.59, 6.5, 8.59]),
  ];
  const { fields, receipt } = readTotalsFromLines(onePage(face));
  assert.equal(byPath(fields)["invoice.rounding"], undefined);
  assert.equal(receipt.sign_unknown, 1);
  assert.equal(receipt.fields["invoice.rounding"].outcome, "sign_unknown");
  assert.equal(byPath(fields)["invoice.total_excl_tax"].value_raw, "100.04", "the readable component still lands");
});

test("a dash elsewhere on the page waives NOTHING", () => {
  // The adjacency waiver exists for a minus printed in its own column. Checked textually it
  // would let any stray dash — a bullet, a nil in another table — license a jump past the
  // true neighbour into an unrelated right-hand column.
  const lines = [
    line("Sub Total", [1.0, 8.25, 2.0, 8.25, 2.0, 8.4, 1.0, 8.4]),
    line("-", [3.0, 2.0, 3.1, 2.0, 3.1, 2.15, 3.0, 2.15]), // far up the page, another row entirely
    line("999.99", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ];
  const { fields } = readTotalsFromLines(onePage(lines));
  assert.equal(fields.length, 0, "an unrelated dash must not license an unrelated amount");
});

test("a dash never hides an amount-shaped refusal from the counters", () => {
  const { fields, receipt } = readTotalsFromLines(onePage([
    line("Rounding", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("-", [6.2, 8.26, 6.3, 8.26, 6.3, 8.39, 6.2, 8.39]),
    line("(0.40)", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ]));
  assert.equal(fields.length, 0);
  assert.equal(receipt.absent, 1, "the dash reads as nil");
  assert.equal(receipt.unparseable, 1, "AND the refused token is counted in its own right");
  assert.equal(receipt.fields["invoice.rounding"].unparseable_attempt, true);
});
