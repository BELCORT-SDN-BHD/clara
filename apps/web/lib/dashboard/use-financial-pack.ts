"use client";

// #660 — the client home MONEY BAND's own data/state machine.
//
// A NEAR-COPY OF `lib/work/use-client-work-pack.ts`, ON PURPOSE, with exactly two additions. The
// epoch-guarded latest-started-wins loader, the five honest states, the while-visible 30-second
// re-read, the staleness clock that ticks whether or not the tab is visible, the denial that
// clears values AND the read instant, the transport failure that keeps the dated values, and the
// focus/visibilitychange re-read that doubles as the live permission check are that file's, and
// they are not re-argued here. What this file adds:
//
//   · THE PERIOD IS IN THE DEPENDENCY KEY. A period change CLEARS BEFORE RE-READING, exactly as a
//     client change does — otherwise August's cash would stand for one frame under September's
//     label, which is the same defect as one client's numbers under another client's name.
//   · IT SUBSCRIBES TO `CLIENT_RECORD_CHANGED`. A scope act that changes the client's own record
//     is a reason to ask again; the subscriber RE-READS and never trusts a value from the event,
//     because the event carries none.
//
// AND THE 60-SECOND RULE IS NOT RESTATED. `WORK_STALE_AFTER_MS` is IMPORTED from
// `lib/work/use-work-detail.ts`, the estate's one owner of that duration (C77.12: "one contract,
// one owner, extended by REFERENCE rather than copied"). A second literal here would be exactly
// the duplication that rule forbids, and a cell reads this file's source to keep it that way.
//
// =============================================================================================
// WHAT REFRESHES THIS BAND, AND THE ONE THING THAT CANNOT.
//
// Entry, scope change, period change, a return to the tab, and a 30-second while-visible tick.
// COMMIT-EVENT INVALIDATION IS NOT AMONG THEM, and that is a stated residual rather than an
// omission: `lib/command/bus.ts` carries exactly two events (`clara:focus-rail` at :33 and
// `clara:client-record-changed` at :111) and NEITHER is a posting or approval. There is no commit
// event in this app to subscribe to. The surface therefore says, in words, that the figure
// refreshes at most every thirty seconds — which is a smaller promise than the acceptance
// criterion's, made honestly, rather than the criterion's promise made falsely.
//
// THE BAND IS ONE READ FOR FOUR FACES, WHICH IS WHY IT IS ONE SECTION. The client home's law is
// that every SECTION reads for itself (`client-workspace-overview.tsx:16-19`) so one failure
// cannot blank the board. Cash, profit and the two charts are not four sections: they are four
// faces of ONE envelope that must agree — they share a period, a definition version and a source
// watermark — and four reads could not guarantee that. The money band is therefore one section
// with one hook instance, and the law is satisfied rather than broken.

import { useCallback, useEffect, useRef, useState } from "react";

import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { onClientRecordChanged } from "@/lib/command/bus";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { WORK_STALE_AFTER_MS } from "@/lib/work/use-work-detail";
import {
  DENIED_FINANCIAL_PACK,
  EMPTY_FINANCIAL_PACK,
  getClientFinancialPack,
  type ClientFinancialPack,
} from "./financial-pack";

/** The while-visible compensation interval. The same cadence the Work band uses, for the same
 *  reason: one small envelope about one client, read only while somebody is looking. */
export const FINANCIAL_PACK_REFRESH_MS = 30_000;

function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

export type FinancialPackState = {
  /** Always a pack — never null — so a caller renders arms rather than branching on absence.
   *  Before the first read every figure is `unknown`. */
  pack: ClientFinancialPack;
  loading: boolean;
  refreshing: boolean;
  staleError: unknown | null;
  denied: unknown | null;
  /** True when the FIRST read failed: the face then shows no number at all, because there is no
   *  dated value to keep. */
  failedFirstRead: boolean;
  /** Epoch ms of the last SUCCESSFUL read, or null. */
  readAt: number | null;
  /** True once `WORK_STALE_AFTER_MS` has passed with no successful read. */
  delayed: boolean;
  reload: () => void;
};

export type UseFinancialPackArgs = {
  clientId: string;
  /** `YYYY-MM-01`, or null for month-to-date. IN THE DEPENDENCY KEY. */
  month: string | null;
  /** Injected by the cells so a test drives the loader directly; production reads the door. */
  load?: (clientId: string, month: string | null) => Promise<ClientFinancialPack>;
  /** Injected by the cells for the staleness clock. */
  now?: () => number;
};

export function useFinancialPack(args: UseFinancialPackArgs): FinancialPackState {
  const { clientId, month } = args;
  const [pack, setPack] = useState<ClientFinancialPack>(EMPTY_FINANCIAL_PACK);
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

  // Latest-started wins, whichever response returns first. `hasLoadedOnceRef` is per CLIENT AND
  // PERIOD: a new period starts from nothing, so its first read is a `loading` arm rather than a
  // `refreshing` one over the previous period's numbers.
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
        ? await loader(clientId, month)
        : await getClientFinancialPack(clientId, { month }, { session: sessionTokenAccessor });
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
        // A DENIAL CLEARS BOTH THE VALUES AND THE READ INSTANT. A denied target never keeps stale
        // accounting numbers dated as if they were still readable.
        setPack(DENIED_FINANCIAL_PACK);
        setDenied(error);
        setStaleError(null);
        setReadAt(null);
        setDelayed(false);
      } else {
        // A TRANSPORT FAILURE KEEPS THE DATED VALUES. The last good numbers stay, with their date
        // and the error beside them, because they were true when they were read.
        setDenied(null);
        setStaleError(error);
      }
    } finally {
      // THE BUSY FLAGS FOLLOW THE EPOCH, exactly as the data does. A superseded read clearing
      // `loading` would end the CURRENT read's skeleton over a pack that was just reset to
      // EMPTY_FINANCIAL_PACK — so the band would render the ANSWERED face (every figure
      // `unknown`, every value null, "this client's money could not be read") under a period that
      // is still loading, for the whole remaining latency of the outstanding read. That is the
      // same defect this file's header is about, one state-word over.
      if (epoch === epochRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [clientId, month]);

  // A NEW CLIENT OR A NEW PERIOD IS A NEW BAND. The values are cleared BEFORE the next read is
  // issued, so no previous answer can stand for one frame under the new label.
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setPack(EMPTY_FINANCIAL_PACK);
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
  // about a hidden tab too; the READ does not, because the heaviest read on this page must not
  // cost a request every thirty seconds for a board nobody is looking at.
  useEffect(() => {
    const id = setInterval(() => {
      const at = readAtRef.current;
      setDelayed(at === null ? false : nowRef.current() - at >= WORK_STALE_AFTER_MS);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    }, FINANCIAL_PACK_REFRESH_MS);
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

  // A SCOPE CHANGE ON THIS CLIENT IS A REASON TO ASK AGAIN. The event carries only the id — no
  // status, no value — so this re-reads rather than trusting anything it was told.
  useEffect(
    () => onClientRecordChanged((detail) => {
      if (detail.clientId === clientId) void read();
    }),
    [clientId, read],
  );

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
