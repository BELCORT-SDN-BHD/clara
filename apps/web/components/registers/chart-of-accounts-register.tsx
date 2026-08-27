"use client";

// Chart of accounts (clara.coa_accounts) — FLAT, by account_type. No hierarchy
// column exists on this table (this build's coordinator ruling: "no invented tree").
// N10 (independent review, 2026-08-27): account_type is a closed CHECK-constrained
// enum, translated via a checked lookup with an HONEST raw-value fallback (never a
// key path, never a silent cast) for any value outside the known set.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

export function ChartOfAccountsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.accounts");
  const { data, loading, error } = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  const rows = data ?? [];

  const typeLabels: Record<string, string> = {
    asset: t("types.asset"),
    liability: t("types.liability"),
    equity: t("types.equity"),
    income: t("types.income"),
    expense: t("types.expense"),
  };

  return (
    <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
      <DataTableCard>
        <TableHeader>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("type")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.account_code}>
              <TableCell className="font-mono">{a.account_code}</TableCell>
              <TableCell>
                {a.name}
                {!a.is_active ? ` (${t("inactive")})` : ""}
              </TableCell>
              <TableCell className="text-muted-foreground">{typeLabels[a.account_type] ?? a.account_type}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>
    </DataState>
  );
}
