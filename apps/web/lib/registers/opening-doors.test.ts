// Wire-shape tests for T2's seed-lifecycle doors — exact verb name, exact
// argument names, a fresh op_key per call (never reused across a retry).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpeningSeed, approveOpeningSeed, approveOpeningCorrection, cancelOpeningSeed, reopenOpeningSeed } from "./opening-doors";
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

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("createOpeningSeed: posts /rpc/create_opening_seed with every field + a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "open" });
  await withMockedFetch(impl, async () => {
    await createOpeningSeed(fakeSession("tok"), { client: "c1", plan: "p1", asOf: "2026-01-01", tieDocumentId: null, tieSha256: null });
  });
  assert.match(calls[0]!.url, /\/rpc\/create_opening_seed$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_plan, "p1");
  assert.equal(calls[0]!.body.p_as_of, "2026-01-01");
  assert.equal(calls[0]!.body.p_tie_document, null);
  assert.equal(calls[0]!.body.p_tie_sha256, null);
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("createOpeningSeed: two calls mint two DISTINCT op_keys — never reused across calls", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "open" });
  await withMockedFetch(impl, async () => {
    await createOpeningSeed(fakeSession("tok"), { client: "c1", plan: "p1", asOf: "2026-01-01", tieDocumentId: null, tieSha256: null });
    await createOpeningSeed(fakeSession("tok"), { client: "c1", plan: "p1", asOf: "2026-01-01", tieDocumentId: null, tieSha256: null });
  });
  assert.notEqual(calls[0]!.body.p_op_key, calls[1]!.body.p_op_key);
});

test("approveOpeningSeed: posts every field with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "finalized" });
  await withMockedFetch(impl, async () => {
    await approveOpeningSeed(fakeSession("tok"), {
      seed: "s1",
      expectedPlanRevision: "rev1",
      tieDocumentSha256: "sha",
      entryRevisions: { e1: "rev-e1" },
      attestation: "solo approval",
    });
  });
  assert.match(calls[0]!.url, /\/rpc\/approve_opening_seed$/);
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.equal(calls[0]!.body.p_expected_plan_revision, "rev1");
  assert.equal(calls[0]!.body.p_tie_document_sha256, "sha");
  assert.deepEqual(calls[0]!.body.p_entry_revisions, { e1: "rev-e1" });
  assert.equal(calls[0]!.body.p_attestation, "solo approval");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("approveOpeningSeed: an empty attestation string is sent as null, never the empty string", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "finalized" });
  await withMockedFetch(impl, async () => {
    await approveOpeningSeed(fakeSession("tok"), { seed: "s1", expectedPlanRevision: "rev1", tieDocumentSha256: null, entryRevisions: {}, attestation: "" });
  });
  assert.equal(calls[0]!.body.p_attestation, null);
});

test("approveOpeningCorrection: posts every field with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "finalized" });
  await withMockedFetch(impl, async () => {
    await approveOpeningCorrection(fakeSession("tok"), { seed: "s1", entryRevisions: { e2: "rev-e2" }, attestation: "" });
  });
  assert.match(calls[0]!.url, /\/rpc\/approve_opening_correction$/);
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.deepEqual(calls[0]!.body.p_entry_revisions, { e2: "rev-e2" });
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("cancelOpeningSeed: posts p_seed + p_reason with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "cancelled" });
  await withMockedFetch(impl, async () => {
    await cancelOpeningSeed(fakeSession("tok"), { seed: "s1", reason: "duplicate seed opened by mistake" });
  });
  assert.match(calls[0]!.url, /\/rpc\/cancel_opening_seed$/);
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.equal(calls[0]!.body.p_reason, "duplicate seed opened by mistake");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("reopenOpeningSeed: posts p_seed + p_reason with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", status: "open", next_batch_n: 2 });
  await withMockedFetch(impl, async () => {
    await reopenOpeningSeed(fakeSession("tok"), { seed: "s1", reason: "client sent a corrected TB" });
  });
  assert.match(calls[0]!.url, /\/rpc\/reopen_opening_seed$/);
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.equal(calls[0]!.body.p_reason, "client sent a corrected TB");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("cancelOpeningSeed: a CLR31 refusal surfaces as a DoorRefusal verbatim, never masked", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({ code: "CLR31", message: "only an empty open seed may be cancelled", details: '{"reason":"registry_not_open"}' }, 400),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(cancelOpeningSeed(fakeSession("tok"), { seed: "s1", reason: "x" }), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        return true;
      });
    },
  );
});
