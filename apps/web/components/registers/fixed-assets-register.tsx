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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("asset")}</th>
                <th className="py-2 pr-4 font-medium">{t("status")}</th>
                <th className="py-2 pr-4 font-medium">{t("acquired")}</th>
                <th className="py-2 pr-4 font-medium">{t("cost")}</th>
                <th className="py-2 pr-4 font-medium">{t("accumulated")}</th>
                <th className="py-2 pr-4 font-medium">{t("nbv")}</th>
                <th className="py-2 pr-4 font-medium">{t("method")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-card-foreground">{a.description ?? a.id.slice(0, 8)}</td>
                  <td className="py-2 pr-4 text-card-foreground">{statusLabels[a.status] ?? a.status}</td>
                  <td className="py-2 pr-4 text-card-foreground">{a.acquired_date ?? "—"}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(a.cost_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(a.accumulated_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 font-medium text-card-foreground">{fmtCents(a.nbv_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 text-card-foreground">{a.method ? (methodLabels[a.method] ?? a.method) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      {data && data.incomplete_count > 0 ? (
        <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p>
      ) : null}
    </div>
  );
}
