"use client";

// The unified Activity feed (#632, CB-AE2E-018 discharged): filters -> ONE list over the
// domain-event/agent-receipt/#623-operation-receipt union -> an event detail Sheet keyed by the
// URL. Replaces the receipts-only `FirmActivityFeed` this page used to lead with a NotBuiltNote
// above (components/firm/firm-activity-feed.tsx, now retired — its receipt-kind roster,
// `lib/firm/receipt-kinds.ts`, is reused here rather than duplicated).
//
// STABLE URL/BACK (spec appendix C §1/§4): filters live in the URL (activity-filters.tsx,
// `router.replace`); opening a row's detail is a `router.push` (a real history entry), so the
// browser Back button — or the Sheet's own Escape/close — returns to the list with its filters
// and scroll position exactly as they were. `openedViaPushRef` tells the two paths apart: a row
// click always pushes and closing that pops it with `router.back()`; a page LOADED directly at
// `?event=...` (a bookmark, a shared link) has no such history entry to pop, so closing THAT one
// rewrites the URL with `router.replace` instead — either way the list underneath is untouched.
//
// ONE ANNOUNCEMENT OWNER for the list's status (spec appendix C §4): exactly one `role="status"`
// element is ever mounted at a time — the loading sentence during the very first read, or the
// sr-only summary once rows exist — never both, so a screen reader is never told two competing
// things about the same list.

import { useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";
import { EmptyState } from "@/components/common/state";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useMemberNames } from "@/lib/members/use-member-names";
import {
  applyActivityUrlState,
  formatEventParam,
  parseActivityUrlState,
  type ActivityRow as ActivityRowData,
} from "@/lib/firm/activity";
import { ActivityFilters } from "./activity-filters";
import { ActivityRow } from "./activity-row";
import { ActivityEventSheet } from "./activity-event-sheet";
import { useActivityFeed } from "./use-activity-feed";

export function ActivityFeed() {
  const t = useTranslations("Activity");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => parseActivityUrlState(searchParams), [searchParams]);

  const clientsRead = useAsyncRead<ClientRow[]>(() => loadClientRegister(sessionTokenAccessor));
  const clients = clientsRead.data ?? [];
  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const memberNames = useMemberNames(sessionTokenAccessor);

  const feed = useActivityFeed({
    client: state.client, kinds: state.kinds, since: state.since, until: state.until,
  });

  const openedViaPushRef = useRef(false);

  const openDetail = useCallback(
    (row: ActivityRowData) => {
      openedViaPushRef.current = true;
      const next = applyActivityUrlState(searchParams, { event: { source: row.source, id: row.id } });
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const closeDetail = useCallback(
    (open: boolean) => {
      if (open) return;
      if (openedViaPushRef.current) {
        openedViaPushRef.current = false;
        router.back();
        return;
      }
      const next = applyActivityUrlState(searchParams, { event: null });
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // The very first read, no rows and no error yet — the ONE loading announcement.
  if (feed.loading) {
    return (
      <div className="flex flex-col gap-3">
        <ActivityFilters state={state} clients={clients} />
        <LoadingState>{t("loading")}</LoadingState>
      </div>
    );
  }

  // Live permission loss — rows are already cleared; explain the access state, offer nothing to
  // page through, and never render the filters as if the read still applied to this caller.
  if (feed.denied) {
    return (
      <div className="flex flex-col gap-3">
        <ActivityFilters state={state} clients={clients} />
        <DeniedBanner error={feed.denied} retry={feed.retry} />
      </div>
    );
  }

  // The FIRST read failed outright — a genuinely distinct state from "stale" (there is no prior
  // page to call stale, so that copy would be a lie) and from "empty" (a read that did not
  // answer proves nothing about whether the firm has activity).
  if (feed.failedFirstRead) {
    return (
      <div className="flex flex-col gap-3">
        <ActivityFilters state={state} clients={clients} />
        <StateBanner
          tone="error"
          title={t("failedReadTitle")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={feed.retry}>
              {t("retry")}
            </Button>
          }
        >
          {t("failedReadBody")}
        </StateBanner>
      </div>
    );
  }

  const isEmpty = feed.rows.length === 0;
  const isFirstUse = isEmpty && state.client === null && state.kinds.length === 0 && state.since === null && state.until === null;

  return (
    <div className="flex flex-col gap-3">
      <ActivityFilters state={state} clients={clients} />

      {feed.staleError ? (
        <StateBanner
          tone="warning"
          action={
            <Button type="button" variant="outline" size="sm" onClick={feed.retry}>
              {t("retry")}
            </Button>
          }
        >
          {t("staleNote")}
        </StateBanner>
      ) : null}

      {isEmpty ? (
        <EmptyState>{isFirstUse ? t("emptyFirstUse") : t("emptyFiltered")}</EmptyState>
      ) : (
        <>
          {/* The ONE status announcement once data is on screen — refreshing, or a plain count —
              and the ONLY one: while the event Sheet is open it owns the live region instead (its
              own loading/error text is `role="status"` too, `components/common/state.tsx`'s
              `LoadingState`), so this line drops its role rather than fighting the Sheet's for the
              same announcement slot (review finding 9). The paragraph stays mounted either way —
              only the role/aria-live toggle, so nothing else about this branch's layout shifts. */}
          <p
            role={state.event ? undefined : "status"}
            aria-live={state.event ? undefined : "polite"}
            className="sr-only"
          >
            {feed.refreshing ? t("refreshing") : t("rowCount", { count: feed.rows.length })}
          </p>
          {feed.truncated ? <p className="text-xs text-muted-foreground">{t("moreToLoad")}</p> : null}
          {feed.duplicatesDropped > 0 ? (
            <p className="text-xs text-muted-foreground">{t("duplicatesDropped", { count: feed.duplicatesDropped })}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {feed.rows.map((row) => (
              <ActivityRow
                key={formatEventParam(row.source, row.id)}
                row={row}
                clientNames={clientNames}
                memberNames={memberNames}
                onOpenDetail={openDetail}
              />
            ))}
          </ul>
          {feed.nextCursor ? (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={feed.loadMore} disabled={feed.loadingMore}>
              {feed.loadingMore ? t("loadingMore") : t("loadMore")}
            </Button>
          ) : null}
        </>
      )}

      <ActivityEventSheet event={state.event} onOpenChange={closeDetail} memberNames={memberNames} />
    </div>
  );
}

/** Review finding 8: `error instanceof Error` is true for EVERY real door failure (DoorError and
 *  DoorRefusal both extend it, `lib/doors.ts`), so `t("deniedGeneric")` was dead code and a user
 *  who lost access saw the DB's own raw text ("insufficient role") with no explanation at all —
 *  exactly backwards from the intent. This now always renders the honest explanation as the
 *  banner's body, and puts the governed code/message in the banner's own `code` slot, the same
 *  split `components/firm/data-state.tsx`'s `ErrorMessage` already uses for a DoorRefusal. */
function DeniedBanner({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Activity");
  let code: string | null = null;
  if (isDoorRefusal(error)) {
    code = error.reason ? `${error.code} · ${error.reason}` : error.code;
  } else if (isDoorError(error)) {
    code = error.kind;
  }
  return (
    <StateBanner
      tone="warning"
      title={t("deniedTitle")}
      code={code}
      action={
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t("retry")}
        </Button>
      }
    >
      {t("deniedGeneric")}
    </StateBanner>
  );
}
