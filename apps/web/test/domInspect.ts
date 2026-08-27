// test/domInspect.ts — an ADDITIVE capability layer on top of
// test/hookHarness.ts's stub DOM, built for the a11y CI gates (owner ruling
// Q7, docs/plan/active/mohe-grill-rulings-2026-08-27.md). NEW FILE, per that
// grill's own instruction: "document exactly what you stubbed additively in
// the harness's OWN new helper file, never weakening existing behavior" —
// hookHarness.ts itself is untouched; every capability here is bolted on
// from outside by monkey-patching `document.createElement`/`createTextNode`
// (both already own-properties of the `document` stub hookHarness installs,
// so reassigning them here changes nothing hookHarness's own tests rely on —
// no existing test reads `getAttribute`/`classList`/`textContent`, so
// nothing is weakened) plus wrapping every node those functions return.
//
// WHY THIS FILE EXISTS — the axe-core feasibility spike, recorded honestly:
// gate (b) (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q7) asks for
// axe-core scans over harness-rendered trees. A real, vendored axe-core
// (npm-packed at its published version straight into a scratch dir — never
// added to package.json's dependencies, per this lane's hard scope wall)
// WAS made to load and RUN against hookHarness's stub DOM, but only after
// ~14 rounds of additive DOM shimming (a real attribute store, `classList`,
// `Node`/`Element`/`NamedNodeMap`/`NodeList` globals, node-type + document-
// position constants, `compareDocumentPosition`, linking `documentElement`
// to `body` to `document` the way a real DOM does, `window.screen`, …) —
// and even then it produced a CONFIRMED FALSE POSITIVE: a `<button>Save</
// button>` (a real, correctly-labelled control) was reported as having no
// discernible text, because axe-core's own accessible-name/visibility
// algorithm depends on real layout geometry (`getComputedStyle` cascades,
// `Range`/`getClientRects`) that no amount of REASONABLE additive stubbing
// reproduces correctly — and a11y gate results a maintainer cannot trust are
// worse than no gate (AGENTS.md review law 2: only what a read actually SAW
// counts as evidence; an unreliable read is not a read). Bringing in a real
// browser or jsdom would close that gap properly, but both are new
// dependencies / new CI legs, outside this lane's hard scope wall.
//
// So gate (b) (test/a11yRules.ts) is a DELIBERATE, clearly-labelled
// substitute: a small, hand-written, WCAG-mapped structural rule set —
// modelled on the same axe-core rule IDs for traceability, but NOT axe-core
// — that only needs the capabilities THIS file actually adds correctly:
// attribute presence/values, tag names, text content, and simple tree
// walking. None of that touches the geometry/visibility computation that
// broke axe-core's own algorithm, so this substitute does not inherit that
// failure mode. See the report delivered alongside this branch for the full
// account: this is a partial, named substitution for Q7's literal ask, not
// silently passed off as axe.
//
// This same enhancement also backs the gate (c) keyboard-walk tests
// (test/a11yRules.ts's focusability helpers and the `.focus()`/`document.
// activeElement` tracking below), since both gates need to read real
// attributes (`tabindex`, `disabled`, `aria-*`) off the SAME live-mounted
// tree `renderComponent` produces.

type Stub = Record<string, unknown> & {
  tagName?: string;
  nodeType?: number;
  nodeValue?: string;
  parentNode?: Stub | null;
  childNodes?: Stub[];
  ownerDocument?: Stub;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  classList?: { contains: (c: string) => boolean; add: (...cs: string[]) => void; remove: (...cs: string[]) => void; toggle: (c: string) => boolean };
};

const attrStores = new WeakMap<Stub, Map<string, string>>();

function attrsFor(node: Stub): Map<string, string> {
  let m = attrStores.get(node);
  if (!m) {
    m = new Map();
    attrStores.set(node, m);
  }
  return m;
}

function syncClassAttr(node: Stub, classes: Set<string>): void {
  attrsFor(node).set("class", [...classes].join(" "));
}

function classesOf(node: Stub): Set<string> {
  const raw = attrsFor(node).get("class") ?? "";
  return new Set(raw.split(/\s+/).filter(Boolean));
}

/** A deliberately small compound-selector matcher (tag / #id / .class /
 *  [attr] / [attr=value], ANDed together, no combinators) — enough for
 *  @base-ui/react's floating-ui-react internals (Select's list navigation,
 *  Dialog's focus utilities), which call `element.matches()`/`closest()`/
 *  `querySelector(All)()` with simple attribute/role/tag probes, never a
 *  descendant or sibling combinator. */
function matchesSimpleSelector(node: Stub, selector: string): boolean {
  const parts = selector.match(/(\.[\w-]+|#[\w-]+|\[[^\]]+\]|[a-zA-Z][\w-]*|\*)/g) ?? [];
  for (const part of parts) {
    if (part === "*") continue;
    if (part.startsWith("#")) {
      if ((node.getAttribute?.("id") ?? "") !== part.slice(1)) return false;
    } else if (part.startsWith(".")) {
      if (!node.classList?.contains(part.slice(1))) return false;
    } else if (part.startsWith("[")) {
      const m = part.slice(1, -1).match(/^([\w-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?$/);
      if (!m) return false;
      const [, name, , val] = m;
      if (val === undefined) {
        if (!node.hasAttribute?.(name!)) return false;
      } else if (node.getAttribute?.(name!) !== val) return false;
    } else if (node.tagName !== part.toUpperCase()) {
      return false;
    }
  }
  return true;
}

function collectMatches(node: Stub, selector: string, out: Stub[]): void {
  for (const c of node.childNodes ?? []) {
    if (c.nodeType === 1 && matchesSimpleSelector(c, selector)) out.push(c);
    collectMatches(c, selector, out);
  }
}

/** Wraps one already-created stub node with the additive capabilities. Safe
 *  to call more than once on the same node (idempotent — later calls are a
 *  no-op because the properties already exist as own-properties). */
function enhanceElement(node: Stub): Stub {
  if (attrStores.has(node)) return node; // already enhanced
  const attrs = attrsFor(node);
  // hookHarness's `mkNode` gives every node a bare `style: {}` object (no
  // methods) — @base-ui/react's Popup/Dialog transition machinery writes
  // custom-property animation state via the REAL CSSOM `style.setProperty`
  // API, which that plain object never had.
  const style = (node.style ??= {}) as Record<string, unknown>;
  style.setProperty = (prop: string, value: string) => {
    style[prop] = value;
  };
  style.removeProperty = (prop: string) => {
    delete style[prop];
  };
  style.getPropertyValue = (prop: string) => (typeof style[prop] === "string" ? (style[prop] as string) : "");
  // `children` (ELEMENT-only, unlike `childNodes` which also carries text/
  // comment nodes) — @base-ui/react's FloatingFocusManager walks the WHOLE
  // document via `parent.children` to mark everything outside an open
  // dialog `aria-hidden`/inert, real focus-trap behaviour this repo's own
  // gate (c) keyboard-walk tests rely on.
  Object.defineProperty(node, "children", {
    configurable: true,
    get: () => (node.childNodes ?? []).filter((c) => c.nodeType === 1),
  });
  node.getAttribute = (name: string) => (attrs.has(name) ? attrs.get(name)! : null);
  node.hasAttribute = (name: string) => attrs.has(name);
  node.hasAttributes = () => attrs.size > 0;
  node.setAttribute = (name: string, value: unknown) => {
    attrs.set(name, String(value));
  };
  node.removeAttribute = (name: string) => {
    attrs.delete(name);
  };
  node.getAttributeNames = () => [...attrs.keys()];
  Object.defineProperty(node, "id", {
    configurable: true,
    get: () => attrs.get("id") ?? "",
    set: (v: string) => attrs.set("id", v),
  });
  // `disabled` (a boolean IDL property reflecting a boolean CONTENT
  // attribute — same shape as `checked`/`value` on form controls) is set by
  // react-dom as a PLAIN PROPERTY WRITE (`domElement.disabled = value`) for
  // every form-control host type, never via `setAttribute` — gate (c)'s own
  // `isKeyboardOperable` reading `hasAttribute("disabled")` alone missed a
  // REAL disabled `<button>` for exactly this reason (found by this file's
  // own RED-ON-MUTANT control, test/keyboardWalk.test.ts).
  Object.defineProperty(node, "disabled", {
    configurable: true,
    get: () => attrs.has("disabled"),
    set: (v: boolean) => {
      if (v) attrs.set("disabled", "");
      else attrs.delete("disabled");
    },
  });
  Object.defineProperty(node, "className", {
    configurable: true,
    get: () => attrs.get("class") ?? "",
    set: (v: string) => attrs.set("class", v),
  });
  // `<input type>` is ALSO a reflected IDL property react-dom writes as a
  // plain property assignment (not `setAttribute`) — the same class of gap
  // `disabled` had above, and found the same way (a `type="hidden"` input
  // read back as reachable until this existed). hookHarness.ts's own
  // `HTMLInputElementStub` defines `value`/`checked` accessors but not
  // `type`, so without this a plain own-property write here would silently
  // bypass the attribute store entirely.
  if (node.tagName === "INPUT") {
    Object.defineProperty(node, "type", {
      configurable: true,
      get: () => attrs.get("type") ?? "text",
      set: (v: string) => attrs.set("type", v),
    });
  }
  const classSet = classesOf(node);
  node.classList = {
    add: (...cs: string[]) => {
      cs.forEach((c) => classSet.add(c));
      syncClassAttr(node, classSet);
    },
    remove: (...cs: string[]) => {
      cs.forEach((c) => classSet.delete(c));
      syncClassAttr(node, classSet);
    },
    contains: (c: string) => classesOf(node).has(c),
    toggle: (c: string) => {
      const now = classesOf(node);
      if (now.has(c)) {
        now.delete(c);
        syncClassAttr(node, now);
        return false;
      }
      now.add(c);
      syncClassAttr(node, now);
      return true;
    },
  };
  // `textContent` as a real accessor (not a plain data property) so that
  // react-dom's own single-text-child optimization — a plain `node.
  // textContent = "…"` assignment, see hookHarness.ts's own header comment —
  // is intercepted by THIS setter instead of shadowing it with an own data
  // property. The getter always recomputes from the live child list, so it
  // is correct regardless of which path (this setter, or normal child
  // appendChild of a real text node) produced the content.
  Object.defineProperty(node, "textContent", {
    configurable: true,
    get: () => domTextOf(node),
    set: (v: string) => {
      // MUST mutate the EXISTING childNodes array in place, never reassign
      // `node.childNodes` to a new array: hookHarness.ts's `appendChild`/
      // `insertBefore`/`removeChild` are closures captured over that ONE
      // array object at node-creation time (mkNode's `children` variable) —
      // reassigning the property here would silently detach them, so a
      // LATER real appendChild (react-dom's commitMutationEffects, right
      // after its commitBeforeMutationEffects phase calls `container.
      // textContent = ""` to clear stale content before the initial mount)
      // would push into the orphaned old array while `node.childNodes`
      // keeps pointing at this setter's new one — the real child then never
      // shows up on read. (Found chasing exactly that: an empty `<button>`
      // rendered as root ended up with the CONTAINER's own childNodes stuck
      // at a single leftover empty text node and the button nowhere to be
      // found.) Matches real `textContent` semantics too: an empty string
      // just empties the children, it does not insert an empty text node.
      const arr = (node.childNodes ??= []);
      arr.length = 0;
      if (v !== "") arr.push(makeTextNode(node, v));
    },
  });
  node.focus = () => {
    const doc = node.ownerDocument;
    if (doc) doc.activeElement = node;
  };
  node.blur = () => {
    const doc = node.ownerDocument;
    if (doc && doc.activeElement === node) doc.activeElement = doc.body;
  };
  node.matches = (selector: string) => matchesSimpleSelector(node, selector);
  node.closest = (selector: string) => {
    let n: Stub | null | undefined = node;
    while (n) {
      if (n.nodeType === 1 && matchesSimpleSelector(n, selector)) return n;
      n = n.parentNode;
    }
    return null;
  };
  node.querySelectorAll = (selector: string) => {
    const out: Stub[] = [];
    collectMatches(node, selector, out);
    return out;
  };
  node.querySelector = (selector: string) => {
    const out: Stub[] = [];
    collectMatches(node, selector, out);
    return out[0] ?? null;
  };
  node.contains = (other: Stub) => {
    let n: Stub | null | undefined = other;
    while (n) {
      if (n === node) return true;
      n = n.parentNode;
    }
    return false;
  };
  return node;
}

function makeTextNode(parentNode: Stub, value: string): Stub {
  return { nodeType: 3, nodeValue: value, parentNode, ownerDocument: parentNode.ownerDocument };
}

function domTextOf(node: Stub): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  const kids = node.childNodes ?? [];
  if (kids.length > 0) return kids.map(domTextOf).join("");
  return "";
}

let installed = false;

/**
 * Idempotent — safe to call at the top of every a11y/keyboard test file (or
 * once from a shared import). Patches `document.createElement` /
 * `createTextNode` going forward and retro-enhances the two nodes
 * `hookHarness.ts`'s `installDom()` built directly (documentElement, body)
 * before this ever ran.
 */
export function enableDomInspection(): void {
  if (installed) return;
  installed = true;
  const doc = globalThis.document as unknown as Stub;
  if (!doc) throw new Error("enableDomInspection() must run after test/hookHarness.ts has installed its stub DOM");

  const origCreateElement = (doc.createElement as (tag: string) => Stub).bind(doc);
  doc.createElement = (tag: string) => enhanceElement(origCreateElement(tag));

  // hookHarness's `createElementNS` (SVG namespace — every lucide-react
  // icon, several of which sit inside base-ui's Dialog close button/chevron
  // slots) calls `mkNode` DIRECTLY, bypassing `createElement` entirely — an
  // SVG icon inside an open dialog was therefore the one node in the whole
  // tree missing `.matches`/`.getAttribute`/etc., which only surfaced when
  // @base-ui/react's own focus-trap (FloatingFocusManager's `tabbable()`)
  // walked EVERY descendant, icons included, looking for candidates.
  const origCreateElementNS = (doc.createElementNS as (ns: string, tag: string) => Stub).bind(doc);
  doc.createElementNS = (ns: string, tag: string) => enhanceElement(origCreateElementNS(ns, tag));

  const origCreateTextNode = (doc.createTextNode as (t: unknown) => Stub).bind(doc);
  doc.createTextNode = (t: unknown) => origCreateTextNode(t); // text nodes need no attribute store

  // @base-ui/react's Dialog/Popover open/close transition-status hook
  // (useAnimationFrame) schedules its next tick via `requestAnimationFrame` —
  // absent entirely from this stub environment (no real paint loop exists to
  // drive it). A macrotask-based polyfill is enough to let the real
  // open/close STATE MACHINE run to completion in a test; it will not
  // reproduce real frame timing, which no test here depends on.
  const g = globalThis as unknown as Stub;
  if (typeof g.requestAnimationFrame !== "function") {
    g.requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0)) as unknown;
    g.cancelAnimationFrame = ((id: unknown) => clearTimeout(id as Parameters<typeof clearTimeout>[0])) as unknown;
  }

  // next/link's prefetch-on-visible hook (use-intersection.tsx) falls back to
  // `self.requestIdleCallback` when no real IntersectionObserver exists —
  // `self` (the browser/worker alias for the global object) is never defined
  // in a bare Node process. A macrotask-based idle-callback polyfill, keyed
  // off `globalThis` under BOTH names, is enough for that fallback path to
  // resolve instead of throwing on first render of any page carrying a
  // <Link> (components/firm/needs-you-row.tsx's client link, among others).
  if (typeof g.self === "undefined") g.self = globalThis as unknown;
  if (typeof g.requestIdleCallback !== "function") {
    g.requestIdleCallback = ((cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) =>
      setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0)) as unknown;
    g.cancelIdleCallback = ((id: unknown) => clearTimeout(id as Parameters<typeof clearTimeout>[0])) as unknown;
  }

  // @floating-ui/utils's scroll-lock/overflow probes (behind @base-ui/react's
  // Dialog's real scroll-lock effect) read `window.getComputedStyle(el).
  // overflow`/`overflowX`/`overflowY` to decide which ancestor actually
  // scrolls. A fixed "nothing overflows" answer is honest for a headless
  // stub with no real layout — it just means this environment can never
  // itself decide a REAL element scrolls, which no a11y/keyboard assertion
  // here depends on.
  const winForStyle = globalThis.window as unknown as Stub | undefined;
  if (winForStyle && typeof winForStyle.getComputedStyle !== "function") {
    const computedStyle = (el: unknown) => {
      void el; // signature-compatible with the real window.getComputedStyle(element)
      return {
        getPropertyValue: () => "",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        display: "block",
        visibility: "visible",
        position: "static",
      };
    };
    winForStyle.getComputedStyle = computedStyle as unknown;
    g.getComputedStyle = computedStyle as unknown;
  }

  enhanceElement(doc.documentElement as Stub);
  enhanceElement(doc.body as Stub);
  if ((doc.body as Stub).parentNode !== doc.documentElement) {
    (doc.documentElement as unknown as { appendChild: (c: Stub) => void }).appendChild(doc.body as Stub);
  }
  doc.activeElement = doc.body;

  // @base-ui/react's Dialog focus-trap (FloatingFocusManager) watches the
  // dialog subtree with a real `MutationObserver` to recompute its tabbable-
  // element list whenever the DOM changes. A no-op observer is honest here:
  // this stub's tree never changes without react-dom already having run
  // (which is when a test's own `await h.settle()` already re-reads it), so
  // there is nothing a REAL observer callback would tell a test that this
  // environment could act on differently.
  if (typeof g.MutationObserver !== "function") {
    g.MutationObserver = class {
      observe(): void {}
      disconnect(): void {}
      takeRecords(): unknown[] {
        return [];
      }
    } as unknown;
  }

  // @base-ui/react's floating-ui internals (the Select/Dialog/Popover
  // primitives shadcn's SelectTrigger/DialogContent wrap) feature-detect via
  // `value instanceof window.Element` — with NO `Element` global at all
  // (hookHarness.ts defines `HTMLElement` and its tag-specific subclasses,
  // never the more general `Element` interface those inherit from in a real
  // DOM), that throws "Element is not defined" instead of the `false` the
  // check is written to tolerate. A bare marker constructor, spliced into
  // the SAME prototype chain hookHarness's own HTMLElement already sits on,
  // makes every existing stub element satisfy `instanceof Element` without
  // touching hookHarness.ts itself.
  const win = globalThis.window as unknown as Stub;
  if (win && !win.Element) {
    // `Node` <- `Element` <- hookHarness's own `HTMLElement` — the same
    // interface chain a real DOM has, so `instanceof Node`/`instanceof
    // Element` both resolve true for every stub element without touching
    // hookHarness.ts itself. (`Node` alone was missing too: base-ui's
    // transition-status cleanup effect checks `instanceof Node` on its own
    // async tick, surfaced only as an uncaught rejection AFTER a test using
    // Dialog/Popover had already finished — this fixes it at the source
    // rather than papering over the symptom.)
    function NodeCtor(): void {}
    function ElementCtor(): void {}
    ElementCtor.prototype = Object.create(NodeCtor.prototype);
    const HTMLElementCtor = globalThis.HTMLElement as unknown as { prototype: object } | undefined;
    if (HTMLElementCtor) Object.setPrototypeOf(HTMLElementCtor.prototype, ElementCtor.prototype);
    (globalThis as unknown as Stub).Node = NodeCtor;
    (globalThis as unknown as Stub).Element = ElementCtor;
    win.Node = NodeCtor;
    win.Element = ElementCtor;
  }
}

/** The element `document.activeElement` currently names, or null. Read this
 *  after a `.focus()` call (this file's own addition) to assert a keyboard
 *  walk actually moved focus, rather than assuming it did. */
export function activeElement(): unknown {
  return (globalThis.document as unknown as Stub | undefined)?.activeElement ?? null;
}
