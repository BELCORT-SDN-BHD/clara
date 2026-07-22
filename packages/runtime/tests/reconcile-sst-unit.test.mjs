// Wave A2.1 §2.2 — the SST compliance-watch daily repair belt (lib/reconciler.mjs +
// lib/leader.mjs), PURE (mocked client, scratch spool — no DB). Proves the plain group-role
// call (evaluate_sst_watches_all is clara_runtime-GROUP-granted, so NO login-direct dance),
// the op-key shape (sstsweep:<iso>), the receipt log line, error isolation ({sstOk:false} →
// the leader retries next cycle; the sweep never throws), the runReconcilerSweep flag-gating,
// and the daily cadence guard INCLUDING the junk-env fallback (a NaN interval must never
// silently disable the belt).

// The junk-env fallback: set a garbage cadence BEFORE leader.mjs loads (a dynamic import
// after, so the module reads this env). It must fall back to a FINITE 24h, never NaN.
process.env.CLARA_SST_RECONCILE_MS = "not-a-number";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileSstWatches, runReconcilerSweep } from "../lib/reconciler.mjs";

const { sstReconcileDue } = await import("../lib/leader.mjs");

let scratch;
let previousSpool;
before(async () => {
  previousSpool = process.env.CLARA_SPOOL_DIR;
  scratch = await mkdtemp(join(tmpdir(), "clara-sst-unit-"));
  process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
});
after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  await rm(scratch, { recursive: true, force: true });
});

function recordingClient(onSweep = () => ({ clients_examined: 0, clients_changed: 0, clients_failed: 0 })) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/evaluate_sst_watches_all/.test(sql)) return Promise.resolve({ rows: [{ r: onSweep(params) }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

const sweepDeps = {
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun: () => ({ status: Promise.resolve("running"), cancel: async () => {} }),
  log: () => {},
};

test("reconcileSstWatches calls evaluate_sst_watches_all PLAIN (no reset role), op-key sstsweep:<iso>, logs the receipt", async () => {
  const client = recordingClient(() => ({ run_id: "r1", clients_examined: 5, clients_changed: 2, clients_failed: 1 }));
  const logs = [];
  const out = await reconcileSstWatches(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { sstOk: true, sstExamined: 5, sstChanged: 2, sstFailed: 1 });
  const call = client.queries.find((q) => /evaluate_sst_watches_all/.test(q.sql));
  assert.ok(call, "the DB fn was invoked");
  assert.match(String(call.params[0]), /^sstsweep:/, "op-key is sstsweep:<iso>");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — no login-direct dance");
  assert.ok(logs.some((m) => /\[reconcile\] sst watches examined=5 changed=2 failed=1/.test(m)), "the receipt line carries the counts");
});

test("a thrown fn error is isolated: logged, sstOk:false, never propagates", async () => {
  const client = recordingClient(() => {
    throw new Error("permission denied for function evaluate_sst_watches_all");
  });
  const logs = [];
  const out = await reconcileSstWatches(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { sstOk: false, sstExamined: 0, sstChanged: 0, sstFailed: 0 });
  assert.ok(logs.some((m) => /evaluate_sst_watches_all error/.test(m)), "the failure was logged");
});

test("runReconcilerSweep runs the SST belt ONLY when the leader flags it due (the prune idiom)", async () => {
  const due = recordingClient(() => ({ run_id: "r", clients_examined: 3, clients_changed: 0, clients_failed: 0 }));
  const sweptDue = await runReconcilerSweep(due, { ...sweepDeps, sstWatches: true });
  assert.equal(sweptDue.sstOk, true);
  assert.equal(sweptDue.sstExamined, 3);
  assert.ok(due.queries.some((q) => /evaluate_sst_watches_all/.test(q.sql)), "due → invoked");

  const notDue = recordingClient();
  const sweptNotDue = await runReconcilerSweep(notDue, { ...sweepDeps });
  assert.equal(sweptNotDue.sstOk, undefined, "not due → no SST receipt in the sweep result");
  assert.ok(!notDue.queries.some((q) => /evaluate_sst_watches_all/.test(q.sql)), "not due → not invoked");
});

test("an SST failure never blocks the rest of the sweep (the sweep resolves, sstOk:false)", async () => {
  const client = recordingClient(() => {
    throw new Error("boom");
  });
  const swept = await runReconcilerSweep(client, { ...sweepDeps, sstWatches: true, prune: true });
  assert.equal(swept.sstOk, false, "the leader sees the failure and retries next cycle");
  assert.equal(typeof swept.spoolRemoved, "number", "the sweep completed the earlier passes");
  assert.equal(typeof swept.pruned, "number", "a pass AFTER the failed SST belt still completed");
});

test("the daily cadence guard: due at boot, guarded within the interval, due after it", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  assert.equal(sstReconcileDue(0, now, DAY), true, "first cycle after (re)boot runs it (catches pre-existing crossings post-0016)");
  assert.equal(sstReconcileDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(sstReconcileDue(now, now + DAY, DAY), true, "a day later — due again");
});

test("junk-env fallback: a NaN CLARA_SST_RECONCILE_MS falls back to a FINITE 24h (never silently disables the belt)", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  // With the junk env set at the top of the file, the module-level default interval must be a
  // finite 24h — so the default-interval due-check behaves exactly like the explicit-24h one.
  // A NaN default would make BOTH of these false (NaN comparisons are always false).
  assert.equal(sstReconcileDue(0, now), true, "default interval is finite → due at boot");
  assert.equal(sstReconcileDue(now, now + DAY + 1), true, "default interval is ~24h → due a day later");
  assert.equal(sstReconcileDue(now, now + 1000), false, "default interval is finite → guarded moments later");
});
