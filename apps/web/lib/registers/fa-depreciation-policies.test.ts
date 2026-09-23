import { test } from "node:test";
import assert from "node:assert/strict";
import { setFaDepreciationPolicy, retireFaDepreciationPolicy } from "./fa-depreciation-policies";
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

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("setFaDepreciationPolicy: posts the exact door body shape for a straight_line policy, reason omitted -> null", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", version: 1, active: true });
  await withMockedFetch(impl, async () => {
    await setFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", method: "straight_line",
      usefulLifeMonths: 36, rateBps: null, residualCents: 0,
    });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/set_fa_depreciation_policy$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset_account, "1500");
  assert.equal(body.p_method, "straight_line");
  assert.equal(body.p_useful_life_months, 36);
  assert.equal(body.p_rate_bps, null);
  assert.equal(body.p_residual_cents, 0);
  assert.equal(body.p_reason, null);
  assert.equal(typeof body.p_op_key, "string");
});

test("setFaDepreciationPolicy: a reducing_balance policy posts both the life and the rate, plus a supplied reason", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", version: 2 });
  await withMockedFetch(impl, async () => {
    await setFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", method: "reducing_balance",
      usefulLifeMonths: 60, rateBps: 2000, residualCents: 500, reason: "annual review",
    });
  });
  const body = calls[0]!.body;
  assert.equal(body.p_method, "reducing_balance");
  assert.equal(body.p_useful_life_months, 60);
  assert.equal(body.p_rate_bps, 2000);
  assert.equal(body.p_residual_cents, 500);
  assert.equal(body.p_reason, "annual review");
});

test("retireFaDepreciationPolicy: posts p_client + p_asset_account with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", active: false });
  await withMockedFetch(impl, async () => {
    await retireFaDepreciationPolicy(fakeSession("tok"), { clientId: "c1", assetAccount: "1500" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_fa_depreciation_policy$/);
  assert.deepEqual(
    { p_client: calls[0]!.body.p_client, p_asset_account: calls[0]!.body.p_asset_account, p_reason: calls[0]!.body.p_reason },
    { p_client: "c1", p_asset_account: "1500", p_reason: null },
  );
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("setFaDepreciationPolicy: a CLR37 not_enrolled refusal surfaces as a DoorRefusal, never masked", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR37", message: "account 9999 is not an enrolled fixed-asset account for this client", details: '{"reason":"fa_policy_invalid","axis":"not_enrolled"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        setFaDepreciationPolicy(fakeSession("tok"), {
          clientId: "c1", assetAccount: "9999", method: "straight_line", usefulLifeMonths: 36, rateBps: null, residualCents: 0,
        }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});
