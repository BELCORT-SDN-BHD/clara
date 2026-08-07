// F4 (H2 acceptance report) — THE RUNTIME HALF of the egress-release fix.
//
// The witnessed failure: clara.release_held_document_tasks correctly DECLINES to release a
// task whose hold is consent-based, and the reconciler dispatched it anyway — because it
// rewrote every held_egress task in its own working copy to "queued" off
// process.env.CLARA_DOC_EGRESS_APPROVED alone, then enqueued a workflow run off that
// rewritten status. The claim re-derived 'no_consent', re-held the task, and the pair cycled
// ~29 workflow runs/minute for six minutes (DB connections 32/60 → 42/60, two health flaps).
// Fixing only the DB half leaves the storm running at exactly the same rate with a
// differently-worded row — so this file models the POST-0050 world precisely and pins the
// runtime verdict.
//
// THE HARNESS (the review lane's, reproduced): the release call returns {released:0} and the
// task snapshot — taken AFTER it, from the database — still reports status='held_egress'.
// Across three sweep ticks the expected dispatch count is ZERO. The contrast cell is what
// makes that a real assertion rather than a broken mock: a genuinely released row (the DB
// moved it, so the post-release snapshot reads 'queued') dispatches exactly once.
//
// Pure-mock (no DB), the intake-reconcile.test.mjs / s6-matcher-reconcile.test.mjs idiom.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { reconcileDocumentTasks } from "../lib/reconciler.mjs";
import { readTaskMeta, removeTaskMeta, writeTaskMeta } from "../lib/spool.mjs";

let root;
let previousSpool;
let previousGrace;
let previousApproved;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-f4-egress-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  previousGrace = process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS;
  previousApproved = process.env.CLARA_DOC_EGRESS_APPROVED;
  process.env.CLARA_SPOOL_DIR = root;
  process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS = "1";
});

after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  if (previousGrace === undefined) delete process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS;
  else process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS = previousGrace;
  if (previousApproved === undefined) delete process.env.CLARA_DOC_EGRESS_APPROVED;
  else process.env.CLARA_DOC_EGRESS_APPROVED = previousApproved;
  await rm(root, { recursive: true, force: true });
});

/** A DB row as clara.document_processing_tasks hands it to documentTaskSnapshot. */
function dbRow({ lane = "invoice_facts", status = "held_egress", taskId = randomUUID() } = {}) {
  return {
    task_id: taskId,
    document_id: randomUUID(),
    firm_id: randomUUID(),
    engine_id: "azure-di:prebuilt-invoice",
    engine_config: {},
    version_n: 1,
    lane,
    status,
    run_id: null,
    created_at: new Date(Date.now() - 600_000).toISOString(),
  };
}

/**
 * A client whose document-task SNAPSHOT succeeds (the real, DB-authoritative path — NOT the
 * 42501 sidecar fallback the other reconcile suites use), wired so the snapshot reflects
 * whatever the release actually did.
 *
 * `snapshotRows()` is called per tick, AFTER the release query for that tick, so a cell can
 * model "the DB released it" (row flips to 'queued') or "the DB declined" (row stays
 * held_egress) exactly as Postgres would answer.
 */
function dbClient({ snapshotRows, releaseReceipt = { released: 0 }, onRelease }) {
  const releaseCalls = [];
  return {
    releaseCalls,
    query(sql, params) {
      if (/release_held_document_tasks/.test(sql)) {
        releaseCalls.push(params);
        onRelease?.();
        return Promise.resolve({ rows: [{ receipt: releaseReceipt }], rowCount: 1 });
      }
      if (/select t\.id as task_id/.test(sql)) {
        return Promise.resolve({ rows: snapshotRows(), rowCount: snapshotRows().length });
      }
      return Promise.resolve({ rows: [{ receipt: {} }], rowCount: 1 });
    },
  };
}

test("F4-RT-1: a task the DB release DECLINED is never dispatched — zero runs across three ticks", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  // The post-0050 world: an invoice_facts document filed to a client with no live
  // clara.client_egress_consents row. The release considers it and moves nothing.
  const row = dbRow({ lane: "invoice_facts", status: "held_egress" });
  const facts = [];
  const ingest = [];
  const client = dbClient({
    releaseReceipt: { released: 0 },
    snapshotRows: () => [row], // the DB never moved it: it still reads held_egress
  });

  let out;
  for (let tick = 1; tick <= 3; tick += 1) {
    out = await reconcileDocumentTasks(client, {
      enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
      enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: `facts-run-${tick}` }),
      getRun: () => ({ status: Promise.resolve("running") }),
    });
  }

  assert.equal(client.releaseCalls.length, 3, "the sweep still ASKS the DB to release on every tick (self-healing the moment consent lands)");
  assert.equal(out.documentHeldReleased, 0, "the DB released nothing — the receipt is reported honestly");
  assert.deepEqual(facts, [], "ZERO invoiceFacts runs dispatched across three ticks — the DB declined, so the reconciler declines");
  assert.deepEqual(ingest, [], "and the task is never misrouted through documentIngest either");
  assert.equal(out.documentReenqueued, 0, "no re-enqueue is counted");
  assert.equal(out.documentHeldDeclined, 1, "the declined hold is COUNTED, not silently dropped");
  await removeTaskMeta(String(row.task_id));
});

test("F4-RT-2: a genuinely RELEASED task dispatches exactly once (the contrast — the guard is not a blanket refusal)", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = dbRow({ lane: "invoice_facts", status: "held_egress" });
  const facts = [];
  const ingest = [];
  // The DB releases it on the FIRST tick: the post-release snapshot reads 'queued' from then
  // on — which is exactly how Postgres answers, since the release commits before the
  // snapshot query runs.
  let releasedYet = false;
  const client = dbClient({
    releaseReceipt: { released: 1 },
    onRelease: () => { releasedYet = true; },
    snapshotRows: () => [{ ...row, status: releasedYet ? "queued" : "held_egress" }],
  });

  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });

  assert.equal(out.documentHeldReleased, 1, "the DB released it and said so");
  assert.deepEqual(facts, [String(row.task_id)], "the released facts task dispatches on its OWN lane, in the same cycle");
  assert.deepEqual(ingest, [], "documentIngest never sees a facts task");
  assert.equal(out.documentReenqueued, 1, "exactly one dispatch");
  assert.equal(out.documentHeldDeclined, 0, "nothing was declined");
  assert.equal((await readTaskMeta(String(row.task_id)))?.runId, "facts-run", "the sidecar records the run it actually started");
  await removeTaskMeta(String(row.task_id));
});

test("F4-RT-3: a statement_facts task the DB DID release dispatches on its own lane (the lane triple is not collateral damage)", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = dbRow({ lane: "statement_facts", status: "held_egress" });
  const statements = [];
  const ingest = [];
  let releasedYet = false;
  const client = dbClient({
    releaseReceipt: { released: 1 },
    onRelease: () => { releasedYet = true; },
    snapshotRows: () => [{ ...row, status: releasedYet ? "queued" : "held_egress" }],
  });

  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueStatementFacts: async (id) => (statements.push(id), { runId: "stmt-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });

  assert.deepEqual(statements, [String(row.task_id)], "a released statement_facts task rides statementFacts_v1");
  assert.deepEqual(ingest, [], "a bank statement is NEVER driven through the generic OCR lane");
  assert.equal(out.documentReenqueued, 1);
  await removeTaskMeta(String(row.task_id));
});

test("F4-RT-4: the flag alone can no longer release — a held row with the flag ON and the DB silent stays undispatched", async () => {
  // The precise inversion of the bug: everything the OLD code needed to dispatch is true
  // (CLARA_DOC_EGRESS_APPROVED="1", a held_egress row, a wired lane) and the ONE thing that
  // now matters — the database having actually moved the row — is not.
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = dbRow({ lane: "invoice_facts", status: "held_egress" });
  const facts = [];
  const client = dbClient({ releaseReceipt: { released: 0 }, snapshotRows: () => [row] });
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async () => ({ runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(facts, [], "the env flag is no longer the release authority — the DB verdict is");
  assert.equal(out.documentHeldDeclined, 1);
  assert.equal((await readTaskMeta(String(row.task_id)))?.status, "held_egress", "and the sidecar is NOT rewritten to 'queued' behind the DB's back");
  await removeTaskMeta(String(row.task_id));
});

test("F4-RT-5: when the DB snapshot is UNAVAILABLE, a held sidecar is not dispatched on faith (absence is not evidence)", async () => {
  // The degraded path: the task SELECT 42501s and the sweep falls back to the durable spool
  // index, whose row can only say what it last knew. "We could not read the DB" is not
  // "the DB released it" — this must fall through to the same fail-closed branch.
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const taskId = randomUUID();
  await writeTaskMeta(taskId, {
    schemaVersion: 1,
    taskId,
    documentId: randomUUID(),
    firmId: randomUUID(),
    lane: "invoice_facts",
    status: "held_egress",
    createdAt: new Date(Date.now() - 600_000).toISOString(),
    updatedAt: new Date(Date.now() - 600_000).toISOString(),
  });
  const facts = [];
  const client = {
    query(sql) {
      if (/select t\.id as task_id/.test(sql)) throw Object.assign(new Error("permission denied"), { code: "42501" });
      return Promise.resolve({ rows: [{ receipt: /release_held/.test(sql) ? { released: 3 } : {} }], rowCount: 1 });
    },
  };
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async () => ({ runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(facts, [], "a sidecar that says held_egress is never dispatched when the DB could not be re-read — even though the release receipt claimed 3 rows moved (it names no ids, so it is evidence for no PARTICULAR task)");
  assert.equal(out.documentHeldDeclined, 1);
  await removeTaskMeta(taskId);
});
