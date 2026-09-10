// #623 — the reconciler's `accounting_work` arms. PURE mock-client unit cells (no DB, no world),
// the convention reconcile-autodraft-settle-unit.test.mjs established for this belt family.
//
// TWO THINGS THIS BELT IS, AND ONLY ONE OF THEM IS A SAFETY NET.
//   §A is the PRIMARY DISPATCHER for a chat-originated Work. chatTurn_v18's `start_journal_work`
//      runs inside a FROZEN file, and a frozen file may not import workflows/registry.ts (it
//      would pull the registry into the frozen import-closure and hash-lock a file that must move
//      on every repoint), so freeze-lint's enqueue-provenance rule leaves that admission path
//      with no legal `start()` call site at all. Without this arm a chat-admitted Work sits
//      `queued` forever — which is why its own grace is short and separately tunable.
//   §B is the ordinary crash-recovery net: a run that died holding a claimed task must not leave
//      the Work `running` for ever.
//
// C34.1 — "inspect current result aggregation and test simultaneous expiry categories with
// distinct counters". A sweep that loses one run to a dead engine AND expires one parked Work in
// the same cycle must report those as TWO different facts. One number that could mean either is
// exactly the aggregation defect that obligation names, so the counters are separate and a cell
// drives both categories in ONE sweep.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { reconcileAccountingWorkTasks, settleWorkTerminal, terminalForWork } from "../lib/reconciler-work.mjs";

/** A stateful scripted mock pg client for reconcileAccountingWorkTasks.
 *
 *  `queued`  — [{ id }] rows §A selects (queued + unbound past grace).
 *  `open`    — [{ id, status }] rows §B selects (running/awaiting_input + bound).
 *  `settle`  — optional (taskId) => void, to make one settle THROW. */
function mockWorkClient({ queued = [], open = [], settle } = {}) {
  const calls = { queuedSelections: [], openSelections: [], settles: [] };
  const live = new Map(open.map((t) => [t.id, { id: t.id, status: t.status }]));
  const client = {
    calls,
    live,
    query: async (sql, params) => {
      const s = String(sql);
      if (/kind = 'accounting_work'/.test(s) && /status = 'queued'/.test(s)) {
        calls.queuedSelections.push(queued.map((q) => q.id));
        return { rows: queued.map((q) => ({ id: q.id })), rowCount: queued.length };
      }
      if (/kind = 'accounting_work'/.test(s) && /status in \('running','awaiting_input'\)/.test(s)) {
        const rows = [...live.values()].map((t) => ({ id: t.id, status: t.status, workflow_run_id: `wf-${t.id}` }));
        calls.openSelections.push(rows.map((r) => r.id));
        return { rows, rowCount: rows.length };
      }
      if (/clara\.settle_work_run/.test(s)) {
        const [taskId, outcome, errorCode, error] = params;
        if (typeof settle === "function") settle(taskId);
        calls.settles.push({ taskId, outcome, errorCode, error: error == null ? null : JSON.parse(error) });
        live.delete(taskId); // a settled task leaves the open population
        return { rows: [{ r: { replayed: false } }], rowCount: 1 };
      }
      throw new Error(`mockWorkClient: unexpected statement ${s}`);
    },
  };
  return client;
}

const engineStatus = (map) => (runId) => ({
  get status() {
    const taskId = String(runId).replace(/^wf-/, "");
    const value = map[taskId];
    if (value === "lost") return Promise.reject(Object.assign(new Error("run not found"), { code: "RUN_NOT_FOUND" }));
    return Promise.resolve(value);
  },
  cancel: async () => {},
});

test("623.reconcile: an un-wired belt is a clean no-op, never a crash", async () => {
  const client = mockWorkClient({ queued: [{ id: "t1" }] });
  const out = await reconcileAccountingWorkTasks(client, {});
  assert.deepEqual(out, {
    workReenqueued: 0,
    workSettledFailed: 0,
    workSettledExpired: 0,
    workSettledCancelled: 0,
    workSettleFailed: 0,
  });
  assert.equal(client.calls.queuedSelections.length, 0, "an unwired belt does not even query");
});

test("623.reconcile: §A re-enqueues every queued+unbound Work through the injected dispatcher", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const client = mockWorkClient({ queued: ids.map((id) => ({ id })) });
  const enqueued = [];
  const out = await reconcileAccountingWorkTasks(client, { enqueueClaraWork: async (id) => enqueued.push(id) });
  assert.deepEqual(enqueued, ids, "every stuck Work is dispatched");
  assert.equal(out.workReenqueued, 3);
});

test("623.reconcile: §A isolates per task — one un-enqueueable Work never blocks the rest", async () => {
  const ids = ["a", "b", "c"];
  const client = mockWorkClient({ queued: ids.map((id) => ({ id })) });
  const enqueued = [];
  const logged = [];
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async (id) => {
      if (id === "b") throw new Error("engine refused");
      enqueued.push(id);
    },
    log: (m) => logged.push(m),
  });
  assert.deepEqual(enqueued, ["a", "c"], "the failure costs ONE Work this cycle, not the sweep");
  assert.equal(out.workReenqueued, 2, "and the counter reports what actually happened");
  assert.equal(logged.length, 1);
  assert.match(logged[0], /accounting-work re-enqueue failed task=b/);
});

test("623.reconcile: terminalForWork is matrix-aware and refuses to invent a legal transition", () => {
  // running: a terminal engine run means the run died before settling — the Work produced nothing.
  assert.deepEqual(terminalForWork("running", "lost"), {
    outcome: "failed",
    errorCode: "internal",
    error: { code: "engine_lost", reason: "engine_lost", message: "The run executing this Work is gone. Nothing was posted.", recoverable: true },
  });
  assert.equal(terminalForWork("running", "failed").outcome, "failed");
  assert.equal(terminalForWork("running", "completed").error.code, "no_effect", "a finished run that settled nothing produced nothing");
  assert.equal(terminalForWork("running", "cancelled"), null, "the cancel path owns a cancel — this belt does not race it");

  // awaiting_input: expired | cancelled ONLY. A parked Work can never go straight to failed.
  assert.equal(terminalForWork("awaiting_input", "lost").outcome, "expired");
  assert.equal(terminalForWork("awaiting_input", "failed").outcome, "expired");
  assert.equal(terminalForWork("awaiting_input", "cancelled").outcome, "cancelled");
  assert.equal(terminalForWork("awaiting_input", "completed"), null, "a finished run settles its own Work");

  assert.equal(terminalForWork("queued", "failed"), null);
  assert.equal(terminalForWork("completed", "failed"), null);

  // Every terminal this belt drives leaves a RECOVERABLE Work — a human's Retry can still work.
  for (const [status, engine] of [["running", "lost"], ["running", "failed"], ["running", "completed"], ["awaiting_input", "lost"], ["awaiting_input", "cancelled"]]) {
    assert.equal(terminalForWork(status, engine).error.recoverable, true, `${status}/${engine} stays recoverable`);
  }
});

test("623.reconcile: simultaneous expiry categories keep DISTINCT counters (C34.1)", async () => {
  const client = mockWorkClient({
    open: [
      { id: "lost-run", status: "running" },
      { id: "dead-run", status: "running" },
      { id: "parked-gone", status: "awaiting_input" },
      { id: "parked-cancelled", status: "awaiting_input" },
      { id: "still-flying", status: "running" },
    ],
  });
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async () => {},
    getRun: engineStatus({
      "lost-run": "lost",
      "dead-run": "failed",
      "parked-gone": "lost",
      "parked-cancelled": "cancelled",
      "still-flying": "running",
    }),
  });

  // THREE categories in ONE sweep, and each one is its own number.
  assert.equal(out.workSettledFailed, 2, "two runs died holding a claimed task");
  assert.equal(out.workSettledExpired, 1, "one parked Work can no longer be answered");
  assert.equal(out.workSettledCancelled, 1, "one parked Work was cancelled");
  assert.equal(out.workSettleFailed, 0);
  assert.equal(out.workReenqueued, 0);

  const byTask = Object.fromEntries(client.calls.settles.map((s) => [s.taskId, s]));
  assert.equal(byTask["lost-run"].outcome, "failed");
  assert.equal(byTask["lost-run"].errorCode, "internal");
  assert.equal(byTask["parked-gone"].outcome, "expired");
  assert.equal(byTask["parked-gone"].errorCode, null);
  assert.equal(byTask["parked-cancelled"].outcome, "cancelled");
  assert.equal(Object.prototype.hasOwnProperty.call(byTask, "still-flying"), false, "an in-flight run is left alone");
});

test("623.reconcile: §B isolates a failing settle and COUNTS it rather than only logging it", async () => {
  const client = mockWorkClient({
    open: [
      { id: "refuses", status: "running" },
      { id: "settles", status: "running" },
    ],
    settle: (taskId) => {
      if (taskId === "refuses") throw Object.assign(new Error("the database refused this settle"), { code: "CLR13" });
    },
  });
  const logged = [];
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async () => {},
    getRun: engineStatus({ refuses: "failed", settles: "failed" }),
    log: (m) => logged.push(m),
  });
  assert.equal(out.workSettledFailed, 1, "the healthy task still settled");
  assert.equal(out.workSettleFailed, 1, "and the refusal is a COUNTED fact, not a log line one grep away from invisible");
  assert.match(logged.join("\n"), /accounting-work settle failed task=refuses/);
});

test("623.reconcile: a status probe that errors for a non-missing reason leaves the task alone", async () => {
  const client = mockWorkClient({ open: [{ id: "flaky", status: "running" }] });
  const logged = [];
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async () => {},
    getRun: () => ({
      get status() {
        return Promise.reject(new Error("engine unreachable"));
      },
    }),
    log: (m) => logged.push(m),
  });
  assert.equal(out.workSettledFailed, 0, "an unreachable engine is not evidence a run died");
  assert.equal(client.calls.settles.length, 0);
  assert.match(logged.join("\n"), /status probe failed task=flaky/);
});

test("623.reconcile: settleWorkTerminal calls the WORK verb, never settle_chat_turn", async () => {
  const statements = [];
  const client = {
    query: async (sql, params) => {
      statements.push({ sql: String(sql), params });
      return { rows: [{ r: { replayed: false } }], rowCount: 1 };
    },
  };
  await settleWorkTerminal(client, "t", "cancelled", null, { code: "cancelled", reason: "cancelled", message: "m", recoverable: true });
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /clara\.settle_work_run/);
  assert.doesNotMatch(statements[0].sql, /settle_chat_turn/, "settle_chat_turn raises CLR10 for any kind but chat_turn");
  assert.doesNotMatch(statements[0].sql, /settle_autodraft_task/);
  assert.equal(statements[0].params[1], "cancelled");
  assert.equal(JSON.parse(statements[0].params[3]).recoverable, true);
});

test("623.reconcile: the sweep's cancel dispatch routes an accounting_work task to the WORK verb", async () => {
  // reconciler.mjs's section B is the ONE cancel query, dispatching by kind. A regression here is
  // the 2026-07-31 Section-I zombie's exact shape: settle_chat_turn raises CLR10 for a foreign
  // kind, the raise escapes, and every belt behind it starves.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../lib/reconciler.mjs", import.meta.url), "utf8");
  const dispatch = /const cancels = await client\.query\([\s\S]*?out\.cancelled \+= 1;/.exec(src)?.[0];
  assert.ok(dispatch, "the cancel dispatch is present");
  assert.match(dispatch, /t\.kind === "accounting_work"/, "accounting_work has its own arm");
  const arm = /t\.kind === "accounting_work"\)\s*\{[\s\S]*?\}\s*else \{/.exec(dispatch)?.[0];
  assert.ok(arm, "the arm has a body");
  assert.match(arm, /settleWorkTerminal\(/, "and it settles through the Work verb");
  assert.doesNotMatch(arm, /settleTaskTerminal\(/);
});
