// THE ONE NAVIGATION SURFACE, under test (#614).
//
// This replaces `components/firm-nav.test.tsx`, and it inherits that file's two
// claims — rank shaping is the registry's, and the tree is accessible and
// keyboard-walkable with exactly one current page — over a chrome that now also
// carries the client altitude. What is NEW here is the client half: two groups,
// the client's own name as the first group's label, and the Accounting
// collapsible opening because of where the URL is rather than because someone
// clicked it.
//
// WHAT THIS HARNESS CAN AND CANNOT SEE. There is no layout engine and no real
// focus manager (test/domInspect.ts's header), so nothing here claims the sheet
// arm renders at a width, that focus is trapped in it, or that a collapsed
// sidebar is off-screen. `e2e/responsive-shell-walk.spec.ts` measures those on
// the built app. What a node cell CAN settle is the tree: which destinations
// render for whom, which one is marked current, and whether the controls are
// native and named.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { AppSidebarView } from "./app-sidebar";
import { SidebarProvider } from "../ui/sidebar";
import type { FirmScopeValue } from "../firm-scope-provider";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const attr = (node: Stub, name: string): string | null => {
  const get = node.getAttribute as ((n: string) => string | null) | undefined;
  return get ? get.call(node, name) : null;
};

function collect(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const visit = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) visit(c);
  };
  visit(root);
  return out;
}

const anchors = (root: Stub) =>
  collect(root, (n) => (n.tagName as string | undefined) === "A" && attr(n, "href") !== null);

const hrefs = (root: Stub) => anchors(root).map((a) => attr(a, "href")!);

const currentHrefs = (root: Stub) =>
  anchors(root)
    .filter((a) => attr(a, "aria-current") === "page")
    .map((a) => attr(a, "href")!);

const scopeOf = (role_rank: number | null, is_operator = false, role = "owner"): FirmScopeValue => ({
  role_rank,
  is_operator,
  firm_name: "E2E Accounting",
  role,
});

function tree({
  scope,
  pathname,
  query = "",
  clientName = null,
}: {
  scope: FirmScopeValue;
  pathname: string;
  query?: string;
  clientName?: string | null;
}): ReactElement {
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
      createElement(
        PathnameContext.Provider as never,
        { value: pathname as never },
        createElement(SidebarProvider, {
          children: createElement(AppSidebarView, {
            scope,
            pathname,
            searchParams: new URLSearchParams(query),
            clientName,
          }),
        }),
      ),
    ),
  });
}

const FIRM_VIEWER = ["/", "/clients", "/work", "/settings"];
const FIRM_BOOKKEEPER = ["/", "/clients", "/work", "/activity", "/settings"];

// ── rank shaping ────────────────────────────────────────────────────────────

test("firm-scope rank shaping follows viewer < bookkeeper, and a NULL rank renders no destination at all", async () => {
  const cases = [
    { name: "unknown rank", scope: scopeOf(null), expected: [] as string[] },
    { name: "viewer", scope: scopeOf(0, false, "viewer"), expected: FIRM_VIEWER },
    { name: "bookkeeper", scope: scopeOf(1, false, "bookkeeper"), expected: FIRM_BOOKKEEPER },
    { name: "admin", scope: scopeOf(2, false, "admin"), expected: FIRM_BOOKKEEPER },
    { name: "owner", scope: scopeOf(3), expected: FIRM_BOOKKEEPER },
    { name: "operator owner", scope: scopeOf(3, true), expected: FIRM_BOOKKEEPER },
  ];

  for (const fixture of cases) {
    const h = await renderComponent(tree({ scope: fixture.scope, pathname: "/" }));
    try {
      // The scope switcher's own two destinations (firm home, the register) live
      // in a portalled menu that is CLOSED here, so the anchors in the tree are
      // the nav's. Asserted as a whole list, not a count: a count passes on the
      // day two destinations swap places.
      assert.deepEqual(hrefs(h.container), fixture.expected, fixture.name);
    } finally {
      await h.unmount();
    }
  }
});

test("the SETTINGS SECTIONS are not in the sidebar — one menu entry, its contents one level in", async () => {
  // The discriminating control on the shape of the IA. Flattening the six
  // sections into the firm group would give an operator owner an eleven-row
  // column whose bottom half duplicates a page that already lists them.
  const h = await renderComponent(tree({ scope: scopeOf(3, true), pathname: "/settings" }));
  try {
    const rendered = hrefs(h.container);
    assert.equal(rendered.includes("/settings"), true);
    assert.deepEqual(rendered.filter((href) => href.startsWith("/settings/")), []);
  } finally {
    await h.unmount();
  }
});

// ── the client altitude ─────────────────────────────────────────────────────

test("inside a client the sidebar renders BOTH groups, the client's own name first", async () => {
  const h = await renderComponent(
    tree({ scope: scopeOf(3), pathname: `/clients/${CLIENT}/documents`, clientName: "Rome Properties" }),
  );
  try {
    const labels = collect(h.container, (n) => attr(n, "data-sidebar") === "group-label").map(textOf);
    assert.deepEqual(labels, ["Rome Properties", "E2E Accounting"], "the client group must come first");

    const rendered = hrefs(h.container);
    // The client's six destinations, then the firm's five. Accounting's children
    // are collapsed on this route, so they are absent.
    assert.deepEqual(rendered, [
      `/clients/${CLIENT}`,
      `/clients/${CLIENT}/work`,
      `/clients/${CLIENT}/documents`,
      `/clients/${CLIENT}/accounting`,
      `/clients/${CLIENT}/knowledge`,
      `/clients/${CLIENT}/reports`,
      ...FIRM_BOOKKEEPER,
    ]);
  } finally {
    await h.unmount();
  }
});

test("the client's name is LATE, never wrong — the neutral placeholder stands in until the layout below publishes it", async () => {
  // The rule components/app-shell/scope-context.tsx exists to enforce, seen from
  // the outside: with no published identity the group label is the "Client"
  // placeholder. It is never the previous client's name, and never the raw id
  // (a UUID is not an identity a person should meet, not even for one paint).
  const h = await renderComponent(
    tree({ scope: scopeOf(3), pathname: `/clients/${CLIENT}`, clientName: null }),
  );
  try {
    const labels = collect(h.container, (n) => attr(n, "data-sidebar") === "group-label").map(textOf);
    assert.deepEqual(labels, ["Client", "E2E Accounting"]);
    assert.doesNotMatch(textOf(h.container), new RegExp(CLIENT), "the raw client id leaked into the sidebar text");
  } finally {
    await h.unmount();
  }
});

test("Accounting is OPEN when one of its children is current, and its eight children are the registry's", async () => {
  const h = await renderComponent(
    tree({ scope: scopeOf(3), pathname: `/clients/${CLIENT}/journals`, clientName: "Rome Properties" }),
  );
  try {
    const rendered = hrefs(h.container);
    assert.deepEqual(rendered.filter((href) => href.includes("/registers")), [
      `/clients/${CLIENT}/registers?tab=aging`,
      `/clients/${CLIENT}/registers?tab=fixedAssets`,
      `/clients/${CLIENT}/registers?tab=adjustments`,
      `/clients/${CLIENT}/registers?tab=accounts`,
    ]);
    assert.equal(rendered.includes(`/clients/${CLIENT}/journals`), true);
    assert.equal(rendered.includes(`/clients/${CLIENT}/tax`), true);
    // The Beta mark on the one surface whose page states an inactive boundary.
    assert.match(textOf(h.container), /Beta/);
  } finally {
    await h.unmount();
  }
});

test("Accounting is CLOSED on a route outside it — the group does not open itself for every client page", async () => {
  // The discriminating other half. Without it, "open when a child is active"
  // would pass just as happily on a collapsible that is always open.
  const h = await renderComponent(
    tree({ scope: scopeOf(3), pathname: `/clients/${CLIENT}/reports`, clientName: "Rome Properties" }),
  );
  try {
    assert.deepEqual(hrefs(h.container).filter((href) => href.includes("/journals")), []);
  } finally {
    await h.unmount();
  }
});

// ── exactly one current page ────────────────────────────────────────────────

test("EXACTLY ONE destination is aria-current, and a bare /registers marks the aging view", async () => {
  const cases: { pathname: string; query?: string; expected: string[] }[] = [
    { pathname: "/", expected: ["/"] },
    { pathname: "/work", query: "view=needs-you", expected: ["/work"] },
    { pathname: "/settings/members", expected: ["/settings"] },
    { pathname: `/clients/${CLIENT}`, expected: [`/clients/${CLIENT}`] },
    { pathname: `/clients/${CLIENT}/documents`, expected: [`/clients/${CLIENT}/documents`] },
    {
      pathname: `/clients/${CLIENT}/accounting`,
      expected: [`/clients/${CLIENT}/accounting`],
    },
    {
      pathname: `/clients/${CLIENT}/registers`,
      expected: [`/clients/${CLIENT}/registers?tab=aging`],
    },
    {
      pathname: `/clients/${CLIENT}/registers`,
      query: "tab=fixedAssets",
      expected: [`/clients/${CLIENT}/registers?tab=fixedAssets`],
    },
    // A register view the sidebar does not name: nothing is current, and the
    // group is still open. Marking a sibling would tell the human they are
    // somewhere they are not.
    { pathname: `/clients/${CLIENT}/registers`, query: "tab=opening", expected: [] },
    // The escalated Clara thread is client scope with nothing active.
    { pathname: `/clients/${CLIENT}/clara/t1`, expected: [] },
  ];

  for (const fixture of cases) {
    const h = await renderComponent(
      tree({
        scope: scopeOf(3),
        pathname: fixture.pathname,
        query: fixture.query,
        clientName: "Rome Properties",
      }),
    );
    try {
      assert.deepEqual(
        currentHrefs(h.container),
        fixture.expected,
        `${fixture.pathname}${fixture.query ? `?${fixture.query}` : ""}`,
      );
    } finally {
      await h.unmount();
    }
  }
});

// ── the landmark, the a11y tree and the keyboard walk ───────────────────────

test("the nav is ONE named landmark, and the tree is accessible and keyboard-walkable at both altitudes", async () => {
  for (const pathname of ["/settings", `/clients/${CLIENT}/journals`]) {
    const h = await renderComponent(
      tree({ scope: scopeOf(3, true), pathname, clientName: "Rome Properties" }),
    );
    try {
      const navs = collect(h.container, (n) => (n.tagName as string | undefined) === "NAV");
      assert.equal(navs.length, 1, `${pathname}: a 224px column must not offer two navigation landmarks`);
      assert.equal(attr(navs[0]!, "aria-label"), "Main");

      const violations = checkAccessibility(h.container);
      assert.deepEqual(violations, [], `${pathname}: ${JSON.stringify(violations)}`);
      assert.deepEqual(checkKeyboardWalk(h.container), [], pathname);
    } finally {
      await h.unmount();
    }
  }
});

test("the signed-in identity in the footer names the firm and the caller's role, and an unknown role renders VERBATIM", async () => {
  const known = await renderComponent(tree({ scope: scopeOf(2, false, "admin"), pathname: "/" }));
  try {
    assert.match(textOf(known.container), /Signed in to E2E Accounting/);
    assert.match(textOf(known.container), /Admin/);
  } finally {
    await known.unmount();
  }

  // A role outside the DB's four-value CHECK constraint must not render
  // next-intl's raw key path in the shell footer — the checked-lookup discipline
  // this repo applies to every dynamic message key.
  const surprise = await renderComponent(tree({ scope: scopeOf(3, false, "auditor"), pathname: "/" }));
  try {
    const text = textOf(surprise.container);
    assert.match(text, /auditor/);
    assert.doesNotMatch(text, /AppShell\.roles/);
  } finally {
    await surprise.unmount();
  }
});
