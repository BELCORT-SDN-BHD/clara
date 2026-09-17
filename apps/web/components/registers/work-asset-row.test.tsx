// #639 — the ONE identity-block row that names the asset a Work registered.
//
// `components/work/work-detail.tsx` contained ZERO occurrences of the word `asset` before this
// ticket, so a Work that had just bought a machine said nothing about it. The row is derived (the
// register row whose `acquisition_entry_id` IS the Work's posted entry), and derivation makes the
// silent cases the ones worth pinning: no entry, no match, and a failed read must each render
// NOTHING rather than a dash, a spinner, or a banner on the surface a professional reads most.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { WorkAssetRow } from "./work-asset-row";
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

const ROW = {
  id: "a1", description: "Air compressor", status: "active", particulars_complete: false,
  acquired_date: "2026-08-15", effective_from: null, cost_cents: 850000, residual_cents: null,
  accumulated_cents: 0, nbv_cents: 850000, method: null, rate_bps: null, useful_life_months: null,
  start_date: null, asset_account: "1510", accum_account: "1519", expense_account: "6510",
  ca_class: null, is_commercial_vehicle: null, is_new: null, superseded_by_asset_id: null,
  disposed_at: null, disposal_entry_id: null, uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
  acquisition_entry_id: "e-1111", acquisition_line_id: "l-1111", acquisition_document_id: null,
};

const registerMock = (assets: unknown[], { status = 200 } = {}): typeof fetch =>
  (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/list_fixed_assets")) {
      return jsonResponse({ client_id: "c1", as_of: "2026-09-16", assets, incomplete_count: 1 }, status);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

function App({ entryId }: { entryId: string | null }) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("dl", null, createElement(WorkAssetRow, { clientId: "c1", entryId })),
  });
}

test("workAsset.match names the asset this Work registered and says the particulars are waiting", async () => {
  await withMockedEnv(registerMock([ROW]), async () => {
    const h = await renderComponent(App({ entryId: "e-1111" }));
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Fixed asset registered/, "the row is labelled");
      assert.match(text, /Air compressor/, "…and names the asset");
      assert.match(text, /waiting on depreciation particulars/,
        "…in WORDS, so the state is not carried by colour alone");
    } finally {
      await h.unmount();
    }
  });
});

test("workAsset.complete an answered asset drops the waiting sentence and keeps the link", async () => {
  await withMockedEnv(registerMock([{ ...ROW, particulars_complete: true }]), async () => {
    const h = await renderComponent(App({ entryId: "e-1111" }));
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Air compressor/);
      assert.ok(!h.text().includes("waiting on depreciation particulars"),
        "a completed asset has nothing outstanding to announce");
    } finally {
      await h.unmount();
    }
  });
});

test("workAsset.silent no entry, no match and a FAILED read each render nothing at all", async () => {
  // (a) the Work has posted nothing yet — the register is never even read.
  await withMockedEnv(
    (async () => {
      throw new Error("the register must not be read for a Work that has posted nothing");
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App({ entryId: null }));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.equal(h.text().trim(), "", "no row for a Work with no posted entry");
      } finally {
        await h.unmount();
      }
    },
  );

  // (b) the register holds no row for this entry — which is MOST Works. A dash on every one of
  // them would be noise on the surface a professional reads most often.
  await withMockedEnv(registerMock([{ ...ROW, acquisition_entry_id: "e-other" }]), async () => {
    const h = await renderComponent(App({ entryId: "e-1111" }));
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.equal(h.text().trim(), "", "no row when nothing in the register names this entry");
    } finally {
      await h.unmount();
    }
  });

  // (c) the read FAILED. The Work's own identity is unaffected by a register read, so this row is
  // silent rather than raising a banner over facts that are already correct.
  await withMockedEnv(registerMock([], { status: 403 }), async () => {
    const h = await renderComponent(App({ entryId: "e-1111" }));
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.equal(h.text().trim(), "", "a failed register read is silent on the Work's identity block");
    } finally {
      await h.unmount();
    }
  });
});
