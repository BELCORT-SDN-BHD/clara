"use client";

// The interview run controller (settled dashboard plan §3.1): polls GET /state (the pinned
// resume surface — the SSE stream is only a live nicety, so plumbing-grade polling is correct),
// maintains the append-only Activity thread (seeded from the durable plan items on resume, then
// grown as the park index advances), and delivers answers. A 409/not_pending on an answer is
// LOSSY (GH #152) and `answerInterview` owns its whole recovery — it re-reads /state, retries a
// genuinely-dropped answer once, and resolves when the park has in fact advanced — so anything
// that reaches THIS hook as an error is an undelivered answer and is surfaced, never swallowed.
// The two-step client cancel lives in the page; this hook exposes the runtime-cancel primitive.
//
// AND SURFACING IT IS ONLY HALF THE JOB — IT HAS TO SURVIVE (the §3.1 poller's own hazard).
// A refusal and a background poll are two writers of one field. The poll's success path used to
// end in an unconditional clear, so a genuine refusal raised at t+0 was wiped by the next tick
// ~3s later: the human saw it flash and vanish, which is functionally the swallow GH #152 was
// about. So the error is no longer a bare string — it carries WHO raised it, WHAT would prove it
// gone, and a monotonic GENERATION, and only a read that can honestly disprove it may clear it
// (`readClearsError`). No lifetime here depends on the poll interval.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getInterviewState, answerInterview, cancelInterview, COMPLETE_OUTCOMES,
  type InterviewState, type InterviewScope, type PendingPark, type CancelResult,
} from "../shared/interviewApi";
import { seedThread, promptEntry, answerEntry, appendUnique, foldActivityThread, type ThreadEntry } from "./thread";

const TERMINAL_CHIPS = new Set(["complete", "cancelled", "expired", "ended"]);
const POLL_MS = 3000;

// ---------------------------------------------------------------------------
// Error lifetime — the discipline that keeps a refusal alive (thread.ts's precedent: the
// hook's non-trivial state rules live in named, pure, testable neighbours).
// ---------------------------------------------------------------------------

/** Why the error was raised, which fixes what could disprove it.
 *  · `read`   — a /state read itself failed (transport). A later SUCCESSFUL read disproves it
 *               outright, so a transient network refusal never sticks.
 *  · `action` — a user-initiated verb failed. Nothing about a healthy /state read disproves
 *               "your answer did not land", so a read clears it only on POSITIVE evidence that
 *               the run moved past the park the answer was aimed at — a strictly higher park
 *               index, or a complete-class terminal. See `readClearsError`. */
export type RunErrorKind = "read" | "action";

export type RunError = {
  message: string;
  /** Monotonic per hook instance, bumped on every raise. A poll compares this against the
   *  generation it captured when its own read STARTED — an error raised while that read was in
   *  flight is newer than anything the read could know about, so the read may not clear it. */
  gen: number;
  kind: RunErrorKind;
  /** The park an answer failed to reach; null when no read can prove resolution (a plain
   *  transport failure, or a refusal a page raised through `setError`). */
  heldAtPark: number | null;
};

/** May a poll whose read started at generation `genAtReadStart`, and which returned `s`, clear
 *  `cur`? The whole lifetime rule, in one pure predicate.
 *
 *  IT CLEARS ONLY ON POSITIVE EVIDENCE (the ADR-059 armour law: absence is not evidence, and a
 *  derived state is not evidence). An earlier version cleared a park-bound refusal whenever the
 *  read's park index merely DIFFERED from the held one — which `pendingPark: null` satisfies, so
 *  every confirmed segment, every terminal including a CANCELLED one, an unreadable park marker
 *  and a `{}` body all wiped the refusal. That is the three-second swallow again, wearing a
 *  guard's clothes.
 *
 *  So exactly two facts retire a park-bound refusal, and they are `classifyDeliveryBody`'s own
 *  delivered arms, verbatim:
 *    · a terminal whose outcome is in the SHARED `COMPLETE_OUTCOMES` set (the run reached its
 *      intended end — checked first, so a stale park cannot outvote a run that has ended), or
 *    · a pending park at a STRICTLY HIGHER integer index (the run moved past where we aimed).
 *  Everything else leaves the banner standing: an absent park, a non-complete terminal
 *  (cancelled / expired / ended / malformed outcome), a non-integer index, a lower index, no
 *  evidence at all. Sharing `COMPLETE_OUTCOMES` with the wire client is what keeps the hook and
 *  `answerInterview` from drifting into two different opinions about what delivery means.
 *
 *  The terminal arm is REQUIRED, not a nicety: a normally-completed run reports no pending park
 *  forever and the poller stops on the terminal chip, so without it a refusal held at a park
 *  could never be retired by any read at all. */
export function readClearsError(
  cur: RunError | null,
  genAtReadStart: number,
  s: Pick<InterviewState, "pendingPark" | "terminal">,
): boolean {
  if (!cur) return false;
  if (cur.gen > genAtReadStart) return false; // raised after this read began — it knows nothing of it
  if (cur.kind === "read") return true;
  if (cur.heldAtPark === null) return false;  // an action refusal no read can speak to
  const outcome = s.terminal?.outcome;
  if (typeof outcome === "string") return COMPLETE_OUTCOMES.has(outcome);
  const idx = s.pendingPark?.parkIndex;
  return typeof idx === "number" && idx > cur.heldAtPark;
}

export function useInterviewRun(args: { token: string; scope: InterviewScope; runId: string | null; planId?: string | null }) {
  const { token, scope, runId, planId } = args;
  const [state, setState] = useState<InterviewState | null>(null);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setErrorRecord] = useState<RunError | null>(null);
  const seededRef = useRef(false);
  const stateRef = useRef<InterviewState | null>(null);
  stateRef.current = state;
  // The error is mirrored into a ref (and the generation kept in one) because every decision
  // about it is taken inside an async closure that would otherwise read a render-stale copy —
  // the poll guard has to compare the generation as it is NOW, not as it was when the read began.
  const errorRef = useRef<RunError | null>(null);
  const genRef = useRef(0);

  const putError = useCallback((next: RunError | null) => {
    errorRef.current = next;
    setErrorRecord(next);
  }, []);

  /** Raise a refusal at a fresh generation, so no poll already in flight can clear it.
   *  A transport failure never overwrites a live ACTION refusal: the undelivered answer is the
   *  more important truth, and letting the poller overwrite it would restore the wipe by another
   *  route (the read error would then be cleared by the next good read, taking the refusal with
   *  it). */
  const raise = useCallback((message: string, kind: RunErrorKind, heldAtPark: number | null) => {
    if (kind === "read" && errorRef.current?.kind === "action") return;
    genRef.current += 1;
    putError({ message, gen: genRef.current, kind, heldAtPark });
  }, [putError]);

  /** The page-facing setter, signature unchanged. A string is a user-initiated refusal raised
   *  OUTSIDE this hook — an action error with no park to disprove it, so it stands until the
   *  human acts; null is the dismiss / the human is acting again.
   *
   *  Its callers are exactly the two CANCEL paths: the firm page's cancel failure
   *  (firm/page.tsx), and the client page's cancel-reason-required, its pre-attempt clear, and
   *  its cancel failure (client/page.tsx). NOT create_firm — FirmCommitForm keeps its own local
   *  `useState` error for the commit call, and the create_firm RECEIPT's delivery failure reaches
   *  this hook through `deliverValue` → `raise(..., "action", park.parkIndex)`, i.e. the
   *  park-BOUND path, which a later read CAN retire. Only the park-less refusals arrive here. */
  const setError = useCallback((message: string | null) => {
    if (message === null) putError(null);
    else raise(message, "action", null);
  }, [putError, raise]);

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
    // The guard's anchor: the generation as of the instant THIS read starts. Whatever the read
    // comes back with, it can only speak to errors that already existed when it left.
    const genAtReadStart = genRef.current;
    try {
      const s = await getInterviewState(token, { runId, scope, planId });
      ingest(s);
      if (readClearsError(errorRef.current, genAtReadStart, s)) putError(null);
    } catch (e) {
      raise((e as Error).message, "read", null);
    }
  }, [token, runId, scope, planId, ingest, putError, raise]);

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
    putError(null); // the human is acting again — their own retry clears the board
    setThread((cur) => appendUnique(cur, answerEntry(park, text)));
    try {
      await answerInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, value: text, planId });
      await refresh();
    } catch (e) {
      // The lossy 409 was already disambiguated and retried inside answerInterview, so a throw
      // here means the answer is genuinely UNDELIVERED — surfaced, never swallowed as
      // "already delivered" (that swallow is how GH #152 hid in production for a whole wave).
      // Held at THIS park: only a read showing the run has left it may take the refusal away.
      raise((e as Error).message, "action", park.parkIndex);
    } finally {
      setBusy(false);
    }
  }, [token, runId, scope, planId, refresh, putError, raise]);

  /** Deliver a typed value (e.g. the firm create_firm receipt) without a text bubble. F-M10:
   *  returns whether delivery CONFIRMED — true once answerInterview resolves (on a 200, or on a
   *  lossy 409 only after a /state re-read PROVED the park advanced), false on a genuine
   *  failure, so the caller can retain its receipt and offer a retry without re-asking the
   *  admission token. A dropped receipt now reports false rather than a false-confirming true. */
  const deliverValue = useCallback(async (park: PendingPark, value: unknown, note?: string): Promise<boolean> => {
    setBusy(true);
    putError(null);
    if (note) setThread((cur) => appendUnique(cur, { id: `sys:${park.parkIndex}`, role: "you", seg: park.seg, text: note }));
    try {
      await answerInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, value, planId });
      await refresh();
      return true;
    } catch (e) {
      // Genuinely undelivered (answerInterview already re-read /state and retried): report false
      // so the caller RETAINS its create_firm receipt for a manual retry — and hold the refusal
      // at this park so the retry affordance is still on screen when the human reaches for it.
      raise((e as Error).message, "action", park.parkIndex);
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, runId, scope, planId, refresh, putError, raise]);

  /** Deliver a runtime cancel into the open park (the first half of the two-step client cancel;
   *  the whole verb for a firm run). A 409/not_pending is not an error (already resolved). */
  const runtimeCancel = useCallback(async (park: PendingPark): Promise<CancelResult> => {
    return cancelInterview(token, { runId: runId!, scope, parkIndex: park.parkIndex, planId });
  }, [token, runId, scope, planId]);

  // `error` stays a plain string for the views — the lifetime bookkeeping is this hook's business.
  return { state, thread, busy, error: error?.message ?? null, setBusy, setError, refresh, submitAnswer, deliverValue, runtimeCancel };
}
