import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixedAssets } from "./fixed-assets";
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
