// The settle-reconciler + sweepers (contract §4.5-4.7). Engine truth is mocked
// (enqueueChatTurn / getRun injected). Covers: queued-without-run re-enqueue,
// clarify expiry, engine-terminal settle, cancel_requested abort+settle, and the
// audited trace prune. No world, no network.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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

test("reconcile: a queued-without-run task past grace is re-enqueued (started)", { skip }, async () => {
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
  assert.deepEqual(enq, [task_id], "the stuck task was re-enqueued (started)");
  // The reconciler no longer binds — the WORKFLOW self-binds via claimRunStep (S4-AB3).
  // The mock enqueue does not run the workflow, so the task stays queued+unbound here;
  // the real self-bind is proven end-to-end by the world-e2e.
  const t = await rig.readTask(task_id);
  assert.equal(t.status, "queued", "task stays queued until the real workflow claims it");
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

test("reconcile: an open task whose engine run FAILED settles failed/internal (spec-c3)", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec3c", "wrun_failed");
  await rig.asRuntime((c) =>
    reconcileTasks(c, { onlyFirm: firm, enqueueChatTurn: async () => ({ runId: "x" }), getRun: () => mockRun("failed") }),
  );
  const t = await rig.readTask(task_id);
  assert.equal(t.status, "failed");
  assert.equal(t.error_code, "internal", "engine-FAILED maps to internal, not engine_lost");
});

test("reconcile: a PARKED (awaiting_input) task whose run is lost settles cancelled (matrix-safe)", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec3d", "wrun_parked_lost");
  await rig.driveTask(task_id, ["awaiting_input"]); // park it
  const notFound = () => {
    const e = new Error("run not found");
    e.name = "WorkflowRunNotFoundError";
    throw e;
  };
  await rig.asRuntime((c) =>
    reconcileTasks(c, { onlyFirm: firm, enqueueChatTurn: async () => ({ runId: "x" }), getRun: notFound }),
  );
  const t = await rig.readTask(task_id);
  // awaiting_input CANNOT go to 'failed' (AB11) — the parked task settles 'cancelled'.
  assert.equal(t.status, "cancelled");
  assert.equal(t.error_code, "engine_lost");
});

test("reconcile: a RUNNING task whose engine run CANCELLED settles cancelled (two-step, FX5)", { skip }, async () => {
  const { task_id, firm } = await runningTask("rec3e", "wrun_run_cancelled");
  await rig.asRuntime((c) =>
    reconcileTasks(c, { onlyFirm: firm, enqueueChatTurn: async () => ({ runId: "x" }), getRun: () => mockRun("cancelled") }),
  );
  // running->cancelled is illegal directly (AB11); the reconciler routes it via
  // running->cancel_requested->cancelled rather than skipping the pair forever.
  assert.equal((await rig.readTask(task_id)).status, "cancelled");
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

// #1046 (0348) — the two pre-session rate-wall evidence tables ride the SAME pruneTraces() lane
// (the "prunedWorkTraces rides this lane" precedent above, for a third and fourth relation). No
// new belt, no new scheduler: this cell drives pruneTraces() itself, exactly as the trace-prune
// cell above does, and reads the two new counters it returns.
test("reconcile: rate-wall attempt prune rides the trace-prune lane, deletes past the margin, keeps the window", { skip }, async () => {
  // Planted through ROOT, not clara_runtime: both evidence tables carry NO application-role table
  // grant at all (0309/0163's own design — only the DEFINER doors and the DEFINER prune verbs may
  // touch them), so even the runtime connection cannot INSERT directly. There is no door that
  // backdates `attempted_at` either, so a superuser insert is the only way to reach "a row past
  // the retention margin" without waiting an hour in real time — the db-level
  // rate-wall-attempts-retention.test.mjs precedent.
  //
  // Every key below is FRESH per run (randomBytes, never a fixed literal): the
  // invite-preview-public.test.mjs precedent — a fixed literal would let one run's rows collide
  // with a re-run's inside the same 15-minute window over an unprunable-by-anything-but-margin
  // table, and re-running this file against a lane database that already carries an earlier run's
  // "fresh" row under the SAME literal would silently inflate the survivor count.
  const staleToken = randomBytes(32).toString("hex");
  const freshToken = randomBytes(32).toString("hex");
  const staleOrigin1 = randomBytes(32);
  const freshOrigin1 = randomBytes(32);
  await rig.rootQuery(
    "insert into clara.invite_preview_attempts (token_hash, origin_digest, attempted_at) values " +
    "(sha256(decode($1,'hex')), $2, now() - interval '2 hours'), " +
    "(sha256(decode($3,'hex')), $4, now() - interval '5 minutes')",
    [staleToken, staleOrigin1, freshToken, freshOrigin1],
  );
  const staleEmail = randomBytes(32);
  const freshEmail = randomBytes(32);
  const staleOrigin2 = randomBytes(32);
  const freshOrigin2 = randomBytes(32);
  await rig.rootQuery(
    "insert into clara.confirmation_attempts (email_digest, origin_digest, attempted_at) values " +
    "($1, $2, now() - interval '2 hours'), " +
    "($3, $4, now() - interval '5 minutes')",
    [staleEmail, staleOrigin2, freshEmail, freshOrigin2],
  );

  const res = await rig.asRuntime((c) => pruneTraces(c, { rateWallRetentionMinutes: 60, rateWallBatchSize: 100 }));
  assert.ok(res.prunedInvitePreviewAttempts >= 1, "at least the 2-hour-old invite-preview row pruned");
  assert.ok(res.prunedConfirmationAttempts >= 1, "at least the 2-hour-old confirmation row pruned");

  const ipaFreshKept = await rig.rootQuery(
    "select count(*)::int n from clara.invite_preview_attempts where origin_digest = $1", [freshOrigin1]);
  assert.equal(ipaFreshKept.rows[0].n, 1, "the 5-minute-old invite-preview row, inside the window, survives");
  const caFreshKept = await rig.rootQuery(
    "select count(*)::int n from clara.confirmation_attempts where origin_digest = $1", [freshOrigin2]);
  assert.equal(caFreshKept.rows[0].n, 1, "the 5-minute-old confirmation row, inside the window, survives");
});

// #1046 FIX ROUND (ADV-L07-02 / SPEC-L07-1046-A) -- THE TWO RIDERS CANNOT SHUT THE WALL, AND
// CANNOT TAKE THE BELT DOWN WITH THEM.
//
// Each verb disables its table's append-only trigger, which takes ShareRowExclusive on the WHOLE
// table. Measured before this cell was written, with three connections: an ordinary open INSERT
// (RowExclusive), a prune QUEUED behind it, and a third, completely unrelated wall write refused
// 55P03 after 3003 ms -- blocked by the QUEUED prune, not by the transaction actually holding the
// table. 0348's verbs therefore carry `set lock_timeout = '3s'` and this belt tolerates the
// resulting 55P03 the way it already tolerates a missing function.
//
// The seam is pruneTraces() itself, as in every cell in this group; the contention is REAL (a
// second connection holding the real lock), never a stubbed error.
test("reconcile: a rate-wall table locked by somebody else is SKIPPED, not queued, and its sibling still sweeps", { skip }, async () => {
  const staleToken = randomBytes(32).toString("hex");
  const staleOrigin = randomBytes(32);
  await rig.rootQuery(
    "insert into clara.invite_preview_attempts (token_hash, origin_digest, attempted_at) values (sha256(decode($1,'hex')), $2, now() - interval '2 hours')",
    [staleToken, staleOrigin],
  );
  const staleEmail = randomBytes(32);
  const staleOrigin2 = randomBytes(32);
  await rig.rootQuery(
    "insert into clara.confirmation_attempts (email_digest, origin_digest, attempted_at) values ($1, $2, now() - interval '2 hours')",
    [staleEmail, staleOrigin2],
  );

  const holder = await rig.getPool().connect();
  let res;
  let elapsed;
  try {
    await holder.query("begin");
    await holder.query("set local role clara_fn_owner");
    await holder.query("lock table clara.invite_preview_attempts in share row exclusive mode");
    const started = Date.now();
    res = await rig.asRuntime((c) => pruneTraces(c, { rateWallRetentionMinutes: 60, rateWallBatchSize: 100 }));
    elapsed = Date.now() - started;
  } finally {
    await holder.query("rollback");
    holder.release();
  }

  assert.deepEqual(res.errors, [], "a lock this cycle could not take is a no-op, not a belt error");
  assert.equal(res.prunedInvitePreviewAttempts, 0, "the locked lane deleted nothing");
  // BOUNDED ABOVE AND BELOW. Above: the sweep gave up rather than queueing behind a lock this
  // very test still holds. Below: it really did WAIT for the lock and really did hit the verb's
  // own 3s `lock_timeout` -- a lane that never attempted the lock at all would come back in
  // milliseconds and pass the upper bound while proving nothing.
  assert.ok(elapsed < 30000, `the sweep gave up rather than queueing (took ${elapsed}ms; the verb's own lock_timeout is 3s)`);
  assert.ok(elapsed >= 1500, `the lane really queued for the lock and really timed out on it (took only ${elapsed}ms)`);
  const survived = await rig.rootQuery(
    "select count(*)::int n from clara.invite_preview_attempts where origin_digest = $1", [staleOrigin]);
  assert.equal(survived.rows[0].n, 1, "the row the locked lane could not reach is still there");

  // THE SIBLING LANE STILL RAN -- the property a shared throw would have destroyed.
  assert.ok(res.prunedConfirmationAttempts >= 1, "the OTHER rate-wall lane swept normally while its sibling was locked out");
  const sibling = await rig.rootQuery(
    "select count(*)::int n from clara.confirmation_attempts where origin_digest = $1", [staleOrigin2]);
  assert.equal(sibling.rows[0].n, 0, "...and really deleted its own stale row");

  // AND THE SKIP IS TEMPORARY: with the lock gone, the same call sweeps the same row.
  const after = await rig.asRuntime((c) => pruneTraces(c, { rateWallRetentionMinutes: 60, rateWallBatchSize: 100 }));
  assert.ok(after.prunedInvitePreviewAttempts >= 1, "the next belt turn takes the lock and sweeps -- the skip cost latency, not the sweep");
  const gone = await rig.rootQuery(
    "select count(*)::int n from clara.invite_preview_attempts where origin_digest = $1", [staleOrigin]);
  assert.equal(gone.rows[0].n, 0, "the stale row is gone on the next turn");
});

// SPEC-L07-1046-A. A misconfigured retention margin is answered CLR10 by both verbs, which is the
// right answer -- but before the fix round that CLR10 escaped pruneTraces(), so the belt wrapper's
// { pruned: 0 } fallback threw away the trace-prune counters this same call had already earned and
// the second rate-wall lane never ran at all. A housekeeping rider must not be able to do that to
// its host, so the two riders now CONTAIN their own faults and report them by name.
test("reconcile: a misconfigured rate-wall margin is reported by name and does not take the belt down", { skip }, async () => {
  const { task_id } = await runningTask("rec1046", "wrun_trace_1046");
  const traceId = "trace-rec1046-" + randomUUID().slice(0, 8);
  await rig.asRuntime((c) =>
    c.query(
      "insert into clara.trace_spans (trace_id, span_id, task_id, name, started_at) values ($1,'s1',$2,'old', now() - interval '100 days')",
      [traceId, task_id],
    ),
  );

  // One minute is inside the wall's own 15-minute window, which both verbs refuse (CLR10).
  const res = await rig.asRuntime((c) =>
    pruneTraces(c, { retentionDays: 90, batchSize: 100, rateWallRetentionMinutes: 1, rateWallBatchSize: 100 }));

  assert.equal(res.errors.length, 2, `both rate-wall lanes refused and both said so: ${JSON.stringify(res.errors)}`);
  assert.match(res.errors[0], /^invite preview attempts: CLR10 /, "the lane is named, and so is the SQLSTATE");
  assert.match(res.errors[1], /^confirmation attempts: CLR10 /, "the second lane ran too -- the first one's fault did not skip it");
  assert.equal(res.prunedInvitePreviewAttempts, 0);
  assert.equal(res.prunedConfirmationAttempts, 0);

  // THE COUNTERS THE SAME CALL ALREADY EARNED SURVIVED, which is the whole point.
  assert.ok(res.pruned >= 1, "the trace-span prune's own counter came back rather than being lost with the sweep");
  const oldGone = await rig.rootQuery(
    "select count(*)::int n from clara.trace_spans where trace_id=$1 and span_id='s1'", [traceId]);
  assert.equal(oldGone.rows[0].n, 0, "...and the work it counted really happened");
});

test("reconcile: heartbeat upserts a component beat", { skip }, async () => {
  await rig.asRuntime((c) => heartbeat(c, "test-component"));
  const r = await rig.rootQuery("select beat_at from clara.runtime_heartbeats where component='test-component'");
  assert.equal(r.rowCount, 1, "heartbeat row present");
});
