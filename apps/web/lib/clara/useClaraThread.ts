"use client";

// React bindings for the Clara thread store (P2-RAIL). `useClaraThread` is the one
// place the full turn lifecycle is wired end to end: postTurn -> (only once the SSE
// stream actually opens) mark the turn "sent" -> stream events into the store -> on the
// terminal `message`, refetch `getMessages` for the authoritative transcript (never
// hand-assemble the user's own row from what we assume we sent — the DB is asked).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { onFocusRail } from "@/lib/command/bus";

import { cancelAgentTask } from "@/lib/coding/doors";

import { getMessages, postTurn, resolveStreamAuth } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";
import { runClaraTaskStream } from "./stream";
import { claraThreadStore, type ClaraThreadUiState, type ComposerFocusRequest } from "./threadStore";
import { readRunByTaskId, readThreadRunSnapshot } from "./turnRun";
import type { AttachmentPart, ClaraPart } from "@/lib/parts/types";

export function useClaraRailOpen(): boolean {
  return useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.isRailOpen(),
    () => claraThreadStore.isRailOpen(),
  );
}

/** P2 FOLD SEAM C: `ClaraThreadView`'s side of the ⌘K "Ask" -> composer handoff —
 *  see `useFocusRailSubscription` below for the emitting side. */
export function useComposerFocusRequest(): ComposerFocusRequest | null {
  return useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.getComposerFocusRequest(),
    () => claraThreadStore.getComposerFocusRequest(),
  );
}

/** P2 FOLD SEAM C: subscribes to ⌘K's "Ask" row (`lib/command/bus.ts`'s
 *  `CLARA_FOCUS_RAIL_EVENT` contract) — mounted from `ClaraRail`. The palette never
 *  converses itself; selecting "Ask" is meant to do exactly what clicking straight
 *  into the rail's own composer would: open the rail and hand it focus (+ the typed
 *  text to review, never to auto-send — sending stays the human's act). */
export function useFocusRailSubscription(): void {
  useEffect(() => {
    return onFocusRail((detail) => {
      claraThreadStore.setRailOpen(true);
      claraThreadStore.requestComposerFocus(detail.query || null);
    });
  }, []);
}

function useClaraThreadState(threadId: string): ClaraThreadUiState {
  return useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.getThread(threadId),
    () => claraThreadStore.getThread(threadId),
  );
}

/** The one place `runClaraTaskStream` is actually invoked — shared by a fresh send
 *  (`sendMessage`) and a manual retry after the give-up ceiling (`retryConnection`,
 *  FIX 1). Wires every stream callback to its store method; `onOpen` is the caller's
 *  own (a send marks the turn "sent", a retry has nothing extra to mark). */
function attachClaraStream(
  auth: SessionTokenAccessor,
  threadId: string,
  taskId: string,
  onOpen?: () => void,
  /** #630 — THE ABORT SIGNAL IS THE CALLER'S NOW. It used to be a freshly constructed
   *  `AbortController` nobody kept a reference to, which meant the SSE read could never be stopped:
   *  "Stop reply" had no seam to pull. The controller lives in the hook so one press can both abort
   *  the read and cancel the turn behind it. */
  signal?: AbortSignal,
): Promise<void> {
  return resolveStreamAuth(auth).then(({ token }) =>
    runClaraTaskStream({
      token,
      taskId,
      signal: signal ?? new AbortController().signal,
      onOpen,
      onEvent: (evt) => {
        claraThreadStore.applyStreamEvent(threadId, evt);
        if (evt.event === "message") {
          // Terminal authority arrived — refetch the DB's own transcript rather than
          // hand-assembling the user's row from what we assume we sent.
          getMessages(auth, threadId)
            .then((messages) => claraThreadStore.hydrateMessages(threadId, messages))
            .catch((err: unknown) => claraThreadStore.hydrateFailed(threadId, (err as Error).message));
        }
      },
      onReconnectAttempt: ({ attempt }) => claraThreadStore.markReconnectAttempt(threadId, attempt),
      onStreamEndedUnexpectedly: () => claraThreadStore.markStreamEndedUnexpectedly(threadId),
      onGiveUp: () => claraThreadStore.markConnectionLost(threadId),
    }),
  );
}

export function useClaraThread(
  auth: SessionTokenAccessor,
  threadId: string,
): {
  state: ClaraThreadUiState;
  sendMessage: (text: string, attachments?: AttachmentPart[]) => Promise<boolean>;
  retryConnection: () => Promise<void>;
  retryLoad: () => Promise<void>;
  /** #630 — STOP THE REPLY. Two acts under one press, and both are needed: aborting the SSE read
   *  alone would leave the run writing to a stream nobody is listening to, and cancelling the task
   *  alone would leave this tab rendering deltas from a turn the human has already stopped.
   *
   *  IT IS NOT "CANCEL WORK". `clara.cancel_agent_task` is called on the CHAT-TURN task; a Work that
   *  turn started is a separate `clara.agent_tasks` row with no cascade between them
   *  (packages/runtime/tests/control-work-cancel.test.mjs proves it against the real doors), and
   *  stopping a reply must never stop accounting a person already accepted. */
  stopReply: () => Promise<"stopped" | "pending" | "idle" | "failed">;
} {
  const state = useClaraThreadState(threadId);
  const loadedRef = useRef<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  /** The live stream's controller, or null when nothing is streaming. */
  const abortRef = useRef<AbortController | null>(null);
  /** #630 (review) — A STOP PRESSED BEFORE THERE IS ANYTHING TO STOP. `beginSend` makes the control
   *  visible the moment a person presses Send, and `postTurn` can take several hundred milliseconds
   *  to come back with the task id. A press inside that window used to abort nothing, answer `idle`,
   *  and let the whole reply stream in behind a UI that said "Stopped". The intent is remembered
   *  here and CONSUMED by `sendMessage` the instant the task exists. */
  const pendingStopRef = useRef(false);

  // THE FIRST TRANSCRIPT READ IS RETRYABLE, and this effect is why it has to be (#514's
  // review, found on main). `loadedRef` fires the read once per thread id; a FAILED first
  // read left `messagesLoaded` false forever, and ClaraThreadView's loading arm keyed on
  // exactly that — so the rail sat on "Loading the conversation…" with no error, no retry
  // and no second attempt, while the honest error branch (which also required
  // `messagesLoaded`) could never render. `loadAttempt` joins the dependency so `retryLoad`
  // re-arms the ref and runs the read again; nothing else about the once-per-thread rule
  // changed.
  useEffect(() => {
    if (!threadId) return;
    const key = `${threadId}#${loadAttempt}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    let cancelled = false;
    getMessages(auth, threadId)
      .then((messages) => {
        if (!cancelled) claraThreadStore.hydrateMessages(threadId, messages);
      })
      .catch((err: unknown) => {
        if (!cancelled) claraThreadStore.hydrateFailed(threadId, (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, threadId, loadAttempt]);

  const retryLoad = useCallback(async () => {
    if (!threadId) return;
    claraThreadStore.beginLoadRetry(threadId);
    setLoadAttempt((n) => n + 1);
  }, [threadId]);

  // REHYDRATE THE RUN (裁-132 + the parked-clarify rehydration). A mount — a page reload
  // included — asks the DB what this thread's live run is, so the turn clock counts from
  // the RUNTIME's own `created_at` and a question Clara is parked on comes back on screen
  // instead of vanishing with the discarded SSE buffer. Fail-quiet by design: a failed run
  // read must not paint an error over a transcript that loaded fine, so it leaves the
  // thread with no claimed run (the same state as "no turn in flight"), which is the
  // fail-closed arm — no timer, no question, nothing asserted.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void readThreadRunSnapshot(threadId, { session: auth })
      .then(({ run, parkedClarify }) => {
        if (cancelled) return;
        claraThreadStore.hydrateRun(
          threadId,
          run ? { taskId: run.id, status: run.status, startedAt: run.created_at } : null,
          parkedClarify,
        );
      })
      .catch(() => {
        if (!cancelled) claraThreadStore.hydrateRun(threadId, null, null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, threadId, loadAttempt]);

  const sendMessage = useCallback(
    async (text: string, attachments: AttachmentPart[] = []) => {
      const trimmed = text.trim();
      if (!trimmed || !threadId) return false;
      claraThreadStore.beginSend(threadId);

      const parts: ClaraPart[] = [{ type: "text", text: trimmed }, ...attachments];
      const result = await postTurn(auth, threadId, trimmed, crypto.randomUUID(), attachments);
      if (result.kind !== "accepted") {
        const message = result.kind === "limit" ? [result.message, result.resetCopy].filter(Boolean).join(" ") : result.message;
        claraThreadStore.markSendFailed(threadId, message);
        return false;
      }
      claraThreadStore.markAccepted(threadId, result.taskId);

      // …AND THE STOP THAT ARRIVED WHILE THIS WAS IN FLIGHT IS HONOURED HERE. The turn is admitted
      // — the runtime has a task and a run — so the honest act is to cancel THAT, not to pretend
      // the press did nothing. No stream is attached at all: there is nothing for this tab to read
      // and nothing for the person to wait through.
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        claraThreadStore.markSent(threadId, parts);
        try {
          await cancelAgentTask(result.taskId, { session: auth });
        } catch {
          /* the same benign refusals stopReply() swallows: a turn that finished first is CLR11 */
        }
        return false;
      }

      // 裁-132: the turn's start comes from the DB's own row for the task the runtime just
      // minted, never from `Date.now()` at the moment this promise resolved. Fired and not
      // awaited — the composer must not wait on a progress indicator — and fail-quiet: no
      // start read means no elapsed time rendered, which is the honest arm.
      void readRunByTaskId(result.taskId, { session: auth })
        .then((run) => {
          if (run) {
            claraThreadStore.hydrateRun(
              threadId,
              { taskId: run.id, status: run.status, startedAt: run.created_at },
              null,
            );
          }
        })
        .catch(() => {});

      // Composer clearing waits for the stream-open authority, but the stream itself
      // keeps running in the background. This preserves the existing "sent only on
      // open" law without keeping the form await blocked for the whole agent run.
      return new Promise<boolean>((resolve) => {
        let opened = false;
        const controller = new AbortController();
        abortRef.current = controller;
        void attachClaraStream(auth, threadId, result.taskId, () => {
          claraThreadStore.markSent(threadId, parts);
          if (!opened) {
            opened = true;
            resolve(true);
          }
        }, controller.signal).catch((err: unknown) => {
          // AN ABORT IS NOT AN ERROR. The human asked for it, and painting "stream error:
          // AbortError" over their own decision would be the surface arguing with them.
          if (controller.signal.aborted) {
            // …AND THE SEND STATE MUST LEAVE `sending`. Measured (review): an abort that landed
            // after the task was accepted but BEFORE the SSE fetch opened resolved the caller
            // without ever transitioning the store, so the composer and its attachment controls
            // stayed disabled for the life of the mount. The turn WAS sent — `postTurn` accepted
            // it — so `markSent` is the true transition, not a cosmetic unlock.
            if (!opened) {
              opened = true;
              claraThreadStore.markSent(threadId, parts);
              resolve(false);
            }
            return;
          }
          claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
          if (!opened) resolve(false);
        });
      });
    },
    [auth, threadId],
  );

  /** The give-up ceiling's manual affordance (FIX 1): re-attaches the SAME
   *  `activeTaskId` from a clean stream state, never re-sends the turn. A no-op if
   *  there is no active task to reattach to. */
  const retryConnection = useCallback(async () => {
    const taskId = claraThreadStore.getThread(threadId).activeTaskId;
    if (!taskId) return;
    claraThreadStore.beginRetry(threadId);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await attachClaraStream(auth, threadId, taskId, undefined, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
    }
  }, [auth, threadId]);

  const stopReply = useCallback(async (): Promise<"stopped" | "pending" | "idle" | "failed"> => {
    // THE READ STOPS FIRST, unconditionally. Whatever the door answers, this tab must stop
    // rendering a reply the person has said they do not want.
    abortRef.current?.abort();
    abortRef.current = null;
    const thread = claraThreadStore.getThread(threadId);
    const taskId = thread.activeTaskId;
    if (!taskId) {
      // NOTHING TO CANCEL *YET* IS NOT NOTHING TO CANCEL. A turn that is mid-admission
      // (`sendStatus === "sending"`, no task id back yet) is remembered and cancelled the moment
      // `sendMessage` has an id; anything else genuinely has no live turn.
      if (thread.sendStatus === "sending") {
        pendingStopRef.current = true;
        return "pending";
      }
      return "idle";
    }
    pendingStopRef.current = false;
    try {
      await cancelAgentTask(taskId, { session: auth });
      return "stopped";
    } catch {
      // A REFUSAL IS NOT A CRASH, and it is usually the benign one: `clara.cancel_agent_task` is
      // idempotent on a terminal task and answers CLR11 for a turn that already finished between
      // the press and the call. The stream is stopped either way; the caller decides what to say.
      return "failed";
    }
  }, [auth, threadId]);

  return { state, sendMessage, retryConnection, retryLoad, stopReply };
}
