"use client";

// Fixed asset register (clara.list_fixed_assets) — cost/accumulated/NBV are all
// DB-projected as-of today; this component renders them verbatim. N10 (independent
// review, 2026-08-27): status/method are closed CHECK-constrained enums, translated
// via a checked lookup with an HONEST raw-value fallback (never a key path, never a
// silent cast) for any value outside the known set.
//
// T3 (port wave): extends the read-only table with the write surface — per-row
// Complete-particulars / Revise / Dispose door dialogs — plus the account-profiles
// panel, the register<->GL tie-out state banner, and the depreciation authority +
// runs panel below. ONE useAsyncRead drives the table (the registers domain's own
// hydrate-never-trust hook — matches this file's PRE-EXISTING read convention, so
// DataState keeps its no_session/forbidden/not_found classification); every row
// action reloads the WHOLE register, never assumes its own write's response. A
// later write's refusal renders as a banner ABOVE the still-good table (the
// needs-you-inbox.tsx precedent), never replacing data that already loaded once.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFixedAssets } from "@/lib/registers/fixed-assets";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { CompleteParticularsDialog, ReviseParticularsDialog, DisposeDialog } from "./fa-row-actions";
import { FaAccountProfilesPanel } from "./fa-account-profiles-panel";
import { FaRegisterTieBanner } from "./fa-register-tie-banner";
import { DepreciationAuthorityPanel } from "./depreciation-authority-panel";

export function FixedAssetsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.fixedAssets");
  const tc = useTranslations("Common");
  const { data, loading, error, busy, act } = useAsyncRead(() => loadFixedAssets(sessionTokenAccessor, clientId));
  const accountsRead = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  const hasData = data !== null;
  const rows = data?.assets ?? [];
  const accounts = accountsRead.data ?? [];

  const statusLabels: Record<string, string> = {
    pending: t("statuses.pending"),
    active: t("statuses.active"),
    superseded: t("statuses.superseded"),
    disposed: t("statuses.disposed"),
    unwound: t("statuses.unwound"),
  };
  const methodLabels: Record<string, string> = {
    straight_line: t("methods.straight_line"),
    reducing_balance: t("methods.reducing_balance"),
    none: t("methods.none"),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {hasData && error ? <ErrorMessage error={error} /> : null}
        <DataState loading={loading} error={hasData ? null : error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{t("asset")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("acquired")}</TableHead>
                <TableHead>{t("cost")}</TableHead>
                <TableHead>{t("accumulated")}</TableHead>
                <TableHead>{t("nbv")}</TableHead>
                <TableHead>{t("method")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.description ?? a.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-muted-foreground">{statusLabels[a.status] ?? a.status}</TableCell>
                  <TableCell className="text-muted-foreground">{a.acquired_date ?? "—"}</TableCell>
                  <TableCell>{fmtCents(a.cost_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell>{fmtCents(a.accumulated_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell className="font-medium">{fmtCents(a.nbv_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell className="text-muted-foreground">{a.method ? (methodLabels[a.method] ?? a.method) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!a.particulars_complete && (a.status === "pending" || a.status === "active") ? (
                        <CompleteParticularsDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={act} />
                      ) : null}
                      {a.particulars_complete && a.status === "active" ? (
                        <ReviseParticularsDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={act} />
                      ) : null}
                      {a.status === "active" ? (
                        <DisposeDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={act} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
        {data && data.incomplete_count > 0 ? (
          <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p>
        ) : null}
      </div>

      <FaAccountProfilesPanel clientId={clientId} assets={rows} accounts={accounts} />
      <FaRegisterTieBanner clientId={clientId} />
      <DepreciationAuthorityPanel clientId={clientId} />
    </div>
  );
}
