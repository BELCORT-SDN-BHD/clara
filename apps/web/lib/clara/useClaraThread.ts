"use client";

// React bindings for the Clara thread store (P2-RAIL). `useClaraThread` is the one
// place the full turn lifecycle is wired end to end: postTurn -> (only once the SSE
// stream actually opens) mark the turn "sent" -> stream events into the store -> on the
// terminal `message`, refetch `getMessages` for the authoritative transcript (never
// hand-assemble the user's own row from what we assume we sent — the DB is asked).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { onFocusRail } from "@/lib/command/bus";

import { cancelAgentTask } from "@/lib/coding/doors";
import { isDoorRefusal } from "@/lib/doors";

import { getMessages, postTurn, resolveStreamAuth } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";
import { runClaraTaskStream } from "./stream";
import { claraThreadStore, type ClaraThreadUiState, type ComposerFocusRequest } from "./threadStore";
import { readRunByTaskId, readThreadRunSnapshot } from "./turnRun";
import type { AttachmentPart, ClaraPart } from "@/lib/parts/types";

/** #630 — THE STOP-REPLY STATE MACHINE, as one value.
 *
 *   idle  --press during admission-->  pending  --task id arrives, door called-->  stopped|failed
 *   idle  --press after admission -->  pending  --read aborted, door called   -->  stopped|failed
 *
 * `pending` is an INTENT and never an outcome: the surface says "Stopping…" for it and nothing
 * says "Stopped" until a door has actually answered. It leaves `pending` in exactly three ways —
 * the door answers (`stopped`/`failed`), the turn it was pressed for is REFUSED by the runtime
 * (back to `idle`: there is nothing to stop, and the intent must never be spent on a later turn),
 * or the reader leaves (a thread change or an unmount, both of which reset it).
 *
 * Three causes, because the surface may only say what it knows. `denied` is the one refusal that
 * IS about the reader (`clara.cancel_agent_task` floors at bookkeeper while `clara.begin_chat_turn`
 * admits any active member, so a clerk's Stop is CLR04); `finished` is the door's own idempotent
 * answer about a turn that had already ended, or a CLR11 about a turn it cannot find; `transport`
 * is everything else, and it asserts nothing about roles or about the run. */
export type StopFailureCause = "denied" | "finished" | "transport";
export type StopReplyState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "stopped" }
  | { phase: "failed"; cause: StopFailureCause };

/** What `stopReply()` tells its caller it did. `pending` means the door has not been called yet —
 *  the machine, not this word, carries what finally happened. */
export type StopReplyAnswer = "stopped" | "pending" | "idle" | "failed";

const STOP_IDLE: StopReplyState = { phase: "idle" };
const STOP_PENDING: StopReplyState = { phase: "pending" };
const STOP_STOPPED: StopReplyState = { phase: "stopped" };

/** The task statuses that mean the run is over. Shared by the stop classifier and the run poll. */
const TURN_TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);

/** #630 — HOW OFTEN THE DATABASE IS RE-ASKED whether the turn it told us about is still live.
 *  Only while no stream is carrying the answer (a reload onto a running turn, a stream that ended
 *  with `done` and no terminal `message`): a stream that is open reports the end itself. Same
 *  order as the Work surfaces' own polls (`WORK_POLL_MS`, `WORK_CARD_POLL_MS`). */
export const CLARA_RUN_POLL_MS = 4000;

/** The cause a thrown door failure names — never more than the throw actually said. */
function stopFailureCause(err: unknown): StopFailureCause {
  if (isDoorRefusal(err)) {
    // CLR04 is the ONLY code that is about this reader's authority. Everything else governed
    // (CLR11 for a turn this firm cannot see, which is what a swept-away finished turn looks
    // like) is a statement about the turn, not about them.
    return err.code === "CLR04" ? "denied" : "finished";
  }
  return "transport";
}

/** `clara.cancel_agent_task` is idempotent: pressing Stop on a turn that finished a moment ago
 *  succeeds and answers that turn's own terminal status. That is not a stop, and saying "Stopped"
 *  over it is the surface claiming an effect it did not have. */
function answerIsAlreadyFinished(answer: unknown): boolean {
  if (answer === null || typeof answer !== "object") return false;
  const status = (answer as { status?: unknown }).status;
  return typeof status === "string" && TURN_TERMINAL.has(status);
}

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
  /** #630 — the stop machine's current state. The view RENDERS this rather than keeping markers
   *  of its own: a "Stopped" line that three `useState`s could set independently is how a refused
   *  stop came to be announced as a successful one. */
  stop: StopReplyState;
  /** Resolves TRUE when the turn is on the record — the runtime accepted it and it is in the
   *  transcript — and false when it never was. It is deliberately NOT "the stream opened": a turn
   *  stopped between acceptance and the first byte is still a turn that was sent, and leaving its
   *  text in the composer beside its own bubble in the transcript is an invitation to send it
   *  twice (`clearDraft`'s caller reads exactly this). A refused POST resolves false, so that
   *  text IS kept for the person to fix and resend. */
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
  stopReply: () => Promise<StopReplyAnswer>;
} {
  const state = useClaraThreadState(threadId);
  const loadedRef = useRef<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  /** The live stream's controller, or null when nothing is streaming. */
  const abortRef = useRef<AbortController | null>(null);
  const [stopState, setStopState] = useState<StopReplyState>(STOP_IDLE);
  /** #630 — WHICH TURN each send is, so a stop can only ever be spent on the turn it was pressed
   *  for. A bare boolean was a latch: a stop pressed inside an admission window that the runtime
   *  then REFUSED (429 usage limit, 409 turn-in-progress, a dropped connection) survived, and the
   *  next accepted turn — in this thread or, since the hook instance outlives a `threadId` prop
   *  change, in another one — was admitted and immediately cancelled with no explanation on screen. */
  const sendGenRef = useRef(0);
  /** The send generation a pending stop belongs to, or null when no stop is waiting. */
  const pendingStopRef = useRef<number | null>(null);
  /** Set false by the unmount cleanup, so nothing writes state into a closed rail. */
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; pendingStopRef.current = null; }, []);
  const setStop = useCallback((next: StopReplyState) => {
    if (mountedRef.current) setStopState(next);
  }, []);

  // A MARKER IS A FACT ABOUT ONE TURN IN ONE THREAD. `ClaraRail` mounts this hook's view with no
  // key on `threadId`, so moving between threads is a prop change with no remount; without this
  // the machine — and any stop still waiting to be spent — would follow the reader into a
  // conversation it says nothing about.
  useEffect(() => {
    pendingStopRef.current = null;
    setStop(STOP_IDLE);
  }, [threadId, setStop]);

  /** Call the door and record what it ANSWERED. Shared by both arms, so the admission window and
   *  the ordinary press can never disagree about what a refusal means. */
  const spendStop = useCallback(async (taskId: string): Promise<"stopped" | "failed"> => {
    try {
      const answer = await cancelAgentTask(taskId, { session: auth });
      if (answerIsAlreadyFinished(answer)) {
        setStop({ phase: "failed", cause: "finished" });
        return "failed";
      }
      setStop(STOP_STOPPED);
      return "stopped";
    } catch (err) {
      setStop({ phase: "failed", cause: stopFailureCause(err) });
      return "failed";
    }
  }, [auth, setStop]);

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
      // A NEW TURN IS NEVER THE STOPPED ONE, and it is never the turn an older press was for.
      const generation = sendGenRef.current + 1;
      sendGenRef.current = generation;
      pendingStopRef.current = null;
      setStop(STOP_IDLE);
      claraThreadStore.beginSend(threadId);

      const parts: ClaraPart[] = [{ type: "text", text: trimmed }, ...attachments];
      const result = await postTurn(auth, threadId, trimmed, crypto.randomUUID(), attachments);
      if (result.kind !== "accepted") {
        // THE PENDING STOP DIES WITH THE TURN IT WAS FOR. A turn the runtime refused was never
        // admitted, so there is nothing to cancel and nothing to say; carrying the intent forward
        // is how the NEXT turn came to be cancelled by a press nobody made about it.
        if (pendingStopRef.current === generation) {
          pendingStopRef.current = null;
          setStop(STOP_IDLE);
        }
        const message = result.kind === "limit" ? [result.message, result.resetCopy].filter(Boolean).join(" ") : result.message;
        claraThreadStore.markSendFailed(threadId, message);
        return false;
      }
      claraThreadStore.markAccepted(threadId, result.taskId);

      // …AND THE STOP THAT ARRIVED WHILE THIS WAS IN FLIGHT IS HONOURED HERE. The turn is admitted
      // — the runtime has a task and a run — so the honest act is to cancel THAT, not to pretend
      // the press did nothing. No stream is attached at all: there is nothing for this tab to read
      // and nothing for the person to wait through.
      //
      // THE DOOR'S ANSWER IS NOT SWALLOWED. A bare `catch {}` here made this the one path where a
      // CLR04 (a clerk pressing Stop: `clara.begin_chat_turn` admits them, `clara.cancel_agent_task`
      // does not) was reported to the reader as a successful stop while the run kept spending.
      // `spendStop` records what actually happened, and the view renders THAT.
      if (pendingStopRef.current === generation) {
        pendingStopRef.current = null;
        claraThreadStore.markSent(threadId, parts);
        await spendStop(result.taskId);
        // TRUE, because the turn IS on the record: it was admitted and its bubble is in the
        // transcript. Returning false left the identical text sitting in the composer beside it,
        // and pressing Send again — the natural reading of "it didn't go through" — posted the
        // same sentence and the same attachments a second time.
        return true;
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
              // …and TRUE for the same reason the pending arm answers true: the turn was accepted
              // and is in the transcript, so its text must not also stay in the composer.
              resolve(true);
            }
            return;
          }
          claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
          if (!opened) resolve(false);
        });
      });
    },
    [auth, threadId, setStop, spendStop],
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

  const stopReply = useCallback(async (): Promise<StopReplyAnswer> => {
    // THE READ STOPS FIRST, unconditionally. Whatever the door answers, this tab must stop
    // rendering a reply the person has said they do not want.
    abortRef.current?.abort();
    abortRef.current = null;
    const thread = claraThreadStore.getThread(threadId);
    const taskId = thread.activeTaskId;
    if (!taskId) {
      // NOTHING TO CANCEL *YET* IS NOT NOTHING TO CANCEL. A turn that is mid-admission
      // (`sendStatus === "sending"`, no task id back yet) is remembered and cancelled the moment
      // `sendMessage` has an id; anything else genuinely has no live turn. The intent is stamped
      // with THIS send's generation, so it can be spent on that turn and on no other.
      if (thread.sendStatus === "sending") {
        pendingStopRef.current = sendGenRef.current;
        setStop(STOP_PENDING);
        return "pending";
      }
      return "idle";
    }
    pendingStopRef.current = null;
    setStop(STOP_PENDING);
    return await spendStop(taskId);
  }, [threadId, setStop, spendStop]);

  // #630 — THE DATABASE ARM OF "IS A TURN LIVE?" IS RE-ASKED. `hydrateRun` runs once on mount, so
  // a turn this tab did not post (a reload onto a running reply) was known to be live and then
  // never known to have ended: the Stop control stayed offered for the life of the mount next to a
  // clock that kept counting, and pressing it hit an idempotent door that answered 200 about a
  // reply which had finished normally. Only polled while NO stream is carrying the answer — an
  // open stream reports its own terminal — and it writes only the ending: a live run is left
  // exactly as it is, parked question included.
  const activeTaskId = state.activeTaskId;
  const turnStatus = state.turnStatus;
  const streaming = state.stream.status === "streaming";
  useEffect(() => {
    if (!threadId || activeTaskId === null || streaming) return;
    if (turnStatus !== "running" && turnStatus !== "awaiting_input") return;
    let stopped = false;
    const timer = setInterval(() => {
      void readRunByTaskId(activeTaskId, { session: auth })
        .then((run) => {
          if (stopped) return;
          // A read that finds no visible row is treated as ended — the fail-closed arm, and the
          // same one `readThreadRunSnapshot`'s own catch takes. Never the reverse: a failed read
          // (the `.catch` below) decides nothing and the next tick asks again.
          if (!run || TURN_TERMINAL.has(run.status)) claraThreadStore.hydrateRun(threadId, null, null);
        })
        .catch(() => {});
    }, CLARA_RUN_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [auth, threadId, activeTaskId, turnStatus, streaming]);

  return { state, stop: stopState, sendMessage, retryConnection, retryLoad, stopReply };
}
