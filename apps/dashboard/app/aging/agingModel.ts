// Wave C-c — /aging's pure model (design v2.1 §6 / §4.4). PURE: zero network,
// zero React (the bank/model.ts precedent). Every cents figure here is a
// DB-owned value from ar_aging/ap_aging/customer_statement/supplier_statement
// — this module groups, labels, and derives ONE display-only date marker
// (`isOverdueMarker`, a plain string comparison, never a money figure). It
// NEVER sums a bucket or a running balance: CLAUDE.md's "the DB owns every
// number" law means a client-side grand-total row is out of scope for this
// lane even though it would look harmless — if one is wanted, the DB must
// return it.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
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

export type AgingBucketRow = {
  counterparty_id: string;
  counterparty_name: string | null;
  current_cents: number | null;
  b31_60_cents: number | null;
  b61_90_cents: number | null;
  b91_plus_cents: number | null;
  total_cents: number | null;
  /** WCC-R3: an overdue marker (any item past its due_date), never the bucket
   *  driver — item_date drives buckets, due_date only flags. DB-computed. */
  overdue_cents: number | null;
};

export function toAgingBucketRow(raw: unknown): AgingBucketRow {
  const o = rec(raw);
  return {
    counterparty_id: s(o.counterparty_id) ?? "",
    counterparty_name: s(o.counterparty_name),
    current_cents: numOrNull(o.current_cents),
    b31_60_cents: numOrNull(o.b31_60_cents),
    b61_90_cents: numOrNull(o.b61_90_cents),
    b91_plus_cents: numOrNull(o.b91_plus_cents),
    total_cents: numOrNull(o.total_cents),
    overdue_cents: numOrNull(o.overdue_cents),
  };
}

export const AGING_BUCKET_LABELS: { key: keyof Pick<AgingBucketRow, "current_cents" | "b31_60_cents" | "b61_90_cents" | "b91_plus_cents">; label: string }[] = [
  { key: "current_cents", label: "current (0-30)" },
  { key: "b31_60_cents", label: "31-60" },
  { key: "b61_90_cents", label: "61-90" },
  { key: "b91_plus_cents", label: "91+" },
];

/** A row is "worth showing" when it carries any non-zero, non-null bucket —
 *  a zeroed-out counterparty (fully settled) is filtered by the caller, not
 *  invented here; this is just the predicate. */
export function agingRowHasBalance(row: AgingBucketRow): boolean {
  return [row.current_cents, row.b31_60_cents, row.b61_90_cents, row.b91_plus_cents].some(
    (v) => typeof v === "number" && v !== 0,
  );
}

// ---------------------------------------------------------------------------
// customer_statement / supplier_statement(client, cp, from, to) — design §6:
// "running-balance rows keyed on item/effective dates (the _statement_core
// PORT shape on the 0037 grain)".
// ---------------------------------------------------------------------------

export type StatementLineRow = {
  item_id: string;
  item_kind: string | null;
  item_date: string | null;
  due_date: string | null;
  effective_date: string | null;
  description: string | null;
  amount_cents: number | null;
  outstanding_cents: number | null;
  running_balance_cents: number | null;
};

export function toStatementLineRow(raw: unknown): StatementLineRow {
  const o = rec(raw);
  return {
    item_id: s(o.item_id) ?? s(o.id) ?? "",
    item_kind: s(o.item_kind),
    item_date: s(o.item_date),
    due_date: s(o.due_date),
    effective_date: s(o.effective_date),
    description: s(o.description) ?? s(o.memo),
    amount_cents: numOrNull(o.amount_cents),
    outstanding_cents: numOrNull(o.outstanding_cents),
    running_balance_cents: numOrNull(o.running_balance_cents),
  };
}

/** WCC-R3: "aging buckets measure days since the document date; due_date is
 *  an overdue MARKER, never the bucket driver." Plain string-date comparison
 *  (ISO yyyy-mm-dd sorts lexically) — no arithmetic on money, just a flag. */
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

export type ScreenState = "loading" | "error" | "empty" | "partial" | "ideal";

export function agingScreenState(env: { loading: boolean; error: boolean; totalRows: number }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}
