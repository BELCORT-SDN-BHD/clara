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
import { readRunByTaskId, readThreadRunSnapshot, THREAD_RUN_LIVE_STATUSES } from "./turnRun";
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
 * Four causes, because the surface may only say what it knows — and one of them may only be
 * reached on the door's own word. `denied` is the one refusal that IS about the reader
 * (`clara.cancel_agent_task` floors at bookkeeper while `clara.begin_chat_turn` admits any active
 * member, so a clerk's Stop is CLR04). `finished` is reached ONLY when the door SAYS it changed
 * nothing because the turn had already ended — never inferred from a status, and never from a
 * refusal. `refused` is every other governed refusal (a CLR10 op-key conflict, a CLR11 about a
 * turn this firm cannot see): the request was answered and turned down, which is not evidence the
 * reply is over. `transport` is everything that never reached a door at all. */
export type StopFailureCause = "denied" | "finished" | "refused" | "transport";
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

/** #630 — HOW MANY CONSECUTIVE "no visible row" READS THIS POLL WILL TAKE before it gives up
 *  asking. Absence is not an ending (see the effect below), so the poll cannot act on it; but it
 *  must not spin for the life of the mount against a read that will never answer either. Three
 *  ticks is ~12 s, long enough to ride out a transient and short enough not to be a background
 *  request that never stops. */
export const CLARA_RUN_POLL_MISS_LIMIT = 3;

/** The cause a thrown door failure names — never more than the throw actually said. */
function stopFailureCause(err: unknown): StopFailureCause {
  if (isDoorRefusal(err)) {
    // CLR04 is the ONLY code that is about this reader's authority, and only when it came from a
    // REAL governed SQLSTATE: `codeSource === "message"` means the code was recovered by a regex
    // over the message text, which is a coincidence and not proof of a role floor.
    if (err.code === "CLR04" && err.codeSource === "sqlstate") return "denied";
    // EVERY OTHER GOVERNED REFUSAL IS A REFUSAL, not a finished turn. A CLR11 ("not in your firm")
    // used to be read as "the turn was swept away, so it had finished" — an inference the refusal
    // does not support, and one that told the reader their reply was complete when the door had
    // simply turned the request down. The reply may still be running; the line says exactly that.
    return "refused";
  }
  return "transport";
}

/** Did the door say it changed NOTHING because the turn had already ended?
 *
 *  IT IS THE DOOR'S OWN WORD, NOT A STATUS. `clara.cancel_agent_task` answers
 *  `{status:'cancelled'}` for BOTH the terminal settle it performs on a queued or held task and
 *  for a task that was already terminal when the press arrived — every chat turn is admitted
 *  `queued`, so reading the status alone announced the successful stop of a real reply as
 *  "Nothing was stopped — this reply had already finished". The 0184 recut answers a
 *  discriminator on every arm (`changed` + `transition`), and this reads only that.
 *
 *  AN ANSWER WITHOUT THE DISCRIMINATOR IS NOT A CLAIM THAT NOTHING HAPPENED. Against a database
 *  that predates the recut the honest reading of a door that accepted is "stopped": the inversion
 *  above is the far worse of the two mistakes, and it is the one that loses a person's work. */
function answerIsAlreadyFinished(answer: unknown): boolean {
  if (answer === null || typeof answer !== "object") return false;
  const { changed, transition } = answer as { changed?: unknown; transition?: unknown };
  return changed === false && transition === "already_terminal";
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
  const [stopState, setStopState] = useState<StopReplyState>(STOP_IDLE);
  /** #630 — WHICH TURN each send is, so a stop can only ever be spent on the turn it was pressed
   *  for. A bare boolean was a latch: a stop pressed inside an admission window that the runtime
   *  then REFUSED (429 usage limit, 409 turn-in-progress, a dropped connection) survived, and the
   *  next accepted turn — in this thread or, since the hook instance outlives a `threadId` prop
   *  change, in another one — was admitted and immediately cancelled with no explanation on screen. */
  const sendGenRef = useRef(0);
  /** The send generation a pending stop belongs to, or null when no stop is waiting. */
  const pendingStopRef = useRef<number | null>(null);
  /** Set false by the unmount cleanup, so nothing writes state into a closed rail. RE-ARMED on
   *  every mount rather than only initialised: React's StrictMode mounts, unmounts and remounts an
   *  effect in development, and a flag that only ever goes false would leave the machine silent
   *  for the life of the page after that first synthetic teardown. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; pendingStopRef.current = null; };
  }, []);
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

  /** Open the SSE read for one task and REGISTER its abort handle in the store, keyed by task id.
   *
   *  The handle cannot live in this hook. `ClaraRail` unmounts `ClaraThreadView` once its exit
   *  transition finishes, and the hook deliberately does not abort on unmount (closing the rail
   *  must not stop the reply) — so a reopened rail's fresh instance held nothing, and its Stop
   *  press aborted nothing while the first mount's read went on appending chunks under a marker
   *  that said the reply was stopped. Keyed by TASK because a read belongs to a turn, not to a
   *  mount. The handle is released when the read ends on its own. */
  const openStream = useCallback((
    taskId: string,
    onOpen?: () => void,
  ): { controller: AbortController; done: Promise<void> } => {
    const controller = new AbortController();
    claraThreadStore.registerStreamAbort(taskId, controller);
    const done = attachClaraStream(auth, threadId, taskId, onOpen, controller.signal)
      .finally(() => claraThreadStore.releaseStreamAbort(taskId, controller));
    return { controller, done };
  }, [auth, threadId]);

  /** Call the door and record what it ANSWERED. Shared by both arms, so the admission window and
   *  the ordinary press can never disagree about what a refusal means. */
  const spendStop = useCallback(async (taskId: string): Promise<StopReplyState> => {
    try {
      const answer = await cancelAgentTask(taskId, { session: auth });
      if (answerIsAlreadyFinished(answer)) {
        // The turn was already over, so the clock over it is not measuring anything either.
        claraThreadStore.markTurnStopped(threadId, taskId);
        const settled: StopReplyState = { phase: "failed", cause: "finished" };
        setStop(settled);
        return settled;
      }
      // THE CLOCK RETIRES WITH THE TURN. Nothing else on this path clears `turnStartedAt`: an
      // abort never transitions the stream away from "streaming", so the DB poll that would have
      // noticed the ending is gated off and the elapsed-time line kept counting under "Stopped".
      claraThreadStore.markTurnStopped(threadId, taskId);
      setStop(STOP_STOPPED);
      return STOP_STOPPED;
    } catch (err) {
      // …AND IT DOES NOT RETIRE ON A REFUSAL. A denied, refused or unreachable stop leaves the run
      // exactly where it was: the turn is still live, and a clock that says so is the truth.
      const settled: StopReplyState = { phase: "failed", cause: stopFailureCause(err) };
      setStop(settled);
      return settled;
    }
  }, [auth, setStop, threadId]);

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
        // #630 (round-5 finding [4]) — …AND THIS ONE CONSULTS THE STOP MEMORY TOO. It is the only
        // run-hydrate a REMOUNT performs, and it was the one that did not ask. `cancel_agent_task`
        // leaves a RUNNING turn at `cancel_requested`, which turnRun.ts still counts as live, so
        // closing and reopening the rail (ClaraRail really unmounts the view at
        // `presence === "closed"`) read the row straight back and re-started the clock from the
        // original `created_at` — under a surface whose "Stopped" marker had gone with the
        // unmounted machine. The row is still hydrated: the task id and the parked question are
        // facts. Only the two fields that ASSERT the turn is running are retired.
        if (run && claraThreadStore.wasTurnStopped(run.id)) {
          claraThreadStore.markTurnStopped(threadId, run.id);
        }
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
        const settled = await spendStop(result.taskId);
        if (settled.phase === "failed" && settled.cause !== "finished") {
          // A REFUSED STOP LEAVES A LIVE TURN, AND THE TAB MUST NOT ABANDON IT. This arm used to
          // return unconditionally: on a CLR04 (a clerk pressing Stop — `clara.begin_chat_turn`
          // admits them, `clara.cancel_agent_task` does not) the run went on server-side while
          // this tab attached no stream at all, so no reply text ever arrived, the turn clock
          // never started, and `turnLive` was false — the Stop control was withdrawn at exactly
          // the moment the copy told the reader the reply was still running. The honest act is
          // the one a send with no stop would have taken: read the reply, and ask the database
          // what the turn is doing so the control stays offered while it runs.
          //
          // On a `finished` failure the turn really is over and neither is wanted; `spendStop`
          // has already retired the clock for it, and this branch is not taken.
          void readRunByTaskId(result.taskId, { session: auth })
            .then((run) => {
              if (!run || TURN_TERMINAL.has(run.status)) return;
              if (claraThreadStore.wasTurnStopped(result.taskId)) return;
              claraThreadStore.hydrateRun(
                threadId,
                { taskId: run.id, status: run.status, startedAt: run.created_at },
                null,
              );
            })
            .catch(() => {});
          const { controller, done } = openStream(result.taskId, () => {
            claraThreadStore.markSent(threadId, parts);
          });
          void done.catch((err: unknown) => {
            if (controller.signal.aborted) return;
            claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
          });
        }
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
          // …AND IT NEVER RE-STARTS A CLOCK ON A TURN A DOOR HAS ALREADY ENDED. This read is fired
          // and not awaited, so a Stop pressed while it is in flight used to be overwritten by its
          // `{status:'running', startedAt}` — an elapsed-time line counting under the same
          // surface's "Stopped" marker.
          if (run && !claraThreadStore.wasTurnStopped(result.taskId)) {
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
        const { controller, done } = openStream(result.taskId, () => {
          claraThreadStore.markSent(threadId, parts);
          if (!opened) {
            opened = true;
            resolve(true);
          }
        });
        void done.catch((err: unknown) => {
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
    [auth, threadId, setStop, spendStop, openStream],
  );

  /** The give-up ceiling's manual affordance (FIX 1): re-attaches the SAME
   *  `activeTaskId` from a clean stream state, never re-sends the turn. A no-op if
   *  there is no active task to reattach to. */
  const retryConnection = useCallback(async () => {
    const taskId = claraThreadStore.getThread(threadId).activeTaskId;
    if (!taskId) return;
    claraThreadStore.beginRetry(threadId);
    const { controller, done } = openStream(taskId);
    try {
      await done;
    } catch (err) {
      if (controller.signal.aborted) return;
      claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
    }
  }, [threadId, openStream]);

  const stopReply = useCallback(async (): Promise<StopReplyAnswer> => {
    const thread = claraThreadStore.getThread(threadId);
    const taskId = thread.activeTaskId;
    // THE READ STOPS FIRST, unconditionally — and it is found by TASK, in the store, so a press
    // from a rail that was closed and reopened still reaches the read the first mount opened.
    if (taskId) claraThreadStore.abortStream(taskId);
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
    const settled = await spendStop(taskId);
    return settled.phase === "stopped" ? "stopped" : "failed";
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
    // #630 (round-5 finding [5]) — EVERY STATUS THE HYDRATE CAN PRODUCE, not two of the five.
    // `turnRun.ts` hydrates a clock for all of THREAD_RUN_LIVE_STATUSES; the gate here named
    // `running` and `awaiting_input` only, so a turn hydrated as `queued` (every chat turn is
    // admitted queued), `held` or `cancel_requested` (where a stop of a running reply leaves it)
    // had no stream, no poll and no terminal `message` — nothing that could ever clear its
    // `turnStartedAt`. The rail counted upward indefinitely about a run that had settled seconds
    // after the reload. Read from the SAME constant the hydrate reads, so the two cannot drift.
    if (turnStatus === null || !(THREAD_RUN_LIVE_STATUSES as readonly string[]).includes(turnStatus)) return;
    let cancelled = false;
    let misses = 0;
    const timer = setInterval(() => {
      void readRunByTaskId(activeTaskId, { session: auth })
        .then((run) => {
          if (cancelled) return;
          if (!run) {
            // ABSENCE IS NOT AN ENDING. A read that finds no visible row proves only that this
            // read saw none — RLS, a transient, a stale id, or a mock that answers this relation
            // by session and not by task id. It used to be treated as "the turn ended" and
            // written through `hydrateRun(null)`, which ALSO erases the rehydrated parked
            // question and the turn clock: a thread parked on a question lost the question, its
            // Answer control and its clock four seconds after load, with the run still waiting.
            // Only a row whose status is terminal ends a turn. An absence is a MISS, and after a
            // bounded few this poll stops asking rather than inventing an answer — the state on
            // screen is left exactly as the last real read found it.
            misses += 1;
            if (misses >= CLARA_RUN_POLL_MISS_LIMIT) {
              cancelled = true;
              clearInterval(timer);
              // #630 (round-5 finding [6]) — AND IT SAYS SO. Round 4 stopped asking and wrote
              // nothing, which left the last real read (`running`, with a start time) standing:
              // the Stop control stayed mounted and the clock kept counting for the life of the
              // mount, about a turn this tab had provably stopped being able to see. Pressing
              // Stop then reached the door, got CLR11, and printed a claim about a reply nobody
              // here could observe. The transcript, the task id and the parked question are kept
              // — only the two facts that assert a live run are retired, and the surface prints
              // one bounded line telling the reader to reload if they want it re-checked.
              claraThreadStore.markRunUnobservable(threadId);
            }
            return;
          }
          misses = 0;
          if (TURN_TERMINAL.has(run.status)) claraThreadStore.hydrateRun(threadId, null, null);
        })
        // A failed read decides nothing either, and the next tick asks again.
        .catch(() => {});
    }, CLARA_RUN_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [auth, threadId, activeTaskId, turnStatus, streaming]);

  return { state, stop: stopState, sendMessage, retryConnection, retryLoad, stopReply };
}
