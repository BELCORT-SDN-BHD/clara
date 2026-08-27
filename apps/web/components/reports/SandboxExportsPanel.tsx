"use client";

// TIER 2 — the analysis sandbox (lib/reports/types.ts's header: watermarked,
// never sealed, migration 0132). clara.list_sandbox_exports is the human
// history read (bookkeeper+); there is NO human "request export" door — the
// three mint/request wake verbs are granted to clara_wake_interactive ONLY
// (0132:1207-1216). This panel names that honestly rather than building a
// button for a verb the human lane cannot call.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listSandboxExports } from "@/lib/reports/api";
import { ExportRecipientsPanel } from "./ExportRecipientsPanel";
import type { SandboxExportState } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

const STATE_VARIANT: Record<SandboxExportState, "default" | "destructive" | "outline" | "secondary"> = {
  queued: "outline",
  running: "secondary",
  done: "default",
  failed: "destructive",
};

export function SandboxExportsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.sandbox");
  const { data: exports, err } = useHydratedPart(session, (s) => listSandboxExports(50, { session: s }));
  const forThisClient = exports?.filter((e) => e.client_set.includes(clientId)) ?? null;

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The "there is no human door for this" notice now wears the product's
            one dashed edge, same as Bank's NotBuilt and Close's proposal
            panel — the copy (which names the agent-lane-only verbs) is
            unchanged. */}
        <NotBuiltNote className="text-xs">{t("requestNotice")}</NotBuiltNote>

        {err ? (
          <StateBanner tone="error">{t("error", { message: err })}</StateBanner>
        ) : !forThisClient ? (
          <LoadingState>{t("loading")}</LoadingState>
        ) : forThisClient.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {forThisClient.map((e) => (
              <div key={e.id} className="enter-content flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs">
                <Badge variant={STATE_VARIANT[e.state]}>{e.state}</Badge>
                <span className="text-card-foreground">{e.recipient_display_name}</span>
                <span className="text-muted-foreground">{e.locale}</span>
                {e.artifact_sha256 ? <span className="font-mono text-muted-foreground">{e.artifact_sha256.slice(0, 16)}…</span> : null}
                <span className="text-muted-foreground">{e.created_at}</span>
              </div>
            ))}
          </div>
        )}

        <ExportRecipientsPanel session={session} />
      </CardContent>
    </Card>
  );
}
