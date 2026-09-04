"use client";

// Client durable-interview controller. It polls the pinned /state surface,
// renders only confirmed plan/activity state, and delegates the complete
// GH #152 not_pending recovery to api.ts. No answer entry is ever appended
// locally: busy/disabled is the only in-flight indication.

import { useCallback, useEffect, useRef, useState } from "react";

import type { SessionTokenAccessor } from "@/lib/session";
import {
  answerInterview,
  cancelInterview,
  COMPLETE_OUTCOMES,
  getInterviewState,
  type CancelResult,
  type InterviewState,
  type PendingPark,
} from "./api";
import {
  appendUnique,
  foldActivityThread,
  promptEntry,
  seedThread,
  type AnswerEcho,
  type ThreadEntry,
} from "./thread";

export const TERMINAL_CHIPS = new Set(["complete", "cancelled", "expired", "ended"]);
export const POLL_MS = 3000;

export type RunErrorKind = "read" | "action";

export type RunError = {
  message: string;
  /** Monotonic per hook instance. A read may only clear errors that existed
   *  when that read began. */
  gen: number;
  kind: RunErrorKind;
  /** The park an answer failed to reach; null when no read can prove the
   *  action resolved. */
  heldAtPark: number | null;
};

/** May a successful read clear the current error?
 *
 *  Exactly two POSITIVE facts retire a park-bound action refusal, matching
 *  classifyDeliveryBody's delivered arms verbatim:
 *    - a terminal outcome in the shared COMPLETE_OUTCOMES set; or
 *    - a pending park at a STRICTLY HIGHER integer index.
 *
 *  Absence, a non-complete terminal, an equal/lower/malformed park, and a
 *  read that began before the error was raised never clear it. */
export function readClearsError(
  cur: RunError | null,
  genAtReadStart: number,
  s: Pick<InterviewState, "pendingPark" | "terminal">,
): boolean {
  if (!cur) return false;
  if (cur.gen > genAtReadStart) return false;
  if (cur.kind === "read") return true;
  if (cur.heldAtPark === null) return false;
  const outcome = s.terminal?.outcome;
  if (typeof outcome === "string") return COMPLETE_OUTCOMES.has(outcome);
  const idx = s.pendingPark?.parkIndex;
  return typeof idx === "number" && idx > cur.heldAtPark;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useInterviewRun(args: {
  session: SessionTokenAccessor;
  scope: "client";
  runId: string | null;
  planId: string;
  /** H-27 — how a durable plan item's stored answer becomes the "you" bubble's text. The
   *  interview card passes the i18n-backed formatter; omitted, `seedThread` falls back to
   *  `echoAnswer`'s translator-free rendering, which is still ordered `key: value` text and
   *  never a JSON blob. Read through a ref (the `sessionRef` discipline above), so a caller
   *  handing in a fresh closure every render cannot re-arm the poll. */
  echoAnswer?: AnswerEcho;
}) {
  const { session, scope, runId, planId } = args;
  const [state, setState] = useState<InterviewState | null>(null);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setErrorRecord] = useState<RunError | null>(null);

  const stateRef = useRef<InterviewState | null>(null);
  stateRef.current = state;
  const errorRef = useRef<RunError | null>(null);
  const genRef = useRef(0);

  // N3 (review round 1): the same sessionRef + primitive-dep discipline as
  // lib/parts/hooks.ts's useHydratedPart. `session` is read via this ref
  // everywhere below, written on every render, and dropped from every
  // useCallback's own dependency array — a caller that (against convention)
  // passes a fresh SessionTokenAccessor object every render can no longer
  // change `refresh`'s identity, which is what the poll effect below depends
  // on ([runId, refresh]); an unstable identity there would re-arm the
  // interval on every parent re-render, exactly the busy-poll class
  // hooks.ts was hardened against. Every call still resolves whichever
  // accessor is CURRENT at call time.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const echoRef = useRef(args.echoAnswer);
  echoRef.current = args.echoAnswer;

  const putError = useCallback((next: RunError | null) => {
    errorRef.current = next;
    setErrorRecord(next);
  }, []);

  /** A read failure never overwrites a live action refusal: the undelivered
   *  answer is the more important truth. */
  const raise = useCallback((message: string, kind: RunErrorKind, heldAtPark: number | null) => {
    if (kind === "read" && errorRef.current?.kind === "action") return;
    genRef.current += 1;
    putError({ message, gen: genRef.current, kind, heldAtPark });
  }, [putError]);

  /** Page-facing setter. A string is a park-less action refusal, so no later
   *  read may clear it; null is an explicit human/new-action dismissal. */
  const setError = useCallback((message: string | null) => {
    if (message === null) putError(null);
    else raise(message, "action", null);
  }, [putError, raise]);

  /** Rebuild from the latest authoritative read every time. This is the
   *  confirmed-only replacement for the dashboard's optimistic thread: a
   *  newly answered segment appears only after /state includes the durable
   *  item/activity echo. */
  const ingest = useCallback((s: InterviewState) => {
    setState(s);
    let next = foldActivityThread(seedThread(s.items, echoRef.current), s.activity);
    if (s.pendingPark) next = appendUnique(next, promptEntry(s.pendingPark));
    setThread(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!runId) return;
    const genAtReadStart = genRef.current;
    try {
      const s = await getInterviewState({ runId, scope, planId }, { session: sessionRef.current });
      ingest(s);
      if (readClearsError(errorRef.current, genAtReadStart, s)) putError(null);
    } catch (e) {
      raise(messageOf(e), "read", null);
    }
  }, [runId, scope, planId, ingest, putError, raise]);

  // A newly selected run begins from a blank hydrated view; no state from a
  // prior run is allowed to bleed across the identity boundary.
  useEffect(() => {
    setState(null);
    setThread([]);
    putError(null);
  }, [runId, putError]);

  // Fixed interval, reading terminal state through a ref so state refreshes do
  // not re-arm it. The timer clears itself at the first terminal observation.
  useEffect(() => {
    if (!runId) return;
    void refresh();
    const id = setInterval(() => {
      const current = stateRef.current;
      if (current && TERMINAL_CHIPS.has(current.chip)) {
        clearInterval(id);
        return;
      }
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [runId, refresh]);

  const submitAnswer = useCallback(async (park: PendingPark, text: string): Promise<boolean> => {
    if (!runId) return false;
    setBusy(true);
    putError(null);
    try {
      await answerInterview(
        { runId, scope, parkIndex: park.parkIndex, value: text, planId },
        { session: sessionRef.current },
      );
      await refresh();
      return true;
    } catch (e) {
      raise(messageOf(e), "action", park.parkIndex);
      return false;
    } finally {
      setBusy(false);
    }
  }, [runId, scope, planId, refresh, putError, raise]);

  /** First half of the two-step client cancellation. A 409 is normalized by
   *  cancelInterview into alreadyResolved and does not block the DB door. */
  const runtimeCancel = useCallback(async (park: PendingPark): Promise<CancelResult> => {
    if (!runId) return { delivered: false, alreadyResolved: true };
    return cancelInterview(
      { runId, scope, parkIndex: park.parkIndex, planId },
      { session: sessionRef.current },
    );
  }, [runId, scope, planId]);

  return {
    state,
    thread,
    busy,
    error: error?.message ?? null,
    setBusy,
    setError,
    refresh,
    submitAnswer,
    runtimeCancel,
  };
}
