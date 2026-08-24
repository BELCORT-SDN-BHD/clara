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

test("GM-10 cycle rolls back and retains a pending-settlement withdrawal, recording ONE bounded attempt", async () => {
  // F2 (opus review, measured): a live owner task used to spend NO attempt budget at all —
  // 3 cycles, checkpoint never moved, relay_dead_letters stayed at 0 the whole time, no
  // operator signal, ever. It now DOES spend attempt budget (bounded — see the next test),
  // via the SAME retained-event ledger the thrown-error path already used, so the count
  // survives across cycles/restarts. One attempt, well under the cap, still retains without
  // checkpointing — that half of the old contract is unchanged.
  const calls = [];
  let dlAttempts = 0;
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
          rows: [{ seq: 6, id: "early-withdrawal", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return {
          rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-running" } }],
          rowCount: 1,
        };
      }
      if (/insert into clara\.relay_dead_letters/i.test(sql)) {
        dlAttempts += 1;
        return { rows: [{ attempt_count: dlAttempts }], rowCount: 1 };
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
    ["begin", "rollback", "begin", "commit"],
    "the effect transaction rolls back, then the bounded-attempt record commits in its OWN transaction",
  );
  assert.equal(
    calls.some(({ sql }) => /insert into clara\.relay_checkpoints/i.test(sql)),
    false,
    "the withdrawal checkpoint is still retained — one attempt is well under the cap",
  );
  assert.equal(dlAttempts, 1, "exactly one bounded attempt was recorded for this cycle");
  assert.deepEqual(enqueued, [], "no task exists to enqueue before terminal settlement");
  assert.deepEqual(out, { firms: 1, admitted: 0, capped: false });
  assert.ok(logs.some((message) => /deferred without checkpoint \(attempt 1\/5\): retry_pending_settlement/.test(message)));
});

test("GM-10 a stuck owner task dead-letters and the checkpoint advances after MAX_RETRY_PENDING_CYCLES cycles", async () => {
  // The bound itself, end to end: an owner task that NEVER settles (a crashed worker, a
  // human review that never finishes) must not block the firm's whole autodraft lane
  // head-of-line forever. After the cap, the SAME treatment the thrown-error path already
  // gets: checkpoint PAST the poison and leave its relay_dead_letters row exactly where it
  // is — status stays 'pending', so this IS retention (an operator can still see and redrive
  // it), never a silent drop.
  let dlAttempts = 0;
  let checkpointSeq = null;
  const client = {
    query: async (sql) => {
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin" || normalized === "rollback" || normalized === "commit") return { rows: [], rowCount: 0 };
      if (/from clara\.firm_event_seq/.test(sql)) {
        if (checkpointSeq != null && checkpointSeq >= 6) return { rows: [], rowCount: 0 }; // caught up
        return { rows: [{ firm_id: "F", head_seq: 6, last_seq: checkpointSeq ?? 5 }], rowCount: 1 };
      }
      if (/from clara\.domain_events/.test(sql)) {
        return {
          rows: [{ seq: 6, id: "stuck-withdrawal", event_type: "entry.withdrawn", document_id: "D" }],
          rowCount: 1,
        };
      }
      if (/readmit_autodraft_after_withdrawal/.test(sql)) {
        return {
          rows: [{ receipt: { outcome: "retry_pending_settlement", prior_task_id: "task-stuck" } }],
          rowCount: 1,
        };
      }
      if (/insert into clara\.relay_dead_letters/i.test(sql)) {
        dlAttempts += 1;
        return { rows: [{ attempt_count: dlAttempts }], rowCount: 1 };
      }
      if (/insert into clara\.relay_checkpoints/i.test(sql)) {
        checkpointSeq = 6;
        return { rows: [], rowCount: 1 };
      }
      throw new Error("unexpected query: " + sql);
    },
  };
  const logs = [];
  for (let cycle = 1; cycle <= 5; cycle++) {
    await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async () => {}, log: (m) => logs.push(m) });
  }
  assert.equal(dlAttempts, 5, "five cycles spent exactly five bounded attempts — cross-cycle persistent state, not an in-memory counter");
  assert.equal(checkpointSeq, 6, "PROVED: after the cap the checkpoint advances past the stuck deferral");
  assert.ok(
    logs.some((m) => /owner task never settled after 5 cycles .* dead-lettered \+ skipped/.test(m)),
    `expected an exhaustion log line, got: ${JSON.stringify(logs.slice(-3))}`,
  );
  // Retention, not silent-drop: a 6th cycle finds nothing left behind the now-advanced
  // checkpoint — the event never silently respawns, and its dead-letter row (attempt_count=5,
  // status still 'pending') stays exactly where an operator would find it.
  const after = await runAutodraftCycle(client, { onlyFirm: "F", enqueue: async () => {}, log: () => {} });
  assert.equal(after.admitted, 0);
  assert.equal(dlAttempts, 5, "the caught-up firm is never rediscovered, so no further attempt is spent");
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
