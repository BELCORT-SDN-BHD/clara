// Wave A2.1 §2.2 — the SST compliance-watch daily repair belt (lib/reconciler-sst.mjs +
// lib/leader.mjs), PURE (mocked client, scratch spool — no DB). Proves the per-client sweep
// shape (the firm-wide-stall fix): ONE evaluate_sst_watch statement PER active client (never a
// single bulk evaluate_sst_watches_all across all clients), the receipt written ONCE at the
// END via evaluate_sst_watches_all (so compliance_eval_runs / stale_evaluator stays fed),
// per-client failure counted WITHOUT throwing, the CADENCE LAW (sstOk goes false ONLY for a
// whole-belt failure — discovery/receipt threw; a per-client failure keeps sstOk true so one
// permanently-poisoned client cannot pin the daily belt into an every-cycle re-run), error
// isolation (the sweep never throws), the runReconcilerSweep flag-gating, and the
// daily-cadence guard INCLUDING the junk-env fallback (a NaN interval must never silently
// disable the belt).

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

// A client that answers the active-client discovery with `ids`, routes each per-client
// evaluate_sst_watch through perClient(clientId), and each evaluate_sst_watches_all receipt
// call through onReceipt(). Records every query in order so the tests can assert sequencing.
function recordingClient({ ids = [], perClient = () => ({ status: "ok", changed: false }), onReceipt = () => ({ run_id: "r", clients_examined: ids.length, clients_changed: 0, clients_failed: 0 }) } = {}) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })), rowCount: ids.length });
      if (/evaluate_sst_watches_all/.test(sql)) return Promise.resolve({ rows: [{ r: onReceipt(params) }], rowCount: 1 });
      if (/evaluate_sst_watch/.test(sql)) return Promise.resolve({ rows: [{ r: perClient(params[0]) }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

const sweepDeps = {
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun: () => ({ status: Promise.resolve("running"), cancel: async () => {} }),
  log: () => {},
};

test("the sweep issues ONE evaluate_sst_watch PER client (never a bulk all-clients evaluate), then the receipt ONCE at the end", async () => {
  const ids = ["c1", "c2", "c3"];
  const client = recordingClient({
    ids,
    perClient: (id) => ({ status: "ok", changed: id === "c2" }),
    onReceipt: () => ({ run_id: "run-1", clients_examined: 3, clients_changed: 0, clients_failed: 0 }),
  });
  const logs = [];
  const out = await reconcileSstWatches(client, { log: (m) => logs.push(m) });

  // one per-client statement per client — count and identity
  const perClientCalls = client.queries.filter((q) => /evaluate_sst_watch\(/.test(q.sql) && !/evaluate_sst_watches_all/.test(q.sql));
  assert.equal(perClientCalls.length, 3, "exactly one evaluate_sst_watch per active client");
  assert.deepEqual(perClientCalls.map((q) => q.params[0]), ids, "each client evaluated once, in the discovered order");
  for (const q of perClientCalls) assert.match(String(q.params[1]), /^sstsweep:.*:c[123]$/, "per-client op-key embeds the client id");

  // the receipt: exactly once, and AFTER every per-client call
  const receiptCalls = client.queries.filter((q) => /evaluate_sst_watches_all/.test(q.sql));
  assert.equal(receiptCalls.length, 1, "evaluate_sst_watches_all (the receipt writer) is called exactly once");
  const lastPerClientIdx = client.queries.map((q, i) => (/evaluate_sst_watch\(/.test(q.sql) && !/evaluate_sst_watches_all/.test(q.sql) ? i : -1)).filter((i) => i >= 0).pop();
  const receiptIdx = client.queries.findIndex((q) => /evaluate_sst_watches_all/.test(q.sql));
  assert.ok(receiptIdx > lastPerClientIdx, "the receipt is written AFTER the per-client pass converges");
  assert.match(String(receiptCalls[0].params[0]), /:receipt$/, "the receipt op-key is distinct");

  assert.equal(out.sstOk, true);
  assert.equal(out.sstExamined, 3);
  assert.equal(out.sstChanged, 1, "the one changed client is counted from the per-client pass");
  assert.equal(out.sstFailed, 0);
  assert.equal(out.sstRunId, "run-1", "the receipt run_id rides the result");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fns — no login-direct dance");
  assert.ok(logs.some((m) => /\[reconcile\] sst watches examined=3 changed=1 failed=0/.test(m)));
});

test("a per-client failure is COUNTED without throwing, the pass continues, and sstOk STAYS true (cadence law)", async () => {
  const ids = ["ok1", "boom", "ok2"];
  const client = recordingClient({
    ids,
    // the DB evaluator is exception-isolated: it returns {status:'failed'} rather than raising
    perClient: (id) => (id === "boom" ? { status: "failed", error: "poisoned client" } : { status: "ok", changed: false }),
    // the receipt pass re-evaluates everyone, so a persistent poison shows in ITS count too —
    // the sweep takes the receipt's clients_failed as authoritative (never double-counts)
    onReceipt: () => ({ run_id: "r", clients_examined: 3, clients_changed: 0, clients_failed: 1 }),
  });
  const logs = [];
  const out = await reconcileSstWatches(client, { log: (m) => logs.push(m) });
  const perClientCalls = client.queries.filter((q) => /evaluate_sst_watch\(/.test(q.sql) && !/evaluate_sst_watches_all/.test(q.sql));
  assert.equal(perClientCalls.length, 3, "every client is still evaluated — one poison never abandons the rest");
  assert.equal(out.sstExamined, 3);
  assert.equal(out.sstFailed, 1, "the receipt's clients_failed is authoritative — no double count");
  assert.equal(out.sstOk, true, "a per-client failure must NOT gate the daily cadence — one poisoned client would otherwise re-run the belt every leader cycle");
  assert.ok(logs.some((m) => /sst watch client=boom failed: poisoned client/.test(m)), "the poisoned client stays visible in the log");
});

test("a THROWN per-client error (infra fault) is isolated: counted, the pass continues, sstOk stays true, never propagates", async () => {
  const ids = ["a", "b"];
  const client = {
    queries: [],
    query(sql, params) {
      this.queries.push({ sql: String(sql).trim(), params });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })) });
      if (/evaluate_sst_watches_all/.test(sql)) return Promise.resolve({ rows: [{ r: { run_id: "r", clients_examined: 2, clients_changed: 0, clients_failed: 1 } }] });
      if (/evaluate_sst_watch/.test(sql)) {
        if (params[0] === "a") return Promise.reject(new Error("connection reset"));
        return Promise.resolve({ rows: [{ r: { status: "ok", changed: false } }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  const out = await reconcileSstWatches(client, { log: () => {} });
  assert.equal(out.sstExamined, 2, "both clients examined — the throw did not abort the loop");
  assert.equal(out.sstFailed, 1);
  assert.equal(out.sstOk, true, "per-client infra faults surface via sstFailed + the receipt, not the cadence gate");
});

test("a thrown RECEIPT-call error is isolated: sstOk:false, never propagates", async () => {
  const client = recordingClient({
    ids: ["c1"],
    onReceipt: () => {
      throw new Error("permission denied for function evaluate_sst_watches_all");
    },
  });
  const logs = [];
  const out = await reconcileSstWatches(client, { log: (m) => logs.push(m) });
  assert.equal(out.sstOk, false);
  assert.ok(logs.some((m) => /evaluate_sst_watches_all error/.test(m)), "the receipt failure was logged");
});

test("no active clients: no per-client call, the receipt still fires (keeps stale_evaluator fed)", async () => {
  const client = recordingClient({ ids: [], onReceipt: () => ({ run_id: "empty", clients_examined: 0, clients_changed: 0, clients_failed: 0 }) });
  const out = await reconcileSstWatches(client, { log: () => {} });
  assert.ok(!client.queries.some((q) => /evaluate_sst_watch\(/.test(q.sql) && !/evaluate_sst_watches_all/.test(q.sql)), "no per-client call with zero clients");
  assert.equal(client.queries.filter((q) => /evaluate_sst_watches_all/.test(q.sql)).length, 1, "the receipt still writes (stale_evaluator must not silently starve)");
  assert.equal(out.sstOk, true);
  assert.equal(out.sstRunId, "empty");
});

test("runReconcilerSweep runs the SST belt ONLY when the leader flags it due (the prune idiom)", async () => {
  const due = recordingClient({ ids: ["c1"], onReceipt: () => ({ run_id: "r", clients_examined: 1, clients_changed: 0, clients_failed: 0 }) });
  const sweptDue = await runReconcilerSweep(due, { ...sweepDeps, sstWatches: true });
  assert.equal(sweptDue.sstOk, true);
  assert.equal(sweptDue.sstExamined, 1);
  assert.ok(due.queries.some((q) => /evaluate_sst_watch/.test(q.sql)), "due → invoked");

  const notDue = recordingClient({ ids: ["c1"] });
  const sweptNotDue = await runReconcilerSweep(notDue, { ...sweepDeps });
  assert.equal(sweptNotDue.sstOk, undefined, "not due → no SST receipt in the sweep result");
  assert.ok(!notDue.queries.some((q) => /evaluate_sst_watch/.test(q.sql)), "not due → not invoked");
});

test("an SST failure never blocks the rest of the sweep (the sweep resolves, sstOk:false)", async () => {
  const client = recordingClient({
    ids: ["c1"],
    onReceipt: () => {
      throw new Error("boom");
    },
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
