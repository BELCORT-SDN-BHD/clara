import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";

import { enableDomInspection } from "./domInspect";
import { renderComponent } from "./hookHarness";
import { checkAccessibility, pinnedBoxPx, TARGET_MIN_PX, twSizeToPx } from "./a11yRules";

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

/**
 * 裁-13 · WCAG 2.2 SC 2.5.8 target-size — the gate's own mechanism proof.
 *
 * The order's acceptance line is "the target-size gate RED on a deliberately
 * undersized fixture (prove it)"; the arms below are that, plus the two
 * halves that decide whether the rule is worth having: it must NOT fire on the
 * shapes that are legitimately unmeasurable (or the estate drowns in false
 * positives and someone deletes it), and its exception mechanism must be
 * impossible to use silently.
 */
describe("target-size (裁-13, WCAG 2.2 SC 2.5.8) — the floor", () => {
  it("the floor is READ from --target-min, not hardcoded — and globals.css declares 24px", () => {
    assert.equal(TARGET_MIN_PX, 24);
  });

  it("RED: a button that pins BOTH dimensions below the floor is flagged", async () => {
    const h = await renderComponent(createElement("button", { className: "size-4", "aria-label": "Dismiss" }));
    try {
      const violations = checkAccessibility(h.container as never);
      const hit = violations.find((v) => v.rule === "target-size");
      assert.ok(hit, JSON.stringify(violations));
      assert.match(hit.message, /height 16px and width 16px/);
    } finally {
      await h.unmount();
    }
  });

  it("RED: a pinned HEIGHT alone below the floor is enough — h-5 is a 20px control whatever its content", async () => {
    const h = await renderComponent(createElement("button", { className: "h-5 px-2" }, "Undo"));
    try {
      const violations = checkAccessibility(h.container as never);
      const hit = violations.find((v) => v.rule === "target-size");
      assert.ok(hit, JSON.stringify(violations));
      assert.match(hit.message, /height 20px/);
      assert.doesNotMatch(hit.message, /width/);
    } finally {
      await h.unmount();
    }
  });

  it("RED: an arbitrary-value pin is read too — h-[18px] does not evade the rule by spelling", async () => {
    const h = await renderComponent(createElement("a", { href: "/x", className: "h-[18px]" }, "Go"));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(violations.some((v) => v.rule === "target-size"), true, JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });

  it("PASS: exactly at the floor is compliant — size-6 is 24px and SC 2.5.8 says 'at least'", async () => {
    const h = await renderComponent(createElement("button", { className: "size-6", "aria-label": "Close" }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("PASS: an unpinned control makes no claim — this is what keeps SC 2.5.8's Inline exception free", async () => {
    const h = await renderComponent(
      createElement("p", null, "See ", createElement("a", { href: "/policy" }, "the policy"), " for detail."),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("PASS: a small min-h is NOT a shortfall — a floor with no cap leaves the box content-driven", async () => {
    const h = await renderComponent(createElement("button", { className: "min-h-4 px-2" }, "Save"));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("PASS: a variant-prefixed pin is not an unconditional one — sm:h-4 is not flagged", async () => {
    const h = await renderComponent(createElement("button", { className: "sm:h-4 px-2" }, "Save"));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("PASS: a REASONED exception is honoured — the 裁-13 documented-exception mechanism", async () => {
    const h = await renderComponent(
      createElement("button", {
        className: "size-4",
        "aria-label": "Remove row",
        "data-target-size-exception": "Dense journal-lines table; the row itself is the 24px target and this glyph is equivalent (SC 2.5.8 Equivalent).",
      }),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("RED: an EMPTY exception is itself a violation — a silent downgrade is not reachable", async () => {
    const h = await renderComponent(
      createElement("button", { className: "size-4", "aria-label": "Remove row", "data-target-size-exception": "  " }),
    );
    try {
      const violations = checkAccessibility(h.container as never);
      assert.equal(
        violations.some((v) => v.rule === "target-size-exception-unreasoned"),
        true,
        JSON.stringify(violations),
      );
    } finally {
      await h.unmount();
    }
  });

  it("PASS: a DISABLED undersized control is not a pointer target", async () => {
    const h = await renderComponent(createElement("button", { className: "size-4", "aria-label": "x", disabled: true }));
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations.filter((v) => v.rule.startsWith("target-size")), []);
    } finally {
      await h.unmount();
    }
  });

  it("the px reader itself: the Tailwind scale, the px keyword, arbitrary units, and the unmeasurable", () => {
    assert.equal(twSizeToPx("6"), 24);
    assert.equal(twSizeToPx("3.5"), 14);
    assert.equal(twSizeToPx("px"), 1);
    assert.equal(twSizeToPx("[18px]"), 18);
    assert.equal(twSizeToPx("[1.5rem]"), 24);
    // Fail-open on anything that is not a fixed pixel quantity.
    assert.equal(twSizeToPx("full"), null);
    assert.equal(twSizeToPx("auto"), null);
    assert.equal(twSizeToPx("dvh"), null);
    assert.equal(twSizeToPx("[calc(100%-2rem)]"), null);
  });

  it("the box reader: size- pins both axes, h-/w- pin one, and the last write wins", () => {
    assert.deepEqual(pinnedBoxPx("size-6"), { w: 24, h: 24 });
    assert.deepEqual(pinnedBoxPx("h-8 w-4"), { w: 16, h: 32 });
    assert.deepEqual(pinnedBoxPx("size-4 h-8"), { w: 16, h: 32 });
    assert.deepEqual(pinnedBoxPx("px-2 rounded-lg"), { w: null, h: null });
  });
});
