"use client";

// Staff advances register — a plain RLS read on clara.staff_advances (this build's
// coordinator ruling). Raw ledger rows: no "outstanding" figure is computed here
// (that is staff_advance_tie/staff_advance_summary's job — hard constraint 2).

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadStaffAdvances } from "@/lib/registers/staff-advances";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "@/components/firm/data-state";

export function StaffAdvancesRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.staffAdvances");
  const tc = useTranslations("Common");
  const { data, loading, error } = useAsyncRead(() => loadStaffAdvances(sessionTokenAccessor, clientId));
  const rows = data ?? [];

  return (
    <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t("issued")}</th>
              <th className="py-2 pr-4 font-medium">{t("amount")}</th>
              <th className="py-2 pr-4 font-medium">{t("purpose")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 text-card-foreground">{a.issue_date}</td>
                <td className="py-2 pr-4 text-card-foreground">
                  {fmtCents(a.amount_cents, tc("centsUnsafe"))}
                  {a.voided_by_entry_id ? ` (${t("voided")})` : ""}
                </td>
                <td className="py-2 pr-4 text-card-foreground">{a.purpose ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataState>
  );
}
