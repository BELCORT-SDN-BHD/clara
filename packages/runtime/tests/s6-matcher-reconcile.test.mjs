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
    // TRANSPORT, which every production ingest task carries: intake.mjs writes storageKey +
    // sha256 into the sidecar before it enqueues (intake.mjs:366-383). The fixture omitted
    // them, which modelled a task the product never creates — and 0051 §2 made that shape
    // load-bearing: the reconciler now refuses to dispatch a transport-less ingest task,
    // because behavior_v2 would call downloadCanonical with an undefined key and manufacture
    // a storage_error terminal indistinguishable from a real engine fault. These cells are
    // about lane DISPATCH, so they get the transport and keep testing their own subject.
    storageKey: `firms/00000000-0000-4000-8000-0000000000ff/docs/${"a".repeat(64)}.pdf`,
    sha256: "a".repeat(64),
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

// F4 (H2 acceptance report, migration 0050): this cell used to prove the WRONG property. It
// ran the DENIED-snapshot path with a sidecar reading held_egress and a canned release
// receipt, so what it actually asserted was "the env flag dispatches a held task" — the
// runtime half of the release/re-hold storm. The release is now DB-adjudicated: the sweep
// asks the database to release, re-reads, and dispatches only what the database MOVED. So the
// released task is modelled the way Postgres answers it — the post-release row reads 'queued'
// — and the fail-closed direction gets its own cell below.
test("released held_egress invoice_facts task routes to the facts lane in the same cycle", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = task("invoice_facts", "held_egress");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const facts = [];
  let released = false;
  // A WORKING snapshot (not the 42501 fallback): the release commits first, so the row this
  // sweep then reads already says 'queued'.
  const client = {
    query(sql) {
      if (/release_held/.test(sql)) {
        released = true;
        return Promise.resolve({ rows: [{ receipt: { released: 2 } }], rowCount: 1 });
      }
      if (/select t\.id as task_id/.test(sql)) {
        return Promise.resolve({
          rows: [{
            task_id: row.taskId, document_id: row.documentId, firm_id: row.firmId,
            engine_id: "azure-di:prebuilt-invoice", engine_config: {}, version_n: 1,
            lane: "invoice_facts", status: released ? "queued" : "held_egress",
            run_id: null, created_at: row.createdAt,
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [{ receipt: {} }], rowCount: 1 });
    },
  };
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.equal(out.documentHeldReleased, 2, "held-release count reflects the DB body (the whole egressing lane triple)");
  assert.deepEqual(facts, [row.taskId], "the released facts task re-enqueues on its own lane");
  assert.deepEqual(ingest, [], "documentIngest never sees the released facts task");
  delete process.env.CLARA_DOC_EGRESS_APPROVED;
  await removeTaskMeta(row.taskId);
});

test("a held_egress invoice_facts task the DB DECLINED to release is NOT dispatched (F4 — the flag is not the release authority)", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = task("invoice_facts", "held_egress");
  await writeTaskMeta(row.taskId, row);
  const ingest = [];
  const facts = [];
  // Post-0050: the consent hold survives the sweep, so the re-read still says held_egress.
  const client = {
    query(sql) {
      if (/release_held/.test(sql)) return Promise.resolve({ rows: [{ receipt: { released: 0 } }], rowCount: 1 });
      if (/select t\.id as task_id/.test(sql)) {
        return Promise.resolve({
          rows: [{
            task_id: row.taskId, document_id: row.documentId, firm_id: row.firmId,
            engine_id: "azure-di:prebuilt-invoice", engine_config: {}, version_n: 1,
            lane: "invoice_facts", status: "held_egress", run_id: null, created_at: row.createdAt,
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [{ receipt: {} }], rowCount: 1 });
    },
  };
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (ingest.push(id), { runId: "ingest-run" }),
    enqueueInvoiceFacts: async (id) => (facts.push(id), { runId: "facts-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(facts, [], "no run is dispatched for a task the DB left held — this is the storm's runtime half");
  assert.deepEqual(ingest, []);
  assert.equal(out.documentReenqueued, 0);
  assert.equal(out.documentHeldDeclined, 1);
  delete process.env.CLARA_DOC_EGRESS_APPROVED;
  await removeTaskMeta(row.taskId);
});
