// #897 — the rail's focus-return marker's own contract, mirroring
// `lib/firm/portfolio-focus-return.test.ts`'s own shape for the sibling module it is modelled on.
//
// The BROWSER half of this (does focus actually land on the escalate link after the round trip?)
// is not assertable here and is not asserted here: `e2e/agentic-finish-walk.spec.ts`'s own #897
// arm reads `document.activeElement` (via Playwright's `toBeFocused()`) on the real build. What
// this file pins is everything that can be got wrong without a browser: the ALTITUDE-scoped
// match (this module's one departure from its sibling's plain boolean), the take-ONCE semantics,
// and the refusal to throw when the store is unavailable.

import assert from "node:assert/strict";
import { test } from "node:test";

import { rememberRailReturnFocus, takeRailReturnFocus } from "./rail-focus-return";

type Win = { sessionStorage?: unknown };
const asWindow = () => globalThis as unknown as { window?: Win };

/** Install a stand-in `window.sessionStorage` for one cell, and put back whatever was there. */
function withStorage(storage: unknown, run: () => void): void {
  const g = asWindow();
  const hadWindow = "window" in g;
  const previousWindow = g.window;
  const previousStorage = hadWindow ? previousWindow?.sessionStorage : undefined;
  if (!hadWindow) g.window = {} as Win;
  (g.window as Win).sessionStorage = storage;
  try {
    run();
  } finally {
    if (!hadWindow) delete g.window;
    else (g.window as Win).sessionStorage = previousStorage;
  }
}

function memoryStorage(): { store: Map<string, string>; storage: unknown } {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  };
}

test("a marker remembered for one client is taken back for that SAME client", () => {
  const { storage } = memoryStorage();
  withStorage(storage, () => {
    rememberRailReturnFocus("c1");
    assert.equal(takeRailReturnFocus("c1"), true);
  });
});

test("the firm altitude (undefined clientId) is its own scope, distinct from any client", () => {
  const { storage } = memoryStorage();
  withStorage(storage, () => {
    rememberRailReturnFocus(undefined);
    assert.equal(takeRailReturnFocus(undefined), true, "the firm altitude must round-trip on itself");
  });
  const { storage: storage2 } = memoryStorage();
  withStorage(storage2, () => {
    rememberRailReturnFocus("c1");
    assert.equal(takeRailReturnFocus(undefined), false, "a client's marker must not answer for the firm altitude");
  });
});

test("SCOPE MISMATCH: a marker left for one client must NEVER move focus on a different client's fresh rail", () => {
  // This is the one departure from portfolio-focus-return.ts's plain boolean: a reader who left
  // the full-screen route some way other than the collapse link (a bookmark, a typed URL) and
  // later lands on an UNRELATED client's rail must not have that client's escalate control
  // stolen out from under them.
  const { storage } = memoryStorage();
  withStorage(storage, () => {
    rememberRailReturnFocus("c1");
    assert.equal(takeRailReturnFocus("c2"), false, "client c2's fresh rail must not claim client c1's marker");
  });
});

test("a marker is TAKEN ONCE regardless of the read's outcome — match or mismatch, the store is empty after", () => {
  const { storage } = memoryStorage();
  withStorage(storage, () => {
    rememberRailReturnFocus("c1");
    assert.equal(takeRailReturnFocus("c2"), false, "first read: scope mismatch");
    assert.equal(takeRailReturnFocus("c1"), false, "second read: the marker is already gone, even though c1 would have matched it");
  });

  const { storage: storage2 } = memoryStorage();
  withStorage(storage2, () => {
    rememberRailReturnFocus("c1");
    assert.equal(takeRailReturnFocus("c1"), true, "first read: a real match");
    assert.equal(takeRailReturnFocus("c1"), false, "second read: nothing left to give");
  });
});

test("an unavailable or throwing store costs the focus position and NEVER the navigation", () => {
  // `sessionStorage` throws on access in some private modes and can be disabled outright. Every
  // path degrades to "nothing to restore", which is the behaviour that shipped before this module.
  const throwing = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  withStorage(throwing, () => {
    assert.doesNotThrow(() => rememberRailReturnFocus("c1"));
    assert.equal(takeRailReturnFocus("c1"), false);
  });

  // And the accessor itself throwing — the shape `signup-email-storage.ts` guards for.
  const g = asWindow();
  const hadWindow = "window" in g;
  const previous = g.window;
  g.window = {} as Win;
  Object.defineProperty(g.window as object, "sessionStorage", {
    configurable: true,
    get() { throw new Error("blocked"); },
  });
  try {
    assert.doesNotThrow(() => rememberRailReturnFocus("c1"));
    assert.equal(takeRailReturnFocus("c1"), false);
  } finally {
    if (!hadWindow) delete g.window; else g.window = previous;
  }
});

test("no window (server-side) answers false rather than throwing", () => {
  const g = asWindow();
  const hadWindow = "window" in g;
  const previous = g.window;
  delete g.window;
  try {
    assert.doesNotThrow(() => rememberRailReturnFocus("c1"));
    assert.equal(takeRailReturnFocus("c1"), false);
  } finally {
    if (hadWindow) g.window = previous;
  }
});
