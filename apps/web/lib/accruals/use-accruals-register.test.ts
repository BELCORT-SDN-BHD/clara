// #1152 — useAccrualsRegister's own pagination bookkeeping, mounted for real via
// ../../test/hookHarness (the `use-review-queue.test.ts` precedent, whose own header states why:
// this hook rides loadAccruals -> callDoor -> POST /rpc/list_accrual_adjustments). The property
// under test is the PAGINATION bookkeeping (accumulation, cursor advance, the honest hasMore
// derivation, the side-change reload) — not the RPC transport itself.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHook } from "../../test/hookHarness";
import { useAccrualsRegister } from "./use-accruals-register";
import type { AccrualListRow } from "./api";
import { configureSessionTokenSource, resetSessionTokenSource } from "../session-accessor";

function row(id: string, side: "expense" | "revenue" = "expense"): AccrualListRow {
  return {
    accrual_id: id,
    side,
    plan_id: `plan-${id}`,
    revision: 1,
    purpose: `Accrual ${id}`,
    expense_account_code: "6100",
    liability_account_code: "2020",
    amount_cents: 1000,
    currency: "MYR",
    effective_from: "2026-07-01",
    effective_to: "2026-07-31",
    service_period_start: "2026-07-01",
    service_period_end: "2026-07-31",
    term_source: "human_stated",
    method: { rule: "stated_amount" },
    document_service_period_id: null,
    source_document_id: null,
    plan_status: "active",
    plan_kind: "reversing_journal",
    recorded_by: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-07-01T02:00:00.000Z",
    occurrence_count: 0,
    posted: false,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
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

function reqBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

test("initial load: populates rows from page 1, hasMore reflects a FULL page, and the FIRST call carries a null cursor and side", async () => {
  const page = { client_id: "c1", from: null, to: null, side: null, accruals: [row("a"), row("b")], next_cursor: { tuple: ["x"] } };
  let calls = 0;
  await withMockedFetch(
    async (_url, init) => {
      calls += 1;
      const body = reqBody(init);
      assert.equal(body.p_cursor, null, "the first call must pass a null cursor");
      assert.equal(body.p_side, null, "an unset side control asks for every side");
      assert.equal(body.p_limit, 50, "the register always asks for a bounded page");
      return jsonResponse(page, 200);
    },
    async () => {
      const h = await renderHook(() => useAccrualsRegister("11111111-1111-4111-8111-111111111111", {}, ""));
      try {
        await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.accrual_id), ["a", "b"]);
        assert.equal(h.current.hasMore, false, "a page smaller than PAGE_LIMIT (50) is provably the last page");
        assert.equal(calls, 1);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("loadMore: appends the next page and advances the cursor, sending the PRIOR page's own next_cursor verbatim", async () => {
  const cursor1 = { tuple: ["2026-08-01", "2026-08-01T00:00:00.000000", "zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz"] };
  const fullPage = {
    client_id: "c1", from: null, to: null, side: null,
    accruals: Array.from({ length: 50 }, (_, i) => row(`p1-${i}`)),
    next_cursor: cursor1,
  };
  const page2 = { client_id: "c1", from: null, to: null, side: null, accruals: [row("last")], next_cursor: null };
  let calls = 0;
  let seenSecondCursor: unknown;
  await withMockedFetch(
    async (_url, init) => {
      calls += 1;
      const body = reqBody(init);
      if (calls === 1) return jsonResponse(fullPage, 200);
      seenSecondCursor = body.p_cursor;
      return jsonResponse(page2, 200);
    },
    async () => {
      const h = await renderHook(() => useAccrualsRegister("11111111-1111-4111-8111-111111111111", {}, ""));
      try {
        await h.settle();
        assert.equal(h.current.hasMore, true, "a full page (50 rows) must read as possibly-more");
        await h.act(() => h.current.loadMore());
        assert.equal(h.current.rows.length, 51, "loadMore appends onto the existing rows, never replaces them");
        assert.equal(h.current.rows[50]?.accrual_id, "last");
        assert.equal(h.current.hasMore, false, "page 2 (1 row) is smaller than PAGE_LIMIT — provably the last page");
        assert.equal(calls, 2);
        assert.deepEqual(seenSecondCursor, cursor1, "loadMore must pass the PRIOR page's own next_cursor verbatim");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a SIDE change re-fetches from the server, resetting to page one — never a client-side narrowing of what page one already holds", async () => {
  const allSides = { client_id: "c1", from: null, to: null, side: null, accruals: [row("e", "expense"), row("r", "revenue")], next_cursor: null };
  const revenueOnly = { client_id: "c1", from: null, to: null, side: "revenue", accruals: [row("r", "revenue")], next_cursor: null };
  const bodies: Record<string, unknown>[] = [];
  await withMockedFetch(
    async (_url, init) => {
      const body = reqBody(init);
      bodies.push(body);
      return jsonResponse(body.p_side === "revenue" ? revenueOnly : allSides, 200);
    },
    async () => {
      // A MUTABLE variable an outer closure captures (`renderHook`'s own "swap what the closure
      // captures, then `rerender()`" idiom — its header describes exactly this shape), standing
      // in for a parent re-render that passed a different `side` prop.
      let side: "" | "expense" | "revenue" = "";
      const h = await renderHook(() => useAccrualsRegister("11111111-1111-4111-8111-111111111111", {}, side));
      try {
        await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.accrual_id), ["e", "r"]);
        assert.equal(bodies.length, 1);

        side = "revenue";
        await h.rerender();
        await h.settle();

        assert.equal(bodies.length, 2, "changing the side control makes a SECOND round trip to the door");
        assert.equal(bodies[1]?.p_side, "revenue", "…carrying the newly selected side");
        assert.equal(bodies[1]?.p_cursor, null, "…and resets to page one rather than continuing the old cursor");
        assert.deepEqual(h.current.rows.map((r) => r.accrual_id), ["r"],
          "the rows are exactly the SERVER's answer for revenue — no leftover expense row filtered client-side");
      } finally {
        await h.unmount();
      }
    },
  );
});
