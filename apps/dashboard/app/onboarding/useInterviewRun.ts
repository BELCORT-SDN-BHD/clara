"use client";

// The interview run controller (settled dashboard plan §3.1): polls GET /state (the pinned
// resume surface — the SSE stream is only a live nicety, so plumbing-grade polling is correct),
// maintains the append-only Activity thread (seeded from the durable plan items on resume, then
// grown as the park index advances), and delivers answers. A 409/not_pending on an answer is
// LOSSY (GH #152) and `answerInterview` owns its whole recovery — it re-reads /state, retries a
// genuinely-dropped answer once, and resolves when the park has in fact advanced — so anything
// that reaches THIS hook as an error is an undelivered answer and is surfaced, never swallowed.
// The two-step client cancel lives in the page; this hook exposes the runtime-cancel primitive.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getInterviewState, answerInterview, cancelInterview,
  type InterviewState, type InterviewScope, type PendingPark, type CancelResult,
} from "../shared/interviewApi";
import { seedThread, promptEntry, answerEntry, appendUnique, foldActivityThread, type ThreadEntry } from "./thread";

const TERMINAL_CHIPS = new Set(["complete", "cancelled", "expired", "ended"]);
const POLL_MS = 3000;

export function useInterviewRun(args: { token: string; scope: InterviewScope; runId: string | null; planId?: string | null }) {
  const { token, scope, runId, planId } = args;
  const [state, setState] = useState<InterviewState | null>(null);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);
  const stateRef = useRef<InterviewState | null>(null);
  stateRef.current = state;

  const ingest = useCallback((s: InterviewState) => {
    setState(s);
    // Seed the thread once from the durable plan items (client scope resume).
    if (!seededRef.current) {
      seededRef.current = true;
      const seed = seedThread(s.items);
      if (seed.length > 0) setThread((cur) => (cur.length === 0 ? seed : cur));
    }
    // F-M11: fold the pinned activity[] (firm-scope confirmed answers — no plan to seed from)
    // idempotently BEFORE appending the pending prompt, so a refresh restores the trail.
    if (s.activity.length > 0) setThread((cur) => foldActivityThread(cur, s.activity));
    // Append the current park's prompt (idempotent by park+phase id).
    if (s.pendingPark) setThread((cur) => appendUnique(cur, promptEntry(s.pendingPark as PendingPark)));
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !runId) return;
    try {
      const s = await getInterviewState(token, { runId, scope, planId });
      ingest(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, runId, scope, planId, ingest]);

  // Poll while the run is live. A fixed interval (not a state-dependent effect) — the terminal
  // check reads a ref so refresh churn never re-arms the interval (which would busy-poll).
  useEffect(() => {
    if (!token || !runId) return;
    void refresh();
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s && TERMINAL_CHIPS.has(s.chip)) return; // stop churning once terminal
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token, runId, refresh]);

  /** Deliver a free-text answer to the current park (optimistic bubble + POST). */
  const submitAnswer = useCallback(async (park: PendingPark, text: string) => {
    setBusy(true);
    setError(null);
    setThread((cur) => appendUnique(cur, answerEntry(park, text)));
    try {
      await answerInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, value: text, planId });
      await refresh();
    } catch (e) {
      // The lossy 409 was already disambiguated and retried inside answerInterview, so a throw
      // here means the answer is genuinely UNDELIVERED — surfaced, never swallowed as
      // "already delivered" (that swallow is how GH #152 hid in production for a whole wave).
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [token, runId, scope, planId, refresh]);

  /** Deliver a typed value (e.g. the firm create_firm receipt) without a text bubble. F-M10:
   *  returns whether delivery CONFIRMED — true once answerInterview resolves (on a 200, or on a
   *  lossy 409 only after a /state re-read PROVED the park advanced), false on a genuine
   *  failure, so the caller can retain its receipt and offer a retry without re-asking the
   *  admission token. A dropped receipt now reports false rather than a false-confirming true. */
  const deliverValue = useCallback(async (park: PendingPark, value: unknown, note?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    if (note) setThread((cur) => appendUnique(cur, { id: `sys:${park.parkIndex}`, role: "you", seg: park.seg, text: note }));
    try {
      await answerInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, value, planId });
      await refresh();
      return true;
    } catch (e) {
      // Genuinely undelivered (answerInterview already re-read /state and retried): report false
      // so the caller RETAINS its create_firm receipt for a manual retry.
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, runId, scope, planId, refresh]);

  /** Deliver a runtime cancel into the open park (the first half of the two-step client cancel;
   *  the whole verb for a firm run). A 409/not_pending is not an error (already resolved). */
  const runtimeCancel = useCallback(async (park: PendingPark): Promise<CancelResult> => {
    return cancelInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, planId });
  }, [token, runId, scope, planId]);

  return { state, thread, busy, error, setBusy, setError, refresh, submitAnswer, deliverValue, runtimeCancel };
}
