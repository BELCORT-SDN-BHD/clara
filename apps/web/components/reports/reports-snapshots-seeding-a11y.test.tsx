// GATE (b) — structural a11y scan of the T9 (port-wave) reports panels:
// snapshot registry, render-job queue, seeding batches, wiki curation. Same
// mechanism as components/close/close-a11y.test.tsx (a hand-written rule
// engine, test/a11yRules.ts, rather than real axe-core) and the same mocked-
// fetch idiom as that file — every panel here self-fetches via useHydratedPart,
// unlike the documents workbench's fixed-prop components.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { RenderJobQueuePanel } from "./RenderJobQueuePanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";
import { WikiCurationPanel } from "./WikiCurationPanel";

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

function App(child: ReturnType<typeof createElement>, heading: string) {
  // Wrapped in the same ambient <h1> the real Reports page renders (P3
  // precedent — close-a11y.test.tsx's own note) so each panel's <h2> reads as
  // a valid section heading, not a page-less orphan.
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), child),
  });
}

test("SnapshotRegistryPanel: zero violations, collapsed and with the Mint-snapshot dialog OPEN", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/period_snapshots")) {
      return jsonResponse([{ id: "s1", client_id: "c1", reporting_period_id: "p1", period_start: "2026-06-01", period_end: "2026-06-30", kind: "management_accounts", minted_by: "u1", minted_at: "2026-07-01T00:00:00Z", books_watermark: "1:2:3", dataset_sha256: "a".repeat(64) }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SnapshotRegistryPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /2026-06-01/, "the panel must show the loaded snapshot");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(trigger, "the Mint-snapshot trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Mint a month snapshot/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("RenderJobQueuePanel: zero violations, collapsed and with the Requeue dialog OPEN on a failed job", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/render_jobs")) {
      return jsonResponse([{ id: "rj1", client_id: "c1", report_run_id: "run1", kind: "pre_sign", state: "failed", manifest_sha256: "b".repeat(64), requested_by: "u1", attempts: 3, max_attempts: 5, last_error: { code: "render_timeout" }, supersedes_render_job_id: null, requeue_reason: null, enqueued_at: "2026-07-01T00:00:00Z", finished_at: "2026-07-01T00:05:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(RenderJobQueuePanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /pre_sign/, "the panel must show the loaded render job");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must render for a failed job");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Requeue this render job/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("SeedingBatchesPanel: zero violations, collapsed and with the Tick dialog OPEN on an open proposal", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/seeding_batches")) {
      return jsonResponse([{ id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "c".repeat(64), state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z", completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null }]);
    }
    if (url.includes("/seeding_proposals")) {
      return jsonResponse([{ id: "p1", batch_id: "b1", client_id: "c1", proposal_kind: "vendor_account_rule", proposal_key: "k1", payload: { account_code: "5100" }, evidence: {}, state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null, resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-01T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /vendor_account_rule/, "the panel must show the loaded proposal");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Tick");
      assert.ok(trigger, "the Tick trigger must render for an open proposal");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Tick this proposal/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("WikiCurationPanel: zero violations, collapsed and with the Retire dialog OPEN", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/wiki_pages")) {
      return jsonResponse([{ id: "w1", client_id: "c1", slug: "treatment/gst-input-tax", page_kind: "treatment", title: "GST input tax treatment", counterparty_id: null, current_version_id: "v1", state: "active", retired_at: null, retired_by: null, retire_reason: null, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-15T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(WikiCurationPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /GST input tax treatment/, "the panel must show the loaded wiki page");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(trigger, "the Retire trigger must render for an active page");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Retire this wiki page/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
