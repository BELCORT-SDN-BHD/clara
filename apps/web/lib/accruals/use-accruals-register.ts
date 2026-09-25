"use client";

// #1152 — the paginated `clara.list_accrual_adjustments` reader for the accruals register. Same
// reload-epoch mechanism and the same page-size-derived `hasMore` reasoning as
// `lib/firm/use-review-queue.ts` (see that file's header for the mechanism in full and why
// `next_cursor`'s mere presence is never the "any more?" signal); reimplemented narrowly, rather
// than generalised into a shared hook, because this register's page has no `act()`/write half —
// `useReviewQueue`'s own act-then-reload contract would be dead code here.
//
// THE SIDE CONTROL IS A SERVER ROUND TRIP, NOT A CLIENT-SIDE FILTER (#1152's own reason for
// existing: `components/accruals/accruals-list.tsx`'s prior `all.filter((r) => r.side === side)`
// could disagree with a page it had not read). `side` is a hook ARGUMENT, not internal state:
// changing it changes this hook's own `reload` callback identity (the `useCallback` dependency
// array below), and the mount effect re-fires on every identity change — the SAME "a component
// whose captured ids CHANGE must call reload() on the change" discipline
// `components/registers/aging-register.tsx` states for its own AR/AP toggle, except here the
// dependency array does the calling for it, so no separate skip-first-render effect is needed.
//
// `next_cursor` is opaque and never constructed here — accumulated verbatim from the door's own
// answer, per `lib/accruals/api.ts`'s own `AccrualsCursor` header.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAccruals, type AccrualListRow, type AccrualSide, type AccrualsCursor } from "./api";
import { sessionTokenAccessor } from "../session-accessor";

const PAGE_LIMIT = 50;

export type AccrualsRegisterState = {
  rows: AccrualListRow[];
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  /** Page-size-derived, never from `next_cursor`'s presence (see this file's header). */
  hasMore: boolean;
  /** Fetch the next page (via the prior page's own `next_cursor`) and append it. No-ops if a
   *  fetch is already in flight or `hasMore` is false. */
  loadMore: () => Promise<void>;
};

export function useAccrualsRegister(
  clientId: string,
  window: { from?: string | null; to?: string | null },
  side: AccrualSide | "",
): AccrualsRegisterState {
  const [rows, setRows] = useState<AccrualListRow[]>([]);
  const [cursor, setCursor] = useState<AccrualsCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const epochRef = useRef(0);
  // `window` is read through a ref rather than added to `reload`'s own dependency array: a fresh
  // `{}` literal every render (the common call shape) must not itself re-trigger a reload the way
  // a genuine `side` change does — the same "a new loader identity alone never re-triggers"
  // discipline `lib/firm/use-async-read.ts`'s own header states, applied to this hook's one
  // dependency that is not already a primitive.
  const windowRef = useRef(window);
  windowRef.current = window;

  const effectiveSide = side === "" ? null : side;

  const reload = useCallback(async () => {
    const myEpoch = ++epochRef.current;
    setLoading(true);
    try {
      const page = await loadAccruals(
        clientId, windowRef.current,
        { side: effectiveSide, cursor: null, limit: PAGE_LIMIT },
        { session: sessionTokenAccessor },
      );
      if (epochRef.current !== myEpoch) return; // superseded — a newer call already claimed the epoch
      setRows(page.accruals);
      setCursor(page.next_cursor);
      setHasMore(page.accruals.length === PAGE_LIMIT);
      setError(null);
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      setError(e);
    } finally {
      if (epochRef.current === myEpoch) setLoading(false);
    }
    // `windowRef` is deliberately excluded from this dependency array (see the ref's own comment
    // above); this project's eslint config does not register react-hooks/exhaustive-deps
    // (lib/firm/use-async-read.ts's own header notes the same), so no suppression comment is
    // needed for it.
  }, [clientId, effectiveSide]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !hasMore) return;
    const myEpoch = ++epochRef.current;
    setLoadingMore(true);
    try {
      const page = await loadAccruals(
        clientId, windowRef.current,
        { side: effectiveSide, cursor, limit: PAGE_LIMIT },
        { session: sessionTokenAccessor },
      );
      if (epochRef.current !== myEpoch) return;
      setRows((prev) => [...prev, ...page.accruals]);
      setCursor(page.next_cursor);
      setHasMore(page.accruals.length === PAGE_LIMIT);
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      setError(e);
    } finally {
      // Unconditional, the `use-review-queue.ts` R2 fix's own reasoning: a superseded call's own
      // "am I loading" flag must still retire when ITS fetch settles, independent of whether its
      // data gets committed.
      setLoadingMore(false);
    }
  }, [clientId, effectiveSide, cursor, hasMore, loadingMore]);

  return { rows, loading, loadingMore, error, hasMore, loadMore };
}
