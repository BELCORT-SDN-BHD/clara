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
// WHAT IT SHIMS, AND WHY THAT IS ENOUGH (renderHook): the component under test
// renders `null`, so React never creates, diffs or removes a host node — it
// only needs a container that answers as an element, and the handful of
// document/window properties the commit phase touches unconditionally.
//
// `renderComponent` (below) is the SAME shim extended to mount a REAL
// element tree — see its own header for what that needed on top.

import { createElement, act as reactAct, type ReactElement } from "react";

type Stub = Record<string, unknown>;

// Minimal `instanceof HTMLElement` (and the tag-specific subclasses)
// support: @base-ui/react's internals (the shadcn Button/Input primitives
// this build's components render) branch on `instanceof HTMLElement` in a
// few ref callbacks — with NO such global defined at all, that throws a
// bare ReferenceError instead of just returning false. Each class is
// otherwise EMPTY (no DOM behaviour) — `mkNode` reparents each stub node
// onto the tag-appropriate one purely so the `instanceof` check resolves
// without crashing.
class HTMLElementStub {}

// react-dom's OWN controlled-input change detection (inputValueTracking.js's
// `trackValueOnNode`) requires `Object.getOwnPropertyDescriptor(node.
// constructor.prototype, 'value' | 'checked')` to already exist with BOTH a
// getter and setter, so it can WRAP that native pair to record every write.
// With NO such descriptor at all (an empty class), `track()` silently
// installs no tracker, and downstream base-ui/@floating-ui form-control
// wrappers that lean on that same value/checked property access can throw
// or silently drop a write instead of failing open — found chasing exactly
// that in the matching-section interaction tests. Each backing store is a
// plain WeakMap so distinct nodes never share state.
const valueStore = new WeakMap<object, string>();
const checkedStore = new WeakMap<object, boolean>();

class HTMLInputElementStub extends HTMLElementStub {
  get value(): string { return valueStore.get(this) ?? ""; }
  set value(v: string) { valueStore.set(this, v); }
  get checked(): boolean { return checkedStore.get(this) ?? false; }
  set checked(v: boolean) { checkedStore.set(this, v); }
}
class HTMLSelectElementStub extends HTMLElementStub {
  get value(): string { return valueStore.get(this) ?? ""; }
  set value(v: string) { valueStore.set(this, v); }
}
class HTMLButtonElementStub extends HTMLElementStub {}
class HTMLTextAreaElementStub extends HTMLElementStub {
  get value(): string { return valueStore.get(this) ?? ""; }
  set value(v: string) { valueStore.set(this, v); }
}
class HTMLAnchorElementStub extends HTMLElementStub {}

function elementClassFor(tag: string): typeof HTMLElementStub {
  switch (tag.toLowerCase()) {
    case "input": return HTMLInputElementStub;
    case "select": return HTMLSelectElementStub;
    case "button": return HTMLButtonElementStub;
    case "textarea": return HTMLTextAreaElementStub;
    case "a": return HTMLAnchorElementStub;
    default: return HTMLElementStub;
  }
}

function mkNode(tag: string, doc: Stub): Stub {
  const children: Stub[] = [];
  // RENDER-HARNESS EXTENSION (independent review on web/p3-bank, interaction-
  // tests requirement): `addEventListener`/`removeEventListener` now
  // genuinely STORE listeners (keyed by event type) instead of no-opping —
  // this is what lets `renderComponent`'s `fireEvent` reach a real onClick/
  // onChange handler. React 17+ delegates most interactive events to ONE
  // listener registered on the ROOT CONTAINER (never on individual nodes),
  // which then resolves the target fiber ITSELF by reading the internal
  // instance key react-dom already stamps onto every host node it commits —
  // a mechanism that works identically whether the "DOM node" is a real
  // browser element or, as here, a plain stub object react-dom treats as
  // one. `fireEvent` therefore never needs to walk this stub tree's own
  // parent chain; it only has to invoke whatever the container captured.
  const listeners: Record<string, ((evt: Stub) => void)[]> = {};
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
    // BUG FIX (found chasing the matching-section interaction test): this
    // ALWAYS appended, ignoring `ref` — react-dom calls insertBefore to
    // place a node BEFORE an existing sibling (not only at the end) whenever
    // it inserts into the MIDDLE of an already-committed children list
    // (e.g. a conditionally-rendered subtree replacing a "loading" node
    // that sits before a LATER, already-mounted sibling). Silently
    // appending instead corrupted every DOM-ORDER-dependent read
    // (`textOf`'s document-order walk, an ordinal `find()`) without
    // affecting react's OWN reconciliation at all (react tracks children by
    // object reference, not by this array's order) — the exact kind of bug
    // that only a real interaction test, never a renderHook-only one,
    // could ever have surfaced.
    insertBefore(c: Stub, ref: Stub | null) {
      const i = ref ? children.indexOf(ref) : -1;
      if (i >= 0) children.splice(i, 0, c); else children.push(c);
      c.parentNode = node;
      return c;
    },
    setAttribute() {}, removeAttribute() {},
    addEventListener(type: string, fn: (evt: Stub) => void) { (listeners[type] ??= []).push(fn); },
    removeEventListener(type: string, fn: (evt: Stub) => void) {
      if (listeners[type]) listeners[type] = listeners[type].filter((l) => l !== fn);
    },
    __listeners: listeners,
    get firstChild() { return children[0] ?? null; },
    get lastChild() { return children[children.length - 1] ?? null; },
    // <select>'s own commit path (react-dom's `updateOptions`) reads
    // `node.options` (an HTMLOptionsCollection-alike) and needs `multiple`
    // settable — without these two, mounting any <select> throws.
    get options() { return children.filter((c) => c.tagName === "OPTION"); },
    multiple: false,
  };
  Object.setPrototypeOf(node, elementClassFor(tag).prototype);
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
  // See elementClassFor's own header — @base-ui/react's ref callbacks check
  // `instanceof HTMLElement` (and friends); leaving these undefined throws
  // a bare ReferenceError instead of the false these checks are prepared
  // for. @floating-ui/utils's own isHTMLElement checks BOTH the global AND
  // `node.ownerDocument.defaultView.HTMLElement` (a cross-realm safety net
  // real browsers need for iframes) — `win` needs its own copies too, or
  // that second check throws "right-hand side of instanceof is not an
  // object" on the undefined property instead of returning false.
  for (const [name, cls] of [
    ["HTMLElement", HTMLElementStub], ["HTMLInputElement", HTMLInputElementStub],
    ["HTMLSelectElement", HTMLSelectElementStub], ["HTMLButtonElement", HTMLButtonElementStub],
    ["HTMLTextAreaElement", HTMLTextAreaElementStub], ["HTMLAnchorElement", HTMLAnchorElementStub],
  ] as const) {
    (globalThis as Stub)[name] = cls;
    win[name] = cls;
  }
}

installDom();

/** The React Testing Library "native value setter" trick, ported to this
 *  stub: once react-dom's OWN change-tracker wraps `node.value`/`node.
 *  checked` (installed the first time ANY react-controlled write touches
 *  it — trackValueOnNode in react-dom-client.development.js), writing
 *  through that SAME wrapped property (a plain `node.value = x`) ALSO
 *  updates the tracker's own snapshot as a side effect — so when the test
 *  THEN dispatches the native event, react's `updateValueIfChanged` compares
 *  the snapshot to itself and concludes "nothing changed", and never calls
 *  onChange at all. A REAL browser never hits this: native user input
 *  changes the underlying value WITHOUT going through react's JS setter, so
 *  the snapshot and the live value genuinely differ when the event fires.
 *  This function reproduces that by calling the ORIGINAL prototype setter
 *  (from BEFORE react's per-instance override) directly via `.call`,
 *  exactly as RTL's `fireEvent` does against a real DOM — use this, never a
 *  plain property write, whenever a test needs to set `value` or `checked`
 *  ahead of dispatching a native "input"/"change"/"click" event. */
export function setNativeValue(node: Stub, field: "value" | "checked", value: string | boolean): void {
  const proto = Object.getPrototypeOf(node) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, field);
  if (descriptor?.set) descriptor.set.call(node, value);
  else node[field] = value;
}

/** Sets a text/number field's value and invokes its React `onChange` prop
 *  DIRECTLY, bypassing native event dispatch entirely — needed for any
 *  `@base-ui/react` primitive (shadcn's `<Input>` among them) whose OWN
 *  onChange wrapper (`Field.Control`, base-ui/react/input/Input.mjs) reads
 *  `event.currentTarget`/`event.nativeEvent` itself before ever forwarding
 *  to the consumer's onChange via base-ui's own prop-merging. A plain
 *  dispatched "input"/"change" event via this harness's `fireEvent` (which
 *  mirrors what react-dom's OWN delegated listener would hand a handler)
 *  never gets that wrapper far enough to forward the call, so the
 *  consumer's onChange is simply never invoked and the field's own React
 *  state silently stays at its initial value — a real risk of a false-
 *  positive test (a refusal renders regardless of whether the typed value
 *  ever reached the wire; only a body-content assertion catches it, as
 *  matching-section.test.tsx's unmatch-form test did once it started
 *  checking the actual request body instead of only the rendered refusal).
 *  Call this INSIDE `h.act(...)` for every base-ui-backed field; plain host
 *  `<input>`/`<select>` elements with no base-ui wrapper still work fine
 *  through real `fireEvent` + `setNativeValue`. */
export function setFieldValue(node: Stub, value: string): void {
  setNativeValue(node, "value", value);
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, { onChange?: (e: unknown) => void }>)[propsKey] : undefined;
  const nativeEvent = { type: "input", target: node, defaultPrevented: false };
  props?.onChange?.({
    target: node, currentTarget: node, nativeEvent,
    persist() {}, preventDefault() {}, stopPropagation() {},
  });
}

/** Invokes a node's own `onClick` prop DIRECTLY, bypassing `fireEvent`'s
 *  delegated dispatch entirely — the SAME reasoning `setFieldValue` above
 *  already documents for `onChange`, discovered chasing a T6 door-dialog
 *  confirm-click test that silently never reached its handler. `fireEvent`
 *  dispatches only through `container.__listeners[type]` (this file's own
 *  header on that function: "React 17+ delegates most interactive events to
 *  ONE listener registered on the ROOT CONTAINER") — true for content
 *  committed directly under `container`, but a `@base-ui/react` Dialog's
 *  open content is a PORTAL into `document.body`, a SEPARATE delegation
 *  root `fireEvent` never reaches (confirmed: even reading `document.body`'s
 *  OWN captured listeners and invoking them with a synthetic event did not
 *  reach the handler — whatever internal root-correlation react-dom's
 *  dispatcher needs did not resolve correctly for a node whose commit target
 *  is a portal). Reading `__reactProps$…` directly (react-dom stamps this on
 *  every committed host node) and calling `onClick` sidesteps the whole
 *  delegation question. Call this INSIDE `h.act(...)` for a control INSIDE
 *  an open portaled Dialog whose `onClick` is the CALLER'S OWN plain
 *  function (a door dialog's confirm button, wired straight to `onConfirm`)
 *  — proven end to end (journals-governance-keyboard.test.tsx's WITHDRAW
 *  confirm test). It does NOT work for `@base-ui/react`'s own `DialogClose`
 *  (Cancel): that component's internal click handler chain
 *  (FloatingFocusManager) calls `event instanceof KeyboardEvent`, and this
 *  harness's fake DOM defines no such global — a SEPARATE, deeper gap this
 *  function does not close (recorded, not fixed, at the T6 fix-round site
 *  that found it). A plain host button OUTSIDE any portal still works fine
 *  through `h.fireEvent`. */
export function clickButton(node: Stub): void {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, { onClick?: (e: unknown) => void }>)[propsKey] : undefined;
  props?.onClick?.({
    type: "click", target: node, currentTarget: node, bubbles: true, cancelable: true,
    defaultPrevented: false, isTrusted: true, timeStamp: Date.now(),
    preventDefault() {}, stopPropagation() {}, persist() {},
  });
}

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

// ---------------------------------------------------------------------------
// renderComponent — the MINIMAL extension into an actual render harness
// (independent review on web/p3-bank: "extend test/hookHarness.ts minimally
// … the runway is short since hookHarness already mounts hooks for real").
// Unlike `renderHook`'s `Probe` (which always renders null), this mounts a
// REAL element tree — mocked-fetch-driven components (useHydratedPart's own
// mount effect + a card's actual JSX) render through it exactly as they
// would in the browser, letting a test assert on RENDERED TEXT ("—" vs a
// fabricated "RM 0.00") and on ACTUAL USER INTERACTION (a click, a select's
// change) rather than only on the underlying hook/lib state.
// ---------------------------------------------------------------------------

/** Exported so a test can extract the text under ANY node it `find()`s (an
 *  <option>, a specific <li>, …), not only the whole container. */
export function textOf(node: Stub): string {
  if (node.nodeType === 3) return String(node.nodeValue ?? "");
  const kids = (node.childNodes as Stub[] | undefined) ?? [];
  if (kids.length > 0) return kids.map(textOf).join("");
  // react-dom's single-text-child optimization sets `node.textContent =`
  // directly (a property write) instead of appending a synthetic text
  // node — the ONLY other place rendered text lives.
  return typeof node.textContent === "string" ? (node.textContent as string) : "";
}

function walk(node: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(node)) return node;
  for (const c of (node.childNodes as Stub[] | undefined) ?? []) {
    const found = walk(c, predicate);
    if (found) return found;
  }
  return null;
}

export type RenderHarness = {
  /** The mount root's own stub node — walk it directly for anything `find`/`text` don't cover. */
  readonly container: Stub;
  /** Every text node's value, document order, concatenated with no separator
   *  (matching `Element.textContent`'s own semantics) — assert with `assert.match`. */
  text(): string;
  /** First node (depth-first) matching `predicate`, or null. */
  find(predicate: (node: Stub) => boolean): Stub | null;
  /** Dispatch a fake native event at the CONTAINER's own delegated listener
   *  for `type` (React 17+'s actual dispatch boundary — see mkNode's own
   *  header) with `target` set to `node`. `mutate`, when given, runs BEFORE
   *  dispatch (e.g. `(n) => { n.value = "b"; }` for a `<select>`/`<input>`
   *  change) — mirroring how a real browser updates the control's OWN value
   *  before it ever fires the event. Wrapped in `act()`. */
  fireEvent(node: Stub, type: string, mutate?: (n: Stub) => void): Promise<void>;
  act: (fn?: () => void | Promise<void>) => Promise<void>;
  settle: () => Promise<void>;
  unmount: () => Promise<void>;
};

/** Mount `element` (a REAL component tree, not a null-returning probe) in a
 *  throwaway root. Always `unmount()` in a finally. */
export async function renderComponent(element: ReactElement): Promise<RenderHarness> {
  const container = document.createElement("div") as unknown as Stub;
  const root = (await loadRenderer())(container);

  const act = async (fn?: () => void | Promise<void>) => {
    await reactAct(async () => { if (fn) await fn(); });
  };

  await act(() => { root.render(element); });

  return {
    container,
    text: () => textOf(container),
    find: (predicate) => walk(container, predicate),
    fireEvent: async (node, type, mutate) => {
      await act(() => {
        mutate?.(node);
        const listeners = (container.__listeners as Record<string, ((evt: Stub) => void)[]> | undefined)?.[type] ?? [];
        const evt: Stub = {
          type, target: node, currentTarget: container, bubbles: true, cancelable: true,
          defaultPrevented: false, isTrusted: true, timeStamp: Date.now(),
          preventDefault() { evt.defaultPrevented = true; },
          stopPropagation() {},
          persist() {},
        };
        for (const l of [...listeners]) l(evt);
      });
    },
    act,
    settle: async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); },
    unmount: async () => { await act(() => { root.unmount(); }); },
  };
}
