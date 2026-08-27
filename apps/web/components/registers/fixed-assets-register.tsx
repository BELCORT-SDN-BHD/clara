"use client";

// Fixed asset register (clara.list_fixed_assets) — cost/accumulated/NBV are all
// DB-projected as-of today; this component renders them verbatim. N10 (independent
// review, 2026-08-27): status/method are closed CHECK-constrained enums, translated
// via a checked lookup with an HONEST raw-value fallback (never a key path, never a
// silent cast) for any value outside the known set.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFixedAssets } from "@/lib/registers/fixed-assets";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

export function FixedAssetsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.fixedAssets");
  const tc = useTranslations("Common");
  const { data, loading, error } = useAsyncRead(() => loadFixedAssets(sessionTokenAccessor, clientId));
  const rows = data?.assets ?? [];

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
    <div className="flex flex-col gap-2">
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
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
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </DataState>
      {data && data.incomplete_count > 0 ? (
        <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p>
      ) : null}
    </div>
  );
}
