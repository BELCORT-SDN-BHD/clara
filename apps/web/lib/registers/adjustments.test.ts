import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAdjustmentTemplates, loadAdjustmentRuns } from "./adjustments";
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

test("loadAdjustmentTemplates: reads adjustment_templates scoped by client_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadAdjustmentTemplates(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/adjustment_templates\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=start_date\.desc/);
});

test("loadAdjustmentRuns: reads adjustment_runs scoped by client_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadAdjustmentRuns(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/adjustment_runs\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=period_end\.desc/);
});
