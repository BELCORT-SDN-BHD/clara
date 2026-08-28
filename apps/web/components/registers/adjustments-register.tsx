"use client";

// Adjustments register — plain RLS reads on clara.adjustment_templates and
// clara.adjustment_runs (this build's coordinator ruling), two independent lists.
// N10 (independent review, 2026-08-27): status/cadence/mode are closed CHECK-
// constrained enums, translated via a checked lookup with an HONEST raw-value
// fallback (never a key path, never a silent cast) for any value outside the
// known set.
//
// T4 (port wave): the write half. The passive templates/runs lists below are
// UNCHANGED table reads (Q3's own ruling — this train must not replace a working
// table read with an RPC read). Three NEW sections extend them: the template
// governance ceremony (propose/sign/retire, acting on the SAME template rows this
// file already reads), the run-due banner and run-history panel (the write
// ceremony's own governance bundle — lib/registers/adjustments-workbench.ts), and
// the pair-reversal ledger. hydrate-never-trust: every write re-reads the whole
// governance bundle via useHydratedPart().act() — never an optimistic paint.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  loadAdjustmentTemplates,
  loadAdjustmentRuns,
  proposeAdjustmentTemplate,
  signAdjustmentTemplate,
  retireAdjustmentTemplate,
  runAdjustmentManual,
  reverseAdjustmentPair,
  approvePairReversal,
  cancelPairReversal,
} from "@/lib/registers/adjustments";
import { loadAdjustmentGovernance } from "@/lib/registers/adjustments-workbench";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner, LoadingState, EmptyState } from "@/components/common/state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";
import { ProposeTemplateDialog, SignTemplateDialog, RetireTemplateDialog } from "./adjustment-template-ceremony";
import { AdjustmentRunDueBanner } from "./adjustment-run-due-banner";
import { AdjustmentRunHistoryPanel } from "./adjustment-run-history-panel";
import { AdjustmentPairReversalPanel } from "./adjustment-pair-reversal-panel";

export function AdjustmentsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.adjustments");
  const ta = useTranslations("AdjustmentsAccounts");
  const tc = useTranslations("Common");
  // The passive lists — UNCHANGED table reads (this file's own header).
  const templates = useAsyncRead(() => loadAdjustmentTemplates(sessionTokenAccessor, clientId));
  const runs = useAsyncRead(() => loadAdjustmentRuns(sessionTokenAccessor, clientId));
  const accounts = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  // The governance bundle — feeds every write below (hydrate-never-trust).
  const gov = useHydratedPart(sessionTokenAccessor, (s) => loadAdjustmentGovernance(s, clientId));

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
      {gov.err ? (
        <StateBanner tone="error" code={gov.clr ? `${gov.clr.code}${gov.clr.reason ? ` · ${gov.clr.reason}` : ""}` : undefined}>
          {gov.err}
        </StateBanner>
      ) : null}
      {gov.data ? <AdjustmentRunDueBanner due={gov.data.due} /> : null}
      <section className="flex flex-col gap-2">
        <SectionHeader
          level={2}
          action={
            <ProposeTemplateDialog
              accounts={accounts.data ?? []}
              busy={gov.busy}
              onSubmit={(input) =>
                gov.act(() =>
                  proposeAdjustmentTemplate(sessionTokenAccessor, { ...input, clientId }).then(() => {
                    templates.reload();
                  }),
                )
              }
            />
          }
        >
          {t("templatesHeading")}
        </SectionHeader>
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
              <li key={tpl.id} className="enter-content flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
                <span className="font-medium text-card-foreground">{tpl.name}</span>
                <span className="text-muted-foreground">
                  {t("status")}: {statusLabels[tpl.status] ?? tpl.status}
                </span>
                <span className="text-muted-foreground">
                  {t("cadence")}: {cadenceLabels[tpl.cadence] ?? tpl.cadence}
                </span>
                <div className="ml-auto flex gap-2">
                  {tpl.status === "proposed" ? (
                    <SignTemplateDialog
                      templateName={tpl.name}
                      busy={gov.busy}
                      onSubmit={() =>
                        gov.act(() =>
                          signAdjustmentTemplate(sessionTokenAccessor, clientId, tpl.id).then(() => {
                            templates.reload();
                          }),
                        )
                      }
                    />
                  ) : null}
                  {tpl.status !== "retired" ? (
                    <RetireTemplateDialog
                      templateName={tpl.name}
                      busy={gov.busy}
                      onSubmit={(reason) =>
                        gov.act(() =>
                          retireAdjustmentTemplate(sessionTokenAccessor, clientId, tpl.id, reason).then(() => {
                            templates.reload();
                          }),
                        )
                      }
                    />
                  ) : null}
                </div>
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
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{ta("runHistory.heading")}</SectionHeader>
        <p className="text-xs text-muted-foreground">{ta("runHistory.subheading")}</p>
        {/* F4 (independent review, fix-required): loading/data/unavailable are
            three distinct states, told apart honestly — a bare `{gov.data ?
            panel : null}` rendered a SILENT empty heading both on first paint
            (every visit) and after any failed read, indistinguishable from
            "nothing here". */}
        {gov.loading ? (
          <LoadingState>{tc("loading")}</LoadingState>
        ) : gov.data ? (
          <AdjustmentRunHistoryPanel
            templates={templates.data ?? []}
            runs={gov.data.runs}
            busy={gov.busy}
            onRunNow={(templateId, periodStart, periodEnd) =>
              gov.act(() =>
                runAdjustmentManual(sessionTokenAccessor, clientId, templateId, periodStart, periodEnd).then(() => {
                  runs.reload();
                }),
              )
            }
            onReversePair={(occurrenceEntryId, reason) => gov.act(() => reverseAdjustmentPair(sessionTokenAccessor, clientId, occurrenceEntryId, reason).then(() => undefined))}
          />
        ) : (
          <EmptyState>{ta("runHistory.unavailable")}</EmptyState>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{ta("pairLedger.heading")}</SectionHeader>
        {gov.loading ? (
          <LoadingState>{tc("loading")}</LoadingState>
        ) : gov.data ? (
          <AdjustmentPairReversalPanel
            pairReversals={gov.data.pairReversals}
            busy={gov.busy}
            onApprove={(pairId, attestation) => gov.act(() => approvePairReversal(sessionTokenAccessor, clientId, pairId, attestation || null).then(() => undefined))}
            onCancel={(pairId, reason) => gov.act(() => cancelPairReversal(sessionTokenAccessor, clientId, pairId, reason).then(() => undefined))}
          />
        ) : (
          <EmptyState>{ta("pairLedger.unavailable")}</EmptyState>
        )}
      </section>
    </div>
  );
}
