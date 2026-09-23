// #947 — the payroll net-pay settlement DOOR. clara.settle_payroll_net_pay(
// p_client, p_entry, p_line, p_op_key) — migration 0298. Books Dr 2040 / Cr
// the bank's own account for the run's own unsettled cents, approves it, and
// reuses clara._match_bank_line_core (an EXISTING bank-side door) to bind it
// to the chosen line — never a second matching mechanism.
//
// A fresh op_key per call (the settle_from_bank_line/complete_pending_match
// posture in match-doors.ts, not match_bank_line's derived-key one): this
// door's identity is "accept THIS candidate for THIS run", a decision made
// once per click rather than one whose retry-safety depends on the intent
// tuple staying stable across re-renders.

import { callDoor, type CallDoorOptions } from "../doors";

export type PayrollSettlementReceipt = {
  entry_id: string;
  match_id: string;
  unsettled_cents: number;
  posting_date: string;
};

export async function settlePayrollNetPay(
  args: { clientId: string; entryId: string; lineId: string },
  opts: CallDoorOptions = {},
): Promise<PayrollSettlementReceipt> {
  const body = {
    p_client: args.clientId,
    p_entry: args.entryId,
    p_line: args.lineId,
    p_op_key: crypto.randomUUID(),
  };
  return (await callDoor("settle_payroll_net_pay", body, opts)) as PayrollSettlementReceipt;
}
