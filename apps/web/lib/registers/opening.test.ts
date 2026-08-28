// Wire-shape tests for T2's reads + the one read-flavoured RPC
// (get_opening_dryrun — the 11th door named in this train's brief).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadOpeningSeeds,
  loadOpeningItems,
  loadOpeningTbTargets,
  loadOpeningEntryRevisions,
  loadOnboardingPlanRevision,
  loadOnboardingPlansForClient,
  loadOpeningKeyedResolution,
  buildEntryRevisionsMap,
  getOpeningDryrun,
} from "./opening";
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

test("loadOpeningSeeds: GETs opening_seed_registry filtered by client_id, ordered oldest-first", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([], 200); },
    async () => { await loadOpeningSeeds(fakeSession("tok"), "c1"); },
  );
  assert.match(seenUrl, /\/rest\/v1\/opening_seed_registry\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=created_at\.asc/);
});

test("loadOpeningItems: GETs opening_items filtered by seed_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([], 200); },
    async () => { await loadOpeningItems(fakeSession("tok"), "s1"); },
  );
  assert.match(seenUrl, /\/rest\/v1\/opening_items\?/);
  assert.match(seenUrl, /seed_id=eq\.s1/);
});

test("loadOpeningTbTargets: GETs opening_tb_targets filtered by seed_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([], 200); },
    async () => { await loadOpeningTbTargets(fakeSession("tok"), "s1"); },
  );
  assert.match(seenUrl, /\/rest\/v1\/opening_tb_targets\?/);
  assert.match(seenUrl, /seed_id=eq\.s1/);
});

test("loadOpeningEntryRevisions: empty id list short-circuits with NO fetch at all", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; return jsonResponse([], 200); },
    async () => { const rows = await loadOpeningEntryRevisions(fakeSession("tok"), []); assert.deepEqual(rows, []); },
  );
  assert.equal(called, false);
});

test("loadOpeningEntryRevisions: GETs journal_entries with an `in.(...)` id filter", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([{ id: "e1", revision_token: "r1", status: "draft", is_opening_balance: true, reversal_of: null }], 200); },
    async () => { await loadOpeningEntryRevisions(fakeSession("tok"), ["e1", "e2"]); },
  );
  assert.match(seenUrl, /\/rest\/v1\/journal_entries\?/);
  assert.match(seenUrl, /id=in\.%28e1%2Ce2%29|id=in\.\(e1,e2\)/);
});

test("buildEntryRevisionsMap: keys the map by entry id, value is the revision token", () => {
  const map = buildEntryRevisionsMap([
    { id: "e1", revision_token: "rev1", status: "draft", is_opening_balance: true, reversal_of: null },
    { id: "e2", revision_token: "rev2", status: "draft", is_opening_balance: true, reversal_of: null },
  ]);
  assert.deepEqual(map, { e1: "rev1", e2: "rev2" });
});

test("loadOnboardingPlanRevision: resolves the single row, or null when absent", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ id: "p1", revision_token: "rev1" }], 200),
    async () => { const row = await loadOnboardingPlanRevision(fakeSession("tok"), "p1"); assert.deepEqual(row, { id: "p1", revision_token: "rev1" }); },
  );
  await withMockedFetch(
    async () => jsonResponse([], 200),
    async () => { const row = await loadOnboardingPlanRevision(fakeSession("tok"), "p404"); assert.equal(row, null); },
  );
});

test("loadOnboardingPlansForClient: GETs onboarding_plans filtered by client_id + scope_kind=client", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([], 200); },
    async () => { await loadOnboardingPlansForClient(fakeSession("tok"), "c1"); },
  );
  assert.match(seenUrl, /\/rest\/v1\/onboarding_plans\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /scope_kind=eq\.client/);
});

test("loadOpeningKeyedResolution: GETs client_resolutions bound to this seed, live only", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([{ id: "r1" }], 200); },
    async () => { const row = await loadOpeningKeyedResolution(fakeSession("tok"), "s1"); assert.deepEqual(row, { id: "r1" }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/client_resolutions\?/);
  assert.match(seenUrl, /bound_scope_kind=eq\.opening_seed/);
  assert.match(seenUrl, /bound_scope_id=eq\.s1/);
  assert.match(seenUrl, /superseded_at=is\.null/);
});

test("getOpeningDryrun: POSTs /rpc/get_opening_dryrun with p_seed, resolves the envelope verbatim (constraint 2 — no client arithmetic)", async () => {
  const dryrun = {
    seed_id: "s1", client_id: "c1", as_of: "2026-01-01", state: "open",
    obe_net_cents: 4321,
    deltas: [{ account_code: "1000", target_debit: 500000, target_credit: 0, actual_debit: 495679, actual_credit: 0, delta_debit: -4321, delta_credit: 0 }],
    unmapped_labels: [], missing_must_asks: [],
  };
  let seenUrl = "";
  let seenBody: unknown;
  let resolved: unknown;
  await withMockedFetch(
    async (url, init) => { seenUrl = String(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(dryrun, 200); },
    async () => { resolved = await getOpeningDryrun(fakeSession("tok"), "s1"); },
  );
  assert.match(seenUrl, /\/rpc\/get_opening_dryrun$/);
  assert.deepEqual(seenBody, { p_seed: "s1" });
  assert.deepEqual(resolved, dryrun);
});
