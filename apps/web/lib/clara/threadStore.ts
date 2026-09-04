// The Clara thread store (P2-RAIL) — the ONE source of truth `ClaraRail` (docked) and
// the escalated full-screen thread page share, per the interaction law (Q2, "full-screen
// is the rail conversation enlarged, never a separate universe"). A plain module-level
// external store (React's `useSyncExternalStore` contract) rather than a Context
// provider: no provider needs to sit above either mount point, so this lane never has
// to touch a layout file to wire it up — a docked `<ClaraRail/>` and a full-screen
// `<ClaraFullScreenThread threadId="…"/>` mounted anywhere in the same tab read and
// write the exact same per-thread state.

import { applyClaraStreamEvent, initialClaraStreamState, type ClaraStreamState, type SseEvent } from "./stream";
import type { ClaraPart, MessageRow } from "./api";
import type { LiveClarifyPart } from "./liveClarify";

export type ClaraSendStatus = "idle" | "sending" | "sent" | "error";

export interface ClaraThreadUiState {
  messages: MessageRow[];
  messagesLoaded: boolean;
  /** Set when the initial (or a refetch) `getMessages` read failed — e.g. "not signed
   *  in". Kept separate from `sendError` so a load failure and a send failure never get
   *  conflated into one banner. */
  loadError: string | null;
  /** The text just sent, shown as a distinct pending bubble from the moment the stream
   *  opens (never before — no optimistic rendering of turn success) until the next
   *  authoritative `hydrateMessages` replaces it with the DB's own row. */
  pendingUserParts: ClaraPart[] | null;
  sendStatus: ClaraSendStatus;
  sendError: string | null;
  activeTaskId: string | null;
  /** 裁-132 — `clara.agent_tasks_visible.created_at` for `activeTaskId`, the RUNTIME's own
   *  record of when this turn began. The elapsed-time indicator counts from this and from
   *  nothing else; a turn whose start has not been read yet shows no elapsed time rather
   *  than one measured from when this tab happened to render. */
  turnStartedAt: string | null;
  /** The DB's own status for `activeTaskId` at the last read — `awaiting_input` is what
   *  distinguishes "Clara is working" from "Clara is waiting on you" after a reload. */
  turnStatus: string | null;
  /** The parked question, REHYDRATED from `clara.agent_interruptions` rather than folded
   *  out of the live SSE buffer. A reload discards `stream.provisionalChunks`, so without
   *  this the question Clara is parked on disappears from the thread while the run itself
   *  is still waiting for it. Cleared the moment the live stream carries the same question
   *  (`ClaraThreadView` prefers the live fold) and on every terminal `message`. */
  parkedClarify: LiveClarifyPart | null;
  stream: ClaraStreamState;
}

const emptyThreadState: ClaraThreadUiState = {
  messages: [],
  messagesLoaded: false,
  loadError: null,
  pendingUserParts: null,
  sendStatus: "idle",
  sendError: null,
  activeTaskId: null,
  turnStartedAt: null,
  turnStatus: null,
  parkedClarify: null,
  stream: initialClaraStreamState,
};

/** P2 FOLD SEAM C: a one-shot signal for "focus the rail's composer", not keyed to
 *  any thread — the ⌘K emitter (`lib/command/bus.ts`) has no thread context, only
 *  whichever thread the rail itself resolves. `token` increments on every request so
 *  a subscriber (ClaraThreadView) can tell a fresh request from a stale one even if
 *  `prefill` repeats the same text twice in a row. */
export interface ComposerFocusRequest {
  token: number;
  prefill: string | null;
}

interface ClaraStoreState {
  railOpen: boolean;
  composerFocusRequest: ComposerFocusRequest | null;
  threads: Record<string, ClaraThreadUiState>;
  /** 裁-117 — THE HUMAN'S EXPLICIT THREAD CHOICE, per altitude (`clientId`, or
   *  "firm"). Until the thread menu shipped, `useActiveThreadId` had no setter at
   *  all: the rail resolved the newest own session for the altitude and there was
   *  no way to reach any other one, so a switcher had nowhere to write.
   *
   *  KEYED BY ALTITUDE, NOT BY THREAD, and the two are genuinely different maps:
   *  `threads` above holds per-CONVERSATION state (transcript, stream, run clock)
   *  and a selection is per-PLACE — which conversation this altitude is currently
   *  showing. Keeping the selection here rather than in `threads` is also what
   *  lets a new thread be selected without touching the outgoing thread's entry,
   *  which `useActiveThread.ts:52-73` records must never be deleted while a live
   *  SSE turn is writing into it. */
  selectedByAltitude: Record<string, string>;
}

let state: ClaraStoreState = { railOpen: true, composerFocusRequest: null, threads: {}, selectedByAltitude: {} };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setThread(threadId: string, patch: Partial<ClaraThreadUiState>): void {
  const current = state.threads[threadId] ?? emptyThreadState;
  state = { ...state, threads: { ...state.threads, [threadId]: { ...current, ...patch } } };
  emit();
}

export const claraThreadStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getThread(threadId: string): ClaraThreadUiState {
    return state.threads[threadId] ?? emptyThreadState;
  },

  isRailOpen(): boolean {
    return state.railOpen;
  },

  setRailOpen(open: boolean): void {
    state = { ...state, railOpen: open };
    emit();
  },

  /** P2 FOLD SEAM C: the ⌘K "Ask" -> rail composer handoff. Bumps `token` so the
   *  composer's effect fires even when `prefill` repeats. Does NOT open the rail —
   *  the caller (`ClaraRail`'s event subscriber) owns that decision explicitly. */
  requestComposerFocus(prefill: string | null): void {
    const current = state.composerFocusRequest;
    state = { ...state, composerFocusRequest: { token: (current?.token ?? 0) + 1, prefill } };
    emit();
  },

  getComposerFocusRequest(): ComposerFocusRequest | null {
    return state.composerFocusRequest;
  },

  /** 裁-117 — record the human's explicit thread choice for one altitude. The
   *  resolver consults this BEFORE falling back to the newest own session, so a
   *  switch survives a re-render and a navigation back to the same altitude
   *  within the tab. It writes nothing to `threads`: selecting away from a thread
   *  must never disturb a turn still streaming into it. */
  selectThreadForAltitude(altitude: string, threadId: string): void {
    if (state.selectedByAltitude[altitude] === threadId) return;
    state = { ...state, selectedByAltitude: { ...state.selectedByAltitude, [altitude]: threadId } };
    emit();
  },

  /** `null` when this altitude has no explicit choice — the resolver then falls
   *  back to the newest own session, which is the pre-menu behaviour unchanged. */
  getSelectedThreadForAltitude(altitude: string): string | null {
    return state.selectedByAltitude[altitude] ?? null;
  },

  /** Authoritative — replaces the whole message list from a fresh `getMessages` read,
   *  never merges. Clears `pendingUserParts` (the DB row now stands in for it). */
  hydrateMessages(threadId: string, messages: MessageRow[]): void {
    setThread(threadId, { messages, messagesLoaded: true, loadError: null, pendingUserParts: null });
  },

  hydrateFailed(threadId: string, message: string): void {
    setThread(threadId, { loadError: message });
  },

  /** Clears a standing load failure so the retry affordance's own read starts from the
   *  LOADING arm rather than rendering the old error underneath a fresh attempt. Deliberately
   *  does NOT touch `messages`/`messagesLoaded`: a retry after a SUCCESSFUL first load (a
   *  later refetch that failed) must keep the transcript the human is reading on screen. */
  beginLoadRetry(threadId: string): void {
    setThread(threadId, { loadError: null });
  },

  beginSend(threadId: string): void {
    setThread(threadId, { sendStatus: "sending", sendError: null, pendingUserParts: null });
  },

  markAccepted(threadId: string, taskId: string): void {
    setThread(threadId, {
      activeTaskId: taskId,
      // The new turn's start is not known until the DB is asked for it (`hydrateRun`).
      // Carrying the PREVIOUS turn's `created_at` forward would time this turn from the
      // last one's clock — a wrong number rendered as a fact.
      turnStartedAt: null,
      turnStatus: null,
      parkedClarify: null,
      stream: initialClaraStreamState,
    });
  },

  /** 裁-132 + the parked-clarify rehydration: the DB's own answer about this thread's live
   *  run. `null` means the read saw no non-terminal task — the honest "no turn in flight"
   *  state, which also clears any parked question that has since been answered elsewhere. */
  hydrateRun(
    threadId: string,
    run: { taskId: string; status: string; startedAt: string } | null,
    parkedClarify: LiveClarifyPart | null,
  ): void {
    if (run === null) {
      setThread(threadId, { turnStartedAt: null, turnStatus: null, parkedClarify: null });
      return;
    }
    setThread(threadId, {
      activeTaskId: run.taskId,
      turnStartedAt: run.startedAt,
      turnStatus: run.status,
      parkedClarify,
    });
  },

  /** The ONE place a turn becomes "sent" — call this only once the stream has actually
   *  opened (`openTaskStream`'s promise resolving), never on `postTurn`'s 202 alone. */
  markSent(threadId: string, parts: ClaraPart[]): void {
    setThread(threadId, { sendStatus: "sent", pendingUserParts: parts });
  },

  markSendFailed(threadId: string, message: string): void {
    setThread(threadId, {
      sendStatus: "error",
      sendError: message,
      activeTaskId: null,
      turnStartedAt: null,
      turnStatus: null,
    });
  },

  applyStreamEvent(threadId: string, event: SseEvent): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    const stream = applyClaraStreamEvent(current.stream, event);
    // A terminal `message` IS the authority that the turn ended (./stream.ts's header), so
    // the rehydrated parked question and the turn clock retire with it — the same wholesale
    // discard `applyClaraStreamEvent` already performs on `provisionalChunks`. Leaving them
    // would keep an answered question on screen with a still-ticking timer behind it.
    const settled = event.event === "message";
    setThread(threadId, settled
      ? { stream, parkedClarify: null, turnStartedAt: null, turnStatus: null }
      : { stream });
  },

  /** FIX 1 — fires right before each backoff sleep. Surfaces the attempt count via
   *  the SAME "detached" status the UI already renders as "reconnecting" (an
   *  explicit `detached` event already set that status via `applyStreamEvent`; an
   *  ungraceful close sets it itself via `markStreamEndedUnexpectedly` below). */
  markReconnectAttempt(threadId: string, attempt: number): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    setThread(threadId, { stream: { ...current.stream, status: "detached", reconnectAttempt: attempt } });
  },

  /** FIX 2 — an attach's body ended with no message/done/detached at all. Distinct
   *  from an explicit `detached`: no SSE event carried this, so nothing else sets the
   *  "reconnecting" status or clears the stale provisional buffer for it. */
  markStreamEndedUnexpectedly(threadId: string): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    setThread(threadId, {
      stream: { ...current.stream, status: "detached", streamEndedUnexpectedly: true, provisionalChunks: [] },
    });
  },

  /** FIX 1 — the give-up ceiling was reached. Reattaching has stopped; only a manual
   *  retry (`beginRetry` + a fresh `runClaraTaskStream`) can resume it. */
  markConnectionLost(threadId: string): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    setThread(threadId, { stream: { ...current.stream, status: "connection-lost", retryAvailable: true } });
  },

  /** Clears a given-up stream back to a fresh attach's starting state, for the manual
   *  "retry" affordance to build its `runClaraTaskStream` call on top of. */
  beginRetry(threadId: string): void {
    setThread(threadId, { stream: initialClaraStreamState });
  },

  reset(threadId: string): void {
    if (!(threadId in state.threads)) return;
    const threads = { ...state.threads };
    delete threads[threadId];
    state = { ...state, threads };
    emit();
  },
};
