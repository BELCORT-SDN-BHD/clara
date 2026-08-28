"use client";

// The Reports tab (owner ruling Q3) — two structurally distinct tiers
// (lib/reports/types.ts's header cites the migrations, never the pending PRD
// wording) plus the freeform read history. All three are direct DB reads;
// every figure and every custody fact renders exactly what the DB said.

import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { SandboxExportsPanel } from "./SandboxExportsPanel";
import { FreeformReadsPanel } from "./FreeformReadsPanel";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { RenderJobQueuePanel } from "./RenderJobQueuePanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";
import { WikiCurationPanel } from "./WikiCurationPanel";

export function ReportsPage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientReports");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <StatutoryReportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <SandboxExportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <FreeformReadsPanel clientId={clientId} session={sessionTokenAccessor} />
      {/* T9 (port-wave): snapshots, render jobs, seeding, wiki curation —
          own i18n namespace (ReportsSnapshotsSeeding), own DoorDialog use. */}
      <SnapshotRegistryPanel clientId={clientId} session={sessionTokenAccessor} />
      <RenderJobQueuePanel clientId={clientId} session={sessionTokenAccessor} />
      <SeedingBatchesPanel clientId={clientId} session={sessionTokenAccessor} />
      <WikiCurationPanel clientId={clientId} session={sessionTokenAccessor} />
    </PageShell>
  );
}
