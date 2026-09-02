import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { it } from "node:test";

import { checkAccessibility } from "../../test/a11yRules";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import messages from "../../messages/en.json";
import { RouteError } from "./route-error";

enableDomInspection();

it("renders a safe digest-backed fallback and its reset recovery", async () => {
  let resets = 0;
  const harness = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(RouteError, {
      error: Object.assign(new Error("secret database detail"), { digest: "ERR-abc123" }),
      reset: () => { resets += 1; },
    }),
  }));
  try {
    assert.match(harness.text(), /Support code: ERR-abc123/);
    assert.doesNotMatch(harness.text(), /secret database detail/);
    assert.deepEqual(checkAccessibility(harness.container as never), []);
    const button = harness.find((node) => node.tagName === "BUTTON");
    await harness.fireEvent(button as never, "click");
    assert.equal(resets, 1);
  } finally { await harness.unmount(); }
});
