import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";

import { ClaraRailChrome } from "./rail-chrome";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import { claraThreadStore } from "../../lib/clara/threadStore";

enableDomInspection();

type Stub = Record<string, unknown>;
const attr = (node: Stub, name: string): string | null => {
  const get = node.getAttribute as ((n: string) => string | null) | undefined;
  return get ? get.call(node, name) : null;
};
const hasAttr = (node: Stub, name: string): boolean => attr(node, name) !== null;

// #614 AC6 — one overlay stack. While the mobile navigation Sheet is open the
// rail must be inert: the browser leg measured Base UI's hide-others sweep
// reaching the sidebar inset but not this sibling. The prop is the whole
// contract; rail-mount.tsx derives it from the sidebar context.
test("inert reaches BOTH the scrim and the wrapper, and is absent otherwise", async () => {
  claraThreadStore.setRailOpen(true);
  const rail = (inert: boolean) =>
    createElement(ClaraRailChrome, { inert, children: createElement("div", { "data-probe": "" }, "rail") });

  const on = await renderComponent(rail(true));
  try {
    const marked = [] as Stub[];
    const walk = (n: Stub) => {
      if (hasAttr(n, "inert")) marked.push(n);
      for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
    };
    walk(on.container);
    assert.equal(marked.length, 2, "expected the scrim and the wrapper to carry inert");
    const wrapper = on.find((n) => attr(n, "tabindex") === "-1");
    assert.ok(wrapper && hasAttr(wrapper, "inert"), "the focusable wrapper is not inert");
  } finally {
    await on.unmount();
  }

  const off = await renderComponent(rail(false));
  try {
    const any = off.find((n) => hasAttr(n, "inert"));
    assert.ok(any == null, "inert leaked onto the rail while no modal is above it");
  } finally {
    await off.unmount();
    claraThreadStore.setRailOpen(true);
  }
});
