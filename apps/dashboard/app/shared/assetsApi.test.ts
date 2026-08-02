// shared/assetsApi.ts tests — mocks globalThis.fetch (the agingApi.test.ts /
// bankApi.test.ts idiom). Fixtures are copied LITERALLY from the ORCHESTRATOR-
// PINNED envelope key sets in 0041-interface-contract.md §3 (migration 0041 is
// still-to-merge as this file is written) — not guessed shapes — so a shipped-
// migration drift from the pin sheet fails a test here first.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listFixedAssets, getFixedAsset, listDepreciationRuns, getDepreciationRun,
  getDepreciationAuthority, faRegisterTie,
  upsertFaAccountProfile, retireFaAccountProfile, completeFixedAssetParticulars, reviseFixedAssetParticulars,
  proposeDepreciationAuthority, signDepreciationAuthority, retireDepreciationAuthority,
  runDepreciationManual, disposeFixedAsset, setClientFyEnd,
} from "./assetsApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// The pin-sheet §3 list_fixed_assets(client) envelope, literal.
const LIST_ENVELOPE = {
  client_id: "client-1", as_of: "2026-08-01", incomplete_count: 1,
  assets: [{
    id: "asset-1", description: "Toyota Hilux 2024", status: "active", particulars_complete: true,
    acquired_date: "2026-01-15", effective_from: null, superseded_at: null,
    cost_cents: 15000000, residual_cents: 100000, accumulated_cents: 2500000, nbv_cents: 12400000,
    method: "straight_line", rate_bps: null, useful_life_months: 60, start_date: "2026-01-15",
    asset_account: "170-000", accum_account: "170-100", expense_account: "620-500",
    ca_class: null, is_commercial_vehicle: true, is_new: true,
    superseded_by_asset_id: null, disposed_at: null, disposal_entry_id: null, uncharged_due_count: 0,
  }],
};

// The pin-sheet §3 get_fixed_asset(asset) envelope, literal.
const GET_ENVELOPE = {
  asset: LIST_ENVELOPE.assets[0],
  lineage: [],
  charges: [{ id: "ch1", period_start: "2026-01-01", period_end: "2026-01-31", amount_cents: 25000, effective_date: "2026-01-31", entry_id: "e1", run_id: "r1", unwind_of: null }],
  schedule: [{ period_start: "2026-02-01", period_end: "2026-02-28", projected_cents: 25000 }],
  uncharged_due: ["2026-02"],
};

const RUN = {
  id: "run-1", authority_id: "auth-1", period_start: "2026-01-01", period_end: "2026-01-31",
  mode: "post", entries: 3, charged_cents: 75000, skipped: [], entry_id: "e1", created_at: "2026-02-01T00:00:00Z",
};

const AUTHORITY_ENVELOPE = {
  authority: { id: "auth-1", status: "live", cadence: "monthly", proposed_by: "u1", signed_by: "u2", retired_by: null, created_at: "2026-01-01T00:00:00Z" },
  ramp_earned: true,
  fy_end: { month: 12, day: 31, fallback: true },
  high_stakes_threshold_cents: 10000000,
};

const TIE_ENVELOPE = {
  as_of: "2026-08-01", tie: true, incomplete_count: 0,
  accounts: [{
    asset_account: "170-000", accum_account: "170-100",
    register_cost_cents: 15000000, gl_cost_cents: 15000000, cost_diff_cents: 0,
    register_accum_cents: 2500000, gl_accum_cents: 2500000, accum_diff_cents: 0,
  }],
};

// --- reads -------------------------------------------------------------------

test("listFixedAssets posts p_client to list_fixed_assets and unwraps the literal envelope", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(LIST_ENVELOPE);
  });
  setup();
  const read = await listFixedAssets("jwt", "client-1");
  assert.ok(seenUrl.includes("/rpc/list_fixed_assets"));
  assert.equal(seenBody.p_client, "client-1");
  assert.equal(read.available, true);
  assert.equal(read.assets[0]?.description, "Toyota Hilux 2024");
  assert.equal(read.incomplete_count, 1);
});

test("getFixedAsset posts p_asset to get_fixed_asset and unwraps asset/lineage/charges/schedule/uncharged_due", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(GET_ENVELOPE);
  });
  setup();
  const read = await getFixedAsset("jwt", "asset-1");
  assert.ok(seenUrl.includes("/rpc/get_fixed_asset"));
  assert.equal(seenBody.p_asset, "asset-1");
  assert.equal(read.asset?.id, "asset-1");
  assert.equal(read.charges[0]?.amount_cents, 25000);
  assert.deepEqual(read.uncharged_due, ["2026-02"]);
});

test("listDepreciationRuns posts p_client; getDepreciationRun (★ orchestrator-pinned) posts p_run", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ runs: [RUN] }));
  setup();
  const list = await listDepreciationRuns("jwt", "client-1");
  assert.equal(list.runs[0]?.charged_cents, 75000);

  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ run: RUN });
  });
  const single = await getDepreciationRun("jwt", "run-1");
  assert.ok(seenUrl.includes("/rpc/get_depreciation_run"));
  assert.equal(seenBody.p_run, "run-1");
  assert.equal(single.run?.id, "run-1");
});

test("getDepreciationAuthority unwraps authority/ramp_earned/fy_end/high_stakes_threshold_cents, and the Dec-31 fallback SURFACES", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(AUTHORITY_ENVELOPE));
  setup();
  const read = await getDepreciationAuthority("jwt", "client-1");
  assert.equal(read.authority?.status, "live");
  assert.equal(read.fy_end.fallback, true, "the Dec-31 default must be surfaced, never silently assumed");
});

test("faRegisterTie posts p_client/p_as_of and unwraps tie/accounts", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(TIE_ENVELOPE);
  });
  setup();
  const read = await faRegisterTie("jwt", "client-1", "2026-08-01");
  assert.equal(seenBody.p_as_of, "2026-08-01");
  assert.equal(read.tie, true);
  assert.equal(read.accounts[0]?.cost_diff_cents, 0);
});

// --- actions: every write mints a FRESH op_key per call -----------------------

test("action verbs each POST a fresh p_op_key, never a shared/reused one", async (t) => {
  const seenKeys: string[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (typeof body.p_op_key === "string") seenKeys.push(body.p_op_key);
    return jsonRes({});
  });
  setup();
  await upsertFaAccountProfile("jwt", { clientId: "c1", assetAccount: "170-000", accumAccount: "170-100", depreciationExpenseAccount: "620-500" });
  await retireFaAccountProfile("jwt", "c1", "170-000");
  await completeFixedAssetParticulars("jwt", "c1", "asset-1", { method: "straight_line", start_date: "2026-01-15", useful_life_months: 60, residual_cents: 0 });
  await reviseFixedAssetParticulars("jwt", "c1", "asset-1", { method: "straight_line", start_date: "2026-01-15" }, "2026-06-01");
  await proposeDepreciationAuthority("jwt", "c1", "monthly");
  await signDepreciationAuthority("jwt", "c1", "auth-1");
  await retireDepreciationAuthority("jwt", "c1", "auth-1", "cadence change");
  await runDepreciationManual("jwt", "c1", "2026-01-01", "2026-01-31");
  await disposeFixedAsset("jwt", {
    clientId: "c1", assetId: "asset-1", disposalDate: "2026-06-01", proceedsCents: 500000,
    proceedsAccount: "110-000", gainAccount: "700-000", lossAccount: "800-000", memo: "sold",
  });
  await setClientFyEnd("jwt", "c1", 12, 31);

  assert.equal(seenKeys.length, 10, "every action call must carry a p_op_key");
  assert.equal(new Set(seenKeys).size, seenKeys.length, "no two action calls may share an op_key");
});

test("disposeFixedAsset sends p_cost_portion_cents null when omitted (full disposal), and the value when given (partial)", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({});
  });
  setup();
  await disposeFixedAsset("jwt", {
    clientId: "c1", assetId: "asset-1", disposalDate: "2026-06-01", proceedsCents: 500000,
    proceedsAccount: "110-000", gainAccount: "700-000", lossAccount: "800-000", memo: null,
  });
  assert.equal(seenBody.p_cost_portion_cents, null);

  await disposeFixedAsset("jwt", {
    clientId: "c1", assetId: "asset-1", disposalDate: "2026-06-01", proceedsCents: 500000,
    proceedsAccount: "110-000", gainAccount: "700-000", lossAccount: "800-000", memo: null,
    costPortionCents: 7500000,
  });
  assert.equal(seenBody.p_cost_portion_cents, 7500000);
});
