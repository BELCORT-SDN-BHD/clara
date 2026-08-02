// Wave D-a §3.4 — the depreciation-run daily belt (lib/reconciler-fa.mjs + lib/leader.mjs),
// PURE (mocked client, scratch spool — no DB; the reconcile-sst-unit.test.mjs /
// reconcile-autopost-unit.test.mjs precedent). Proves: the per-cycle EXACT-SIGNATURE
// feature-detect (dormant no-op, never a failure, when 0041 is absent — the runtime-image-
// first ceremony order), the DB-owned depreciation_run_due probe deciding due-ness (never
// client-side arithmetic), the bounded per-client chase that clears several overdue periods
// in one sweep, per-client error isolation (a poisoned client is counted, never gates the
// belt's daily cadence), the plain group-role call (no reset-role dance), the
// runReconcilerSweep flag-gating, and the daily-cadence guard INCLUDING the junk-env
// fallback (a NaN interval must never silently disable the belt).

// The junk-env fallback: set a garbage cadence BEFORE leader.mjs loads (a dynamic import
// after, so the module reads this env). It must fall back to a FINITE 24h, never NaN.
process.env.CLARA_FA_RECONCILE_MS = "not-a-number";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileFaRuns, runReconcilerSweep } from "../lib/reconciler.mjs";

const { depreciationRunDue } = await import("../lib/leader.mjs");

let scratch;
let previousSpool;
before(async () => {
  previousSpool = process.env.CLARA_SPOOL_DIR;
  scratch = await mkdtemp(join(tmpdir(), "clara-fa-unit-"));
  process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
});
after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  await rm(scratch, { recursive: true, force: true });
});

const sweepDeps = {
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun: () => ({ status: Promise.resolve("running"), cancel: async () => {} }),
  log: () => {},
};

// A client that answers the feature-detect probe with `surface`, active-client discovery
// with `ids`, routes each per-client depreciation_run_due probe through dueFor(clientId,
// callIndex) (1-based, per client), and each run_depreciation_period call through
// runFor(clientId, period). Records every query in order so tests can assert sequencing
// and bounds. dueFor/runFor may throw synchronously to simulate an infra fault.
function recordingClient({ surface = true, ids = [], dueFor = () => ({ due: false }), runFor = () => ({ status: "posted" }) } = {}) {
  const queries = [];
  const dueCalls = {};
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface }], rowCount: 1 });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })), rowCount: ids.length });
      if (/depreciation_run_due/.test(sql)) {
        try {
          const clientId = params[0];
          const i = (dueCalls[clientId] = (dueCalls[clientId] ?? 0) + 1);
          return Promise.resolve({ rows: [{ r: dueFor(clientId, i) }], rowCount: 1 });
        } catch (err) {
          return Promise.reject(err);
        }
      }
      if (/^select clara\.run_depreciation_period\(/.test(sql)) {
        try {
          const [clientId, periodStart, periodEnd] = params;
          return Promise.resolve({ rows: [{ r: runFor(clientId, { periodStart, periodEnd }) }], rowCount: 1 });
        } catch (err) {
          return Promise.reject(err);
        }
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

test("feature-detect absent (pre-0041): a clean no-op, never a failure — no client discovery at all", async () => {
  const client = recordingClient({ surface: false });
  const out = await reconcileFaRuns(client, { log: () => {} });
  assert.deepEqual(out, { faOk: true, faExamined: 0, faPosted: 0, faNoop: 0, faFailed: 0, dormant: true });
  assert.equal(client.queries.filter((q) => /to_regprocedure/.test(q.sql)).length, 1, "the feature-detect probe itself still runs, every cycle");
  assert.ok(!client.queries.some((q) => /from clara\.clients/.test(q.sql)), "no client discovery when the surface is absent");
});

test("surface present, nothing due for any client: every client examined, run_depreciation_period never called", async () => {
  const ids = ["c1", "c2", "c3"];
  const client = recordingClient({ ids, dueFor: () => ({ due: false }) });
  const out = await reconcileFaRuns(client, { log: () => {} });
  assert.equal(out.faOk, true);
  assert.equal(out.faExamined, 3);
  assert.equal(out.faPosted, 0);
  assert.equal(out.faFailed, 0);
  assert.equal(out.dormant, false);
  assert.ok(!client.queries.some((q) => /^select clara\.run_depreciation_period\(/.test(q.sql)), "due:false never calls the run verb");
});

test("a single overdue period clears: one run_depreciation_period call, op-key embeds client+period, no reset-role dance", async () => {
  const ids = ["c1"];
  const client = recordingClient({
    ids,
    dueFor: (id, i) => (i === 1 ? { due: true, period_start: "2026-01-01", period_end: "2026-01-31", cadence: "monthly" } : { due: false }),
    runFor: () => ({ status: "posted", entry_id: "e1", charged_cents: 1000, entries: 1, skipped: [] }),
  });
  const logs = [];
  const out = await reconcileFaRuns(client, { log: (m) => logs.push(m) });
  const runCalls = client.queries.filter((q) => /^select clara\.run_depreciation_period\(/.test(q.sql));
  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0].params.slice(0, 3), ["c1", "2026-01-01", "2026-01-31"]);
  assert.match(String(runCalls[0].params[3]), /^fa:c1:2026-01-01:.+/, "op-key embeds client id + period_start");
  assert.equal(out.faPosted, 1);
  assert.equal(out.faOk, true);
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — no login-direct dance");
  assert.ok(logs.some((m) => /fa run client=c1 period=2026-01-01\.\.2026-01-31 status=posted/.test(m)));
});

test("chains multiple overdue periods in ONE sweep while depreciation_run_due keeps answering due:true", async () => {
  const ids = ["c1"];
  const periods = ["2026-01-01", "2026-02-01", "2026-03-01"];
  const client = recordingClient({
    ids,
    dueFor: (id, i) => (i <= 3 ? { due: true, period_start: periods[i - 1], period_end: periods[i - 1], cadence: "monthly" } : { due: false }),
    runFor: () => ({ status: "posted" }),
  });
  const out = await reconcileFaRuns(client, { log: () => {} });
  const runCalls = client.queries.filter((q) => /^select clara\.run_depreciation_period\(/.test(q.sql));
  assert.equal(runCalls.length, 3, "three overdue months cleared in one sweep");
  assert.deepEqual(runCalls.map((q) => q.params[1]), periods, "cleared oldest-first, in the order depreciation_run_due named them");
  assert.equal(out.faPosted, 3);
  assert.equal(out.faOk, true);
});

test("bounded cap: a client stuck at due:true forever is capped per sweep, never an unbounded loop", async () => {
  const ids = ["stuck"];
  const client = recordingClient({
    ids,
    dueFor: () => ({ due: true, period_start: "2026-01-01", period_end: "2026-01-31" }),
    runFor: () => ({ status: "posted" }),
  });
  const out = await reconcileFaRuns(client, { log: () => {} });
  const runCalls = client.queries.filter((q) => /^select clara\.run_depreciation_period\(/.test(q.sql));
  assert.equal(runCalls.length, 24, "the per-client chase is capped at 24, never unbounded");
  assert.equal(out.faPosted, 24);
  assert.equal(out.faOk, true, "hitting the cap is not a failure — the remainder chases next sweep");
});

test("a THROWN depreciation_run_due probe is isolated: counted, the pass continues, faOk stays true (cadence law)", async () => {
  const ids = ["ok1", "boom", "ok2"];
  const client = recordingClient({
    ids,
    dueFor: (id) => {
      if (id === "boom") throw new Error("connection reset");
      return { due: false };
    },
  });
  const logs = [];
  const out = await reconcileFaRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.faExamined, 3, "every client still examined — one poison never abandons the rest");
  assert.equal(out.faFailed, 1);
  assert.equal(out.faOk, true, "a per-client failure must NOT gate the daily cadence — one poisoned client would otherwise re-run the belt every leader cycle");
  assert.ok(logs.some((m) => /fa run client=boom error: connection reset/.test(m)));
});

test("a THROWN run_depreciation_period call (a refusal) is isolated: that client's chase stops, the sweep continues", async () => {
  const client = recordingClient({
    ids: ["a", "b"],
    dueFor: (id, i) => (i === 1 ? { due: true, period_start: "2026-01-01", period_end: "2026-01-31" } : { due: false }),
    runFor: (id) => {
      if (id === "a") throw new Error("period_earlier_unmet");
      return { status: "posted" };
    },
  });
  const out = await reconcileFaRuns(client, { log: () => {} });
  assert.equal(out.faExamined, 2);
  assert.equal(out.faFailed, 1, "client a's refusal is counted");
  assert.equal(out.faPosted, 1, "client b still ran");
  assert.equal(out.faOk, true, "per-client refusals do not gate the daily cadence");
});

// [ROUND-3 fold] A 'noop' is a NON-FAILURE but it is NOT a post: it persists nothing — no
// entry, no receipt, no ledger row — so the period it was asked for is still unmet when the
// probe is re-asked. Counting it as a post reported N "posts" for N acts that changed nothing,
// and chasing on regardless burned the whole per-client cap every cycle. The ledger's small
// ("count noop separately from posted in the sweep log/receipt") makes it its own counter AND
// stops the chase.
test("a non-throwing 'noop' is counted SEPARATELY from a post and STOPS the chase — it persists nothing, so re-asking would spin", async () => {
  const client = recordingClient({
    ids: ["c1"],
    dueFor: () => ({ due: true, period_start: "2026-01-01", period_end: "2026-01-31" }),
    runFor: () => ({ status: "noop", client_id: "c1", period_start: "2026-01-01", period_end: "2026-01-31" }),
  });
  const out = await reconcileFaRuns(client, { log: () => {} });
  assert.equal(out.faNoop, 1, "the noop is counted on its own axis");
  assert.equal(out.faPosted, 0, "…and never as a post — nothing was persisted");
  assert.equal(out.faFailed, 0, "…it is not a failure either");
  assert.equal(out.faOk, true, "…so the daily cadence is not gated by it");
  // due stays true forever here: without the break this would run the full FA_PERIOD_CAP.
  // The pattern is ANCHORED (the file's own idiom) because the feature-detect probe carries
  // the verb's name inside its to_regprocedure literal and would otherwise be miscounted.
  assert.equal(
    client.queries.filter((q) => /^select clara\.run_depreciation_period\(/.test(q.sql)).length, 1,
    "the run verb is called EXACTLY once — a noop breaks the per-client chase instead of burning the 24-call cap",
  );
});

test("client discovery throw: faOk:false, a whole-belt failure", async () => {
  const client = {
    queries: [],
    query(sql) {
      this.queries.push({ sql: String(sql).trim() });
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface: true }] });
      if (/from clara\.clients/.test(sql)) return Promise.reject(new Error("connection reset"));
      return Promise.resolve({ rows: [] });
    },
  };
  const logs = [];
  const out = await reconcileFaRuns(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { faOk: false, faExamined: 0, faPosted: 0, faNoop: 0, faFailed: 0, dormant: false });
  assert.ok(logs.some((m) => /fa runs client discovery error/.test(m)));
});

test("runReconcilerSweep runs the FA belt ONLY when the leader flags it due (the prune idiom)", async () => {
  const due = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false }) });
  const sweptDue = await runReconcilerSweep(due, { ...sweepDeps, faRuns: true });
  assert.equal(sweptDue.faOk, true);
  assert.equal(sweptDue.faExamined, 1);
  assert.ok(due.queries.some((q) => /to_regprocedure/.test(q.sql)), "due → the feature-detect probe runs");

  const notDue = recordingClient({ ids: ["c1"] });
  const sweptNotDue = await runReconcilerSweep(notDue, { ...sweepDeps });
  assert.equal(sweptNotDue.faOk, undefined, "not due → no FA receipt in the sweep result");
  assert.ok(!notDue.queries.some((q) => /to_regprocedure/.test(q.sql)), "not due → not invoked at all");
});

test("an FA discovery failure never blocks the rest of the sweep (the sweep resolves, faOk:false)", async () => {
  const client = {
    queries: [],
    query(sql) {
      this.queries.push({ sql: String(sql).trim() });
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface: true }] });
      if (/from clara\.clients/.test(sql)) return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [] });
    },
  };
  const swept = await runReconcilerSweep(client, { ...sweepDeps, faRuns: true, prune: true });
  assert.equal(swept.faOk, false, "the leader sees the failure and retries next cycle");
  assert.equal(typeof swept.spoolRemoved, "number", "the sweep completed the earlier passes");
  assert.equal(typeof swept.pruned, "number", "a pass AFTER the failed FA belt still completed");
});

test("the daily cadence guard: due at boot, guarded within the interval, due after it", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  assert.equal(depreciationRunDue(0, now, DAY), true, "first cycle after (re)boot runs it (a cheap no-op pre-0041)");
  assert.equal(depreciationRunDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(depreciationRunDue(now, now + DAY, DAY), true, "a day later — due again");
});

test("junk-env fallback: a NaN CLARA_FA_RECONCILE_MS falls back to a FINITE 24h (never silently disables the belt)", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  // With the junk env set at the top of the file, the module-level default interval must be a
  // finite 24h — so the default-interval due-check behaves exactly like the explicit-24h one.
  // A NaN default would make BOTH of these false (NaN comparisons are always false).
  assert.equal(depreciationRunDue(0, now), true, "default interval is finite → due at boot");
  assert.equal(depreciationRunDue(now, now + DAY + 1), true, "default interval is ~24h → due a day later");
  assert.equal(depreciationRunDue(now, now + 1000), false, "default interval is finite → guarded moments later");
});
