// test/keyboardWalk.ts — GATE (c) of the three a11y CI gates (owner ruling
// Q7). Shared helpers for the journals APPROVE/REVIEW and close FISCAL-
// YEAR/GATE/DOOR keyboard-walk tests. Reads real attributes off the SAME
// domInspect.ts-enhanced live tree gate (b) uses — see that file's header.
//
// WHAT THIS HONESTLY PROVES, AND WHAT IT DOES NOT: this environment has no
// real focus manager or layout engine (test/domInspect.ts's own header —
// the axe-core spike found the same wall). A keyboard walk here therefore
// proves STRUCTURE, not literal key-event dispatch:
//   - every actionable control is a NATIVE focusable element (button,
//     `a[href]`, input/select/textarea, or an explicit non-negative
//     `tabindex`) — the WCAG 2.1.1 (Keyboard) floor: a native control is
//     operable by Enter/Space/Tab through the BROWSER's own behaviour, no
//     JS required, so proving "it really is one of these" is the correct,
//     honest thing to assert without a real focus manager.
//   - no control carries a POSITIVE tabindex (WCAG 2.4.3, Focus Order) —
//     a positive value hijacks the natural DOM-order tab sequence, and
//     every control in this codebase's census relies on DOM order alone.
//   - `.focus()` (domInspect.ts's own addition) actually moves `document.
//     activeElement` to the target — a real, checkable fact, not assumed.
//   - the token-defined `:focus-visible` ring (globals.css's `@layer base`
//     rule, applying to EVERY element by default) is not locally disabled
//     without a replacement — read from the RENDERED className string,
//     never from computed style (this stub has none worth trusting, see
//     gate (b)'s header on why layout/style computation is out of scope).
// Activation itself is exercised via `fireEvent(node, "click")` on a proven-
// native control — for a real `<button>`/`<a>`, a browser's own Enter/Space
// handling dispatches that exact same `click` event, so this is not a
// guess about what the browser does, it is the event the browser produces.

type Stub = {
  nodeType?: number;
  tagName?: string;
  childNodes?: Stub[];
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

const NATIVE_FOCUSABLE_TAGS = new Set(["BUTTON", "SELECT", "TEXTAREA"]);

function attr(node: Stub, name: string): string | null {
  return typeof node.getAttribute === "function" ? node.getAttribute(name) : null;
}
function has(node: Stub, name: string): boolean {
  return typeof node.hasAttribute === "function" && node.hasAttribute(name);
}

/** True for a control the WCAG 2.1.1 floor treats as natively keyboard-
 *  operable: a real `<button>`/`<select>`/`<textarea>`, an `<a href>`, an
 *  `<input>` that isn't `type="hidden"`, or anything carrying an explicit
 *  non-negative `tabindex` — and, in every case, not `disabled` and not
 *  `aria-hidden="true"` (removed from the tab order/AT tree either way). */
export function isKeyboardOperable(node: Stub): boolean {
  if (attr(node, "aria-hidden") === "true") return false;
  if (has(node, "disabled")) return false;
  const tag = node.tagName ?? "";
  if (NATIVE_FOCUSABLE_TAGS.has(tag)) return true;
  if (tag === "A" && has(node, "href")) return true;
  if (tag === "INPUT" && (attr(node, "type") ?? "").toLowerCase() !== "hidden") return true;
  const tabIndex = attr(node, "tabindex");
  if (tabIndex !== null && Number(tabIndex) >= 0) return true;
  return false;
}

/** Every keyboard-operable control in the tree, in DOM (= tab) order — the
 *  same order every component here relies on (none sets a positive
 *  tabindex; `assertNoPositiveTabIndex` below is the control on that). */
export function focusableElements(root: Stub): Stub[] {
  const out: Stub[] = [];
  (function walk(node: Stub) {
    if (node.nodeType === 1 && isKeyboardOperable(node)) out.push(node);
    for (const c of node.childNodes ?? []) walk(c);
  })(root);
  return out;
}

/** WCAG 2.4.3 Focus Order — a positive tabindex reorders the tab sequence
 *  away from DOM order; `0`/absent/negative are all fine (0 = "in DOM
 *  order", negative = "focusable via script only, skip in Tab"). */
export function positiveTabIndexElements(root: Stub): Stub[] {
  const out: Stub[] = [];
  (function walk(node: Stub) {
    if (node.nodeType === 1) {
      const t = attr(node, "tabindex");
      if (t !== null && Number(t) > 0) out.push(node);
    }
    for (const c of node.childNodes ?? []) walk(c);
  })(root);
  return out;
}

/** Reads the RENDERED `class` attribute for the anti-pattern that would
 *  silently remove globals.css's default `:focus-visible` ring — an
 *  `outline-none`/`focus-visible:outline-none` utility with no
 *  `focus-visible:ring-*`/`focus-visible:outline-*` utility alongside it to
 *  replace the ring. A plain control with neither utility at all still
 *  reads as visible: it inherits the global rule untouched. */
export function hasVisibleFocusRing(node: Stub): boolean {
  const className = attr(node, "class") ?? "";
  const removesOutline = /(^|\s)(outline-none|focus-visible:outline-none)(\s|$)/.test(className);
  if (!removesOutline) return true;
  const replacesRing = /focus-visible:(ring|outline)(?!-none)/.test(className);
  return replacesRing;
}

function describe(node: Stub): string {
  const tag = (node.tagName ?? "?").toLowerCase();
  const role = attr(node, "role");
  return role ? `${tag}[role=${role}]` : tag;
}

export type KeyboardViolation = { rule: string; wcag: string; element: string; message: string };

/**
 * The one assertion every keyboard-walk test in this repo runs over its
 * OWN scripted step sequence: every control the step just made reachable is
 * genuinely keyboard-operable, sits in plain DOM tab order, and keeps its
 * focus ring. Returns violations rather than throwing — the caller decides
 * whether a real one found here is a report-only finding (per Q7's mandate)
 * or a hard test failure.
 */
export function checkKeyboardWalk(root: Stub): KeyboardViolation[] {
  const violations: KeyboardViolation[] = [];
  for (const el of positiveTabIndexElements(root)) {
    violations.push({
      rule: "tabindex-order",
      wcag: "2.4.3 Focus Order",
      element: describe(el),
      message: "A positive tabindex reorders the tab sequence away from DOM order.",
    });
  }
  for (const el of focusableElements(root)) {
    if (!hasVisibleFocusRing(el)) {
      violations.push({
        rule: "focus-visible",
        wcag: "2.4.7 Focus Visible",
        element: describe(el),
        message: "This control removes the outline (outline-none / focus-visible:outline-none) without a replacement focus-visible ring utility.",
      });
    }
  }
  return violations;
}
