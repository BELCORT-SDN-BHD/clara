import { test } from "node:test";
import assert from "node:assert/strict";

import { withMetricEvaluationBatch } from "../lib/pools.mjs";

const SET_PROBE = "select set_config('clara.metric_batch_probe', $1, true)";
const READ_PROBE = "select current_setting('clara.metric_batch_probe', true) as probe";
const READ_TIMEOUT =
  "select (extract(epoch from current_setting('statement_timeout')::interval) * 1000)::bigint as current_timeout_ms";
const SET_TIMEOUT = "select set_config('statement_timeout', $1, true)";

/**
 * A client standing in for lane eta's authorized transaction. `transactional` models
 * the ONE property under test: whether a SET LOCAL survives to the next statement.
 * With it false the mock behaves like autocommit — the txn-local write is discarded
 * as soon as its own statement ends, exactly as PostgreSQL discards it.
 */
function mockClient({ currentTimeoutMs = 30000, failOn, transactional = true } = {}) {
  const commands = [];
  let probeValue = "";
  const client = {
    async query(sql, params) {
      commands.push(params === undefined ? sql : [sql, params]);
      if (sql === failOn) throw new Error(`failed: ${sql}`);
      if (sql === SET_PROBE) {
        if (transactional) probeValue = params[0];
        return { rows: [{ set_config: params[0] }], rowCount: 1 };
      }
      if (sql === READ_PROBE) return { rows: [{ probe: probeValue }], rowCount: 1 };
      if (sql === READ_TIMEOUT) {
        return { rows: [{ current_timeout_ms: String(currentTimeoutMs) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, commands };
}

test("withMetricEvaluationBatch proves the explicit transaction before capping", async () => {
  const { client, commands } = mockClient();

  const result = await withMetricEvaluationBatch(client, async (transactionClient) => {
    assert.equal(transactionClient, client);
    await transactionClient.query("select evaluate_metric_batch()");
    return "evaluated";
  });

  assert.equal(result, "evaluated");
  assert.equal(commands.length, 5);
  const [probeSet, probeRead, timeoutRead, timeoutSet, batch] = commands;
  assert.equal(probeSet[0], SET_PROBE);
  assert.match(probeSet[1][0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  assert.equal(probeRead, READ_PROBE);
  assert.equal(timeoutRead, READ_TIMEOUT);
  assert.deepEqual(timeoutSet, [SET_TIMEOUT, ["15000ms"]]);
  assert.equal(batch, "select evaluate_metric_batch()");
});

test("withMetricEvaluationBatch refuses an autocommit caller before fn runs", async () => {
  // The whole point: in autocommit the SET LOCAL cap would revert before the batch,
  // so an unproven caller must be refused rather than silently run uncapped.
  const { client, commands } = mockClient({ transactional: false });
  let ran = false;

  await assert.rejects(
    () => withMetricEvaluationBatch(client, async () => { ran = true; }),
    (error) => {
      assert.match(error.message, /withMetricEvaluationBatch requires an explicit transaction/);
      assert.equal(error.code, "CLARA_METRIC_BATCH_NO_TRANSACTION");
      return true;
    },
  );

  assert.equal(ran, false, "fn must not run once the transaction precondition is unproven");
  assert.deepEqual(
    commands.map((command) => (Array.isArray(command) ? command[0] : command)),
    [SET_PROBE, READ_PROBE],
    "the refusal happens on the probe, before any timeout read or cap is issued",
  );
});

test("withMetricEvaluationBatch refuses when the probe reads back a different value", async () => {
  // A stale or foreign value is not this call's nonce; equality is the only evidence.
  const { client, commands } = mockClient();
  client.query = async (sql, params) => {
    commands.push(params === undefined ? sql : [sql, params]);
    if (sql === READ_PROBE) return { rows: [{ probe: "some-other-batch-nonce" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  await assert.rejects(
    () => withMetricEvaluationBatch(client, async () => {}),
    /withMetricEvaluationBatch requires an explicit transaction/,
  );
});

test("withMetricEvaluationBatch caps a looser authorized-transaction timeout", async () => {
  const { client, commands } = mockClient();

  await withMetricEvaluationBatch(client, async () => {});

  assert.deepEqual(commands.slice(2), [READ_TIMEOUT, [SET_TIMEOUT, ["15000ms"]]]);
});

test("withMetricEvaluationBatch preserves an existing stricter timeout", async () => {
  const { client, commands } = mockClient({ currentTimeoutMs: 1000 });

  await withMetricEvaluationBatch(client, async () => {});

  assert.deepEqual(commands.slice(2), [READ_TIMEOUT, [SET_TIMEOUT, ["1000ms"]]]);
});

test("withMetricEvaluationBatch turns an unlimited timeout into 15 seconds", async () => {
  const { client, commands } = mockClient({ currentTimeoutMs: 0 });

  await withMetricEvaluationBatch(client, async () => {});

  assert.deepEqual(commands.slice(2), [READ_TIMEOUT, [SET_TIMEOUT, ["15000ms"]]]);
});

test("withMetricEvaluationBatch leaves transaction cleanup to the authorized owner", async () => {
  const { client, commands } = mockClient({ failOn: "select evaluate_metric_batch()" });

  await assert.rejects(
    () =>
      withMetricEvaluationBatch(client, (transactionClient) =>
        transactionClient.query("select evaluate_metric_batch()"),
      ),
    /failed: select evaluate_metric_batch\(\)/,
  );

  assert.deepEqual(commands.slice(2), [
    READ_TIMEOUT,
    [SET_TIMEOUT, ["15000ms"]],
    "select evaluate_metric_batch()",
  ]);
  assert.equal(
    commands.some((command) =>
      ["BEGIN", "COMMIT", "begin", "commit", "rollback", "reset all"].includes(command),
    ),
    false,
    "delta must not take ownership of eta's authorized transaction or runtime pool cleanup",
  );
});
