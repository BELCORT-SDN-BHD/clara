// The wake-intent drain (contract §4.4 / §3.1–3.4). Barrier-free correctness:
// a pending intent projects a held task + held outbox row and flips consumed,
// idempotently and exactly-once. Runs against clara_rt_test (0006 applied).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { drainWakeIntents, drainCycle } from "../lib/drain.mjs";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent — migrate clara_rt_test first";

after(async () => {
  await rig.endPool();
});

test("drain: a pending wake intent projects held task + outbox + consumes it", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("drain1");
  const { intentId } = await rig.makeConsumableIntent({ ownerSub: owner, client });

  const res = await rig.asRuntime((c) => drainWakeIntents(c, { onlyFirm: firm }));
  assert.equal(res.drained, 1, "one intent drained");
  assert.equal(res.tasks, 1, "one held task projected");
  assert.equal(res.outbox, 1, "one held outbox row projected");

  const task = await rig.readTaskForIntent(intentId);
  assert.ok(task, "a task exists for the intent");
  assert.equal(task.kind, "wake");
  assert.equal(task.status, "held");
  assert.equal(task.firm_id, firm, "firm derived from intent->event");

  const outbox = await rig.readOutboxForIntent(intentId);
  assert.ok(outbox, "an outbox row exists");
  assert.equal(outbox.status, "held");
  assert.equal(outbox.condition, "background_review", "condition = the intent's decision (derived)");

  const intent = await rig.readIntent(intentId);
  assert.equal(intent.status, "consumed", "intent flipped pending->consumed");
  assert.equal(intent.consumed_by, "router", "consumed_by = the router (text)");
  assert.ok(intent.consumed_at, "consumed_at derived");
});

test("drain: replay is idempotent (ON CONFLICT DO NOTHING — exactly one task/outbox)", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("drain2");
  const { intentId } = await rig.makeConsumableIntent({ ownerSub: owner, client });

  await rig.asRuntime((c) => drainWakeIntents(c, { onlyFirm: firm }));
  // A second drain sees no pending intent (already consumed) -> zero work.
  const again = await rig.asRuntime((c) => drainWakeIntents(c, { onlyFirm: firm }));
  assert.equal(again.drained, 0, "nothing left to drain");

  const tasks = await rig.rootQuery("select count(*)::int n from clara.agent_tasks where origin_intent_id=$1", [intentId]);
  assert.equal(tasks.rows[0].n, 1, "exactly one task for the intent (no duplicate)");
  const outbox = await rig.rootQuery("select count(*)::int n from clara.wakes_outbox where intent_id=$1", [intentId]);
  assert.equal(outbox.rows[0].n, 1, "exactly one outbox row for the intent");
});

test("drain: many intents drain exactly-once via drainCycle", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("drain3");
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push((await rig.makeConsumableIntent({ ownerSub: owner, client })).intentId);

  const res = await rig.asRuntime((c) => drainCycle(c, { onlyFirm: firm, batchSize: 3 }));
  assert.equal(res.drained, 7, "all seven intents drained");

  for (const id of ids) {
    assert.equal((await rig.readIntent(id)).status, "consumed", `intent ${id} consumed`);
    assert.ok(await rig.readTaskForIntent(id), `intent ${id} has a task`);
  }
  const total = await rig.rootQuery("select count(*)::int n from clara.agent_tasks where firm_id=$1 and kind='wake'", [firm]);
  assert.equal(total.rows[0].n, 7, "exactly seven wake tasks (no dupes)");
});
