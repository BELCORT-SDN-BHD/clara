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
import { matchOpKeyFor } from "./match-opkey";
import type { MatchEntryInput, BankAdjustmentInput, SettleAllocationInput, SettleReceipt } from "./match-types";
import type { MatchReceipt } from "./matching-context-types";

// #657 · D15 — ONE DECISION, ONE KEY, and only for `match_bank_line`.
//
// `opKey()` below is still a fresh uuid per call for the other three verbs, and that is the
// HOUSE POSTURE, left alone deliberately (`lib/members/doors.ts:58-66` mints a fresh key on
// purpose; `work-cancel-dialog.tsx`'s `useDecisionKey` mints one per open dialog). Both are
// right for a decision whose identity lives in a component's lifecycle.
//
// `match_bank_line` is the one verb on this lane whose identity does NOT. The surface reloads
// unconditionally after EVERY act, failed or not, so the human's second press of the same
// button after a lost response is a re-render away from the first — and with a per-call uuid
// the database saw two operations and refused the second with `already_matched`, a refusal for
// something that had in fact already succeeded. So its key is DERIVED from the intent tuple
// (see `match-opkey.ts` for the renewal rule, written out in full). Same intent, same key, by
// construction rather than by remembering to hold one.
const opKey = () => crypto.randomUUID();

export async function matchBankLine(
  args: {
    clientId: string; lineIds: string[]; entries: MatchEntryInput[];
    adjustments?: BankAdjustmentInput[] | null; ackPeriodExceptions?: boolean;
    /** #657 fix-round (review SP1 / A1) — each selected entry's WORLD GENERATION, keyed by
     *  entry id, read off the candidate row's own `match_history` with
     *  `entryGeneration()`. KEY MATERIAL ONLY: it never reaches the wire body, because
     *  `clara._reserve_op` re-hashes the real arguments and refuses a key whose request hash
     *  disagrees. An entry the caller does not describe contributes `null`, which is a value,
     *  not an absence — a caller that cannot see the history must at least be stable. */
    entryGenerations?: Readonly<Record<string, string | null>>;
  },
  opts: CallDoorOptions = {},
): Promise<MatchReceipt & { match_id: string; op_key: string }> {
  const opKeyForThisDecision = matchOpKeyFor({
    clientId: args.clientId,
    lineIds: args.lineIds,
    entries: args.entries.map((e) => ({
      entry_id: e.entry_id,
      matched_cents: e.matched_cents,
      generation: args.entryGenerations?.[e.entry_id] ?? null,
    })),
    ackPeriodExceptions: args.ackPeriodExceptions ?? false,
  });
  const body: Record<string, unknown> = {
    p_client: args.clientId, p_lines: args.lineIds,
    // The door's arity, exactly: a generation is key material and must not widen p_entries.
    p_entries: args.entries.map((e) => ({ entry_id: e.entry_id, matched_cents: e.matched_cents })),
    p_adjustments: args.adjustments ?? null,
    p_ack_period_exceptions: args.ackPeriodExceptions ?? false,
    p_op_key: opKeyForThisDecision,
  };
  const out = (await callDoor("match_bank_line", body, opts)) as MatchReceipt | null;
  const id = out?.match_id ?? out?.id;
  if (!id) throw new Error("match_bank_line returned no match_id");
  // `op_key` is the key THIS CALL SENT, not a field the door echoes — `_finish_op`'s payload
  // (0038:4233-4238, widened by 0226 §6) does not carry one. It is still the key the receipt is
  // stored under, because `clara._reserve_op` stores by (firm, fn, op_key); the outcome block
  // labels it as the operation key so a human can quote it, and claims nothing more (review A6).
  return { ...out, match_id: id, op_key: opKeyForThisDecision } as MatchReceipt & { match_id: string; op_key: string };
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
