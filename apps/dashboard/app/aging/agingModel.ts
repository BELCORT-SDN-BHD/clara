// Wave C-c — /aging's pure model (design v2.1 §6 / §4.4). PURE: zero network,
// zero React (the bank/model.ts precedent). Every cents figure here is a
// DB-owned value from ar_aging/ap_aging/customer_statement/supplier_statement
// — this module groups, labels, and derives ONE display-only date marker
// (`isOverdueMarker`, a plain string comparison, never a money figure). It
// NEVER sums a bucket or a running balance: CLAUDE.md's "the DB owns every
// number" law means a client-side grand-total row is out of scope for this
// lane even though it would look harmless — if one is wanted, the DB must
// return it (it does, as `totals` — see AgingTotals below).
//
// [D1 fix, 0040 as-built] `_aging_core`/`_statement_core` return a SINGLE
// jsonb OBJECT (0040:3494-3508 / 3576-3588), never an array — the prior
// version of agingApi.ts unwrapped it with `Array.isArray(out) ? out : []`,
// which is ALWAYS false on an object, so /aging rendered empty forever. The
// real per-counterparty keys are `d31_60_cents/d61_90_cents/d91_plus_cents`
// (this file previously read `b31_60_cents` etc — nothing) and `items[]`
// (each carrying a DB-computed `overdue` boolean; there is no `overdue_
// cents` anywhere in the SQL). The real statement row keys are `event_date/
// row_type/label/delta_cents/running_balance_cents/item_id/allocation_id` —
// no item_kind/due_date/amount_cents/outstanding_cents/description.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

export type AgingDomain = "ar" | "ap";

// ---------------------------------------------------------------------------
// ar_aging / ap_aging(client, as_of, p_segment) — design §6: "per-counterparty
// buckets current(0-30) / 31-60 / 61-90 / 91+ (disjoint, half-open), from
// item_date, outstanding via _subledger_outstanding_asof; due_date marker per
// item." One row per counterparty; bucket cents are already the DB's sums.
// ---------------------------------------------------------------------------

/** One open item inside a bucket row (0040:3486-3490). `overdue` is the
 *  DB-computed WCC-R3 marker (`due_date < as_of`) — never recomputed here. */
export type AgingItemRow = {
  item_id: string;
  item_kind: string | null;
  item_date: string | null;
  due_date: string | null;
  overdue: boolean;
  outstanding_cents: number | null;
  bucket: string | null;
};

function toAgingItemRow(raw: unknown): AgingItemRow {
  const o = rec(raw);
  return {
    item_id: s(o.item_id) ?? "",
    item_kind: s(o.item_kind),
    item_date: s(o.item_date),
    due_date: s(o.due_date),
    overdue: bool(o.overdue),
    outstanding_cents: numOrNull(o.outstanding_cents),
    bucket: s(o.bucket),
  };
}

export type AgingBucketRow = {
  counterparty_id: string;
  counterparty_name: string | null;
  current_cents: number | null;
  d31_60_cents: number | null;
  d61_90_cents: number | null;
  d91_plus_cents: number | null;
  total_cents: number | null;
  items: AgingItemRow[];
};

export function toAgingBucketRow(raw: unknown): AgingBucketRow {
  const o = rec(raw);
  return {
    counterparty_id: s(o.counterparty_id) ?? "",
    counterparty_name: s(o.counterparty_name),
    current_cents: numOrNull(o.current_cents),
    d31_60_cents: numOrNull(o.d31_60_cents),
    d61_90_cents: numOrNull(o.d61_90_cents),
    d91_plus_cents: numOrNull(o.d91_plus_cents),
    total_cents: numOrNull(o.total_cents),
    items: Array.isArray(o.items) ? o.items.map(toAgingItemRow) : [],
  };
}

/** The envelope's `totals` block (0040:3503-3508) — the DB's own grand total
 *  across every counterparty on this read, rendered verbatim; this lane
 *  still never sums one client-side. */
export type AgingTotals = {
  current_cents: number | null;
  d31_60_cents: number | null;
  d61_90_cents: number | null;
  d91_plus_cents: number | null;
  total_cents: number | null;
};

export function toAgingTotals(raw: unknown): AgingTotals | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = rec(raw);
  return {
    current_cents: numOrNull(o.current_cents),
    d31_60_cents: numOrNull(o.d31_60_cents),
    d61_90_cents: numOrNull(o.d61_90_cents),
    d91_plus_cents: numOrNull(o.d91_plus_cents),
    total_cents: numOrNull(o.total_cents),
  };
}

export const AGING_BUCKET_LABELS: { key: keyof Pick<AgingBucketRow, "current_cents" | "d31_60_cents" | "d61_90_cents" | "d91_plus_cents">; label: string }[] = [
  { key: "current_cents", label: "current (0-30)" },
  { key: "d31_60_cents", label: "31-60" },
  { key: "d61_90_cents", label: "61-90" },
  { key: "d91_plus_cents", label: "91+" }, // gitleaks:allow — a bucket column name, not a key
];

/** A row is "worth showing" when it carries any non-zero, non-null bucket —
 *  a zeroed-out counterparty (fully settled) is filtered by the caller, not
 *  invented here; this is just the predicate. */
export function agingRowHasBalance(row: AgingBucketRow): boolean {
  return [row.current_cents, row.d31_60_cents, row.d61_90_cents, row.d91_plus_cents].some(
    (v) => typeof v === "number" && v !== 0,
  );
}

/** [D1 fix] the overdue badge — there is no `overdue_cents` on the wire
 *  (grep-verified zero hits in 0040_wave_c_c_tieout.sql); the DB marks each
 *  ITEM overdue instead. True iff any item in this counterparty's row is
 *  overdue — a DB fact, read verbatim, never a client date comparison. */
export function agingRowHasOverdueItem(row: Pick<AgingBucketRow, "items">): boolean {
  return row.items.some((i) => i.overdue);
}

// ---------------------------------------------------------------------------
// customer_statement / supplier_statement(client, cp, from, to) — design §6:
// "running-balance rows keyed on item/effective dates (the _statement_core
// PORT shape on the 0037 grain)". Real row shape (0040:3579-3583): event_date/
// row_type ('item'|'allocation')/label/delta_cents/running_balance_cents/
// item_id/allocation_id — NOT item_kind/due_date/amount_cents/description.
// ---------------------------------------------------------------------------

export type StatementLineRow = {
  event_date: string | null;
  row_type: string | null;
  label: string | null;
  delta_cents: number | null;
  running_balance_cents: number | null;
  item_id: string | null;
  allocation_id: string | null;
};

export function toStatementLineRow(raw: unknown): StatementLineRow {
  const o = rec(raw);
  return {
    event_date: s(o.event_date),
    row_type: s(o.row_type),
    label: s(o.label),
    delta_cents: numOrNull(o.delta_cents),
    running_balance_cents: numOrNull(o.running_balance_cents),
    item_id: s(o.item_id),
    allocation_id: s(o.allocation_id),
  };
}

/** WCC-R3: "aging buckets measure days since the document date; due_date is
 *  an overdue MARKER, never the bucket driver." Plain string-date comparison
 *  (ISO yyyy-mm-dd sorts lexically) — no arithmetic on money, just a flag.
 *  Kept for any caller with a real due_date in hand; the aging bucket table
 *  itself now uses the DB-computed `items[].overdue` (agingRowHasOverdueItem)
 *  since _statement_core's rows carry no due_date at all. */
export function isOverdueMarker(dueDate: string | null, asOf: string): boolean {
  if (!dueDate) return false;
  return dueDate < asOf;
}

// ---------------------------------------------------------------------------
// Screen state (the queue/model.ts + bank/matchModel.ts bankScreenState
// precedent, reimplemented locally to keep this feature's model free of a
// cross-lane import — bank/matchModel.ts's own header states the same
// discipline for its COA predicates).
// ---------------------------------------------------------------------------

export type ScreenState = "loading" | "error" | "empty" | "partial" | "unavailable" | "ideal";

/** [D1 fix] `available` is a SHAPE signal, not a data signal: false means the
 *  RPC's envelope did not carry the collection key this reader expects (a
 *  future shape drift), and MUST read as `unavailable`, never `empty` — an
 *  empty table because the read failed is not the same fact as an empty
 *  table because there is genuinely nothing owed. Defaults to true so a
 *  request still in flight (nothing decoded yet) reads as `loading`, not a
 *  premature `unavailable`. */
export function agingScreenState(env: { loading: boolean; error: boolean; totalRows: number; available?: boolean }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.available === false) return "unavailable";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}
