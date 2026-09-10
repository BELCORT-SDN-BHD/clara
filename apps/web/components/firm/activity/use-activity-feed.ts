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

import { useCallback, useEffect, useRef, useState } from "react";
import { isDoorRefusal, isDoorError } from "@/lib/doors";
import { listActivity, type ActivityFilters, type ActivityRow } from "@/lib/firm/activity";

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) return error.kind === "forbidden" || error.kind === "no_session";
  return false;
}

const rowKey = (r: Pick<ActivityRow, "source" | "id">) => `${r.source}:${r.id}`;

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

  // A monotonic epoch: only the LAST-STARTED reload's result is ever committed, regardless of
  // which network response returns first (the same guarantee useAsyncRead's own header names).
  const epochRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const reload = useCallback(async () => {
    const epoch = ++epochRef.current;
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    try {
      const page = await listActivity(filtersRef.current, { cursor: null });
      if (epoch !== epochRef.current) return; // superseded by a later reload
      hasLoadedOnceRef.current = true;
      setRows(page.rows);
      setNextCursor(page.next_cursor);
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
      if (epoch === epochRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Re-read on every filter change (client/kinds/since/until) — "refresh with known data".
  // This project's eslint config does not register react-hooks/exhaustive-deps (lib/parts/
  // hooks.ts's own header notes the same), so no directive is needed: `filtersKey` (a stable,
  // comparable string) is the real dependency; `reload` itself always reads `filtersRef.current`.
  useEffect(() => {
    void reload();
  }, [filtersKey, reload]);

  // Live permission loss: re-read on window focus/visibility, through the SAME path.
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === "hidden") return;
      void reload();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [reload]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const epoch = ++epochRef.current;
    setLoadingMore(true);
    listActivity(filtersRef.current, { cursor: nextCursor })
      .then((page) => {
        if (epoch !== epochRef.current) return;
        setRows((prev) => {
          const seen = new Set(prev.map(rowKey));
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
          setDuplicatesDropped(dropped);
          return [...prev, ...appended];
        });
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
        } else {
          setStaleError(error);
        }
      })
      .finally(() => {
        if (epoch === epochRef.current) setLoadingMore(false);
      });
  }, [nextCursor, loadingMore]);

  return {
    rows, nextCursor, truncated, loading, refreshing, loadingMore,
    staleError, denied, duplicatesDropped, loadMore, retry: () => void reload(),
  };
}
