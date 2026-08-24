import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, endPool } from "./delta-fixtures.mjs";
import { registerCatalogPhase } from "./delta-catalog-phase.mjs";
import { registerAlgebraPhase } from "./delta-algebra-phase.mjs";
import { registerAccountSetAcceptancePhase } from "./delta-account-set-acceptance-phase.mjs";
import { registerRetainedSamplingPhase } from "./delta-retained-sampling-phase.mjs";
import { registerCellCapPhase } from "./delta-cell-cap-concurrency-phase.mjs";
import { registerHardeningPhase } from "./delta-hardening-phase.mjs";
import { registerPackPhase } from "./delta-pack-phase.mjs";

/** The one registered closure the test-time evaluator ceremony deliberately leaves undeployed —
 *  F-A5 PR-1's agent pack entrypoint, whose deploy flip is a ceremony of its own and whose
 *  refusal its own battery must be able to observe. Named identically in
 *  epsilon-contract.test.mjs and eta-behaviour-phase.mjs; the exclusion's WIDTH is asserted
 *  wherever it is applied, so it can never widen without a cell going red. */
const CEREMONY_EXCLUDED = "evaluate_fs_pack_agent";

/** Pre-integration gating, stated once for the whole delta contract: a PACKAGE-WIDE run may precede
 *  the delta migrations, so `tests/delta-preintegration-gate.mjs` (preloaded by the package test
 *  script) sets CLARA_ALLOW_MISSING_WAVE_E_DELTA and this suite skips LOUDLY. A FOCUSED run does not
 *  preload the gate, so an unmigrated database fails here instead of greening through. */
async function deltaPresent() {
  return (await rootQuery(`select to_regclass('clara.metric_cells') is not null
    and to_regclass('clara.metric_evaluation_attempt_receipts') is not null as ok`)).rows[0].ok;
}

test("delta contract requires a fresh disposable DB and runs its one-way ceremony in order", async (t) => {
  if (!(await deltaPresent())) {
    if (process.env.CLARA_ALLOW_MISSING_WAVE_E_DELTA === "1") {
      console.warn("SKIP delta contract: the Wave E delta migrations are not applied to this database (explicit pre-integration run).");
      t.skip("Wave E delta not applied -- explicit pre-integration run");
      return;
    }
    assert.fail("Wave E delta is required for a focused or post-migration run: apply the delta migrations, or set CLARA_ALLOW_MISSING_WAVE_E_DELTA=1 for the package-wide pre-integration sweep");
  }
  await registerCatalogPhase(t);
  await t.test("the direct deployment login performs the one-way evaluator ceremony", async () => {
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.metric_cells",
    )).rows[0].n, 0, "a reused/consumed database is not valid evidence for this one-shot contract");
    // CLOSED-WORLD ROSTER, extended rather than loosened: F-A1 (Wave-F Track A, migrations
    // 0091/0092) registers two further closures — clara.evaluate_witness_fact_state_v1, the
    // witness-pair corroboration predicate, and clara.evaluate_witness_identity_v1, its identity
    // leaf carrying its own one-member closure so the source-side freeze lint discovers it.
    // F-A2 (opener ①) then registers evaluate_witness_fact_state **version 2**, the three-locks
    // nil-tax arm: a NEW closure beside the frozen v1, never a recut of it, which is why the
    // family now has two rows and the VERSION has to be selected — a name-only roster would have
    // read the two as one row and silently stopped counting. All of them are BORN UNDEPLOYED
    // like delta's, which is the property this assertion is really about.
    assert.deepEqual((await rootQuery(
      "select evaluator_name,version,deployed from clara.evaluator_versions order by evaluator_name,version",
    )).rows, [
      { evaluator_name: "assess_metric_cell_independent", version: 1, deployed: false },
      { evaluator_name: "evaluate_fs_pack_agent", version: 1, deployed: false },
      { evaluator_name: "evaluate_metric", version: 1, deployed: false },
      { evaluator_name: "evaluate_witness_fact_state", version: 1, deployed: false },
      { evaluator_name: "evaluate_witness_fact_state", version: 2, deployed: false },
      { evaluator_name: "evaluate_witness_identity", version: 1, deployed: false },
    ]);
    await withActor({ transaction: true }, async (db) => {
      const identity = (await db.query("select current_user,session_user")).rows[0];
      assert.equal(identity.current_user, identity.session_user,
        "the deployment ceremony uses the direct session principal");
      await db.query(
        "update clara.evaluator_versions set deployed=true where not deployed and evaluator_name <> $1",
        [CEREMONY_EXCLUDED]);
      // FIVE, not two: delta's evaluate_metric + assess_metric_cell_independent, F-A1's
      // evaluate_witness_fact_state (v1) + evaluate_witness_identity, and F-A2's
      // evaluate_witness_fact_state **v2** — the three-locks nil-tax arm, a NEW closure beside the
      // frozen v1 rather than a recut of it. The registered roster is SIX since F-A5 PR-1 (it is
      // pinned by name AND VERSION three lines above); this ceremony commits the five it COVERS.
      //
      // ONE ROW IS EXCLUDED BY NAME, and it is excluded here as well as in epsilon's and eta's
      // helpers because `withActor({transaction:true})` COMMITS: a flip here is not undone, and it
      // would deploy F-A5's closure at estate position 12, long before the cell that measures its
      // refusal runs (f-a5-reporting-agency-pr1.test.mjs, cell D — the gate F5-D28 calls
      // "mechanical, not believed"). That cell owns the flip, and proves the one-way trigger
      // admits this row like any other by watching the gate stop refusing.
      assert.equal((await db.query(
        "select count(*)::int n from clara.evaluator_versions where deployed",
      )).rows[0].n, 5);
      assert.equal((await db.query(
        "select clara.verify_evaluator_freeze() r",
      )).rows[0].r.verified_deployed, 5);
      // AND THE EXCLUSION IS EXACTLY ONE NAMED ROW — read back, never assumed, so a later lane's
      // closure cannot silently inherit the exemption and go undeployed with no cell noticing.
      assert.deepEqual((await db.query(
        "select evaluator_name, version from clara.evaluator_versions where not deployed order by 1,2",
      )).rows, [{ evaluator_name: CEREMONY_EXCLUDED, version: 1 }],
      "the only closure this ceremony leaves undeployed is F-A5 PR-1's, which owns its own flip");
    });
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.evaluator_versions where deployed",
    )).rows[0].n, 5, "the named ceremony commits every registered closure it covers before algebra runs");
  });
  await registerPackPhase(t);
  await registerAlgebraPhase(t);
  await registerAccountSetAcceptancePhase(t);
  await registerRetainedSamplingPhase(t);
  await registerHardeningPhase(t);
  await registerCellCapPhase(t);
});

after(async () => { await endPool(); });
