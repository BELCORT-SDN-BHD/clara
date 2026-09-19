"use client";

// #635 — THE FIRM'S LEGAL STANDING, and the consequence of losing it, in the accountant's words.
//
// STANDING IS THE DOOR'S FACT, NEVER RE-DERIVED HERE. `standing_live` arrives from
// `clara.get_firm_legal_standing()`, which computes it from the same literal predicate
// `clara._accounting_work_egress_live` uses to govern model egress (0195:890-906). A second
// derivation in this component would be free to disagree with the wall that actually decides,
// and the person reading this card would have no way to tell which one was right.
//
// THE WARNING NAMES THE CONSEQUENCE, NOT THE MECHANISM. "Clara cannot use a model on any
// client's books until an owner of this firm accepts the current versions" is what an accountant
// needs to know; it is sourced from ARCHITECTURE §5.E's third recovery path, and it is the same
// thing `WorkDetail.egressNotAuthorized.body` already tells somebody standing in front of a
// blocked piece of Work. This card is the destination that sentence previously lacked.
//
// THE ACCEPT CONTROL IS GATED ON THE DOOR'S OWN `can_accept_for_firm`, and on nothing else. It is
// re-derived server-side on every call from 0195:905's membership predicate (active + owner), so
// a demotion removes the control on the next read rather than on a mirrored rank this component
// happens to be holding. There is deliberately NO `FIRM_CAPABILITY_FLOORS` row for it:
// `accept_legal_document` carries no `_human_ctx` at all — it must not, because an `(entry)`
// applicant accepts before any membership exists — so no floor row could describe it.
//
// A MASKED NULL IS NOT "NOBODY ACCEPTED". Below bookkeeper the door masks the attribution triple
// to NULL and sets `masked: true`; `firm_accepted` is never masked. So the card reads WHETHER off
// `firmAccepted` and WHO off the triple, and says plainly that the attribution is withheld rather
// than letting a viewer read a blank as an absence.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { TechnicalDetail } from "@/components/common/technical-detail";
import { SectionHeader } from "@/components/common/section-header";
import { AcceptLegalDialog, type AcceptLegalDialogProps } from "@/components/firm-admin/accept-legal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay } from "@/lib/firm/commercial-format";
import type { FirmLegalStanding, LegalStandingDocument } from "@/lib/firm/commercial-reads";
import type { LegalKind } from "@/lib/registration/legal-reads";
import type { FirmSettingsView } from "./firm-settings-view";

export type LegalStandingCardProps = {
  readonly view: FirmSettingsView<FirmLegalStanding>;
  readonly onRetry: () => void;
  /** Re-read the standing after an acceptance the database confirmed. */
  readonly onAccepted: () => void;
  /** Injected straight through to the dialog by the unit cells. */
  readonly dialogProps?: Pick<AcceptLegalDialogProps, "loadDocuments" | "accept" | "mintOpKey">;
};

export function LegalStandingCard({ view, onRetry, onAccepted, dialogProps }: LegalStandingCardProps) {
  const t = useTranslations("FirmSettings");
  const [acceptingKind, setAcceptingKind] = useState<LegalKind | null>(null);
  const standing = view.status === "ready" ? view.data : null;

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("legalHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("legalSubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {view.status === "loading" ? <Skeleton className="h-28 w-full" /> : null}

        {view.status === "denied" ? (
          // The database's own sentence, rendered verbatim. CLR04 carries no detail.reason
          // (0004:299-309), so nothing here invents one.
          <StateBanner tone="warning" code="CLR04">{view.message}</StateBanner>
        ) : null}

        {view.status === "failed" ? (
          <StateBanner tone="error" action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button>}>
            {t("readFailed")}
            <TechnicalDetail>{`get_firm_legal_standing: ${view.message}`}</TechnicalDetail>
          </StateBanner>
        ) : null}

        {standing !== null ? (
          <>
            {standing.standingLive ? (
              <StateBanner tone="info">{t("legalLive")}</StateBanner>
            ) : (
              <StateBanner tone="warning" title={t("legalNotLiveHeading")}>
                {t("legalNotLiveBody")}
                <span className="block pt-1">
                  {standing.canAcceptForFirm ? null : ownerHint(standing, t)}
                </span>
              </StateBanner>
            )}

            <ul className="flex flex-col gap-4">
              {standing.documents.map((doc) => (
                <li key={doc.kind} className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {doc.kind === "terms" ? t("legalKindTerms") : t("legalKindDpa")}
                    </span>
                    <Badge variant="outline">{t("legalVersion", { version: doc.version })}</Badge>
                    <Badge variant={doc.status === "published" ? "secondary" : "outline"}>
                      {doc.status === "published"
                        ? t("legalStatusPublished")
                        : doc.status === "draft"
                          ? t("legalStatusDraft")
                          : t("legalStatusSuperseded")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {doc.effectiveFrom !== null
                      ? t("legalEffectiveFrom", { date: formatDay(doc.effectiveFrom) ?? doc.effectiveFrom })
                      : t("legalEffectiveUnknown")}
                  </p>
                  <p className="text-sm">{firmLine(doc, standing.masked, t)}</p>
                  <p className="text-sm text-muted-foreground">
                    {doc.myAcceptedVersion === doc.version && doc.myAcceptedAt !== null
                      ? t("legalYourAcceptance", {
                          version: doc.version,
                          date: formatDay(doc.myAcceptedAt) ?? doc.myAcceptedAt,
                        })
                      : t("legalYourAcceptanceNone")}
                  </p>
                  {doc.status === "draft" ? (
                    <p className="text-xs text-muted-foreground">{t("legalDraftNote")}</p>
                  ) : null}
                  {standing.canAcceptForFirm && !standing.standingLive
                   && doc.status === "published" && doc.myAcceptedVersion !== doc.version ? (
                    <div className="pt-1">
                      <Button type="button" size="sm" onClick={() => setAcceptingKind(doc.kind)}>
                        {t("legalAcceptTrigger")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {standing.masked ? (
              <p className="text-xs text-muted-foreground">{t("legalMaskedNote")}</p>
            ) : null}

            {acceptingKind !== null ? (
              <AcceptLegalDialog
                kind={acceptingKind}
                open
                onOpenChange={(open) => { if (!open) setAcceptingKind(null); }}
                onAccepted={onAccepted}
                {...dialogProps}
              />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** WHETHER the firm accepted (never masked), then WHO and WHEN (masked below bookkeeper). */
function firmLine(
  doc: LegalStandingDocument,
  masked: boolean,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!doc.firmAccepted) return t("legalNotAcceptedForFirm");
  if (masked || doc.acceptedByName === null || doc.acceptedAt === null) return t("legalAcceptedForFirm");
  return t("legalAcceptedBy", {
    name: doc.acceptedByName,
    date: formatDay(doc.acceptedAt) ?? doc.acceptedAt,
  });
}

/** For everyone who may NOT accept: who must. The owner's NAME is used only where this reader's
 *  rank is already allowed to see it — a masked payload carries no name to use.
 *
 *  IT NAMES THE MOST RECENT ACCEPTANCE ON RECORD, and says exactly that. The first version of
 *  this helper took the first document carrying a name (array order, which is kind order) and
 *  said that person "accepted the previous ones". Standing can be false while one kind's
 *  acceptance is still perfectly current (p635.db.legal_standing_new_version), and two different
 *  owners can hold the two halves (p635.db.legal_standing_two_people) — in both states the old
 *  sentence asserted something that did not happen. "The most recent acceptance on record was
 *  made by X" is true in every state the door can emit, and it still answers the question the
 *  reader actually has: who here has been handling this. */
function ownerHint(
  standing: FirmLegalStanding,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const named = latestAcceptor(standing.documents);
  if (standing.masked || named === null) return t("legalNotLiveOwnerHint");
  return t("legalNotLiveOwnerNamed", { name: named });
}

/** The name behind the latest `accepted_at` the payload carries. Compared as instants, never as
 *  strings: the door returns `timestamptz`, and PostgREST is free to render two rows with
 *  different offsets. A row missing either half of the pair is not an acceptance this can name. */
function latestAcceptor(documents: readonly LegalStandingDocument[]): string | null {
  let bestName: string | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const d of documents) {
    if (d.acceptedByName === null || d.acceptedAt === null) continue;
    const at = Date.parse(d.acceptedAt);
    if (Number.isNaN(at)) continue;
    if (at > bestAt) { bestAt = at; bestName = d.acceptedByName; }
  }
  return bestName;
}
