"use client";

// #632 — the Activity feed's own data/state machine. Not `useAsyncRead` (that hook
// replaces its whole result on every reload and has no notion of "append a page" or
// "keep this data while a background refresh runs") — this is a bespoke hook built for the
// shared control contract's own vocabulary (spec appendix C §3):
//
//   loading           first read, no rows yet, no error yet.
//   refreshing        a FILTER CHANGE or a focus/visibility recheck re-reads page 1 while
//                     the PRIOR rows stay on screen, labelled — never a blank flash.
//   stale             a refresh (not the FIRST read) failed for a reason that is NOT a
//                     permission loss: the prior rows are KEPT, with an Alert offering Retry.
//   denied            a refresh failed for a reason that IS a permission loss (a governed
//                     CLR04/401/403-shaped refusal) — rows are CLEARED. Denied targets never
//                     leak stale accounting data (#632's own acceptance line).
//   loadingMore       an explicit "Load more" is in flight; prior rows stay, no flicker.
//   duplicatesDropped how many ids the last load-more's dedupe-by-(source,id) removed —
//                     0 the overwhelming majority of the time; a small non-zero count is
//                     itself a normal outcome of new activity landing while a caller pages
//                     through, and the feed says so rather than dropping silently.
//
// LIVE PERMISSION LOSS: a `focus`/`visibilitychange` listener re-reads page 1 exactly like a
// filter change, through the SAME reload path — there is no second mechanism to keep in sync.
// The one thing that DOES differ between the two triggers is what happens to the ALREADY-loaded
// pages beyond page 1 — see `reload`'s own `resetToPage1` parameter below.
//
// REVIEW FINDINGS 1/2/3/21 (this file's own fix pass, second review round):
//
//   (1) A 401 is `DoorError.kind === "unauthenticated"` (lib/wire-error-kind.ts), not
//       "forbidden"/"no_session" — `isPermissionShaped` was missing it, so a JWT expiry's
//       window-focus reload kept the stale rows and the stale banner instead of denying.
//
//   (2) `reload` and `loadMore` used to share one epoch AND gate their OWN busy-flag clearing on
//       that same epoch in their `finally` blocks — so a call SUPERSEDED by a later one (of
//       either kind) never cleared its own flag, and `loadingMore`/`refreshing` could get stuck
//       true for the rest of the session. Every busy flag below is now cleared UNCONDITIONALLY
//       in its own request's `finally`/`.finally()` — regardless of whether a later call has
//       since moved the epoch on — so a superseded call still tidies up after itself; only the
//       DATA it would have written (`rows`/`nextCursor`/`truncated`) stays epoch-gated, since
//       that is the part where "only the last-started call's answer counts" is actually true.
//       `loadMore` also now refuses to start while a refresh is in flight (`refreshing`), not
//       only while another load-more is (`loadingMore`) — the gap that let a load-more fire
//       mid-refresh pair a STALE cursor (minted under the OLD filters) with `filtersRef.current`
//       already holding the NEW ones. The reverse direction is handled by `reload` itself: it
//       does not refuse to run just because a load-more is in flight (a filter change or a focus
//       recheck is not optional), but it immediately force-clears `loadingMore` the moment it
//       starts, so the button re-enables at once rather than waiting on a network call whose
//       eventual result this reload is about to make irrelevant anyway.
//
//   (3) `reload` used to ALWAYS replace `rows` with just the fresh page-1 read, so a window-focus
//       recheck silently threw away every page a `loadMore` had already fetched. It now takes a
//       `resetToPage1` flag: a FILTER CHANGE (a genuinely new view) still hard-resets rows/cursor
//       to that fresh first page; a focus/visibility recheck (or a manual retry) instead MERGES
//       the fresh page-1 rows into the ALREADY-loaded set (`mergeRefreshedPage`, deduped by
//       `(source,id)`, fresh copy wins a collision, re-sorted newest-first) and keeps the
//       existing `nextCursor` unless the feed had only one page before (in which case the fresh
//       page's own `next_cursor` is adopted, since new rows may have just pushed the feed past
//       one page for the first time).
//
//   (21) `loadMore`'s dedupe count is computed from a `rowsRef` mirror of `rows` kept current in
//        the render body (the same pattern `filtersRef` already uses here), rather than inside
//        the `setRows` updater itself — a state updater is not the place for a second `setState`
//        call, since React may invoke it more than once for the same commit. Its permission
//        branch also clears `staleError`, mirroring `reload`'s own denied branch exactly.
//
// KNOWN, ACCEPTED GAP (not one of the two interleavings this fix is measured against): if TWO
// reloads somehow overlap (e.g. a filter change and a focus recheck firing within the same tick),
// the EARLIER one's `finally` still fires unconditionally and could clear `refreshing` a moment
// before the LATER one's own settle does — a brief flicker of the "Refreshing…" indicator, never
// a stuck one, and never a data error (the epoch gate still protects `rows`/`nextCursor`). Two
// reloads racing each other is not one of "refresh-then-load-more"/"load-more-then-refresh".

import { useCallback, useEffect, useRef, useState } from "react";
import { isDoorRefusal, isDoorError } from "@/lib/doors";
import { formatEventParam, listActivity, type ActivityFilters, type ActivityRow } from "@/lib/firm/activity";

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

const rowKey = (r: Pick<ActivityRow, "source" | "id">) => formatEventParam(r.source, r.id);

/** Merge a freshly-read page 1 into the rows already on screen — the counterpart of a plain
 *  replace, used by every refresh that must not throw away pages a `loadMore` already fetched
 *  (review finding 3). Deduped by `(source,id)`; the FRESH copy wins a collision (a row's status
 *  can genuinely change between reads, e.g. approved -> reversed), and the result is re-sorted by
 *  the door's own order (`occurred_at desc, id desc`) since the two input lists' relative order
 *  is not guaranteed to already interleave correctly. */
function mergeRefreshedPage(prevRows: ActivityRow[], freshRows: ActivityRow[]): ActivityRow[] {
  const merged = new Map<string, ActivityRow>();
  for (const row of freshRows) merged.set(rowKey(row), row);
  for (const row of prevRows) {
    const key = rowKey(row);
    if (!merged.has(key)) merged.set(key, row);
  }
  return [...merged.values()].sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

export type ActivityFeedState = {
  rows: ActivityRow[];
  nextCursor: string | null;
  truncated: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  /** Set exactly when a refresh failed WITHOUT being a permission loss — the prior rows are
   *  still the ones on screen. `null` in every other state, including `denied`. */
  staleError: unknown | null;
  /** Set exactly when a refresh failed AS a permission loss — `rows` has already been cleared. */
  denied: unknown | null;
  /** `true` only when `staleError` is set AND no read has EVER succeeded — the distinct "failed
   *  read" state (spec appendix C §3), not "stale": there is no prior page to call stale, and
   *  the "could not refresh, showing the last activity it read" copy would be a lie here. */
  failedFirstRead: boolean;
  duplicatesDropped: number;
  loadMore: () => void;
  retry: () => void;
};

export function useActivityFeed(filters: ActivityFilters): ActivityFeedState {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [staleError, setStaleError] = useState<unknown | null>(null);
  const [denied, setDenied] = useState<unknown | null>(null);
  const [duplicatesDropped, setDuplicatesDropped] = useState(0);
  const [everLoaded, setEverLoaded] = useState(false);

  // Filters as a stable, comparable key — a NEW array/object identity every render must not
  // itself trigger a reload (the caller is a plain function component re-rendering).
  const filtersKey = JSON.stringify({
    client: filters.client ?? null,
    kinds: filters.kinds ? [...filters.kinds].sort() : null,
    since: filters.since ?? null,
    until: filters.until ?? null,
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // A mirror of `rows`, current as of the last render — `loadMore`'s dedupe reads this instead
  // of a `setRows` functional updater (review finding 21: a `setState` call has no business
  // running inside another state setter's updater function).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // A monotonic epoch: only the LAST-STARTED reload's result is ever committed, regardless of
  // which network response returns first (the same guarantee useAsyncRead's own header names).
  const epochRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const reload = useCallback(async (opts: { resetToPage1: boolean } = { resetToPage1: false }) => {
    const epoch = ++epochRef.current;
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    // A refresh PREEMPTS an in-flight load-more (review finding 2): the stale call's OWN
    // `.finally()` will still clear this flag again when it eventually settles (harmless, since
    // it is unconditional too), but the button re-enables now rather than waiting on a network
    // round trip this reload is about to make moot.
    setLoadingMore(false);
    try {
      const page = await listActivity(filtersRef.current, { cursor: null });
      if (epoch !== epochRef.current) return; // superseded by a later reload
      hasLoadedOnceRef.current = true;
      setEverLoaded(true);
      if (opts.resetToPage1) {
        setRows(page.rows);
        setNextCursor(page.next_cursor);
      } else {
        setRows((prev) => mergeRefreshedPage(prev, page.rows));
        // Keep the existing cursor (the feed may already be several loadMore pages deep) unless
        // there was no further page to begin with — then the fresh read's own cursor is the
        // honest one, since new rows may have just pushed the feed past a single page.
        setNextCursor((prevCursor) => (prevCursor === null ? page.next_cursor : prevCursor));
      }
      setTruncated(page.truncated);
      setStaleError(null);
      setDenied(null);
      setDuplicatesDropped(0);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      if (isPermissionShaped(error)) {
        // Denied targets never leak stale accounting data — clear, do not keep.
        setRows([]);
        setNextCursor(null);
        setTruncated(false);
        setDenied(error);
        setStaleError(null);
      } else if (firstLoad) {
        // The very first read failed outright — there is no prior page to call "stale".
        setDenied(null);
        setStaleError(error);
      } else {
        // A background refresh failed for an ordinary reason: keep the labelled prior rows.
        setStaleError(error);
      }
    } finally {
      // UNCONDITIONAL (review finding 2) — this call's own busy flags always clear when IT
      // settles, whether or not a later reload has since moved the epoch on.
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-read on every filter change (client/kinds/since/until) — "refresh with known data". A
  // filter change is a genuinely NEW view, so it hard-resets to the fresh first page rather than
  // merging with rows read under the OLD filters (review finding 2's own "a filter change resets
  // nextCursor, rows and both flags" — the flags are reset by `reload` itself, unconditionally,
  // above). This project's eslint config does not register react-hooks/exhaustive-deps
  // (lib/parts/hooks.ts's own header notes the same), so no directive is needed: `filtersKey` (a
  // stable, comparable string) is the real dependency; `reload` itself always reads
  // `filtersRef.current`.
  useEffect(() => {
    void reload({ resetToPage1: true });
  }, [filtersKey, reload]);

  // Live permission loss: re-read on window focus/visibility, through the SAME path — but
  // MERGING with the already-loaded pages rather than collapsing to page 1 (review finding 3):
  // an alt-tab is not a new view, and five loaded pages becoming one on refocus would be its own
  // defect distinct from the permission check this listener exists for.
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === "hidden") return;
      void reload({ resetToPage1: false });
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [reload]);

  const loadMore = useCallback(() => {
    // Refuses to start while a refresh is ALSO in flight (review finding 2), not only while
    // another load-more is: without this, a load-more that slipped in mid-refresh would pair a
    // cursor minted under the OLD filters with `filtersRef.current` already holding the NEW
    // ones — a request that names no coherent page under either filter set.
    if (!nextCursor || loadingMore || refreshing) return;
    const epoch = ++epochRef.current;
    setLoadingMore(true);
    listActivity(filtersRef.current, { cursor: nextCursor })
      .then((page) => {
        if (epoch !== epochRef.current) return; // superseded — a refresh/filter change won
        const seen = new Set(rowsRef.current.map(rowKey));
        let dropped = 0;
        const appended: ActivityRow[] = [];
        for (const row of page.rows) {
          const key = rowKey(row);
          if (seen.has(key)) {
            dropped += 1;
            continue;
          }
          seen.add(key);
          appended.push(row);
        }
        setRows([...rowsRef.current, ...appended]);
        setDuplicatesDropped(dropped);
        setNextCursor(page.next_cursor);
        setTruncated(page.truncated);
        setStaleError(null);
      })
      .catch((error: unknown) => {
        if (epoch !== epochRef.current) return;
        if (isPermissionShaped(error)) {
          setRows([]);
          setNextCursor(null);
          setTruncated(false);
          setDenied(error);
          // Mirrors `reload`'s own denied branch (review finding 21).
          setStaleError(null);
        } else {
          setStaleError(error);
        }
      })
      .finally(() => {
        // UNCONDITIONAL, same reasoning as `reload`'s own `finally` above (review finding 2).
        setLoadingMore(false);
      });
  }, [nextCursor, loadingMore, refreshing]);

  return {
    rows, nextCursor, truncated, loading, refreshing, loadingMore,
    staleError, denied, duplicatesDropped, loadMore, retry: () => void reload({ resetToPage1: false }),
    failedFirstRead: staleError !== null && !everLoaded,
  };
}
