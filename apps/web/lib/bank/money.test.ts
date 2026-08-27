// lib/bank/money.ts — string-based cents parsing/formatting. Pure, no fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmountToCents, formatCents, formatMyr } from "./money";

test("parseAmountToCents: whole numbers and two-decimal amounts", () => {
  assert.equal(parseAmountToCents("500"), 50000);
  assert.equal(parseAmountToCents("500.00"), 50000);
  assert.equal(parseAmountToCents("500.5"), 50050);
  assert.equal(parseAmountToCents("0.1"), 10, "never drifts through binary-float multiplication");
});

test("parseAmountToCents: negative amounts and thousands separators", () => {
  assert.equal(parseAmountToCents("-500.00"), -50000);
  assert.equal(parseAmountToCents("1,234.56"), 123456);
  assert.equal(parseAmountToCents("  -1,234.56  "), -123456);
});

test("parseAmountToCents: rejects malformed input, never coerces to 0", () => {
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("   "), null);
  assert.equal(parseAmountToCents("abc"), null);
  assert.equal(parseAmountToCents("1.234"), null, "more than 2 decimal places is malformed");
  assert.equal(parseAmountToCents("1.2.3"), null);
  assert.equal(parseAmountToCents("-"), null);
});

test("formatCents: grouping + always 2 decimals", () => {
  assert.equal(formatCents(50000), "500.00");
  assert.equal(formatCents(123456), "1,234.56");
  assert.equal(formatCents(-50000), "-500.00");
  assert.equal(formatCents(0), "0.00");
});

test("formatCents: null/non-finite renders an honest placeholder, never a fabricated 0.00", () => {
  assert.equal(formatCents(null), "—");
  assert.equal(formatCents(undefined), "—");
  assert.equal(formatCents(Number.NaN), "—");
});

test("formatMyr: RM prefix, sign carried on the whole string", () => {
  assert.equal(formatMyr(123456), "RM 1,234.56");
  assert.equal(formatMyr(-123456), "-RM 1,234.56");
  assert.equal(formatMyr(null), "—");
});
