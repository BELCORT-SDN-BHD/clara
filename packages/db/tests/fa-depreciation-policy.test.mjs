// #932 [0277] — A DEFAULT DEPRECIATION POLICY PER ENROLLED FIXED-ASSET ACCOUNT, APPLIED AT
// ACQUISITION, WITH ITS VERSION RECORDED ON THE REGISTER ROW.
//
// SEAMS THIS BATTERY DRIVES (written down before any test, per the work order's rule 4):
//   - the two human doors, `clara.set_fa_depreciation_policy` / `clara.retire_fa_depreciation_policy`
//     (public interfaces a bookkeeper calls)
//   - the acquisition birth site, `clara._tf_fa_acquisition_birth` (a deferred trigger — driven
//     only through `buyAsset`'s real approve, never invoked directly)
//   - the register reads, `clara.list_fixed_assets` / `clara.get_fixed_asset` (through
//     `clara._fa_asset_json`, the ONE source both read)
//   - the depreciation engine's OWN, UNCHANGED reachability (`clara.run_depreciation_manual` via
//     the `runAndSettle`/`drainDue` fixtures)
//
//   p932.law      the applied law, off the CATALOG: the migration is recorded, both doors carry
//                 the right shape (definer, clara_authenticated-only, never clara_runtime), the
//                 recut birth body reads the policy relation, and clara._fa_asset_json carries
//                 the two provenance keys. The VACUITY ANCHOR for every behaviour cell below.
//   p932.door     the two doors' own refusals: not_enrolled, method, drivers congruence,
//                 non_depreciable, not_set — each driven through the real door, never asserted
//                 from prose.
//   p932.version  setting a policy TWICE version-forwards: the old row retires, the new one
//                 carries version+1, and exactly one row stays active — the SAME law
//                 clara.upsert_fa_account_profile rests on, proven here for its own relation.
//   p932.birth    AC2/AC3: a policy-covered acquisition births a COMPLETE row with no
//                 "particulars pending" description and the policy's id+version stamped; an
//                 UNCOVERED account still parks the question exactly as before (regression).
//   p932.frozen   AC2's "particulars the acquisition itself states always win", driven the one
//                 way this estate can drive it TODAY (no mechanism yet lets an acquisition entry
//                 itself carry particulars — grepped, none exists): a policy-born row is a
//                 COMPLETE row like any other, so `complete_fixed_asset_particulars` refuses it
//                 `fa_particulars_already_complete` exactly as it would a hand-completed one, and
//                 `revise_fixed_asset_particulars` — the one door that CAN change it — still can.
//   p932.no_touch a policy CHANGE never touches a row a PRIOR version already birthed (AC1's
//                 "changing a policy affects later acquisitions only").
//   p932.run      AC4: the depreciation engine — untouched — picks the policy-born asset up on
//                 its own next run, with no code of its own driven differently.
//
// Fixture clients are `p932_…`, outside the x41 tie-out family (this file's own fixtures header).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate932, p932Client, setFaPolicy, retireFaPolicy, policyRows, activePolicyRow, FA_POLICY_INVALID,
  rootQuery, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  faWorld, faRow, buyAsset, completeParticulars, reviseParticulars,
  refuses, mon, dayIn, liveAuthority, drainDue, chargeRows,
  LAND,
} from "./fa-depreciation-policy-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("fa-depreciation-policy");
  printSkipCount("fa-depreciation-policy");
  await endPool();
});

/** Rig readiness first (the x41 world), then 0277's own frontier. */
const shut = async (t) => (skip41(t, live, "the #932 default depreciation policy battery") ? true : await gate932(t));

// ===========================================================================================
// p932.law — THE APPLIED LAW, OFF THE CATALOG.
// ===========================================================================================

test("p932.law 0277 applied: both doors are clara_authenticated-only definer bodies (never clara_runtime), the recut birth body reads clara.fa_account_depreciation_policies, and clara._fa_asset_json carries both provenance keys", async (t) => {
  if (await shut(t)) return;

  const mig = await rootQuery(
    "select version from clara.schema_migrations where version ~ $1", ["fa_default_depreciation_policy$"]);
  assert.equal(mig.rows.length, 1,
    `exactly one applied fa_default_depreciation_policy migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  for (const sig of [
    "clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)",
    "clara.retire_fa_depreciation_policy(uuid,text,text,text)",
  ]) {
    const auth = await rootQuery(
      "select has_function_privilege('clara_authenticated', $1::regprocedure, 'EXECUTE') as auth, "
      + "has_function_privilege('clara_runtime', $1::regprocedure, 'EXECUTE') as runtime, "
      + "has_function_privilege('public', $1::regprocedure, 'EXECUTE') as pub", [sig]);
    assert.equal(auth.rows[0].auth, true, `${sig}: clara_authenticated holds EXECUTE`);
    assert.equal(auth.rows[0].runtime, false, `${sig}: clara_runtime holds NO EXECUTE (human judgement only)`);
    assert.equal(auth.rows[0].pub, false, `${sig}: PUBLIC holds NO EXECUTE`);
  }

  const birth = (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure",
  )).rows[0].src;
  assert.match(birth, /from clara\.fa_account_depreciation_policies/,
    "the recut birth body reads clara.fa_account_depreciation_policies");
  assert.match(birth, /coalesce\(new\.approved_at, new\.created_at\) >= fp\.enrolled_at/,
    "0247's own enrolment watermark survives the recut, unmoved");

  const assetJson = (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = 'clara._fa_asset_json(uuid,date)'::regprocedure",
  )).rows[0].src;
  assert.match(assetJson, /'depreciation_policy_id', f\.depreciation_policy_id/,
    "clara._fa_asset_json surfaces the policy id");
  assert.match(assetJson, /'depreciation_policy_version', f\.depreciation_policy_version/,
    "clara._fa_asset_json surfaces the policy version");
});

// ===========================================================================================
// p932.door — THE TWO DOORS' OWN REFUSALS.
// ===========================================================================================

test("p932.door.not_enrolled set_fa_depreciation_policy refuses fa_policy_invalid/not_enrolled on an account with no active fa_account_profiles row", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("notenrol", { enrol: false });
  const err = await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36 }),
    FA_POLICY_INVALID, "p932.door.not_enrolled");
  assert.equal(err.code, "CLR37", `refused CLR37 (got ${err.code})`);
});

test("p932.door.method set_fa_depreciation_policy refuses a bad method, and refuses a driver mismatch for each of the three methods", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("method");

  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "bogus" }),
    FA_POLICY_INVALID, "p932.door.method: unknown method string");

  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: null }),
    FA_POLICY_INVALID, "p932.door.method: straight_line with no life");
  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36, rateBps: 500 }),
    FA_POLICY_INVALID, "p932.door.method: straight_line carrying a rate");
  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "reducing_balance", usefulLifeMonths: 36, rateBps: null }),
    FA_POLICY_INVALID, "p932.door.method: reducing_balance with no rate");
  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "reducing_balance", usefulLifeMonths: null, rateBps: 2000 }),
    FA_POLICY_INVALID, "p932.door.method: reducing_balance with no life");
  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "reducing_balance", usefulLifeMonths: 36, rateBps: 20000 }),
    FA_POLICY_INVALID, "p932.door.method: reducing_balance rate out of 1..10000 bps range");
  await refuses(
    () => setFaPolicy(w.users.alice, { client, method: "none", usefulLifeMonths: 36 }),
    FA_POLICY_INVALID, "p932.door.method: none carrying a life");
});

test("p932.door.non_depreciable a non-depreciable (land) enrolment admits ONLY method none, exactly like a hand-completed row's own wall", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("land", { land: true });

  await refuses(
    () => setFaPolicy(w.users.alice, { client, assetAccount: LAND, method: "straight_line", usefulLifeMonths: 60 }),
    FA_POLICY_INVALID, "p932.door.non_depreciable: straight_line on a non-depreciable enrolment");

  const ok = await setFaPolicy(w.users.alice, { client, assetAccount: LAND, method: "none" });
  assert.equal(ok.active, true, "method none is admitted on a non-depreciable enrolment");
  const row = await activePolicyRow(client, LAND);
  assert.equal(row.method, "none");
  assert.equal(row.useful_life_months, null);
  assert.equal(row.rate_bps, null);
  assert.equal(Number(row.residual_cents), 0, "residual is forced to 0 for method none");
});

test("p932.door.not_set retire_fa_depreciation_policy refuses fa_policy_invalid/not_set with no active policy, and refuses again once the one it retired is already gone", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("notset");

  await refuses(() => retireFaPolicy(w.users.alice, { client }),
    FA_POLICY_INVALID, "p932.door.not_set: nothing was ever set");

  await setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36 });
  const ok = await retireFaPolicy(w.users.alice, { client });
  assert.equal(ok.active, false);

  await refuses(() => retireFaPolicy(w.users.alice, { client }),
    FA_POLICY_INVALID, "p932.door.not_set: retiring a second time finds nothing active");
});

// ===========================================================================================
// p932.version — VERSION-FORWARD, NEVER MUTATE.
// ===========================================================================================

test("p932.version setting a policy twice retires the old row and mints a new one at version+1; exactly one row stays active", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("version");

  const v1 = await setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36 });
  assert.equal(v1.version, 1, "the first set on a fresh account is version 1");
  const v2 = await setFaPolicy(w.users.alice, { client, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2000 });
  assert.equal(v2.version, 2, "a second set is version 2, one higher than any this account has ever carried");

  const rows = await policyRows(client);
  assert.equal(rows.length, 2, "both rows survive — append-only, never mutated");
  const actives = rows.filter((r) => r.active);
  assert.equal(actives.length, 1, "exactly one row is active");
  assert.equal(actives[0].version, 2);
  const retired = rows.find((r) => r.version === 1);
  assert.equal(retired.active, false);
  assert.ok(retired.retired_at, "the superseded row carries a retirement instant");
  assert.equal(retired.method, "straight_line", "the retired row keeps ITS OWN method, untouched by the set that replaced it");
});

// ===========================================================================================
// p932.birth — AC2/AC3: THE BIRTH SITE.
// ===========================================================================================

const COST_CENTS = 36_000;

test("p932.birth.covered an acquisition on a policy-covered account is born ACTIVE and COMPLETE from the policy, no 'particulars pending' description, with the policy's id and version stamped", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("covered");
  const pol = await setFaPolicy(w.users.alice, {
    client, method: "straight_line", usefulLifeMonths: 36, residualCents: 1_200, reason: "p932 fixture",
  });

  const { asset } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-2), 6) });
  const row = await faRow(asset.id);

  assert.equal(row.status, "active");
  assert.equal(row.depreciation_method, "straight_line");
  assert.equal(row.useful_life_months, 36);
  assert.equal(row.depreciation_rate_bps, null);
  assert.equal(Number(row.residual_cents), 1_200);
  assert.equal(String(row.depreciation_start_date).slice(0, 10), dayIn(mon(-2), 6),
    "the start date is the ACQUISITION's own posting date, not today and not the policy's effective_from (owner ruling 2026-09-18)");
  assert.equal(row.depreciation_policy_id, pol.policy_id);
  assert.equal(row.depreciation_policy_version, 1);
  assert.ok(!row.description.includes("particulars pending"),
    `the description no longer says "particulars pending" (got ${JSON.stringify(row.description)})`);

  const json = await rootQuery(
    "select clara._fa_asset_json(id, current_date) as j from clara.fixed_assets where id = $1", [asset.id]);
  const j = json.rows[0].j;
  assert.equal(j.particulars_complete, true,
    "clara._fa_particulars_complete reports the row COMPLETE — the same predicate the depreciation engine gates on, driven with no code of its own touched");
  assert.equal(j.depreciation_policy_id, pol.policy_id);
  assert.equal(j.depreciation_policy_version, 1);
});

test("p932.birth.uncovered an account with no policy still parks the question exactly as before — regression against 0247's own shape", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("uncovered");

  const { asset } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-2), 6) });
  const row = await faRow(asset.id);

  assert.equal(row.status, "active");
  assert.equal(row.depreciation_method, null, "no policy -> method stays unset, exactly as before");
  assert.equal(row.depreciation_start_date, null, "no policy -> no start date until a person completes it");
  assert.equal(row.depreciation_policy_id, null);
  assert.equal(row.depreciation_policy_version, null);
  assert.ok(row.description.includes("particulars pending"),
    `an uncovered acquisition still carries the "particulars pending" placeholder (got ${JSON.stringify(row.description)})`);

  const json = await rootQuery(
    "select clara._fa_asset_json(id, current_date) as j from clara.fixed_assets where id = $1", [asset.id]);
  assert.equal(json.rows[0].j.particulars_complete, false, "the row is NOT complete — the question is still open");
});

// ===========================================================================================
// p932.frozen — AC2's "stated particulars always win", driven the one way this estate can drive
// it today.
// ===========================================================================================

test("p932.frozen a policy-born row is a COMPLETE row like any other: complete_fixed_asset_particulars refuses it fa_particulars_already_complete, and revise_fixed_asset_particulars — the one door that can change a completed row — still can", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("frozen");
  await setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 24 });
  const { asset } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-2), 6) });

  await refuses(
    () => completeParticulars(w.users.alice, {
      client, asset: asset.id,
      particulars: { method: "straight_line", useful_life_months: 12, start_date: dayIn(mon(-2), 6) },
    }),
    "fa_particulars_already_complete",
    "p932.frozen: a policy-born row cannot be silently re-derived through the completion door");

  const revised = await reviseParticulars(w.users.alice, {
    client, asset: asset.id,
    particulars: { method: "straight_line", useful_life_months: 12, start_date: dayIn(mon(-2), 6) },
    effectiveFrom: dayIn(mon(1), 1),
  });
  assert.ok(revised, "the EXISTING prospective revision door still reaches a policy-born row, exactly as AC1 says a person may revise it");
  noteLane("p932.frozen: a policy-born row refuses a second completion and accepts the existing prospective revision — there is today no mechanism for an acquisition entry itself to carry particulars (grepped, none exists), so 'stated particulars always win' has nothing to override");
});

// ===========================================================================================
// p932.no_touch — A POLICY CHANGE NEVER TOUCHES A ROW A PRIOR VERSION ALREADY BIRTHED.
// ===========================================================================================

test("p932.no_touch changing a policy affects LATER acquisitions only — an asset born under v1 keeps v1's particulars and stamp after the policy is replaced by v2", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("notouch");
  const v1 = await setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36 });
  const { asset: assetA } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-3), 5) });

  const v2 = await setFaPolicy(w.users.alice, { client, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2500 });
  const { asset: assetB } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-1), 5) });

  const rowA = await faRow(assetA.id);
  assert.equal(rowA.depreciation_method, "straight_line");
  assert.equal(rowA.useful_life_months, 36);
  assert.equal(rowA.depreciation_policy_version, 1,
    "asset A keeps v1's stamp — the policy that superseded it never touches an already-born row");

  const rowB = await faRow(assetB.id);
  assert.equal(rowB.depreciation_method, "reducing_balance");
  assert.equal(rowB.depreciation_rate_bps, 2500);
  assert.equal(rowB.depreciation_policy_version, 2, "asset B is born under the CURRENT policy, v2");

  assert.equal(v1.policy_id, (await policyRows(client)).find((r) => r.version === 1).id);
  assert.equal(v2.policy_id, (await policyRows(client)).find((r) => r.version === 2).id);
});

// ===========================================================================================
// p932.run — AC4: THE DEPRECIATION ENGINE PICKS A POLICY-BORN ASSET UP, WITH NO CODE OF ITS OWN
// TOUCHED.
// ===========================================================================================

test("p932.run a policy-born asset is picked up by the UNTOUCHED depreciation engine on its next run", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("run");
  await setFaPolicy(w.users.alice, { client, method: "straight_line", usefulLifeMonths: 36, residualCents: 0 });
  const { asset } = await buyAsset({ client, cents: COST_CENTS, postingDate: dayIn(mon(-3), 5) });

  await liveAuthority(client, "monthly");
  const runs = await drainDue(client);
  assert.ok(runs.length > 0, "at least one period ran once the policy-born asset made one due");

  const charges = await chargeRows(asset.id);
  assert.ok(charges.length > 0,
    `the policy-born asset was charged at least once by the SAME engine every other asset uses (got ${charges.length} charge rows)`);
  assert.ok(charges.every((c) => Number(c.amount_cents) > 0), "every charge on a straight_line asset with no residual is strictly positive");

  const row = await faRow(asset.id);
  assert.ok(Number(row.accumulated_depreciation_cents) >= 0);
  noteLane(`p932.run: ${charges.length} charge row(s) posted for the policy-born asset through clara._fa_compute_charges / clara._fa_run_period_core, pinned unmoved by 0277's own prestate/tail`);
});
