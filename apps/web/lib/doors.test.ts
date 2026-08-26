// callDoor — the HUMAN-lane governed-RPC client (contract §3.3/§3.6, doors.ts's
// own header). Mocked-fetch style ported from wire.test.ts's own precedent —
// the property under test is that a governed refusal (a CLR code carried as
// the SQLSTATE) surfaces TYPED and VERBATIM, and every other failure is kept
// visibly distinct from it — never a re-derivation of the CLR/status ordering
// itself (that stays proven in wire.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { callDoor, DoorRefusal, isDoorRefusal, DoorError, isDoorError } from "./doors";
import * as doorsModule from "./doors";
import { isWireError } from "./wire";
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

test("callDoor: a null token throws DoorError(kind: no_session) WITHOUT ever calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      throw new Error("fetch must not be called with no token");
    },
    async () => {
      await assert.rejects(
        callDoor("approve_entry", { entry_id: "e1" }, { session: fakeSession(null) }),
        (e: unknown) => {
          assert.ok(isDoorError(e));
          assert.equal((e as DoorError).kind, "no_session");
          return true;
        },
      );
    },
  );
  assert.equal(called, false, "no live session must short-circuit before any network call");
});

// Review note N8: read.test.ts already covers the default-parameter path;
// doors.test.ts did not.
test("callDoor: session defaults to the blessed singleton when not passed explicitly (compiles and resolves no_session with no configured source)", async () => {
  await withMockedFetch(
    async () => { throw new Error("fetch must not be called"); },
    async () => {
      const { setConfigTimeoutForTests, getConfigTimeoutMs } = await import("./session-accessor");
      const originalTimeout = getConfigTimeoutMs();
      setConfigTimeoutForTests(50);
      try {
        await assert.rejects(callDoor("approve_entry", { entry_id: "e1" }), (e: unknown) => {
          assert.ok(isDoorError(e));
          assert.equal((e as DoorError).kind, "no_session");
          return true;
        });
      } finally {
        setConfigTimeoutForTests(originalTimeout);
      }
    },
  );
});

// --- the refusal contract: a CLR-shaped SQLSTATE surfaces typed, verbatim ----

// Review note N1 (independent review, MED — binding fix): the namespace-scan
// alone is THEATER — a mutant `callDoor` body that retries a refusal up to 3
// times internally (same exported names, same public shape) sailed through it
// GREEN. `attempts` here is the arm that actually distinguishes the two: it
// counts every `fetch` call the mocked network sees, so a retrying mutant
// fails RED (attempts > 1) while the real single-call `callDoor` stays GREEN.
test("callDoor: a governed CLR refusal throws DoorRefusal carrying the SQLSTATE code + message verbatim, and NEVER retries (attempts === 1)", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => {
      attempts += 1;
      return jsonResponse(
        { code: "CLR23", message: "CLR23: a payable line needs a resolved vendor.", details: '{"reason":"unresolved_vendor"}' },
        400,
      );
    },
    async () => {
      await assert.rejects(
        callDoor("approve_entry", { entry_id: "e1" }, { session: fakeSession("tok") }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e), "a governed refusal must be a DoorRefusal, not a generic DoorError");
          assert.ok(!isDoorError(e), "DoorRefusal and DoorError are never the same instance — distinct by construction");
          const refusal = e as DoorRefusal;
          assert.equal(refusal.code, "CLR23");
          assert.equal(refusal.message, "CLR23: a payable line needs a resolved vendor.");
          assert.equal(refusal.reason, "unresolved_vendor");
          assert.equal(refusal.codeSource, "sqlstate", "a REAL governed refusal must be trustworthy — sourced from body.code, not a message-regex guess");
          return true;
        },
      );
    },
  );
  assert.equal(attempts, 1, "a DoorRefusal must be surfaced on the FIRST fetch — never retried, even once");
});

test("callDoor: no retry-shaped export exists on the module surface (a secondary, non-binding signal — see the attempt-counter test above for the real proof)", () => {
  const retryLike = Object.keys(doorsModule).filter((k) => /retry/i.test(k));
  assert.deepEqual(retryLike, [], "doors.ts must not grow a retry-shaped export — a refusal is never auto-retried");
});

// --- status-before-CLR ordering, inherited from wire.ts ----------------------

test("callDoor: a 401 with a CLR-shaped body still classifies as DoorError(kind: unauthenticated), never DoorRefusal", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR21", message: "JWT expired" }, 401),
    async () => {
      await assert.rejects(
        callDoor("approve_entry", {}, { session: fakeSession("stale") }),
        (e: unknown) => {
          assert.ok(!isDoorRefusal(e), "a 401 must never masquerade as a governed refusal");
          assert.ok(isDoorError(e));
          assert.equal((e as DoorError).kind, "unauthenticated");
          return true;
        },
      );
    },
  );
});

test("callDoor: a 403 with no CLR code classifies as DoorError(kind: forbidden) — a grant refusal, distinct from a governed refusal", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "permission denied for function approve_entry" }, 403),
    async () => {
      await assert.rejects(
        callDoor("approve_entry", {}, { session: fakeSession("tok") }),
        (e: unknown) => {
          assert.ok(!isDoorRefusal(e));
          assert.equal((e as DoorError).kind, "forbidden");
          return true;
        },
      );
    },
  );
});

// --- transport / malformed / abort ------------------------------------------

test("callDoor: fetch itself rejecting (network failure) surfaces as DoorError(kind: transport)", async () => {
  await withMockedFetch(
    async () => { throw new TypeError("network down"); },
    async () => {
      await assert.rejects(callDoor("approve_entry", {}, { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isDoorError(e));
        assert.equal((e as DoorError).kind, "transport");
        assert.ok(!isDoorRefusal(e));
        return true;
      });
    },
  );
});

test("callDoor: a 200 with a malformed (non-JSON, non-empty) body classifies as DoorError(kind: malformed) — never silently swallowed", async () => {
  await withMockedFetch(
    async () => new Response("not json at all {{{", { status: 200 }),
    async () => {
      await assert.rejects(callDoor("approve_entry", {}, { session: fakeSession("tok") }), (e: unknown) => {
        assert.ok(isDoorError(e));
        assert.equal((e as DoorError).kind, "malformed");
        return true;
      });
    },
  );
});

test("callDoor: a 200 with a genuinely EMPTY body (a void governed function) resolves null, not an error", async () => {
  await withMockedFetch(
    async () => new Response("", { status: 200 }),
    async () => {
      const result = await callDoor("void_verb", {}, { session: fakeSession("tok") });
      assert.equal(result, null);
    },
  );
});

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

test("callDoor: an aborted in-flight request stays a distinguishable AbortError, never fabricated into a DoorError or a DoorRefusal", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    const promise = callDoor("approve_entry", {}, { session: fakeSession("tok"), signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, (e: unknown) => {
      assert.ok(!isDoorError(e));
      assert.ok(!isDoorRefusal(e));
      assert.ok(!isWireError(e));
      assert.equal((e as Error).name, "AbortError");
      return true;
    });
  });
});

// --- Content-Profile / method shape, asserted on the wire --------------------

test("callDoor sends POST with Content-Profile: clara (never Accept-Profile) and a JSON body", async () => {
  let seenHeaders: Headers | null = null;
  let seenMethod: string | undefined;
  let seenBody: unknown;
  await withMockedFetch(
    async (_url, init) => {
      seenHeaders = new Headers(init?.headers);
      seenMethod = init?.method;
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(null, 200);
    },
    async () => {
      await callDoor("approve_entry", { entry_id: "e1" }, { session: fakeSession("tok") });
    },
  );
  assert.equal(seenMethod, "POST");
  assert.equal(seenHeaders!.get("Content-Profile"), "clara");
  assert.equal(seenHeaders!.get("Accept-Profile"), null, "a write must never set Accept-Profile");
  assert.deepEqual(seenBody, { entry_id: "e1" });
});
