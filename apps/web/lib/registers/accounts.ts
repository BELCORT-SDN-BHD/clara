// Chart of accounts — a plain client-scoped SELECT, not an RPC (the outlier among the
// registers this directory covers). clara.coa_accounts (packages/db/migrations/
// 0003_books_core.sql:47-59): composite PK (client_id, account_code). RLS scopes reads
// to firm_id = jwt_firm() via the shared books-table policy (0003:510-516); the
// client_id filter below narrows further to the ONE client this workspace is for —
// apps/dashboard/app/accounts/api.ts:17-22 is the measured precedent for both the
// relation name and its column list.
//
// T4 (port wave) rung-0 census, 2026-08-28, live 0140 catalog (apps/web/AGENTS.md's
// "chase the LIVE body" rule): `clara.upsert_account` is the ONLY write door onto this
// table — census-confirmed by a direct grant read: clara_authenticated holds SELECT on
// clara.coa_accounts but no INSERT/UPDATE, even though the table's own RLS policy would
// structurally allow it; the write path is exclusively this SECURITY DEFINER door. It is
// genuinely an UPSERT (`on conflict (client_id, account_code) do update`) with no
// deactivate path — the live body always sets `is_active = true` on either branch, so
// there is no `is_active` parameter to expose and no honest way to build a "deactivate
// account" control against this door (not a gap this dialog invents around).

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type AccountRow = {
  account_code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense" | string;
  account_class: string | null;
  special_acc_type: "rounding" | null;
  is_active: boolean;
};

const ACCOUNT_COLS = "account_code,name,account_type,account_class,special_acc_type,is_active";

export function loadChartOfAccounts(session: SessionTokenAccessor, clientId: string): Promise<AccountRow[]> {
  return getRows<AccountRow>("coa_accounts", {
    select: ACCOUNT_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "account_code.asc",
    session,
  });
}

export type UpsertAccountInput = {
  clientId: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  accountClass: "payable" | "receivable" | null;
  /** The closed set the live CHECK constraint admits. Left `null` for the
   *  ordinary case — these five slots are provisioned by onboarding/opening
   *  and re-typing one underneath its own enrolment is exactly what the door
   *  refuses (CLR37 `fa_enrolled_account_deactivation` when a live
   *  fixed-asset profile is bound to this code). */
  specialAccType: "rounding" | "sst_output" | "sst_purchase_cost" | "opening_balance_equity" | "retained_earnings" | null;
};

export type UpsertAccountResult = { client_id: string; account_code: string };

/** clara.upsert_account(p_client,p_code,p_name,p_type,p_special_acc_type,
 *  p_op_key,p_account_class) — bookkeeper+. Refuses CLR10 "cannot change
 *  type/class of an account that has lines" once a journal line has posted
 *  against the code, and CLR37 `fa_enrolled_account_deactivation` while a
 *  live fixed-asset profile is bound to it — both rendered verbatim; this
 *  module performs no client-side pre-check of either. */
export function upsertAccount(session: SessionTokenAccessor, input: UpsertAccountInput): Promise<UpsertAccountResult> {
  return callDoor<UpsertAccountResult>(
    "upsert_account",
    {
      p_client: input.clientId,
      p_code: input.code,
      p_name: input.name,
      p_type: input.type,
      p_special_acc_type: input.specialAccType,
      p_op_key: crypto.randomUUID(),
      p_account_class: input.accountClass,
    },
    { session },
  );
}
