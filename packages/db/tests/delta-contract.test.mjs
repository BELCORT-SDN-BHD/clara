import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, withActor, endPool, evaluatorCeremonyUnwitnessed } from "./delta-fixtures.mjs";
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
/** THE SECOND EXCLUSION (F-A5b card 1). clara.evaluate_metric **v2** — the substitution seam's
 *  stage-(b) evaluator — is registered beside the frozen v1 and ships DARK: CD-15 makes the flip a
 *  separate ceremony act, and f-a5b-card1-seam-stage-b.test.mjs's B5.6 owns the one-shot pre-flip
 *  refusal, exactly as F-A5's cell D owns evaluate_fs_pack_agent's. The exclusion is keyed BY NAME
 *  AND VERSION and cannot be keyed by name alone: evaluate_metric v1 must still deploy here. */
const CEREMONY_EXCLUDED_V2 = Object.freeze({ evaluator_name: "evaluate_metric", version: 2 });
/** THE THIRD EXCLUSION — F-A4 PR-2a's clara.prepayment_schedule_v1, wrapper 12's evaluator. It
 *  ships DARK (`deployed = false`) because the RUNTIME half is PR-2b; the freeze binds regardless,
 *  since the flag is about traffic and not about immutability. Keyed BY NAME AND VERSION like
 *  card 1's, and added here in the SAME PR that registers it — the closed-wave floor rule. */
const CEREMONY_EXCLUDED_V3 = { evaluator_name: "prepayment_schedule", version: 1 };
const EXCLUDED_PAIRS_SQL =
  "(('evaluate_fs_pack_agent',1),('evaluate_metric',2),('prepayment_schedule',1))";

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
    // FRESH: this database has never witnessed the ceremony. NOT FRESH: a PRIOR invocation
    // against this SAME database already did (re-run, not a defect -- 0060's
    // `_tf_evaluator_deploy_once` admits exactly one undeployed->deployed transition per row,
    // EVER). Every assertion below stays STRONG in both shapes -- computed from what this run
    // actually reads, never skipped -- rather than assuming a precondition that a re-run makes
    // honestly false.
    const fresh = await evaluatorCeremonyUnwitnessed();
    // metric_cells is corroborating evidence ONLY on the fresh arm. On a re-run it is NOT honest
    // evidence of a PRIOR invocation: registerCatalogPhase's own re-run arm (above) already mints
    // a cell in THIS SAME invocation before this subtest ever runs, so `count > 0` would be
    // trivially true regardless of whether the database is actually reused. `fresh` (from
    // evaluatorCeremonyUnwitnessed(), read before anything in this pass could have minted a cell)
    // is the real signal; no honest corroboration is available from this table on the other arm.
    if (fresh) {
      const cellsCount = (await rootQuery("select count(*)::int n from clara.metric_cells")).rows[0].n;
      assert.equal(cellsCount, 0, "a reused/consumed database is not valid evidence for this one-shot contract");
    }
    const fsPackDeployed = fresh ? false : (await rootQuery(
      "select deployed from clara.evaluator_versions where evaluator_name=$1 and version=1", [CEREMONY_EXCLUDED],
    )).rows[0].deployed;
    // F-A5b card 1's evaluate_metric v2 may not exist at all on a pre-card-1 chain, so BOTH its
    // presence and its deploy state are MEASURED. A row that is absent is neither required nor
    // forbidden — it is simply not this database's business yet, which is the shape that keeps
    // this closed-world cell bimodal-green across the frontier.
    const v2Row = (await rootQuery(
      "select deployed from clara.evaluator_versions where evaluator_name=$1 and version=$2 and firm_id is null",
      [CEREMONY_EXCLUDED_V2.evaluator_name, CEREMONY_EXCLUDED_V2.version])).rows[0];
    const v2Registered = v2Row !== undefined;
    const v2Deployed = v2Registered && v2Row.deployed === true;
    // F-A4 PR-2a's prepayment closure, on the same three-state footing for the same reason.
    const v3Row = (await rootQuery(
      "select deployed from clara.evaluator_versions where evaluator_name=$1 and version=$2 and firm_id is null",
      [CEREMONY_EXCLUDED_V3.evaluator_name, CEREMONY_EXCLUDED_V3.version])).rows[0];
    const v3Registered = v3Row !== undefined;
    const v3Deployed = v3Registered && v3Row.deployed === true;
    // CLOSED-WORLD ROSTER, extended rather than loosened: F-A1 (Wave-F Track A, migrations
    // 0091/0092) registers two further closures — clara.evaluate_witness_fact_state_v1, the
    // witness-pair corroboration predicate, and clara.evaluate_witness_identity_v1, its identity
    // leaf carrying its own one-member closure so the source-side freeze lint discovers it.
    // F-A2 (opener ①) then registers evaluate_witness_fact_state **version 2**, the three-locks
    // nil-tax arm: a NEW closure beside the frozen v1, never a recut of it, which is why the
    // family now has two rows and the VERSION has to be selected — a name-only roster would have
    // read the two as one row and silently stopped counting. All of them are BORN UNDEPLOYED
    // like delta's on a fresh witness; on a re-run the five delta/epsilon covers are deployed
    // (monotone), and F-A5 PR-1's own row carries whatever cell D has separately witnessed.
    // firm_id is null: SCOPED to the global registered closures, the model f-a5:344 already uses
    // -- a firm-scoped evaluator_versions row (this table carries the column; some OTHER lane's
    // fixture could mint one) would otherwise silently widen this exact-array comparison past
    // six rows. order by evaluator_name,version is then fully DETERMINISTIC: with firm_id scoped
    // to null, (evaluator_name, version) is unique, so no tie-break is needed.
    assert.deepEqual((await rootQuery(
      "select evaluator_name,version,deployed from clara.evaluator_versions where firm_id is null order by evaluator_name,version",
    )).rows, [
      { evaluator_name: "assess_metric_cell_independent", version: 1, deployed: !fresh },
      { evaluator_name: "evaluate_fs_pack_agent", version: 1, deployed: fsPackDeployed },
      { evaluator_name: "evaluate_metric", version: 1, deployed: !fresh },
      // F-A5b card 1's stage-(b) evaluator, registered beside the frozen v1 — a NEW closure, never
      // a recut of it, which is why the family now carries two rows and the identity compared here
      // is name AND VERSION. Its deploy state is its OWN ceremony's, read back rather than assumed.
      ...(v2Registered
        ? [{ ...CEREMONY_EXCLUDED_V2, deployed: v2Deployed }]
        : []),
      { evaluator_name: "evaluate_witness_fact_state", version: 1, deployed: !fresh },
      { evaluator_name: "evaluate_witness_fact_state", version: 2, deployed: !fresh },
      { evaluator_name: "evaluate_witness_identity", version: 1, deployed: !fresh },
      // F-A4 PR-2a's prepayment evaluator, measured with the same three-state discipline: absent
      // entirely on a pre-PR-2a chain, and when present it carries its OWN ceremony's deploy state
      // rather than the covered-five's -- it ships DARK until PR-2b flips it.
      ...(v3Registered ? [{ ...CEREMONY_EXCLUDED_V3, deployed: v3Deployed }] : []),
    ]);
    await withActor({ transaction: true }, async (db) => {
      const identity = (await db.query("select current_user,session_user")).rows[0];
      assert.equal(identity.current_user, identity.session_user,
        "the deployment ceremony uses the direct session principal");
      // IDEMPOTENT: `where not deployed` matches zero rows once the covered five are already
      // deployed, so this is a safe no-op on a re-run — the trigger never fires for a row it
      // does not touch. Running it unconditionally, every time, IS part of the proof.
      await db.query(
        `update clara.evaluator_versions set deployed=true
          where not deployed and (evaluator_name, version) not in ${EXCLUDED_PAIRS_SQL}`);
      // FIVE, not two: delta's evaluate_metric + assess_metric_cell_independent, F-A1's
      // evaluate_witness_fact_state (v1) + evaluate_witness_identity, and F-A2's
      // evaluate_witness_fact_state **v2** — the three-locks nil-tax arm, a NEW closure beside the
      // frozen v1 rather than a recut of it. The registered roster is SIX since F-A5 PR-1 (it is
      // pinned by name AND VERSION three lines above); this ceremony commits the five it COVERS
      // — plus F-A5's own row too if cell D's SEPARATE ceremony already ran (re-run shape).
      //
      // ONE ROW IS EXCLUDED BY NAME, and it is excluded here as well as in epsilon's and eta's
      // helpers because `withActor({transaction:true})` COMMITS: a flip here is not undone, and it
      // would deploy F-A5's closure at estate position 12, long before the cell that measures its
      // refusal runs (f-a5-reporting-agency-pr1.test.mjs, cell D — the gate F5-D28 calls
      // "mechanical, not believed"). That cell owns the flip, and proves the one-way trigger
      // admits this row like any other by watching the gate stop refusing.
      // FIVE is what this ceremony COVERS. Each EXCLUDED row adds one to the deployed total only
      // if its OWN separate, one-way ceremony already ran in a prior invocation.
      const extra = (fsPackDeployed ? 1 : 0) + (v2Deployed ? 1 : 0);
      assert.equal((await db.query(
        "select count(*)::int n from clara.evaluator_versions where deployed",
      )).rows[0].n, 5 + extra);
      assert.equal((await db.query(
        "select clara.verify_evaluator_freeze() r",
      )).rows[0].r.verified_deployed, 5 + extra);
      // AND THE EXCLUSION IS EXACTLY THE NAMED ROWS THAT ARE STILL PENDING — read back, never
      // assumed, so a later lane's closure cannot silently inherit the exemption and go undeployed
      // with no cell noticing.
      assert.deepEqual((await db.query(
        "select evaluator_name, version from clara.evaluator_versions where not deployed order by 1,2",
      )).rows, [
        ...(fsPackDeployed ? [] : [{ evaluator_name: CEREMONY_EXCLUDED, version: 1 }]),
        ...(v2Registered && !v2Deployed ? [{ ...CEREMONY_EXCLUDED_V2 }] : []),
      ], "the only closures this ceremony leaves undeployed are the ones that own their own flip");
    });
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.evaluator_versions where deployed",
    )).rows[0].n, 5 + (fsPackDeployed ? 1 : 0) + (v2Deployed ? 1 : 0),
    "the named ceremony commits every registered closure it covers before algebra runs");
  });
  await registerPackPhase(t);
  await registerAlgebraPhase(t);
  await registerAccountSetAcceptancePhase(t);
  await registerRetainedSamplingPhase(t);
  await registerHardeningPhase(t);
  await registerCellCapPhase(t);
});

after(async () => { await endPool(); });
