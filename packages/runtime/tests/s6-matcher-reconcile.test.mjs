// Slice-6 reconciler regression: lane-aware re-enqueue. 0009 adds the 'invoice_facts'
// processing lane, driven by its OWN workflow (invoiceFacts_v1) — NOT documentIngest.
// The document sweep is lane-agnostic by task status, but the re-enqueue must dispatch by
// lane: 'ocr'/'structured_parse' → enqueueDocumentIngest, 'invoice_facts' →
// enqueueInvoiceFacts. A facts task must NEVER be driven through documentIngest (that
// runs OCR steps + persists a layout extraction). When the supervisor has not wired
// enqueueInvoiceFacts, a facts task is skipped, never misrouted. Pure-mock (no DB) —
// mirrors intake-reconcile.test.mjs. INTERFACE-PINS §5(B); companion §5.

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

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-s6-reconcile-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  previousGrace = process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS;
  process.env.CLARA_SPOOL_DIR = root;
  process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS = "1";
});

after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  if (previousGrace === undefined) delete process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS;
  else process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS = previousGrace;
  delete process.env.CLARA_DOC_EGRESS_APPROVED;
  await rm(root, { recursive: true, force: true });
});

// Force the DB snapshot to 42501 so the sweep falls back to the durable sidecar index
// (writeTaskMeta), then answer any writer call benignly.
function deniedSnapshotClient(onWriter = async () => ({ rows: [{ receipt: {} }], rowCount: 1 })) {
  return {
    query(sql, params) {
      if (/select t\.id as task_id/.test(sql)) throw Object.assign(new Error("permission denied"), { code: "42501" });
      return onWriter(sql, params);
    },
  };
}

function task(lane, status = "queued", extra = {}) {
  return {
    schemaVersion: 1,
    taskId: randomUUID(),
    documentId: randomUUID(),
    firmId: randomUUID(),
    status,
    lane,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    ...extra,
  };
}

test("invoice_facts queued task routes to enqueueInvoiceFacts, never enqueueDocumentIngest", async () => {
  const row = task("invoice_facts");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const facts = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(facts, [row.taskId], "the facts task was driven through invoiceFacts");
  assert.deepEqual(ingest, [], "documentIngest was NOT called for a facts task");
  assert.equal(out.documentReenqueued, 1);
  assert.equal((await readTaskMeta(row.taskId)).runId, "facts-run");
  await removeTaskMeta(row.taskId);
});

test("invoice_facts task is SKIPPED (never misrouted) when enqueueInvoiceFacts is not wired", async () => {
  const row = task("invoice_facts");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    // enqueueInvoiceFacts intentionally absent
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(ingest, [], "a facts task is never routed through documentIngest");
  assert.equal(out.documentReenqueued, 0, "no re-enqueue when the facts lane is unwired");
  assert.equal((await readTaskMeta(row.taskId)).runId ?? null, null, "task left unbound for the next cycle");
  await removeTaskMeta(row.taskId);
});

test("local_facts queued task routes to enqueueLocalFacts, never enqueueDocumentIngest (Wave A2)", async () => {
  const row = task("local_facts");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const local = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueLocalFacts: async (id) => (local.push(id), { runId: null }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(local, [row.taskId], "local_facts rides the MyInvois consumer");
  assert.deepEqual(ingest, [], "documentIngest never sees a local_facts task");
  assert.equal(out.documentReenqueued, 1);
  await removeTaskMeta(row.taskId);
});

test("local_facts task is SKIPPED (never misrouted) when enqueueLocalFacts is not wired (Wave A2)", async () => {
  const row = task("local_facts");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    // enqueueLocalFacts intentionally absent
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(ingest, [], "a local_facts task is NEVER driven through documentIngest");
  assert.equal(out.documentReenqueued, 0);
  await removeTaskMeta(row.taskId);
});

test("ocr queued task still routes to enqueueDocumentIngest (unchanged)", async () => {
  const row = task("ocr");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const facts = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(ingest, [row.taskId], "ocr rides documentIngest");
  assert.deepEqual(facts, [], "the facts lane is untouched by an ocr task");
  assert.equal(out.documentReenqueued, 1);
  await removeTaskMeta(row.taskId);
});

test("released held_egress invoice_facts task routes to the facts lane in the same cycle", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = task("invoice_facts", "held_egress");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const facts = [];
  const client = deniedSnapshotClient(async (sql) => ({
    rows: [{ receipt: /release_held/.test(sql) ? { released: 2 } : {} }],
    rowCount: 1,
  }));
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.equal(out.documentHeldReleased, 2, "held-release count reflects the DB body (both lanes)");
  assert.deepEqual(facts, [row.taskId], "the released facts task re-enqueues on its own lane");
  assert.deepEqual(ingest, [], "documentIngest never sees the released facts task");
  delete process.env.CLARA_DOC_EGRESS_APPROVED;
  await removeTaskMeta(row.taskId);
});
