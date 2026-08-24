// F-A5 PR-2 -- the WAKE-DOOR battery: negative controls (no credential, proactive refused, blank
// op_key/rationale/incomplete model) and the positive OBO chain through the granted wrappers --
// open -> evaluate -> assess -> seal dataset -> seal artifact -- proving the identity writes and
// the receipt trail land through the wake door, not just through the ungranted core (PR-1's own
// battery already proved the core; this proves the DOOR PR-2 built onto it).
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (law 31): the negative controls below each have a
// positive twin in the chain test that follows, so a cell here cannot be mistaken for "the door
// refuses everything".

import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import {
  assert, rootQuery, opk, endPool,
  pr2Ready, skipHere, mintWake, wakeModel, RATIONALE, callWrapper,
  buildPr2World, caught, reasonOf,
} from "./f-a5-reporting-agency-pr2-fixtures.mjs";
import { buildManifest, sha64 } from "./epsilon-fixtures.mjs";

let ready = false;
before(async () => { ready = await pr2Ready(); });
after(async () => { await endPool(); });

// =============================================================================================
// B.1 -- NEGATIVE CONTROLS. Every wrapper refuses before any work on a bad channel.
// =============================================================================================
test("B.1 -- no wake credential refuses CLR03 (a bad channel, three representative verbs)", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const bogusSecret = randomUUID();
  for (const [fn, args] of [
    ["wake_report_run_state", [["p_report_run_id", randomUUID()], ["p_rationale", RATIONALE],
      ["p_model", JSON.stringify(wakeModel())], ["p_op_key", opk("no-cred")]]],
    ["wake_metric_definition_index", [["p_rationale", RATIONALE],
      ["p_model", JSON.stringify(wakeModel())], ["p_op_key", opk("no-cred")]]],
    ["wake_reject_metric_definition", [["p_definition_version_id", randomUUID()], ["p_reason", "x"],
      ["p_rationale", RATIONALE], ["p_model", JSON.stringify(wakeModel())], ["p_op_key", opk("no-cred")]]],
  ]) {
    const error = await caught(() => callWrapper(bogusSecret, fn, args, {
      p_report_run_id: "uuid", p_definition_version_id: "uuid", p_model: "jsonb",
    }));
    assert.equal(error?.code, "CLR03", `${fn} refuses a bad wake secret with CLR03`);
  }
});

test("B.1 -- a 'proactive' credential attempting an F-A5 verb is refused CLR03 (the call is MADE and refused, F-A2's C.1 lesson)", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const world = (await buildPr2World("proactive-refused")).world;
  const cred = await mintWake({ kind: "proactive", firm: world.firms.A });
  const error = await caught(() => callWrapper(cred.secret, "wake_metric_definition_index",
    [["p_rationale", RATIONALE], ["p_model", JSON.stringify(wakeModel())], ["p_op_key", opk("proactive")]]));
  assert.equal(error?.code, "CLR03", "a proactive-kind credential is refused -- no F-A5 verb is ever allowlisted under 'proactive'");
});

test("B.1 -- blank op_key / blank rationale / incomplete model each refuse before any work", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const world = (await buildPr2World("blank-checks")).world;
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: world.users.alice });
  const good = { p_rationale: RATIONALE, p_model: JSON.stringify(wakeModel()), p_op_key: opk("blank") };
  const casts = { p_model: "jsonb" };

  const e1 = await caught(() => callWrapper(cred.secret, "wake_metric_definition_index",
    [["p_rationale", good.p_rationale], ["p_model", good.p_model], ["p_op_key", ""]], casts));
  assert.equal(e1?.code, "CLR10", "blank op_key refuses CLR10");
  assert.equal(reasonOf(e1), "invalid_request", "blank op_key names invalid_request");

  const e2 = await caught(() => callWrapper(cred.secret, "wake_metric_definition_index",
    [["p_rationale", ""], ["p_model", good.p_model], ["p_op_key", good.p_op_key]], casts));
  assert.equal(e2?.code, "CLR10", "blank rationale refuses CLR10");

  const e3 = await caught(() => callWrapper(cred.secret, "wake_metric_definition_index",
    [["p_rationale", good.p_rationale], ["p_model", JSON.stringify({ model: "x" })], ["p_op_key", good.p_op_key]], casts));
  assert.equal(e3?.code, "CLR10", "a model object missing model_version refuses CLR10");

  const e4 = await caught(() => callWrapper(cred.secret, "wake_metric_definition_index",
    [["p_rationale", good.p_rationale], ["p_model", "null"], ["p_op_key", good.p_op_key]], casts));
  assert.equal(e4?.code, "CLR10", "a null model refuses CLR10");
});

// =============================================================================================
// B.2 -- THE POSITIVE OBO CHAIN, through the WAKE DOOR (differential twin to the refusals above:
// the SAME verbs that refuse a bad channel succeed on a good one).
// =============================================================================================
test("B.2 -- open -> evaluate -> assess -> seal dataset -> seal artifact, through the wake door, OBO a director", async (t) => {
  if (!ready) return skipHere(t, "the wrappers are absent");
  const { world, eps, cred } = await buildPr2World("chain");
  const model = JSON.stringify(wakeModel());

  const open = await callWrapper(cred.secret, "wake_open_report_run", [
    ["p_client", eps.client], ["p_report_spec_version_id", eps.spec.report_spec_version_id],
    ["p_books_snapshot_id", eps.snapshotId], ["p_reporting_period_id", eps.period.id],
    ["p_rationale", RATIONALE], ["p_model", model], ["p_op_key", opk("chain-open")],
  ], { p_model: "jsonb" });
  assert.ok(open.report_run_id, "open returns a report_run_id");

  const runRow = (await rootQuery(
    "select requested_by, directed_by, prepared_by_agent, state from clara.report_runs where id=$1",
    [open.report_run_id])).rows[0];
  assert.equal(runRow.prepared_by_agent, true, "the run is marked prepared_by_agent");
  assert.equal(runRow.directed_by, world.users.alice, "directed_by carries the OBO director");
  assert.equal(runRow.requested_by, world.users.alice, "requested_by carries the directing human (coalesce(obo, actor))");
  assert.equal(runRow.state, "drafting");

  const openReceipt = (await rootQuery(
    "select act, outcome, acting_identity, directed_by from clara.report_agent_receipts where report_run_id=$1 and act='open_run'",
    [open.report_run_id])).rows[0];
  assert.ok(openReceipt, "an open_run receipt row was written");
  assert.equal(openReceipt.outcome, "done");
  assert.equal(openReceipt.directed_by, world.users.alice);

  await callWrapper(cred.secret, "wake_evaluate_report_pack", [
    ["p_report_run_id", open.report_run_id], ["p_definition_version_ids", [eps.definitionVersionId]],
    ["p_period_ids", [eps.period.id]], ["p_snapshot_id", eps.snapshotId],
    ["p_rationale", RATIONALE], ["p_model", model], ["p_op_key", opk("chain-eval")],
  ], { p_definition_version_ids: "uuid[]", p_period_ids: "uuid[]", p_model: "jsonb" });
  const cellCount = (await rootQuery(
    "select count(*)::int n from clara.metric_cells where run_id=$1", [open.report_run_id])).rows[0].n;
  assert.equal(cellCount, 1, "the evaluate leg minted one cell");

  await callWrapper(cred.secret, "wake_assess_report_claim", [
    ["p_report_run_id", open.report_run_id], ["p_op_key", opk("chain-assess")],
    ["p_rationale", RATIONALE], ["p_model", model],
  ], { p_model: "jsonb" });
  const assessReceipt = (await rootQuery(
    "select 1 from clara.report_agent_receipts where report_run_id=$1 and act='assess_claim'",
    [open.report_run_id])).rowCount;
  assert.equal(assessReceipt, 1, "an assess_claim receipt row was written (header note 1: wrapper-mediated)");

  const seal = await callWrapper(cred.secret, "wake_seal_report_dataset", [
    ["p_report_run_id", open.report_run_id], ["p_chart_template_version_ids", []],
    ["p_op_key", opk("chain-seal-ds")], ["p_rationale", RATIONALE], ["p_model", model],
  ], { p_chart_template_version_ids: "uuid[]", p_model: "jsonb" });
  assert.equal(seal.state, "dataset_sealed");
  const sealDsReceipt = (await rootQuery(
    "select 1 from clara.report_agent_receipts where report_run_id=$1 and act='seal_dataset'",
    [open.report_run_id])).rowCount;
  assert.equal(sealDsReceipt, 1, "a seal_dataset receipt row was written");

  // S9's line, now proven through the wake door: _seal_report_dataset_core's own tail always
  // enqueues a 'pre_sign' render job (rig-measured: unconditional, not claim-eligibility-gated).
  const enqueued = (await rootQuery(
    "select count(*)::int n from clara.render_jobs where report_run_id=$1 and kind='pre_sign'",
    [open.report_run_id])).rows[0].n;
  assert.equal(enqueued, 1, "the seal-dataset leg's S9 enqueue landed even through the wrapper");

  const sha = sha64("chain-artifact");
  const manifest = await buildManifest({ runId: open.report_run_id, kind: "draft_watermarked", sha256: sha });
  const artifact = await callWrapper(cred.secret, "wake_seal_report_artifact", [
    ["p_report_run_id", open.report_run_id], ["p_kind", "draft_watermarked"], ["p_key_extension", "pdf"],
    ["p_sha256", sha], ["p_byte_size", 4096], ["p_manifest", JSON.stringify(manifest)],
    ["p_prior_artifact_id", null], ["p_rationale", RATIONALE], ["p_model", model], ["p_op_key", opk("chain-artifact")],
  ], { p_byte_size: "bigint", p_manifest: "jsonb", p_model: "jsonb" });
  assert.ok(artifact, "seal_artifact returns");
  const artRow = (await rootQuery(
    "select directed_by, prepared_by_agent from clara.report_artifacts where id=$1", [artifact.artifact_id ?? artifact.report_artifact_id ?? artifact.id])).rows[0];
  // Whichever key the seal core returns the id under, the row it wrote is what matters here.
  const anyArtRow = (await rootQuery(
    "select directed_by, prepared_by_agent from clara.report_artifacts where report_run_id=$1 order by sealed_at desc limit 1",
    [open.report_run_id])).rows[0];
  assert.equal((artRow ?? anyArtRow).prepared_by_agent, true, "the artifact is marked prepared_by_agent (D1 #6, DB-derived from the run)");
  assert.equal((artRow ?? anyArtRow).directed_by, world.users.alice, "the artifact's directed_by matches the run's director");
});
