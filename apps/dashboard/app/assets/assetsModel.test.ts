// assetsModel.ts pure-logic tests (no DOM, no DB — the agingModel.test.ts house
// style). Covers the defensive mappers (list_fixed_assets/get_fixed_asset/
// list_depreciation_runs/get_depreciation_run/get_depreciation_authority/
// fa_register_tie, envelope shapes copied literally from 0041-interface-
// contract.md §3), the display-only predicates, and the screen-state selector
// incl. its fail-closed 'unavailable' arm.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toAssetRow, toListFixedAssetsRead, toGetFixedAssetRead, toListDepreciationRunsRead,
  toGetDepreciationRunRead, toDepreciationAuthorityRead, toFaRegisterTieRead,
  assetIsIncomplete, assetHasUnchargedDue, assetIsDisposable, assetHasSplitMonthAdvisory,
  fyEndLabel, assetsScreenState,
} from "./assetsModel";

// --- toAssetRow: the pin-sheet §3 ASSET shape -----------------------------------

test("toAssetRow maps every pin-sheet §3 field and degrades garbage to a safe empty row", () => {
  const row = toAssetRow({
    id: "a1", description: "Toyota Hilux 2024", status: "active", particulars_complete: true,
    acquired_date: "2026-01-15", effective_from: null, superseded_at: null,
    cost_cents: 15000000, residual_cents: 100000, accumulated_cents: 2500000, nbv_cents: 12400000,
    method: "straight_line", rate_bps: null, useful_life_months: 60, start_date: "2026-01-15",
    asset_account: "170-000", accum_account: "170-100", expense_account: "620-500",
    ca_class: null, is_commercial_vehicle: true, is_new: true,
    superseded_by_asset_id: null, disposed_at: null, disposal_entry_id: null, uncharged_due_count: 0,
  });
  assert.equal(row.description, "Toyota Hilux 2024");
  assert.equal(row.cost_cents, 15000000);
  assert.equal(row.nbv_cents, 12400000);
  assert.equal(row.method, "straight_line");
  assert.equal(row.is_commercial_vehicle, true);

  const garbage = toAssetRow("nope");
  assert.equal(garbage.id, "");
  assert.equal(garbage.status, "active");
  assert.equal(garbage.cost_cents, null);
  assert.equal(garbage.method, null);
  assert.equal(garbage.is_new, false);
});

// --- list_fixed_assets(client) — pin sheet §3 -----------------------------------

test("toListFixedAssetsRead unwraps the {client_id, as_of, assets, incomplete_count} envelope", () => {
  const read = toListFixedAssetsRead({
    client_id: "c1", as_of: "2026-08-01", incomplete_count: 1,
    assets: [{ id: "a1", status: "pending", particulars_complete: false }],
  });
  assert.equal(read.available, true);
  assert.equal(read.assets.length, 1);
  assert.equal(read.assets[0]?.id, "a1");
  assert.equal(read.incomplete_count, 1);
});

test("[shape-drift law] toListFixedAssetsRead degrades a missing/non-array assets key to available:false, rows:[] — never a silent empty success", () => {
  const asArray = toListFixedAssetsRead([]);
  assert.deepEqual(asArray.assets, []);
  assert.equal(asArray.available, false);

  const noKey = toListFixedAssetsRead({ client_id: "c1", as_of: "2026-08-01" });
  assert.equal(noKey.available, false);

  const nullBody = toListFixedAssetsRead(null);
  assert.equal(nullBody.available, false);
});

// --- get_fixed_asset(asset) — pin sheet §3 --------------------------------------

test("toGetFixedAssetRead unwraps asset/lineage/charges/schedule/uncharged_due verbatim", () => {
  const read = toGetFixedAssetRead({
    asset: { id: "a1", status: "active", particulars_complete: true, cost_cents: 15000000 },
    lineage: [{ id: "a0", status: "superseded" }],
    charges: [{ id: "ch1", period_start: "2026-01-01", period_end: "2026-01-31", amount_cents: 25000, unwind_of: null }],
    schedule: [{ period_start: "2026-02-01", period_end: "2026-02-28", projected_cents: 25000 }],
    uncharged_due: ["2026-02"],
  });
  assert.equal(read.available, true);
  assert.equal(read.asset?.id, "a1");
  assert.equal(read.lineage.length, 1);
  assert.equal(read.charges[0]?.amount_cents, 25000);
  assert.equal(read.schedule[0]?.projected_cents, 25000);
  assert.deepEqual(read.uncharged_due, ["2026-02"]);
});

test("toGetFixedAssetRead degrades a shape with no 'asset' key to available:false; a null asset stays a legitimate 'not found'", () => {
  const noKey = toGetFixedAssetRead({ lineage: [] });
  assert.equal(noKey.available, false);
  assert.equal(noKey.asset, null);

  const notFound = toGetFixedAssetRead({ asset: null, lineage: [], charges: [], schedule: [], uncharged_due: [] });
  assert.equal(notFound.available, true);
  assert.equal(notFound.asset, null);
});

// --- list_depreciation_runs(client) / get_depreciation_run(run) — pin sheet §3 --

test("toListDepreciationRunsRead / toGetDepreciationRunRead unwrap the RUN shape verbatim", () => {
  const RUN = {
    id: "r1", authority_id: "auth1", period_start: "2026-01-01", period_end: "2026-01-31",
    mode: "post", entries: 3, charged_cents: 75000,
    skipped: [{ asset_id: "a9", reason: "none_method" }], entry_id: "e1", created_at: "2026-02-01T00:00:00Z",
  };
  const list = toListDepreciationRunsRead({ runs: [RUN] });
  assert.equal(list.available, true);
  assert.equal(list.runs[0]?.charged_cents, 75000);
  assert.equal(list.runs[0]?.skipped[0]?.reason, "none_method");

  const single = toGetDepreciationRunRead({ run: RUN });
  assert.equal(single.available, true);
  assert.equal(single.run?.id, "r1");

  const missing = toGetDepreciationRunRead({});
  assert.equal(missing.available, false);
  assert.equal(missing.run, null);
});

// --- get_depreciation_authority(client) — pin sheet §3 --------------------------

test("toDepreciationAuthorityRead unwraps authority/ramp_earned/fy_end/high_stakes_threshold_cents", () => {
  const read = toDepreciationAuthorityRead({
    authority: { id: "auth1", status: "live", cadence: "monthly", proposed_by: "u1", signed_by: "u2", retired_by: null, created_at: "2026-01-01T00:00:00Z" },
    ramp_earned: true,
    fy_end: { month: 12, day: 31, fallback: true },
    high_stakes_threshold_cents: 10000000,
  });
  assert.equal(read.available, true);
  assert.equal(read.authority?.status, "live");
  assert.equal(read.ramp_earned, true);
  assert.deepEqual(read.fy_end, { month: 12, day: 31, fallback: true });
  assert.equal(read.high_stakes_threshold_cents, 10000000);
});

test("toDepreciationAuthorityRead: no live authority yet degrades to authority:null (a legitimate state, not a shape failure)", () => {
  const read = toDepreciationAuthorityRead({
    authority: null, ramp_earned: false, fy_end: { month: null, day: null, fallback: true }, high_stakes_threshold_cents: null,
  });
  assert.equal(read.available, true);
  assert.equal(read.authority, null);
  assert.equal(read.fy_end.fallback, true);
});

test("toDepreciationAuthorityRead degrades a shape with no fy_end object at all to available:false", () => {
  const read = toDepreciationAuthorityRead({ authority: null });
  assert.equal(read.available, false);
});

test("fyEndLabel names the Dec-31 fallback explicitly (design §1.6 — surfaced, never silent)", () => {
  assert.equal(fyEndLabel({ month: null, day: null, fallback: true }), "unset");
  assert.equal(fyEndLabel({ month: 12, day: 31, fallback: true }), "31/12 (Dec-31 default — not yet set for this client)");
  assert.equal(fyEndLabel({ month: 6, day: 30, fallback: false }), "30/06");
});

// --- fa_register_tie(client, as_of) — pin sheet §3 ------------------------------

test("toFaRegisterTieRead unwraps tie/accounts/incomplete_count", () => {
  const read = toFaRegisterTieRead({
    as_of: "2026-08-01", tie: true, incomplete_count: 0,
    accounts: [{
      asset_account: "170-000", accum_account: "170-100",
      register_cost_cents: 15000000, gl_cost_cents: 15000000, cost_diff_cents: 0,
      register_accum_cents: 2500000, gl_accum_cents: 2500000, accum_diff_cents: 0,
    }],
  });
  assert.equal(read.available, true);
  assert.equal(read.tie, true);
  assert.equal(read.accounts[0]?.cost_diff_cents, 0);
});

test("toFaRegisterTieRead degrades a missing accounts[] key to available:false", () => {
  assert.equal(toFaRegisterTieRead({ as_of: "2026-08-01", tie: false }).available, false);
});

// --- display-only predicates -----------------------------------------------------

test("assetIsIncomplete is true only for a pending/active row with particulars not yet complete", () => {
  assert.equal(assetIsIncomplete({ particulars_complete: false, status: "active" }), true);
  assert.equal(assetIsIncomplete({ particulars_complete: false, status: "pending" }), true);
  assert.equal(assetIsIncomplete({ particulars_complete: true, status: "active" }), false);
  assert.equal(assetIsIncomplete({ particulars_complete: false, status: "disposed" }), false, "a disposed row never chases completion");
  assert.equal(assetIsIncomplete({ particulars_complete: false, status: "unwound" }), false);
});

test("assetHasUnchargedDue reads the DB's own count, never a client-derived one", () => {
  assert.equal(assetHasUnchargedDue({ uncharged_due_count: 2 }), true);
  assert.equal(assetHasUnchargedDue({ uncharged_due_count: 0 }), false);
  assert.equal(assetHasUnchargedDue({ uncharged_due_count: null }), false);
});

test("assetIsDisposable requires active status AND complete particulars", () => {
  const base = { disposal_draft_outstanding: false };
  assert.equal(assetIsDisposable({ ...base, status: "active", particulars_complete: true }), true);
  assert.equal(assetIsDisposable({ ...base, status: "active", particulars_complete: false }), false);
  assert.equal(assetIsDisposable({ ...base, status: "disposed", particulars_complete: true }), false);
});

// [round-5 fix] THE CELL THAT FAILS WITHOUT THE FIX. The UI predicate used to be
// NARROWER than the verb it fronts: on a row the DB has frozen under WDB-G10 it
// still said "disposable", so /assets offered a dispose form whose only possible
// outcome was the CLR39 `disposal_draft_outstanding` refusal — and the panel that
// names the remedy was gated on a key no function emitted, so it never rendered.
test("assetIsDisposable is FALSE while the DB reports an outstanding disposal draft", () => {
  assert.equal(
    assetIsDisposable({ status: "active", particulars_complete: true, disposal_draft_outstanding: true }),
    false,
    "a frozen row must not be offered a dispose form that can only be refused",
  );
});

test("toAssetRow reads the WDB-G10 freeze and the WDB-G14 advisory the DB actually emits", () => {
  const row = toAssetRow({
    id: "a1", status: "active", particulars_complete: true,
    disposal_draft_outstanding: true, disposal_draft_entry_id: "e9",
    uncharged_due: ["2026-05-01", "2026-06-01"], uncharged_due_count: 2,
    split_month_advisory: [{ effective_from: "2026-03-14", month_charged_to: "predecessor", note: "…" }],
    split_month_advisory_count: 1,
  });
  assert.equal(row.disposal_draft_outstanding, true);
  assert.equal(row.disposal_draft_entry_id, "e9");
  assert.deepEqual(row.uncharged_due, ["2026-05-01", "2026-06-01"]);
  assert.equal(row.split_month_advisory.length, 1);
  assert.equal(row.split_month_advisory[0]?.month_charged_to, "predecessor");
  assert.equal(assetHasSplitMonthAdvisory(row), true);
  // A row the DB does NOT freeze reads false — never "the key was absent, so maybe".
  assert.equal(toAssetRow({ id: "a2" }).disposal_draft_outstanding, false);
  assert.equal(assetHasSplitMonthAdvisory(toAssetRow({ id: "a2" })), false);
});

// --- screen state, including the [D1-style] fail-closed 'unavailable' arm -------

test("assetsScreenState mirrors the house five-state selector when the shape is available", () => {
  assert.equal(assetsScreenState({ loading: true, error: false, totalRows: 0 }), "loading");
  assert.equal(assetsScreenState({ loading: false, error: true, totalRows: 0 }), "error");
  assert.equal(assetsScreenState({ loading: false, error: false, totalRows: 0 }), "empty");
  assert.equal(assetsScreenState({ loading: false, error: false, totalRows: 3 }), "ideal");
  assert.equal(assetsScreenState({ loading: true, error: false, totalRows: 3 }), "ideal", "rows already in hand outrank a background refresh");
});

test("assetsScreenState: available:false reads 'unavailable', NEVER 'empty' — a shape drift must never look like a clean register", () => {
  assert.equal(assetsScreenState({ loading: false, error: false, totalRows: 0, available: false }), "unavailable");
  assert.equal(assetsScreenState({ loading: false, error: false, totalRows: 3, available: false }), "unavailable", "even rows in hand don't excuse an unrecognised envelope");
  assert.equal(assetsScreenState({ loading: false, error: false, totalRows: 0, available: true }), "empty", "an honestly-shaped, honestly-empty read stays 'empty'");
  assert.equal(assetsScreenState({ loading: true, error: false, totalRows: 0, available: false }), "loading", "a request still in flight is 'loading', not a premature 'unavailable'");
});
