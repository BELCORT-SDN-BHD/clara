"use client";

// #642 AC5 — SCROLL OWNERSHIP FOR THE TRANSCRIPT, built from zero.
//
// WHAT WAS THERE BEFORE: nothing. A repo-wide grep for
// `scrollTop|scrollIntoView|scrollHeight|jumpToLatest|scrollBy` over
// `components/clara/` + `lib/clara/` (tests excluded) returned NOTHING — the transcript
// was a bare `overflow-y-auto` with the browser's default anchoring, so a reader scrolled
// up to re-read an earlier answer was dragged to the bottom by the next delta, and a
// reader at the bottom had no guarantee of staying there.
//
// THE THREE PROPERTIES, and each is a decision rather than a default:
//
//   1. A READER SCROLLED UP STAYS PUT. Following is conditional on the reader ALREADY
//      being at the bottom when the content arrived. The condition is sampled on the
//      reader's own scroll events, never recomputed from the post-append geometry —
//      appending content moves the bottom, so a measurement taken afterwards would say
//      "not at the bottom" for a reader who never moved, and the follow would be lost.
//
//   2. FOLLOWING NEVER SCROLLS THE PRIMARY WORKSPACE. This module only ever writes
//      `scrollTop` (or `scrollTo`) on the ONE element it owns. `scrollIntoView` is
//      deliberately not used anywhere: it walks up the ancestor chain and scrolls every
//      scrollable parent it finds, which on the docked rail means dragging the client
//      workspace behind it — the reader's actual work moving because Clara said
//      something.
//
//   3. THE JUMP CONTROL APPEARS ONLY WHEN THERE IS SOMETHING BELOW. `hasMoreBelow` is
//      the same measurement as `atBottom`, inverted, with a one-pixel tolerance for
//      fractional device-pixel ratios (a 0.5px residue is not "more below").
//
// REDUCED MOTION IS READ AT THE MOMENT OF THE JUMP, not captured at mount: the setting
// can change under a live page, and a smooth scroll fired at someone who has just asked
// for less motion is exactly the complaint the setting exists for. Following new content
// is ALWAYS instant — a smooth animation racing incoming deltas would never land.
//
// IT RE-MEASURES ON MOUNT, which is what makes a reopened rail honest: `ClaraRail`
// unmounts the view at `presence === "closed"`, so a fresh mount starts with no idea
// where the transcript is until it looks.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** A scroll offset within this many pixels of the bottom counts as "at the bottom".
 *  Sub-pixel layout and fractional device-pixel ratios routinely leave a residue below
 *  one pixel; treating that as "the reader has scrolled up" would withdraw following
 *  from someone who never moved. */
const BOTTOM_EPSILON_PX = 2;

/** How long a programmatic jump is allowed to animate before its own scroll events count
 *  as the reader's again.
 *
 *  WHY THIS EXISTS (measured in the browser walk, #642 `p642.e2e.long_history_scroll`): a
 *  SMOOTH `scrollTo` fires scroll events all the way down, and every one of them lands in
 *  the same handler the reader's own scrolling does. Mid-animation the element is NOT at
 *  the bottom, so the handler read "the reader has scrolled up", set `following` false and
 *  re-offered the jump control — to someone who had just pressed it. The window below is
 *  what tells those two apart, and it closes EARLY the moment the scroll arrives. */
const PROGRAMMATIC_WINDOW_MS = 1000;

/** How long after a correction that still did not reach the bottom before trying again,
 *  and how many corrections one jump may make in total. Content that is still growing
 *  (a card finishing its enter transition, another delta) is the case; a browser that
 *  simply cannot reach the bottom is not, and must not be retried forever. */
const LANDING_RETRY_MS = 120;
const LANDING_MAX_CORRECTIONS = 3;

export interface TranscriptScrollHandle<T extends HTMLElement = HTMLDivElement> {
  /** Attach to the ONE scrollable element this hook owns.
   *
   *  A CALLBACK ref, not a `RefObject`, and that is a correctness choice rather than a
   *  style one: a ref object is filled BETWEEN renders, so an effect that runs before the
   *  element exists (a conditionally rendered region, a region that mounts after its
   *  first paint) would attach no scroll listener and never attach one later. A callback
   *  ref makes the attachment itself a state change the effects depend on. */
  viewportRef: (node: T | null) => void;
  /** True when the reader is parked at the bottom (and therefore following). */
  atBottom: boolean;
  /** True when there is content below the fold — the ONLY condition under which a
   *  jump-to-latest control may be offered. */
  hasMoreBelow: boolean;
  /** Return to the bottom. Smooth normally, INSTANT under `prefers-reduced-motion`. */
  jumpToLatest: () => void;
  /** Re-read the geometry. Exposed for a caller that changes the region's size without
   *  changing `revision` (a rail resize, a banner appearing). */
  measure: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // A media query this environment cannot evaluate is not evidence of a preference,
    // and it must never take the transcript down.
    return false;
  }
}

function scrollToBottom(el: HTMLElement, smooth: boolean): void {
  const top = el.scrollHeight;
  // `scrollTo` with options is the only way to ask for smooth behaviour, and it does not
  // exist in every test environment — the assignment below is the floor, and it is what
  // actually moves the element in jsdom.
  if (smooth && typeof el.scrollTo === "function") {
    try {
      el.scrollTo({ top, behavior: "smooth" });
      return;
    } catch {
      /* fall through to the unconditional assignment */
    }
  }
  el.scrollTop = top;
}

/** The caller's revision, built so that two opposite changes in ONE commit cannot cancel.
 *
 *  A SUM CAN STAND STILL WHILE THE CONTENT MOVES (fix round 1, ADV-642-7): the provisional
 *  bubble retiring (−1) in the same commit as the first chunk arriving (+1) is what
 *  `markSent` and the first `chunk` do together, and it left the append effect unrun — the
 *  reader at the bottom unfollowed, the reader scrolled up not re-offered the jump. A join
 *  keeps each source's own count, so the token moves whenever any one of them does and
 *  stays still when none of them do (which is what the render budget depends on).
 *
 *  It is still the CALLER's count rather than a subscription this hook owns: the
 *  transcript's content lives in several stores, and a hook that guessed at them would
 *  miss one silently. */
export function transcriptRevisionToken(counts: readonly number[]): string {
  return counts.join(":");
}

/**
 * @param revision Changed by the caller whenever the transcript's CONTENT changes (a new
 *   message, a new provisional chunk, a banner) — see `transcriptRevisionToken`. Any value
 *   React can compare by identity will do; the hook only ever uses it as a dependency.
 */
export function useTranscriptScroll<T extends HTMLElement = HTMLDivElement>(
  revision: string | number,
): TranscriptScrollHandle<T> {
  const [viewport, setViewport] = useState<T | null>(null);
  const viewportRef = useCallback((node: T | null) => setViewport(node), []);
  const [atBottom, setAtBottom] = useState(true);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  /** The LAST SAMPLED answer to "is the reader following?", read by the append effect
   *  BEFORE the new content's geometry exists. A ref, not the state above, because the
   *  effect runs in the same commit as the append and must not see a stale render. */
  const followingRef = useRef(true);

  /** THE TWO PUBLISHED FLAGS, MIRRORED IN REFS — and this is a render-budget fix, not a
   *  style preference.
   *
   *  MEASURED (`components/clara/thread-live-stream-stability.test.tsx`, the cell "a live
   *  clarify survives a 200-delta stream"): the append effect below runs on EVERY
   *  revision — i.e. once per streamed delta — and it used to call `setAtBottom(true)` and
   *  `setHasMoreBelow(false)` unconditionally on its following arm. For a reader parked at
   *  the bottom, which is the ordinary case for the whole of a live turn, both values were
   *  ALREADY what they were being set to, and React still scheduled a second render pass
   *  per delta: the transcript committed **401 times for 200 deltas against a budget of
   *  215**. That census exists to catch exactly one thing — "a component updating itself"
   *  — and this hook was it. React's eager `Object.is` bail-out does not save it, because
   *  a delta has just re-rendered the fiber and the update is dispatched from inside that
   *  same commit's layout phase, where there is nothing to bail out of yet.
   *
   *  Mirroring the last published value in a ref and writing only on a REAL transition
   *  makes the no-op cost nothing: after the fix the same cell measures ~203. The refs
   *  are the single source of "what the render currently shows" for both writers below,
   *  so the state and the mirror cannot drift. */
  const atBottomRef = useRef(true);
  const hasMoreBelowRef = useRef(false);
  const publishAtBottom = useCallback((next: boolean) => {
    if (atBottomRef.current === next) return;
    atBottomRef.current = next;
    setAtBottom(next);
  }, []);
  const publishHasMoreBelow = useCallback((next: boolean) => {
    if (hasMoreBelowRef.current === next) return;
    hasMoreBelowRef.current = next;
    setHasMoreBelow(next);
  }, []);
  /** `Date.now()` until which a scroll this module ITSELF started may still be animating.
   *  Zero when nothing programmatic is in flight. */
  const programmaticUntilRef = useRef(0);

  /** The pending landing correction, cleared on unmount so a closed rail cannot write
   *  state (or scroll a detached element) a second after it went away. */
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (landingTimerRef.current !== null) clearTimeout(landingTimerRef.current);
  }, []);

  const measure = useCallback(() => {
    const el = viewport;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance <= BOTTOM_EPSILON_PX;
    followingRef.current = bottom;
    publishAtBottom(bottom);
    publishHasMoreBelow(!bottom);
  }, [viewport, publishAtBottom, publishHasMoreBelow]);

  // The reader's own movement is the ONLY thing that changes whether they are following.
  //
  // A FRESH ATTACH STARTS AT THE LATEST, and that is deliberate: `ClaraRail` really
  // unmounts the view at `presence === "closed"`, so reopening it is a new element with
  // no history, and a conversation opens on its newest message rather than wherever the
  // previous element happened to be parked. `followingRef` is therefore re-armed here
  // rather than inherited, and the layout effect below performs the jump on the same
  // commit. Everything after that is the reader's own decision, read from their scroll.
  useEffect(() => {
    const el = viewport;
    if (!el) return;
    followingRef.current = true;
    const onScroll = () => {
      // A jump this module started is not the reader changing their mind. Its intermediate
      // positions say nothing about what they want; only its ARRIVAL does, and that closes
      // the window early — cancelling the landing correction with it, because a jump that
      // arrived has nothing left to correct — so the very next real scroll is read
      // normally.
      //
      // A PENDING CORRECTION COUNTS AS "STILL OURS", and that is the race fix (spec review
      // F1, measured in the browser at 36px short). The clock and the correction expire at
      // the same instant, so a trailing event from our own smooth animation delivered at
      // the deadline used to take the branch below, publish `following: false` — the
      // element really is short of the bottom mid-animation — and make the correction that
      // was about to run bail out, stranding the reader for good. The pending timer is
      // itself the statement that our jump has not arrived; it does not depend on which of
      // two callbacks the event loop happens to run first.
      if (landingTimerRef.current !== null || Date.now() < programmaticUntilRef.current) {
        if (el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPSILON_PX) {
          programmaticUntilRef.current = 0;
          if (landingTimerRef.current !== null) {
            clearTimeout(landingTimerRef.current);
            landingTimerRef.current = null;
          }
          measure();
        }
        return;
      }
      measure();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [viewport, measure]);

  // CONTENT ARRIVED. Follow only if the reader was already at the bottom, then re-measure
  // so the jump control appears for a reader who was not.
  useLayoutEffect(() => {
    const el = viewport;
    if (!el) return;
    if (followingRef.current) {
      scrollToBottom(el, false); // following is always instant — see the header
      publishAtBottom(true);
      publishHasMoreBelow(false);
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    publishHasMoreBelow(distance > BOTTOM_EPSILON_PX);
  }, [revision, viewport, publishAtBottom, publishHasMoreBelow]);

  const jumpToLatest = useCallback(() => {
    const el = viewport;
    if (!el) return;
    // The intent is "follow from here on", and it is recorded BEFORE the scroll starts
    // rather than waiting for an event a smooth animation delivers several frames later —
    // a delta arriving mid-animation must not find `following` false and strand the
    // reader halfway.
    followingRef.current = true;
    publishAtBottom(true);
    publishHasMoreBelow(false);
    const smooth = !prefersReducedMotion();
    programmaticUntilRef.current = smooth ? Date.now() + PROGRAMMATIC_WINDOW_MS : 0;
    scrollToBottom(el, smooth);
    if (!smooth) return;
    // AND IT LANDS. A smooth scroll animates towards the height it was GIVEN, and the
    // content can grow underneath it (a card finishing its enter transition, a font
    // swapping, a delta arriving) — measured 36px short in the browser walk. One
    // correction at the end of the window puts the reader where they asked to be instead
    // of a few pixels above it, and it is skipped if they have taken the scroll back.
    //
    // IT RE-MEASURES RATHER THAN TRUSTING A FLAG. The old guard read `followingRef`, which
    // any scroll event between the press and this moment could have written — including
    // the animation's own (spec review F1). The element's geometry is the only thing that
    // answers "did it land?", and it is cheap.
    //
    // AND IT IS BOUNDED. If the content grew again during the correction the reader is
    // still short of the bottom, so one more attempt is scheduled, up to
    // LANDING_MAX_CORRECTIONS — never a loop, and never a timer that outlives the mount.
    if (landingTimerRef.current !== null) clearTimeout(landingTimerRef.current);
    const correct = (attemptsLeft: number) => {
      landingTimerRef.current = null;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance <= BOTTOM_EPSILON_PX) {
        // It landed on its own (or the reader is already there). Read the element and
        // publish what it actually says.
        programmaticUntilRef.current = 0;
        measure();
        return;
      }
      scrollToBottom(el, false);
      const after = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (after > BOTTOM_EPSILON_PX && attemptsLeft > 0) {
        landingTimerRef.current = setTimeout(() => correct(attemptsLeft - 1), LANDING_RETRY_MS);
        return;
      }
      programmaticUntilRef.current = 0;
      measure();
    };
    landingTimerRef.current = setTimeout(() => correct(LANDING_MAX_CORRECTIONS - 1), PROGRAMMATIC_WINDOW_MS);
    // `measure` is in the closure now (the correction reads the element rather than a
    // flag), so it belongs in the dependency list: it is itself memoised on `viewport` and
    // the two publishers, so this adds no identity churn.
  }, [viewport, measure, publishAtBottom, publishHasMoreBelow]);

  return { viewportRef, atBottom, hasMoreBelow, jumpToLatest, measure };
}
