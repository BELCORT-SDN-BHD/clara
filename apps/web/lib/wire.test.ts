// The governed CLR envelope parse + the status-before-clr classification ordering
// (contract §3.3 / apps/dashboard/app/shared/wire.test.ts's precedent, extended
// with the ordering guard itself). The CLR code IS the SQLSTATE, so PostgREST
// reports it in `body.code` — parsing the message instead yields null for every
// real refusal. HTTP status is checked BEFORE clr: a 401 (expired/invalid session
// JWT) must never be classified as a governed refusal, even adversarially, when its
// body happens to carry a CLR-shaped code (finding 6a).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClrCode,
  parseReasonToken,
  clrSource,
  classifyPgrestFailure,
  pgrestSelect,
  pgrestRpc,
  RefusalError,
  WireError,
  isRefusalError,
  isWireError,
} from "./wire";
import type { SessionTokenAccessor } from "@/lib/session";

// --- Pure parse (ported 1:1 from the dashboard's wire.test.ts) -------------------

test("parseClrCode reads the SQLSTATE first — the shape PostgREST actually returns", () => {
  assert.equal(parseClrCode("CLR04", "insufficient role"), "CLR04");
  assert.equal(parseClrCode("CLR21", "proposed total conflicts with the machine-corroborated total"), "CLR21");
});

test("a non-CLR SQLSTATE is not a governed refusal", () => {
  assert.equal(parseClrCode("23505", "duplicate key value violates unique constraint"), null);
  assert.equal(parseClrCode(undefined, undefined), null);
});

test("parseReasonToken reads the DETAIL discriminant, and never throws on junk", () => {
  assert.equal(parseReasonToken('{"reason": "amount_conflict"}'), "amount_conflict");
  assert.equal(parseReasonToken("not json at all"), null);
  assert.equal(parseReasonToken(undefined), null);
});

// --- classifyPgrestFailure: the status-before-clr ordering itself ----------------

test("a 400 with a governed CLR code classifies as RefusalError, carrying code+message+reason verbatim", () => {
  const err = classifyPgrestFailure(400, {
    code: "CLR21",
    message: "an approved sales invoice already exists for this customer",
    details: '{"reason": "duplicate_sales"}',
  });
  assert.ok(err instanceof RefusalError);
  assert.equal(err.code, "CLR21");
  assert.equal(err.reason, "duplicate_sales");
  assert.equal(err.status, 400);
  assert.equal(err.message, "an approved sales invoice already exists for this customer");
});

test("a 400 with a non-CLR SQLSTATE classifies as WireError, never RefusalError", () => {
  const err = classifyPgrestFailure(400, { code: "23505", message: "duplicate key value violates unique constraint" });
  assert.ok(err instanceof WireError);
  assert.ok(!(err instanceof RefusalError));
  assert.equal(err.pgCode, "23505");
});

// THE ORDERING ITSELF: a 401 must classify as WireError even when its body is
// CLR-shaped — the adversarial case that proves status is checked BEFORE clr, not
// merely alongside it. If the implementation parsed clr first, this would
// (wrongly) come back as a RefusalError.
test("status-before-clr ordering: a 401 with a CLR-shaped body still classifies as WireError, never RefusalError", () => {
  const err = classifyPgrestFailure(401, { code: "CLR21", message: "JWT expired" });
  assert.ok(err instanceof WireError, "a 401 must never be classified as a governed refusal");
  assert.ok(!(err instanceof RefusalError));
  assert.equal(err.status, 401);
});

test("status-before-clr ordering: a 401 with NO CLR-shaped body classifies as WireError (the common case)", () => {
  const err = classifyPgrestFailure(401, { message: "JWT expired" });
  assert.ok(err instanceof WireError);
  assert.equal(err.status, 401);
});

test("a governed refusal at a non-401 status is unaffected by the auth branch", () => {
  const err = classifyPgrestFailure(400, { code: "CLR10", message: "op_key is required" });
  assert.ok(err instanceof RefusalError);
  assert.equal(err.code, "CLR10");
  assert.equal(err.status, 400);
});

// --- fix-round finding 4: the real SQLSTATE + codeSource discriminant ------------

test("clrSource: a CLR-shaped body.code is 'sqlstate' (trustworthy)", () => {
  assert.equal(clrSource("CLR21"), "sqlstate");
  assert.equal(clrSource("CLR04"), "sqlstate");
});

test("clrSource: a non-CLR-shaped body.code (or none at all) is 'message'", () => {
  assert.equal(clrSource("ZA011"), "message");
  assert.equal(clrSource("23505"), "message");
  assert.equal(clrSource(undefined), "message");
});

test("a REAL governed refusal (body.code itself is CLR-shaped) carries codeSource:'sqlstate' and pgCode === code", () => {
  const err = classifyPgrestFailure(400, { code: "CLR21", message: "amounts do not match" });
  assert.ok(err instanceof RefusalError);
  assert.equal(err.codeSource, "sqlstate");
  assert.equal(err.pgCode, "CLR21");
  assert.equal(err.code, "CLR21");
});

// THE DISCRIMINANT'S WHOLE POINT: migration 0011's self-test probe raises under
// SQLSTATE 'ZA011' with the literal text "0011 CLR05 probe rollback" in its
// message — parseClrCode's defensive fallback matches "CLR05" out of that message
// (by design, for a hand-rolled body with no code field at all), but this is NOT a
// real governed refusal. codeSource must say so, and pgCode must carry the ACTUAL
// SQLSTATE (ZA011), not the coincidentally-matched CLR05.
test("a message-regex-derived CLR code carries codeSource:'message' and the REAL SQLSTATE in pgCode, distinguishing it from a real refusal", () => {
  const err = classifyPgrestFailure(400, { code: "ZA011", message: "0011 CLR05 probe rollback" });
  assert.ok(err instanceof RefusalError, "parseClrCode's fallback still recovers a CLR-shaped token — it renders, but is now flagged untrustworthy");
  assert.equal(err.code, "CLR05", "the recovered (untrustworthy) code");
  assert.equal(err.pgCode, "ZA011", "the REAL SQLSTATE, preserved independently of the recovered code");
  assert.equal(err.codeSource, "message", "a caller that gates on trustworthiness must see this is NOT a real governed refusal");
});

// --- pgrestSelect / pgrestRpc with a mocked fetch: the same ordering end to end --

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  // fix-round finding 7: capture the ORIGINAL value itself, not a copy of the
  // whole env — and restore via `delete` when it was unset, never assign the
  // literal string "undefined" (which `process.env.X = undefined` actually does,
  // since every process.env write is coerced to a string).
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

test("pgrestSelect: a live 401 with a CLR-shaped body still throws WireError, not RefusalError (end to end)", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR21", message: "JWT expired" }, 401),
    async () => {
      await assert.rejects(
        pgrestSelect("documents?select=id", fakeSession("stale-token")),
        (e: unknown) => {
          assert.ok(e instanceof WireError);
          assert.ok(!(e instanceof RefusalError));
          assert.equal((e as WireError).status, 401);
          return true;
        },
      );
    },
  );
});

test("pgrestRpc: a live 400 governed refusal throws RefusalError with the code+message verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR23", message: "CLR23: a payable line needs a resolved vendor." }, 400),
    async () => {
      await assert.rejects(
        pgrestRpc("approve_entry", { entry_id: "e1" }, fakeSession("good-token")),
        (e: unknown) => {
          assert.ok(e instanceof RefusalError);
          assert.equal((e as RefusalError).code, "CLR23");
          assert.equal((e as RefusalError).message, "CLR23: a payable line needs a resolved vendor.");
          return true;
        },
      );
    },
  );
});

test("pgrestSelect: no live session (accessor resolves null) throws WireError without ever calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      throw new Error("fetch must not be called with no token");
    },
    async () => {
      await assert.rejects(pgrestSelect("documents?select=id", fakeSession(null)), WireError);
    },
  );
  assert.equal(called, false, "no live session must short-circuit before any network call");
});

test("pgrestSelect: a successful 200 resolves the parsed rows", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ id: "d1" }], 200),
    async () => {
      const rows = await pgrestSelect<{ id: string }>("documents?select=id", fakeSession("good-token"));
      assert.deepEqual(rows, [{ id: "d1" }]);
    },
  );
});

// --- fix-round finding 5: the two-lane header contract, asserted on the wire ------

test("pgrestSelect sends Accept-Profile: clara on the GET (never Content-Profile)", async () => {
  let seenHeaders: Headers | null = null;
  await withMockedFetch(
    async (_url, init) => {
      seenHeaders = new Headers(init?.headers);
      return jsonResponse([], 200);
    },
    async () => {
      await pgrestSelect("documents?select=id", fakeSession("good-token"));
    },
  );
  assert.equal(seenHeaders!.get("Accept-Profile"), "clara");
  assert.equal(seenHeaders!.get("Content-Profile"), null, "a read must never set Content-Profile");
  assert.equal(seenHeaders!.get("authorization"), "Bearer good-token");
});

test("pgrestRpc sends Content-Profile: clara on the POST (never Accept-Profile), with a JSON content-type", async () => {
  let seenHeaders: Headers | null = null;
  let seenMethod: string | undefined;
  await withMockedFetch(
    async (_url, init) => {
      seenHeaders = new Headers(init?.headers);
      seenMethod = init?.method;
      return jsonResponse(null, 200);
    },
    async () => {
      await pgrestRpc("approve_entry", { entry_id: "e1" }, fakeSession("good-token"));
    },
  );
  assert.equal(seenMethod, "POST");
  assert.equal(seenHeaders!.get("Content-Profile"), "clara");
  assert.equal(seenHeaders!.get("Accept-Profile"), null, "a write must never set Accept-Profile");
  assert.equal(seenHeaders!.get("content-type"), "application/json");
});

// --- fix-round finding 3: network failure / malformed body ALWAYS become WireError ---

test("pgrestSelect: fetch itself rejecting (network failure) surfaces as WireError, not a raw rejection", async () => {
  await withMockedFetch(
    async () => { throw new TypeError("Failed to fetch"); },
    async () => {
      await assert.rejects(pgrestSelect("documents?select=id", fakeSession("good-token")), (e: unknown) => {
        assert.ok(isWireError(e), "a network failure must classify as WireError");
        assert.ok(!isRefusalError(e));
        assert.match(e.message, /network request failed/);
        return true;
      });
    },
  );
});

test("pgrestRpc: fetch itself rejecting (network failure) surfaces as WireError", async () => {
  await withMockedFetch(
    async () => { throw new TypeError("network down"); },
    async () => {
      await assert.rejects(pgrestRpc("approve_entry", {}, fakeSession("good-token")), isWireError);
    },
  );
});

test("pgrestSelect: a 200 with a malformed (non-JSON) body surfaces as WireError, never a raw SyntaxError", async () => {
  await withMockedFetch(
    async () => new Response("not json at all {{{", { status: 200 }),
    async () => {
      await assert.rejects(pgrestSelect("documents?select=id", fakeSession("good-token")), (e: unknown) => {
        assert.ok(isWireError(e));
        assert.match(e.message, /malformed response body/);
        return true;
      });
    },
  );
});

test("pgrestRpc: a 200 with a malformed (non-JSON, non-empty) body surfaces as WireError — never silently swallowed to null", async () => {
  await withMockedFetch(
    async () => new Response("not json at all {{{", { status: 200 }),
    async () => {
      await assert.rejects(pgrestRpc("approve_entry", {}, fakeSession("good-token")), (e: unknown) => {
        assert.ok(isWireError(e));
        assert.match(e.message, /malformed response body/);
        return true;
      });
    },
  );
});

test("pgrestRpc: a 200 with a genuinely EMPTY body (a void governed function) resolves null, not an error", async () => {
  await withMockedFetch(
    async () => new Response("", { status: 200 }),
    async () => {
      const result = await pgrestRpc("void_verb", {}, fakeSession("good-token"));
      assert.equal(result, null);
    },
  );
});

// --- round-2 finding R1: a deliberate abort stays DISTINGUISHABLE from a real ---
// --- network failure — never fabricated into a WireError.                    ---

/** A fetch mock that never resolves on its own — it settles ONLY when the request
 *  is aborted (simulating an in-flight request cancelled before any response
 *  arrives, the superseded-request race `signal` exists for), rejecting with a
 *  real platform AbortError exactly as a genuine fetch implementation would. */
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

test("pgrestSelect: an aborted in-flight request stays a distinguishable AbortError, never a fabricated WireError", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    const promise = pgrestSelect("documents?select=id", fakeSession("good-token"), controller.signal);
    controller.abort();
    await assert.rejects(promise, (e: unknown) => {
      assert.ok(!isWireError(e), "an abort must NOT be fabricated into a WireError — it defeats cancellation detection");
      assert.ok(e instanceof Error);
      assert.equal((e as Error).name, "AbortError", "the platform's own error shape must survive unchanged");
      return true;
    });
  });
});

test("pgrestRpc: an aborted in-flight request stays a distinguishable AbortError, never a fabricated WireError", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    const promise = pgrestRpc("approve_entry", { entry_id: "e1" }, fakeSession("good-token"), controller.signal);
    controller.abort();
    await assert.rejects(promise, (e: unknown) => {
      assert.ok(!isWireError(e));
      assert.equal((e as Error).name, "AbortError");
      return true;
    });
  });
});

test("pgrestSelect: a request whose signal is ALREADY aborted before fetch is even reached also stays an AbortError", async () => {
  await withMockedFetch(abortableFetchMock(), async () => {
    const controller = new AbortController();
    controller.abort(); // aborted before the call even starts — the pre-flight race
    await assert.rejects(pgrestSelect("documents?select=id", fakeSession("good-token"), controller.signal), (e: unknown) => {
      assert.ok(!isWireError(e));
      assert.equal((e as Error).name, "AbortError");
      return true;
    });
  });
});
