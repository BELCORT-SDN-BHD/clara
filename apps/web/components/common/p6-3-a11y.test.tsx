// P6-3 — the three shared-primitive a11y facts this train changed, each pinned
// against the mutant that would undo it.
//
//   DS-02  the skip link exists, targets the (firm) shell's own anchor, and is
//          hidden until focused.
//   DS-03  LoadingState computes role="status" — the app's sole loading
//          primitive had no role at all, so 57 honest loading sentences were
//          silent to a screen reader.
//   DS-01  the dropdown menu's entrance is token-driven and reduced-motion-
//          gated, read off the SHIPPED className computation rather than the
//          source text.
//
// The behavioural halves that no harness without layout can prove — that the
// skip link actually moves focus, and that the popup genuinely stops moving
// under `prefers-reduced-motion` — are in e2e/a11y-finish-walk.spec.ts, on the
// built app in a real browser. Neither instrument covers the other.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { SkipLink } from "./skip-link";
import { LoadingState, EmptyState, StateBanner } from "./state";
import { DropdownMenuContent, DropdownMenuSubContent } from "../ui/dropdown-menu";

enableDomInspection();

type Stub = { nodeType?: number; tagName?: string; childNodes?: Stub[]; getAttribute?: (n: string) => string | null };

const attrOf = (n: Stub, name: string) => (typeof n.getAttribute === "function" ? n.getAttribute(name) : null);

function intl(children: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function first(root: Stub, tag: string): Stub | undefined {
  let found: Stub | undefined;
  (function walk(n: Stub) {
    if (found) return;
    if (n.nodeType === 1 && n.tagName === tag) {
      found = n;
      return;
    }
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return found;
}

// --- DS-02 ------------------------------------------------------------------

test("DS-02: the skip link is a real link to the (firm) shell's anchor, and it names itself honestly", async () => {
  const h = await renderComponent(intl(createElement(SkipLink)));
  try {
    const a = first(h.container as Stub, "A");
    assert.ok(a, "SkipLink must render an <a>");
    // The href is the load-bearing half: app/(firm)/layout.tsx puts
    // id="main-content" tabIndex={-1} on its content column, and a link to an
    // id nothing declares is a bypass that fails silently.
    assert.equal(attrOf(a, "href"), "#main-content");
    assert.match(h.text(), /Skip to main content/);
  } finally {
    await h.unmount();
  }
});

test("DS-02: it is invisible until focused — sr-only WITH a focus escape, not one or the other", async () => {
  const h = await renderComponent(intl(createElement(SkipLink)));
  try {
    const cls = attrOf(first(h.container as Stub, "A")!, "class") ?? "";
    // `sr-only` alone would be a link no sighted keyboard user can ever see;
    // `focus:not-sr-only` alone is not the pattern at all. Both, or neither.
    assert.match(cls, /(^|\s)sr-only(\s|$)/, cls);
    assert.match(cls, /(^|\s)focus:not-sr-only(\s|$)/, cls);
    // No `outline-none`: it deliberately draws globals.css's base
    // `:focus-visible` outline, the same indicator every other plain link gets.
    assert.doesNotMatch(cls, /outline-none/, cls);
  } finally {
    await h.unmount();
  }
});

test("DS-02: the skip link itself is clean under the a11y gate", async () => {
  const h = await renderComponent(intl(createElement(SkipLink)));
  try {
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

// --- DS-03 ------------------------------------------------------------------

test('DS-03: LoadingState computes role="status" so the loading sentence is announced', async () => {
  const h = await renderComponent(createElement(LoadingState, null, "Loading the close plan…"));
  try {
    const p = first(h.container as Stub, "P");
    assert.ok(p);
    assert.equal(attrOf(p, "role"), "status");
  } finally {
    await h.unmount();
  }
});

test("DS-03: LoadingState does NOT carry aria-busy — a busy live region suppresses its own announcement", async () => {
  // This is an assertion about a DECISION, not an omission: see state.tsx's
  // header. aria-busy renders on the persistent regions that swap content in
  // place (ClaraThreadView's log, InterviewRunCard's thread), where it can flip
  // true -> false. Putting it here as well would silence role="status" above,
  // so if a later lane "completes" DS-03 by adding it, this reds and points
  // them at the reasoning rather than letting the regression land quietly.
  const h = await renderComponent(createElement(LoadingState, null, "Loading…"));
  try {
    assert.equal(attrOf(first(h.container as Stub, "P")!, "aria-busy"), null);
  } finally {
    await h.unmount();
  }
});

test("DS-03 CONTROL: EmptyState is NOT a status — a settled empty ledger is not an announcement", async () => {
  // The mutant this catches is the plausible over-application: giving the whole
  // three-rung ladder role="status". An empty state is a resting state; it
  // would announce on every navigation that lands on an empty surface.
  const h = await renderComponent(createElement(EmptyState, null, "No fiscal years opened yet."));
  try {
    assert.equal(attrOf(first(h.container as Stub, "P")!, "role"), null);
  } finally {
    await h.unmount();
  }
});

test("DS-03 CONTROL: StateBanner's own roles are untouched by this train", async () => {
  for (const [tone, role] of [["error", "alert"], ["warning", "alert"], ["info", "status"], ["neutral", "status"]] as const) {
    const h = await renderComponent(createElement(StateBanner, { tone, children: "x" }));
    try {
      // Search for the element that DECLARES a role — `first(…, "DIV")` would
      // return the harness's own container div, which declares none.
      const banner = (h.find as (p: (n: Stub) => boolean) => Stub | undefined)((n) => attrOf(n, "role") !== null);
      assert.equal(attrOf(banner!, "role"), role, tone);
    } finally {
      await h.unmount();
    }
  }
});

// --- DS-01 ------------------------------------------------------------------

/** The className the component itself computes, read off the returned element
 *  tree. This EXECUTES `cn` and the component's own composition — a regex over
 *  dropdown-menu.tsx would also match the class names its comments discuss. */
function popupClassName(element: unknown): string {
  let node: unknown = element;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!isValidElement(node)) break;
    const props = node.props as { className?: string; children?: unknown };
    if (typeof props.className === "string" && props.className.includes("bg-popover")) return props.className;
    node = props.children;
  }
  throw new Error("could not reach the popup element's className");
}

test("DS-01: the dropdown popup's entrance is the --duration-standard token, never a hardcoded ms", async () => {
  const cls = popupClassName(DropdownMenuContent({}));
  // Contract §7 puts "Popover, dropdown" on --duration-standard (160ms), which
  // globals.css exposes as the `motion-standard` utility. `duration-100` was a
  // number written into a component, which the token contract forbids.
  assert.match(cls, /(^|\s)motion-standard(\s|$)/, cls);
  assert.doesNotMatch(cls, /(^|\s)duration-\d+(\s|$)/, cls);
});

test("DS-01: every MOVEMENT arm is behind motion-safe:, and the fade is not", async () => {
  for (const [name, cls] of [
    ["content", popupClassName(DropdownMenuContent({}))],
    ["sub-content", popupClassName(DropdownMenuSubContent({}))],
  ] as const) {
    const tokens = cls.split(/\s+/);
    const movement = tokens.filter((t) => /(zoom-(in|out)-|slide-in-from-)/.test(t));
    assert.ok(movement.length > 0, `${name}: expected movement utilities to exist at all`);
    const unguarded = movement.filter((t) => !t.startsWith("motion-safe:"));
    assert.deepEqual(unguarded, [], `${name}: these move under prefers-reduced-motion — ${unguarded.join(" ")}`);
    // The contract's other half, and the reason a blanket transform-killer is
    // wrong: "reduced motion removes position, scale, stagger and parallax;
    // OPACITY and explicit state copy REMAIN."
    assert.ok(tokens.includes("data-open:fade-in-0"), `${name}: the fade must stay unconditional`);
    assert.ok(tokens.includes("data-closed:fade-out-0"), `${name}: the fade must stay unconditional`);
  }
});
