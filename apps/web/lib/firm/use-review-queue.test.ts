// useReviewQueue — mounted for real via ../../test/hookHarness (the useAsyncRead
// precedent). Mocked-fetch style ported from ../doors.test.ts's own precedent
// (this hook rides listReviewQueue -> callDoor -> POST /rpc/list_review_queue) —
// the property under test is the PAGINATION bookkeeping (accumulation, cursor
// advance, the honest hasMore derivation), not the RPC transport (already proven
// in needs-you.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useReviewQueue } from "./use-review-queue";
import type { ReviewQueueEnvelope, ReviewQueueRow } from "./needs-you";
import { configureSessionTokenSource, resetSessionTokenSource } from "../session-accessor";

function row(id: string): ReviewQueueRow {
  return {
    row_kind: "draft",
    section: "needs_review",
    client_id: null,
    counterparty_id: null,
    filing_id: null,
    entry_id: null,
    question_id: null,
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
    id,
    coding_kind: null,
    watch_id: null,
    tier: null,
    finding_id: null,
    asset_id: null,
    advance_id: null,
  };
}

function envelope(rows: ReviewQueueRow[], nextCursor: ReviewQueueEnvelope["next_cursor"]): ReviewQueueEnvelope {
  return {
    watermark: "1",
    counts: {
      ready: 0,
      needs_review: rows.length,
      needs_you: 0,
      open_drafts: 0,
      open_questions: 0,
      open_tasks: 0,
      compliance_watches: 0,
      lint_findings: 0,
    },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows,
    next_cursor: nextCursor,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    resetSessionTokenSource();
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("initial load: populates rows/counts from page 1, hasMore reflects a FULL page", async () => {
  const page1 = envelope([row("a"), row("b")], { tuple: ["1", "c1", "", "t", "b"] });
  await withMockedFetch(
    async () => jsonResponse(page1, 200),
    async () => {
      const h = await renderHook(() => useReviewQueue({}));
      try {
        await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.id), ["a", "b"]);
        assert.equal(h.current.counts?.needs_review, 2);
        assert.equal(h.current.hasMore, false, "a page smaller than PAGE_LIMIT (50) is provably the last page");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("loadMore: appends the next page and advances the cursor (hasMore only true on a FULL page)", async () => {
  const cursor1 = { tuple: ["1", "c1", "", "t", "z49"] };
  // Exactly PAGE_LIMIT (50) rows — the only shape that makes hasMore true.
  const fullPage = envelope(
    Array.from({ length: 50 }, (_, i) => row(`p1-${i}`)),
    cursor1,
  );
  const page2 = envelope([row("c")], { tuple: ["1", "c1", "", "t", "c"] });
  let calls = 0;
  let seenSecondCallCursor: unknown;
  await withMockedFetch(
    async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { p_cursor: unknown };
      if (calls === 1) {
        assert.equal(body.p_cursor, null, "the first call must pass a null cursor");
        return jsonResponse(fullPage, 200);
      }
      seenSecondCallCursor = body.p_cursor;
      return jsonResponse(page2, 200);
    },
    async () => {
      const h = await renderHook(() => useReviewQueue({}));
      try {
        await h.settle();
        assert.equal(h.current.hasMore, true, "a full page (50 rows) must read as possibly-more");
        await h.act(() => h.current.loadMore());
        assert.equal(h.current.rows.length, 51, "loadMore appends onto the existing rows, never replaces them");
        assert.equal(h.current.rows[50]?.id, "c");
        assert.equal(h.current.hasMore, false, "page 2 (1 row) is smaller than PAGE_LIMIT — provably the last page");
        assert.equal(calls, 2);
        assert.deepEqual(seenSecondCallCursor, cursor1, "loadMore must pass the PRIOR envelope's own next_cursor verbatim");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("act(): resolves true on success and resets to page 1", async () => {
  const page = envelope([row("a")], { tuple: ["1", "c1", "", "t", "a"] });
  await withMockedFetch(
    async () => jsonResponse(page, 200),
    async () => {
      const h = await renderHook(() => useReviewQueue({}));
      let ok: boolean | undefined;
      try {
        await h.settle();
        await h.act(async () => {
          ok = await h.current.act(async () => {});
        });
        assert.equal(ok, true);
        assert.equal(h.current.rows.length, 1);
      } finally {
        await h.unmount();
      }
    },
  );
});
