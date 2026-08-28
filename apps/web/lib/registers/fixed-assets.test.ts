import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadFixedAssets,
  getFixedAsset,
  faRegisterTie,
  completeFixedAssetParticulars,
  reviseFixedAssetParticulars,
  disposeFixedAsset,
} from "./fixed-assets";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

/** Captures the posted body for a single-call wrapper. */
function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("loadFixedAssets: POSTs /rpc/list_fixed_assets with p_client, resolves the envelope verbatim", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  const envelope = { client_id: "c1", as_of: "2026-08-27", assets: [], incomplete_count: 0 };
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(envelope, 200);
    },
    async () => {
      const env = await loadFixedAssets(fakeSession("tok"), "c1");
      assert.deepEqual(env, envelope);
    },
  );
  assert.match(seenUrl, /\/rpc\/list_fixed_assets$/);
  assert.deepEqual(seenBody, { p_client: "c1" });
});

test("loadFixedAssets: a 403 (RLS/grant refusal) is not masked into an empty list", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "permission denied for function list_fixed_assets" }, 403),
    async () => {
      const { isDoorError } = await import("../doors");
      await assert.rejects(loadFixedAssets(fakeSession("tok"), "c1"), (e: unknown) => {
        assert.ok(isDoorError(e));
        return true;
      });
    },
  );
});

test("getFixedAsset: POSTs /rpc/get_fixed_asset with exactly p_asset", async () => {
  const { impl, calls } = captureFetch({ asset: { id: "a1" }, lineage: [], charges: [], schedule: [], uncharged_due: [] });
  await withMockedFetch(impl, async () => {
    await getFixedAsset(fakeSession("tok"), "a1");
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/get_fixed_asset$/);
  assert.deepEqual(calls[0]!.body, { p_asset: "a1" });
});

test("faRegisterTie: POSTs /rpc/fa_register_tie with p_client + p_as_of, resolves verbatim (tie is never re-derived here)", async () => {
  const tieOut = { client_id: "c1", as_of: "2026-08-27", tie: false, accounts: [{ asset_account: "1500" }], incomplete_count: 1, pending_draft_count: 0 };
  const { impl, calls } = captureFetch(tieOut);
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await faRegisterTie(fakeSession("tok"), "c1", "2026-08-27");
  });
  assert.deepEqual(calls[0]!.body, { p_client: "c1", p_as_of: "2026-08-27" });
  assert.deepEqual(resolved, tieOut);
});

test("completeFixedAssetParticulars: posts the exact door body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ asset_id: "a1", client_id: "c1", particulars_complete: true });
  await withMockedFetch(impl, async () => {
    await completeFixedAssetParticulars(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      particulars: { method: "straight_line", useful_life_months: 60, start_date: "2026-01-01" },
    });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/complete_fixed_asset_particulars$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
  assert.deepEqual(body.p_particulars, { method: "straight_line", useful_life_months: 60, start_date: "2026-01-01" });
  assert.equal(typeof body.p_op_key, "string");
  assert.ok((body.p_op_key as string).length > 0);
});

test("reviseFixedAssetParticulars: posts p_effective_from alongside the particulars", async () => {
  const { impl, calls } = captureFetch({ asset_id: "a1", successor_asset_id: "a2" });
  await withMockedFetch(impl, async () => {
    await reviseFixedAssetParticulars(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      particulars: { method: "none", start_date: "2026-01-01" },
      effectiveFrom: "2026-09-01",
    });
  });
  const body = calls[0]!.body;
  assert.match(calls[0]!.url, /\/rpc\/revise_fixed_asset_particulars$/);
  assert.equal(body.p_effective_from, "2026-09-01");
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
});

test("disposeFixedAsset: posts every door argument by exact p_ name, cost portion defaults to null", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", asset_id: "a1", nbv_cents: 0, gain_cents: 0, stub_cents: 0 });
  await withMockedFetch(impl, async () => {
    await disposeFixedAsset(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      disposalDate: "2026-08-27",
      proceedsCents: 50000,
      proceedsAccount: "1010",
      gainAccount: "4900",
      lossAccount: "5900",
      memo: "Scrapped",
    });
  });
  const body = calls[0]!.body;
  assert.match(calls[0]!.url, /\/rpc\/dispose_fixed_asset$/);
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
  assert.equal(body.p_disposal_date, "2026-08-27");
  assert.equal(body.p_proceeds_cents, 50000);
  assert.equal(body.p_proceeds_account, "1010");
  assert.equal(body.p_gain_account, "4900");
  assert.equal(body.p_loss_account, "5900");
  assert.equal(body.p_memo, "Scrapped");
  assert.equal(body.p_cost_portion_cents, null);
  assert.equal(typeof body.p_op_key, "string");
});
