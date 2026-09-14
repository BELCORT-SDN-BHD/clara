import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";

import { ClaraRailChrome } from "./rail-chrome";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import { claraThreadStore } from "../../lib/clara/threadStore";

enableDomInspection();

type Stub = Record<string, unknown>;
const attr = (node: Stub, name: string): string | null => {
  const get = node.getAttribute as ((n: string) => string | null) | undefined;
  return get ? get.call(node, name) : null;
};
const hasAttr = (node: Stub, name: string): boolean => attr(node, name) !== null;

// #614 AC6 — one overlay stack. While the mobile navigation Sheet is open the
// rail must be inert: the browser leg measured Base UI's hide-others sweep
// reaching the sidebar inset but not this sibling. The prop is the whole
// contract; rail-mount.tsx derives it from the sidebar context.
test("inert reaches BOTH the scrim and the wrapper, and is absent otherwise", async () => {
  claraThreadStore.setRailOpen(true);
  const rail = (inert: boolean) =>
    createElement(ClaraRailChrome, { inert, children: createElement("div", { "data-probe": "" }, "rail") });

  const on = await renderComponent(rail(true));
  try {
    const marked = [] as Stub[];
    const walk = (n: Stub) => {
      if (hasAttr(n, "inert")) marked.push(n);
      for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
    };
    walk(on.container);
    assert.equal(marked.length, 2, "expected the scrim and the wrapper to carry inert");
    const wrapper = on.find((n) => attr(n, "tabindex") === "-1");
    assert.ok(wrapper && hasAttr(wrapper, "inert"), "the focusable wrapper is not inert");
  } finally {
    await on.unmount();
  }

  const off = await renderComponent(rail(false));
  try {
    const any = off.find((n) => hasAttr(n, "inert"));
    assert.ok(any == null, "inert leaked onto the rail while no modal is above it");
  } finally {
    await off.unmount();
    claraThreadStore.setRailOpen(true);
  }
});

/**
 * #736 — THE RULE, AT THE LEVEL THE RULE LIVES AT.
 *
 * WHY THESE ARE NODE CELLS AND NOT ONLY BROWSER ONES. The browser leg
 * (`e2e/responsive-shell-walk.spec.ts`) proves the JOURNEY — a real resize, a
 * real 200% zoom, a real launcher left behind — and it is the only instrument
 * that can. What it cannot do cheaply is drive the three cases that
 * DISCRIMINATE the rule from a blunter one: a crossing back to WIDE (which must
 * change nothing), a rail the human opened AT a narrow width (which must
 * survive), and a host with no `matchMedia` at all (which must not throw). Each
 * of those is one store read here, and each is a rule a resize-driven
 * auto-close gets wrong in a different direction.
 *
 * THE TITLES SAY "issue 736" RATHER THAN THE `#` FORM, and that is a lint
 * constraint rather than a style choice: eslint.config.mjs's raw-colour selector
 * reads `#736` inside a string LITERAL as a three-digit hex colour and reds the
 * file. Comments are not literals, so the prose here keeps the `#` spelling.
 *
 * THE STORE IS THE ASSERTION, deliberately. #736's own brief says the thread
 * store gains no breakpoint awareness: the rule lives in this chrome and its
 * only expression is a write of `railOpen`. So these cells read
 * `claraThreadStore.isRailOpen()` rather than counting DOM nodes — the latter
 * would pass just as happily if the panel were hidden by a class while the
 * state stayed open, which is a different product.
 */

type MediaListener = () => void;

type StubMediaQueryList = {
  matches: boolean;
  media: string;
  addEventListener: (type: string, cb: MediaListener) => void;
  removeEventListener: (type: string, cb: MediaListener) => void;
};

const harnessWindow = (): Stub => (globalThis as unknown as { window: Stub }).window;

function installMatchMedia(matches: boolean): {
  cross: (to: boolean) => void;
  listeners: () => number;
  restore: () => void;
} {
  const win = harnessWindow();
  const listeners = new Set<MediaListener>();
  const mql: StubMediaQueryList = {
    matches,
    media: "(width < 64rem)",
    addEventListener: (_type, cb) => { listeners.add(cb); },
    removeEventListener: (_type, cb) => { listeners.delete(cb); },
  };
  win.matchMedia = () => mql;
  return {
    // A REAL `change` FIRES ONLY ON A FLIP, which is the property the production
    // code leans on, so this stub refuses to fire without one rather than
    // letting a cell prove something a browser would never hand it.
    cross: (to: boolean) => {
      if (mql.matches === to) throw new Error("matchMedia does not fire `change` without a flip");
      mql.matches = to;
      for (const cb of [...listeners]) cb();
    },
    listeners: () => listeners.size,
    restore: () => { delete win.matchMedia; },
  };
}

/** The overlay arm's `[open]` effect asks the wrapper whether focus is inside it
 *  when the rail closes. The harness's stub nodes have no `contains`, and the
 *  honest answer here is "no" — these cells are not about focus return, which
 *  the browser leg owns (`responsive-shell-walk.spec.ts`'s launcher-focus cell). */
function stubContains(h: { find: (p: (n: Stub) => boolean) => Stub | null }): void {
  const wrapper = h.find((n) => attr(n, "tabindex") === "-1");
  if (wrapper) wrapper.contains = () => false;
}

const chrome = () =>
  createElement(ClaraRailChrome, { children: createElement("div", { "data-probe": "" }, "rail") });

test("issue 736 — crossing from wide into narrow closes the rail, and crossing back to wide changes nothing", async () => {
  const media = installMatchMedia(false);
  claraThreadStore.setRailOpen(true);
  const h = await renderComponent(chrome());
  try {
    // MOUNTED WIDE: the mount check must not fire. Without this the next
    // assertion would pass for a component that closes the rail unconditionally.
    assert.equal(claraThreadStore.isRailOpen(), true, "the rail was closed at a WIDE viewport");
    assert.equal(media.listeners(), 1, "the chrome did not subscribe to the narrow media query");
    stubContains(h);

    await h.act(() => { media.cross(true); });
    assert.equal(claraThreadStore.isRailOpen(), false, "crossing into narrow did not close the rail");

    // THE HUMAN OPENS IT AT THE NARROW WIDTH — and it stays open, because nothing
    // re-runs until the viewport crosses again.
    await h.act(() => { claraThreadStore.setRailOpen(true); });
    assert.equal(claraThreadStore.isRailOpen(), true);

    // …AND CROSSING BACK TO WIDE NEITHER OPENS NOR CLOSES IT.
    await h.act(() => { media.cross(false); });
    assert.equal(claraThreadStore.isRailOpen(), true, "crossing back to wide touched the rail");
  } finally {
    await h.unmount();
    assert.equal(media.listeners(), 0, "the media listener outlived the chrome that installed it");
    media.restore();
    claraThreadStore.setRailOpen(true);
  }
});

test("issue 736 — a rail the human opened at a narrow width survives — only a CROSSING closes it", async () => {
  // Mounted already narrow: the first load closes it (the behaviour that
  // predates this ticket), the human opens it, and nothing closes it again.
  const media = installMatchMedia(true);
  claraThreadStore.setRailOpen(true);
  const h = await renderComponent(chrome());
  try {
    assert.equal(claraThreadStore.isRailOpen(), false, "a narrow first load must leave the launcher");
    stubContains(h);
    await h.act(() => { claraThreadStore.setRailOpen(true); });
    // A client-side navigation does not remount this chrome (`RailMount` sits
    // outside the client key — rail-mount.tsx's header), so the closest thing a
    // node cell can do to one is re-render it, which must change nothing.
    await h.rerender(chrome());
    assert.equal(claraThreadStore.isRailOpen(), true, "a re-render closed a rail the human had opened");
  } finally {
    await h.unmount();
    media.restore();
    claraThreadStore.setRailOpen(true);
  }
});

test("issue 736 — a host with no matchMedia mounts, subscribes to nothing, and leaves the rail alone", async () => {
  // The node harness IS that host (test/hookHarness.ts installs a window with no
  // `matchMedia`), which is why this cell installs nothing. Before the guard, the
  // same shape threw out of a passive effect and React reported it only as a
  // generic concurrent-rendering error.
  assert.equal(
    typeof harnessWindow().matchMedia,
    "undefined",
    "this cell is vacuous unless the harness window genuinely lacks matchMedia",
  );
  claraThreadStore.setRailOpen(true);
  const h = await renderComponent(chrome());
  try {
    assert.equal(claraThreadStore.isRailOpen(), true, "a host that cannot tell the arm must not guess one");
  } finally {
    await h.unmount();
    claraThreadStore.setRailOpen(true);
  }
});
