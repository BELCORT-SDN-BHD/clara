// Wave C-c wire client (design v2.1 §5/§6) — split from bankApi.ts (repo
// file-size discipline, the matchModel.ts precedent). HUMAN lane only
// (PostgREST as clara_authenticated); every writer carries a FRESH op_key
// (the DB is idempotent on firm,fn,op_key). No figure is computed here — the
// DB owns every cents value (CLAUDE.md law).
//
// READ/WRITE SHAPE HONESTY NOTE (mirrors bankApi.ts's own header). Migration
// 0040 is still-to-merge as this file is written. The verb table (design §5)
// states most write-verb ARG NAMES loosely ("statement, p_ack_outstanding
// uuid[], op_key") — this file normalizes every arg to the house p_*
// convention. CORRECTED AT ASSEMBLY against the shipped 0040: only
// propose_bank_rule takes a leading p_client; the other seven C-c verbs are
// anchored by the object they name (statement / recon / line / exception /
// rule / counterparty), exactly as the design's §5 verb table writes them, so
// sending p_client would 404 the RPC on a name PostgREST cannot resolve. The
// original note below is kept for the record.
// (original) a leading p_client (every governed writer this repo has ever
// shipped takes p_client explicitly — grep-verified across bankApi.ts/
// openingApi.ts/counterpartyApi.ts/reviewApi.ts). The six read RPCs (§6) are
// named with a bare arg list in the design; this file supplies p_-prefixed
// names on the same convention. Every mapper is DEFENSIVE (the model.ts toXxx
// idiom). CORRECT AT INTEGRATION against the real migration (see this lane's
// build-0040/u1-notes.md for the full assumed-name register).

import { rpc } from "./wire";
import {
  toBankReconciliationView, toBankLineException, toBankRule, toBankRuleCandidate,
  toBankLineSuggestion, toUnmatchedLine,
  type BankReconciliationView, type BankLineExceptionRow, type BankLineExceptionKind,
  type BankLineExceptionDisposition, type BankRuleRow, type BankRuleKind,
  type BankRuleCandidateRow, type BankLineSuggestionRow, type UnmatchedLineRow,
} from "../bank/reconModel";

const opKey = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/** get_bank_reconciliation(p_statement) — the receipt + snapshot when a
 *  complete/void recon exists on this statement, or the DERIVED open preview
 *  otherwise (design §6). Never null in the open-statement case (a preview
 *  always exists); null only degrades a truly empty response. */
export async function getBankReconciliation(token: string, statementId: string): Promise<BankReconciliationView | null> {
  const out = await rpc("get_bank_reconciliation", { p_statement: statementId }, token);
  if (!out) return null;
  return toBankReconciliationView(out);
}

export async function listUnmatchedLines(token: string, clientId: string): Promise<UnmatchedLineRow[]> {
  const out = await rpc("list_unmatched_lines", { p_client: clientId }, token);
  return (Array.isArray(out) ? out : []).map(toUnmatchedLine);
}

export async function listBankLineSuggestions(token: string, statementId: string): Promise<BankLineSuggestionRow[]> {
  const out = await rpc("list_bank_line_suggestions", { p_statement: statementId }, token);
  return (Array.isArray(out) ? out : []).map(toBankLineSuggestion);
}

export async function listBankRuleCandidates(token: string, clientId: string): Promise<BankRuleCandidateRow[]> {
  const out = await rpc("list_bank_rule_candidates", { p_client: clientId }, token);
  return (Array.isArray(out) ? out : []).map(toBankRuleCandidate);
}

/** [D4/A9 fix] `get_bank_rule` does not exist on the server — grep-verified
 *  against every `create function clara.<name>(` in packages/db/migrations:
 *  it is the only rpc() name this dashboard calls with no matching function,
 *  so the `bank_rule_proposal` ClaraPart card (shared/cards/
 *  BankRuleProposalCard.tsx) 404'd on every mount. `list_bank_rules(p_client)`
 *  already returns everything the card needs (client-scoped, one row per
 *  rule); this reads through THAT and picks the one row by id — no RPC is
 *  missing, only this wire fn was calling the wrong name. `retired_reason`
 *  is expected on the list_bank_rules envelope (a DB-lane addition landing
 *  alongside this fix, tracked separately from this dashboard change) — if
 *  it is absent when this runs, `toBankRule` degrades it to null, same as
 *  any other missing key, never a crash. */
export async function getBankRule(token: string, clientId: string, ruleId: string): Promise<BankRuleRow | null> {
  const out = await rpc("list_bank_rules", { p_client: clientId }, token);
  const row = (Array.isArray(out) ? out : []).find(
    (r) => rec(r).rule_id === ruleId || rec(r).id === ruleId,
  );
  return row ? toBankRule(row) : null;
}

function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Writers — EXACT verb names from design §5; arg NAMES normalized to the
// house p_* + leading p_client convention (see header note).
// ---------------------------------------------------------------------------

/** complete_bank_reconciliation(statement, p_ack_outstanding uuid[], op_key),
 *  bookkeeper floor (design §5). Refuses recon_prior_missing/period_gap/
 *  line_unsettled/line_reserved/difference_nonzero/opening_mismatch/
 *  outstanding_stale/coa_shared/uncleared_off_account/statement_not_live/
 *  already_complete — rendered verbatim via matchModel's describeBankRefusal. */
export async function completeBankReconciliation(
  token: string, clientId: string, statementId: string, ackOutstandingIds: string[],
): Promise<BankReconciliationView> {
  const out = await rpc(
    "complete_bank_reconciliation",
    { p_statement: statementId, p_ack_outstanding: ackOutstandingIds, p_op_key: opKey() },
    token,
  );
  return toBankReconciliationView(out);
}

/** void_bank_reconciliation(recon, reason, op_key), bookkeeper floor. Refuses
 *  recon_chain_order (not the tail — void newest-first) / recon_already_void /
 *  reason_required. */
export async function voidBankReconciliation(
  token: string, clientId: string, reconId: string, reason: string,
): Promise<void> {
  await rpc("void_bank_reconciliation", { p_recon: reconId, p_reason: reason, p_op_key: opKey() }, token);
}

/** except_bank_line(line, kind, reason, evidence_doc?, op_key), OWNER floor
 *  (design §4.2/§5 — the door "sits at the OWNER floor"; the DB's CLR/role
 *  refusal is the enforcement, this UI does not gate on a local role guess). */
export async function exceptBankLine(
  token: string,
  args: { clientId: string; lineId: string; kind: BankLineExceptionKind; reason: string; evidenceDocumentId?: string | null },
): Promise<BankLineExceptionRow> {
  const out = await rpc(
    "except_bank_line",
    {
      p_line: args.lineId, p_kind: args.kind, p_reason: args.reason,
      p_evidence_document: args.evidenceDocumentId ?? null, p_op_key: opKey(),
    },
    token,
  );
  return toBankLineException(out);
}

/** resolve_bank_line_exception(exc, disposition, note, counterpart_line?,
 *  op_key), OWNER floor (0040:3002-3004 — the REAL, five-arg signature:
 *  p_exception, p_disposition, p_note, p_counterpart_line, p_op_key). design
 *  §4.2: `bank_corrective_line` requires naming its counterpart line;
 *  `matched_booking`/`written_off_adjustment` require the line to already be
 *  a live matched member in this SAME transaction (design §5, D3 fix — the
 *  door for that is unbuilt this wave; both stay owner-floor-only, disabled
 *  client-side). [D5/A12 fix] `p_booking_entries` is DELETED — the verb has
 *  no such parameter; PostgREST resolves by exact named-argument set, so
 *  sending it would 404 instead of returning the named refusal. Re-add only
 *  against a real signature change, never speculatively. Refuses
 *  already_resolved/resolution_note_required/counterpart_required/
 *  counterpart_not_excepted/disposition_unbooked (at commit). */
export async function resolveBankLineException(
  token: string,
  args: {
    clientId: string; exceptionId: string; disposition: BankLineExceptionDisposition; note: string;
    counterpartLineId?: string | null;
  },
): Promise<BankLineExceptionRow> {
  const body: Record<string, unknown> = {
    p_exception: args.exceptionId, p_disposition: args.disposition,
    p_note: args.note, p_op_key: opKey(),
  };
  if (args.counterpartLineId) body.p_counterpart_line = args.counterpartLineId;
  const out = await rpc("resolve_bank_line_exception", body, token);
  return toBankLineException(out);
}

/** propose_bank_rule(kind, pattern, proposal, op_key), bookkeeper floor.
 *  Evidence is DERIVED IN-VERB (design §4.3/§5) — never a caller arg here;
 *  refuses rule_evidence_insufficient (<3 sightings) / rule_pattern_already_
 *  signed. */
export async function proposeBankRule(
  token: string,
  args: { clientId: string; kind: BankRuleKind; pattern: unknown; proposal: unknown },
): Promise<BankRuleRow> {
  const out = await rpc(
    "propose_bank_rule",
    { p_client: args.clientId, p_kind: args.kind, p_pattern: args.pattern, p_proposal: args.proposal, p_op_key: opKey() },
    token,
  );
  return toBankRule(out);
}

/** sign_bank_rule(rule, op_key), OWNER floor. Refuses rule_not_proposed. */
export async function signBankRule(token: string, clientId: string, ruleId: string): Promise<void> {
  await rpc("sign_bank_rule", { p_rule: ruleId, p_op_key: opKey() }, token);
}

/** retire_bank_rule(rule, reason, op_key), OWNER floor. `reason` follows the
 *  house retire/decline convention (declineCodingRule, unmatchBankMatch) —
 *  bank_rules carries retired_by/at/reason columns (design §4.3). Refuses
 *  rule_not_signed. */
export async function retireBankRule(token: string, clientId: string, ruleId: string, reason: string): Promise<void> {
  await rpc("retire_bank_rule", { p_rule: ruleId, p_op_key: opKey(), p_reason: reason }, token);
}

/** set_counterparty_terms(cp, days, op_key), bookkeeper floor. Refuses
 *  terms_out_of_range (≤0 or >365, design §5). */
export async function setCounterpartyTerms(
  token: string, clientId: string, counterpartyId: string, days: number,
): Promise<void> {
  await rpc(
    "set_counterparty_terms",
    { p_counterparty: counterpartyId, p_days: days, p_op_key: opKey() },
    token,
  );
}
