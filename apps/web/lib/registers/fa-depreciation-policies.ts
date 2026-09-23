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

/** The intent tuple a POLICY-SET decision is identified by — exactly the tuple
 *  `clara.set_fa_depreciation_policy` hashes into its own operation key (measured off the live
 *  prosrc: `client`, `asset`, `method`, `useful_life_months`, `rate_bps`, `residual_cents`).
 *  `p_reason` is NOT in that fingerprint and is not in this tuple either, the same way `p_memo`
 *  sits outside `clara.dispose_fixed_asset`'s: editing the reason is not a different decision.
 *  Editing anything the door DOES hash is, and earns a new key; pressing Confirm twice on the
 *  same one does not.
 *
 *  `reason` is ACCEPTED and ignored rather than excluded from the type, so a caller can hand this
 *  the very object it is about to send the door — and so the exclusion is a fact a test can
 *  demonstrate at runtime instead of one only the compiler knows. */
export function setPolicyIntent(args: {
  clientId: string;
  assetAccount: string;
  method: FaDepreciationMethod;
  usefulLifeMonths: number | null;
  rateBps: number | null;
  residualCents: number | null;
  reason?: string | null;
}): string {
  return [
    args.clientId, args.assetAccount, args.method,
    args.usefulLifeMonths ?? "", args.rateBps ?? "", args.residualCents ?? "",
  ].join("|");
}

/** The intent tuple a POLICY-RETIRE decision is identified by — `clara.retire_fa_depreciation_policy`
 *  hashes exactly (`client`, `asset`) and nothing else. */
export function retirePolicyIntent(args: { clientId: string; assetAccount: string; reason?: string | null }): string {
  return [args.clientId, args.assetAccount].join("|");
}

/** clara.set_fa_depreciation_policy(p_client, p_asset_account, p_method, p_useful_life_months,
 *  p_rate_bps, p_residual_cents, p_reason, p_op_key) — bookkeeper+. `method: "none"` carries no
 *  life or rate; `straight_line` needs a life and no rate; `reducing_balance` needs both a life
 *  AND a 1..10000 bps rate — the door refuses CLR37 `fa_policy_invalid` axis `drivers` on a
 *  mismatch, and axis `not_enrolled` if the account carries no active
 *  clara.fa_account_profiles row.
 *
 *  #932 FIX ROUND (adversarial review ADV-L04-5) — ONE DECISION, ONE KEY, the house shape #651
 *  wired onto the run/authority doors and #978 onto complete/dispose. This wrapper used to mint
 *  `crypto.randomUUID()` inside itself, so a retry after a lost response was a NEW operation to
 *  the door's own `_reserve_op` dedupe rather than a replay of the receipt it had already earned
 *  — and ONE human decision sent twice left TWO policy versions, with any register row born
 *  between the calls stamped v1 while the account read v2. The caller now holds the key for the
 *  life of the open decision (`setPolicyIntent` above is the tuple it is keyed on;
 *  `useDepreciationDecisionKey`, lib/registers/depreciation.ts, is the holder). */
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
    opKey: string;
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
      p_op_key: args.opKey,
    },
    { session },
  );
}

/** clara.retire_fa_depreciation_policy(p_client, p_asset_account, p_reason, p_op_key) —
 *  bookkeeper+. Refuses CLR37 `fa_policy_invalid` axis `not_set` if no active policy names this
 *  account for this client. Never touches a register row an earlier version already birthed.
 *  Takes the caller's own key for the same reason `setFaDepreciationPolicy` above does
 *  (`retirePolicyIntent` is its tuple). */
export function retireFaDepreciationPolicy(
  session: SessionTokenAccessor,
  args: { clientId: string; assetAccount: string; reason?: string | null; opKey: string },
): Promise<unknown> {
  return callDoor(
    "retire_fa_depreciation_policy",
    { p_client: args.clientId, p_asset_account: args.assetAccount, p_reason: args.reason ?? null, p_op_key: args.opKey },
    { session },
  );
}
