// Staff advances register — a plain RLS table read (this build's coordinator ruling),
// not the staff_advance_summary RPC. clara.staff_advances (packages/db/migrations/
// 0043_wave_d_b1_staff_advances.sql:415-448, granted :516) — firm-scoped by RLS
// (firm_id = jwt_firm()); the client_id filter below narrows to this workspace. This
// is the raw ledger: amount_cents per advance, and whether it has been voided
// (voided_by_entry_id is not null) — an "outstanding" balance is a DERIVED figure
// (net of allocations against the GL) that only staff_advance_tie/staff_advance_summary
// compute; this module never sums or nets one client-side (hard constraint 2).

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

export type StaffAdvanceRow = {
  id: string;
  client_id: string;
  enrolment_id: string;
  account_code: string;
  issue_date: string;
  amount_cents: number;
  purpose: string | null;
  reference: string | null;
  voided_by_entry_id: string | null;
  void_effective_date: string | null;
};

const STAFF_ADVANCE_COLS =
  "id,client_id,enrolment_id,account_code,issue_date,amount_cents,purpose,reference," +
  "voided_by_entry_id,void_effective_date";

export function loadStaffAdvances(session: SessionTokenAccessor, clientId: string): Promise<StaffAdvanceRow[]> {
  return getRows<StaffAdvanceRow>("staff_advances", {
    select: STAFF_ADVANCE_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "issue_date.desc",
    session,
  });
}
