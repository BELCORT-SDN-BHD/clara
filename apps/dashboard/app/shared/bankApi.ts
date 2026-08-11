// The /bank workbench wire client (Wave C-b, design §4.1-§4.9 + part2 §4.7). HUMAN
// lane only (PostgREST as clara_authenticated) — governance never transits the
// runtime (AGENTS.md); statement-PDF preview reuses the EXISTING agent-lane
// document-bytes stream via shared/reviewApi.ts's fetchDocumentBytes (design part2
// §4.7 — nothing new is added here for it). Every writer carries a FRESH op_key
// (the DB is idempotent on firm,fn,op_key); no figure is computed here — the DB
// owns every cents value (AGENTS.md law).
//
// READ SURFACE — HONESTY NOTE. The five write verbs this file calls
// (enter_bank_statement, match_bank_line, unmatch_bank_match, settle_from_bank_line,
// complete_pending_match) carry EXACT signatures pinned by the design (part1
// §4.3/§4.6) — reproduced verbatim in each function's own comment. The list/read
// RPCs below are NOT pinned anywhere: migration 0037 defines no list_/get_ fn for
// the bank schema (grep-verified — it does not exist yet), and part2 §4.7 states
// only the READ SHAPE ("Every list RPC is SECURITY DEFINER... list_review_queue
// idiom"), leaving the DB half of C-b to the still-to-merge migration. These reads
// are therefore ASSUMED, named on the house p_* convention (the reviewApi.ts
// LANE-D-NOTES precedent — listAutopostRules/listRuleNotifications/getRulePostRun)
// for the DB lane to land under these exact names, or correct at integration. Every
// mapper is DEFENSIVE (model.ts's toXxx idiom) so a near-miss shape still renders.

import { rpc } from "./wire";
import { listPlanItems } from "./onboardingApi";
import { getClientPlan } from "./openingApi";
import {
  toBankAccount, toBankAccountProposal, toBankStatement, toBankStatementLine,
  toOpenItem, toMatchCandidateEntry,
  type BankAccountRow, type BankAccountProposalRow, type BankStatementRow,
  type BankStatementLineRow, type OpenItemRow, type OpenItemDomain,
  type MatchCandidateEntryRow,
} from "../bank/model";

const opKey = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Reads — ASSUMED SECURITY DEFINER list/get fns (see header note).
// ---------------------------------------------------------------------------

export async function listBankAccounts(token: string, clientId: string): Promise<BankAccountRow[]> {
  const out = await rpc("list_bank_accounts", { p_client: clientId }, token);
  return (Array.isArray(out) ? out : []).map(toBankAccount);
}

export async function listBankAccountProposals(token: string, clientId: string): Promise<BankAccountProposalRow[]> {
  const out = await rpc("list_bank_account_proposals", { p_client: clientId }, token);
  return (Array.isArray(out) ? out : []).map(toBankAccountProposal);
}

export async function listBankStatements(
  token: string, clientId: string, bankAccountId: string,
): Promise<BankStatementRow[]> {
  const out = await rpc("list_bank_statements", { p_client: clientId, p_bank_account: bankAccountId }, token);
  return (Array.isArray(out) ? out : []).map(toBankStatement);
}

export type BankStatementDetail = { statement: BankStatementRow; lines: BankStatementLineRow[] };

/** Header + lines in one call (part2 §4.7 "detail: lines with match state"). */
export async function getBankStatement(token: string, statementId: string): Promise<BankStatementDetail | null> {
  const out = (await rpc("get_bank_statement", { p_statement: statementId }, token)) as
    | { statement?: unknown; lines?: unknown }
    | null;
  if (!out || !out.statement) return null;
  return {
    statement: toBankStatement(out.statement),
    lines: (Array.isArray(out.lines) ? out.lines : []).map(toBankStatementLine),
  };
}

/** The settle_from_bank_line allocation picker's source (part2 §4.7 "open items by
 *  counterparty"). domain is the counterparty's kind resolved client-side
 *  (matchModel.settlementDomainFor) — customer→ar, vendor→ap. */
export async function listOpenItemsByCounterparty(
  token: string, clientId: string, domain: OpenItemDomain, counterpartyId: string,
): Promise<OpenItemRow[]> {
  const out = await rpc(
    "list_open_items_by_counterparty",
    { p_client: clientId, p_domain: domain, p_counterparty: counterpartyId },
    token,
  );
  return (Array.isArray(out) ? out : []).map(toOpenItem);
}

/** The match_bank_line candidate-entry picker's source (part2 §4.7 "candidate
 *  entries with per-side remaining capacity") — approved entries touching this
 *  bank account, with their DB-computed remaining capacity per side (design §3). */
export async function listBankMatchCandidates(
  token: string, clientId: string, bankAccountId: string,
): Promise<MatchCandidateEntryRow[]> {
  const out = await rpc("list_bank_match_candidates", { p_client: clientId, p_bank_account: bankAccountId }, token);
  return (Array.isArray(out) ? out : []).map(toMatchCandidateEntry);
}

/** WCB-R2 (design §4.1): the interview `banks` answer, displayed VERBATIM as
 *  advisory-only text — never bound to anything; the authoritative trigger for a
 *  real bank_accounts row is always the statement-header proposal (§4.3). Composes
 *  two already-granted reads (0036 §E "committed-plan read idiom"): the client's
 *  onboarding plan, then its `banks` item. Degrades to null rather than throwing —
 *  a client with no committed plan, or an interview that never reached the `banks`
 *  segment, is a normal state here, not an error. */
export async function getBanksInterviewAnswer(token: string, clientId: string): Promise<string | null> {
  const plan = await getClientPlan(token, clientId).catch(() => null);
  if (!plan) return null;
  const items = await listPlanItems(token, plan.id).catch(() => []);
  const item = items.find((i) => i.item_key === "banks");
  if (!item || item.answer === null || item.answer === undefined) return null;
  return typeof item.answer === "string" ? item.answer : JSON.stringify(item.answer);
}

// ---------------------------------------------------------------------------
// Bank identity writers (design §4.1). add_bank_account's FULL arg list is NOT
// pinned beyond "validates COA; flags it; takes optional p_proposal_id" (§4.3) —
// ASSUMED on the house upsert_account convention (accounts/api.ts). deactivate/
// reactivate/remap follow the same p_client/p_bank_account/p_op_key convention
// every other bookkeeper-floor verb in this repo uses.
// ---------------------------------------------------------------------------

export async function addBankAccount(
  token: string,
  args: {
    clientId: string; bankCode: string; accountNumber: string;
    bankNameDisplay: string; coaAccountCode: string; proposalId?: string | null;
  },
): Promise<{ bank_account_id: string }> {
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_bank_code: args.bankCode, p_account_number: args.accountNumber,
    p_bank_name_display: args.bankNameDisplay, p_coa_account_code: args.coaAccountCode, p_op_key: opKey(),
  };
  if (args.proposalId) body.p_proposal_id = args.proposalId;
  const out = (await rpc("add_bank_account", body, token)) as { bank_account_id?: string; id?: string } | null;
  const id = out?.bank_account_id ?? out?.id;
  if (!id) throw new Error("add_bank_account returned no bank_account_id");
  return { bank_account_id: id };
}

export async function deactivateBankAccount(
  token: string, clientId: string, bankAccountId: string, reason: string,
): Promise<void> {
  await rpc(
    "deactivate_bank_account",
    { p_client: clientId, p_bank_account: bankAccountId, p_reason: reason, p_op_key: opKey() },
    token,
  );
}

export async function reactivateBankAccount(token: string, clientId: string, bankAccountId: string): Promise<void> {
  await rpc("reactivate_bank_account", { p_client: clientId, p_bank_account: bankAccountId, p_op_key: opKey() }, token);
}

/** Refuses while any pending/live match group exists on the account (design §4.1). */
export async function remapBankAccountCoa(
  token: string, clientId: string, bankAccountId: string, coaAccountCode: string,
): Promise<void> {
  await rpc(
    "remap_bank_account_coa",
    { p_client: clientId, p_bank_account: bankAccountId, p_new_coa_account_code: coaAccountCode, p_op_key: opKey() },
    token,
  );
}

// ---------------------------------------------------------------------------
// Statement writers. enter_bank_statement's signature is EXACT (design §4.3):
//   enter_bank_statement(p_client, p_bank_account, p_document, p_header jsonb,
//                         p_lines jsonb, p_op_key)
// void_bank_statement's arg NAMES are ASSUMED — §4.9's lock order names the verb
// and its lock sequence (004 → 203005006 → line rows FOR UPDATE → the live-member
// probe) but not its arg list; p_client/p_statement/p_reason/p_op_key is the house
// convention every other void/cancel verb in this repo uses.
// ---------------------------------------------------------------------------

export type BankStatementHeaderInput = {
  period_start: string; period_end: string; statement_date: string | null;
  opening_cents: number; closing_cents: number;
  total_debit_cents: number | null; total_credit_cents: number | null;
  /** null => MYR (0023 posture, absence reads MYR); a non-null non-MYR code is the
   *  `non_myr_statement` refusal path (design §4.2 / WC-R5). */
  currency: string | null;
};

export type BankStatementLineInput = {
  line_no: number; entry_date: string; value_date: string | null;
  description: string | null; amount_cents: number; running_balance_cents: number | null;
};

export async function enterBankStatement(
  token: string,
  args: {
    clientId: string; bankAccountId: string; documentId: string;
    header: BankStatementHeaderInput; lines: BankStatementLineInput[];
  },
): Promise<{ statement_id: string }> {
  const out = (await rpc(
    "enter_bank_statement",
    {
      p_client: args.clientId, p_bank_account: args.bankAccountId, p_document: args.documentId,
      p_header: args.header, p_lines: args.lines, p_op_key: opKey(),
    },
    token,
  )) as { statement_id?: string; id?: string } | null;
  const id = out?.statement_id ?? out?.id;
  if (!id) throw new Error("enter_bank_statement returned no statement_id");
  return { statement_id: id };
}

export async function voidBankStatement(
  token: string, clientId: string, statementId: string, reason: string,
): Promise<void> {
  await rpc("void_bank_statement", { p_client: clientId, p_statement: statementId, p_reason: reason, p_op_key: opKey() }, token);
}

// ---------------------------------------------------------------------------
// Match writers — EXACT signatures (design §4.6):
//   match_bank_line(p_client, p_lines jsonb, p_entries jsonb [{entry_id,
//     matched_cents}], p_adjustments jsonb default null,
//     p_ack_period_exceptions bool default false, p_op_key)
//   unmatch_bank_match(p_client, p_match, p_reason, p_op_key)
// The p_adjustments jsonb element shape is ASSUMED — the design pins the shape of
// the ADJUSTMENT ENTRY itself (two legs: the named adjustment account vs the
// line's bank account, §4.6) but not the caller-facing jsonb array element;
// `{account_code, amount_cents}` mirrors 0037's own array-of-object convention
// (allocate_receipt's p_allocations, `{item_id, amount_cents}[]`).
//
// C-c splice register #4 (design §5, migration 0040): match_bank_line +
// settle_from_bank_line each gain a NEW OVERLOAD — same name, the existing
// arg list PLUS a trailing `p_via_rule uuid default null`. viaRuleId is
// OMITTED from the body entirely on a plain human match/settle (0038's
// original arity resolves, unchanged behaviour); it is sent only when the
// caller confirms a `list_bank_line_suggestions` match/settle chip
// (shared/reconApi.ts), so PostgREST resolves the 0040 overload, the DB
// validates the signed same-client rule and stamps `origin='rule'` on the
// match (design §4.3/§5) — this file never sets `origin` itself.
// ---------------------------------------------------------------------------

export type MatchEntryInput = { entry_id: string; matched_cents: number };
export type BankAdjustmentInput = { account_code: string; amount_cents: number };

export async function matchBankLine(
  token: string,
  args: {
    clientId: string; lineIds: string[]; entries: MatchEntryInput[];
    adjustments?: BankAdjustmentInput[] | null; ackPeriodExceptions?: boolean;
    /** C-c splice #4: the signed `bank_rules` row this match was confirmed
     *  from (shared/reconApi.ts's `list_bank_line_suggestions`). Omitted
     *  (not merely null) on every ordinary human match. */
    viaRuleId?: string | null;
  },
): Promise<{ match_id: string }> {
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_lines: args.lineIds, p_entries: args.entries,
    p_adjustments: args.adjustments ?? null,
    p_ack_period_exceptions: args.ackPeriodExceptions ?? false,
    p_op_key: opKey(),
  };
  if (args.viaRuleId) body.p_via_rule = args.viaRuleId;
  const out = (await rpc("match_bank_line", body, token)) as { match_id?: string; id?: string } | null;
  const id = out?.match_id ?? out?.id;
  if (!id) throw new Error("match_bank_line returned no match_id");
  return { match_id: id };
}

export async function unmatchBankMatch(
  token: string, clientId: string, matchId: string, reason: string,
): Promise<void> {
  await rpc("unmatch_bank_match", { p_client: clientId, p_match: matchId, p_reason: reason, p_op_key: opKey() }, token);
}

// ---------------------------------------------------------------------------
// settle_from_bank_line / complete_pending_match — EXACT signature (design §4.6):
//   settle_from_bank_line(p_client, p_line, p_counterparty, p_allocations jsonb,
//     p_memo, p_posting_date date default null, p_charge_cents bigint default 0,
//     p_charge_account text default null, p_adjustments jsonb default null,
//     p_attestation text default null, p_control_account text default null, p_op_key)
//   complete_pending_match(p_client, p_match, p_op_key)
// p_allocations is `{item_id, amount_cents}[]` — pinned by 0037's allocate_receipt/
// allocate_payment, the composite this one reuses (design §2 fact 7).
// ---------------------------------------------------------------------------

export type SettleAllocationInput = { item_id: string; amount_cents: number };

/** The composite's jsonb receipt — SHAPE NOT PINNED (the design states the TWO
 *  branches, below/at-threshold, part1 §4.6 WCA-R7, but not the caller-facing
 *  return object). Rendered generically by the workbench: a `status` containing
 *  "pending"/"draft" is the pending-match reservation (checker approval still
 *  owed in /queue); anything else is the immediate settle+match receipt. */
export type SettleReceipt = Record<string, unknown> & {
  entry_id?: string; match_id?: string; status?: string;
};

export async function settleFromBankLine(
  token: string,
  args: {
    clientId: string; lineId: string; counterpartyId: string;
    allocations: SettleAllocationInput[]; memo: string;
    postingDate?: string | null; chargeCents?: number; chargeAccount?: string | null;
    adjustments?: BankAdjustmentInput[] | null; attestation?: string | null;
    controlAccount?: string | null;
    /** C-c splice #4 — see matchBankLine's own comment; omitted on every
     *  ordinary human settle. */
    viaRuleId?: string | null;
  },
): Promise<SettleReceipt> {
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_line: args.lineId, p_counterparty: args.counterpartyId,
    p_allocations: args.allocations, p_memo: args.memo,
    p_posting_date: args.postingDate ?? null,
    p_charge_cents: args.chargeCents ?? 0,
    p_charge_account: args.chargeAccount ?? null,
    p_adjustments: args.adjustments ?? null,
    p_attestation: args.attestation ?? null,
    p_control_account: args.controlAccount ?? null,
    p_op_key: opKey(),
  };
  if (args.viaRuleId) body.p_via_rule = args.viaRuleId;
  return (await rpc("settle_from_bank_line", body, token)) as SettleReceipt;
}

/** Validates the now-approved entry (all §4.5 floors + parity) and flips
 *  pending→live, writing the entry members (design §4.6). */
export async function completePendingMatch(token: string, clientId: string, matchId: string): Promise<SettleReceipt> {
  return (await rpc(
    "complete_pending_match",
    { p_client: clientId, p_match: matchId, p_op_key: opKey() },
    token,
  )) as SettleReceipt;
}
