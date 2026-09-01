// GATE (b)/(c) — the Tax tab (P6-T, 裁-34). Every panel on this tip is a
// static honest note (SstPanel / TaxComputationPanel /
// TurnoverClassificationPanel — TaxWorkbenchPage.tsx's own header has the
// measured backend state), so unlike most a11y suites in this repo there is
// no RPC to mock: nothing here fetches.
//
// NO synthetic <h1> wrapper here — unlike needs-you-a11y.test.tsx/
// documents-a11y.test.tsx, whose target components mount under an AMBIENT
// h1 the real page supplies elsewhere. TaxWorkbenchPage renders its OWN
// `PageHeader` h1 internally (the route's page.tsx supplies none — see
// app/(firm)/clients/[clientId]/tax/page.tsx), so this fixture renders the
// component bare and lets the REAL h1/h2/h2/h2 tree stand — the only tree
// this file could scan and still have heading-order (the axe rule that
// actually applies here) mean anything. A synthetic h1 on top of the
// component's own real h1 would have hidden a heading-order violation
// rather than proving its absence (independent review, PR #487, M2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { TaxWorkbenchPage } from "./TaxWorkbenchPage";

enableDomInspection();

function renderTaxTab() {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(TaxWorkbenchPage, { clientId: "client-1111" }),
    }),
  );
}

test("the Tax tab (SST / income tax computation / turnover classification panels) has zero a11y violations", async () => {
  const h = await renderTaxTab();
  try {
    await h.settle();
    // Each panel's own honest note actually mounted — proves the three
    // panels are real children of TaxWorkbenchPage, not just imported.
    assert.match(h.text(), /SST/, "the SST panel heading must render");
    assert.match(h.text(), /Income tax computation/, "the tax computation panel heading must render");
    assert.match(h.text(), /Turnover classification/, "the turnover classification panel heading must render");
    assert.match(h.text(), /F-T1 PR-2 onward, paused/, "the SST panel's note must name its lane");
    assert.match(h.text(), /F-T3 PR-2…9, paused/, "the tax computation panel's note must name its lane");
    assert.match(h.text(), /Track B's Tax tab UI resumes/, "the turnover classification panel's note must name its lane");
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("the Tax tab keyboard walk: zero focusable controls today — a proposal/receipt surface, never a form (裁-44)", async () => {
  const h = await renderTaxTab();
  try {
    await h.settle();
    // Positive control (N2, independent review): prove the fixture actually
    // rendered real content BEFORE trusting the zero-focusable count below —
    // an empty/broken render would ALSO show 0 focusable elements, which
    // would make that assertion vacuously green for the wrong reason.
    assert.match(h.text(), /SST/, "the fixture must have rendered real content before the zero-focusable count below means anything");
    // The discriminating assertion this file exists for: Track B is paused,
    // so every panel is a static note with NOTHING to act on. If a future
    // ride-along PR adds a real control without updating this count, THIS
    // is the line that goes red — a direct, mechanical guard on 裁-44's
    // "never an input grid" rule, not a vacuous "nothing to click" shrug.
    const focusable = focusableElements(h.container as never);
    assert.equal(focusable.length, 0, "the Tax tab must render no focusable control while every panel is an honest note");
    const violations = checkKeyboardWalk(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});
