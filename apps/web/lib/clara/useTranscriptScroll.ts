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

/**
 * @param revision Bumped by the caller whenever the transcript's CONTENT changes (a new
 *   message, a new provisional chunk, a banner). It is deliberately a number the caller
 *   computes rather than a subscription this hook owns: the transcript's content lives in
 *   several stores, and a hook that guessed at them would miss one silently.
 */
export function useTranscriptScroll<T extends HTMLElement = HTMLDivElement>(
  revision: number,
): TranscriptScrollHandle<T> {
  const [viewport, setViewport] = useState<T | null>(null);
  const viewportRef = useCallback((node: T | null) => setViewport(node), []);
  const [atBottom, setAtBottom] = useState(true);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  /** The LAST SAMPLED answer to "is the reader following?", read by the append effect
   *  BEFORE the new content's geometry exists. A ref, not the state above, because the
   *  effect runs in the same commit as the append and must not see a stale render. */
  const followingRef = useRef(true);

  const measure = useCallback(() => {
    const el = viewport;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance <= BOTTOM_EPSILON_PX;
    followingRef.current = bottom;
    setAtBottom(bottom);
    setHasMoreBelow(!bottom);
  }, [viewport]);

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
    const onScroll = () => measure();
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
      setAtBottom(true);
      setHasMoreBelow(false);
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setHasMoreBelow(distance > BOTTOM_EPSILON_PX);
  }, [revision, viewport]);

  const jumpToLatest = useCallback(() => {
    const el = viewport;
    if (!el) return;
    scrollToBottom(el, !prefersReducedMotion());
    // The intent is "follow from here on", and it is recorded immediately rather than
    // waiting for a scroll event that a smooth animation delivers several frames later —
    // a delta arriving mid-animation must not find `following` still false and strand the
    // reader halfway.
    followingRef.current = true;
    setAtBottom(true);
    setHasMoreBelow(false);
  }, [viewport]);

  return { viewportRef, atBottom, hasMoreBelow, jumpToLatest, measure };
}
