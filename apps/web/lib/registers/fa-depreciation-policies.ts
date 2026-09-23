// #932 (migration 0277) — the default depreciation policy per enrolled fixed-asset account.
// clara.fa_account_depreciation_policies read directly (the SAME Q3 read-the-tables mechanism
// lib/registers/fa-account-profiles.ts already uses for the enrolment it is keyed on: a real
// SELECT grant to clara_authenticated, forced RLS, `p_fadp_human` scopes by
// `firm_id = jwt_firm()`) — never derived from the register's own asset rows.
//
// clara.set_fa_depreciation_policy / clara.retire_fa_depreciation_policy — bookkeeper+.
// VERSION-FORWARD, NEVER MUTATE (the live prosrc's own law, mirroring
// clara.upsert_fa_account_profile): a real set retires the live row (if one exists) and inserts
// a fresh one at version+1; retiring ends the live row WITHOUT replacing it, so the account
// reverts to "no policy" and the birth trigger parks the question exactly as it does for an
// account that was never covered. Every account-typing/method-driver/non-depreciable refusal is
// the DOOR's own CLR37 `fa_policy_invalid` — this module states no client-side shape rule of its
// own beyond what the form already narrows (method choice, then life OR rate).

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FaDepreciationMethod = "straight_line" | "reducing_balance" | "none";

export type FaDepreciationPolicyRow = {
  id: string;
  asset_account_code: string;
  version: number;
  method: FaDepreciationMethod;
  useful_life_months: number | null;
  rate_bps: number | null;
  residual_cents: number;
  active: boolean;
  effective_from: string;
  reason: string | null;
  created_at: string;
  retired_at: string | null;
};

const FA_DEPRECIATION_POLICY_COLS =
  "id,asset_account_code,version,method,useful_life_months,rate_bps,residual_cents,active,effective_from,reason,created_at,retired_at";

/** Every ACTIVE default depreciation policy for this client — the live policy a new
 *  acquisition on that account is born from when it states no particulars. No explicit firm
 *  filter (RLS + `p_fadp_human` already scope it, the same idiom
 *  lib/registers/fa-account-profiles.ts's loadFaAccountProfiles uses). */
export function loadFaDepreciationPolicies(session: SessionTokenAccessor, clientId: string): Promise<FaDepreciationPolicyRow[]> {
  return getRows<FaDepreciationPolicyRow>("fa_account_depreciation_policies", {
    select: FA_DEPRECIATION_POLICY_COLS,
    filters: { client_id: `eq.${clientId}`, active: "eq.true" },
    order: "asset_account_code.asc",
    session,
  });
}

/** clara.set_fa_depreciation_policy(p_client, p_asset_account, p_method, p_useful_life_months,
 *  p_rate_bps, p_residual_cents, p_reason, p_op_key) — bookkeeper+. `method: "none"` carries no
 *  life or rate; `straight_line` needs a life and no rate; `reducing_balance` needs both a life
 *  AND a 1..10000 bps rate — the door refuses CLR37 `fa_policy_invalid` axis `drivers` on a
 *  mismatch, and axis `not_enrolled` if the account carries no active
 *  clara.fa_account_profiles row. */
export function setFaDepreciationPolicy(
  session: SessionTokenAccessor,
  args: {
    clientId: string;
    assetAccount: string;
    method: FaDepreciationMethod;
    usefulLifeMonths: number | null;
    rateBps: number | null;
    residualCents: number | null;
    reason?: string | null;
  },
): Promise<unknown> {
  return callDoor(
    "set_fa_depreciation_policy",
    {
      p_client: args.clientId,
      p_asset_account: args.assetAccount,
      p_method: args.method,
      p_useful_life_months: args.usefulLifeMonths,
      p_rate_bps: args.rateBps,
      p_residual_cents: args.residualCents,
      p_reason: args.reason ?? null,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.retire_fa_depreciation_policy(p_client, p_asset_account, p_reason, p_op_key) —
 *  bookkeeper+. Refuses CLR37 `fa_policy_invalid` axis `not_set` if no active policy names this
 *  account for this client. Never touches a register row an earlier version already birthed. */
export function retireFaDepreciationPolicy(
  session: SessionTokenAccessor,
  args: { clientId: string; assetAccount: string; reason?: string | null },
): Promise<unknown> {
  return callDoor(
    "retire_fa_depreciation_policy",
    { p_client: args.clientId, p_asset_account: args.assetAccount, p_reason: args.reason ?? null, p_op_key: crypto.randomUUID() },
    { session },
  );
}
