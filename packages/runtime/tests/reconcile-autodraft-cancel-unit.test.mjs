// The leader-cancel fix (Wave C-c ride-along; PROJECTLOG 2026-07-31 acceptance-night
// finding (2)): "the leader cancel path misuses settle_chat_turn for autodraft tasks —
// a cancel_requested autodraft loops the leader cycle (which also starves the document
// reconciler)". PURE mock-client unit test — no DB, no world — proving the JS-level
// dispatch bug is closed: reconcileTasks's section B must route a cancel_requested
// AUTODRAFT task through settle_autodraft_task, never settle_chat_turn, and a settle
// failure for one task must not throw out of the sweep (the same wave-a-autodraft-consumer
// mock-client convention; the DB-level chat_turn behaviour stays covered by the real-DB
// rig test in reconcile.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { reconcileTasks } from "../lib/reconciler.mjs";

/** A scripted mock pg client good enough for reconcileTasks's four sub-queries. Section
 *  A/C/D return no rows (out of scope here); section B (cancel_requested) returns the
 *  ONE scripted task row. settle_chat_turn mirrors the DB's real CLR10 guard
 *  (0006_runtime_core.sql:1021: "settle_chat_turn is for chat turns only" — raised the
 *  instant t.kind <> 'chat_turn') so a regression back to the old unconditional dispatch
 *  is caught here exactly as it would be caught live, without needing a real Postgres. */
function mockCancelClient(taskRow) {
  const calls = { settleAutodraft: [], settleChatTurn: [] };
  return {
    calls,
    query: async (sql, params) => {
      if (sql.includes("status = 'queued' and workflow_run_id is null")) {
        return { rows: [], rowCount: 0 }; // section A: nothing stuck
      }
      if (sql.includes("status = 'cancel_requested'")) {
        return { rows: [taskRow], rowCount: 1 }; // section B: the row under test
      }
      if (sql.includes("status in ('running','awaiting_input')")) {
        return { rows: [], rowCount: 0 }; // section C: nothing open
      }
      if (sql.includes("status = 'cancelled'") && sql.includes("coalesce(cancelled_at")) {
        return { rows: [], rowCount: 0 }; // section D: no orphans
      }
      if (sql.includes("settle_autodraft_task")) {
        calls.settleAutodraft.push(params);
        return { rows: [{}], rowCount: 1 };
      }
      if (sql.includes("settle_chat_turn")) {
        calls.settleChatTurn.push(params);
        if (taskRow.kind !== "chat_turn") {
          const err = new Error("settle_chat_turn is for chat turns only");
          err.code = "CLR10";
          throw err;
        }
        return { rows: [{}], rowCount: 1 };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
}

test("reconcile: a cancel_requested AUTODRAFT task settles via settle_autodraft_task (not settle_chat_turn) and does not loop the sweep", async () => {
  const taskId = randomUUID();
  const client = mockCancelClient({ id: taskId, kind: "autodraft", workflow_run_id: null });
  const log = [];

  let result;
  await assert.doesNotReject(async () => {
    result = await reconcileTasks(client, {
      enqueueChatTurn: async () => ({ runId: "x" }),
      getRun: () => {
        throw new Error("getRun must not be called — this task has no workflow_run_id");
      },
      log: (m) => log.push(m),
    });
  }, "a cancel-settle failure for one task must never throw out of reconcileTasks — that throw IS the two-day zombie (it aborted every sweeper after section B, forever, every leader cycle)");

  assert.equal(client.calls.settleChatTurn.length, 0, "settle_chat_turn must never be dispatched for an autodraft-kind task");
  assert.equal(client.calls.settleAutodraft.length, 1, "settle_autodraft_task is the correct verb for the autodraft lane");
  const [calledTask, calledOutcome, calledTokens, calledEntry, calledRefusal] = client.calls.settleAutodraft[0];
  assert.equal(calledTask, taskId);
  assert.equal(calledOutcome, "failed", "settle_autodraft_task has no 'cancelled' outcome (0036 CHECK: drafted|skipped_lane|noop_existing|failed) — a cancelled autodraft settles 'failed'");
  assert.equal(calledTokens, 0);
  assert.equal(calledEntry, null);
  assert.deepEqual(JSON.parse(calledRefusal), { code: "internal", reason: "cancelled" });
  assert.equal(result.cancelled, 1, "the task counts as handled");
});

test("reconcile: a cancel_requested CHAT_TURN task still settles via settle_chat_turn (dispatch is kind-scoped, not a blanket switch)", async () => {
  const taskId = randomUUID();
  const client = mockCancelClient({ id: taskId, kind: "chat_turn", workflow_run_id: null });

  const result = await reconcileTasks(client, {
    enqueueChatTurn: async () => ({ runId: "x" }),
    getRun: () => {
      throw new Error("getRun must not be called — this task has no workflow_run_id");
    },
    log: () => {},
  });

  assert.equal(client.calls.settleAutodraft.length, 0, "settle_autodraft_task must never be dispatched for a chat_turn-kind task");
  assert.equal(client.calls.settleChatTurn.length, 1, "settle_chat_turn is still the correct verb for the chat_turn lane");
  assert.equal(result.cancelled, 1);
});

// =====================================================================================
// M5 (Codex review) — a cancel() FAILURE was logged-and-ignored, then the task settled
// 'cancelled' UNCONDITIONALLY anyway: a FALSE durable receipt while the run may still be LIVE
// and keep acting under books that now say it stopped. Fix: settle only once the abort is
// CONFIRMED; on a genuine failure, skip settling entirely and leave the row for the next
// sweep. This bug predates Gate G1 but its blast radius widened WITH G1 (the same dispatch
// now also reaches wake/close_prep via _settle_wake_task), so it is fixed and proven here,
// in the SAME mock-client unit-test home its sibling findings already live in.
// =====================================================================================
function mockCancelClientWithRun(taskRow) {
  const calls = { settleWake: [], cancelRun: [] };
  return {
    calls,
    query: async (sql, params) => {
      if (sql.includes("status = 'queued' and workflow_run_id is null")) return { rows: [], rowCount: 0 };
      if (sql.includes("status = 'cancel_requested'")) return { rows: [taskRow], rowCount: 1 };
      if (sql.includes("status in ('running','awaiting_input')")) return { rows: [], rowCount: 0 };
      if (sql.includes("status = 'cancelled'") && sql.includes("coalesce(cancelled_at")) return { rows: [], rowCount: 0 };
      if (sql.includes("_settle_wake_task")) {
        calls.settleWake.push(params);
        return { rows: [{}], rowCount: 1 };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
}

test("M5: a THROWING cancel() must NOT settle the task 'cancelled' — no false durable receipt, the row is left for the next sweep", async () => {
  const taskId = randomUUID();
  const runId = randomUUID();
  const client = mockCancelClientWithRun({ id: taskId, kind: "wake", workflow_run_id: runId });
  const log = [];

  let result;
  await assert.doesNotReject(async () => {
    result = await reconcileTasks(client, {
      enqueueChatTurn: async () => ({ runId: "x" }),
      getRun: (id) => {
        assert.equal(id, runId, "mandatory setup: getRun is called with THIS task's own run id");
        return { cancel: async () => { throw new Error("engine unreachable — abort not confirmed"); } };
      },
      log: (m) => log.push(m),
    });
  }, "a throwing cancel() must never propagate out of reconcileTasks — that throw would be the SAME two-day-zombie shape as an uncaught settle failure");

  assert.equal(client.calls.settleWake.length, 0, "M5: _settle_wake_task is NEVER called when the abort was not confirmed — settling here would be a FALSE durable 'cancelled' receipt while the run may still be live");
  assert.equal(result.cancelled, 0, "M5: the task does NOT count as cancelled — it stays cancel_requested for the next sweep to retry");
  assert.ok(log.some((m) => /FAILED.*NOT settling/i.test(m)), "M5: the refusal is LOGGED loudly, not silently swallowed");
});

test("M5 control: a SUCCEEDING cancel() still settles normally — the fix only withholds the receipt on a genuine failure, never on the working path", async () => {
  const taskId = randomUUID();
  const runId = randomUUID();
  const client = mockCancelClientWithRun({ id: taskId, kind: "wake", workflow_run_id: runId });
  let cancelCalled = false;

  const result = await reconcileTasks(client, {
    enqueueChatTurn: async () => ({ runId: "x" }),
    getRun: () => ({ cancel: async () => { cancelCalled = true; } }),
    log: () => {},
  });

  assert.ok(cancelCalled, "mandatory setup: cancel() was actually invoked");
  assert.equal(client.calls.settleWake.length, 1, "M5 control: _settle_wake_task IS called once the abort is confirmed — the fix does not withhold a legitimate receipt");
  assert.deepEqual(client.calls.settleWake[0], [taskId, "cancelled", null]);
  assert.equal(result.cancelled, 1);
});
