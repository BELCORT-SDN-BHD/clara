// Wave A2.1 — the sst-watch consumer (lib/sst-watch.mjs), PURE (mocked client). Proves the
// PLAIN group-role call to evaluate_sst_watch (NO login-direct dance), the op-key shape
// 'sstwatch:<client>:<seq>', that a returned {status:'failed'} is LOGGED + CHECKPOINTED
// (never dead-lettered / retried — the daily sweep re-covers it), that a NULL-client
// entry.approved is skipped (warn + checkpoint advances), and that a GENUINE throw
// dead-letters. No live DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySstWatchEffects,
  runSstWatchCycle,
  sstWatchRedrive,
  CONSUMERS,
  SST_WATCH_CONSUMER,
  SST_WATCH_EVENT_TYPE,
} from "../lib/sst-watch.mjs";

// ---------------------------------------------------------------------------
// The effect — plain group call, exact fn + param order + op-key.
// ---------------------------------------------------------------------------
function effectClient(onEval = () => ({ client_id: "c", status: "ok", changed: false })) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/evaluate_sst_watch/.test(sql)) return Promise.resolve({ rows: [{ result: onEval(params) }] });
      return Promise.resolve({ rows: [{}] });
    },
  };
}

test("applySstWatchEffects calls evaluate_sst_watch PLAIN (no reset role) with op-key sstwatch:<client>:<seq>", async () => {
  const client = effectClient(() => ({ client_id: "c1", status: "ok", changed: true }));
  const receipt = await applySstWatchEffects(client, { clientId: "c1", seq: 42 });
  const call = client.queries.find((q) => /evaluate_sst_watch/.test(q.sql));
  assert.ok(call, "evaluate_sst_watch was invoked");
  assert.match(call.sql, /clara\.evaluate_sst_watch\(p_client => \$1, p_op_key => \$2\)/);
  assert.equal(call.params[0], "c1", "param 1 = client id");
  assert.equal(call.params[1], "sstwatch:c1:42", "param 2 = the sstwatch:<client>:<seq> op-key");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — NO login-direct dance");
  assert.deepEqual(receipt, { client_id: "c1", status: "ok", changed: true });
});

test("the op-key is stable per (client, seq): a re-delivery dedupes; a fresh approval (new seq) re-attempts", async () => {
  const keyFor = async (clientId, seq) => {
    const client = effectClient();
    await applySstWatchEffects(client, { clientId, seq });
    return client.queries.find((q) => /evaluate_sst_watch/.test(q.sql)).params[1];
  };
  assert.equal(await keyFor("c", 5), await keyFor("c", 5));
  assert.notEqual(await keyFor("c", 5), await keyFor("c", 6));
});

test("consumer identity constants + the registry entry are pinned (group-runtime redrive)", () => {
  assert.equal(SST_WATCH_CONSUMER, "sst_watch");
  assert.equal(SST_WATCH_EVENT_TYPE, "entry.approved");
  assert.equal(CONSUMERS.sst_watch.name, "sst_watch");
  assert.equal(CONSUMERS.sst_watch.identity, "runtime-role", "sst_watch is a plain group call — NOT runtime-login");
  assert.equal(typeof CONSUMERS.sst_watch.redrive, "function");
});

// ---------------------------------------------------------------------------
// The cycle — a scripted client covering discovery/read/effect/checkpoint/dead-letter.
// ---------------------------------------------------------------------------
function cycleClient({ firm = "F1", events = [], evaluate = () => ({ status: "ok", changed: false }) } = {}) {
  const state = { evaluateCalls: [], checkpoints: [], deadLetters: [], logs: [] };
  let served = false;
  const client = {
    state,
    query(sql, params) {
      const s = String(sql);
      if (/from clara\.firm_event_seq/.test(s)) return Promise.resolve({ rows: [{ firm_id: firm, head_seq: 9999, last_seq: 0 }], rowCount: 1 });
      if (/select seq, id, event_type, client_id\s+from clara\.domain_events/.test(s)) {
        if (served) return Promise.resolve({ rows: [], rowCount: 0 });
        served = true;
        return Promise.resolve({ rows: events, rowCount: events.length });
      }
      if (/evaluate_sst_watch/.test(s)) {
        state.evaluateCalls.push(params);
        return Promise.resolve({ rows: [{ result: evaluate(params) }] });
      }
      if (/insert into clara\.relay_checkpoints/.test(s)) {
        state.checkpoints.push({ consumer: params[0], firmId: params[1], seq: params[2] });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/insert into clara\.relay_dead_letters/.test(s)) {
        state.deadLetters.push(params);
        return Promise.resolve({ rows: [{ attempt_count: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [{}], rowCount: 0 }); // begin/commit/rollback/etc
    },
  };
  return client;
}

test("a returned {status:'failed'} is LOGGED and CHECKPOINTED — never dead-lettered, never retried", async () => {
  const events = [{ seq: 5, id: "e5", event_type: "entry.approved", client_id: "c1" }];
  const client = cycleClient({ events, evaluate: () => ({ client_id: "c1", status: "failed", error: "boom", changed: false }) });
  const logs = [];
  await runSstWatchCycle(client, { onlyFirm: "F1", log: (m) => logs.push(m) });
  assert.equal(client.state.evaluateCalls.length, 1, "the evaluator was invoked once");
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [5], "the checkpoint advanced past the failed event");
  assert.equal(client.state.deadLetters.length, 0, "a failed receipt is NOT a dead-letter (it is a success for checkpointing)");
  assert.ok(logs.some((m) => /\[sst_watch\].*failed.*boom/.test(m)), "the failure was logged with its error");
});

test("a NULL-client entry.approved is skipped (warn) and the checkpoint still advances (coalesced)", async () => {
  const events = [{ seq: 7, id: "e7", event_type: "entry.approved", client_id: null }];
  const client = cycleClient({ events });
  const logs = [];
  await runSstWatchCycle(client, { onlyFirm: "F1", log: (m) => logs.push(m) });
  assert.equal(client.state.evaluateCalls.length, 0, "no evaluator call for a firm-level (NULL client) approval");
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [7], "the checkpoint still advances past it");
  assert.ok(logs.some((m) => /NULL client_id/.test(m)), "the skip was warned");
});

test("a GENUINE throw from the evaluator dead-letters (rollback + own-txn dead-letter, no checkpoint)", async () => {
  const events = [{ seq: 9, id: "e9", event_type: "entry.approved", client_id: "c1" }];
  const client = cycleClient({
    events,
    evaluate: () => {
      throw new Error("connection reset");
    },
  });
  await runSstWatchCycle(client, { onlyFirm: "F1", log: () => {} });
  assert.equal(client.state.deadLetters.length, 1, "a thrown error dead-letters the event");
  assert.equal(client.state.deadLetters[0][0], "sst_watch", "the dead-letter is consumer='sst_watch'");
  assert.ok(!client.state.checkpoints.some((c) => c.seq === 9), "a poison event does not checkpoint (retry next cycle)");
});

test("a non-target event coalesces into a single checkpoint advance (no evaluator call)", async () => {
  const events = [{ seq: 3, id: "e3", event_type: "entry.drafted", client_id: "c1" }];
  const client = cycleClient({ events });
  await runSstWatchCycle(client, { onlyFirm: "F1", log: () => {} });
  assert.equal(client.state.evaluateCalls.length, 0, "entry.drafted is not a target — no evaluate");
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [3], "coalesced checkpoint advance");
});

test("sstWatchRedrive refuses when there is no sst_watch dead-letter", async () => {
  const client = {
    query(sql) {
      if (/from clara\.relay_dead_letters/.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [{}], rowCount: 0 });
    },
  };
  await assert.rejects(() => sstWatchRedrive(client, "evt-x"), /no dead-letter for consumer='sst_watch'/);
});
