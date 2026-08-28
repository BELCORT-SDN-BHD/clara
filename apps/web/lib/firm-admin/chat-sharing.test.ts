// lib/firm-admin/chat-sharing.ts — wire-shape pinning (T10 rung-6 battery).
// Proves `loadChatSession` reads `chat_sessions` scoped by id, that
// `shareChatSession` posts to `share_chat_session` with exactly `p_session` +
// a fresh op_key, and that a refusal survives verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadChatSession, shareChatSession } from "./chat-sharing";
import { isDoorRefusal } from "@/lib/doors";
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

test("loadChatSession reads chat_sessions filtered by id, and returns null when RLS admits no row", async () => {
  const { impl, seen } = captureFetch([]);
  await withMockedFetch(impl, async () => {
    const out = await loadChatSession(fakeSession(), "s1");
    assert.equal(out, null);
  });
  const s = seen.first();
  assert.match(s.url, /\/rest\/v1\/chat_sessions\?/);
  assert.match(s.url, /id=eq\.s1/);
});

test("loadChatSession returns the row verbatim when RLS admits one", async () => {
  const row = { id: "s1", firm_id: "f1", client_id: null, created_by: "u1", visibility: "private", title: "August close questions", created_at: "2026-08-01T00:00:00Z" };
  const { impl } = captureFetch([row]);
  await withMockedFetch(impl, async () => {
    const out = await loadChatSession(fakeSession(), "s1");
    assert.deepEqual(out, row);
  });
});

test("shareChatSession posts to share_chat_session with p_session + a fresh op_key", async () => {
  const { impl, seen } = captureFetch({ session_id: "s1", visibility: "firm" });
  await withMockedFetch(impl, async () => {
    const out = await shareChatSession(fakeSession(), "s1");
    assert.deepEqual(out, { session_id: "s1", visibility: "firm" });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/share_chat_session$/);
  assert.equal(s.body.p_session, "s1");
  assert.equal(typeof s.body.p_op_key, "string");
  assert.ok((s.body.p_op_key as string).length > 0);
});

test("a governed refusal (CLR04, only the author may share) survives verbatim through shareChatSession", async () => {
  const { impl } = captureFetch({ code: "CLR04", message: "only the author may share a session" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => shareChatSession(fakeSession(), "s1"),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR04");
        assert.match((e as { message: string }).message, /only the author/);
        return true;
      },
    );
  });
});
