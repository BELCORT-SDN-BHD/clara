import { test } from "node:test";
import assert from "node:assert/strict";
import { loadClientFactKeys, loadClientFacts } from "./knowledge";
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

test("loadClientFactKeys: reads the global client_fact_keys catalog", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadClientFactKeys(fakeSession("tok"));
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/client_fact_keys\?/);
  assert.match(seenUrl, /order=fact_key\.asc/);
});

test("loadClientFacts: reads client_facts scoped by client_id, newest recorded first", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadClientFacts(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/client_facts\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=recorded_at\.desc/);
});
