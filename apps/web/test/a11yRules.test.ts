import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";

import { enableDomInspection } from "./domInspect";
import { renderComponent } from "./hookHarness";
import { checkAccessibility } from "./a11yRules";

enableDomInspection();

/**
 * Gate (b)'s own mechanism proof — see domInspect.ts's header for why this
 * hand-written rule engine exists instead of real axe-core. This suite
 * proves the detector itself can say both PASS and FAIL (review law 1's
 * "deliberately red" requirement), not just "always PASS".
 */

describe("checkAccessibility — PASSING ARM", () => {
  it("a well-formed tree (labelled button, real link, ordered headings, labelled input) has zero violations", async () => {
    const h = await renderComponent(
      createElement(
        "div",
        null,
        createElement("h1", null, "Title"),
        createElement("h2", null, "Section"),
        createElement("button", { "aria-label": "Save" }),
        createElement("a", { href: "/next" }, "Continue"),
        createElement("input", { "aria-label": "Search" }),
        createElement("img", { alt: "" }),
      ),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});

describe("checkAccessibility — RED-ON-MUTANT CONTROL", () => {
  it("an unlabelled, empty button is flagged as button-name — the detector CAN say FAIL", async () => {
    const h = await renderComponent(createElement("div", null, createElement("button", null)));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.length, 1, JSON.stringify(violations));
      assert.equal(violations[0]!.rule, "button-name");
    } finally {
      await h.unmount();
    }
  });

  it("an unlabelled link is flagged as link-name", async () => {
    const h = await renderComponent(createElement("a", { href: "/x" }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "link-name"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("an unlabelled input is flagged as label", async () => {
    const h = await renderComponent(createElement("input", null));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "label"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("an img with no alt attribute is flagged as image-alt", async () => {
    const h = await renderComponent(createElement("img", null));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "image-alt"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("two elements sharing an id are flagged as duplicate-id", async () => {
    const h = await renderComponent(
      createElement("div", null, createElement("span", { id: "dup" }), createElement("span", { id: "dup" })),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "duplicate-id"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("a heading level skip (h1 -> h3) is flagged as heading-order", async () => {
    const h = await renderComponent(
      createElement("div", null, createElement("h1", null, "Title"), createElement("h3", null, "Too deep")),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "heading-order"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("an unrecognised aria-* attribute name is flagged as aria-valid-attr", async () => {
    const h = await renderComponent(createElement("button", { "aria-label": "x", "aria-bogus": "y" }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "aria-valid-attr"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("a boolean aria-* attribute with an invalid value is flagged as aria-valid-attr-value", async () => {
    const h = await renderComponent(createElement("button", { "aria-label": "x", "aria-expanded": "yes" }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "aria-valid-attr-value"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it('role="tab" without aria-selected is flagged as aria-required-attr', async () => {
    const h = await renderComponent(createElement("div", { role: "tab" }, "Tab"));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "aria-required-attr"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it('role="dialog" with no accessible name is flagged as aria-dialog-name', async () => {
    const h = await renderComponent(createElement("div", { role: "dialog" }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "aria-dialog-name"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});
