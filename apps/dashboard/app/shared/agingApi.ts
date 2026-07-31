// Wave C-c wire client for /aging (design v2.1 §6). HUMAN lane only
// (PostgREST as clara_authenticated). No figure is computed here — the DB
// owns every cents value (CLAUDE.md law); this module only calls the four
// named read RPCs and maps their rows defensively.
//
// READ SHAPE HONESTY NOTE (mirrors reconApi.ts's header). Migration 0040 is
// still-to-merge as this file is written; ar_aging/ap_aging/customer_
// statement/supplier_statement's exact JSON is not pinned beyond the design's
// prose (§6). Arg names are p_-prefixed on the house convention; CORRECT AT
// INTEGRATION against the real migration.

import { rpc } from "./wire";
import {
  toAgingBucketRow, toStatementLineRow,
  type AgingBucketRow, type StatementLineRow,
} from "../aging/agingModel";

/** ar_aging(client, as_of, p_segment default null) — design §6. `segment` is
 *  the reserved-ignored forward hook (Au18); omitted/null on every call this
 *  lane makes today. */
export async function arAging(
  token: string, clientId: string, asOf: string, segment?: string | null,
): Promise<AgingBucketRow[]> {
  const out = await rpc("ar_aging", { p_client: clientId, p_as_of: asOf, p_segment: segment ?? null }, token);
  return (Array.isArray(out) ? out : []).map(toAgingBucketRow);
}

export async function apAging(
  token: string, clientId: string, asOf: string, segment?: string | null,
): Promise<AgingBucketRow[]> {
  const out = await rpc("ap_aging", { p_client: clientId, p_as_of: asOf, p_segment: segment ?? null }, token);
  return (Array.isArray(out) ? out : []).map(toAgingBucketRow);
}

export async function customerStatement(
  token: string, clientId: string, counterpartyId: string, from: string, to: string,
): Promise<StatementLineRow[]> {
  const out = await rpc(
    "customer_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    token,
  );
  return (Array.isArray(out) ? out : []).map(toStatementLineRow);
}

export async function supplierStatement(
  token: string, clientId: string, counterpartyId: string, from: string, to: string,
): Promise<StatementLineRow[]> {
  const out = await rpc(
    "supplier_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    token,
  );
  return (Array.isArray(out) ? out : []).map(toStatementLineRow);
}
