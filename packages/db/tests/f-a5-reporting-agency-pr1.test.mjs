// F-A5 PR-1 -- THE REPORTING AGENCY'S UNGRANTED MACHINERY, for
// migrations/UNNUMBERED_f_a5_reporting_agency_pr1.sql.
//
// THE GATE READS THE CATALOG, never this filename and never a schema_migrations row, so the
// number claimed at merge can never move what this battery asserts (authoring law: battery gating
// keys on the file STEM, never a number -- and the strongest form of that is to key on the
// installed BEHAVIOUR instead). A HALF-applied state THROWS rather than skipping: half of this
// migration is drift, not dormancy.
//
// SCOPE, and what is deliberately NOT here. PR-1 ships no wrapper, no grant and no allowlist row,
// so every agent-lane cell below calls the UNGRANTED CORE directly as the owner -- which is the
// only caller that exists yet. The wake-credential half (CLR03, the allowlist, the 'proactive'
// refusal, the op-key replay) is PR-2's, because the doors it tests do not exist in PR-1 and a
// cell that cannot fail is not a cell. Design of record:
// docs/plan/active/reporting-agency-design.md (v2) SS3.2-3.6 + annexes 1 (A.2 vocabulary, A.3
// receipt, B battery) and 2 (D decisions, E predictions).
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (law 31). A cell that only ever sees a refusal cannot
// tell a wall from a body that refuses everything, so each refusal below has a differential twin
// that must be ADMITTED, and the two differ in exactly the term the wall reads.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, withActor } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import {
  skipUnlessEpsilon, caught, errorDetail, opk, firmIdOf,
  sealArtifact, approveIssue, evaluateMetricHuman, sealDataset,
  proposeMetricDefinition, measure, metricAst, buildManifest,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, artifactRows, ensureEpsilonAdmin } from "./epsilon-world.mjs";
// THE REAL RENDER-WORKER PATH, borrowed rather than re-implemented: the queue is drained with
// zeta's own parker and the job is claimed and completed as clara_runtime through
// clara.complete_render_job -- the ONLY caller that seals a pre_sign artifact in production, and
// the one R-L23's tail-append exists to keep whole.
import { parkQueue, asRuntime } from "./zeta-fixtures.mjs";
import { grantCapability } from "./x56-fixtures.mjs";

/** The agent principal, pinned rather than read from clara.agent_user_id(): an expectation
 *  derived from the same function under test proves nothing (0002_foundation.sql's constant). */
const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";

/** The ten cores PR-1 mints. Held as a NAME LIST, never a count -- F5-D30's lesson applied to the
 *  battery: a census written against a number cannot find an omission. */
const PR1_CORES = Object.freeze([
  "clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text)",
  "clara._assess_report_claim_core(uuid,uuid,uuid,text,uuid,text)",
  "clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text)",
  "clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text)",
  "clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text)",
  "clara._enqueue_render_job_core(uuid,uuid,uuid,text,uuid,text)",
  "clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)",
  "clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text)",
  "clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)",
  "clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)",
]);

/** Every role that must NOT reach a core. The two non-inheriting LOGIN shells are named
 *  EXPLICITLY because a group probe cannot answer for them (0077:398-404's method). */
const NO_REACH_ROLES = Object.freeze([
  "clara_authenticated", "clara_agent_ro", "clara_runtime", "clara_runtime_login",
  "clara_wake_interactive", "clara_wake_proactive", "clara_agent_read_login", "clara_wake_write_login",
]);

const agentObj = (over = {}) => ({
  model: "claude-opus-5", model_version: "2026-08", rationale: "f-a5 pr1 battery",
  wake_credential_id: randomUUID(), ...over,
});

let ready = false;
let world = null;

/** THE CAPABILITY GATE. Reads the installed catalog for the THREE independent halves of this
 *  migration -- the cores, the two relations, the re-armed issue wall. All three or none; a
 *  partial apply is drift and must be loud. */
async function pr1Ready() {
  const r = await rootQuery(`
    select (select count(*)::int from unnest($1::text[]) s where to_regprocedure(s) is not null) as cores,
           (to_regclass('clara.report_agent_receipts') is not null
            and to_regclass('clara.watermark_policy_versions') is not null) as relations,
           (select p.prosrc ~ 'self_run_pack_requires_independent_issuer'
              from pg_proc p where p.oid='clara.approve_report_for_issue(uuid,text,text,text,text)'::regprocedure) as wall`,
    [PR1_CORES]);
  const s = r.rows[0];
  const halves = [s.cores === PR1_CORES.length, s.relations, s.wall];
  if (halves.every((h) => !h)) return false;
  if (!halves.every((h) => h)) {
    throw new Error(`F-A5 PR-1 DRIFT: a half-applied migration -- cores=${s.cores}/${PR1_CORES.length} `
      + `relations=${s.relations} wall=${s.wall}. Apply the migration as a whole.`);
  }
  return true;
}

/** THE RIG'S OWN EVALUATOR CEREMONY, minus this item's row.
 *
 *  clara.evaluate_metric v1 is BORN UNDEPLOYED and a one-way ceremony flips it (0060), so every
 *  cell below that evaluates a metric needs it committed. In the estate run epsilon-contract has
 *  already done it by the time this file is reached; run this file ALONE and nothing has, which
 *  is how five cells here first failed with `metric evaluator is not deployed` on a pristine rig
 *  — a missing premise, not a defect in the item.
 *
 *  clara.evaluate_fs_pack_agent is EXCLUDED, here and in the two shared helpers, because cell D
 *  measures its refusal. That exclusion is asserted at exactly one name in
 *  epsilon-contract.test.mjs; this call must not be the place it silently widens, so it names the
 *  row it skips rather than filtering on anything derived. */
async function ensureMetricEvaluatorDeployed() {
  const pending = (await rootQuery(
    `select count(*)::int n from clara.evaluator_versions
      where not deployed and evaluator_name <> 'evaluate_fs_pack_agent'`)).rows[0].n;
  if (pending === 0) return;
  await withActor({ transaction: true }, (db) => db.query(
    `update clara.evaluator_versions set deployed=true
      where not deployed and evaluator_name <> 'evaluate_fs_pack_agent'`));
}

before(async () => {
  if (await skipUnlessEpsilon({ skip: () => {} })) return;
  ready = await pr1Ready();
  if (!ready) return;
  await ensureMetricEvaluatorDeployed();
  world = await buildWorld();
});
after(async () => { await endPool(); });

/** Named, counted skip -- never a silent return (authoring law). */
function skipHere(t, why) { t.skip(`F-A5 PR-1 not applied: ${why}`); return true; }

// =============================================================================================
// A -- POSTURE. Ten cores, granted to NOBODY, definer, search_path-pinned, not PUBLIC-executable.
// =============================================================================================
test("A -- every PR-1 core is a search_path-pinned SECURITY DEFINER that NO role can execute", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  for (const sig of PR1_CORES) {
    const posture = (await rootQuery(
      `select p.prosecdef as definer, 'search_path=clara, pg_temp' = any(p.proconfig) as pinned,
              pg_get_userbyid(p.proowner) as owner
         from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0];
    assert.equal(posture.definer, true, `${sig} is SECURITY DEFINER`);
    assert.equal(posture.pinned, true, `${sig} pins search_path`);
    // A SECURITY DEFINER function runs AS ITS OWNER, so the owner IS the privilege it carries.
    assert.equal(posture.owner, "clara_fn_owner", `${sig} is owned by clara_fn_owner, not a superuser`);

    // PUBLIC, measured through acldefault so a NULL proacl -- which IS public execute -- cannot
    // read as "no grant". This is the exact shape the migration tail caught on its first cut.
    const pub = (await rootQuery(
      `select count(*)::int n from pg_proc p,
              aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = $1::regprocedure and a.grantee = 0`, [sig])).rows[0].n;
    assert.equal(pub, 0, `${sig} is NOT executable by PUBLIC`);

    for (const role of NO_REACH_ROLES) {
      const granted = (await rootQuery(
        `select count(*)::int n from pg_proc p,
                aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'
            and pg_get_userbyid(a.grantee) = $2`, [sig, role])).rows[0].n;
      assert.equal(granted, 0, `${role} holds no EXECUTE on ${sig}`);
    }
  }
});

test("A2 -- the human doors still resolve a context, and gained no non-human grantee", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const doors = ["clara.open_report_run(uuid,uuid,uuid,uuid,text)",
    "clara.assess_report_claim(uuid,text)", "clara.seal_report_dataset(uuid,uuid[],text)",
    "clara.approve_report_for_issue(uuid,text,text,text,text)",
    "clara.publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text)",
    "clara.publish_chart_template_version(text,text,jsonb,date,text)"];
  for (const sig of doors) {
    const row = (await rootQuery(
      `select p.prosrc ~ '_human_ctx' as resolves,
              (select coalesce(string_agg(distinct pg_get_userbyid(a.grantee), ','), '')
                 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.privilege_type='EXECUTE' and a.grantee <> p.proowner and a.grantee <> 0) as grantees
         from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0];
    assert.equal(row.resolves, true, `${sig} still resolves a human context`);
    assert.equal(row.grantees, "clara_authenticated", `${sig}'s only grantee is still clara_authenticated`);
  }
});

// =============================================================================================
// B -- THE IDENTITY WRITES (design SS3.3 (2)). Three shapes, differential, read off the ROW.
// =============================================================================================
test("B -- requested_by / directed_by / prepared_by_agent, all three shapes", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `idw-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);

  // (i) THE HUMAN LANE, unchanged. buildEpsilonWorld opened this run through clara.open_report_run.
  const human = (await rootQuery(
    "select requested_by, directed_by, prepared_by_agent from clara.report_runs where id=$1",
    [eps.runId])).rows[0];
  assert.equal(human.requested_by, owner, "a human-opened run records the human as requester");
  assert.equal(human.directed_by, null, "a human-opened run has no director");
  assert.equal(human.prepared_by_agent, false, "a human-opened run is not agent-prepared");

  // (ii) DIRECTED BY A HUMAN. requested_by carries the DIRECTOR, not the machine -- the whole of
  // survey S5's repair. Note p_actor is the AGENT and the run still names Bob.
  const directed = (await rootQuery(
    `select clara._open_report_run_core($1,$2,$3,$4,$5,$6,$7,$8,$9) as r`,
    [firm, AGENT_USER_ID, world.users.bob, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-obo")])).rows[0].r;
  const d = (await rootQuery(
    "select requested_by, directed_by, prepared_by_agent from clara.report_runs where id=$1",
    [directed.report_run_id])).rows[0];
  assert.equal(d.requested_by, world.users.bob, "the DIRECTING human is the requester, not the agent");
  assert.equal(d.directed_by, world.users.bob, "the director is recorded");
  assert.equal(d.prepared_by_agent, true, "prepared_by_agent is true when the agent acted");

  // (iii) A SELF-RUN PACK. No human to name, so requested_by is honestly the agent -- writing a
  // human who did not ask would be the law-22 fabrication design SS3.3 refuses to make.
  const selfRun = (await rootQuery(
    `select clara._open_report_run_core($1,$2,null,$3,$4,$5,$6,$7,$8) as r`,
    [firm, AGENT_USER_ID, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-self")])).rows[0].r;
  const s = (await rootQuery(
    "select requested_by, directed_by, prepared_by_agent from clara.report_runs where id=$1",
    [selfRun.report_run_id])).rows[0];
  assert.equal(s.requested_by, AGENT_USER_ID, "a self-run pack names the agent, honestly");
  assert.equal(s.directed_by, null, "a self-run pack has no director");
  assert.equal(s.prepared_by_agent, true, "a self-run pack is agent-prepared");
});

test("B2 -- P6 behaviourally: the lifecycle trigger admits an issue-column update and FREEZES the new pair", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `p6-${randomUUID().slice(0, 6)}`, seal: false });
  // THE ADMITTING HALF is a REAL audited transition, not a bare column poke. Its first cut wrote
  // `set issue_reason=...` on a drafting run and failed with `illegal report run transition
  // drafting -> drafting`: the trigger runs a whole-row diff AND a state-transition dispatch, so
  // an update that moves no state is refused by the second check whatever the first one thinks.
  // Sealing through the human door is the transition the estate actually performs.
  const sealed = await sealDataset(owner, { runId: eps.runId, opKey: opk("fa5-p6-seal") });
  assert.ok(sealed, "the trigger admits the audited drafting -> dataset_sealed transition");
  assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [eps.runId])).rows[0].state,
    "dataset_sealed", "read back off the row, not inferred from the call returning");

  // THE REFUSING HALF: the new column is frozen with NO trigger edit, because the immutability
  // test is a whole-row jsonb diff minus the SEVEN EXEMPT columns -- so a column added by this
  // migration joins the frozen set automatically. That is P6, behaviourally, and it is the reason
  // clara._tf_report_run_lifecycle is NOT on this file's D1 list.
  const frozen = await caught(() => rootQuery(
    "update clara.report_runs set directed_by=$2 where id=$1", [eps.runId, world.users.bob]));
  assert.ok(frozen, "changing directed_by after INSERT is refused");
  assert.equal(errorDetail(frozen)?.reason, "report_run_identity_immutable",
    `the refusal is the identity freeze, not the transition dispatch: ${frozen?.message}`);
  const frozenPair = await caught(() => rootQuery(
    "update clara.report_runs set prepared_by_agent = not prepared_by_agent where id=$1", [eps.runId]));
  assert.equal(errorDetail(frozenPair)?.reason, "report_run_identity_immutable",
    `and so is prepared_by_agent -- BOTH new columns, not just the one: ${frozenPair?.message}`);
});

// =============================================================================================
// C -- THE ISSUE WALL, RE-ARMED (design SS3.3). The sharpest judgement logic in the item.
// =============================================================================================
test("C -- the issue wall refuses the director and admits an independent human", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;              // firm owner -- auto-holds close_and_attest
  const eps = await buildEpsilonWorld(world, { tag: `wall-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);

  // An AGENT-PREPARED run directed by ALICE, carried through the agent cores end to end.
  const run = (await rootQuery(
    `select clara._open_report_run_core($1,$2,$3,$4,$5,$6,$7,$8,$9) as r`,
    [firm, AGENT_USER_ID, owner, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-wall")])).rows[0].r;
  const runId = run.report_run_id;
  await evaluateMetricHuman(owner, {
    client: eps.client, definitionVersion: eps.definitionVersionId,
    periodIds: [eps.period.id], snapshotId: eps.snapshotId, runId,
  });
  await rootQuery(
    `select clara._seal_report_dataset_core($1,$2,$3,$4,$5,'{}'::uuid[],$6) as r`,
    [firm, AGENT_USER_ID, owner, "interactive", runId, opk("fa5-wall-seal")]);

  // Seal the pre_sign artifact through the CORE, with the identity pair at the TAIL (R-L23).
  const sha = "b".repeat(64);
  const manifest = await buildManifest({ runId, kind: "pre_sign", sha256: sha });
  await rootQuery(
    `select clara._seal_report_artifact_core($1,$2,$3,'pre_sign','pdf',$4,4096,$5::jsonb,null,$6,$7,$8,$9::jsonb) as r`,
    [firm, AGENT_USER_ID, runId, sha, JSON.stringify(manifest), opk("fa5-wall-art"),
      owner, "interactive", JSON.stringify(agentObj())]);

  // R-L23's DB-derivation, measured on the row: the artifact carries its RUN's direction.
  const art = (await artifactRows(runId)).find((a) => a.kind === "pre_sign");
  assert.equal(art.directed_by, owner, "the artifact's director is DB-derived from its run");
  assert.equal(art.prepared_by_agent, true, "the artifact's prepared_by_agent is DB-derived from its run");

  const checkers = (await rootQuery("select clara.eligible_checker_count($1)::int n", [firm])).rows[0].n;
  assert.ok(checkers >= 2, `this firm has >=2 eligible checkers so ARM 1 is the arm under test (got ${checkers})`);

  // THE REFUSING POLARITY -- Alice DIRECTED the run, so Alice may not issue it. She is the owner,
  // so she holds close_and_attest and genuinely reaches the wall rather than the capability gate.
  const refused = await caught(() => approveIssue(owner, {
    runId, expectedSha256: sha, selfAttestation: "alice attests", opKey: opk("fa5-issue-a") }));
  assert.ok(refused, "the director's own issue is refused");
  const det = errorDetail(refused);
  assert.equal(det?.reason, "report_issue_segregation_violation",
    `the refusal is the segregation wall: ${refused?.message}`);
  assert.equal(det?.directed_by, owner, "and it names directed_by -- the term v1 could not read");

  // THE ADMITTING POLARITY -- Bob did not prepare. He needs key 2, granted through the real
  // audited door (ADR-0075: the agent walks law-71 gates as the owner's delegate on test data).
  await grantCapability(owner, { user: world.users.bob, capability: "close_and_attest",
    reason: "f-a5 pr1 battery: an independent human issues an agent-prepared pack" });
  const issued = await approveIssue(world.users.bob, {
    runId, expectedSha256: sha, selfAttestation: "bob signs as sole human", opKey: opk("fa5-issue-b") });
  assert.equal(issued.issue_mode, "agent_prepared",
    "an agent-prepared pack issues as agent_prepared -- never two_person (TA-P6 A)");
  assert.equal(issued.prepared_by_agent, true, "and the receipt says so");

  // THE NEGATIVE CONTROL that proves the WALL is the reason, not the run: the same firm, the same
  // Bob, a HUMAN-prepared run -- issues as two_person. Without this the cell above would pass on a
  // body that stamped agent_prepared unconditionally.
  const humanSha = "c".repeat(64);
  // THE CONTROL'S PREMISE IS ASSERTED, NOT SWALLOWED. Its first cut sealed this dataset through
  // rootQuery and dropped the failure in a `.catch` -- and rootQuery reaches clara.seal_report_dataset
  // as the OWNER, which resolves no JWT, so the call raised CLR04 every time and the control ran
  // against an UNSEALED run. It passed anyway, because approve_report_for_issue's own refusal came
  // later. A swallowed premise is the forced-cell law's named failure: seal through the HUMAN door
  // and read the state back.
  const sealedControl = await sealDataset(owner, { runId: eps.runId, opKey: opk("fa5-ctl-seal") });
  assert.ok(sealedControl, "the control run's dataset really sealed, through the human door");
  assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [eps.runId])).rows[0].state,
    "dataset_sealed", "and the run is in the state the control needs before it can prove anything");
  const humanManifest = await buildManifest({ runId: eps.runId, kind: "pre_sign", sha256: humanSha });
  await sealArtifact(owner, { runId: eps.runId, kind: "pre_sign", sha256: humanSha,
    manifest: humanManifest, opKey: opk("fa5-ctl-art") });
  const control = await approveIssue(world.users.bob, {
    runId: eps.runId, expectedSha256: humanSha, opKey: opk("fa5-ctl-issue") });
  assert.equal(control.issue_mode, "two_person",
    "a human-prepared pack still issues as two_person -- the mode tracks the run, not the verb");
});

// =============================================================================================
// D -- THE CEREMONY GATE (design SS3.2, gate-2 material 8). Mechanical, both polarities.
// =============================================================================================
test("D -- the agent evaluator refuses while its closure row is undeployed, and stops refusing when it is flipped", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const row = (await rootQuery(
    `select id, deployed from clara.evaluator_versions
      where evaluator_name='evaluate_fs_pack_agent' and version=1 and firm_id is null`)).rows[0];
  assert.ok(row, "the agent closure row exists");

  const firm = await firmIdOf(world.clients.A1);
  const args = [firm, AGENT_USER_ID, world.users.bob, "interactive", world.clients.A1,
    [randomUUID()], [randomUUID()], randomUUID(), randomUUID(),
    JSON.stringify(agentObj()), opk("fa5-gate")];
  const sql = `select clara.evaluate_fs_pack_agent_v1($1,$2,$3,$4,$5,$6::uuid[],$7::uuid[],$8,$9,$10::jsonb,$11) as r`;

  // THIS ROW'S DEPLOY FLIP IS ONE-WAY (0060's t_evaluatorversions_deploy_once: exactly one
  // undeployed->deployed transition per row, EVER). On a FRESH database this cell is the row's
  // only witness and proves BOTH polarities. On a RE-RUN against a database a PRIOR invocation
  // of THIS SAME FILE already ran, the row is already deployed -- the ceremony working as
  // designed, not a defect -- and the pre-ceremony refusal can never be re-witnessed. The re-run
  // arm proves the MIRROR strong truth instead: monotone (still deployed) and a second flip
  // attempt is ITSELF refused by the one-way wall, never a bare skip.
  //
  // REUSE MUST BE DECLARED, NEVER INFERRED. There is no `deployed_at` column, so `row.deployed`
  // alone cannot distinguish "a prior run of THIS file already witnessed it" from "some OTHER
  // fixture illegitimately flipped it early, destroying the born-undeployed witness" -- so an
  // already-deployed row is a HARD FAILURE unless the operator has explicitly acknowledged a
  // reused database via CLARA_ESTATE_REUSED_DB=1 (documented in packages/db/README.md; the
  // estate sweep's second-run protocol sets it).
  const reusedDeclared = process.env.CLARA_ESTATE_REUSED_DB === "1";
  if (row.deployed && !reusedDeclared) {
    assert.fail(
      "evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set to "
      + "\"1\" -- either this database is not actually fresh (reset it: "
      + "pnpm --filter @clara/db reset, then re-migrate/seed) or the reuse is deliberate "
      + "(export CLARA_ESTATE_REUSED_DB=1 to acknowledge a re-run against this same database)");
  }
  if (!row.deployed) {
    assert.equal(row.deployed, false, "and it is BORN UNDEPLOYED -- the flip is a ceremony act");
    const pre = await caught(() => rootQuery(sql, args));
    assert.ok(pre, "the pre-ceremony call is refused");
    assert.equal(errorDetail(pre)?.reason, "evaluator_undeployed",
      `the gate is the reason, and it fires FIRST: ${pre?.message}`);

    // THE DIFFERENTIAL. Flip the row and call again with the same garbage identities: the refusal
    // must MOVE PAST the gate. Without this the cell above passes on a body that refuses everything.
    await rootQuery("update clara.evaluator_versions set deployed=true where id=$1", [row.id]);
  } else {
    // row.deployed === true AND reusedDeclared === true (the only way past the assert.fail
    // above) -- prove the MIRROR strong truth instead of a bare skip.
    const redeploy = await caught(() => rootQuery(
      "update clara.evaluator_versions set deployed=true where id=$1", [row.id]));
    assert.equal(redeploy?.code, "CLR08", `${redeploy?.code} ${redeploy?.message}`);
    assert.match(redeploy.message, /one undeployed-to-deployed transition/i);
    assert.equal((await rootQuery(
      "select deployed from clara.evaluator_versions where id=$1", [row.id])).rows[0].deployed,
      true, "still deployed -- monotone (re-run shape)");
  }
  const post = await caught(() => rootQuery(sql, args));
  assert.ok(post, "the post-ceremony call still refuses -- the identities are deliberately garbage");
  assert.notEqual(errorDetail(post)?.reason, "evaluator_undeployed",
    `but NOT at the ceremony gate any more: ${post?.message}`);
});

// =============================================================================================
// E -- THE RECEIPT (annex A.3) and its honesty wall.
// =============================================================================================
test("E -- the receipt writer refuses an unstated model, rationale or credential", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const firm = await firmIdOf(world.clients.A1);
  const write = (agent) => rootQuery(
    `select clara._report_agent_receipt($1,null,null,null,'typed_read','done',null,null,$2,'interactive',$3::jsonb,$4)`,
    [firm, world.users.bob, JSON.stringify(agent), opk("fa5-rcpt")]);

  for (const [label, agent] of [
    ["a blank model", agentObj({ model: "   " })],
    ["a blank model_version", agentObj({ model_version: "" })],
    ["a blank rationale", agentObj({ rationale: "  " })],
    ["no wake credential", agentObj({ wake_credential_id: "" })],
  ]) {
    const err = await caught(() => write(agent));
    assert.ok(err, `${label} is refused`);
    assert.equal(errorDetail(err)?.reason, "invalid_request", `${label}: ${err?.message}`);
  }
  // the ADMITTING polarity
  const ok = await write(agentObj());
  assert.ok(ok.rows[0], "a complete agent object writes its receipt");
});

test("E2 -- the honesty wall: this table can never say a PERSON did what Clara did", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const firm = await firmIdOf(world.clients.A1);
  const err = await caught(() => rootQuery(
    `insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
       wake_credential_id, model, model_version, rationale, op_key)
     values ($1,'typed_read','done',$2,'interactive',$3,'m','1','r',$4)`,
    [firm, world.users.bob, randomUUID(), opk("fa5-honesty")]));
  assert.ok(err, "a human acting_identity is refused");
  assert.match(String(err.message), /ck_rar_acting_identity_is_agent/,
    `by the CHECK that pins it to the agent: ${err?.message}`);

  // and the refusal/token pairing, both ways
  const unpaired = await caught(() => rootQuery(
    `insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
       wake_credential_id, model, model_version, rationale, op_key)
     values ($1,'typed_read','refused',clara.agent_user_id(),'interactive',$2,'m','1','r',$3)`,
    [firm, randomUUID(), opk("fa5-unpaired")]));
  assert.ok(unpaired, "a refusal with no token is refused");
  assert.match(String(unpaired.message), /ck_rar_refusal_paired/, `${unpaired?.message}`);
});

test("F -- the narrative-authority wall, three refusals and one admission", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const firm = await firmIdOf(world.clients.A1);
  const write = (citations) => rootQuery(
    `insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
       wake_credential_id, model, model_version, rationale, op_key, basis_citations)
     values ($1,'typed_read','done',clara.agent_user_id(),'interactive',$2,'m','1','r',$3,$4::jsonb)
     returning id`,
    [firm, randomUUID(), opk("fa5-cite"), JSON.stringify(citations)]);

  // A sandbox figure cited where an authoritative basis is typed -- the three slots, x3.
  for (const role of ["posting_amount", "kb_fact", "formal_cell"]) {
    const err = await caught(() => write([{ basis_role: role, authority: "narrative", query_text: "select 1" }]));
    assert.ok(err, `a narrative figure cited as ${role} is refused`);
    assert.equal(errorDetail(err)?.reason, "sandbox_authority_refused", `${role}: ${err?.message}`);
  }
  // A 'formal' citation with NO pin is narrative in disguise -- fail-closed on the unknown.
  const unpinned = await caught(() => write([{ basis_role: "formal_cell", authority: "formal" }]));
  assert.equal(errorDetail(unpinned)?.reason, "sandbox_authority_refused",
    `an unpinned formal citation is refused: ${unpinned?.message}`);
  // A narrative aggregate with no query text cannot be checked by anybody.
  const noQuery = await caught(() => write([{ basis_role: "narrative_aggregate", authority: "narrative" }]));
  assert.equal(errorDetail(noQuery)?.reason, "sandbox_authority_refused",
    `a narrative aggregate with no query text is refused: ${noQuery?.message}`);

  // THE ADMITTING POLARITY: a narrative aggregate IS citable, with its query text.
  const ok = await write([{ basis_role: "narrative_aggregate", authority: "narrative",
    query_text: "select count(*) from clara.clients", source: "freeform_read" }]);
  assert.ok(ok.rows[0].id, "a narrative aggregate with its query text is admitted");
  // and so is a genuinely DB-owned figure
  const pinned = await write([{ basis_role: "formal_cell", authority: "formal", cell_id: randomUUID() }]);
  assert.ok(pinned.rows[0].id, "a pinned formal cell is admitted");
});

// =============================================================================================
// G -- THE CHECK SWAPS (DDL 2). Read from pg_constraint, then FORCED.
// =============================================================================================
test("G -- issue_mode is a three-value closed world under a NAMED constraint, and agent_prepared binds its attestation", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const cons = (await rootQuery(
    `select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.report_runs'::regclass and contype='c' order by conname`)).rows;
  const names = cons.map((c) => c.conname);
  assert.ok(names.includes("ck_rr_issue_mode"),
    "the anonymous CHECK is replaced by a NAMED one so the next extension has a handle");
  assert.equal(names.filter((n) => n === "report_runs_issue_mode_check").length, 0,
    "and PostgreSQL's generated name is gone");
  const mode = cons.find((c) => c.conname === "ck_rr_issue_mode").def;
  for (const v of ["two_person", "solo_self_attested", "agent_prepared"]) {
    assert.match(mode, new RegExp(v), `${v} is admitted (extend-never-weaken)`);
  }
  const solo = cons.find((c) => c.conname === "ck_rr_solo_attested").def;
  assert.match(solo, /agent_prepared/, "ck_rr_solo_attested now binds agent_prepared too");
  assert.match(solo, /solo_self_attested/, "and still binds the solo arm, byte-unchanged in meaning");
});

test("G2 -- an agent-prepared issue without its attestation text is refused", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `att-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);
  const run = (await rootQuery(
    `select clara._open_report_run_core($1,$2,$3,$4,$5,$6,$7,$8,$9) as r`,
    [firm, AGENT_USER_ID, world.users.bob, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-att")])).rows[0].r;
  const runId = run.report_run_id;
  await evaluateMetricHuman(owner, {
    client: eps.client, definitionVersion: eps.definitionVersionId,
    periodIds: [eps.period.id], snapshotId: eps.snapshotId, runId,
  });
  await rootQuery(`select clara._seal_report_dataset_core($1,$2,$3,$4,$5,'{}'::uuid[],$6)`,
    [firm, AGENT_USER_ID, world.users.bob, "interactive", runId, opk("fa5-att-seal")]);
  const sha = "d".repeat(64);
  const manifest = await buildManifest({ runId, kind: "pre_sign", sha256: sha });
  await rootQuery(
    `select clara._seal_report_artifact_core($1,$2,$3,'pre_sign','pdf',$4,4096,$5::jsonb,null,$6,$7,$8,null)`,
    [firm, AGENT_USER_ID, runId, sha, JSON.stringify(manifest), opk("fa5-att-art"),
      world.users.bob, "interactive"]);

  // Alice did not direct THIS run (Bob did), so she clears the segregation arm and lands on the
  // attestation requirement -- the term actually under test.
  const err = await caught(() => approveIssue(owner, {
    runId, expectedSha256: sha, opKey: opk("fa5-att-issue") }));
  assert.ok(err, "an agent-prepared issue with no attestation is refused");
  assert.equal(errorDetail(err)?.reason, "agent_prepared_attestation_required", `${err?.message}`);

  const ok = await approveIssue(owner, {
    runId, expectedSha256: sha, selfAttestation: "alice attests to an agent-prepared pack",
    opKey: opk("fa5-att-issue2") });
  assert.equal(ok.issue_mode, "agent_prepared", "with the text it issues, and records the mode truthfully");
});

// =============================================================================================
// H -- THE LIFECYCLE TRIGGER ARM (survey S3, design SS3.5). Both polarities + anti-fabrication.
// =============================================================================================
/** A fresh DRAFT metric definition version, proposed through the real audited door.
 *  A hand-inserted row would be testing a shape this estate never produces; the trigger under
 *  test fires on the transition, so the row it transitions has to be a real one. */
async function freshDraft(eps, tag) {
  const preparer = await ensureEpsilonAdmin(world);
  return proposeMetricDefinition(preparer, {
    client: eps.client, key: `fa5_lc_${tag}_${randomUUID().slice(0, 8)}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
}

/** The transition the trigger judges, written as one UPDATE so every arm differs in exactly the
 *  term under test. Run as the superuser session, which bypasses RLS and NOT the trigger --
 *  the wall is in the trigger, and that is the point. */
const attemptApproval = (versionId, approvedBy, evidence) => rootQuery(
  `update clara.metric_definition_versions
      set state='firm_approved', approved_by=$2, approved_at=now(),
          approval_reason='f-a5 pr1 lifecycle cell', approved_formula_sha256=formula_sha256,
          approval_evidence=$3::jsonb
    where id=$1`, [versionId, approvedBy, JSON.stringify(evidence)]);

/** AN AGENT-AUTHORED DRAFT WITH NO ACCOUNTABLE DIRECTOR -- the state PR-2's wake propose door
 *  will produce and that NO verb in PR-1 can, so it is built as a fixture and SAID to be one.
 *  It is a new REVISION of a real proposed draft's definition, copied column for column, with
 *  exactly two terms changed: proposed_by becomes the agent, and the proposal evidence carries
 *  no `on_behalf_of` -- which is precisely what makes the core's effective maker NULL and the
 *  draft an orphan. Everything else is the audited door's own output, so the arm is measured
 *  against a row shaped like the estate's, not like the test's idea of one. */
async function agentAuthoredDraft(eps, tag) {
  const seed = await freshDraft(eps, tag);
  const id = randomUUID();
  await rootQuery(
    `insert into clara.metric_definition_versions
       (id, firm_id, definition_id, revision, ast, normalized_ast, formula_sha256, unit_key,
        temporality_key, result_scale, edge_policy_set_id, averaging_policy_id, allow_negative,
        state, applies_from, applies_to, supersedes_version_id, proposed_by, proposal_evidence,
        proposed_at, approval_evidence)
     select $2, firm_id, definition_id, revision + 1, ast, normalized_ast, formula_sha256, unit_key,
        temporality_key, result_scale, edge_policy_set_id, averaging_policy_id, allow_negative,
        'draft', applies_from, applies_to, null, clara.agent_user_id(),
        jsonb_build_object('kind', 'agent_proposal', 'version', 1), now(), '{}'::jsonb
       from clara.metric_definition_versions where id = $1`, [seed, id]);
  const row = (await rootQuery(
    "select proposed_by, state, proposal_evidence from clara.metric_definition_versions where id=$1",
    [id])).rows[0];
  assert.equal(row.proposed_by, AGENT_USER_ID, "the fixture really is agent-authored");
  assert.equal(row.state, "draft", "and really is a draft");
  assert.equal(row.proposal_evidence.on_behalf_of, undefined, "and really names no director");
  return id;
}

const AGENT_EVIDENCE = Object.freeze({
  kind: "agent_self_approval", version: 1,
  agent: { model: "claude-opus-5", model_version: "2026-08", rationale: "f-a5 pr1 lifecycle cell" },
});

test("H -- the definition lifecycle, FORCED: four refusals and two admissions, one term apart", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  // FORCED, NOT READ. Its first cut asserted three regexes against prosrc, which proves the words
  // are present and nothing about what the trigger does with them (law: spelling is not identity).
  // Every arm below is a real transition on a real draft, and each refusing arm has an admitting
  // twin differing in ONE term -- so a body that refused everything would fail here.
  const eps = await buildEpsilonWorld(world, { tag: `lc-${randomUUID().slice(0, 6)}`, seal: false });
  const human = world.users.alice;

  // (1) A MACHINE ACT DRESSED AS A HUMAN ONE. This is the arm PR-1 adds: the human evidence kind
  // was admissible to ANY writer, including one signing as the machine -- law 22's fabrication
  // written into the evidence record.
  const dressedDraft = await freshDraft(eps, "dressed");
  const dressed = await caught(() => attemptApproval(
    dressedDraft, AGENT_USER_ID, { kind: "human_approval", version: 1 }));
  assert.ok(dressed, "human_approval signed by the agent identity is refused");
  assert.equal(errorDetail(dressed)?.class, "human_evidence_for_machine_act",
    `and the refusal names WHY, not merely that: ${dressed?.message}`);

  // (1') ITS ADMITTING TWIN -- the SAME evidence, one term changed: a human signs it. This is what
  // makes (1) a wall rather than a body that stopped admitting human_approval altogether
  // (extend-never-weaken, measured).
  const humanOk = await freshDraft(eps, "humanok");
  await attemptApproval(humanOk, human, { kind: "human_approval", version: 1 });
  assert.equal((await rootQuery(
    "select state from clara.metric_definition_versions where id=$1", [humanOk])).rows[0].state,
    "firm_approved", "the human arm's admitting condition is byte-unchanged and still admits");

  // (2) AN AGENT APPROVAL NOT SIGNED BY THE AGENT.
  const signerDraft = await freshDraft(eps, "signer");
  const wrongSigner = await caught(() => attemptApproval(signerDraft, human, AGENT_EVIDENCE));
  assert.equal(errorDetail(wrongSigner)?.class, "approved_by",
    `an agent_self_approval signed by a human is refused: ${wrongSigner?.message}`);

  // (3) AN AGENT APPROVAL THAT CANNOT SAY WHICH MODEL APPROVED, OR WHY.
  for (const [label, agent] of [
    ["no model", { model_version: "2026-08", rationale: "r" }],
    ["no rationale", { model: "claude-opus-5", model_version: "2026-08" }],
  ]) {
    const thinDraft = await freshDraft(eps, "thin");
    const thin = await caught(() => attemptApproval(thinDraft, AGENT_USER_ID,
      { kind: "agent_self_approval", version: 1, agent }));
    assert.equal(errorDetail(thin)?.class, "model_or_rationale", `${label}: ${thin?.message}`);
  }

  // (3') ITS ADMITTING TWIN -- the complete agent evidence transitions.
  const agentOk = await freshDraft(eps, "agentok");
  await attemptApproval(agentOk, AGENT_USER_ID, AGENT_EVIDENCE);
  const row = (await rootQuery(
    "select state, approved_by from clara.metric_definition_versions where id=$1", [agentOk])).rows[0];
  assert.equal(row.state, "firm_approved", "a complete agent self-approval is ADMITTED (TA-P1 C)");
  assert.equal(row.approved_by, AGENT_USER_ID, "signed, honestly, by the machine that did it");

  // (4) LAW 36: a FIFTH kind refuses and says which value it saw, rather than falling through.
  const unknownDraft = await freshDraft(eps, "unknown");
  const unknown = await caught(() => attemptApproval(
    unknownDraft, AGENT_USER_ID, { kind: "board_resolution", version: 1 }));
  const det = errorDetail(unknown);
  assert.equal(det?.reason, "definition_evidence_kind_unknown", `${unknown?.message}`);
  assert.equal(det?.kind, "board_resolution", "and it NAMES the unregistered value it was given");
});

test("H2 -- the re-aimed maker/checker, FORCED: the DIRECTOR is measured, not the acting identity", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  // FORCED, NOT READ. Its first cut matched four regexes against the core's source and deferred
  // the behaviour to PR-2 on the ground that the arms need a wake door -- but the core is directly
  // callable as its owner, which is exactly how every other agent-lane cell in this file reaches
  // one. p_actor is the AGENT on every call here, which is the whole point: a wall measured
  // against p_actor would measure nothing, and that is how v1 removed it while appearing to keep it.
  const eps = await buildEpsilonWorld(world, { tag: `mc-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);
  const owner = world.users.alice;
  const preparer = await ensureEpsilonAdmin(world);   // the admin who PROPOSES -- the effective maker

  // THE ARM UNDER TEST IS SELECTED BY A POPULATION, so the population is read, not assumed --
  // and it is read with 0084's OWN definition (F5-D33), not eligible_checker_count.
  const eligible = (await rootQuery(
    `select count(*)::int n from clara.firm_memberships m join clara.users u on u.id=m.user_id
      where m.firm_id=$1 and m.status='active' and m.role in ('admin','owner') and not u.is_agent`,
    [firm])).rows[0].n;
  assert.ok(eligible >= 2, `ARM 1' is the arm under test only where two accountable humans exist (got ${eligible})`);

  const approve = async (versionId, obo, attestation = null) => {
    const hash = (await rootQuery(
      "select '\\x'||encode(formula_sha256,'hex') as h from clara.metric_definition_versions where id=$1",
      [versionId])).rows[0].h;
    return rootQuery(
      `select clara._agent_approve_metric_definition_core($1,$2,$3,'interactive',$4,$5::bytea,
         'f-a5 pr1 maker/checker cell',$6,$7::jsonb,$8) as r`,
      [firm, AGENT_USER_ID, obo, versionId, hash, attestation, JSON.stringify(agentObj()),
        opk("fa5-mc")]);
  };

  // THE REFUSING POLARITY -- the human who DIRECTED the draft directs its approval too. Clara is
  // the acting identity on both, so nothing about p_actor distinguishes this from the twin below.
  const selfDirected = await freshDraft(eps, "self");
  const refused = await caught(() => approve(selfDirected, preparer));
  assert.ok(refused, "the draft's effective maker cannot direct its own approval");
  const det = errorDetail(refused);
  assert.equal(det?.reason, "definition_directed_self_approval", `${refused?.message}`);
  assert.equal(det?.effective_maker, preparer, "and the refusal names the maker it measured");
  assert.equal(det?.approval_director, preparer, "and the director it compared him with");

  // THE ADMITTING TWIN -- ONE TERM CHANGED: a different accountable human directs the approval.
  const independent = await freshDraft(eps, "indep");
  const ok = (await approve(independent, owner)).rows[0].r;
  assert.equal(ok.state, "firm_approved", "an independently directed approval is admitted");
  assert.equal(ok.approval_arm, "independent_check", "and records WHICH arm let it through");

  // AND THE RECEIPT IS WRITTEN IN THE SAME TRANSACTION -- "no receipt, no act", read off the row.
  const receipt = (await rootQuery(
    `select act, outcome, directed_by, acting_identity, rung_vector, model
       from clara.report_agent_receipts where definition_version_id=$1`, [independent])).rows[0];
  assert.ok(receipt, "the approval wrote its F-A5 receipt");
  assert.equal(receipt.act, "approve_definition");
  assert.equal(receipt.directed_by, owner, "the receipt names the human who directed it");
  assert.equal(receipt.acting_identity, AGENT_USER_ID, "and the machine that acted");
  assert.deepEqual(receipt.rung_vector, {
    arm_0_orphan: "pass", arm_1_distinct_checker: "pass", arm_2_solo_attestation: "not_evaluable",
  }, "the rung vector is THREE-VALUED: an arm this firm's population cannot reach is not_evaluable, never a pass");

  // ARM 0' -- ORPHAN ADOPTION, AT TA-P5'S RIDER'S STATED WIDTH, which is the width v1 of the
  // design got wrong (F5-D24: the rider exempts a self-run report pack from ARM 0' and NOTHING
  // else). Two calls one term apart: a DIRECTED approval of an agent-authored orphan must adopt
  // it with an attestation; an UNDIRECTED one -- a self-run pack -- is exempt.
  //
  // Its first cut tried to make the orphan by UPDATEing proposed_by, and the definition lifecycle
  // trigger refused it as historical -- correctly: proposed_by is not on its exempt list. The
  // orphan is therefore CONSTRUCTED as a fixture row (see agentAuthoredDraft), which is honest
  // about the fact that PR-1 ships no agent propose door and the state is PR-2's to produce.
  const orphan = await agentAuthoredDraft(eps, "orph1");
  const unadopted = await caught(() => approve(orphan, owner));
  assert.ok(unadopted, "a directed approval of an orphan draft with no attestation is refused");
  assert.equal(errorDetail(unadopted)?.reason, "self_approval_attestation_missing", `${unadopted?.message}`);
  const adopted = (await approve(orphan, owner, "alice adopts this agent-authored draft")).rows[0].r;
  assert.equal(adopted.approval_arm, "adoption", "with the adoption text it is admitted, and says so");

  // THE RIDER'S OWN ARM: no director at all. Clara approves her own undirected draft with no
  // attestation -- the commonest lawful shape, and the proof TA-P1 C is not narrowed. Named
  // because every arm above is a refusal and a reader can take the list for the whole rule.
  const selfRunOrphan = await agentAuthoredDraft(eps, "orph2");
  const selfRun = (await approve(selfRunOrphan, null)).rows[0].r;
  assert.equal(selfRun.state, "firm_approved", "Clara still approves her own UNDIRECTED draft");
  assert.equal(selfRun.approval_arm, "adoption", "inside a self-run wake, with no attestation owed");

  // ARM 2' -- THE SOLO ARM. It is selected by a POPULATION of one, so the population is moved:
  // the preparer's membership is deactivated for the length of this arm and restored in `finally`.
  // 0084's eligible SELECT counts ACTIVE admin/owner non-agent memberships, so this is the term
  // the arm reads, changed by itself -- and the gate record's obligation 6 asks for both
  // polarities of ARM 1'/2' on the rig before PR-1 is called done, not for two of the three arms.
  const soloDraft = await freshDraft(eps, "solo");
  // 'removed', not 'inactive': firm_memberships_status_check admits exactly {active, removed},
  // measured from pg_constraint rather than guessed (the first cut guessed and was refused).
  await rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [preparer, firm]);
  try {
    assert.equal((await rootQuery(
      `select count(*)::int n from clara.firm_memberships m join clara.users u on u.id=m.user_id
        where m.firm_id=$1 and m.status='active' and m.role in ('admin','owner') and not u.is_agent`,
      [firm])).rows[0].n, 1, "the firm now has exactly ONE eligible human -- ARM 2' is the arm under test");
    const unattested = await caught(() => approve(soloDraft, preparer));
    assert.ok(unattested, "in a solo firm the director who is also the maker must attest");
    assert.equal(errorDetail(unattested)?.reason, "agent_self_approval_attestation_required",
      `${unattested?.message}`);
    const attested = (await approve(soloDraft, preparer, "the sole accountable human attests")).rows[0].r;
    assert.equal(attested.approval_arm, "agent_self_approval",
      "with the attestation it is admitted, and the arm is recorded as a self-approval, not an independent check");
  } finally {
    await rootQuery("update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [preparer, firm]);
  }
});

// =============================================================================================
// I -- S9's LANDED LINE. The seal now enqueues its render inside the sealing transaction.
// =============================================================================================
test("I -- sealing a dataset enqueues its pre_sign render job, attributed to the sealing identity", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `s9-${randomUUID().slice(0, 6)}`, seal: true });
  const jobs = (await rootQuery(
    "select kind, requested_by from clara.render_jobs where report_run_id=$1", [eps.runId])).rows;
  assert.equal(jobs.length, 1, "the human seal enqueued exactly one render job -- S9's line, landed");
  assert.equal(jobs[0].kind, "pre_sign", "of the kind 0080:225-236 states in words");

  // and the audit row for that enqueue names the identity that enqueued it, not a fabricated one
  const audit = (await rootQuery(
    `select actor, on_behalf_of, via_wake_kind from clara.audit_log
      where fn='enqueue_render_job' and (args->>'report_run_id')::uuid=$1`, [eps.runId])).rows[0];
  assert.ok(audit, "the enqueue is audited");
  assert.equal(audit.actor, owner, "a human-prepared run's enqueue is attributed to the human");
  assert.equal(audit.via_wake_kind, null, "and carries no wake kind, because no wake happened");
});

// =============================================================================================
// J -- DERIVATION #6 / RULING R-L23, ON THE LANE THAT ACTUALLY SEALS. Every pre_sign artifact in
// production is sealed by clara.complete_render_job, which calls the core POSITIONALLY WITH TEN
// ARGUMENTS and supplies no identity at all. Both halves of R-L23 are measured here: the ten-
// argument call still resolves against the thirteen-argument core (the tail-append), and the
// artifact's identity is DB-DERIVED from its run rather than taken from a caller that has none.
// Without this cell, gate-2 blocker 2 would be re-created one level over and cell C would still
// pass -- because cell C seals through the AGENT lane, which does pass an identity.
// =============================================================================================
test("J -- R-L23: the render worker's ten-argument call still resolves, and DB-derives the run's identity", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `rl23-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);

  // An AGENT-PREPARED run DIRECTED by Alice -- so "DB-derived" has something to be wrong about.
  const run = (await rootQuery(
    `select clara._open_report_run_core($1,$2,$3,$4,$5,$6,$7,$8,$9) as r`,
    [firm, AGENT_USER_ID, owner, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-rl23")])).rows[0].r;
  const runId = run.report_run_id;
  await evaluateMetricHuman(owner, {
    client: eps.client, definitionVersion: eps.definitionVersionId,
    periodIds: [eps.period.id], snapshotId: eps.snapshotId, runId,
  });

  // DRAIN FIRST, THEN SEAL. clara.claim_render_job hands out the OLDEST job, so without the park
  // this cell would complete some earlier case's job and assert against the wrong run -- zeta's
  // own lesson, reused rather than re-learned. The seal then enqueues MY job (S9's landed line).
  await parkQueue();
  await rootQuery(`select clara._seal_report_dataset_core($1,$2,$3,$4,$5,'{}'::uuid[],$6)`,
    [firm, AGENT_USER_ID, owner, "interactive", runId, opk("fa5-rl23-seal")]);

  const worker = `fa5-rl23-${randomUUID().slice(0, 8)}`;
  const job = (await asRuntime("select clara.claim_render_job($1) j", [worker])).rows[0].j;
  assert.ok(job, "the seal enqueued a job for the worker to claim");
  assert.equal(job.report_run_id, runId, "and it is THIS run's job, not an earlier case's");
  assert.equal(job.kind, "pre_sign", "of the kind S9's line enqueues");

  // The worker's completion manifest: the request half carried verbatim, the environment half
  // synthesised in the shape the real worker builds (zeta-fixtures.mjs's recipe).
  const sha = "e".repeat(64);
  const manifest = {
    ...job.request_manifest,
    render_request_sha256: job.manifest_sha256,
    assembler_version: "clara.reporting-render/v1",
    renderer_image_digest: `sha256:${"c".repeat(64)}`,
    renderer_source_commit: "d".repeat(40),
    node_version: "v20.19.5", os_version: "linux test", architecture: "x64",
    font_engine_version: "typst 0.0.0-test",
    document_metadata: { title: "f-a5 pr1", creation_date_utc: "2025-12-31T00:00:00Z" },
    extracted_text_sha256: "f".repeat(64),
    extraction_tool: "pdftotext (poppler-utils) 0.0.0-test",
    pre_sign_pdf_sha256: sha,
  };
  const done = (await asRuntime("select clara.complete_render_job($1,$2,$3,4096,$4::jsonb) r",
    [job.render_job_id, worker, sha, JSON.stringify(manifest)])).rows[0].r;
  assert.ok(done.report_artifact_id,
    "the TEN-argument positional call still resolves against the thirteen-argument core (R-L23)");

  const art = (await artifactRows(runId)).find((a) => a.id === done.report_artifact_id);
  assert.equal(art.sealed_by, AGENT_USER_ID,
    "complete_render_job seals as the machine -- which is why sealed_by alone could never arm ARM 1");
  assert.equal(art.directed_by, owner,
    "the artifact's director is DB-DERIVED from its run, on the lane that supplied no identity at all");
  assert.equal(art.prepared_by_agent, true, "and so is prepared_by_agent");

  // AND THE WALL IS ARMED BY IT. The run's director cannot now issue the pack she directed, on the
  // artifact side -- the term that was NULL before R-L23 and could never have refused anything.
  const refused = await caught(() => approveIssue(owner, {
    runId, expectedSha256: sha, selfAttestation: "alice attests", opKey: opk("fa5-rl23-issue") }));
  assert.ok(refused, "the director's own issue is refused on the render-worker-sealed artifact");
  assert.equal(errorDetail(refused)?.artifact_directed_by, owner,
    `and the refusal names the ARTIFACT-side term, not only the run's: ${refused?.message}`);
});

test("J2 -- an explicit director that disagrees with the run refuses artifact_identity_mismatch", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const owner = world.users.alice;
  const eps = await buildEpsilonWorld(world, { tag: `mism-${randomUUID().slice(0, 6)}`, seal: false });
  const firm = await firmIdOf(eps.client);
  const run = (await rootQuery(
    `select clara._open_report_run_core($1,$2,$3,$4,$5,$6,$7,$8,$9) as r`,
    [firm, AGENT_USER_ID, owner, "interactive", eps.client,
      eps.spec.report_spec_version_id, eps.snapshotId, eps.period.id, opk("fa5-mism")])).rows[0].r;
  const runId = run.report_run_id;
  await evaluateMetricHuman(owner, {
    client: eps.client, definitionVersion: eps.definitionVersionId,
    periodIds: [eps.period.id], snapshotId: eps.snapshotId, runId,
  });
  await rootQuery(`select clara._seal_report_dataset_core($1,$2,$3,$4,$5,'{}'::uuid[],$6)`,
    [firm, AGENT_USER_ID, owner, "interactive", runId, opk("fa5-mism-seal")]);

  const sha = "a".repeat(64);
  const manifest = await buildManifest({ runId, kind: "pre_sign", sha256: sha });
  const seal = (obo, opKey) => rootQuery(
    `select clara._seal_report_artifact_core($1,$2,$3,'pre_sign','pdf',$4,4096,$5::jsonb,null,$6,$7,
       'interactive',$8::jsonb) as r`,
    [firm, AGENT_USER_ID, runId, sha, JSON.stringify(manifest), opKey, obo,
      JSON.stringify(agentObj())]);

  // THE REFUSING POLARITY -- Bob did not direct this run; Alice did.
  const refused = await caught(() => seal(world.users.bob, opk("fa5-mism-a")));
  assert.ok(refused, "a seal naming a different director than its run is refused");
  const det = errorDetail(refused);
  assert.equal(det?.reason, "artifact_identity_mismatch", `${refused?.message}`);
  assert.equal(det?.run_directed_by, owner, "and it names the run's director");
  assert.equal(det?.seal_directed_by, world.users.bob, "beside the one the seal claimed");

  // THE ADMITTING TWIN -- ONE TERM CHANGED: the same seal, naming the run's real director.
  const ok = (await seal(owner, opk("fa5-mism-b"))).rows[0].r;
  assert.ok(ok.report_artifact_id, "the agreeing seal is admitted");
  const art = (await artifactRows(runId)).find((a) => a.id === ok.report_artifact_id);
  assert.equal(art.directed_by, owner, "and the row still carries the RUN's director, DB-derived");
});
