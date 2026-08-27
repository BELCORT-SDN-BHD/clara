// Pure presentation helpers — no fetch, no session, no door. See balance.ts's
// header for why the sum here is explicitly a CLIENT-SIDE presentation figure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents, sumLines } from "./balance";
import type { JournalLineRow } from "./types";

function line(overrides: Partial<JournalLineRow>): JournalLineRow {
  return {
    id: "l1",
    entry_id: "e1",
    line_no: 1,
    account_code: "6000",
    debit_cents: 0,
    credit_cents: 0,
    description: null,
    counterparty_id: null,
    ...overrides,
  };
}

test("sumLines: balanced lines report balanced: true", () => {
  const b = sumLines([line({ debit_cents: 10000 }), line({ credit_cents: 10000 })]);
  assert.equal(b.debitCents, 10000);
  assert.equal(b.creditCents, 10000);
  assert.equal(b.balanced, true);
});

test("sumLines: unbalanced lines report balanced: false, never coerced", () => {
  const b = sumLines([line({ debit_cents: 10000 }), line({ credit_cents: 9995 })]);
  assert.equal(b.balanced, false);
});

test("sumLines: empty lines sum to zero and count as balanced (0 === 0)", () => {
  const b = sumLines([]);
  assert.deepEqual(b, { debitCents: 0, creditCents: 0, balanced: true });
});

test("formatCents: renders RM with thousands + 2dp", () => {
  assert.equal(formatCents(123456), "RM 1,234.56");
});

test("formatCents: zero", () => {
  assert.equal(formatCents(0), "RM 0.00");
});

test("formatCents: negative", () => {
  assert.equal(formatCents(-500), "-RM 5.00");
});

test("formatCents: null/undefined never fabricates a number", () => {
  assert.equal(formatCents(null), "—");
  assert.equal(formatCents(undefined), "—");
});
