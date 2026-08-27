// The /bank matching workbench — row shapes (split from types.ts, repo
// file-size discipline; see that file's header). Grounded against migration
// 0038 §4.5/§4.6 (match_bank_line / unmatch_bank_match / settle_from_bank_
// line / complete_pending_match), 0040 §6 (list_unmatched_lines), and
// migration 0021 (counterparties, a plain RLS table). F-A3 PR-3 (0129,
// Annex I): the rule-arity overloads on match_bank_line/settle_from_bank_line
// (`p_via_rule`) are RETIRED WHOLE — every input type here is the SINGLE
// post-0129 arity, never the retired rule-aware shape.

import { s, numOrNull, bool, rec } from "./types";

export type OpenItemDomain = "ar" | "ap";

export type OpenItemRow = {
  id: string;
  domain: OpenItemDomain;
  counterparty_id: string;
  item_kind: string;
  item_date: string;
  due_date: string | null;
  amount_cents: number;
  /** derived (amount + Σ allocations), DB-computed — never recomputed here. */
  outstanding_cents: number | null;
  entry_id: string;
};

export function toOpenItem(raw: unknown): OpenItemRow {
  const o = rec(raw);
  const domain = s(o.domain);
  return {
    id: s(o.id) ?? "",
    domain: (domain === "ap" ? "ap" : "ar") as OpenItemDomain,
    counterparty_id: s(o.counterparty_id) ?? "",
    item_kind: s(o.item_kind) ?? "",
    item_date: s(o.item_date) ?? "",
    due_date: s(o.due_date),
    amount_cents: numOrNull(o.amount_cents) ?? 0,
    outstanding_cents: numOrNull(o.outstanding_cents),
    entry_id: s(o.entry_id) ?? "",
  };
}

export type MatchCandidateEntryRow = {
  entry_id: string;
  posting_date: string | null;
  memo: string | null;
  coding_kind: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  high_stakes: boolean;
  /** design §3: per-side absolute bounds, gross per side on THIS bank
   *  account — a DB-computed preview only (the entry-exhaustion belt is the
   *  authority at write time). */
  debit_remaining_cents: number | null;
  credit_remaining_cents: number | null;
};

export function toMatchCandidateEntry(raw: unknown): MatchCandidateEntryRow {
  const o = rec(raw);
  return {
    entry_id: s(o.entry_id) ?? s(o.id) ?? "",
    posting_date: s(o.posting_date),
    memo: s(o.memo),
    coding_kind: s(o.coding_kind),
    counterparty_id: s(o.counterparty_id),
    counterparty_name: s(o.counterparty_name),
    high_stakes: bool(o.high_stakes),
    debit_remaining_cents: numOrNull(o.debit_remaining_cents),
    credit_remaining_cents: numOrNull(o.credit_remaining_cents),
  };
}

export type UnmatchedLineRow = {
  line_id: string;
  statement_id: string;
  bank_account_id: string | null;
  entry_date: string | null;
  description: string | null;
  amount_cents: number | null;
  class_hint: string | null;
};

export function toUnmatchedLine(raw: unknown): UnmatchedLineRow {
  const o = rec(raw);
  return {
    line_id: s(o.line_id) ?? s(o.id) ?? "",
    statement_id: s(o.statement_id) ?? "",
    bank_account_id: s(o.bank_account_id),
    entry_date: s(o.entry_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents),
    class_hint: s(o.class_hint),
  };
}

export type MatchEntryInput = { entry_id: string; matched_cents: number };
export type BankAdjustmentInput = { account_code: string; amount_cents: number };
export type SettleAllocationInput = { item_id: string; amount_cents: number };

/** settle_from_bank_line's composite receipt — shape NOT pinned by the design
 *  (only the two branches, below/at-threshold, are). Rendered generically: a
 *  `status` containing "pending"/"draft" is the pending-match reservation
 *  (checker approval owed in the JE review queue); anything else is the
 *  immediate settle+match receipt. */
export type SettleReceipt = Record<string, unknown> & {
  entry_id?: string;
  match_id?: string;
  status?: string;
};

// ---------------------------------------------------------------------------
// Counterparties (migration 0021) — plain RLS table read, for the settle-
// from-line counterparty picker.
// ---------------------------------------------------------------------------

export type CounterpartyKind = "vendor" | "customer";

export type CounterpartyRow = {
  id: string;
  kind: CounterpartyKind | string;
  name: string;
  registration_no: string | null;
  tin: string | null;
  merged_into: string | null;
  retired_at: string | null;
};

export function toCounterparty(raw: unknown): CounterpartyRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    kind: s(o.kind) ?? "vendor",
    name: s(o.name) ?? "",
    registration_no: s(o.registration_no),
    tin: s(o.tin),
    merged_into: s(o.merged_into),
    retired_at: s(o.retired_at),
  };
}

/** bankApi.ts's own settlement-domain law: customer -> ar, vendor -> ap. */
export function settlementDomainFor(kind: CounterpartyKind | string): OpenItemDomain {
  return kind === "customer" ? "ar" : "ap";
}
