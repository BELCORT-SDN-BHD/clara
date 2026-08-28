// F8, independent review (the mutant panel): LintFindingDetail, same
// reasoning as components/firm/open-question-detail.test.tsx's own header.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { LintFindingDetail } from "./lint-finding-detail";
import messages from "../../messages/en.json";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

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

test("LintFindingDetail: no fetch until 'View details' is clicked, then the REAL dedupe_key and event history render", async () => {
  let calls = 0;
  await withMockedEnv(
    async (u) => {
      calls += 1;
      assert.match(String(u), /\/rpc\/get_lint_finding$/);
      return jsonResponse({
        finding: {
          id: "lf1", firm_id: "f1", client_id: "c1", finding_kind: "stale_claim", dedupe_key: "unique-dedupe-key-xyz",
          severity: "warn", page_id: null, detail: {}, state: "open", opened_at: "2026-04-01T00:00:00Z",
          resolved_conclusion: null, resolved_note: null, resolved_by: null, resolved_at: null, created_at: "2026-04-01T00:00:00Z",
        },
        events: [{ id: "e1", finding_id: "lf1", event_kind: "created", state_before: null, state_after: "open", figures: {}, actor: null, rationale: "first detected on sweep", created_at: "2026-04-01T00:00:00Z" }],
      });
    },
    async () => {
      const h = await renderComponent(App(createElement(LintFindingDetail, { findingId: "lf1" })));
      try {
        await h.settle();
        assert.equal(calls, 0, "get_lint_finding must not fire until the human asks for it");
        const trigger = h.find((n) => n.tagName === "BUTTON" && h.text().includes("View details"));
        assert.ok(trigger, "the reveal trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(calls, 1, "clicking must fire exactly one get_lint_finding call");
        assert.match(h.text(), /unique-dedupe-key-xyz/, "the finding's real dedupe_key must render");
        assert.match(h.text(), /first detected on sweep/, "the real event history's rationale must render — proving events, not just the finding, were fetched and shown");
      } finally {
        await h.unmount();
      }
    },
  );
});
