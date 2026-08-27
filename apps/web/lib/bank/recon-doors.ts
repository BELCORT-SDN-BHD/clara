// The /bank "certify" lane — DOORS (governed writes). See doors.ts's header
// for the door-vs-read-RPC distinction and the refusal-verbatim contract.
//
// EXACT signatures (migration 0040):
//   complete_bank_reconciliation(p_statement, p_ack_outstanding uuid[],
//     p_op_key), bookkeeper floor. Refuses recon_prior_missing/period_gap/
//     line_unsettled/line_reserved/difference_nonzero/opening_mismatch/
//     outstanding_stale/coa_shared/uncleared_off_account/statement_not_live/
//     already_complete — rendered verbatim, never re-worded.
//   void_bank_reconciliation(p_recon, p_reason, p_op_key), bookkeeper floor.
//     Refuses recon_chain_order (void newest-first) / recon_already_void /
//     reason_required.

import { callDoor, type CallDoorOptions } from "../doors";

const opKey = () => crypto.randomUUID();

/** N14 fix (independent review): this door's own receipt was never byte-
 *  verified against `BankReconciliationView`'s shape (unlike resolve_and_
 *  book_bank_line's `resolution_exception_id`/`branch`, which migration
 *  0044:3725-3729 confirms ARE top-level receipt keys) — mapping it through
 *  `toBankReconciliationView` risked the exact BLOCKER-1 class of defect
 *  (a near-miss shape read as a fuller one than it is). Returned opaque,
 *  like except_bank_line/resolve_bank_line_exception/set_bank_agency_hold:
 *  hydrate-never-trust means the caller re-reads getBankReconciliation
 *  afterward for the real, mapped view regardless. */
export async function completeBankReconciliation(
  statementId: string, ackOutstandingIds: string[], opts: CallDoorOptions = {},
): Promise<Record<string, unknown>> {
  const out = await callDoor(
    "complete_bank_reconciliation",
    { p_statement: statementId, p_ack_outstanding: ackOutstandingIds, p_op_key: opKey() },
    opts,
  );
  return (out ?? {}) as Record<string, unknown>;
}

export async function voidBankReconciliation(
  reconId: string, reason: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor("void_bank_reconciliation", { p_recon: reconId, p_reason: reason, p_op_key: opKey() }, opts);
}
