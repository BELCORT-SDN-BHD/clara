// Card 1 — STAGE (b): the twelfth AST primitive `cell`, and the evaluator-version freeze around
// it. Annex B sections B.4 and B.5.
//
// Design of record: card1-substitution-seam-design-part2.md §3 (§3.1 the primitive, BL-5's
// definition-backed rule, M6's context match, M7's real temporality and cite-by-id provenance;
// §3.2 the versioning plan, BL-1..BL-4, CD-14/CD-15) + annexes Annex B.4/B.5.
//
// WHAT STAGE (b) IS. A model PROPOSES a deterministic expression — an AST, never free text — over
// values that are themselves already-minted metric_cells rows. A definer core validates and
// evaluates it and the RESULT becomes an ordinary, immutable cell. It is not a second substitution
// mechanism; it is a second WAY TO MINT the thing stage (a) cites.
//
// THE ORDER OF THE CELLS BELOW IS LOAD-BEARING. (evaluate_metric, 2) is BORN UNDEPLOYED (CD-15),
// and 0060's _tf_evaluator_deploy_once admits exactly ONE undeployed->deployed transition per row,
// EVER. So B5.6's PRE-flip polarity is witnessable exactly once per database and must run FIRST.
// On a re-run it is honestly unwitnessable, and that arm is skipped LOUDLY rather than asserted
// against a premise this run cannot establish.
//
// ============================================================================================
// WHY THIS FILE IS ONE FILE, over the 500-line convention, AND WHY ITS NAME IS WHAT IT IS.
//
// Splitting the B4 family from the B5 family would put B5.6's one-shot ceremony in one file and
// the cells that need v2 DEPLOYED in another — turning a guarantee that is currently visible in
// this file's own top-to-bottom order into an INVISIBLE cross-file dependency on sorted filenames.
// That is the same class of hazard as the name below, and it is worth more than a line count: an
// in-file order can be read and reasoned about; a cross-file one silently inverts the day someone
// renames a file or the runner's collation changes.
//
// The name, like stage-a's, is part of the evidence contract — `f-a5b-` sorts this battery AFTER
// delta/epsilon/eta and after f-a5's cell D, so each of those keeps the one-shot witness it owns
// (delta-contract's `metric_cells count == 0` arm and delta-catalog-phase's direct-deployment
// rollback proof). Do not shorten it. See stage-a's header for the full statement.
// ============================================================================================

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootQuery, endPool, ROLES, withActor, opk } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { freshDeltaClient, metricAst, measure, evaluateMetricHuman } from "./delta-fixtures.mjs";
import {
  card1Ready, skipHere, ensureV1EvaluatorsDeployed, v2Deployed, deployV2,
  mintDefinitionBackedCell, mintPointInTimeCell, mintUndefinedCell, addSecondPeriod,
  composePreviewV1, composePreviewV2, cellNode, divide, multiply, subtract,
  V1_ENTRYPOINT, V2_ENTRYPOINT,
} from "./f-a5b-card1-seam-fixtures.mjs";

let ready = false;
let world = null;
let fx = null;
/** Read BEFORE anything in this run can flip it — the honest fresh-witness signal. */
let v2WasDark = false;

const AVG = "avg_month_end_v1";

/** `_validate_metric_node_v2` on one node, in this firm/client scope. */
async function validateNode(node, { firm, client }) {
  return (await rootQuery(
    "select clara._validate_metric_node_v2($1::jsonb, $2::uuid, $3::uuid, 1) as r",
    [JSON.stringify(node), firm, client])).rows[0].r;
}

/** `_metric_eval_node_v2` on one node, against a real composing context. */
async function evalNode(node, { firm, client, snapshot, context, period }) {
  return (await rootQuery(
    `select * from clara._metric_eval_node_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
       $6::jsonb, false, $7::text, null)`,
    [firm, client, snapshot, context, period, JSON.stringify(node), AVG])).rows[0];
}

const raised = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const detailOf = (e) => { try { return JSON.parse(e?.detail ?? "{}"); } catch { return { raw: e?.detail }; } };

before(async () => {
  ready = await card1Ready();
  if (!ready) return;
  v2WasDark = !(await v2Deployed());
  world = await buildWorld();
  await ensureV1EvaluatorsDeployed();
  const a1 = await freshDeltaClient(world.users.alice, "c1b1");
  const a2 = await freshDeltaClient(world.users.alice, "c1b2");
  const b1 = await freshDeltaClient(world.users.dave, "c1b3");
  fx = {
    A1: await mintDefinitionBackedCell(world.users.alice, a1, "b1"),
    A2: await mintDefinitionBackedCell(world.users.alice, a2, "b2"),
    B1: await mintDefinitionBackedCell(world.users.dave, b1, "b3"),
  };
  // EACH fixture gets its OWN client. createStandardSets publishes account-set VERSIONS with
  // effective windows, and a second call for the same client refuses "effective window overlaps or
  // reverses" — correctly, since that is the account-set lifecycle wall doing its job.
  fx.pit = await mintPointInTimeCell(
    world.users.alice, await freshDeltaClient(world.users.alice, "c1pit"), "pit");
  fx.undef = await mintUndefinedCell(
    world.users.alice, await freshDeltaClient(world.users.alice, "c1und"), "undef");
});
after(async () => { await endPool(); });

const scopeA1 = () => ({ firm: fx.A1.firmId, client: fx.A1.clientId });
const ctxA1 = () => ({
  firm: fx.A1.firmId, client: fx.A1.clientId, snapshot: fx.A1.snapshotId,
  context: fx.A1.contextId, period: fx.A1.periodId,
});

// =============================================================================================
// B5.6 — THE DEPLOY CEREMONY (BL-3/CD-15). RUNS FIRST: its pre-flip polarity is one-shot per DB.
// =============================================================================================

test("B5.6 — the deploy ceremony, BOTH polarities: a SET ROLE'd session is refused, the bare principal succeeds, and the SAME v2 call refuses `evaluator_undeployed` before and mints after", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const ast = metricAst({ root: measure({ set: "revenue" }), unit: "money" });
  const call = () => composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast, periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
    opKey: opk("b56"),
  });

  if (!v2WasDark) {
    // A PRIOR run already performed this database's one-way ceremony. The pre-flip half is not
    // merely inconvenient to assert here — it is UNWITNESSABLE, and asserting it would be a claim
    // about a premise this run cannot establish.
    t.diagnostic("card 1 B5.6 pre-flip half: this database already witnessed the one-way ceremony (re-run shape) — the post-flip half below still asserts a STRONG truth");
  } else {
    // POLARITY 1 of the PRINCIPAL wall: a session holding an active SET ROLE has
    // current_user <> session_user, which 0060:98 refuses by name.
    const wrongPrincipal = await raised(() => withActor({ role: ROLES.fnOwner, transaction: true }, (db) =>
      db.query("update clara.evaluator_versions set deployed=true where evaluator_name='evaluate_metric' and version=2")));
    assert.equal(wrongPrincipal?.code, "CLR08",
      `a SET ROLE'd session must not be able to deploy an evaluator (got ${wrongPrincipal?.code}: ${wrongPrincipal?.message})`);
    assert.match(wrongPrincipal.message, /migration ceremony principal/);
    assert.equal(await v2Deployed(), false, "and the refusal left the row dark");

    // POLARITY 1 of the CALL: stage (b) is genuinely unreachable while the row is dark.
    const dark = await raised(call);
    assert.equal(dark?.code, "CLR10", `expected evaluator_undeployed, got ${dark?.code}: ${dark?.message}`);
    assert.equal(detailOf(dark).reason, "evaluator_undeployed",
      "this is the EXPECTED post-merge state, not a defect (Annex E R-CD-4)");
  }

  // POLARITY 2 of the PRINCIPAL wall: the bare principal (no SET ROLE) performs the one legal
  // transition. Idempotent — `where not deployed` matches nothing on a re-run.
  await deployV2();

  // POLARITY 2 of the CALL: nothing else in the estate changed, and the identical call now mints.
  const minted = await call();
  assert.ok(minted?.cell_id, `the identical call mints after the ceremony (${JSON.stringify(minted)})`);
  assert.equal(minted.preview, true);
  assert.equal(minted.definition_version_id, null, "a stage-(b) result is a PREVIEW cell — definition_version_id IS NULL");
  assert.equal(minted.statutory_eligible, false);
});

// =============================================================================================
// B.4 — THE `cell` PRIMITIVE
// =============================================================================================

test("B4.1 (M7) — a definition-backed 'ok' cell node validates, carries its unit's dimension vector, and its temporality is the CITED DEFINITION's, never a hardcoded 'flow'", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const r = await validateNode(cellNode(fx.A1.cellId), scopeA1());
  const unit = (await rootQuery("select * from clara.metric_units where unit_key=$1", [fx.A1.unitKey])).rows[0];
  assert.deepEqual(
    { cp: r.cp, dp: r.dp, np: r.np },
    { cp: unit.currency_power, dp: unit.days_power, np: unit.count_power },
    "the dimension vector is the CITED CELL's own unit_key, read from clara.metric_units");
  const declared = (await rootQuery(
    "select temporality_key from clara.metric_definition_versions where id=$1", [fx.A1.definitionVersionId])).rows[0];
  assert.equal(r.temp, declared.temporality_key);
  assert.equal(r.po, 0);
  assert.deepEqual({ nodes: r.nodes, leaves: r.leaves, lag: r.lag }, { nodes: 1, leaves: 0, lag: 0 });

  // THE M7 DIFFERENTIAL. A flow-declared cell coming back 'flow' proves nothing on its own — a
  // hardcoded 'flow' would pass it. A POINT_IN_TIME-declared cell must NOT come back 'flow'.
  if (fx.pit.cellStatus !== "ok") {
    t.diagnostic(`card 1 B4.1 M7 differential: the point_in_time fixture cell came back '${fx.pit.cellStatus}', so it cannot be cited — the flow arm above still holds`);
  } else {
    const pit = await validateNode(cellNode(fx.pit.cellId), { firm: fx.A1.firmId, client: fx.pit.clientId });
    assert.equal(pit.temp, "point_in_time",
      "a point_in_time cell must NOT come back 'flow' — that is the hardcode M7 corrected");
    assert.notEqual(pit.temp, r.temp, "and the two fixtures genuinely differ in the term under test");
  }
});

test("B4.2 — absent, cross-firm and cross-client all answer with ONE token, indistinguishable (no existence oracle)", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const arms = [
    ["absent", randomUUID()],
    ["another firm's cell", fx.B1.cellId],
    ["another client of the SAME firm", fx.A2.cellId],
  ];
  for (const [label, id] of arms) {
    const e = await raised(() => validateNode(cellNode(id), scopeA1()));
    assert.equal(e?.code, "CLR11", `${label}: ${e?.message}`);
    assert.equal(detailOf(e).reason, "metric_cell_reference_unknown", label);
  }
  // THE TWIN: the in-scope cell resolves, so the three refusals are the predicate answering, not
  // the function being broken.
  assert.ok(await validateNode(cellNode(fx.A1.cellId), scopeA1()));
});

test("B4.3 (BL-5) — the DEFINITION-BACKED rule, both polarities and at BOTH doors: a preview-composed cell is refused, a canonical one is admitted", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // A preview-composed cell: definition_version_id IS NULL, minted through the UNTOUCHED v1 pair.
  const preview = await composePreviewV1(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
  });
  assert.ok(preview.cell_id);
  assert.equal((await rootQuery("select definition_version_id from clara.metric_cells where id=$1",
    [preview.cell_id])).rows[0].definition_version_id, null, "the fixture really is preview-composed");

  for (const [door, run] of [
    ["_validate_metric_node_v2", () => validateNode(cellNode(preview.cell_id), scopeA1())],
    ["_metric_eval_node_v2", () => evalNode(cellNode(preview.cell_id), ctxA1())],
  ]) {
    const e = await raised(run);
    assert.equal(e?.code, "CLR10", `${door}: ${e?.message}`);
    assert.equal(detailOf(e).reason, "metric_cell_reference_not_definition_backed", door);
  }
  // THE TWIN, at both doors: a canonical, definition-backed cell is admitted.
  assert.ok(await validateNode(cellNode(fx.A1.cellId), scopeA1()));
  assert.equal((await evalNode(cellNode(fx.A1.cellId), ctxA1())).status, "ok");

  // AND THE CONSEQUENCE, which is the whole reason for the rule (CD-10 / R-CD-3 closed BY
  // CONSTRUCTION): every stage-(b) output is ITSELF preview-composed, so a cell-of-cell chain can
  // never form. Composition depth is exactly one level, structurally, forever.
  const v2out = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId,
    ast: metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId, opKey: opk("b43chain"),
  });
  assert.equal((await rootQuery("select definition_version_id from clara.metric_cells where id=$1",
    [v2out.cell_id])).rows[0].definition_version_id, null,
  "a stage-(b) output is preview-composed, which is exactly why it can never be cited by another cell node");
  const chained = await raised(() => validateNode(cellNode(v2out.cell_id), scopeA1()));
  assert.equal(detailOf(chained).reason, "metric_cell_reference_not_definition_backed",
    "citing a stage-(b) output from a new formula is structurally impossible");
});

test("B4.4 — a definition-backed cell whose status is NOT 'ok' refuses metric_cell_reference_not_ok at both doors", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const scope = { firm: fx.A1.firmId, client: fx.undef.clientId };
  const e = await raised(() => validateNode(cellNode(fx.undef.cellId), scope));
  assert.equal(e?.code, "CLR10", e?.message);
  assert.equal(detailOf(e).reason, "metric_cell_reference_not_ok");
  const ctx = { ...scope, snapshot: fx.undef.snapshotId, context: null, period: fx.undef.periodId };
  const cellCtx = (await rootQuery(
    "select evaluation_context_id from clara.metric_cells where id=$1", [fx.undef.cellId])).rows[0];
  ctx.context = cellCtx.evaluation_context_id;
  const e2 = await raised(() => evalNode(cellNode(fx.undef.cellId), ctx));
  assert.equal(detailOf(e2).reason, "metric_cell_reference_not_ok",
    "stage (b) refuses to build on an undefined input rather than propagate it");
  // THE TWIN: an 'ok' definition-backed cell of the same client admits.
  assert.ok(await validateNode(cellNode(fx.A2.cellId), { firm: fx.A2.firmId, client: fx.A2.clientId }));
});

test("B4.5 (M6) — CONTEXT MATCH, period axis: a cell computed over a different period SET refuses metric_cell_context_mismatch; the matching twin evaluates", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // THE AXIS IS ISOLATED BY SHARING ONE SNAPSHOT. books_watermark is a property of the SNAPSHOT,
  // and _metric_eval_node_v2 checks the watermark axis FIRST — so a fixture that changed snapshots
  // to change the period set would fire the WATERMARK arm and this cell would pass while proving
  // the wrong thing. Both the cited cell and the composing context are therefore built on ONE
  // two-period snapshot, and differ in exactly the term under test: the cell binds {p1}, the
  // context binds {p1, p2}.
  const second = await addSecondPeriod(world.users.alice, { client: fx.A1.clientId, monthStart: fx.A1.monthStart });
  const { mintMetricInput } = await import("./delta-fixtures.mjs");
  const two = await mintMetricInput(world.users.alice, {
    client: fx.A1.clientId, periodIds: [fx.A1.periodId, second.id],
  });
  const narrow = await evaluateMetricHuman(world.users.alice, {
    client: fx.A1.clientId, definitionVersion: fx.A1.definitionVersionId,
    periodIds: [fx.A1.periodId], snapshotId: two.snapshotId, runId: randomUUID(),
  });
  const wide = await evaluateMetricHuman(world.users.alice, {
    client: fx.A1.clientId, definitionVersion: fx.A1.definitionVersionId,
    periodIds: [fx.A1.periodId, second.id], snapshotId: two.snapshotId, runId: randomUUID(),
  });
  const rows = (await rootQuery(
    "select id, evaluation_context_id, books_watermark, cell_status from clara.metric_cells where id = any($1::uuid[])",
    [[narrow.cell_id, wide.cell_id]])).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[narrow.cell_id].books_watermark, byId[wide.cell_id].books_watermark,
    "the two runs share one snapshot, so the watermark axis is genuinely held constant");
  assert.equal(byId[narrow.cell_id].cell_status, "ok");

  const e = await raised(() => evalNode(cellNode(narrow.cell_id), {
    firm: fx.A1.firmId, client: fx.A1.clientId, snapshot: two.snapshotId,
    context: byId[wide.cell_id].evaluation_context_id, period: fx.A1.periodId,
  }));
  assert.equal(e?.code, "CLR10", e?.message);
  const d = detailOf(e);
  assert.equal(d.reason, "metric_cell_context_mismatch");
  assert.equal(d.class, "period_set", "the PERIOD axis is the one that fired, not the watermark axis");

  // THE TWIN, differing in exactly that one term: the same cell against the context whose period
  // set MATCHES its own.
  assert.equal((await evalNode(cellNode(narrow.cell_id), {
    firm: fx.A1.firmId, client: fx.A1.clientId, snapshot: two.snapshotId,
    context: byId[narrow.cell_id].evaluation_context_id, period: fx.A1.periodId,
  })).status, "ok");
});

test("B4.11 (this lane's addition) — the context-integrity wall admits EXACTLY the two named entrypoints and nothing else", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // clara._tf_metric_context_integrity (0060:228) hardcoded v1's entrypoint literal, which made
  // every v2 evaluation context uninsertable — the fifth hardcoded v1 reference, in a trigger
  // BL-4's census did not reach. The recut admits two literals; this cell proves it admits ONLY
  // two, so the fix widened a closed set rather than opening one.
  const admitted = (await rootQuery(
    `select coalesce(array_agg(e.version order by e.version), '{}'::int[]) as v
       from clara.evaluator_versions e
      where e.evaluator_name='evaluate_metric' and e.firm_id is null and e.deployed`)).rows[0].v;
  assert.deepEqual(admitted, [1, 2], "both evaluate_metric closures are deployed on this database");
  // A context claiming a DIFFERENT evaluator family still refuses. assess_metric_cell_independent
  // is registered and deployed, so this is not a "row does not exist" pass.
  const other = (await rootQuery(
    "select id from clara.evaluator_versions where evaluator_name='assess_metric_cell_independent' and version=1")).rows[0];
  const e = await raised(() => rootQuery(
    `insert into clara.metric_evaluation_contexts(firm_id, client_id, snapshot_id, evaluator_version_id,
        run_id, context_sha256, created_by)
      values ($1,$2,$3,$4,gen_random_uuid(), sha256(convert_to('x','UTF8')), $5)`,
    [fx.A1.firmId, fx.A1.clientId, fx.A1.snapshotId, other.id, world.users.alice]));
  assert.equal(e?.code, "CLR11", `${e?.code}: ${e?.message}`);
  assert.match(e.message, /evaluator identity is absent, undeployed, or cross-firm/,
    "an evaluator outside the two named entrypoints is still refused by name");
});

test("B4.6 (M6) — CONTEXT MATCH, watermark axis: a cell minted against a different books_watermark refuses; the matching twin evaluates", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // A2's cell and A1's context: different clients would refuse EARLIER (unknown), so the axis is
  // isolated by moving the BOOKS instead — post a new entry for A1, mint a fresh snapshot, and the
  // watermark advances while the period set stays identical.
  const { plainEntry, BANK1, REVN } = await import("./delta-fixtures.mjs");
  await plainEntry(world.users.alice, {
    client: fx.A1.clientId, debit: BANK1, credit: REVN, cents: 55_000,
    postingDate: `${fx.A1.monthStart.slice(0, 8)}11`, memo: `card1 watermark move ${randomUUID().slice(0, 8)}`,
  });
  const { mintMetricInput } = await import("./delta-fixtures.mjs");
  const later = await mintMetricInput(world.users.alice, { client: fx.A1.clientId, periodIds: [fx.A1.periodId] });
  const laterWatermark = (await rootQuery(
    "select books_watermark from clara.metric_input_snapshots where id=$1", [later.snapshotId])).rows[0].books_watermark;
  if (laterWatermark === fx.A1.booksWatermark) {
    // A read that cannot say NO has a meaningless YES: without a genuinely different watermark
    // there is no mismatch to refuse, so the arm is named rather than passed by absence.
    t.diagnostic("card 1 B4.6: the new snapshot carries the SAME books_watermark, so the watermark axis has nothing to differ on — arm not exercised this run");
  } else {
    const receipt = await evaluateMetricHuman(world.users.alice, {
      client: fx.A1.clientId, definitionVersion: fx.A1.definitionVersionId,
      periodIds: [fx.A1.periodId], snapshotId: later.snapshotId, runId: randomUUID(),
    });
    const laterCtx = (await rootQuery(
      "select evaluation_context_id from clara.metric_cells where id=$1", [receipt.cell_id])).rows[0];
    const e = await raised(() => evalNode(cellNode(fx.A1.cellId), {
      firm: fx.A1.firmId, client: fx.A1.clientId, snapshot: later.snapshotId,
      context: laterCtx.evaluation_context_id, period: fx.A1.periodId,
    }));
    assert.equal(e?.code, "CLR10", e?.message);
    const d = detailOf(e);
    assert.equal(d.reason, "metric_cell_context_mismatch");
    assert.equal(d.class, "books_watermark", "the WATERMARK axis is the one that fired");
  }
  // THE TWIN, always run: same cell, its own context, evaluates.
  assert.equal((await evalNode(cellNode(fx.A1.cellId), ctxA1())).status, "ok");
});

test("B4.7 — the dimensional algebra is the SAME algebra: divide(money, money) reduces to a ratio; multiply(money, money) refuses dimension_overflow with v1's own token", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const ok = await validateNode(divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), scopeA1());
  assert.deepEqual({ cp: ok.cp, dp: ok.dp, np: ok.np }, { cp: 0, dp: 0, np: 0 },
    "currency_power 1 - 1 = 0 — a ratio");
  const e = await raised(() => validateNode(multiply(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), scopeA1()));
  assert.equal(e?.code, "CLR10", e?.message);
  assert.equal(detailOf(e).reason, "dimension_overflow",
    "the twelfth primitive is not a second grammar bolted beside the first — it refuses with the guard v1 already had");
});

test("B4.8 — an incompatible operand pair refuses dimension_mismatch, again through v1's unchanged guard", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const countLeaf = {
    node: "count", source: "contributions",
    scope: { period: "$P0", entity: "$CLIENT", basis: "accrual" },
  };
  const e = await raised(() => validateNode(subtract(cellNode(fx.A1.cellId), countLeaf), scopeA1()));
  assert.equal(e?.code, "CLR10", e?.message);
  assert.equal(detailOf(e).reason, "dimension_mismatch");
});

test("B4.9 (BL-1) — the metric_primitives CHECK, BOTH polarities: the eleven-literal shape refuses 'cell', the widened one admits it, and the closure is twelve", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // POLARITY 1, against a FIXTURE SNAPSHOT of the PRE-ALTER constraint. It has to be a fixture:
  // the live table has already been widened, and a cell that only ever saw the widened shape could
  // not tell the ALTER from the INSERT — which is the exact thing this pair exists to separate.
  await withActor({ transaction: true }, async (db) => {
    await db.query(`create temp table _card1_prim_pre(
      primitive_key text primary key check(primitive_key in('measure','sum','average','lag','subtract',
        'divide','days_in_period','percent_change','multiply','constant','count')))`);
    // The POSITIVE control runs FIRST: a constraint violation aborts the transaction, so anything
    // after it would fail with 25P02 and the control would prove nothing.
    await db.query("insert into _card1_prim_pre values ('measure')");
    const e = await raised(() => db.query("insert into _card1_prim_pre values ('cell')"));
    assert.equal(e?.code, "23514",
      "against the ELEVEN-literal CHECK the insert is a live constraint violation — not a typed CLR token, because this is DDL, not a definer body");
    throw new Error("card1 B4.9 rollback");
  }).catch((e) => { if (!/card1 B4\.9 rollback/.test(e.message)) throw e; });

  // POLARITY 2, against the LIVE, widened table.
  await withActor({ transaction: true }, async (db) => {
    await db.query("insert into clara.metric_primitives(primitive_key, structural_integer_fields) values ('cell','{}') on conflict do nothing");
    const n = (await db.query("select count(*)::int n from clara.metric_primitives")).rows[0].n;
    assert.equal(n, 12, "the closure is twelve, never eleven — it is the ALTER, not the insert, that made 'cell' admissible");
    throw new Error("card1 B4.9 rollback");
  }).catch((e) => { if (!/card1 B4\.9 rollback/.test(e.message)) throw e; });
  assert.ok((await rootQuery("select 1 from clara.metric_primitives where primitive_key='cell'")).rows.length === 1);
});

test("B4.10 — the evaluator_entrypoint STAMP is correct AT THE SOURCE: a v2-composed row carries v2's literal, a v1-composed row carries v1's", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const ast = metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" });
  const v2 = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast, periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId, opKey: opk("b410"),
  });
  const v1 = await composePreviewV1(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
  });
  const rows = (await rootQuery(
    `select id, inputs->'composition'->>'evaluator_entrypoint' as entry,
            (select entrypoint_signature from clara.evaluator_versions ev where ev.id = mc.evaluator_version_id) as row_entry
       from clara.metric_cells mc where id = any($1::uuid[])`, [[v2.cell_id, v1.cell_id]])).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[v2.cell_id].entry, V2_ENTRYPOINT, "read off the INSERTED ROW, independent of whether the trigger accepted it");
  assert.equal(byId[v1.cell_id].entry, V1_ENTRYPOINT);
  // ...and SPELLING IS NOT IDENTITY: the claimed literal must BE the row's own evaluator version's
  // entrypoint, which is the conjunct this build added to the integrity trigger.
  for (const r of rows) assert.equal(r.entry, r.row_entry, `cell ${r.id}: the stamp matches its own evaluator version row`);
});

// =============================================================================================
// B.5 — THE EVALUATOR-VERSION FREEZE (design §3.2 — the delicate part, R-CD-1)
// =============================================================================================

test("B5.1 — REGRESSION SAFETY: a v1-composed cell still mints through the WIDENED trigger and still takes the v1 branch", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const before = (await rootQuery("select count(*)::int n from clara.metric_cells where definition_version_id is null")).rows[0].n;
  const v1 = await composePreviewV1(fx.A2.firmId, world.users.alice, {
    client: fx.A2.clientId, ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    periodIds: [fx.A2.periodId], snapshotId: fx.A2.snapshotId,
  });
  assert.ok(v1.cell_id, "the UNTOUCHED v1 wrapper still mints a preview cell through the widened wall");
  const row = (await rootQuery(
    `select cell_status, displayed_text, inputs->'composition'->>'evaluator_entrypoint' as entry,
            inputs->>'schema' as schema
       from clara.metric_cells where id=$1`, [v1.cell_id])).rows[0];
  assert.equal(row.entry, V1_ENTRYPOINT, "and it took the v1 branch, not the new one");
  assert.equal(row.schema, "clara.metric-composition-inputs/v1", "the composition schema tag did NOT move (BL-4/CD-9)");
  assert.equal(row.displayed_text, v1.displayed_text, "the writer and the wall still agree on the figure, to the character");
  const after = (await rootQuery("select count(*)::int n from clara.metric_cells where definition_version_id is null")).rows[0].n;
  assert.equal(after, before + 1);
});

test("B5.2 — a v2-composed cell is accepted through the NEW branch; a row claiming v2's literal whose composition does not reconstruct is REFUSED", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const v2 = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId,
    ast: metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId, opKey: opk("b52"),
  });
  assert.ok(v2.cell_id, "the trigger re-derived a cell-containing composition through _metric_eval_node_v2 and accepted it");
  const row = (await rootQuery(
    "select cell_status, exact_numerator, exact_denominator, displayed_text from clara.metric_cells where id=$1",
    [v2.cell_id])).rows[0];
  assert.equal(row.cell_status, "ok");
  // divide(x, x) is exactly 1 — an arithmetic identity the wall re-derives independently of the
  // writer, so agreeing on it is a real check rather than a tautology of the fixture.
  assert.equal(Number(row.exact_numerator) / Number(row.exact_denominator), 1);

  // THE FORGERY TWIN: take the accepted row and re-insert it with ONE term moved — the composition
  // AST changed while the stored hash stays. The wall must refuse rather than trust the stamp.
  const forged = await raised(() => rootQuery(
    `insert into clara.metric_cells (firm_id, client_id, run_id, evaluation_context_id, definition_version_id,
       formula_sha256, resolved_inputs_sha256, evaluator_version_id, books_watermark, cell_status,
       na_reason_version_id, exact_numerator, exact_denominator, unit_key, displayed_scale, displayed_text, inputs)
     select firm_id, client_id, gen_random_uuid(), evaluation_context_id, definition_version_id,
       formula_sha256, resolved_inputs_sha256, evaluator_version_id, books_watermark, cell_status,
       na_reason_version_id, exact_numerator, exact_denominator, unit_key, displayed_scale, displayed_text,
       jsonb_set(inputs, '{composition,allow_negative}', 'true'::jsonb)
       from clara.metric_cells where id=$1`, [v2.cell_id]));
  assert.ok(forged, "a composition whose content no longer matches its hash must not be insertable");
  assert.equal(forged.code, "CLR11", `${forged.code}: ${forged.message}`);
});

test("B5.3 — verify_evaluator_freeze passes with BOTH evaluate_metric closures registered, and is idempotent", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const first = (await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r;
  const second = (await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r;
  assert.equal(first.ok, true);
  assert.deepEqual(second, first, "stable and idempotent — a second call reads the identical counts");
  const rows = (await rootQuery(
    `select version, deployed, (select count(*)::int from clara.evaluator_version_members m
        where m.evaluator_version_id = e.id) as members,
       (select count(*)::int from clara.evaluator_version_members m
         where m.evaluator_version_id = e.id and m.member_signature = e.entrypoint_signature) as entry
       from clara.evaluator_versions e where evaluator_name='evaluate_metric' and firm_id is null order by version`)).rows;
  assert.deepEqual(rows.map((r) => r.version), [1, 2]);
  assert.equal(rows[0].members, 10, "v1 still carries its ORIGINAL ten members — nothing was added to or taken from it");
  assert.equal(rows[1].members, 9);
  for (const r of rows) {
    assert.equal(r.entry, 1, `version ${r.version}: entry_count must be exactly 1 or verify_evaluator_freeze refuses`);
  }
});

test("B5.4 — frozen-evaluators.json carries clara.evaluate_metric_v2 with the hash the lint itself computes", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const root = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const manifest = JSON.parse(readFileSync(`${root}frozen-evaluators.json`, "utf8"));
  const entry = manifest.evaluators["clara.evaluate_metric_v2"];
  assert.ok(entry, "the new evaluator is registered — an unregistered clara.evaluate_* is a hard lint failure");
  assert.notEqual(manifest.evaluators["clara.evaluate_metric_v1"], undefined);
  // The v1 entry is DEPLOYED and its hash is immutable versus origin/main. This cell does not
  // re-derive that (the lint's append-only-vs-base check owns it); it asserts the thing a
  // hand-inserted entry can get wrong — that v2's recorded hash is the body's actual hash.
  const { extractBody, hashText } = await import(new URL("../../../scripts/check-frozen-evaluators.mjs", import.meta.url).href);
  const sql = readFileSync(`${root}packages/db/migrations/0135_card1_substitution_seam.sql`, "utf8");
  const at = sql.search(/create\s+function\s+clara\.evaluate_metric_v2\s*\(/i);
  assert.ok(at > 0, "the migration defines clara.evaluate_metric_v2 by the exact name shape the lint discovers");
  assert.equal(entry.sha256, hashText(extractBody(sql, at)),
    "the manifest hash is the lint's own hash of the live body");
  // DATED-TRIPWIRE REPAIR (2026-08-26). This cell originally pinned `deployed !== true` with
  // the words "the live ceremony has not run" — a CEREMONY-STATE pin, the class the F-A2
  // openers taught us never to write (pin the monotonic direction, never the state of the
  // world). The W4 ceremony HAS run: live flipped ('evaluate_metric', 2) and the manifest was
  // stamped by check-frozen-evaluators --lock-deployed, whose whole purpose is to pull the
  // now-live body inside the append-only hash lock. A rig replays the chain fresh, so its DB
  // row is ALWAYS undeployed and "manifest agrees with this database" is unsatisfiable
  // post-stamp by construction. The monotonic contract over all four worlds:
  //   db=false · manifest absent/false -> pre-ceremony: fine for the TWO-HALVES rule below;
  //                                       UNREACHABLE post-W4 — the order-independent
  //                                       assertion above this table's consumer forbids it.
  //   db=false · manifest true         -> post-live-ceremony rig replay: fine (the stamp
  //                                       records LIVE; witness: wave-f-w4-ceremony-asrun.md).
  //   db=true  · manifest true         -> deployed and locked: fine.
  //   db=true  · manifest absent/false -> a DEPLOYED body OUTSIDE the append-only lock — the
  //                                       one state the script's two-halves rule forbids.
  // ORDER-INDEPENDENT HALF (review finding on the repair): the two-halves check below reads
  // the rig row, so a FOCUSED run on a fresh database (deployV2 never invoked, db=false)
  // would pass vacuously. Post-W4 the manifest itself permanently carries the stamp — the
  // lint's monotonic ratchet (UNLOCKED-VS-BASE) forbids ever removing it — so the flag can be
  // asserted directly, regardless of run order or database state. Precedent:
  // f-a2-regression.test.mjs's witness_fact_state deploy-lock cells.
  assert.equal(entry.deployed, true,
    "post-W4 the manifest permanently carries deployed:true for evaluate_metric_v2 — the append-only ratchet forbids unstamping");
  const reg = (await rootQuery(
    `select deployed from clara.evaluator_versions
      where evaluator_name = 'evaluate_metric' and version = 2 and firm_id is null`)).rows;
  assert.equal(reg.length, 1, "exactly one ('evaluate_metric', 2) registry row — the reads below must not be reading nothing");
  assert.ok(!(reg[0].deployed === true && entry.deployed !== true),
    "a DB-deployed evaluate_metric_v2 must carry the manifest deployed:true stamp — a live body outside the append-only hash lock is the one forbidden state");
});

test("B5.5 — editing a v1 closure member in place makes verify_evaluator_freeze REFUSE (the DB-side wall, not merely the repo-side lint)", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const outcome = await raised(() => withActor({ transaction: true }, async (db) => {
    await db.query("set local role clara_fn_owner");
    // A BEHAVIOURALLY IDENTICAL recut — only a comment moves. That is the point: the freeze is on
    // the BODY BYTES, so even a change that cannot alter a number is refused.
    const def = (await db.query(
      "select pg_get_functiondef('clara._validate_metric_node_v1(jsonb,integer)'::regprocedure) d")).rows[0].d;
    const anchor = "\ndeclare k text;";
    assert.ok(def.includes(anchor),
      "the tamper anchor must exist in pg_get_functiondef's output, or this cell would 'pass' by having changed nothing");
    const tampered = def.split(anchor).join("\n-- card1 B5.5 tamper\ndeclare k text;");
    assert.notEqual(tampered, def, "the recut genuinely differs from the live body");
    await db.query(tampered);
    await db.query("reset role");
    await db.query("select clara.verify_evaluator_freeze()");
    throw new Error("card1 B5.5: verify_evaluator_freeze did NOT refuse a recut v1 member");
  }));
  assert.ok(outcome, "the tamper must not be silently accepted");
  assert.equal(outcome.code, "CLR10", `${outcome.code}: ${outcome.message}`);
  assert.match(outcome.message, /evaluator freeze mismatch/,
    "the DB-side closure hash — re-derived LIVE from the catalog — is what makes an in-place edit mechanically impossible");
  // The rollback restored the real body: the freeze passes again.
  assert.equal((await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r.ok, true);
});

test("B5.7 — _normalize_metric_node_v1 round-trips a `cell` leaf byte-identically, and normalises a parent that CONTAINS one without touching the leaf", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const leaf = cellNode(fx.A1.cellId);
  const back = (await rootQuery("select clara._normalize_metric_node_v1($1::jsonb) as r", [JSON.stringify(leaf)])).rows[0].r;
  assert.deepEqual(back, leaf,
    "its `else return n` catch-all returns an unrecognised LEAF unchanged, which is the correct normalisation for a node carrying no nested or commutative structure");
  // The nested arm: multiply canonical-orders its operands, so a parent DOES move — while the cell
  // leaf inside it does not. Both halves matter: the composition-identity hash and the integrity
  // trigger's re-derivation depend on this silently.
  const a = cellNode(fx.A1.cellId);
  const b = { node: "constant", key: "half" };
  const one = (await rootQuery("select clara._normalize_metric_node_v1($1::jsonb) as r",
    [JSON.stringify(multiply(a, b))])).rows[0].r;
  const other = (await rootQuery("select clara._normalize_metric_node_v1($1::jsonb) as r",
    [JSON.stringify(multiply(b, a))])).rows[0].r;
  assert.deepEqual(one, other, "multiply's operands are canonical-ordered, so the two spellings normalise to one form");
  const leafBack = one.left.node === "cell" ? one.left : one.right;
  assert.deepEqual(leafBack, leaf, "and the cell leaf inside the normalised parent is byte-identical to the input");
});

test("B5.8 (this lane's addition) — v1 and v2 AGREE on every cell-free AST the estate ships: the differential a transcription drift could not survive", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // _validate_metric_node_v2's body is _validate_metric_node_v1's with seven call sites retargeted
  // and one branch added. Reading that and agreeing is not evidence; running BOTH over every
  // canonical formula this estate ships and comparing the returned contracts is.
  const asts = (await rootQuery(
    `select md.definition_key, dv.ast from clara.metric_definition_versions dv
       join clara.metric_definitions md on md.id = dv.definition_id
      where dv.firm_id is null and dv.state='canonical' order by md.definition_key`)).rows;
  assert.ok(asts.length >= 10, `the estate's canonical definitions are the corpus (${asts.length} found)`);
  for (const { definition_key: key, ast } of asts) {
    const v1 = (await rootQuery("select clara._validate_metric_node_v1($1::jsonb, 1) as r", [JSON.stringify(ast.root)])).rows[0].r;
    const v2 = await validateNode(ast.root, scopeA1());
    assert.deepEqual(v2, v1, `${key}: v2's contract must equal v1's on a cell-free AST`);
  }
  // ...and the same at the TOP-LEVEL wrapper, which carries the declared-vs-inferred check.
  for (const { definition_key: key, ast } of asts) {
    const v1 = (await rootQuery("select clara.validate_metric_ast_v1($1::jsonb) as r", [JSON.stringify(ast)])).rows[0].r;
    const v2 = (await rootQuery("select clara.validate_metric_ast_v2($1::jsonb,$2::uuid,$3::uuid) as r",
      [JSON.stringify(ast), fx.A1.firmId, fx.A1.clientId])).rows[0].r;
    assert.deepEqual(v2, v1, `${key}: validate_metric_ast_v2 must equal v1 on a cell-free document`);
  }
});

/**
 * Every clara function transitively reachable from `start`, walked from the LIVE catalog.
 *
 * The walk reads each body's own text for `clara.<name>(` call sites and follows only names that
 * actually resolve to a clara function, so a table reference or a type cast (neither is followed
 * by an open paren) cannot inflate the set. It is a source-text derivation and says so — which is
 * why the cell that uses it carries BOTH-POLARITY instrument controls: a walker that silently
 * returned the empty set would make every "X is not reachable" assertion below pass vacuously,
 * and a read that cannot say NO has a meaningless YES.
 */
async function transitiveCallees(start) {
  const claraFns = new Set((await rootQuery(
    "select distinct proname from pg_proc where pronamespace='clara'::regnamespace")).rows.map((r) => r.proname));
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const bodies = (await rootQuery(
      "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname=$1", [name])).rows;
    for (const { prosrc } of bodies) {
      for (const m of String(prosrc ?? "").matchAll(/\bclara\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
        const callee = m[1].toLowerCase();
        if (claraFns.has(callee) && !seen.has(callee)) queue.push(callee);
      }
    }
  }
  seen.delete(start);
  return seen;
}

test("B5.10 — CLOSURE MEMBERSHIP AS A MEASURED PROPERTY: every frozen v2 member is reachable from the v2 entrypoint, no v1 evaluator body is, and the fs_pack exclusion is a fact about DIRECTION", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // BOTH-POLARITY INSTRUMENT CONTROL, FIRST. Everything below is an assertion about set
  // membership in the walker's output, so the walker itself is proven able to say YES and NO
  // before any of it is believed.
  const reach = await transitiveCallees("evaluate_metric_v2");
  const fromV1Reach = await transitiveCallees("evaluate_metric_v1");
  assert.ok(reach.has("_metric_eval_node_v2"),
    "POSITIVE CONTROL: the walker must find a call site it certainly has");
  assert.ok(!reach.has("assess_metric_cell_independent_v1"),
    "NEGATIVE CONTROL: the walker must NOT find a function nothing in this chain calls");

  // (a) THE MEMBER LIST IS DERIVED FROM v1's OWN, not typed: v2's closure must be v1's with the
  // four twinned bodies swapped and evaluate_fs_pack_v1 dropped. Reading both from the catalog is
  // what makes "nine, not ten" a measured relationship rather than a number this lane chose.
  const sigsOf = async (version) => (await rootQuery(
    `select m.member_signature from clara.evaluator_version_members m
       join clara.evaluator_versions e on e.id = m.evaluator_version_id
      where e.evaluator_name='evaluate_metric' and e.version=$1 order by m.ordinal`, [version]))
    .rows.map((r) => r.member_signature);
  const v1Sigs = await sigsOf(1);
  const v2Sigs = await sigsOf(2);
  assert.equal(v1Sigs.length, 10, "v1's closure is untouched at its original ten");
  assert.equal(v2Sigs.length, 9);
  // ordinals 4..8 are the SHARED helpers, and they are compared byte-for-byte against v1's own
  // rows rather than retyped here.
  assert.deepEqual(v2Sigs.slice(4), v1Sigs.slice(4, 9),
    "the five reused helpers are v1's rows exactly — one signature can be a member of many closures, which is what evaluator_version_members' PK is for");
  assert.deepEqual(v2Sigs.slice(0, 4), [
    "clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)",
    "clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)",
    "clara.validate_metric_ast_v2(jsonb,uuid,uuid)",
    "clara._validate_metric_node_v2(jsonb,uuid,uuid,integer)",
  ], "and ordinals 0-3 are the four v2 twins, in v1's own ordinal order");
  assert.deepEqual(v1Sigs.filter((s) => !v2Sigs.includes(s)).filter((s) => !/_v2\(/.test(s)),
    ["clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)",
      "clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)",
      "clara.validate_metric_ast_v1(jsonb)",
      "clara._validate_metric_node_v1(jsonb,integer)",
      "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)"],
    "exactly five of v1's rows are absent from v2: the four it twinned, and the one it excludes");

  // (b) NON-CALLEE MEMBERSHIP IS INHERITED, NEVER INVENTED. A closure is not a call graph — v1
  // already freezes bodies its entrypoint never calls, because the evaluator's determinism depends
  // on them being what they say they are (clara._metric_input_dataset_v1 hashes the SNAPSHOT the
  // evaluator reads; the producer calls it, the evaluator does not). This cell's first draft
  // asserted every member must be reachable and went red on exactly that member — a good failure,
  // and the reason the property is now stated as INHERITANCE: v2 may carry non-callee members only
  // where v1 already did, and must invent none of its own.
  const nameOf = (sig) => sig.replace(/^clara\./, "").replace(/\(.*$/, "");
  const v1Unreached = v1Sigs.map(nameOf).filter((n) => n !== "evaluate_metric_v1" && !fromV1Reach.has(n));
  const v2Unreached = v2Sigs.map(nameOf).filter((n) => n !== "evaluate_metric_v2" && !reach.has(n));
  assert.ok(v2Unreached.every((n) => v1Unreached.includes(n)),
    `v2's non-callee members (${v2Unreached.join(", ")}) must all be ones v1 already froze as non-callees (${v1Unreached.join(", ")})`);
  assert.ok(v1Unreached.length > 0,
    "and v1 genuinely has some — otherwise the inheritance assertion above would be vacuous");

  // (b) THE RETARGETING IS COMPLETE — the property M8's fourteen textual retargets exist to
  // achieve, measured from the catalog rather than counted in a diff. If ANY of the seven call
  // sites in either v2 body still pointed at its v1 twin, that v1 body would appear here.
  for (const v1Body of ["evaluate_metric_v1", "_metric_eval_node_v1", "validate_metric_ast_v1", "_validate_metric_node_v1"]) {
    assert.ok(!reach.has(v1Body),
      `v2 must not reach ${v1Body} — a surviving v1 call site would mean a retarget was missed`);
  }
  // ...and the deliberately SHARED helper IS reached, so (b) is not passing because v2 reaches
  // nothing v1-named at all.
  assert.ok(reach.has("_metric_selector_account_ids") && reach.has("_metric_resolved_inputs_sha256_v1"),
    "the five v1 helpers reused verbatim ARE reached — the exclusion above is about the four twinned bodies, not about the _v1 suffix");

  // (c) THE fs_pack EXCLUSION IS A FACT ABOUT DIRECTION, not about importance. v1's closure
  // carries clara.evaluate_fs_pack_v1 as a CALLER of the evaluator, never a callee; v2 has no
  // such caller, so freezing it into v2's closure would assert a relationship that does not exist.
  assert.ok(!reach.has("evaluate_fs_pack_v1"), "evaluate_fs_pack_v1 is not reachable FROM evaluate_metric_v2");
  assert.ok(!fromV1Reach.has("evaluate_fs_pack_v1"),
    "nor from v1 — it is a member of v1's closure as a caller, which is exactly the asymmetry");
  const fromPack = await transitiveCallees("evaluate_fs_pack_v1");
  assert.ok(fromPack.has("evaluate_metric_v1"),
    "and the edge runs the OTHER way: the pack driver calls the v1 evaluator");
  assert.ok(!fromPack.has("evaluate_metric_v2"),
    "the pack driver is pinned to v1 and does not reach v2 — nothing in this build gave it a v2 path");
});

test("B5.11 — THE OP NAMESPACE IS SEPARATE, both directions: a v1 op_key never hands back a v2 receipt, nor the reverse", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // clara.op_receipts is keyed (firm_id, fn, op_key). If v2's core had reserved under v1's `fn`,
  // a caller reusing an op_key across the two would be handed the FIRST call's stored result —
  // a v2 composition silently answered with a v1 cell. The keys below are deliberately IDENTICAL.
  const shared = opk("b511-shared");
  const flat = metricAst({ root: measure({ set: "revenue" }), unit: "money" });
  const composed = metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" });

  const v1 = await composePreviewV1(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: flat, periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
    opKey: shared,
  });
  const v2 = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: composed, periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
    opKey: shared,
  });
  assert.ok(v1.cell_id && v2.cell_id);
  assert.notEqual(v2.cell_id, v1.cell_id,
    "the SAME op_key across the two verbs must mint two cells, never replay the first one's receipt");
  const stamps = (await rootQuery(
    `select id, inputs->'composition'->>'evaluator_entrypoint' as entry
       from clara.metric_cells where id = any($1::uuid[])`, [[v1.cell_id, v2.cell_id]])).rows;
  const byId = Object.fromEntries(stamps.map((r) => [r.id, r.entry]));
  assert.equal(byId[v1.cell_id], V1_ENTRYPOINT);
  assert.equal(byId[v2.cell_id], V2_ENTRYPOINT, "each receipt belongs to the verb that minted it");
  // The receipts table itself is the positive read: two rows, one op_key, two DIFFERENT fn values.
  const receipts = (await rootQuery(
    `select fn from clara.op_receipts where firm_id=$1 and op_key=$2 order by fn`,
    [fx.A1.firmId, shared])).rows.map((r) => r.fn);
  assert.deepEqual(receipts, ["wake_compose_metric_preview", "wake_compose_metric_preview_v2"],
    "the two calls live in separate op namespaces, which is what makes the collision impossible");

  // THE REVERSE DIRECTION, and it is not the same assertion twice: reusing a v2 op_key on the v2
  // verb DOES replay (idempotency still works within a namespace), so the separation above is a
  // property of the namespace and not of replay being broken.
  const replay = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: composed, periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
    opKey: shared,
  });
  assert.equal(replay.cell_id, v2.cell_id, "the SAME verb + the SAME op_key replays its own receipt");
});

/**
 * Forge a metric_cells row THROUGH the integrity trigger, cloning a legitimately v2-composed cell
 * and swapping only its composition AST.
 *
 * This is the shape that makes the transitivity claim provable. The trigger does not walk the AST
 * looking for `cell` nodes — it re-validates and re-evaluates through validate_metric_ast_v2 and
 * _metric_eval_node_v2, and BL-5/M6 are supposed to surface from INSIDE those two calls. An
 * argument that they do is not evidence; an INSERT that the composing core never touched, landing
 * on the trigger and coming back with the token, is.
 *
 * Every earlier conjunct of the definitionless branch is satisfied on purpose so the row REACHES
 * the two calls: the schema tag, the entrypoint literal, the normalized-AST identity, the
 * composition hash (recomputed in SQL as clara._hash(z), never copied), the unit and the displayed
 * scale. A forgery that tripped an earlier conjunct would refuse with the wrong token and prove
 * nothing about transitivity.
 */
const FORGE_ROLLBACK = "card1 B5.12 rollback";
async function forgeCompositionThroughTrigger(seedCellId, ast) {
  // IT ALWAYS ROLLS BACK, and that is load-bearing rather than tidy. clara._tf_metric_cell_
  // integrity is `deferrable initially IMMEDIATE`, so it judges the INSERT statement itself --
  // which is the wall under test. clara._tf_metric_cell_provenance_complete (0061) is `initially
  // DEFERRED` and would refuse at COMMIT because this forged row has no child provenance rows, so
  // committing would replace the answer we are asking for with a different wall's answer. Rolling
  // back leaves the immediate wall's verdict as the only thing the caller sees -- and leaves no
  // forged row behind for a later cell to trip over.
  let out = null;
  await withActor({ transaction: true }, async (db) => {
    out = await db.query(
    `with seed as (select * from clara.metric_cells where id = $1),
     forged as (
       select jsonb_set(
                jsonb_set(seed.inputs, '{composition,ast}', $2::jsonb, true),
                '{composition,allow_negative}', 'false'::jsonb, true) as inputs
         from seed)
     insert into clara.metric_cells (firm_id, client_id, run_id, evaluation_context_id,
        definition_version_id, formula_sha256, resolved_inputs_sha256, evaluator_version_id,
        books_watermark, cell_status, na_reason_version_id, exact_numerator, exact_denominator,
        unit_key, displayed_scale, displayed_text, inputs)
     select seed.firm_id, seed.client_id, seed.run_id, seed.evaluation_context_id,
        null, clara._hash(forged.inputs->'composition'), seed.resolved_inputs_sha256,
        seed.evaluator_version_id, seed.books_watermark, seed.cell_status, seed.na_reason_version_id,
        seed.exact_numerator, seed.exact_denominator,
        case ($2::jsonb)#>>'{unit}' when 'currency' then 'money' else ($2::jsonb)#>>'{unit}' end,
        (($2::jsonb)#>>'{result_scale}')::smallint, seed.displayed_text, forged.inputs
       from seed, forged`,
      [seedCellId, JSON.stringify(ast)]);
    throw new Error(FORGE_ROLLBACK);
  }).catch((e) => { if (e?.message !== FORGE_ROLLBACK) throw e; });
  return out;
}

test("B5.12 — THE TRANSITIVITY IS REAL ON THE WRITE PATH: BL-5 and M6 surface from the TRIGGER's own re-derivation, not only from the composing core", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // A legitimately v2-composed cell to clone. Everything the forgeries below keep comes from a row
  // the trigger already ACCEPTED, so the only term under test is the composition AST.
  const seed = await composePreviewV2(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId,
    ast: metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId, opKey: opk("b512seed"),
  });
  assert.ok(seed.cell_id, "the seed row was accepted by the trigger, so the clone starts from a lawful shape");

  // POSITIVE CONTROL FIRST: the forging path itself can produce an ACCEPTED row. Without this, a
  // forgery that refused for some unrelated structural reason would read as a wall doing its job.
  const control = await forgeCompositionThroughTrigger(seed.cell_id,
    metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" }));
  assert.equal(control.rowCount, 1,
    "CONTROL: an unchanged composition, forged through the same INSERT, is accepted — so the refusals below are about the AST and not about the forging shape");

  // ARM 1 (BL-5): cite a PREVIEW-composed cell. The composing core is not involved at all here;
  // the token can only come from validate_metric_ast_v2 / _metric_eval_node_v2 running INSIDE the
  // trigger.
  const preview = await composePreviewV1(fx.A1.firmId, world.users.alice, {
    client: fx.A1.clientId, ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId,
  });
  const bl5 = await raised(() => forgeCompositionThroughTrigger(seed.cell_id,
    metricAst({ root: divide(cellNode(preview.cell_id), cellNode(preview.cell_id)), unit: "ratio" })));
  assert.ok(bl5, "a cell node citing a preview-composed cell must not be insertable");
  assert.equal(detailOf(bl5).reason, "metric_cell_reference_not_definition_backed",
    `BL-5 must surface from the trigger's own re-derivation (got ${bl5.code}: ${bl5.message})`);

  // ARM 2 (M6): cite a definition-backed, 'ok' cell whose PERIOD SET does not match the composing
  // context. This is the sharper proof of the two: the VALIDATOR cannot see a period set at all,
  // so this token can only have come from _metric_eval_node_v2 running inside the trigger.
  //
  // SAME FIRM, SAME CLIENT as the seed, deliberately. A cell from another client would refuse as
  // `metric_cell_reference_unknown` — still the v2 evaluator answering, but from the SCOPE
  // predicate rather than the context one, which would leave M6 itself unproven. The two fixtures
  // differ in exactly one term: how many periods the cited cell binds.
  const months = (await rootQuery(
    `select id from clara.reporting_periods where client_id=$1 and grain='month' order by period_start`,
    [fx.A1.clientId])).rows.map((r) => r.id);
  if (months.length < 2) {
    t.diagnostic("card 1 B5.12 arm 2: this client carries fewer than two month periods, so no differing period SET can be built — arm 1 above still holds");
  } else {
    const pair = [months[0], months[1]];
    const { mintMetricInput } = await import("./delta-fixtures.mjs");
    const two = await mintMetricInput(world.users.alice, { client: fx.A1.clientId, periodIds: pair });
    const wide = await evaluateMetricHuman(world.users.alice, {
      client: fx.A1.clientId, definitionVersion: fx.A1.definitionVersionId,
      periodIds: pair, snapshotId: two.snapshotId, runId: randomUUID(),
    });
    const wideRow = (await rootQuery(
      "select cell_status from clara.metric_cells where id=$1", [wide.cell_id])).rows[0];
    if (wideRow.cell_status !== "ok") {
      t.diagnostic(`card 1 B5.12 arm 2: the two-period fixture cell came back '${wideRow.cell_status}', so it cannot be cited — arm 1 above still holds`);
    } else {
      const m6 = await raised(() => forgeCompositionThroughTrigger(seed.cell_id,
        metricAst({ root: divide(cellNode(wide.cell_id), cellNode(wide.cell_id)), unit: "ratio" })));
      assert.ok(m6, "a cell node whose period set does not match the composing context must not be insertable");
      const d = detailOf(m6);
      assert.equal(d.reason, "metric_cell_context_mismatch",
        `M6 must surface from the trigger's own re-derivation, in the same firm and client (got ${m6.code}: ${JSON.stringify(d)})`);
      assert.ok(["period_set", "books_watermark"].includes(d.class), `axis: ${d.class}`);
      t.diagnostic(`card 1 B5.12 arm 2 refused with ${d.reason}/${d.class}, raised from inside the trigger`);
    }
  }
});

test("B5.9 (N3/CD-14) — the canonical door stays CLOSED: a cell-containing AST is refused at DRAFT-SAVE, before a proposal could exist", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // _validate_metric_ast_shape_v1 is v1-only and closes on the SAME eleven primitives, so the
  // agent-reachable draft-save path refuses a `cell` node independently of the human
  // propose/approve verbs staying unedited. TWO doors, not one.
  const ast = metricAst({ root: divide(cellNode(fx.A1.cellId), cellNode(fx.A1.cellId)), unit: "ratio" });
  const e = await raised(() => rootQuery("select clara._validate_metric_ast_shape_v1($1::jsonb)", [JSON.stringify(ast)]));
  assert.equal(e?.code, "CLR10", `${e?.code}: ${e?.message}`);
  assert.match(e.message, /metric primitive unknown/,
    "the proposal-time structural gate does not know `cell`, and this build mints it no _v2 twin — that absence IS the wall");
  // And there is no _v2 twin to find. An assertion about ABSENCE, made positively: the catalog is
  // asked, and a future build that mints one will turn this cell red on purpose.
  assert.equal((await rootQuery(
    "select to_regprocedure('clara._validate_metric_ast_shape_v2(jsonb)') is null as absent")).rows[0].absent, true);
});

const lagN = (periods, of) => ({ node: "lag", periods, of });
const sumOf = (...terms) => ({ node: "sum", terms });

test("B4.12 (M6, cross-period axis) — a `cell` beneath a PERIOD SHIFT is refused at BOTH guards, at any depth, while every unshifted cell path and every non-cell lag still works", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // WHY THIS CELL EXISTS. Adversarial review found `lag(1, cell(X))` minting a real 'ok' preview
  // cell whose value was the cell's UNSHIFTED whole-period-set number while the composition was
  // labelled one period earlier. M6's period-set equality compares the cell's periods to the
  // CONTEXT's whole set and says nothing about which period the evaluator is standing on; `lag`
  // moves exactly that. The result was a deterministic, reproducible, period-MISLABELLED figure —
  // citable by a stage-(a) placeholder into a rendered PDF. Not a constraint-2 break (no model
  // numeral), but a divergence from this lane's own M6 contract, which names cross-period
  // composition over a cell a NAMED, UNBUILT extension point.
  const scope = scopeA1();
  const X = cellNode(fx.A1.cellId);

  // ---- INSTRUMENT CONTROL FIRST. The guard keys on a new bottom-up `cells` count in the node
  // contract, so before asserting any refusal, prove that counter is real and that it does NOT
  // refuse cells generally — a refusal cell whose instrument miscounts would pass for the wrong
  // reason. All three propagation paths are measured, because the guard is only as deep as the
  // shallowest one: the leaf, the loop (sum/average terms) and the binary (subtract/divide operands).
  assert.equal((await validateNode(X, scope)).cells, 1, "the leaf contributes one cell");
  assert.equal((await validateNode(sumOf(X, X), scope)).cells, 2, "the LOOP path accumulates");
  assert.equal((await validateNode(subtract(X, X), scope)).cells, 2, "the BINARY path accumulates");
  // A cell-free subtree must carry NO `cells` KEY AT ALL — absence, not zero, and this is asserted
  // at the two shapes that build a fresh contract rather than inheriting one. It is stated as
  // absence because a `cells: 0` is exactly what broke B5.8 on the first cut of this fix: that cell
  // diffs v1's contract against v2's on every canonical cell-free AST at both doors, and a field v1
  // has no counterpart for made all ten differ on something meaningless there. Measured, it was the
  // SOLE difference — no evaluation divergence. The fix emits the key only when positive rather than
  // teaching B5.8 to ignore it, so the differential stays byte-exact; these three assertions are
  // what stop that regression coming back.
  const M = measure({ set: "revenue" });
  for (const [shape, node] of [["leaf", M], ["loop", sumOf(M, M)], ["binary", subtract(M, M)]]) {
    assert.equal((await validateNode(node, scope)).cells, undefined,
      `${shape}: a cell-free contract carries no cells key at all — B5.8 diffs these against v1 byte-for-byte`);
  }

  // ---- GUARD 1 (STRUCTURAL, at validation): the adversary's EXACT scenario, plus the same shape
  // at depth through each accumulating path. Depth matters: a guard that only inspected lag's
  // DIRECT child would pass the first arm and miss the other two.
  for (const [label, node] of [
    ["direct", lagN(1, X)],
    ["through the loop path", lagN(1, sumOf(X))],
    ["through the binary path", lagN(1, subtract(X, X))],
  ]) {
    const e = await raised(() => validateNode(node, scope));
    assert.equal(e?.code, "CLR10", `${label}: ${e?.code}: ${e?.message}`);
    const d = detailOf(e);
    assert.equal(d.reason, "temporality_mismatch", label);
    assert.equal(d.class, "cross_period_cell", label);
  }

  // ---- THE OTHER POLARITY: the legitimate cross-period vocabulary is untouched. A lag over a RAW
  // measure is exactly what the design says to use for "this period versus three months ago", and
  // an unshifted cell still validates. Without these two arms the refusal above could have been a
  // blanket ban on lag, or on cells, and the cell would still be green.
  assert.equal((await validateNode(lagN(1, measure({ set: "revenue" })), scope)).lag, 1,
    "lag over a raw measure still validates and still reports its lag depth");
  assert.equal((await validateNode(X, scope)).po, 0, "a direct, unshifted cell still validates");

  // ---- GUARD 2 (BEHAVIOURAL, at eval) — proven INDEPENDENTLY of guard 1 by calling the evaluator
  // node directly, so this arm still bites if the validator were ever loosened.
  // THE AXIS IS ISOLATED THE SAME WAY B4.5 ISOLATES ITS OWN: the cited cell's period set must
  // EQUAL the context's, or M6's period_set arm fires first and this cell passes while proving the
  // wrong thing. So the cell is minted over BOTH periods and read against its OWN context — only
  // the period the evaluator stands on differs.
  const c = await freshDeltaClient(world.users.alice, "c1shift");
  const base = await mintDefinitionBackedCell(world.users.alice, c, "shift");
  const second = await addSecondPeriod(world.users.alice, { client: base.clientId, monthStart: base.monthStart });
  const { mintMetricInput } = await import("./delta-fixtures.mjs");
  const two = await mintMetricInput(world.users.alice, {
    client: base.clientId, periodIds: [base.periodId, second.id],
  });
  const wide = await evaluateMetricHuman(world.users.alice, {
    client: base.clientId, definitionVersion: base.definitionVersionId,
    periodIds: [base.periodId, second.id], snapshotId: two.snapshotId, runId: randomUUID(),
  });
  const wrow = (await rootQuery(
    "select evaluation_context_id, cell_status from clara.metric_cells where id = $1", [wide.cell_id])).rows[0];
  assert.equal(wrow.cell_status, "ok", "the two-period fixture cell itself evaluated");
  const at = (period) => evalNode(cellNode(wide.cell_id), {
    firm: base.firmId, client: base.clientId, snapshot: two.snapshotId,
    context: wrow.evaluation_context_id, period,
  });
  const e2 = await raised(() => at(second.id));
  assert.equal(e2?.code, "CLR10", `${e2?.code}: ${e2?.message}`);
  const d2 = detailOf(e2);
  assert.equal(d2.reason, "metric_cell_context_mismatch");
  assert.equal(d2.class, "period_shift",
    "the SHIFT axis fired, not the period_set axis — the cell's periods and the context's are equal by construction");
  // The twin, differing in exactly one term: the same cell, same context, read at the ROOT period.
  assert.equal((await at(base.periodId)).status, "ok",
    "the identical read at the composition root still evaluates — the guard refuses the shift, not the cell");

  // ---- NO REGRESSION on the shape that ALREADY refused, with its reason recorded honestly:
  // subtract(cell, lag(1, cell)) used to refuse on the po (period-offset) mismatch between its two
  // operands. It still refuses, but now EARLIER and for the more specific reason — guard 1 fires
  // while validating the lag operand, before the operands are ever compared. That is a tightening,
  // not a drift, and it is asserted rather than assumed so a future reordering cannot quietly turn
  // this shape back into a po-mismatch that a looser operand rule might one day admit.
  const e3 = await raised(() => validateNode(subtract(X, lagN(1, X)), scope));
  assert.equal(e3?.code, "CLR10", `${e3?.code}: ${e3?.message}`);
  assert.equal(detailOf(e3).class, "cross_period_cell");
});

const percentChange = (current, prior) => ({ node: "percent_change", current, prior });

test("B4.12-bis (ride-along from adversary-0135's re-attack) — percent_change over the SAME root-anchored cell is LEGITIMATE and mints ok; the guard refuses the period SHIFT, not binary composition over cells", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // WHY THIS CELL EXISTS. B4.12 is a wall of refusals, and every one of its arms would be equally
  // satisfied by a guard that banned cells beneath ANY binary node — a strictly broader ban that
  // would silently delete legitimate vocabulary. This is the standing POSITIVE control that tells
  // the two apart: percent_change composes two cells and is admitted, because it does not move the
  // period the evaluator stands on. In this vocabulary `lag` is the ONLY shifter, which is exactly
  // why guard 1 keys on the shift and not on the cell. Proved live by adversary-0135's re-attack.
  const scope = scopeA1();
  const X = cellNode(fx.A1.cellId);

  // ---- GUARD 1 IS CORRECTLY SILENT, and the instrument it reads is confirmed live here rather
  // than assumed: the same bottom-up `cells` counter B4.12's refusals depend on still counts BOTH
  // operands, so this is a guard that saw two cells and admitted them — not a guard that missed
  // them. A `cells: 2` with `po: 0` is the precise shape "composed over cells, unshifted".
  const v = await validateNode(percentChange(X, X), scope);
  assert.equal(v.po, 0, "percent_change shifts nothing: both operands stay anchored at the composition root");
  assert.equal(v.cells, 2, "and the cells counter DID see both — the admission is informed, not blind");
  assert.equal(v.lag, 0, "no lag depth is introduced, which is the whole reason the cross_period_cell wall stays quiet");

  // ---- AND IT EVALUATES. Validation admitting a shape proves only that the shape is well-formed;
  // the figure has to come out too, or "legitimate" is a claim about the parser rather than about
  // the product. x versus x is no change, so the value is exactly zero.
  const r = await evalNode(percentChange(X, X), ctxA1());
  assert.equal(r.status, "ok", `percent_change(cell, cell) must evaluate, got ${r.status}/${r.reason_key}`);
  assert.equal(Number(r.numerator), 0, "a cell compared against itself is a zero percent change");

  // ---- THE DIFFERENTIAL TWIN. One term differs — the period shift — and the wall bites. Run here
  // beside the admission so the pair is read together: if a future edit widened guard 1 into a
  // blanket cell ban, the cell above goes red; if it narrowed it away, this one does.
  const e = await raised(() => validateNode(lagN(1, X), scope));
  assert.equal(e?.code, "CLR10", `the shifted twin must still refuse: ${e?.code}: ${e?.message}`);
  assert.equal(detailOf(e).class, "cross_period_cell",
    "and refuse for the SHIFT reason — the two shapes differ in exactly one term, so the reason must name that term");
});
