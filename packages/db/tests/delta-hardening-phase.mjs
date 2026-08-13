import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, buildWorld, requireWaveEDelta, caught, reasonOf, errorDetail,
  freshDeltaClient, createStandardSets, pastMonthStart, mintPeriodWithMovement,
  proposeMetricDefinition, approveMetricDefinition, recordMetricAttempt, attemptReceiptRows,
  measure, constant, metricAst,
} from "./delta-fixtures.mjs";

let world;

/** The A30b receipt writer's refusals and the percent_change dimension wall — the cells that need
 *  no 5,000-cell corpus. The boundary cells that DO need one live in the cap/concurrency phase. */
export async function registerHardeningPhase(t) {
  await requireWaveEDelta();
  world = await buildWorld();

  await t.test("a cap receipt refuses a definition set the real entrypoint could not have evaluated", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "receipt-definition-guard");
    await createStandardSets(owner, client);
    await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(5), cents: 100 });
    const approved = await proposeMetricDefinition(owner, {
      client, key: `receipt_guard_${randomUUID()}`, unit: "money",
      ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, approved);
    const draftOnly = await proposeMetricDefinition(owner, {
      client, key: `receipt_guard_draft_${randomUUID()}`, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    assert.equal((await rootQuery("select state from clara.metric_definition_versions where id=$1", [draftOnly])).rows[0].state,
      "draft", "the second definition is positively still a draft before it is offered to the receipt writer");
    const runId = randomUUID();
    // A fabricated id and an unapproved-but-real id are the same class of lie: neither could have
    // produced a cell, so neither can buy an immutable receipt for a breach that never happened.
    for (const [tag, ids] of [["fabricated", [randomUUID()]], ["unapproved_draft", [draftOnly]], ["mixed", [approved, draftOnly]]]) {
      const error = await caught(() => recordMetricAttempt(owner, { client, runId, outcomeClass: "cap_refusal",
        definitionVersions: ids, attemptKey: `guard-${tag}-${randomUUID()}` }));
      assert.equal(error?.code, "CLR11", `${tag}: ${error?.code} ${error?.message}`);
      assert.equal(reasonOf(error), "definition_unavailable", `${tag}: ${error?.detail}`);
      const unavailable = errorDetail(error).unavailable ?? [];
      assert.equal(unavailable.includes(approved), false, `${tag}: the approved definition is not named as unavailable`);
      assert.ok(unavailable.length > 0, `${tag}: the refusal names the offending ids`);
    }
    assert.equal((await attemptReceiptRows(client, runId)).length, 0, "no receipt survives any of those refusals");
  });

  await t.test("a cap receipt binds its arity to the entrypoint it names", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "receipt-arity-guard");
    await createStandardSets(owner, client);
    await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(5), cents: 100 });
    const versions = [];
    for (const tag of ["one", "two"]) {
      const v = await proposeMetricDefinition(owner, {
        client, key: `arity_${tag}_${randomUUID()}`, unit: "money",
        ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
      });
      await approveMetricDefinition(owner, v); versions.push(v);
    }
    const runId = randomUUID();
    // Two definitions cannot be a scalar attempt: clara.evaluate_metric_v1 evaluates exactly one.
    const error = await caught(() => recordMetricAttempt(owner, { client, runId, outcomeClass: "cap_refusal",
      entrypoint: "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)", definitionVersions: versions,
      attemptKey: `arity-${randomUUID()}` }));
    assert.equal(error?.code, "CLR10", `${error?.code} ${error?.message}`);
    assert.deepEqual([errorDetail(error).class, errorDetail(error).constraint, errorDetail(error).supplied],
      ["definition_versions", "scalar_arity_one", 2],
      "the refusal names the arity rule and the count it measured");
    assert.equal((await attemptReceiptRows(client, runId)).length, 0, "the mislabelled attempt leaves no receipt");
  });

  await t.test("a cancellation receipt refuses a non-positive timeout and empty diagnostics", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "receipt-cancellation-guard");
    const runId = randomUUID();
    for (const [tag, timeout] of [["zero", "0"], ["zero_seconds", "0s"], ["garbage", "soon"], ["negative", "-5s"], ["empty", "   "]]) {
      const error = await caught(() => recordMetricAttempt(owner, { client, runId, outcomeClass: "cancellation",
        configuredTimeout: timeout, diagnostics: { observed_sqlstate: "57014" }, attemptKey: `cancel-${tag}-${randomUUID()}` }));
      assert.equal(error?.code, "CLR10", `${tag}: ${error?.code} ${error?.message}`);
      assert.equal(errorDetail(error).class, "configured_statement_timeout", `${tag}: ${error?.detail}`);
    }
    // A cancellation carries no measured numbers, so its diagnostics are the whole of its content.
    const empty = await caught(() => recordMetricAttempt(owner, { client, runId, outcomeClass: "cancellation",
      configuredTimeout: "15s", diagnostics: {}, attemptKey: `cancel-nodiag-${randomUUID()}` }));
    assert.equal(empty?.code, "CLR10", `${empty?.code} ${empty?.message}`);
    assert.equal(errorDetail(empty).class, "diagnostics", `${empty?.detail}`);
    assert.equal((await attemptReceiptRows(client, runId)).length, 0, "no half-formed cancellation receipt persists");
    const good = await recordMetricAttempt(owner, { client, runId, outcomeClass: "cancellation",
      configuredTimeout: "15s", diagnostics: { observed_sqlstate: "57014" }, attemptKey: `cancel-ok-${randomUUID()}` });
    assert.deepEqual([good.recorded, good.configured_statement_timeout], [true, "15s"],
      "a positive timeout with real diagnostics still records");
  });

  await t.test("caller diagnostics can never masquerade as DB-measured provenance", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "receipt-diagnostics-collision");
    const runId = randomUUID();
    // The caller supplies the exact keys the writer stamps. The writer's object is merged LAST, so
    // the measured provenance wins; a caller cannot dress its own text up as a DB measurement.
    const receipt = await recordMetricAttempt(owner, { client, runId, outcomeClass: "cancellation",
      configuredTimeout: "15s", attemptKey: `collision-${randomUUID()}`,
      diagnostics: {
        recorded_by: "the caller says it measured this",
        configured_statement_timeout_source: "db_observed",
        cancellation_is_not_cost_exceeded: false,
        caller_note: "this one is mine and survives",
      } });
    assert.equal(receipt.recorded, true);
    const row = (await attemptReceiptRows(client, runId))[0];
    assert.deepEqual([row.diagnostics.recorded_by, row.diagnostics.configured_statement_timeout_source,
      row.diagnostics.cancellation_is_not_cost_exceeded, row.diagnostics.caller_note],
    ["clara.record_metric_evaluation_attempt_v1", "caller_reported", true, "this one is mine and survives"],
    "every stamped key is the writer's own value; the caller's unrelated key is preserved");
  });

  await t.test("percent_change refuses operands of different dimensions", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "percent-change-dimension");
    await createStandardSets(owner, client);
    // percent_change subtracts its prior from its current, so cents-minus-ratio is the same error
    // subtract already refuses. Without this wall it validated, approved, and minted a cell whose
    // unit label said money.
    const mismatched = metricAst({
      root: { node: "percent_change", current: measure({ set: "revenue" }), prior: constant("half") },
      unit: "ratio",
    });
    const key = `pct_mismatch_${randomUUID()}`, opKey = `delta-pct-${randomUUID()}`;
    const version = await proposeMetricDefinition(owner, { client, key, unit: "ratio", ast: mismatched, opKey });
    const error = await caught(() => approveMetricDefinition(owner, version));
    assert.equal(error?.code, "CLR10", `${error?.code} ${error?.message}`);
    assert.equal(reasonOf(error), "dimension_mismatch", `${error?.detail}`);
    assert.match(errorDetail(error).fix ?? "", /same dimension/i);
    assert.equal((await rootQuery("select state from clara.metric_definition_versions where id=$1", [version])).rows[0].state,
      "draft", "the mismatched composition never reaches firm_approved");
    // The lawful shape — current and prior both money — still approves and evaluates.
    const lawful = await proposeMetricDefinition(owner, {
      client, key: `pct_lawful_${randomUUID()}`, unit: "ratio",
      ast: metricAst({ root: { node: "percent_change", current: measure({ set: "revenue" }),
        prior: { node: "lag", periods: 1, of: measure({ set: "revenue" }) } }, unit: "ratio" }),
    });
    await approveMetricDefinition(owner, lawful);
    assert.equal((await rootQuery("select state from clara.metric_definition_versions where id=$1", [lawful])).rows[0].state,
      "firm_approved", "same-dimension percent_change is untouched by the new wall");
  });
}
