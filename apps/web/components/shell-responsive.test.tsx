// CB-AE2E-019, CARRIED FORWARD THROUGH #614 — the shell's seams, at the layer a
// node cell can actually settle: the DISCLOSURE CONTRACT on the sidebar toggle,
// the ROVING FOCUS the vendored tabs primitive brought to `SectionTabs`, and the
// breakpoint arms declared in the shell's own files.
//
// WHAT CHANGED WITH #614, and what deliberately did not. The firm drawer
// (`components/firm-nav-drawer.tsx`), the firm sidebar
// (`components/firm-nav.tsx`) and the client tab strip
// (`components/client-workspace-nav.tsx`) are gone: one vendored Sidebar over
// one registry replaces all three, and its sheet arm IS the drawer. So the
// drawer cells below became SIDEBAR-TRIGGER cells — same disclosure contract,
// same Label-in-Name rule, asserted on the control that now carries it. The
// SectionTabs cells and the arm census are unchanged in kind.
//
// THE h1 PIN INVERTED, and that is the headline. This file used to pin TWO h1s
// on every client route — the client layout's "Client: <name>" plus
// `PageShell`'s own — and the layout carried a long note on why neither
// alternative was cheaper. #614 removed the first one: identity moved into the
// sidebar group label, the scope switcher and the breadcrumb. The pin is now
// exactly ONE h1 per client route, and ZERO in the client layout.
//
// What is deliberately NOT claimed here: that anything is 640 CSS px wide, that
// the sheet traps focus, or that the page does not scroll sideways. Those are
// geometry and a real focus manager, and a jsdom-free node harness has neither —
// `e2e/responsive-shell-walk.spec.ts` measures them on the built app.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import messages from "../messages/en.json";
import { SectionTabs } from "./common/section-tabs";
import { ShellHeader } from "./app-shell/shell-header";
import { FirmScopeProvider } from "./firm-scope-provider";
import { SidebarProvider } from "./ui/sidebar";

enableDomInspection();

type Stub = Record<string, unknown>;

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");

/** Source with block and line comments removed — see the h1-census cell for why
 *  a count over the raw file is wrong in this repo specifically. */
const codeOf = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const h1Count = (path: string): number => (codeOf(path).match(/<h1[\s>]/g) ?? []).length;

/** Every `.tsx` under `dir`, as repo-relative paths — so a census covers files
 *  nobody has listed by hand yet. */
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsx(full, out);
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
      out.push(relative(WEB_ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

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

// ── SEAM 1: the sidebar toggle's disclosure contract ────────────────────────

const headerTree = (pathname: string) =>
  Wrap({
    pathname,
    children: createElement(FirmScopeProvider, {
      scope: { role_rank: 3, is_operator: false, firm_name: "E2E Accounting", role: "owner" },
      children: createElement(SidebarProvider, { children: createElement(ShellHeader) }),
    }),
  });

const toggleOf = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) =>
  h.find((n) => attr(n, "data-firm-drawer-toggle") !== null);

test("the sidebar toggle is a real disclosure: aria-expanded reflects the panel's state", async () => {
  const h = await renderComponent(headerTree("/"));
  try {
    const trigger = toggleOf(h);
    assert.ok(trigger, "no sidebar toggle rendered");
    // The provider's `defaultOpen` is true, so the desktop panel starts open and
    // the toggle must SAY so — a disclosure that always reads "false" is the
    // defect this cell exists for.
    assert.equal(attr(trigger, "aria-expanded"), "true");
    await h.act(() => clickVia(trigger));
    assert.equal(attr(toggleOf(h)!, "aria-expanded"), "false", "the toggle did not collapse the sidebar");
    await h.act(() => clickVia(toggleOf(h)!));
    assert.equal(attr(toggleOf(h)!, "aria-expanded"), "true", "the toggle is one-way");
  } finally {
    await h.unmount();
  }
});

test("the toggle's accessible name is a real one, and it is not the empty string the primitive shipped", async () => {
  // The vendored `SidebarTrigger` carried a hardcoded English `<span
  // class="sr-only">Toggle Sidebar</span>`. The house pass routed it through
  // next-intl with a prop override; this is the cell that would notice if either
  // half regressed to nothing at all — an icon-only button with no name is a
  // WCAG 4.1.2 failure and `checkAccessibility`'s `button-name` rule would only
  // see it if this file rendered the header, which is why it does.
  const h = await renderComponent(headerTree("/"));
  try {
    const trigger = toggleOf(h);
    assert.ok(trigger);
    assert.match(textOf(trigger), /Toggle navigation/);
    // WCAG 2.1 SC 2.5.3 (Label in Name) is not at stake here — the visible label
    // IS the screen-reader label, because the button has no visible text at all.
    assert.equal(attr(trigger, "aria-label"), null, "the name is the sr-only text, not a competing aria-label");
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

// ── The declared arms, read from the shell's sources ────────────────────────

test("every chrome column declares a breakpoint arm — the measured absence CB-AE2E-019 opened on", () => {
  // The audit's finding was a MEASURED ABSENCE: zero `sm:`/`md:`/`lg:` hits in
  // any of the shell's six chrome files. This is the same measurement, inverted,
  // so the absence cannot quietly return one file at a time. The FILE LIST moved
  // with #614 — three hand-rolled chromes became one vendored Sidebar — but the
  // property is identical: every column that costs width says at which width it
  // costs it.
  const arms: [string, RegExp][] = [
    // The sidebar's own two arms: a docked column at `md` and above, and the
    // sheet below it (`isMobile` in the same file, at the same 768px).
    ["components/ui/sidebar.tsx", /md:block/],
    ["components/ui/sidebar.tsx", /md:flex/],
    ["hooks/use-mobile.ts", /SIDEBAR_BREAKPOINT = 768/],
    // The breadcrumb's collapse, which is what keeps identity on screen at 320px.
    ["components/app-shell/app-breadcrumb.tsx", /sm:not-sr-only/],
    ["components/app-shell/app-breadcrumb.tsx", /sm:hidden/],
    ["components/common/page-shell.tsx", /p-4 lg:p-8/],
    ["components/clara/rail-chrome.tsx", /lg:contents/],
    // R3 — THE TWO CASCADE FIXES, PINNED WHERE CI CAN SEE THEM. Both defects are
    // computed styles, so their real instrument is the browser leg. These rows
    // do not measure the cascade; they pin the ONE spelling that resolves it.
    // The override must carry the vendored utility's own variant, or
    // tailwind-merge keeps both and the later rule wins.
    ["components/common/section-tabs.tsx", /group-data-horizontal\/tabs:h-auto/],
  ];
  for (const [file, arm] of arms) {
    assert.match(read(file), arm, `${file} lost its breakpoint arm`);
  }
});

test("EXACTLY ONE h1 per client route — the shell owns identity now, the page owns the title", () => {
  // THE INVERSION #614 PAID FOR. The old client layout rendered an `<h1>`
  // reading "Client: <name>" above `PageShell`'s own, and this cell pinned the
  // total at TWO with a long note on why neither alternative was cheaper: a
  // leading `<h2>` reds test/a11yRules.ts's heading-order rule, and a `level`
  // prop on `PageHeader` was 22 call sites in 20 files plus a hook that
  // component is contractually not allowed to hold.
  //
  // Removing the heading resolved it instead of ranking it. Identity now lives
  // in the sidebar's client group label, the scope switcher and the breadcrumb —
  // three places visible at every width, where the old line scrolled away with
  // the page.
  assert.equal(h1Count("components/common/page-shell.tsx"), 1, "PageShell no longer renders exactly one h1");
  assert.equal(
    h1Count("app/(firm)/clients/[clientId]/layout.tsx"),
    0,
    "the client layout renders a heading again — identity belongs to the shell",
  );
  assert.equal(h1Count("app/(firm)/layout.tsx"), 0);

  // …AND THE THIRD SOURCE, which is where a second h1 would actually come from.
  // COUNTED OVER CODE, NOT OVER THE FILE: both shell files DESCRIBE `<h1` in
  // their comments — page-shell.tsx's header quotes the very markup five lanes
  // duplicated — and a naive `match(/<h1/g)` reads two in a file that renders
  // one. Walked, so a page added by any lane is covered without this list being
  // maintained by hand.
  const clientPages = walkTsx(join(WEB_ROOT, "app/(firm)/clients"));
  assert.ok(clientPages.length >= 5, `only ${clientPages.length} client-altitude files walked — is the path right?`);
  const rogue = clientPages.filter((f) => h1Count(f) > 0);
  assert.deepEqual(
    rogue,
    [],
    `these client-altitude files render their own <h1> instead of going through PageHeader: ${rogue.join(", ")}`,
  );
});

test("the shell header sits OUTSIDE #main-content, so the skip link still skips navigation", () => {
  // The failure this pins is subtle and total: put the sidebar toggle inside the
  // skip link's own target and the bypass lands ABOVE it, so the next Tab walks
  // straight back into navigation. Read as ORDER in the source, which is what
  // determines it.
  const layout = read("app/(firm)/layout.tsx");
  const headerAt = layout.indexOf("<ShellHeader />");
  const mainAt = layout.indexOf('id="main-content"');
  const skipAt = layout.indexOf("<SkipLink />");
  assert.ok(skipAt >= 0, "the skip link is gone");
  assert.ok(headerAt >= 0, "the shell header is gone");
  assert.ok(mainAt >= 0, "the skip link's target is gone");
  assert.ok(skipAt < headerAt, "the skip link is no longer the first focusable thing in the shell");
  assert.ok(headerAt < mainAt, "the sidebar toggle is inside #main-content — the skip link now skips nothing");
});
