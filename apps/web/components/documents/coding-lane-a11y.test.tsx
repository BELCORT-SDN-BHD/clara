// GATE (b) — structural a11y scan of the coding-lane surface (T7, port-wave
// plan §7.2 "every train with a new panel owes a *-a11y.test.tsx"). Three
// independently-hydrated cells, one mocked RPC/read each. Wrapped in a
// synthetic <h1> — documents-a11y.test.tsx's own idiom: on the real page
// this panel renders under DocumentsWorkbench's own PageHeader <h1>.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { CodingLanePanel } from "./coding-lane-panel";
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

const UNCODED_FILING = {
  filing_id: "f1", document_id: "d1", client_id: "c1", filed_at: "2026-04-01T00:00:00Z",
  basis: "human", document_kind: "invoice", financial_date: "2026-04-01",
  original_filename: "invoice-april.pdf", mime_type: "application/pdf", extraction_status: "done",
};
const LANE_ROW = { filing_id: "f1", lane: "needs_you", reasons: ["vendor_ambiguous", "high_stakes"] };
const CODING_TASK = {
  id: "t1", client_id: "c1", document_id: "d2", filing_id: "f2", origin: "manual",
  correction_id: null, status: "open", opened_by: "u1", closed_by: null, closed_reason: null,
  result_entry_id: null, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z", closed_at: null,
};
const LINT_FINDING = {
  id: "lf1", firm_id: "f1", client_id: "c1", finding_kind: "stale_claim", dedupe_key: "k1",
  severity: "warn", page_id: null, detail: {}, state: "open", opened_at: "2026-04-03T00:00:00Z",
  resolved_conclusion: null, resolved_note: null, resolved_by: null, resolved_at: null, created_at: "2026-04-03T00:00:00Z",
};

function mockCodingFetch(u: string): Response {
  if (u.includes("/rpc/list_uncoded_filings")) return jsonResponse([UNCODED_FILING]);
  if (u.includes("/rpc/list_coding_lanes")) return jsonResponse([LANE_ROW]);
  if (u.includes("/rest/v1/coding_tasks_visible")) return jsonResponse([CODING_TASK]);
  if (u.includes("/rest/v1/journal_entries")) return jsonResponse([]);
  if (u.includes("/rest/v1/lint_findings")) return jsonResponse([LINT_FINDING]);
  throw new Error(`unexpected fetch: ${u}`);
}

test("coding-lane panel (uncoded filings + coding tasks + lint findings, all populated) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockCodingFetch(String(u)),
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /invoice-april\.pdf/, "the uncoded filing must have actually loaded");
        assert.match(text, /vendor match is ambiguous/i, "the reason badge must render its real label, not the raw code");
        assert.match(text, /Stale claim/, "the lint finding's kind label must render");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("coding-lane panel: all three sections render their empty state honestly (no fabricated rows)", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) return jsonResponse([]);
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Nothing in this lane right now/);
        assert.match(h.text(), /No open coding tasks for this client/);
        assert.match(h.text(), /No open lint findings for this client/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
