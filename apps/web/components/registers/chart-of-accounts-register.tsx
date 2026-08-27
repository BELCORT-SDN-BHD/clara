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
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t("code")}</th>
              <th className="py-2 pr-4 font-medium">{t("name")}</th>
              <th className="py-2 pr-4 font-medium">{t("type")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.account_code} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 font-mono text-card-foreground">{a.account_code}</td>
                <td className="py-2 pr-4 text-card-foreground">
                  {a.name}
                  {!a.is_active ? ` (${t("inactive")})` : ""}
                </td>
                <td className="py-2 pr-4 text-card-foreground">{typeLabels[a.account_type] ?? a.account_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataState>
  );
}
