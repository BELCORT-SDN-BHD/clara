import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertFaAccountProfile, retireFaAccountProfile } from "./fa-account-profiles";
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

test("upsertFaAccountProfile: posts the exact door body shape, accum/expense pass through null for a non-depreciable profile", async () => {
  const { impl, calls } = captureFetch({ profile_id: "p1", client_id: "c1", asset_account_code: "1500", depreciable: false, active: true });
  await withMockedFetch(impl, async () => {
    await upsertFaAccountProfile(fakeSession("tok"), { clientId: "c1", assetAccount: "1500", accumAccount: null, expenseAccount: null });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/upsert_fa_account_profile$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset_account, "1500");
  assert.equal(body.p_accum_account, null);
  assert.equal(body.p_depr_expense_account, null);
  assert.equal(typeof body.p_op_key, "string");
});

test("upsertFaAccountProfile: a depreciable pair posts both accounts", async () => {
  const { impl, calls } = captureFetch({ profile_id: "p1" });
  await withMockedFetch(impl, async () => {
    await upsertFaAccountProfile(fakeSession("tok"), { clientId: "c1", assetAccount: "1500", accumAccount: "1510", expenseAccount: "6200" });
  });
  const body = calls[0]!.body;
  assert.equal(body.p_accum_account, "1510");
  assert.equal(body.p_depr_expense_account, "6200");
});

test("retireFaAccountProfile: posts p_client + p_asset_account with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ profile_id: "p1", active: false });
  await withMockedFetch(impl, async () => {
    await retireFaAccountProfile(fakeSession("tok"), { clientId: "c1", assetAccount: "1500" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_fa_account_profile$/);
  assert.deepEqual(
    { p_client: calls[0]!.body.p_client, p_asset_account: calls[0]!.body.p_asset_account },
    { p_client: "c1", p_asset_account: "1500" },
  );
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("retireFaAccountProfile: a CLR37 not_enrolled refusal surfaces as a DoorRefusal, never masked", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR37", message: "no active fixed-asset profile is enrolled on 9999 for this client", details: '{"reason":"fa_profile_invalid","axis":"not_enrolled"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(retireFaAccountProfile(fakeSession("tok"), { clientId: "c1", assetAccount: "9999" }), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        return true;
      });
    },
  );
});
