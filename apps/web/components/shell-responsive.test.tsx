// CB-AE2E-019 — the shell's three seams, at the layer a node cell can actually
// settle: the DISCLOSURE CONTRACT on the firm drawer, the ROVING FOCUS the
// vendored tabs primitive brought to `SectionTabs`, and the arms declared in the
// layout files.
//
// What is deliberately NOT claimed here: that anything is 640 CSS px wide, that
// the drawer traps focus, or that the page does not scroll sideways. Those are
// geometry and a real focus manager, and a jsdom-free node harness has neither —
// `e2e/responsive-shell-walk.spec.ts` measures them on the built app.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import messages from "../messages/en.json";
import { SectionTabs } from "./common/section-tabs";
import { FirmNavDrawer } from "./firm-nav-drawer";
import { FirmScopeProvider } from "./firm-scope-provider";

enableDomInspection();

type Stub = Record<string, unknown>;

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");

const attr = (node: Stub, name: string): string | null => {
  const get = node.getAttribute as ((n: string) => string | null) | undefined;
  return get ? get.call(node, name) : null;
};

/** Invoke the COMMITTED node's own click handler — the same discipline
 *  `clickButton` applies, for a node this harness reaches by attribute rather
 *  than by role. Throws rather than no-opping if there is no handler, so a cell
 *  that clicks nothing cannot pass. */
function clickVia(node: Stub): void {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey
    ? (node as unknown as Record<string, { onClick?: (e: unknown) => void }>)[propsKey]
    : undefined;
  if (!props?.onClick) throw new Error("clickVia: this node carries no onClick");
  props.onClick({ preventDefault() {}, stopPropagation() {} });
}

function Wrap({ pathname, children }: { pathname: string; children: ReactElement }): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {},
          refresh: () => {},
          push: () => {},
          back: () => {},
          forward: () => {},
          prefetch: () => {},
        } as never,
      },
      createElement(PathnameContext.Provider as never, { value: pathname as never }, children),
    ),
  });
}

// ── SEAM 1: the firm drawer's disclosure contract ───────────────────────────

const drawerTree = (pathname: string) =>
  Wrap({
    pathname,
    children: createElement(FirmScopeProvider, {
      scope: { role_rank: 3, is_operator: false },
      children: createElement(FirmNavDrawer),
    }),
  });

test("the drawer toggle is a real disclosure: aria-expanded starts false and aria-controls names the panel", async () => {
  const h = await renderComponent(drawerTree("/"));
  try {
    const trigger = h.find(
      (n) => (n.tagName as string | undefined)?.toLowerCase() === "button" && textOf(n).includes("Menu"),
    );
    assert.ok(trigger, "no drawer toggle rendered");
    assert.equal(attr(trigger, "aria-expanded"), "false");
    const controls = attr(trigger, "aria-controls");
    assert.ok(controls && controls.length > 0, "the toggle names no panel");
  } finally {
    await h.unmount();
  }
});

test("the toggle's ACCESSIBLE NAME is its visible text — no aria-label that voice control cannot say", async () => {
  // WCAG 2.1 SC 2.5.3 (Label in Name). A button reading "Menu" with
  // `aria-label="Open firm navigation"` cannot be operated by someone saying
  // "click Menu", which is the one thing that button is for.
  const h = await renderComponent(drawerTree("/"));
  try {
    const trigger = h.find(
      (n) => (n.tagName as string | undefined)?.toLowerCase() === "button" && textOf(n).includes("Menu"),
    );
    assert.ok(trigger);
    const label = attr(trigger, "aria-label");
    assert.equal(label, null, `the toggle carries aria-label="${label}", which does not contain its visible text`);
  } finally {
    await h.unmount();
  }
});

test("the drawer closes on a route change — it never survives the navigation it just performed", async () => {
  // Driven at the SOURCE the component actually reads (`usePathname`), not by
  // clicking a link: a handler-on-each-link implementation would pass a click
  // test and still leave the drawer open on a back-button navigation.
  function Harness(): ReactElement {
    const [path, setPath] = useState("/");
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { type: "button", id: "nav", onClick: () => setPath("/clients") },
        "navigate",
      ),
      drawerTree(path),
    );
  }
  // `createElement(Harness)`, never `Harness()` — calling a component as a
  // plain function runs its hooks outside a render and React throws
  // "Invalid hook call", which is how this cell first went red.
  const h = await renderComponent(createElement(Harness));
  try {
    const trigger = () =>
      h.find((n) => (n.tagName as string | undefined)?.toLowerCase() === "button" && textOf(n).includes("Menu"));
    const open = trigger();
    assert.ok(open);
    await h.act(() => clickVia(open));
    assert.equal(attr(trigger()!, "aria-expanded"), "true", "the toggle did not open the drawer");

    const navigate = h.find((n) => attr(n, "id") === "nav");
    assert.ok(navigate, "the harness's own navigate button is missing");
    await h.act(() => clickVia(navigate));
    // THE DISCRIMINATING POST-CONDITION: true only after the path changed.
    assert.equal(attr(trigger()!, "aria-expanded"), "false", "the drawer survived the navigation");
  } finally {
    await h.unmount();
  }
});

// ── SEAM 2: SectionTabs' roving focus, from the primitive ───────────────────

test("SectionTabs' accessibility tree comes from the PRIMITIVE — tablist, tabs, and exactly one active", async () => {
  // WHAT THIS CELL CAN AND CANNOT ESTABLISH, measured rather than assumed.
  //
  // The defect being closed, in the old file's own words: it declared
  // `role="tablist"`/`role="tab"` and then left "each tab a real tab stop", so
  // assistive tech was told to use the arrow keys on a widget that ignored them.
  // Base UI's Tabs owns the roving tabindex — but the roving tabindex is applied
  // by the composite root's item registration, which needs a real focus manager
  // and real element refs. In this node harness ALL THREE tabs render
  // `tabindex="-1"` (measured), so a "one tab stop" assertion here would be
  // asserting the harness's limitation, not the product's behaviour.
  //
  // So this cell claims only what it can SEE: the tree is the primitive's, with
  // one and only one active tab. The keyboard half — Tab reaches the strip once,
  // and Arrow moves between tabs — is proved in a real browser by
  // `e2e/responsive-shell-walk.spec.ts`, which is where a focus claim belongs.
  const h = await renderComponent(
    Wrap({
      pathname: "/",
      children: createElement(SectionTabs, {
        label: "Sections",
        value: "b",
        onSelect: () => {},
        items: [
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Gamma" },
        ],
      }),
    }),
  );
  try {
    const tabs: Stub[] = [];
    const walk = (n: Stub) => {
      if (attr(n, "role") === "tab") tabs.push(n);
      for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
    };
    walk(h.container);
    assert.equal(tabs.length, 3, "the three tabs did not render as tabs");

    // The tablist is labelled by the caller's `label`, never by the active tab's
    // own name — the N17 defect this component's header records.
    const list = h.find((n) => attr(n, "role") === "tablist");
    assert.ok(list);
    assert.equal(attr(list, "aria-label"), "Sections");

    // The ARIA state test/a11yRules.ts requires on every role="tab" (its own
    // `aria-required-attr` cell), on all three.
    for (const t of tabs) assert.ok(attr(t, "aria-selected") !== null, "a tab has no aria-selected");

    // EXACTLY ONE active, and it is the caller's `value` — not the first tab.
    // Asserting "Beta" rather than "some tab" is what makes this discriminating:
    // a primitive wired to the wrong prop would still render one active tab.
    const selected = tabs.filter((t) => attr(t, "aria-selected") === "true");
    assert.equal(selected.length, 1, "a tablist must have exactly one selected tab");
    assert.equal(textOf(selected[0]!), "Beta");
    assert.equal(attr(selected[0]!, "data-active"), "", "the active tab carries the primitive's own data-active");
  } finally {
    await h.unmount();
  }
});

// ── The declared arms, read from the layout sources ─────────────────────────

test("every chrome column declares a breakpoint arm — the measured absence CB-AE2E-019 opened on", () => {
  // The audit's finding was a MEASURED ABSENCE: zero `sm:`/`md:`/`lg:` hits in
  // any of the shell's six chrome files. This is the same measurement, inverted,
  // so the absence cannot quietly return one file at a time.
  const arms: [string, RegExp][] = [
    ["app/(firm)/layout.tsx", /hidden [^"]*lg:flex/],
    ["app/(firm)/layout.tsx", /lg:hidden/],
    ["app/(firm)/clients/[clientId]/layout.tsx", /px-4[^"]*lg:px-8/],
    ["components/client-workspace-nav.tsx", /overflow-x-auto lg:flex-wrap/],
    ["components/common/page-shell.tsx", /p-4 lg:p-8/],
    ["components/clara/rail-chrome.tsx", /lg:contents/],
  ];
  for (const [file, arm] of arms) {
    assert.match(read(file), arm, `${file} lost its breakpoint arm`);
  }
});

test("the client name is a real <h1> — the client altitude had no level-1 heading at all", () => {
  const layout = read("app/(firm)/clients/[clientId]/layout.tsx");
  assert.match(layout, /<h1[^>]*>\s*\{t\("clientHeader"/);
  assert.doesNotMatch(layout, /<p[^>]*>\s*\{t\("clientHeader"/);
});

test("the narrow header sits OUTSIDE #main-content, so the skip link still skips navigation", () => {
  // The failure this pins is subtle and total: put the drawer toggle inside the
  // skip link's own target and the bypass lands ABOVE it, so the next Tab walks
  // straight back into navigation. Read as ORDER in the source, which is what
  // determines it.
  const layout = read("app/(firm)/layout.tsx");
  const headerAt = layout.indexOf("<FirmNavDrawer />");
  const mainAt = layout.indexOf('id="main-content"');
  assert.ok(headerAt >= 0, "the narrow header is gone");
  assert.ok(mainAt >= 0, "the skip link's target is gone");
  assert.ok(headerAt < mainAt, "the drawer toggle is inside #main-content — the skip link now skips nothing");
});
