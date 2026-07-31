// The /bank recon receipt's SNAPSHOT — split out of reconModel.ts (repo
// file-size discipline, the matchModel.ts/model.ts precedent). PURE: zero
// network, zero React. Every shape below is pinned against the LITERAL
// jsonb_build_object blocks in packages/db/migrations/0040_wave_c_c_tieout.sql
// (clara._bank_recon_terms, ~1150-1383) — fix-wave findings CX6/D7. The
// snapshot's embedded `exceptions` collection is NOT a bank_line_exceptions
// table row (see ReconExceptionEntry below) — reconModel.ts's
// BankLineExceptionRow/toBankLineException remain the shape except_bank_line/
// resolve_bank_line_exception themselves return, a different thing.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

// outstanding_entry_sides (0040:1184-1189): entry_id/posting_date/age_days/
// side/cents — the money key is 'cents', NOT 'amount_cents' (a fallback is
// kept for a near-miss shape, but 'cents' is read first — it is the real key).
export type ReconOutstandingEntrySide = {
  entry_id: string;
  posting_date: string | null;
  side: string | null;
  age_days: number | null;
  amount_cents: number | null;
};
function toOutstandingEntrySide(raw: unknown): ReconOutstandingEntrySide {
  const o = rec(raw);
  return {
    entry_id: s(o.entry_id) ?? "",
    posting_date: s(o.posting_date),
    side: s(o.side),
    age_days: numOrNull(o.age_days),
    amount_cents: numOrNull(o.cents) ?? numOrNull(o.amount_cents),
  };
}

// outstanding_group_items (0040:1237-1241): match_id/uncleared_cents/
// anchor_date/age_days — emitted by the SQL, previously dropped entirely by
// this lane (never mapped, never rendered).
export type ReconOutstandingGroupItem = {
  match_id: string;
  uncleared_cents: number | null;
  anchor_date: string | null;
  age_days: number | null;
};
function toOutstandingGroupItem(raw: unknown): ReconOutstandingGroupItem {
  const o = rec(raw);
  return {
    match_id: s(o.match_id) ?? "",
    uncleared_cents: numOrNull(o.uncleared_cents),
    anchor_date: s(o.anchor_date),
    age_days: numOrNull(o.age_days),
  };
}

export type ReconOutstandingLineSide = {
  line_id: string;
  statement_id: string | null;
  entry_date: string | null;
  description: string | null;
  amount_cents: number | null;
  age_days: number | null;
};
function toOutstandingLineSide(raw: unknown): ReconOutstandingLineSide {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? s(o.id) ?? "",
    statement_id: s(o.statement_id),
    entry_date: s(o.entry_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents),
    age_days: numOrNull(o.age_days),
  };
}

export type ReconOpeningLineage = {
  opening_item_id: string;
  item_ref: string | null;
  item_date: string | null;
  entry_id: string | null;
};
function toOpeningLineage(raw: unknown): ReconOpeningLineage {
  const o = rec(raw);
  return {
    opening_item_id: s(o.opening_item_id) ?? s(o.id) ?? "",
    item_ref: s(o.item_ref),
    item_date: s(o.item_date),
    entry_id: s(o.entry_id),
  };
}

// The snapshot's `exceptions` collection (0040:1278-1287) — NOT a
// bank_line_exceptions table row: no id/reason/resolved_by/resolved_at/
// resolution_note. `exception_id` is the real key to resolve against — a
// prior version of this mapper read `.id`, which is always absent here, so
// every "Resolve" click sent an empty p_exception to the RPC.
export type ReconExceptionEntry = {
  exception_id: string;
  line_id: string;
  statement_id: string | null;
  kind: string;
  status: string;
  resolution_disposition: string | null;
  entry_date: string | null;
  age_days: number | null;
  amount_cents: number | null;
};
function toReconExceptionEntry(raw: unknown): ReconExceptionEntry {
  const o = rec(raw);
  return {
    exception_id: s(o.exception_id) ?? s(o.id) ?? "",
    line_id: s(o.line_id) ?? "",
    statement_id: s(o.statement_id),
    kind: s(o.kind) ?? "bank_error",
    status: s(o.status) ?? "open",
    resolution_disposition: s(o.resolution_disposition),
    entry_date: s(o.entry_date),
    age_days: numOrNull(o.age_days),
    amount_cents: numOrNull(o.amount_cents),
  };
}

export type BankReconciliationSnapshot = {
  outstanding_entries: ReconOutstandingEntrySide[];
  outstanding_group_items: ReconOutstandingGroupItem[];
  outstanding_lines: ReconOutstandingLineSide[];
  exceptions: ReconExceptionEntry[];
  opening_lineage: ReconOpeningLineage[];
  /** [D7; F15/CX6#4] false when the raw snapshot is missing one of the FIVE
   *  known collections as an array, OR carries any OTHER array-valued key
   *  beyond the two intentionally-ignored ones (reversal_pairs_excluded,
   *  acknowledged_outstanding) — an EXACT allowlist, not just a floor. The
   *  caller must treat shapeOk===false as "unavailable" UNCONDITIONALLY
   *  (never partially rendering whatever mapped OK), and never as "a clean
   *  period" just because the mapped arrays happen to be empty. */
  shapeOk: boolean;
};

const SNAPSHOT_ARRAY_KEYS = [
  "outstanding_entry_sides", "outstanding_group_items", "outstanding_line_sides",
  "exceptions", "bank_uncleared_opening",
] as const;

// [F15/CX6#4 fix] the two arrays this lane deliberately never maps into
// BankReconciliationSnapshot — 0040:1515 reversal_pairs_excluded, 0040:1516/
// 1946 acknowledged_outstanding (appended by ack_stale_outstanding_items) —
// present-but-ignored is fine; shapeOk must still hold for these two ONLY.
const SNAPSHOT_IGNORED_ARRAY_KEYS = ["reversal_pairs_excluded", "acknowledged_outstanding"] as const;
const SNAPSHOT_ALLOWED_ARRAY_KEYS: ReadonlySet<string> =
  new Set<string>([...SNAPSHOT_ARRAY_KEYS, ...SNAPSHOT_IGNORED_ARRAY_KEYS]);

export function toSnapshot(raw: unknown): BankReconciliationSnapshot {
  const o = rec(raw);
  // [F15/CX6#4 fix] shapeOk is now an EXACT allowlist over every ARRAY-
  // VALUED key: the five known collections must all be present as arrays,
  // AND no other array-valued key may appear beyond the two ignored above.
  // A future, unmapped collection (e.g. 'outstanding_adjustments') must fail
  // closed here — never render as if the period were silently clean.
  const shapeOk = typeof raw === "object" && raw !== null
    && SNAPSHOT_ARRAY_KEYS.every((k) => Array.isArray(o[k]))
    && Object.keys(o).every((k) => !Array.isArray(o[k]) || SNAPSHOT_ALLOWED_ARRAY_KEYS.has(k));
  return {
    outstanding_entries: arr(o.outstanding_entry_sides).map(toOutstandingEntrySide),
    outstanding_group_items: arr(o.outstanding_group_items).map(toOutstandingGroupItem),
    outstanding_lines: arr(o.outstanding_line_sides).map(toOutstandingLineSide),
    exceptions: arr(o.exceptions).map(toReconExceptionEntry),
    opening_lineage: arr(o.bank_uncleared_opening).map(toOpeningLineage),
    shapeOk,
  };
}

// [voided_receipt follow-up — LANDED] once a statement has no COMPLETE
// receipt, get_bank_reconciliation returns the live PREVIEW as the primary
// body (so re-completion is reachable again) plus the newest VOID receipt's
// stored columns + snapshot under a 'voided_receipt' key (grep-verified
// present, 0040_wave_c_c_tieout.sql ~4085-4114/4313-4316 — the C6 amendment).
// The field list below mirrors the receipt branch's own stored columns
// (0040:4043-4074), which the SQL's v_voided jsonb_build_object matches
// 1:1. Fail-closed: absent, non-object, or a status other than 'void' ⇒
// null, never rendered, never guessed.
export type VoidedReceiptRow = {
  reconciliation_id: string | null;
  status: string;
  /** [F16/CX6#5 fix] the self-closing carry-down ANCHOR (0040:4103) — its
   *  OWN key, distinct from `opening_cents` below (the statement's own
   *  printed figure); fails closed to null when absent, never conflated. */
  opening_anchor_cents: number | null;
  opening_cents: number | null;
  closing_cents: number | null;
  gl_balance_cents: number | null;
  outstanding_cents: number | null;
  excepted_cents: number | null;
  completed_by: string | null;
  completed_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  snapshot: BankReconciliationSnapshot;
};

export function toVoidedReceiptRow(raw: unknown): VoidedReceiptRow | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = rec(raw);
  const status = s(o.status);
  if (status !== "void") return null;
  return {
    reconciliation_id: s(o.reconciliation_id) ?? s(o.id),
    status,
    opening_anchor_cents: numOrNull(o.opening_anchor_cents),
    opening_cents: numOrNull(o.opening_cents) ?? numOrNull(o.statement_opening_cents),
    closing_cents: numOrNull(o.closing_cents) ?? numOrNull(o.statement_closing_cents),
    gl_balance_cents: numOrNull(o.gl_balance_cents),
    outstanding_cents: numOrNull(o.outstanding_cents),
    excepted_cents: numOrNull(o.excepted_cents),
    completed_by: s(o.completed_by),
    completed_at: s(o.completed_at),
    voided_by: s(o.voided_by),
    voided_at: s(o.voided_at),
    voided_reason: s(o.voided_reason),
    snapshot: toSnapshot(o.snapshot),
  };
}
