// GATE (b) — structural a11y scan of bank matching/reconciliation (owner
// ruling Q7). See test/domInspect.ts's header for why this rides a
// hand-written rule engine (test/a11yRules.ts) rather than real axe-core.
//
// MatchingSection/ReconciliationSection self-fetch — the fetch-mocking
// pattern here is copied from the existing matching-section.test.tsx /
// reconciliation-section.test.tsx interaction tests (same fixtures, minimal
// realistic data so both sections render their real, non-empty markup).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { MatchingSection } from "./matching-section";
import { ReconciliationSection } from "./reconciliation-section";
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

const LINE = { line_id: "l1", statement_id: "s1", bank_account_id: "acc1", entry_date: "2026-04-05", description: "fee", amount_cents: -1500 };
const CANDIDATE = { entry_id: "e1", posting_date: "2026-04-05", memo: "misc payable", counterparty_name: "Acme", high_stakes: false };

test("bank matching section has zero violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_unmatched_lines")) return jsonResponse([LINE]);
      if (url.includes("/rpc/list_bank_match_candidates")) return jsonResponse([CANDIDATE]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(MatchingSection, { clientId: "c1" }) }),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

const ACCOUNT = { id: "acc1", bank_code: "MBB", bank_name_display: "Maybank current", account_number: "1-2-3" };
const STATEMENT_1 = { id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: -50000, status: "live" };
const RECON_S1 = {
  statement_id: "s1", status: "complete", preview: false,
  terms: { opening_anchor_cents: 0, gl_prime_cents: -50000, uncleared_total_cents: 0, computed_closing_cents: -50000, statement_closing_cents: -50000, difference_cents: 0 },
  stale_outstanding_ids: [], can_complete: null, recon_id: "r1",
};

test("bank reconciliation section has zero violations", async () => {
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([STATEMENT_1]);
      if (url.includes("/rpc/get_bank_reconciliation")) return jsonResponse(RECON_S1);
      throw new Error(`unexpected fetch: ${url} ${JSON.stringify(init?.body)}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(ReconciliationSection, { clientId: "c1" }) }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
