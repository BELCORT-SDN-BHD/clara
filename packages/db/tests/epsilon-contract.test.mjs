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
/** The one registered closure this shared ceremony deliberately LEAVES undeployed. F-A5 PR-1
 *  registers clara.evaluate_fs_pack_agent v1 born undeployed, and its deploy flip is a ceremony
 *  of its own (design §3.2 / F5-D28: the agent pack core resolves its own row and refuses
 *  `evaluator_undeployed` until the owner flips it). This file runs at #13 of the estate's
 *  alphabetical order and F-A5's battery at #31, so a blanket `where not deployed` here would
 *  flip that row before its gate cell could ever see it refuse — a cell that cannot fail. The
 *  exclusion is one NAME, and the assertion below is what stops it widening silently. */
const CEREMONY_EXCLUDED = "evaluate_fs_pack_agent";
/** THE SECOND EXCLUSION, added by F-A5b card 1 and keyed BY NAME AND VERSION.
 *  clara.evaluate_metric **v2** is the substitution seam's stage-(b) evaluator. It ships DARK by
 *  design (CD-15 — the flip is a separate ceremony act under the bare migration principal), and
 *  f-a5b-card1-seam-stage-b.test.mjs's B5.6 owns the one-shot pre-flip refusal, as F-A5's cell D
 *  owns evaluate_fs_pack_agent's. The key HAS to be (name, version): evaluate_metric v1 must still
 *  deploy here, and a name-only predicate would exclude both versions of the family. */
const CEREMONY_EXCLUDED_V2 = ["evaluate_metric", 2];
const EXCLUDED_PAIRS_SQL = "(('evaluate_fs_pack_agent',1),('evaluate_metric',2))";

async function ensureEvaluatorDeployed() {
  const pending = (await rootQuery(
    `select count(*)::int n from clara.evaluator_versions
      where not deployed and (evaluator_name, version) not in ${EXCLUDED_PAIRS_SQL}`)).rows[0].n;
  // FREE TRIPWIRE, read BEFORE the flip below can touch anything: `pending > 0` means the five
  // covered closures were STILL undeployed the instant this function started -- which PROVES
  // F-A5 PR-1's row must be undeployed too, because nothing in this estate ever flips it without
  // first flipping the covered five (cell D's own file runs its own covered-five ceremony in its
  // `before` hook before cell D itself touches evaluate_fs_pack_agent). A false reading here
  // means some fixture bypassed that order and destroyed the born-undeployed witness estate-wide
  // -- exactly the unscoped-sweep class zeta-fixtures.mjs guards against elsewhere.
  const fresh = pending > 0;
  if (pending > 0) {
    await withActor({ transaction: true }, async (db) => {
      await db.query(
        `update clara.evaluator_versions set deployed=true
          where not deployed and (evaluator_name, version) not in ${EXCLUDED_PAIRS_SQL}`);
    });
  }
  const verified = (await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r;
  // FIVE is the floor this ceremony covers (delta's two, F-A1's two 0091/0092, and F-A2's
  // opener-① evaluate_witness_fact_state **v2** — a NEW closure beside the frozen v1, never a
  // recut of it). It stays FIVE across F-A5 PR-1's sixth registration precisely because that
  // sixth row is excluded above — UNLESS a PRIOR run's f-a5-reporting-agency-pr1.test.mjs cell D
  // already flipped it too (its own, separate, one-way ceremony persists across invocations),
  // in which case the true total is SIX. Read back, never assumed — delta-contract.test.mjs is
  // where the roster is pinned BY NAME AND VERSION, and where the sixth row's own admission is
  // proven.
  const notDeployed = (await rootQuery(
    "select evaluator_name, version from clara.evaluator_versions where not deployed order by 1,2")).rows;
  const fsPackPending = notDeployed.some((row) => row.evaluator_name === CEREMONY_EXCLUDED);
  // F-A5b card 1's v2 row may not exist at all on a pre-card-1 chain, so its presence is MEASURED
  // rather than assumed — the same three-state discipline every frontier-sensitive read here uses.
  const v2Registered = (await rootQuery(
    "select exists(select 1 from clara.evaluator_versions where evaluator_name=$1 and version=$2 and firm_id is null) as ok",
    CEREMONY_EXCLUDED_V2)).rows[0].ok;
  const v2Pending = notDeployed.some(
    (row) => row.evaluator_name === CEREMONY_EXCLUDED_V2[0] && row.version === CEREMONY_EXCLUDED_V2[1]);
  if (fresh) {
    assert.equal(fsPackPending, true,
      "a fresh witness (the covered five were undeployed BEFORE this ceremony ran) requires F-A5 PR-1's row to still be undeployed too");
    if (v2Registered) {
      assert.equal(v2Pending, true,
        "a fresh witness also requires card 1's evaluate_metric v2 to still be undeployed — it ships DARK until its own ceremony (CD-15)");
    }
  }
  // FIVE is what this ceremony COVERS. Each excluded row adds one to the deployed total only if
  // ITS OWN separate, one-way ceremony has already run in some prior invocation — which is read
  // back here, never assumed.
  const extra = (fsPackPending ? 0 : 1) + (v2Registered && !v2Pending ? 1 : 0);
  assert.equal(verified.verified_deployed, 5 + extra,
    `the one-way evaluator ceremony committed every registered closure it covers (plus ${extra} row(s) some prior run's own ceremony had already flipped)`);
  // AND THE EXCLUSION IS EXACTLY THE NAMED ROWS THAT ARE STILL PENDING — read back, never assumed.
  // Without this, a later lane's closure would silently inherit the exemption and go undeployed
  // with no cell noticing.
  const expectedPending = [
    ...(fsPackPending ? [{ evaluator_name: CEREMONY_EXCLUDED, version: 1 }] : []),
    ...(v2Registered && v2Pending
      ? [{ evaluator_name: CEREMONY_EXCLUDED_V2[0], version: CEREMONY_EXCLUDED_V2[1] }] : []),
  ];
  assert.deepEqual(notDeployed, expectedPending,
    "the only closures this ceremony leaves undeployed are the ones that own their own flip");
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
