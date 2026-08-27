// lib/firm/needs-you.ts — clara.list_review_queue (a read RPC over callDoor) and its
// two governed act doors, resolve_open_question/dismiss_open_question. Mocked-fetch
// style ported from ../doors.test.ts's own precedent: the property under test is that
// each wrapper posts the right RPC name/args, not a re-derivation of callDoor's own
// already-tested CLR/refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listReviewQueue,
  resolveOpenQuestion,
  dismissOpenQuestion,
  reviewQueueRowKey,
  isActingRowAttached,
  shouldShowQueueErrorBanner,
  type ReviewQueueRow,
} from "./needs-you";
import { isDoorRefusal } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

function row(overrides: Partial<ReviewQueueRow> = {}): ReviewQueueRow {
  return {
    row_kind: "open_question",
    section: "needs_you",
    client_id: null,
    counterparty_id: null,
    filing_id: null,
    entry_id: null,
    question_id: "q1",
    task_id: null,
    document_id: null,
    lane: null,
    auto: false,
    rule_backed: false,
    high_stakes: false,
    aged_since: null,
    amount_cents: null,
    period: null,
    question_text: null,
    created_at: "2026-08-27T00:00:00Z",
    id: "q1",
    coding_kind: null,
    watch_id: null,
    tier: null,
    finding_id: null,
    asset_id: null,
    advance_id: null,
    ...overrides,
  };
}

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

// R1 (independent review, fix-required, 2026-08-27 — round 2): the acted-on row
// can VANISH from the re-read (the most common refusal — someone else already
// settled it). A per-row-only error attachment goes dark for exactly this case;
// the banner must fall back whenever the acting row is no longer present.

test("reviewQueueRowKey: row_kind + id, stable across the same logical row", () => {
  assert.equal(reviewQueueRowKey(row({ row_kind: "open_question", id: "q1" })), "open_question:q1");
  assert.equal(reviewQueueRowKey(row({ row_kind: "draft", id: "e1" })), "draft:e1");
});

test("isActingRowAttached: false when actingKey is null", () => {
  assert.equal(isActingRowAttached([row({ id: "q1" })], null), false);
});

test("isActingRowAttached: true when the acted-on row is still present", () => {
  const rows = [row({ id: "q1" }), row({ id: "q2" })];
  assert.equal(isActingRowAttached(rows, "open_question:q1"), true);
});

test("isActingRowAttached: false when the acted-on row VANISHED from the re-read", () => {
  const rows = [row({ id: "q2" })]; // q1 is gone — e.g. someone else already resolved it
  assert.equal(isActingRowAttached(rows, "open_question:q1"), false);
});

test("shouldShowQueueErrorBanner: no data ever loaded -> false (DataState's full-page error owns it)", () => {
  assert.equal(shouldShowQueueErrorBanner(false, new Error("boom"), [row({ id: "q1" })], null), false);
});

test("shouldShowQueueErrorBanner: no error -> false", () => {
  assert.equal(shouldShowQueueErrorBanner(true, null, [row({ id: "q1" })], "open_question:q1"), false);
});

test("shouldShowQueueErrorBanner: an error with no acting row (e.g. a loadMore failure) -> true", () => {
  assert.equal(shouldShowQueueErrorBanner(true, new Error("boom"), [row({ id: "q1" })], null), true);
});

test("shouldShowQueueErrorBanner: the acting row is still present -> false (the row shows it instead)", () => {
  const rows = [row({ id: "q1" })];
  assert.equal(shouldShowQueueErrorBanner(true, new Error("boom"), rows, "open_question:q1"), false);
});

test("shouldShowQueueErrorBanner: the acting row VANISHED -> true (R1's regression fix)", () => {
  const rows = [row({ id: "q2" })]; // q1 vanished — the refusal must still surface SOMEWHERE
  assert.equal(shouldShowQueueErrorBanner(true, new Error("CLR10: question is not open"), rows, "open_question:q1"), true);
});
