// The /bank workbench — pure model (Wave C-b, design §4.7 / part2 §4.7). PURE: zero
// network, zero React. Mirrors the queue/accounts precedent (queue/model.ts,
// accounts/accountsModel.ts): every row type here is a defensive projection of a
// DB-owned read, every figure a bigint-cents value the DB computed — this module
// invents no accounting figure, it only groups, labels, and previews what the DB
// already returned. Where the design (part1 §3/§4) names an identity precisely
// (the statement chain, the match group tie, entry-exhaustion, the counterparty-kind
// settlement domain), the corresponding pure fn here is a CLIENT-SIDE PREVIEW ONLY —
// the DB re-validates every one of these under lock at write time (part1 §4.5/§4.6)
// and its refusal is authoritative; nothing here may be treated as an enforcement.

// ---------------------------------------------------------------------------
// Row types (design §4.1/§4.2/§4.5; defensive projections of the read RPCs —
// see shared/bankApi.ts for which reads are DB-pinned vs ASSUMED).
// ---------------------------------------------------------------------------

export type BankAccountRow = {
  id: string;
  bank_code: string;
  bank_name: string | null;
  bank_name_display: string;
  account_number: string;
  account_number_normalized: string;
  coa_account_code: string;
  coa_account_name: string | null;
  active: boolean;
  created_at: string | null;
  deactivated_at: string | null;
  deactivated_reason: string | null;
};

/** design §4.1: `account_unregistered` mints a proposal; `account_inactive` (a live
 *  bank_accounts row exists but is deactivated) is folded into the SAME card per
 *  "distinguishes account_inactive (offer reactivation) from account_unregistered
 *  (offer creation)" — one card, two remedies. */
export type BankAccountProposalReason = "account_unregistered" | "account_inactive";

export type BankAccountProposalRow = {
  id: string;
  bank_code: string;
  bank_name: string | null;
  account_number_normalized: string;
  currency: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_date: string | null;
  opening_cents: number | null;
  closing_cents: number | null;
  reason: BankAccountProposalReason | string;
  /** present only when reason='account_inactive' — the existing (inactive) account */
  existing_bank_account_id: string | null;
  existing_bank_account_display: string | null;
  document_id: string | null;
  created_at: string | null;
};

export type BankStatementStatus = "live" | "void";
export type BankStatementIngestMode = "structured" | "ocr" | "human";

/** design part2 §4.7: "closing vs bank-COA GL balance at period_end vs unmatched
 *  sums" — the cheap read half, NOT reconciliation (part1 §1's named residual). */
export type BankStatementTie = {
  gl_balance_cents: number | null;
  unmatched_cents: number | null;
};

export type BankStatementRow = {
  id: string;
  bank_account_id: string;
  document_id: string | null;
  period_start: string;
  period_end: string;
  statement_date: string | null;
  opening_cents: number;
  closing_cents: number;
  total_debit_cents: number | null;
  total_credit_cents: number | null;
  line_count: number;
  status: BankStatementStatus | string;
  ingest_mode: BankStatementIngestMode | string;
  superseded_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  created_at: string | null;
  tie: BankStatementTie;
};

/** design §4.5: a line belongs to at most one group with status in
 *  ('pending','live') — 'unmatched' is the absence of membership, not a DB enum. */
export type LineMatchState = "unmatched" | "pending" | "live";

export type BankStatementLineRow = {
  id: string;
  statement_id: string;
  line_no: number;
  entry_date: string;
  value_date: string | null;
  description: string | null;
  /** signed: + = into the account, − = out (design §4.2) */
  amount_cents: number;
  running_balance_cents: number | null;
  match_state: LineMatchState;
  match_id: string | null;
};

export type OpenItemDomain = "ar" | "ap";

export type OpenItemRow = {
  id: string;
  domain: OpenItemDomain;
  counterparty_id: string;
  item_kind: string;
  item_date: string;
  due_date: string | null;
  amount_cents: number;
  /** derived (amount + Σ allocations), DB-computed — never recomputed here */
  outstanding_cents: number | null;
  entry_id: string;
};

export type MatchCandidateEntryRow = {
  entry_id: string;
  posting_date: string | null;
  memo: string | null;
  coding_kind: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  high_stakes: boolean;
  /** design §3: per-side absolute bounds, gross per side on THIS bank account —
   *  DB-computed remaining capacity, a preview only (the entry-exhaustion belt is
   *  the authority at write time). */
  debit_remaining_cents: number | null;
  credit_remaining_cents: number | null;
};

// ---------------------------------------------------------------------------
// Defensive mappers (the reviewCardTypes.ts idiom): a key rename degrades a field,
// never throws.
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown, dflt = false): boolean {
  return typeof v === "boolean" ? v : dflt;
}
export function toBankAccount(raw: unknown): BankAccountRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: s(o.id) ?? "",
    bank_code: s(o.bank_code) ?? "",
    bank_name: s(o.bank_name),
    bank_name_display: s(o.bank_name_display) ?? s(o.bank_name) ?? "",
    account_number: s(o.account_number) ?? "",
    account_number_normalized: s(o.account_number_normalized) ?? "",
    coa_account_code: s(o.coa_account_code) ?? "",
    coa_account_name: s(o.coa_account_name),
    active: bool(o.active, true),
    created_at: s(o.created_at),
    deactivated_at: s(o.deactivated_at),
    deactivated_reason: s(o.deactivated_reason),
  };
}

export function toBankAccountProposal(raw: unknown): BankAccountProposalRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: s(o.id) ?? "",
    bank_code: s(o.bank_code) ?? "",
    bank_name: s(o.bank_name),
    account_number_normalized: s(o.account_number_normalized) ?? "",
    currency: s(o.currency),
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    statement_date: s(o.statement_date),
    opening_cents: numOrNull(o.opening_cents),
    closing_cents: numOrNull(o.closing_cents),
    reason: s(o.reason) ?? "account_unregistered",
    existing_bank_account_id: s(o.existing_bank_account_id),
    existing_bank_account_display: s(o.existing_bank_account_display),
    document_id: s(o.document_id),
    created_at: s(o.created_at),
  };
}

export function toBankStatement(raw: unknown): BankStatementRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  const tie = (o.tie ?? {}) as Record<string, unknown>;
  return {
    id: s(o.id) ?? "",
    bank_account_id: s(o.bank_account_id) ?? "",
    document_id: s(o.document_id),
    period_start: s(o.period_start) ?? "",
    period_end: s(o.period_end) ?? "",
    statement_date: s(o.statement_date),
    opening_cents: numOrNull(o.opening_cents) ?? 0,
    closing_cents: numOrNull(o.closing_cents) ?? 0,
    total_debit_cents: numOrNull(o.total_debit_cents),
    total_credit_cents: numOrNull(o.total_credit_cents),
    line_count: numOrNull(o.line_count) ?? 0,
    status: s(o.status) ?? "live",
    ingest_mode: s(o.ingest_mode) ?? "ocr",
    superseded_by: s(o.superseded_by),
    voided_by: s(o.voided_by),
    voided_at: s(o.voided_at),
    voided_reason: s(o.voided_reason),
    created_at: s(o.created_at),
    tie: {
      gl_balance_cents: numOrNull(tie.gl_balance_cents) ?? numOrNull(o.gl_balance_cents),
      unmatched_cents: numOrNull(tie.unmatched_cents) ?? numOrNull(o.unmatched_cents),
    },
  };
}

export function toBankStatementLine(raw: unknown): BankStatementLineRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ms = s(o.match_state);
  return {
    id: s(o.id) ?? "",
    statement_id: s(o.statement_id) ?? "",
    line_no: numOrNull(o.line_no) ?? 0,
    entry_date: s(o.entry_date) ?? "",
    value_date: s(o.value_date),
    description: s(o.description),
    amount_cents: numOrNull(o.amount_cents) ?? 0,
    running_balance_cents: numOrNull(o.running_balance_cents),
    match_state: (ms === "pending" || ms === "live" ? ms : "unmatched") as LineMatchState,
    match_id: s(o.match_id),
  };
}

export function toOpenItem(raw: unknown): OpenItemRow {
  const o = (raw ?? {}) as Record<string, unknown>;
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

export function toMatchCandidateEntry(raw: unknown): MatchCandidateEntryRow {
  const o = (raw ?? {}) as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Statement list grouping (list pane: "statements per account").
// ---------------------------------------------------------------------------

export type AccountGroup = { account: BankAccountRow; statements: BankStatementRow[] };

/** Active accounts first (an inactive account with historical statements is still
 *  worth finding, so it is not dropped — just sorted after); statements newest
 *  period first within each account. An account with zero statements still gets an
 *  (empty) group — the "no statements yet" state belongs to the list pane. */
export function groupStatementsByAccount(
  accounts: readonly BankAccountRow[],
  statements: readonly BankStatementRow[],
): AccountGroup[] {
  const byAccount = new Map<string, BankStatementRow[]>();
  for (const st of statements) {
    const list = byAccount.get(st.bank_account_id) ?? [];
    list.push(st);
    byAccount.set(st.bank_account_id, list);
  }
  const sorted = [...accounts].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.bank_name_display || a.account_number).localeCompare(b.bank_name_display || b.account_number);
  });
  return sorted.map((account) => ({
    account,
    statements: (byAccount.get(account.id) ?? []).slice().sort((a, b) => b.period_end.localeCompare(a.period_end)),
  }));
}

export function statementStatusLabel(status: string): string {
  if (status === "void") return "voided";
  if (status === "live") return "live";
  return status;
}

// ---------------------------------------------------------------------------
// The bank_statement_tie banner (design §1 / part2 §4.7): the cheap read half, NOT
// reconciliation. `tied` only ever describes THIS informational identity —
// closing = GL balance at period_end + the signed sum of still-unmatched lines
// (lines not yet reflected in the GL) — never the group-tie or entry-exhaustion
// identities (those are the DB's belts, enforced at write time, part1 §3).
// ---------------------------------------------------------------------------

export type TieBannerState = "tied" | "variance" | "unavailable";

export function tieBannerState(statement: Pick<BankStatementRow, "closing_cents" | "tie">): TieBannerState {
  const { gl_balance_cents, unmatched_cents } = statement.tie;
  if (gl_balance_cents === null || unmatched_cents === null) return "unavailable";
  return gl_balance_cents + unmatched_cents === statement.closing_cents ? "tied" : "variance";
}

/** The variance shown on the banner when it does not tie — informational, signed. */
export function tieVarianceCents(statement: Pick<BankStatementRow, "closing_cents" | "tie">): number | null {
  const { gl_balance_cents, unmatched_cents } = statement.tie;
  if (gl_balance_cents === null || unmatched_cents === null) return null;
  return statement.closing_cents - (gl_balance_cents + unmatched_cents);
}

// ---------------------------------------------------------------------------
// Line match state — badge label only (display, not enforcement).
// ---------------------------------------------------------------------------

export function lineMatchLabel(state: LineMatchState): string {
  if (state === "live") return "matched";
  if (state === "pending") return "pending checker";
  return "unmatched";
}

// The matching-workspace selection model, group-tie preview, period-exception
// detector, settlement-domain law, refusal copy, screen-state selector, and COA
// picker predicates all live in ./matchModel.ts (split for repo file-size
// discipline — that file's header explains the split and re-cites the design).
