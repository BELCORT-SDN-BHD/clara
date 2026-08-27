import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAging } from "./aging";
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

test("loadAging('ar', ...): POSTs /rpc/ar_aging with p_client/p_as_of/p_segment=null", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ as_of: "2026-08-27", domain: "ar", counterparties: [], totals: {} }, 200);
    },
    async () => {
      const env = await loadAging(fakeSession("tok"), "ar", "c1", "2026-08-27");
      assert.equal(env.domain, "ar");
    },
  );
  assert.match(seenUrl, /\/rpc\/ar_aging$/);
  assert.deepEqual(seenBody, { p_client: "c1", p_as_of: "2026-08-27", p_segment: null });
});

test("loadAging('ap', ...): POSTs /rpc/ap_aging, and defaults p_as_of to the business-timezone today", async () => {
  let seenUrl = "";
  let seenBody: { p_as_of?: string } = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ as_of: "2026-08-27", domain: "ap", counterparties: [], totals: {} }, 200);
    },
    async () => {
      await loadAging(fakeSession("tok"), "ap", "c1");
    },
  );
  assert.match(seenUrl, /\/rpc\/ap_aging$/);
  assert.match(seenBody.p_as_of ?? "", /^\d{4}-\d{2}-\d{2}$/);
});
