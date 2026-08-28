import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCounterparty, setCounterpartyTerms, addCounterpartyAlias, retireCounterpartyAlias,
  renameCounterparty, mergeCounterparties, applyOpenItems, unallocateGroup,
} from "./counterparty-doors";
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

async function captureCall(
  session: SessionTokenAccessor,
  urlPattern: RegExp,
  responseBody: unknown,
  fire: () => Promise<unknown>,
): Promise<{ url: string; body: Record<string, unknown> }> {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(responseBody, 200);
    },
    async () => {
      await fire();
    },
  );
  assert.match(seenUrl, urlPattern);
  return { url: seenUrl, body: seenBody };
}

test("createCounterparty: POSTs /rpc/create_counterparty with p_client/p_kind/p_name/p_registration_no/p_tin/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/create_counterparty$/,
    { counterparty_id: "cp1", created: true },
    () => createCounterparty("c1", "vendor", "Acme", "123456-A", "T1234", { session: fakeSession("tok") }),
  );
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_kind, "vendor");
  assert.equal(body.p_name, "Acme");
  assert.equal(body.p_registration_no, "123456-A");
  assert.equal(body.p_tin, "T1234");
  assert.equal(typeof body.p_op_key, "string");
});

test("setCounterpartyTerms: POSTs /rpc/set_counterparty_terms with p_counterparty/p_days/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/set_counterparty_terms$/,
    { counterparty_id: "cp1", payment_terms_days: 30 },
    () => setCounterpartyTerms("cp1", 30, { session: fakeSession("tok") }),
  );
  assert.deepEqual({ p_counterparty: body.p_counterparty, p_days: body.p_days }, { p_counterparty: "cp1", p_days: 30 });
});

test("addCounterpartyAlias: POSTs /rpc/add_counterparty_alias with p_client/p_counterparty/p_alias/p_origin/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/add_counterparty_alias$/,
    { alias_id: "al1", counterparty_id: "cp1" },
    () => addCounterpartyAlias("c1", "cp1", "Acme Trading", "trade_name", { session: fakeSession("tok") }),
  );
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_counterparty, "cp1");
  assert.equal(body.p_alias, "Acme Trading");
  assert.equal(body.p_origin, "trade_name");
});

test("retireCounterpartyAlias: POSTs /rpc/retire_counterparty_alias with p_client/p_alias/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/retire_counterparty_alias$/,
    { alias_id: "al1", status: "retired" },
    () => retireCounterpartyAlias("c1", "al1", { session: fakeSession("tok") }),
  );
  assert.deepEqual({ p_client: body.p_client, p_alias: body.p_alias }, { p_client: "c1", p_alias: "al1" });
});

test("renameCounterparty: POSTs /rpc/rename_counterparty with p_client/p_counterparty/p_new_name/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/rename_counterparty$/,
    { counterparty_id: "cp1", name: "Acme Holdings" },
    () => renameCounterparty("c1", "cp1", "Acme Holdings", { session: fakeSession("tok") }),
  );
  assert.equal(body.p_new_name, "Acme Holdings");
});

test("mergeCounterparties: POSTs /rpc/merge_counterparties with p_client/p_survivor/p_merged/p_reason/p_op_key — the ONE governed call", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/merge_counterparties$/,
    { survivor_id: "s1", merged_id: "m1", reissued_rule_id: null, reissued_autopost_rule_id: null },
    () => mergeCounterparties("c1", "s1", "m1", "duplicate party", { session: fakeSession("tok") }),
  );
  assert.equal(body.p_survivor, "s1");
  assert.equal(body.p_merged, "m1");
  assert.equal(body.p_reason, "duplicate party");
});

test("applyOpenItems: POSTs /rpc/apply_open_items with p_client/p_applications (source_item_id/target_item_id/amount_cents)/p_reason/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/apply_open_items$/,
    { group_id: "g1", domain: "ar", applied_cents: 500 },
    () => applyOpenItems("c1", [{ sourceItemId: "src1", targetItemId: "tgt1", amountCents: 500 }], "credit note applied", { session: fakeSession("tok") }),
  );
  assert.deepEqual(body.p_applications, [{ source_item_id: "src1", target_item_id: "tgt1", amount_cents: 500 }]);
  assert.equal(body.p_reason, "credit note applied");
});

test("unallocateGroup: POSTs /rpc/unallocate_group with p_client/p_group/p_reason/p_op_key", async () => {
  const { body } = await captureCall(
    fakeSession("tok"),
    /\/rpc\/unallocate_group$/,
    { group_id: "g2", reversed_group: "g1", allocations: 2 },
    () => unallocateGroup("c1", "g1", "applied to the wrong invoice", { session: fakeSession("tok") }),
  );
  assert.equal(body.p_group, "g1");
  assert.equal(body.p_reason, "applied to the wrong invoice");
});

test("every T8 write mints a FRESH op_key per call — never reused across two calls to the same door", async () => {
  const seen: string[] = [];
  await withMockedFetch(
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      seen.push(body.p_op_key);
      return jsonResponse({ counterparty_id: "cp1", payment_terms_days: 30 }, 200);
    },
    async () => {
      await setCounterpartyTerms("cp1", 30, { session: fakeSession("tok") });
      await setCounterpartyTerms("cp1", 45, { session: fakeSession("tok") });
    },
  );
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
});
