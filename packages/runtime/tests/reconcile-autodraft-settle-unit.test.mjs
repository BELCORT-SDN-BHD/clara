// §7-A acceptance FINDING F1, runtime half — reconciler.mjs's autodraft TERMINAL edge must
// isolate per task, AND the states it drives must actually terminate. PURE mock-client unit
// test (no DB, no world), the same convention as reconcile-autodraft-cancel-unit.test.mjs,
// which closed the identical isolation defect on the sibling CANCEL edge in Wave C-c.
//
// WHAT WENT WRONG. On 2026-08-07 every successful unattended post left its autodraft task
// stranded 'running' (the DB guard refused the settlement — fixed in migration 0047 and
// proven in packages/db/tests/x47-settle-guard-identity.test.mjs). The runtime then made a
// bounded problem unbounded: settleAutoDraftTerminal ran BARE inside reconcileAutoDraftTasks,
// so the refusal propagated out through runReconcilerSweep and aborted the ENTIRE leader
// cycle before its remaining work. Measured: 52 "LEADER cycle-error draft settlement entry
// not found" in one 25-minute window; five document tasks queued 19 minutes; /ready warning
// on a 1,158,951 ms unbound-task age.
//
// THE SECOND HALF, added on the Law-1 review's ruling: isolation alone leaves a task that can
// never settle being re-selected by Section C on EVERY leader cycle, forever, with its token
// reservation charged forever — loud and harmless, but never terminal. 0047's third arm makes
// the two HUMAN exits from 'draft' settle TERMINALLY as `superseded_by_human`, and the cells
// below assert what that buys the RUNTIME: the task leaves 'running', so the next sweep does
// not see it and the retry loop ENDS.
//
// The mock encodes 0047's three arms as the contract the runtime is written against; the
// predicate itself is proven against a real database in x47, never here. What IS proven here
// is the sweep's behaviour on each side of it — which no DB test can show.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileAutoDraftTasks, runReconcilerSweep } from "../lib/reconciler.mjs";

process.env.CLARA_SPOOL_DIR = join(await mkdtemp(join(tmpdir(), "clara-x47rt-")), "spool");

/** A STATEFUL scripted mock pg client for reconcileAutoDraftTasks.
 *
 *  Stateful on purpose: a settle that terminates has to remove its task from the population
 *  Section C selects, or "the retry loop ends" cannot be observed at all — the cell would be
 *  asserting a return value instead of a behaviour.
 *
 *  `tasks` is the section-C population: [{ id, entry }] — every one 'running' with a bound
 *  run whose engine status is terminal. `entries` maps entry id -> { status,
 *  checked_via_rule_id }. The settle stub applies MIGRATION 0047'S THREE ARMS and returns the
 *  DB's own six-key success shape, so the cells see what autoDraft.v6's classifySettleReceipt
 *  would see. */
function mockAutodraftClient({ tasks = [], entries = {} } = {}) {
  const live = new Map(tasks.map((t) => [t.id, { ...t, status: "running" }]));
  const calls = { settle: [], selections: [] };
  return {
    calls,
    live,
    query: async (sql, params) => {
      const s = String(sql);
      if (/kind = 'autodraft'/.test(s) && /status = 'queued'/.test(s)) return { rows: [], rowCount: 0 };
      if (/kind = 'autodraft'/.test(s) && /status = 'running'/.test(s)) {
        const rows = [...live.values()]
          .filter((t) => t.status === "running")
          .map((t) => ({ id: t.id, workflow_run_id: `wf-${t.id}` }));
        calls.selections.push(rows.map((r) => r.id)); // what THIS sweep saw
        return { rows, rowCount: rows.length };
      }
      if (/get_coding_attempt/.test(s)) {
        const t = live.get(params[0]);
        return { rows: [{ a: t?.entry ? { entry_id: t.entry } : null }], rowCount: 1 };
      }
      if (/settle_autodraft_task/.test(s)) {
        const [taskId, outcome, tokens, entryId] = params;
        calls.settle.push({ taskId, outcome, tokens, entryId });
        if (outcome === "drafted") {
          const e = entries[entryId];
          const isDraftOrRulePosted =
            !!e && (e.status === "draft" || (e.status === "approved" && e.checked_via_rule_id != null));
          const isHumanSuperseded =
            !!e && (e.status === "withdrawn" || (e.status === "approved" && e.checked_via_rule_id == null));
          if (isDraftOrRulePosted) {
            live.get(taskId).status = "completed";
            return { rows: [{ r: settleReceipt(taskId, "drafted", entryId, 100) }], rowCount: 1 };
          }
          if (isHumanSuperseded) {
            // ARM 3 — terminal, full refund, entry_id null (all three are what
            // classifySettleReceipt requires of a non-'drafted' settlement).
            live.get(taskId).status = "completed";
            return { rows: [{ r: settleReceipt(taskId, "skipped_lane", null, 0) }], rowCount: 1 };
          }
          // The entry belongs to no task of this filing — still refused, and the task stays
          // 'running'. Spelled exactly as 0036:951 raises it.
          const err = new Error("draft settlement entry not found");
          err.code = "CLR11";
          throw err;
        }
        live.get(taskId).status = "failed";
        return { rows: [{ r: settleReceipt(taskId, outcome, null, 0) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

/** The DB's SUCCESS shape, six keys exactly (0036:994-996) — the shape autoDraft.v6's
 *  classifySettleReceipt validates with hasExactlyKeys. */
function settleReceipt(taskId, outcome, entryId, spent) {
  return {
    task_id: taskId,
    status: outcome === "failed" ? "failed" : "completed",
    outcome,
    entry_id: entryId,
    tokens_spent: spent,
    tokens_refunded: 0,
  };
}

const terminalRun = () => ({ status: Promise.resolve("completed"), cancel: async () => {} });
const deps = (log) => ({ enqueueAutoDraft: async () => ({ runId: "x" }), getRun: terminalRun, log });

test("F1 runtime half: a settle the DB REFUSES is counted and logged, and the sweep carries on to the next task", async () => {
  const doomed = randomUUID();
  const healthy = randomUUID();
  const foreignEntry = randomUUID(); // belongs to no filing the mock knows — arm 3 does not apply
  const healthyEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: doomed, entry: foreignEntry }, { id: healthy, entry: healthyEntry }],
    entries: { [healthyEntry]: { status: "draft", checked_via_rule_id: null } },
  });
  const log = [];

  let out;
  await assert.doesNotReject(async () => {
    out = await reconcileAutoDraftTasks(client, deps((m) => log.push(m)));
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

test("F1 runtime half: 0047's THREE arms mirrored — rule-approved settles 'drafted', both HUMAN exits settle terminally, a foreign entry still refuses", async () => {
  const viaRule = randomUUID();
  const viaHuman = randomUUID();
  const viaWithdrawal = randomUUID();
  const foreign = randomUUID();
  const ruleEntry = randomUUID();
  const humanEntry = randomUUID();
  const withdrawnEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [
      { id: viaRule, entry: ruleEntry },
      { id: viaHuman, entry: humanEntry },
      { id: viaWithdrawal, entry: withdrawnEntry },
      { id: foreign, entry: randomUUID() },
    ],
    entries: {
      // The §7-A race: the rule-post consumer approved this entry ~100 ms after the drafter
      // wrote it. checked_via_rule_id is supplied by exactly one caller and only on the
      // one-way draft->approved transition, so it is an identity fact.
      [ruleEntry]: { status: "approved", checked_via_rule_id: randomUUID() },
      [humanEntry]: { status: "approved", checked_via_rule_id: null },
      [withdrawnEntry]: { status: "withdrawn", checked_via_rule_id: null },
    },
  });
  const log = [];
  const out = await reconcileAutoDraftTasks(client, deps((m) => log.push(m)));

  assert.equal(out.autodraftSettled, 3, "three of the four settle — the race, and BOTH human exits (arm 3)");
  assert.equal(out.autodraftSettleFailed, 1, "only the genuinely foreign entry is refused — the widening did not become 'accept anything'");
  assert.equal(log.filter((m) => m.includes(foreign)).length, 1, "and that one is the only thing logged");
  for (const settled of [viaRule, viaHuman, viaWithdrawal]) {
    assert.equal(log.filter((m) => m.includes(settled)).length, 0, `a settled task is silent (${settled})`);
  }
});

test("F1 runtime half: THE RETRY LOOP ENDS on a human-superseded task — it leaves 'running', so the NEXT sweep does not see it", async () => {
  const superseded = randomUUID();
  const supersededEntry = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: superseded, entry: supersededEntry }],
    entries: { [supersededEntry]: { status: "approved", checked_via_rule_id: null } },
  });

  // THIS IS THE PROPERTY ARM 3 EXISTS FOR, and it is only visible across TWO sweeps. Before
  // arm 3 the DB refused this settlement, the task stayed 'running', and Section C re-selected
  // it every leader cycle forever with its reservation charged. A single-sweep assertion
  // cannot tell "settled terminally" from "refused but isolated" — both are non-throwing.
  const first = await reconcileAutoDraftTasks(client, deps(() => {}));
  await reconcileAutoDraftTasks(client, deps(() => {})); // sweep 2 — proven via selections[1], its receipt unused

  assert.equal(first.autodraftSettled, 1, "sweep 1 settles it terminally");
  assert.equal(first.autodraftSettleFailed, 0, "...without a refusal");
  assert.deepEqual(client.calls.selections[0], [superseded], "sweep 1 selected the task");
  assert.deepEqual(client.calls.selections[1], [], "SWEEP 2 SELECTS NOTHING — the task left 'running' and the loop is over");
  assert.equal(client.calls.settle.length, 1, "and it was settled exactly once, not once per cycle");
});

test("F1 runtime half: the contrast — a task the DB can NEVER settle is still re-selected every sweep, which is why isolation is the other half of the fix", async () => {
  const unsettleable = randomUUID();
  const client = mockAutodraftClient({
    tasks: [{ id: unsettleable, entry: randomUUID() }], // an entry arm 3 does not cover
    entries: {},
  });

  const first = await reconcileAutoDraftTasks(client, deps(() => {}));
  const second = await reconcileAutoDraftTasks(client, deps(() => {}));

  // The cell above would pass vacuously if EVERY task disappeared from the population after
  // one sweep. This proves the selection is real: a task that cannot settle IS re-selected,
  // and the loop only ends when something genuinely terminated it.
  assert.equal(first.autodraftSettleFailed, 1);
  assert.equal(second.autodraftSettleFailed, 1, "still refused on the second pass");
  assert.deepEqual(client.calls.selections[1], [unsettleable], "and still selected — fail-closed stays fail-closed");
  // ...and it is harmless, which is what the isolation half buys: no throw, no aborted cycle.
  assert.equal(second.autodraftSettled, 0);
});

test("F1 runtime half: runReconcilerSweep COMPLETES when an autodraft settle is refused — the leader cycle is no longer abortable by one task", async () => {
  const doomed = randomUUID();
  const client = mockAutodraftClient({ tasks: [{ id: doomed, entry: randomUUID() }], entries: {} });
  const log = [];

  // THE ACTUAL INCIDENT SHAPE. runReconcilerSweep is what the leader awaits; the throw from
  // deep inside the autodraft edge is what made `LEADER cycle-error` fire every poll and
  // skipped every sweeper sequenced after it (documents, intakes, spool TTL, the belts).
  let swept;
  await assert.doesNotReject(async () => {
    swept = await runReconcilerSweep(client, { enqueueChatTurn: async () => ({ runId: "x" }), ...deps((m) => log.push(m)) });
  }, "the whole sweep must complete — an un-settleable task is a task-level fault, never a cycle-level one");

  assert.equal(swept.autodraftSettleFailed, 1, "the sweep's own result carries the failure count");
  assert.equal(swept.autodraftSettled, 0, "and nothing was falsely counted as settled");
  // The sweep really did keep going: its result object carries the keys the LATER sweepers
  // contribute, which a sweep that aborted at the autodraft edge could not have produced.
  assert.ok("documentReenqueued" in swept, "reconcileDocumentTasks ran AFTER the autodraft edge — the sweepers behind the fault are no longer starved");
});
