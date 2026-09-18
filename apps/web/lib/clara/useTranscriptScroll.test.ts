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
import { useTranscriptScroll } from "./useTranscriptScroll";

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
    assert.equal(el.scrollToCalls[0].behavior, "smooth");

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
