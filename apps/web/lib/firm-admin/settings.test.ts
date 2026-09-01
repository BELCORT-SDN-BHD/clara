// lib/firm-admin/settings.ts's `parseThresholdAmountToCents` — string-based
// cents parsing, pure, no fetch. M4 (independent review, PR #489,
// fix-required): ports lib/bank/money.test.ts's own precedent cases for
// `parseAmountToCents`, plus this parser's own DELIBERATE DIVERGENCES from
// that one — this domain never admits a negative or a zero threshold
// (mirrors the door's own `p_cents > 0` check, 0022 §B), where the bank
// parser's own amounts are legitimately signed (debit/credit).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseThresholdAmountToCents } from "./settings";

test("parseThresholdAmountToCents: whole numbers and two-decimal amounts", () => {
  assert.equal(parseThresholdAmountToCents("500"), 50000);
  assert.equal(parseThresholdAmountToCents("500.00"), 50000);
  assert.equal(parseThresholdAmountToCents("500.5"), 50050);
  assert.equal(parseThresholdAmountToCents("0.1"), 10, "never drifts through binary-float multiplication");
});

test("parseThresholdAmountToCents: thousands separators and whitespace", () => {
  assert.equal(parseThresholdAmountToCents("1,000.00"), 100000);
  assert.equal(parseThresholdAmountToCents("1,234.56"), 123456);
  assert.equal(parseThresholdAmountToCents("  1,234.56  "), 123456);
});

test("parseThresholdAmountToCents: more than two decimal places is malformed, never rounded — a padded-not-rounded proof", () => {
  // "1000.005" is NOT truncated to 1000.00 or rounded to 1000.01 — the
  // regex requires the ENTIRE string to match `\d+(\.\d{1,2})?`, so a third
  // decimal digit fails the match outright and returns null. A parser that
  // silently rounded would return 100001 (rounding up) or 100000 (padding
  // "00" and dropping the third digit) here instead of refusing.
  assert.equal(parseThresholdAmountToCents("1000.005"), null);
  assert.equal(parseThresholdAmountToCents("1.234"), null);
});

test("parseThresholdAmountToCents: rejects negative and zero amounts — the door's own p_cents > 0 wall, mirrored client-side", () => {
  assert.equal(parseThresholdAmountToCents("-5"), null);
  assert.equal(parseThresholdAmountToCents("-0.01"), null);
  assert.equal(parseThresholdAmountToCents("-500.00"), null, "unlike lib/bank/money.ts's signed amounts, a threshold is never negative");
  assert.equal(parseThresholdAmountToCents("0"), null);
  assert.equal(parseThresholdAmountToCents("0.00"), null);
});

test("parseThresholdAmountToCents: rejects scientific notation and other non-decimal numeric spellings", () => {
  assert.equal(parseThresholdAmountToCents("1e3"), null, "only plain decimal digits are accepted — 1e3 is not 1000 here");
  assert.equal(parseThresholdAmountToCents("1.2.3"), null);
  assert.equal(parseThresholdAmountToCents("-"), null);
});

test("parseThresholdAmountToCents: rejects malformed input, never coerces to 0", () => {
  const cases = ["", "   ", "abc", "RM 500", "500 RM", "NaN", "Infinity"];
  for (const c of cases) {
    const result = parseThresholdAmountToCents(c);
    assert.equal(result, null, `"${c}" must parse to null`);
    assert.notEqual(result, 0, `"${c}" must never be coerced to 0 — the caller treats null as "not a number yet"`);
  }
});

test("parseThresholdAmountToCents: FINDING 1 (raised by pr489-codex-leg, law-28 leg) — a decimal-comma amount is REFUSED, never silently reparsed as a 100x-larger thousands amount", () => {
  // RED-before proof: run against the pre-fix body (`input.replace(/,/g, "")`
  // before validating) and "1234,56" returns 12345600 — an accepted, SILENT
  // 100x threshold error (RM1,234.56 typed, RM123,456.00 stored) with no
  // rejection and no echo of the interpreted amount. Captured verbatim in
  // the PR body's fix-round section. Convention check: `./money.ts` in this
  // domain is a formatter with no parser; the two ACTUAL sibling parsers
  // this file's header names (lib/registers/money.ts, lib/bank/money.ts —
  // both `parseAmountToCents`) do NOT refuse commas either, so there is no
  // "refuses-commas-entirely" convention to match — this parser instead
  // enforces strict thousands-grouping (a comma is accepted ONLY in a
  // strictly valid grouping position, never as a decimal mark), refusing
  // anything else rather than guessing.
  assert.equal(parseThresholdAmountToCents("1234,56"), null, "European-style decimal comma must be REFUSED, not silently reinterpreted");
  assert.equal(parseThresholdAmountToCents("12,34.56"), null, "a comma outside a strict 3-digit group is refused");
  assert.equal(parseThresholdAmountToCents(",123"), null, "a leading comma is refused");
  assert.equal(parseThresholdAmountToCents("123,"), null, "a trailing comma is refused");
  assert.equal(parseThresholdAmountToCents("1,2345.00"), null, "a 4-digit group after a comma is refused, not truncated");
  // The strictly-valid thousands-grouping convention itself still parses —
  // this is a refusal of AMBIGUITY, not a refusal of every comma.
  assert.equal(parseThresholdAmountToCents("1,234.56"), 123456, "a strictly-grouped thousands separator still parses");
});

test("parseThresholdAmountToCents: the Number()-precision bound on a giant value", () => {
  // BigInt arithmetic is exact up to this point, but the function's return
  // type is `number`, so the FINAL `Number(cents)` conversion is where
  // precision could be lost for a value beyond Number.MAX_SAFE_INTEGER
  // (2^53 - 1 = 9,007,199,254,740,991). A firm's threshold will never
  // realistically approach this (it is a whole-currency risk figure, not a
  // ledger total), but the bound is real and documented here rather than
  // silently trusted: "90071992547409.91" is comfortably inside the safe
  // range (9,007,199,254,740,991 cents) and round-trips exactly.
  const cents = parseThresholdAmountToCents("90071992547409.91");
  assert.equal(cents, 9007199254740991);
  assert.ok(Number.isSafeInteger(cents), "the giant-but-in-range case must still be a safe integer");
});
