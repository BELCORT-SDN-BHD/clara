// lib/firm/reads.ts — the firm activity feed, client register, and its
// entity_type/msic enrichment read. Mocked-fetch style ported from
// ../read.test.ts's own precedent: the property under test is that each loader
// names the right relation/select/filter/order, not a re-derivation of
// getRows's own already-tested CLR/status classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFirmActivity, loadClientRegister, loadClientRegisterFacts, loadClientById } from "./reads";
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

test("loadFirmActivity: reads agent_receipts_visible, newest first, the 19-column contract", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadFirmActivity(fakeSession("tok"));
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/agent_receipts_visible\?/);
  assert.match(seenUrl, /select=receipt_kind%2Creceipt_id/);
  assert.match(seenUrl, /order=occurred_at\.desc/);
  assert.match(seenUrl, /limit=100/);
});

test("loadClientRegister: reads clients, ordered by name, no client_id filter (RLS floors it)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([{ id: "c1", name: "Acme", status: "active", created_at: "2026-01-01" }], 200);
    },
    async () => {
      const rows = await loadClientRegister(fakeSession("tok"));
      assert.deepEqual(rows, [{ id: "c1", name: "Acme", status: "active", created_at: "2026-01-01" }]);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/clients\?/);
  assert.match(seenUrl, /select=id%2Cname%2Cstatus%2Ccreated_at/);
  assert.match(seenUrl, /order=name\.asc/);
});

test("loadClientRegisterFacts: filters to entity_type/msic, unsuperseded only", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadClientRegisterFacts(fakeSession("tok"));
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/client_facts\?/);
  assert.match(seenUrl, /fact_key=in\.%28entity_type%2Cmsic%29/);
  assert.match(seenUrl, /superseded_at=is\.null/);
});

// #614 — well-formed-but-unrelated uuids, deliberately: the cells below are
// about the WIRE round trip (filter shape, empty-result honesty), not about
// the shape gate itself (that is lib/client-id.test.ts's job and the
// dedicated "malformed id" cell further down).
const WELL_FORMED_ID = "22222222-2222-4222-8222-222222222222";
const WELL_FORMED_UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

test("loadClientById: filters by id, resolves the first row", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([{ id: WELL_FORMED_ID, name: "Acme", status: "active", created_at: "2026-01-01" }], 200);
    },
    async () => {
      const row = await loadClientById(fakeSession("tok"), WELL_FORMED_ID);
      assert.deepEqual(row, { id: WELL_FORMED_ID, name: "Acme", status: "active", created_at: "2026-01-01" });
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/clients\?/);
  assert.match(seenUrl, new RegExp(`id=eq\\.${WELL_FORMED_ID}`));
});

test("loadClientById: an empty result (RLS admits no such row) resolves null, never throws", async () => {
  await withMockedFetch(
    async () => jsonResponse([], 200),
    async () => {
      const row = await loadClientById(fakeSession("tok"), WELL_FORMED_UNKNOWN_ID);
      assert.equal(row, null);
    },
  );
});

test("loadClientById: a MALFORMED id resolves null WITHOUT issuing a request (#614)", async () => {
  // Real PostgREST answers a non-uuid `id=eq.<value>` filter with HTTP 400
  // `22P02` — a throw the old code let escape past `notFound()`. If this ever
  // regressed to sending the request, the fetch below would flip `called` to
  // true rather than the assertion ever failing on a body it returned.
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      return jsonResponse({ code: "22P02", message: 'invalid input syntax for type uuid: "not-a-client"' }, 400);
    },
    async () => {
      const row = await loadClientById(fakeSession("tok"), "not-a-client");
      assert.equal(row, null);
    },
  );
  assert.equal(called, false, "a malformed id must never reach fetch");
});

test("loadFirmActivity: a 403 (RLS/grant refusal) propagates as a typed ReadError, never masked", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "permission denied for table agent_receipts_visible" }, 403),
    async () => {
      const { isReadError } = await import("../read");
      await assert.rejects(loadFirmActivity(fakeSession("tok")), (e: unknown) => {
        assert.ok(isReadError(e));
        return true;
      });
    },
  );
});
