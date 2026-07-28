// documentIngest v1 -> v2 (ledger task #28) — the REAL-RIG end-to-end proofs an O-round
// review demanded (P2: "the claimed end-to-end retry proof mocked away the load-bearing
// state transition"). Every cell here drives REAL Postgres (claim_document_processing_task,
// persist_document_extraction, the terminal-immutability trigger) — no mock stands in for
// the DB. Full diagnosis in documentIngest.behavior_v2.mjs's own header; the fast, exhaustive
// contract cells (no DB needed) live in document-ingest-v2.test.mjs.
//
// Per the review's own instruction: reproduce the DEFECT against the real rig FIRST (below),
// before proving the fix — a known-broken baseline is what makes the fix's proof mean
// something.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { FatalError } from "workflow";

import * as rig from "./rig.mjs";
import { beginDocumentIntake, finalizeDocumentIntake, makeDocumentServices, uploadDocumentBytes } from "../lib/intake.mjs";
import { reconcileDocumentTasks } from "../lib/reconciler.mjs";
import { processDocumentTaskBehavior } from "../workflows/documentIngest.behavior.mjs";
import { processDocumentTaskBehaviorV2 } from "../workflows/documentIngest.behavior_v2.mjs";
import { readTaskMeta, taskMetaPath, writeTaskMeta } from "../lib/spool.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
const withRuntime = (fn) => rig.asRuntime(fn);
let root;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = join(base, `clara-doc-ingest-v2-db-${Date.now().toString(36)}`);
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
const OK_AZURE_PAYLOAD = { operationId: "fixture-op", analyzeResult: { content: "MYR 1.00", pages: [{ pageNumber: 1, lines: [{ content: "MYR 1.00", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }] } };
const throwing = (code, message = "boom") => async () => { throw Object.assign(new Error(message), { code }); };

/** Admit + claim ONE real OCR task, real intake -> finalize -> claim, real Postgres rows. */
async function admitClaimed(label) {
  const { owner, firm } = await rig.buildFirm(label);
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, { filename: `${label}.pdf`, mime: "application/pdf", declared_bytes: PDF_BYTES.length, origin: "documents_tab" }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([PDF_BYTES]) });
  const finalized = await finalizeDocumentIntake({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, enqueue: async () => ({ runId: null }) });
  await rig.asRuntime((client) => client.query("select clara.claim_document_processing_task($1,$2,$3)", [finalized.task_id, `${label}-run`, true]));
  return { taskId: finalized.task_id, documentId: finalized.document_id, firm };
}

// ======================================================================================
// P1 REPRODUCED FIRST — v1 (documentIngest.behavior.mjs, byte-identical, unedited): a
// retry cannot land success even with its sidecar manually preserved. This proves the
// O-round's blocker is real, not theoretical, BEFORE the fix below is trusted.
// ======================================================================================

test("P1 REPRODUCED (v1, real rig) — attempt 1's terminal 'failed' persist dooms attempt 2, EVEN WITH the sidecar manually restored", { skip }, async () => {
  const { taskId } = await admitClaimed("p1repro");
  const sidecarBeforeAttempt1 = await readTaskMeta(taskId);

  globalThis.__claraAzureForTest = throwing("timeout", "Azure DI total deadline exceeded");
  await assert.rejects(processDocumentTaskBehavior(makeDocumentServices(), withRuntime, taskId), (err) => err.code === "timeout");
  assert.equal((await rig.readDocumentTask(taskId)).status, "failed", "v1 persists 'failed' on ANY failure, transient or not");
  assert.equal(await readTaskMeta(taskId), null, "v1 destroys the sidecar on this same failure");

  // Simulate "if only the sidecar had survived" — isolates the ONE remaining variable.
  await writeTaskMeta(taskId, { ...sidecarBeforeAttempt1, status: "running" });
  globalThis.__claraAzureForTest = async () => OK_AZURE_PAYLOAD; // the vendor call would now SUCCEED
  await assert.rejects(
    processDocumentTaskBehavior(makeDocumentServices(), withRuntime, taskId),
    (err) => err.code === "CLR16" && /not running/i.test(err.message),
    "even with a working sidecar, the retry's successful vendor work cannot be recorded — the DB refuses it",
  );
  assert.equal((await rig.readDocumentTask(taskId)).status, "failed", "still stuck failed — vendor work was wasted");
});

// ======================================================================================
// THE FIX — v2: a transient failure keeps the task alive for a real retry to land.
// ======================================================================================

test("v2 (real rig) — a transient failure keeps the DB task 'running'; the retry then lands 'done' for real", { skip }, async () => {
  const { taskId, documentId } = await admitClaimed("v2trans");

  globalThis.__claraAzureForTest = throwing("timeout", "Azure DI total deadline exceeded");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 1), (err) => err.code === "timeout" && !(err instanceof FatalError));
  assert.equal((await rig.readDocumentTask(taskId)).status, "running", "Postgres was never touched by a transient failure");
  const sidecar = await readTaskMeta(taskId);
  assert.ok(sidecar, "the sidecar survives");
  assert.equal(sidecar.lastError, "timeout");
  assert.equal(sidecar.status, "running", "the sidecar's OWN status reflects the real plane (P4)");

  globalThis.__claraAzureForTest = async () => OK_AZURE_PAYLOAD;
  const result = await processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 2);
  assert.deepEqual(result, { taskId, status: "done", lane: "ocr" });
  assert.equal((await rig.readDocumentTask(taskId)).status, "done");
  const extraction = await rig.rootQuery("select status, page_count from clara.document_extractions where document_id=$1", [documentId]);
  assert.equal(extraction.rows[0].status, "done");
  assert.equal(await readTaskMeta(taskId), null, "the sidecar is removed only now, on the genuine terminal success");
});

test("v2 (real rig) — a TERMINAL failure persists 'failed' immediately, throws a FatalError, and keeps the sidecar for diagnosis", { skip }, async () => {
  const { taskId } = await admitClaimed("v2term");
  globalThis.__claraAzureForTest = throwing("corrupt", "the document is corrupt");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 1), (err) => err instanceof FatalError && err.code === "corrupt");
  const task = await rig.readDocumentTask(taskId);
  assert.equal(task.status, "failed");
  assert.equal(task.error_code, "corrupt");
  const sidecar = await readTaskMeta(taskId);
  assert.ok(sidecar, "kept for diagnosis, unlike v1");
  assert.equal(sidecar.lastError, "corrupt");
  assert.equal(sidecar.status, "failed", "the sidecar's status now HONESTLY matches Postgres (P4 — v1's noteTaskFailure always said 'running')");
});

test("v2 (real rig) — a transient code recurring on every attempt is forced terminal on the LAST allowed attempt, never leaving the task stuck 'running' forever", { skip }, async () => {
  const { taskId } = await admitClaimed("v2exhaust");
  globalThis.__claraAzureForTest = throwing("timeout", "Azure DI total deadline exceeded");
  for (const attempt of [1, 2, 3]) {
    await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, attempt), (err) => !(err instanceof FatalError), `attempt ${attempt}`);
    assert.equal((await rig.readDocumentTask(taskId)).status, "running", `attempt ${attempt} must not touch Postgres`);
  }
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 4), (err) => err instanceof FatalError, "attempt 4 must be forced terminal");
  const task = await rig.readDocumentTask(taskId);
  assert.equal(task.status, "failed");
  assert.equal(task.error_code, "timeout");
});

// ======================================================================================
// P3 — structurally at most ONE persist('failed') call ever, so a differing code across
// attempts can never collide under one op_key (the O-round's CLR10-swallowing finding).
// ======================================================================================

test("P3 (real rig) — mixed codes across attempts (engine_error, then storage_error, then corrupt): exactly ONE failed extraction, the FINAL code wins, nothing silently swallowed", { skip }, async () => {
  const { taskId, documentId } = await admitClaimed("p3mixed");
  globalThis.__claraAzureForTest = throwing("engine_error");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 1));
  assert.equal((await rig.readDocumentTask(taskId)).status, "running", "attempt 1: no DB write at all");

  globalThis.__claraAzureForTest = throwing("storage_error");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 2));
  assert.equal((await rig.readDocumentTask(taskId)).status, "running", "attempt 2: still no DB write — a DIFFERENT code, still transient");

  globalThis.__claraAzureForTest = throwing("corrupt");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 3), (err) => err instanceof FatalError);
  const task = await rig.readDocumentTask(taskId);
  assert.equal(task.status, "failed");
  assert.equal(task.error_code, "corrupt", "the ONLY persist call ever made records the terminal code — no earlier code to collide with");
  const extractions = await rig.rootQuery("select status, count(*)::int as n from clara.document_extractions where document_id=$1 group by status", [documentId]);
  assert.deepEqual(extractions.rows, [{ status: "failed", n: 1 }], "exactly one extraction row, ever");
  assert.equal((await readTaskMeta(taskId)).lastError, "corrupt");
});

// ======================================================================================
// P4 — the reconciler's per-task fresh-read merge preserves a concurrently-written
// lastError, instead of clobbering it with a stale bulk-read snapshot.
// ======================================================================================

test("P4 (real rig) — the reconciler's merge preserves a fresh noteTransientFailure note instead of clobbering it with a stale read", { skip }, async () => {
  const { taskId, firm } = await admitClaimed("p4race");
  globalThis.__claraAzureForTest = throwing("timeout");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, taskId, 1));
  assert.equal((await readTaskMeta(taskId)).lastError, "timeout");

  // The reconciler runs its normal 'running'-task sweep (documentTaskIndex's merge fires
  // for every status it snapshots, 'running' included) — the run is reported healthy, so
  // no stranded-requeue logic engages; only the sidecar merge is under test here.
  await rig.asRuntime((client) =>
    reconcileDocumentTasks(client, { onlyFirm: firm, graceMs: 0, enqueueDocumentIngest: async () => ({ runId: "x" }), getRun: () => ({ status: Promise.resolve("running") }) }),
  );
  const sidecar = await readTaskMeta(taskId);
  assert.equal(sidecar.lastError, "timeout", "the reconciler's own merge must not erase a concurrently-noted failure");
  assert.equal(sidecar.status, "running");
});

// ======================================================================================
// Q2 — a corrupt/unreadable ONE sidecar in the sweep must not abort the WHOLE reconciler
// pass; that one row is rebuilt from Postgres alone (DB is authoritative for lifecycle
// fields regardless) and every OTHER task in the same sweep is unaffected.
// ======================================================================================

test("Q2 (real rig) — one corrupt sidecar is rebuilt from Postgres alone; the sweep completes and the healthy task's sidecar survives untouched", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("q2corrupt");

  async function admitInFirm(label) {
    // Distinct bytes per document: finalizeDocumentIntake dedups on (firm_id, sha256) —
    // two byte-identical uploads in the SAME firm would collapse onto ONE document/task
    // instead of the two independent tasks this test needs. The label rides as a PDF
    // comment BEFORE the trailer — countPdfPages requires "%%EOF" to be the literal tail.
    const bytes = Buffer.from(`%PDF-1.7\n% ${label}\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n`);
    const begun = await rig.asRuntime((client) =>
      beginDocumentIntake(client, { sub: owner, firmId: firm }, { filename: `${label}.pdf`, mime: "application/pdf", declared_bytes: bytes.length, origin: "documents_tab" }),
    );
    await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]) });
    const finalized = await finalizeDocumentIntake({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, enqueue: async () => ({ runId: null }) });
    await rig.asRuntime((client) => client.query("select clara.claim_document_processing_task($1,$2,$3)", [finalized.task_id, `${label}-run`, true]));
    return finalized.task_id;
  }

  const healthyTaskId = await admitInFirm("q2healthy");
  const corruptTaskId = await admitInFirm("q2corruptone");

  // A real transient failure on the HEALTHY task, exactly like P4 — its sidecar must
  // survive the sweep byte-for-byte, unaffected by the OTHER task's corruption.
  globalThis.__claraAzureForTest = throwing("timeout");
  await assert.rejects(processDocumentTaskBehaviorV2(makeDocumentServices(), withRuntime, healthyTaskId, 1));
  assert.equal((await readTaskMeta(healthyTaskId)).lastError, "timeout");

  // Corrupt the OTHER task's sidecar directly on disk — malformed JSON, the same shape a
  // torn/partial write would leave behind. Precondition: readTaskMeta really does throw.
  await writeFile(taskMetaPath(corruptTaskId), "{ not valid json", { encoding: "utf8", mode: 0o600 });
  await assert.rejects(readTaskMeta(corruptTaskId), "precondition: the sidecar really is unreadable");

  const result = await rig.asRuntime((client) =>
    reconcileDocumentTasks(client, { onlyFirm: firm, graceMs: 0, enqueueDocumentIngest: async () => ({ runId: "x" }), getRun: () => ({ status: Promise.resolve("running") }) }),
  );
  assert.ok(result, "the sweep returns its usual summary rather than throwing on the corrupt row");

  const healthySidecar = await readTaskMeta(healthyTaskId);
  assert.equal(healthySidecar.lastError, "timeout", "the healthy task's sidecar is untouched by the OTHER task's corruption");
  assert.equal(healthySidecar.status, "running");

  const rebuiltSidecar = await readTaskMeta(corruptTaskId);
  assert.ok(rebuiltSidecar, "the corrupt sidecar is REBUILT, not left broken or missing");
  assert.equal(rebuiltSidecar.taskId, corruptTaskId);
  assert.equal(rebuiltSidecar.status, "running", "rebuilt straight from the Postgres row (claimed, never failed)");
  assert.equal(rebuiltSidecar.lastError, undefined, "the rebuild is DB-only — a corrupt sidecar's diagnostic fields do not survive it, by design (Q2's stated trade-off)");
});
