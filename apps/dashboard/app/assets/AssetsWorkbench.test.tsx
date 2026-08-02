// [F17/CX6#6-style discipline] AssetListBody render-branch tests (the
// AgingWorkbench.test.tsx / ReconciliationPanel.test.tsx pattern: createElement
// + renderToStaticMarkup, no jsdom). Pins that every ScreenState arm has an
// explicit render — no default table arm exists that a new/renamed state
// could silently fall into, and 'error'/'unavailable'/'loading'/'empty' never
// leak a stale row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetListBody } from "./AssetsWorkbench";
import { toAssetRow, type AssetRow } from "./assetsModel";
import { fmtCents } from "../shared/fmt";

const ASSET: AssetRow = toAssetRow({
  id: "a1000000-0000-4000-8000-000000000001",
  description: "Toyota Hilux 2024",
  status: "active",
  particulars_complete: true,
  cost_cents: 15000000,
  residual_cents: 100000,
  accumulated_cents: 2500000,
  nbv_cents: 12400000,
  method: "straight_line",
  useful_life_months: 60,
  start_date: "2026-01-15",
  asset_account: "170-000",
  accum_account: "170-100",
  expense_account: "620-500",
  is_commercial_vehicle: true,
  is_new: true,
  uncharged_due_count: 0,
});

function render(props: Partial<Parameters<typeof AssetListBody>[0]> = {}): string {
  return renderToStaticMarkup(createElement(AssetListBody, {
    state: "ideal", assets: [], selectedAssetId: null, onSelect: () => {},
    ...props,
  }));
}

test("'ideal' state with assets renders the register table incl. cost/accumulated/NBV", () => {
  const html = render({ state: "ideal", assets: [ASSET] });
  assert.ok(html.includes("Toyota Hilux 2024"));
  assert.ok(html.includes(fmtCents(15000000)));
  assert.ok(html.includes(fmtCents(2500000)));
  assert.ok(html.includes(fmtCents(12400000)));
});

test("[red-proof] the 'error' arm renders NO register table at all, even given rows in hand", () => {
  const html = render({ state: "error", assets: [ASSET] });
  assert.ok(!html.includes("Toyota Hilux 2024"), "no stale asset row under an error state");
  assert.ok(!html.includes("<table"), "no register table renders at all under 'error'");
  assert.ok(html.includes("Could not load"));
});

test("every ScreenState arm has an explicit render — 'unavailable'/'empty'/'loading' never fall through to a stale table", () => {
  const unavailable = render({ state: "unavailable", assets: [ASSET] });
  assert.ok(!unavailable.includes("Toyota Hilux 2024"));
  assert.ok(unavailable.includes("unexpected shape"));

  const empty = render({ state: "empty", assets: [ASSET] });
  assert.ok(!empty.includes("Toyota Hilux 2024"));
  assert.ok(empty.includes("No fixed assets"));

  const loading = render({ state: "loading", assets: [ASSET] });
  assert.ok(!loading.includes("Toyota Hilux 2024"));
  assert.ok(loading.includes("Loading"));
});

test("an incomplete asset's row carries the incomplete tag; a complete one does not", () => {
  const incomplete = render({ state: "ideal", assets: [toAssetRow({ ...ASSET, particulars_complete: false })] });
  assert.ok(incomplete.includes("incomplete"));
  const complete = render({ state: "ideal", assets: [ASSET] });
  assert.ok(!complete.includes(">incomplete<"));
});

test("an asset with uncharged due periods shows the due count; one with none shows the dash", () => {
  const due = render({ state: "ideal", assets: [toAssetRow({ ...ASSET, uncharged_due_count: 2 })] });
  assert.ok(due.includes("2 due"));
  const clean = render({ state: "ideal", assets: [ASSET] });
  assert.ok(clean.includes("—"));
});

test("selecting a row applies the active row class", () => {
  const html = render({ state: "ideal", assets: [ASSET], selectedAssetId: ASSET.id });
  assert.ok(html.includes("counterpartyRowActive") || /class="[^"]*Active[^"]*"/.test(html));
});
