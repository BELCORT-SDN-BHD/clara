// The staff-advances workbench's combined hydration read (hydrate-never-trust:
// this is the ONE loader components/registers/staff-advances-register.tsx's
// useHydratedPart mounts with, and re-derives after every door call). Five
// reads in parallel: the raw ledger (lib/registers/staff-advances.ts, unchanged
// — "no `outstanding` figure computed here"), the enrolment table, the client's
// chart of accounts (the lines editor + enrol picker's own candidate source),
// and the two as-of-today read RPCs (summary, tie). The per-account-code
// STATEMENT is deliberately NOT part of this bundle — it is selection-driven
// (which account_code is the human looking at right now), so the panel that
// renders it keeps its own small `useAsyncRead` + explicit `reload()` on
// selection change (the aging-register.tsx precedent, this file's sibling).

import { loadStaffAdvances, type StaffAdvanceRow } from "./staff-advances";
import { loadChartOfAccounts, type AccountRow } from "./accounts";
import { loadStaffAdvanceAccounts, getStaffAdvanceSummary, getStaffAdvanceTie } from "./staff-advances-doors";
import type { StaffAdvanceAccountRow, StaffAdvanceSummary, StaffAdvanceTie } from "./staff-advances-doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type StaffAdvancesWorkbenchData = {
  advances: StaffAdvanceRow[];
  accounts: StaffAdvanceAccountRow[];
  coaAccounts: AccountRow[];
  summary: StaffAdvanceSummary;
  tie: StaffAdvanceTie;
};

export async function loadStaffAdvancesWorkbench(
  session: SessionTokenAccessor,
  clientId: string,
  asOf: string,
): Promise<StaffAdvancesWorkbenchData> {
  const [advances, accounts, coaAccounts, summary, tie] = await Promise.all([
    loadStaffAdvances(session, clientId),
    loadStaffAdvanceAccounts(session, clientId),
    loadChartOfAccounts(session, clientId),
    getStaffAdvanceSummary(clientId, asOf, { session }),
    getStaffAdvanceTie(clientId, asOf, { session }),
  ]);
  return { advances, accounts, coaAccounts, summary, tie };
}
