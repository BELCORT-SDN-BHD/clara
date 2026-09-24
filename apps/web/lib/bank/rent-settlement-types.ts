// #949 — the tenancy rent lane's own wire shapes for the /bank Matching tab:
// clara.get_rent_settlement_candidates(p_client) and
// clara.get_tenancy_deposit_coding(p_client) (migration 0300), split from
// payroll-settlement-types.ts for the same file-size discipline that split THAT
// file out of match-types.ts — a rent month and a payroll run are two instances
// of CONTEXT.md's "Settlement candidate row", not one shape with a flag.
//
// Every shape here is a DEFENSIVE projection: a renamed or absent key degrades
// to a safe default rather than throwing (the reviewCardTypes.ts idiom the rest
// of lib/bank follows). Nothing here computes: every figure is the one the
// database sent.

import { s, numOrNull, bool, rec } from "./types";

export type RentSettlementCandidateLine = {
  line_id: string;
  statement_id: string;
  bank_account_id: string;
  bank_account_display: string | null;
  entry_date: string | null;
  value_date: string | null;
  description: string | null;
  /** Signed cents, negative — money leaving the bank. Always the EXACT negative
   *  of the month's own `unsettled_cents` (#657's own law, restated by #947 and
   *  #949: a deterministic basis, never a score and never a tolerance). */
  amount_cents: number;
  date_delta_days: number | null;
  class_hint: string | null;
};

function toCandidateLine(raw: unknown): RentSettlementCandidateLine {
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

export type RentSettlementMonth = {
  /** The posted rent entry (clara.journal_entries.id) — what
   *  clara.settle_rent_payable's `p_entry` names. */
  entry_id: string;
  plan_id: string | null;
  document_id: string | null;
  filing_id: string | null;
  posting_date: string | null;
  /** 'YYYY-MM-01', the month the rent was recognised in. */
  period_month: string | null;
  payable_account_code: string | null;
  rent_cents: number;
  /** The amount still owed — the figure a candidate line must equal exactly. */
  unsettled_cents: number;
  /** How wide a window around the posting date was searched for candidates, so
   *  a person is never told less than was looked for (fix-round finding
   *  ADV-11). Null on a database that predates the field. */
  candidate_window_days: number | null;
  /** Never auto-chosen: a month with two equally-matching lines carries BOTH
   *  here, and the person names one. */
  candidates: RentSettlementCandidateLine[];
};

export function toRentSettlementMonth(raw: unknown): RentSettlementMonth {
  const o = rec(raw);
  const candidatesRaw = o.candidates;
  return {
    entry_id: s(o.entry_id) ?? "",
    plan_id: s(o.plan_id),
    document_id: s(o.document_id),
    filing_id: s(o.filing_id),
    posting_date: s(o.posting_date),
    period_month: s(o.period_month),
    payable_account_code: s(o.payable_account_code),
    rent_cents: numOrNull(o.rent_cents) ?? 0,
    unsettled_cents: numOrNull(o.unsettled_cents) ?? 0,
    candidate_window_days: numOrNull(o.candidate_window_days),
    candidates: (Array.isArray(candidatesRaw) ? candidatesRaw : []).map(toCandidateLine),
  };
}

/** AC5's OFFER, and it is only an offer: this lane has no write door for a
 *  deposit at all, because signing a tenancy does not say the money moved. The
 *  coding itself is the ordinary coding lane's act. */
export type TenancyDepositOffer = {
  document_id: string | null;
  deposit_cents: number;
  printed_raw: string | null;
  recorded_at: string | null;
  basis_kind: string | null;
  term_start: string | null;
  proposed_account_code: string | null;
  proposed_account_name: string | null;
  /** False when this client's chart does not hold 1120 — the person is TOLD
   *  rather than offered a code their chart cannot take. */
  proposed_account_in_chart: boolean;
  /** This deposit's own FIFO share of the 1120 balance (fix-round ADV-06), not
   *  the account's whole balance — which travels separately below. */
  coded_cents: number;
  deposits_account_balance_cents: number | null;
  deposits_sharing_account: number | null;
  already_coded: boolean;
  candidates: RentSettlementCandidateLine[];
};

export function toTenancyDepositOffer(raw: unknown): TenancyDepositOffer {
  const o = rec(raw);
  const candidatesRaw = o.candidates;
  return {
    document_id: s(o.document_id),
    deposit_cents: numOrNull(o.deposit_cents) ?? 0,
    printed_raw: s(o.printed_raw),
    recorded_at: s(o.recorded_at),
    basis_kind: s(o.basis_kind),
    term_start: s(o.term_start),
    proposed_account_code: s(o.proposed_account_code),
    proposed_account_name: s(o.proposed_account_name),
    proposed_account_in_chart: bool(o.proposed_account_in_chart),
    coded_cents: numOrNull(o.coded_cents) ?? 0,
    deposits_account_balance_cents: numOrNull(o.deposits_account_balance_cents),
    deposits_sharing_account: numOrNull(o.deposits_sharing_account),
    already_coded: bool(o.already_coded),
    candidates: (Array.isArray(candidatesRaw) ? candidatesRaw : []).map(toCandidateLine),
  };
}
