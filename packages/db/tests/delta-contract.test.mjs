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
/** THE FOURTH EXCLUSION — #939's clara.prepayment_schedule_v2 (migration 0305), the memo-only
 *  lane's evaluator: v1's formula with the amount, the released account, the released side and the
 *  term supplied as ARGUMENTS so the DOOR picks the source leg and the term source. It is
 *  registered `deployed = false` for the same reason v1 is — evaluator versions are BORN
 *  undeployed and the flip is a separate one-way ceremony act under the bare migration principal
 *  (0060's `_tf_evaluator_deploy_once`) — and the freeze binds regardless, because the flag is
 *  about traffic and not about immutability. Without this entry the covered-five ceremony flips it
 *  on sight and the floor reads one too many, which is exactly what this rig reported the moment
 *  0305 applied.
 *
 *  ADDED IN THE SAME PR THAT REGISTERS IT — the closed-wave floor rule (packages/db/README.md,
 *  "Migration and deployment behavior"): a PR that moves a catalog object a closed-wave floor
 *  counts trues that floor itself. Keyed BY NAME AND VERSION like the three above, and it HAS to
 *  be: prepayment_schedule v1 is already excluded and a name-only predicate would have covered
 *  both by accident rather than by decision. */
const CEREMONY_EXCLUDED_V4 = { evaluator_name: "prepayment_schedule", version: 2 };
const EXCLUDED_PAIRS_SQL =
  "(('evaluate_fs_pack_agent',1),('evaluate_metric',2),('prepayment_schedule',1),('prepayment_schedule',2))";

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
    // #939's prepayment_schedule v2, on the same three-state footing for the same reason.
    const v4Row = (await rootQuery(
      "select deployed from clara.evaluator_versions where evaluator_name=$1 and version=$2 and firm_id is null",
      [CEREMONY_EXCLUDED_V4.evaluator_name, CEREMONY_EXCLUDED_V4.version])).rows[0];
    const v4Registered = v4Row !== undefined;
    const v4Deployed = v4Registered && v4Row.deployed === true;
    // RIDERS WAVE 4, LANE 01 — TWO COVERED CLOSURES, NOT TWO MORE EXCLUSIONS. #945's
    // evaluate_payroll_run_state v1 (0296) and #948's evaluate_agreement_contract_state v1
    // (0299) are registered for the FREEZE alone: neither ships dark, nothing in the estate
    // reads their `deployed` flag (the live census of bodies touching clara.evaluator_versions
    // names only the metric / report / prepayment families), and neither has a battery that must
    // witness a pre-flip refusal. So they are NOT in EXCLUDED_PAIRS_SQL and this ceremony commits
    // them like the original five. Their PRESENCE is measured, never assumed, because the rows do
    // not exist on a pre-0296 / pre-0299 chain — the same three-state discipline every
    // frontier-sensitive read in this cell uses.
    //
    // RIDERS SWEEP WAVE (S), LANE L4 — A THIRD COVERED CLOSURE ON THE SAME TERMS. #1048's
    // evaluate_payroll_run_state **v2** (0343) is a NEW closure beside the frozen v1, never a
    // recut of it: 0296:710 refuses an in-place edit at APPLY and 0343's own freeze block says
    // its only lawful repair is a _v3. It is covered rather than excluded for v1's own reasons,
    // re-measured on the integrated chain: it is not in EXCLUDED_PAIRS_SQL, it does not ship
    // dark, and the live census of bodies reading clara.evaluator_versions still names only the
    // metric / report / prepayment / revenue-recognition families. So this ceremony commits it
    // too, and the roster below has to carry it or the closed world reds on a lawful row.
    const coveredWave4 = (await rootQuery(
      `select evaluator_name, version from clara.evaluator_versions
        where firm_id is null
          and (evaluator_name, version) in (('evaluate_payroll_run_state',1),
                                            ('evaluate_payroll_run_state',2),
                                            ('evaluate_agreement_contract_state',1))
        order by evaluator_name, version`)).rows;
    const payrollRegistered = coveredWave4.some(
      (r) => r.evaluator_name === "evaluate_payroll_run_state" && r.version === 1);
    const payrollV2Registered = coveredWave4.some(
      (r) => r.evaluator_name === "evaluate_payroll_run_state" && r.version === 2);
    const agreementRegistered = coveredWave4.some((r) => r.evaluator_name === "evaluate_agreement_contract_state");
    const coveredNew = coveredWave4.length;
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
      // #948's agreement evaluator (0299) — a COVERED closure, so its state is the covered five's
      // own, not a separate ceremony's. Absent entirely on a pre-0299 chain.
      ...(agreementRegistered
        ? [{ evaluator_name: "evaluate_agreement_contract_state", version: 1, deployed: !fresh }]
        : []),
      { evaluator_name: "evaluate_fs_pack_agent", version: 1, deployed: fsPackDeployed },
      { evaluator_name: "evaluate_metric", version: 1, deployed: !fresh },
      // F-A5b card 1's stage-(b) evaluator, registered beside the frozen v1 — a NEW closure, never
      // a recut of it, which is why the family now carries two rows and the identity compared here
      // is name AND VERSION. Its deploy state is its OWN ceremony's, read back rather than assumed.
      ...(v2Registered
        ? [{ ...CEREMONY_EXCLUDED_V2, deployed: v2Deployed }]
        : []),
      // #945's payroll evaluator (0296), on the same covered footing as #948's above.
      ...(payrollRegistered
        ? [{ evaluator_name: "evaluate_payroll_run_state", version: 1, deployed: !fresh }]
        : []),
      // #1048's payroll evaluator v2 (0343, riders sweep wave lane L4) — a NEW closure beside the
      // frozen v1, which is why the family now carries two rows here too and the identity
      // compared is name AND VERSION. Covered, so its state is the covered set's own, not a
      // separate ceremony's. Absent entirely on a pre-0343 chain.
      ...(payrollV2Registered
        ? [{ evaluator_name: "evaluate_payroll_run_state", version: 2, deployed: !fresh }]
        : []),
      { evaluator_name: "evaluate_witness_fact_state", version: 1, deployed: !fresh },
      { evaluator_name: "evaluate_witness_fact_state", version: 2, deployed: !fresh },
      { evaluator_name: "evaluate_witness_identity", version: 1, deployed: !fresh },
      // F-A4 PR-2a's prepayment evaluator, measured with the same three-state discipline: absent
      // entirely on a pre-PR-2a chain, and when present it carries its OWN ceremony's deploy state
      // rather than the covered-five's -- it ships DARK until PR-2b flips it.
      ...(v3Registered ? [{ ...CEREMONY_EXCLUDED_V3, deployed: v3Deployed }] : []),
      // #939's prepayment_schedule v2, measured the same way: absent on a pre-0305 chain, and when
      // present it carries its OWN ceremony's deploy state rather than the covered-five's.
      ...(v4Registered ? [{ ...CEREMONY_EXCLUDED_V4, deployed: v4Deployed }] : []),
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
      const extra = (fsPackDeployed ? 1 : 0) + (v2Deployed ? 1 : 0) + (v3Deployed ? 1 : 0)
        + (v4Deployed ? 1 : 0);
      assert.equal((await db.query(
        "select count(*)::int n from clara.evaluator_versions where deployed",
      )).rows[0].n, 5 + coveredNew + extra);
      assert.equal((await db.query(
        "select clara.verify_evaluator_freeze() r",
      )).rows[0].r.verified_deployed, 5 + coveredNew + extra);
      // AND THE EXCLUSION IS EXACTLY THE NAMED ROWS THAT ARE STILL PENDING — read back, never
      // assumed, so a later lane's closure cannot silently inherit the exemption and go undeployed
      // with no cell noticing.
      assert.deepEqual((await db.query(
        "select evaluator_name, version from clara.evaluator_versions where not deployed order by 1,2",
      )).rows, [
        ...(fsPackDeployed ? [] : [{ evaluator_name: CEREMONY_EXCLUDED, version: 1 }]),
        ...(v2Registered && !v2Deployed ? [{ ...CEREMONY_EXCLUDED_V2 }] : []),
        ...(v3Registered && !v3Deployed ? [{ ...CEREMONY_EXCLUDED_V3 }] : []),
        ...(v4Registered && !v4Deployed ? [{ ...CEREMONY_EXCLUDED_V4 }] : []),
      ].sort((x, y) => (x.evaluator_name < y.evaluator_name ? -1
        : x.evaluator_name > y.evaluator_name ? 1 : x.version - y.version)),
      "the only closures this ceremony leaves undeployed are the ones that own their own flip");
    });
    // `v4Deployed` JOINS THIS TERM, and its absence was a latent re-run defect of exactly the
    // class #1016 recorded against delta-catalog-phase.mjs's own deployment census: this total
    // counts EVERY deployed row (clara.verify_evaluator_freeze() draws no OWNS_ITS_OWN_CEREMONY
    // distinction), so a database on which #939's separate ceremony had already flipped
    // prepayment_schedule v2 read one too few here. It is green on a fresh witness either way,
    // which is why it survived: the fourth exclusion was added to the three terms above and
    // missed on this one.
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.evaluator_versions where deployed",
    )).rows[0].n, 5 + coveredNew + (fsPackDeployed ? 1 : 0) + (v2Deployed ? 1 : 0)
      + (v3Deployed ? 1 : 0) + (v4Deployed ? 1 : 0),
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
