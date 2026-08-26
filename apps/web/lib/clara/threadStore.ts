// The Clara thread store (P2-RAIL) — the ONE source of truth `ClaraRail` (docked) and
// the escalated full-screen thread page share, per the interaction law (Q2, "full-screen
// is the rail conversation enlarged, never a separate universe"). A plain module-level
// external store (React's `useSyncExternalStore` contract) rather than a Context
// provider: no provider needs to sit above either mount point, so this lane never has
// to touch a layout file to wire it up — a docked `<ClaraRail/>` and a full-screen
// `<ClaraFullScreenThread threadId="…"/>` mounted anywhere in the same tab read and
// write the exact same per-thread state.

import { applyClaraStreamEvent, initialClaraStreamState, type ClaraStreamState, type SseEvent } from "./stream";
import type { MessageRow } from "./api";

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
  pendingUserText: string | null;
  sendStatus: ClaraSendStatus;
  sendError: string | null;
  activeTaskId: string | null;
  stream: ClaraStreamState;
}

const emptyThreadState: ClaraThreadUiState = {
  messages: [],
  messagesLoaded: false,
  loadError: null,
  pendingUserText: null,
  sendStatus: "idle",
  sendError: null,
  activeTaskId: null,
  stream: initialClaraStreamState,
};

interface ClaraStoreState {
  railOpen: boolean;
  threads: Record<string, ClaraThreadUiState>;
}

let state: ClaraStoreState = { railOpen: true, threads: {} };
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

  /** Authoritative — replaces the whole message list from a fresh `getMessages` read,
   *  never merges. Clears `pendingUserText` (the DB row now stands in for it). */
  hydrateMessages(threadId: string, messages: MessageRow[]): void {
    setThread(threadId, { messages, messagesLoaded: true, loadError: null, pendingUserText: null });
  },

  hydrateFailed(threadId: string, message: string): void {
    setThread(threadId, { loadError: message });
  },

  beginSend(threadId: string): void {
    setThread(threadId, { sendStatus: "sending", sendError: null, pendingUserText: null });
  },

  markAccepted(threadId: string, taskId: string): void {
    setThread(threadId, { activeTaskId: taskId, stream: initialClaraStreamState });
  },

  /** The ONE place a turn becomes "sent" — call this only once the stream has actually
   *  opened (`openTaskStream`'s promise resolving), never on `postTurn`'s 202 alone. */
  markSent(threadId: string, text: string): void {
    setThread(threadId, { sendStatus: "sent", pendingUserText: text });
  },

  markSendFailed(threadId: string, message: string): void {
    setThread(threadId, { sendStatus: "error", sendError: message, activeTaskId: null });
  },

  applyStreamEvent(threadId: string, event: SseEvent): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    setThread(threadId, { stream: applyClaraStreamEvent(current.stream, event) });
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
    setThread(threadId, emptyThreadState);
  },
};
