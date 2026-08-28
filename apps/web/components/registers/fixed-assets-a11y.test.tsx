// GATE (b) — structural a11y scan of the T3 fixed-assets write surface (owner
// ruling Q7). FixedAssetsRegister composes the table + the account-profiles
// panel + the tie-out banner + the depreciation authority/runs panel, each
// self-fetching — mocked exactly like components/bank/bank-a11y.test.tsx's
// own precedent (URL-substring dispatch, minimal realistic fixtures so every
// panel renders its real, non-empty markup).
//
// Wrapped in a synthetic <h1>, the same idiom close-a11y.test.tsx/
// bank-a11y.test.tsx use: on the real page this tab renders under
// PageHeader's own <h1>; each panel's own SectionHeader is a valid section
// heading under that ambient h1 in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { FixedAssetsRegister } from "./fixed-assets-register";
import messages from "../../messages/en.json";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const INCOMPLETE_ASSET = {
  id: "a1", description: "Delivery van", status: "pending", particulars_complete: false,
  acquired_date: "2026-01-15", effective_from: "2026-01-15", cost_cents: 8000000, residual_cents: null,
  accumulated_cents: null, nbv_cents: null, method: null, rate_bps: null, useful_life_months: null,
  start_date: null, asset_account: "1500", accum_account: null, expense_account: null, ca_class: null,
  is_commercial_vehicle: null, is_new: null, superseded_by_asset_id: null, disposed_at: null,
  disposal_entry_id: null, uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
};
const ACTIVE_ASSET = {
  ...INCOMPLETE_ASSET, id: "a2", description: "Office laptop", status: "active", particulars_complete: true,
  cost_cents: 500000, residual_cents: 0, accumulated_cents: 100000, nbv_cents: 400000, method: "straight_line",
  useful_life_months: 36, start_date: "2026-01-15",
};
const ASSETS_ENVELOPE = { client_id: "c1", as_of: "2026-08-27", assets: [INCOMPLETE_ASSET, ACTIVE_ASSET], incomplete_count: 1 };
const COA = [
  { account_code: "1500", name: "Office equipment", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "1510", name: "Accumulated depreciation", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "6200", name: "Depreciation expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "4900", name: "Gain on disposal", account_type: "income", account_class: null, special_acc_type: null, is_active: true },
];
const TIE = { client_id: "c1", as_of: "2026-08-27", tie: true, accounts: [], incomplete_count: 1, pending_draft_count: 0 };
const AUTHORITY = { client_id: "c1", authority: null, ramp_earned: false, fy_end: { month: 12, day: 31, fallback: true }, high_stakes_threshold_cents: 500000 };
const RUNS = { client_id: "c1", runs: [] };

const mockFetch = (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/rpc/list_fixed_assets")) return jsonResponse(ASSETS_ENVELOPE);
  if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(COA);
  if (url.includes("/rpc/fa_register_tie")) return jsonResponse(TIE);
  if (url.includes("/rpc/get_depreciation_authority")) return jsonResponse(AUTHORITY);
  if (url.includes("/rpc/list_depreciation_runs")) return jsonResponse(RUNS);
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Registers"),
      createElement(FixedAssetsRegister, { clientId: "c1" }),
    ),
  });
}

test("fixed-assets register (collapsed) has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Delivery van/, "the register must have loaded far enough to show a real row");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the Complete-particulars door dialog OPEN has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
      assert.ok(trigger, "the incomplete asset must offer a Complete-particulars trigger");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");
      assert.deepEqual(checkAccessibility(body as never), []);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
