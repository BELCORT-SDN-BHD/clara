// Wave A2.1 — the facts-gate consumer (lib/facts-gate.mjs), PURE (mocked client). Proves the
// PLAIN group-role re-fire of enqueue_invoice_facts(document) (NO op_key — the fn takes only
// the document), that a terminal-by-design receipt status (skipped_kind / classify_low_confidence
// / ...) is LOGGED verbatim and CHECKPOINTED (never retried by us — the DB owns retry policy),
// and that a GENUINE throw dead-letters. No live DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFactsGateEffects,
  runFactsGateCycle,
  factsGateRedrive,
  CONSUMERS,
  FACTS_GATE_CONSUMER,
  FACTS_GATE_EVENT_TYPE,
} from "../lib/facts-gate.mjs";

function effectClient(onEnqueue = () => ({ document_id: "d1", status: "queued" })) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/enqueue_invoice_facts/.test(sql)) return Promise.resolve({ rows: [{ result: onEnqueue(params) }] });
      return Promise.resolve({ rows: [{}] });
    },
  };
}

test("applyFactsGateEffects calls enqueue_invoice_facts($1) with ONLY the document (no op_key)", async () => {
  const client = effectClient(() => ({ document_id: "d1", status: "skipped_kind" }));
  const receipt = await applyFactsGateEffects(client, { documentId: "d1" });
  const call = client.queries.find((q) => /enqueue_invoice_facts/.test(q.sql));
  assert.ok(call, "enqueue_invoice_facts was invoked");
  assert.match(call.sql, /clara\.enqueue_invoice_facts\(\$1\)/);
  assert.deepEqual(call.params, ["d1"], "the fn takes ONLY the document id — no op_key");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — NO login dance");
  assert.deepEqual(receipt, { document_id: "d1", status: "skipped_kind" });
});

test("consumer identity constants + the registry entry are pinned (group-runtime redrive)", () => {
  assert.equal(FACTS_GATE_CONSUMER, "facts_gate");
  assert.equal(FACTS_GATE_EVENT_TYPE, "document.classified");
  assert.equal(CONSUMERS.facts_gate.name, "facts_gate");
  assert.equal(CONSUMERS.facts_gate.identity, "runtime-role");
  assert.equal(typeof CONSUMERS.facts_gate.redrive, "function");
});

function cycleClient({ firm = "F1", events = [], enqueue = () => ({ document_id: "d", status: "queued" }) } = {}) {
  const state = { enqueueCalls: [], checkpoints: [], deadLetters: [] };
  let served = false;
  return {
    state,
    query(sql, params) {
      const s = String(sql);
      if (/from clara\.firm_event_seq/.test(s)) return Promise.resolve({ rows: [{ firm_id: firm, head_seq: 9999, last_seq: 0 }], rowCount: 1 });
      if (/select seq, id, event_type, document_id\s+from clara\.domain_events/.test(s)) {
        if (served) return Promise.resolve({ rows: [], rowCount: 0 });
        served = true;
        return Promise.resolve({ rows: events, rowCount: events.length });
      }
      if (/enqueue_invoice_facts/.test(s)) {
        state.enqueueCalls.push(params);
        return Promise.resolve({ rows: [{ result: enqueue(params) }] });
      }
      if (/insert into clara\.relay_checkpoints/.test(s)) {
        state.checkpoints.push({ seq: params[2] });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/insert into clara\.relay_dead_letters/.test(s)) {
        state.deadLetters.push(params);
        return Promise.resolve({ rows: [{ attempt_count: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [{}], rowCount: 0 });
    },
  };
}

test("a terminal-by-design receipt (skipped_kind) is LOGGED verbatim + CHECKPOINTED — never retried, never dead-lettered", async () => {
  const events = [{ seq: 5, id: "e5", event_type: "document.classified", document_id: "d1" }];
  const client = cycleClient({ events, enqueue: () => ({ document_id: "d1", status: "skipped_kind" }) });
  const logs = [];
  await runFactsGateCycle(client, { onlyFirm: "F1", log: (m) => logs.push(m) });
  assert.equal(client.state.enqueueCalls.length, 1, "the enqueue re-fired once — never looped");
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [5], "the checkpoint advanced past it");
  assert.equal(client.state.deadLetters.length, 0, "a terminal receipt is not a dead-letter");
  assert.ok(logs.some((m) => /status=skipped_kind/.test(m)), "the status was logged verbatim");
});

test("a classify_low_confidence receipt is also a success for checkpointing (never re-looped)", async () => {
  const events = [{ seq: 6, id: "e6", event_type: "document.classified", document_id: "d2" }];
  const client = cycleClient({ events, enqueue: () => ({ document_id: "d2", status: "classify_low_confidence" }) });
  await runFactsGateCycle(client, { onlyFirm: "F1", log: () => {} });
  assert.equal(client.state.enqueueCalls.length, 1);
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [6]);
  assert.equal(client.state.deadLetters.length, 0);
});

test("a GENUINE throw from enqueue_invoice_facts dead-letters (no checkpoint)", async () => {
  const events = [{ seq: 9, id: "e9", event_type: "document.classified", document_id: "d3" }];
  const client = cycleClient({
    events,
    enqueue: () => {
      throw new Error("undefined function clara.enqueue_invoice_facts");
    },
  });
  await runFactsGateCycle(client, { onlyFirm: "F1", log: () => {} });
  assert.equal(client.state.deadLetters.length, 1, "a thrown error dead-letters");
  assert.equal(client.state.deadLetters[0][0], "facts_gate");
  assert.ok(!client.state.checkpoints.some((c) => c.seq === 9), "a poison event does not checkpoint");
});

test("a non-target event coalesces into a single checkpoint advance (no enqueue)", async () => {
  const events = [{ seq: 3, id: "e3", event_type: "entry.approved", document_id: null }];
  const client = cycleClient({ events });
  await runFactsGateCycle(client, { onlyFirm: "F1", log: () => {} });
  assert.equal(client.state.enqueueCalls.length, 0);
  assert.deepEqual(client.state.checkpoints.map((c) => c.seq), [3]);
});

test("factsGateRedrive refuses when there is no facts_gate dead-letter", async () => {
  const client = {
    query(sql) {
      if (/from clara\.relay_dead_letters/.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [{}], rowCount: 0 });
    },
  };
  await assert.rejects(() => factsGateRedrive(client, "evt-x"), /no dead-letter for consumer='facts_gate'/);
});
