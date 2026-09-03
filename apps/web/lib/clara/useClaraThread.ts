"use client";

// React bindings for the Clara thread store (P2-RAIL). `useClaraThread` is the one
// place the full turn lifecycle is wired end to end: postTurn -> (only once the SSE
// stream actually opens) mark the turn "sent" -> stream events into the store -> on the
// terminal `message`, refetch `getMessages` for the authoritative transcript (never
// hand-assemble the user's own row from what we assume we sent — the DB is asked).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { onFocusRail } from "@/lib/command/bus";

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
): Promise<void> {
  return resolveStreamAuth(auth).then(({ token }) =>
    runClaraTaskStream({
      token,
      taskId,
      signal: new AbortController().signal,
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
} {
  const state = useClaraThreadState(threadId);
  const loadedRef = useRef<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

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
        void attachClaraStream(auth, threadId, result.taskId, () => {
          claraThreadStore.markSent(threadId, parts);
          if (!opened) {
            opened = true;
            resolve(true);
          }
        }).catch((err: unknown) => {
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
    try {
      await attachClaraStream(auth, threadId, taskId);
    } catch (err) {
      claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
    }
  }, [auth, threadId]);

  return { state, sendMessage, retryConnection, retryLoad };
}
