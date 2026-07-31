// agingModel.ts pure-logic tests (no DOM, no DB — the bank/model.test.ts house
// style). Covers the defensive mappers, the "has a balance" filter, the
// overdue MARKER law (WCC-R3: due_date flags, item_date drives buckets — this
// module never buckets by due_date), and the screen-state selector.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toAgingBucketRow, toStatementLineRow, agingRowHasBalance, isOverdueMarker,
  agingScreenState, AGING_BUCKET_LABELS,
} from "./agingModel";

test("toAgingBucketRow maps every bucket and degrades garbage to a safe empty row", () => {
  const row = toAgingBucketRow({
    counterparty_id: "cp1", counterparty_name: "ACME Sdn Bhd",
    current_cents: 10000, b31_60_cents: 0, b61_90_cents: -500, b91_plus_cents: null,
    total_cents: 9500, overdue_cents: -500,
  });
  assert.equal(row.counterparty_name, "ACME Sdn Bhd");
  assert.equal(row.b91_plus_cents, null);
  assert.equal(row.total_cents, 9500);

  const garbage = toAgingBucketRow("nope");
  assert.equal(garbage.counterparty_id, "");
  assert.equal(garbage.current_cents, null);
});

test("agingRowHasBalance is true iff any bucket is non-null and non-zero", () => {
  const zeroed = toAgingBucketRow({ counterparty_id: "cp1", current_cents: 0, b31_60_cents: 0, b61_90_cents: 0, b91_plus_cents: 0 });
  assert.equal(agingRowHasBalance(zeroed), false, "a fully-settled counterparty has no balance to show");
  const unavailable = toAgingBucketRow({ counterparty_id: "cp1" });
  assert.equal(agingRowHasBalance(unavailable), false, "all-null buckets have nothing to show either");
  const owed = toAgingBucketRow({ counterparty_id: "cp1", current_cents: 0, b31_60_cents: 15000 });
  assert.equal(agingRowHasBalance(owed), true);
});

test("AGING_BUCKET_LABELS names exactly the four disjoint half-open buckets, in order", () => {
  assert.deepEqual(
    AGING_BUCKET_LABELS.map((b) => b.label),
    ["current (0-30)", "31-60", "61-90", "91+"],
  );
});

test("toStatementLineRow maps item/due/effective dates and the DB-computed running balance", () => {
  const row = toStatementLineRow({
    item_id: "i1", item_kind: "invoice", item_date: "2026-04-01", due_date: "2026-05-01",
    effective_date: "2026-04-05", amount_cents: 50000, outstanding_cents: 20000, running_balance_cents: 20000,
  });
  assert.equal(row.item_kind, "invoice");
  assert.equal(row.running_balance_cents, 20000);
  const garbage = toStatementLineRow({});
  assert.equal(garbage.item_id, "");
  assert.equal(garbage.amount_cents, null);
});

// --- WCC-R3: due_date is an overdue MARKER only, never the bucket driver ---------

test("isOverdueMarker is a plain date comparison — true only when due_date is strictly before as_of", () => {
  assert.equal(isOverdueMarker("2026-04-01", "2026-05-01"), true);
  assert.equal(isOverdueMarker("2026-05-01", "2026-05-01"), false, "due exactly on as_of is not yet overdue");
  assert.equal(isOverdueMarker("2026-06-01", "2026-05-01"), false, "a future due date is not overdue");
  assert.equal(isOverdueMarker(null, "2026-05-01"), false, "no due date recorded yet (existing items keep an honest null, WCC-R4) is never overdue");
});

// --- screen state ------------------------------------------------------------------

test("agingScreenState mirrors the house five-state selector", () => {
  assert.equal(agingScreenState({ loading: true, error: false, totalRows: 0 }), "loading");
  assert.equal(agingScreenState({ loading: false, error: true, totalRows: 0 }), "error");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 0 }), "empty");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 3 }), "ideal");
  assert.equal(agingScreenState({ loading: true, error: false, totalRows: 3 }), "ideal", "rows already in hand outrank a background refresh");
});
