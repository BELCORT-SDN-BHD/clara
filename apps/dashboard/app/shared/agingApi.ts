// Wave C-c wire client for /aging (design v2.1 §6). HUMAN lane only
// (PostgREST as clara_authenticated). No figure is computed here — the DB
// owns every cents value (AGENTS.md law); this module only calls the four
// named read RPCs and maps their rows defensively.
//
// [D1/M2+A1 fix] `ar_aging`/`ap_aging`/`customer_statement`/`supplier_
// statement` each return a SINGLE jsonb OBJECT (0040_wave_c_c_tieout.sql:
// 3494-3508 / 3576-3588) — never an array. The prior version of this file
// unwrapped with `Array.isArray(out) ? out : []`, which is always false on
// an object, so every read here returned `[]` unconditionally and /aging
// rendered "no open items" over a real AR/AP book. Unwrapped against the
// real envelope keys now: `counterparties`/`totals` (aging) and `rows`
// (statement) — see agingModel.ts's header for the exact key sets.

import { rpc } from "./wire";
import {
  toAgingBucketRow, toAgingTotals, toStatementLineRow,
  type AgingBucketRow, type AgingTotals, type StatementLineRow,
} from "../aging/agingModel";

export type AgingRead = { rows: AgingBucketRow[]; totals: AgingTotals | null; available: boolean };
export type StatementRead = { rows: StatementLineRow[]; available: boolean };

function toAgingRead(out: unknown): AgingRead {
  const o = (out ?? {}) as Record<string, unknown>;
  const available = typeof out === "object" && out !== null && Array.isArray(o.counterparties);
  return {
    rows: available ? (o.counterparties as unknown[]).map(toAgingBucketRow) : [],
    totals: toAgingTotals(o.totals),
    available,
  };
}

function toStatementRead(out: unknown): StatementRead {
  const o = (out ?? {}) as Record<string, unknown>;
  const available = typeof out === "object" && out !== null && Array.isArray(o.rows);
  return {
    rows: available ? (o.rows as unknown[]).map(toStatementLineRow) : [],
    available,
  };
}

/** ar_aging(client, as_of, p_segment default null) — design §6. `segment` is
 *  the reserved-ignored forward hook (Au18); omitted/null on every call this
 *  lane makes today. */
export async function arAging(
  token: string, clientId: string, asOf: string, segment?: string | null,
): Promise<AgingRead> {
  const out = await rpc("ar_aging", { p_client: clientId, p_as_of: asOf, p_segment: segment ?? null }, token);
  return toAgingRead(out);
}

export async function apAging(
  token: string, clientId: string, asOf: string, segment?: string | null,
): Promise<AgingRead> {
  const out = await rpc("ap_aging", { p_client: clientId, p_as_of: asOf, p_segment: segment ?? null }, token);
  return toAgingRead(out);
}

export async function customerStatement(
  token: string, clientId: string, counterpartyId: string, from: string, to: string,
): Promise<StatementRead> {
  const out = await rpc(
    "customer_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    token,
  );
  return toStatementRead(out);
}

export async function supplierStatement(
  token: string, clientId: string, counterpartyId: string, from: string, to: string,
): Promise<StatementRead> {
  const out = await rpc(
    "supplier_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    token,
  );
  return toStatementRead(out);
}
