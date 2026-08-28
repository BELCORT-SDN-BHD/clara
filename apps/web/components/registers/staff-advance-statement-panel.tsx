"use client";

// The per-account-code statement (staff_advance_statement) — selection-driven,
// so it keeps its own small read + explicit reload() on account-code change
// (components/registers/aging-register.tsx's AR/AP-toggle precedent), rather
// than living inside the workbench's combined hydrated part.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getStaffAdvanceStatement } from "@/lib/registers/staff-advances-doors";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { NativeSelect } from "@/components/common/native-select";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

export function StaffAdvanceStatementPanel({ clientId, accountCodes }: { clientId: string; accountCodes: string[] }) {
  const t = useTranslations("StaffAdvances.statement");
  const tc = useTranslations("Common");
  const [accountCode, setAccountCode] = useState(accountCodes[0] ?? "");
  const { data, loading, error, reload } = useAsyncRead(() =>
    accountCode
      ? getStaffAdvanceStatement(clientId, accountCode, null, null, { session: sessionTokenAccessor })
      : Promise.resolve(null),
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
  }, [accountCode, reload]);

  if (accountCodes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>;
  }

  const rows = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t("accountLabel")} value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
          {accountCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("kind")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead className="text-right">{t("running")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.date}</TableCell>
                <TableCell className="text-muted-foreground">{r.application_kind ? `${r.kind} (${r.application_kind})` : r.kind}</TableCell>
                <TableCell className="text-right">{fmtCents(r.amount_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-right">{fmtCents(r.running_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {data ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>{t("openingLabel")}</TableCell>
                <TableCell colSpan={2} className="text-right">{fmtCents(data.opening_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2}>{t("closingLabel")}</TableCell>
                <TableCell colSpan={2} className="text-right font-medium">{fmtCents(data.closing_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </DataTableCard>
      </DataState>
    </div>
  );
}
