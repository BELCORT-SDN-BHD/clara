// use-activity-feed.ts — #632 review round 2, findings 1/2/3/21. The race-condition and
// merge-on-focus fixes this file exists to pin: a 401 mid-session denies rather than keeping
// stale rows (1); a load-more cannot start while a refresh is in flight, and a refresh that
// starts while a load-more is in flight preempts it cleanly rather than stranding its busy flag
// (2); a focus/visibility recheck MERGES with already-loaded pages rather than collapsing the
// feed back to page 1, while a genuine FILTER CHANGE still hard-resets to a fresh page 1 (3); the
// load-more dedupe count is computed correctly without a second setState nested inside another
// updater (21).
//
// THE WINDOW-EVENT SEAM. The harness's `window` stub has NO-OP event methods (test/hookHarness.ts
// never needed real dispatch until this hook), so — same technique
// `components/firm/client-scope-invalidation.test.tsx` already established — `window`'s
// listener/dispatch trio is swapped for a REAL `EventTarget`'s bound methods before any test
// runs, letting `window.dispatchEvent(new Event("focus"))` actually reach the hook's own
// `addEventListener("focus", ...)`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHook } from "../../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import type { ActivityFilters, ActivityRow } from "../../../lib/firm/activity";
import { useActivityFeed } from "./use-activity-feed";

const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function row(id: string, occurredAt: string, overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id, source: "event", event_type: "document.filed", description: `row ${id}`,
    client_id: null, actor: "u1", on_behalf_of: null, via_wake_kind: null,
    occurred_at: occurredAt, object_kind: "document", object_id: id, work_id: null,
    receipt_id: null, document_id: id, original_entry_id: null, replacement_entry_id: null,
    status: null, kind: "documents",
    ...overrides,
  };
}

const FILTERS_A: ActivityFilters = {};

/** A controllable, resolve-on-demand promise — for forcing a specific interleaving of two
 *  in-flight `fetch` calls rather than hoping timing works out. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ── finding 1: a 401 (unauthenticated) denies and clears, exactly like a 403/CLR04 ───────────

test("useActivityFeed: a 401 on a background refresh clears the rows and denies — it does not keep the stale banner", async () => {
  let mockCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (u.includes("list_activity")) {
        // First call succeeds with one row; every later call (the focus recheck) is a bare 401,
        // no CLR body — exactly what an expired session's PostgREST answers.
        if (mockCalls === 0) { mockCalls += 1; return jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z")], next_cursor: null, truncated: false }); }
        return jsonResponse({}, 401);
      }
      throw new Error(`unexpected fetch ${u}`);
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.equal(h.current.rows.length, 1, "setup: the first read succeeded");
        assert.equal(h.current.denied, null);

        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.equal(h.current.rows.length, 0, "a 401 clears the rows — denied targets never leak stale accounting data");
        assert.ok(h.current.denied, "a 401 is permission-shaped (DoorError.kind === 'unauthenticated') and must deny");
        assert.equal(h.current.staleError, null, "denied and stale are mutually exclusive");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── finding 2: refresh vs load-more, both interleavings ───────────────────────────────────────

test("useActivityFeed: refresh-then-load-more — a load-more that would start during a refresh is refused, and both flags settle cleanly", async () => {
  const refreshGate = deferred<Response>();
  let listActivityCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-1", truncated: true });
      }
      if (listActivityCalls === 2) return refreshGate.promise; // the focus-triggered refresh — held open
      throw new Error("loadMore must not have reached the network while a refresh was in flight");
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.equal(h.current.rows.length, 1, "setup: page 1 loaded");
        assert.equal(h.current.nextCursor, "cursor-1");

        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 3; i++) await h.settle();
        assert.equal(h.current.refreshing, true, "the refresh is genuinely in flight (held open by refreshGate)");

        // A load-more attempted WHILE the refresh is in flight must be a no-op — no third fetch,
        // and loadingMore must not even flip true.
        await h.act(() => { h.current.loadMore(); });
        for (let i = 0; i < 3; i++) await h.settle();
        assert.equal(listActivityCalls, 2, "loadMore must not have reached the network while refreshing");
        assert.equal(h.current.loadingMore, false, "loadMore refused to start — the flag never flipped true");

        // Let the refresh resolve now.
        await h.act(async () => {
          refreshGate.resolve(jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-1", truncated: true }));
          await Promise.resolve();
        });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.equal(h.current.refreshing, false, "the refresh settled and cleared its own flag");
        assert.equal(h.current.loadingMore, false, "still false — nothing stuck it");
        assert.equal(h.current.rows.length, 1);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("useActivityFeed: load-more-then-refresh — a refresh started mid-load-more preempts it, clears its flag immediately, and discards its stale result", async () => {
  const loadMoreGate = deferred<Response>();
  let listActivityCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e1", "2026-01-02T00:00:00Z")], next_cursor: "cursor-1", truncated: true });
      }
      if (listActivityCalls === 2) return loadMoreGate.promise; // the load-more — held open
      if (listActivityCalls === 3) {
        // The focus-triggered refresh — resolves BEFORE the stale load-more does.
        return jsonResponse({ rows: [row("e-new", "2026-01-03T00:00:00Z"), row("e1", "2026-01-02T00:00:00Z")], next_cursor: "cursor-1", truncated: true });
      }
      throw new Error("no fourth list_activity call expected");
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.equal(h.current.rows.length, 1, "setup: page 1 loaded");

        await h.act(() => { h.current.loadMore(); });
        for (let i = 0; i < 3; i++) await h.settle();
        assert.equal(h.current.loadingMore, true, "the load-more is genuinely in flight (held open)");

        // A refresh fires (window focus) WHILE the load-more is still pending — it must not
        // refuse to run, and it must immediately free the load-more button.
        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.equal(h.current.loadingMore, false, "the refresh preempted the stale load-more's flag immediately");
        assert.equal(h.current.refreshing, false, "the refresh itself already settled (call 3 resolves synchronously in this mock)");
        assert.deepEqual(
          h.current.rows.map((r) => r.id),
          ["e-new", "e1"],
          "the refresh's own (merged) result is what is on screen",
        );

        // NOW let the stale load-more resolve, long after it stopped mattering.
        await h.act(async () => {
          loadMoreGate.resolve(jsonResponse({ rows: [row("e-stale-page-2", "2025-01-01T00:00:00Z")], next_cursor: null, truncated: false }));
          await Promise.resolve();
        });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.deepEqual(
          h.current.rows.map((r) => r.id),
          ["e-new", "e1"],
          "the stale load-more's rows must NEVER be appended — it was superseded before it settled",
        );
        assert.equal(h.current.loadingMore, false, "still false — the stale call's own unconditional finally is a harmless no-op");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── finding 3: a focus recheck merges with already-loaded pages; a filter change hard-resets ──

test("useActivityFeed: a focus recheck MERGES the refreshed page 1 into already-loaded pages, and keeps the deeper cursor", async () => {
  let listActivityCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e2", "2026-01-02T00:00:00Z"), row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-page1", truncated: true });
      }
      if (listActivityCalls === 2) {
        // loadMore's own page 2 — THERE IS STILL MORE after this (truncated=true, a new cursor).
        return jsonResponse({ rows: [row("e0", "2025-12-31T00:00:00Z")], next_cursor: "cursor-page2", truncated: true });
      }
      if (listActivityCalls === 3) {
        // The focus-triggered refresh's own fresh page 1: a brand-new row appeared at the top;
        // e1/e2 unchanged; its OWN next_cursor would be "cursor-page1-again" — which must NOT
        // win, since the feed already had a deeper cursor before this refresh started.
        return jsonResponse({ rows: [row("e3", "2026-01-03T00:00:00Z"), row("e2", "2026-01-02T00:00:00Z"), row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-page1-again", truncated: true });
      }
      throw new Error("no fourth list_activity call expected");
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.id), ["e2", "e1"]);

        await h.act(() => { h.current.loadMore(); });
        for (let i = 0; i < 5; i++) await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.id), ["e2", "e1", "e0"], "setup: three loaded pages' worth of rows");
        assert.equal(h.current.nextCursor, "cursor-page2", "setup: there is a further page still unread");

        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.deepEqual(
          h.current.rows.map((r) => r.id),
          ["e3", "e2", "e1", "e0"],
          "the new row is merged in, and NOT ONE previously-loaded row is dropped — five pages must not become one",
        );
        assert.equal(
          h.current.nextCursor,
          "cursor-page2",
          "the OLD (deeper) cursor is kept — the fresh page-1 read's own cursor would rewind pagination",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("useActivityFeed: a focus recheck adopts the fresh cursor when the feed had only ONE page to begin with", async () => {
  let listActivityCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z")], next_cursor: null, truncated: false });
      }
      // The refresh: new activity landed and NOW there is a further page.
      return jsonResponse({ rows: [row("e2", "2026-01-02T00:00:00Z"), row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-new", truncated: true });
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.equal(h.current.nextCursor, null, "setup: everything fit on one page");

        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.deepEqual(h.current.rows.map((r) => r.id), ["e2", "e1"]);
        assert.equal(h.current.nextCursor, "cursor-new", "the fresh cursor is adopted — the old null would wrongly say there is nothing more");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("useActivityFeed: a FILTER CHANGE hard-resets to the fresh page 1 rather than merging (unlike a focus recheck)", async () => {
  let listActivityCalls = 0;
  const seenFilters: unknown[] = [];
  await withMockedEnv(
    async (url, init) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      seenFilters.push(JSON.parse(String(init?.body ?? "{}")));
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-1", truncated: true });
      }
      return jsonResponse({ rows: [row("e-other-client", "2026-01-05T00:00:00Z")], next_cursor: null, truncated: false });
    },
    async () => {
      let filters: ActivityFilters = {};
      const h = await renderHook(() => useActivityFeed(filters));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.deepEqual(h.current.rows.map((r) => r.id), ["e1"]);
        assert.equal(h.current.nextCursor, "cursor-1");

        filters = { client: "22222222-2222-2222-2222-222222222222" };
        await h.act(async () => { await h.rerender(); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.deepEqual(
          h.current.rows.map((r) => r.id),
          ["e-other-client"],
          "a filter change REPLACES rows with the fresh page — merging in the OLD filter's rows would be wrong under the NEW filter",
        );
        assert.equal(h.current.nextCursor, null, "and adopts the fresh page's own cursor, not the stale one");
        assert.equal(h.current.loadingMore, false);
        assert.equal(h.current.refreshing, false);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── finding 21: dedupe count computed cleanly, outside the setRows updater ────────────────────

test("useActivityFeed: loadMore dedupes by (source,id) against the CURRENT rows and reports the dropped count", async () => {
  let listActivityCalls = 0;
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (!u.includes("list_activity")) throw new Error(`unexpected fetch ${u}`);
      listActivityCalls += 1;
      if (listActivityCalls === 1) {
        return jsonResponse({ rows: [row("e2", "2026-01-02T00:00:00Z"), row("e1", "2026-01-01T00:00:00Z")], next_cursor: "cursor-1", truncated: true });
      }
      // page 2 re-serves e1 (new activity landed between the two reads and pushed it back onto
      // this page) plus one genuinely new row.
      return jsonResponse({ rows: [row("e1", "2026-01-01T00:00:00Z"), row("e0", "2025-12-31T00:00:00Z")], next_cursor: null, truncated: false });
    },
    async () => {
      const h = await renderHook(() => useActivityFeed(FILTERS_A));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        await h.act(() => { h.current.loadMore(); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.deepEqual(h.current.rows.map((r) => r.id), ["e2", "e1", "e0"], "e1 is not duplicated");
        assert.equal(h.current.duplicatesDropped, 1, "exactly one id (e1) was already on screen");
      } finally {
        await h.unmount();
      }
    },
  );
});
