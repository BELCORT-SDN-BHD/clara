import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";

import { enableDomInspection } from "./domInspect";
import { renderComponent } from "./hookHarness";
import { isKeyboardOperable, focusableElements, positiveTabIndexElements, hasVisibleFocusRing, checkKeyboardWalk } from "./keyboardWalk";

enableDomInspection();

/**
 * Gate (c)'s own mechanism proof — mirrors test/a11yRules.test.ts's shape:
 * a PASSING arm and a deliberately RED-ON-MUTANT control for each rule, so
 * the detector is proven to be able to say both PASS and FAIL.
 */

describe("isKeyboardOperable", () => {
  it("PASS: a plain button, a real link, and a non-hidden input are all operable", async () => {
    const h = await renderComponent(
      createElement("div", null, createElement("button", null, "Go"), createElement("a", { href: "/x" }, "Link"), createElement("input", null)),
    );
    try {
      for (const el of focusableElements(h.container as never)) {
        assert.equal(isKeyboardOperable(el as never), true, String((el as { tagName?: string }).tagName));
      }
      assert.equal(focusableElements(h.container as never).length, 3);
    } finally {
      await h.unmount();
    }
  });

  it("RED-ON-MUTANT: a disabled button, a hidden input, and an aria-hidden link are all NOT operable", async () => {
    const h = await renderComponent(
      createElement(
        "div",
        null,
        createElement("button", { disabled: true }, "Go"),
        createElement("input", { type: "hidden" }),
        createElement("a", { href: "/x", "aria-hidden": "true" }, "Link"),
      ),
    );
    try {
      const found = focusableElements(h.container as never);
      assert.equal(
        found.length,
        0,
        `none of these three should be reachable: ${found.map((n) => (n as { tagName?: string }).tagName).join(",")}`,
      );
    } finally {
      await h.unmount();
    }
  });
});

describe("positiveTabIndexElements", () => {
  it("PASS: tabindex=0 and no tabindex at all are both fine (empty list)", async () => {
    const h = await renderComponent(createElement("div", null, createElement("button", { tabIndex: 0 }, "A"), createElement("button", null, "B")));
    try {
      assert.deepEqual(positiveTabIndexElements(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });

  it("RED-ON-MUTANT: tabindex=3 is flagged", async () => {
    const h = await renderComponent(createElement("button", { tabIndex: 3 }, "A"));
    try {
      assert.equal(positiveTabIndexElements(h.container as never).length, 1);
    } finally {
      await h.unmount();
    }
  });
});

describe("hasVisibleFocusRing", () => {
  it("PASS: a plain button (no outline override at all) keeps the global ring", async () => {
    const h = await renderComponent(createElement("button", { className: "text-sm" }, "A"));
    try {
      const [btn] = focusableElements(h.container as never);
      assert.equal(hasVisibleFocusRing(btn as never), true);
    } finally {
      await h.unmount();
    }
  });

  it("PASS: outline-none PAIRED with a focus-visible:ring replacement still counts as visible", async () => {
    const h = await renderComponent(createElement("button", { className: "outline-none focus-visible:ring-3 focus-visible:ring-ring/50" }, "A"));
    try {
      const [btn] = focusableElements(h.container as never);
      assert.equal(hasVisibleFocusRing(btn as never), true);
    } finally {
      await h.unmount();
    }
  });

  it("RED-ON-MUTANT: outline-none with NO replacement ring utility is flagged", async () => {
    const h = await renderComponent(createElement("button", { className: "outline-none" }, "A"));
    try {
      const [btn] = focusableElements(h.container as never);
      assert.equal(hasVisibleFocusRing(btn as never), false);
    } finally {
      await h.unmount();
    }
  });
});

describe("checkKeyboardWalk — combined", () => {
  it("PASS: a clean tree reports zero violations", async () => {
    const h = await renderComponent(createElement("div", null, createElement("button", null, "Go")));
    try {
      assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });

  it("RED-ON-MUTANT: a positive-tabindex control AND a ring-removed control are both reported", async () => {
    const h = await renderComponent(
      createElement("div", null, createElement("button", { tabIndex: 5 }, "A"), createElement("button", { className: "outline-none" }, "B")),
    );
    try {
      const violations = checkKeyboardWalk(h.container as never);
      assert.equal(violations.some((v) => v.rule === "tabindex-order"), true, JSON.stringify(violations));
      assert.equal(violations.some((v) => v.rule === "focus-visible"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});
