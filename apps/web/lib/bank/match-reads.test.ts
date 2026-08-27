// lib/bank/match-reads.ts — matching workbench READS (transport via
// callDoor). Pins wire shape only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listOpenItemsByCounterparty, listBankMatchCandidates, listUnmatchedLines } from "./match-reads";
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

test("listOpenItemsByCounterparty: posts p_client/p_domain/p_counterparty", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([{ id: "oi1", domain: "ar", counterparty_id: "cp1", amount_cents: 10000 }]);
    },
    async () => {
      const rows = await listOpenItemsByCounterparty("c1", "ar", "cp1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/list_open_items_by_counterparty"));
      assert.deepEqual(seenBody, { p_client: "c1", p_domain: "ar", p_counterparty: "cp1" });
      assert.equal(rows[0]?.domain, "ar");
    },
  );
});

test("listBankMatchCandidates: posts p_client/p_bank_account and maps rows", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => {
      seenUrl = String(u);
      return jsonResponse([{ entry_id: "e1", high_stakes: true }]);
    },
    async () => {
      const rows = await listBankMatchCandidates("c1", "acc1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/list_bank_match_candidates"));
      assert.equal(rows[0]?.entry_id, "e1");
      assert.equal(rows[0]?.high_stakes, true);
    },
  );
});

test("listUnmatchedLines: posts p_client and degrades a non-array reply to []", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => {
      seenUrl = String(u);
      return jsonResponse(null);
    },
    async () => {
      const rows = await listUnmatchedLines("c1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/list_unmatched_lines"));
      assert.deepEqual(rows, []);
    },
  );
});
