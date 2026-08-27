// The /bank workbench — account + statement row shapes (P3, mohe-grill-
// rulings Q3/Q8/Q9). PURE: zero network. Split across four files for repo
// file-size discipline (the dashboard's own model.ts/reconModel.ts/
// resolveBookModel.ts/reconSnapshotModel.ts split precedent): this file
// (accounts + statements), match-types.ts (matching + counterparties),
// exception-types.ts (exceptions + agent proposals + agency hold),
// recon-types.ts (the "certify" reconciliation view).
//
// Every shape here is a defensive PROJECTION of the DB's actual, LIVE bank
// read/write surface (packages/db/migrations 0038/0040/0044/0121/0129) and of
// apps/dashboard's own prior wire clients (shared/bankApi.ts, bank/model.ts) —
// never an invented shape. A key rename or absent field degrades to a safe
// default rather than throwing (the reviewCardTypes.ts idiom).
//
// F-A3 (Annex I, migration 0129): the eleven-verb bank-RULES machine is
// PERMANENTLY RETIRED — no rule/suggestion shape lives anywhere in lib/bank/.

export function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
export function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
export function bool(v: unknown, dflt = false): boolean {
  return typeof v === "boolean" ? v : dflt;
}
export function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
export function strArr(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}
export function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Bank accounts (0038 §4.1) — clara.list_bank_accounts / list_bank_account_
// proposals / add_bank_account / deactivate_bank_account / reactivate_bank_
// account / remap_bank_account_coa.
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

export function toBankAccount(raw: unknown): BankAccountRow {
  const o = rec(raw);
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

/** design §4.1: `account_unregistered` mints a proposal; `account_inactive` (a
 *  live bank_accounts row exists but is deactivated) offers reactivation. */
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
  existing_bank_account_id: string | null;
  existing_bank_account_display: string | null;
  document_id: string | null;
  created_at: string | null;
};

export function toBankAccountProposal(raw: unknown): BankAccountProposalRow {
  const o = rec(raw);
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

// ---------------------------------------------------------------------------
// Statements (0038 §4.2/§4.3) — list_bank_statements / get_bank_statement /
// enter_bank_statement / void_bank_statement.
// ---------------------------------------------------------------------------

export type BankStatementStatus = "live" | "void";
export type BankStatementIngestMode = "structured" | "ocr" | "human";

/** design part2 §4.7: the cheap read-only tie (GL balance vs unmatched sum at
 *  period_end) — NOT reconciliation (that is get_bank_reconciliation,
 *  recon-types.ts). */
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

export function toBankStatement(raw: unknown): BankStatementRow {
  const o = rec(raw);
  const tie = rec(o.tie);
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

/** design §4.5: a line belongs to at most one group with status in
 *  ('pending','live') — 'unmatched' is the absence of membership. */
export type LineMatchState = "unmatched" | "pending" | "live";

export type BankStatementLineRow = {
  id: string;
  statement_id: string;
  line_no: number;
  entry_date: string;
  value_date: string | null;
  description: string | null;
  /** signed: + = into the account, − = out. */
  amount_cents: number;
  running_balance_cents: number | null;
  match_state: LineMatchState;
  match_id: string | null;
};

export function toBankStatementLine(raw: unknown): BankStatementLineRow {
  const o = rec(raw);
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

export type BankStatementDetail = { statement: BankStatementRow; lines: BankStatementLineRow[] };

export function statementStatusLabel(status: string): string {
  return status === "void" ? "voided" : status;
}

export function lineMatchLabel(state: LineMatchState): string {
  if (state === "live") return "matched";
  if (state === "pending") return "pending checker";
  return "unmatched";
}
