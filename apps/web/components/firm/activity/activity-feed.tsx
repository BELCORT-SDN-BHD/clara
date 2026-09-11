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

import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { nextPaint } from "@/components/firm/work-question-affordance";

/** #728 finding 4 — the `<h1>` id this page's `PageHeader` carries (app/(firm)/activity/page.tsx),
 *  the SAME `headingId` idiom `WORK_HEADING_ID` (components/work/work-detail.tsx) already
 *  established for "the ONE surface that has to move focus to it" — read by id rather than a ref
 *  because the heading is rendered by the server component above this one. */
export const ACTIVITY_HEADING_ID = "activity-feed-heading";

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
  // #728 finding 4 — every currently-rendered row's own clickable element, keyed the SAME way the
  // `?event=` param addresses it (formatEventParam). A Map rather than one ref: any row on the
  // page can be the one a person opened, and only ONE Sheet is ever open at a time, but the row
  // that opened it may have scrolled off, been re-sorted, or (a filter change) left the page
  // entirely by the time it closes — the lookup below treats every one of those as "gone" rather
  // than guessing.
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastEventKeyRef = useRef<string | null>(null);

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

  // #728 finding 4 — HISTORY BACK OUT OF THE SHEET must not leave focus on <body>. The in-page
  // Close/Escape path already leaves focus somewhere real (whatever the person's own click or
  // keypress last touched stays put through the `router.back()`/`router.replace()` that follows —
  // browser-walked correctly, per the ticket), which is exactly why this effect CHECKS first
  // rather than always acting: the physical browser Back button (or a swipe-back gesture) never
  // itself held DOM focus, so an SPA re-render that follows a pop leaves focus nowhere. `nextPaint`
  // (the SAME timing #629's own row-focus fix uses, components/firm/work-question-affordance.tsx)
  // is awaited before checking `activeElement`, because the Sheet's own close is not necessarily
  // synchronous with the URL settling.
  //
  // EXACTLY ONE TRANSITION, NAMED (review round): `?event=` going from set to unset. The Sheet also
  // disappears when a refresh turns this component into its loading / denied / failed-first-read
  // branch WITHOUT the URL changing, and this effect does NOT fire on those — `state.event` is
  // unchanged, so the dependency never re-runs. That is deliberate rather than overlooked: those
  // three branches replace the whole list (the row to return to is gone, and two of them do not
  // render the page heading either), so there is nothing here to move focus TO; the honest fix for
  // them is a focus target inside those banners, which is a different change on a different
  // surface. Said out loud so the next reader does not take this belt for more than it is.
  useEffect(() => {
    const key = state.event ? formatEventParam(state.event.source, state.event.id) : null;
    const prevKey = lastEventKeyRef.current;
    lastEventKeyRef.current = key;
    if (prevKey === null || key !== null) return; // only act exactly when the Sheet just closed
    if (typeof document === "undefined") return;
    let cancelled = false;
    void nextPaint().then(() => {
      if (cancelled) return;
      const active = document.activeElement;
      const activeIsUseless = active === null || active === document.body || active === document.documentElement;
      if (!activeIsUseless) return; // an in-page close already left focus somewhere real
      const row = rowRefs.current.get(prevKey);
      if (row && typeof row.focus === "function") {
        row.focus();
        return;
      }
      // The row is gone (filters changed, it scrolled past the loaded page) — the list's own
      // heading landmark, exactly the #629 "nearest enclosing landmark" fallback. BOTH the method
      // and its answer are checked, the same way components/work/work-detail.tsx:201-206 checks
      // them: the page heading lives in app/(firm)/activity/page.tsx, one level above this
      // component, so a caller that renders the feed alone has no such element — and a test DOM
      // need not implement `getElementById` at all.
      const doc = document as unknown as { getElementById?: (id: string) => HTMLElement | null };
      if (typeof doc.getElementById !== "function") return;
      const heading = doc.getElementById(ACTIVITY_HEADING_ID);
      if (heading) {
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.event]);

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
            {feed.rows.map((row) => {
              const key = formatEventParam(row.source, row.id);
              return (
                <ActivityRow
                  key={key}
                  row={row}
                  clientNames={clientNames}
                  memberNames={memberNames}
                  onOpenDetail={openDetail}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                />
              );
            })}
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
