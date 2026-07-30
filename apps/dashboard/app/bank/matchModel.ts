// The /bank matching workspace — pure model, split out of model.ts (repo file-size
// discipline). PURE: zero network, zero React. Continues model.ts's numbering — the
// design citations below are the SAME design (docs/plan/wave-c-b-bank-design.md +
// -part2.md); every function here is a CLIENT-SIDE PREVIEW of an identity the DB
// enforces under lock at write time (part1 §3/§4.5/§4.6) — never the authority.

import type { BankStatementLineRow, MatchCandidateEntryRow } from "./model";

// ---------------------------------------------------------------------------
// Selection model for the matching workspace (design part1 §4.6 / part2 §4.7):
// "open items by counterparty · candidate entries with per-side remaining capacity
// · charge/adjustment slots". A generic toggle set (the queue toggleSelect idiom)
// plus the group-tie PREVIEW the workspace uses to enable/disable the submit
// action and the period-exception checkbox before the DB is ever asked.
// ---------------------------------------------------------------------------

export function toggleInSet<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

export type EntryAllocation = { entry_id: string; matched_cents: number };
export type BankAdjustment = { account_code: string; amount_cents: number };

export function upsertEntryAllocation(
  list: readonly EntryAllocation[],
  entryId: string,
  matchedCents: number,
): EntryAllocation[] {
  const i = list.findIndex((a) => a.entry_id === entryId);
  if (matchedCents === 0) return list.filter((a) => a.entry_id !== entryId);
  const next = { entry_id: entryId, matched_cents: matchedCents };
  if (i < 0) return [...list, next];
  return list.map((a, idx) => (idx === i ? next : a));
}

export function removeEntryAllocation(list: readonly EntryAllocation[], entryId: string): EntryAllocation[] {
  return list.filter((a) => a.entry_id !== entryId);
}

/** design §4.6: the group-tie identity (§3) is Σ member lines = Σ member entries +
 *  Σ adjustments, exact to the sen. A client-side PREVIEW only — the group-tie belt
 *  is the authority. */
export type GroupTiePreview = {
  lineSum: number;
  entrySum: number;
  adjustmentSum: number;
  diffCents: number;
  ties: boolean;
};

export function matchGroupTiePreview(
  selectedLines: readonly BankStatementLineRow[],
  entryAllocations: readonly EntryAllocation[],
  adjustments: readonly BankAdjustment[],
): GroupTiePreview {
  const lineSum = selectedLines.reduce((sum, l) => sum + l.amount_cents, 0);
  const entrySum = entryAllocations.reduce((sum, a) => sum + a.matched_cents, 0);
  const adjustmentSum = adjustments.reduce((sum, a) => sum + a.amount_cents, 0);
  const diffCents = lineSum - (entrySum + adjustmentSum);
  return { lineSum, entrySum, adjustmentSum, diffCents, ties: diffCents === 0 };
}

/** design §4.6 `wrong_period`: a member ENTRY whose posting_date falls after the
 *  statement's period_end is not a structural refusal — it is a recorded,
 *  acknowledged exception (`p_ack_period_exceptions`). This is the client-side
 *  detector that decides whether the ack checkbox must be shown/required BEFORE the
 *  DB is asked; the DB re-derives the same fact and is the authority. */
export function entryIsPeriodException(
  entryPostingDate: string | null,
  statementPeriodEnd: string,
): boolean {
  if (!entryPostingDate) return false;
  return entryPostingDate > statementPeriodEnd;
}

export function anyPeriodException(
  entries: readonly MatchCandidateEntryRow[],
  selectedEntryIds: readonly string[],
  statementPeriodEnd: string,
): boolean {
  const chosen = new Set(selectedEntryIds);
  return entries.some((e) => chosen.has(e.entry_id) && entryIsPeriodException(e.posting_date, statementPeriodEnd));
}

// ---------------------------------------------------------------------------
// settle_from_bank_line's domain law (design §4.6): "Domain from the counterparty's
// KIND, never the cash sign — sign is validated as consistency after". A pure
// PREVIEW of that law so the workbench can show the sanctioned workaround BEFORE
// submitting a call the DB will refuse `refund_not_supported`.
// ---------------------------------------------------------------------------

export type SettlementDomain = "receipt" | "payment" | "refund_not_supported";

export function settlementDomainFor(counterpartyKind: "customer" | "vendor", lineAmountCents: number): SettlementDomain {
  const inflow = lineAmountCents > 0; // design §4.2: + = into the account
  if (counterpartyKind === "customer") return inflow ? "receipt" : "refund_not_supported";
  return inflow ? "refund_not_supported" : "payment";
}

export const REFUND_WORKAROUND_MESSAGE =
  "This counterparty/direction pair is a refund — settle_from_bank_line does not support it directly " +
  "(design §4.6). Workaround: post a generic entry with a counterparty-stamped control leg, let C-a mint " +
  "the adjustment open item, apply_open_items against the residue, then match_bank_line the line to that " +
  "entry.";

// ---------------------------------------------------------------------------
// Refusal-reason copy (the KbRuleProposalCard idiom: the CLR badge rides ALONGSIDE
// the DB's verbatim message, never in place of it — this only adds a friendlier
// gloss for the taxonomy the design names verbatim, part1 §4.3/§4.6). An unnamed
// token still renders — via the caller's own `err.reason` — just without a gloss.
// ---------------------------------------------------------------------------

export const BANK_REFUSAL_COPY: Record<string, string> = {
  // ingest (part1 §4.3 fail_statement_facts taxonomy)
  header_unreadable: "The statement's printed header (institution, account, period, opening/closing) could not be read independently — re-scan or enter it by hand.",
  totals_unreadable: "The printed TOTAL DEBIT / TOTAL CREDIT could not be read — the mandatory cross-check failed.",
  readers_disagree: "The two readers did not corroborate the same header/lines — this statement was not persisted.",
  chain_broken: "opening + Σ(line amounts) ≠ closing for this statement.",
  continuity_mismatch: "This statement's opening does not match the adjacent statement's closing.",
  duplicate_period: "A live statement already covers this exact period for this account.",
  overlapping_period: "This period overlaps a live statement already on this account.",
  non_myr_statement: "This statement is not in MYR — multi-currency is a later wave.",
  account_unregistered: "No bank account is registered for this institution/account number yet.",
  account_inactive: "The matching bank account is deactivated — reactivate it to resume ingest.",
  statement_multi_client: "This document is filed to more than one client — a statement needs exactly one.",
  period_invalid: "period_start must not be after period_end.",
  line_date_out_of_period: "A line's entry_date falls outside the statement's period.",
  consent_inactive: "Statement-extraction consent is not active for this client yet.",
  // matching (part1 §4.6)
  wrong_account: "An entry with no movement on this account, or a line/account mismatch.",
  wrong_period: "A member line's statement is not live.",
  amount_beyond_tolerance: "The group does not tie and no adjustment covers the gap (tolerance is zero).",
  already_matched: "This line or entry side is already fully committed to another group.",
  reversed_entry: "A reversed entry cannot be a match member.",
  reversal_mirror: "A reversal mirror cannot be a match member.",
  adjustment_account_invalid: "The adjustment account must be active, non-control, expense- or income-typed, and not the bank account itself.",
  live_bank_match_present: "This entry is a live match member — unmatch first.",
  // settle_from_bank_line
  refund_not_supported: REFUND_WORKAROUND_MESSAGE,
  bank_account_invalid: "The settlement account must be an active, asset-typed, non-control account on this chart.",
  control_account_invalid: "That control account is not an active account of the right class for this client.",
  ar_control_not_unique: "This client has more than one active receivable control account — name one explicitly.",
  ap_control_not_unique: "This client has more than one active payable control account — name one explicitly.",
  allocations_malformed: "Each allocation must state an item_id and a positive whole amount_cents.",
  allocations_duplicated: "The same open item appears twice in one allocation set.",
  allocations_exceed_receipt: "The allocations exceed the settlement amount (plus any discount/charge).",
  amount_invalid: "The amount must be a positive whole number of cents.",
};

export function describeBankRefusal(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return BANK_REFUSAL_COPY[reason] ?? null;
}

// ---------------------------------------------------------------------------
// Five-screen-state selector (DIRECTION §4.5 — the queue/model.ts precedent,
// generic here so both the accounts panel and the statements list share it).
// ---------------------------------------------------------------------------

export type ScreenState = "loading" | "error" | "empty" | "partial" | "ideal";

export function bankScreenState(env: { loading: boolean; error: boolean; totalRows: number }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}

// ---------------------------------------------------------------------------
// COA picker filters (design §4.6 adjustment account; §4.1 the bank account itself
// is asset-typed non-control). Pure predicates over accounts/accountsModel's
// AccountRow shape (structurally compatible — this module does not import it, to
// keep /bank's model free of a cross-lane dependency; the shapes are kept in sync
// by the shared coa_accounts columns).
// ---------------------------------------------------------------------------

export type CoaAccountLike = {
  account_code: string;
  name: string;
  account_type: string;
  account_class: string | null;
  is_active: boolean;
};

/** design §4.1: the bank leg must be active, asset-typed, non-control. */
export function isEligibleBankCoaAccount(a: CoaAccountLike): boolean {
  return a.is_active && a.account_type === "asset" && a.account_class === null;
}

/** design §4.6: an adjustment account must be active, non-control, expense- or
 *  income-typed, and (checked by the caller, who knows the bank account code) not
 *  the bank account itself. */
export function isEligibleAdjustmentCoaAccount(a: CoaAccountLike): boolean {
  return a.is_active && a.account_class === null && (a.account_type === "expense" || a.account_type === "income");
}
