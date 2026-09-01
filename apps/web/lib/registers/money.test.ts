// lib/registers/money.ts's `parseAmountToCents` — string-based cents parsing, pure,
// no fetch. Had NO dedicated unit test file before this PR (only reached indirectly
// through component tests for fa-particulars-fields.tsx / fa-row-actions.tsx /
// opening-signed-amount-input.tsx / ApplyOpenItemsDialog.tsx). Ports
// lib/bank/money.test.ts's own precedent cases for its byte-identical
// `parseAmountToCents` body, plus the comma-hardening coverage below (sibling
// census off PR #489/FINDING 1, raised by pr489-codex-leg's law-28 leg).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmountToCents } from "./money";

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
// "1234,56" (European-style RM1,234.56) returned 12345600 — a silent 100x error on a
// live, day-one fixed-asset money field, with no rejection and no echo of the
// interpreted amount. Mirrors lib/firm-admin/settings.test.ts's own FINDING 1
// test-case table exactly (same regex shape, ported here).
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
