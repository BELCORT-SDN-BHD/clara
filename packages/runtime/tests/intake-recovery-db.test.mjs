// 0051 §2 — THE INTAKE RECOVERY DOOR, END TO END ON A REAL RIG. No mock stands in for the
// database, and no fixture plants a task row by hand: the failed ingest this door recovers is
// produced by the product's OWN writers (claim_document_processing_task ->
// persist_document_extraction('failed')), and the recovery is triggered by a real re-upload
// of the identical bytes through the real intake path.
//
// WHY THIS FILE EXISTS ON TOP OF THE OTHER TWO. The door has three parts and the other two
// batteries each prove one of them in isolation:
//   * packages/db/tests/x51-extraction-recovery.test.mjs proves WHICH documents the DB admits
//     (real Postgres, but the runtime is not in the picture);
//   * packages/runtime/tests/intake-recovery-unit.test.mjs proves what the runtime does with a
//     recovery fragment (real spool + real canonical store, but a mock DB hands it the
//     fragment).
// Neither proves the SEAM: that a real finalize_document_intake actually emits a fragment the
// real runtime can consume, and that what comes out the far end is a task the FROZEN
// documentIngest_v2 can process like any other. That is this file's whole job, and it is the
// claim migration 0051's header makes in one line — "by the time the workflow claims, a
// recovered task is indistinguishable from an intake-minted one". Asserted here, not assumed.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";

import * as rig from "./rig.mjs";
import { beginDocumentIntake, finalizeDocumentIntake, makeDocumentServices, uploadDocumentBytes } from "../lib/intake.mjs";
import { processDocumentTaskBehaviorV2 } from "../workflows/documentIngest.behavior_v2.mjs";
import { reconcileDocumentTasks } from "../lib/reconciler.mjs";
import { readTaskMeta, removeTaskMeta } from "../lib/spool.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
const withRuntime = (fn) => rig.asRuntime(fn);
let root;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = join(base, `clara-intake-recovery-db-${Date.now().toString(36)}`);
  await mkdir(root, { recursive: true });
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  delete globalThis.__claraAzureForTest;
  await rig.endPool();
  await rm(root, { recursive: true, force: true });
});

const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
const OK_AZURE = { operationId: "fixture-op", analyzeResult: { content: "MYR 1.00", pages: [{ pageNumber: 1, lines: [{ content: "MYR 1.00", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }] } };

/** One real intake of PDF_BYTES for `owner`/`firm`. Returns the finalize receipt and the
 *  task ids the enqueue callback was actually handed. */
async function ingest(owner, firm, label) {
  const started = [];
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: `${label}.pdf`, mime: "application/pdf", declared_bytes: PDF_BYTES.length, origin: "documents_tab",
    }));
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([PDF_BYTES]) });
  const receipt = await finalizeDocumentIntake({
    withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
    enqueue: async (taskId) => (started.push(taskId), { runId: `${label}-run` }),
  });
  return { receipt, started };
}

const taskRow = async (id) => (await rig.asRuntime((c) =>
  c.query("select status, lane, version_n, engine_id, error_code from clara.document_processing_tasks where id=$1", [id]))).rows[0];

test("[0051 §2] END TO END: a real failed ingest, a real re-upload, and the recovered task processes like any other", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("x51-recovery-e2e");

  // (1) A REAL first ingest, and a REAL failure through the product's own writers. Nothing is
  // planted: claim_document_processing_task stamps workflow_run_id + started_at, then
  // persist_document_extraction('failed') terminalises the row. That is the only shape
  // ck_processing_task_binding_0038 admits for an ordinary engine failure, and it is what the
  // deployed workflow actually produces (documentIngest.behavior_v2.mjs:224-228).
  const first = await ingest(owner, firm, "x51-e2e-first");
  assert.equal(first.receipt.status, "finalized", "the first ingest creates the document");
  const originalTask = first.receipt.task_id;
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [originalTask, "x51-e2e-run", true]));
  await rig.asRuntime((c) => c.query(
    "select clara.persist_document_extraction($1,'failed',0,'{}'::jsonb,'[]'::jsonb,'engine_error',null,$2)",
    [originalTask, `x51-e2e-fail-${Date.now()}`]));
  const failed = await taskRow(originalTask);
  assert.equal(failed.status, "failed", "mandatory setup: the ONLY ingest attempt is terminally failed");
  assert.equal(failed.error_code, "engine_error", "…with an ordinary engine failure");

  // (2) THE RECOVERY ACTION A HUMAN ACTUALLY TAKES: re-upload the same file. Identical bytes,
  // so the DB adopts by sha256 — the path that used to dead-end here.
  const second = await ingest(owner, firm, "x51-e2e-retry");
  assert.equal(second.receipt.status, "adopted",
    "the re-upload ADOPTS the existing document — content-addressed identity is unchanged");
  assert.equal(second.receipt.document_id, first.receipt.document_id, "…the SAME document, not a new one");
  assert.ok(second.receipt.recovery, "…and the receipt now carries a recovery fragment");

  const recoveredId = second.receipt.recovery.task_id;
  assert.notEqual(recoveredId, originalTask, "the recovery is a SIBLING task, never the failed one reopened");
  const recovered = await taskRow(recoveredId);
  assert.equal(recovered.status, "queued", "the committed recovery row is queued");
  assert.equal(recovered.lane, "ocr", "…on the ingest lane");
  assert.equal(recovered.version_n, failedVersion(failed) + 1, "…at version max+1");

  // The failed row is still exactly as it was — the whole ADR-062 requirement.
  const stillFailed = await taskRow(originalTask);
  assert.equal(stillFailed.status, "failed", "the original failure is untouched");
  assert.equal(stillFailed.error_code, "engine_error", "…code and all");

  // (3) THE SEAM: the runtime materialised the sidecar the FROZEN workflow will demand, and
  // started the run. Without this the DB row would sit queued until the reconciler dispatched
  // it with no transport metadata at all.
  assert.deepEqual(second.started, [recoveredId], "the runtime started the RECOVERY task");
  const meta = await readTaskMeta(recoveredId);
  assert.ok(meta, "the spool sidecar exists");
  assert.equal(meta.storageKey, `firms/${firm}/docs/${meta.sha256}.pdf`,
    "…keyed at the content-addressed path clara.documents' own CHECK enforces");
  assert.equal(meta.lane, "ocr", "…on the DB's lane");
  assert.equal(meta.format, "pdf", "…with the fresh detection's format");

  // (4) AND IT PROCESSES LIKE ANY OTHER TASK. This is the claim the migration header makes:
  // by the time the workflow claims, a recovered task is indistinguishable from an
  // intake-minted one. Driven through the REAL frozen behaviour, against real Postgres.
  globalThis.__claraAzureForTest = async () => OK_AZURE;
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [recoveredId, "x51-e2e-recovered-run", true]));
  const out = await processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, recoveredId, 1);
  assert.equal(out.status, "done", "the recovered task ran to completion through the frozen workflow");

  const settled = await taskRow(recoveredId);
  assert.equal(settled.status, "done", "…and Postgres agrees");
  const ext = await rig.asRuntime((c) => c.query(
    "select count(*)::int n from clara.document_extractions where document_id=$1 and status='done'",
    [second.receipt.document_id]));
  assert.equal(ext.rows[0].n, 1,
    "…leaving exactly one DONE extraction: the document the first attempt could never produce "
    + "now has its evidence, without new bytes, a new document id, or a single mechanism bypassed");
});

/** The failed task's version, read from the row the cell already fetched. */
function failedVersion(row) { return Number(row.version_n); }

test("[0051 §2] END TO END: the crash window — a sidecar-less queued task is NOT dispatched, and heals on the next re-upload", { skip }, async () => {
  // The review's finding #3, end to end on the real path. The sidecar is written by this
  // process AFTER the DB commits, so a crash in that window leaves a queued task with no
  // transport. Two halves are proven here:
  //   (a) the reconciler must NOT dispatch it — behavior_v2 would call downloadCanonical with
  //       an undefined key, and storage.mjs's safeKey() rejects it, manufacturing a
  //       `storage_error` terminal indistinguishable from a real vendor fault;
  //   (b) re-uploading the same bytes ECHOES the queued task's transport, so the sidecar is
  //       rebuilt and the run finally starts — the heal, driven by the action the human is
  //       already taking.
  const { owner, firm } = await rig.buildFirm("x51-recovery-crash");
  const first = await ingest(owner, firm, "x51-crash-first");
  const originalTask = first.receipt.task_id;
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [originalTask, "x51-crash-run", true]));
  await rig.asRuntime((c) => c.query(
    "select clara.persist_document_extraction($1,'failed',0,'{}'::jsonb,'[]'::jsonb,'engine_error',null,$2)",
    [originalTask, `x51-crash-fail-${Date.now()}`]));

  // A re-upload mints the recovery… and then we simulate the crash by deleting its sidecar.
  const second = await ingest(owner, firm, "x51-crash-retry");
  const recoveredId = second.receipt.recovery.task_id;
  assert.equal(second.receipt.recovery.mode, "mint", "mandatory setup: the first re-upload MINTED");
  await removeTaskMeta(recoveredId);
  assert.equal(await readTaskMeta(recoveredId), null, "…and its sidecar is gone, as a crash would leave it");

  // (a) The reconciler sees a queued task past its grace and REFUSES to dispatch it.
  const started = [];
  const sweep = await rig.asRuntime((client) => reconcileDocumentTasks(client, {
    enqueueDocumentIngest: async (id) => (started.push(id), { runId: "should-not-happen" }),
    getRun: async () => ({ status: "lost" }),
    graceMs: 0,
    onlyFirm: firm,
  }));
  assert.deepEqual(started, [],
    "the reconciler did NOT dispatch the transport-less task — dispatching would have "
    + "manufactured a storage_error terminal that looks exactly like a real engine failure");
  assert.ok(sweep.documentTransportless >= 1, "…and it counted the skip rather than passing silently");
  assert.equal((await taskRow(recoveredId)).status, "queued", "…the task is still queued, still recoverable");

  // (b) THE HEAL: the same bytes again. The door ECHOES rather than minting a second attempt.
  const third = await ingest(owner, firm, "x51-crash-heal");
  assert.equal(third.receipt.status, "adopted", "the heal is an ordinary adoption");
  assert.equal(third.receipt.recovery?.mode, "echo", "…answering in ECHO mode");
  assert.equal(third.receipt.recovery.task_id, recoveredId, "…naming the SAME queued task, not a new one");
  assert.deepEqual(third.started, [recoveredId], "…and the run finally starts");
  const healed = await readTaskMeta(recoveredId);
  assert.ok(healed, "the sidecar is rebuilt");
  assert.equal(healed.storageKey, `firms/${firm}/docs/${healed.sha256}.pdf`, "…with real transport");

  const tasks = await rig.asRuntime((c) => c.query(
    "select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane='ocr'",
    [first.receipt.document_id]));
  assert.equal(tasks.rows[0].n, 2, "…and the heal minted NOTHING: two tasks total, the failure and the one recovery");
});

test("[0051 §2] END TO END: a recovery mint BINDS the intake reservation; the adoption that mints nothing refunds it", { skip }, async () => {
  // The CRITICAL finding's fix on the real path, where the reservation is taken by
  // create_document_intake for real rather than seeded.
  const { owner, firm } = await rig.buildFirm("x51-recovery-budget");
  const first = await ingest(owner, firm, "x51-budget-first");
  const originalTask = first.receipt.task_id;
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [originalTask, "x51-budget-run", true]));
  await rig.asRuntime((c) => c.query(
    "select clara.persist_document_extraction($1,'failed',0,'{}'::jsonb,'[]'::jsonb,'engine_error',null,$2)",
    [originalTask, `x51-budget-fail-${Date.now()}`]));

  const second = await ingest(owner, firm, "x51-budget-retry");
  const recoveredId = second.receipt.recovery.task_id;
  const bound = await rig.asRuntime((c) => c.query(
    "select state, task_id from clara.document_ingest_reservations where intake_id=$1", [second.receipt.intake_id]));
  // 'resized', not 'reserved' — and that is the point rather than a detail:
  // clara.verify_document_intake resized this reservation to the document's TRUE page count
  // (0007:1937) before finalize ran, so what the recovery binds is a correctly-sized charge,
  // not the opening estimate.
  assert.ok(["reserved", "resized"].includes(bound.rows[0].state),
    `the re-upload's reservation was NOT refunded (state=${bound.rows[0].state})`);
  assert.equal(bound.rows[0].task_id, recoveredId,
    "…it is BOUND to the recovery task: a recovery is a real vendor attempt and pays like a fresh ingest");

  // …and the reservation then settles on the recovered task's own success, exactly as a first
  // ingest's does — the lifecycle, not just the charge.
  globalThis.__claraAzureForTest = async () => OK_AZURE;
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [recoveredId, "x51-budget-recovered", true]));
  await processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, recoveredId, 1);
  const settled = await rig.asRuntime((c) => c.query(
    "select state from clara.document_ingest_reservations where intake_id=$1", [second.receipt.intake_id]));
  assert.equal(settled.rows[0].state, "settled", "…and it SETTLES when the recovered read succeeds");
});

test("[0051 §2] END TO END: re-uploading a HEALTHY document adopts and starts nothing", { skip }, async () => {
  // The contrast, on the same real path. Door 3 of ADR-064 §3 is unchanged for every healthy
  // adoption — which is the overwhelmingly common case and the one that must not regress.
  const { owner, firm } = await rig.buildFirm("x51-recovery-healthy");
  const first = await ingest(owner, firm, "x51-healthy-first");
  assert.equal(first.receipt.status, "finalized", "the first ingest creates the document");
  await rig.asRuntime((c) => c.query("select clara.claim_document_processing_task($1,$2,$3)", [first.receipt.task_id, "x51-healthy-run", true]));
  globalThis.__claraAzureForTest = async () => OK_AZURE;
  const ok = await processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, first.receipt.task_id, 1);
  assert.equal(ok.status, "done", "mandatory setup: the ingest SUCCEEDED");

  const second = await ingest(owner, firm, "x51-healthy-retry");
  assert.equal(second.receipt.status, "adopted", "the re-upload still adopts");
  assert.equal(second.receipt.recovery, undefined,
    "…and carries NO recovery key at all — a healthy document is not a recovery case, and the "
    + "key is appended conditionally so its receipt is byte-identical to what it always was");
  assert.deepEqual(second.started, [], "…and nothing was started");
});
