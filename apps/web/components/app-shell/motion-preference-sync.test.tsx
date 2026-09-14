// #715 — THE SAVED MOTION PREFERENCE APPLIES NOW, NOT ON THE NEXT NAVIGATION.
//
// THE HOSTED OBSERVATION (signed-in walk for #626, clara-web `a0e6eb53`). On
// `/settings/account`, choosing "Always reduce motion" and pressing Save wrote
// the durable row — Save disabled, a reload showed `reduced` checked and
// `<html data-motion="reduced">` — but the root attribute still read the
// PREVIOUS value until the next navigation, and the same held on the way back
// (`reduced` -> `system`). `MotionPreferenceSync` applies the stored preference
// in a mount-only layout effect, and nothing re-ran it after a successful save.
//
// WHAT THESE CELLS PIN, AND WHY THEY MUST NOT REMOUNT. A remount would apply the
// attribute through the mount path that already worked, which is exactly the
// wrong reason to go green: the defect is that a LIVE, ALREADY-MOUNTED component
// never heard about the save. So every cell below mounts once and then publishes,
// the same way `account-settings.tsx`'s save-success path does.
//
// THE OS QUERY STAYS THE FLOOR. `resolveEffectiveReducedMotion` is the one place
// that rule lives, and publishing goes through it rather than around it — cell 3
// publishes "system" under an OS that asks for reduced motion and requires the
// attribute to stay `reduced`.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createElement } from "react";

import { renderComponent } from "../../test/hookHarness";
import { MOTION_DATA_ATTRIBUTE } from "../../lib/settings/motion-preference";
import { MotionPreferenceSync, publishMotionPreference } from "./motion-preference-sync";

type Stub = Record<string, unknown>;

/** The window pieces this component reaches that the test DOM stub has not got:
 *  a `matchMedia` whose match state the cell controls, a `localStorage` (the
 *  paint cache), and the event plumbing `publishMotionPreference` dispatches
 *  through. Restored after every cell. */
function installWindow(osPrefersReduced: boolean): { restore: () => void } {
  const win = globalThis.window as unknown as Stub;
  const saved = {
    matchMedia: win.matchMedia,
    localStorage: win.localStorage,
    addEventListener: win.addEventListener,
    removeEventListener: win.removeEventListener,
    dispatchEvent: win.dispatchEvent,
    CustomEvent: (globalThis as unknown as Stub).CustomEvent,
  };

  win.matchMedia = (query: string) => ({
    media: query,
    matches: osPrefersReduced,
    addEventListener() {},
    removeEventListener() {},
  });

  const store = new Map<string, string>();
  win.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  // A real event bus, not a spy: the whole point of the fix is that a value
  // published from one tree reaches a listener registered in another.
  const listeners = new Map<string, ((evt: unknown) => void)[]>();
  win.addEventListener = (type: string, fn: (evt: unknown) => void) => {
    const list = listeners.get(type) ?? [];
    list.push(fn);
    listeners.set(type, list);
  };
  win.removeEventListener = (type: string, fn: (evt: unknown) => void) => {
    listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== fn));
  };
  win.dispatchEvent = (evt: { type: string }) => {
    for (const l of [...(listeners.get(evt.type) ?? [])]) l(evt);
    return true;
  };
  class CustomEventStub {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  (globalThis as unknown as Stub).CustomEvent = CustomEventStub;

  return {
    restore: () => {
      win.matchMedia = saved.matchMedia;
      win.localStorage = saved.localStorage;
      win.addEventListener = saved.addEventListener;
      win.removeEventListener = saved.removeEventListener;
      win.dispatchEvent = saved.dispatchEvent;
      (globalThis as unknown as Stub).CustomEvent = saved.CustomEvent;
    },
  };
}

/** `MotionPreferenceSync` queries `clara.get_my_preferences()` on mount. These
 *  cells are about the LIVE application path, not the read, so the session lookup
 *  is left to fail — which is the component's own documented "no session" arm and
 *  leaves the OS query as the only signal underneath the published value. */
function installFetchStub(): { restore: () => void } {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  return { restore: () => { globalThis.fetch = real; } };
}

function motionAttribute(): string | null {
  return (document.documentElement as unknown as {
    getAttribute(name: string): string | null;
  }).getAttribute(MOTION_DATA_ATTRIBUTE);
}

let win: { restore: () => void } | null = null;
let net: { restore: () => void } | null = null;

beforeEach(() => { net = installFetchStub(); });
afterEach(() => { win?.restore(); win = null; net?.restore(); net = null; });

test("a saved preference reaches the ROOT ATTRIBUTE in both directions, with no remount", async () => {
  win = installWindow(false); // the OS asks for nothing, so the saved value is the whole signal
  const h = await renderComponent(createElement(MotionPreferenceSync));
  try {
    assert.equal(motionAttribute(), "system", "mount with no saved value and no OS request");

    // system -> reduced, the direction the owner saw fail.
    await h.act(() => { publishMotionPreference("reduced"); });
    assert.equal(motionAttribute(), "reduced", "the attribute must follow a successful save immediately");

    // …AND BACK. The way home was broken by the same mount-only effect, and a fix
    // that only ever ADDED the reduced state would still leave it stuck here.
    await h.act(() => { publishMotionPreference("system"); });
    assert.equal(motionAttribute(), "system", "reduced -> system applies live too");
  } finally {
    await h.unmount();
  }
});

test("the OS request still wins: publishing 'system' under an OS that asks for reduced motion changes nothing", async () => {
  win = installWindow(true);
  const h = await renderComponent(createElement(MotionPreferenceSync));
  try {
    assert.equal(motionAttribute(), "reduced", "the OS query alone already governs at mount");
    await h.act(() => { publishMotionPreference("system"); });
    assert.equal(
      motionAttribute(),
      "reduced",
      "there is no way to force motion back ON against the OS's own request — publishing must go through the same resolver, not around it",
    );
  } finally {
    await h.unmount();
  }
});

test("an unmounted sync hears nothing — publishing after teardown must not write the attribute", async () => {
  win = installWindow(false);
  const h = await renderComponent(createElement(MotionPreferenceSync));
  await h.unmount();
  (document.documentElement as unknown as { setAttribute(n: string, v: string): void })
    .setAttribute(MOTION_DATA_ATTRIBUTE, "system");
  publishMotionPreference("reduced");
  assert.equal(motionAttribute(), "system", "the listener must be released with the component that registered it");
});
