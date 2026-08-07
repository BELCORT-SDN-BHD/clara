// §7-A acceptance FINDING F1, runtime half — reconciler.mjs's autodraft TERMINAL edge must
// isolate per task. PURE mock-client unit test (no DB, no world), the same convention as
// reconcile-autodraft-cancel-unit.test.mjs, which closed the identical defect on the sibling
// CANCEL edge in Wave C-c.
//
// WHAT WENT WRONG. On 2026-08-07 every successful unattended post left its autodraft task
// stranded 'running' (the DB guard refused the settlement — fixed in migration 0047 and
// proven in packages/db/tests/x47-settle-guard-identity.test.mjs). The runtime then made a
// bounded problem unbounded: settleAutoDraftTerminal ran BARE inside reconcileAutoDraftTasks,
// so the refusal propagated out through runReconcilerSweep and aborted the ENTIRE leader
// cycle before its remaining work. Measured: 52 "LEADER cycle-error draft settlement entry
// not found" in one 25-minute window; five document tasks queued 19 minutes; /ready warning
// on a 1,158,951 ms unbound-task age; document dispatch, matching, the sweeps, the
// adjustments belt, FA runs and SST watches all starved — and the runtime could not
// self-heal, because the reconciler IS the thing that heals.
//
// The two halves are deliberately independent. 0047 fixes the refusal these cells provoke;
// these cells fix what happens when ANY settle is refused, for any reason, forever after.
// A cell here that only passed because 0047 exists would be measuring the wrong thing, so
// the mock refuses on its own terms and the assertions are about the SWEEP's behaviour.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileAutoDraftTasks, runReconcilerSweep } from "../lib/reconciler.mjs";

process.env.CLARA_SPOOL_DIR = join(await mkdtemp(join(tmpdir(), "clara-x47rt-")), "spool");

/** A scripted mock pg client for reconcileAutoDraftTasks.
 *
 *  `tasks` is the section-C population: [{ id, entry }] — every one 'running' with a bound
 *  run whose engine status is terminal, which is the shape that reaches the settle.
 *  `entries` maps entry id -> { status, checked_via_rule_id }, and the settle stub applies
 *  MIGRATION 0047'S PREDICATE to it: a 'drafted' settlement is admitted when the entry is
 *  still a draft, or is approved AND carries a rule id. Encoding the DB's contract in the
 *  mock is what lets this file assert the runtime's behaviour on BOTH sides of it without a
 *  Postgres; the predicate itself is proven against a real database in x47, never here. */
function mockAutodraftClient({ tasks = [], entries = {} } = {}) {
  const calls = { settle: [], codingAttempt: [] };
  return {
    calls,
    query: async (sql, params) => {
      const s = String(sql);
      // Section A (autodraft): admitted-but-unstarted. Out of scope — nothing stuck.
      if (/kind = 'autodraft'/.test(s) && /status = 'queued'/.test(s)) return { rows: [], rowCount: 0 };
      // Section C (autodraft): running + bound. THE population under test.
      if (/kind = 'autodraft'/.test(s) && /status = 'running'/.test(s)) {
        return { rows: tasks.map((t) => ({ id: t.id, workflow_run_id: `wf-${t.id}` })), rowCount: tasks.length };
      }
      if (/get_coding_attempt/.test(s)) {
        calls.codingAttempt.push(params[0]);
        const t = tasks.find((x) => x.id === params[0]);
        return { rows: [{ a: t?.entry ? { entry_id: t.entry } : null }], rowCount: 1 };
      }
      if (/settle_autodraft_task/.test(s)) {
        const [taskId, outcome, tokens, entryId] = params;
        calls.settle.push({ taskId, outcome, tokens, entryId });
        if (outcome === "drafted") {
          const e = entries[entryId];
          const admitted = !!e && (e.status === "draft" || (e.status === "approved" && e.checked_via_rule_id != null));
          if (!admitted) {
            // The live refusal, spelled exactly as 0036:951 raises it.
            const err = new Error("draft settlement entry not found");
            err.code = "CLR11";
            throw err;
          }
        }
        return { rows: [{}], rowCount: 1 };
      }
      // Every other sweeper's query (chat-turn sections, documents, intakes, heartbeat).
      return { rows: [], rowCount: 0 };
    },
  };
}

const terminalRun = () => ({ status: Promise.resolve("completed"), cancel: async () => {} });

test("F1 runtime half: a settle the DB REFUSES is counted and logged, and the sweep carries on to the next task", async () => {
  const doomed = randomUUID();
  const healthy = randomUUID();
  const doomedEntry = randomUUID();
  const healthyEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: doomed, entry: doomedEntry }, { id: healthy, entry: healthyEntry }],
    entries: {
      [doomedEntry]: { status: "approved", checked_via_rule_id: null }, // a human approved it — 0047 still refuses
      [healthyEntry]: { status: "draft", checked_via_rule_id: null },
    },
  });
  const log = [];

  let out;
  await assert.doesNotReject(async () => {
    out = await reconcileAutoDraftTasks(client, {
      enqueueAutoDraft: async () => ({ runId: "x" }),
      getRun: terminalRun,
      log: (m) => log.push(m),
    });
  }, "a settle failure must never throw out of reconcileAutoDraftTasks — THAT THROW IS THE INCIDENT: it"
   + " propagated through runReconcilerSweep and aborted the whole leader cycle every ~2 seconds, forever");

  // ISOLATION, not merely survival. The doomed task is FIRST in the population, so a sweep
  // that stopped at the failure would leave the healthy one unsettled and still look
  // non-throwing. Both settles being attempted is the property that matters.
  assert.equal(client.calls.settle.length, 2, "both tasks reached the settle — one failure does not end the pass");
  assert.equal(out.autodraftSettled, 1, "the healthy task settled and is counted");
  assert.equal(out.autodraftSettleFailed, 1, "the refused task is COUNTED, not swallowed — the count is what keeps it visible");

  const lines = log.filter((m) => m.includes(doomed));
  assert.equal(lines.length, 1, `exactly one log line names the failing task (got ${lines.length}: ${JSON.stringify(log)})`);
  assert.match(lines[0], /draft settlement entry not found/, "the log carries the DB's own reason, not a generic message");
  assert.equal(log.filter((m) => m.includes(healthy)).length, 0, "the task that settled cleanly is not logged as a failure");
});

test("F1 runtime half: 0047's contract mirrored — an entry the RULE path approved settles; the same entry approved WITHOUT a rule id does not", async () => {
  const viaRule = randomUUID();
  const viaHuman = randomUUID();
  const ruleEntry = randomUUID();
  const humanEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: viaRule, entry: ruleEntry }, { id: viaHuman, entry: humanEntry }],
    entries: {
      // The §7-A race: the rule-post consumer approved this entry ~100 ms after the drafter
      // wrote it. checked_via_rule_id is write-once and rule-only (0016:5109-5112 refuses any
      // deploy whose HUMAN approve wrapper can set it), so it is an identity fact.
      [ruleEntry]: { status: "approved", checked_via_rule_id: randomUUID() },
      [humanEntry]: { status: "approved", checked_via_rule_id: null },
    },
  });
  const log = [];
  const out = await reconcileAutoDraftTasks(client, {
    enqueueAutoDraft: async () => ({ runId: "x" }),
    getRun: terminalRun,
    log: (m) => log.push(m),
  });

  assert.equal(out.autodraftSettled, 1, "the rule-approved entry settles — this is the case that stranded 3 posts out of 3 before 0047");
  assert.equal(out.autodraftSettleFailed, 1, "the human-approved entry is still refused — 0047 WIDENED the guard, it did not delete it");
  assert.equal(log.filter((m) => m.includes(viaHuman)).length, 1, "and the refusal is the one that gets logged");
  assert.equal(log.filter((m) => m.includes(viaRule)).length, 0, "the rule-approved settle is silent");
});

test("F1 runtime half: runReconcilerSweep COMPLETES when an autodraft settle is refused — the leader cycle is no longer abortable by one task", async () => {
  const doomed = randomUUID();
  const doomedEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: doomed, entry: doomedEntry }],
    entries: { [doomedEntry]: { status: "withdrawn", checked_via_rule_id: null } },
  });
  const log = [];

  // THE ACTUAL INCIDENT SHAPE. runReconcilerSweep is what the leader awaits; the throw from
  // deep inside the autodraft edge is what made `LEADER cycle-error` fire every poll and
  // skipped every sweeper sequenced after it (documents, intakes, spool TTL, the belts).
  let swept;
  await assert.doesNotReject(async () => {
    swept = await runReconcilerSweep(client, {
      enqueueChatTurn: async () => ({ runId: "x" }),
      enqueueAutoDraft: async () => ({ runId: "x" }),
      getRun: terminalRun,
      log: (m) => log.push(m),
    });
  }, "the whole sweep must complete — an un-settleable task is a task-level fault, never a cycle-level one");

  assert.equal(swept.autodraftSettleFailed, 1, "the sweep's own result carries the failure count");
  assert.equal(swept.autodraftSettled, 0, "and nothing was falsely counted as settled");
  // The sweep really did keep going: its result object carries the keys the LATER sweepers
  // contribute, which a sweep that aborted at the autodraft edge could not have produced.
  assert.ok("documentReenqueued" in swept, "reconcileDocumentTasks ran AFTER the autodraft edge — the sweepers behind the fault are no longer starved");
});
