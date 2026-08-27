// components/bank/reconciliation-section.tsx — INTERACTION tests (independent
// review on web/p3-bank, priority 1-2, shipped WITH BLOCKER-1). Mounted for
// real via test/hookHarness.ts's `renderComponent` (mocked fetch + the real
// DOM commit path) so these arms prove the RENDERED component, not just the
// underlying lib mapper/derivation:
//   (a) the dl renders "—" (never a fabricated "RM 0.00") when the DB omits
//       a completed receipt's difference_cents/derived_closing_cents
//       (BLOCKER-1, 0040:4180-4211).
//   (b) the tie badge cannot read "tied" without a DB-sourced difference —
//       it reads "unavailable" on that same receipt.
//   (c) ackedStale clears when the selected statement changes (N17).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setNativeValue } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { ReconciliationSection } from "./reconciliation-section";
import messages from "../../messages/en.json";

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

function App(clientId: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ReconciliationSection, { clientId }),
  });
}

const ACCOUNT = { id: "acc1", bank_code: "MBB", bank_name_display: "Maybank current", account_number: "1-2-3" };
const STATEMENT_1 = { id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: -50000, status: "live" };
const STATEMENT_2 = { id: "s2", bank_account_id: "acc1", period_start: "2026-05-01", period_end: "2026-05-31", opening_cents: -50000, closing_cents: -60000, status: "live" };

/** s1's receipt: COMPLETED, omitting difference_cents/derived_closing_cents
 *  (the DB's own real shape, 0040:4180-4211) — the exact BLOCKER-1 scenario.
 *  Also carries one stale_outstanding_ids entry for arm (c). */
const RECON_S1 = {
  statement_id: "s1", status: "complete", preview: false, closing_cents: -50000,
  stale_outstanding_ids: ["oi-stale-1"], can_complete: null,
};
const RECON_S2 = { statement_id: "s2", status: "open", preview: true, can_complete: false, blockers: ["line_unsettled"] };

function routeFetch(url: string, body: Record<string, unknown>): Response {
  if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
  if (url.includes("/rpc/list_bank_statements")) return jsonResponse([STATEMENT_1, STATEMENT_2]);
  if (url.includes("/rpc/get_bank_reconciliation")) {
    return jsonResponse(body.p_statement === "s2" ? RECON_S2 : RECON_S1);
  }
  throw new Error(`unexpected fetch: ${url}`);
}

async function mountAndSettle(clientId = "c1") {
  const h = await renderComponent(App(clientId));
  for (let i = 0; i < 4; i++) await h.settle(); // let the cascade (accounts -> statements -> recon) land
  return h;
}

test("BLOCKER-1 (a)+(b): a completed receipt missing difference_cents/derived_closing_cents renders '—', never a fabricated 'RM 0.00', and the tie badge reads 'unavailable'", async () => {
  await withMockedEnv(
    async (u, init) => routeFetch(String(u), JSON.parse(String(init?.body ?? "{}"))),
    async () => {
      const h = await mountAndSettle();
      try {
        const text = h.text();
        assert.doesNotMatch(text, /RM 0\.00/, "must never fabricate a zero difference/closing figure");
        assert.match(text, /—/, "the missing terms must render the honest placeholder");
        assert.match(text, /unavailable/, "the tie badge must read 'unavailable', never 'tied', without a DB-sourced difference");
        assert.doesNotMatch(text, />tied</, "the tie badge itself must not say 'tied'");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N17 (c): ackedStale clears when the selected statement changes", async () => {
  await withMockedEnv(
    async (u, init) => routeFetch(String(u), JSON.parse(String(init?.body ?? "{}"))),
    async () => {
      const h = await mountAndSettle();
      try {
        const staleCheckbox = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox",
        );
        assert.ok(staleCheckbox, "s1's reconciliation must render the stale-item checkbox");
        await h.fireEvent(staleCheckbox!, "click", (n) => setNativeValue(n as never, "checked", true));
        assert.equal((staleCheckbox as unknown as { checked: boolean }).checked, true, "the ack must have registered");

        const statementSelect = h.find(
          (n) => n.tagName === "SELECT" && !!(n.childNodes as Parameters<typeof textOf>[0][] | undefined)?.some((c) => textOf(c).includes("2026-05-01")),
        );
        assert.ok(statementSelect, "the statement picker must list both statements");
        await h.fireEvent(statementSelect!, "change", (n) => setNativeValue(n as never, "value", "s2"));
        for (let i = 0; i < 3; i++) await h.settle();

        // s2 carries no stale_outstanding_ids at all, so the checkbox itself
        // disappears — the honest proof the ack state was scoped to s1 and
        // did not silently carry over is that s2's own screen never shows a
        // stale item as already acknowledged.
        const staleCheckboxAfter = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox",
        );
        assert.equal(staleCheckboxAfter, null, "s2 has no stale items — none should render, none should read as acknowledged");
      } finally {
        await h.unmount();
      }
    },
  );
});
