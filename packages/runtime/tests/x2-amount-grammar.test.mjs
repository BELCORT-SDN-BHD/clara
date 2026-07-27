// The BYTE-LEVEL money grammar (`lib/invoice-amount-grammar.mjs`) — what may be handed to the
// database at all. Split from the geometry suite because it answers a different question and
// is calibrated against a different reference: `clara._normalize_invoice_cents` (0009:102-123),
// not against any document's layout.
//
// THE ASYMMETRY THAT RUNS THROUGH EVERY CELL: this grammar must be NARROWER than the DB's,
// never wider. Narrower loses a field and sends the document to a human. Wider hands the DB a
// value it normalizes to NULL, and 0022's present-but-malformed check then forfeits the ENTIRE
// extraction — destroying the working `invoice.total` capture along with the new field.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { readTotalsFromLines, centsOfRaw } from "../lib/invoice-totals-reader.mjs";
import { line, onePage, byPath, LAI_LOU_MEI } from "./x2-totals-testkit.mjs";
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
    assert.ok(centsOfRaw(f.value_raw) >= 0n, `${f.field_path} must be non-negative`);
  }
  assert.equal(byPath(fields)["invoice.discount"], undefined);
});

test("a line without usable geometry is never an anchor and never an amount", () => {
  assert.deepEqual(readTotalsFromLines(null).fields, []);
  assert.deepEqual(readTotalsFromLines([]).fields, []);
  assert.deepEqual(readTotalsFromLines(onePage([line("Sub Total", []), line("94.30", [])])).fields, []);
  assert.deepEqual(readTotalsFromLines(onePage([line("Sub Total", [1, 2, 3, 4]), line("94.30", [1, 2, 3, 4])])).fields, []);
});



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
  assert.equal(centsOfRaw("RM 1,234.56"), 123456n);
  assert.equal(centsOfRaw("-0.40"), -40n);
  assert.equal(centsOfRaw("(5.00)"), -500n, "the accounting parenthesis form, exactly as the DB reads it");
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
  assert.equal(centsOfRaw(emitted.value_raw), -40n);
});
// ======================================================================================
// CELL 8 — round-two regressions: Unicode at token EDGES, and exact cents
// ======================================================================================

test("a Unicode space at a token EDGE is refused, not silently trimmed away", () => {
  // `String.prototype.trim()` strips U+FEFF and NBSP; PostgreSQL's `btrim` strips SPACES, and
  // its later `[,[:space:]]` pass never touches U+FEFF at all. So JS trim REPAIRS a token the
  // DB will reject — the wider-than-the-DB direction, which forfeits the whole extraction.
  for (const gap of ["\uFEFF", "\u00A0"]) {
    for (const token of [`${gap}1,234.56`, `1,234.56${gap}`]) {
      const { fields } = readTotalsFromLines(onePage([
        line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
        line(token, [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
      ]));
      assert.equal(fields.length, 0, `${JSON.stringify(token)} must be refused at the edge too`);
      assert.equal(centsOfRaw(token), null, "and it must not normalize on the comparison path");
    }
  }
  // ASCII edges stay acceptable: the DB strips them, so refusing would be gratuitous.
  const { fields } = readTotalsFromLines(onePage([
    line("Sub Total", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("  1,234.56\t", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
  ]));
  assert.equal(fields.length, 1);
  assert.equal(centsOfRaw("  1,234.56\t"), 123456n);
});

test("cents are exact BigInt — two readings a sen apart never compare equal", () => {
  // Number/Math.round collapse distinct cent values past 2^53: these two both became
  // 9007199254740991, so a genuine disagreement was recorded as agreement. Both fit
  // PostgreSQL's bigint, so the DB would have told them apart — the imprecision was ours.
  const lo = centsOfRaw("90,071,992,547,409.90");
  const hi = centsOfRaw("90,071,992,547,409.91");
  assert.equal(lo, 9007199254740990n);
  assert.equal(hi, 9007199254740991n);
  assert.notEqual(lo, hi, "'agree to the sen' cannot be built on a type that stops counting sens");
  assert.equal(hi - lo, 1n);
  // No float anywhere on the path: the digits are assembled lexically.
  assert.equal(centsOfRaw("0.01"), 1n);
  assert.equal(centsOfRaw("0.1"), 10n, "one decimal place, exactly as the DB reads it");
  assert.equal(centsOfRaw("123"), 12300n, "a bare integer normalizes; the ACCEPT grammar is what refuses it");
});

test("a Tax Summary heading is matched WIDE — a Unicode space must not reopen the band", () => {
  // The heading is a REFUSAL TRIGGER, so wideness is the safe direction here and strictness is
  // the safe direction in the accept grammar. `Tax<NBSP>Summary` with the main label removed
  // is the exact shape that otherwise emits the taxable base as the tax.
  for (const heading of ["Tax\u00A0Summary", "Tax\u3000Summary", "Tax\uFEFFSummary", "TAX  SUMMARY"]) {
    const block = [
      line(heading, [4.2865, 13.8624, 5.705, 13.8547, 5.7065, 14.1375, 4.288, 14.1452]),
      line("Taxable", [8.4077, 13.7859, 9.3394, 13.7695, 9.3444, 14.053, 8.4126, 14.0694]),
      line("Tax", [10.1108, 13.7509, 10.5315, 13.7499, 10.5322, 14.0162, 10.1114, 14.0172]),
      line("Service Tax@6%", [4.3283, 14.1864, 6.097, 14.1581, 6.1016, 14.4482, 4.3329, 14.4689]),
      line("94.30", [8.5495, 14.1185, 9.2231, 14.1056, 9.2285, 14.3873, 8.5549, 14.3994]),
      line("5.66", [10.0044, 14.0753, 10.5366, 14.0694, 10.5404, 14.3455, 10.0082, 14.3528]),
    ];
    const { fields, receipt } = readTotalsFromLines(onePage(block));
    assert.equal(byPath(fields)["invoice.tax_total"], undefined, `${JSON.stringify(heading)} must open the band`);
    assert.equal(receipt.tax_summary_suppressed, 1);
  }
});

test('a heading whose noise is SHIELDED by a Unicode space still opens the band', () => {
  // The combined edge: the noise-stripper's class is ASCII, so a leading NBSP shields the '#'
  // from it. Collapse-then-strip is the only order that survives; strip-then-collapse leaves
  // '# tax summary', the prefix misses, and the taxable base is emitted as the tax.
  for (const heading of [' # Tax﻿Summary', ' # Tax Summary', '(1) Tax　Summary']) {
    const block = [
      line(heading, [4.2865, 13.8624, 5.705, 13.8547, 5.7065, 14.1375, 4.288, 14.1452]),
      line('Taxable', [8.4077, 13.7859, 9.3394, 13.7695, 9.3444, 14.053, 8.4126, 14.0694]),
      line('Tax', [10.1108, 13.7509, 10.5315, 13.7499, 10.5322, 14.0162, 10.1114, 14.0172]),
      line('Service Tax@6%', [4.3283, 14.1864, 6.097, 14.1581, 6.1016, 14.4482, 4.3329, 14.4689]),
      line('94.30', [8.5495, 14.1185, 9.2231, 14.1056, 9.2285, 14.3873, 8.5549, 14.3994]),
      line('5.66', [10.0044, 14.0753, 10.5366, 14.0694, 10.5404, 14.3455, 10.0082, 14.3528]),
    ];
    const { fields, receipt } = readTotalsFromLines(onePage(block));
    assert.equal(byPath(fields)['invoice.tax_total'], undefined, JSON.stringify(heading) + ' must open the band');
    assert.equal(receipt.tax_summary_suppressed, 1);
  }
});
