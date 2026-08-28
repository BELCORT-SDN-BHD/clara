// Fixed-asset account profile enrolment — the (cost, accumulated, expense)
// account triple the register's write surface bakes onto every asset it mints.
// T3 (port wave), verb census at the live 0140 catalog.
//
// clara.upsert_fa_account_profile / clara.retire_fa_account_profile —
// bookkeeper+. VERSION-FORWARD, NEVER MUTATE (the live prosrc's own law): an
// unchanged re-upsert is idempotent; a real change retires the live row and
// inserts a fresh one, so an enrolment interval stays a historical fact the
// register's tie-out reads at approved_at. Every account-typing/role-overlap/
// reserved-account refusal is the DOOR's own CLR37 — this module states no
// client-side account-picking rule of its own; the caller offers a COA
// dropdown and lets the door refuse.
//
// F2/F3 (independent review, fix-required, 2026-08-28): `clara.
// fa_account_profiles` is a real SELECT grant to `clara_authenticated`
// (verified at the live catalog — forced RLS, `p_fa_account_profiles_human`
// scopes by `firm_id = jwt_firm()`), the Q3 read-the-tables mechanism
// lib/registers/accounts.ts already uses for `coa_accounts`. The panel used
// to DERIVE its rows from the register's own asset-row projections instead —
// a second, un-synced implementation of the same enumeration the DB already
// answers directly, which (a) made an enrol with no register row yet give
// zero feedback (the `fa_account_profiles WHERE active` half was invisible)
// and (b) produced phantom Retire triggers for disposed/superseded/
// future-dated rows that could only ever CLR37. Read the relation directly
// instead — `loadFaAccountProfiles` below — so `useHydratedPart`'s `act()`
// genuinely re-reads the real enrolment state after every upsert/retire.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FaAccountProfileRow = {
  id: string;
  asset_account_code: string;
  accum_depr_account_code: string | null;
  depr_expense_account_code: string | null;
  active: boolean;
  enrolled_at: string;
  retired_at: string | null;
};

const FA_ACCOUNT_PROFILE_COLS =
  "id,asset_account_code,accum_depr_account_code,depr_expense_account_code,active,enrolled_at,retired_at";

/** Every ACTIVE fixed-asset account profile for this client — the live
 *  enrolment state a new asset's cost account defaults from. No explicit
 *  firm filter (RLS + `p_fa_account_profiles_human` already scope it, the
 *  same idiom lib/registers/accounts.ts's loadChartOfAccounts uses). */
export function loadFaAccountProfiles(session: SessionTokenAccessor, clientId: string): Promise<FaAccountProfileRow[]> {
  return getRows<FaAccountProfileRow>("fa_account_profiles", {
    select: FA_ACCOUNT_PROFILE_COLS,
    filters: { client_id: `eq.${clientId}`, active: "eq.true" },
    order: "asset_account_code.asc",
    session,
  });
}

/** clara.upsert_fa_account_profile(p_client, p_asset_account, p_accum_account,
 *  p_depr_expense_account, p_op_key) — bookkeeper+. `accumAccount`/
 *  `expenseAccount` must be BOTH null (a non-depreciable profile, e.g. land)
 *  or BOTH set — the door refuses CLR37 `axis:"pair"` on a half-stated pair. */
export function upsertFaAccountProfile(
  session: SessionTokenAccessor,
  args: { clientId: string; assetAccount: string; accumAccount: string | null; expenseAccount: string | null },
): Promise<unknown> {
  return callDoor(
    "upsert_fa_account_profile",
    {
      p_client: args.clientId,
      p_asset_account: args.assetAccount,
      p_accum_account: args.accumAccount,
      p_depr_expense_account: args.expenseAccount,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.retire_fa_account_profile(p_client, p_asset_account, p_op_key) —
 *  bookkeeper+. Refuses CLR37 `axis:"not_enrolled"` if no active profile
 *  names this cost account for this client. Never frees a code a live
 *  register row still carries (the row's baked codes outlive the profile). */
export function retireFaAccountProfile(
  session: SessionTokenAccessor,
  args: { clientId: string; assetAccount: string },
): Promise<unknown> {
  return callDoor(
    "retire_fa_account_profile",
    { p_client: args.clientId, p_asset_account: args.assetAccount, p_op_key: crypto.randomUUID() },
    { session },
  );
}
