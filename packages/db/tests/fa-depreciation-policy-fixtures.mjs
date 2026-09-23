// #932 [0277, a default depreciation policy per enrolled fixed-asset account] — the battery's
// frontier gate, its client factory and its two door wrappers. NOT a test file: the name does
// not end in `.test.mjs`, so `node --test` ignores it.
//
// Mirrors fa-birth-watermark-fixtures.mjs exactly (this lane's own prior ticket, #972).
//
// Fixture clients are named `p932_…`, outside the x41 family — this battery is not a tie-out
// sweep and has no reason to enrol in x41.s4's own allow-list.

import assert from "node:assert/strict";
import {
  rootQuery, opk, markSkip, humanCall,
  faWorld, buildFaChart, createClient, grantConsent, upsertFaProfile, uniqTag,
  COST, ACCUM, EXPENSE, LAND,
} from "./x41-fa-world.mjs";

export * from "./x41-fa-world.mjs";

// ===========================================================================================
// 1 · The frontier gate — on 0277's STABLE STEM, never its number (a number is claimed at
//     MERGE, a stem is not).
// ===========================================================================================

/** `0277_fa_default_depreciation_policy.sql` → `fa_default_depreciation_policy$`. */
export const FA_DEFAULT_DEPRECIATION_POLICY_STEM = "fa_default_depreciation_policy$";

let _ready = null;
export async function fa932Ready() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_DEFAULT_DEPRECIATION_POLICY_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#932 migration (${FA_DEFAULT_DEPRECIATION_POLICY_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  fa-depreciation-policy-preintegration-gate.mjs) FAILS LOUDLY below 0277 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate932(t) {
  if (await fa932Ready()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_DEFAULT_DEPRECIATION_POLICY !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-depreciation-policy-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#932 default depreciation policy absent (no ${FA_DEFAULT_DEPRECIATION_POLICY_STEM} migration applied)`);
  return true;
}

/** `0280_fa_policy_enrolment_congruence.sql` → `fa_policy_enrolment_congruence$`. #932's fix
 *  round (adversarial review ADV-L04-1): a default policy applies only while it still FITS the
 *  enrolment it was validated against. Its own stem, because a chain can carry 0277 without it. */
export const FA_POLICY_ENROLMENT_CONGRUENCE_STEM = "fa_policy_enrolment_congruence$";

let _ready0280 = null;
async function fa932cReady() {
  if (_ready0280 === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_POLICY_ENROLMENT_CONGRUENCE_STEM]);
      _ready0280 = r.rows[0].n > 0;
    } catch {
      _ready0280 = false;
    }
  }
  return _ready0280;
}

/** The per-CELL frontier gate for the fix round, COUNTED — `gate932`'s exact shape on 0280's own
 *  stem. A FOCUSED invocation FAILS LOUDLY below 0280: a skip is not evidence. */
export async function gate932c(t) {
  if (await gate932(t)) return true;
  if (await fa932cReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_POLICY_ENROLMENT_CONGRUENCE !== "1") {
    assert.fail(
      `#932 fix-round migration (${FA_POLICY_ENROLMENT_CONGRUENCE_STEM}) is NOT applied to this `
      + "database, and this is a FOCUSED run. A skip is not evidence: apply the migration, or "
      + "preload tests/fa-policy-enrolment-congruence-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#932 enrolment-congruence guard absent (no ${FA_POLICY_ENROLMENT_CONGRUENCE_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The client factory. Outside the x41 family, on the x41 chart, with the cost account
//     enrolled unless the cell asks otherwise.
// ===========================================================================================

/** A fresh firm-A client on the x41 chart, named OUTSIDE the x41 family (see this file's
 *  header). `enrol: false` leaves the cost account UN-enrolled so a not_enrolled cell can drive
 *  the door before any profile exists. `land: true` enrols the LAND (non-depreciable) account
 *  instead of the ordinary COST account, for the non_depreciable axis. */
export async function p932Client(label, { enrol = true, land = false } = {}) {
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `p932_${label}_${uniqTag()}`, opKey: opk("p932cli") });
  await buildFaChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  if (enrol) {
    if (land) {
      await upsertFaProfile(sub, { client, assetAccount: LAND, accumAccount: null, expenseAccount: null });
    } else {
      await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
    }
  }
  return client;
}

// ===========================================================================================
// 3 · THE TWO NEW DOORS — pinned verb wrappers, the x41-fa-fixtures.mjs `humanCall` idiom
//     (NAMED args verbatim from this file's own migration signature).
// ===========================================================================================

export const setFaPolicy = (sub, {
  client, assetAccount = COST, method, usefulLifeMonths = null, rateBps = null,
  residualCents = null, reason = null, opKey = null,
}) =>
  humanCall(sub, "set_fa_depreciation_policy", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_method" },
    { name: "p_useful_life_months", cast: "int" }, { name: "p_rate_bps", cast: "int" },
    { name: "p_residual_cents", cast: "bigint" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, assetAccount, method, usefulLifeMonths, rateBps, residualCents, reason,
    opKey ?? opk("p932set")]);

export const retireFaPolicy = (sub, { client, assetAccount = COST, reason = null, opKey = null }) =>
  humanCall(sub, "retire_fa_depreciation_policy", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_reason" }, { name: "p_op_key" },
  ], [client, assetAccount, reason, opKey ?? opk("p932ret")]);

/** The refusal reason token both new doors use — contract-local to this ticket (0041's own `T`
 *  roster, x41-fa-fixtures.mjs, carries `profileInvalid`/`fa_profile_invalid` for the ENROLMENT
 *  door; this is the SET/RETIRE POLICY doors' own, distinct token). */
export const FA_POLICY_INVALID = "fa_policy_invalid";

/** The live rows for one enrolled account, newest first — a root readback, assertions only. */
export const policyRows = (client, assetAccount = COST) =>
  rootQuery(
    "select * from clara.fa_account_depreciation_policies where client_id = $1 and asset_account_code = $2 order by version desc",
    [client, assetAccount],
  ).then((r) => r.rows);

export const activePolicyRow = async (client, assetAccount = COST) => {
  const rows = await policyRows(client, assetAccount);
  return rows.find((r) => r.active) ?? null;
};
