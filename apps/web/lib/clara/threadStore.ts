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
  /** #630 (round-5 finding [6]) — TRUE once the run poll has given up on a turn it can no longer
   *  see. Not "the turn ended": the poll stops after `CLARA_RUN_POLL_MISS_LIMIT` reads that
   *  found no visible row (RLS, a transient, a stale id), and the honest statement is that this
   *  TAB lost sight of it, not that the run is over. It exists because the alternative round 4
   *  shipped was silence: the poll stopped asking and wrote nothing, so the Stop control and the
   *  clock stayed mounted for the life of the mount over a turn nothing could observe. */
  turnLostSight: boolean;
  stream: ClaraStreamState;
}

/** #630 — see `registerStreamAbort` below. Module-level and NON-reactive on purpose. */
const streamAborts = new Map<string, AbortController>();

/** #630 — see `markTurnStopped` below. Task ids a door has already ended, bounded. */
const stoppedTurns = new Set<string>();

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
  turnLostSight: false,
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
  /** #614 A7 — the unsent composer draft, keyed by conversation identity
   *  `(altitude, threadId)`, NESTED (not a flattened composite string) so a
   *  wholesale purge of one threadId (`reset` below) can walk every altitude's
   *  inner map without parsing a key back apart.
   *
   *  BOTH HALVES OF THE KEY MATTER, and the altitude half is not redundant with
   *  the thread half just because a real thread belongs to exactly one
   *  altitude in production. `ClaraThreadView` (the full-screen mount) can flip
   *  `clientId` as a bare PROP CHANGE with the SAME `threadId` still resolving —
   *  see its own `attachments` reset effect's header for the identical hazard
   *  measured for the attachment tray — and a draft keyed by threadId alone
   *  would ride that change straight over the scope boundary A7 exists to draw.
   *  Memory-only: no localStorage, no reload recovery promised. */
  drafts: Record<string, Record<string, string>>;
}

let state: ClaraStoreState = {
  railOpen: true,
  composerFocusRequest: null,
  threads: {},
  selectedByAltitude: {},
  drafts: {},
};
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

  /** #614 A7 — the composer draft for one conversation. `""` for a key that has
   *  never been written, same honest-default shape as `getThread`. */
  getDraft(altitude: string, threadId: string): string {
    return state.drafts[altitude]?.[threadId] ?? "";
  },

  /** Fires `emit()` only on an actual change, matching `selectThreadForAltitude`'s
   *  own guard — a mounted view's `useSyncExternalStore` re-render is cheap but not
   *  free, and every keystroke calls this. */
  setDraft(altitude: string, threadId: string, text: string): void {
    if ((state.drafts[altitude]?.[threadId] ?? "") === text) return;
    state = {
      ...state,
      drafts: { ...state.drafts, [altitude]: { ...state.drafts[altitude], [threadId]: text } },
    };
    emit();
  },

  /** The ONE place a submitted draft is forgotten — call this only after a send
   *  actually opened its stream (the same authority `markSent` waits for), never
   *  on `postTurn`'s 202 alone: a turn the runtime refused must leave the human's
   *  text right where they can still fix and resend it. */
  clearDraft(altitude: string, threadId: string): void {
    if (!(threadId in (state.drafts[altitude] ?? {}))) return;
    const forAltitude = { ...state.drafts[altitude] };
    delete forAltitude[threadId];
    state = { ...state, drafts: { ...state.drafts, [altitude]: forAltitude } };
    emit();
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
    // #630 — a NEW turn is never the one this tab lost sight of.
    setThread(threadId, { turnLostSight: false });
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
      setThread(threadId, {
        turnStartedAt: null, turnStatus: null, parkedClarify: null, turnLostSight: false,
      });
      return;
    }
    // #630 — SEEING THE ROW IS THE END OF HAVING LOST SIGHT OF IT. A reload (or a poll that starts
    // answering again) is exactly the re-check the give-up line asks the reader for, so the state
    // it set is cleared by the read that succeeds rather than left for someone to clear by hand.
    setThread(threadId, {
      activeTaskId: run.taskId,
      turnStartedAt: run.startedAt,
      turnStatus: run.status,
      parkedClarify,
      turnLostSight: false,
    });
  },

  /** The ONE place a turn becomes "sent" — call this once the stream has actually opened
   *  (`openTaskStream`'s promise resolving), never on `postTurn`'s 202 alone.
   *
   *  #630 — WITH ONE NAMED EXCEPTION: A TURN THE PERSON STOPPED. A stop pressed between acceptance
   *  and the first byte means no stream will EVER open for a turn the runtime has already taken and
   *  recorded. Waiting for an authority that is not coming left the composer disabled for the life
   *  of the mount, so `useClaraThread`'s two stop paths call this themselves — and they are the only
   *  callers that may, because they are the only ones holding `postTurn`'s acceptance in hand. */
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

  /** #630 — THE TURN CLOCK RETIRES WHEN A DOOR SAYS THE TURN IS OVER. `hydrateRun(null)`, a
   *  terminal `message` and `markSendFailed` were the only writers of `turnStartedAt: null`, and a
   *  manual stop calls none of them: an abort never transitions `stream.status` away from
   *  "streaming", so the DB poll that could have noticed is gated off and the elapsed-time line
   *  kept counting under the "Stopped" marker for the life of the mount — and, because this store
   *  is global, across a navigation away and back.
   *
   *  IT KEEPS `activeTaskId` AND THE STREAM BUFFER, deliberately. A stopped reply is still what
   *  Clara said: the partial prose stays on screen, and the task id stays so a re-read can still
   *  ask the database about the turn that was stopped. Only the two things that ASSERT the turn is
   *  still running are dropped. */
  markTurnStopped(threadId: string, taskId?: string | null): void {
    if (taskId) {
      // A BOUNDED MEMORY OF WHICH TURNS A DOOR HAS ALREADY ENDED. `sendMessage` fires a
      // `readRunByTaskId` hydrate and does not await it; a stop that settles while that read is in
      // flight would otherwise be overwritten by `{status:'running', startedAt}` — a clock started
      // on a turn the same surface has just declared stopped. Held here, not in the hook, because
      // the press may come from a rail that was closed and reopened.
      if (stoppedTurns.size >= 128) stoppedTurns.clear();
      stoppedTurns.add(taskId);
    }
    setThread(threadId, { turnStartedAt: null, turnStatus: null });
  },

  /** Has a door already ended this turn? Read by the fire-and-forget run hydrate above. */
  wasTurnStopped(taskId: string): boolean {
    return stoppedTurns.has(taskId);
  },

  /** #630 (round-5 finding [6]) — THE RUN POLL HAS STOPPED ASKING, and the surface says so.
   *
   *  After `CLARA_RUN_POLL_MISS_LIMIT` reads that found no visible row the poll gives up. What it
   *  leaves behind used to be the LAST REAL READ — `running`, with a start time — so the Stop
   *  control stayed offered and the clock kept counting, for the life of the mount, about a turn
   *  this tab had provably stopped being able to observe. Pressing Stop then reached the door,
   *  got CLR11, and printed a claim about a reply nobody here could see.
   *
   *  IT IS NOT `markTurnStopped`, and deliberately does not join `stoppedTurns`: no door ended
   *  this turn, and a remount that CAN see the row again must get its clock back. That is what
   *  the line's own copy tells the reader to do.
   *
   *  Everything that is still true is kept: the task id, the stream buffer, and the parked
   *  question. Only the two facts that ASSERT a live run are dropped. */
  markRunUnobservable(threadId: string): void {
    setThread(threadId, { turnStartedAt: null, turnStatus: null, turnLostSight: true });
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

  /** #630 (round-6 finding [5]) — THE RE-ATTACH AFTER A REFUSED STOP COULD NOT OPEN.
   *
   *  Same state as `markStreamEndedUnexpectedly` above, MINUS the buffer wipe, and the difference
   *  is whether another attach is coming. That method serves `runClaraTaskStream`'s reconnect
   *  loop, which replays the run's readable from index 0 — keeping the old chunks there would
   *  print the reply so far twice. `useClaraThread`'s refused-stop arm has no next attach at all
   *  (`runClaraTaskStream` never retries an attach FAILURE, only detaches), so `provisionalChunks`
   *  is simply the last true record of what reached this tab — including the parked clarify parts
   *  `foldLiveClarifyParts` renders the question and its Answer control from. Emptying it left the
   *  run parked on a question the surface no longer offered any way to answer. */
  markReattachFailed(threadId: string): void {
    const current = state.threads[threadId] ?? emptyThreadState;
    setThread(threadId, {
      stream: { ...current.stream, status: "detached", streamEndedUnexpectedly: true },
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

  // -------------------------------------------------------------------------------------------
  // #630 — THE LIVE SSE READ'S ABORT HANDLE, KEYED BY TASK ID AND HELD HERE RATHER THAN IN THE
  // HOOK.
  //
  // `ClaraRail` genuinely UNMOUNTS `ClaraThreadView` when the exit transition finishes, and the
  // hook deliberately does not abort on unmount — closing the rail must not stop the reply. But a
  // per-instance `useRef` died with that unmount, so a reopened rail held a fresh null controller
  // while the FIRST mount's read was still streaming into this store: pressing Stop then aborted
  // nothing, and assistant chunks kept appending under a marker that said the reply was stopped.
  //
  // DELIBERATELY NOT PART OF `ClaraThreadUiState` and deliberately not reactive: an
  // `AbortController` is a handle, not something a render reads, and putting it in the subscribed
  // state would re-render every consumer each time a stream opens. It is keyed by TASK id, not by
  // thread, because the thing being aborted is one turn's read.
  // -------------------------------------------------------------------------------------------
  registerStreamAbort(taskId: string, controller: AbortController): void {
    streamAborts.set(taskId, controller);
  },

  /** Forget the handle for a read that has ended on its own. Never aborts. */
  releaseStreamAbort(taskId: string, controller: AbortController): void {
    if (streamAborts.get(taskId) === controller) streamAborts.delete(taskId);
  },

  /** Abort the live read for one task, whichever mount opened it. Returns true when there WAS one
   *  — a caller that needs to know whether "the read stops first" actually stopped anything. */
  abortStream(taskId: string): boolean {
    const controller = streamAborts.get(taskId);
    if (!controller) return false;
    streamAborts.delete(taskId);
    controller.abort();
    return true;
  },

  /** #614 A7 — ALSO forgets this threadId's draft, in every altitude it might be
   *  filed under (see `drafts`'s own header for why the key is nested by
   *  altitude at all). A wholesale "forget this thread" that left a draft
   *  behind would be the one call in this store a test can no longer use to
   *  get back to a clean slate — the exact isolation `composer-keyboard.test.tsx`
   *  leans on between its five cells, all against the same threadId. */
  reset(threadId: string): void {
    const draftAltitudes = Object.keys(state.drafts).filter((altitude) => threadId in state.drafts[altitude]!);
    if (!(threadId in state.threads) && draftAltitudes.length === 0) return;
    const threads = { ...state.threads };
    delete threads[threadId];
    const drafts = { ...state.drafts };
    for (const altitude of draftAltitudes) {
      const forAltitude = { ...drafts[altitude] };
      delete forAltitude[threadId];
      drafts[altitude] = forAltitude;
    }
    state = { ...state, threads, drafts };
    emit();
  },
};
