// #949 — the tenancy rent lane's two READS for the /bank Matching tab. Transport
// via callDoor, not getRows (the payroll-settlement-reads.ts idiom, for the same
// measured reason): both doors are `language plpgsql security definer` with no
// volatility qualifier, so they default VOLATILE and PostgREST requires POST.
//
// Arg names are EXACT, pinned in migration 0300:
// get_rent_settlement_candidates(p_client), get_tenancy_deposit_coding(p_client).

import { callDoor } from "../doors";
import type { BankReadOptions } from "./reads";
import {
  toRentSettlementMonth, toTenancyDepositOffer,
  type RentSettlementMonth, type TenancyDepositOffer,
} from "./rent-settlement-types";

/** Per client, each month of rent on a confirmed tenancy plan whose payable is
 *  still open, with its own candidate bank lines. Derived entirely from live
 *  state; an empty array means every month is covered (or none has posted). */
export async function getRentSettlementCandidates(
  clientId: string, opts: BankReadOptions = {},
): Promise<RentSettlementMonth[]> {
  const out = await callDoor("get_rent_settlement_candidates", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toRentSettlementMonth);
}

/** Per client, every recorded tenancy deposit with the bank lines that could be
 *  it and `1120 Deposits Paid` as the proposed coding. An OFFER, never a
 *  posting: there is no write door here at all. */
export async function getTenancyDepositCoding(
  clientId: string, opts: BankReadOptions = {},
): Promise<TenancyDepositOffer[]> {
  const out = await callDoor("get_tenancy_deposit_coding", { p_client: clientId }, opts);
  return (Array.isArray(out) ? out : []).map(toTenancyDepositOffer);
}
