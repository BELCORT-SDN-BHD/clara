"use client";

// The Reports tab (owner ruling Q3) — two structurally distinct tiers
// (lib/reports/types.ts's header cites the migrations, never the pending PRD
// wording) plus the freeform read history. All three are direct DB reads;
// every figure and every custody fact renders exactly what the DB said.

import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { SandboxExportsPanel } from "./SandboxExportsPanel";
import { FreeformReadsPanel } from "./FreeformReadsPanel";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { RenderJobQueuePanel } from "./RenderJobQueuePanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";
import { WikiCurationPanel } from "./WikiCurationPanel";
import type { ReportUrlSelection } from "@/lib/reports/url-state";

export function ReportsPage({
  clientId,
  addressedReport = { kind: "none" },
}: {
  clientId: string;
  /** #719 — `?report=<artifact id>`, parsed on the server route above. Only the sealed statutory
   *  archive can be addressed by id, so only that panel receives it: the sandbox history, the
   *  freeform read log and the internal-processing group are LISTS of their own kinds of record,
   *  and handing them an artifact id would make four panels answer a question about one. */
  addressedReport?: ReportUrlSelection;
}) {
  const t = useTranslations("ClientReports");
  const ti = useTranslations("ReportsSnapshotsSeeding");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <StatutoryReportsPanel clientId={clientId} session={sessionTokenAccessor} addressed={addressedReport} />
      <SandboxExportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <FreeformReadsPanel clientId={clientId} session={sessionTokenAccessor} />
      {/* T9 (port-wave): snapshots is a report artifact, so it stays above —
          own i18n namespace (ReportsSnapshotsSeeding), own DoorDialog use. */}
      <SnapshotRegistryPanel clientId={clientId} session={sessionTokenAccessor} />
      {/* #614 D6 (spec §7): seeding, wiki curation and render jobs are Clara's
          own maintenance, not report navigation — grouped at the end, under
          one heading, rather than mixed into the reports list above. `id` is a
          stable in-page anchor; the needs-you deep link that used to target it
          is gone with its row kind (ticket 1012, 0288_seeding_lane_retired.sql),
          and SeedingBatchesPanel below is READ-ONLY for the same reason — the
          prior-GL seeding lane accepts no new work, and its history stays here
          to be read and, while a batch is open, closed. */}
      <section id="internal-processing" aria-labelledby="reports-internal-processing" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeader level={2}>
            <span id="reports-internal-processing">{ti("internalProcessing.heading")}</span>
          </SectionHeader>
          <p className="max-w-prose text-sm text-muted-foreground">{ti("internalProcessing.body")}</p>
        </div>
        <RenderJobQueuePanel clientId={clientId} session={sessionTokenAccessor} />
        <SeedingBatchesPanel clientId={clientId} session={sessionTokenAccessor} />
        <WikiCurationPanel clientId={clientId} session={sessionTokenAccessor} />
      </section>
    </PageShell>
  );
}
