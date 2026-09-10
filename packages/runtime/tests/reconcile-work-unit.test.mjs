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

import {
  cancelSettleForWork,
  committedWorkResult,
  reconcileAccountingWorkTasks,
  settleWorkTerminal,
  terminalForWork,
  workResultForTask,
} from "../lib/reconciler-work.mjs";

/** A stateful scripted mock pg client for reconcileAccountingWorkTasks.
 *
 *  `queued`  — [{ id }] rows §A selects (queued + unbound past grace).
 *  `open`    — [{ id, status }] rows §B selects (running/awaiting_input + bound).
 *  `results` — { [taskId]: <clara.accounting_work.result jsonb> }, what the books say this Work
 *              already recorded. Absent = no result at all, which is the ordinary case.
 *  `settle`  — optional (taskId) => void, to make one settle THROW.
 *  `resultRead` — optional (taskId) => void, to make the BOOKS READ throw. */
function mockWorkClient({ queued = [], open = [], results = {}, settle, resultRead } = {}) {
  const calls = { queuedSelections: [], openSelections: [], settles: [], resultReads: [] };
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
      if (/join clara\.accounting_work w on w\.id = t\.work_id/.test(s)) {
        const taskId = params[0];
        calls.resultReads.push(taskId);
        if (typeof resultRead === "function") resultRead(taskId);
        return { rows: [{ result: results[taskId] ?? null }], rowCount: 1 };
      }
      if (/clara\.settle_work_run/.test(s)) {
        const [taskId, outcome, errorCode, error, result] = params;
        if (typeof settle === "function") settle(taskId);
        calls.settles.push({
          taskId,
          outcome,
          errorCode,
          error: error == null ? null : JSON.parse(error),
          result: result == null ? null : JSON.parse(result),
        });
        live.delete(taskId); // a settled task leaves the open population
        return { rows: [{ r: { replayed: false } }], rowCount: 1 };
      }
      throw new Error(`mockWorkClient: unexpected statement ${s}`);
    },
  };
  return client;
}

/** A `clara.accounting_work.result` that names a posted entry — the shape a completed
 *  `wake_record_journal_entry` leaves behind. */
const POSTED = {
  entry_id: "55555555-5555-4555-8555-555555555555",
  receipt_id: "66666666-6666-4666-8666-666666666666",
  posted_at: "2026-09-10T02:00:00.000Z",
};

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
    workSettledCompleted: 0,
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
    result: null,
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

// ==============================================================================================
// R1 — THE BOOKS OUTRANK THE ENGINE. A run that committed an entry and then died must never be
// settled with "Nothing was posted." written over a posted journal entry.
// ==============================================================================================

test("623.reconcile: committedWorkResult counts an entry, and only an entry, as evidence", () => {
  assert.equal(committedWorkResult(null), null);
  assert.equal(committedWorkResult(undefined), null);
  assert.equal(committedWorkResult("posted"), null, "a string is not a result object");
  assert.equal(committedWorkResult([{ entry_id: "e" }]), null, "nor is an array");
  assert.equal(committedWorkResult({}), null, "an empty result names no entry");
  assert.equal(
    committedWorkResult({ budget: { segments: 1 }, confirmed: false }),
    null,
    "a result that describes a RUN and no entry is not evidence of a posting",
  );
  assert.equal(committedWorkResult({ entry_id: "" }), null, "a blank id is not an id");
  assert.equal(committedWorkResult({ entry_id: "   " }), null);
  assert.equal(committedWorkResult({ entry_id: 42 }), null, "and it must be a string");
  assert.deepEqual(committedWorkResult(POSTED), POSTED, "an entry id IS the evidence");
});

test("623.reconcile: a Work that already posted settles COMPLETED, whatever the engine says", () => {
  for (const [status, engine] of [
    ["running", "lost"],
    ["running", "failed"],
    ["running", "completed"],
    ["running", "cancelled"],
    ["awaiting_input", "lost"],
    ["awaiting_input", "failed"],
    ["awaiting_input", "cancelled"],
  ]) {
    assert.deepEqual(
      terminalForWork(status, engine, POSTED),
      { outcome: "completed", errorCode: null, error: null, result: POSTED },
      `${status}/${engine} over a committed receipt is completed`,
    );
  }
  // The evidence still has to BE evidence: a result with no entry id changes nothing.
  assert.equal(terminalForWork("running", "failed", { budget: {} }).outcome, "failed");
  assert.equal(terminalForWork("running", "failed", null).error.code, "run_failed");
  // And a status this belt does not own stays untouched even with a receipt.
  assert.equal(terminalForWork("queued", "failed", POSTED), null);
  assert.equal(terminalForWork("completed", "failed", POSTED), null);
});

test("623.reconcile: §B settles a posted-then-dead run COMPLETED and carries the entry as its result", async () => {
  const client = mockWorkClient({
    open: [
      { id: "posted-then-died", status: "running" },
      { id: "posted-then-parked", status: "awaiting_input" },
      { id: "posted-nothing", status: "running" },
    ],
    results: { "posted-then-died": POSTED, "posted-then-parked": POSTED },
  });
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async () => {},
    getRun: engineStatus({ "posted-then-died": "lost", "posted-then-parked": "lost", "posted-nothing": "lost" }),
  });

  assert.equal(out.workSettledCompleted, 2, "two Works held an entry — a dead run cannot un-post it");
  assert.equal(out.workSettledFailed, 1, "and the one that posted nothing is still an honest failure");
  assert.equal(out.workSettledExpired, 0, "the parked one is NOT expired: it finished its work before the hook died");

  const byTask = Object.fromEntries(client.calls.settles.map((s) => [s.taskId, s]));
  assert.equal(byTask["posted-then-died"].outcome, "completed");
  assert.equal(byTask["posted-then-died"].errorCode, null);
  assert.equal(byTask["posted-then-died"].error, null, "and NOT 'Nothing was posted.'");
  assert.deepEqual(byTask["posted-then-died"].result, POSTED, "the entry rides to p_result so the Work detail can show it");
  assert.equal(byTask["posted-then-parked"].outcome, "completed");
  assert.equal(byTask["posted-nothing"].outcome, "failed");
  assert.match(byTask["posted-nothing"].error.message, /Nothing was posted/);
});

test("623.reconcile: a books read that FAILS leaves the task open rather than guessing", async () => {
  const client = mockWorkClient({
    open: [{ id: "unreadable", status: "running" }],
    resultRead: () => {
      throw Object.assign(new Error("connection terminated"), { code: "08006" });
    },
  });
  const logged = [];
  const out = await reconcileAccountingWorkTasks(client, {
    enqueueClaraWork: async () => {},
    getRun: engineStatus({ unreadable: "failed" }),
    log: (m) => logged.push(m),
  });
  assert.equal(client.calls.settles.length, 0, "not knowing whether an entry exists is not a licence to say none does");
  assert.equal(out.workSettledFailed, 0);
  assert.match(logged.join("\n"), /result read failed task=unreadable/);
});

test("623.reconcile: cancelSettleForWork keeps a posted entry and cancels only an empty Work", () => {
  const cancelled = cancelSettleForWork(null);
  assert.equal(cancelled.outcome, "cancelled");
  assert.equal(cancelled.result, null);
  assert.match(cancelled.error.message, /Nothing was posted/);
  assert.equal(cancelled.error.recoverable, true);

  const kept = cancelSettleForWork(POSTED);
  assert.deepEqual(kept, { outcome: "completed", errorCode: null, error: null, result: POSTED });
});

test("623.reconcile: workResultForTask reads the Work through its task and reduces it", async () => {
  const statements = [];
  const client = {
    query: async (sql, params) => {
      statements.push({ sql: String(sql), params });
      return { rows: [{ result: POSTED }], rowCount: 1 };
    },
  };
  assert.deepEqual(await workResultForTask(client, "t-1"), POSTED);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /clara\.accounting_work/);
  assert.match(statements[0].sql, /t\.kind = 'accounting_work'/, "the read is scoped to the one kind that has a Work");
  assert.deepEqual(statements[0].params, ["t-1"]);

  const empty = { query: async () => ({ rows: [], rowCount: 0 }) };
  assert.equal(await workResultForTask(empty, "t-2"), null, "no row is no evidence");
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
  assert.equal(statements[0].params[4], null, "a cancel with nothing to show carries no result");

  const withResult = [];
  await settleWorkTerminal(
    { query: async (sql, params) => (withResult.push({ sql: String(sql), params }), { rows: [{ r: {} }], rowCount: 1 }) },
    "t",
    "completed",
    null,
    null,
    POSTED,
  );
  assert.equal(JSON.parse(withResult[0].params[4]).entry_id, POSTED.entry_id, "and a receipt-aware completed carries the entry");
});

// ==============================================================================================
// R2 — THE ONE CANCEL DISPATCH. Both cancel paths in this package (the reconciler sweep and the
// control listener) settle through `settleCancelledByKind`, so a kind cannot be known to one and
// unknown to the other. A regression is the 2026-07-31 Section-I zombie's exact shape:
// settle_chat_turn raises CLR10 for a foreign kind, the raise escapes, and every belt behind it
// starves — in the listener's case taking interruption delivery and the `control` heartbeat too.
// ==============================================================================================

/** A mock client that records statements and answers the two reads a cancel settle can make. */
function mockCancelClient({ result = null } = {}) {
  const statements = [];
  return {
    statements,
    query: async (sql, params) => {
      const s = String(sql);
      statements.push({ sql: s, params });
      if (/join clara\.accounting_work w on w\.id = t\.work_id/.test(s)) return { rows: [{ result }], rowCount: 1 };
      return { rows: [{ r: { replayed: false } }], rowCount: 1 };
    },
  };
}

test("623.reconcile: the shared cancel dispatch routes every kind to ITS OWN settle verb", async () => {
  const { settleCancelledByKind } = await import("../lib/reconciler.mjs");

  const work = mockCancelClient();
  await settleCancelledByKind(work, { id: "w1", kind: "accounting_work" });
  const workSettle = work.statements.find((s) => /settle_work_run/.test(s.sql));
  assert.ok(workSettle, "an accounting_work cancel settles through clara.settle_work_run");
  assert.equal(workSettle.params[1], "cancelled");
  assert.match(JSON.parse(workSettle.params[3]).message, /Nothing was posted/);
  assert.equal(work.statements.some((s) => /settle_chat_turn/.test(s.sql)), false, "and never through settle_chat_turn");

  const chat = mockCancelClient();
  await settleCancelledByKind(chat, { id: "c1", kind: "chat_turn" });
  assert.match(chat.statements[0].sql, /settle_chat_turn/, "a chat turn still settles the chat way");

  for (const kind of ["wake", "close_prep"]) {
    const wake = mockCancelClient();
    await settleCancelledByKind(wake, { id: `k-${kind}`, kind });
    assert.match(wake.statements[0].sql, /_settle_wake_task/, `${kind} settles through the wake verb`);
    assert.doesNotMatch(wake.statements[0].sql, /settle_chat_turn/);
  }

  const auto = mockCancelClient();
  await settleCancelledByKind(auto, { id: "a1", kind: "autodraft" });
  assert.match(auto.statements[0].sql, /settle_autodraft_task/, "an autodraft settles through its own CoR verb");
});

test("623.reconcile: cancelling a Work that ALREADY POSTED completes it instead (ARCHITECTURE §6)", async () => {
  const { settleCancelledByKind } = await import("../lib/reconciler.mjs");
  const client = mockCancelClient({ result: POSTED });
  await settleCancelledByKind(client, { id: "w-posted", kind: "accounting_work" });
  const settle = client.statements.find((s) => /settle_work_run/.test(s.sql));
  assert.equal(settle.params[1], "completed", "a cancel does not reverse a posted entry");
  assert.equal(settle.params[3], null, "and it writes no 'Nothing was posted' error over one that was");
  assert.deepEqual(JSON.parse(settle.params[4]), POSTED);
});

test("623.control: the listener dispatches by kind and one bad row cannot abort the cycle", async () => {
  const { processCancellations } = await import("../lib/control.mjs");
  const rows = [
    { id: "work-1", kind: "accounting_work", workflow_run_id: "wf-work-1" },
    { id: "chat-1", kind: "chat_turn", workflow_run_id: "wf-chat-1" },
    { id: "wake-1", kind: "wake", workflow_run_id: null },
  ];
  const statements = [];
  const client = {
    query: async (sql, params) => {
      const s = String(sql);
      statements.push({ sql: s, params });
      if (/status = 'cancel_requested'/.test(s)) return { rows, rowCount: rows.length };
      if (/join clara\.accounting_work w on w\.id = t\.work_id/.test(s)) return { rows: [{ result: null }], rowCount: 1 };
      if (/settle_chat_turn/.test(s)) throw Object.assign(new Error("the database refused this settle"), { code: "CLR13" });
      return { rows: [{ r: { replayed: false } }], rowCount: 1 };
    },
  };
  const aborted = [];
  const logged = [];
  const out = await processCancellations(client, { cancelRun: async (r) => aborted.push(r), log: (m) => logged.push(m) });

  // BEFORE this fix every row above went to settle_chat_turn, which raises CLR10 for any kind but
  // chat_turn — and that raise escaped the whole control cycle, taking interruption delivery and
  // the `control` heartbeat with it on every poll.
  const verbs = statements.filter((s) => !/cancel_requested/.test(s.sql)).map((s) => s.sql);
  assert.equal(verbs.filter((s) => /settle_work_run/.test(s)).length, 1, "the Work settles through clara.settle_work_run");
  assert.equal(verbs.filter((s) => /_settle_wake_task/.test(s)).length, 1, "the wake settles through the wake verb");
  assert.equal(verbs.filter((s) => /settle_chat_turn/.test(s)).length, 1, "and ONLY the chat turn reaches settle_chat_turn");

  assert.deepEqual(aborted, ["wf-work-1", "wf-chat-1"], "every bound run is still aborted first");
  assert.equal(out.settled, 2, "the two settleable rows settled");
  assert.equal(out.settleFailed, 1, "and the refusal is a COUNTED fact, not a swallowed one");
  assert.match(logged.join("\n"), /cancel-settle failed task=chat-1 kind=chat_turn/);
});

test("623.reconcile: neither cancel select names a relation migration 0178 introduces", async () => {
  // A statement naming a missing relation fails at PARSE time, so a join here would have made a
  // runtime image running ahead of 0178 unable to cancel ANY kind — chat turns included. The
  // Work's own row is read from INSIDE the accounting arm, which no other kind reaches.
  const { readFile } = await import("node:fs/promises");
  for (const file of ["../lib/reconciler.mjs", "../lib/control.mjs"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    const select = /select[^;]*?status = 'cancel_requested'[\s\S]*?`/.exec(src)?.[0];
    assert.ok(select, `${file} carries a cancel_requested select`);
    assert.match(select, /kind/, `${file}'s cancel select reads the kind it must dispatch on`);
    assert.doesNotMatch(select, /accounting_work/, `${file}'s cancel select stays parseable pre-0178`);
  }
});
