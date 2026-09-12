"use client";

// The event detail Sheet (#632) — contextual, not the durable URL: the FEED is the address, the
// Sheet is a supporting view of one row keyed by `?event=<source>:<id>` (spec appendix C §4,
// "Sheet is supporting context, not the durable URL"). Opening/closing is owned by the parent
// (components/firm/activity/activity-feed.tsx), which knows whether this Sheet was opened by an
// in-page click (Back should simply pop that history entry) or arrived already-open from a direct
// link (Back would leave the app; closing there rewrites the URL instead) — this component only
// renders what `open`/`event` say and reports close intent upward.
//
// DENIED TARGETS NEVER LEAK STALE ACCOUNTING DATA: a CLR11 (no-oracle: another firm's row, an
// unknown source, or a genuinely absent id all read identically) clears any prior detail and
// shows the SAME not-found/denied state — this component holds no "last good detail" across a
// failed re-fetch for a DIFFERENT event id.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { LoadingState } from "@/components/common/state";
import { ErrorMessage } from "@/components/firm/data-state";
import { businessDateTime } from "@/lib/business-date";
import {
  activityJournalsHref,
  activityProvenance,
  describeActivity,
  getActivityEvent,
  isKnownActivityStatus,
  primaryActivityHref,
  type ActivityDetail,
  type ActivitySource,
} from "@/lib/firm/activity";
import { MemberName } from "@/components/common/member-name";
import { ActivityActorLine } from "./activity-actor-line";
import type { MemberNameResolver } from "@/lib/members/use-member-names";
import Link from "next/link";

export function ActivityEventSheet({
  event,
  onOpenChange,
  memberNames,
}: {
  event: { source: ActivitySource; id: string } | null;
  onOpenChange: (open: boolean) => void;
  memberNames: MemberNameResolver;
}) {
  const t = useTranslations("Activity");
  const tReceipt = useTranslations("FirmActivity");
  const tWork = useTranslations("WorkCancel");
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const open = event !== null;
  const provenance = detail === null ? null : activityProvenance(detail);

  useEffect(() => {
    if (!event) {
      setDetail(null);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    setDetail(null);
    setError(null);
    getActivityEvent(event.source, event.id)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e: unknown) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // This project's eslint config does not register react-hooks/exhaustive-deps. The scalar
    // pair (source, id) is the real dependency — a new `event` object identity with the SAME
    // pair must not re-fetch, which is exactly what depending on the object itself would do.
  }, [event?.source, event?.id]);

  useEffect(() => {
    if (open && !loading) titleRef.current?.focus();
  }, [open, loading, detail, error]);

  const href = detail ? primaryActivityHref(detail) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetHeader>
          {/* tabIndex=-1 + an explicit focus() on open: the WAI Dialog pattern's own initial-
              focus recommendation when no form control should get it by default (this is a
              READ, not an edit) — AGENTS.md's "initial focus" contract. */}
          <SheetTitle ref={titleRef} tabIndex={-1}>
            {loading ? t("eventLoading") : t("eventHeading")}
          </SheetTitle>
          <SheetDescription>{t("eventSubheading")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          {loading ? <LoadingState>{t("eventLoading")}</LoadingState> : null}
          {!loading && error ? <ErrorMessage error={error} /> : null}
          {!loading && !error && detail ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("columnClient")}</dt>
              <dd className="text-card-foreground">{detail.client_name ?? t("noClient")}</dd>

              <dt className="text-muted-foreground">{t("columnActor")}</dt>
              <dd className="text-card-foreground">
                <ActivityActorLine row={detail} memberNames={memberNames} />
              </dd>

              <dt className="text-muted-foreground">{t("eventTime")}</dt>
              <dd className="text-card-foreground">{businessDateTime(detail.occurred_at)}</dd>

              <dt className="text-muted-foreground">{t("eventDescription")}</dt>
              <dd className="text-card-foreground">{describeActivity(detail, t, tReceipt)}</dd>

              {detail.status ? (
                <>
                  <dt className="text-muted-foreground">{t("eventStatus")}</dt>
                  {/* The SAME checked lookup the row uses (review finding 11) — a status this
                      build has not registered a label for renders its own raw value rather than
                      a fabricated translation, exactly as the row's own badge does. */}
                  <dd className="text-card-foreground">
                    {isKnownActivityStatus(detail.status) ? t(`statusLabels.${detail.status}`) : detail.status}
                  </dd>
                </>
              ) : null}

              {detail.original_entry_id ? (
                <>
                  <dt className="text-muted-foreground">{t("eventOriginal")}</dt>
                  <dd className="text-card-foreground">
                    {detail.client_id ? (
                      <Link
                        href={activityJournalsHref(detail.client_id, detail.original_entry_id)}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {t("linksToOriginal")}
                      </Link>
                    ) : (
                      t("linksToOriginal")
                    )}
                  </dd>
                </>
              ) : null}
              {detail.replacement_entry_id ? (
                <>
                  <dt className="text-muted-foreground">{t("eventReplacement")}</dt>
                  <dd className="text-card-foreground">
                    {detail.client_id ? (
                      <Link
                        href={activityJournalsHref(detail.client_id, detail.replacement_entry_id)}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {t("linksToReplacement")}
                      </Link>
                    ) : (
                      t("linksToReplacement")
                    )}
                  </dd>
                </>
              ) : null}

              {/* C88.10: the operation_receipt door already returns receipt_id/basis_origin/
                  initiator (0181's own detail shape) — rendered here beside the actor/time this
                  Sheet already shows, not merely present on the wire. */}
              {detail.source === "operation_receipt" ? (
                <>
                  <dt className="text-muted-foreground">{t("eventReceiptId")}</dt>
                  <dd className="text-card-foreground">{detail.receipt_id}</dd>
                  {detail.basis_origin ? (
                    <>
                      <dt className="text-muted-foreground">{t("eventBasisOrigin")}</dt>
                      <dd className="text-card-foreground">{detail.basis_origin}</dd>
                    </>
                  ) : null}
                  {/* #630 — TWO PEOPLE, TOLD APART. 0184 §A made `clara.accounting_work.initiator`
                      MUTABLE (a handover moves it) and froze "who asked" into `initiated_by`; the
                      door projects both (0184:2350). This Sheet used to render `initiator` alone
                      under a label reading "Initiator", so a handed-over Work's receipt told the
                      firm that the TAKER had asked for the posting and the person who actually
                      asked appeared nowhere on the only firm-wide history surface there is.

                      THE PAIR IS UNCONDITIONAL, unlike work-detail.tsx's "Responsible now" row,
                      which appears only when responsibility has MOVED. That page already names
                      who asked; this is an audit record, and "who asked" has to be STATED, not
                      inferred by a reader from the absence of a second row. Equal names print
                      twice, and that is the correct reading of a Work nobody took over. */}
                  {provenance ? (
                    <>
                      <dt className="text-muted-foreground">{tWork("activityInitiatedBy")}</dt>
                      <dd className="text-card-foreground">
                        <MemberName userId={provenance.initiatedBy} resolver={memberNames} showRole={false} />
                      </dd>
                      <dt className="text-muted-foreground">{tWork("activityResponsible")}</dt>
                      <dd className="text-card-foreground">
                        <MemberName userId={provenance.responsible} resolver={memberNames} showRole={false} />
                      </dd>
                    </>
                  ) : null}
                </>
              ) : null}
            </dl>
          ) : null}
          {href ? (
            <Link href={href} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
              {t(detail?.work_id ? "viewWork" : "viewObject")}
            </Link>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
