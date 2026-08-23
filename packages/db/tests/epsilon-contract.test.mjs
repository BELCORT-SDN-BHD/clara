// Wave E lane EPSILON -- the contract battery. THE test file; every other epsilon-*.mjs is a
// module it imports.
//
// PRESENCE GATE: with CLARA_ALLOW_MISSING_WAVE_E_EPSILON=1 an un-migrated database SKIPS loudly;
// with the variable unset it FAILS. A pre-epsilon run therefore stays honest rather than quietly
// green -- the delta lane's idiom (delta-context-pack-residual.test.mjs:23).
//
// The phases run IN ORDER on one database: layers -> claim -> chart -> artifact -> grants. The
// grant phase runs last on purpose, so it reads the privilege state the whole battery leaves
// behind rather than the state the migration alone produced.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { endPool, buildWorld, rootQuery, withActor, skipUnlessEpsilon } from "./epsilon-fixtures.mjs";
import { registerLayersPhase } from "./epsilon-layers-phase.mjs";
import { registerClaimPhase } from "./epsilon-claim-phase.mjs";
import { registerChartPhase } from "./epsilon-chart-phase.mjs";
import { registerArtifactPhase } from "./epsilon-artifact-phase.mjs";
import { registerGrantsPhase } from "./epsilon-grants-phase.mjs";

// Delta's evaluator versions are BORN undeployed and a one-way ceremony flips them
// (delta-contract.test.mjs runs it as its own second step). Epsilon evaluates cells, so it needs
// that ceremony to have happened -- and performs it here ONLY if it has not, so this battery is
// runnable on its own pristine database as well as after delta's. It is never re-run: delta's
// trigger admits the undeployed->deployed transition and nothing else.
//
// ORDER ON A SHARED DATABASE: delta's contract battery must run FIRST, because it asserts a
// pristine `metric_cells` and an undeployed evaluator as its own preconditions. Epsilon mints
// cells, so a delta run after epsilon would fail on those preconditions rather than on a defect.
async function ensureEvaluatorDeployed() {
  const pending = (await rootQuery(
    "select count(*)::int n from clara.evaluator_versions where not deployed")).rows[0].n;
  if (pending === 0) return "already deployed";
  await withActor({ transaction: true }, async (db) => {
    await db.query("update clara.evaluator_versions set deployed=true where not deployed");
  });
  const verified = (await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r;
  // SIX since F-A2 (opener ①) registered clara.evaluate_witness_fact_state **v2** — the
  // three-locks nil-tax arm, a NEW closure beside the frozen v1 rather than a recut of it —
  // joining F-A1's evaluate_witness_fact_state_v1 and evaluate_witness_identity_v1 (0091/0092),
  // delta's two, and F-A8 PR-1's evaluate_policy_source_value_v1 (v3/IL-D20). The flip above is
  // `where not deployed`, so it commits the whole registered roster; this asserts the roster's
  // SIZE, and delta-contract.test.mjs is where the roster is pinned BY NAME AND VERSION.
  assert.equal(verified.verified_deployed, 6, "the one-way evaluator ceremony committed every registered closure");
  return `deployed ${pending}`;
}

test("Wave E lane epsilon -- the FS reporting layer, end to end", async (t) => {
  if (await skipUnlessEpsilon(t)) return;
  await ensureEvaluatorDeployed();
  const world = await buildWorld();
  await t.test("layers: template model, floors, publication freeze, the two E-R8 walls",
    (sub) => registerLayersPhase(sub, world));
  await t.test("claim: the four ruled states and the whole gate-1 matrix",
    (sub) => registerClaimPhase(sub, world));
  await t.test("chart: the closed AST and the four-stage pipeline",
    (sub) => registerChartPhase(sub, world));
  await t.test("artifacts: insert-once, the chain, the manifest, verify, issue",
    (sub) => registerArtifactPhase(sub, world));
  await t.test("grants: RLS isolation and the privilege matrix, read positively",
    (sub) => registerGrantsPhase(sub, world));
});

after(async () => { await endPool(); });
