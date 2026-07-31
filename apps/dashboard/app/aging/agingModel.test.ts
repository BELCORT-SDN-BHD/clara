// agingModel.ts pure-logic tests (no DOM, no DB — the bank/model.test.ts house
// style). Covers the defensive mappers, the "has a balance" filter, the
// DB-computed overdue marker (WCC-R3: due_date flags, item_date drives
// buckets — this module never buckets by due_date), and the screen-state
// selector, including its [D1 fix] fail-closed 'unavailable' arm.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toAgingBucketRow, toAgingTotals, toStatementLineRow, agingRowHasBalance, agingRowHasOverdueItem,
  isOverdueMarker, agingScreenState, AGING_BUCKET_LABELS,
} from "./agingModel";

// --- toAgingBucketRow: the REAL _aging_core per-counterparty shape --------------
// (0040_wave_c_c_tieout.sql:3496-3502: counterparty_id/counterparty_name/
// current_cents/d31_60_cents/d61_90_cents/d91_plus_cents/total_cents/items)

test("toAgingBucketRow maps every bucket (d31_60/d61_90/d91_plus, not b31_60/…) and degrades garbage to a safe empty row", () => {
  const row = toAgingBucketRow({
    counterparty_id: "cp1", counterparty_name: "ACME Sdn Bhd",
    current_cents: 10000, d31_60_cents: 0, d61_90_cents: -500, d91_plus_cents: null,
    total_cents: 9500, items: [],
  });
  assert.equal(row.counterparty_name, "ACME Sdn Bhd");
  assert.equal(row.d91_plus_cents, null);
  assert.equal(row.total_cents, 9500);

  const garbage = toAgingBucketRow("nope");
  assert.equal(garbage.counterparty_id, "");
  assert.equal(garbage.current_cents, null);
  assert.deepEqual(garbage.items, []);
});

test("toAgingBucketRow maps items[] with the DB-computed overdue boolean (0040:3486-3490)", () => {
  const row = toAgingBucketRow({
    counterparty_id: "cp1",
    items: [
      { item_id: "i1", item_kind: "bill", item_date: "2026-04-01", due_date: "2026-05-01", overdue: true, outstanding_cents: 5000, bucket: "d31_60" },
      { item_id: "i2", overdue: "not a bool" },
    ],
  });
  assert.equal(row.items.length, 2);
  assert.equal(row.items[0]?.overdue, true);
  assert.equal(row.items[0]?.bucket, "d31_60");
  assert.equal(row.items[1]?.overdue, false, "a non-boolean overdue flag degrades to false, never a crash");
});

test("agingRowHasBalance is true iff any REAL bucket key is non-null and non-zero", () => {
  const zeroed = toAgingBucketRow({ counterparty_id: "cp1", current_cents: 0, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0 });
  assert.equal(agingRowHasBalance(zeroed), false, "a fully-settled counterparty has no balance to show");
  const unavailable = toAgingBucketRow({ counterparty_id: "cp1" });
  assert.equal(agingRowHasBalance(unavailable), false, "all-null buckets have nothing to show either");
  const owed = toAgingBucketRow({ counterparty_id: "cp1", current_cents: 0, d31_60_cents: 15000 });
  assert.equal(agingRowHasBalance(owed), true);
});

test("agingRowHasOverdueItem [D1 fix] derives from items[].overdue — there is no overdue_cents on the wire", () => {
  const clean = toAgingBucketRow({ counterparty_id: "cp1", items: [{ item_id: "i1", overdue: false }] });
  assert.equal(agingRowHasOverdueItem(clean), false);
  const late = toAgingBucketRow({ counterparty_id: "cp1", items: [{ item_id: "i1", overdue: false }, { item_id: "i2", overdue: true }] });
  assert.equal(agingRowHasOverdueItem(late), true);
  const empty = toAgingBucketRow({ counterparty_id: "cp1" });
  assert.equal(agingRowHasOverdueItem(empty), false);
});

test("toAgingTotals maps the envelope's totals block and degrades absence to null", () => {
  const t = toAgingTotals({ current_cents: 1000, d31_60_cents: 2000, d61_90_cents: 0, d91_plus_cents: 500, total_cents: 3500 });
  assert.equal(t?.total_cents, 3500);
  assert.equal(toAgingTotals(null), null);
  assert.equal(toAgingTotals("garbage"), null);
});

test("AGING_BUCKET_LABELS names exactly the four disjoint half-open buckets, in order", () => {
  assert.deepEqual(
    AGING_BUCKET_LABELS.map((b) => b.label),
    ["current (0-30)", "31-60", "61-90", "91+"],
  );
});

// --- toStatementLineRow: the REAL _statement_core row shape ---------------------
// (0040:3579-3583: event_date/row_type/label/delta_cents/running_balance_cents/
// item_id/allocation_id — no item_kind/due_date/amount_cents/outstanding_cents)

test("toStatementLineRow maps event_date/row_type/label/delta_cents/running_balance_cents", () => {
  const row = toStatementLineRow({
    event_date: "2026-04-01", row_type: "item", label: "invoice",
    delta_cents: 50000, running_balance_cents: 20000, item_id: "i1", allocation_id: null,
  });
  assert.equal(row.row_type, "item");
  assert.equal(row.label, "invoice");
  assert.equal(row.delta_cents, 50000);
  assert.equal(row.running_balance_cents, 20000);
  const garbage = toStatementLineRow({});
  assert.equal(garbage.item_id, null);
  assert.equal(garbage.delta_cents, null);
});

// --- WCC-R3: due_date is an overdue MARKER only, never the bucket driver ---------

test("isOverdueMarker is a plain date comparison — true only when due_date is strictly before as_of", () => {
  assert.equal(isOverdueMarker("2026-04-01", "2026-05-01"), true);
  assert.equal(isOverdueMarker("2026-05-01", "2026-05-01"), false, "due exactly on as_of is not yet overdue");
  assert.equal(isOverdueMarker("2026-06-01", "2026-05-01"), false, "a future due date is not overdue");
  assert.equal(isOverdueMarker(null, "2026-05-01"), false, "no due date recorded yet (existing items keep an honest null, WCC-R4) is never overdue");
});

// --- screen state, including the [D1 fix] fail-closed 'unavailable' arm ---------

test("agingScreenState mirrors the house five-state selector when the shape is available", () => {
  assert.equal(agingScreenState({ loading: true, error: false, totalRows: 0 }), "loading");
  assert.equal(agingScreenState({ loading: false, error: true, totalRows: 0 }), "error");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 0 }), "empty");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 3 }), "ideal");
  assert.equal(agingScreenState({ loading: true, error: false, totalRows: 3 }), "ideal", "rows already in hand outrank a background refresh");
});

test("agingScreenState [D1 fix]: available:false reads 'unavailable', NEVER 'empty' — a shape drift must never look like a clean book", () => {
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 0, available: false }), "unavailable");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 3, available: false }), "unavailable", "even rows in hand don't excuse an unrecognised envelope");
  assert.equal(agingScreenState({ loading: false, error: false, totalRows: 0, available: true }), "empty", "an honestly-shaped, honestly-empty read stays 'empty'");
  assert.equal(agingScreenState({ loading: true, error: false, totalRows: 0, available: false }), "loading", "a request still in flight is 'loading', not a premature 'unavailable'");
});
