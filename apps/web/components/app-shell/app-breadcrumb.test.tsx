// THE BREADCRUMB (#614) — the shell's "where am I", and the replacement for the
// `<h1>Client: <name></h1>` that used to sit above every client route.
//
// TWO CLAIMS, and the second is the one that earns its keep:
//
//   1. ANCESTRY. Every crumb but the last is a real link; the last is not, and
//      is marked `aria-current="page"`. A trail whose final crumb links to the
//      page you are already on is the commonest breadcrumb defect there is.
//   2. IDENTITY SURVIVES THE COLLAPSE. Below `sm` the trail shows the SCOPE (the
//      client's name inside a client, the firm's outside one) and the CURRENT
//      PAGE, with an ellipsis where the omitted crumbs were. At 320px, and at
//      640 CSS px which is a 1280px window at 200% zoom, "whose books am I
//      looking at" must still be on screen — that is the whole reason the old
//      client heading could not simply be deleted.
//
// HOW THE NARROW ARM IS MEASURED HERE, honestly. There is no layout engine and
// no stylesheet in this harness, so a cell cannot see what a viewport renders.
// What it CAN see is which crumbs carry the collapse class and which do not,
// which is the decision the component actually makes; `e2e/responsive-shell-walk
// .spec.ts` measures the pixels. The class is `sr-only`, not `hidden`, and that
// is asserted too: `display: none` would take a collapsed crumb out of the
// ACCESSIBILITY tree as well as the layout, so a screen-reader user on a phone
// would lose the ancestry links entirely.

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
import { AppBreadcrumbView } from "./app-breadcrumb";

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

/** Every crumb, in document order, as `[text, href|null, collapsed]`. */
function crumbs(root: Stub): [string, string | null, boolean][] {
  const items = collect(root, (n) => attr(n, "data-slot") === "breadcrumb-item");
  return items
    .filter((item) => collect(item, (n) => attr(n, "data-slot") === "breadcrumb-ellipsis").length === 0)
    .map((item) => {
      const link = collect(item, (n) => (n.tagName as string | undefined) === "A")[0];
      const cls = attr(item, "class") ?? "";
      return [textOf(item), link ? attr(link, "href") : null, cls.includes("sr-only")];
    });
}

const ellipsisCount = (root: Stub) =>
  collect(root, (n) => attr(n, "data-slot") === "breadcrumb-ellipsis").length;

function tree({
  pathname,
  query = "",
  clientName = null,
}: {
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
        createElement(AppBreadcrumbView, {
          pathname,
          searchParams: new URLSearchParams(query),
          firmName: "E2E Accounting",
          clientName,
        }),
      ),
    ),
  });
}

async function render(args: Parameters<typeof tree>[0]) {
  return renderComponent(tree(args));
}

// ── ancestry ────────────────────────────────────────────────────────────────

test("the trail is the page's ancestry, and the CURRENT page is never a link", async () => {
  const cases: { name: string; args: Parameters<typeof tree>[0]; expected: [string, string | null][] }[] = [
    { name: "firm home", args: { pathname: "/" }, expected: [["E2E Accounting", null]] },
    {
      name: "work",
      args: { pathname: "/work" },
      expected: [
        ["E2E Accounting", "/"],
        ["Work", null],
      ],
    },
    {
      name: "a settings section",
      args: { pathname: "/settings/members" },
      expected: [
        ["E2E Accounting", "/"],
        ["Settings", "/settings"],
        ["Members", null],
      ],
    },
    {
      name: "an accounting child",
      args: { pathname: `/clients/${CLIENT}/journals`, clientName: "Rome Properties" },
      expected: [
        ["E2E Accounting", "/"],
        ["Clients", "/clients"],
        ["Rome Properties", `/clients/${CLIENT}`],
        ["Accounting", `/clients/${CLIENT}/accounting`],
        ["Journals", null],
      ],
    },
    {
      name: "a register view",
      args: {
        pathname: `/clients/${CLIENT}/registers`,
        query: "tab=fixedAssets",
        clientName: "Rome Properties",
      },
      expected: [
        ["E2E Accounting", "/"],
        ["Clients", "/clients"],
        ["Rome Properties", `/clients/${CLIENT}`],
        ["Accounting", `/clients/${CLIENT}/accounting`],
        ["Assets", null],
      ],
    },
  ];

  for (const fixture of cases) {
    const h = await render(fixture.args);
    try {
      assert.deepEqual(
        crumbs(h.container).map(([text, href]) => [text, href]),
        fixture.expected,
        fixture.name,
      );
    } finally {
      await h.unmount();
    }
  }
});

test("the SAVED VIEW is not a crumb — /work?view=needs-you has the same ancestry as /work", async () => {
  // A saved view is a filter on a destination, not a deeper location. Making it
  // a crumb would promise a level of the tree that does not exist, and the
  // page's own view strip already carries `aria-current` for it.
  const plain = await render({ pathname: "/work" });
  const filtered = await render({ pathname: "/work", query: "view=needs-you" });
  try {
    assert.deepEqual(crumbs(plain.container), crumbs(filtered.container));
  } finally {
    await plain.unmount();
    await filtered.unmount();
  }
});

test("an unresolved client name falls back to the neutral placeholder — never the raw id, never a guessed name", async () => {
  const h = await render({ pathname: `/clients/${CLIENT}/documents`, clientName: null });
  try {
    assert.deepEqual(
      crumbs(h.container).map(([text]) => text),
      ["E2E Accounting", "Clients", "Client", "Documents"],
    );
    assert.doesNotMatch(textOf(h.container), new RegExp(CLIENT), "the raw client id leaked into the breadcrumb text");
  } finally {
    await h.unmount();
  }
});

// ── the narrow arm ──────────────────────────────────────────────────────────

test("the collapse KEEPS the scope and the current page, and hides everything between them", async () => {
  const h = await render({ pathname: `/clients/${CLIENT}/journals`, clientName: "Rome Properties" });
  try {
    const rows = crumbs(h.container);
    assert.deepEqual(
      rows.map(([text, , collapsed]) => [text, collapsed]),
      [
        ["E2E Accounting", true],
        ["Clients", true],
        // THE SCOPE — the client's own name. Never collapsed, at any width.
        ["Rome Properties", false],
        ["Accounting", true],
        // THE CURRENT PAGE.
        ["Journals", false],
      ],
    );
    // One ellipsis for the ancestors before the scope, one for the crumb
    // between the scope and the page.
    assert.equal(ellipsisCount(h.container), 2);
  } finally {
    await h.unmount();
  }
});

test("the collapse KEEPS the placeholder scope crumb too — the pre-hydration parity hole closed", async () => {
  // Before `scope` (lib/navigation/tree.ts's `Crumb`) was an explicit flag, the
  // narrow arm picked the scope crumb by finding the LAST `kind: "text"` crumb.
  // Before the client layout publishes the client's name, the client crumb is
  // `kind: "message"` — the neutral placeholder, never the raw id (#614 A7) —
  // so that heuristic fell through to the FIRM crumb, and the placeholder
  // collapsed away exactly when a human most needed "whose books am I looking
  // at" on screen: the frame right after a hard load or a client switch.
  const h = await render({ pathname: `/clients/${CLIENT}/documents`, clientName: null });
  try {
    const rows = crumbs(h.container);
    assert.deepEqual(
      rows.map(([text, , collapsed]) => [text, collapsed]),
      [
        ["E2E Accounting", true],
        ["Clients", true],
        // THE SCOPE — the placeholder, never the firm, survives the collapse.
        ["Client", false],
        // THE CURRENT PAGE.
        ["Documents", false],
      ],
    );
    // One ellipsis: everything before the placeholder. Nothing sits between the
    // placeholder and the current page on this route, so there is no second one.
    assert.equal(ellipsisCount(h.container), 1);
  } finally {
    await h.unmount();
  }
});

test("at FIRM scope the firm's name is what survives, and a two-crumb trail collapses nothing", async () => {
  const settings = await render({ pathname: "/settings/members" });
  try {
    assert.deepEqual(
      crumbs(settings.container).map(([text, , collapsed]) => [text, collapsed]),
      [
        ["E2E Accounting", false],
        ["Settings", true],
        ["Members", false],
      ],
    );
    assert.equal(ellipsisCount(settings.container), 1);
  } finally {
    await settings.unmount();
  }

  // The discriminating control: nothing to omit means no ellipsis at all. A
  // component that always rendered one would pass the cell above.
  const work = await render({ pathname: "/work" });
  try {
    assert.deepEqual(
      crumbs(work.container).map(([, , collapsed]) => collapsed),
      [false, false],
    );
    assert.equal(ellipsisCount(work.container), 0);
  } finally {
    await work.unmount();
  }
});

test("a collapsed crumb is sr-only, NOT display:none — the ancestry survives for a screen reader at every width", async () => {
  const h = await render({ pathname: `/clients/${CLIENT}/journals`, clientName: "Rome Properties" });
  try {
    const items = collect(h.container, (n) => attr(n, "data-slot") === "breadcrumb-item");
    const collapsed = items.filter((item) => (attr(item, "class") ?? "").includes("sr-only"));
    assert.ok(collapsed.length > 0, "nothing collapses — is the scope index wrong?");
    for (const item of collapsed) {
      const cls = attr(item, "class") ?? "";
      assert.match(cls, /sm:not-sr-only/, "a collapsed crumb must come back at sm and above");
      assert.doesNotMatch(
        cls,
        /(^|\s)hidden(\s|$)/,
        "display:none would remove the crumb from the accessibility tree, not just the layout",
      );
    }
    // …and the links really are still there to be read.
    const anchors = collect(h.container, (n) => (n.tagName as string | undefined) === "A");
    assert.equal(anchors.length, 4, "every ancestor is still a reachable link");
  } finally {
    await h.unmount();
  }
});

// ── the landmark and the a11y tree ──────────────────────────────────────────

test("the trail is a named landmark and its tree is accessible and keyboard-walkable", async () => {
  for (const pathname of ["/", "/settings/members", `/clients/${CLIENT}/registers`]) {
    const h = await render({ pathname, clientName: "Rome Properties" });
    try {
      const navs = collect(h.container, (n) => (n.tagName as string | undefined) === "NAV");
      assert.equal(navs.length, 1, pathname);
      assert.equal(attr(navs[0]!, "aria-label"), "Breadcrumb");

      // Exactly one `aria-current="page"`, and it is the crumb with no href.
      const current = collect(h.container, (n) => attr(n, "aria-current") === "page");
      assert.equal(current.length, 1, pathname);
      assert.equal((current[0]!.tagName as string | undefined), "SPAN", "the current crumb must not be a link");

      const violations = checkAccessibility(h.container);
      assert.deepEqual(violations, [], `${pathname}: ${JSON.stringify(violations)}`);
      assert.deepEqual(checkKeyboardWalk(h.container), [], pathname);
    } finally {
      await h.unmount();
    }
  }
});
