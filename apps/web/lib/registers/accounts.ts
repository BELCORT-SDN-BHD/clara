// Chart of accounts — a plain client-scoped SELECT, not an RPC (the outlier among the
// registers this directory covers). clara.coa_accounts (packages/db/migrations/
// 0003_books_core.sql:47-59): composite PK (client_id, account_code). RLS scopes reads
// to firm_id = jwt_firm() via the shared books-table policy (0003:510-516); the
// client_id filter below narrows further to the ONE client this workspace is for —
// apps/dashboard/app/accounts/api.ts:17-22 is the measured precedent for both the
// relation name and its column list.

import { getRows } from "../read";
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
