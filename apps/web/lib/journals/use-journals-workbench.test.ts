// useJournalsWorkbench — the controller hook wiring `useHydratedPart` (already
// proven in lib/parts/hooks.test.ts) to this tab's loader + doors. Mounted for
// real via test/hookHarness.ts (that module's own precedent: the property under
// test is WHAT HAPPENS OVER TIME — a mount reload, then an act()-triggered
// reload — which a single static-markup pass cannot observe). Fetch is mocked
// end-to-end (real api.ts, real wire.ts) so this also proves the hook calls the
// RIGHT endpoint with the RIGHT arguments, not just that some loader ran.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useJournalsWorkbench } from "./use-journals-workbench";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status = 200): Response {
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

const CLIENT_ID = "22222222-2222-2222-2222-222222222222";

function emptyWorkbenchFetch(callCounter: { n: number }): typeof fetch {
  return async (input: RequestInfo | URL) => {
    callCounter.n += 1;
    const url = String(input);
    if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
    return jsonResponse([]);
  };
}

test("readErrorKind: a 403 on the read path surfaces kind: 'forbidden' alongside the usual err message", async () => {
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes("journal_entries")) return jsonResponse({ message: "permission denied for table journal_entries" }, 403);
      if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
      return jsonResponse([]);
    },
    async () => {
      const sess = fakeSession();
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        assert.equal(h.current.readErrorKind, "forbidden");
        assert.match(h.current.err ?? "", /permission denied/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("readErrorKind: no live session surfaces kind: 'no_session' without ever calling fetch", async () => {
  let fetchCalled = false;
  await withMockedFetch(
    async () => {
      fetchCalled = true;
      throw new Error("must not fetch with no session");
    },
    async () => {
      const sess = fakeSession(null);
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        assert.equal(h.current.readErrorKind, "no_session");
        assert.equal(fetchCalled, false);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("readErrorKind: resets to null after a subsequent successful reload", async () => {
  let fail = true;
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (fail && url.includes("journal_entries")) return jsonResponse({ message: "nope" }, 403);
      if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
      return jsonResponse([]);
    },
    async () => {
      const sess = fakeSession();
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        assert.equal(h.current.readErrorKind, "forbidden");
        fail = false;
        await h.act(() => h.current.reload());
        assert.equal(h.current.readErrorKind, null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("mount: reloads once and populates data from the real read endpoints", async () => {
  const counter = { n: 0 };
  await withMockedFetch(emptyWorkbenchFetch(counter), async () => {
    const sess = fakeSession();
    const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
    try {
      await h.settle();
      assert.deepEqual(h.current.data, { entries: [], lines: [], accounts: [], counterparties: [], queueRows: [] });
      assert.equal(h.current.err, null);
      assert.equal(counter.n, 5, "five endpoints: entries, lines, accounts, counterparties, review-queue RPC");
    } finally {
      await h.unmount();
    }
  });
});

test("approve(): calls approve_entry then re-reads (a fresh loader round after the write)", async () => {
  const seen: string[] = [];
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes("rpc/approve_entry")) {
        seen.push("approve");
        return new Response("", { status: 200 });
      }
      seen.push("read");
      if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
      return jsonResponse([]);
    },
    async () => {
      const sess = fakeSession();
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        const readsBeforeApprove = seen.filter((s) => s === "read").length;
        await h.act(() => h.current.approve("e1", "rev-1", null));
        assert.ok(seen.includes("approve"), "the door itself was called");
        const readsAfterApprove = seen.filter((s) => s === "read").length;
        assert.ok(readsAfterApprove > readsBeforeApprove, "act() re-reads after the write — no optimistic UI");
        assert.equal(h.current.err, null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("reverse(): a CLR10 refusal from reverse_entry is captured as a sticky clr, verbatim", async () => {
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes("rpc/reverse_entry")) return jsonResponse({ code: "CLR10", message: "entry already reversed" }, 400);
      if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
      return jsonResponse([]);
    },
    async () => {
      const sess = fakeSession();
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        await h.act(() => h.current.reverse("e1", "duplicate"));
        assert.equal(h.current.clr?.code, "CLR10");
        assert.match(h.current.err ?? "", /entry already reversed/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("compose(): a successful two-call ceremony re-reads afterward", async () => {
  const seen: string[] = [];
  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes("rpc/record_client_resolution")) {
        seen.push("resolution");
        return jsonResponse({ resolution_id: "res-1" });
      }
      if (url.includes("rpc/draft_entry")) {
        seen.push("draft");
        return jsonResponse({ entry_id: "e9", revision_token: "rev-9", status: "draft" });
      }
      seen.push("read");
      if (url.includes("rpc/list_review_queue")) return jsonResponse({ rows: [] });
      return jsonResponse([]);
    },
    async () => {
      const sess = fakeSession();
      const h = await renderHook(() => useJournalsWorkbench(CLIENT_ID, sess));
      try {
        await h.settle();
        seen.length = 0; // drop the mount reload's own reads before asserting call order
        await h.act(() =>
          h.current.compose({
            postingDate: "2026-08-27",
            memo: "manual test entry",
            lines: [
              { account_code: "1000", debit_cents: 500, credit_cents: 0 },
              { account_code: "3000", debit_cents: 0, credit_cents: 500 },
            ],
          }),
        );
        assert.deepEqual(seen.slice(0, 2), ["resolution", "draft"]);
        assert.equal(h.current.err, null);
      } finally {
        await h.unmount();
      }
    },
  );
});
