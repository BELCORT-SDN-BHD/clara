// P2 FOLD SEAM C — `useFocusRailSubscription` (lib/clara/useClaraThread.ts), the
// rail's side of the ⌘K "Ask" -> composer handoff (lib/command/bus.ts's
// CLARA_FOCUS_RAIL_EVENT contract). Drives the hook through `test/hookHarness.ts`
// (it renders null; the subject is what the effect does over time) and dispatches
// the REAL event `focusRail()` emits, proving the round trip end to end rather than
// asserting against the store methods directly.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

// `test/hookHarness.ts` stubs a minimal `window`/`document` for react-dom/client to
// mount into, but its stub listeners are no-ops (fine for a component that renders
// nothing itself). This event contract needs a REAL dispatch/listen round trip, so
// after importing the harness (which installs the stub), swap the stub's three
// event methods for a real `EventTarget`'s — same object identity, real behaviour.
const { renderHook } = await import("../test/hookHarness.ts");
const realTarget = new EventTarget();
globalThis.window.addEventListener = realTarget.addEventListener.bind(realTarget);
globalThis.window.removeEventListener = realTarget.removeEventListener.bind(realTarget);
globalThis.window.dispatchEvent = realTarget.dispatchEvent.bind(realTarget);

const { focusRail } = await import("../lib/command/bus.ts");
const { claraThreadStore } = await import("../lib/clara/threadStore.ts");
const { useFocusRailSubscription } = await import("../lib/clara/useClaraThread.ts");

test("a query opens the rail and stores it as the composer prefill", async () => {
  claraThreadStore.setRailOpen(false);
  const before = claraThreadStore.getComposerFocusRequest();
  const harness = await renderHook(() => useFocusRailSubscription());
  try {
    focusRail({ query: "reconcile the July bank statement", source: "cmdk" });

    assert.equal(claraThreadStore.isRailOpen(), true, "the rail should expand");
    const req = claraThreadStore.getComposerFocusRequest();
    assert.equal(req.prefill, "reconcile the July bank statement");
    assert.notEqual(req.token, before?.token, "a fresh request gets a new token");
  } finally {
    await harness.unmount();
  }
});

test("an empty query still opens the rail and requests focus, but prefills nothing", async () => {
  claraThreadStore.setRailOpen(false);
  const harness = await renderHook(() => useFocusRailSubscription());
  try {
    focusRail({ query: "", source: "cmdk" });

    assert.equal(claraThreadStore.isRailOpen(), true);
    const req = claraThreadStore.getComposerFocusRequest();
    assert.equal(req.prefill, null, "never a fabricated draft — empty stays empty");
  } finally {
    await harness.unmount();
  }
});

test("unmounting the rail's subscription stops it from reacting to later events", async () => {
  const harness = await renderHook(() => useFocusRailSubscription());
  await harness.unmount();
  const before = claraThreadStore.getComposerFocusRequest();

  focusRail({ query: "after unmount", source: "cmdk" });

  assert.deepEqual(claraThreadStore.getComposerFocusRequest(), before, "no listener left to react — cleanup ran");
});
