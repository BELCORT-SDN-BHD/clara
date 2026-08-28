// Wire-shape tests for T2's item-level doors — exact verb name, exact
// argument names, a fresh op_key per call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { draftOpeningItem, recordOpeningTarget, recordOpeningKeyedResolution, supersedeOpeningItem, seedFixedAsset } from "./opening-item-doors";
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

test("draftOpeningItem: posts every field with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", item_id: "i1", entry_id: "e1", status: "draft" });
  const item = { item_kind: "gl_balance" as const, item_key: "cash-1000", amount_cents: null, counterparty_id: null, item_ref: null, item_date: null };
  const lines = [{ account_code: "1000", debit_cents: 500000, credit_cents: 0 }];
  await withMockedFetch(impl, async () => {
    await draftOpeningItem(fakeSession("tok"), { client: "c1", seed: "s1", item, lines, resolution: null, document: "doc1", sha256: "sha1" });
  });
  assert.match(calls[0]!.url, /\/rpc\/draft_opening_item$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.deepEqual(calls[0]!.body.p_item, item);
  assert.deepEqual(calls[0]!.body.p_lines, lines);
  assert.equal(calls[0]!.body.p_resolution, null);
  assert.equal(calls[0]!.body.p_document, "doc1");
  assert.equal(calls[0]!.body.p_sha256, "sha1");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("recordOpeningTarget: posts p_seed + p_line (nested) with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ target_id: "t1", seed_id: "s1", provenance_kind: "keyed" });
  await withMockedFetch(impl, async () => {
    await recordOpeningTarget(fakeSession("tok"), { seed: "s1", lineKey: "line-a", accountCode: "1000", sourceLabel: "Cash", debitCents: 123456, creditCents: 0 });
  });
  assert.match(calls[0]!.url, /\/rpc\/record_opening_target$/);
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.deepEqual(calls[0]!.body.p_line, { line_key: "line-a", account_code: "1000", source_label: "Cash", debit_cents: 123456, credit_cents: 0 });
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("recordOpeningKeyedResolution: a blank note posts p_evidence null; a real note wraps it under {note}", async () => {
  const { impl, calls } = captureFetch({ resolution_id: "r1" });
  await withMockedFetch(impl, async () => {
    await recordOpeningKeyedResolution(fakeSession("tok"), { client: "c1", seed: "s1", note: "  " });
    await recordOpeningKeyedResolution(fakeSession("tok"), { client: "c1", seed: "s1", note: "confirmed against the predecessor's signed TB" });
  });
  assert.match(calls[0]!.url, /\/rpc\/record_opening_keyed_resolution$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.equal(calls[0]!.body.p_evidence, null);
  assert.deepEqual(calls[1]!.body.p_evidence, { note: "confirmed against the predecessor's signed TB" });
  assert.notEqual(calls[0]!.body.p_op_key, calls[1]!.body.p_op_key);
});

test("supersedeOpeningItem: p_replacement is null for a reversal-only call, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", old_item_id: "i1", reversal_entry_id: "e2", status: "draft" });
  await withMockedFetch(impl, async () => {
    await supersedeOpeningItem(fakeSession("tok"), { item: "i1", replacement: null });
  });
  assert.match(calls[0]!.url, /\/rpc\/supersede_opening_item$/);
  assert.equal(calls[0]!.body.p_item, "i1");
  assert.equal(calls[0]!.body.p_replacement, null);
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("seedFixedAsset: posts p_asset wrapped as {asset:...} with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ seed_id: "s1", item_id: "i1", fixed_asset_id: "fa1", status: "draft" });
  const asset = {
    item_key: "van-1",
    description: "Delivery van",
    acquired_date: "2024-01-15",
    cost_cents: 8000000,
    accumulated_depreciation_cents: 1500000,
    residual_cents: 0,
    useful_life_months: 60,
    depreciation_method: "straight_line" as const,
    depreciation_rate_bps: null,
    depreciation_start_date: "2024-02-01",
    asset_account_code: "1500",
    accum_depr_account_code: "1510",
    depr_expense_account_code: "6200",
  };
  await withMockedFetch(impl, async () => {
    await seedFixedAsset(fakeSession("tok"), { client: "c1", seed: "s1", asset, resolution: null });
  });
  assert.match(calls[0]!.url, /\/rpc\/seed_fixed_asset$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_seed, "s1");
  assert.deepEqual(calls[0]!.body.p_asset, { asset });
  assert.equal(calls[0]!.body.p_resolution, null);
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("draftOpeningItem: a CLR31 tie_mismatch refusal surfaces verbatim as a DoorRefusal, never masked", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR31", message: "opening item must bind to the exact tie document", details: '{"reason":"tie_mismatch"}' }, 400),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      const item = { item_kind: "gl_balance" as const, item_key: "k1", amount_cents: null, counterparty_id: null, item_ref: null, item_date: null };
      await assert.rejects(
        draftOpeningItem(fakeSession("tok"), { client: "c1", seed: "s1", item, lines: [], resolution: null, document: "d1", sha256: "s" }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});
