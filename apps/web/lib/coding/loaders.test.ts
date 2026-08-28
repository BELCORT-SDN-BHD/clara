// lib/coding/loaders.ts — the uncoded-filings/lanes join. Mocked-fetch style,
// documents/loaders.test.ts's own precedent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadUncodedFilingsWithLanes } from "./loaders";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
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
function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("loadUncodedFilingsWithLanes: joins list_uncoded_filings with list_coding_lanes by filing_id", async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).includes("/rpc/list_uncoded_filings")) {
        return okJson([{ filing_id: "f1", document_id: "d1", client_id: "c1", filed_at: "2026-04-01T00:00:00Z", basis: "human", document_kind: "invoice", financial_date: null, original_filename: "x.pdf", mime_type: "application/pdf", extraction_status: "done" }]);
      }
      return okJson([{ filing_id: "f1", lane: "needs_you", reasons: ["vendor_ambiguous"] }, { filing_id: "f2", lane: "ready", reasons: [] }]);
    },
    async () => {
      const out = await loadUncodedFilingsWithLanes("c1", { session: session() });
      assert.equal(out.length, 1);
      const [entry] = out;
      assert.ok(entry);
      assert.equal(entry.filing_id, "f1");
      assert.equal(entry.lane, "needs_you");
      assert.deepEqual(entry.reasons, ["vendor_ambiguous"]);
    },
  );
});

test("loadUncodedFilingsWithLanes: a filing missing from list_coding_lanes still renders (needs_review, no reasons), never dropped", async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).includes("/rpc/list_uncoded_filings")) {
        return okJson([{ filing_id: "f9", document_id: "d9", client_id: "c1", filed_at: "2026-04-01T00:00:00Z", basis: "human", document_kind: null, financial_date: null, original_filename: null, mime_type: null, extraction_status: "pending" }]);
      }
      return okJson([]);
    },
    async () => {
      const out = await loadUncodedFilingsWithLanes("c1", { session: session() });
      assert.equal(out.length, 1);
      const [entry] = out;
      assert.ok(entry);
      assert.equal(entry.lane, "needs_review");
      assert.deepEqual(entry.reasons, []);
    },
  );
});
