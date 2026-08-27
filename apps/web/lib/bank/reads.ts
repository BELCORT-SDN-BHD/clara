// The /bank workbench — account + statement READS. Every function below is a
// read RPC — transport via callDoor; not a governed act: no confirmation UI,
// no re-read-after semantics. It exists in this file (never doors.ts) so a
// reader can tell "the DB reported a figure" apart from "a human governed
// act happened" at a glance.
//
// WHY callDoor AND NOT getRows: PostgREST only serves a function over GET
// when it is marked STABLE/IMMUTABLE; clara.list_bank_accounts and its
// siblings (migration 0038 §"SECTION R — THE /bank READ SURFACE") are plain
// `language plpgsql security definer` with no volatility qualifier, so
// Postgres defaults them to VOLATILE and PostgREST requires POST. getRows
// (lib/read.ts) only builds GET requests against a relation path — it
// cannot invoke `/rpc/<fn>` at all. callDoor is the only POST-capable
// primitive apps/web ships, so these reads ride it as pure transport; they
// carry no DoorRefusal-shaped UI, no "act" wiring, no post-write reload.
//
// Every RPC's arg names are EXACT, pinned in migration 0038 (grep-verified,
// this build): list_bank_accounts(p_client), list_bank_account_proposals
// (p_client), list_bank_statements(p_client, p_bank_account), get_bank_
// statement(p_statement).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import {
  toBankAccount, toBankAccountProposal, toBankStatement, toBankStatementLine,
  type BankAccountRow, type BankAccountProposalRow, type BankStatementRow,
  type BankStatementLineRow, type BankStatementDetail,
} from "./types";

export type BankReadOptions = { session?: SessionTokenAccessor; signal?: AbortSignal };

export async function listBankAccounts(clientId: string, opts: BankReadOptions = {}): Promise<BankAccountRow[]> {
  const out = await callDoor("list_bank_accounts", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toBankAccount);
}

export async function listBankAccountProposals(
  clientId: string, opts: BankReadOptions = {},
): Promise<BankAccountProposalRow[]> {
  const out = await callDoor("list_bank_account_proposals", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toBankAccountProposal);
}

export async function listBankStatements(
  clientId: string, bankAccountId: string, opts: BankReadOptions = {},
): Promise<BankStatementRow[]> {
  const out = await callDoor("list_bank_statements", { p_client: clientId, p_bank_account: bankAccountId }, opts);
  return (Array.isArray(out) ? out : []).map(toBankStatement);
}

/** Header + lines in one call. `null` when the statement does not exist (or
 *  belongs to another firm) — the RPC's own honest "not found" shape, never
 *  fabricated. */
export async function getBankStatement(
  statementId: string, opts: BankReadOptions = {},
): Promise<BankStatementDetail | null> {
  const out = (await callDoor("get_bank_statement", { p_statement: statementId }, opts)) as
    | { statement?: unknown; lines?: unknown }
    | null;
  if (!out || !out.statement) return null;
  return {
    statement: toBankStatement(out.statement),
    lines: (Array.isArray(out.lines) ? out.lines : []).map(toBankStatementLine) as BankStatementLineRow[],
  };
}
