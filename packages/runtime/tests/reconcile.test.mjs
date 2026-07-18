// The settle-reconciler + sweepers (contract §4.5-4.7). Engine truth is mocked
// (enqueueChatTurn / getRun injected). Covers: queued-without-run re-enqueue,
// clarify expiry, engine-terminal settle, cancel_requested abort+settle, and the
// audited trace prune. No world, no network.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { reconcileTasks, expireClarifies, pruneTraces, heartbeat } from "../lib/reconciler.mjs";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

// Grace passed as a deps option (env-at-import is unreliable — ESM hoists imports).
const NOW_GRACE = "0 seconds";

after(async () => {
  await rig.endPool();
});

const mockRun = (status, sink) => ({ status: Promise.resolve(status), cancel: async () => sink?.push(status) });

/** A getRun that returns a STATEFUL run for `runId`: cancel() flips it terminal, so
 *  the reconciler's orphan re-check (path D) sees it cancelled and does not re-abort. */
function statefulEngine(runId, initial, sink) {
  let st = initial;
  const run = {
    get status() {
      return Promise.resolve(st);
    },
    cancel: async () => {
      st = "cancelled";
      sink?.push(runId);
    },
  };
  return (id) => (id === runId ? run : mockRun("running"));
}

/** A running chat task bound to a fake engine run id. */
async function runningTask(label, runId) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "t" });
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set status='running', workflow_run_id=$2 where id=$1", [task_id, runId]));
  return { task_id, firm };
}

test("reconcile: a queued-without-run task past grace is re-enqueued + bound", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("rec1");
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "t" }); // queued, no run

  const enq = [];
  await rig.asRuntime((c) =>
    reconcileTasks(c, {
      onlyFirm: firm,
      graceInterval: NOW_GRACE,
      enqueueChatTurn: async (id) => {
        enq.push(id);
        return { runId: "wrun_re_" + id.slice(0, 6) };
      },
      getRun: () => mockRun("running"),
    }),
  );
  assert.deepEqual(enq, [task_id], "the stuck task was re-enqueued");
  const t = await rig.readTask(task_id);
  assert.equal(t.status, "running", "task bound running");
  assert.ok(t.workflow_run_id, "run id bound");
});

test("reconcile: a pending clarify past its deadline is expired", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("rec2");
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "t" });
  await rig.driveTask(task_id, ["running", "awaiting_input"]);
  const interId = await rig.insertInterruption({ task: task_id, expiresInDays: -1 }); // already past

  const res = await rig.asRuntime((c) => expireClarifies(c, { onlyFirm: firm }));
  assert.equal(res.expired, 1, "one clarify expired");
  assert.equal((await rig.readInterruption(interId)).status, "expired");
});

test("reconcile: an open task whose engine run COMPLETED is settled completed", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec3", "wrun_done_3");
  await rig.asRuntime((c) =>
    reconcileTasks(c, { onlyFirm: firm, enqueueChatTurn: async () => ({ runId: "x" }), getRun: () => mockRun("completed") }),
  );
  assert.equal((await rig.readTask(task_id)).status, "completed", "settled from engine truth");
});

test("reconcile: an open task whose engine run is LOST is settled failed/engine_lost", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec3b", "wrun_lost");
  const notFound = () => {
    const e = new Error("run wrun_lost not found");
    e.name = "WorkflowRunNotFoundError";
    throw e;
  };
  await rig.asRuntime((c) =>
    reconcileTasks(c, { onlyFirm: firm, enqueueChatTurn: async () => ({ runId: "x" }), getRun: notFound }),
  );
  const t = await rig.readTask(task_id);
  assert.equal(t.status, "failed");
  assert.equal(t.error_code, "engine_lost");
});

test("reconcile: cancel_requested is aborted + settled cancelled", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec4", "wrun_cancel_4");
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set status='cancel_requested' where id=$1", [task_id]));
  const aborted = [];
  await rig.asRuntime((c) =>
    reconcileTasks(c, {
      onlyFirm: firm,
      enqueueChatTurn: async () => ({ runId: "x" }),
      getRun: statefulEngine("wrun_cancel_4", "running", aborted),
    }),
  );
  assert.equal(aborted.length, 1, "engine run aborted exactly once");
  assert.equal((await rig.readTask(task_id)).status, "cancelled", "task settled cancelled");
});

test("reconcile: trace prune deletes spans older than retention + writes a receipt", { skip }, async () => {
  const { task_id } = await runningTask("rec5", "wrun_trace_5");
  const traceId = "trace-rec5-" + randomUUID().slice(0, 8); // unique per run (idempotent re-runs)
  // Insert one old span (100 days) + one fresh — only the old one prunes at 90d.
  await rig.asRuntime((c) =>
    c.query(
      "insert into clara.trace_spans (trace_id, span_id, task_id, name, started_at) values ($1,'s1',$2,'old', now() - interval '100 days'), ($1,'s2',$2,'fresh', now())",
      [traceId, task_id],
    ),
  );
  const before = await rig.rootQuery("select count(*)::int n from clara.trace_prune_log");
  const res = await rig.asRuntime((c) => pruneTraces(c, { retentionDays: 90, batchSize: 100 }));
  assert.ok(res.pruned >= 1, "at least the 100-day span pruned");
  const oldGone = await rig.rootQuery("select count(*)::int n from clara.trace_spans where trace_id=$1 and span_id='s1'", [traceId]);
  assert.equal(oldGone.rows[0].n, 0, "old span deleted");
  const freshKept = await rig.rootQuery("select count(*)::int n from clara.trace_spans where trace_id=$1 and span_id='s2'", [traceId]);
  assert.equal(freshKept.rows[0].n, 1, "fresh span kept");
  const after2 = await rig.rootQuery("select count(*)::int n from clara.trace_prune_log");
  assert.ok(after2.rows[0].n > before.rows[0].n, "an audited prune-log receipt was written");
});

test("reconcile: heartbeat upserts a component beat", { skip }, async () => {
  await rig.asRuntime((c) => heartbeat(c, "test-component"));
  const r = await rig.rootQuery("select beat_at from clara.runtime_heartbeats where component='test-component'");
  assert.equal(r.rowCount, 1, "heartbeat row present");
});
