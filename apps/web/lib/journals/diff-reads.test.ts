// diff-reads.ts — wire-shape pinning for the two entry-diff read RPCs
// (mocked-fetch style, lib/journals/api.test.ts's own precedent).

import { test } from "node:test";
import assert from "node:assert/strict";
import { getEntryDiff, getDocEntryDiff } from "./diff-reads";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
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

function rpcName(url: RequestInfo | URL): string {
  return String(url).split("/rpc/")[1] ?? "";
}

const ENTRY_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const CLIENT_ID = "bbbbbbbb-0000-0000-0000-000000000002";

test("getEntryDiff: posts get_entry_diff with p_entry/p_client and returns the envelope verbatim", async () => {
  let seenFn = ""; let seenBody: unknown;
  const envelope = { entry_id: ENTRY_ID, revisions: [{ revision_no: 1, actor_kind: "human", actor: "u1", reason: null, created_at: "2026-04-01T00:00:00Z", header: {}, legs: [], rule_decision_id: null, deltas_vs_prev: [] }] };
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(envelope); },
    async () => {
      const out = await getEntryDiff(ENTRY_ID, CLIENT_ID, { session: fakeSession() });
      assert.deepEqual(out, envelope);
    },
  );
  assert.equal(seenFn, "get_entry_diff");
  assert.deepEqual(seenBody, { p_entry: ENTRY_ID, p_client: CLIENT_ID });
});

test("getDocEntryDiff: posts get_doc_entry_diff and returns null verbatim (no source document) rather than throwing", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return jsonResponse(null); },
    async () => {
      const out = await getDocEntryDiff(ENTRY_ID, CLIENT_ID, { session: fakeSession() });
      assert.equal(out, null);
    },
  );
  assert.equal(seenFn, "get_doc_entry_diff");
});

test("getDocEntryDiff: returns the fields envelope verbatim when present", async () => {
  const envelope = {
    entry_id: ENTRY_ID, document_id: "doc-1",
    fields: [{ field: "invoice.total", doc_value: "10000", doc_region_id: "r1", doc_page: "1", doc_region_locator_kind: "page_polygon", doc_region_locator: {}, entry_value: "10000", delta_cents: 0, no_region: false }],
  };
  await withMockedFetch(
    async () => jsonResponse(envelope),
    async () => {
      const out = await getDocEntryDiff(ENTRY_ID, CLIENT_ID, { session: fakeSession() });
      assert.deepEqual(out, envelope);
    },
  );
});
