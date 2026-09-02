"use client";

// TIER 1 — sealed statutory close reports (lib/reports/types.ts's header: the
// signed-original archive, migration 0127). clara.report_artifacts is read via
// plain getRows; a PostgREST 404 folds into the honest "not deployed yet"
// state (never a crash, never a silent empty list standing in for it).

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listReportArtifacts } from "@/lib/reports/api";
import { useDownloadOffers } from "@/lib/reports/offers";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { ArtifactRow } from "./ArtifactRow";
import { ReportAgentReceiptsPanel } from "./ReportAgentReceiptsPanel";
import type { SessionTokenAccessor } from "@/lib/session";

export function StatutoryReportsPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory");
  const { data: read, busy, err, clr, act } = useHydratedPart(session, (s) => listReportArtifacts(clientId, { session: s }));
  // The download OFFER, read once for the whole panel: whether each artifact is downloadable is
  // the DOOR's verdict, never something this panel derives from a row it already has.
  const offers = useDownloadOffers(clientId, session);

  return (
    // P3 polish: the bespoke `rounded-xl border bg-surface p-4` <section> became
    // the shared <Card> — the same panel surface the Bank tab already used, so
    // a "panel" is one thing product-wide. The heading stays a REAL <h2> via
    // <SectionHeader> rather than <CardTitle>, which renders a <div>: matching
    // Bank's look must not cost Reports its document outline.
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* F2 (independent review, HIGH): a door refusal (e.g. CLR05 segregation
            on Issue-for-approval) must render even once `read` has already
            loaded successfully once — this banner is NOT inside the `!read`
            branch below, so it survives past the first load, exactly like
            ClosePlanPanel.tsx's own hoisted banner. */}
        {read && err ? (
          <StateBanner
            tone="error"
            code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
          >
            {err}
          </StateBanner>
        ) : null}

        {!read ? (
          err ? <StateBanner tone="error">{t("error", { message: err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : !read.available ? (
          <EmptyState>{t("notDeployed")}</EmptyState>
        ) : read.rows.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {read.rows.map((artifact) => (
              <ArtifactRow
                key={artifact.id}
                artifact={artifact}
                offer={offers.offerFor(artifact.id)}
                session={session}
                busy={busy}
                act={act}
              />
            ))}
          </div>
        )}

        <ReportAgentReceiptsPanel clientId={clientId} session={session} />
      </CardContent>
    </Card>
  );
}
