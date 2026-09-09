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

export function ReportsPage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientReports");
  const ti = useTranslations("ReportsSnapshotsSeeding");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <StatutoryReportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <SandboxExportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <FreeformReadsPanel clientId={clientId} session={sessionTokenAccessor} />
      {/* T9 (port-wave): snapshots is a report artifact, so it stays above —
          own i18n namespace (ReportsSnapshotsSeeding), own DoorDialog use. */}
      <SnapshotRegistryPanel clientId={clientId} session={sessionTokenAccessor} />
      {/* #614 D6 (spec §7): seeding, wiki curation and render jobs are Clara's
          own maintenance, not report navigation — grouped at the end, under
          one heading, rather than mixed into the reports list above. Every
          panel stays fully functional; `id` is the anchor
          seeding-proposal-affordance.tsx's needs-you deep link targets. */}
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
