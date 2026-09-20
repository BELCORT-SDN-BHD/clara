// #896 — `StateBanner` silently dropped `data-testid` (and every other native div attribute):
// its prop type was closed and its root spread nothing, so a caller writing
// `<StateBanner data-testid="…">` compiled clean (TypeScript does not excess-property-check
// `data-*`/`aria-*` attributes on JSX, even against a closed custom-component prop type) and
// then found nothing in the DOM. `work-question-form.test.tsx` carries the live-defect cell for
// the one call site that passed `data-testid` straight through before this fix
// (`work-question-form.tsx`'s failed banner); this file is the component-level proof.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { StateBanner } from "./state";

enableDomInspection();

type Stub = { getAttribute?: (k: string) => string | null; childNodes?: Stub[] };

function findByTestId(node: Stub, id: string): Stub | null {
  if (node.getAttribute?.("data-testid") === id) return node;
  for (const child of node.childNodes ?? []) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}

test("896.testid — a data-testid passed to StateBanner is queryable in the rendered DOM", async () => {
  const h = await renderComponent(
    // `createElement` (unlike JSX) gets no compiler exemption for `data-*` attributes on a typed
    // component's props — that leniency is JSX-attribute-checking-specific, not a property React's
    // own types declare. The cast is the test's own concession to that, not evidence against #896's
    // fix (the DOM assertion below is what actually proves the attribute reached the root).
    createElement(StateBanner, { tone: "error", "data-testid": "my-banner", children: "Something failed" } as never),
  );
  try {
    const node = findByTestId(h.container as Stub, "my-banner");
    assert.ok(node, "data-testid must reach the root element StateBanner renders");
  } finally {
    await h.unmount();
  }
});

test("896.precedence — an extra native attribute passes through, but never overrides StateBanner's OWN computed ones", async () => {
  // The rest-spread must land BEFORE the component's own computed attributes, so a caller can
  // never accidentally clobber the tone-driven `role` — non-vacuity for the spread ORDER, not
  // only for its presence.
  const h = await renderComponent(
    createElement(StateBanner, {
      tone: "error",
      id: "extra-id",
      role: "note" as never,
      children: "Something failed",
    }),
  );
  try {
    const root = (h.container as Stub).childNodes?.[0] as
      | { getAttribute: (k: string) => string | null }
      | undefined;
    assert.ok(root, "the banner's root element must render");
    assert.equal(root!.getAttribute("id"), "extra-id", "an unrelated native attribute still passes through");
    assert.equal(
      root!.getAttribute("role"),
      "alert",
      "the tone-computed role is never overridden by a caller's rest prop",
    );
  } finally {
    await h.unmount();
  }
});

test("896.no-drift — the other 56 call sites' rendered output is unaffected: no title/code/action/silent/tone regression", async () => {
  // A bordered decision box with every optional slot filled, none of them touched by the rest
  // spread — proves the change is additive, not a reshuffle of the existing props.
  const h = await renderComponent(
    createElement(StateBanner, {
      tone: "warning", title: "Heads up", code: "CLR01", silent: true,
      action: createElement("button", null, "Retry"),
      children: "The body text",
    }),
  );
  try {
    const text = h.text();
    assert.match(text, /Heads up/);
    assert.match(text, /CLR01/);
    assert.match(text, /The body text/);
    assert.match(text, /Retry/);
    const root = (h.container as Stub).childNodes?.[0] as { getAttribute: (k: string) => string | null };
    assert.equal(root.getAttribute("role"), null, "silent still drops the live-region role");
  } finally {
    await h.unmount();
  }
});
