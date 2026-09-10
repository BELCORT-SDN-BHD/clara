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
  agentReceiptKindOf,
  getActivityEvent,
  primaryActivityHref,
  type ActivityDetail,
  type ActivitySource,
} from "@/lib/firm/activity";
import { isKnownAgentReceiptKind } from "@/lib/firm/receipt-kinds";
import { MemberName } from "@/components/common/member-name";
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
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const open = event !== null;

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
              READ, not an edit) — apps/web/AGENTS.md's "initial focus" contract. */}
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
                <MemberName userId={detail.actor} resolver={memberNames} />
                {detail.on_behalf_of ? (
                  <span className="ml-1 text-muted-foreground">
                    {t("onBehalfOf")} <MemberName userId={detail.on_behalf_of} resolver={memberNames} showRole={false} />
                  </span>
                ) : null}
              </dd>

              <dt className="text-muted-foreground">{t("eventTime")}</dt>
              <dd className="text-card-foreground">{businessDateTime(detail.occurred_at)}</dd>

              <dt className="text-muted-foreground">{t("eventDescription")}</dt>
              <dd className="text-card-foreground">{describeDetail(detail, t, tReceipt)}</dd>

              {detail.status ? (
                <>
                  <dt className="text-muted-foreground">{t("eventStatus")}</dt>
                  <dd className="text-card-foreground">{detail.status}</dd>
                </>
              ) : null}

              {detail.original_entry_id ? (
                <>
                  <dt className="text-muted-foreground">{t("eventOriginal")}</dt>
                  <dd className="text-card-foreground">{t("linksToOriginal")}</dd>
                </>
              ) : null}
              {detail.replacement_entry_id ? (
                <>
                  <dt className="text-muted-foreground">{t("eventReplacement")}</dt>
                  <dd className="text-card-foreground">{t("linksToReplacement")}</dd>
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

function describeDetail(
  detail: ActivityDetail,
  t: (key: string, values?: Record<string, string>) => string,
  tReceipt: (key: string) => string,
): string {
  if (detail.source === "event") return detail.description ?? detail.event_type ?? t("unlabeledEvent");
  if (detail.source === "agent_receipt") {
    const kind = detail.receipt_kind ?? agentReceiptKindOf(detail);
    return kind && isKnownAgentReceiptKind(kind) ? tReceipt(`receiptKinds.${kind}`) : (kind ?? t("unlabeledEvent"));
  }
  if (!detail.purpose) return t("unlabeledEvent");
  return detail.purpose === "journal_entry" ? t("workPurposes.journal_entry") : detail.purpose;
}
