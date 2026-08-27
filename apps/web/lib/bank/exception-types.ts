// The /bank exceptions lane — row shapes (split from types.ts, repo
// file-size discipline; see that file's header). clara.bank_line_exceptions
// (migration 0040 §4.2) is a plain RLS-scoped table (grant select to
// clara_authenticated, policy p_ble_human) — read directly via getRows,
// never via an RPC. Writers: except_bank_line / resolve_bank_line_exception
// (OWNER floor) / resolve_and_book_bank_line (0044, the AF-2 composite) —
// see lib/bank/doors.ts. Also carries bank_agent_proposals (F-A3 Annex A.4)
// and bank_agency_holds (F-A3 Annex D) — both plain human-SELECT-only tables.

import { s, bool, rec } from "./types";

export type BankLineExceptionKind = "bank_error" | "disputed";
export type BankLineExceptionStatus = "open" | "resolved";
export type BankLineExceptionDisposition = "matched_booking" | "bank_corrective_line" | "written_off_adjustment";

export const EXCEPTION_KINDS: readonly BankLineExceptionKind[] = ["bank_error", "disputed"];

export type BankLineExceptionRow = {
  id: string;
  line_id: string;
  statement_id: string | null;
  kind: BankLineExceptionKind | string;
  reason: string;
  evidence_document_id: string | null;
  status: BankLineExceptionStatus | string;
  created_by: string | null;
  created_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_disposition: BankLineExceptionDisposition | string | null;
  resolution_note: string | null;
  counterpart_line_id: string | null;
};

export function toBankLineException(raw: unknown): BankLineExceptionRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    line_id: s(o.line_id) ?? "",
    statement_id: s(o.statement_id),
    kind: s(o.kind) ?? "bank_error",
    reason: s(o.reason) ?? "",
    evidence_document_id: s(o.evidence_document_id),
    status: s(o.status) ?? "open",
    created_by: s(o.created_by),
    created_at: s(o.created_at),
    resolved_by: s(o.resolved_by),
    resolved_at: s(o.resolved_at),
    resolution_disposition: s(o.resolution_disposition),
    resolution_note: s(o.resolution_note),
    counterpart_line_id: s(o.counterpart_line_id),
  };
}

export function exceptionDispositionLabel(d: string): string {
  if (d === "matched_booking") return "matched to a booking";
  if (d === "bank_corrective_line") return "bank corrective line (nets to a named pair)";
  if (d === "written_off_adjustment") return "written off (adjustment entry)";
  return d;
}

export function exceptionKindLabel(k: string): string {
  if (k === "bank_error") return "bank error";
  if (k === "disputed") return "disputed";
  return k;
}

/** resolve_and_book_bank_line's hand-draft leg (design wave-d-b §4/ABI §A) —
 *  the ONLY leg this workbench builds a form for; the settlement/open-item
 *  leg is the named gap (see components/bank/exceptions-section.tsx). */
export type Af2DraftInput = {
  posting_date: string;
  memo: string;
  lines: { account_code: string; debit_cents: number; credit_cents: number; description?: string | null }[];
};

export type ResolveAndBookBankLineDisposition = "matched_booking" | "written_off_adjustment";
export type ResolveAndBookBankLineBranch = "live" | "pending" | string;

export type ResolveAndBookBankLineResult = {
  resolution_exception_id: string | null;
  branch: ResolveAndBookBankLineBranch;
  entry_id: string | null;
  raw: Record<string, unknown>;
};

export function toResolveAndBookBankLineResult(raw: unknown): ResolveAndBookBankLineResult {
  const o = rec(raw);
  return {
    resolution_exception_id: s(o.resolution_exception_id),
    branch: s(o.branch) ?? "live",
    entry_id: s(o.entry_id),
    raw: o,
  };
}

// ---------------------------------------------------------------------------
// bank_agent_proposals (F-A3 Annex A.4/M.2) — a structured AGENT proposal a
// human acts on in one click. Human SELECT-only, zero machine grants (0121).
// ---------------------------------------------------------------------------

export type BankAgentProposalKind = "line_exception" | "identifier_promotion";
export type BankAgentProposalStatus = "open" | "accepted";

export type BankAgentProposalRow = {
  id: string;
  kind: BankAgentProposalKind | string;
  /** the proposal's anchor: a bank_statement_lines.id for line_exception, a
   *  counterparties.id for identifier_promotion. */
  subject_id: string;
  payload: Record<string, unknown>;
  rationale: string;
  status: BankAgentProposalStatus | string;
  created_at: string | null;
};

export function toBankAgentProposal(raw: unknown): BankAgentProposalRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    kind: s(o.kind) ?? "",
    subject_id: s(o.subject_id) ?? "",
    payload: (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<string, unknown>,
    rationale: s(o.rationale) ?? "",
    status: s(o.status) ?? "open",
    created_at: s(o.created_at),
  };
}

// ---------------------------------------------------------------------------
// bank_agency_holds (F-A3 Annex D, blocker B3) — the per-client brake on the
// bank agent lane. Human SELECT-only, zero machine grants (0121); written by
// clara.set_bank_agency_hold(client, on|off, reason, op_key).
// ---------------------------------------------------------------------------

export type BankAgencyHoldRow = {
  client_id: string;
  on_hold: boolean;
  reason: string | null;
  set_by: string | null;
  set_at: string | null;
};

export function toBankAgencyHold(raw: unknown): BankAgencyHoldRow {
  const o = rec(raw);
  return {
    client_id: s(o.client_id) ?? "",
    on_hold: bool(o.on_hold, false),
    reason: s(o.reason),
    set_by: s(o.set_by),
    set_at: s(o.set_at),
  };
}
