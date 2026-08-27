"use client";

// TIER 1 — sealed statutory close reports (lib/reports/types.ts's header: the
// signed-original archive, migration 0127). clara.report_artifacts is read via
// plain getRows; a PostgREST 404 folds into the honest "not deployed yet"
// state (never a crash, never a silent empty list standing in for it).

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listReportArtifacts } from "@/lib/reports/api";
import { ArtifactRow } from "./ArtifactRow";
import { ReportAgentReceiptsPanel } from "./ReportAgentReceiptsPanel";
import type { SessionTokenAccessor } from "@/lib/session";

export function StatutoryReportsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory");
  const { data: read, busy, err, clr, act } = useHydratedPart(session, (s) => listReportArtifacts(clientId, { session: s }));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <header>
        <h2 className="text-base font-medium text-foreground">{t("heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      </header>

      {/* F2 (independent review, HIGH): a door refusal (e.g. CLR05 segregation
          on Issue-for-approval) must render even once `read` has already
          loaded successfully once — this banner is NOT inside the `!read`
          branch below, so it survives past the first load, exactly like
          ClosePlanPanel.tsx's own hoisted banner. */}
      {read && (err || clr) ? (
        <p className="rounded-lg border border-destructive/30 bg-error-muted p-2 text-sm text-destructive">
          {clr ? `${clr.code}${clr.reason ? ` (${clr.reason})` : ""}: ` : ""}
          {err}
        </p>
      ) : null}

      {!read ? (
        err ? <p className="text-sm text-destructive">{t("error", { message: err })}</p> : <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : !read.available ? (
        <p className="text-sm text-muted-foreground">{t("notDeployed")}</p>
      ) : read.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {read.rows.map((artifact) => (
            <ArtifactRow key={artifact.id} artifact={artifact} session={session} busy={busy} act={act} />
          ))}
        </div>
      )}

      <ReportAgentReceiptsPanel clientId={clientId} session={session} />
    </section>
  );
}
