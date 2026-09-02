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
import { ThreadActionCoordinatorProvider } from "@/lib/parts/thread-action-coordinator";
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
    <ThreadActionCoordinatorProvider session={auth}>
      <div className="flex h-full flex-col">
      {/* DS-04 (FS-9 §3, P6-3) — THE SCROLL REGION IS NO LONGER THE LIVE REGION.
          This element used to carry `role="log" aria-live="polite"` itself,
          which made every descendant a live-region update: the six StateBanners
          below (each already `role="alert"`/`"status"` of its own), and — the
          sharper instance the conformance pass found — InterviewRunCard's
          `role="log" aria-live="polite"` thread, nested INSIDE this log via
          OnboardingChecklistCard. A `log` inside a `log` has no defined
          announcement order, and the lane's first suggested fix (drop
          `aria-live` from this container) would NOT have fixed it, because
          `role="log"` carries an implicit `aria-live="polite"` on its own.
          The fix is structural: the live region moved DOWN to wrap only the
          transcript, so the card and the banners are siblings of it rather
          than descendants. Visual order and the scroll behaviour are
          byte-unchanged — `space-y-3` still spaces every child, and the
          transcript wrapper below re-declares it for its own children. */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* T11: the onboarding checklist card — a stateful card INLINE in the
            message stream (R7, the Manus precedent), never a side panel.
            N5 fix (rev-t11): this is the FIRST child of the SCROLLING region —
            it scrolls out of view like any other item as messages accumulate,
            exactly R7's "inline in the stream" shape; it is NOT pinned above
            the scroll. (It was described as the first child of the *log*; after
            DS-04 the scroll region and the log are two different elements and
            the card belongs to the scroll one. The R7 shape is unchanged.)
            Independent of threadId's own load state — see this component's own
            `clientId` doc comment. */}
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
        {/* DS-03 (FS-9 §3, P6-3) — the ONE place `aria-busy` belongs in this
            component. This log PERSISTS across the load: it is mounted while
            the transcript is still being read and the messages arrive into the
            SAME element, so it can flip true -> false and release the queued
            announcements, which is exactly what WAI-ARIA's busy state is for.
            (LoadingState above deliberately does NOT carry it — see that
            primitive's own header for why marking a transient placeholder busy
            would suppress its own announcement.) */}
        <div
          className="space-y-3"
          role="log"
          aria-live="polite"
          aria-busy={Boolean(threadId) && !notSignedIn && !state.messagesLoaded}
        >
          {state.messages.map((msg) => (
            // `enter-content`: a message ARRIVING is the archetypal "prevent a
            // jarring change". It fires per new message only — a streaming
            // assistant turn keeps its key, so the text grows without the
            // bubble ever re-animating.
            <div key={msg.id} className={cn("enter-content rounded-lg p-2 text-sm", msg.role === "user" ? "bg-muted" : "bg-clara-muted")}>
              {/* P6-3, caught by this train's own axe leg on the built app.
                  This role label was `text-muted-foreground`, which measures
                  4.493:1 on `bg-clara-muted` — short of the 4.5:1 AA floor, on
                  the transcript's most-repeated line. It is the SAME defect the
                  裁-86 walk already caught and fixed one file away, in
                  InterviewRunCard's per-turn label: --muted-readable is the
                  design system's own tightest-margin token and --clara-muted is
                  a marginally lighter, more saturated ground than the ones it
                  was tuned against. The fix is that fix — `text-secondary-ink`,
                  an existing catalogued prose role, 7.072:1 here and 7.279:1 on
                  the user bubble's `bg-muted`. Both grounds are now pinned in
                  scripts/check-token-contrast.mjs so the pair cannot regress
                  silently a third time. */}
              <p className="mb-1 text-xs font-medium text-secondary-ink">{t(`role.${msg.role}`)}</p>
              {msg.parts.map((part, i) => (
                <PartSlot key={i} part={part} />
              ))}
            </div>
          ))}
          {state.pendingUserText && (
            <div className="rounded-lg bg-muted p-2 text-sm opacity-70">
              {/* The same role label, so the same token — a transcript that
                  spelled its own speaker line two ways would be the drift this
                  file keeps closing. RESIDUAL, RECORDED NOT ABSORBED: this
                  bubble carries `opacity-70` as its "not yet confirmed"
                  affordance, which composites EVERY colour in it, label
                  included, to roughly 4.1:1. That is the opacity affordance's
                  cost, not this token's, and trading it away is a design call
                  for the owner rather than a fix to make here; it is also
                  invisible to the axe leg because the bubble exists only while
                  a send is in flight. Named in the P6-3 PR body. */}
              <p className="mb-1 text-xs font-medium text-secondary-ink">{t("role.user")}</p>
              <p className="whitespace-pre-wrap">{state.pendingUserText}</p>
            </div>
          )}
          {streamStatusLabel(state, t) && <p className="text-xs text-muted-foreground italic">{streamStatusLabel(state, t)}</p>}
        </div>
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
          aria-label={t("composerLabel")}
          placeholder={t("composerPlaceholder")}
          disabled={!threadId || notSignedIn || busy}
          rows={variant === "rail" ? 2 : 3}
          // Stays a raw <textarea>: the Textarea primitive is `field-sizing-
          // content` (auto-growing), and the rail composer is deliberately a
          // fixed 2/3 rows. What was drifting was only the border token —
          // `border-border` (a divider) where every other field in the product
          // uses `border-input` (a control edge).
          className="motion-fast flex-1 resize-none rounded-lg border border-input bg-background p-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button type="submit" disabled={!threadId || notSignedIn || busy || !draft.trim()}>
          {busy ? t("sending") : t("send")}
        </Button>
      </form>
      </div>
    </ThreadActionCoordinatorProvider>
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
