// GATE (b) — structural a11y scan of the firm-wide Needs-you inbox (owner
// ruling Q7). See test/domInspect.ts's header for why this rides a
// hand-written rule engine (test/a11yRules.ts) rather than real axe-core.
//
// NeedsYouInbox self-fetches list_review_queue (lib/firm/needs-you.ts) — one
// mocked RPC, matching that module's own `listReviewQueue` call shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouInbox } from "./needs-you-inbox";
import messages from "../../messages/en.json";
import type { ReviewQueueEnvelope } from "../../lib/firm/needs-you";

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

const ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "open_question", section: "needs_you", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: "q1", task_id: null, document_id: null, lane: "needs_you", auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: "Which account should this fee post to?", created_at: "2026-04-01T00:00:00Z", id: "q1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
    },
  ],
  next_cursor: null,
};

test("firm needs-you inbox has zero violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(NeedsYouInbox) }),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /Which account should this fee post to/, "the queue row must have actually loaded");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
