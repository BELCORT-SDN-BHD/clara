import { test } from "node:test";
import assert from "node:assert/strict";
import { loadChartOfAccounts } from "./accounts";
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

test("loadChartOfAccounts: reads coa_accounts scoped by client_id, ordered by account_code", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadChartOfAccounts(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/coa_accounts\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /select=account_code%2Cname%2Caccount_type/);
  assert.match(seenUrl, /order=account_code\.asc/);
});

test("loadChartOfAccounts: a no_session state throws without ever calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      throw new Error("must not be called");
    },
    async () => {
      const { isReadError } = await import("../read");
      await assert.rejects(loadChartOfAccounts(fakeSession(null), "c1"), (e: unknown) => {
        assert.ok(isReadError(e));
        return true;
      });
    },
  );
  assert.equal(called, false);
});
