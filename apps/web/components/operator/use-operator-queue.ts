"use client";

// #615 — the operator support queue's own data/state machine.
//
// NOT `useHydratedPart` and not `useActivityFeed`. The first replaces its whole result on every
// reload and collapses every failure into one `err` string, which is precisely the conflation
// `lib/operator/reads.ts`'s `operatorQueueOutcome` exists to prevent; the second carries keyset
// pagination and a dedupe this door has no cursor for. What is shared with the Activity feed — and
// deliberately so — is the LIVE PERMISSION RECHECK: a `focus`/`visibilitychange` listener re-reads
// through the SAME path a filter change takes, so an operator whose authority was revoked while
// the tab sat in the background does not keep a queue of other people's registrations on screen
// (spec appendix C §3, "Permission change: Recheck the server … on resumption").
//
// THE STATE VOCABULARY IS THE PURE FUNCTION'S, not this hook's: the hook owns only `rows | null`,
// the last error, and whether a read is in flight, and hands those to `operatorQueueOutcome`. That
// is what makes the six states testable without React at all
// (`apps/web/lib/operator/reads.test.ts`), and what keeps this file small enough to read.
//
// THE FILTER IS A VIEW, NOT A SECOND READ. `clara.list_operator_support_queue` takes no arm
// parameter — it answers the whole estate's open cases, and `?kind=` narrows what is SHOWN. So a
// filter change costs no round trip and cannot produce a different authority answer; only
// `?settled=` changes the door's own argument, because the settled set is genuinely different
// rows.

import { useCallback, useEffect, useRef, useState } from "react";

import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  listOperatorSupportQueue,
  operatorQueueOutcome,
  type OperatorQueueOutcome,
  type SupportCaseKind,
  type SupportQueueRow,
} from "@/lib/operator/reads";

export type OperatorQueueState = {
  outcome: OperatorQueueOutcome;
  /** A LATER read is in flight while prior rows stay on screen — a label, never a blank flash. */
  refreshing: boolean;
  /** Every row the last successful read returned, BEFORE the arm filter — the capacity panel and
   *  the Sheet both address cases the filter may be hiding. `null` until a read has succeeded. */
  allRows: SupportQueueRow[] | null;
  reload: () => void;
};

export function useOperatorQueue({
  kind,
  settled,
}: {
  kind: SupportCaseKind | null;
  settled: boolean;
}): OperatorQueueState {
  const [rows, setRows] = useState<SupportQueueRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const settledRef = useRef(settled);
  settledRef.current = settled;
  // A monotonic epoch: only the LAST-STARTED read's result is ever committed, regardless of which
  // response returns first — the same guarantee `useActivityFeed` and `useHydratedPart` both name.
  const epochRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const reload = useCallback(async () => {
    const epoch = ++epochRef.current;
    if (hasLoadedOnceRef.current) setRefreshing(true);
    try {
      const page = await listOperatorSupportQueue(
        { includeSettled: settledRef.current },
        { session: sessionTokenAccessor },
      );
      if (epoch !== epochRef.current) return; // superseded by a later read
      hasLoadedOnceRef.current = true;
      setRows(page);
      setError(null);
    } catch (e: unknown) {
      if (epoch !== epochRef.current) return;
      // The ROWS are not cleared here, and that is deliberate: whether a failure keeps or clears
      // them is `operatorQueueOutcome`'s judgement (a permission loss clears, an ordinary failure
      // keeps), made once, in a pure function, with its own cells.
      setError(e);
    } finally {
      // UNCONDITIONAL — this call's own flag always clears when IT settles, whether or not a later
      // read has since moved the epoch on (the stuck-flag defect `useActivityFeed`'s review
      // finding 2 records).
      setRefreshing(false);
    }
  }, []);

  // `settled` is the ONLY axis that changes the door's argument, so it is the only dependency that
  // re-reads. `kind` narrows what is rendered, below.
  useEffect(() => {
    void reload();
  }, [settled, reload]);

  // LIVE PERMISSION LOSS.
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void reload();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [reload]);

  const shown = rows === null ? null : kind === null ? rows : rows.filter((r) => r.case_kind === kind);
  const outcome = operatorQueueOutcome({
    rows: shown,
    error,
    filtered: kind !== null || settled,
  });

  return { outcome, refreshing, allRows: rows, reload: () => void reload() };
}
