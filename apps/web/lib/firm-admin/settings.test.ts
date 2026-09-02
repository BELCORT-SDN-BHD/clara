// lib/firm-admin/settings.ts — exact read/write wire pins. Money parsing is
// deliberately absent from this domain module: ThresholdChangeDialog uses the
// shared MoneyInput and lib/bank/money.ts is the one parser implementation.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SessionTokenAccessor } from "@/lib/session";
import { loadFirmSettings, setFirmHighStakesThreshold } from "./settings";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedFetch(
  impl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("loadFirmSettings reads only the DB-owned threshold row", async () => {
  const calls: string[] = [];
  await withMockedFetch(
    (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse([{ id: "f1", high_stakes_amount_cents: 123456 }]);
    }) as typeof fetch,
    async () => {
      assert.deepEqual(await loadFirmSettings(session), [
        { id: "f1", high_stakes_amount_cents: 123456 },
      ]);
    },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /\/rest\/v1\/firms\?/);
  assert.match(calls[0]!, /select=id%2Chigh_stakes_amount_cents/);
  assert.match(calls[0]!, /limit=1/);
});

test("setFirmHighStakesThreshold posts the exact accepted cents argument", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  await withMockedFetch(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return jsonResponse({ new_cents: 123456 });
    }) as typeof fetch,
    async () => {
      await setFirmHighStakesThreshold(session, 123456);
    },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/set_firm_high_stakes_threshold$/);
  assert.equal(calls[0]!.body.p_cents, 123456);
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
  assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["p_cents", "p_op_key"]);
});
