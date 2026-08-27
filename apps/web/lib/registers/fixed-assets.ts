// Fixed asset register — clara.list_fixed_assets(p_client) (packages/db/migrations/
// 0041_wave_d_a_fa_register.sql:4110-4128), viewer+, granted at 0041:4405-4424.
// Envelope: { client_id, as_of, assets: [...], incomplete_count }. Every asset row is
// `clara._fa_asset_json` — cost/accumulated/NBV are DB-projected as-of TODAY (hard
// constraint 2: never recomputed here). This register-list read trims the row to its
// display columns; the fuller per-asset shape (lineage, depreciation schedule,
// disposal workflow) lives behind clara.get_fixed_asset(p_asset) — out of scope for
// this read-only registers tab, not wired here.
//
// read RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics (the team convention, this build's coordinator ruling).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FixedAssetRow = {
  id: string;
  description: string | null;
  status: "pending" | "active" | "superseded" | "disposed" | "unwound" | string;
  particulars_complete: boolean;
  acquired_date: string | null;
  cost_cents: number | null;
  residual_cents: number | null;
  accumulated_cents: number | null;
  nbv_cents: number | null;
  method: "straight_line" | "reducing_balance" | "none" | null;
  useful_life_months: number | null;
  disposed_at: string | null;
};

export type FixedAssetRegisterEnvelope = {
  client_id: string;
  as_of: string;
  assets: FixedAssetRow[];
  incomplete_count: number;
};

/** read RPC — transport via callDoor; not a governed act. */
export function loadFixedAssets(session: SessionTokenAccessor, clientId: string): Promise<FixedAssetRegisterEnvelope> {
  return callDoor<FixedAssetRegisterEnvelope>("list_fixed_assets", { p_client: clientId }, { session });
}
