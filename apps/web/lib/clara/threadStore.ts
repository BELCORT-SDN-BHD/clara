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

  reset(threadId: string): void {
    setThread(threadId, emptyThreadState);
  },
};
