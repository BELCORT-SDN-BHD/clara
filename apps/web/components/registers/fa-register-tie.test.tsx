// CB-AE2E-029 — `fa_register_tie` asserts a pass on an EMPTY universe, and the
// banner used to print that assertion as a sentence.
//
// LIVE BODY, chased: `clara.fa_register_tie` is created once, at
// 0041_wave_d_a_fa_register.sql:4257 (0043 §S5.19 re-cuts it by text splice, changing
// only the walk's gate, not the initialisation). It declares `v_tie boolean := true`
// (0041:4260) and only ever sets it false INSIDE the FOR loop, whose universe is
// `fa_account_profiles WHERE active UNION fixed_assets` for the client
// (0041:4276-4283). A client with no enrolled profile and no register row yields
// ZERO iterations — so the function returns `tie: true, accounts: []`, and the
// banner read "The register ties to the GL."
//
// The fix is three-valued off a fact the DB itself returned (`accounts.length`),
// never a client-side re-derivation of the tie: the type's own docstring forbids
// that, and `cost_reported_here` would make such a sum wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { FaRegisterTieBanner } from "./fa-register-tie-banner";
import type { FaRegisterTie, FaTieAccountRow } from "@/lib/registers/fixed-assets";

// The banner self-fetches through `useAsyncRead`, so a static render can only see
// its pre-data state. These cells drive the RENDERED table by mocking the door's
// transport, exactly as the other register cells do.
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { renderComponent } from "../../test/hookHarness";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withTie(tie: FaRegisterTie, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/rpc/fa_register_tie")) return jsonResponse(tie);
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FaRegisterTieBanner, { clientId: "c1" }),
  });
}

function row(overrides: Partial<FaTieAccountRow> = {}): FaTieAccountRow {
  return {
    asset_account: "1500",
    accum_account: "1590",
    register_cost_cents: 8000000,
    gl_cost_cents: 8000000,
    cost_diff_cents: 0,
    register_accum_cents: 1000000,
    gl_accum_cents: 1000000,
    accum_diff_cents: 0,
    gl_pre_enrolment_cost_cents: 0,
    gl_pre_enrolment_accum_cents: 0,
    gl_foreign_register_cost_cents: 0,
    gl_foreign_register_accum_cents: 0,
    pending_draft_rows: 0,
    cost_reported_here: true,
    before_baseline: false,
    ...overrides,
  } as FaTieAccountRow;
}

function tie(overrides: Partial<FaRegisterTie> = {}): FaRegisterTie {
  return { client_id: "c1", as_of: "2026-01-01", tie: true, accounts: [], incomplete_count: 0, pending_draft_count: 0, ...overrides };
}

async function rendered(t: FaRegisterTie): Promise<string> {
  let text = "";
  await withTie(t, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      text = h.text();
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
  return text;
}

test("CB-AE2E-029: tie:true on an EMPTY universe must NOT assert a pass — it says nothing was compared", async () => {
  const text = await rendered(tie({ tie: true, accounts: [] }));
  assert.match(text, /Not evaluated/, "the DB compared nothing, and the sentence must say so");
  assert.match(text, /nothing to compare/);
  assert.doesNotMatch(text, /The register ties to the GL/, "a positive assertion from an empty comparison is the defect");
  // The duplicate EmptyState that used to sit one line below the banner is gone.
  assert.doesNotMatch(text, /No fixed-asset accounts enrolled yet/);
});

test("CB-AE2E-029: tie:true WITH accounts still asserts the pass — the discriminating other half", async () => {
  const text = await rendered(tie({ tie: true, accounts: [row()] }));
  assert.match(text, /The register ties to the GL|ties to the GL/);
  assert.doesNotMatch(text, /Not evaluated/);
});

test("CB-AE2E-029: a BROKEN tie renders the four columns the DB already attributed the difference to", async () => {
  const text = await rendered(
    tie({
      tie: false,
      accounts: [row({ cost_diff_cents: 250000, gl_cost_cents: 8250000, gl_pre_enrolment_cost_cents: 250000, gl_foreign_register_accum_cents: 12500 })],
    }),
  );
  assert.match(text, /GL cost before enrolment/, "the explained columns must be on screen, not merely in the payload");
  assert.match(text, /GL accum\. before enrolment/);
  assert.match(text, /GL cost, other register/);
  assert.match(text, /GL accum\., other register/);
  // …carrying the DB's own figures, verbatim through fmtCents.
  assert.match(text, /RM 2,500\.00/, "the pre-enrolment cost the DB attributed");
  assert.match(text, /RM 125\.00/, "the foreign-register accumulation the DB attributed");
});
