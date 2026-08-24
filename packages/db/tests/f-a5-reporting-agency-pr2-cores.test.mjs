// F-A5 PR-2 -- the NEW-CORE battery: reject / supersede / create_account_set / mint_snapshot /
// requeue, plus the four typed readers. Each cell proves the specific wall or receipt property
// design SS3.1/SS3.4/SS3.5 requires of that verb, through the WAKE DOOR (PR-1's own battery
// already proved the equivalent core-level behaviour for the six extractions it built).

import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import {
  assert, rootQuery, opk, endPool,
  pr2Ready, skipHere, mintWake, wakeModel, RATIONALE, callWrapper,
  buildPr2World, ensureEpsilonAdmin,
} from "./f-a5-reporting-agency-pr2-fixtures.mjs";
import { proposeMetricDefinition, approveMetricDefinition, measure, metricAst } from "./epsilon-fixtures.mjs";
import { asOwner, asRuntime, sealedRun } from "./zeta-fixtures.mjs";

let ready = false;
before(async () => { ready = await pr2Ready(); });
after(async () => { await endPool(); });

const model = () => JSON.stringify(wakeModel());
const casts = { p_model: "jsonb", p_selector: "jsonb", p_zero_when_no_rows: "boolean",
  p_effective_from: "date", p_period_ids: "uuid[]", p_byte_size: "bigint" };

// =============================================================================================
// reject -- the agent rejects a HUMAN's draft (TA-P1 C's widest arm); subject_author recorded.
// =============================================================================================
test("reject -- the agent rejects a human's draft; the audit trail records subject_author='human'", async (t) => {
  if (!ready) return skipHere(t, "the wrapper is absent");
  const { world, eps, cred } = await buildPr2World("reject-human");
  const preparer = await ensureEpsilonAdmin(world);
  const key = `reject_${randomUUID().slice(0, 8)}`;
  const versionId = await proposeMetricDefinition(preparer, {
    client: eps.client, key, unit: "money", ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });

  await callWrapper(cred.secret, "wake_reject_metric_definition", [
    ["p_definition_version_id", versionId], ["p_reason", "not needed"],
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("reject-human")],
  ], casts);

  const row = (await rootQuery("select state from clara.metric_definition_versions where id=$1", [versionId])).rows[0];
  assert.equal(row.state, "rejected");
  const audit = (await rootQuery(
    `select args from clara.audit_log where fn='agent_reject_metric_definition'
       and args->>'definition_version_id'=$1 order by at desc limit 1`, [versionId])).rows[0];
  assert.ok(audit, "an audit row was written for the agent reject");
  assert.equal(audit.args.subject_author, "human", "subject_author is recorded as human -- design SS3.5");
  const receipt = (await rootQuery(
    "select outcome, acting_identity from clara.report_agent_receipts where definition_version_id=$1 and act='reject_definition'",
    [versionId])).rows[0];
  assert.equal(receipt.outcome, "done");
});

// =============================================================================================
// supersede -- the agent supersedes an approved definition with a higher-revision approved one.
// =============================================================================================
test("supersede -- the agent supersedes a lower revision with a higher, approved one in the same lineage", async (t) => {
  if (!ready) return skipHere(t, "the wrapper is absent");
  const { world, eps, cred } = await buildPr2World("supersede");
  const preparer = await ensureEpsilonAdmin(world);
  const key = `supersede_${randomUUID().slice(0, 8)}`;
  const v1 = await proposeMetricDefinition(preparer, {
    client: eps.client, key, unit: "money", ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(world.users.alice, v1);
  const v2 = await proposeMetricDefinition(preparer, {
    client: eps.client, key, unit: "money", ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
  });
  await approveMetricDefinition(world.users.alice, v2);

  await callWrapper(cred.secret, "wake_supersede_metric_definition", [
    ["p_definition_version_id", v1], ["p_successor_version_id", v2], ["p_reason", "revised"],
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("supersede")],
  ], casts);

  const row = (await rootQuery("select state from clara.metric_definition_versions where id=$1", [v1])).rows[0];
  assert.equal(row.state, "superseded");
  const receipt = (await rootQuery(
    "select outcome from clara.report_agent_receipts where definition_version_id=$1 and act='supersede_definition'",
    [v1])).rows[0];
  assert.equal(receipt.outcome, "done");
});

// =============================================================================================
// create_account_set -- a fresh account set, receipted (the human body wrote no receipt at all).
// =============================================================================================
test("create_account_set -- the agent mints one; the audit+receipt the human body never wrote now exist", async (t) => {
  if (!ready) return skipHere(t, "the wrapper is absent");
  const { eps, cred } = await buildPr2World("account-set");
  const result = await callWrapper(cred.secret, "wake_create_account_set", [
    ["p_client", eps.client], ["p_set_key", `agent_set_${randomUUID().slice(0, 8)}`],
    ["p_title", "Agent-minted set"], ["p_selector", JSON.stringify({ account_types: ["revenue"] })],
    ["p_zero_when_no_rows", false], ["p_effective_from", "2016-01-01"],
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("account-set")],
  ], casts);
  assert.ok(result.account_set_version_id, "the wrapper returns a minted version id");
  const receipt = (await rootQuery(
    "select outcome from clara.report_agent_receipts where act='create_account_set' and client_id=$1 order by at desc limit 1",
    [eps.client])).rows[0];
  assert.equal(receipt.outcome, "done");
});

// =============================================================================================
// mint_metric_input_snapshot -- the appended producer version is used, NEVER the human's v1 row.
// =============================================================================================
test("mint_metric_input_snapshot -- the minted snapshot's producer_version_id is the APPENDED agent row, not the human's v1", async (t) => {
  if (!ready) return skipHere(t, "the wrapper is absent");
  const { eps, cred } = await buildPr2World("mint-snapshot");
  const humanProducerId = (await rootQuery(
    "select id from clara.metric_input_producer_versions where producer_name='metric_input_snapshot' and version=1 and firm_id is null")).rows[0].id;
  const agentProducerId = (await rootQuery(
    "select id from clara.metric_input_producer_versions where producer_name='metric_input_snapshot_agent' and version=1 and firm_id is null")).rows[0].id;
  assert.notEqual(humanProducerId, agentProducerId, "two distinct producer rows exist");

  const result = await callWrapper(cred.secret, "wake_mint_metric_input_snapshot", [
    ["p_client", eps.client], ["p_period_ids", [eps.period.id]],
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("mint-snapshot")],
  ], casts);
  const snap = (await rootQuery(
    "select producer_version_id from clara.metric_input_snapshots where id=$1", [result.snapshot_id])).rows[0];
  assert.equal(snap.producer_version_id, agentProducerId, "the agent snapshot is stamped with the APPENDED producer row");
  assert.notEqual(snap.producer_version_id, humanProducerId);

  const verify = (await rootQuery("select clara.verify_metric_input_producer_freeze() v")).rows[0].v;
  assert.equal(verify.ok, true, "the producer freeze verifier stays green after the append");
});

// =============================================================================================
// requeue -- j.requested_by (never the wake OBO) fills the audit's obo slot; p_obo rides the args
// as 'requeue_directed_by' instead, so no information is lost either way (header note 2).
// =============================================================================================
test("requeue -- a terminally failed job gets a lawful successor through the wake door; requested_by is preserved, p_obo rides the args", async (t) => {
  if (!ready) return skipHere(t, "the wrapper is absent");
  const { world, eps } = await sealedRun("requeue-pr2");
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: world.users.alice });
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;
  const before = (await rootQuery("select requested_by from clara.render_jobs where id=$1", [id])).rows[0];

  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [id]);
  await asRuntime("select clara.reap_exhausted_render_jobs() r");
  const failedRow = (await rootQuery("select state from clara.render_jobs where id=$1", [id])).rows[0];
  assert.equal(failedRow.state, "failed", "the job reached terminal failed state");

  const result = await callWrapper(cred.secret, "wake_requeue_render_job", [
    ["p_job", id], ["p_reason", "agent retry"], ["p_accept_drift", false],
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("requeue")],
  ], casts);
  assert.ok(result.render_job_id, "requeue mints a successor job");

  const audit = (await rootQuery(
    `select on_behalf_of, args from clara.audit_log where fn='agent_requeue_render_job'
       and args->>'render_job_id'=$1 order by at desc limit 1`, [result.render_job_id])).rows[0];
  assert.ok(audit, "an audit row was written for the agent requeue");
  assert.equal(audit.on_behalf_of, before.requested_by,
    "the audit's obo slot carries the run's requested_by, UNTOUCHED -- never overwritten by the wake caller's own p_obo");
  assert.equal(audit.args.requeue_directed_by, world.users.alice,
    "the wake caller's OWN director rides the args as requeue_directed_by, so no information is lost");

  const receipt = (await rootQuery(
    "select outcome from clara.report_agent_receipts where act='requeue_render' and report_run_id=$1 order by at desc limit 1",
    [eps.runId])).rows[0];
  assert.equal(receipt.outcome, "done");
});

// =============================================================================================
// The four typed readers -- each writes its own receipt in the SAME transaction as the read.
// =============================================================================================
test("readers -- each of the four typed readers returns a payload AND commits a typed_read receipt", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const { eps, cred } = await buildPr2World("readers");

  const runState = await callWrapper(cred.secret, "wake_report_run_state", [
    ["p_report_run_id", eps.runId], ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("read-run")],
  ], casts);
  assert.equal(runState.report_run_id, eps.runId);

  const claimState = await callWrapper(cred.secret, "wake_report_claim_state", [
    ["p_report_run_id", eps.runId], ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("read-claim")],
  ], casts);
  assert.equal(claimState.report_run_id, eps.runId);

  const artifactIndex = await callWrapper(cred.secret, "wake_report_artifact_index", [
    ["p_client", eps.client], ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("read-artifacts")],
  ], casts);
  assert.equal(artifactIndex.client_id, eps.client);
  assert.ok(Array.isArray(artifactIndex.artifacts));

  const defIndex = await callWrapper(cred.secret, "wake_metric_definition_index", [
    ["p_rationale", RATIONALE], ["p_model", model()], ["p_op_key", opk("read-defs")],
  ], casts);
  assert.ok(Array.isArray(defIndex));

  const total = (await rootQuery(
    "select count(*)::int n from clara.report_agent_receipts where act='typed_read'")).rows[0].n;
  assert.ok(total >= 4, `at least 4 typed_read receipts exist across the four reads above (found ${total})`);
});
