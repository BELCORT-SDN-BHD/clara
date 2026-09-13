"use client";

// #641 — the Work detail's ACTIVITY view: this Work's own attributable history.
//
// WHAT IT READS, AND THE LIMIT THAT COMES WITH IT. `clara.list_activity` (0181) is the estate's
// ONE attributable feed, and every row it emits carries a `work_id`. This view calls that SAME
// door, scoped to this Work's client, and keeps the rows whose `work_id` is this one. It does not
// recut the door to add a `p_work` parameter: two other lanes have already spliced that body
// (#728's 0183, #630's 0184) and a third recut for a filter the browser can apply is not worth
// the frontier it would create.
//
// THE COST IS STATED RATHER THAN HIDDEN, because it is real. The feed is paged newest-first over
// the whole CLIENT, so a Work whose events are far down the client's history needs more than one
// page to reach. This view therefore says how far it has looked ("no activity in the most recent
// N events") and offers "Look further back" rather than claiming an empty result is an absence.
// A door-side `p_work` filter is the honest fix and is left as a follow-up.
//
// AND ONE THING IT IS HONEST ABOUT UP FRONT: a Work only enters that feed once it has produced a
// COMMITTED operation receipt or touched a journal entry (0181's own three arms). A refused or
// still-running Work legitimately has nothing here, and the copy says so instead of implying the
// history was lost. The Work's own lifecycle — admitted, run, parked, settled — is on the page
// above this view, in its identity block and its outcome band.
//
// TAB SWITCHING NEVER WRITES (appendix C §4). This component only reads, and it reads LAZILY: it
// is mounted by the Activity tab's own panel, so opening the Results tab costs nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { businessDateTime } from "@/lib/business-date";
import { listActivity, type ActivityPage, type ActivityRow } from "@/lib/firm/activity";

/** One page at the door's own ceiling: the fewer round trips a Work's history needs, the fewer
 *  "look further back" presses a person makes to find it. */
const PAGE = 100;

export function WorkActivityView({
  clientId,
  workId,
  /** Injected by the cells; production reads the door. */
  load,
}: {
  clientId: string;
  workId: string;
  load?: (cursor: string | null) => Promise<ActivityPage>;
}) {
  const t = useTranslations("WorkDetail");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [scanned, setScanned] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [started, setStarted] = useState(false);

  // The #746 ref pattern: the loader and the paging position are read through refs, so a state
  // update never re-arms the effect below and a second press cannot pair a stale cursor with a
  // fresh answer.
  const loadRef = useRef(load);
  loadRef.current = load;
  const cursorRef = useRef<string | null>(null);
  const epochRef = useRef(0);

  const readMore = useCallback(async (first: boolean) => {
    const epoch = ++epochRef.current;
    if (first) setLoading(true);
    else setBusy(true);
    try {
      const loader = loadRef.current;
      const page = loader
        ? await loader(cursorRef.current)
        : await listActivity({ client: clientId }, { cursor: cursorRef.current, limit: PAGE });
      if (epoch !== epochRef.current) return;
      const mine = (page.rows ?? []).filter((r) => r.work_id === workId);
      setRows((prev) => (first ? mine : [...prev, ...mine]));
      setScanned((prev) => (first ? (page.rows?.length ?? 0) : prev + (page.rows?.length ?? 0)));
      cursorRef.current = page.next_cursor ?? null;
      setCursor(page.next_cursor ?? null);
      setError(null);
    } catch (e) {
      if (epoch !== epochRef.current) return;
      setError(e);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [clientId, workId]);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    cursorRef.current = null;
    void readMore(true);
  }, [started, readMore]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="sr-only">
          {t("activityLoading")}
        </p>
        <Skeleton aria-hidden className="h-4 w-3/4" />
        <Skeleton aria-hidden className="h-4 w-2/3" />
      </div>
    );
  }

  if (error !== null && rows.length === 0) {
    return (
      <StateBanner
        tone="error"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void readMore(true)}>
            {t("retryRead")}
          </Button>
        }
      >
        {t("activityReadFailed")}
      </StateBanner>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("activityEmptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("activityEmptyBody", { scanned })}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={`${row.source}:${row.id}`} className="rounded-md border border-border p-2">
              <p className="text-sm text-foreground wrap-anywhere">
                {row.description ?? row.event_type ?? row.kind}
              </p>
              <p className="text-xs text-muted-foreground">
                {businessDateTime(row.occurred_at)}
                {row.status !== null ? ` · ${row.status}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* A READ FAILURE OVER ROWS WE ALREADY HAVE keeps them and says the last look failed —
          never a blank panel that would read as "there is nothing else". */}
      {error !== null && rows.length > 0 ? (
        <StateBanner tone="warning">{t("activityReadFailed")}</StateBanner>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {cursor !== null ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void readMore(false)}>
            {busy ? t("activityLookingFurther") : t("activityLookFurther")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("activityScannedAll", { scanned })}</p>
        )}
        <Link
          href={`/activity?client=${encodeURIComponent(clientId)}`}
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          {t("activityOpenFeed")}
        </Link>
      </div>
    </div>
  );
}
