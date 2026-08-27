// The /bank "certify" (reconciliation) lane — row shapes (split from
// types.ts, repo file-size discipline; see that file's header). Grounded
// against migration 0040 §3/§6: get_bank_reconciliation / complete_bank_
// reconciliation / void_bank_reconciliation. Trimmed to the terms + blockers
// + tie identity this workbench renders — the full snapshot (outstanding
// items/groups breakdown, clara.bank_reconciliations' own detail view) is
// the named gap; see components/bank/reconciliation-section.tsx.

import { s, numOrNull, boolOrNull, strArr, rec } from "./types";

export type ReconMode = "receipt" | "preview";
export type ReconStatus = "complete" | "void" | "open";

export type ReconTermSet = {
  opening_anchor_cents: number | null;
  statement_opening_cents: number | null;
  gl_prime_cents: number | null;
  uncleared_total_cents: number | null;
  unmatched_capacity_prime_cents: number | null;
  excepted_cents: number | null;
  computed_closing_cents: number | null;
  statement_closing_cents: number | null;
  difference_cents: number | null;
};

function toTermSet(raw: unknown): ReconTermSet {
  const o = rec(raw);
  const snap = rec(o.snapshot);
  const st = rec(snap.terms);
  const isReceipt = o.preview === false || s(o.status) === "complete" || s(o.status) === "void";
  const openingAnchor = numOrNull(o.opening_anchor_cents) ?? numOrNull(snap.opening_anchor_cents);
  const closing = numOrNull(o.statement_closing_cents) ?? numOrNull(o.closing_cents) ?? numOrNull(snap.statement_closing_cents);
  const computedClosing = isReceipt ? closing : numOrNull(o.derived_closing_cents);
  return {
    opening_anchor_cents: openingAnchor,
    statement_opening_cents: numOrNull(o.statement_opening_cents),
    gl_prime_cents: numOrNull(o.gl_balance_cents) ?? numOrNull(st.gl_prime_cents),
    uncleared_total_cents: numOrNull(st.uncleared_cents) ?? numOrNull(o.outstanding_cents),
    unmatched_capacity_prime_cents: numOrNull(st.capacity_prime_cents) ?? numOrNull(o.unmatched_capacity_prime_cents),
    excepted_cents: numOrNull(o.excepted_cents) ?? numOrNull(st.excepted_cents),
    computed_closing_cents: computedClosing,
    statement_closing_cents: closing,
    difference_cents: numOrNull(o.difference_cents) ?? (isReceipt ? 0 : null),
  };
}

export type BankReconciliationView = {
  mode: ReconMode;
  recon_id: string | null;
  statement_id: string;
  bank_account_id: string | null;
  coa_account_code: string | null;
  status: ReconStatus | string;
  terms: ReconTermSet;
  /** entry-/line-side items older than 60 days before period_end that need
   *  p_ack_outstanding-by-id before complete_bank_reconciliation proceeds. */
  stale_outstanding_ids: string[];
  /** the server-side completion verdict. null (unreported) reads as "cannot
   *  complete" — fail-closed, never re-derived. */
  can_complete: boolean | null;
  /** named reasons the server refuses — rendered verbatim, never invented. */
  blockers: string[];
  completed_by: string | null;
  completed_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

export function toBankReconciliationView(raw: unknown): BankReconciliationView {
  const o = rec(raw);
  const status = s(o.status);
  const mode: ReconMode = o.preview === false ? "receipt" : o.preview === true ? "preview" : status === "complete" ? "receipt" : "preview";
  return {
    mode,
    recon_id: s(o.reconciliation_id) ?? s(o.recon_id) ?? s(o.id),
    statement_id: s(o.statement_id) ?? "",
    bank_account_id: s(o.bank_account_id),
    coa_account_code: s(o.coa_account_code),
    status: status ?? "open",
    terms: toTermSet(o),
    stale_outstanding_ids: strArr(o.stale_outstanding_ids),
    can_complete: boolOrNull(o.can_complete),
    blockers: strArr(o.blockers),
    completed_by: s(o.completed_by),
    completed_at: s(o.completed_at),
    voided_by: s(o.voided_by),
    voided_at: s(o.voided_at),
    voided_reason: s(o.voided_reason),
  };
}

/** Mirrors the dashboard's own `reconTieState`: ONE derived boolean off DB
 *  numbers, never a client-invented figure. `unavailable` whenever the DB did
 *  not return every term the identity needs. */
export type ReconTieState = "tied" | "variance" | "unavailable";

export function reconTieState(view: Pick<BankReconciliationView, "terms">): ReconTieState {
  const t = view.terms;
  const vals = [
    t.opening_anchor_cents, t.gl_prime_cents, t.uncleared_total_cents,
    t.unmatched_capacity_prime_cents, t.excepted_cents, t.computed_closing_cents,
    t.statement_closing_cents, t.difference_cents,
  ];
  if (vals.some((v) => v === null || typeof v !== "number" || !Number.isFinite(v))) return "unavailable";
  return t.difference_cents === 0 ? "tied" : "variance";
}

/** [D8/CX9 precedent] keyed OFF THE SERVER VERDICT ONLY — a preview gate; the
 *  DB's own refusal at complete_bank_reconciliation is the authority either
 *  way. */
export function canCompleteReconciliation(
  view: Pick<BankReconciliationView, "status" | "can_complete" | "stale_outstanding_ids">,
  ackedStaleIds: ReadonlySet<string>,
): boolean {
  if (view.status !== "open") return false;
  if (view.can_complete !== true) return false;
  return view.stale_outstanding_ids.every((id) => ackedStaleIds.has(id));
}
