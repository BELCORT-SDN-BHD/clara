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
    assert.deepEqual((await rootQuery(
      "select evaluator_name,deployed from clara.evaluator_versions order by evaluator_name",
    )).rows, [
      { evaluator_name: "assess_metric_cell_independent", deployed: false },
      { evaluator_name: "evaluate_metric", deployed: false },
    ]);
    await withActor({ transaction: true }, async (db) => {
      const identity = (await db.query("select current_user,session_user")).rows[0];
      assert.equal(identity.current_user, identity.session_user,
        "the deployment ceremony uses the direct session principal");
      await db.query("update clara.evaluator_versions set deployed=true where not deployed");
      assert.equal((await db.query(
        "select count(*)::int n from clara.evaluator_versions where deployed",
      )).rows[0].n, 2);
      assert.equal((await db.query(
        "select clara.verify_evaluator_freeze() r",
      )).rows[0].r.verified_deployed, 2);
    });
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.evaluator_versions where deployed",
    )).rows[0].n, 2, "the named ceremony commits both registered closures before algebra runs");
  });
  await registerPackPhase(t);
  await registerAlgebraPhase(t);
  await registerAccountSetAcceptancePhase(t);
  await registerRetainedSamplingPhase(t);
  await registerHardeningPhase(t);
  await registerCellCapPhase(t);
});

after(async () => { await endPool(); });
