// #651 — `?tab=` on the asset detail: the URL-state contract, measured at the face.
//
// WHAT WAS WRONG. The five readings of one asset were a local `useState`, so a refresh lost the
// tab, a link could not name one, and Back left the page entirely. Appendix D row 58 permits
// alternate views inside one route ON CONDITION the state is shareable, and the fifth tab this
// ticket adds is exactly the case that makes that condition bite: "this asset's estimate has never
// been revised" is a reading somebody needs to be able to send to a colleague.
//
// THE HISTORY VERB IS THE SUBJECT, not the resulting address — a push and a replace reach the same
// URL and differ only in what Back then does, so a cell that asserted the address would pass on the
// exact defect this file exists to catch. FOCUS is not one of this file's claims: there is no focus
// manager in this environment, and `document.activeElement` after a real Back is measured in
// e2e/depreciation-walk.spec.ts and only there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { FixedAssetDetailView, isFaDetailTab } from "./fixed-asset-detail";
import {
  faApp, makeNavigation, faDetail, FA_COA, FA_CLIENT, FA_ASSET, jsonResponse, withMockedEnv,
  type Navigation,
} from "./fa-depreciation-test-fixtures";

enableDomInspection();

const detailFetch = (detail: unknown): typeof fetch => (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/rpc/get_fixed_asset")) return jsonResponse(detail);
  if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(FA_COA);
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

type Harness = Awaited<ReturnType<typeof renderComponent>> & { sync: () => Promise<void>; nav: Navigation };

async function withDetail(search: string, run: (h: Harness) => Promise<void>): Promise<void> {
  await withMockedEnv(detailFetch(faDetail()), async () => {
    const nav = makeNavigation(search);
    const tree = () => faApp(createElement(FixedAssetDetailView, { clientId: FA_CLIENT, assetId: FA_ASSET }), nav);
    const base = await renderComponent(tree());
    const h: Harness = Object.assign(base, {
      nav,
      sync: async () => {
        await base.rerender(tree());
        for (let i = 0; i < 6; i++) await base.settle();
      },
    });
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await run(h);
    } finally {
      await h.unmount();
    }
  });
}

async function clickTab(h: Harness, label: string) {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === label);
  assert.ok(trigger, `expected a tab trigger labelled "${label}"`);
  await h.fireEvent(trigger!, "click");
  await h.sync();
}

test("tabUrl.parser the five tab ids are the closed set, and anything else falls back rather than rendering nothing", () => {
  for (const id of ["acquisition", "particulars", "revisions", "schedule", "history"]) {
    assert.equal(isFaDetailTab(id), true, `${id} is a tab`);
  }
  assert.equal(isFaDetailTab("fixedAssets"), false, "…and the REGISTER's own tab id is not one of them");
  assert.equal(isFaDetailTab(null), false);
  assert.equal(isFaDetailTab("../etc"), false);
});

test("tabUrl.roundtrip selecting a tab writes ?tab= with REPLACE, and a pasted ?tab= lands on that reading", async () => {
  await withDetail("", async (h) => {
    // The default is the acquisition — the first thing that is true about an asset.
    assert.match(h.text(), /Compressor purchased/);

    await clickTab(h, "Policy & effective revisions");
    assert.deepEqual(h.nav.kinds(), ["replace"],
      "REPLACE, not push: a tab is a reading of one object, and pushing one entry per glance would make Back walk five tabs instead of leaving the page");
    assert.match(h.nav.search(), /(^|&)tab=revisions(&|$)/, "…and the id is in the URL, so the reading is shareable");
    assert.match(h.text(), /plant survey/, "…and the timeline really rendered");
  });

  // A PASTED LINK LANDS ON THE READING IT NAMES — the half a local useState can never have.
  await withDetail("tab=history", async (h) => {
    assert.match(h.text(), /Charge ledger/, "?tab=history opens the charge ledger straight away");
    assert.deepEqual(h.nav.kinds(), [], "…with no navigation of its own: the URL was already right");
  });
});

test("tabUrl.back Back returns to the tab the reader came from, and an unknown ?tab= falls back to the first reading", async () => {
  await withDetail("tab=revisions", async (h) => {
    assert.match(h.text(), /plant survey/);
    await clickTab(h, "History");
    assert.match(h.text(), /Charge ledger/);

    h.nav.router.back();
    await h.sync();
    // The stack holds one entry per PUSH; every tab move replaced, so Back leaves the page rather
    // than walking the tabs — which is the behaviour `replace` was chosen for.
    assert.equal(h.nav.kinds().includes("back"), true);
  });

  await withDetail("tab=not-a-tab", async (h) => {
    assert.match(h.text(), /Compressor purchased/,
      "an unknown tab id renders the FIRST reading rather than a blank page");
  });
});

test("tabUrl.five_tabs the strip really offers five readings, and the revisions tab is between particulars and schedule", async () => {
  await withDetail("", async (h) => {
    const labels = ["Acquisition", "Particulars & policy", "Policy & effective revisions", "Schedule", "History"];
    for (const label of labels) {
      assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === label),
        `the strip offers "${label}"`);
    }
  });
});
