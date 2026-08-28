"use client";

// Chart of accounts (clara.coa_accounts) — FLAT, by account_type. No hierarchy
// column exists on this table (this build's coordinator ruling: "no invented tree").
// N10 (independent review, 2026-08-27): account_type is a closed CHECK-constrained
// enum, translated via a checked lookup with an HONEST raw-value fallback (never a
// key path, never a silent cast) for any value outside the known set.
//
// T4 (port wave): the write half — clara.upsert_account (lib/registers/accounts.ts's
// header has the full census grounding). Reading rides useHydratedPart rather than
// useAsyncRead now, so a write's own act() re-derives this list — hydrate-never-trust.

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadChartOfAccounts, upsertAccount } from "@/lib/registers/accounts";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StateBanner } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";
import { UpsertAccountDialog } from "./UpsertAccountDialog";

export function ChartOfAccountsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.accounts");
  const { data, loading, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => loadChartOfAccounts(s, clientId));
  const rows = data ?? [];

  const typeLabels: Record<string, string> = {
    asset: t("types.asset"),
    liability: t("types.liability"),
    equity: t("types.equity"),
    income: t("types.income"),
    expense: t("types.expense"),
  };

  return (
    <div className="flex flex-col gap-2">
      {err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      ) : null}
      <SectionHeader
        level={2}
        action={
          <UpsertAccountDialog
            busy={busy}
            onSubmit={(input) => act(() => upsertAccount(sessionTokenAccessor, { ...input, clientId }).then(() => undefined))}
          />
        }
      >
        {t("heading")}
      </SectionHeader>
      <DataState loading={loading} error={null} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead />
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
                <TableCell>
                  <UpsertAccountDialog
                    existing={a}
                    busy={busy}
                    onSubmit={(input) => act(() => upsertAccount(sessionTokenAccessor, { ...input, clientId }).then(() => undefined))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </DataState>
    </div>
  );
}
