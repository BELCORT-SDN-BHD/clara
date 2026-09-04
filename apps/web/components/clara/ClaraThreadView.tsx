"use client";

// The Clara conversation UI (P2-RAIL) — shared, unmodified, between the docked rail and
// the escalated full-screen thread (Q2: "full-screen is the rail conversation enlarged,
// never a separate universe"). All state comes from `useClaraThread` /
// `lib/clara/threadStore.ts`, the one source of truth both mount points read.

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";
import { PartSlot } from "@/components/clara/PartSlot";
import { ClaraWelcome } from "@/components/clara/ClaraWelcome";
import { ClaraThreadResolveState } from "@/components/clara/ClaraThreadResolveState";
import { ClaraMessageBubble } from "@/components/clara/ClaraMessageBubble";
import { OnboardingChecklistCard } from "@/components/clara/OnboardingChecklistCard";
import { TurnProgress } from "@/components/clara/TurnProgress";
import { ComposerAttachmentControl, type ComposerAttachmentState } from "@/components/clara/ComposerAttachmentControl";
import { claraWelcomeVisible } from "@/lib/clara/welcomeState";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { ClaraThreadUiState } from "@/lib/clara/threadStore";
import { useClaraThread, useComposerFocusRequest } from "@/lib/clara/useClaraThread";
import { foldLiveClarifyParts } from "@/lib/clara/liveClarify";
import { ThreadActionCoordinatorProvider } from "@/lib/parts/thread-action-coordinator";
import { cn } from "@/lib/utils";

export function ClaraThreadView({
  auth = sessionTokenAccessor,
  threadId,
  variant,
  resolveError = null,
  clientId,
  resolving = false,
  onCreateThread,
  creatingThread = false,
  canCreateThread = true,
}: {
  auth?: SessionTokenAccessor;
  threadId: string | null;
  variant: "rail" | "full";
  /** Set by the caller when it could not even resolve/create a thread id (e.g. no
   *  session for the rail to attach to) — distinct from a load/send error on an
   *  already-known thread. */
  resolveError?: string | null;
  /** 裁-117 — TRUE only while the caller's session list is genuinely in flight.
   *  `resolving: false` with a null `threadId` is the honest "no conversation at this
   *  altitude yet" state and renders the New-thread offer below; the loading arm is
   *  reserved for a read that has not answered. Defaulted so the full-screen mount
   *  point (which arrives with a concrete id from the URL) needs no change. */
  resolving?: boolean;
  /** The explicit act that mints a thread, passed down from `ClaraRail`. Absent at the
   *  full-screen mount, where there is nothing to create. */
  onCreateThread?: () => Promise<string | null>;
  creatingThread?: boolean;
  /** See `ClaraThreadResolveState`'s own note — the offer refuses a create that could
   *  not be listed, for the same reason the rail's menu does. Defaults TRUE so the
   *  full-screen mount, which offers nothing, needs no change. */
  canCreateThread?: boolean;
  /** T11 (port-wave plan §4 T11): threads onto `OnboardingChecklistCard`
   *  below — present when this thread is mounted under a client workspace
   *  (ClaraRail's own `clientId` prop; ClaraFullScreenThread's client-scoped
   *  route), absent at firm altitude. Independent of `threadId`'s own
   *  resolve/load state — the checklist card is not part of the transcript. */
  clientId?: string;
}) {
  const t = useTranslations("Clara.thread");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachmentState>({ parts: [], blocked: false });
  const [attachmentClearToken, setAttachmentClearToken] = useState(0);
  const { state, sendMessage, retryConnection, retryLoad } = useClaraThread(auth, threadId ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleAttachmentState = useCallback((next: ComposerAttachmentState) => setAttachments(next), []);

  // THE ATTACHMENT TRAY IS CLIENT-SCOPED STATE, AND THIS VIEW OUTLIVES THE SCOPE (fold
  // round, review M1). `attachments` holds `{intake_id, document_id}` parts for documents
  // already FILED to one specific client. On the rail that is a leak by construction:
  // `<RailMount />` is a SIBLING of `{children}` in `app/(firm)/layout.tsx`, while
  // `ClientScopeProvider` lives one layout down in
  // `app/(firm)/clients/[clientId]/layout.tsx` — nested layouts compose, so the rail is
  // never inside the keyed subtree and never remounts on a client switch. The reviewer's
  // probe walked it: attach under client A, navigate to the firm altitude without
  // sending, send — and client A's `document_id` was still on the wire.
  //
  // Nothing downstream catches it. `clara._tf_validate_chat_attachments`
  // (0007_document_pipeline.sql:601-633) admits on firm + task-author + adopted intake +
  // matching document_id; there is no client scoping in that wall at all, which is the
  // same measurement this train made for the intake BODY and the reason the wall cannot
  // stand in for this reset.
  //
  // P6-5 — THIS RESET IS **NOT** RETIRED BY THE STRUCTURAL BOUNDARY, and the measurement is
  // why. `RailMount` now keys the whole rail subtree on `clientId ?? "firm"`
  // (components/clara/rail-mount.tsx), which does cover this component ON THE RAIL. But the
  // rail is not this component's only mount point: `ClaraFullScreenThread` mounts it from
  // `app/(full)/clients/[clientId]/clara/[threadId]/page.tsx`, and the App Router REUSES a
  // page component across a params-only change — so moving between two clients' escalated
  // threads is exactly the in-place `clientId` prop change this effect exists for, with no
  // remount anywhere in that path. `composer-attachment-scope.test.tsx` drives precisely
  // that shape (its own header: "both cells flip `clientId` as a PROP CHANGE with no
  // remount — the production event") and went RED when this dependency was dropped, which is
  // the cell doing its job.
  //
  // So the boundary is retired where it PROVABLY holds — the `key` on this component inside
  // `ClaraRail`, which the mount-level key strictly subsumes — and this reset stays, because
  // "the rail remounts" is not a claim about the full-screen route.
  useEffect(() => {
    setAttachments({ parts: [], blocked: false });
  }, [clientId, threadId]);

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

  // The parked question, live. It cannot come from `state.messages`: the assistant row
  // is inserted by `clara.settle_chat_turn`, which cancels every still-pending
  // interruption in the same statement sequence — so a clarify that reached the
  // persisted transcript is never answerable. See lib/clara/liveClarify.ts's header.
  // Only the LAST one is answerable (the dashboard's `lastClarifyIndex` precedent):
  // an earlier clarify in the same run was already answered to get here, and at most
  // one interruption per task is ever pending (`clara.open_interruption`'s CLR13
  // linearization), so handing an earlier card a control would hand it the LATER
  // question's row.
  const liveClarifyParts = useMemo(
    () => foldLiveClarifyParts(state.stream.provisionalChunks),
    [state.stream.provisionalChunks],
  );

  // THE PARKED QUESTION AFTER A RELOAD (P6-5). The live fold above reads the SSE buffer,
  // which a page reload throws away — so a refresh while Clara is parked left the thread
  // showing no question at all, on a run that is still waiting for one. `state.parkedClarify`
  // is the same question re-read from `clara.agent_interruptions` (lib/clara/turnRun.ts).
  //
  // THE LIVE FOLD WINS WHEN BOTH EXIST, and only one of the two ever renders. Within a
  // single uninterrupted session the stream carries the question and the rehydrate is
  // redundant; showing both would put the SAME question on screen twice with two answer
  // controls, and the second would address a row the first already emptied.
  const clarifyParts = liveClarifyParts.length > 0
    ? liveClarifyParts
    : state.parkedClarify
      ? [state.parkedClarify]
      : [];

  // H-24 — ONE SEND PATH, AND ONE GATE ON IT.
  //
  // The composer had no key handler at all: a `<textarea>` inside a form does not
  // submit on Enter the way a single-line `<input>` does, so Enter inserted a newline
  // and the turn was never posted — text stayed in the box with Send still enabled,
  // which is exactly the reported symptom. The fix is the in-repo precedent
  // (InterviewRunCard.tsx:210-215), with the two things this composer needs that the
  // precedent does not carry.
  //
  // (1) THE GATE IS THE BUTTON'S OWN PREDICATE, not a second one that happens to
  //     agree today. `sendDisabled` below is read by BOTH the Button's `disabled` and
  //     this guard, so Enter can never post what the button refuses to post, and the
  //     two cannot drift apart in a later edit. Note it is STRICTLY TIGHTER than the
  //     old inline guard, which omitted `notSignedIn`.
  // (2) `nativeEvent.isComposing` — the product ships zh/ms locales, and committing a
  //     candidate in a Chinese or Malay IME fires an Enter keydown whose only meaning
  //     is "accept this word". Sending on it would post a half-typed sentence, and the
  //     turn is not retractable.
  const sendDisabled = !threadId || notSignedIn || busy || attachments.blocked || !draft.trim();

  async function submitDraft() {
    if (sendDisabled) return;
    const text = draft;
    const opened = await sendMessage(text, attachments.parts);
    if (opened) {
      setDraft("");
      setAttachmentClearToken((token) => token + 1);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitDraft();
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
        {/* The four thread-less states, one ladder, in their own module — see
            ./ClaraThreadResolveState.tsx for the order and for why 裁-117 added a
            fourth arm the old `!resolveError` loader would have swallowed forever. */}
        {!threadId && (
          <ClaraThreadResolveState
            resolveError={resolveError}
            resolving={resolving}
            onCreateThread={onCreateThread}
            creatingThread={creatingThread}
            canCreate={canCreateThread}
          />
        )}
        {threadId && notSignedIn && <StateBanner tone="info">{t("signInRequired")}</StateBanner>}
        {/* THREE DISTINGUISHABLE STATES, and the error arm no longer hides behind the one
            that only a SUCCESSFUL read can set. Before P6-5 both branches required
            `messagesLoaded`: a failed FIRST transcript read therefore rendered the LOADING
            state forever — no error, no retry, no second attempt (`loadedRef` fires once per
            thread id) — while the error branch it should have fallen to could never be
            reached, because only a success sets the flag both branches were reading. Now
            LOADING is "no error and nothing loaded yet", ERROR is `loadError` whether or not
            a transcript ever arrived, and the error carries the way back out.

            The retry is not decoration: `retryLoad` re-arms the once-per-thread guard and
            runs the read again, which is the only mechanism that can recover this thread
            without a full page reload. */}
        {threadId && !notSignedIn && !state.messagesLoaded && !state.loadError && (
          <LoadingState>{t("loading")}</LoadingState>
        )}
        {threadId && !notSignedIn && state.loadError && (
          <StateBanner
            tone="error"
            action={
              <Button type="button" size="xs" variant="outline" onClick={() => void retryLoad()}>
                {t("retryLoad")}
              </Button>
            }
          >
            {t("loadError", { message: state.loadError })}
          </StateBanner>
        )}
        {/* DS-03 (FS-9 §3, P6-3) — the ONE place `aria-busy` belongs in this
            component. This log PERSISTS across the load: it is mounted while
            the transcript is still being read and the messages arrive into the
            SAME element, so it can flip true -> false and release the queued
            announcements, which is exactly what WAI-ARIA's busy state is for.
            (LoadingState above deliberately does NOT carry it — see that
            primitive's own header for why marking a transient placeholder busy
            would suppress its own announcement.)

            MERGE (P6-3 x #508): this wrapper is P6-3's; what it wraps is #508's.
            The two trains changed the same block for unrelated reasons — P6-3
            narrowed the live region off the scroll container (DS-04, nested live
            regions), #508 added task/session threading, the provisional bubble
            and the live-clarify group.

            THE LOG WRAPS THE TRANSCRIPT AND ONLY THE TRANSCRIPT — THREE children,
            not two: the welcome, the message map and the provisional bubble.
            `ClaraWelcome` (#514) is the transcript's own EMPTY STATE — it renders
            exactly where the first message will, so it belongs inside the region
            that announces messages. (The count read "two" until #514 merged; a
            comment that enumerates a list is a list that has to be re-counted when
            one grows, which is why this one now says the number out loud.)

            The live-clarify group, the stream-status line and the turn clock are
            its SIBLINGS below — see the comment at the closing tag for why, and do
            not move them back in: #508's own parked-clarify cell reds naming
            `nested-live-region` if you do. */}
        <div
          className="space-y-3"
          role="log"
          aria-live="polite"
          // MERGE (P6-3 x P6-5) — `!state.loadError` is P6-5's half, and without it this
          // combination is a NEW defect neither branch had on its own. P6-3 wrote `aria-busy`
          // against `!messagesLoaded` while a failed first read left that flag false forever
          // (the stranded-rail defect); P6-5 fixed the visible half and would have left the
          // accessible one announcing "busy" over a rendered error, indefinitely. Busy means a
          // read is IN FLIGHT, and a failed one is not.
          aria-busy={Boolean(threadId) && !notSignedIn && !state.messagesLoaded && !state.loadError}
        >
          {/* 裁-14 · the Clara welcome moment (#514). The gate is a pure function in
              `lib/clara/welcomeState.ts`, NOT an inline conjunction, because
              "NEVER a loader" is a refusal branch and belongs somewhere every
              branch can be driven with its own RED-before mutant (review law 1).
              It reads the same `state` this component renders from, so nothing
              here can drift out from under it.
              MERGE (P6-3 x #514): INSIDE the log, unlike the clarify group — it
              is the transcript's own empty state, it renders where the first
              message will, and `ClaraWelcome` declares no live region of its own
              (checked, not assumed), so nothing nests. */}
          {claraWelcomeVisible({ threadId, notSignedIn, state }) && <ClaraWelcome />}
          {state.messages.map((msg) => (
            <ClaraMessageBubble key={msg.id} message={msg} session={auth} />
          ))}
          {/* The pending bubble is PROVISIONAL, spelled with a dashed edge rather than
              `opacity-70`. The live axe scan measured that opacity at 2.64:1 on this
              ground — an opacity multiplier is invisible to the token-contrast gate,
              which reads declared token pairs and not composited pixels, so a real WCAG
              AA failure sat here behind a green lint. The border says "not yet the DB's
              row" without touching the ink.
              MERGE NOTE: this CLOSES the residual P6-3 had recorded for the owner
              (3.459:1 under the group-opacity model, 2.647:1 before P6-3's token
              move — #508 measured the same 2.64 and removed the opacity outright,
              which is the better fix). P6-3's "found, not fixed" line is retired. */}
          {state.pendingUserParts && (
            <div className="rounded-lg border border-dashed border-border bg-muted p-2 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("role.user")}</p>
              {state.pendingUserParts.map((part, index) => (
                <PartSlot key={index} part={part} session={auth} />
              ))}
            </div>
          )}
        </div>
        {/* OUTSIDE the log, deliberately, and the merge is what proved it has to
            be. `ClarifyCard` owns a `role="status"` for its answered
            confirmation; inside the log that is a live region inside a live
            region, which is the DS-04 defect this train exists to remove — and
            #508's own a11y assertion caught it the moment the two branches met,
            through the `nested-live-region` rule this train added. The card is a
            stateful, self-announcing WIDGET, exactly like OnboardingChecklistCard
            above, so it belongs beside the transcript rather than in it, and its
            own status region stays the precise announcer for "answered".
            Visual order is unchanged: this still sits between the provisional
            bubble and the stream-status line.
            MERGE (P6-3 x P6-5): the CONDITION is `clarifyParts`, not `liveClarifyParts` —
            P6-5 folds the live stream's clarify and the one REHYDRATED from
            `agent_interruptions` into one list (see its definition above), and taking main's
            block wholesale had reverted this to the live-only source. The map below already
            read `clarifyParts`, so the two disagreed: after a reload the group would have
            been gated shut on an empty live buffer while holding a question it had read. */}
        {clarifyParts.length > 0 && (
          <div className="enter-content rounded-lg bg-clara-muted p-2 text-sm">
            <p className="mb-1 text-xs font-medium text-secondary-ink">{t("role.assistant")}</p>
            {clarifyParts.map((part, index) => (
              <PartSlot
                key={part.tool_call_id}
                part={part}
                taskId={state.activeTaskId}
                session={auth}
                clarifyAnswerable={index === clarifyParts.length - 1}
              />
            ))}
          </div>
        )}
        {/* Also outside the log, and it gains its own `role="status"`: it was
            announced before only because it sat inside the log, and moving the
            clarify group out would have left it the last thing in a region it
            does not belong to. It is a connection STATE, not a transcript
            entry. */}
        {streamStatusLabel(state, t) && (
          <p role="status" className="text-xs text-muted-foreground italic">{streamStatusLabel(state, t)}</p>
        )}
        {/* 裁-132. Rendered off the DB-read start alone, so it appears for a turn this tab
            posted AND for one it found already running after a reload — the two cases a
            client-side stopwatch cannot tell apart honestly.
            MERGE (P6-5 x P6-3): it sits OUTSIDE the log with its status sibling above, and
            deliberately carries NO live region of its own. P6-3 removed the nested regions
            this component used to have; a per-second announcement is the loudest possible
            version of that defect, and the sentence a screen reader needs ("Clara is
            responding…") is already announced by the line above it. */}
        <TurnProgress startedAt={state.turnStartedAt} parked={state.turnStatus === "awaiting_input"} />
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
      {/* The honest note the firm altitude gets INSTEAD of the affordance. The intake
          wall itself would allow a firm-altitude chat intake (origin "chat" is
          authorised against the SESSION, never a client — intakeRoutes.ts:94), and the
          attachment-admission trigger is firm+author scoped with no client_id at all.
          What genuinely needs a client is the act this product performs after adoption:
          `fileToClient`, so the document lands in a client's own workspace rather than
          in a firm-wide unassigned lane no client surface would ever show it in. So the
          control is hidden here and SAYS SO, rather than being silently absent. */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          "grid items-end gap-2 border-t border-border p-2",
          clientId && threadId ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]",
        )}
      >
        {!clientId && threadId && !notSignedIn ? (
          <p className="col-span-full text-xs text-muted-foreground">{t("attachments.firmAltitudeNote")}</p>
        ) : null}
        {clientId && threadId ? (
          <ComposerAttachmentControl
            key={`${clientId}:${threadId}`}
            clientId={clientId}
            threadId={threadId}
            session={auth}
            clearToken={attachmentClearToken}
            disabled={notSignedIn || busy}
            onStateChange={handleAttachmentState}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Shift+Enter is the newline, and it must stay one: this composer is where
            // a human writes a multi-line instruction to Clara.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submitDraft();
          }}
          placeholder={t("composerPlaceholder")}
          // One accessible name, not two. #507 and #508 each added this line
          // independently and the merge kept BOTH — a duplicate JSX attribute the
          // auto-merge introduced silently, which is why an auto-merged file both sides
          // touched gets read rather than trusted. Same key, same value: nothing is lost
          // by collapsing it.
          aria-label={t("composerLabel")}
          disabled={!threadId || notSignedIn || busy}
          rows={variant === "rail" ? 2 : 3}
          // Stays a raw <textarea>: the Textarea primitive is `field-sizing-
          // content` (auto-growing), and the rail composer is deliberately a
          // fixed 2/3 rows. What was drifting was only the border token —
          // `border-border` (a divider) where every other field in the product
          // uses `border-input` (a control edge).
          // MERGE (P6-3 x #508): both intents, neither dropped — #508's
          // `min-w-0` (its composer-attachment row needs the flex child to be
          // shrinkable) AND this train's `ring-ring/70` (裁-1's ruled alpha;
          // #508 branched before the recut and carries the old /50). The carrier
          // census in tests/focus-ring-contract.test.ts reds on the /50, so
          // taking main's line wholesale here would have been caught — but it
          // would have been caught as a failure rather than as a merge decision.
          className="motion-fast min-w-0 flex-1 resize-none rounded-lg border border-input bg-background p-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button type="submit" disabled={sendDisabled}>
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
