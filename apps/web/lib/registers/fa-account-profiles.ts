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

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

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
