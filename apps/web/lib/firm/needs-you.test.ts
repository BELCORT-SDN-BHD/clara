// lib/firm/needs-you.ts — clara.list_review_queue (a read RPC over callDoor) and its
// two governed act doors, resolve_open_question/dismiss_open_question. Mocked-fetch
// style ported from ../doors.test.ts's own precedent: the property under test is that
// each wrapper posts the right RPC name/args, not a re-derivation of callDoor's own
// already-tested CLR/refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listReviewQueue, resolveOpenQuestion, dismissOpenQuestion } from "./needs-you";
import { isDoorRefusal } from "../doors";
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

test("listReviewQueue: POSTs /rpc/list_review_queue with p_scope/p_cursor/p_limit, defaults scope {} and cursor null", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ watermark: "0", counts: {}, sweep: {}, rows: [], next_cursor: null }, 200);
    },
    async () => {
      const env = await listReviewQueue(fakeSession("tok"));
      assert.deepEqual(env.rows, []);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/rpc\/list_review_queue$/);
  assert.deepEqual(seenBody, { p_scope: {}, p_cursor: null, p_limit: 50 });
});

test("listReviewQueue: a client scope is passed through verbatim", async () => {
  let seenBody: unknown;
  await withMockedFetch(
    async (_url, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ watermark: "0", counts: {}, sweep: {}, rows: [], next_cursor: null }, 200);
    },
    async () => {
      await listReviewQueue(fakeSession("tok"), { client_id: "c1" });
    },
  );
  assert.deepEqual(seenBody, { p_scope: { client_id: "c1" }, p_cursor: null, p_limit: 50 });
});

test("resolveOpenQuestion: POSTs resolve_open_question with a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: { p_question?: string; p_resolution?: string; p_op_key?: string } = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ question_id: "q1", status: "resolved" }, 200);
    },
    async () => {
      await resolveOpenQuestion(fakeSession("tok"), "q1", "It's client Acme.");
    },
  );
  assert.match(seenUrl, /\/rpc\/resolve_open_question$/);
  assert.equal(seenBody.p_question, "q1");
  assert.equal(seenBody.p_resolution, "It's client Acme.");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});

test("dismissOpenQuestion: a governed CLR refusal surfaces as DoorRefusal verbatim, never retried", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => {
      attempts += 1;
      return jsonResponse({ code: "CLR10", message: "question is not open" }, 400);
    },
    async () => {
      await assert.rejects(dismissOpenQuestion(fakeSession("tok"), "q1", "not relevant"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        return true;
      });
    },
  );
  assert.equal(attempts, 1);
});
