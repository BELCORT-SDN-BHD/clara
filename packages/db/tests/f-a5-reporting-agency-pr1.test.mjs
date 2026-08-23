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
import { rootQuery, endPool, ROLES } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import {
  skipUnlessEpsilon, caught, errorDetail, opk, firmIdOf,
  sealArtifact, approveIssue, evaluateMetricHuman,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, artifactRows } from "./epsilon-world.mjs";
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

before(async () => {
  if (await skipUnlessEpsilon({ skip: () => {} })) return;
  ready = await pr1Ready();
  if (ready) world = await buildWorld();
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
  const eps = await buildEpsilonWorld(world, { tag: `p6-${randomUUID().slice(0, 6)}`, seal: false });
  // the ADMITTING half: the trigger's exempt list still moves
  await rootQuery("update clara.report_runs set issue_reason='p6 probe' where id=$1", [eps.runId]);
  // the REFUSING half: a new column is frozen with no trigger edit, because the test is a
  // whole-row diff minus the exempt columns
  const frozen = await caught(() => rootQuery(
    "update clara.report_runs set directed_by=$2 where id=$1", [eps.runId, world.users.bob]));
  assert.ok(frozen, "changing directed_by after INSERT is refused");
  assert.equal(errorDetail(frozen)?.reason, "report_run_identity_immutable",
    `the refusal is the identity freeze, not something else: ${frozen?.message}`);
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
  const { buildManifest } = await import("./epsilon-fixtures.mjs");
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
  await rootQuery("select clara.seal_report_dataset($1,'{}'::uuid[],$2)", [eps.runId, opk("fa5-ctl-seal")])
    .catch(async () => { await rootQuery("select 1"); });
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
  assert.equal(row.deployed, false, "and it is BORN UNDEPLOYED -- the flip is a ceremony act");

  const firm = await firmIdOf(world.clients.A1);
  const args = [firm, AGENT_USER_ID, world.users.bob, "interactive", world.clients.A1,
    [randomUUID()], [randomUUID()], randomUUID(), randomUUID(),
    JSON.stringify(agentObj()), opk("fa5-gate")];
  const sql = `select clara.evaluate_fs_pack_agent_v1($1,$2,$3,$4,$5,$6::uuid[],$7::uuid[],$8,$9,$10::jsonb,$11) as r`;

  const pre = await caught(() => rootQuery(sql, args));
  assert.ok(pre, "the pre-ceremony call is refused");
  assert.equal(errorDetail(pre)?.reason, "evaluator_undeployed",
    `the gate is the reason, and it fires FIRST: ${pre?.message}`);

  // THE DIFFERENTIAL. Flip the row and call again with the same garbage identities: the refusal
  // must MOVE PAST the gate. Without this the cell above passes on a body that refuses everything.
  await rootQuery("update clara.evaluator_versions set deployed=true where id=$1", [row.id]);
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
  const { buildManifest } = await import("./epsilon-fixtures.mjs");
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
test("H -- the definition lifecycle admits agent_self_approval and REFUSES a machine act dressed as a human one", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const body = (await rootQuery(
    `select prosrc from pg_proc p where p.oid='clara._tf_metric_definition_lifecycle_v1()'::regprocedure`
  )).rows[0].prosrc;
  assert.match(body, /agent_self_approval/, "the agent evidence arm is installed");
  assert.match(body, /definition_evidence_kind_unknown/,
    "and a fifth evidence kind refuses rather than falling through (law 36)");
  assert.match(body, /human_approval/, "the human arm's admitting condition survives");
});

test("H2 -- the re-aimed maker/checker measures the DIRECTOR, not the acting identity", async (t) => {
  if (!ready) return skipHere(t, "the cores are absent");
  const src = (await rootQuery(
    `select prosrc from pg_proc p
      where p.oid='clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text)'::regprocedure`
  )).rows[0].prosrc;
  // The three re-aimed arms exist and are named. The BEHAVIOURAL forcing of each arm needs the
  // wake door to supply p_obo per call and lands with PR-2's wrappers; named here, not implied.
  assert.match(src, /definition_directed_self_approval/, "ARM 1' is installed");
  assert.match(src, /agent_self_approval_attestation_required/, "ARM 2' is installed");
  assert.match(src, /v_checker := p_obo/, "the checker is the approval wake's DIRECTOR");
  assert.match(src, /role in \('admin','owner'\)/,
    "and the eligible population is 0084's own, not eligible_checker_count (F5-D33)");
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
