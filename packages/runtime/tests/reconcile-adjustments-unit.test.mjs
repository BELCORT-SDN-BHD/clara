// Wave D-b §2.3/§2.7 — the adjustment-occurrence daily belt (lib/reconciler-adjustments.mjs +
// lib/leader.mjs), PURE (mocked client, scratch spool — no DB; the reconcile-fa-unit.test.mjs /
// reconcile-sst-unit.test.mjs / reconcile-autopost-unit.test.mjs precedent). Proves: the
// per-cycle EXACT-SIGNATURE feature-detect over BOTH clara.adjustment_run_due(uuid) and
// clara.run_adjustment_occurrence(uuid,uuid,date,date,text) (dormant no-op, never a failure,
// when 0045 is absent — the runtime-image-first ceremony order), the DB-owned
// adjustment_run_due probe deciding due-ness (never client-side arithmetic), the bounded
// per-client chase that clears several due templates in one sweep, per-client error isolation
// (a poisoned client is counted, never gates the belt's daily cadence), the plain group-role
// call (no reset-role dance), the op-key shape (the `adj:<client>:<template>:<period_start>:
// <rand8>` prefix — the random suffix load-bearing per ABI §E), the runReconcilerSweep
// flag-gating, and the daily-cadence guard INCLUDING the junk-env fallback (a NaN interval
// must never silently disable the belt).

// The junk-env fallback: set a garbage cadence BEFORE leader.mjs loads (a dynamic import
// after, so the module reads this env). It must fall back to a FINITE 24h, never NaN.
process.env.CLARA_ADJ_RECONCILE_MS = "not-a-number";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileAdjustmentRuns, runReconcilerSweep } from "../lib/reconciler.mjs";

const { adjustmentRunDue } = await import("../lib/leader.mjs");

let scratch;
let previousSpool;
before(async () => {
  previousSpool = process.env.CLARA_SPOOL_DIR;
  scratch = await mkdtemp(join(tmpdir(), "clara-adj-unit-"));
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
// with `ids`, routes each per-client adjustment_run_due probe through dueFor(clientId,
// callIndex) (1-based, per client), and each run_adjustment_occurrence call through
// runFor(clientId, {templateId, periodStart, periodEnd}). Records every query in order so
// tests can assert sequencing and bounds. dueFor/runFor may throw synchronously to simulate
// an infra fault.
function recordingClient({ surface = true, ids = [], dueFor = () => ({ due: false }), runFor = () => ({ status: "posted" }) } = {}) {
  const queries = [];
  const dueCalls = {};
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: String(sql).trim(), params });
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface }], rowCount: 1 });
      if (/from clara\.clients/.test(sql)) return Promise.resolve({ rows: ids.map((id) => ({ id })), rowCount: ids.length });
      if (/adjustment_run_due/.test(sql)) {
        try {
          const clientId = params[0];
          const i = (dueCalls[clientId] = (dueCalls[clientId] ?? 0) + 1);
          return Promise.resolve({ rows: [{ r: dueFor(clientId, i) }], rowCount: 1 });
        } catch (err) {
          return Promise.reject(err);
        }
      }
      if (/^select clara\.run_adjustment_occurrence\(/.test(sql)) {
        try {
          const [clientId, templateId, periodStart, periodEnd] = params;
          return Promise.resolve({ rows: [{ r: runFor(clientId, { templateId, periodStart, periodEnd }) }], rowCount: 1 });
        } catch (err) {
          return Promise.reject(err);
        }
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

test("feature-detect absent (pre-0045): a clean no-op, never a failure — no client discovery at all", async () => {
  const client = recordingClient({ surface: false });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  assert.deepEqual(out, { adjOk: true, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: true, adjBlockedClients: 0, adjTransientBlockedClients: 0 });
  assert.equal(client.queries.filter((q) => /to_regprocedure/.test(q.sql)).length, 1, "the feature-detect probe itself still runs, every cycle");
  assert.ok(client.queries[0].sql.includes("clara.adjustment_run_due(uuid)"), "the probe names the exact due-oracle signature");
  assert.ok(
    client.queries[0].sql.includes("clara.run_adjustment_occurrence(uuid,uuid,date,date,text)"),
    "the probe names the exact poster signature",
  );
  assert.ok(!client.queries.some((q) => /from clara\.clients/.test(q.sql)), "no client discovery when the surface is absent");
});

test("surface present, nothing due for any client: every client examined, run_adjustment_occurrence never called", async () => {
  const ids = ["c1", "c2", "c3"];
  const client = recordingClient({ ids, dueFor: () => ({ due: false }) });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  assert.equal(out.adjOk, true);
  assert.equal(out.adjExamined, 3);
  assert.equal(out.adjPosted, 0);
  assert.equal(out.adjDrafted, 0);
  assert.equal(out.adjFailed, 0);
  assert.equal(out.adjDormant, false);
  assert.ok(!client.queries.some((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql)), "due:false never calls the run verb");
});

// [round-8 F2] A well-formed {due:false, reason:'nothing_due'} answer is the ORDINARY "caught
// up" case and must stay quiet — the negative control for the two anomalous-state cells below
// (the abnormal-shape log and the all_blocked count), both of which must NOT fire here.
test("a well-formed due:false/nothing_due answer logs NOTHING beyond the ordinary summary line, and adjBlockedClients stays 0 — no noise on a healthy cycle", async () => {
  const client = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false, reason: "nothing_due", blocked: [] }) });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.adjOk, true);
  assert.equal(out.adjBlockedClients, 0);
  assert.ok(!logs.some((m) => /unexpected shape/.test(m)), "a legitimate not-due answer must never be logged as anomalous");
  assert.ok(!logs.some((m) => /all_blocked/.test(m)), "a genuine 'caught up' answer must never be logged as blocked");
});

// [round-8 F2] An ANOMALOUS due-probe answer (missing/malformed `due`) is INDISTINGUISHABLE
// from a healthy "nothing due" client under the old `due?.due !== true` break alone — the
// exact concealment shape round-7 named and cured in reconciler-fa.mjs (E3), cloned here.
for (const [label, malformed] of [
  ["an empty object (e.g. a due-probe that returned no row)", {}],
  ["a due-probe answering the wrong shape entirely", { ok: true }],
  ["a due key that is truthy but not boolean-true", { due: "true" }],
]) {
  test(`[round-8 F2] anomalous due-probe shape (${label}) is logged LOUD, not silently swallowed`, async () => {
    const client = recordingClient({ ids: ["c1"], dueFor: () => malformed });
    const logs = [];
    const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
    assert.equal(out.adjOk, true, "an anomalous shape must not crash or fail the belt's cadence");
    assert.equal(out.adjExamined, 1);
    assert.equal(out.adjPosted, 0);
    assert.equal(out.adjBlockedClients, 0, "an anomalous shape is not the all_blocked state — it must not be double-counted as one");
    assert.ok(
      !client.queries.some((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql)),
      "an anomalous (non-due:true) shape must never be chased into the run verb",
    );
    assert.ok(
      logs.some((m) => /adjustment run client=c1 due-probe returned an unexpected shape/.test(m) && m.includes(JSON.stringify(malformed))),
      `the anomalous shape must be named in the log verbatim (got: ${JSON.stringify(logs)})`,
    );
  });
}

// [round-8 F2] THE SECOND silent state the FA belt does not carry: {due:false,
// reason:'all_blocked'} reads, under the bare `due?.due !== true` break alone, exactly like a
// healthy "nothing due" client — but every live template is terminally stuck, not caught up.
//
// [round-9 fix wave, lane N2; r9 finding 8, LOW] all_blocked ITSELF MIXES TWO KINDS — this
// client (c1) carries BOTH a transient row (occurrence_draft_outstanding, t1) and a terminal
// row (template_line_ineligible, t2) in the SAME cycle, so the split must fire on BOTH axes
// for the one client, each naming only its own kind's rows.
test("[round-8 F2 / round-9 F5] all_blocked is counted on its OWN axis (never adjFailed — nothing threw), SPLIT by kind, and each split is logged with only ITS OWN blocked[] rows", async () => {
  const blocked = [{ template_id: "t1", reason: "occurrence_draft_outstanding" }, { template_id: "t2", reason: "template_line_ineligible" }];
  const client = recordingClient({ ids: ["c1", "c2"], dueFor: (id) => (id === "c1" ? { due: false, reason: "all_blocked", blocked } : { due: false, reason: "nothing_due", blocked: [] }) });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.adjOk, true, "all_blocked is not a failure — it must not gate the daily cadence");
  assert.equal(out.adjExamined, 2);
  assert.equal(out.adjFailed, 0, "nothing threw — all_blocked must never land on adjFailed");
  assert.equal(out.adjBlockedClients, 1, "the TERMINAL axis counts c1 (it carries a terminal row)");
  assert.equal(out.adjTransientBlockedClients, 1, "the TRANSIENT axis ALSO counts c1 (it carries a transient row too) — the two axes are independent, not mutually exclusive");
  assert.ok(
    !client.queries.some((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql)),
    "all_blocked never calls the run verb — there is nothing admissible to run",
  );
  const terminalLine = logs.find((m) => /adjustment run client=c1 all_blocked \(terminal\)/.test(m));
  const transientLine = logs.find((m) => /adjustment run client=c1 all_blocked \(transient\)/.test(m));
  assert.ok(terminalLine, `the terminal split must be logged (got: ${JSON.stringify(logs)})`);
  assert.ok(transientLine, `the transient split must be logged separately (got: ${JSON.stringify(logs)})`);
  assert.ok(terminalLine.includes("template_line_ineligible") && !terminalLine.includes("occurrence_draft_outstanding"), "the terminal line must name only the terminal row, never the transient one");
  assert.ok(transientLine.includes("occurrence_draft_outstanding") && !transientLine.includes("template_line_ineligible"), "the transient line must name only the transient row, never the terminal one");
  assert.ok(!logs.some((m) => /client=c2 all_blocked/.test(m)), "c2's genuine nothing_due must not be miscounted as blocked");
});

// [round-9 fix wave, lane N2; r9 finding 8, LOW] THE POSITIVE CONTROL FOR THE SPLIT: a client
// blocked ONLY on the transient reason — the belt's OWN expected output the cycle after it
// drafts a catch-up occurrence nobody has approved yet (design SS2.3) — is a HEALTHY firm, not
// a stuck one. MEASURED on a real 60-client lane pass: allBlocked=5, every one naming ONLY
// occurrence_draft_outstanding. It must never land on the TERMINAL/alarm axis.
test("[round-9 F5] a client blocked ONLY on occurrence_draft_outstanding (transient) never counts on the terminal alarm axis", async () => {
  const blocked = [{ template_id: "t1", reason: "occurrence_draft_outstanding" }];
  const client = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false, reason: "all_blocked", blocked }) });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.adjOk, true);
  assert.equal(out.adjBlockedClients, 0, "transient-only must NOT count on the terminal/alarm axis — an ordinary drafted-yesterday-awaiting-approval client is not stuck");
  assert.equal(out.adjTransientBlockedClients, 1, "…but it IS counted on its own quiet axis, so the belt's own expected output is still visible");
  assert.ok(!logs.some((m) => /client=c1 all_blocked \(terminal\)/.test(m)), "no terminal log line when nothing terminal is blocked");
  assert.ok(logs.some((m) => /client=c1 all_blocked \(transient\)/.test(m) && m.includes("occurrence_draft_outstanding")), "the transient split is still logged, on its own quiet wording");
});

// [round-9 fix wave, lane N2; r9 finding 8, LOW] THE NEGATIVE CONTROL: a client blocked ONLY on
// a terminal reason (no transient row at all) must count on the terminal axis and leave the
// transient axis untouched — the split must not manufacture a transient count out of nothing.
test("[round-9 F5] a client blocked ONLY on a terminal reason counts on the terminal axis alone", async () => {
  const blocked = [{ template_id: "t1", reason: "period_shape_already_met" }];
  const client = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false, reason: "all_blocked", blocked }) });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  assert.equal(out.adjBlockedClients, 1);
  assert.equal(out.adjTransientBlockedClients, 0, "no transient row was present — the transient axis must stay at 0, not inherit the terminal count");
});

// [round-9 fix wave, lane N2; r9 finding 8, LOW] THE THIRD named shape: {due:false,
// reason:'client_not_found'} — the due-probe asking about a client activeClientIds JUST
// listed, and the DB not resolving it. Before this fix it fell through BOTH the anomalous-
// shape branch (due:false IS present) and the all_blocked branch (the reason does not match),
// landing byte-identical to a healthy nothing_due — a broken premise reading as idleness.
test("[round-9 F5] client_not_found is named in the log, distinctly from both nothing_due and all_blocked, and never counted as blocked", async () => {
  const client = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false, reason: "client_not_found" }) });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.adjOk, true, "client_not_found must not crash or fail the belt's cadence");
  assert.equal(out.adjBlockedClients, 0, "client_not_found is a broken premise, not a blocked template — it must not inflate the terminal axis");
  assert.equal(out.adjTransientBlockedClients, 0, "…nor the transient axis");
  assert.ok(
    logs.some((m) => /client=c1 due-probe reports client_not_found/.test(m)),
    `client_not_found must be named in the log, not silently read as idle (got: ${JSON.stringify(logs)})`,
  );
  assert.ok(!logs.some((m) => /all_blocked/.test(m)), "client_not_found must never be logged as all_blocked");
});

test("a single due occurrence clears: one run_adjustment_occurrence call, op-key embeds client+template+period, no reset-role dance", async () => {
  const ids = ["c1"];
  const client = recordingClient({
    ids,
    dueFor: (id, i) => (i === 1 ? { due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31" } : { due: false }),
    runFor: () => ({ status: "posted", entry_id: "e1", run_id: "r1", mode: "post" }),
  });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  const runCalls = client.queries.filter((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql));
  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0].params.slice(0, 4), ["c1", "t1", "2026-01-01", "2026-01-31"]);
  assert.match(String(runCalls[0].params[4]), /^adj:c1:t1:2026-01-01:.+/, "op-key embeds client id + template id + period_start");
  assert.equal(out.adjPosted, 1);
  assert.equal(out.adjDrafted, 0);
  assert.equal(out.adjOk, true);
  assert.ok(!client.queries.some((q) => /reset role/.test(q.sql)), "group-granted fn — no login-direct dance");
  assert.ok(logs.some((m) => /adjustment run client=c1 template=t1 period=2026-01-01\.\.2026-01-31 status=posted/.test(m)));
});

test("a 'drafted' outcome is counted separately from 'posted' and does NOT abort the chase — the DB's own blocked[] naturally excludes the drafted template next probe", async () => {
  const ids = ["c1"];
  // Two independent due templates: t1 drafts (its own outstanding-draft predicate then
  // blocks it), t2 then surfaces as due and posts. The mock simulates the DB's blocked[]
  // exclusion by simply never re-offering t1 after call 1.
  const client = recordingClient({
    ids,
    dueFor: (id, i) => {
      if (i === 1) return { due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31" };
      if (i === 2) return { due: true, template_id: "t2", period_start: "2026-01-01", period_end: "2026-01-31" };
      return { due: false };
    },
    runFor: (id, { templateId }) => (templateId === "t1" ? { status: "drafted", entry_id: "e1", mode: "draft" } : { status: "posted", entry_id: "e2", mode: "post" }),
  });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  const runCalls = client.queries.filter((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql));
  assert.equal(runCalls.length, 2, "both independently-due templates fire in the SAME sweep");
  assert.equal(out.adjDrafted, 1);
  assert.equal(out.adjPosted, 1);
  assert.equal(out.adjOk, true);
});

test("chains multiple due occurrences in ONE sweep while adjustment_run_due keeps answering due:true", async () => {
  const ids = ["c1"];
  const templates = ["t1", "t2", "t3"];
  const client = recordingClient({
    ids,
    dueFor: (id, i) => (i <= 3 ? { due: true, template_id: templates[i - 1], period_start: "2026-01-01", period_end: "2026-01-31" } : { due: false }),
    runFor: () => ({ status: "posted" }),
  });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  const runCalls = client.queries.filter((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql));
  assert.equal(runCalls.length, 3, "three due templates cleared in one sweep");
  assert.deepEqual(runCalls.map((q) => q.params[1]), templates, "run in the order adjustment_run_due named them");
  assert.equal(out.adjPosted, 3);
  assert.equal(out.adjOk, true);
});

test("bounded cap: a client stuck at due:true forever is capped per sweep, never an unbounded loop", async () => {
  const ids = ["stuck"];
  const client = recordingClient({
    ids,
    dueFor: () => ({ due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31" }),
    runFor: () => ({ status: "posted" }),
  });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  const runCalls = client.queries.filter((q) => /^select clara\.run_adjustment_occurrence\(/.test(q.sql));
  assert.equal(runCalls.length, 24, "the per-client chase is capped at 24, never unbounded");
  assert.equal(out.adjPosted, 24);
  assert.equal(out.adjOk, true, "hitting the cap is not a failure — the remainder chases next sweep");
});

test("a THROWN adjustment_run_due probe is isolated: counted, the pass continues, adjOk stays true (cadence law)", async () => {
  const ids = ["ok1", "boom", "ok2"];
  const client = recordingClient({
    ids,
    dueFor: (id) => {
      if (id === "boom") throw new Error("connection reset");
      return { due: false };
    },
  });
  const logs = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.equal(out.adjExamined, 3, "every client still examined — one poison never abandons the rest");
  assert.equal(out.adjFailed, 1);
  assert.equal(out.adjOk, true, "a per-client failure must NOT gate the daily cadence — one poisoned client would otherwise re-run the belt every leader cycle");
  assert.ok(logs.some((m) => /adjustment run client=boom error: connection reset/.test(m)));
});

test("a THROWN run_adjustment_occurrence call (a refusal) is isolated: that client's chase stops, the sweep continues", async () => {
  const client = recordingClient({
    ids: ["a", "b"],
    dueFor: (id, i) => (i === 1 ? { due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31" } : { due: false }),
    runFor: (id) => {
      if (id === "a") throw new Error("period_already_met");
      return { status: "posted" };
    },
  });
  const out = await reconcileAdjustmentRuns(client, { log: () => {} });
  assert.equal(out.adjExamined, 2);
  assert.equal(out.adjFailed, 1, "client a's refusal is counted");
  assert.equal(out.adjPosted, 1, "client b still ran");
  assert.equal(out.adjOk, true, "per-client refusals do not gate the daily cadence");
});

test("client discovery throw: adjOk:false, a whole-belt failure", async () => {
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
  const out = await reconcileAdjustmentRuns(client, { log: (m) => logs.push(m) });
  assert.deepEqual(out, { adjOk: false, adjExamined: 0, adjPosted: 0, adjDrafted: 0, adjFailed: 0, adjDormant: false, adjBlockedClients: 0, adjTransientBlockedClients: 0 });
  assert.ok(logs.some((m) => /adjustment runs client discovery error/.test(m)));
});

test("runReconcilerSweep runs the adjustment belt ONLY when the leader flags it due (the prune idiom)", async () => {
  const due = recordingClient({ ids: ["c1"], dueFor: () => ({ due: false }) });
  const sweptDue = await runReconcilerSweep(due, { ...sweepDeps, adjRuns: true });
  assert.equal(sweptDue.adjOk, true);
  assert.equal(sweptDue.adjExamined, 1);
  assert.ok(due.queries.some((q) => /to_regprocedure/.test(q.sql)), "due → the feature-detect probe runs");

  const notDue = recordingClient({ ids: ["c1"] });
  const sweptNotDue = await runReconcilerSweep(notDue, { ...sweepDeps });
  assert.equal(sweptNotDue.adjOk, undefined, "not due → no adjustment receipt in the sweep result");
  assert.ok(!notDue.queries.some((q) => /to_regprocedure/.test(q.sql)), "not due → not invoked at all");
});

test("an adjustment discovery failure never blocks the rest of the sweep (the sweep resolves, adjOk:false)", async () => {
  const client = {
    queries: [],
    query(sql) {
      this.queries.push({ sql: String(sql).trim() });
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface: true }] });
      if (/from clara\.clients/.test(sql)) return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [] });
    },
  };
  const swept = await runReconcilerSweep(client, { ...sweepDeps, adjRuns: true, prune: true });
  assert.equal(swept.adjOk, false, "the leader sees the failure and retries next cycle");
  assert.equal(typeof swept.spoolRemoved, "number", "the sweep completed the earlier passes");
  assert.equal(typeof swept.pruned, "number", "a pass AFTER the failed adjustment belt still completed");
});

test("runReconcilerSweep never lets the D-a and D-b belts collide on a shared result key (fresh adj*/dormant naming)", async () => {
  // surface:false ⇒ BOTH belts short-circuit dormant BEFORE any client-discovery query, so
  // this exercises exactly the FA-precedent shape and the D-b shape side by side with no
  // ambiguity about which mock branch answered which probe.
  const client = recordingClient({ surface: false });
  const swept = await runReconcilerSweep(client, { ...sweepDeps, faRuns: true, adjRuns: true });
  assert.equal(swept.faOk, true, "the FA belt's own receipt survives the merge");
  assert.equal(swept.dormant, true, "…including its unprefixed 'dormant' key (0041 absent in this mock)");
  assert.equal(swept.adjOk, true, "the adjustment belt's own receipt survives the merge");
  assert.equal(swept.adjDormant, true, "…under its OWN adjDormant key — it never overwrites or is overwritten by fa's 'dormant'");
});

test("the daily cadence guard: due at boot, guarded within the interval, due after it", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  assert.equal(adjustmentRunDue(0, now, DAY), true, "first cycle after (re)boot runs it (a cheap no-op pre-0045)");
  assert.equal(adjustmentRunDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(adjustmentRunDue(now, now + DAY, DAY), true, "a day later — due again");
});

test("junk-env fallback: a NaN CLARA_ADJ_RECONCILE_MS falls back to a FINITE 24h (never silently disables the belt)", () => {
  const DAY = 24 * 3600000;
  const now = 1_000_000_000_000;
  // With the junk env set at the top of the file, the module-level default interval must be a
  // finite 24h — so the default-interval due-check behaves exactly like the explicit-24h one.
  // A NaN default would make BOTH of these false (NaN comparisons are always false).
  assert.equal(adjustmentRunDue(0, now), true, "default interval is finite → due at boot");
  assert.equal(adjustmentRunDue(now, now + DAY + 1), true, "default interval is ~24h → due a day later");
  assert.equal(adjustmentRunDue(now, now + 1000), false, "default interval is finite → guarded moments later");
});
