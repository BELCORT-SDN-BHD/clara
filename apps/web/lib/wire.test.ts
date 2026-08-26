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
  classifyPgrestFailure,
  pgrestSelect,
  pgrestRpc,
  RefusalError,
  WireError,
} from "./wire";
import type { SessionTokenAccessor } from "./session-contract";

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

// --- pgrestSelect / pgrestRpc with a mocked fetch: the same ordering end to end --

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
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
