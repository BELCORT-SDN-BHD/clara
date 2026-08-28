"use client";

// The Clara conversation UI (P2-RAIL) — shared, unmodified, between the docked rail and
// the escalated full-screen thread (Q2: "full-screen is the rail conversation enlarged,
// never a separate universe"). All state comes from `useClaraThread` /
// `lib/clara/threadStore.ts`, the one source of truth both mount points read.

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";
import { PartSlot } from "@/components/clara/PartSlot";
import { OnboardingChecklistCard } from "@/components/clara/OnboardingChecklistCard";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { ClaraThreadUiState } from "@/lib/clara/threadStore";
import { useClaraThread, useComposerFocusRequest } from "@/lib/clara/useClaraThread";
import { cn } from "@/lib/utils";

export function ClaraThreadView({
  auth = sessionTokenAccessor,
  threadId,
  variant,
  resolveError = null,
  clientId,
}: {
  auth?: SessionTokenAccessor;
  threadId: string | null;
  variant: "rail" | "full";
  /** Set by the caller when it could not even resolve/create a thread id (e.g. no
   *  session for the rail to attach to) — distinct from a load/send error on an
   *  already-known thread. */
  resolveError?: string | null;
  /** T11 (port-wave plan §4 T11): threads onto `OnboardingChecklistCard`
   *  below — present when this thread is mounted under a client workspace
   *  (ClaraRail's own `clientId` prop; ClaraFullScreenThread's client-scoped
   *  route), absent at firm altitude. Independent of `threadId`'s own
   *  resolve/load state — the checklist card is not part of the transcript. */
  clientId?: string;
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
        {/* T11: the onboarding checklist card — a stateful card INLINE in the
            message stream (R7, the Manus precedent), never a side panel.
            Rendered first so it stays visible above the transcript's own
            scroll, and independent of threadId's own load state — see this
            component's own `clientId` doc comment. */}
        <OnboardingChecklistCard clientId={clientId} session={auth} />
        {/* P3 polish: the rail's own five state spellings joined the product
            ladder. "Sign in to talk with Clara" is a STATE, not a fault, so it
            reads `info` here exactly as it does on every other surface; a real
            load/send failure reads `error`. Boxing them also separates a
            SYSTEM message from a CONVERSATION message inside a log where both
            are just paragraphs otherwise. */}
        {!threadId && resolveError === "not signed in" && <StateBanner tone="info">{t("signInRequired")}</StateBanner>}
        {!threadId && resolveError && resolveError !== "not signed in" && (
          <StateBanner tone="error">{t("loadError", { message: resolveError })}</StateBanner>
        )}
        {!threadId && !resolveError && <LoadingState>{t("resolving")}</LoadingState>}
        {threadId && notSignedIn && <StateBanner tone="info">{t("signInRequired")}</StateBanner>}
        {threadId && !notSignedIn && !state.messagesLoaded && <LoadingState>{t("loading")}</LoadingState>}
        {threadId && !notSignedIn && state.loadError && state.messagesLoaded && (
          <StateBanner tone="error">{t("loadError", { message: state.loadError })}</StateBanner>
        )}
        {state.messages.map((msg) => (
          // `enter-content`: a message ARRIVING is the archetypal "prevent a
          // jarring change". It fires per new message only — a streaming
          // assistant turn keeps its key, so the text grows without the
          // bubble ever re-animating.
          <div key={msg.id} className={cn("enter-content rounded-lg p-2 text-sm", msg.role === "user" ? "bg-muted" : "bg-clara-muted")}>
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
        {/* Kept as two INDEPENDENT conditions, deliberately: `retryAvailable`
            can stand alone next to `streamStatusLabel`'s own "Connection
            lost." line above, and folding the Retry into the banner would
            have printed that sentence twice. Only the paint changed. */}
        {state.stream.streamEndedUnexpectedly && (
          <StateBanner tone="error">{t("streamEndedUnexpectedly")}</StateBanner>
        )}
        {state.stream.retryAvailable && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void retryConnection()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {state.sendStatus === "error" && state.sendError && (
          <StateBanner tone="error">{t("sendError", { message: state.sendError })}</StateBanner>
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
          // Stays a raw <textarea>: the Textarea primitive is `field-sizing-
          // content` (auto-growing), and the rail composer is deliberately a
          // fixed 2/3 rows. What was drifting was only the border token —
          // `border-border` (a divider) where every other field in the product
          // uses `border-input` (a control edge).
          className="motion-fast flex-1 resize-none rounded-lg border border-input bg-background p-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
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
