"use client";

// The Clara conversation UI (P2-RAIL) — shared, unmodified, between the docked rail and
// the escalated full-screen thread (Q2: "full-screen is the rail conversation enlarged,
// never a separate universe"). All state comes from `useClaraThread` /
// `lib/clara/threadStore.ts`, the one source of truth both mount points read.

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PartSlot } from "@/components/clara/PartSlot";
import type { SessionTokenAccessor } from "@/lib/clara/sessionContract";
import type { ClaraThreadUiState } from "@/lib/clara/threadStore";
import { useClaraThread, useComposerFocusRequest } from "@/lib/clara/useClaraThread";
import { cn } from "@/lib/utils";

export function ClaraThreadView({
  auth,
  threadId,
  variant,
  resolveError = null,
}: {
  auth: SessionTokenAccessor;
  threadId: string | null;
  variant: "rail" | "full";
  /** Set by the caller when it could not even resolve/create a thread id (e.g. no
   *  session for the rail to attach to) — distinct from a load/send error on an
   *  already-known thread. */
  resolveError?: string | null;
}) {
  const t = useTranslations("Clara.thread");
  const [draft, setDraft] = useState("");
  const { state, sendMessage, retryConnection } = useClaraThread(auth, threadId ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // P2 FOLD SEAM C: the ⌘K "Ask" -> composer handoff (ClaraRail's event subscriber
  // requests this; see lib/command/bus.ts's CLARA_FOCUS_RAIL_EVENT contract). A new
  // `token` is applied at most once — prefilling never overwrites a draft the human
  // is mid-typing on an UNRELATED, later request, and it never sends on its own.
  const focusRequest = useComposerFocusRequest();
  const appliedFocusTokenRef = useRef(0);
  useEffect(() => {
    if (!focusRequest || focusRequest.token === appliedFocusTokenRef.current) return;
    appliedFocusTokenRef.current = focusRequest.token;
    if (focusRequest.prefill) setDraft(focusRequest.prefill);
    textareaRef.current?.focus();
  }, [focusRequest]);

  const notSignedIn = state.loadError === "not signed in";
  const busy = state.sendStatus === "sending";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!threadId || !draft.trim() || busy) return;
    const text = draft;
    setDraft("");
    await sendMessage(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
        {!threadId && resolveError === "not signed in" && <p className="text-sm text-warning">{t("signInRequired")}</p>}
        {!threadId && resolveError && resolveError !== "not signed in" && (
          <p className="text-sm text-destructive">{t("loadError", { message: resolveError })}</p>
        )}
        {!threadId && !resolveError && <p className="text-sm text-muted-foreground">{t("resolving")}</p>}
        {threadId && notSignedIn && <p className="text-sm text-warning">{t("signInRequired")}</p>}
        {threadId && !notSignedIn && !state.messagesLoaded && (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        )}
        {threadId && !notSignedIn && state.loadError && state.messagesLoaded && (
          <p className="text-sm text-destructive">{t("loadError", { message: state.loadError })}</p>
        )}
        {state.messages.map((msg) => (
          <div key={msg.id} className={cn("rounded-lg p-2 text-sm", msg.role === "user" ? "bg-muted" : "bg-clara-muted")}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t(`role.${msg.role}`)}</p>
            {msg.parts.map((part, i) => (
              <PartSlot key={i} part={part} />
            ))}
          </div>
        ))}
        {state.pendingUserText && (
          <div className="rounded-lg bg-muted p-2 text-sm opacity-70">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("role.user")}</p>
            <p className="whitespace-pre-wrap">{state.pendingUserText}</p>
          </div>
        )}
        {streamStatusLabel(state, t) && <p className="text-xs text-muted-foreground italic">{streamStatusLabel(state, t)}</p>}
        {state.stream.streamEndedUnexpectedly && <p className="text-sm text-destructive">{t("streamEndedUnexpectedly")}</p>}
        {state.stream.retryAvailable && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void retryConnection()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {state.sendStatus === "error" && state.sendError && (
          <p className="text-sm text-destructive">{t("sendError", { message: state.sendError })}</p>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("composerPlaceholder")}
          disabled={!threadId || notSignedIn || busy}
          rows={variant === "rail" ? 2 : 3}
          className="flex-1 resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button type="submit" disabled={!threadId || notSignedIn || busy || !draft.trim()}>
          {busy ? t("sending") : t("send")}
        </Button>
      </form>
    </div>
  );
}

function streamStatusLabel(
  state: ClaraThreadUiState,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  if (state.stream.status === "connection-lost") return t("connectionLost");
  if (state.stream.status === "streaming") return t("responding");
  if (state.stream.status === "detached") {
    return state.stream.reconnectAttempt > 0
      ? t("reconnectingWithAttempt", { attempt: state.stream.reconnectAttempt })
      : t("reconnecting");
  }
  return null;
}
