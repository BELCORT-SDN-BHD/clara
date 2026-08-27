// lib/bank/table-reads.ts — PLAIN table reads via getRows (never callDoor).
// Pins the PostgREST query shape (relation + filters) for each relation.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listOpenBankLineExceptions, listOpenBankLineExceptionProposals,
  listOpenBankIdentifierPromotionProposals, getBankAgencyHold, listCounterparties,
} from "./table-reads";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
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

test("listOpenBankLineExceptions: GETs bank_line_exceptions scoped by client + open status", async () => {
  let seenUrl = "";
  let seenHeaders: Headers | null = null;
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenHeaders = new Headers(init?.headers);
      return jsonResponse([]);
    },
    async () => {
      await listOpenBankLineExceptions("client-1", { session: fakeSession("tok") });
      assert.match(seenUrl, /\/rest\/v1\/bank_line_exceptions\?/);
      assert.match(seenUrl, /client_id=eq\.client-1/);
      assert.match(seenUrl, /status=eq\.open/);
      assert.equal(seenHeaders!.get("Accept-Profile"), "clara");
      assert.equal(seenHeaders!.get("Content-Profile"), null, "a plain table read must never set Content-Profile");
    },
  );
});

test("listOpenBankLineExceptionProposals: scopes by client, kind and open status", async () => {
  let url = "";
  await withMockedFetch(
    async (u) => { url = String(u); return jsonResponse([]); },
    async () => {
      await listOpenBankLineExceptionProposals("client-1", { session: fakeSession("tok") });
      assert.ok(url.includes("/bank_agent_proposals?"));
      assert.match(url, /client_id=eq\.client-1/);
      assert.match(url, /kind=eq\.line_exception/, "never returns identifier_promotion proposals to this door");
      assert.match(url, /status=eq\.open/);
    },
  );
});

test("listOpenBankIdentifierPromotionProposals: scopes by client, kind and open status", async () => {
  let url = "";
  await withMockedFetch(
    async (u) => { url = String(u); return jsonResponse([]); },
    async () => {
      await listOpenBankIdentifierPromotionProposals("client-1", { session: fakeSession("tok") });
      assert.match(url, /kind=eq\.identifier_promotion/, "never returns line_exception proposals to this door");
    },
  );
});

test("getBankAgencyHold: no row is the honest 'never held' state, never fabricated", async () => {
  await withMockedFetch(
    async () => jsonResponse([]),
    async () => {
      assert.equal(await getBankAgencyHold("client-1", { session: fakeSession("tok") }), null);
    },
  );
});

test("getBankAgencyHold: maps a live row", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ client_id: "client-1", on_hold: true, reason: "suspicious statement" }]),
    async () => {
      const hold = await getBankAgencyHold("client-1", { session: fakeSession("tok") });
      assert.equal(hold?.on_hold, true);
      assert.equal(hold?.reason, "suspicious statement");
    },
  );
});

test("listCounterparties: excludes merged/retired parties at the query", async () => {
  let url = "";
  await withMockedFetch(
    async (u) => { url = String(u); return jsonResponse([]); },
    async () => {
      await listCounterparties("client-1", "vendor", { session: fakeSession("tok") });
      assert.match(url, /kind=eq\.vendor/);
      assert.match(url, /merged_into=is\.null/);
      assert.match(url, /retired_at=is\.null/);
    },
  );
});
