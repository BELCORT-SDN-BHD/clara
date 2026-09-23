// #947 — the payroll net-pay settlement lane. Row shapes for
// clara.get_payroll_settlement_candidates(p_client) (migration 0298), split
// from match-types.ts (this file's own concern — a #657-shaped Settlement
// candidate row, not a bank-match one) per the repo's file-size discipline.

import { s, numOrNull, rec } from "./types";

export type PayrollSettlementCandidateLine = {
  line_id: string;
  statement_id: string;
  bank_account_id: string;
  bank_account_display: string | null;
  entry_date: string | null;
  value_date: string | null;
  description: string | null;
  /** Signed cents, negative — money leaving the bank. Always the EXACT
   *  negative of the run's own `unsettled_cents` (Q3/SYNTHESIS J2's own law:
   *  a deterministic basis, never a score, never a tolerance). */
  amount_cents: number;
  date_delta_days: number | null;
  class_hint: string | null;
};

function toPayrollSettlementCandidateLine(raw: unknown): PayrollSettlementCandidateLine {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? "",
    statement_id: s(o.statement_id) ?? "",
    bank_account_id: s(o.bank_account_id) ?? "",
    bank_account_display: s(o.bank_account_display),
    entry_date: s(o.entry_date),
    value_date: s(o.value_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents) ?? 0,
    date_delta_days: numOrNull(o.date_delta_days),
    class_hint: s(o.class_hint),
  };
}

export type PayrollSettlementRun = {
  /** The posted payroll entry (clara.journal_entries.id) — what
   *  clara.settle_payroll_net_pay's `p_entry` names. */
  entry_id: string;
  document_id: string | null;
  filing_id: string | null;
  posting_date: string | null;
  period_month: string | null;
  net_pay_cents: number;
  /** The amount still owed — the figure a candidate line must equal exactly. */
  unsettled_cents: number;
  /** Never auto-chosen (AC4): a run with two equally-matching lines carries
   *  BOTH here, and the person names one. */
  candidates: PayrollSettlementCandidateLine[];
};

export function toPayrollSettlementRun(raw: unknown): PayrollSettlementRun {
  const o = rec(raw);
  const candidatesRaw = o.candidates;
  return {
    entry_id: s(o.entry_id) ?? "",
    document_id: s(o.document_id),
    filing_id: s(o.filing_id),
    posting_date: s(o.posting_date),
    period_month: s(o.period_month),
    net_pay_cents: numOrNull(o.net_pay_cents) ?? 0,
    unsettled_cents: numOrNull(o.unsettled_cents) ?? 0,
    candidates: (Array.isArray(candidatesRaw) ? candidatesRaw : []).map(toPayrollSettlementCandidateLine),
  };
}
