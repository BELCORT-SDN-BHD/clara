"use client";

// #650 — the client home Work attention band's own data/state machine.
//
// SHAPED ON `components/work/use-work-list.ts`: a ref-guarded epoch loader whose LATEST-STARTED
// read is the only answer ever committed, five honest states (loading / refreshing / staleError /
// denied / failedFirstRead), and the focus+visibilitychange re-read that doubles as the live
// permission check. What it adds is a clock, and the rest of this header is why.
//
// =============================================================================================
// C77.12 — THIS FILE DECLARES A SECOND INTERVAL, AND THE ARGUMENT IS WRITTEN HERE RATHER THAN IN
// A REVIEW COMMENT.
//
// The ruling lives in `components/work/use-work-list.ts:34-45` and says two things. First, that
// the Work LIST adds no timer because it has "no such subject" — most of its rows are terminal
// and a poll over a hundred of them costs a hundred times more than the one row anybody is
// watching. Second, that the estate keeps "one contract, one owner, extended by REFERENCE rather
// than copied".
//
// THE PACK IS THE CASE THE LIST IS NOT.
//
//   · IT HAS A SINGLE NON-TERMINAL SUBJECT. "What is running for this client right now" cannot
//     settle — it is a question about the present, not about a set of records most of which have
//     finished. A list of a hundred mostly-terminal rows has no such subject; two integers about
//     one client do.
//   · IT IS TWO INTEGERS, not a page. The re-read is one RPC returning a small envelope, which is
//     why a 30-second cadence here is not the cost the list ruling was protecting against.
//   · THERE IS NO OTHER MECHANISM. The estate emits no Work lifecycle domain event at all
//     (`clara._append_event` has zero Work-lane callers), the only `pg_notify` channels
//     (`clara_runtime_ctl`, `clara_events`) are server-side, and this app holds no realtime
//     subscription. A polled re-read IS the compensation the acceptance criterion asks for; there
//     is nothing else to wire.
//   · IT ONLY RUNS WHILE THE TAB IS VISIBLE, so a board nobody is looking at costs nothing.
//
// AND THE 60-SECOND RULE IS NOT RESTATED. `WORK_STALE_AFTER_MS` is IMPORTED from
// `lib/work/use-work-detail.ts`, the estate's one owner of that duration. A second literal here
// would be exactly the duplication C77.12 forbids, and a cell reads this file's source to keep it
// that way.
//
// =============================================================================================
// WHAT `readAt` IS, AND WHAT IT IS NOT. It is the instant of the last SUCCESSFUL read, so the
// board can say "read at …". It is NOT a claim about the database's position: no Work mutation
// emits an event, so there is no watermark to advance and this build does not invent one.
//
// A DENIAL CLEARS, A FAILURE KEEPS. A read that comes back as a permission loss drops both facets
// to `denied` and clears the read instant — denied targets never leak stale accounting data. A
// transport failure keeps the last good numbers, dated, with the error beside them.

import { useCallback, useEffect, useRef, useState } from "react";

import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  DENIED_FACET,
  UNKNOWN_FACET,
  getClientWorkPack,
  type ClientWorkPack,
} from "./client-work-pack";
import { WORK_STALE_AFTER_MS } from "./use-work-detail";

/** The while-visible compensation interval. See this file's header for why it exists at all and
 *  why it is not the duplicated duration C77.12 rules against. */
export const CLIENT_WORK_PACK_REFRESH_MS = 30_000;

/** The pack before anything has been read: two UNKNOWN facets. Never a zero board. */
const EMPTY_PACK: ClientWorkPack = {
  computedAt: null, previewLimit: null, window: null,
  active: UNKNOWN_FACET, recentSuccess: UNKNOWN_FACET, needsYouSource: null,
};

/** The pack a caller may not read. Same shape, a different sentence per facet. */
const DENIED_PACK: ClientWorkPack = {
  computedAt: null, previewLimit: null, window: null,
  active: DENIED_FACET, recentSuccess: DENIED_FACET, needsYouSource: null,
};

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

export type ClientWorkPackState = {
  /** Always a pack — never null — so a caller renders three arms rather than branching on
   *  absence. Before the first read both facets are `unknown`. */
  pack: ClientWorkPack;
  loading: boolean;
  refreshing: boolean;
  staleError: unknown | null;
  denied: unknown | null;
  failedFirstRead: boolean;
  /** Epoch ms of the last SUCCESSFUL read, or null. */
  readAt: number | null;
  /** True once `WORK_STALE_AFTER_MS` has passed with no successful read. */
  delayed: boolean;
  reload: () => void;
};

export type UseClientWorkPackArgs = {
  clientId: string;
  /** Injected by the cells so a test drives the loader directly; production reads the door. */
  load?: (clientId: string) => Promise<ClientWorkPack>;
  /** Injected by the cells for the staleness clock. */
  now?: () => number;
};

export function useClientWorkPack(args: UseClientWorkPackArgs): ClientWorkPackState {
  const { clientId } = args;
  const [pack, setPack] = useState<ClientWorkPack>(EMPTY_PACK);
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
  const readAtRef = useRef<number | null>(null);
  readAtRef.current = readAt;

  // Latest-started wins, whichever response returns first (the #746 class `use-work-detail.ts`
  // was hardened for). `hasLoadedOnceRef` is per-CLIENT: a new client starts from nothing.
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
        ? await loader(clientId)
        : await getClientWorkPack(clientId, { session: sessionTokenAccessor });
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
        setPack(DENIED_PACK);
        setDenied(error);
        setStaleError(null);
        setReadAt(null);
        setDelayed(false);
      } else {
        setDenied(null);
        setStaleError(error);
      }
    } finally {
      // UNCONDITIONAL, `use-work-list.ts`'s own argument: this call's busy flags always clear
      // when IT settles; only the DATA is epoch-gated.
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  // A NEW CLIENT IS A NEW BOARD. The values are cleared BEFORE the next read is issued, so the
  // previous client's numbers can never stand for one frame under another client's name. (The
  // page also remounts this subtree on a scope change; this hook does not rely on that.)
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setPack(EMPTY_PACK);
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
  // about a hidden tab too; the READ does not, because a board nobody is looking at must not cost
  // a request every thirty seconds.
  useEffect(() => {
    const id = setInterval(() => {
      const at = readAtRef.current;
      setDelayed(at === null ? false : nowRef.current() - at >= WORK_STALE_AFTER_MS);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    }, CLIENT_WORK_PACK_REFRESH_MS);
    return () => clearInterval(id);
  }, [read]);

  // A RETURN TO THE TAB IS A REASON TO ASK AGAIN — and it is also the live permission check, so it
  // is deliberately not conditional on anything the last read said.
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
