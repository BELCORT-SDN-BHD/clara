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

// COMMA HARDENING (sibling census off PR #489/FINDING 1, raised by pr489-codex-leg's
// law-28 leg): the pre-fix body blanket-stripped every comma before validating, so
// "1234,56" (European-style RM1,234.56) returned 123456 -> 12345600 cents — a silent
// 100x error on a live, day-one bank-workbench money field (matching amounts, statement
// opening/closing balances, write-off debit/credit), with no rejection and no echo of
// the interpreted amount. Mirrors PR #489's FINDING 1 table (merges ahead of this
// PR in the queue) exactly (same regex shape, ported here).
test("parseAmountToCents: FINDING 1 (raised by pr489-codex-leg, law-28 leg) — a decimal-comma amount is REFUSED, never silently reparsed as a 100x-larger thousands amount", () => {
  assert.equal(parseAmountToCents("1234,56"), null, "European-style decimal comma must be REFUSED, not silently reinterpreted");
  assert.equal(parseAmountToCents("12,34.56"), null, "a comma outside a strict 3-digit group is refused");
  assert.equal(parseAmountToCents(",123"), null, "a leading comma is refused");
  assert.equal(parseAmountToCents("123,"), null, "a trailing comma is refused");
  assert.equal(parseAmountToCents("1,2345.00"), null, "a 4-digit group after a comma is refused, not truncated");
  // The strictly-valid thousands-grouping convention itself still parses — this is a
  // refusal of AMBIGUITY, not a refusal of every comma.
  assert.equal(parseAmountToCents("1,234.56"), 123456, "a strictly-grouped thousands separator still parses");
});

// F2 (independent review, PR #495 fix round): mutant-proven — deleting the bare `|\d+`
// alternative from the whole-part regex leaves every assertion above still passing
// (each fails via the comma-grouped arm or fails to match at all) while silently making
// an ordinary comma-less amount unparseable. These two lines fail under that mutant and
// pass under the real fix — the discriminating proof the `|\d+` arm is load-bearing.
test("parseAmountToCents: plain multi-digit amounts with NO comma still parse (the non-comma alternation arm)", () => {
  assert.equal(parseAmountToCents("1234"), 123400);
  assert.equal(parseAmountToCents("10000.50"), 1000050);
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
