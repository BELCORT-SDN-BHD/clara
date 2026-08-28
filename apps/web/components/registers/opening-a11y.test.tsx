// GATE (b) — structural a11y scan of T2's opening-seed workbench (owner
// ruling Q7). OpeningRegister composes the seed header + dry-run strip +
// keyed/target panel + items panel, each self-fetching — mocked the same way
// components/registers/fixed-assets-a11y.test.tsx's own precedent does.
// Wrapped in a synthetic <h1>, the same idiom every registers a11y file uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { OpeningRegister } from "./opening-register";
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

const SEED = {
  id: "s1", firm_id: "f1", client_id: "c1", plan_id: "plan1", as_of: "2026-01-15", state: "open",
  tie_document_id: null, tie_document_sha256: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  batch_n: 0, finalized_at: null, finalized_by: null, tie_asserted_at: null, through_event_seq: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
};
const ITEM = {
  id: "i1", firm_id: "f1", client_id: "c1", seed_id: "s1", item_kind: "gl_balance", item_key: "cash-mbb",
  entry_id: "e1", counterparty_id: null, fixed_asset_id: null, item_ref: null, item_date: null,
  amount_cents: 500123, sst_portion_cents: null, sst_rate_bp: null, sst_basis: null, state: "active",
  superseded_by_item: null, supersedes_item_id: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
};
const ACCOUNTS = [{ account_code: "1000", name: "Cash at bank", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }];
const DRYRUN = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 4269, deltas: [{ account_code: "1000", target_debit: 500123, target_credit: 0, actual_debit: 499871, actual_credit: 0, delta_debit: -252, delta_credit: 0 }], unmapped_labels: [], missing_must_asks: [] };

const mockFetch = (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN);
  if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED]);
  if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
  if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(ACCOUNTS);
  if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
  if (url.includes("/rest/v1/opening_items")) return jsonResponse([ITEM]);
  if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
  if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([]);
  if (url.includes("/rest/v1/journal_entries")) return jsonResponse([{ id: "e1", revision_token: "rev-e1", status: "draft", is_opening_balance: true, reversal_of: null }]);
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

test("opening register (collapsed) has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /cash-mbb/, "the register must have loaded far enough to show a real item row");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the Draft-opening-item door dialog OPEN has zero a11y violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Draft opening item"));
      assert.ok(trigger, "the drafted-items panel must offer a Draft trigger on an OPEN seed");
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
