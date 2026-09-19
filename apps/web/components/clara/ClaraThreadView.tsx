"use client";

// The Clara conversation UI (P2-RAIL) — shared, unmodified, between the docked rail and
// the escalated full-screen thread (Q2: "full-screen is the rail conversation enlarged,
// never a separate universe"). All state comes from `useClaraThread` /
// `lib/clara/threadStore.ts`, the one source of truth both mount points read.

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { ClaraScopeBand, type ClaraScopeDescriptor } from "@/components/clara/ClaraScopeBand";
import { ClaraLiveToolStates } from "@/components/clara/ClaraLiveToolStates";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useFirmScopeOrNull } from "@/components/firm-scope-provider";
import { useClientIdentity } from "@/components/app-shell/scope-context";
import { foldLiveToolParts } from "@/lib/clara/liveTools";
import { useTranscriptScroll } from "@/lib/clara/useTranscriptScroll";
import { claraWelcomeVisible } from "@/lib/clara/welcomeState";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { claraThreadStore, type ClaraThreadUiState } from "@/lib/clara/threadStore";
import { useClaraThread, useComposerFocusRequest } from "@/lib/clara/useClaraThread";
import { FIRM_ALTITUDE } from "@/lib/clara/useActiveThread";
import { THREAD_RUN_LIVE_STATUSES } from "@/lib/clara/turnRun";
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
  firmName = null,
  clientName = null,
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
  /** #642 AC1 — THE SCOPE NAMES, measured SERVER-SIDE by the `(full)` pages and passed
   *  down. They are props rather than a hook because `app/(full)/layout.tsx` is a bare
   *  passthrough that never mounts `FirmScopeProvider`, so `useFirmScopeOrNull()` returns
   *  null on the escalated route and a hook-only band would name nothing exactly where
   *  the conversation fills the viewport. Inside `(firm)` (the rail) they are absent and
   *  the two context hooks below supply the same two facts with NO new fetch on the
   *  rail's critical path. */
  firmName?: string | null;
  clientName?: string | null;
}) {
  const t = useTranslations("Clara.thread");
  /** #630 — the Stop reply / Cancel Work vocabulary lives with the cancellation journey's own words. */
  const tw = useTranslations("WorkCancel");
  // #614 A7 — `FIRM_ALTITUDE`, `useActiveThread.ts`'s own name for firm
  // altitude's store key, now exported and imported rather than repeated as a
  // bare "firm" literal (#614 code review). This is the draft store's scope
  // half of the `(altitude, threadId)` key — see threadStore.ts's own header
  // on `drafts` for why a bare prop-change scope switch needs it.
  const altitude = clientId ?? FIRM_ALTITUDE;
  // THE DRAFT LIVES IN THE STORE, NOT IN LOCAL STATE (#614 A7). A `useState("")`
  // here is exactly what journey A7 rules out: `<RailMount/>` keys the whole rail
  // subtree on `clientId ?? FIRM_ALTITUDE` (remounting this component on every
  // client switch) and `ClaraRail` unmounts it outright once the close animation settles
  // — either event would tear down a `useState` and take the unsent draft with
  // it. Reading through `useSyncExternalStore` means a scope change that does NOT
  // remount (the full-screen mount's bare `clientId` prop change) also just works:
  // the selector re-keys on the new `(altitude, threadId)` and the OLD scope's
  // text never rides along, with no separate reset effect to keep in sync.
  const draft = useSyncExternalStore(
    claraThreadStore.subscribe,
    () => (threadId ? claraThreadStore.getDraft(altitude, threadId) : ""),
    () => (threadId ? claraThreadStore.getDraft(altitude, threadId) : ""),
  );
  const setDraft = useCallback(
    (text: string) => {
      // No threadId, no key to file it under — the composer is disabled in this
      // state anyway (see the textarea's own `disabled` below).
      if (!threadId) return;
      claraThreadStore.setDraft(altitude, threadId, text);
    },
    [altitude, threadId],
  );
  const [attachments, setAttachments] = useState<ComposerAttachmentState>({ parts: [], blocked: false });
  const [attachmentClearToken, setAttachmentClearToken] = useState(0);
  const { state, stop, sendMessage, retryConnection, retryLoad, stopReply } = useClaraThread(auth, threadId ?? "");
  /** #630 — THE STOP MARKERS ARE ONE VALUE, AND THE HOOK OWNS IT. They used to be three
   *  independent `useState` booleans this component set from the press rather than from the door,
   *  which is how `pending` (an intent) came to paint "Stopped" (an outcome) over a refusal the
   *  hook had already swallowed. `useClaraThread.stop` is the machine — idle | pending | stopped |
   *  failed(cause) — and every line below is a projection of it. See the type's own header for the
   *  transitions and what clears each one. */
  const stopped = stop.phase === "stopped";
  const stopping = stop.phase === "pending";
  const stopFailedCause = stop.phase === "failed" ? stop.cause : null;
  /** #630 (round-6 finding [4]) — WHETHER THE READ IS ACTUALLY BACK. The three refusal copies used
   *  to end with "…this tab has gone back to reading it" unconditionally, painted from `spendStop`'s
   *  synchronous answer while the re-attach had not been asked for yet — and an attach failure is
   *  never retried, so on a CLR11 or an unreachable proxy the claim stayed false while the
   *  stream-lost banner underneath said the opposite. Each state now owns its own sentence. */
  const stopReattach = stop.phase === "failed" ? stop.reattach : "none";
  // #630 (round-5 finding [6]) — THE POLL GAVE UP, and the surface is allowed to say so exactly
  // once. Set by `markRunUnobservable` after CLARA_RUN_POLL_MISS_LIMIT reads found no visible row;
  // cleared by any read that finds one again, which is what the line asks the reader to cause.
  const runLostSight = state.turnLostSight && !stopped && stopFailedCause === null;
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
  // why. `RailMount` now keys the whole rail subtree on `clientId ?? FIRM_ALTITUDE`
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
    // #614 A7: the token dedup above is the whole contract unchanged — this
    // effect still applies at most once per request, so a request that has
    // already landed can never fire again over whatever the human has since
    // typed. `setDraft` now routes through the store, but it is still gated
    // by the exact same ref this effect always used.
    if (focusRequest.prefill) setDraft(focusRequest.prefill);
    textareaRef.current?.focus();
  }, [focusRequest, setDraft]);

  const notSignedIn = state.loadError === "not signed in";
  const busy = state.sendStatus === "sending";

  // #630 (review) — IS THERE A TURN TO STOP? `busy` is `sendStatus === "sending"`, which is true
  // only between `beginSend` and `markSent` — and `markSent` fires when the stream OPENS, not when
  // the turn ends. Gating the Stop control on it alone mounted the button for the few hundred
  // milliseconds of POST-and-connect and unmounted it exactly as the reply began to arrive; for a
  // turn this tab did not post (a reload onto a running turn, a reattach) it never appeared at all.
  // The question the control actually answers is "is a turn live?", and these are the four ways the
  // estate says yes: this tab is posting one, a stream is carrying one, a stream is reconnecting to
  // one, or the DATABASE's own row for the active task says it has not reached a terminal.
  //
  // THE DB ARM IS THE SHARED CONSTANT, not a hand-picked pair (round-6 finding [3]). This gate used
  // to name `running` and `awaiting_input` only, while `turnRun.ts` reads — and `hydrateRun` stores
  // — all five non-terminal statuses. The three it dropped are the ones a reload is most likely to
  // land on: `queued` is what every chat turn is ADMITTED at, `held` is a leased or backed-up
  // runtime, `cancel_requested` is a stop already in flight. Worse, nothing could repair it later:
  // `hydrateRun` is the only writer of a non-null `turnStatus` and the poll rewrites it only on a
  // TERMINAL, so a turn hydrated as `queued` stayed `queued` for the life of the mount — the clock
  // climbing (it reads `turnStartedAt` alone) over a Stop control that never appeared.
  const turnLive = busy
    || state.stream.status === "streaming"
    || state.stream.status === "detached"
    || (state.activeTaskId !== null
        && state.turnStatus !== null
        && (THREAD_RUN_LIVE_STATUSES as readonly string[]).includes(state.turnStatus));

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

  // #642 AC4 — THE SECOND LIVE FOLD, beside the clarify one and on the same buffer. It
  // needs the settled parts too: a turn that ended in a `refusal` part resolves any step
  // the stream never closed as *refused* rather than leaving it mid-flight (see
  // lib/clara/liveTools.ts).
  const liveToolSteps = useMemo(
    () => foldLiveToolParts(state.stream.provisionalChunks, state.stream.transcriptParts ?? []),
    [state.stream.provisionalChunks, state.stream.transcriptParts],
  );

  // #642 AC1 — THE SCOPE, from whichever source this mount point actually has, and NEVER
  // a guess. Inside `(firm)` the two shell contexts already hold both names (no new
  // fetch); on the two `(full)` routes the page measured them server-side and passed them
  // as props. `useClientIdentity()`'s rule is preserved exactly: its `name` is null unless
  // the published identity is for the SAME client the URL is on, so a scope switch shows
  // the neutral placeholder rather than the previous client's name.
  const firmScope = useFirmScopeOrNull();
  const clientIdentity = useClientIdentity();
  const scope: ClaraScopeDescriptor = useMemo(
    () => ({
      firmName: firmName ?? firmScope?.firm_name ?? null,
      clientName: clientId
        ? clientName ?? (clientIdentity.id === clientId ? clientIdentity.name : null)
        : null,
      clientId: clientId ?? null,
      // #664 fills this one altitude up. #642 builds ONE band and no cross-client
      // attribution — the slot is empty and the type says so.
    }),
    [firmName, firmScope, clientId, clientName, clientIdentity],
  );

  // #642 AC5 — SCROLL OWNERSHIP. The revision is every content source this region
  // renders, counted rather than subscribed to: a hook that guessed at them would miss
  // one silently and stop following. See lib/clara/useTranscriptScroll.ts.
  const transcriptRevision =
    state.messages.length
    + state.stream.provisionalChunks.length
    + (state.pendingUserParts ? 1 : 0)
    + clarifyParts.length
    + liveToolSteps.length;
  const { viewportRef, hasMoreBelow, jumpToLatest } = useTranscriptScroll<HTMLDivElement>(transcriptRevision);

  // #642 AC5 — A REVOCATION IS ITS OWN TERMINAL, and it silences every other status line.
  // Before this, `revoked` had no case in the reducer at all: the stream state stayed
  // "streaming" and a member removed from the firm mid-reply sat in front of
  // "Reconnecting…" forever. It must never become an EXISTENCE ORACLE — the copy says
  // what this reader can no longer do, never whether the task or the firm exists.
  const revoked = state.stream.status === "revoked";

  // #642 (fix round 1, ADV-642-2) — ONE PRESS, ONE ANNOUNCEMENT, as a single predicate
  // instead of a gate each line repeats. Every line in the status block below is written
  // to exclude its siblings — this file says so three times over — because a live region
  // that speaks beside another live region announces one event twice. The two lines #642
  // added were gated only on `!revoked` and so were never part of that ladder: a replayed
  // send whose original run is still streaming (the ORDINARY replay) rendered "Clara
  // already had that message" and "Clara is responding…" as two simultaneous
  // `role="status"` nodes, and the pre-read line could speak over the give-up line.
  //
  // The ladder's own lines are unchanged and still own the announcement. The two
  // send-facing lines keep their words and drop the live role when anything else is
  // speaking — `StateBanner`'s `silent` decision, applied at the same altitude.
  const liveStatusLabel = streamStatusLabel(state, t);
  const ladderSpeaks = revoked || stopped || stopFailedCause !== null || runLostSight || liveStatusLabel !== null;
  const checkingSpeaks = state.checkingBeforeSend && !revoked && !ladderSpeaks;
  // The pre-read is about the press happening NOW; the replay is about the one before it,
  // so the newer fact wins when both are on screen.
  const replayedSpeaks = state.lastSendReplayed && !revoked && !state.checkingBeforeSend && !ladderSpeaks;

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
  // (2) `nativeEvent.isComposing` — an IME commit fires an Enter keydown whose only
  //     meaning is "accept this word". Sending on it would post a half-typed sentence,
  //     and the turn is not retractable. (#642 C-45 correction: this said "the product
  //     ships zh/ms locales". It does not — `messages/en.json` is the ONLY locale file in
  //     the tree. The guard is right anyway and for a better reason: an IME is a property
  //     of the READER's keyboard, not of the app's locale, and a Chinese or Malay speaker
  //     types into an English UI every day.)
  const sendDisabled = !threadId || notSignedIn || busy || attachments.blocked || !draft.trim();

  async function submitDraft() {
    if (sendDisabled) return;
    // A NEW TURN IS NOT THE STOPPED ONE — `sendMessage` resets the machine to `idle` itself, so
    // the marker, the refusal line and the control's own gate all speak about the turn that is
    // about to start without this component keeping a second copy of the same fact.
    const text = draft;
    // #642 AC3 — the ALTITUDE travels with the send, because the intent key is addressed
    // by it: the same sentence in the same thread at firm altitude and at client altitude
    // is two intents, and only the view knows which one this is.
    const onRecord = await sendMessage(text, attachments.parts, { altitude });
    // #614 A7 — the draft is forgotten ONLY on a send the runtime actually took. A REFUSED turn
    // (rate limit, network error) must leave the human's text sitting right there to fix and
    // resend. #630: a turn that was admitted and then STOPPED is on the record too — its bubble
    // is in the transcript — so its text is forgotten as well; leaving it in the composer beside
    // its own bubble is what invited the same sentence to be sent twice.
    if (onRecord) {
      if (threadId) claraThreadStore.clearDraft(altitude, threadId);
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
      {/* #642 AC5 — THE SCROLL WRAPPER. `relative` so the jump-to-latest control can be
          positioned over the transcript's own bottom edge without leaving the flex
          column; `min-h-0` so the scroll child can actually shrink inside it (without it
          a flex child's default `min-height:auto` makes the region grow instead of
          scrolling, and the whole rail scrolls). The scroll element itself is unchanged
          apart from the ref — the live-region boundary below is untouched, which is what
          keeps `thread-live-regions`' zero-nested assertion honest. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={viewportRef}
        // #642 — a NAMED handle for the one element that scrolls. A browser walk has to be
        // able to read `scrollTop` off the exact element the hook owns; finding it by
        // class would pin a Tailwind string, which is a styling decision, not a contract.
        data-slot="clara-transcript-viewport"
        className="flex-1 space-y-3 overflow-y-auto p-3"
      >
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
            <div data-slot="clara-provisional-bubble" className="rounded-lg border border-dashed border-border bg-muted p-2 text-sm">
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
        {/* #642 AC4 — THE LIVE TOOL STATES, a SIBLING of the clarify group and outside the
            log for the identical reason: a self-announcing widget inside a `role="log"`
            is the DS-04 nested-live-region defect, and this group carries an accessible
            name of its own. Absence renders nothing at all — never a shimmer, never a
            placeholder chip (AC4: a tool-call COUNT, prose or a shimmer is not accounting
            completion). */}
        <ClaraLiveToolStates steps={liveToolSteps} />
        {/* Also outside the log, and it gains its own `role="status"`: it was
            announced before only because it sat inside the log, and moving the
            clarify group out would have left it the last thing in a region it
            does not belong to. It is a connection STATE, not a transcript
            entry. */}
        {/* #642 AC5 — THE REVOCATION LINE. Exclusive with every other `role="status"` here
            (they each carry `!revoked` below), because one event must be one
            announcement. It says what this READER can no longer do and stops: it never
            says the task finished, never says it failed, and never reports whether the
            task or the session still exists — a revoked stream is exactly the situation
            in which this surface has no standing to say. The copy gets the care the five
            Stop-reply refusals got. */}
        {revoked && (
          <p role="status" className="text-xs font-medium text-destructive">{t("accessRevoked")}</p>
        )}
        {/* #642 AC3 — THE REPLAY, SAID ONCE. The door recognised this exact intent and
            returned the turn it already admitted, so there is no second bubble and no
            second run — and the reader is told that rather than left wondering why their
            press appeared to do nothing. It retires with the turn it is about (a terminal
            `message` or a `revoked`), not merely with the next press.

            IT IS SAID, AND IT IS NOT ALWAYS ANNOUNCED (fix round 1, ADV-642-2). A
            replayed turn whose original run is still going streams chunks immediately, so
            this line and "Clara is responding…" were two live regions speaking for ONE
            press — the exact defect the three comments below record being fixed twice.
            The live transition owns the announcement; this keeps the words, in the same
            place, unannounced. That is `StateBanner`'s own `silent` decision (#629 §5's
            one-announcement-owner rule): UNANNOUNCED never means hidden. */}
        {state.lastSendReplayed && !revoked && (
          <p {...(replayedSpeaks ? { role: "status" as const } : {})} className="text-xs text-muted-foreground">{t("alreadyAccepted")}</p>
        )}
        {/* #642 AC3 — THE PRE-READ, while it is happening. Only a DISTINCT resubmit after
            an UNKNOWN outcome reaches this state (see `useClaraThread`'s own note); a
            same-key retry never gates on a read the door already does better. Same
            announcement rule as the line above, for the same reason: it can coexist with
            the give-up line below, which neither of them used to gate on. */}
        {state.checkingBeforeSend && !revoked && (
          <p {...(checkingSpeaks ? { role: "status" as const } : {})} className="text-xs text-muted-foreground italic">{t("checkingBeforeSend")}</p>
        )}
        {liveStatusLabel && !revoked && !stopped && stopFailedCause === null && !runLostSight && (
          <p role="status" className="text-xs text-muted-foreground italic">{liveStatusLabel}</p>
        )}
        {/* #630 — THE STOPPED MARKER, and it REPLACES the stream-status line rather than sitting
            beside it: two `role="status"` siblings would announce twice, and "Clara is responding…"
            beside "Stopped" is two surfaces disagreeing about the same turn. The partial prose above
            is untouched — a stopped reply is still what Clara said, and deleting it would throw away
            the only record of the turn. */}
        {stopped && !revoked && (
          <p role="status" className="text-xs font-medium text-muted-foreground">{tw("stoppedMarker")}</p>
        )}
        {/* #630 (review) — A REFUSED STOP IS NOT A STOP, AND IT SAYS WHICH REFUSAL. `clara.
            begin_chat_turn` admits any active member while `clara.cancel_agent_task` floors at
            bookkeeper, so a viewer or clerk pressing Stop gets CLR04 — but a dropped connection and
            a turn that had already finished are NOT that, and one sentence that blamed the reader's
            role for all three was the surface asserting a cause it had no evidence for. The machine
            carries the cause; each line says only what its own cause establishes.

            IT IS THE ONLY `role="status"` SPEAKING. `streamStatusLabel` above is suppressed while
            this renders: an aborted read never transitions `state.stream.status` away from
            "streaming", so without that gate "Clara is responding…" and this line were two live
            regions announcing one press. */}
        {stopFailedCause !== null && !stopped && !revoked && (
          <p role="status" className="text-xs font-medium text-destructive">
            {stopFailedCause === "denied"
              ? tw("stopDenied")
              : stopFailedCause === "finished"
                ? tw("stopAlreadyFinished")
                : stopFailedCause === "refused"
                  ? tw("stopRefused")
                  : tw("stopUnreachable")}
            {/* THE SECOND SENTENCE IS THE SECOND FACT, and it is inside the SAME `role="status"`
                so one press is still one announcement. It appears only once `openTaskStream` has
                resolved; while the attach is in flight the reader is told the reply is still
                running, which is all that is known. The `lost` state deliberately adds nothing
                here — the stream-lost banner and its Retry below are already exactly that
                sentence, and repeating it would be the same defect in the other direction. */}
            {stopReattach === "reading" ? ` ${tw("stopReattachReading")}` : null}
          </p>
        )}
        {/* #630 (round-5 finding [6]) — THE BOUNDED GIVE-UP LINE. The DB arm of "is a turn live?"
            stops asking after three reads that found no visible row (RLS, a transient, a stale id,
            a firm switch). Round 4 stopped asking SILENTLY, which left the last real read standing:
            an enabled "Stop reply" and a clock climbing past the hour, about a turn nothing here
            could observe. One sentence, one `role="status"` — and it is exclusive with the other
            two above for the same reason they are exclusive with each other. The transcript above
            is untouched; the reader is told what this tab knows and what would re-check it. */}
        {runLostSight && !revoked && (
          <p role="status" className="text-xs font-medium text-muted-foreground">{tw("runLostSight")}</p>
        )}
        {/* STOP REPLY. Named in full, everywhere, because the rail also carries "Cancel Work" on a
            Work card and a bare "Stop" on both would be the one confusion this ticket exists to
            remove. The hint says which is which without making the human guess. */}
        {turnLive && !stopped ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={stopping}
              title={tw("stopReplyHint")}
              onClick={() => {
                // THE PRESS SAYS NOTHING. It asks; the machine records what the DOOR answered, and
                // every line above reads that. `pending` used to paint "Stopped" here — an intent
                // rendered as an outcome, over a door that had not been called yet and whose
                // refusal was then thrown away.
                void stopReply();
              }}
            >
              {stopping ? tw("stopping") : tw("stopReply")}
            </Button>
          </div>
        ) : null}
        {/* 裁-132. Rendered off the DB-read start alone, so it appears for a turn this tab
            posted AND for one it found already running after a reload — the two cases a
            client-side stopwatch cannot tell apart honestly.
            MERGE (P6-5 x P6-3): it sits OUTSIDE the log with its status sibling above, and
            deliberately carries NO live region of its own. P6-3 removed the nested regions
            this component used to have; a per-second announcement is the loudest possible
            version of that defect, and the sentence a screen reader needs ("Clara is
            responding…") is already announced by the line above it. */}
        {/* #630 — AND IT STOPS WHEN THE TURN DOES. The store retires `turnStartedAt` the moment a
            door answers that the turn is over (`markTurnStopped`), which covers a reload and a
            navigation away and back; this gate is the same fact read from the machine, so the
            second between the door answering and the store's emit never renders a clock under
            "Stopped". A REFUSED stop is deliberately not gated: that turn is still running, and
            an honest elapsed time is what the reader needs to decide what to do next. */}
        {!stopped && stopFailedCause !== "finished" && (
          <TurnProgress startedAt={state.turnStartedAt} parked={state.turnStatus === "awaiting_input"} />
        )}
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
        {/* #734 — THIS TAB'S OWN RENDERING FAILED, and that is a different sentence from
            the one above. A subscriber that threw while drawing a stream event used to
            reject the stream promise, which this hook could only read as a failed send:
            "Could not send that message" was printed over a message that had been
            accepted and a run that was still going, and it sent the owner looking in the
            wrong place. `warning`, not `error`: nothing the person asked for was lost. */}
        {state.renderFault && (
          <StateBanner tone="warning">{t("renderFault")}</StateBanner>
        )}
      </div>
      {/* #642 AC5 — JUMP TO LATEST. It exists ONLY while there is something below
          (`hasMoreBelow` is the same measurement as "at the bottom", inverted), it is a
          real `<Button>` so it is in the tab order, and its accessible name is WORDS, not
          an icon. Under `prefers-reduced-motion` the jump is instant — the hook reads the
          preference at the moment of the press, not at mount, because the setting can
          change under a live page. The overlay is `pointer-events-none` so it never eats
          a click meant for the transcript underneath it. */}
      {hasMoreBelow ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="motion-fast pointer-events-auto shadow-sm"
            onClick={jumpToLatest}
          >
            {t("jumpToLatest")}
          </Button>
        </div>
      ) : null}
      </div>
      {/* #642 AC1 — THE SCOPE BAND, immediately above the composer at BOTH mount points.
          The firm-altitude attachment note folds INTO it instead of sitting as a loose
          `<p>` in the form's grid: both sentences are about the same scope, and the note
          only ever made sense as the second half of one. */}
      {threadId && !notSignedIn ? (
        <ClaraScopeBand
          scope={scope}
          note={
            !clientId ? (
              /* The honest note the firm altitude gets INSTEAD of the affordance. The
                 intake wall itself would allow a firm-altitude chat intake (origin "chat"
                 is authorised against the SESSION, never a client — intakeRoutes.ts:94),
                 and the attachment-admission trigger is firm+author scoped with no
                 client_id at all. What genuinely needs a client is the act this product
                 performs after adoption: `fileToClient`, so the document lands in a
                 client's own workspace rather than in a firm-wide unassigned lane no
                 client surface would ever show it in. So the control is hidden here and
                 SAYS SO, rather than being silently absent. */
              <p>{t("attachments.firmAltitudeNote")}</p>
            ) : null
          }
        />
      ) : null}
      {/* #642 AC7 — THE COMPOSER ON `Field`, following `work-question-form.tsx:70`. What
          changed is the LABEL/DESCRIPTION/`aria-invalid` wiring, never the control: the
          raw `<textarea>` stays, because the `Textarea` primitive is
          `field-sizing-content` (auto-growing) and the rail composer is a deliberate
          fixed 2/3 rows. The label is `sr-only` rather than an `aria-label` so there is
          exactly ONE accessible name, and it is the same string as before. */}
      <form onSubmit={handleSubmit} className="border-t border-border p-2">
      <FieldGroup className="gap-2">
      <Field
        data-slot="clara-composer-field"
        className={cn(
          "grid items-end gap-2",
          clientId && threadId ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]",
        )}
      >
        <FieldLabel htmlFor="clara-composer" className="sr-only">{t("composerLabel")}</FieldLabel>
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
          id="clara-composer"
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
          // ONE accessible name, not two — the rule #507/#508's duplicate `aria-label`
          // merge taught this file. #642 moved the name onto the `sr-only` `FieldLabel`
          // above (the same string), so an `aria-label` here would now be the SECOND name
          // and would silently win over the label it duplicates.
          aria-describedby="clara-composer-hint"
          // AC7 — the field carries the invalid state its own error is about. `sendError`
          // is the only refusal that belongs to THIS control; a load failure is about the
          // conversation, not about what the person typed.
          aria-invalid={state.sendStatus === "error" && state.sendError !== null ? true : undefined}
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
      </Field>
      {/* The one thing a reader cannot discover by looking: that Enter sends and
          Shift+Enter starts a new line (H-24's own contract, now said out loud). It is a
          `FieldDescription` rather than a placeholder because a placeholder disappears
          the moment the person starts typing — which is exactly when they need it. */}
      <FieldDescription id="clara-composer-hint">{t("composerHint")}</FieldDescription>
      </FieldGroup>
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
