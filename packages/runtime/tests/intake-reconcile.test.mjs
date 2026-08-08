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

// Finding 11 — a RUNNING classify task has a synthetic run id (no WDK run), so the shared
// reconciler must NEVER probe getRun for it (that resolves 'lost' and requeues a live worker,
// causing a duplicate concurrent LLM call + double-settle). Its own leader loop owns recovery.
test("a RUNNING classify task is never probed via getRun and never requeued (finding 11)", async () => {
  const row = task("running", { lane: "classify", runId: "classify:t-1:abc" });
  await writeTaskMeta(row.taskId, row);
  let getRunCalled = false;
  let requeued = false;
  const client = deniedSnapshotClient(async (sql) => {
    if (/requeue_stranded_document_task/.test(sql)) requeued = true;
    return { rows: [{ receipt: { status: "queued" } }], rowCount: 1 };
  });
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async () => ({ runId: "unused" }),
    getRun: () => {
      getRunCalled = true;
      return { status: Promise.reject(Object.assign(new Error("run not found"), { name: "RunNotFound" })) };
    },
  });
  assert.equal(getRunCalled, false, "getRun is NEVER called for a classify task (synthetic run, no WDK run to probe)");
  assert.equal(requeued, false, "a live running classify task is NOT requeued by the shared reconciler");
  assert.equal(out.documentRequeuedLost, 0);
  assert.equal((await readTaskMeta(row.taskId)).status, "running", "the task stays running — its own loop owns recovery");
  await removeTaskMeta(row.taskId);
});

// Finding 12 — a QUEUED classify task past the grace must NOT be driven through documentIngest
// (an Azure OCR run for a classify task = real vendor egress, then CLR16 at persist). The
// classify leader loop owns dispatch; the shared reconciler skips the lane with a one-shot warn.
test("a QUEUED classify task is never driven through documentIngest (finding 12)", async () => {
  const row = task("queued", { lane: "classify" });
  await writeTaskMeta(row.taskId, row);
  const ingestStarts = [];
  const out = await reconcileDocumentTasks(deniedSnapshotClient(), {
    enqueueDocumentIngest: async (id) => (ingestStarts.push(id), { runId: "OCR-RUN-SHOULD-NOT-HAPPEN" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.deepEqual(ingestStarts, [], "a classify task is NEVER passed to enqueueDocumentIngest (no Azure OCR egress)");
  assert.equal(out.documentReenqueued, 0, "the reconciler re-enqueues nothing for the classify lane");
  assert.equal((await readTaskMeta(row.taskId)).status, "queued", "the task stays queued for the classify loop to claim");
  await removeTaskMeta(row.taskId);
});

// F4 (H2 acceptance report, migration 0050). This cell used to run the DENIED-snapshot path
// with a canned receipt, which made it a proof that THE FLAG dispatches a held task — the
// runtime half of the release/re-hold storm. The release is DB-adjudicated now: the sweep
// asks, re-reads, and dispatches only what the DB actually MOVED. Modelled the way Postgres
// answers (the release commits before the re-read), an OCR hold — kill-switch-only, so the
// DB always releases it once the switch is on — still dispatches in the same cycle.
test("flag flip releases held-egress tasks before re-enqueue (the DB moves the row; the sweep re-reads it)", async () => {
  process.env.CLARA_DOC_EGRESS_APPROVED = "1";
  const row = task("held_egress", { lane: "ocr" });
  await writeTaskMeta(row.taskId, row);
  const starts = [];
  let released = false;
  const client = {
    query(sql) {
      if (/release_held/.test(sql)) {
        released = true;
        return Promise.resolve({ rows: [{ receipt: { released: 1 } }], rowCount: 1 });
      }
      if (/select t\.id as task_id/.test(sql)) {
        return Promise.resolve({
          rows: [{
            task_id: row.taskId, document_id: row.documentId, firm_id: row.firmId,
            engine_id: "azure-di:layout", engine_config: {}, version_n: 1,
            lane: "ocr", status: released ? "queued" : "held_egress",
            run_id: null, created_at: row.createdAt,
          }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [{ receipt: {} }], rowCount: 1 });
    },
  };
  const out = await reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (starts.push(id), { runId: "released-run" }),
    getRun: () => ({ status: Promise.resolve("running") }),
  });
  assert.equal(out.documentHeldReleased, 1);
  assert.deepEqual(starts, [row.taskId]);
  delete process.env.CLARA_DOC_EGRESS_APPROVED;
  await removeTaskMeta(row.taskId);
});
