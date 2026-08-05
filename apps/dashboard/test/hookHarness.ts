// A dependency-free driver for hook-only components (bootstrap.mjs's precedent: when the plain
// Node test process is missing something React wants, hand-roll the smallest honest stub rather
// than take a test dependency).
//
// The dashboard suite renders through `renderToStaticMarkup` — one pass, no effects, no state.
// That is the right instrument for a presentational component and the wrong one for a CONTROLLER
// hook, whose whole subject matter is what happens over time: an effect arms an interval, a
// timer fires, an await resolves, and the question is which of those writes to a field wins. So
// this harness mounts the real hook through the real `react-dom/client` and lets the test drive
// the clock, with no jsdom and no new package.
//
// WHAT IT SHIMS, AND WHY THAT IS ENOUGH. The component under test renders `null`, so React never
// creates, diffs or removes a host node — it only needs a container that answers as an element,
// and the handful of document/window properties the commit phase touches unconditionally
// (`ownerDocument`, `defaultView.HTMLIFrameElement` and `activeElement`, read by the
// selection-restore pass). Everything here is reached by mounting; nothing is speculative
// padding. A component that renders real markup would need a real DOM — use the static-markup
// idiom for those, as the rest of the suite does.
//
// ORDERING IS LOAD-BEARING: `react-dom/client` reads these globals as it evaluates, so it is
// imported dynamically, on the first mount, AFTER `installDom()` has run at module scope. (The
// import cannot be hoisted to a top-level await either — tsx compiles this package's `.ts` to
// CJS, which has none.)

import { createElement, act as reactAct } from "react";

type Stub = Record<string, unknown>;

function mkNode(tag: string, doc: Stub): Stub {
  const children: Stub[] = [];
  const node: Stub = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    childNodes: children,
    parentNode: null,
    style: {},
    ownerDocument: doc,
    appendChild(c: Stub) { children.push(c); c.parentNode = node; return c; },
    removeChild(c: Stub) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
    insertBefore(c: Stub) { children.push(c); c.parentNode = node; return c; },
    setAttribute() {}, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    get firstChild() { return children[0] ?? null; },
    get lastChild() { return children[children.length - 1] ?? null; },
  };
  return node;
}

function installDom(): void {
  if ((globalThis as Stub).document) return; // idempotent — several test files may import this
  class HTMLIFrameElement {}
  const doc: Stub = {
    nodeType: 9,
    createElement: (t: string) => mkNode(t, doc),
    createElementNS: (_ns: string, t: string) => mkNode(t, doc),
    createTextNode: (t: unknown) => ({ nodeType: 3, nodeValue: String(t), ownerDocument: doc, parentNode: null }),
    createComment: (t: unknown) => ({ nodeType: 8, nodeValue: String(t), ownerDocument: doc, parentNode: null }),
    addEventListener() {}, removeEventListener() {},
  };
  doc.documentElement = mkNode("html", doc);
  doc.body = mkNode("body", doc);
  doc.activeElement = doc.body;
  const win: Stub = {
    document: doc, HTMLIFrameElement,
    addEventListener() {}, removeEventListener() {},
    navigator: { userAgent: "node" },
    location: { href: "http://localhost/" },
  };
  doc.defaultView = win;
  (globalThis as Stub).document = doc;
  (globalThis as Stub).window = win;
  (globalThis as Stub).navigator = win.navigator;
  (globalThis as Stub).IS_REACT_ACT_ENVIRONMENT = true;
}

installDom();

type Root = { render: (el: unknown) => void; unmount: () => void };
let createRoot: ((c: unknown) => Root) | null = null;

async function loadRenderer(): Promise<(c: unknown) => Root> {
  if (!createRoot) {
    createRoot = ((await import("react-dom/client")) as unknown as { createRoot: (c: unknown) => Root }).createRoot;
  }
  return createRoot;
}

export type HookHarness<T> = {
  /** The hook's return value as of the last render. */
  readonly current: T;
  /** Run `fn` inside React's `act`, so every state update it provokes is flushed before it
   *  returns. Wrap timer ticks and hook calls in this. */
  act: (fn?: () => void | Promise<void>) => Promise<void>;
  /** Let pending promise chains settle (a real macrotask hop — the interview surface awaits a
   *  fetch, then a `.json()`, so a single microtask drain is not enough), then flush React. A
   *  cell using node:test mock timers must therefore leave `setTimeout` unmocked. */
  settle: () => Promise<void>;
  unmount: () => Promise<void>;
};

/** Mount `hook` in a throwaway root and return a handle for driving it. The hook must render
 *  nothing — this is a controller driver, not a renderer. Always `unmount()` in a finally, or
 *  the poller's interval outlives the cell. */
export async function renderHook<T>(hook: () => T): Promise<HookHarness<T>> {
  let latest!: T;
  const Probe = () => { latest = hook(); return null; };

  const root = (await loadRenderer())(document.createElement("div"));

  const act = async (fn?: () => void | Promise<void>) => {
    await reactAct(async () => { if (fn) await fn(); });
  };

  await act(() => { root.render(createElement(Probe)); });

  return {
    get current() { return latest; },
    act,
    settle: async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); },
    unmount: async () => { await act(() => { root.unmount(); }); },
  };
}
