// Card 1 (the substitution seam) — SHARED FIXTURES. A module the two card-1 test files import;
// it is not itself collected (`*.test.mjs` only).
//
// Design of record: card1-substitution-seam-design.md §1-§2 · -part2.md §3 · -part3.md §4-§7 ·
// card1-substitution-seam-annexes.md Annex B (the battery this file's consumers implement).
//
// THREE-STATE GATE, not two. Every cell in this lane depends on card 1's own migration, which may
// not be applied on the database a package-wide run happens to hit. `card1Ready()` answers with
// THREE outcomes and never a silent one: fully applied (run), fully absent (skip LOUDLY, named and
// counted), or PARTIAL — which is a DRIFT and throws, because a half-applied surface is the one
// state that would let a cell pass by testing something else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, ROLES, asWake, opk } from "./rig-helpers.mjs";
import { mintWake } from "./rig-fixtures.mjs";
import {
  createStandardSets, mintPeriodWithMovement, mintMetricInput, mintMonthPeriod,
  proposeMetricDefinition, approveMetricDefinition, evaluateMetricHuman,
  metricAst, measure, pastMonthStart, addMonths,
} from "./delta-fixtures.mjs";

export const CARD1_FNS = Object.freeze([
  "clara._validate_metric_node_v2(jsonb,uuid,uuid,integer)",
  "clara.validate_metric_ast_v2(jsonb,uuid,uuid)",
  "clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)",
  "clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)",
  "clara._eta_compose_metric_preview_core_v2(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)",
  "clara.wake_compose_metric_preview_v2(uuid,jsonb,uuid[],uuid,text)",
  "clara.claim_sandbox_export(text,interval)",
  "clara.sandbox_dispatch_begin(interval,int)",
  "clara.sandbox_dispatch_record(uuid[],boolean,jsonb)",
  "clara.reap_exhausted_sandbox_exports()",
]);

export const V2_ENTRYPOINT = "clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)";
export const V1_ENTRYPOINT = "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)";

/** The 7 dispatch/cap columns BL-6's ALTER adds to clara.sandbox_exports. */
export const SANDBOX_DISPATCH_COLUMNS = Object.freeze([
  "claim_delay_ms", "dispatch_attempts", "first_claimed_at",
  "last_dispatch_at", "last_dispatch_error", "last_dispatch_ok", "max_attempts",
]);

export async function card1Ready() {
  const r = await rootQuery(
    `select (select count(*)::int from unnest($1::text[]) s where to_regprocedure(s) is not null) as fns,
            exists(select 1 from clara.metric_primitives where primitive_key='cell') as primitive,
            exists(select 1 from clara.evaluator_versions
                    where evaluator_name='evaluate_metric' and version=2 and firm_id is null) as closure,
            (select count(*)::int from information_schema.columns
              where table_schema='clara' and table_name='sandbox_exports'
                and column_name = any($2::text[])) as cols`,
    [[...CARD1_FNS], [...SANDBOX_DISPATCH_COLUMNS]]);
  const s = r.rows[0];
  const halves = [s.fns === CARD1_FNS.length, s.primitive, s.closure, s.cols === 7];
  if (halves.every((h) => !h)) return false;
  if (!halves.every((h) => h)) {
    throw new Error(`CARD 1 DRIFT: fns=${s.fns}/${CARD1_FNS.length} cell_primitive=${s.primitive} v2_closure=${s.closure} dispatch_cols=${s.cols}/7`);
  }
  return true;
}

/** A NAMED, COUNTED skip — never a bare return, never a swallowed premise. */
export function skipHere(t, why) { t.skip(`card 1: ${why}`); return true; }

/** Is (evaluate_metric, 2) still dark? Read BEFORE anything in a run can flip it. */
export async function v2Deployed() {
  const r = await rootQuery(
    "select deployed from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=2 and firm_id is null");
  return r.rows[0]?.deployed === true;
}

/**
 * CARD 1'S OWN CEREMONY, on f-a5-reporting-agency-pr1.test.mjs cell D's exact terms.
 *
 * (evaluate_metric, 2) is BORN UNDEPLOYED and the estate's shared ceremonies deliberately exclude
 * it (CD-15: stage (b) ships DARK until a separate act), so this lane performs its own flip —
 * AFTER its own battery has watched the pre-flip refusal, exactly as cell D does for
 * evaluate_fs_pack_agent. `current_user = session_user` is the trigger's requirement, which the
 * root actor satisfies (no SET ROLE).
 */
export async function deployV2() {
  await rootQuery(
    "update clara.evaluator_versions set deployed=true where not deployed and evaluator_name='evaluate_metric' and version=2");
  assert.equal(await v2Deployed(), true, "the card-1 ceremony flipped (evaluate_metric, 2) to deployed");
}

/** The v1 covered closures every lane's fixtures need deployed before anything evaluates. */
export async function ensureV1EvaluatorsDeployed() {
  await rootQuery(
    `update clara.evaluator_versions set deployed = true
      where not deployed and (evaluator_name, version) not in (('evaluate_fs_pack_agent',1),('evaluate_metric',2))`);
}

// ---------------------------------------------------------------------------------------------
// CELLS. A definition-backed cell is what a stage-(b) `cell` node may cite (BL-5); a
// preview-composed one is what it may NOT. Both are minted through the estate's OWN audited
// pipelines — never a hand-rolled metric_cells row, which _tf_metric_cell_integrity would refuse
// anyway and which would prove nothing about the real path.
// ---------------------------------------------------------------------------------------------

/**
 * A CANONICAL, DEFINITION-BACKED, 'ok' cell plus everything a composing context needs.
 * Returns { cellId, clientId, periodId, snapshotId, definitionVersionId, unitKey, monthStart }.
 */
export async function mintDefinitionBackedCell(owner, client, tag, { unit = "money", monthsBack = 2 } = {}) {
  await createStandardSets(owner, client);
  const monthStart = await pastMonthStart(monthsBack);
  const { period, snapshotId } = await mintPeriodWithMovement(owner, { client, monthStart, cents: 100_000 });
  const version = await proposeMetricDefinition(owner, {
    client, key: `card1_${tag}_${randomUUID().slice(0, 8)}`, unit,
    ast: metricAst({ root: measure({ set: "revenue" }), unit }),
  });
  await approveMetricDefinition(owner, version);
  const receipt = await evaluateMetricHuman(owner, {
    client, definitionVersion: version, periodIds: [period.id], snapshotId,
  });
  const row = (await rootQuery(
    `select id, cell_status, definition_version_id, unit_key, books_watermark, displayed_text,
            evaluation_context_id, firm_id
       from clara.metric_cells where id=$1`, [receipt.cell_id])).rows[0];
  assert.equal(row.cell_status, "ok", `${tag}: the fixture cell must be 'ok'`);
  assert.ok(row.definition_version_id, `${tag}: the fixture cell must be definition-backed`);
  return {
    cellId: row.id, clientId: client, firmId: row.firm_id, periodId: period.id, snapshotId,
    contextId: row.evaluation_context_id, definitionVersionId: version, unitKey: row.unit_key,
    booksWatermark: row.books_watermark, displayedText: row.displayed_text, monthStart,
  };
}

/**
 * The same, but for a definition whose declared temporality is POINT_IN_TIME (a closing-balance
 * measure). M7's differential needs it: a `cell` operand's temporality must come from the cited
 * cell's OWN definition version, so a point_in_time cell that came back 'flow' would prove the
 * value was hardcoded.
 */
export async function mintPointInTimeCell(owner, client, tag) {
  await createStandardSets(owner, client);
  const monthStart = await pastMonthStart(2);
  const { period, snapshotId } = await mintPeriodWithMovement(owner, { client, monthStart, cents: 100_000 });
  const version = await proposeMetricDefinition(owner, {
    client, key: `card1_pit_${tag}_${randomUUID().slice(0, 8)}`, unit: "money",
    temporality: "point_in_time",
    ast: metricAst({
      root: measure({ set: "revenue", aspect: "closing_balance" }),
      unit: "money", temporality: "point_in_time",
    }),
  });
  await approveMetricDefinition(owner, version);
  const receipt = await evaluateMetricHuman(owner, {
    client, definitionVersion: version, periodIds: [period.id], snapshotId,
  });
  const row = (await rootQuery(
    "select id, cell_status, definition_version_id, unit_key from clara.metric_cells where id=$1",
    [receipt.cell_id])).rows[0];
  return {
    cellId: row.id, cellStatus: row.cell_status, clientId: client, periodId: period.id,
    snapshotId, definitionVersionId: version, unitKey: row.unit_key,
  };
}

/**
 * A NON-'ok' cell, minted through the REAL evaluator rather than by editing a row (which
 * _tf_metric_cell_integrity would refuse anyway, and which would prove nothing about the path a
 * placeholder actually cites). `divide(revenue, constant 'zero')` lands on delta's own
 * divide_by_zero edge policy, so the cell comes back `undefined` with a period-effective N/A
 * reason — a genuine product of the pipeline, not a fixture pretending to be one.
 */
export async function mintUndefinedCell(owner, client, tag) {
  await createStandardSets(owner, client);
  const monthStart = await pastMonthStart(2);
  const { period, snapshotId } = await mintPeriodWithMovement(owner, { client, monthStart, cents: 100_000 });
  const version = await proposeMetricDefinition(owner, {
    client, key: `card1_undef_${tag}_${randomUUID().slice(0, 8)}`, unit: "money",
    ast: metricAst({
      root: { node: "divide", num: measure({ set: "revenue" }), den: { node: "constant", key: "zero" } },
      unit: "money",
    }),
  });
  await approveMetricDefinition(owner, version);
  const receipt = await evaluateMetricHuman(owner, {
    client, definitionVersion: version, periodIds: [period.id], snapshotId,
  });
  const row = (await rootQuery("select id, cell_status from clara.metric_cells where id=$1", [receipt.cell_id])).rows[0];
  assert.notEqual(row.cell_status, "ok", `${tag}: the fixture must produce a NON-ok cell to be worth anything`);
  return { cellId: row.id, cellStatus: row.cell_status, clientId: client, periodId: period.id, snapshotId };
}

/** A SECOND month period + a snapshot covering BOTH months, for the M6 period-set axis. */
export async function addSecondPeriod(owner, { client, monthStart }) {
  const { period } = await mintMonthPeriod(owner, { client, monthStart: addMonths(monthStart, 1) });
  return period;
}

/** Mint a wake credential and run one call as that wake identity (interactive kind). */
export async function asSandboxWake(firm, obo, fn) {
  const { secret } = await mintWake({ kind: "interactive", firm, onBehalfOf: obo });
  return asWake(ROLES.wakeInteractive, secret, fn);
}

const COMPOSE_V1_SQL =
  "select clara.wake_compose_metric_preview($1::uuid,$2::jsonb,$3::uuid[],$4::uuid,$5::text) as r";
const COMPOSE_V2_SQL =
  "select clara.wake_compose_metric_preview_v2($1::uuid,$2::jsonb,$3::uuid[],$4::uuid,$5::text) as r";

/** A PREVIEW-COMPOSED cell (definition_version_id IS NULL) via the UNTOUCHED v1 wrapper. */
export async function composePreviewV1(firm, obo, { client, ast, periodIds, snapshotId, opKey }) {
  const r = await asSandboxWake(firm, obo, (db) =>
    db.query(COMPOSE_V1_SQL, [client, JSON.stringify(ast), periodIds, snapshotId, opKey ?? opk("card1-v1")]));
  return r.rows[0].r;
}

/** A stage-(b) composition through the NEW v2 wrapper. Returns the receipt (or throws). */
export async function composePreviewV2(firm, obo, { client, ast, periodIds, snapshotId, opKey }) {
  const r = await asSandboxWake(firm, obo, (db) =>
    db.query(COMPOSE_V2_SQL, [client, JSON.stringify(ast), periodIds, snapshotId, opKey ?? opk("card1-v2")]));
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------------------------
// AST + body builders.
// ---------------------------------------------------------------------------------------------
export const cellNode = (id) => ({ node: "cell", cell_id: id });
export const divide = (num, den) => ({ node: "divide", num, den });
export const multiply = (left, right) => ({ node: "multiply", left, right });
export const subtract = (left, right) => ({ node: "subtract", left, right });

export const textBlock = (ref, txt = "some analysis prose") =>
  ({ kind: "text", basis_ref: ref, displayed_text: txt });
export const placeholderBlock = (ref) => ({ kind: "placeholder", basis_ref: ref });
export const previewBasis = (label, id) => ({ label, kind: "preview_cell", id });
export const body = (...blocks) => ({ blocks });
// pg's node driver serialises a bare JS ARRAY parameter as a POSTGRES ARRAY LITERAL, not JSON —
// wrong for a jsonb `p_basis` argument that IS an array. Stringify explicitly, always.
export const basisArr = (...elems) => JSON.stringify(elems);
export const model = (over = {}) =>
  ({ provider: "anthropic", model: "claude-opus-5", version: "2026-08", ...over });

export async function mintSandboxView(firm, obo, { viewBody, basis, rationale = "card1" }) {
  const r = await asSandboxWake(firm, obo, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [viewBody, basis, rationale, model(), opk("card1-view")]));
  return r.rows[0].r;
}

export { assert, randomUUID, rootQuery, ROLES, asWake, opk, mintWake, mintMetricInput };
