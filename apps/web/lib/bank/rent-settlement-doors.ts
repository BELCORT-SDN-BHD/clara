// #949 — the rent-payable settlement DOOR. clara.settle_rent_payable(p_client,
// p_entry, p_line, p_op_key) — migration 0300. Books Dr <the plan's own payable>
// / Cr the bank's own account for the month's unsettled cents and reuses
// clara._match_bank_line_core (an EXISTING bank-side door) to bind it to the
// chosen line — never a second matching mechanism.
//
// A fresh op_key per call, the #947 posture: this door's identity is "accept
// THIS candidate for THIS month", a decision made once per click.
//
// TWO OUTCOMES, AND THE CALLER MUST READ `status`. An ordinary-stakes settlement
// comes back `settled`, with the match it bound. A HIGH-STAKES one comes back
// `awaiting_checker` with a null match_id: the entry was DRAFTED and left for a
// distinct checker to approve through the ordinary door (clara.reverse_entry's
// own posture, restated by the wave-4 fix round). Nothing is dark — the act
// completes through doors that already exist — but a surface that renders
// "settled" for both would be telling a person something untrue.

import { callDoor, type CallDoorOptions } from "../doors";

export type RentSettlementStatus = "settled" | "awaiting_checker";

export type RentSettlementReceipt = {
  entry_id: string;
  match_id: string | null;
  unsettled_cents: number;
  period_month: string;
  posting_date: string;
  status?: RentSettlementStatus;
  reason?: string | null;
  eligible_checker_count?: number;
};

export async function settleRentPayable(
  args: { clientId: string; entryId: string; lineId: string },
  opts: CallDoorOptions = {},
): Promise<RentSettlementReceipt> {
  const body = {
    p_client: args.clientId,
    p_entry: args.entryId,
    p_line: args.lineId,
    p_op_key: crypto.randomUUID(),
  };
  return (await callDoor("settle_rent_payable", body, opts)) as RentSettlementReceipt;
}
