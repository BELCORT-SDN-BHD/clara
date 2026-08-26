"use client";

// React bindings for the Clara thread store (P2-RAIL). `useClaraThread` is the one
// place the full turn lifecycle is wired end to end: postTurn -> (only once the SSE
// stream actually opens) mark the turn "sent" -> stream events into the store -> on the
// terminal `message`, refetch `getMessages` for the authoritative transcript (never
// hand-assemble the user's own row from what we assume we sent — the DB is asked).

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { onFocusRail } from "@/lib/command/bus";

import { getMessages, postTurn, resolveStreamAuth } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";
import { runClaraTaskStream } from "./stream";
import { claraThreadStore, type ClaraThreadUiState, type ComposerFocusRequest } from "./threadStore";

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
  return resolveStreamAuth(auth).then(({ token, runtimeBase }) =>
    runClaraTaskStream({
      runtimeBase,
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
): { state: ClaraThreadUiState; sendMessage: (text: string) => Promise<void>; retryConnection: () => Promise<void> } {
  const state = useClaraThreadState(threadId);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!threadId || loadedRef.current === threadId) return;
    loadedRef.current = threadId;
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
  }, [auth, threadId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !threadId) return;
      claraThreadStore.beginSend(threadId);

      const result = await postTurn(auth, threadId, trimmed, crypto.randomUUID());
      if (result.kind !== "accepted") {
        const message = result.kind === "limit" ? [result.message, result.resetCopy].filter(Boolean).join(" ") : result.message;
        claraThreadStore.markSendFailed(threadId, message);
        return;
      }
      claraThreadStore.markAccepted(threadId, result.taskId);

      try {
        await attachClaraStream(auth, threadId, result.taskId, () => claraThreadStore.markSent(threadId, trimmed));
      } catch (err) {
        claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
      }
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

  return { state, sendMessage, retryConnection };
}
