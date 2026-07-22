// Wave A2.1 §7 — the autopost-rule expiry/nudge sweep wiring (lib/reconciler.mjs +
// lib/leader.mjs), PURE (mocked client, scratch spool — no DB). Proves the daily
// since-last-run cadence guard, the plain group-role call (the reconcile_sweep_runs
// precedent — reconcile_autopost_rules is clara_runtime-GROUP-granted, so NO
// login-direct role dance), the receipt log line, and that a thrown fn error is
// isolated (autopostOk:false → the leader retries next cycle; the sweep never throws).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileAutopostRules, runReconcilerSweep } from "../lib/reconciler.mjs";
import { autopostReconcileDue } from "../lib/leader.mjs";

// The sweep's spool TTL pass touches the filesystem — point it at a scratch dir
// (the intake-db.test.mjs idiom; spoolConfig reads the env at call time).
let scratch;
let previousSpool;
before(async () => {
  previousSpool = process.env.CLARA_SPOOL_DIR;
  scratch = await mkdtemp(join(tmpdir(), "clara-autopost-unit-"));
  process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
});
after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  await rm(scratch, { recursive: true, force: true });
});

function recordingClient(onReconcile = () => ({ expired: 0, nudged: 0 })) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/reconcile_autopost_rules/.test(sql)) return Promise.resolve({ rows: [{ r: onReconcile() }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

/** The minimal sweep deps — no rows anywhere, so no enqueue/getRun is ever exercised. */
const sweepDeps = {
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun: () => ({ status: Promise.resolve("running"), cancel: async () => {} }),
  log: () => {},
};

test("reconcileAutopostRules calls the fn PLAIN on the group connection and logs the receipt", async () => {
  const client = recordingClient(() => ({ expired: 2, nudged: 1 }));
  const logs = [];
  const out = await reconcileAutopostRules(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { autopostOk: true, autopostExpired: 2, autopostNudged: 1 });
  const call = client.queries.find((q) => /select clara\.reconcile_autopost_rules\(\)/.test(q.sql));
  assert.ok(call, "the DB fn was invoked");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — no login-direct dance");
  assert.ok(
    logs.some((m) => /\[reconcile\] autopost rules expired=2 nudged=1/.test(m)),
    "the receipt line carries the counts",
  );
});

test("a thrown fn error is isolated: logged, autopostOk:false, never propagates", async () => {
  const client = recordingClient(() => {
    throw new Error("permission denied for function reconcile_autopost_rules");
  });
  const logs = [];
  const out = await reconcileAutopostRules(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { autopostOk: false, autopostExpired: 0, autopostNudged: 0 });
  assert.ok(logs.some((m) => /reconcile_autopost_rules error/.test(m)), "the failure was logged");
});

test("runReconcilerSweep runs the autopost sweep ONLY when the leader flags it due (the prune idiom)", async () => {
  const due = recordingClient(() => ({ expired: 1, nudged: 0 }));
  const sweptDue = await runReconcilerSweep(due, { ...sweepDeps, autopostRules: true });
  assert.equal(sweptDue.autopostOk, true);
  assert.equal(sweptDue.autopostExpired, 1);
  assert.ok(due.queries.some((q) => /reconcile_autopost_rules/.test(q.sql)), "due → invoked");

  const notDue = recordingClient();
  const sweptNotDue = await runReconcilerSweep(notDue, { ...sweepDeps });
  assert.equal(sweptNotDue.autopostOk, undefined, "not due → no autopost receipt in the sweep result");
  assert.ok(!notDue.queries.some((q) => /reconcile_autopost_rules/.test(q.sql)), "not due → not invoked");
});

test("an autopost failure never blocks the rest of the sweep (the sweep resolves, autopostOk:false)", async () => {
  const client = recordingClient(() => {
    throw new Error("boom");
  });
  const swept = await runReconcilerSweep(client, { ...sweepDeps, autopostRules: true, prune: true });
  assert.equal(swept.autopostOk, false, "the leader sees the failure and retries next cycle");
  assert.equal(typeof swept.spoolRemoved, "number", "the sweep completed the earlier passes");
  assert.equal(typeof swept.pruned, "number", "a pass AFTER the failed autopost sweep still completed");
});

test("the daily cadence guard: due at boot, guarded within the interval, due after it", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  assert.equal(autopostReconcileDue(0, now, DAY), true, "first cycle after (re)boot runs it");
  assert.equal(autopostReconcileDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(autopostReconcileDue(now, now + DAY, DAY), true, "a day later — due again");
});
