import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStaffAdvances } from "./staff-advances";
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

test("loadStaffAdvances: reads staff_advances scoped by client_id, newest issue first", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadStaffAdvances(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/staff_advances\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=issue_date\.desc/);
  assert.match(seenUrl, /select=id%2Cclient_id%2Cenrolment_id/);
});
