"use client";

// The Reports tab (owner ruling Q3) — two structurally distinct tiers
// (lib/reports/types.ts's header cites the migrations, never the pending PRD
// wording) plus the freeform read history. All three are direct DB reads;
// every figure and every custody fact renders exactly what the DB said.

import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { SandboxExportsPanel } from "./SandboxExportsPanel";
import { FreeformReadsPanel } from "./FreeformReadsPanel";

export function ReportsPage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientReports");

  return (
    <main className="flex flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <StatutoryReportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <SandboxExportsPanel clientId={clientId} session={sessionTokenAccessor} />
      <FreeformReadsPanel clientId={clientId} session={sessionTokenAccessor} />
    </main>
  );
}
