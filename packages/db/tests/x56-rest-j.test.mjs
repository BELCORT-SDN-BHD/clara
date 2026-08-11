// 0056 (Wave E lane beta, the close model) rig -- PART 13: the Codex R2 batch's
// two FIXED-ASSET verification cells. (1) FA DISPOSAL TIE (Codex R2 BLOCKER 2):
// a disposal now removes the asset's REMAINING NBV from the register side of
// fa_control_tie's movement identity, matching what dispose_fixed_asset's own
// GL entry does. (2) DEPRECIATION ELIGIBILITY (Codex R2 MAJOR 1): a method
// 'none' asset and a fully-depreciated asset are NOT lagging; a genuinely
// mid-life asset still is.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG,
// never by reading 0056_wave_e_close_model.sql (live function bodies ARE read
// for MY OWN authorial grounding, per established practice). The FA verbs
// themselves (0041) are called directly by their pinned names -- this file
// does not import the x41 fixture ecosystem's own cached world (a SEPARATE
// Wave-B world would double the world-building cost and buys nothing here);
// it reuses x56's own cleanCloseableFY client and adds the FA chart on top.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, upsertAccountClassed, draftEntryV3, approveEntry, freshResolution, withdrawDraft,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, plainEntry,
  beginClose, finalizeClose, BANK1, REVN, EXPN, addDaysStr,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 rest-j suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-j"); printSkipCount("x56-rest-j"); await endPool(); });

// ---------------------------------------------------------------------------
// Minimal FA fixture helpers, x56-native. Suite-scoped codes ("-C56FA", grammar
// ^[0-9]{3}-[0-9A-Z]{2,4}$). Gain/loss on disposal ride x56's own REVN/EXPN
// (already income/expense-typed) -- this file does not test disposal gain/loss
// recognition, only the register<->GL movement tie.
// ---------------------------------------------------------------------------

const FACOST = "180-FA1";
const FAACCUM = "181-FA1";
const FAEXP = "580-FA1";

async function setupFaCoa(sub, client) {
  await upsertAccountClassed(sub, { client, code: FACOST, name: "Plant & Machinery (x56 FA)", type: "asset", opKey: opk("x56fa-cost") });
  await upsertAccountClassed(sub, { client, code: FAACCUM, name: "Accum Depreciation (x56 FA)", type: "asset", opKey: opk("x56fa-accum") });
  await upsertAccountClassed(sub, { client, code: FAEXP, name: "Depreciation Expense (x56 FA)", type: "expense", opKey: opk("x56fa-exp") });
  await humanQuery(sub, "select clara.upsert_fa_account_profile(p_client => $1, p_asset_account => $2, p_accum_account => $3, p_depr_expense_account => $4, p_op_key => $5) as r",
    [client, FACOST, FAACCUM, FAEXP, opk("x56fa-profile")]);
}

/** Buy an asset: Dr FACOST / Cr BANK1, approved -- the enrolment hook soft-births
 *  a fixed_assets row. Returns the new register row. */
async function buyFaAsset(sub, { client, cents, postingDate }) {
  const before2 = (await rootQuery("select count(*)::int as n from clara.fixed_assets where client_id=$1", [client])).rows[0].n;
  await plainEntry(sub, { client, debit: FACOST, credit: BANK1, cents, postingDate, memo: "x56 FA acquisition" });
  const rows = (await rootQuery("select * from clara.fixed_assets where client_id=$1 order by created_at desc", [client])).rows;
  assert.equal(rows.length, before2 + 1, "mandatory setup: the acquisition soft-birthed exactly ONE register row");
  return rows[0];
}

/** Propose + sign a live depreciation authority -- run_depreciation_manual still
 *  needs one (measured: "manual" means out-of-cadence timing, not authority-free). */
async function liveFaAuthority(proposer, signer, { client, cadence = "monthly" }) {
  const proposed = (await humanQuery(proposer, "select clara.propose_depreciation_authority(p_client => $1, p_cadence => $2, p_op_key => $3) as r",
    [client, cadence, opk("x56fa-authprop")])).rows[0].r;
  const authorityId = proposed.authority_id ?? proposed.id;
  assert.ok(authorityId, `mandatory setup: propose_depreciation_authority names the authority (got ${JSON.stringify(proposed)})`);
  await humanQuery(signer, "select clara.sign_depreciation_authority(p_client => $1, p_authority => $2, p_op_key => $3) as r",
    [client, authorityId, opk("x56fa-authsign")]);
  return authorityId;
}

async function completeFaParticulars(sub, { client, asset, particulars }) {
  return (await humanQuery(sub, "select clara.complete_fixed_asset_particulars(p_client => $1, p_asset => $2, p_particulars => $3::jsonb, p_op_key => $4) as r",
    [client, asset, JSON.stringify(particulars), opk("x56fa-particulars")])).rows[0].r;
}

/** Manual depreciation run for one period; approve the entry if it drafted. */
async function runFaDepreciation(owner, checker, { client, periodStart, periodEnd }) {
  const receipt = (await humanQuery(owner, "select clara.run_depreciation_manual(p_client => $1, p_period_start => $2::date, p_period_end => $3::date, p_op_key => $4) as r",
    [client, periodStart, periodEnd, opk("x56fa-rundep")])).rows[0].r;
  if (receipt.status === "drafted" && receipt.entry_id) {
    const e = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [receipt.entry_id])).rows[0];
    const { approveEntry } = await import("./wave-a-fixtures.mjs");
    await approveEntry(checker, { entry: receipt.entry_id, expectedRevision: e.revision_token, opKey: opk("x56fa-rundep-approve") });
  }
  return receipt;
}

/** Dispose (fully, or PARTIALLY when costPortionCents is given); approve the
 *  entry if it drafted (a distinct checker from the maker). */
async function disposeFaAsset(owner, checker, { client, asset, disposalDate, proceedsCents = 0, costPortionCents = null }) {
  const specs = [
    { name: "p_client" }, { name: "p_asset" }, { name: "p_disposal_date", cast: "date" },
    { name: "p_proceeds_cents" }, { name: "p_proceeds_account" }, { name: "p_gain_account" },
    { name: "p_loss_account" }, { name: "p_memo" }, { name: "p_op_key" },
  ];
  const vals = [client, asset, disposalDate, proceedsCents, proceedsCents > 0 ? BANK1 : null, REVN, EXPN, "x56 FA disposal", opk("x56fa-dispose")];
  if (costPortionCents !== null) {
    specs.push({ name: "p_cost_portion_cents" });
    vals.push(costPortionCents);
  }
  const args = specs.map((s, i) => `${s.name} => $${i + 1}`).join(", ");
  const receipt = (await humanQuery(owner, `select clara.dispose_fixed_asset(${args}) as r`, vals)).rows[0].r;
  const entryId = receipt.entry_id ?? receipt.id;
  const e = (await rootQuery("select status, revision_token from clara.journal_entries where id=$1", [entryId])).rows[0];
  if (e?.status === "draft") {
    const { approveEntry } = await import("./wave-a-fixtures.mjs");
    await approveEntry(checker, { entry: entryId, expectedRevision: e.revision_token, opKey: opk("x56fa-dispose-approve") });
  }
  return receipt;
}

// ===========================================================================
// (1) FA DISPOSAL TIE (Codex R2 BLOCKER 2 + the S9c integration catch). Arm 0
// is the REGRESSION PIN for S9c (c75db4f): my own live minimal repro --
// enroll + buy + depreciate + close, NO disposal at all. Pre-S9c, ANY client
// with fixed-asset depreciation expense movement could not close a fiscal
// year at all: finalize_close's own P&L-roll entry zeroes the depreciation-
// expense account and carried none of _tf_fa_movement_belt's exemption
// flags, so CLR40 fired on the CLOSING ENTRY ITSELF, before fa_control_tie's
// own math was ever reached. Also folds in the cheap negative S9c asked for:
// a MANUAL draft moving the depreciation-expense account, with no
// close_receipt_id, still refuses CLR40 -- the exemption is structural (only
// finalize_close ever births that column), not a blanket widening for hand
// journals. Arms (a)/(b) are Codex R2 BLOCKER 2's own disposal-tie subject: a
// disposal removes the asset's REMAINING NBV (cost - baseline accum - live
// depreciation) from the REGISTER side of the movement identity -- matching
// what dispose_fixed_asset's own GL entry does. Arm (a): SOME live
// depreciation before disposal. Arm (b): acquired AND disposed in the SAME
// window (the degenerate zero-depreciation case) still nets to a tie.
// ===========================================================================

test("FA disposal tie: the S9c regression pin (no disposal, close alone) plus the CLR40 negative; then a disposed-with-depreciation asset TIES; an acquire+dispose-same-window asset ALSO ties", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.hana;

  // Arm 0 -- the S9c regression pin, on its OWN fresh client (a minimal repro
  // deserves isolation from the disposal arms' own state).
  const fx0 = await cleanCloseableFY(owner, { tag: "fapin", prepSub: preparer, startsOn: "2025-01-01" });
  await setupFaCoa(owner, fx0.client);
  await liveFaAuthority(owner, preparer, { client: fx0.client });
  const assetPin = await buyFaAsset(preparer, { client: fx0.client, cents: 120_000, postingDate: fx0.startsOn });
  await completeFaParticulars(owner, {
    client: fx0.client, asset: assetPin.id,
    // A ONE-month life so the single January run fully depreciates it -- keeps
    // this arm a minimal repro (no depreciation_through_fy_end attestation
    // noise, which is a separate concern from what this arm targets).
    particulars: { method: "straight_line", useful_life_months: 1, residual_cents: 0, start_date: fx0.startsOn, description: "x56 FA S9c regression pin -- no disposal" },
  });
  await runFaDepreciation(owner, preparer, { client: fx0.client, periodStart: fx0.startsOn, periodEnd: "2025-01-31" });
  const pinCharge = (await rootQuery("select amount_cents from clara.fa_depreciation where asset_id=$1 and is_live", [assetPin.id])).rows[0];
  assert.ok(pinCharge, "mandatory setup: a live depreciation charge exists -- FAEXP genuinely carries nonzero movement this FY");

  // THE NEGATIVE (folded in, cheap): a MANUAL draft moving FAEXP, with no
  // close_receipt_id, still refuses CLR40 -- S9c's exemption is structural
  // (only finalize_close ever births that column via the pre-generated permit
  // target), never a blanket widening for hand journals. draftEntryV3 (not
  // plainEntry) directly: the belt fires on the APPROVE-time touch, not the
  // draft insert (measured), so the draft itself persists -- withdraw it after,
  // or it sits as a stray unapproved draft tripping THIS arm's own close.
  const manualDraft = await draftEntryV3(preparer, {
    client: fx0.client, resolution: freshResolution(preparer, fx0.client, { subjectKind: "manual", subjectId: null }),
    memo: "x56 S9c negative: a manual draft touching FAEXP, no register act", postingDate: addDaysStr(fx0.startsOn, 10),
    lines: [
      { account_code: FAEXP, debit_cents: 500, credit_cents: 0, description: "dr" },
      { account_code: BANK1, debit_cents: 0, credit_cents: 500, description: "cr" },
    ],
    opKey: opk("x56-s9cneg-draft"),
  });
  const errManual = await caught(() => approveEntry(preparer, { entry: manualDraft.entry_id, expectedRevision: manualDraft.revision_token, opKey: opk("x56-s9cneg-approve") }));
  assert.ok(errManual, "a manual entry moving the depreciation-expense account, outside any FA verb and with no close_receipt_id, must still refuse");
  assert.equal(errManual.code, "CLR40", `expected CLR40 (got ${errManual.code} -- ${errManual.message})`);
  assert.equal(JSON.parse(errManual.detail ?? "{}").reason, "fa_belt_unregistered_movement");
  await withdrawDraft(preparer, { entry: manualDraft.entry_id, reason: "x56 S9c negative: withdrawing the refused manual draft", expectedRevision: manualDraft.revision_token, opKey: opk("x56-s9cneg-withdraw") });

  // Segregation for arm 0's own close, same shape as arms (a)/(b) below.
  await plainEntry(preparer, { client: fx0.client, debit: BANK1, credit: REVN, cents: 100, postingDate: addDaysStr(fx0.startsOn, 15), memo: "x56 FA S9c pin: a small non-owner IN-FY touch" });
  const begunPin = await beginClose(owner, { fy: fx0.fy });
  const gatePin = (begunPin.gates ?? []).find((g) => g.check_key === "fa_control_tie");
  assert.equal(gatePin?.state, "pass", `fa_control_tie ties with NO disposal at all, just live depreciation (got ${JSON.stringify(gatePin)})`);
  const closedPin = await finalizeClose(owner, { fy: fx0.fy });
  assert.ok(closedPin.receipt_id, "S9c REGRESSION PIN: the close succeeds with live depreciation-expense movement and NO disposal -- pre-S9c this refused CLR40 on the closing entry itself, before fa_control_tie's own math was ever reached");

  const fx = await cleanCloseableFY(owner, { tag: "fadisp", prepSub: preparer, startsOn: "2025-01-01" });
  await setupFaCoa(owner, fx.client);
  await liveFaAuthority(owner, preparer, { client: fx.client });

  // Arm (a): buy, depreciate ONE live period, then dispose -- all in-FY. The
  // acquisition + depreciation start_date sit on the FY's own start (2027-01-01)
  // so the FIRST monthly run (a full calendar month, the cadence's own
  // requirement) charges a clean, unprorated month -- no date-alignment noise.
  const assetA = await buyFaAsset(preparer, { client: fx.client, cents: 240_000, postingDate: fx.startsOn });
  await completeFaParticulars(owner, {
    client: fx.client, asset: assetA.id,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: fx.startsOn, description: "x56 FA disposal arm A" },
  });
  await runFaDepreciation(owner, preparer, { client: fx.client, periodStart: fx.startsOn, periodEnd: "2025-01-31" });
  const chargeRow = (await rootQuery("select amount_cents from clara.fa_depreciation where asset_id=$1 and is_live", [assetA.id])).rows[0];
  assert.ok(chargeRow, "mandatory setup: a LIVE depreciation charge exists before disposal");
  // Dispose ON the depreciation run's own effective_date (the period's own
  // month-end, 2025-01-31) -- NOT merely "inside" that month. fa_control_tie's
  // register-side NBV now reads _fa_accumulated_at(asset, disposed_at), which is
  // genuinely DATE-AWARE (measured directly): disposing mid-month, BEFORE the
  // charge's own effective_date, correctly shows ZERO accumulated depreciation
  // as of that earlier instant (the charge has not "happened" yet) -- sound
  // accounting, but not what this arm means to exercise. dispose_fixed_asset
  // also requires every period through the disposal month charged first, so
  // this stays inside January either way.
  await disposeFaAsset(owner, preparer, { client: fx.client, asset: assetA.id, disposalDate: "2025-01-31", proceedsCents: 100_000 });
  const assetARow = (await rootQuery("select disposed_at from clara.fixed_assets where id=$1", [assetA.id])).rows[0];
  assert.ok(assetARow.disposed_at, "mandatory setup: the asset is disposed");

  // Arm (b): a SECOND asset, bought AND disposed within the same window, no
  // depreciation ever recorded -- the degenerate zero-depreciation case.
  const assetB = await buyFaAsset(preparer, { client: fx.client, cents: 90_000, postingDate: addDaysStr(fx.startsOn, 70) });
  await completeFaParticulars(owner, {
    client: fx.client, asset: assetB.id,
    particulars: { method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: addDaysStr(fx.startsOn, 70), description: "x56 FA disposal arm B" },
  });
  await disposeFaAsset(owner, preparer, { client: fx.client, asset: assetB.id, disposalDate: addDaysStr(fx.startsOn, 75), proceedsCents: 90_000 });

  // Segregation (matrix A12): the FA verbs above ran AS owner throughout (maker
  // and, where born already-approved, the only toucher) -- owner is now the
  // year's last human preparer, which conflicts with owner also being the
  // closer. A small, ordinary, self-approved IN-FY entry by a non-owner actor
  // AFTER the FA activity is the genuine way this stays clean in practice
  // (the reopen-settlement cell hit the identical shape).
  await plainEntry(preparer, { client: fx.client, debit: BANK1, credit: REVN, cents: 100, postingDate: addDaysStr(fx.startsOn, 80), memo: "x56 FA disposal tie: a small post-disposal IN-FY touch by a non-owner actor" });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "fa_control_tie");
  assert.equal(gate?.state, "pass", `fa_control_tie must TIE with both a depreciated-then-disposed asset and an acquire-dispose-same-window asset (got ${JSON.stringify(gate)})`);
  const measured = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate.result_id])).rows[0].measured;
  assert.equal(measured.state, "tie");
  assert.equal(Number(measured.diff_cents), 0, `register vs GL movement diff must be exactly ZERO (got ${JSON.stringify(measured)})`);

  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the FY closes cleanly -- pre-fix this was permanently uncloseable (a register-side movement mismatch that never resolved)");
});

// ===========================================================================
// (2) DEPRECIATION ELIGIBILITY (Codex R2 MAJOR 1): an enrolled, undisposed
// asset only counts as LAGGING if it can still produce another depreciation
// row. method 'none' has no cadence at all; a FULLY-depreciated asset's money
// clock is exhausted (baseline + live rows >= cost - residual). Neither may
// demand a false per-asset exception forever. A genuinely mid-life asset,
// with real remaining depreciation to charge, IS still lagging.
// ===========================================================================

test("depreciation eligibility: a method='none' asset and a FULLY-depreciated asset are not lagging; a genuinely mid-life asset still is", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.hana;
  const fx = await cleanCloseableFY(owner, { tag: "fadeprelig", prepSub: preparer, startsOn: "2025-01-01" });
  await setupFaCoa(owner, fx.client);
  await liveFaAuthority(owner, preparer, { client: fx.client });

  // Asset A: method='none' -- enrolled, no cadence, can never produce a row.
  const assetNone = await buyFaAsset(preparer, { client: fx.client, cents: 50_000, postingDate: fx.startsOn });
  await completeFaParticulars(owner, {
    client: fx.client, asset: assetNone.id,
    particulars: { method: "none", start_date: fx.startsOn, description: "x56 depr-elig: method none (freehold-land-shaped)" },
  });

  // Asset B: FULLY depreciated -- a short (1-month) life STARTING ON the FY's own
  // start date, so ONE full (unprorated) calendar-month run covers its entire
  // cost: baseline(0) + live rows == cost - residual(0).
  const assetFull = await buyFaAsset(preparer, { client: fx.client, cents: 30_000, postingDate: fx.startsOn });
  await completeFaParticulars(owner, {
    client: fx.client, asset: assetFull.id,
    particulars: { method: "straight_line", useful_life_months: 1, residual_cents: 0, start_date: fx.startsOn, description: "x56 depr-elig: fully depreciated in one short life" },
  });
  await runFaDepreciation(owner, preparer, { client: fx.client, periodStart: fx.startsOn, periodEnd: "2025-01-31" });
  const fullCharge = (await rootQuery("select coalesce(sum(amount_cents),0)::bigint as n from clara.fa_depreciation where asset_id=$1 and is_live", [assetFull.id])).rows[0].n;
  assert.equal(Number(fullCharge), 30_000, "mandatory setup: the one-month life's single charge covers the ENTIRE cost -- the asset is now fully depreciated");

  // Asset C: genuinely mid-life -- a long (60-month) life, only ONE early
  // period charged, plenty of remaining depreciation and remaining time.
  const assetMid = await buyFaAsset(preparer, { client: fx.client, cents: 600_000, postingDate: fx.startsOn });
  await completeFaParticulars(owner, {
    client: fx.client, asset: assetMid.id,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: fx.startsOn, description: "x56 depr-elig: genuinely mid-life" },
  });
  await runFaDepreciation(owner, preparer, { client: fx.client, periodStart: fx.startsOn, periodEnd: "2025-01-31" });
  const midCharge = (await rootQuery("select coalesce(sum(amount_cents),0)::bigint as n from clara.fa_depreciation where asset_id=$1 and is_live", [assetMid.id])).rows[0].n;
  assert.ok(Number(midCharge) > 0 && Number(midCharge) < 600_000, "mandatory setup: the mid-life asset has SOME live depreciation, nowhere near its full cost");

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "depreciation_through_fy_end");
  assert.equal(gate?.state, "fail", "mandatory setup: the mid-life asset alone still trips the gate");
  const measured = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate.result_id])).rows[0].measured;
  const laggingIds = (measured.lagging_assets ?? []).map((a) => a.asset_id);
  assert.ok(laggingIds.includes(assetMid.id), "the mid-life asset IS named as lagging");
  assert.ok(!laggingIds.includes(assetNone.id), "the method='none' asset is NOT named as lagging -- it can never produce another row");
  assert.ok(!laggingIds.includes(assetFull.id), "the fully-depreciated asset is NOT named as lagging -- its money clock is exhausted");
  assert.equal(laggingIds.length, 1, "exactly ONE asset is lagging -- the genuinely mid-life one, nothing else");
});

// ===========================================================================
// (9) PARTIAL DISPOSAL (R2.6's named residual): _fa_on_approve's supersede
// split (design SS4.3) -- the original row goes superseded_at (excluded from
// fa_control_tie's WHERE fa.superseded_at IS NULL filter everywhere); a NEW
// "disposed portion" row is born (status='disposed', disposed_at set,
// cost=v_portion, supersedes_asset_id=original) and a NEW "continuing" row
// absorbs the remainder (status='active', cost=cost-v_portion,
// supersedes_asset_id=original). The reviewer's unproven claim: because BOTH
// successor rows inherit the original's acquired_date and neither is itself
// superseded, the acquisitions term still counts the full original cost (via
// the two successors, since the original's own row is now excluded) and the
// disposal term picks up only the disposed-portion row's own NBV -- so the
// register side still nets to the GL side's movement. Verified here
// STRUCTURALLY (the live rows after the split) AND behaviourally (the gate).
// ===========================================================================

test("partial disposal: the supersede split leaves fa_control_tie tied -- the original row excluded, both successors correctly accounted", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.hana;
  const fx = await cleanCloseableFY(owner, { tag: "fapartial", prepSub: preparer, startsOn: "2025-01-01" });
  await setupFaCoa(owner, fx.client);
  await liveFaAuthority(owner, preparer, { client: fx.client });

  const asset = await buyFaAsset(preparer, { client: fx.client, cents: 500_000, postingDate: fx.startsOn });
  await completeFaParticulars(owner, {
    client: fx.client, asset: asset.id,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: fx.startsOn, description: "x56 FA partial disposal" },
  });
  await runFaDepreciation(owner, preparer, { client: fx.client, periodStart: fx.startsOn, periodEnd: "2025-01-31" });
  const liveDepBefore = (await rootQuery("select coalesce(sum(amount_cents),0)::bigint as n from clara.fa_depreciation where asset_id=$1 and is_live", [asset.id])).rows[0].n;
  assert.ok(Number(liveDepBefore) > 0, "mandatory setup: a live depreciation charge exists before the partial disposal");

  // PARTIAL disposal -- 40% of cost, ON the depreciation run's own
  // effective_date (2025-01-31, the period's month-end) so the as-of-disposal
  // accumulated depreciation genuinely includes that charge (see the identical
  // date-ordering note in cell 1's arm A -- _fa_accumulated_at is date-aware).
  const portionCents = 200_000;
  await disposeFaAsset(owner, preparer, {
    client: fx.client, asset: asset.id, disposalDate: "2025-01-31",
    proceedsCents: 220_000, costPortionCents: portionCents,
  });

  // STRUCTURAL: the three-row shape, read directly, never assumed.
  const originalRow = (await rootQuery("select status, superseded_at, superseded_by_asset_id, cost_cents from clara.fixed_assets where id=$1", [asset.id])).rows[0];
  assert.equal(originalRow.status, "superseded", "the original row is superseded, not disposed itself");
  assert.ok(originalRow.superseded_at, "superseded_at is set -- fa_control_tie's live-row filter excludes it everywhere");
  const successors = (await rootQuery("select id, status, cost_cents, disposed_at, supersedes_asset_id from clara.fixed_assets where supersedes_asset_id=$1 order by cost_cents", [asset.id])).rows;
  assert.equal(successors.length, 2, "exactly two successor rows were born from the split");
  const disposedPortion = successors.find((s) => s.status === "disposed");
  const continuing = successors.find((s) => s.status === "active");
  assert.ok(disposedPortion, "one successor is the disposed portion");
  assert.ok(continuing, "the other successor is the continuing (still-active) remainder");
  assert.equal(Number(disposedPortion.cost_cents), portionCents, "the disposed-portion row's cost is EXACTLY the requested portion");
  assert.ok(disposedPortion.disposed_at, "the disposed-portion row itself carries disposed_at");
  assert.equal(Number(continuing.cost_cents), 500_000 - portionCents, "the continuing row absorbs EXACTLY the remainder");
  assert.equal(originalRow.superseded_by_asset_id, continuing.id, "the split lineage law: superseded_by_asset_id names the CONTINUING successor, never the disposed one");

  // Segregation (matrix A12), the same shape cell 1 needed: a small non-owner
  // in-FY touch after the FA activity.
  await plainEntry(preparer, { client: fx.client, debit: BANK1, credit: REVN, cents: 100, postingDate: "2025-02-05", memo: "x56 FA partial disposal: a small post-disposal IN-FY touch by a non-owner actor" });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "fa_control_tie");
  assert.equal(gate?.state, "pass", `fa_control_tie must TIE after a partial disposal's supersede split (got ${JSON.stringify(gate)}) -- if this reads mismatch, the reviewer's hypothesis is WRONG and this is a real finding, not a cell to force green`);
  const measured = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate.result_id])).rows[0].measured;
  assert.equal(measured.state, "tie");
  assert.equal(Number(measured.diff_cents), 0, `register vs GL movement diff must be exactly ZERO after the partial disposal (got ${JSON.stringify(measured)})`);

  // NOTE: finalize_close is NOT called here -- this client has live depreciation
  // expense movement, which trips the SAME pre-existing, unrelated CLR40
  // fa_belt_unregistered_movement block that cell 1 hit (finalize_close's own
  // P&L-roll closing entry carries none of _tf_fa_movement_belt's five
  // exemption flags). That is reported separately as its own finding; this
  // cell's own subject -- fa_control_tie's gate state -- is fully provable at
  // begin_close without ever reaching finalize.
});
