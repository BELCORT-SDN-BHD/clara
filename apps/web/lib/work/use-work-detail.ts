"use client";

// THE LIVE READ behind the Work detail — hydrate-never-trust with a clock.
//
// A durable Work changes without the browser doing anything, so this page is one
// of the few in the product that must ASK AGAIN. Three rules shape how:
//
//   POLL WHILE NON-TERMINAL, AND STOP. A settled Work never changes again, so a
//   page left open on a completed entry costs nothing. The interval is read
//   through a ref exactly as lib/interview/useInterviewRun.ts does, so a state
//   update never re-arms the timer (the busy-poll class that hook was hardened
//   against).
//
//   A FAILED READ KEEPS THE LAST DATED VALUE. §3, "Refresh with known data":
//   retain labelled prior data while still authorised, and distinguish
//   refreshing from delayed. So a read failure never blanks the page — it sets
//   `staleSince` (the instant of the last SUCCESSFUL read) and surfaces the
//   error beside the data, with Retry.
//
//   A PERMISSION LOSS CLEARS PROTECTED DATA. The same paragraph's other half:
//   "immediately clear data that is no longer permitted". A read that comes back
//   403/401 is not a transient failure to paper over with stale figures — the
//   data is dropped and the denied state renders. That asymmetry (keep on
//   transport failure, clear on authority failure) is the whole reason this hook
//   inspects the error's KIND rather than only its message.
//
// THE 60-SECOND RULE IS ABOUT THE READ, NOT THE WORK. "Update delayed since
// <time>" appears when this page has not managed a successful read for a minute
// — which is a statement about the connection, and is true whether the Work is
// queued or running. It is deliberately NOT "the Work has been running a while":
// a long run is not a fault, and saying it is would be the fabricated-progress
// shape §5 forbids.

import { useCallback, useEffect, useRef, useState } from "react";

import { isReadError, type ReadErrorKind } from "@/lib/read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadWorkDetail, type WorkDetailData } from "./reads";
import { isTerminalWorkStatus } from "./types";

export const WORK_POLL_MS = 3_000;
export const WORK_STALE_AFTER_MS = 60_000;

export type WorkReadFailure = { message: string; kind: ReadErrorKind | "unknown" };

export type WorkDetailState = {
  /** The last SUCCESSFUL read, or null before the first one lands. */
  data: WorkDetailData | null;
  /** True until the first read settles, in either direction. */
  loading: boolean;
  /** The Work is not visible to this caller — an unknown id, another client's,
   *  or one RLS does not admit. A STATE, not an error: the database raised
   *  nothing. */
  notFound: boolean;
  /** The last read failure, still standing. Cleared by the next success. */
  failure: WorkReadFailure | null;
  /** The instant of the last successful read (epoch ms), or null. */
  readAt: number | null;
  /** True once `WORK_STALE_AFTER_MS` has passed with no successful read. */
  delayed: boolean;
  reload: () => Promise<void>;
};

/** The two failure kinds that mean the caller may no longer see this row. On
 *  either, the held data is DROPPED rather than kept as a dated value. */
function isAuthorityFailure(kind: ReadErrorKind | "unknown"): boolean {
  return kind === "forbidden" || kind === "no_session";
}

export function useWorkDetail(args: {
  clientId: string;
  workId: string;
  /** Injected by the cells so a test drives the loader directly; production
   *  passes nothing and gets the RLS reader over the blessed session. */
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  /** Injected by the cells for the staleness clock. */
  now?: () => number;
}): WorkDetailState {
  const { clientId, workId } = args;
  const [data, setData] = useState<WorkDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failure, setFailure] = useState<WorkReadFailure | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [delayed, setDelayed] = useState(false);

  const nowRef = useRef(args.now ?? Date.now);
  nowRef.current = args.now ?? Date.now;

  const loadRef = useRef(args.load);
  loadRef.current = args.load;

  // The latest-wins epoch (lib/parts/hooks.ts's N3): a poll tick and a manual
  // Retry can be in flight together, and the OLDER response must never paint
  // over the newer one just because it resolved second.
  const epochRef = useRef(0);
  const dataRef = useRef<WorkDetailData | null>(null);
  dataRef.current = data;
  const readAtRef = useRef<number | null>(null);
  readAtRef.current = readAt;

  const reload = useCallback(async () => {
    const myEpoch = ++epochRef.current;
    try {
      const loader = loadRef.current;
      const next = loader
        ? await loader(clientId, workId)
        : await loadWorkDetail(clientId, workId, { session: sessionTokenAccessor });
      if (epochRef.current !== myEpoch) return;
      if (next === null) {
        // NOT VISIBLE. Held data is dropped: a Work that has stopped being
        // readable must not keep rendering its figures.
        setData(null);
        setNotFound(true);
        setFailure(null);
      } else {
        setData(next);
        setNotFound(false);
        setFailure(null);
      }
      setReadAt(nowRef.current());
      setDelayed(false);
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      const kind = isReadError(e) ? e.kind : "unknown";
      setFailure({ message: e instanceof Error ? e.message : String(e), kind });
      if (isAuthorityFailure(kind)) {
        setData(null);
        setReadAt(null);
      }
    } finally {
      if (epochRef.current === myEpoch) setLoading(false);
    }
  }, [clientId, workId]);

  // Mount read. Deliberately empty deps beyond the identity of `reload`, which
  // only changes when the ADDRESS changes — a new work id is a new page, and it
  // should start from nothing rather than showing the previous Work's figures.
  useEffect(() => {
    setData(null);
    setLoading(true);
    setNotFound(false);
    setFailure(null);
    setReadAt(null);
    setDelayed(false);
    void reload();
  }, [reload]);

  // THE POLL. Reads terminality through the ref, so a state update does not
  // re-arm it, and clears itself at the first terminal observation.
  useEffect(() => {
    const id = setInterval(() => {
      const status = dataRef.current?.work.status;
      if (status !== undefined && isTerminalWorkStatus(status)) {
        clearInterval(id);
        return;
      }
      void reload();
    }, WORK_POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  // THE STALENESS CLOCK, on its own timer rather than folded into the poll —
  // the poll stops on a terminal Work, and "the connection is delayed" must
  // still be able to appear for a page whose reads are failing.
  useEffect(() => {
    const id = setInterval(() => {
      const at = readAtRef.current;
      setDelayed(at === null ? false : nowRef.current() - at >= WORK_STALE_AFTER_MS);
    }, WORK_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // A RETURN TO THE TAB IS A REASON TO ASK AGAIN, and it is not the same as the
  // poll: a background tab's timers are throttled to once a minute or stopped
  // outright, so a human who switches away for five minutes and back would
  // otherwise read a five-minute-old status as current.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const status = dataRef.current?.work.status;
      if (status !== undefined && isTerminalWorkStatus(status)) return;
      void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { data, loading, notFound, failure, readAt, delayed, reload };
}
