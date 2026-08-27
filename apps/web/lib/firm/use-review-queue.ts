"use client";

// The paginated clara.list_review_queue reader (independent review FIX-5,
// fix-required, 2026-08-27): the un-paginated single-page read left the counts
// chips showing TRUE firm-wide totals over a list silently cut to `p_limit`
// (default 50) rows, with `next_cursor` never consumed — an honesty gap (a
// professional could read "needs_you: 74" over a 50-row list and reasonably
// assume that IS the list). This hook accumulates pages and exposes `loadMore`/
// `hasMore` so the UI can page through the rest, or at minimum show how many
// more rows exist.
//
// REVIEWER CAVEAT, LOAD-BEARING: `next_cursor` is NON-NULL even on the LAST
// page — the LIVE body (0011_daily_loop.sql:3748-3880 REPLACED WHOLE by
// 0016_a21_compliance_watch.sql:4558-4729, per lib/firm/needs-you.ts's own
// grounding note) always builds one from the last row of whatever page it
// returned, at 0016_a21_compliance_watch.sql:4725-4726 (R3, independent review
// round 2, 2026-08-27 — the prior citation named 0011's line numbers for code
// that lives in 0016's superseded-and-replaced body; 0011 itself is 4367 lines
// and never reaches line 4725 at all) — it is not itself a "more exist" signal.
// `hasMore` here is instead PAGE-SIZE-DERIVED: a page that returned FEWER rows
// than the limit requested is provably the last page (the RPC would have
// filled it otherwise); a full page MIGHT have more. This never overclaims
// "no more" and costs nothing extra to compute.
//
// Same reload-epoch guard as lib/firm/use-async-read.ts (see that file's header
// for the mechanism and why it exists) — duplicated rather than composed because
// pagination needs its own accumulated-rows state `useAsyncRead` has no concept
// of; the epoch discipline itself is proven there (lib/firm/use-async-read.test.ts).
//
// R2 (independent review, fix-required, 2026-08-27 — round 2): `loadingMore`
// clears UNCONDITIONALLY in loadMore's `finally` — a call whose epoch was
// superseded by a DIFFERENT operation (a reload()/act() started while this
// loadMore was still in flight) must still retire ITS OWN "am I loading"
// flag; the epoch guard belongs only on whether this call's DATA gets
// committed, never on whether the button re-enables. The prior code guarded
// both the same way, which stranded `loadingMore: true` forever on a
// superseded call (deterministically reachable via act-then-loadMore).
//
// R4 (independent review, fix-required, 2026-08-27 — round 2): a successful
// loadMore no longer clears a standing `error`. The sticky-refusal law
// (lib/firm/use-async-read.ts's header) says a refusal is retired only by a
// NEW act() or an explicit dismiss — paging through MORE rows is neither, and
// must not silently retire a refusal the human has not yet acknowledged.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listReviewQueue,
  type ReviewQueueCounts,
  type ReviewQueueCursor,
  type ReviewQueueRow,
  type ReviewQueueScope,
  type ReviewQueueSweep,
} from "./needs-you";
import { sessionTokenAccessor } from "../session-accessor";

const PAGE_LIMIT = 50;

export type ReviewQueueState = {
  rows: ReviewQueueRow[];
  counts: ReviewQueueCounts | null;
  sweep: ReviewQueueSweep | null;
  loading: boolean;
  loadingMore: boolean;
  busy: boolean;
  error: unknown;
  /** True when the most recent page was FULL (`rows.length === PAGE_LIMIT`) —
   *  see the header's reviewer-caveat note on why this, not `next_cursor`
   *  presence, is the honest signal. */
  hasMore: boolean;
  /** Reset to page 1 and clear every accumulated page. */
  reload: () => Promise<void>;
  /** Fetch the next page (via the prior envelope's own `next_cursor`) and
   *  append it. No-ops if a fetch is already in flight or `hasMore` is false.
   *  A standing `error` survives a successful loadMore untouched (R4) — only a
   *  new `act()` clears one. */
  loadMore: () => Promise<void>;
  /** Same contract as lib/firm/use-async-read.ts's `act()` — resolves `true`/
   *  `false`, never rejects; always reloads (resetting to page 1) afterward. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
};

export function useReviewQueue(scope: ReviewQueueScope): ReviewQueueState {
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [counts, setCounts] = useState<ReviewQueueCounts | null>(null);
  const [sweep, setSweep] = useState<ReviewQueueSweep | null>(null);
  const [cursor, setCursor] = useState<ReviewQueueCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const epochRef = useRef(0);

  const reloadImpl = useCallback(async (opts?: { preserveErrorOnSuccess?: boolean }) => {
    const myEpoch = ++epochRef.current;
    setLoading(true);
    try {
      const env = await listReviewQueue(sessionTokenAccessor, scopeRef.current, null, PAGE_LIMIT);
      if (epochRef.current !== myEpoch) return;
      setRows(env.rows);
      setCounts(env.counts);
      setSweep(env.sweep);
      setCursor(env.next_cursor);
      setHasMore(env.rows.length === PAGE_LIMIT);
      if (!opts?.preserveErrorOnSuccess) setError(null);
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      setError(e);
    } finally {
      if (epochRef.current === myEpoch) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadImpl();
  }, []);

  const reload = useCallback(() => reloadImpl(), [reloadImpl]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !hasMore) return;
    const myEpoch = ++epochRef.current;
    setLoadingMore(true);
    try {
      const env = await listReviewQueue(sessionTokenAccessor, scopeRef.current, cursor, PAGE_LIMIT);
      if (epochRef.current !== myEpoch) return;
      setRows((prev) => [...prev, ...env.rows]);
      setCounts(env.counts);
      setSweep(env.sweep);
      setCursor(env.next_cursor);
      setHasMore(env.rows.length === PAGE_LIMIT);
      // R4: deliberately NOT setError(null) here — see the header note.
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      setError(e);
    } finally {
      // R2: unconditional — see the header note. A superseded call's own
      // "is a loadMore in flight" state must still retire when ITS fetch
      // settles, independent of whether its data gets committed.
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, hasMore]);

  const act = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reloadImpl();
        return true;
      } catch (e) {
        setError(e);
        await reloadImpl({ preserveErrorOnSuccess: true }).catch(() => {});
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reloadImpl],
  );

  return { rows, counts, sweep, loading, loadingMore, busy, error, hasMore, reload, loadMore, act };
}
