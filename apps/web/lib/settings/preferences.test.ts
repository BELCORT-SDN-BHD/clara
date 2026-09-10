// lib/settings/preferences.ts — wire-shape pinning for #626's two doors
// (clara.get_my_preferences() / clara.save_my_preferences()), following the
// same house convention as lib/firm-admin/vendor-bindings.test.ts: a captured
// fetch proves the exact RPC name and body, and a refusal survives verbatim
// through `isDoorRefusal`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { getMyPreferences, isDoorRefusal, saveMyPreferences } from "./preferences";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

type Seen = { url: string; body: Record<string, unknown> };

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return {
    impl,
    seen: {
      first(): Seen {
        assert.equal(calls.length, 1, `expected exactly one fetch call, got ${calls.length}`);
        return calls[0] as Seen;
      },
    },
  };
}

test("getMyPreferences posts to get_my_preferences with an empty body", async () => {
  const raw = { version: 3, interface: { motion: "reduced" }, notifications: {}, updated_at: "2026-09-10T00:00:00Z" };
  const { impl, seen } = captureFetch(raw);
  await withMockedFetch(impl, async () => {
    const out = await getMyPreferences({ session: fakeSession() });
    assert.deepEqual(out, {
      version: 3,
      interface: { motion: "reduced" },
      notifications: {},
      updatedAt: "2026-09-10T00:00:00Z",
    });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/get_my_preferences$/);
  assert.deepEqual(s.body, {});
});

test("getMyPreferences drops an unrecognised interface key rather than passing it through untyped", async () => {
  const raw = { version: 0, interface: { motion: "system", futureKeyNoUiKnowsYet: true }, notifications: {}, updated_at: null };
  const { impl } = captureFetch(raw);
  await withMockedFetch(impl, async () => {
    const out = await getMyPreferences({ session: fakeSession() });
    assert.deepEqual(out.interface, { motion: "system" });
  });
});

test("saveMyPreferences posts the exact named args, PATCH shape only (no notifications when omitted)", async () => {
  const raw = { version: 4, interface: { motion: "reduced", sidebarDefault: "collapsed" }, notifications: {}, updated_at: "2026-09-10T00:00:00Z" };
  const { impl, seen } = captureFetch(raw);
  await withMockedFetch(impl, async () => {
    const out = await saveMyPreferences(3, { interface: { motion: "reduced" } }, "op-key-1", { session: fakeSession() });
    assert.equal(out.version, 4);
    assert.deepEqual(out.interface, { motion: "reduced", sidebarDefault: "collapsed" });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/save_my_preferences$/);
  assert.deepEqual(s.body, {
    p_expected_version: 3,
    p_patch: { interface: { motion: "reduced" } },
    p_op_key: "op-key-1",
  });
});

test("a CLR06 stale-version refusal survives verbatim through isDoorRefusal", async () => {
  const { impl } = captureFetch(
    { code: "CLR06", message: "preferences changed elsewhere", details: JSON.stringify({ reason: "stale_version" }) },
    400,
  );
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => saveMyPreferences(0, { interface: { motion: "reduced" } }, "op-key-2", { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR06");
        assert.equal((e as { reason: string | null }).reason, "stale_version");
        return true;
      },
    );
  });
});

test("a CLR10 invalid-value refusal names the field path in .reason", async () => {
  const { impl } = captureFetch(
    { code: "CLR10", message: "unsupported value for interface.motion", details: JSON.stringify({ reason: "interface.motion" }) },
    400,
  );
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => saveMyPreferences(0, { interface: { motion: "reduced" } }, "op-key-3", { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR10");
        assert.equal((e as { reason: string | null }).reason, "interface.motion");
        return true;
      },
    );
  });
});
