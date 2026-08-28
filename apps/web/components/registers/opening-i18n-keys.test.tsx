// F4 (fix round, rev-t2): a generic missing-i18n-key guard across every T2
// dialog. `OpeningCarryDown.keyed.accountCol` was referenced at TWO call
// sites (the target table header, the Add-target-line dialog's account
// label) but never defined in en.json — next-intl's default (no custom
// `getMessageFallback` is configured anywhere in this app) renders the RAW
// DOTTED KEY PATH as the label text rather than throwing, so the bug shipped
// silently in every existing render/a11y test (none of them assert on that
// specific label's text). This file opens every T2 dialog in turn and
// asserts NO rendered text anywhere matches a raw `OpeningCarryDown.` key
// path — a single, cheap, standing guard against the whole class, not just
// this one instance.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

enableDomInspection();

const RAW_KEY_PATH = /OpeningCarryDown\.[a-zA-Z.]+/;

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

const SEED_OPEN_UNTIED = {
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
const DRYRUN = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 4269, deltas: [{ account_code: "1000", target_debit: 500123, target_credit: 0, actual_debit: 499871, actual_credit: 0, delta_debit: -252, delta_credit: 0 }], unmapped_labels: [{ line_key: "L9", source_label: "Misc suspense" }], missing_must_asks: [{ item_key: "K1", question: "Confirm the director's loan balance" }] };
const ACCOUNTS = [{ account_code: "1000", name: "Cash at bank", account_type: "asset", account_class: null, special_acc_type: null, is_active: true }];

const mockFetch = (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/rest/v1/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN);
  if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([SEED_OPEN_UNTIED]);
  if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([]);
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

const DIALOG_TRIGGERS = [
  "Draft opening item",
  "Add target line",
  "Mint keyed resolution",
  "Seed a fixed asset",
  "Approve seed",
  "Cancel seed",
];

test("F4: no T2 dialog renders a raw i18n key path anywhere — every trigger opened in turn", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.doesNotMatch(h.text(), RAW_KEY_PATH, "the COLLAPSED register must not show a raw key path");

      for (const label of DIALOG_TRIGGERS) {
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label));
        assert.ok(trigger, `trigger not found: ${label}`);
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.doesNotMatch(textOf(body as never), RAW_KEY_PATH, `a raw i18n key path leaked while "${label}" was open`);
      }
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
