"use client";

// Staff advances register — a plain RLS read on clara.staff_advances (this build's
// coordinator ruling). Raw ledger rows: no "outstanding" figure is computed here
// (that is staff_advance_tie/staff_advance_summary's job — hard constraint 2).

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadStaffAdvances } from "@/lib/registers/staff-advances";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

export function StaffAdvancesRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.staffAdvances");
  const tc = useTranslations("Common");
  const { data, loading, error } = useAsyncRead(() => loadStaffAdvances(sessionTokenAccessor, clientId));
  const rows = data ?? [];

  return (
    <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
      <DataTableCard>
        <TableHeader>
          <TableRow>
            <TableHead>{t("issued")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("purpose")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.issue_date}</TableCell>
              <TableCell>
                {fmtCents(a.amount_cents, tc("centsUnsafe"))}
                {a.voided_by_entry_id ? ` (${t("voided")})` : ""}
              </TableCell>
              <TableCell className="text-muted-foreground">{a.purpose ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>
    </DataState>
  );
}
