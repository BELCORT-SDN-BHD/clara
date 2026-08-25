// Wave C-c wire client (design v2.1 §5/§6) — split from bankApi.ts (repo
// file-size discipline, the matchModel.ts precedent). HUMAN lane only
// (PostgREST as clara_authenticated); every writer carries a FRESH op_key
// (the DB is idempotent on firm,fn,op_key). No figure is computed here — the
// DB owns every cents value (AGENTS.md law).
//
// READ/WRITE SHAPE HONESTY NOTE (mirrors bankApi.ts's own header). The verbs
// here are anchored by the object they name (statement / recon / line /
// exception / counterparty), not by a leading p_client — this file normalizes
// every arg to the house p_* convention on that basis. Every mapper is
// DEFENSIVE (the model.ts toXxx idiom).
//
// F-A3 (Annex I): the bank-rules learn loop (propose/sign/retire_bank_rule,
// list_bank_rule_candidates, list_bank_rules, list_bank_line_suggestions,
// accept_bank_rule_suggestion) RETIRED WHOLE — the machine, not merely a
// surface. clara.bank_rules and its historical rows stay KEEP-AS-HISTORY at
// the DB layer (Annex I); nothing in this file reads or writes them anymore.

import { rpc, type PgrestError } from "./wire";
import { af2Admission, type Af2DraftInput } from "../bank/resolveBookModel";
import type { SettleAllocationInput, BankAdjustmentInput } from "./bankApi";
import {
  toBankReconciliationView, toBankLineException, toUnmatchedLine, toResolveAndBookBankLineResult,
  type BankReconciliationView, type BankLineExceptionRow, type BankLineExceptionKind,
  type BankLineExceptionDisposition, type UnmatchedLineRow,
  type ResolveAndBookBankLineResult,
} from "../bank/reconModel";

const opKey = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/** get_bank_reconciliation(p_statement) — the receipt + snapshot when a
 *  COMPLETE recon exists on this statement, or the DERIVED open preview
 *  otherwise (design §6). [F5 fix — was "complete/void"] a void receipt is
 *  NEVER the primary body: once no complete recon exists, the primary body
 *  is always the live preview (re-completion reachable), with the newest
 *  void's own columns/snapshot carried under `voided_receipt` (the C6
 *  amendment). Never null in the open-statement case (a preview always
 *  exists); null only degrades a truly empty response. */
export async function getBankReconciliation(token: string, statementId: string): Promise<BankReconciliationView | null> {
  const out = await rpc("get_bank_reconciliation", { p_statement: statementId }, token);
  if (!out) return null;
  return toBankReconciliationView(out);
}

export async function listUnmatchedLines(token: string, clientId: string): Promise<UnmatchedLineRow[]> {
  const out = await rpc("list_unmatched_lines", { p_client: clientId }, token);
  return (Array.isArray(out) ? out : []).map(toUnmatchedLine);
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

// ---------------------------------------------------------------------------
// Wave D-b (design `wave-d-b-design.md` §4/§5; the builder ABI
// `wave-d-b-design-abi.md` §A) — the AF-2 composite + the S4 producer.
// ---------------------------------------------------------------------------

export type ResolveAndBookBankLineDisposition = "matched_booking" | "written_off_adjustment";

/** ONE draft shape, defined once in resolveBookModel.ts and re-exported here —
 *  the admission predicate and this wire client must not be able to hold two
 *  different opinions about what a hand-draft is.
 *
 *  `counterparty` is typed `unknown` on purpose: ABI §A names it `counterparty?`
 *  and the verb feeds it to `clara._resolve_counterparty`, which reads a
 *  PROPOSAL OBJECT (`{existing_id}` / `{new: {...}}`) — the composite tests
 *  `jsonb_typeof(p_draft->'counterparty') = 'object'`. The previous
 *  `string | null` here promised a spelling the verb does not accept. Nothing in
 *  this dashboard sets the key today; a future caller must send the proposal. */
export type ResolveAndBookBankLineDraft = Af2DraftInput;

/** resolve_and_book_bank_line(...) — owner floor (ABI §A). `p_disposition IN
 *  ('matched_booking','written_off_adjustment')` ONLY — `bank_corrective_
 *  line` always refuses here (`disposition_unsupported`; use `resolveBank
 *  LineException` above).
 *
 *  TWO LEGS, ONE PER CALL, DERIVED FROM WHAT IS SUPPLIED (there is no leg
 *  selector): `draft` ⇒ the hand-draft leg; a non-empty `allocations` ⇒ the
 *  settlement leg. Naming both refuses; naming NEITHER refuses `no_booking` —
 *  the round-3 defect, see resolveBookModel.ts.
 *
 *  THE PARK IS NOT AN ACT YOU CAN REQUEST [WDB-G9]. Only the SETTLEMENT leg can
 *  park, and only the DB decides it does: the settle core builds the entry, asks
 *  `is_high_stakes`, and answers `branch:'pending'`. On that branch the
 *  ancillaries (charge / difference adjustments) refuse
 *  `pending_branch_ancillary_unsupported`, and a high-stakes HAND-DRAFT refuses
 *  the same token on axis `draft`. This client therefore never promises a park —
 *  it sends a settlement and renders the branch the DB returns. */
export async function resolveAndBookBankLine(
  token: string,
  args: {
    clientId: string; exceptionId: string; disposition: ResolveAndBookBankLineDisposition; note: string;
    draft?: ResolveAndBookBankLineDraft | null;
    allocations?: readonly SettleAllocationInput[] | null;
    adjustments?: readonly BankAdjustmentInput[] | null;
    advanceApplications?: { kind: string; reason: string; allocations: { line_no: number; advance_id: string; amount_cents: number }[] } | null;
    ackPeriodExceptions?: boolean;
    chargeCents?: number | null;
    chargeAccount?: string | null;
    attestation?: string | null;
  },
): Promise<ResolveAndBookBankLineResult> {
  // [round-3 fix — the walled-corridor class, third recurrence] THE SAME BODY
  // the UI's controls read decides here too, so this client can never send a
  // request the surface has already told the user is inadmissible, and the two
  // can never drift apart into "the button promised X, the verb refused X".
  // It is deliberately a SUBSET of the DB's law (argument shape only) — see
  // resolveBookModel.ts's header. Everything stateful stays the DB's call and
  // its refusal is rendered verbatim.
  const admission = af2Admission({
    disposition: args.disposition, note: args.note, draft: args.draft ?? null,
    allocations: args.allocations ?? null, adjustments: args.adjustments ?? null,
    advanceApplications: args.advanceApplications ?? null,
    ackPeriodExceptions: args.ackPeriodExceptions ?? false,
    chargeCents: args.chargeCents ?? 0, chargeAccount: args.chargeAccount ?? null,
  });
  if (!admission.admitted) {
    const err = new Error(`resolve_and_book_bank_line refused before sending: ${admission.message}`) as PgrestError;
    err.clr = "CLR10";
    err.reason = admission.reason;
    err.pgDetails = JSON.stringify({ reason: admission.reason, axis: admission.axis });
    throw err;
  }
  const out = await rpc(
    "resolve_and_book_bank_line",
    {
      p_client: args.clientId, p_exception: args.exceptionId, p_disposition: args.disposition, p_note: args.note,
      // An EMPTY adjustments array is sent as null, never as `[]`: the
      // settlement leg counts `_bank_adjustments_norm(...)` on the park branch,
      // and "no adjustments" must be indistinguishable from "the caller never
      // named any" so a park is never refused `ancillaries` over an empty list.
      p_draft: args.draft ?? null, p_allocations: args.allocations ?? null,
      p_adjustments: args.adjustments && args.adjustments.length > 0 ? args.adjustments : null,
      p_advance_applications: args.advanceApplications ?? null,
      p_ack_period_exceptions: args.ackPeriodExceptions ?? false, p_charge_cents: args.chargeCents ?? 0,
      p_charge_account: args.chargeAccount ?? null, p_attestation: args.attestation ?? null, p_op_key: opKey(),
    },
    token,
  );
  return toResolveAndBookBankLineResult(out);
}
