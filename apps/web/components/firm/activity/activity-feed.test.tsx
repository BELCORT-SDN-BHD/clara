// The Activity feed's own state ladder (#632 review finding 16: "this lane skipped its RTL seam
// entirely") — loading skeleton, empty-first-use vs no-results, a failed first read, a stale
// refresh that keeps the prior rows with a Retry banner, a denied (permission-lost) read, and
// dedupe on load-more, each asserted by RENDERED TEXT rather than by inspecting the hook's own
// state (use-activity-feed.test.ts already covers that seam directly).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import messages from "../../../messages/en.json";
import { ACTIVITY_CLIENT, MEMBERS, activityRow, jsonResponse } from "./activity-test-fixtures";
import { ActivityFeed } from "./activity-feed";

enableDomInspection();

// The harness's `window` stub has NO-OP event methods (test/hookHarness.ts never needed real
// dispatch until this hook) — same technique `components/firm/client-scope-invalidation.test.tsx`
// and `use-activity-feed.test.ts` already established, done at MODULE scope so it is in place
// BEFORE any component's mount effect registers its own "focus" listener (a swap performed AFTER
// mount would miss a listener already registered against the old no-op).
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

function App(children: unknown, search = "") {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(search) as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement(PathnameContext.Provider as never, { value: "/activity" as never }, children as never),
      ),
    ),
  });
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

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null };
function findIn(root: StubNode, predicate: (n: StubNode) => boolean): StubNode | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) { const found = findIn(c, predicate); if (found) return found; }
  return null;
}

/** A base fetch mock every cell below extends: the client register and member roster answer
 *  once, honestly; `onListActivity` decides the RPC's own answer per call (1-indexed count). */
function baseFetch(onListActivity: (call: number, body: unknown) => Response | Promise<Response>): typeof fetch {
  let calls = 0;
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse([ACTIVITY_CLIENT]);
    if (u.includes("/rest/v1/firm_members_visible")) return jsonResponse(MEMBERS);
    if (u.includes("/rest/v1/rpc/list_activity")) {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
      return onListActivity(calls, body);
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
}

test("ActivityFeed: the loading skeleton renders before the first read settles", async () => {
  const gate = new Promise<Response>(() => {}); // never resolves within this test
  await withMockedEnv(
    baseFetch(() => gate),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed)) as never);
      try {
        await h.settle();
        assert.match(textOf(h.container as never), /Loading activity/, "the loading sentence renders while the first read is in flight");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: empty-first-use (no filters) is a distinct sentence from filtered no-results", async () => {
  await withMockedEnv(
    baseFetch(() => jsonResponse({ rows: [], next_cursor: null, truncated: false })),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed)) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(textOf(h.container as never), /No activity has been recorded for this firm yet/, "empty-first-use: no filters active");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: a client filter already active renders the filtered no-results copy, not the first-use copy", async () => {
  await withMockedEnv(
    baseFetch(() => jsonResponse({ rows: [], next_cursor: null, truncated: false })),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed), `client=${ACTIVITY_CLIENT.id}`) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = textOf(h.container as never);
        assert.match(text, /No activity matches these filters/, "filtered no-results, since a filter is already active");
        assert.ok(!/recorded for this firm yet/.test(text), "must NOT claim first-use — a read that answered zero rows under a filter proves nothing about the unfiltered feed");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: a failed FIRST read is distinct from empty and from stale, and offers Retry", async () => {
  await withMockedEnv(
    baseFetch(() => jsonResponse({ message: "internal error" }, 500)),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed)) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = textOf(h.container as never);
        assert.match(text, /Activity could not be read/, "the distinct failed-first-read title, not the stale-refresh copy");
        const retry = findIn(h.container as unknown as StubNode, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Retry");
        assert.ok(retry, "a Retry control must be offered");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: a denied read (CLR04) clears the rows and explains the access state — the explanation is reachable, not dead code", async () => {
  await withMockedEnv(
    baseFetch(() => jsonResponse({ code: "CLR04", message: "insufficient role", details: "{}" }, 400)),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed)) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = textOf(h.container as never);
        assert.match(text, /Activity is not available/, "the denied title");
        // Review finding 8: every real error is an Error, so the explanation (deniedGeneric) must
        // actually render — not the raw DB message ("insufficient role") standing in for it.
        assert.match(text, /Your access changed, so the activity feed was cleared/, "the honest explanation must be the visible body text");
        assert.match(text, /CLR04/, "the governed code still renders, in its own code slot");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: a stale (non-permission) refresh KEEPS the prior rows, with a Retry banner — never a blank flash", async () => {
  await withMockedEnv(
    baseFetch((call) => {
      if (call === 1) return jsonResponse({ rows: [activityRow()], next_cursor: null, truncated: false });
      return jsonResponse({ message: "server exploded" }, 500);
    }),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed), `client=${ACTIVITY_CLIENT.id}`) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(textOf(h.container as never), /A document was filed/, "setup: the first read succeeded");

        // A focus recheck triggers the second (failing) read. `window`'s stub addEventListener
        // is a no-op in this harness (test/hookHarness.ts), so the retry button is used instead —
        // `retry()` and the focus-triggered reload share the exact same code path in
        // use-activity-feed.ts (both call `reload({ resetToPage1: false })`), so this exercises
        // the identical "stale, not denied" branch use-activity-feed.test.ts already isolates.
        const retryBefore = findIn(h.container as unknown as StubNode, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Retry");
        assert.equal(retryBefore, null, "no Retry button yet — nothing has failed");

        // The window-focus recheck drives the SECOND (failing) read, through the exact same
        // `reload({ resetToPage1: false })` path use-activity-feed.test.ts already isolates at
        // the hook level — this cell is about the RENDERED banner, not the hook's own state.
        await h.act(() => { window.dispatchEvent(new Event("focus")); });
        for (let i = 0; i < 5; i++) await h.settle();

        const text = textOf(h.container as never);
        assert.match(text, /A document was filed/, "the prior row is STILL on screen — never a blank flash");
        assert.match(text, /The activity feed could not refresh/, "the stale banner explains the refresh failure");
        const retryAfter = findIn(h.container as unknown as StubNode, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Retry");
        assert.ok(retryAfter, "a Retry control accompanies the stale banner");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityFeed: Load more dedupes by (source,id) and reports how many were already on screen", async () => {
  const page1 = activityRow({ id: "e2", occurred_at: "2026-01-02T00:00:00Z" });
  const page1b = activityRow({ id: "e1", occurred_at: "2026-01-01T00:00:00Z" });
  await withMockedEnv(
    baseFetch((call) => {
      if (call === 1) return jsonResponse({ rows: [page1, page1b], next_cursor: "cursor-1", truncated: true });
      // page 2 re-serves e1 (new activity pushed it back onto this page) plus one new row.
      return jsonResponse({ rows: [page1b, activityRow({ id: "e0", occurred_at: "2025-12-31T00:00:00Z" })], next_cursor: null, truncated: false });
    }),
    async () => {
      const h = await renderComponent(App(createElement(ActivityFeed)) as never);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const loadMore = findIn(h.container as unknown as StubNode, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Load more");
        assert.ok(loadMore, "a Load more control renders while the page is truncated");

        await h.act(async () => { await clickButton(loadMore as never); });
        for (let i = 0; i < 5; i++) await h.settle();

        const text = textOf(h.container as never);
        assert.match(text, /1 event you already saw was skipped/, "the dedupe count is surfaced, not silently dropped");
        const rows = h.find((n) => (n as { tagName?: string }).tagName === "LI");
        assert.ok(rows, "rows still render after the merge");
      } finally {
        await h.unmount();
      }
    },
  );
});
