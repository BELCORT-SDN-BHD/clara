// A dependency-free driver for controller hooks, ported verbatim (mechanism, not
// look) from apps/dashboard/test/hookHarness.ts. Its own header explains the
// rationale better than a summary would:
//
// "The dashboard suite renders through `renderToStaticMarkup` — one pass, no
// effects, no state. That is the right instrument for a presentational component
// and the wrong one for a CONTROLLER hook, whose whole subject matter is what
// happens over time: an effect arms an interval, a timer fires, an await
// resolves, and the question is which of those writes to a field wins. So this
// harness mounts the real hook through the real `react-dom/client` and lets the
// test drive the clock, with no jsdom and no new package."
//
// WHAT IT SHIMS, AND WHY THAT IS ENOUGH: the component under test renders `null`,
// so React never creates, diffs or removes a host node — it only needs a
// container that answers as an element, and the handful of document/window
// properties the commit phase touches unconditionally.

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
  /** Let pending promise chains settle (a real macrotask hop), then flush React. */
  settle: () => Promise<void>;
  /** Re-render the SAME probe element (an update, not a remount) — for a test
   *  that swaps what an outer closure captures (e.g. a fresh inline loader or
   *  session, simulating a parent re-render) between renders, then must force
   *  an actual render before asserting whether the hook picked up the new
   *  value (P3 loader-stability hardening). */
  rerender: () => Promise<void>;
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
    rerender: async () => { await act(() => { root.render(createElement(Probe)); }); },
    unmount: async () => { await act(() => { root.unmount(); }); },
  };
}
