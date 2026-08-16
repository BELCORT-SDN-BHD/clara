// PER-BELT FAILURE ISOLATION — the third time this repo has paid for the same shape, and the
// first time it is closed structurally rather than one edge at a time.
//
// THE SHAPE. runReconcilerSweep runs ~12 belts in sequence on one leader connection. Any belt
// that lets an exception escape aborts every belt SEQUENCED AFTER IT, and because the leader
// re-enters the sweep every ~2 seconds with the same durable rows, a PERSISTENT fault is not a
// blip: it is permanent starvation of everything downstream, by the very component whose job is
// to heal things. Twice already:
//   * the Section-I zombie — reconcileTasks section B's cancel edge, CLR10 on an autodraft task
//     (reconciler.mjs:170-183 tells the story);
//   * the §7-A F1 zombie — reconcileAutoDraftTasks's terminal settle, CLR11 (measured: 52
//     `LEADER cycle-error` lines in 25 minutes, five document tasks queued 19 minutes).
// Both were closed by adding one try/catch to the edge that had just bitten. This battery covers
// the edge that had NOT yet bitten (reconcileTasks section C's open-task settle) and, above it,
// the assembly-level containment that makes the CLASS unreachable rather than the instance.
//
// PURE mock-client unit tests (no DB, no world, no network) — the convention of
// reconcile-autodraft-cancel-unit.test.mjs and reconcile-autodraft-settle-unit.test.mjs, which
// closed the two prior instances of exactly this defect. A DB-backed cell cannot express these
// cases at all: the fixture required is "a row the database refuses, persistently, mid-sweep",
// which is a fault to be INJECTED, not a state to be seeded.
//
// THE ONE ERROR THAT MUST STILL ESCAPE is a taxonomy HALT: leader.mjs:218 turns it into
// onHalt → process.exit(2) (crash-only supervision), and a containment that ate it would convert
// an un-routable state into a silent, permanently degraded loop. Two cells hold that line, and a
// third proves they are not vacuous by showing a NON-halt error in the same position contained.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileTasks, runReconcilerSweep } from "../lib/reconciler.mjs";
import { reconcileFaRuns } from "../lib/reconciler-fa.mjs";
import { reconcileAdjustmentRuns } from "../lib/reconciler-adjustments.mjs";
import { reconcileRenderEnqueue } from "../lib/reconciler-render.mjs";
import { reconcileDocumentIntakes, reconcileDocumentTasks } from "../lib/reconciler-documents.mjs";
import { TaxonomyHaltError } from "../lib/relay.mjs";

process.env.CLARA_SPOOL_DIR = join(await mkdtemp(join(tmpdir(), "clara-belt-iso-")), "spool");

/** A scripted pg client for the CHAT-TURN sweeper.
 *
 *  `open` is section C's population: [{ id, status }] — each bound to a fake run whose engine
 *  status comes from the injected getRun. Sections A/B/D select nothing (their queries fall to
 *  the default empty answer), so a cell's assertions are unambiguously about section C.
 *
 *  `failOn(sql, params)` returns an Error to reject with, or null — the fault injector. Every
 *  query is recorded in order, so "the belt was skipped entirely" and "the sweep stopped here"
 *  are POSITIVE observations rather than inferences from a missing counter. */
function sweepClient({ open = [], failOn = () => null } = {}) {
  const queries = [];
  const calls = { settle: [], repair: [], heartbeat: 0 };
  return {
    queries,
    calls,
    query(sql, params) {
      const s = String(sql);
      queries.push({ sql: s.trim(), params });
      const boom = failOn(s, params);
      if (boom) return Promise.reject(boom);
      if (/runtime_heartbeats/.test(s)) {
        calls.heartbeat += 1;
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      // The repair UPDATE must be matched BEFORE section B's select — both mention
      // 'cancel_requested' and only the leading verb tells them apart.
      if (/^update clara\.agent_tasks set status = 'cancel_requested'/.test(s.trim())) {
        calls.repair.push(params[0]);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/status in \('running','awaiting_input'\)/.test(s)) {
        const rows = open.map((t) => ({ id: t.id, status: t.status, workflow_run_id: `wf-${t.id}` }));
        return Promise.resolve({ rows, rowCount: rows.length });
      }
      if (/settle_chat_turn/.test(s)) {
        const [taskId, , , outcome, errorCode] = params;
        calls.settle.push({ taskId, outcome, errorCode });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

/** A settle refusal spelled the way clara.settle_chat_turn raises one. */
function refusal(taskId) {
  const err = new Error(`settle refused for ${taskId}`);
  err.code = "CLR10";
  return err;
}

/** Settles ATTEMPTED, read off the query log — which records before the fault injector fires, so
 *  a refused attempt counts. `calls.settle` only sees the ones that got past it. */
const settleAttempts = (client) => client.queries.filter((q) => /settle_chat_turn/.test(q.sql));

const terminal = (status) => () => ({ status: Promise.resolve(status), cancel: async () => {} });
const chatDeps = (log, getRun = terminal("completed")) => ({
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun,
  log,
});

// ---------------------------------------------------------------------------
// Section C — the open-task settle edge. THE LOAD-BEARING CELL.
// ---------------------------------------------------------------------------

test("§C: a settle the DB REFUSES is isolated per task — the later ROWS still settle and the sweep never throws", async () => {
  const doomed = randomUUID();
  const healthy = randomUUID();
  const client = sweepClient({
    open: [{ id: doomed, status: "running" }, { id: healthy, status: "running" }],
    failOn: (sql, params) => (/settle_chat_turn/.test(sql) && params[0] === doomed ? refusal(doomed) : null),
  });
  const log = [];

  let out;
  await assert.doesNotReject(async () => {
    out = await reconcileTasks(client, chatDeps((m) => log.push(m)));
  }, "a §C settle failure must never throw out of reconcileTasks — THAT THROW IS THE INCIDENT SHAPE:"
   + " it propagates through runReconcilerSweep and aborts every belt behind it, every ~2s, forever");

  // ISOLATION, not merely survival. The doomed row is FIRST, so a pass that stopped at the
  // failure would leave the healthy one unsettled and STILL look non-throwing.
  const attempts = settleAttempts(client);
  assert.equal(attempts.length, 2, "both rows reached the settle — one failure does not end the pass");
  assert.deepEqual(attempts.map((q) => q.params[0]), [doomed, healthy], "…in order, the doomed one FIRST");
  assert.equal(out.settledTerminal, 1, "only the healthy row settled, and only it is counted");
  assert.deepEqual(client.calls.settle.map((c) => c.taskId), [healthy], "the refused settle never reached the DB's success path");
  const lines = log.filter((m) => m.includes(doomed));
  assert.equal(lines.length, 1, `exactly one log line names the failing task (got ${JSON.stringify(log)})`);
  assert.match(lines[0], /settle refused/, "the log carries the DB's own reason, not a generic message");
  assert.match(lines[0], /status=running engine=completed/, "…and the pair that produced it, for diagnosis");
  assert.equal(log.filter((m) => m.includes(healthy)).length, 0, "the row that settled cleanly is not logged as a failure");
});

test("§C: the FX5 repair branch is isolated too — and a half-applied repair does NOT fall through to the matrix", async () => {
  // running + engine 'cancelled' takes the two-step repair path (UPDATE to cancel_requested,
  // then settle). The UPDATE lands, the settle is refused: the ROW is now 'cancel_requested'
  // while the snapshot still says 'running'.
  const doomed = randomUUID();
  const healthy = randomUUID();
  const client = sweepClient({
    open: [{ id: doomed, status: "running" }, { id: healthy, status: "running" }],
    failOn: (sql, params) => (/settle_chat_turn/.test(sql) && params[0] === doomed ? refusal(doomed) : null),
  });
  const log = [];
  const out = await reconcileTasks(client, chatDeps((m) => log.push(m), terminal("cancelled")));

  assert.deepEqual(client.calls.repair, [doomed, healthy], "both rows took the repair txn");
  assert.equal(out.settledTerminal, 1, "the healthy row completed its two-step repair");
  assert.equal(log.filter((m) => m.includes(doomed)).length, 1, "the failure is logged exactly once");
  // The `continue` lives OUTSIDE the catch. If it did not, the doomed row would fall through to
  // terminalFor('running','cancelled') → null → a SECOND, misleading line about a status the row
  // no longer has.
  assert.equal(log.filter((m) => /no legal terminal/.test(m)).length, 0,
    "a half-applied repair is not re-judged against a stale status — no spurious 'no legal terminal' line");
});

test("§C: the LATER BELTS still run — the starvation cell, at the shape the leader actually awaits", async () => {
  const doomed = randomUUID();
  const healthy = randomUUID();
  const client = sweepClient({
    open: [{ id: doomed, status: "running" }, { id: healthy, status: "running" }],
    failOn: (sql, params) => (/settle_chat_turn/.test(sql) && params[0] === doomed ? refusal(doomed) : null),
  });
  const log = [];

  let swept;
  await assert.doesNotReject(async () => {
    swept = await runReconcilerSweep(client, chatDeps((m) => log.push(m)));
  }, "runReconcilerSweep is what the leader awaits — one un-settleable task is a task-level fault, never a cycle-level one");

  assert.equal(swept.settledTerminal, 1, "the sweep's own receipt shows the healthy row settled");
  assert.deepEqual(swept.beltErrors, [], "the failure was contained AT THE ITEM, so no belt is named as having escaped");
  // Keys only a belt sequenced AFTER reconcileTasks can contribute. A sweep that aborted at the
  // settle could not have produced them.
  assert.ok("documentReenqueued" in swept, "the document belt ran after the fault");
  assert.ok("documentIntakesExpired" in swept, "…and the intake belt");
  assert.equal(typeof swept.spoolRemoved, "number", "…and the spool TTL sweep, last of the unconditional passes");
});

// ---------------------------------------------------------------------------
// Assembly level — one belt's escape must not starve the belts behind it.
// ---------------------------------------------------------------------------

test("assembly: a belt that THROWS is named in beltErrors and the belts behind it still run that cycle", async () => {
  // The §C SELECT itself is bare (a belt-level read, legitimately so) — this is a whole-belt
  // escape, not a per-item one, and it is the case the assembly wrapper exists for.
  const client = sweepClient({
    failOn: (sql) => (/status in \('running','awaiting_input'\)/.test(sql) ? new Error("relation is being rebuilt") : null),
  });
  const log = [];

  let swept;
  await assert.doesNotReject(async () => {
    swept = await runReconcilerSweep(client, chatDeps((m) => log.push(m)));
  }, "a whole-belt failure must cost that belt this cycle and nothing else");

  assert.deepEqual(swept.beltErrors, ["task reconcile"], "the failed belt is NAMED — visible in the receipt, not only in the log");
  assert.ok(log.some((m) => /\[reconcile\] task reconcile error: relation is being rebuilt/.test(m)),
    `the estate's own '[reconcile] <belt> error:' idiom (got ${JSON.stringify(log)})`);
  assert.equal(swept.settledTerminal, undefined,
    "a failed belt contributes NO counters — a zeroed fallback would claim 'nothing to settle' where the truth is 'we do not know'");
  assert.ok("documentReenqueued" in swept, "the belts behind it ran");
  assert.equal(typeof swept.spoolRemoved, "number", "…all the way to the last unconditional pass");
});

test("assembly: heartbeatOk + an EMPTY beltErrors on a clean sweep — the failure cells above are not passing vacuously", async () => {
  const client = sweepClient({ open: [{ id: randomUUID(), status: "running" }] });
  const swept = await runReconcilerSweep(client, chatDeps(() => {}));
  assert.equal(swept.heartbeatOk, true);
  assert.deepEqual(swept.beltErrors, []);
  assert.equal(swept.settledTerminal, 1, "and the healthy path genuinely did the work");
});

// ---------------------------------------------------------------------------
// The HALT line — the one error containment may never eat.
// ---------------------------------------------------------------------------

test("HALT: a TaxonomyHaltError from a belt ESCAPES the sweep — the leader owns it (onHalt → exit 2)", async () => {
  const halt = new TaxonomyHaltError("active taxonomy pointer is missing — refusing to advance");
  const client = sweepClient({
    failOn: (sql) => (/status in \('running','awaiting_input'\)/.test(sql) ? halt : null),
  });
  const log = [];
  const thrown = await runReconcilerSweep(client, chatDeps((m) => log.push(m))).then(
    () => null,
    (e) => e,
  );
  // The IDENTITY, not the spelling: leader.mjs:218 tests `err instanceof TaxonomyHaltError`, so
  // what escapes must be that very class from that very module — a look-alike would be caught by
  // the leader's transient branch and logged forever instead of exiting.
  assert.ok(thrown instanceof TaxonomyHaltError, `a halt must propagate (got ${thrown?.name}: ${thrown?.message})`);
  assert.equal(thrown, halt, "the SAME error object, unwrapped and unrenamed");
  assert.equal(log.filter((m) => /task reconcile error/.test(m)).length, 0, "and it is NOT logged as a contained belt error");
});

test("HALT: the `err.halt` flag form escapes too — including from a wrap that predates this change", async () => {
  // leader.mjs:218 tests `err instanceof TaxonomyHaltError || err?.halt`. Both arms must hold, and
  // this cell drives the SECOND arm through the intake-recovery wrap that already existed — the
  // conversion to the shared wrapper must not have left any belt able to eat a halt.
  const flagged = new Error("halting");
  flagged.halt = true;
  const client = sweepClient();
  const thrown = await runReconcilerSweep(client, {
    ...chatDeps(() => {}),
    recoverDocumentIntakes: async () => {
      throw flagged;
    },
  }).then(() => null, (e) => e);
  assert.equal(thrown, flagged, "the flag form propagates from a pre-existing wrap as well as from the new ones");
});

test("HALT: the contrast — an ORDINARY error in the same position is contained, so the two cells above are load-bearing", async () => {
  const client = sweepClient();
  const swept = await runReconcilerSweep(client, {
    ...chatDeps(() => {}),
    recoverDocumentIntakes: async () => {
      throw new Error("artifact store unreachable");
    },
  });
  assert.deepEqual(swept.beltErrors, ["intake artifact recovery"], "no halt flag ⇒ contained and named");
  assert.equal(swept.recovered, 0, "…and the wrap's documented fallback shape survives");
});

// ---------------------------------------------------------------------------
// The feature-detect probes — "absent" and "unreadable" must not report the same thing.
// ---------------------------------------------------------------------------

/** A client whose to_regprocedure probe REJECTS; everything else answers empty. */
function probeFailsClient(message = "connection reset") {
  const queries = [];
  return {
    queries,
    query(sql) {
      queries.push({ sql: String(sql).trim() });
      if (/to_regprocedure/.test(sql)) return Promise.reject(new Error(message));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

test("FA probe: an unreadable catalog read is faOk:FALSE and dormant:FALSE — it never parks the daily cadence for 24h", async () => {
  const client = probeFailsClient();
  const log = [];
  const out = await reconcileFaRuns(client, { log: (m) => log.push(m) });
  assert.equal(out.faOk, false, "leader.mjs:194 advances lastFaRun only on a truthy faOk — false means retry next cycle");
  assert.equal(out.dormant, false, "a failed read is NOT a missing 0041; reporting dormant would be a lie the leader believes for a day");
  assert.ok(log.some((m) => /fa surface probe error: connection reset/.test(m)), "the skip is logged with the cause");
  assert.ok(!client.queries.some((q) => /from clara\.clients/.test(q.sql)), "the belt is skipped whole — no client is half-swept");
});

test("ADJ probe: same law, same shape — adjOk:FALSE, adjDormant:FALSE, belt skipped, cause logged", async () => {
  const client = probeFailsClient("terminating connection due to administrator command");
  const log = [];
  const out = await reconcileAdjustmentRuns(client, { log: (m) => log.push(m) });
  assert.equal(out.adjOk, false);
  assert.equal(out.adjDormant, false);
  assert.ok(log.some((m) => /adjustment surface probe error/.test(m)));
  assert.ok(!client.queries.some((q) => /from clara\.clients/.test(q.sql)), "skipped whole");
});

test("the probes' dormant path is UNCHANGED — a genuinely absent surface is still a clean ok:true no-op", async () => {
  const absent = {
    query(sql) {
      if (/to_regprocedure/.test(sql)) return Promise.resolve({ rows: [{ surface: false }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  const fa = await reconcileFaRuns(absent, { log: () => {} });
  const adj = await reconcileAdjustmentRuns(absent, { log: () => {} });
  assert.deepEqual([fa.faOk, fa.dormant], [true, true], "pre-0041 boots dormant, not failed");
  assert.deepEqual([adj.adjOk, adj.adjDormant], [true, true], "pre-0045 likewise — the wrap did not turn dormancy into failure");
});

test("a probe failure inside a DAILY belt skips that belt ONLY — the sweep behind it completes", async () => {
  const client = sweepClient({ failOn: (sql) => (/to_regprocedure/.test(sql) ? new Error("connection reset") : null) });
  const log = [];
  const swept = await runReconcilerSweep(client, { ...chatDeps((m) => log.push(m)), faRuns: true, adjRuns: true, prune: true });
  assert.equal(swept.faOk, false, "the FA belt reports its own failure…");
  assert.equal(swept.adjOk, false, "…and so does the adjustment belt, independently");
  assert.deepEqual(swept.beltErrors, [], "both contained THEMSELVES — nothing escaped to the assembly wrapper");
  assert.equal(typeof swept.pruned, "number", "the trace prune, sequenced last of all, still ran");
});

test("render enqueue: its surface probe is isolated like its dispatch sibling (renderEnqueueOk:false, not a throw)", async () => {
  const log = [];
  const out = await reconcileRenderEnqueue(probeFailsClient("server closed the connection unexpectedly"), { log: (m) => log.push(m) });
  assert.equal(out.renderEnqueueOk, false, "leader.mjs:207 advances the daily cadence only on ok — false retries next cycle");
  assert.equal(out.renderEnqueueDormant, undefined, "a failed read must not masquerade as a pre-migration dormancy");
  assert.ok(log.some((m) => /render enqueue surface probe error/.test(m)));
});

// ---------------------------------------------------------------------------
// The document lane — the two same-class gaps.
// ---------------------------------------------------------------------------

test("documents: an unreadable task index is contained at the belt boundary and SAYS SO (never a silent empty index)", async () => {
  const client = {
    query(sql) {
      if (/from clara\.document_processing_tasks/.test(sql)) return Promise.reject(new Error("statement timeout"));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  const log = [];
  let out;
  await assert.doesNotReject(async () => {
    out = await reconcileDocumentTasks(client, { enqueueDocumentIngest: async () => ({ runId: "x" }), log: (m) => log.push(m) });
  }, "documentTaskIndex's deliberate re-throw stays loud, but loud must not mean fatal to the belts behind it");
  assert.equal(out.documentTaskIndexOk, false,
    "the receipt says the index was never read — a zero task count must never be readable as 'nothing to do'");
  assert.ok(log.some((m) => /document task index unreadable/.test(m)));
});

test("documents: a healthy index sets documentTaskIndexOk TRUE — positive evidence, set only where a read returned", async () => {
  const client = { query: () => Promise.resolve({ rows: [], rowCount: 0 }) };
  const out = await reconcileDocumentTasks(client, { enqueueDocumentIngest: async () => ({ runId: "x" }), log: () => {} });
  assert.equal(out.documentTaskIndexOk, true);
});

test("documents: the orphan-reservation SELECT degrades like its sibling on a permission gap, and stays loud otherwise", async () => {
  const denied = Object.assign(new Error("permission denied for table document_ingest_reservations"), { code: "42501" });
  const gapped = {
    query(sql) {
      if (/document_ingest_reservations/.test(sql)) return Promise.reject(denied);
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  const log = [];
  const out = await reconcileDocumentIntakes(gapped, { log: (m) => log.push(m) });
  assert.equal(out.documentReservationsRefunded, 0, "the partial receipt already earned is returned, not lost to a throw");
  assert.ok(log.some((m) => /orphan reservation SELECT unavailable/.test(m)), "and the gap is named");

  // The other half of the sibling's contract: a GENUINE fault is not laundered into a clean
  // no-op. It raises — and the assembly wrapper is what keeps that from costing the whole cycle.
  const broken = {
    query(sql) {
      if (/document_ingest_reservations/.test(sql)) return Promise.reject(new Error("deadlock detected"));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  await assert.rejects(() => reconcileDocumentIntakes(broken, { log: () => {} }), /deadlock detected/,
    "a real fault stays loud — degrading on everything would hide the failures worth seeing");
});

// ---------------------------------------------------------------------------
// The heartbeat — the ONE deliberate fail-fast.
// ---------------------------------------------------------------------------

test("heartbeat: a failed beat SKIPS the remainder of the sweep, deliberately and out loud", async () => {
  const client = sweepClient({
    open: [{ id: randomUUID(), status: "running" }],
    failOn: (sql) => (/runtime_heartbeats/.test(sql) ? new Error("permission denied for table runtime_heartbeats") : null),
  });
  const log = [];
  const swept = await runReconcilerSweep(client, chatDeps((m) => log.push(m)));

  assert.equal(swept.heartbeatOk, false);
  assert.deepEqual(swept.beltErrors, ["heartbeat"], "named, so a caller sees a skipped sweep rather than an empty one");
  // The QUIESCE GUARDS (0022:136-143, 0023) read this beat to decide whether a runtime is live
  // before replacing a live writer's body. Beat-then-write is the ordering they depend on: a
  // leader that cannot record "I am alive" must not go on making writes it cannot account for.
  assert.equal(client.queries.length, 1, "NOTHING ran after the failed beat — the skip is real, not cosmetic");
  assert.ok(log.some((m) => /heartbeat error — SKIPPING the remainder of this sweep/.test(m)), "and it says why");
  assert.ok(!("settledTerminal" in swept), "no belt reported, because no belt ran");
});

test("heartbeat: the contrast — a healthy beat runs the whole sweep (the skip cell is not passing vacuously)", async () => {
  const client = sweepClient({ open: [{ id: randomUUID(), status: "running" }] });
  const swept = await runReconcilerSweep(client, chatDeps(() => {}));
  assert.equal(client.calls.heartbeat, 1, "beaten once per sweep");
  assert.ok(client.queries.length > 1, "…and the belts behind it ran");
  assert.equal(swept.settledTerminal, 1);
});
