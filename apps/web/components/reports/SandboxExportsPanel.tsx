"use client";

// TIER 2 — the analysis sandbox (lib/reports/types.ts's header: watermarked,
// never sealed, migration 0132). clara.list_sandbox_exports is the human
// history read (bookkeeper+); there is NO human "request export" door — the
// three mint/request wake verbs are granted to clara_wake_interactive ONLY
// (0132:1207-1216). This panel names that honestly rather than building a
// button for a verb the human lane cannot call.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
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
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <header>
        <h2 className="text-base font-medium text-foreground">{t("heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      </header>

      <p className="rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground">{t("requestNotice")}</p>

      {err ? (
        <p className="text-sm text-destructive">{t("error", { message: err })}</p>
      ) : !forThisClient ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : forThisClient.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {forThisClient.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
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
    </section>
  );
}
