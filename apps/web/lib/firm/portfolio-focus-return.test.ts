// #659 (fix round 1, finding A3) — the focus-return marker's own contract.
//
// The BROWSER half of this (does focus actually land on the link after Back?) is not assertable
// here and is not asserted here: `apps/web/e2e/home-board-walk.spec.ts`'s `p659.home.drilldown`
// reads `document.activeElement?.getAttribute("aria-label")` on the real build, per leg, against
// that leg's own name. What this file pins is everything that can be got wrong without a browser:
// the take-ONCE semantics, the id spelling shared with the link, and the refusal to throw when the
// store is unavailable.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  portfolioCountLinkId,
  rememberPortfolioReturnFocus,
  takePortfolioReturnFocus,
} from "./portfolio-focus-return";

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

test("the link id and the remembered marker are the SAME string — what is stored is what is focused", () => {
  const { store, storage } = memoryStorage();
  withStorage(storage, () => {
    rememberPortfolioReturnFocus("c1", "recent_success");
    assert.equal([...store.values()][0], portfolioCountLinkId("c1", "recent_success"));
    assert.equal(takePortfolioReturnFocus(), "portfolio-count-c1-recent_success");
  });
});

test("a marker is TAKEN ONCE — it can move focus one time, not every thirty seconds", () => {
  // This board re-reads on four triggers, one of them a 30 s tick. A marker that survived its own
  // use would yank the caret out of whatever the person had moved on to, on every tick.
  const { storage } = memoryStorage();
  withStorage(storage, () => {
    rememberPortfolioReturnFocus("c1", "active");
    assert.equal(takePortfolioReturnFocus(), "portfolio-count-c1-active");
    assert.equal(takePortfolioReturnFocus(), null, "the second read has nothing to give");
    assert.equal(takePortfolioReturnFocus(), null);
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
    assert.doesNotThrow(() => rememberPortfolioReturnFocus("c1", "active"));
    assert.equal(takePortfolioReturnFocus(), null);
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
    assert.doesNotThrow(() => rememberPortfolioReturnFocus("c1", "active"));
    assert.equal(takePortfolioReturnFocus(), null);
  } finally {
    if (!hadWindow) delete g.window; else g.window = previous;
  }
});

test("an EMPTY stored value is 'nothing to restore', not an id", () => {
  const { store, storage } = memoryStorage();
  withStorage(storage, () => {
    store.set("clara-firm-portfolio-return-focus", "");
    assert.equal(takePortfolioReturnFocus(), null);
  });
});
