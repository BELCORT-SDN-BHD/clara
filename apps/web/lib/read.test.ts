// getRows — the HUMAN-lane read client (contract §3.3/§4.3, read.ts's own
// header). Mocked-fetch style ported from wire.test.ts's own precedent — the
// property under test is the TYPED classification `getRows` layers on top of
// wire.ts's already-reviewed `pgrestSelect`, never a re-derivation of the
// CLR/status ordering itself (that stays proven in wire.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { getRows, ReadError, isReadError } from "./read";
import { isWireError, isRefusalError } from "./wire";
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

// --- null token: never a fabricated request --------------------------------

test("getRows: a null token throws ReadError(kind: no_session) WITHOUT ever calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      throw new Error("fetch must not be called with no token");
    },
    async () => {
      await assert.rejects(getRows("documents", { session: fakeSession(null) }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "no_session");
        return true;
      });
    },
  );
  assert.equal(called, false, "no live session must short-circuit before any network call — law 2's absence posture");
});

// --- HTTP-status classes -----------------------------------------------------

test("getRows: a 401 classifies as ReadError(kind: unauthenticated), rendered verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "JWT expired" }, 401),
    async () => {
      await assert.rejects(getRows("documents", { session: fakeSession("stale") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "unauthenticated");
        assert.equal((e as ReadError).status, 401);
        assert.match((e as ReadError).message, /JWT expired/);
        return true;
      });
    },
  );
});

test("getRows: a 403 classifies as ReadError(kind: forbidden) — an RLS/grant refusal, rendered verbatim, never masked", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "permission denied for table filings" }, 403),
    async () => {
      await assert.rejects(getRows("filings", { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "forbidden");
        assert.equal((e as ReadError).status, 403);
        assert.match((e as ReadError).message, /permission denied/);
        return true;
      });
    },
  );
});

test("getRows: a 404 classifies as ReadError(kind: not_found) — the relation is not reachable today, never a crash", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "relation not found" }, 404),
    async () => {
      await assert.rejects(getRows("report_artifacts", { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "not_found");
        return true;
      });
    },
  );
});

test("getRows: a 500 classifies as ReadError(kind: server_error)", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "internal error" }, 500),
    async () => {
      await assert.rejects(getRows("documents", { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "server_error");
        return true;
      });
    },
  );
});

test("getRows: a fetch-level network failure classifies as ReadError(kind: transport), never a raw rejection", async () => {
  await withMockedFetch(
    async () => { throw new TypeError("Failed to fetch"); },
    async () => {
      await assert.rejects(getRows("documents", { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "transport");
        assert.ok(!isRefusalError(e));
        return true;
      });
    },
  );
});

test("getRows: a 200 with a malformed (non-JSON) body classifies as ReadError(kind: malformed), never a raw SyntaxError", async () => {
  await withMockedFetch(
    async () => new Response("not json at all {{{", { status: 200 }),
    async () => {
      await assert.rejects(getRows("documents", { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isReadError(e));
        assert.equal((e as ReadError).kind, "malformed");
        return true;
      });
    },
  );
});

// --- success + the getRows query-building surface ---------------------------

test("getRows: a successful 200 resolves the parsed rows, typed by the caller", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ id: "d1" }], 200),
    async () => {
      const rows = await getRows<{ id: string }>("documents", { session: fakeSession("tok") });
      assert.deepEqual(rows, [{ id: "d1" }]);
    },
  );
});

test("getRows: select/filters/order/limit build the PostgREST query string, sent as Accept-Profile: clara", async () => {
  let seenUrl = "";
  let seenHeaders: Headers | null = null;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenHeaders = new Headers(init?.headers);
      return jsonResponse([], 200);
    },
    async () => {
      await getRows("documents", {
        select: "id,status",
        filters: { status: "eq.open", client_id: "eq.c1" },
        order: "created_at.desc",
        limit: 25,
        session: fakeSession("tok"),
      });
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/documents\?/);
  assert.match(seenUrl, /select=id%2Cstatus/);
  assert.match(seenUrl, /status=eq\.open/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=created_at\.desc/);
  assert.match(seenUrl, /limit=25/);
  assert.equal(seenHeaders!.get("Accept-Profile"), "clara");
  assert.equal(seenHeaders!.get("Content-Profile"), null, "a read must never set Content-Profile");
});

test("getRows: session defaults to the blessed singleton when not passed explicitly (compiles and resolves no_session with no configured source)", async () => {
  // No session option passed at all — exercises the default-parameter path.
  // The blessed singleton is unconfigured in this test process, so it resolves
  // null (never throws) after its bounded wait — see session-accessor.ts.
  await withMockedFetch(
    async () => { throw new Error("fetch must not be called"); },
    async () => {
      const { setConfigTimeoutForTests, getConfigTimeoutMs } = await import("./session-accessor");
      const originalTimeout = getConfigTimeoutMs();
      setConfigTimeoutForTests(50);
      try {
        await assert.rejects(getRows("documents"), (e: unknown) => {
          assert.ok(isReadError(e));
          assert.equal((e as ReadError).kind, "no_session");
          return true;
        });
      } finally {
        setConfigTimeoutForTests(originalTimeout); // review note N7: never leave the shared module's timeout mutated
      }
    },
  );
});

// --- abort carve-out: cancellation stays distinguishable, including mid-body ---

function abortableFetchMock(): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abortErr = () => new DOMException("The operation was aborted.", "AbortError");
      if (signal?.aborted) {
        reject(abortErr());
        return;
      }
      signal?.addEventListener("abort", () => reject(abortErr()));
    });
  }) as typeof fetch;
}

test("getRows: an aborted in-flight request stays a distinguishable AbortError, never fabricated into a ReadError", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    const promise = getRows("documents", { session: fakeSession("tok"), signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, (e: unknown) => {
      assert.ok(!isReadError(e), "an abort must NOT be fabricated into a ReadError");
      assert.ok(!isWireError(e));
      assert.equal((e as Error).name, "AbortError");
      return true;
    });
  });
});

test("getRows: a request whose signal is ALREADY aborted before fetch is even reached also stays an AbortError", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      getRows("documents", { session: fakeSession("tok"), signal: controller.signal }),
      (e: unknown) => {
        assert.ok(!isReadError(e));
        assert.equal((e as Error).name, "AbortError");
        return true;
      },
    );
  });
});
