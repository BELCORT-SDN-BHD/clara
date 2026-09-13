"use client";

// #641 — the Work list's own data/state machine.
//
// NOT `useActivityFeed`, and the difference is the pagination model rather than taste. That hook
// APPENDS pages into one growing scroll and therefore owns a cursor, a dedupe pass and a
// merge-on-refresh; this list shows ONE page at a time with the cursor in the URL
// (`lib/work/work-list-url-state.ts`'s own header for why), so a page change is a navigation and
// this hook's only job is: read the page the URL names, and be honest about every way that read
// can go.
//
// THE VOCABULARY IS THE SHARED CONTROL CONTRACT'S (spec appendix C §3):
//
//   loading           the first read of this mount, no rows yet, no error yet -> Skeleton.
//   refreshing        a FILTER/PAGE change or a focus recheck is re-reading while the PRIOR rows
//                     stay on screen, labelled — never a blank flash between two pages.
//   staleError        a refresh (not the first read) failed for a reason that is NOT a permission
//                     loss: the prior rows are KEPT with an Alert offering Retry.
//   denied            a read failed for a reason that IS a permission loss (a governed CLR04, or a
//                     401/403-shaped transport failure) — rows are CLEARED. "Denied targets never
//                     leak stale accounting data" is not a preference.
//   failedFirstRead   `staleError` with no successful read EVER — a genuinely distinct state from
//                     "stale" (there is no prior page to call stale, so that copy would be a lie)
//                     and from "empty" (a read that did not answer proves nothing about whether
//                     this firm has Work).
//
// NOT `useAsyncRead` EITHER: that hook replaces its whole result on every reload, so a page change
// would blank the table and drop the caller's scroll position — the "distinguish refreshing from
// delayed/partial" line of the same contract, lost.
//
// EVERY LOADER READS THROUGH A REF (`filtersRef`, `loadRef`), the #746 class `use-work-detail.ts`
// was hardened for: a state update must never re-arm a loader, and the LATEST-STARTED read's
// answer is the only one ever committed (`epochRef`), regardless of which response returns first.
//
// C77.12 — THIS HOOK ADDS NO TIMER AT ALL, and that is the finding rather than an omission. The
// estate's one duration contract for durable Work lives in `lib/work/use-work-detail.ts`
// (`WORK_POLL_MS` = 3 s, `WORK_STALE_AFTER_MS` = 60 s) and belongs to the DETAIL page, which
// watches ONE non-terminal Work and stops the moment it settles. A LIST has no such subject: most
// of its rows are terminal, a three-second poll over a hundred of them would be a hundred times
// the cost for a page nobody is watching a single row on, and a second interval constant here
// would be exactly the duplicated duration C77.12 asks not to exist. The list re-reads on the two
// events that actually mean something — the URL naming a different page or filter set, and the tab
// regaining focus (which is also the live permission-loss check) — and the detail page keeps the
// clock. Reviewed no-gap: one contract, one owner, extended by reference rather than copied.

import { useCallback, useEffect, useRef, useState } from "react";

import { isDoorError, isDoorRefusal } from "@/lib/doors";
import {
  listAccountingWorkPage,
  type WorkListFilters,
  type WorkListRow,
} from "@/lib/work/work-list";

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

export type WorkListState = {
  rows: WorkListRow[];
  /** The cursor for the NEXT page, or null when this is the last one. */
  nextCursor: string | null;
  truncated: boolean;
  loading: boolean;
  refreshing: boolean;
  staleError: unknown | null;
  denied: unknown | null;
  failedFirstRead: boolean;
  reload: () => void;
};

export type UseWorkListArgs = {
  filters: WorkListFilters;
  /** The page this read is for — straight off the URL. A new cursor is a new read. */
  cursor: string | null;
  limit?: number;
  /** Injected by the cells so a test drives the loader directly; production reads the door. */
  load?: (
    filters: WorkListFilters,
    opts: { cursor: string | null; limit: number },
  ) => Promise<{ rows: WorkListRow[]; next_cursor: string | null; truncated: boolean }>;
};

export function useWorkList(args: UseWorkListArgs): WorkListState {
  const [rows, setRows] = useState<WorkListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleError, setStaleError] = useState<unknown | null>(null);
  const [denied, setDenied] = useState<unknown | null>(null);
  const [everLoaded, setEverLoaded] = useState(false);

  const limit = args.limit;

  // The read's own identity as a stable, comparable string — a new array/object identity every
  // render must not itself trigger a reload (the caller is a plain function component).
  const readKey = JSON.stringify({
    client: args.filters.client ?? null,
    status: args.filters.status ? [...args.filters.status].sort() : null,
    purpose: args.filters.purpose ? [...args.filters.purpose].sort() : null,
    initiator: args.filters.initiator ?? null,
    since: args.filters.since ?? null,
    until: args.filters.until ?? null,
    q: args.filters.q ?? null,
    cursor: args.cursor ?? null,
    limit: limit ?? null,
  });

  const filtersRef = useRef(args.filters);
  filtersRef.current = args.filters;
  const cursorRef = useRef(args.cursor);
  cursorRef.current = args.cursor;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const loadRef = useRef(args.load);
  loadRef.current = args.load;

  const epochRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const read = useCallback(async () => {
    const epoch = ++epochRef.current;
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    try {
      const loader = loadRef.current;
      const opts = { cursor: cursorRef.current ?? null, limit: limitRef.current ?? 25 };
      const page = loader
        ? await loader(filtersRef.current, opts)
        : await listAccountingWorkPage(filtersRef.current, opts);
      if (epoch !== epochRef.current) return; // superseded by a later read
      hasLoadedOnceRef.current = true;
      setEverLoaded(true);
      setRows(Array.isArray(page.rows) ? page.rows : []);
      setNextCursor(typeof page.next_cursor === "string" ? page.next_cursor : null);
      setTruncated(page.truncated === true);
      setStaleError(null);
      setDenied(null);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      if (isPermissionShaped(error)) {
        // Denied targets never leak stale accounting data — clear, do not keep.
        setRows([]);
        setNextCursor(null);
        setTruncated(false);
        setDenied(error);
        setStaleError(null);
      } else {
        setDenied(null);
        setStaleError(error);
      }
    } finally {
      // UNCONDITIONAL: this call's own busy flags always clear when IT settles, whether or not a
      // later read has since moved the epoch on. Only the DATA is epoch-gated, since that is the
      // part where "only the last-started call's answer counts" is actually true.
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-read whenever the URL names a different page or a different filter set. This project's
  // eslint config does not register react-hooks/exhaustive-deps (lib/parts/hooks.ts's own header
  // notes the same), so no directive is needed: `readKey` is the real dependency and `read`
  // always reads the refs.
  useEffect(() => {
    void read();
  }, [readKey, read]);

  // Live permission loss: re-read on window focus/visibility through the SAME path. An alt-tab is
  // not a new view, so this re-reads the SAME page rather than collapsing to the first one.
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [read]);

  return {
    rows,
    nextCursor,
    truncated,
    loading,
    refreshing,
    staleError,
    denied,
    failedFirstRead: staleError !== null && !everLoaded,
    reload: () => void read(),
  };
}
