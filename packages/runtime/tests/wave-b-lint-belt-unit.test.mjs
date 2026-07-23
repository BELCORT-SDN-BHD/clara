// Wave B design part3 Block L / L3 (WB-R8, AMB-10) — the wiki lint belt daily sweep
// (lib/reconciler-lint.mjs + lib/leader.mjs), PURE (mocked client — no DB). Mirrors
// tests/reconcile-sst-unit.test.mjs's technique verbatim (the evaluate_sst_watch clone
// contract the design pin names): proves the per-client sweep shape (the firm-wide-stall
// fix) — ONE run_client_lint statement PER active client (never a single bulk run_lint_all
// across all of them), the receipt written ONCE at the END via run_lint_all (so
// clara.lint_runs / the queue's stale_evaluator-style freshness stays fed), per-client
// failure counted WITHOUT throwing, the CADENCE LAW (lintOk goes false ONLY for a
// whole-belt failure — discovery/receipt threw; a per-client failure keeps lintOk true so
// one permanently-poisoned client cannot pin the daily belt into an every-cycle re-run),
// error isolation (the sweep never throws), and the daily-cadence guard INCLUDING the
// junk-env fallback (a NaN interval must never silently disable the belt).
//
// leader.mjs's own runReconcilerSweep flag-gating (the `sstWatches:true` idiom proven by
// reconcile-sst-unit.test.mjs's "runReconcilerSweep runs ... ONLY when due" test) is NOT
// re-proven here: this lane's ownership is reconciler-lint.mjs + an ADDITIVE leader.mjs
// phase (lintReconcileDue/lastLintRun, passed through as deps.lintBelt) — reconciler.mjs
// itself is study-only/frozen for this lane and does not yet consume deps.lintBelt (see
// the lane report's interface note: a follow-on edit wires
// `if (deps.lintBelt) lint = await reconcileLintBelt(client, {log})` into
// runReconcilerSweep, mirroring the sstWatches wiring at reconciler.mjs:429-432).

// The junk-env fallback: set a garbage cadence BEFORE leader.mjs loads (a dynamic import
// after, so the module reads this env). It must fall back to a FINITE 24h, never NaN.
process.env.CLARA_LINT_RECONCILE_MS = "not-a-number";

import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileLintBelt } from "../lib/reconciler-lint.mjs";

const { lintReconcileDue } = await import("../lib/leader.mjs");

// A client that answers the active-client discovery with `ids`, routes each per-client
// run_client_lint through perClient(clientId), and the run_lint_all receipt call through
// onReceipt(). Records every query in order so the tests can assert sequencing.
function recordingClient({ ids = [], perClient = () => ({ status: "ok", changed: false }), onReceipt = () => ({ run_id: "r", clients_examined: ids.length, clients_changed: 0, clients_failed: 0 }) } = {}) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })), rowCount: ids.length });
      if (/run_lint_all/.test(sql)) return Promise.resolve({ rows: [{ r: onReceipt(params) }], rowCount: 1 });
      if (/run_client_lint/.test(sql)) return Promise.resolve({ rows: [{ r: perClient(params[0]) }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

test("the belt issues ONE run_client_lint PER client (never a bulk run_lint_all), then the receipt ONCE at the end", async () => {
  const ids = ["c1", "c2", "c3"];
  const client = recordingClient({
    ids,
    perClient: (id) => ({ status: "ok", changed: id === "c2" }),
    onReceipt: () => ({ run_id: "run-1", clients_examined: 3, clients_changed: 0, clients_failed: 0 }),
  });
  const logs = [];
  const out = await reconcileLintBelt(client, { log: (m) => logs.push(m) });

  // one per-client statement per client — count and identity
  const perClientCalls = client.queries.filter((q) => /run_client_lint\(/.test(q.sql) && !/run_lint_all/.test(q.sql));
  assert.equal(perClientCalls.length, 3, "exactly one run_client_lint per active client");
  assert.deepEqual(perClientCalls.map((q) => q.params[0]), ids, "each client evaluated once, in the discovered order");
  for (const q of perClientCalls) assert.match(String(q.params[1]), /^lintsweep:.*:c[123]$/, "per-client op-key embeds the client id");

  // the receipt: exactly once, and AFTER every per-client call
  const receiptCalls = client.queries.filter((q) => /run_lint_all/.test(q.sql));
  assert.equal(receiptCalls.length, 1, "run_lint_all (the receipt writer) is called exactly once");
  const lastPerClientIdx = client.queries.map((q, i) => (/run_client_lint\(/.test(q.sql) && !/run_lint_all/.test(q.sql) ? i : -1)).filter((i) => i >= 0).pop();
  const receiptIdx = client.queries.findIndex((q) => /run_lint_all/.test(q.sql));
  assert.ok(receiptIdx > lastPerClientIdx, "the receipt is written AFTER the per-client pass converges");
  assert.match(String(receiptCalls[0].params[0]), /:receipt$/, "the receipt op-key is distinct");

  assert.equal(out.lintOk, true);
  assert.equal(out.lintExamined, 3);
  assert.equal(out.lintChanged, 1, "the one changed client is counted from the per-client pass");
  assert.equal(out.lintFailed, 0);
  assert.equal(out.lintRunId, "run-1", "the receipt run_id rides the result");
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fns — no login-direct dance");
  assert.ok(logs.some((m) => /\[reconcile\] lint belt examined=3 changed=1 failed=0/.test(m)));
});

test("a per-client failure ({status:'failed'}, AMB-10 — the fn never raises) is COUNTED without throwing, the pass continues, and lintOk STAYS true (cadence law)", async () => {
  const ids = ["ok1", "boom", "ok2"];
  const client = recordingClient({
    ids,
    // run_client_lint NEVER raises (AMB-10): it returns {status:'failed', error, sqlstate}
    perClient: (id) => (id === "boom" ? { status: "failed", error: "poisoned client" } : { status: "ok", changed: false }),
    // the receipt pass re-evaluates everyone, so a persistent poison shows in ITS count too —
    // the sweep takes the receipt's clients_failed as authoritative (never double-counts)
    onReceipt: () => ({ run_id: "r", clients_examined: 3, clients_changed: 0, clients_failed: 1 }),
  });
  const logs = [];
  const out = await reconcileLintBelt(client, { log: (m) => logs.push(m) });
  const perClientCalls = client.queries.filter((q) => /run_client_lint\(/.test(q.sql) && !/run_lint_all/.test(q.sql));
  assert.equal(perClientCalls.length, 3, "every client is still evaluated — one poison never abandons the rest");
  assert.equal(out.lintExamined, 3);
  assert.equal(out.lintFailed, 1, "the receipt's clients_failed is authoritative — no double count");
  assert.equal(out.lintOk, true, "a per-client failure must NOT gate the daily cadence — one poisoned client would otherwise re-run the belt every leader cycle");
  assert.ok(logs.some((m) => /lint client=boom failed: poisoned client/.test(m)), "the poisoned client stays visible in the log");
});

test("a THROWN per-client error (infra fault) is isolated: counted, the pass continues, lintOk stays true, never propagates", async () => {
  const ids = ["a", "b"];
  const client = {
    queries: [],
    query(sql, params) {
      this.queries.push({ sql: String(sql).trim(), params });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })) });
      if (/run_lint_all/.test(sql)) return Promise.resolve({ rows: [{ r: { run_id: "r", clients_examined: 2, clients_changed: 0, clients_failed: 1 } }] });
      if (/run_client_lint/.test(sql)) {
        if (params[0] === "a") return Promise.reject(new Error("connection reset"));
        return Promise.resolve({ rows: [{ r: { status: "ok", changed: false } }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  const out = await reconcileLintBelt(client, { log: () => {} });
  assert.equal(out.lintExamined, 2, "both clients examined — the throw did not abort the loop");
  assert.equal(out.lintFailed, 1);
  assert.equal(out.lintOk, true, "per-client infra faults surface via lintFailed + the receipt, not the cadence gate");
});

test("a thrown RECEIPT-call error is isolated: lintOk:false, never propagates", async () => {
  const client = recordingClient({
    ids: ["c1"],
    onReceipt: () => {
      throw new Error("permission denied for function run_lint_all");
    },
  });
  const logs = [];
  const out = await reconcileLintBelt(client, { log: (m) => logs.push(m) });
  assert.equal(out.lintOk, false);
  assert.ok(logs.some((m) => /run_lint_all error/.test(m)), "the receipt failure was logged");
});

test("no active clients: no per-client call, the receipt still fires (keeps the daily receipt fed)", async () => {
  const client = recordingClient({ ids: [], onReceipt: () => ({ run_id: "empty", clients_examined: 0, clients_changed: 0, clients_failed: 0 }) });
  const out = await reconcileLintBelt(client, { log: () => {} });
  assert.ok(!client.queries.some((q) => /run_client_lint\(/.test(q.sql) && !/run_lint_all/.test(q.sql)), "no per-client call with zero clients");
  assert.equal(client.queries.filter((q) => /run_lint_all/.test(q.sql)).length, 1, "the receipt still writes (must not silently starve)");
  assert.equal(out.lintOk, true);
  assert.equal(out.lintRunId, "empty");
});

test("client discovery failure (whole-belt) is isolated: lintOk:false, zero per-client/receipt calls, never propagates", async () => {
  const client = {
    queries: [],
    query(sql, params) {
      this.queries.push({ sql: String(sql).trim(), params });
      if (/from clara\.clients/.test(sql)) return Promise.reject(new Error("connection reset"));
      return Promise.resolve({ rows: [] });
    },
  };
  const logs = [];
  const out = await reconcileLintBelt(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { lintOk: false, lintExamined: 0, lintChanged: 0, lintFailed: 0, lintRunId: null });
  assert.ok(logs.some((m) => /lint belt client discovery error/.test(m)));
  assert.ok(!client.queries.some((q) => /run_client_lint|run_lint_all/.test(q.sql)), "no per-client/receipt call when discovery itself fails");
});

test("the daily cadence guard: due at boot, guarded within the interval, due after it", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  assert.equal(lintReconcileDue(0, now, DAY), true, "first cycle after (re)boot runs it (catches pre-existing conditions post-0017)");
  assert.equal(lintReconcileDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(lintReconcileDue(now, now + DAY, DAY), true, "a day later — due again");
});

test("junk-env fallback: a NaN CLARA_LINT_RECONCILE_MS falls back to a FINITE 24h (never silently disables the belt)", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  // With the junk env set at the top of the file, the module-level default interval must be a
  // finite 24h — so the default-interval due-check behaves exactly like the explicit-24h one.
  // A NaN default would make BOTH of these false (NaN comparisons are always false).
  assert.equal(lintReconcileDue(0, now), true, "default interval is finite → due at boot");
  assert.equal(lintReconcileDue(now, now + DAY + 1), true, "default interval is ~24h → due a day later");
  assert.equal(lintReconcileDue(now, now + 1000), false, "default interval is finite → guarded moments later");
});
