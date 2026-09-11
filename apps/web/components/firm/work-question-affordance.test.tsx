// #629 (B4) — WHERE FOCUS GOES WHEN THE ANSWERED ROW DISAPPEARS.
//
// THE REGRESSION THIS FILE EXISTS FOR. The affordance used to call `trigger.current?.focus()` and
// THEN ask for the reload. The reload is what removes the row — an answered question is no longer
// pending, so `clara.list_review_queue` stops returning it — so focus was placed on an element that
// was about to be unmounted. A browser drops focus to `<body>` when that happens: a keyboard user
// is returned to the top of the document and a screen-reader user loses their place entirely. §4 of
// the interaction contract names exactly this ("a row leaving a list must not dump focus onto the
// body"), and the code satisfied its own comment while breaking the rule.
//
// TWO HALVES, TESTED SEPARATELY BECAUSE THEY FAIL SEPARATELY:
//   · the ORDER — the reload is awaited before focus moves at all;
//   · the TARGET — the trigger if it survived (a refused act leaves the row in place, and a person
//     should be where they were), otherwise the nearest enclosing section's heading, which is the
//     landmark `app/(firm)/work/page.tsx` actually renders around this list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import {
  focusAfterRowReload,
  landmarkHeadingFor,
  restoreFocusAfterRow,
} from "./work-question-affordance";

enableDomInspection();

type Stub = Record<string, unknown>;

const byTestId = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string) =>
  h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === id);

/** The shape the Work page renders around this list: a section with a level-2 heading. */
function Page() {
  return createElement(
    "section",
    null,
    createElement("h2", { "data-testid": "section-heading" }, "Needs you"),
    createElement(
      "ul",
      null,
      createElement(
        "li",
        null,
        createElement(
          "div",
          { "data-testid": "row-container" },
          createElement("button", { type: "button", "data-testid": "row-trigger" }, "Answer"),
        ),
      ),
    ),
  );
}

test("the landmark is the enclosing SECTION's heading, found from the row's own container", async () => {
  const h = await renderComponent(createElement(Page));
  try {
    const container = byTestId(h, "row-container") as unknown as HTMLElement;
    const heading = byTestId(h, "section-heading");
    assert.ok(container, "the row renders");
    assert.equal(landmarkHeadingFor(container), heading,
      "the walk finds the level-2 heading this list lives under, not some global fallback");
  } finally {
    await h.unmount();
  }
});

test("a row that SURVIVES the reload keeps focus on its own trigger", async () => {
  const h = await renderComponent(createElement(Page));
  try {
    const trigger = byTestId(h, "row-trigger") as unknown as HTMLElement;
    const heading = byTestId(h, "section-heading") as unknown as HTMLElement;
    restoreFocusAfterRow(trigger, heading);
    // `assert.equal` on two stub DOM nodes builds a diff over a cyclic graph when it fails, which
    // never returns; identity is compared with `assert.ok` so a failure is a failure.
    assert.ok(activeElement() === (trigger as unknown),
      "a refused act leaves the row in place, and a person should be exactly where they were");
  } finally {
    await h.unmount();
  }
});

test("a row REMOVED by the reload hands focus to the landmark, never to the body", async () => {
  const h = await renderComponent(createElement(Page));
  try {
    const heading = byTestId(h, "section-heading") as unknown as HTMLElement;
    // WHAT THE RELOAD ACTUALLY LEAVES BEHIND: React nulls an unmounted row's ref, so the getter
    // this component reads AFTER the reload answers `null`. That is the signal — reported by React
    // rather than inferred from the DOM, and identical in a browser and in this harness.
    restoreFocusAfterRow(null, heading);
    assert.equal(activeElement(), heading, "focus lands on the stable landmark");
    assert.equal((heading as unknown as { getAttribute: (k: string) => string | null }).getAttribute("tabindex"), "-1",
      "…made programmatically focusable, and NOT a tab stop");
  } finally {
    await h.unmount();
  }
});

test("THE ORDER: the reload is awaited BEFORE focus moves — the whole point of the fix", async () => {
  const h = await renderComponent(createElement(Page));
  try {
    const heading = byTestId(h, "section-heading") as unknown as HTMLElement;
    const events: string[] = [];
    let triggerAlive = true;

    // The list's own act()-and-reload cycle, with the row removal it really performs.
    const act = async (fn: () => Promise<void>): Promise<boolean> => {
      await fn();
      await new Promise((r) => setTimeout(r, 0));
      events.push("reloaded");
      triggerAlive = false;
      return true;
    };
    const originalFocus = (heading as unknown as { focus: () => void }).focus;
    (heading as unknown as { focus: () => void }).focus = () => {
      events.push("focused");
      originalFocus.call(heading);
    };

    await focusAfterRowReload(act, () => (triggerAlive ? (byTestId(h, "row-trigger") as unknown as HTMLElement) : null), heading);

    assert.deepEqual(events, ["reloaded", "focused"],
      "focus is placed AFTER the list has settled — focusing first put it on a node about to unmount");
    assert.equal(activeElement(), heading);
  } finally {
    await h.unmount();
  }
});
