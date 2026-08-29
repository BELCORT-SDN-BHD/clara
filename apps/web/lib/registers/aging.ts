// AR/AP aging — clara.ar_aging / clara.ap_aging(p_client, p_as_of, p_segment)
// (packages/db/migrations/0040_wave_c_c_tieout.sql:3989-4008), bookkeeper+, granted
// at 0040:4790-4801.
//
// BODY OF RECORD — NOT 0040's TEXT. `clara._aging_core` is a CoR'd body: 0040 created it
// and 裁-19 PR-1 (the counterparty-merge read layer) SPLICED it, so the live definition is
// `pg_get_functiondef` on the catalog, never any one migration's source. What the splice
// changed for THIS module: aging now groups by the CANONICAL party (a merged counterparty
// stops being its own row and folds into its survivor), each per-counterparty object gains
// `resolution` ('canonical' | 'unresolved'), and each item gains
// `recorded_counterparty_id` — the party the invoice was actually raised under. The bucket
// keys, the `totals` shape and the no-client-side-sums rule below are unchanged.
//
// Pre-bucketed by the DB (clara._aging_core) —
// current/31-60/61-90/91+ cents per counterparty, plus a DB-summed `totals` row; this
// module never sums a bucket itself (hard constraint 2). `p_segment` is a reserved,
// always-null forward hook (0040:3993-3995) — never sent as anything but null today.
// Reference client (real precedent, same envelope keys): apps/dashboard/app/shared/
// agingApi.ts.
//
// read RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics (the team convention, this build's coordinator ruling).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { businessToday } from "@/lib/business-date";

export type AgingDomain = "ar" | "ap";

export type AgingItem = {
  item_id: string;
  item_kind: string | null;
  item_date: string | null;
  due_date: string | null;
  overdue: boolean;
  outstanding_cents: number | null;
  bucket: "current" | "d31_60" | "d61_90" | "d91_plus" | string | null;
};

export type AgingCounterpartyRow = {
  counterparty_id: string;
  counterparty_name: string | null;
  current_cents: number | null;
  d31_60_cents: number | null;
  d61_90_cents: number | null;
  d91_plus_cents: number | null;
  total_cents: number | null;
  items: AgingItem[];
};

export type AgingTotals = {
  current_cents: number | null;
  d31_60_cents: number | null;
  d61_90_cents: number | null;
  d91_plus_cents: number | null;
  total_cents: number | null;
};

export type AgingEnvelope = {
  as_of: string;
  domain: AgingDomain;
  counterparties: AgingCounterpartyRow[];
  totals: AgingTotals;
};

/** read RPC — transport via callDoor; not a governed act. `asOf` defaults to the
 *  business-timezone today (see @/lib/business-date's header for why never a plain
 *  browser UTC date). */
export function loadAging(
  session: SessionTokenAccessor,
  domain: AgingDomain,
  clientId: string,
  asOf: string = businessToday(),
): Promise<AgingEnvelope> {
  const fn = domain === "ar" ? "ar_aging" : "ap_aging";
  return callDoor<AgingEnvelope>(fn, { p_client: clientId, p_as_of: asOf, p_segment: null }, { session });
}
