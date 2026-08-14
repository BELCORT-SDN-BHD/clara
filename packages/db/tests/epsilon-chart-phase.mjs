// Wave E lane EPSILON -- phase 3: the chart AST and the four-stage pipeline. NOT a test file.
//
// Proves stage 1 (closed schema: no inline values/SQL/JS/formulas, named axis policies only, no
// ad-hoc bounds, no literal thresholds, no numeric literal anywhere), stage 2 (every series and
// threshold resolves inside the caller's firm), stage 3 (the evaluator ran against the run's
// PINNED snapshot) and stage 4 (the typed dataset is persisted, and stays reconstructible).

import {
  assert, randomUUID, rootQuery, withActor, ROLES, caught, reasonOf, errorDetail,
  freshActiveClient, setupCloseCoa, createStandardSets, proposeMetricDefinition,
  approveMetricDefinition, measure, metricAst, mintMetricInput, evaluateMetricHuman,
  publishChart, chartSpec, sealDataset, openRun, draftSpec,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, datasetRows, ensureEpsilonAdmin } from "./epsilon-world.mjs";

async function foreignDefinitionVersion(world) {
  const dave = world.users.dave;
  const client = await freshActiveClient(dave, `eps-foreign-${randomUUID().slice(0, 6)}`);
  await setupCloseCoa(dave, client);
  await createStandardSets(dave, client);
  const version = await proposeMetricDefinition(dave, {
    client, key: `foreign_revenue_${randomUUID().slice(0, 8)}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(dave, version);
  return version;
}

export async function registerChartPhase(t, world) {
  const owner = world.users.alice;
  const base = await buildEpsilonWorld(world, { tag: "chart-base", reportClass: "management", seal: false });

  await t.test("stage 1 REFUSES every inline-value, ad-hoc-bound and literal-threshold shape", async () => {
    const good = chartSpec({ definitionVersionId: base.definitionVersionId });
    const cases = [
      ["an inline data array", { ...good, series: [{ series_key: "r", definition_version_id: base.definitionVersionId }], data: [1, 2, 3] }, "inline_value_forbidden"],
      ["an inline values array", { ...good, values: ["x"] }, "inline_value_forbidden"],
      ["a SQL escape hatch", { ...good, sql: "select 1" }, "inline_value_forbidden"],
      ["a JS escape hatch", { ...good, js: "() => 1" }, "inline_value_forbidden"],
      ["a user formula", { ...good, formula: "a/b" }, "inline_value_forbidden"],
      ["an ad-hoc axis minimum", { ...good, min: 0 }, "axis_bound_adhoc_forbidden"],
      // Nested, to prove the scan reaches past the top level rather than only guarding it.
      ["an ad-hoc axis maximum nested in a series", { ...good,
        series: [{ series_key: "r", definition_version_id: base.definitionVersionId, axis_max: 9 }] }, "axis_bound_adhoc_forbidden"],
      ["a figure typed at an allowed nested key", { ...good,
        series: [{ series_key: "r", definition_version_id: 5 }] }, "numeric_literal_forbidden"],
      ["a literal threshold value", { ...good,
        thresholds: [{ threshold_key: "target", source: "metric_constant", value: 100 }] }, "threshold_literal_forbidden"],
      ["a threshold naming no DB source", { ...good,
        thresholds: [{ threshold_key: "target", source: "metric_constant" }] }, "threshold_literal_forbidden"],
      ["a threshold naming two DB sources", { ...good,
        thresholds: [{ threshold_key: "t", source: "metric_constant", constant_key: "zero",
          definition_version_id: base.definitionVersionId }] }, "threshold_literal_forbidden"],
      ["an unnamed axis policy", { ...good, axis_policy: "auto" }, "axis_policy_unknown"],
      ["a suppressed data table", { ...good, data_table: false }, "data_table_required"],
      ["an unknown top-level field", { ...good, palette: "blue" }, "unknown_field"],
      ["an empty series list", { ...good, series: [] }, "unknown_field"],
      ["a duplicated series key", { ...good, series: [
        { series_key: "r", definition_version_id: base.definitionVersionId },
        { series_key: "r", definition_version_id: base.definitionVersionId }] }, "series_duplicated"],
    ];
    for (const [label, spec, reason] of cases) {
      const error = await caught(() => publishChart(owner, {
        chartKey: `bad-${randomUUID().slice(0, 6)}`, spec }));
      assert.equal(reasonOf(error), reason, `${label}: got ${error?.code} ${error?.message}`);
    }
  });

  await t.test("all four NAMED axis policies are admitted, and each is recorded on the version row", async () => {
    for (const policy of ["include_zero", "data_extent", "symmetric", "disclosed_manual"]) {
      const published = await publishChart(owner, {
        chartKey: `axis-${policy}-${randomUUID().slice(0, 6)}`,
        spec: chartSpec({ definitionVersionId: base.definitionVersionId, axisPolicy: policy }),
      });
      assert.equal(published.axis_policy, policy);
      assert.equal((await rootQuery("select axis_policy from clara.chart_template_versions where id=$1",
        [published.chart_template_version_id])).rows[0].axis_policy, policy,
        "the stored column is read OUT OF the validated AST, so the two cannot disagree");
    }
  });

  await t.test("stage 2 refuses a foreign firm's metric version and an unknown constant", async () => {
    const foreign = await foreignDefinitionVersion(world);
    const crossFirm = await caught(() => publishChart(owner, {
      chartKey: `cross-${randomUUID().slice(0, 6)}`,
      spec: chartSpec({ definitionVersionId: foreign }),
    }));
    assert.equal(crossFirm?.code, "CLR11", crossFirm?.message);
    assert.equal(reasonOf(crossFirm), "metric_version_not_in_firm",
      "no existence oracle: a foreign version reads as not-found-in-your-firm");

    const badConstant = await caught(() => publishChart(owner, {
      chartKey: `const-${randomUUID().slice(0, 6)}`,
      spec: chartSpec({ definitionVersionId: base.definitionVersionId,
        thresholds: [{ threshold_key: "t", source: "metric_constant", constant_key: `nope_${randomUUID().slice(0, 6)}` }] }),
    }));
    assert.equal(reasonOf(badConstant), "metric_constant_not_in_firm");

    // A product-curated constant IS reachable -- the refusal above is about scope, not about
    // thresholds being impossible.
    const ok = await publishChart(owner, {
      chartKey: `threshold-${randomUUID().slice(0, 6)}`,
      spec: chartSpec({ definitionVersionId: base.definitionVersionId,
        thresholds: [{ threshold_key: "target", source: "metric_constant", constant_key: "zero" }] }),
    });
    world.epsilonChart = ok.chart_template_version_id;
  });

  await t.test("stage 3: a cell evaluated against ANOTHER snapshot cannot be sealed into the run", async () => {
    // Two snapshots over the same period. The run pins the SECOND; the evaluation runs against
    // the FIRST. Nothing in the delta tables forbids that -- the epsilon seal is what catches it.
    const second = await mintMetricInput(owner, { client: base.client, periodIds: [base.period.id] });
    const spec = await draftSpec(owner, {
      client: base.client, specKey: `unpinned-${randomUUID().slice(0, 6)}`,
      templateVersionId: base.template.report_template_version_id, layout: base.layout,
    });
    const run = await openRun(owner, {
      client: base.client, specVersionId: spec.report_spec_version_id,
      snapshotId: second.snapshotId, periodId: base.period.id,
    });
    await evaluateMetricHuman(owner, {
      client: base.client, definitionVersion: base.definitionVersionId, periodIds: [base.period.id],
      snapshotId: base.snapshotId, runId: run.report_run_id,
    });
    const error = await caught(() => sealDataset(owner, { runId: run.report_run_id }));
    assert.equal(reasonOf(error), "snapshot_not_pinned", error?.message);
    assert.equal(Number(errorDetail(error).unpinned_cells), 1, "the refusal counts what it measured");
    assert.equal(errorDetail(error).books_snapshot_id, second.snapshotId);
    assert.equal((await datasetRows(run.report_run_id)).length, 0,
      "the refused seal left no half-built dataset behind");
  });

  await t.test("stage 3: a run with no evaluated cells seals nothing", async () => {
    const spec = await draftSpec(owner, {
      client: base.client, specKey: `nocells-${randomUUID().slice(0, 6)}`,
      templateVersionId: base.template.report_template_version_id, layout: base.layout,
    });
    const run = await openRun(owner, {
      client: base.client, specVersionId: spec.report_spec_version_id,
      snapshotId: base.snapshotId, periodId: base.period.id,
    });
    const error = await caught(() => sealDataset(owner, { runId: run.report_run_id }));
    assert.equal(reasonOf(error), "run_has_no_cells", error?.message);
    assert.equal(errorDetail(error).report_run_id, run.report_run_id,
      "the refusal names the run, so the remedy is actionable without a second query");
  });

  await t.test("a chart series with no evaluated cell in the run is named and refused", async () => {
    // Proposed by the admin, approved by the owner: firm A has two eligible humans, so delta's
    // maker/checker rule requires them to differ.
    const other = await proposeMetricDefinition(await ensureEpsilonAdmin(world), {
      client: base.client, key: `unplotted_${randomUUID().slice(0, 8)}`, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, other);
    const chart = await publishChart(owner, {
      chartKey: `starved-${randomUUID().slice(0, 6)}`,
      spec: chartSpec({ definitionVersionId: other, seriesKey: "expense" }),
    });
    const error = await caught(() => sealDataset(owner, {
      runId: base.runId, charts: [chart.chart_template_version_id] }));
    assert.equal(reasonOf(error), "chart_series_has_no_cell", error?.message);
    assert.deepEqual(errorDetail(error).series_keys, ["expense"]);
  });

  await t.test("stage 4: the typed dataset persists, joins to its cells BY ID, and stays reconstructible", async () => {
    const sealed = await sealDataset(owner, { runId: base.runId, charts: [world.epsilonChart] });
    const datasets = await datasetRows(base.runId);
    assert.equal(datasets.length, 2, "one FS dataset plus one per bound chart");
    const [fs, chart] = datasets;
    assert.equal(fs.chart_spec_version_id, null);
    assert.equal(chart.chart_spec_version_id, world.epsilonChart);
    assert.equal(fs.books_snapshot_id, base.snapshotId,
      "the composite FK makes the dataset's snapshot its run's pinned snapshot, structurally");

    const points = (await rootQuery(
      "select p.*, c.run_id from clara.report_dataset_points p join clara.metric_cells c on c.id=p.cell_id where p.dataset_id=any($1) order by p.dataset_id, p.ordinal",
      [[fs.id, chart.id]])).rows;
    assert.ok(points.length >= 2);
    assert.ok(points.every((p) => p.run_id === base.runId), "every point joins to a cell OF THIS RUN");
    const fsCells = new Set(points.filter((p) => p.dataset_id === fs.id).map((p) => p.cell_id));
    const chartCells = points.filter((p) => p.dataset_id === chart.id).map((p) => p.cell_id);
    assert.ok(chartCells.length >= 1);
    assert.ok(chartCells.every((id) => fsCells.has(id)),
      "the chart plots the SAME persisted cells the FS dataset carries -- same-source by CELL ID, "
      + "not by two derivations that happen to agree today (matrix A32b)");
    const ok = points.filter((p) => p.point_status === "ok");
    assert.ok(ok.length >= 1);
    assert.ok(ok.every((p) => p.value_text !== null && p.value_cents === null),
      "the v1 producer carries the evaluator's OWN displayed text; it re-derives no figure");
    assert.ok(ok.every((p) => p.dimensions.exact_numerator !== undefined
      && p.dimensions.exact_denominator !== undefined),
      "the cell's exact rational travels verbatim, so nothing downstream has to round again");

    const verified = (await rootQuery("select clara.verify_report_dataset($1) r", [fs.id])).rows[0].r;
    assert.equal(verified.ok, true);
    assert.equal(verified.point_count, Number(fs.point_count));
    assert.equal(sealed.fs_dataset_id, fs.id);
  });

  await t.test("a point appended after the seal cannot commit, and a sealed dataset is frozen", async () => {
    const [fs] = await datasetRows(base.runId);
    const appended = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, (db) =>
      db.query(
        `insert into clara.report_dataset_points(dataset_id,firm_id,client_id,ordinal,series_key,
           cell_id,point_status,dimensions)
         select $1,firm_id,client_id,9999,'forged',cell_id,'absent','{}'::jsonb
           from clara.report_dataset_points where dataset_id=$1 limit 1`, [fs.id])));
    assert.equal(reasonOf(appended), "dataset_reconstruction_mismatch",
      `the header no longer reconstructs from its points: ${appended?.message}`);
    for (const [sql, label] of [
      ["update clara.report_datasets set point_count=point_count+1 where id=$1", "restamp a sealed digest"],
      ["delete from clara.report_datasets where id=$1", "delete a sealed dataset"],
    ]) {
      const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true },
        (db) => db.query(sql, [fs.id])));
      assert.equal(error?.code, "CLR08", `${label}: ${error?.message}`);
    }
    assert.equal((await rootQuery("select clara.verify_report_dataset($1) r", [fs.id])).rows[0].r.ok, true,
      "the refused attempts left the dataset reconstructing exactly as sealed");
  });

  await t.test("a run seals its dataset exactly once", async () => {
    const error = await caught(() => sealDataset(owner, { runId: base.runId }));
    assert.equal(reasonOf(error), "report_run_state_illegal", error?.message);
    assert.equal(errorDetail(error).state, "dataset_sealed");
  });
}
