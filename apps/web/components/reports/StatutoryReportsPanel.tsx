"use client";

// TIER 1 — sealed statutory close reports (lib/reports/types.ts's header: the
// signed-original archive, migration 0127). clara.report_artifacts is read via
// plain getRows; a PostgREST 404 folds into the honest "not deployed yet"
// state (never a crash, never a silent empty list standing in for it).

import { useEffect, useRef, useState } from "react";
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
import { useMemberNames } from "@/lib/members/use-member-names";
import { Button } from "@/components/ui/button";
import type { ReportUrlSelection } from "@/lib/reports/url-state";

export function StatutoryReportsPanel({
  clientId,
  session,
  addressed = { kind: "none" },
}: {
  clientId: string;
  session: SessionTokenAccessor;
  /** #719 — `?report=<artifact id>`: THE ONE REPORT a link named. This panel opens on that artifact
   *  alone, with a control that returns to the whole archive — the same shape the journals table's
   *  `?entry=` address has, for the same reason: an address is not a filter the reader chose, so it
   *  has to be visible and it has to be leaveable.
   *
   *  IT IS THE OPENING STATE, AND ONLY THE OPENING STATE. `dismissed` below is the reader's own
   *  later choice and takes precedence; a LATER address (a second link followed from inside the
   *  page) re-opens, because the address moved and the reader did not. */
  addressed?: ReportUrlSelection;
}) {
  const t = useTranslations("ClientReports.statutory");
  const { data: read, busy, err, clr, act } = useHydratedPart(session, (s) => listReportArtifacts(clientId, { session: s }));
  // The download OFFER, read once for the whole panel: whether each artifact is downloadable is
  // the DOOR's verdict, never something this panel derives from a row it already has.
  const offers = useDownloadOffers(clientId, session);
  // review-549 MAJOR 7: ONE roster read for the whole panel, passed down to every row.
  // `useMemberNames` reads `clara.firm_members_visible` once per mount, so holding it in
  // ArtifactRow was N reads for N artifacts — the N+1 its own header forbids.
  const memberNames = useMemberNames(session);

  // The reader's own "show everything" choice, reset whenever a NEW address arrives. The two
  // initialisers of a client component run once and Next does not remount on a query-only change,
  // so following a second report link from inside this page would otherwise leave the panel showing
  // whatever the first one settled on (the same defect #634 named for the journals table).
  const [dismissed, setDismissed] = useState(false);
  const addressedId = addressed.kind === "report" ? addressed.id : null;
  const seenAddress = useRef(addressedId);
  useEffect(() => {
    if (seenAddress.current === addressedId) return;
    seenAddress.current = addressedId;
    setDismissed(false);
  }, [addressedId]);

  const showingAddressed = addressed.kind !== "none" && !dismissed;
  // An artifact this client's archive does not hold — a stale link, another client's report, or a
  // malformed id — is its own state, never a silently complete list. `rows` is the whole archive
  // for this client, so membership here is the answer, not a guess.
  // `ReportArtifactsRead` is a discriminated union — `{available:false}` carries no `rows` at all
  // (a PostgREST 404 for an environment where the reporting engine is not deployed), which is a
  // different fact from an empty archive and stays that way here.
  const rows = read && read.available ? read.rows : [];
  const addressedRow = addressedId !== null ? (rows.find((a) => a.id === addressedId) ?? null) : null;
  // NOT-FOUND is only claimable once the read has ANSWERED — before that, "we have not looked yet"
  // is the truth, and the panel's own loading branch below is what says it.
  const addressedMissing = showingAddressed && read !== null && addressedRow === null;
  const visibleRows = showingAddressed ? (addressedRow ? [addressedRow] : []) : rows;

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

        {/* THE OFFER DOOR'S OWN REFUSAL, rendered verbatim. Reachable, and measured rather than
            assumed: the artifact list above is a direct RLS read that is firm-scoped with no role
            rank, while the offer door floors at bookkeeper — so a firm VIEWER sees these rows with
            no Download control on any of them. Without this banner that viewer gets no reason at
            all, which is the silent state the door refuses (rather than returning an empty list) to
            prevent. Never a NotBuiltNote: the door is built, this caller is not allowed. */}
        {offers.err ? <StateBanner tone="error">{offers.err}</StateBanner> : null}

        {/* #719 — THE ADDRESS IS ANNOUNCED, and it is leaveable. Rendered above the list rather
            than inside it so it survives the not-found arm too: a link that named nothing this
            archive holds still has to explain itself and still has to offer the way out. */}
        {showingAddressed ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="reports-addressed">
            <p className="text-sm text-muted-foreground">
              {addressedMissing ? t("addressedNotFound") : t("addressedHeading")}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setDismissed(true)}>
              {t("addressedShowAll")}
            </Button>
          </div>
        ) : null}

        {!read ? (
          err ? <StateBanner tone="error">{t("error", { message: err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : !read.available ? (
          <EmptyState>{t("notDeployed")}</EmptyState>
        ) : read.rows.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : visibleRows.length === 0 ? (
          // The addressed id matched nothing; the sentence above already says why, so this is the
          // list's own honest blank rather than a second copy of that explanation.
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRows.map((artifact) => (
              <ArtifactRow
                key={artifact.id}
                artifact={artifact}
                offer={offers.offerFor(artifact.id)}
                session={session}
                busy={busy}
                act={act}
                memberNames={memberNames}
              />
            ))}
          </div>
        )}

        <ReportAgentReceiptsPanel clientId={clientId} session={session} />
      </CardContent>
    </Card>
  );
}
