// The /bank exceptions lane — DOORS (governed writes). See doors.ts's header
// for the door-vs-read-RPC distinction and the refusal-verbatim contract.
// OWNER-floor verbs (except_bank_line, resolve_bank_line_exception,
// resolve_and_book_bank_line) enforce the role floor in the DB — this module
// never gates on a locally-guessed role; the CLR refusal is authoritative.
//
// EXACT signatures:
//   except_bank_line(p_line, p_kind, p_reason, p_evidence_document, p_op_key)
//     — migration 0121's own regprocedure check pins this arity byte-for-
//     byte: clara.except_bank_line(uuid,text,text,uuid,text).
//   resolve_bank_line_exception(p_exception, p_disposition, p_note,
//     p_counterpart_line, p_op_key) — migration 0040:3002-3004. `matched_
//     booking`/`written_off_adjustment` require the line to already be a
//     live matched member in the SAME transaction — this door does not
//     pre-validate that locally; use resolveAndBookBankLine for those two
//     dispositions instead (its composite books the entry itself).
//   resolve_and_book_bank_line(p_client, p_exception, p_disposition, p_note,
//     p_draft, p_allocations, p_adjustments, p_advance_applications,
//     p_charge_cents, p_charge_account, p_attestation, p_op_key,
//     p_ack_period_exceptions) — the AF-2 composite, EXACTLY 13 named
//     params, byte-verified against its own `create function` declaration
//     in migration 0044 (:3106-3111) — NO `p_control_account` exists on
//     this human-callable function (migration 0121 adds a `wake_` agent
//     variant and a shared `_core`, but never touches this public
//     signature). apps/dashboard's own shared/reconApi.ts sends a stray
//     `p_control_account` key on this call, which PostgREST's named-
//     argument resolution cannot satisfy (PGRST202, "no function matching
//     this signature") — NOT reproduced here; see this build's own report
//     for the flag. THE SETTLEMENT/OPEN-ITEM LEG (`p_allocations`) IS THE
//     NAMED GAP this build does not wire a picker for — see
//     components/bank/exceptions-section.tsx. This module only ever sends
//     the HAND-DRAFT leg (`p_draft`), matching Af2DraftInput.

import { callDoor, type CallDoorOptions } from "../doors";
import type { Af2DraftInput, ResolveAndBookBankLineDisposition, ResolveAndBookBankLineResult } from "./exception-types";
import { toResolveAndBookBankLineResult } from "./exception-types";
import type { BankLineExceptionDisposition, BankLineExceptionKind } from "./exception-types";

const opKey = () => crypto.randomUUID();

/** OWNER floor. Mints a new open exception on a line — also the door a
 *  human uses to ACT ON an agent's line_exception proposal (the insert
 *  auto-flips the matching open proposal to accepted, migration 0121 DDL 6).
 *  The RPC's own receipt is `{exception_id, line_id, status}` — NOT the
 *  bank_line_exceptions row shape (no kind/reason/created_at/…) — returned
 *  as an opaque report, never mapped through toBankLineException.
 *  Hydrate-never-trust: the caller re-reads listOpenBankLineExceptions
 *  afterward for the real row. */
export async function exceptBankLine(
  args: { lineId: string; kind: BankLineExceptionKind | string; reason: string; evidenceDocumentId?: string | null },
  opts: CallDoorOptions = {},
): Promise<Record<string, unknown>> {
  const out = await callDoor(
    "except_bank_line",
    { p_line: args.lineId, p_kind: args.kind, p_reason: args.reason, p_evidence_document: args.evidenceDocumentId ?? null, p_op_key: opKey() },
    opts,
  );
  return (out ?? {}) as Record<string, unknown>;
}

/** OWNER floor. Only `bank_corrective_line` is offered by this door's own
 *  UI (components/bank/exceptions-section.tsx) — see this file's header.
 *  The RPC's own receipt is `{exception_id, status, disposition,
 *  counterpart_line_id, counterpart_exception_id}` — again NOT the row
 *  shape — returned opaque for the same reason as exceptBankLine above. */
export async function resolveBankLineException(
  args: {
    exceptionId: string; disposition: BankLineExceptionDisposition | string; note: string;
    counterpartLineId?: string | null;
  },
  opts: CallDoorOptions = {},
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    p_exception: args.exceptionId, p_disposition: args.disposition, p_note: args.note, p_op_key: opKey(),
  };
  if (args.counterpartLineId) body.p_counterpart_line = args.counterpartLineId;
  const out = await callDoor("resolve_bank_line_exception", body, opts);
  return (out ?? {}) as Record<string, unknown>;
}

/** The AF-2 composite, hand-draft leg only (see this file's header). No
 *  `p_control_account` — see the header note. */
export async function resolveAndBookBankLine(
  args: {
    clientId: string; exceptionId: string; disposition: ResolveAndBookBankLineDisposition; note: string;
    draft: Af2DraftInput;
  },
  opts: CallDoorOptions = {},
): Promise<ResolveAndBookBankLineResult> {
  const out = await callDoor(
    "resolve_and_book_bank_line",
    {
      p_client: args.clientId, p_exception: args.exceptionId, p_disposition: args.disposition, p_note: args.note,
      p_draft: args.draft, p_allocations: null, p_adjustments: null, p_advance_applications: null,
      p_ack_period_exceptions: false, p_charge_cents: 0, p_charge_account: null, p_attestation: null,
      p_op_key: opKey(),
    },
    opts,
  );
  return toResolveAndBookBankLineResult(out);
}
