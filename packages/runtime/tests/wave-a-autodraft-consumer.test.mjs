// Wave A — the autodraft consumer's PURE logic (no DB, no world). Proves the admission
// fan-out + outcome handling + the document->filing resolver mapping that the event/catch-up
// paths feed into clara.admit_autodraft_task. Contract §3 / companion §4. These MUST pass at
// build time (the 0011-dependent end-to-end behaviour is exercised in wave-a-autodraft-db).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admissionNeedsStart,
  admitDocument,
  admitWithdrawalEvent,
  autodraftHealth,
  resolveDocumentFilings,
  runAutodraftCycle,
  runCatchupPass,
  AUTODRAFT_CONSUMER,
  AUTODRAFT_EVENT_TYPES,
} from "../lib/autodraft.mjs";

// A scripted mock pg client: open_sweep_run returns a fixed run id; admit_autodraft_task
// returns the next scripted receipt. Captures the calls so the assertions can inspect args.
function mockAdmitClient({ runId = "run-1", outcomes = [] } = {}) {
  let idx = 0;
  const calls = { openSweep: [], admits: [] };
  return {
    calls,
    query: async (sql, params) => {
      if (/open_sweep_run/.test(sql)) {
        calls.openSweep.push(params);
        return { rows: [{ run_id: runId }], rowCount: 1 };
      }
      if (/admit_autodraft_task/.test(sql)) {
        calls.admits.push(params);
        const receipt = outcomes[idx++] ?? { outcome: "admitted", task_id: `t${idx}` };
        return { rows: [{ receipt }], rowCount: 1 };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
}

const twoFilings = async () => [
  { firmId: "F", filingId: "fil-1" },
  { firmId: "F", filingId: "fil-2" },
];

test("consumer name + subscribed event types are the fixed spine identity", () => {
  assert.equal(AUTODRAFT_CONSUMER, "autodraft");
  assert.deepEqual([...AUTODRAFT_EVENT_TYPES], [
    "document.invoice_facts_completed",
    "document.invoice_facts_failed",
    "entry.withdrawn",
  ]);
  assert.ok(!AUTODRAFT_EVENT_TYPES.includes("entry.revised"), "GM-10 is triggered by withdrawal; revision is evidence only");
});

test("admissionNeedsStart enqueues on ALL THREE task-minting outcomes — every no-op/refusal outcome does not", () => {
  assert.equal(admissionNeedsStart("admitted"), true);
  assert.equal(admissionNeedsStart("re_admitted"), true, "the 0034 supersede outcome mints a real queued task and must enqueue");
  assert.equal(
    admissionNeedsStart("re_admitted_after_withdrawal"), true,
    "the 0053 / F8 outcome (a COMPLETED task whose entry was withdrawn) rides the SAME mint pipeline and mints a real queued task — leaving it un-enqueued would recreate F8 one layer up: the row exists, nothing ever runs it",
  );
  // 'already_done' stays FALSE and that is the whole contrast: 0053 narrowed which completed
  // attempts re-admit, it did not turn the honest refusal into an enqueue.
  for (const o of [
    "noop_existing",
    "refused_budget",
    // F-A9 PR-1B renamed the engine-protective concurrency refusal off the string it shared
    // with two now-removed spend caps. It must be non-admitting for the SAME reason every
    // other refusal is — and it already is, because this predicate is an ADMITTING allowlist
    // rather than a refusal denylist. Pinned here so the property is proven, not inferred.
    "refused_concurrency",
    "refused_attempts",
    "lane_changed",
    "skipped_lane",
    "already_done",
    "skipped_direction",
    // Near-misses that must not be admitted by a loose prefix/substring test — spelling is
    // not identity (CLAUDE.md law 3): only the exact tokens enqueue.
    "re_admitted_after_withdrawal_x",
    "readmitted",
    "RE_ADMITTED",
    undefined,
    "",
  ]) {
    assert.equal(admissionNeedsStart(o), false, `${o} must not enqueue`);
  }
});

test("admitDocument fans out one admission per filing and returns ONLY the admitted task ids", async () => {
  const client = mockAdmitClient({
    runId: "run-42",
    outcomes: [
      { outcome: "admitted", task_id: "t1" },
      { outcome: "noop_existing", task_id: "t-existing" }, // registry short-circuit -> NOT enqueued
    ],
  });
  const res = await admitDocument(client, { firmId: "F", documentId: "D" }, { resolveDocumentFilings: twoFilings });
  assert.equal(res.filings, 2, "both filings were admitted-attempted");
  assert.deepEqual(res.admitted, ["t1"], "only the 'admitted' outcome enqueues; noop_existing does not");
  assert.equal(res.runId, "run-42");
  assert.deepEqual(client.calls.openSweep[0], ["F", 2], "the sweep run is pre-created sized to the filing count");
});

test("admitDocument: a multi-filing document with all admitted returns every task id", async () => {
  const client = mockAdmitClient({
    outcomes: [
      { outcome: "admitted", task_id: "a" },
      { outcome: "admitted", task_id: "b" },
      { outcome: "refused_budget" }, // wrote its own item row; never enqueued
    ],
  });
  const filings = async () => [
    { firmId: "F", filingId: "f1" },
    { firmId: "F", filingId: "f2" },
    { firmId: "F", filingId: "f3" },
  ];
  const res = await admitDocument(client, { firmId: "F", documentId: "D" }, { resolveDocumentFilings: filings });
  assert.deepEqual(res.admitted, ["a", "b"], "refused_budget is not enqueued");
  assert.equal(client.calls.admits.length, 3, "all three filings were put to admission");
});

test("admitDocument: a document with NO active filing opens no sweep run and admits nothing", async () => {
  const client = mockAdmitClient();
  const res = await admitDocument(client, { firmId: "F", documentId: "D" }, { resolveDocumentFilings: async () => [] });
  assert.deepEqual(res.admitted, []);
  assert.equal(res.filings, 0);
  assert.equal(res.runId, null);
  assert.equal(client.calls.openSweep.length, 0, "no empty sweep run is created");
  assert.equal(client.calls.admits.length, 0);
});

test("admitDocument passes the sweep origin, run id, model, and reserve tokens to the admission", async () => {
  const client = mockAdmitClient({ runId: "run-9", outcomes: [{ outcome: "admitted", task_id: "t1" }] });
  await admitDocument(
    client,
    { firmId: "F", documentId: "D" },
    { resolveDocumentFilings: async () => [{ firmId: "F", filingId: "fil-1" }], model: "gpt-x", reserveTokens: 12345 },
  );
  // admit_autodraft_task(p_filing, p_origin, p_run_id, p_model, p_reserve_tokens)
  assert.deepEqual(client.calls.admits[0], ["fil-1", "sweep", "run-9", "gpt-x", 12345]);
});

test("GM-10 withdrawal events use the audited exact-event door and enqueue only a minted task", async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      assert.match(sql, /readmit_autodraft_after_withdrawal/);
      return {
        rows: [{ receipt: { outcome: "re_admitted_after_withdrawal", task_id: "task-fresh" } }],
        rowCount: 1,
      };
    },
  };

  const out = await admitWithdrawalEvent(
    client,
    { eventId: "withdrawal-event" },
    { model: "gpt-x", reserveTokens: 24680 },
  );

  assert.deepEqual(calls[0].params, ["withdrawal-event", "gpt-x", 24680]);
  assert.deepEqual(out.admitted, ["task-fresh"]);
  assert.equal(out.retry, false);
  assert.equal(out.receipt.outcome, "re_admitted_after_withdrawal");
});

test("GM-10 near-miss withdrawal evidence is consumed without inventing an admission", async () => {
  const client = {
    query: async () => ({ rows: [{ receipt: { outcome: "not_eligible" } }], rowCount: 1 }),
  };
  const out = await admitWithdrawalEvent(client, { eventId: "manual-draft-withdrawal" });
  assert.deepEqual(out.admitted, []);
  assert.equal(out.retry, false);
  assert.equal(out.receipt.outcome, "not_eligible");
});

test("GM-10 retains an early withdrawal until its originating task has settled", async () => {
  const client = {
    query: async () => ({
      rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-running" } }],
      rowCount: 1,
    }),
  };
  const out = await admitWithdrawalEvent(client, { eventId: "early-withdrawal" });
  assert.deepEqual(out.admitted, []);
  assert.equal(out.retry, true, "the effect transaction must retain this event without checkpointing");
  assert.equal(out.receipt.prior_task_id, "task-running");
});

test("F2-R GM-10 cycle rolls back and retains a pending-settlement withdrawal — no dead-letter, no checkpoint", async () => {
  // F2-R (opus review, round 2 — SUPERSEDES round 1's bounded-attempt test): round 1's own
  // cycle-denominated bound was measured to give up in ~10s of wall-clock time under nudge
  // pressure while the recovery it raced (the reconciler's orphan settle) runs on a 30-minute
  // window — after the drop the human's deliberate re-admission act was permanently lost,
  // exactly like F1's bug one layer up. The deferral is UNBOUNDED again: retained, never
  // checkpointed, and — this cell's whole point — NEVER dead-lettered either.
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin" || normalized === "rollback" || normalized === "commit") return { rows: [], rowCount: 0 };
      if (/from clara\.firm_event_seq/.test(sql)) {
        return { rows: [{ firm_id: "F", head_seq: 6, last_seq: 5 }], rowCount: 1 };
      }
      if (/from clara\.domain_events/.test(sql)) {
        return {
          rows: [{ seq: 6, id: "early-withdrawal-r2", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return {
          rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-running" } }],
          rowCount: 1,
        };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
  const enqueued = [];
  const logs = [];
  const out = await runAutodraftCycle(client, {
    onlyFirm: "F",
    enqueue: async (task) => enqueued.push(task),
    log: (message) => logs.push(message),
  });

  assert.deepEqual(
    calls.filter(({ sql }) => /^(begin|commit|rollback)$/i.test(sql.trim())).map(({ sql }) => sql.trim().toLowerCase()),
    ["begin", "rollback"],
    "the effect transaction rolls back and NOTHING else opens a transaction — no dead-letter write at all",
  );
  assert.equal(
    calls.some(({ sql }) => /insert into clara\.relay_dead_letters/i.test(sql)),
    false,
    "F2-R: a live owner task spends NO poison budget",
  );
  assert.equal(
    calls.some(({ sql }) => /insert into clara\.relay_checkpoints/i.test(sql)),
    false,
    "the withdrawal checkpoint is retained",
  );
  assert.deepEqual(enqueued, [], "no task exists to enqueue before terminal settlement");
  assert.deepEqual(out, { firms: 1, admitted: 0, capped: false });
  assert.ok(logs.some((message) => /deferred without checkpoint \(owner task not yet settled\)/.test(message)));
});

test("F2-R a stuck owner task defers without dead-letter and without checkpoint advance across many nudge-driven cycles", async () => {
  // The unbounded retention itself, proved across FAR more cycles than round 1's cap (5) ever
  // allowed — simulating waitForNudge firing rapidly under estate traffic. No cycle count, of
  // any size, ever spends a poison budget or advances the checkpoint.
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin" || normalized === "rollback" || normalized === "commit") return { rows: [], rowCount: 0 };
      if (/from clara\.firm_event_seq/.test(sql)) {
        return { rows: [{ firm_id: "F", head_seq: 6, last_seq: 5 }], rowCount: 1 };
      }
      if (/from clara\.domain_events/.test(sql)) {
        return {
          rows: [{ seq: 6, id: "stuck-withdrawal-r2", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return {
          rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-stuck" } }],
          rowCount: 1,
        };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
  const logs = [];
  for (let cycle = 0; cycle < 50; cycle++) {
    await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async () => {}, log: (m) => logs.push(m) });
  }
  assert.equal(
    calls.some(({ sql }) => /insert into clara\.relay_dead_letters/i.test(sql)),
    false,
    "F2-R: unbounded retention spends NO poison budget, ever, no matter how many cycles",
  );
  assert.equal(
    calls.some(({ sql }) => /insert into clara\.relay_checkpoints/i.test(sql)),
    false,
    "F2-R: the checkpoint never advances past a genuinely stuck deferral",
  );
  // Time-throttled logging (DEFERRAL_LOG_INTERVAL_MS, default 60s): 50 cycles running near-
  // instantaneously in this mock must NOT produce 50 log lines for the SAME event.
  const deferralLogs = logs.filter((m) => /deferred without checkpoint/.test(m));
  assert.equal(deferralLogs.length, 1, `expected exactly one throttled log line across 50 rapid cycles, got ${deferralLogs.length}`);
});

test("F2-R deferredWithdrawals is visible in autodraftHealth while a withdrawal is deferred", async () => {
  const client = {
    query: async (sql) => {
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin" || normalized === "rollback" || normalized === "commit") return { rows: [], rowCount: 0 };
      // autodraftHealth's own combined SELECT names pending_dead_letters — check this FIRST,
      // since its query text also contains "from clara.firm_event_seq" as a subquery.
      if (/pending_dead_letters/i.test(sql)) {
        return { rows: [{ lag: 1, pending_dead_letters: 0, firms_tracked: 1 }], rowCount: 1 };
      }
      if (/from clara\.firm_event_seq/.test(sql)) {
        return { rows: [{ firm_id: "F", head_seq: 6, last_seq: 5 }], rowCount: 1 };
      }
      if (/from clara\.domain_events/.test(sql)) {
        return {
          rows: [{ seq: 6, id: "health-deferred-r2", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return {
          rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-stuck" } }],
          rowCount: 1,
        };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
  await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async () => {}, log: () => {} });
  const health = await autodraftHealth(client);
  assert.ok(health.deferredWithdrawals >= 1, `expected deferredWithdrawals >= 1, got ${health.deferredWithdrawals}`);
  assert.equal(health.pendingDeadLetters, 0, "distinct from pendingDeadLetters — the deferral is NOT a dead letter");
});

test("F2-R when the owner task settles, the SAME withdrawal event unblocks end-to-end", async () => {
  let settled = false;
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin" || normalized === "rollback" || normalized === "commit") return { rows: [], rowCount: 0 };
      if (/pending_dead_letters/i.test(sql)) {
        return { rows: [{ lag: 0, pending_dead_letters: 0, firms_tracked: 1 }], rowCount: 1 };
      }
      if (/from clara\.firm_event_seq/.test(sql)) {
        return { rows: [{ firm_id: "F", head_seq: 6, last_seq: 5 }], rowCount: 1 };
      }
      if (/from clara\.domain_events/.test(sql)) {
        return {
          rows: [{ seq: 6, id: "unblock-withdrawal-r2", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return settled
          ? { rows: [{ receipt: { outcome: "re_admitted_after_withdrawal", task_id: "task-unblocked" } }], rowCount: 1 }
          : { rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-stuck" } }], rowCount: 1 };
      }
      if (/insert into clara\.relay_checkpoints/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
  const enqueued = [];
  // Cycle 1: the owner task is still running -- deferred, no checkpoint, nothing enqueued.
  const before = await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async (id) => enqueued.push(id), log: () => {} });
  assert.equal(before.admitted, 0);
  assert.deepEqual(enqueued, []);
  const healthBefore = await autodraftHealth(client);
  assert.ok(healthBefore.deferredWithdrawals >= 1, "deferred before settlement");
  // deferredWithdrawalState is a MODULE-LEVEL map, shared with earlier cells in this same file
  // that deliberately leave their own stuck event un-settled — so the count is compared as a
  // DELTA (this test's own event clearing), never asserted against an absolute zero.
  const countBefore = healthBefore.deferredWithdrawals;

  // The owner task settles. Replaying the SAME event id now reaches 0053's own exception.
  settled = true;
  const after = await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async (id) => enqueued.push(id), log: () => {} });
  assert.equal(after.admitted, 1, "the SAME withdrawal now admits — this is the unblock, not a fresh event");
  assert.deepEqual(enqueued, ["task-unblocked"]);
  assert.ok(
    calls.some(({ sql }) => /insert into clara\.relay_checkpoints/i.test(sql)),
    "the checkpoint finally advances once the withdrawal actually processes",
  );
  const healthAfter = await autodraftHealth(client);
  assert.equal(healthAfter.deferredWithdrawals, countBefore - 1, "THIS event's deferral clears the moment it resolves");
});

test("runCatchupPass admits with origin 'sweep' — the generic unattended pass may never take the one_click door", async () => {
  // 0053 / §7-A F8: the re-admit-after-withdrawal arm is gated on p_origin='one_click', which
  // is what makes a human's withdrawal STICKY AGAINST ORDINARY AUTOMATION. GM-10 has one
  // separately named path: the current entry.withdrawn event goes through the audited DB door,
  // which proves the exact human act before it delegates to 0053. The generic catch-up pass has
  // no such evidence and must stay sweep. That gate is runtime-layer
  // discipline, NOT a privilege boundary: clara_runtime can call admit_autodraft_task with
  // 'one_click' directly, and 0053's prestate producer census reads pg_proc, which the runtime
  // is not in. So the property has to be pinned HERE, on the one production call site that
  // could reopen it -- this catch-up pass, which runs unattended every few minutes over exactly
  // the no-live-entry state a withdrawal creates.
  //
  // A future "let the retry door work for stragglers too" edit now fails a named test instead
  // of silently redrafting work a human deliberately rejected (and, where an autopost rule is
  // live, seeing it re-approved ~100ms later).
  const calls = { openSweep: [], admits: [], tx: [] };
  const client = {
    query: async (sql, params) => {
      if (/^(begin|commit|rollback)$/i.test(sql.trim())) { calls.tx.push(sql.trim().toLowerCase()); return { rows: [], rowCount: 0 }; }
      if (/list_autodraft_candidates/.test(sql)) return { rows: [{ firm_id: "F", filing_id: "fil-1" }], rowCount: 1 };
      if (/open_sweep_run/.test(sql)) { calls.openSweep.push(params); return { rows: [{ run_id: "run-c" }], rowCount: 1 }; }
      if (/admit_autodraft_task/.test(sql)) {
        calls.admits.push(params);
        return { rows: [{ receipt: { outcome: "admitted", task_id: "t1" } }], rowCount: 1 };
      }
      if (/reconcile_sweep_runs/.test(sql)) return { rows: [{ r: null }], rowCount: 1 };
      throw new Error("unexpected query: " + sql);
    },
  };
  const enqueued = [];
  const out = await runCatchupPass(client, { enqueue: async (id) => enqueued.push(id), log: () => {}, model: "gpt-x", reserveTokens: 777 });

  assert.equal(calls.admits.length, 1, "the straggler was put to admission");
  // Same deep-equal shape as the admitDocument cell above: full positional args, so the origin
  // cannot drift without this failing.
  assert.deepEqual(
    calls.admits[0], ["fil-1", "sweep", "run-c", "gpt-x", 777],
    "the catch-up pass MUST admit with origin 'sweep' -- 'one_click' would hand the unattended loop the 0053 re-admit door and reopen F8's blocker",
  );
  assert.equal(out.admitted, 1);
  assert.deepEqual(enqueued, ["t1"]);
});

test("admitDocument resolves the document's filings from the injected resolver (event carries NO client)", async () => {
  const seen = [];
  const resolver = async (_c, { firmId, documentId }) => {
    seen.push({ firmId, documentId });
    return [{ firmId, filingId: "fil-1" }];
  };
  const client = mockAdmitClient({ outcomes: [{ outcome: "admitted", task_id: "t1" }] });
  await admitDocument(client, { firmId: "F", documentId: "DOC-NO-CLIENT" }, { resolveDocumentFilings: resolver });
  assert.deepEqual(seen, [{ firmId: "F", documentId: "DOC-NO-CLIENT" }], "resolution is keyed on the document only");
});

test("resolveDocumentFilings maps the definer read rows to {firmId, filingId} and drops nulls", async () => {
  const client = {
    query: async (sql, params) => {
      assert.match(sql, /list_document_autodraft_candidates/);
      assert.deepEqual(params, ["DOC"]);
      return {
        rows: [
          { firm_id: "F", filing_id: "fil-1" },
          { firm_id: "F", filing_id: null }, // defensive: never a live filing id
        ],
        rowCount: 2,
      };
    },
  };
  const filings = await resolveDocumentFilings(client, { firmId: "F", documentId: "DOC" });
  assert.deepEqual(filings, [{ firmId: "F", filingId: "fil-1" }]);
});
