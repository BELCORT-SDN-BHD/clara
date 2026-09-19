// #642 AC5 — scroll ownership and jump-to-latest, at the hook's own seam.
//
// RED BEFORE: nothing in `components/clara/` or `lib/clara/` touched scroll at all. A
// repo-wide grep for `scrollTop|scrollIntoView|scrollHeight|jumpToLatest|scrollBy` over
// both directories (tests excluded) returned NOTHING, so there was no hook to drive and
// no behaviour to assert — the transcript was a bare `overflow-y-auto` relying on the
// browser's default anchoring.
//
// THE INSTRUMENT. The hook's element is attached through its CALLBACK ref, so a cell can
// hand it a fake viewport with exactly the geometry the case needs. That is not a
// convenience: scroll geometry does not exist in this harness's synthetic DOM (or in
// jsdom), so a cell that mounted a real region would be asserting over
// `scrollHeight === 0` and would pass for every implementation.

import assert from "node:assert/strict";
import { test } from "node:test";

import { renderHook } from "../../test/hookHarness";
import { transcriptRevisionToken, useTranscriptScroll } from "./useTranscriptScroll";

/** A viewport with real numbers on it. `scrollTo` is recorded rather than implemented so
 *  a cell can see WHICH behaviour was asked for — the reduced-motion half is exactly
 *  "smooth was not requested". */
function fakeViewport(opts: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const listeners: Record<string, (() => void)[]> = {};
  const scrollToCalls: { top: number; behavior?: string }[] = [];
  const el = {
    ...opts,
    scrollToCalls,
    addEventListener(type: string, fn: () => void) { (listeners[type] ??= []).push(fn); },
    removeEventListener(type: string, fn: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
    },
    scrollTo(arg: { top: number; behavior?: string }) {
      scrollToCalls.push(arg);
      el.scrollTop = arg.top;
    },
    fireScroll() { for (const l of listeners.scroll ?? []) l(); },
  };
  return el;
}

const atBottom = () => fakeViewport({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
const scrolledUp = () => fakeViewport({ scrollHeight: 1000, clientHeight: 400, scrollTop: 120 });

async function mount(el: ReturnType<typeof fakeViewport>, revision = 0) {
  let rev = revision;
  const h = await renderHook(() => useTranscriptScroll<never>(rev));
  await h.act(() => { h.current.viewportRef(el as never); });
  await h.settle();
  return {
    h,
    /** Append content: bump the revision the way `ClaraThreadView` does, and grow the
     *  element the way the browser would. */
    async append(pixels: number) {
      rev += 1;
      el.scrollHeight += pixels;
      await h.act(() => {});
      await h.rerender();
      await h.settle();
    },
  };
}

test("p642.web.scroll_holds_position — a reader scrolled up stays put across 50 appended deltas", async () => {
  const el = scrolledUp();
  const { h, append } = await mount(el);
  try {
    // A fresh attach lands at the latest (a conversation opens on its newest message),
    // so the READER scrolling up is an explicit act here, exactly as it is in a browser.
    await h.act(() => { el.scrollTop = 120; el.fireScroll(); });
    assert.equal(h.current.atBottom, false, "the fixture must start scrolled up, or this cell proves nothing");
    const before = el.scrollTop;
    for (let i = 0; i < 50; i += 1) await append(40);
    assert.equal(el.scrollTop, before, "the reader's position was moved by content arriving");
    assert.equal(h.current.hasMoreBelow, true, "…and they are told there is more below");
  } finally {
    await h.unmount();
  }
});

test("p642.web.scroll_holds_position — a reader AT the bottom follows, and only this element ever moves", async () => {
  const el = atBottom();
  const { h, append } = await mount(el);
  try {
    assert.equal(h.current.atBottom, true);
    await append(200);
    assert.equal(el.scrollTop, el.scrollHeight, "following did not reach the bottom");
    assert.equal(h.current.hasMoreBelow, false, "…so no jump control is offered");
    // FOLLOWING IS INSTANT: a smooth animation racing incoming deltas would never land,
    // and `scrollIntoView` (which would drag the primary workspace) is never used at all.
    assert.deepEqual(el.scrollToCalls, [], "following must not request a smooth scroll");
  } finally {
    await h.unmount();
  }
});

test("p642.web.jump_to_latest — the control is offered ONLY when there is something below", async () => {
  const el = atBottom();
  const { h } = await mount(el);
  try {
    assert.equal(h.current.hasMoreBelow, false, "at the bottom there is nothing to jump to");
    await h.act(() => { el.scrollTop = 100; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, true, "scrolled up, there is");
    await h.act(() => { h.current.jumpToLatest(); });
    assert.equal(el.scrollTop, el.scrollHeight, "the jump returns to the bottom");
    assert.equal(h.current.hasMoreBelow, false, "…and the control withdraws");
    assert.equal(h.current.atBottom, true, "…and following resumes immediately, not several frames later");
  } finally {
    await h.unmount();
  }
});

test("p642.web.jump_to_latest — a sub-pixel residue is NOT 'more below'", async () => {
  // Fractional device-pixel ratios routinely leave under a pixel between scrollTop and
  // the bottom. Treating that as "the reader has scrolled up" would withdraw following
  // from someone who never moved, and would flash the jump control at them.
  const el = fakeViewport({ scrollHeight: 1000.5, clientHeight: 400, scrollTop: 600 });
  const { h } = await mount(el);
  try {
    await h.act(() => { el.scrollTop = 599; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, false);
  } finally {
    await h.unmount();
  }
});

test("p642.web.jump_to_latest — reduced motion jumps INSTANTLY, and the preference is read at the press", async () => {
  const originalMatchMedia = globalThis.window?.matchMedia;
  let reduce = false;
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: reduce && query.includes("prefers-reduced-motion"), media: query }),
  });
  const el = scrolledUp();
  const { h } = await mount(el);
  try {
    await h.act(() => { el.scrollTop = 120; el.fireScroll(); });
    await h.act(() => { h.current.jumpToLatest(); });
    assert.equal(el.scrollToCalls.length, 1, "with motion allowed the jump is animated");
    assert.equal(el.scrollToCalls.at(0)?.behavior, "smooth");

    // …and the SAME mounted hook honours a preference that changed under the live page.
    reduce = true;
    await h.act(() => { el.scrollTop = 50; el.fireScroll(); });
    await h.act(() => { h.current.jumpToLatest(); });
    assert.equal(el.scrollToCalls.length, 1, "no second smooth scroll was requested");
    assert.equal(el.scrollTop, el.scrollHeight, "…and the reader still reached the bottom, instantly");
  } finally {
    await h.unmount();
    if (originalMatchMedia) {
      Object.defineProperty(globalThis.window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    }
  }
});

test("p642.web.scroll_holds_position — a REOPENED region lands on the LATEST, with no jump control offered", async () => {
  // `ClaraRail` really unmounts the view at `presence === "closed"`, so reopening it
  // attaches a NEW element with no history. It re-reads the current state on that attach
  // rather than inheriting the previous mount's following flag: the reader is put on the
  // newest message (which is what reopening Clara means) and, because they are at the
  // bottom, is offered no jump control. The fixture deliberately arrives parked partway
  // up, so a hook that simply trusted the element's incoming geometry would fail here.
  const el = scrolledUp();
  const { h } = await mount(el);
  try {
    assert.equal(el.scrollTop, el.scrollHeight, "a reopened transcript opens on its newest message");
    assert.equal(h.current.atBottom, true);
    assert.equal(h.current.hasMoreBelow, false);
  } finally {
    await h.unmount();
  }
});

test("p642.web.jump_to_latest — a SMOOTH jump's own scroll events are not the reader changing their mind", async () => {
  // MEASURED IN THE BROWSER FIRST (`p642.e2e.long_history_scroll`, before this fix): a
  // smooth `scrollTo` fires scroll events all the way down, and mid-animation the element
  // is NOT at the bottom — so the handler read "the reader has scrolled up", dropped
  // following, and re-offered the jump control to the person who had just pressed it. The
  // walk saw the same defect from the other side: the scroll landed 36px short and stayed
  // there, because the content grew while the animation was targeting an older height.
  const originalMatchMedia = globalThis.window?.matchMedia;
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query }),
  });
  const el = scrolledUp();
  const { h } = await mount(el);
  try {
    await h.act(() => { el.scrollTop = 120; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, true);

    await h.act(() => { h.current.jumpToLatest(); });
    // The animation's intermediate frames, delivered as real scroll events.
    await h.act(() => { el.scrollTop = 400; el.fireScroll(); });
    await h.act(() => { el.scrollTop = 550; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, false, "the control must not come back at the person who pressed it");
    assert.equal(h.current.atBottom, true, "…and they are still following");

    // The content grew while the scroll was animating, so the animation landed short.
    el.scrollHeight += 240;
    await new Promise((r) => setTimeout(r, 1100));
    await h.act(() => {});
    assert.equal(el.scrollTop, el.scrollHeight, "the jump LANDS, even when the content grew underneath it");
  } finally {
    await h.unmount();
    if (originalMatchMedia) {
      Object.defineProperty(globalThis.window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    }
  }
});

test("p642.web.scroll_render_budget — following a live turn costs the hook NO render of its own", async () => {
  // THE DEFECT THIS PINS, MEASURED RATHER THAN FEARED. The append effect runs once per
  // revision — i.e. once per streamed delta — and it used to publish `atBottom` and
  // `hasMoreBelow` unconditionally on its following arm. For the ordinary case (a reader
  // parked at the bottom for the whole of a live turn) both values were ALREADY what they
  // were being set to, and React still scheduled a second render pass per delta. The
  // transcript-wide census caught it first:
  // `components/clara/thread-live-stream-stability.test.tsx`'s "a live clarify survives a
  // 200-delta stream" measured 401 commits for 200 deltas against a budget of 215, which
  // is that suite's own words for "a component updating itself".
  //
  // This cell is the same fact at THIS hook's seam, where it is attributable: the probe
  // counts its own renders, so an extra one can only have come from inside the hook.
  const el = atBottom();
  let rev = 0;
  let renders = 0;
  const h = await renderHook(() => {
    renders += 1;
    return useTranscriptScroll<never>(rev);
  });
  try {
    await h.act(() => { h.current.viewportRef(el as never); });
    await h.settle();
    const settled = renders;

    const DELTAS = 25;
    for (let i = 0; i < DELTAS; i += 1) {
      rev += 1;
      el.scrollHeight += 40; // the browser growing the region under the new content
      await h.rerender();
      await h.settle();
    }

    const own = renders - settled;
    // THE VACUITY CONTROL. One re-render per delta is the caller's own, and it must
    // actually have happened — a probe that never rendered would pass the budget below
    // for the wrong reason.
    assert.ok(own >= DELTAS, `the probe rendered ${own} times for ${DELTAS} appends — the instrument has no subject`);
    assert.equal(
      own,
      DELTAS,
      `the hook added ${own - DELTAS} render(s) of its own across ${DELTAS} appends; following a turn must publish nothing, because nothing changed`,
    );
    // …and it is still doing its job while costing nothing.
    assert.equal(h.current.atBottom, true, "the reader is still following");
    assert.equal(h.current.hasMoreBelow, false, "…so no jump control is offered");
    assert.equal(el.scrollTop, el.scrollHeight, "…and the region really did follow the content");
  } finally {
    await h.unmount();
  }
});

test("p642.web.jump_to_latest — the landing is not cancelled by the animation's OWN trailing scroll event", async () => {
  // MEASURED IN THE BROWSER, by the spec review of this branch (finding F1): a
  // `p642.e2e.long_history_scroll` run reported the transcript sitting `36` px short of
  // the bottom for the whole 5s poll window — exactly the residual the correction below
  // was written to remove — while an isolated re-run of the same leg passed. That is a
  // race, not infra noise, and it is nameable: the window that tells "our own smooth
  // animation" from "the reader changed their mind" was a CLOCK, and the landing
  // correction fires at the same instant the clock expires. A trailing scroll event from
  // the animation delivered at or just after that deadline took the handler's ordinary
  // branch, published `following: false` (the element really is 36px short), and the
  // correction's `if (!followingRef.current) return` guard then bailed — stranding the
  // reader with nothing left to trigger another attempt.
  //
  // THE FIX is to stop asking the clock: a correction that is still PENDING is itself the
  // statement that this module's own jump has not arrived, and the correction re-measures
  // the element rather than trusting a flag some event may have written in between.
  const originalMatchMedia = globalThis.window?.matchMedia;
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query }),
  });
  const realNow = Date.now;
  const el = scrolledUp();
  const { h } = await mount(el);
  try {
    await h.act(() => { el.scrollTop = 120; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, true, "the fixture must start scrolled up");
    await h.act(() => { h.current.jumpToLatest(); });

    // The content grew while the animation was targeting the OLD height, so the animation
    // ends 36px short — the walk's own number.
    el.scrollHeight += 240;
    el.scrollTop = 804;
    // …and its last trailing event is delivered just after the window's deadline.
    Date.now = () => realNow() + 1005;
    await h.act(() => { el.fireScroll(); });
    Date.now = realNow;

    await new Promise((r) => setTimeout(r, 1200));
    await h.act(() => {});
    assert.equal(el.scrollTop, el.scrollHeight,
      "the jump must LAND even when its own trailing event arrives at the deadline");
    assert.equal(h.current.atBottom, true, "…and the reader is following again");
    assert.equal(h.current.hasMoreBelow, false, "…with no jump control still offered");
  } finally {
    Date.now = realNow;
    await h.unmount();
    if (originalMatchMedia) {
      Object.defineProperty(globalThis.window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    }
  }
});

test("p642.web.jump_to_latest — a reader who takes the scroll back AFTER the jump arrives is not dragged down again", async () => {
  // THE CONTROL for the cell above, and the reason the old guard existed at all. Once the
  // jump has ARRIVED, the window closes and any pending correction is cancelled: the very
  // next scroll is the reader's, and nothing may pull them back to the bottom a second
  // later. Without this arm, "always correct" would pass the cell above by breaking the
  // property the guard was protecting.
  const originalMatchMedia = globalThis.window?.matchMedia;
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query }),
  });
  const el = scrolledUp();
  const { h } = await mount(el);
  try {
    await h.act(() => { el.scrollTop = 120; el.fireScroll(); });
    await h.act(() => { h.current.jumpToLatest(); });
    // The animation ARRIVES: the element reaches the bottom and says so.
    await h.act(() => { el.scrollTop = 600; el.fireScroll(); });
    assert.equal(h.current.atBottom, true, "the jump arrived");

    // The reader then scrolls up to re-read something.
    await h.act(() => { el.scrollTop = 200; el.fireScroll(); });
    assert.equal(h.current.atBottom, false, "the reader's own scroll is read normally again");
    await new Promise((r) => setTimeout(r, 1200));
    await h.act(() => {});
    assert.equal(el.scrollTop, 200, "a correction from the arrived jump must never fire at them");
    assert.equal(h.current.hasMoreBelow, true, "…and they are still offered the way back");
  } finally {
    await h.unmount();
    if (originalMatchMedia) {
      Object.defineProperty(globalThis.window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    }
  }
});

test("p642.web.scroll_holds_position — two opposite content changes in ONE commit are not a stationary revision", async () => {
  // Fix round 1, review finding ADV-642-7. The caller's revision was the SUM of five
  // independent lengths, so two opposite changes landing in one commit cancelled and the
  // append effect never ran: the reader at the bottom was not followed and the reader
  // scrolled up was not re-offered the jump control. The case is not hypothetical — the
  // provisional bubble retiring (−1) in the same commit as the first arriving chunk (+1)
  // is exactly what `markSent` and the first `chunk` do together.
  const before = transcriptRevisionToken([3, 0, 1, 0, 0]); // 3 messages + the provisional bubble
  const after = transcriptRevisionToken([3, 1, 0, 0, 0]); // …bubble retired, first chunk arrived
  assert.notEqual(after, before, "the content changed, so the revision must have changed");
  // THE CONTROL: a revision that changed on every read would make the assertion above
  // pass for the wrong reason, and would cost a render per delta (see the budget cell).
  assert.equal(transcriptRevisionToken([3, 1, 0, 0, 0]), after, "the same content is the same revision");

  // …and the hook really does follow it, which is what makes the token worth anything.
  const el = atBottom();
  let rev = transcriptRevisionToken([3, 0, 1, 0, 0]);
  const h = await renderHook(() => useTranscriptScroll<never>(rev));
  try {
    await h.act(() => { h.current.viewportRef(el as never); });
    await h.settle();
    await h.act(() => { el.scrollTop = 100; el.fireScroll(); });
    assert.equal(h.current.hasMoreBelow, true, "the reader has scrolled up");
    rev = transcriptRevisionToken([3, 1, 0, 0, 0]);
    el.scrollHeight += 40;
    await h.rerender();
    await h.settle();
    assert.equal(h.current.hasMoreBelow, true, "…and the arriving content is still measured for them");
  } finally {
    await h.unmount();
  }
});
