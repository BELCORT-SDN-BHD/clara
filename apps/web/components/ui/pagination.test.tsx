// #771 — `PaginationLink` used to route BOTH branches through Base UI's `Button` with
// `nativeButton={false}`, which stamped `role="button"` onto a real `<a href>` — the control
// navigated like a link (real href, middle-click/open-in-new-tab worked) while assistive tech
// announced it as a button. `PaginationLink` now branches on `href`: with one, a plain `<a href>`
// with no added `role`/`type`; without one, a real `<button>`. These two cells prove the branch
// on the rendered DOM shape directly.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { PaginationLink } from "./pagination";

enableDomInspection();

test("PaginationLink WITH an href renders a plain <a> — no role, no type (ticket 771)", async () => {
  const h = await renderComponent(
    createElement(PaginationLink, { href: "/work?cursor=abc" }, "Next"),
  );
  try {
    const anchor = h.find((n) => n.tagName === "A");
    assert.ok(anchor, "an <a> element is rendered");
    assert.equal(
      (anchor as { getAttribute?: (k: string) => string | null }).getAttribute?.("role"),
      null,
      "no role attribute is stamped onto the anchor",
    );
    assert.equal(
      (anchor as { getAttribute?: (k: string) => string | null }).getAttribute?.("type"),
      null,
      "an anchor never carries a type attribute",
    );
    assert.equal(
      (anchor as { getAttribute?: (k: string) => string | null }).getAttribute?.("href"),
      "/work?cursor=abc",
    );
    assert.equal(h.find((n) => n.tagName === "BUTTON"), null, "no button element is rendered");
  } finally {
    await h.unmount();
  }
});

test("PaginationLink WITHOUT an href renders a real <button> — no anchor, no added role (ticket 771)", async () => {
  const h = await renderComponent(createElement(PaginationLink, {}, "Next"));
  try {
    const button = h.find((n) => n.tagName === "BUTTON");
    assert.ok(button, "a <button> element is rendered");
    assert.equal(
      (button as { getAttribute?: (k: string) => string | null }).getAttribute?.("role"),
      null,
      "no role is added to a real button",
    );
    assert.equal(
      (button as { getAttribute?: (k: string) => string | null }).getAttribute?.("type"),
      "button",
    );
    assert.equal(h.find((n) => n.tagName === "A"), null, "no anchor is rendered");
  } finally {
    await h.unmount();
  }
});
