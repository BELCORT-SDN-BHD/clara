// openingApi tests (0018 dashboard rider, §5). Mocks globalThis.fetch — the
// seedingApi.test.ts idiom — no live DB (the 0018 fns targeted here do not exist yet
// anywhere; every call is exercised at the rpc/PostgREST wire layer only). Locks:
//   - rpcSerializableOnce (exercised via approveOpeningSeed/approveOpeningCorrection)
//     returns the DB body on first success AND on the 40001-retry, reusing the SAME
//     op_key on both calls (F10).
//   - the runtime-validated ApprovalReceipt: entry_count is DB-authored, never a
//     client-computed count — a body missing it is NOT a receipt (throws).
//   - recordKeyedClientResolution calls the bound mint verb with no p_confidence arg
//     (confidence is pinned 1.0 server-side).
//   - getKeyedSeedResolution's scope-bound read-back filter (never id alone).
//   - seedFixedAsset omits p_resolution on a tied seed, sends it on a keyed seed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approveOpeningSeed, approveOpeningCorrection, recordKeyedClientResolution,
  getKeyedSeedResolution, seedFixedAsset,
} from "./openingApi";
import type { PgrestError } from "./wire";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fullReceipt(over: Record<string, unknown> = {}) {
  return { seed_id: "seed-1", status: "finalized", batch_n: 1, entry_count: 2, entries: ["e1", "e2"], ...over };
}

// --- rpcSerializableOnce (via approveOpeningSeed): first-success + 40001-retry bodies ---

test("approveOpeningSeed returns the DB body as a validated ApprovalReceipt on first success", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes(fullReceipt());
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const receipt = await approveOpeningSeed("jwt", {
    seedId: "seed-1", expectedPlanRevision: "rev1", tieSha256: null, entryRevisions: { e1: "r1" }, attestation: null,
  });
  assert.deepEqual(receipt, fullReceipt());
  assert.equal(bodies.length, 1, "no retry on a clean success");
});

test("approveOpeningSeed retries ONCE on a 40001 with the SAME op_key and returns the retry's body (F10)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  let call = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    call += 1;
    bodies.push(JSON.parse(String(init?.body)));
    if (call === 1) return jsonRes({ code: "40001", message: "could not serialize access due to concurrent update" }, 400);
    return jsonRes(fullReceipt({ batch_n: 2 }));
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const receipt = await approveOpeningSeed("jwt", {
    seedId: "seed-1", expectedPlanRevision: "rev1", tieSha256: null, entryRevisions: { e1: "r1" }, attestation: null,
  });
  assert.equal(bodies.length, 2, "exactly one retry");
  assert.equal(bodies[0]?.p_op_key, bodies[1]?.p_op_key, "the retry reuses the SAME op_key — idempotent replay");
  assert.equal(receipt.batch_n, 2, "the RETRY's body is what the caller receives, not the failed first attempt");
});

test("approveOpeningCorrection throws when the DB body is missing entry_count (never client-computed)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ seed_id: "seed-1", status: "finalized", batch_n: 1, entries: ["e1"] }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(() => approveOpeningCorrection("jwt", { seedId: "seed-1", entryRevisions: { e1: "r1" }, attestation: null }));
});

test("approveOpeningCorrection propagates a non-40001 refusal untouched (no retry, no fabricated receipt)", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonRes({ code: "CLR31", message: "a draft changed under you", details: '{"reason":"revision_mismatch"}' }, 400);
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(
    () => approveOpeningCorrection("jwt", { seedId: "seed-1", entryRevisions: {}, attestation: null }),
    (e: PgrestError) => {
      assert.equal(e.clr, "CLR31");
      assert.equal(e.reason, "revision_mismatch");
      return true;
    },
  );
  assert.equal(calls, 1, "a non-40001 refusal never retries");
});

// --- recordKeyedClientResolution: the bound mint verb, no client confidence -------

test("recordKeyedClientResolution calls the bound mint verb with client/seed/evidence — no p_confidence", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ resolution_id: "res-1" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const id = await recordKeyedClientResolution("jwt", "client-1", "seed-1");
  assert.equal(id, "res-1");
  assert.ok(seenUrl.includes("/rpc/record_opening_keyed_resolution"));
  assert.equal(bodies[0]?.p_client, "client-1");
  assert.equal(bodies[0]?.p_seed, "seed-1");
  assert.ok(!("p_confidence" in (bodies[0] ?? {})), "confidence is pinned 1.0 server-side — never a caller arg");
  assert.ok(!("p_method" in (bodies[0] ?? {})), "method is pinned 'human' server-side — never a caller arg");
  assert.ok(typeof bodies[0]?.p_op_key === "string" && (bodies[0]?.p_op_key as string).length > 0);
});

test("recordKeyedClientResolution throws when the mint returns no resolution_id", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({}));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(() => recordKeyedClientResolution("jwt", "client-1", "seed-1"));
});

// --- getKeyedSeedResolution: the scope-bound read-back (never id alone) -----------

test("getKeyedSeedResolution filters bound_scope_kind/id PLUS the live/method/confidence eligibility", async (t) => {
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string) => {
    seenUrl = u;
    return jsonRes([{ id: "res-1" }]);
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const id = await getKeyedSeedResolution("jwt", "seed-1");
  assert.equal(id, "res-1");
  assert.ok(seenUrl.includes("bound_scope_kind=eq.opening_seed"), "binds on scope kind");
  assert.ok(seenUrl.includes("bound_scope_id=eq.seed-1"), "binds on THIS seed, not any bound row");
  assert.ok(seenUrl.includes("superseded_at=is.null"), "the live filter");
  assert.ok(/method=/.test(seenUrl), "the method eligibility filter");
  assert.ok(/confidence=gte\.0\.95/.test(seenUrl), "the confidence eligibility filter");
});

test("getKeyedSeedResolution returns null when no eligible bound row exists", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  assert.equal(await getKeyedSeedResolution("jwt", "seed-1"), null);
});

// --- seedFixedAsset: p_resolution only on keyed seeds, omitted on tied ------------

test("seedFixedAsset omits p_resolution when null (a tied seed — the DB derives it from the locked filing)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ item_id: "i1", entry_id: "e1", fixed_asset_id: "fa1" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await seedFixedAsset("jwt", "client-1", "seed-1", { item_key: "fa-1" }, null);
  assert.ok(!("p_resolution" in (bodies[0] ?? {})), "omitted entirely on a tied seed");
});

test("seedFixedAsset sends p_resolution when supplied (a keyed seed's bound attribution)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ item_id: "i1", entry_id: "e1", fixed_asset_id: null });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await seedFixedAsset("jwt", "client-1", "seed-1", { item_key: "fa-1" }, "res-9");
  assert.equal(bodies[0]?.p_resolution, "res-9");
});
