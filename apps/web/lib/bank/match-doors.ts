// The /bank matching workbench — DOORS (governed writes). See doors.ts's
// header for the door-vs-read-RPC distinction and the refusal-verbatim/
// hydrate-never-trust contract every function below follows.
//
// F-A3 PR-3 (migration 0129, Annex I): the bank-rules machine — and its C-c
// splice #4 `p_via_rule` overload on match_bank_line/settle_from_bank_line —
// is RETIRED WHOLE. Both verbs are back to their SINGLE 0038 arity; a caller
// can no longer stamp `origin='rule'` on a new match. Every signature below
// is that single post-0129 arity — never the retired rule-aware overload.
//
// EXACT signatures (design §4.6, migration 0038):
//   match_bank_line(p_client, p_lines jsonb, p_entries jsonb
//     [{entry_id,matched_cents}], p_adjustments jsonb default null,
//     p_ack_period_exceptions bool default false, p_op_key)
//   unmatch_bank_match(p_client, p_match, p_reason, p_op_key)
//   settle_from_bank_line(p_client, p_line, p_counterparty, p_allocations
//     jsonb, p_memo, p_posting_date date default null, p_charge_cents
//     bigint default 0, p_charge_account text default null, p_adjustments
//     jsonb default null, p_attestation text default null, p_control_account
//     text default null, p_op_key)
//   complete_pending_match(p_client, p_match, p_op_key)

import { callDoor, type CallDoorOptions } from "../doors";
import type { MatchEntryInput, BankAdjustmentInput, SettleAllocationInput, SettleReceipt } from "./match-types";

const opKey = () => crypto.randomUUID();

export async function matchBankLine(
  args: {
    clientId: string; lineIds: string[]; entries: MatchEntryInput[];
    adjustments?: BankAdjustmentInput[] | null; ackPeriodExceptions?: boolean;
  },
  opts: CallDoorOptions = {},
): Promise<{ match_id: string }> {
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_lines: args.lineIds, p_entries: args.entries,
    p_adjustments: args.adjustments ?? null,
    p_ack_period_exceptions: args.ackPeriodExceptions ?? false,
    p_op_key: opKey(),
  };
  const out = (await callDoor("match_bank_line", body, opts)) as { match_id?: string; id?: string } | null;
  const id = out?.match_id ?? out?.id;
  if (!id) throw new Error("match_bank_line returned no match_id");
  return { match_id: id };
}

export async function unmatchBankMatch(
  clientId: string, matchId: string, reason: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor("unmatch_bank_match", { p_client: clientId, p_match: matchId, p_reason: reason, p_op_key: opKey() }, opts);
}

export async function settleFromBankLine(
  args: {
    clientId: string; lineId: string; counterpartyId: string;
    allocations: SettleAllocationInput[]; memo: string;
    postingDate?: string | null; chargeCents?: number; chargeAccount?: string | null;
    adjustments?: BankAdjustmentInput[] | null; attestation?: string | null;
    controlAccount?: string | null;
  },
  opts: CallDoorOptions = {},
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
  return (await callDoor("settle_from_bank_line", body, opts)) as SettleReceipt;
}

/** Validates the now-approved entry (every floor + parity) and flips
 *  pending→live, writing the entry members. */
export async function completePendingMatch(
  clientId: string, matchId: string, opts: CallDoorOptions = {},
): Promise<SettleReceipt> {
  return (await callDoor(
    "complete_pending_match",
    { p_client: clientId, p_match: matchId, p_op_key: opKey() },
    opts,
  )) as SettleReceipt;
}
