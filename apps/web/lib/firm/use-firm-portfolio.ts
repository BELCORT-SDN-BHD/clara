"use client";

// #659 (journey B1) — Firm Home's own data/state machine, and the file that gives this page the
// refresh contract every other live surface in the product already has.
//
// =============================================================================================
// WHY THIS COMPOSES `useReviewQueue` INSTEAD OF EDITING IT.
//
// FOUR surfaces share `lib/firm/use-review-queue.ts` — `firm-home-board.tsx`,
// `needs-you-inbox.tsx`, `client-workspace-overview.tsx` and `components/work/client-work-queue.tsx`
// — and NEITHER that hook nor `use-async-read.ts` registers a `focus` or `visibilitychange`
// listener: their mount effects fire exactly once for the lifetime of the component instance. Firm
// Home is the OUTLIER, not the inventor: five other hooks in this app register the pair
// (`lib/work/use-client-work-pack.ts`, `components/firm/activity/use-activity-feed.ts`,
// `components/operator/use-operator-queue.ts`, `components/work/use-work-list.ts`), and two of them
// state in their own headers that the listener IS the live permission recheck.
//
// Adding those listeners INSIDE `useReviewQueue` would change three other surfaces' request
// profile — including one another lane is rewriting this same wave — with a cell for none of them.
// So this hook owns the listeners, owns the pack read, and calls the shared hook's OWN `reload`
// alongside its own. The queue keeps its contract; the page gets the behaviour.
//
// =============================================================================================
// THE FOUR TRIGGERS, AND WHY EACH ONE IS A TRIGGER.
//
//   focus / visibilitychange   a return to the tab. Deliberately NOT conditional on anything the
//                              last read said, because it doubles as the live permission check
//                              (`use-operator-queue.ts:9`'s own argument): a caller whose role
//                              changed mid-session finds out here.
//   the 30 s while-visible     the compensation for a MISSED EVENT. The estate emits no Work
//   interval                   lifecycle domain event at all, the only pg_notify channels are
//                              server-side, and this app holds no realtime subscription — a polled
//                              re-read IS the compensation the acceptance criterion asks for.
//                              It runs only while the tab is visible, so a board nobody is looking
//                              at costs nothing.
//   the page/filter change     a different page of the register is a different question.
//   CLIENT_RECORD_CHANGED      the command bus event the creation control emits. A firm that just
//                              gained its first client must not keep saying it has none.
//
// AND THE 60-SECOND RULE IS NOT RESTATED. `WORK_STALE_AFTER_MS` is IMPORTED from
// `lib/work/use-work-detail.ts`, the estate's one owner of that duration, exactly as
// `lib/work/use-client-work-pack.ts` imports it. A second literal here would be the duplication
// C77.12 forbids, and `use-firm-portfolio.test.ts` reads this file's source to keep it that way.
//
// =============================================================================================
// A DENIAL CLEARS, A FAILURE KEEPS. A read that comes back as a permission loss drops the rows and
// clears the read instant — denied targets never leave stale accounting data on screen. A
// transport failure KEEPS the last good rows, dated, with the error beside them: "this is what I
// last knew, at this time" is a true and useful sentence; a blank board is not.

import { useCallback, useEffect, useRef, useState } from "react";

import { onClientRecordChanged } from "@/lib/command/bus";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { WORK_STALE_AFTER_MS } from "@/lib/work/use-work-detail";
import {
  EMPTY_PORTFOLIO_PACK,
  FIRM_PORTFOLIO_PAGE_SIZE,
  FIRM_PORTFOLIO_PREVIEW,
  getFirmPortfolioPack,
  type PortfolioPack,
} from "./portfolio-pack";

/** The while-visible compensation interval — the same cadence `use-client-work-pack.ts` runs at,
 *  for the same reason and over an envelope of the same order of size. */
export const FIRM_PORTFOLIO_REFRESH_MS = 30_000;

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

export type FirmPortfolioState = {
  /** Always a pack — never null — so a caller renders states rather than branching on absence. */
  pack: PortfolioPack;
  loading: boolean;
  refreshing: boolean;
  /** A transport-shaped failure standing beside the last good rows. */
  staleError: unknown | null;
  /** A permission-shaped refusal. The rows are cleared when this is set. */
  denied: unknown | null;
  /** True when the FIRST read failed and nothing has ever been shown. */
  failedFirstRead: boolean;
  /** Epoch ms of the last SUCCESSFUL read, or null. */
  readAt: number | null;
  /** True once `WORK_STALE_AFTER_MS` has passed with no successful read. */
  delayed: boolean;
  reload: () => void;
};

export type UseFirmPortfolioArgs = {
  /** The page this board is on — the door's own opaque keyset cursor, or null for page 1. */
  cursor?: string | null;
  limit?: number;
  preview?: number;
  /** Called after every one of this hook's own re-reads, so the review-queue numbers beside the
   *  portfolio are never older than the portfolio itself. It is the SHARED hook's own `reload`;
   *  this file does not reach inside it. */
  onRefresh?: () => void;
  /** Injected by the cells so a test drives the loader directly; production reads the door. */
  load?: (args: { cursor: string | null; limit: number; preview: number }) => Promise<PortfolioPack>;
  /** Injected by the cells for the staleness clock. */
  now?: () => number;
};

export function useFirmPortfolio(args: UseFirmPortfolioArgs = {}): FirmPortfolioState {
  const cursor = args.cursor ?? null;
  const limit = args.limit ?? FIRM_PORTFOLIO_PAGE_SIZE;
  const preview = args.preview ?? FIRM_PORTFOLIO_PREVIEW;

  const [pack, setPack] = useState<PortfolioPack>(EMPTY_PORTFOLIO_PACK);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleError, setStaleError] = useState<unknown | null>(null);
  const [denied, setDenied] = useState<unknown | null>(null);
  const [everLoaded, setEverLoaded] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [delayed, setDelayed] = useState(false);

  const loadRef = useRef(args.load);
  loadRef.current = args.load;
  const nowRef = useRef(args.now ?? Date.now);
  nowRef.current = args.now ?? Date.now;
  const refreshRef = useRef(args.onRefresh);
  refreshRef.current = args.onRefresh;
  const readAtRef = useRef<number | null>(null);
  readAtRef.current = readAt;

  // Latest-started wins, whichever response returns first (the #746 class). `hasLoadedOnceRef` is
  // per-PAGE: a new cursor starts from nothing, so a previous page's rows can never stand for one
  // frame under another page's address.
  const epochRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const read = useCallback(async () => {
    const epoch = ++epochRef.current;
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    try {
      const loader = loadRef.current;
      const next = loader
        ? await loader({ cursor, limit, preview })
        : await getFirmPortfolioPack({ cursor, limit, preview, session: sessionTokenAccessor });
      if (epoch !== epochRef.current) return; // superseded by a later read
      hasLoadedOnceRef.current = true;
      setEverLoaded(true);
      setPack(next);
      setStaleError(null);
      setDenied(null);
      setReadAt(nowRef.current());
      setDelayed(false);
    } catch (error) {
      if (epoch !== epochRef.current) return;
      if (isPermissionShaped(error)) {
        setPack(EMPTY_PORTFOLIO_PACK);
        setDenied(error);
        setStaleError(null);
        setReadAt(null);
        setDelayed(false);
      } else {
        setDenied(null);
        setStaleError(error);
      }
    } finally {
      // UNCONDITIONAL (`use-work-list.ts`'s own argument): this call's busy flags always clear when
      // IT settles; only the DATA is epoch-gated.
      setLoading(false);
      setRefreshing(false);
      // THE NEIGHBOURING NUMBERS MOVE WITH THIS ONE. The review-queue chips and the portfolio table
      // sit on one page and answer one question between them; a board that refreshed half of
      // itself would be worse than one that refreshed neither.
      refreshRef.current?.();
    }
  }, [cursor, limit, preview]);

  // A NEW PAGE IS A NEW BOARD. The values are cleared BEFORE the next read is issued.
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setPack(EMPTY_PORTFOLIO_PACK);
    setLoading(true);
    setRefreshing(false);
    setStaleError(null);
    setDenied(null);
    setEverLoaded(false);
    setReadAt(null);
    setDelayed(false);
    void read();
  }, [read]);

  // THE WHILE-VISIBLE COMPENSATION, plus the staleness clock on the same tick. The clock runs
  // whether or not the tab is visible, because "this connection is delayed" is a true statement
  // about a hidden tab too; the READ does not.
  useEffect(() => {
    const id = setInterval(() => {
      const at = readAtRef.current;
      setDelayed(at === null ? false : nowRef.current() - at >= WORK_STALE_AFTER_MS);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    }, FIRM_PORTFOLIO_REFRESH_MS);
    return () => clearInterval(id);
  }, [read]);

  // A RETURN TO THE TAB IS A REASON TO ASK AGAIN — and it is also the live permission check.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocusOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [read]);

  // THE REGISTER CHANGED UNDER US. One subscription, one re-read; the event carries no row to
  // trust, which is why this re-reads rather than splicing (`client-register-list.tsx:381`).
  useEffect(() => onClientRecordChanged(() => void read()), [read]);

  return {
    pack,
    loading,
    refreshing,
    staleError,
    denied,
    failedFirstRead: staleError !== null && !everLoaded,
    readAt,
    delayed,
    reload: () => void read(),
  };
}
