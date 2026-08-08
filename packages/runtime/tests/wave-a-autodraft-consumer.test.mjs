// Wave A — the autodraft consumer's PURE logic (no DB, no world). Proves the admission
// fan-out + outcome handling + the document->filing resolver mapping that the event/catch-up
// paths feed into clara.admit_autodraft_task. Contract §3 / companion §4. These MUST pass at
// build time (the 0011-dependent end-to-end behaviour is exercised in wave-a-autodraft-db).

import { test } from "node:test";
import assert from "node:assert/strict";
import { admissionNeedsStart, admitDocument, resolveDocumentFilings, runCatchupPass, AUTODRAFT_CONSUMER, AUTODRAFT_EVENT_TYPES } from "../lib/autodraft.mjs";

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
  assert.deepEqual([...AUTODRAFT_EVENT_TYPES], ["document.invoice_facts_completed", "document.invoice_facts_failed"]);
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

test("runCatchupPass admits with origin 'sweep' — the UNATTENDED pass may never take the one_click door", async () => {
  // 0053 / §7-A F8: the re-admit-after-withdrawal arm is gated on p_origin='one_click', which
  // is what makes a human's withdrawal STICKY AGAINST AUTOMATION. That gate is runtime-layer
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
