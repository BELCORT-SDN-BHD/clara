"use client";

// React bindings for the Clara thread store (P2-RAIL). `useClaraThread` is the one
// place the full turn lifecycle is wired end to end: postTurn -> (only once the SSE
// stream actually opens) mark the turn "sent" -> stream events into the store -> on the
// terminal `message`, refetch `getMessages` for the authoritative transcript (never
// hand-assemble the user's own row from what we assume we sent — the DB is asked).

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { getMessages, postTurn, resolveStreamAuth } from "./api";
import type { SessionTokenAccessor } from "./sessionContract";
import { runClaraTaskStream } from "./stream";
import { claraThreadStore, type ClaraThreadUiState } from "./threadStore";

export function useClaraRailOpen(): boolean {
  return useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.isRailOpen(),
    () => claraThreadStore.isRailOpen(),
  );
}

function useClaraThreadState(threadId: string): ClaraThreadUiState {
  return useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.getThread(threadId),
    () => claraThreadStore.getThread(threadId),
  );
}

export function useClaraThread(
  auth: SessionTokenAccessor,
  threadId: string,
): { state: ClaraThreadUiState; sendMessage: (text: string) => Promise<void> } {
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

      const { token, runtimeBase } = await resolveStreamAuth(auth);
      const controller = new AbortController();
      try {
        await runClaraTaskStream({
          runtimeBase,
          token,
          taskId: result.taskId,
          signal: controller.signal,
          onOpen: () => claraThreadStore.markSent(threadId, trimmed),
          onEvent: (evt) => {
            claraThreadStore.applyStreamEvent(threadId, evt);
            if (evt.event === "message") {
              // Terminal authority arrived — refetch the DB's own transcript rather
              // than hand-assembling the user's row from what we assume we sent.
              getMessages(auth, threadId)
                .then((messages) => claraThreadStore.hydrateMessages(threadId, messages))
                .catch((err: unknown) => claraThreadStore.hydrateFailed(threadId, (err as Error).message));
            }
          },
        });
      } catch (err) {
        claraThreadStore.markSendFailed(threadId, `stream error: ${(err as Error).message}`);
      }
    },
    [auth, threadId],
  );

  return { state, sendMessage };
}
