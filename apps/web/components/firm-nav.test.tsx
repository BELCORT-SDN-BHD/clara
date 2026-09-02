import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { FirmNavView } from "./firm-nav";
import { checkAccessibility } from "../test/a11yRules";
import { enableDomInspection } from "../test/domInspect";
import { renderComponent } from "../test/hookHarness";
import { checkKeyboardWalk } from "../test/keyboardWalk";
import messages from "../messages/en.json";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
};

function hrefs(root: Node): string[] {
  const out: string[] = [];
  const visit = (node: Node): void => {
    if (node.tagName === "A") {
      const href = node.getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return out;
}

function currentHrefs(root: Node): string[] {
  const out: string[] = [];
  const visit = (node: Node): void => {
    if (node.tagName === "A" && node.getAttribute?.("aria-current") === "page") {
      const href = node.getAttribute("href");
      if (href) out.push(href);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return out;
}

function navAt(role_rank: number | null, is_operator = false, pathname = "/admin") {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FirmNavView, {
      scope: { role_rank, is_operator },
      pathname,
    }),
  });
}

const PRIMARY_VIEWER = ["/", "/needs-you", "/clients", "/admin"];
const PRIMARY_BOOKKEEPER = ["/", "/needs-you", "/clients", "/activity", "/admin"];

test("rank shaping follows viewer < bookkeeper < admin < owner, with operator as an additional owner-only conjunct", async () => {
  const cases = [
    { name: "unknown rank", rank: null, operator: false, expected: [] },
    {
      name: "viewer",
      rank: 0,
      operator: false,
      expected: [...PRIMARY_VIEWER, "/admin/compliance", "/admin/settings"],
    },
    {
      name: "bookkeeper",
      rank: 1,
      operator: false,
      expected: [
        ...PRIMARY_BOOKKEEPER,
        "/admin/compliance",
        "/admin/vendor-bindings",
        "/admin/settings",
      ],
    },
    {
      name: "admin",
      rank: 2,
      operator: false,
      expected: [
        ...PRIMARY_BOOKKEEPER,
        "/admin/members",
        "/admin/compliance",
        "/admin/vendor-bindings",
        "/admin/settings",
      ],
    },
    {
      name: "non-operator owner",
      rank: 3,
      operator: false,
      expected: [
        ...PRIMARY_BOOKKEEPER,
        "/admin/members",
        "/admin/compliance",
        "/admin/vendor-bindings",
        "/admin/settings",
      ],
    },
    {
      name: "operator owner",
      rank: 3,
      operator: true,
      expected: [
        ...PRIMARY_BOOKKEEPER,
        "/admin/members",
        "/admin/registrations",
        "/admin/compliance",
        "/admin/vendor-bindings",
        "/admin/settings",
      ],
    },
  ] as const;

  for (const fixture of cases) {
    const h = await renderComponent(navAt(fixture.rank, fixture.operator));
    try {
      assert.deepEqual(hrefs(h.container as never), fixture.expected, fixture.name);
    } finally {
      await h.unmount();
    }
  }
});

test("the nested sidebar is accessible and keyboard-walkable with exactly one current page", async () => {
  const h = await renderComponent(navAt(3, true, "/admin/members"));
  try {
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    assert.deepEqual(currentHrefs(h.container as never), ["/admin/members"]);
  } finally {
    await h.unmount();
  }
});
