"use client";

// Adjustments register — plain RLS reads on clara.adjustment_templates and
// clara.adjustment_runs (this build's coordinator ruling), two independent lists.
// N10 (independent review, 2026-08-27): status/cadence/mode are closed CHECK-
// constrained enums, translated via a checked lookup with an HONEST raw-value
// fallback (never a key path, never a silent cast) for any value outside the
// known set.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadAdjustmentTemplates, loadAdjustmentRuns } from "@/lib/registers/adjustments";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "@/components/firm/data-state";

export function AdjustmentsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.adjustments");
  const tc = useTranslations("Common");
  const templates = useAsyncRead(() => loadAdjustmentTemplates(sessionTokenAccessor, clientId));
  const runs = useAsyncRead(() => loadAdjustmentRuns(sessionTokenAccessor, clientId));

  const statusLabels: Record<string, string> = {
    proposed: t("statuses.proposed"),
    live: t("statuses.live"),
    retired: t("statuses.retired"),
  };
  const cadenceLabels: Record<string, string> = {
    monthly: t("cadences.monthly"),
    annual: t("cadences.annual"),
  };
  const modeLabels: Record<string, string> = {
    post: t("modes.post"),
    draft: t("modes.draft"),
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("templatesHeading")}</h3>
        <DataState
          loading={templates.loading}
          error={templates.error}
          isEmpty={(templates.data ?? []).length === 0}
          emptyMessage={t("emptyTemplates")}
        >
          <ul className="flex flex-col gap-1 text-sm">
            {(templates.data ?? []).map((tpl) => (
              <li key={tpl.id} className="flex flex-wrap gap-3 rounded-md border border-border p-2">
                <span className="font-medium text-card-foreground">{tpl.name}</span>
                <span className="text-muted-foreground">
                  {t("status")}: {statusLabels[tpl.status] ?? tpl.status}
                </span>
                <span className="text-muted-foreground">
                  {t("cadence")}: {cadenceLabels[tpl.cadence] ?? tpl.cadence}
                </span>
              </li>
            ))}
          </ul>
        </DataState>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("runsHeading")}</h3>
        <DataState
          loading={runs.loading}
          error={runs.error}
          isEmpty={(runs.data ?? []).length === 0}
          emptyMessage={t("emptyRuns")}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("period")}</th>
                  <th className="py-2 pr-4 font-medium">{t("mode")}</th>
                  <th className="py-2 pr-4 font-medium">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(runs.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-card-foreground">{r.period_start} – {r.period_end}</td>
                    <td className="py-2 pr-4 text-card-foreground">{modeLabels[r.mode] ?? r.mode}</td>
                    <td className="py-2 pr-4 text-card-foreground">{fmtCents(r.amount_cents, tc("centsUnsafe"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
    </div>
  );
}
