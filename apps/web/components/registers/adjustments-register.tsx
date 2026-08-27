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
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <SectionHeader level={2}>{t("templatesHeading")}</SectionHeader>
        <DataState
          loading={templates.loading}
          error={templates.error}
          isEmpty={(templates.data ?? []).length === 0}
          emptyMessage={t("emptyTemplates")}
        >
          <ul className="flex flex-col gap-2 text-sm">
            {(templates.data ?? []).map((tpl) => (
              // The row-card idiom, matching every other list row in the
              // product: rounded-lg + border + bg-card + p-3, not the
              // rounded-md/p-2/no-surface variant this lane grew.
              <li key={tpl.id} className="enter-content flex flex-wrap gap-3 rounded-lg border border-border bg-card p-3">
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
        <SectionHeader level={2}>{t("runsHeading")}</SectionHeader>
        <DataState
          loading={runs.loading}
          error={runs.error}
          isEmpty={(runs.data ?? []).length === 0}
          emptyMessage={t("emptyRuns")}
        >
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{t("period")}</TableHead>
                <TableHead>{t("mode")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.period_start} – {r.period_end}</TableCell>
                  <TableCell className="text-muted-foreground">{modeLabels[r.mode] ?? r.mode}</TableCell>
                  <TableCell>{fmtCents(r.amount_cents, tc("centsUnsafe"))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
      </section>
    </div>
  );
}
