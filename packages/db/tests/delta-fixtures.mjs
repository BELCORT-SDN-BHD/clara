import assert from "node:assert/strict";import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, wakeQuery, withActor, ROLES, PG, opk, buildWorld, endPool, addMember,
  insertUser, upsertAccountClassed, seedCitedDocument, mintInteractive, draftEntryV3, approveEntry, freshResolution,
} from "./a21-helpers.mjs";
import { has0056, freshActiveClient, setupCloseCoa, plainEntry, bookToday, proposeFY, openFY,
  birthCounterparty, BANK1, REVN, EXPN, AR1, AP1, RE1 } from "./x56-fixtures.mjs";
import {
  has0057, mintMonthSnapshot, reportingPeriodRows, periodSnapshotRow,
  openArItem57, creditNote57, applyOpenItems57, allocateReceipt57,
} from "./x57-fixtures.mjs";
import { retireDocumentFiling } from "./rig-docs-fixtures.mjs";import { reverseEntry } from "./rig-fixtures.mjs";
export {
  assert, randomUUID,
  rootQuery, humanQuery, roleQuery, wakeQuery, withActor, ROLES, PG, opk,
  buildWorld, endPool, addMember, insertUser, upsertAccountClassed, mintInteractive,
  draftEntryV3, approveEntry, freshResolution, has0056, freshActiveClient, setupCloseCoa, plainEntry, bookToday, proposeFY, openFY,
  birthCounterparty, has0057, mintMonthSnapshot, reportingPeriodRows, periodSnapshotRow,
  openArItem57, creditNote57, applyOpenItems57, allocateReceipt57,
  BANK1, REVN, EXPN, AR1, AP1, RE1,
};
export const DELTA_RELATIONS = Object.freeze([
  "metric_input_producer_versions", "metric_input_producer_version_members",
  "metric_input_snapshots", "metric_input_snapshot_periods",
  "metric_input_snapshot_contributions", "metric_input_snapshot_open_items",
  "metric_input_snapshot_allocations", "metric_input_snapshot_samples", "metric_units",
  "metric_temporalities", "metric_primitives", "metric_na_reason_versions", "metric_constants",
  "edge_policy_sets", "metric_edge_policies", "averaging_policy_versions", "account_sets",
  "account_set_versions", "account_set_version_members", "presentation_maps",
  "presentation_map_versions", "presentation_map_version_members", "metric_definitions",
  "metric_definition_versions", "evaluator_versions", "evaluator_version_members",
  "metric_evaluation_contexts", "metric_evaluation_context_periods", "metric_cells",
  "metric_cell_periods", "metric_cell_snapshots", "metric_cell_account_sets",
  "metric_cell_constants", "metric_cell_entries", "metric_cell_documents",
  "metric_cell_presentation_maps", "metric_cell_assessments", "metric_evaluation_attempt_receipts",
]);
// Exact public interface. A renamed argument, stale overload, or missing lifecycle
// door is a readiness failure, not a fixture adaptation opportunity.
export const DELTA_ENTRYPOINTS = Object.freeze([
  ["create_account_set_v1", "clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)"],
  ["propose_metric_definition", "clara.propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)"],
  ["approve_metric_definition", "clara.approve_metric_definition(uuid,bytea,text,text,text)"],
  ["reject_metric_definition", "clara.reject_metric_definition(uuid,text,text)"],
  ["supersede_metric_definition", "clara.supersede_metric_definition(uuid,uuid,text,text)"],
  ["mint_metric_input_snapshot_v1", "clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)"],
  ["evaluate_metric_v1", "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)"],
  ["evaluate_fs_pack_v1", "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)"], ["assess_metric_cell_independent_v1", "clara.assess_metric_cell_independent_v1(uuid,uuid,text)"],
  ["record_metric_evaluation_attempt_v1", "clara.record_metric_evaluation_attempt_v1(uuid,uuid,text,text,uuid[],text,text,jsonb)"], ["verify_evaluator_freeze", "clara.verify_evaluator_freeze()"],
]);
export const DELTA_ENTRYPOINT_NAMES = Object.freeze(DELTA_ENTRYPOINTS.map(([name]) => name));
export const DELTA_ARGUMENT_NAMES = Object.freeze({
  create_account_set_v1: ["p_client", "p_set_key", "p_title", "p_selector", "p_zero_when_no_rows", "p_effective_from", "p_op_key"],
  propose_metric_definition: ["p_client", "p_key", "p_title", "p_unit", "p_temporality", "p_result_scale", "p_ast", "p_allow_negative", "p_applies_from", "p_applies_to", "p_op_key"],
  approve_metric_definition: ["p_definition_version_id", "p_expected_formula_sha256", "p_reason", "p_self_approval_attestation", "p_op_key"],
  reject_metric_definition: ["p_definition_version_id", "p_reason", "p_op_key"],
  supersede_metric_definition: ["p_definition_version_id", "p_successor_version_id", "p_reason", "p_op_key"],
  mint_metric_input_snapshot_v1: ["p_client", "p_period_ids", "p_op_key"],
  evaluate_metric_v1: ["p_client", "p_definition_version_id", "p_period_ids", "p_snapshot_id", "p_run_id"],
  evaluate_fs_pack_v1: ["p_client", "p_definition_version_ids", "p_period_ids", "p_snapshot_id", "p_run_id"], assess_metric_cell_independent_v1: ["p_cell_id", "p_expected_cell_id", "p_op_key"],
  record_metric_evaluation_attempt_v1: ["p_client", "p_run_id", "p_outcome_class", "p_entrypoint", "p_definition_version_ids", "p_attempt_key", "p_configured_statement_timeout", "p_diagnostics"],
  verify_evaluator_freeze: [],
});
function argumentNames(row) { return row.arguments.match(/\bp_[a-z0-9_]+\b/g) ?? []; }
export async function relationExists(name) { return (await rootQuery("select to_regclass($1) is not null as ok", [`clara.${name}`])).rows[0].ok; }
export async function entrypointRows(name) {
  return (await rootQuery(
    `select p.oid, p.oid::regprocedure::text as signature, p.proname,
            pg_get_function_arguments(p.oid) as arguments,
            pg_get_function_result(p.oid) as result,
            p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
       from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname=$1
      order by p.oid`,
    [name],
  )).rows;
}
export async function exactEntrypoint(name) {
  const expected = DELTA_ENTRYPOINTS.find(([candidate]) => candidate === name)?.[1];
  assert.ok(expected, `fixture knows the exact ${name} signature`);
  const rows = await entrypointRows(name);
  assert.deepEqual(rows.map((row) => row.signature.startsWith("clara.") ? row.signature : `clara.${row.signature}`), [expected],
    `${name} has exactly the primary signature ${expected}`);
  assert.deepEqual(argumentNames(rows[0]), DELTA_ARGUMENT_NAMES[name],
    `${name} has exactly the public named arguments`);
  return rows[0];
}
export async function deltaReadiness() {
  const missingRelations = [];
  for (const relation of DELTA_RELATIONS) if (!(await relationExists(relation))) missingRelations.push(relation);
  const missingEntrypoints = [];
  const wrongEntrypoints = [];
  for (const [name, expected] of DELTA_ENTRYPOINTS) {
    const rows = await entrypointRows(name);
    if (rows.length === 0) missingEntrypoints.push(name);
    else if (rows.length !== 1 || (rows[0].signature.startsWith("clara.") ? rows[0].signature : `clara.${rows[0].signature}`) !== expected
      || JSON.stringify(argumentNames(rows[0])) !== JSON.stringify(DELTA_ARGUMENT_NAMES[name])) {
      wrongEntrypoints.push({
        name, expected, expectedArguments: DELTA_ARGUMENT_NAMES[name],
        observed: rows.map((row) => row.signature.startsWith("clara.") ? row.signature : `clara.${row.signature}`),
        observedArguments: rows.map(argumentNames),
      });
    }
  }
  return {
    ready: missingRelations.length === 0 && missingEntrypoints.length === 0 && wrongEntrypoints.length === 0,
    missingRelations, missingEntrypoints, wrongEntrypoints,
  };
}
export async function requireWaveEDelta() {
  const readiness = await deltaReadiness();
  assert.deepEqual(readiness, {
    ready: true, missingRelations: [], missingEntrypoints: [], wrongEntrypoints: [],
  }, `Wave E delta exact readiness failed: ${JSON.stringify(readiness)}`);
  return readiness;
}
/** True when the delta/epsilon ceremony's five covered closures (every evaluator except F-A5
 *  PR-1's own evaluate_fs_pack_agent, cell D's separate ceremony) are STILL undeployed -- a
 *  fresh witness. `_tf_evaluator_deploy_once` (0060) admits ONE undeployed->deployed transition
 *  per row EVER, so False means a PRIOR run already ceremonied this database (re-run, not a
 *  defect): callers skip the now-unwitnessable pre-ceremony half loudly instead of asserting it. */
// The CLOSED-WORLD roster this ceremony covers (delta-contract.test.mjs:64-73 is where it is
// pinned by name AND version). NAMED, not "any not-deployed row": a blanket count reclassifies a
// reused database migrated onto a NEW frontier that registers one more evaluator (born
// undeployed, unrelated to this ceremony) as falsely "fresh" -- fail-closed either way (every
// consumer would then assert against a roster that no longer matches and go loudly red), but
// this stays correct across a frontier move instead of needing a same-day fix. Extend this array
// the same day a new evaluator joins the ceremony (mirror delta-contract.test.mjs's own roster).
export const DELTA_CEREMONY_COVERED = Object.freeze([
  ["assess_metric_cell_independent", 1], ["evaluate_metric", 1],
  ["evaluate_witness_fact_state", 1], ["evaluate_witness_fact_state", 2],
  ["evaluate_witness_identity", 1],
]);
export async function evaluatorCeremonyUnwitnessed() {
  const rows = (await rootQuery("select evaluator_name,version,deployed from clara.evaluator_versions where firm_id is null")).rows;
  const byKey = new Map(rows.map((r) => [`${r.evaluator_name}@${r.version}`, r.deployed]));
  return DELTA_CEREMONY_COVERED.some(([name, version]) => byKey.get(`${name}@${version}`) === false);
}
export async function caught(fn) { try { await fn(); return null; } catch (error) { return error; } }
export function errorDetail(error) { if (!error?.detail) return {}; try { return JSON.parse(error.detail); } catch { return { raw: error.detail }; } }
export function reasonOf(error) {
  const detail = errorDetail(error);
  return detail.reason ?? detail.reason_code ?? detail.code ?? null;
}
export async function callHuman(sub, signature, args, casts = {}) {
  const fn = signature.slice("clara.".length, signature.indexOf("("));
  const sqlArgs = args.map(([name], index) => `${name} => $${index + 1}${casts[name] ? `::${casts[name]}` : ""}`);
  return (await humanQuery(sub, `select clara.${fn}(${sqlArgs.join(", ")}) as r`, args.map(([, value]) => value))).rows[0].r;
}
export async function createAccountSet(owner, {
  client, key, title = key, selector, zeroWhenNoRows = false, effectiveFrom = "2020-01-01", opKey = opk("delta-set"),
}) {
  return callHuman(owner, DELTA_ENTRYPOINTS[0][1], [
    ["p_client", client], ["p_set_key", key], ["p_title", title],
    ["p_selector", JSON.stringify(selector)], ["p_zero_when_no_rows", zeroWhenNoRows],
    ["p_effective_from", effectiveFrom], ["p_op_key", opKey],
  ], { p_selector: "jsonb", p_effective_from: "date" });
}
export async function proposeMetricDefinition(owner, {
  client, key, title = key, unit = "ratio", temporality = "flow", resultScale = 4,
  ast, allowNegative = false, appliesFrom = "2020-01-01", appliesTo = null, opKey = opk("delta-propose"),
}) {
  const receipt = await callHuman(owner, DELTA_ENTRYPOINTS[1][1], [
    ["p_client", client], ["p_key", key], ["p_title", title], ["p_unit", unit],
    ["p_temporality", temporality], ["p_result_scale", resultScale],
    ["p_ast", JSON.stringify(ast)], ["p_allow_negative", allowNegative],
    ["p_applies_from", appliesFrom], ["p_applies_to", appliesTo], ["p_op_key", opKey],
  ], { p_result_scale: "smallint", p_ast: "jsonb", p_applies_from: "date", p_applies_to: "date" });
  const versionId = receipt.definition_version_id ?? receipt.version_id ?? receipt.id;
  assert.ok(versionId, `proposal receipt names a definition version (${JSON.stringify(receipt)})`);
  return versionId;
}
export async function approveMetricDefinition(owner, versionId, {
  expectedHash = null, attestation = "delta contract battery solo-firm attestation",
  opKey = opk("delta-approve"),
} = {}) {
  const stored = (await rootQuery(
    "select '\\x'||encode(formula_sha256,'hex') as hash from clara.metric_definition_versions where id=$1",
    [versionId],
  )).rows[0];
  assert.ok(stored, "the proposed definition version exists before approval");
  return callHuman(owner, DELTA_ENTRYPOINTS[2][1], [
    ["p_definition_version_id", versionId], ["p_expected_formula_sha256", expectedHash ?? stored.hash],
    ["p_reason", "delta contract battery approval"],
    ["p_self_approval_attestation", attestation],
    ["p_op_key", opKey],
  ], { p_expected_formula_sha256: "bytea" });
}
export async function rejectMetricDefinition(owner, versionId) {
  return callHuman(owner, DELTA_ENTRYPOINTS[3][1], [
    ["p_definition_version_id", versionId], ["p_reason", "delta contract battery rejection"],
    ["p_op_key", opk("delta-reject")],
  ]);
}
export async function supersedeMetricDefinition(owner, { predecessor, successor }) {
  return callHuman(owner, DELTA_ENTRYPOINTS[4][1], [
    ["p_definition_version_id", predecessor], ["p_successor_version_id", successor],
    ["p_reason", "delta contract battery supersession"], ["p_op_key", opk("delta-supersede")],
  ]);
}
export async function assertThreeRevisionBackwardRefusal(owner, { client, key, predecessor, successor }) {
  const third = await proposeMetricDefinition(owner, {
    client, key, unit: "money",
    ast: metricAst({ root: { node: "sum", terms: [measure({ set: "revenue" }), measure({ set: "expense" })] }, unit: "money" }),
  });
  await approveMetricDefinition(owner, third);
  assert.ok(await caught(() => supersedeMetricDefinition(owner, { predecessor: third, successor: predecessor })),
    "a later third revision cannot supersede backward to revision one");
  const rows = (await rootQuery(
    `select id,state,supersedes_version_id from clara.metric_definition_versions
      where id=any($1::uuid[]) order by revision`, [[predecessor, successor, third]],
  )).rows;
  assert.deepEqual(rows.map((row) => [row.id, row.state, row.supersedes_version_id]), [
    [predecessor, "superseded", null], [successor, "firm_approved", predecessor], [third, "firm_approved", null],
  ], "the refused backward attempt preserves the one forward pointer");
}
async function assertProposalRefusalWithoutResidue(owner, o) {
  const opKey = `delta-invalid-${randomUUID()}`, { client, key, ast } = o;
  const error = await caught(() => proposeMetricDefinition(owner, { client, key, ast, opKey,
    unit: o.unit ?? ast.unit, temporality: o.temporality ?? ast.temporality,
    resultScale: o.resultScale ?? ast.result_scale }));
  assert.equal(error?.code, "CLR10"); assert.equal(reasonOf(error), o.reason);
  assert.match(errorDetail(error).fix ?? "", o.fix);
  assert.deepEqual((await rootQuery(`select count(distinct d.id)::int definitions,count(v.id)::int versions
    from clara.metric_definitions d left join clara.metric_definition_versions v on v.definition_id=d.id
    where d.firm_id=(select firm_id from clara.clients where id=$1)and d.definition_key=$2`, [client, key])).rows[0],
  { definitions: 0, versions: 0 });
  assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='propose_metric_definition' and op_key=$1", [opKey])).rows[0].n, 0);
}
export async function assertCountSchemaRefusals(owner, client) {
  const scope = { period: "$P0", entity: "$CLIENT", basis: "accrual" };
  for (const [tag, root, reason, fix] of [["missing_source", { node: "count", scope }, "unknown_field", /^use the closed count source, scope and optional-filter JSON shapes$/i], ["missing_scope", { node: "count", source: "open_items" }, "unknown_field", /^use the closed count source, scope and optional-filter JSON shapes$/i]]) await assertProposalRefusalWithoutResidue(owner, { client, key: `count_${tag}_${randomUUID()}`, ast: metricAst({ root, unit: "count" }), reason, fix });
}
async function assertSyntheticApprovalRefusal(owner, client, { tag, storedUnit = "money", edgeKey = "eps_v1", reason, fix }) {
  const ast = metricAst({ root: measure({ set: "revenue" }), unit: "money" }), rollback = new Error(`rollback synthetic ${tag} draft`), result = await caught(() => withActor({ transaction: true }, async (db) => {
    await db.query(`set role ${ROLES.fnOwner}`); const firm = (await db.query("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
    const catalog = (await db.query(`select (select id from clara.edge_policy_sets where firm_id is null and policy_set_key=$1) edge_id,(select id from clara.averaging_policy_versions where firm_id is null and policy_key='avg_month_end_v1' and implemented) average_id`, [edgeKey])).rows[0], normalized = (await db.query("select ($1::jsonb-'root')||jsonb_build_object('root',clara._normalize_metric_node_v1($1::jsonb->'root')) n", [ast])).rows[0].n, hash = (await db.query(`select clara._hash(jsonb_build_object('normalized_ast',$1::jsonb,'unit',$2::text,'temporality','flow','result_scale',4,'edge_policy_set','eps_v1','edge_policy_set_id',$3::uuid,'averaging_policy','avg_month_end_v1','averaging_policy_id',$4::uuid,'allow_negative',false)) h`, [normalized, storedUnit, catalog.edge_id, catalog.average_id])).rows[0].h;
    const definition = (await db.query("insert into clara.metric_definitions(firm_id,definition_key,title,created_by)values($1,$2,$2,$3)returning id", [firm, `stored_${tag}_${randomUUID()}`, owner])).rows[0].id, version = (await db.query(`insert into clara.metric_definition_versions(firm_id,definition_id,revision,ast,normalized_ast,formula_sha256,unit_key,temporality_key,result_scale,edge_policy_set_id,averaging_policy_id,allow_negative,state,applies_from,proposed_by,proposal_evidence,approval_evidence)values($1,$2,1,$3,$4,$5,$6,'flow',4,$7,$8,false,'draft','2020-01-01',$9,jsonb_build_object('kind','human_proposal','version',1,'client_id',$10::uuid),'{"kind":"not_applicable","version":1,"reason":"not_approved"}')returning id`, [firm, definition, ast, normalized, hash, storedUnit, catalog.edge_id, catalog.average_id, owner, client])).rows[0].id;
    const before = (await db.query("select unit_key,temporality_key,result_scale,edge_policy_set_id,state,approved_by,approved_at,approved_formula_sha256 from clara.metric_definition_versions where id=$1", [version])).rows[0], opKey = `delta-stored-${randomUUID()}`;
    await db.query(`set role ${ROLES.authenticated}`); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: owner, role: "authenticated" })]); await db.query("savepoint approval_revalidation_probe"); const error = await caught(() => db.query("select clara.approve_metric_definition($1,$2,$3,$4,$5)", [version, hash, "dynamic stored-row revalidation", "delta solo-firm attestation", opKey])); await db.query("rollback to savepoint approval_revalidation_probe");
    assert.equal(error?.code, "CLR10"); assert.equal(reasonOf(error), reason); assert.match(errorDetail(error).fix ?? "", fix); assert.deepEqual((await db.query("select unit_key,temporality_key,result_scale,edge_policy_set_id,state,approved_by,approved_at,approved_formula_sha256 from clara.metric_definition_versions where id=$1", [version])).rows[0], before); await db.query(`set role ${ROLES.fnOwner}`); assert.equal((await db.query("select count(*)::int n from clara.op_receipts where fn='approve_metric_definition' and op_key=$1", [opKey])).rows[0].n, 0); throw rollback;
  })); assert.equal(result, rollback);
}
export async function assertStoredDeclarationMismatchRefusals(owner, client) {
  await createStandardSets(owner, client); const triggers = await rootQuery(`select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.oid=any(array['clara.metric_definitions'::regclass,'clara.metric_definition_versions'::regclass,'clara.edge_policy_sets'::regclass]) order by 1,2`); assert.ok(triggers.rows.length>0&&triggers.rows.every((row)=>row.tgenabled==="O"), "durable draft probes positively read enabled catalog triggers"); await assertSyntheticApprovalRefusal(owner, client, { tag: "declaration", storedUnit: "ratio", reason: "declaration_mismatch", fix: /^make stored unit, temporality and scale match the validated AST$/i });
  const alternate = `eps_dynamic_${randomUUID().slice(0, 8)}`; await withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => { await db.query(`insert into clara.edge_policy_sets(policy_set_key,version,effective_from,content_sha256)values($1,1,'2020-01-01',clara._hash(jsonb_build_object('version',1,'test',$1::text)))`, [alternate]); });
  await assertSyntheticApprovalRefusal(owner, client, { tag: "policy", edgeKey: alternate, reason: "scope_mismatch", fix: /^bind the exact registered edge-policy identity whose effective window covers applies_from through applies_to$/i });
  assert.deepEqual((await rootQuery(`select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.oid=any(array['clara.metric_definitions'::regclass,'clara.metric_definition_versions'::regclass,'clara.edge_policy_sets'::regclass]) order by 1,2`)).rows, triggers.rows, "synthetic durable drafts never weaken or disable their catalog triggers");
}
export async function assertSettledSignedCount(owner, { client, period, snapshotId }) {
  const ast = metricAst({ root: { node: "count", source: "open_items", domain: "ar",
    scope: { period: "$P0", entity: "$CLIENT", basis: "accrual" } }, unit: "count", resultScale: 0 });
  const version = await proposeMetricDefinition(owner, { client, key: `open_count_${randomUUID()}`,
    unit: "count", resultScale: 0, ast });
  await approveMetricDefinition(owner, version);
  const cell = await cellRow(await evaluateMetricHuman(owner, { client, definitionVersion: version,
    periodIds: [period.id], snapshotId }));
  assert.deepEqual([cell.cell_status, Number(cell.exact_numerator), Number(cell.exact_denominator)], ["ok", 1, 1],
    "the public evaluator excludes the fully settled item and counts only the partially open invoice");
}
export async function callUnderStrictTimeout(sub, sql, args) {
  return withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, async (db) => {
    await db.query("set local statement_timeout='1s'");
    const before = (await db.query("show statement_timeout")).rows[0].statement_timeout;
    const result = await db.query(sql, args);
    assert.equal((await db.query("show statement_timeout")).rows[0].statement_timeout, before,
      "the evaluator did not widen the 1-second caller setting");
    return result.rows[0].r;
  });
}
export async function assertBehavioralTimeoutCaps(owner) {
  const client = await freshDeltaClient(owner, "timeout-behavior");
  await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(3), cents: 100 });
  const version = await proposeMetricDefinition(owner, {
    client, key: `timeout_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, version);
  const evaluated = await callUnderStrictTimeout(owner,
    "select clara.evaluate_metric_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5::uuid) r",
    [client, version, [fx.period.id], fx.snapshotId, randomUUID()]);
  const cell = await cellRow(evaluated);
  assert.ok(await callUnderStrictTimeout(owner,
    "select clara.assess_metric_cell_independent_v1($1::uuid,$2::uuid,$3::text) r",
    [cell.id, cell.id, `delta-timeout-${randomUUID()}`]));
  // The CANCELLED call uses its OWN definition so "the cancelled evaluation minted no cell" is assertable: the blocker holds the same run and legitimately leaves a cell there, so a run-wide count would say nothing about this boundary.
  const cancelledVersion = await proposeMetricDefinition(owner, { client, key: `timeout_cancelled_${randomUUID()}`, unit: "money", ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }) });
  await approveMetricDefinition(owner, cancelledVersion);
  const sql = "select clara.evaluate_metric_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5::uuid) r";
  const args = [client, version, [fx.period.id], fx.snapshotId, randomUUID()];
  const cancelledArgs = [client, cancelledVersion, [fx.period.id], fx.snapshotId, args[4]];
  let ready; const isReady = new Promise((resolve) => { ready = resolve; });
  let release; const held = new Promise((resolve) => { release = resolve; });
  const blocker = withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (db) => {
    const result = await db.query(sql, args); ready(); await held; return result.rows[0].r;
  });
  await Promise.race([isReady, blocker]);
  const started = Date.now(); let error;
  try {
    error = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (db) => {
      assert.equal((await db.query("show statement_timeout")).rows[0].statement_timeout, "0");
      await db.query("set local statement_timeout='15s'");
      await db.query(sql, cancelledArgs);
    }));
  } finally { release(); await blocker; }
  assert.equal(error?.code, "57014", `${error?.code} ${error?.message}`);
  assert.ok(Date.now() - started >= 14_000, "the public evaluator was cancelled by the outer 15-second batch cap");
  assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where client_id=$1 and run_id=$2 and definition_version_id=$3", [client, args[4], cancelledVersion])).rows[0].n, 0, "the cancelled evaluation minted no cell of its own — the never-a-fabricated-cell clause, proved on the timeout boundary as well as the cap one");
  return { client, runId: args[4], periodIds: args[2], snapshotId: fx.snapshotId, version, cancelledVersion, configuredTimeout: "15s" };
}
export async function assertContextOrderRefusal(owner, client) {
  await createStandardSets(owner, client);
  const start = await pastMonthStart(8);
  const first = await mintPeriodWithMovement(owner, { client, monthStart: start, cents: 100 });
  const second = await mintPeriodWithMovement(owner, { client, monthStart: addMonths(start, 1), cents: 200 });
  const source = await mintMetricInput(owner, { client, periodIds: [first.period.id, second.period.id] });
  const versions = [];
  for (const tag of ["first", "second", "third"]) {
    const version = await proposeMetricDefinition(owner, {
      client, key: `context_${tag}_${randomUUID()}`, unit: "money",
      ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, version); versions.push(version);
  }
  const runId = randomUUID();
  await evaluateMetricHuman(owner, { client, definitionVersion: versions[0],
    periodIds: [first.period.id, second.period.id], snapshotId: source.snapshotId, runId });
  for (const [version, periodIds] of [[versions[1], [second.period.id, first.period.id]], [versions[2], [first.period.id]]]) {
    const error = await caught(() => evaluateMetricHuman(owner, {
      client, definitionVersion: version, periodIds, snapshotId: source.snapshotId, runId,
    }));
    assert.equal(reasonOf(error), "scope_mismatch", `${error?.code} ${error?.message} ${error?.detail}`);
  }
  const rows = (await rootQuery(
    `select period_id from clara.metric_evaluation_context_periods
      where context_id=(select id from clara.metric_evaluation_contexts where client_id=$1 and run_id=$2) order by ordinal`,
    [client, runId],
  )).rows;
  assert.deepEqual(rows.map((row) => row.period_id), [first.period.id, second.period.id]);
}
export async function assertSnapshotForgeryRefusals(owner) {
  const client = await freshDeltaClient(owner, "fact-scalars");
  const cp = await birthCounterparty(owner, { client, name: `Delta facts ${randomUUID()}`, kind: "customer" });
  const start = await pastMonthStart(8), date = `${start.slice(0, 8)}05`;
  const invoice = await openArItem57(owner, { client, cp, cents: 80_000, postingDate: date });
  await allocateReceipt57(owner, { client, counterparty: cp, postingDate: date, bankAccount: BANK1,
    amountCents: 30_000, allocations: [{ item_id: invoice.item, amount_cents: 30_000 }] });
  const laterInvoice = await openArItem57(owner, { client, cp, cents: 20_000, postingDate: date });
  const laterCredit = await creditNote57(owner, { client, cp, cents: 10_000, postingDate: date });
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: start });
  const header = (await rootQuery("select * from clara.metric_input_snapshots where id=$1", [fx.snapshotId])).rows[0], facts = {};
  for (const name of ["contributions", "open_items", "allocations", "samples"]) facts[name] = (await rootQuery(
    `select * from clara.metric_input_snapshot_${name} where snapshot_id=$1 order by 1,2 limit 1`, [fx.snapshotId])).rows[0];
  const later = await applyOpenItems57(owner, { client, applications: [{ source_item_id: laterCredit.item, target_item_id: laterInvoice.item, amount_cents: 10_000 }] });
  const laterAllocation = (await rootQuery("select id from clara.open_item_allocations where application_group=$1 order by id limit 1", [later.group_id])).rows[0].id;
  const alternateEntry = (await rootQuery("select id from clara.journal_entries where client_id=$1 and status='approved' and id<>$2 order by id limit 1", [client, facts.contributions.entry_id])).rows[0].id;
  const alternateAccount = (await rootQuery("select account_id from clara.coa_accounts where client_id=$1 and account_id<>$2 order by account_id limit 1", [client, facts.contributions.account_id])).rows[0].account_id;
  const foreignAccount = (await rootQuery("select account_id from clara.coa_accounts where firm_id<>$1 order by account_id limit 1", [header.firm_id])).rows[0].account_id;
  const cited = await verifiedDocument(owner, client, "alternate exact contribution source");
  const attempt = async ({ table = null, target = null, marker = null, overrides = {}, headerOverrides = {}, code, pattern }) => {
    const id = randomUUID();
    const error = await expectFnOwnerActionRefusal(async (db) => {
      await db.query("set constraints clara.t_metric_input_snapshot_reconstruct,clara.t_metric_input_period_reconstruct,clara.t_metric_input_contribution_reconstruct,clara.t_metric_input_open_item_reconstruct,clara.t_metric_input_allocation_reconstruct,clara.t_metric_input_sample_reconstruct deferred");
      const hc = Object.keys(header), hk = Object.keys(headerOverrides), hp = [id, fx.snapshotId, ...hk.map((key) => headerOverrides[key])];
      await db.query(`insert into clara.metric_input_snapshots(${hc.join(",")}) select ${hc.map((column) => column === "id" ? "$1" : hk.includes(column) ? `$${hk.indexOf(column) + 3}` : `s.${column}`).join(",")} from clara.metric_input_snapshots s where s.id=$2`, hp);
      for (const name of ["periods", "contributions", "open_items", "allocations", "samples"]) {
        const relation = `clara.metric_input_snapshot_${name}`, probe = await db.query(`select * from ${relation} where false`);
        const columns = probe.fields.map((field) => field.name), keys = name === table ? Object.keys(overrides) : [];
        const params = name === table ? [id, fx.snapshotId, target[marker], ...keys.map((key) => overrides[key])] : [id, fx.snapshotId];
        const expressions = columns.map((column) => column === "snapshot_id" ? "$1" : keys.includes(column)
          ? `case when t.${marker}=$3 then $${keys.indexOf(column) + 4} else t.${column} end` : `t.${column}`);
        await db.query(`insert into ${relation}(${columns.join(",")}) select ${expressions.join(",")} from ${relation} t where t.snapshot_id=$2`, params);
      }
      if (!table) await db.query("select clara.verify_metric_input_snapshot($1)", [id]);
    });
    assert.equal(error.code, code, `${table ?? "header"}: ${error.message}`);
    assert.match(`${error.message} ${error.detail ?? ""}`, pattern, `${table ?? "header"} reaches its intended wall`);
  };
  const amountField = BigInt(facts.contributions.debit_cents) > 0n ? "debit_cents" : "credit_cents";
  const specs = [
    ["contributions", facts.contributions, "journal_line_id", { entry_id: alternateEntry }, "CLR11", /exact approved journal-line fact/i],
    ["contributions", facts.contributions, "journal_line_id", { account_id: alternateAccount }, "CLR11", /exact approved journal-line fact/i],
    ["contributions", facts.contributions, "journal_line_id", { account_type: facts.contributions.account_type === "income" ? "expense" : "income" }, "CLR11", /exact approved journal-line fact/i], ["contributions", facts.contributions, "journal_line_id", { account_class: facts.contributions.account_class === "payable" ? "receivable" : "payable" }, "CLR11", /exact approved journal-line fact/i],
    ["contributions", facts.contributions, "journal_line_id", { [amountField]: BigInt(facts.contributions[amountField]) + 1n }, "CLR11", /exact approved journal-line fact/i],
    ["contributions", facts.contributions, "journal_line_id", { document_id: cited.documentId, filing_id: cited.filingId, source_doc_sha256: cited.sha256 }, "CLR11", /exact approved journal-line fact/i],
    ["contributions", facts.contributions, "journal_line_id", { account_id: foreignAccount }, "23503", /foreign key/i],
    ["open_items", facts.open_items, "item_id", { counterparty_id: randomUUID() }, "CLR11", /exact source row/i],
    ["open_items", facts.open_items, "item_id", { amount_cents: BigInt(facts.open_items.amount_cents) + 1n }, "CLR11", /exact source row/i],
    ["allocations", facts.allocations, "allocation_id", { allocation_id: laterAllocation }, "CLR11", /exact source row/i],
    ["allocations", facts.allocations, "allocation_id", { effective_date: addMonths(start, 1) }, "CLR11", /exact source row/i],
    ["allocations", facts.allocations, "allocation_id", { application_group: randomUUID() }, "CLR11", /exact source row/i],
    ["samples", facts.samples, "sample_ordinal", { balance_cents: BigInt(facts.samples.balance_cents) + 1n }, "CLR11", /exact approved-books value/i], ["samples", facts.samples, "sample_ordinal", { account_type: facts.samples.account_type === "income" ? "expense" : "income" }, "CLR11", /exact captured account identity/i],
    ["samples", facts.samples, "sample_ordinal", { account_class: facts.samples.account_class === "payable" ? "receivable" : "payable" }, "CLR11", /exact captured account identity/i], ["samples", facts.samples, "sample_ordinal", { sample_date: date }, "CLR11", /closed calendar sample set/i],
  ];
  for (const [table, target, marker, overrides, code, pattern] of specs) await attempt({ table, target, marker, overrides, code, pattern });
  for (const [field, value] of [["dataset_sha256", Buffer.alloc(32, 7)], ["contribution_count", Number(header.contribution_count) + 1],
    ["open_item_count", Number(header.open_item_count) + 1], ["allocation_count", Number(header.allocation_count) + 1], ["sample_count", Number(header.sample_count) + 1]])
    await attempt({ headerOverrides: { [field]: value }, code: "CLR10", pattern: /header does not reconstruct from captured facts/i });
}
export async function mintMetricInput(owner, { client, periodIds }) {
  const receipt = await callHuman(owner, DELTA_ENTRYPOINTS[5][1], [
    ["p_client", client], ["p_period_ids", periodIds], ["p_op_key", opk("delta-source")],
  ], { p_period_ids: "uuid[]" });
  const snapshotId = receipt.snapshot_id ?? receipt.id;
  assert.ok(snapshotId, `snapshot receipt names its snapshot (${JSON.stringify(receipt)})`);
  return { receipt, snapshotId };
}
export async function evaluateMetricHuman(owner, {
  client, definitionVersion, periodIds, snapshotId, runId = randomUUID(),
}) {
  return callHuman(owner, DELTA_ENTRYPOINTS[6][1], [
    ["p_client", client], ["p_definition_version_id", definitionVersion],
    ["p_period_ids", periodIds], ["p_snapshot_id", snapshotId], ["p_run_id", runId],
  ], { p_period_ids: "uuid[]" });
}
export async function evaluateFsPackHuman(owner, { client, definitionVersions, periodIds, snapshotId, runId = randomUUID() }) { return callHuman(owner, DELTA_ENTRYPOINTS[7][1], [["p_client", client], ["p_definition_version_ids", definitionVersions], ["p_period_ids", periodIds], ["p_snapshot_id", snapshotId], ["p_run_id", runId]], { p_definition_version_ids: "uuid[]", p_period_ids: "uuid[]" }); }
/** A30b: record an evaluation-attempt receipt AFTER the failed attempt's transaction rolled back. The cap numbers are never passed in -- the entrypoint measures them. */
export async function recordMetricAttempt(owner, { client, runId, outcomeClass, entrypoint = "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)", definitionVersions = null, attemptKey, configuredTimeout = null, diagnostics = {} }) { return callHuman(owner, DELTA_ENTRYPOINTS[9][1], [["p_client", client], ["p_run_id", runId], ["p_outcome_class", outcomeClass], ["p_entrypoint", entrypoint], ["p_definition_version_ids", definitionVersions], ["p_attempt_key", attemptKey], ["p_configured_statement_timeout", configuredTimeout], ["p_diagnostics", JSON.stringify(diagnostics)]], { p_definition_version_ids: "uuid[]", p_diagnostics: "jsonb" }); }
export async function attemptReceiptRows(client, runId) { return (await rootQuery("select * from clara.metric_evaluation_attempt_receipts where client_id=$1 and run_id=$2 order by recorded_at,id", [client, runId])).rows; }
export async function assessMetricIndependentHuman(owner, { cell, expectedCell = cell }) {
  return callHuman(owner, DELTA_ENTRYPOINTS[8][1], [["p_cell_id", cell], ["p_expected_cell_id", expectedCell], ["p_op_key", opk("delta-assess")]]);
}
export async function pastMonthStart(n) {
  const [year, month] = (await bookToday()).split("-").map(Number);
  const total = year * 12 + month - 1 - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
export function addMonths(monthStart, n) {
  const [year, month] = monthStart.split("-").map(Number);
  const total = year * 12 + month - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
export async function freshDeltaClient(owner, tag) {
  const client = await freshActiveClient(owner, `delta-${tag}`);
  await setupCloseCoa(owner, client);
  return client;
}
export async function firmIdOf(client) {
  const row = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0];
  assert.ok(row?.firm_id, `client ${client} resolves to its firm`);
  return row.firm_id;
}
export async function reverseEntryGoverned(owner, entry) { return reverseEntry(owner, { entry, reason: "delta retained-snapshot reversal", opKey: opk("delta-reverse") }); }
export async function retireFilingGoverned(owner, filing) { const row = (await rootQuery("select revision_token from clara.document_filings where id=$1", [filing])).rows[0]; assert.ok(row?.revision_token); return retireDocumentFiling(owner, { filing, reason: "delta retained-snapshot retirement", expectedRevision: row.revision_token, opKey: opk("delta-retire") }); }
export async function verifiedDocument(owner, client, quote = "delta source document") {
  return seedCitedDocument(owner, { firm: await firmIdOf(client), client, quote });
}
export async function expectFnOwnerActionRefusal(action, expectedCodes = null) {
  const accepted = new Error("fn_owner action unexpectedly accepted");
  const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => { await action(db); throw accepted; }));
  assert.notEqual(error, accepted, "fn_owner action is refused");
  if (expectedCodes) assert.ok(expectedCodes.includes(error.code), `${error.code}: ${error.message}`);
  return error;
}
export const expectFnOwnerInsertRefusal = (sql, params, codes = null) =>
  expectFnOwnerActionRefusal(async (db) => { await db.query(sql, params); await db.query("set constraints all immediate"); }, codes);
export async function postCounterpartyEntry(owner, {
  client, counterparty, debit, credit, cents, postingDate, kind = "customer", memo = "delta counterparty entry",
}) {
  const proposal = { existing_id: counterparty, kind };
  const draft = await draftEntryV3(owner, {
    client, resolution: freshResolution(owner, client, { subjectKind: "manual", subjectId: null }),
    postingDate, memo, vendor: proposal, opKey: opk("delta-cp-entry"),
    lines: [{ account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" }],
  });
  await approveEntry(owner, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("delta-cp-approve") });
  return draft.entry_id;
}
export async function mintMonthPeriod(owner, { client, monthStart }) {
  const gamma = await mintMonthSnapshot(owner, { client, monthStart, opKey: opk("delta-period") });
  const period = (await reportingPeriodRows(client, "month")).find((row) => row.id === gamma.reporting_period_id);
  assert.ok(period, "the minted month resolves to a live reporting-period row");
  return { gamma, period };
}
export async function mintPeriodWithMovement(owner, {
  client, monthStart, debit = BANK1, credit = REVN, cents = 100_000,
}) {
  const entry = await plainEntry(owner, {
    client, debit, credit, cents, postingDate: `${monthStart.slice(0, 8)}10`,
    memo: `delta movement ${randomUUID().slice(0, 8)}`,
  });
  const { gamma, period } = await mintMonthPeriod(owner, { client, monthStart });
  const source = await mintMetricInput(owner, { client, periodIds: [period.id] });
  return { entry, gamma, period, ...source };
}
export function measure({
  set, period = "$P0", entity = "$CLIENT", basis = "accrual",
  aspect = "period_movement", presentAs = "natural",
}) {
  return {
    node: "measure", set: { key: set, kind: "account_set" }, aspect,
    present_as: presentAs, scope: { period, entity, basis },
  };
}
export function constant(key) { return { node: "constant", key }; }
export function metricAst({ root, unit = "ratio", temporality = "flow", resultScale = 4, extra = null }) {
  return {
    ast: "clara.metric/v1", unit, temporality, result_scale: resultScale,
    edge_policy_set: "eps_v1", root, ...(extra ?? {}),
  };
}
export async function createStandardSets(owner, client) {
  // i2 fail-closed selectors: an explicit code must resolve to exactly one ACTIVE account of this client, so the
  // "absent" case is a real governed account with no target-period facts -- a code that resolves to nothing now refuses.
  const tail =randomUUID().replace(/\D/g, "").slice(0, 6).padEnd(6, "0"), emptyZero = `80${tail}`, emptyAbsent = `81${tail}`;
  for (const [code, name] of [[emptyZero, "Delta governed no-facts zero account"], [emptyAbsent, "Delta governed no-facts absent account"]]) await upsertAccountClassed(owner, { client, code, name, type: "expense" });
  const sets = [
    ["revenue", { account_codes: [REVN] }, false], ["expense", { account_codes: [EXPN] }, false],
    ["bank", { account_codes: [BANK1] }, false], ["ar", { account_codes: [AR1] }, false],
    ["empty_absent", { account_codes: [emptyAbsent] }, false], ["empty_zero", { account_codes: [emptyZero] }, true],
  ];
  const receipts = new Map(); for (const [key, selector, zero] of sets) receipts.set(key, await createAccountSet(owner, { client, key, selector, zeroWhenNoRows: zero }));
  receipts.emptyZeroCode = emptyZero; receipts.emptyAbsentCode = emptyAbsent; return receipts;
}
export async function cellRow(receipt) {
  const cellId = receipt.cell_id ?? receipt.id;
  assert.ok(cellId, `evaluator receipt names a cell (${JSON.stringify(receipt)})`);
  const row = (await rootQuery("select * from clara.metric_cells where id=$1", [cellId])).rows[0];
  assert.ok(row, `metric cell ${cellId} persisted`);
  return row;
}
