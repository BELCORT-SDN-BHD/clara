// #947 — the payroll net-pay settlement lane READ. Transport via callDoor,
// not a governed act (the reads.ts/match-reads.ts idiom): clara.get_payroll_
// settlement_candidates is `language plpgsql security definer` with no
// volatility qualifier (defaults VOLATILE), so PostgREST requires POST —
// getRows (a GET-only primitive) cannot reach it.
//
// Arg name is EXACT, pinned in migration 0298: get_payroll_settlement_
// candidates(p_client).

import { callDoor } from "../doors";
import type { BankReadOptions } from "./reads";
import { toPayrollSettlementRun, type PayrollSettlementRun } from "./payroll-settlement-types";

/** Per client, each posted payroll run whose net pay is not yet settled,
 *  with its own candidate bank lines. Derived entirely from live state;
 *  an empty array means every run is settled (or none has posted). */
export async function getPayrollSettlementCandidates(
  clientId: string, opts: BankReadOptions = {},
): Promise<PayrollSettlementRun[]> {
  const out = await callDoor("get_payroll_settlement_candidates", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toPayrollSettlementRun);
}
