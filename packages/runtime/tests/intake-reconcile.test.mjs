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
  root = await mkdtemp(join(base, "clara-reconcile-"));
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

function deniedSnapshotClient(onWriter = async () => ({ rows: [{ receipt: {} }], rowCount: 1 })) {
  return {
    query(sql, params) {
      if (/select t\.id as task_id/.test(sql)) throw Object.assign(new Error("permission denied"), { code: "42501" });
      return onWriter(sql, params);
    },
  };
}

function task(status, extra = {}) {
  return {
    schemaVersion: 1,
    taskId: randomUUID(),
    documentId: randomUUID(),
    firmId: randomUUID(),
    status,
    lane: "structured_parse",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    ...extra,
  };
}

test("queued-unbound document task is re-enqueued from the durable sidecar index", async () => {
  const row = task("queued");
  await writeTaskMeta(row.taskId, row);
  const starts = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (starts.push(id), { runId: "run-new" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(starts, [row.taskId]);
  assert.equal(out.documentReenqueued, 1);
  assert.equal((await readTaskMeta(row.taskId)).runId, "run-new");
  await removeTaskMeta(row.taskId);
});

test("lost running document task is requeued through the migration writer", async () => {
  const row = task("running", { runId: "missing-run" });
  await writeTaskMeta(row.taskId, row);
  let requeued = false;
  const client = deniedSnapshotClient(async (sql) => {
    if (/requeue_stranded_document_task/.test(sql)) requeued = true;
    return { rows: [{ receipt: { status: "queued" } }], rowCount: 1 };
  });
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async () => ({ runId: "unused" }),
    getRun: () => ({ status: Promise.reject(Object.assign(new Error("run x not found"), { name: "RunNotFound" })) }),
  });
  assert.equal(requeued, true);
  assert.equal(out.documentRequeuedLost, 1);
  assert.equal((await readTaskMeta(row.taskId)).status, "queued");
  await removeTaskMeta(row.taskId);
});

test("flag flip releases held-egress tasks before re-enqueue", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = task("held_egress", { lane: "ocr" });
  await writeTaskMeta(row.taskId, row);
  const starts = [];
  const client = deniedSnapshotClient(async (sql) => ({
    rows: [{ receipt: /release_held/.test(sql) ? { released: 1 } : {} }],
    rowCount: 1,
  }));
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (starts.push(id), { runId: "released-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.equal(out.documentHeldReleased, 1);
  assert.deepEqual(starts, [row.taskId]);
  await removeTaskMeta(row.taskId);
});
