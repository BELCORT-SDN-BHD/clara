// 0051 §2 — THE INTAKE RECOVERY DOOR, runtime half. PURE unit test: a mock DB client, a real
// spool and a real (on-disk) canonical store. No Postgres.
//
// WHAT IS AND IS NOT CLAIMED HERE. The DB half — which documents get a `recovery` fragment at
// all — is proven against a real database in packages/db/tests/x51-extraction-recovery.test.mjs
// and never here. What these cells prove is the half no DB test can show: given a receipt that
// carries one, does the runtime materialise the sidecar the FROZEN documentIngest_v2 will
// demand, from the DB's own values, and does it actually start the run? And given anything it
// cannot positively verify, does it refuse instead of guessing?
//
// WHY IT MATTERS THAT THIS IS TESTED AT ALL. documentIngest.behavior_v2.mjs:176-177 throws
// {code:"internal"} on a task with no sidecar, and reads storageKey/sha256/mime/format off it
// at :190-193. That file is FROZEN (its own header carries the marker) and deployed. So "the
// DB minted a task" and "a run can process it" are two different facts, and this seam is the
// only thing joining them.
//
// NB, learned the hard way and worth leaving here: do NOT write the literal frozen MARKER in
// this file's prose. scripts/check-frozen-workflows.mjs decides what is frozen by substring-
// matching that token against each file's whole text (computeFrozenSet), so merely mentioning
// it enlists this test file AND its entire transitive import closure — intake.mjs, spool.mjs,
// storage.mjs, egress.mjs, scan.mjs, structured.mjs, myinvois.mjs — into the frozen set. The
// first cut of this file did exactly that and turned a green freeze-lint into 12 UNREGISTERED
// violations. Talk about the marker; never spell it.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { recoveryTaskMeta } from "../lib/intake-recovery.mjs";
import { beginDocumentIntake, finalizeDocumentIntake, uploadDocumentBytes } from "../lib/intake.mjs";
import { readTaskMeta, _resetIntakeGateForTest } from "../lib/spool.mjs";
import { AZURE_ENGINE_SNAPSHOT } from "../lib/egress.mjs";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
const SHA = createHash("sha256").update(PDF).digest("hex");

let root;
let prevSpool;
let prevStorage;
let prevMode;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-intake-recovery-"));
  prevSpool = process.env.CLARA_SPOOL_DIR;
  prevStorage = process.env.CLARA_TEST_STORAGE_DIR;
  prevMode = process.env.RELAY_TEST_MODE;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  _resetIntakeGateForTest();
  if (prevSpool === undefined) delete process.env.CLARA_SPOOL_DIR; else process.env.CLARA_SPOOL_DIR = prevSpool;
  if (prevStorage === undefined) delete process.env.CLARA_TEST_STORAGE_DIR; else process.env.CLARA_TEST_STORAGE_DIR = prevStorage;
  if (prevMode === undefined) delete process.env.RELAY_TEST_MODE; else process.env.RELAY_TEST_MODE = prevMode;
  await rm(root, { recursive: true, force: true });
});

/** The pdf lane's own snapshot, so no cell hard-codes an engine id that tuning may move. */
const PDF_SNAPSHOT = { lane: "ocr", engineId: AZURE_ENGINE_SNAPSHOT.engineId, engineConfig: AZURE_ENGINE_SNAPSHOT.engineConfig };
const DETECTED = { format: "pdf", mime: "application/pdf" };

function fragment(over = {}) {
  return {
    document_id: randomUUID(),
    status: "adopted",
    task_id: randomUUID(),
    recovery: {
      task_id: randomUUID(),
      lane: "ocr",
      version_n: 2,
      engine_id: AZURE_ENGINE_SNAPSHOT.engineId,
      storage_path: `firms/${"f".repeat(8)}/docs/${SHA}.pdf`,
      sha256: SHA,
      mime_type: "application/pdf",
      // DURABLE, derived by the DB from storage_path's extension — never from this upload's
      // filename-sensitive detection. It is a transport field like the rest.
      format: "pdf",
      mode: "mint",
      ...over,
    },
  };
}

const quiet = () => {};

// ===========================================================================
// (A) recoveryTaskMeta — the policy itself
// ===========================================================================

test("[0051 §2] a complete recovery fragment becomes a sidecar built from the DB's OWN values", async () => {
  const f = fragment();
  const meta = await recoveryTaskMeta(f, {
    firmId: "firm-1", detected: DETECTED, snapshot: PDF_SNAPSHOT,
    canonicalKey: f.recovery.storage_path, log: quiet,
  });
  assert.ok(meta, "a recovery fragment yields a sidecar");
  assert.equal(meta.taskId, f.recovery.task_id, "…for the RECOVERY task, not the receipt's other id");
  assert.equal(meta.documentId, f.document_id, "…bound to the adopted document");
  assert.equal(meta.storageKey, f.recovery.storage_path,
    "storageKey is the DOCUMENT row's storage_path — the durable record, and the same value "
    + "clara.claim_document_processing_task hands every other lane");
  assert.equal(meta.sha256, f.recovery.sha256, "…with the document's own sha256");
  assert.equal(meta.mime, f.recovery.mime_type, "…and its mime");
  assert.equal(meta.lane, "ocr", "…on the lane the DB minted");
  assert.equal(meta.versionN, 2, "…at the DB's version");
  assert.equal(meta.engineId, AZURE_ENGINE_SNAPSHOT.engineId,
    "…carrying the engine id, which egress.mjs:152 stamps into the persisted envelope");
  assert.equal(meta.status, "queued", "…queued");
  assert.equal(meta.format, "pdf",
    "…and a DURABLE format. It has no column of its own, but it is NOT this upload's detection: "
    + "the DB derives it from storage_path's extension, which ck_documents_storage_path_v2 pins. "
    + "Detection is filename-sensitive, so deriving it here is how identical bytes re-sent as "
    + ".tsv got a CSV document parsed as TSV — the review's finding #2");
});

test("[0051 §2] a receipt with no recovery fragment yields nothing — the ordinary adoption is untouched", async () => {
  assert.equal(await recoveryTaskMeta({ status: "adopted", document_id: randomUUID() }, {
    firmId: "firm-1", detected: DETECTED, snapshot: PDF_SNAPSHOT, log: quiet,
  }), null, "a healthy adoption stays a no-op — which is the behaviour every existing document relies on");
  assert.equal(await recoveryTaskMeta(null, { firmId: "f", detected: DETECTED, snapshot: PDF_SNAPSHOT, log: quiet }),
    null, "…and a missing receipt is not an error either");
});

test("[0051 §2] an INCOMPLETE fragment refuses — a partial transport record is never completed by guessing", async () => {
  // Each of these is a field the frozen workflow will read. Filling a missing one from local
  // state would defeat the reason they are DB-sourced: they describe the row that will be
  // claimed, not the upload that happened to trigger it.
  for (const missing of ["task_id", "lane", "storage_path", "sha256", "mime_type", "format"]) {
    const f = fragment({ [missing]: null });
    assert.equal(await recoveryTaskMeta(f, {
      firmId: "firm-1", detected: DETECTED, snapshot: PDF_SNAPSHOT, log: quiet,
    }), null, `a fragment missing ${missing} must refuse`);
  }
  // version_n gets its own arm because it is the one field a NUMERIC coercion can silently
  // rescue: `Number(null)` is 0, which is finite. The first cut of this module used a
  // Number.isFinite guard and this assertion caught it stamping version 0 into the extraction
  // envelope (egress.mjs:152). The schema's version_n is an integer >= 1; nothing else passes.
  for (const bogus of [null, undefined, 0, -1, "", "two", 1.5, Number.NaN]) {
    assert.equal(await recoveryTaskMeta(fragment({ version_n: bogus }), {
      firmId: "firm-1", detected: DETECTED, snapshot: PDF_SNAPSHOT, log: quiet,
    }), null, `version_n=${JSON.stringify(bogus)} must refuse — a false version becomes a false provenance claim`);
  }
});

test("[0051 §2] a DEPLOY-SKEW lane disagreement refuses — the reader must match the task's lane", async () => {
  // RESHAPED after review. The point is NOT that the DB could hand out a self-inconsistent
  // fragment — within one image, format→lane is an identity by construction, so a cell built
  // on that would be exercising a shape production cannot make. What genuinely varies is
  // ACROSS DEPLOYS: the task's lane was chosen by whichever image ran the ORIGINAL intake, and
  // intake-lanes.mjs is a policy that has already moved once (Wave C-b moved OFX from
  // structured_parse to none). So the cell models the real divergence: a durable format this
  // image maps to a DIFFERENT lane than the task was minted on. documentIngest branches on the
  // sidecar's lane (behavior_v2.mjs:191-193), so proceeding would hand the file to the wrong
  // reader.
  const f = fragment({ format: "csv", lane: "ocr" }); // this image maps csv → structured_parse
  assert.equal(await recoveryTaskMeta(f, { firmId: "firm-1", canonicalKey: f.recovery.storage_path, log: quiet }),
    null, "a task whose lane this image's policy no longer agrees with refuses to start");
});

test("[0051 §2] the sidecar takes the DOCUMENT's durable identity, never a caller-supplied guess", async () => {
  // REPLACES the engine-mismatch cell, which review showed was wrong twice over: for a MINT the
  // engine is now this call's own snapshot (identity by construction), and for an ECHO the task
  // legitimately carries an OLDER engine — so refusing on inequality would have made the
  // crash-heal impossible for exactly the deploy that caused the crash. The field that
  // genuinely varies is the transport itself, and the rule is that it comes from the DB.
  const f = fragment({ mime_type: "text/csv", format: "csv", lane: "structured_parse",
    engine_id: "clara-structured:v0-ancient" });
  const meta = await recoveryTaskMeta(f, { firmId: "firm-1", canonicalKey: f.recovery.storage_path, log: quiet });
  assert.ok(meta, "an echo of a task minted under an older engine still materialises");
  // WHAT THIS PINS, STATED SO NOBODY LATER READS IT AS BLESSING A LIE. The engine id travels
  // verbatim from the TASK ROW, which makes the envelope's `engine` field the ADMISSION-TIME
  // snapshot — the engine under which the attempt was admitted — NOT an assertion about which
  // adapter performed the read. That distinction is pre-existing and pipeline-wide, not this
  // door's: `task.engineId` has no consumer anywhere except the envelope stamp (egress.mjs:152,
  // myinvois.mjs:129, structured-worker.mjs:53/92/107) while the reader is always the current
  // image (egress.mjs:161-168), and the ordinary reconciler dispatch hands every queued task
  // its own stored engine_id (reconciler-documents.mjs:163-186) — so a task queued before any
  // deploy and claimed after one has ALWAYS produced an older-labelled envelope. Registered in
  // migration 0051's header (R1) and carried to the open register; the alternative — refusing
  // the echo on inequality — would make the crash-heal impossible for exactly the deploy that
  // caused the crash, which is why this cell asserts pass-through rather than refusal.
  assert.equal(meta.engineId, "clara-structured:v0-ancient",
    "…carrying the TASK's own engine verbatim: the envelope records the engine the attempt was "
    + "ADMITTED under, which is what that field has always meant");
  assert.equal(meta.mime, "text/csv", "…the document's durable mime");
  assert.equal(meta.format, "csv", "…and the durable format the DB derived from storage_path");
});

test("[0051 §2] a DIVERGENT storage_path is re-verified against the durable object, and refuses if it cannot be", async () => {
  // The two paths are provably identical (ck_documents_storage_path_v2, 0007:53-54, enforces
  // the same content-addressed template intake.mjs:273 computes). A divergence therefore means
  // the premise broke — so the object itself is read before it is trusted. Here it does not
  // exist at all, so the read fails and the recovery is abandoned rather than handing the
  // workflow a key nobody has looked at.
  const f = fragment({ storage_path: `firms/nope/docs/${SHA}.pdf` });
  assert.equal(await recoveryTaskMeta(f, {
    firmId: "firm-1", detected: DETECTED, snapshot: PDF_SNAPSHOT,
    canonicalKey: `firms/other/docs/${SHA}.pdf`, log: quiet,
  }), null, "an unverifiable durable object refuses to start");
});

// ===========================================================================
// (B) finalizeDocumentIntake — the wiring, driven end to end against a mock DB
// ===========================================================================

/** A mock clara client: dispatches canned receipts by SQL substring. */
function mockDb(finalizeReceipt, intakeId) {
  const seen = [];
  const client = {
    async query(sql) {
      seen.push(sql);
      const r = (v) => ({ rows: [{ receipt: v }] });
      if (sql.includes("create_document_intake")) return r({ intake_id: intakeId });
      if (sql.includes("verify_document_intake")) return r({ status: "verified" });
      if (sql.includes("finalize_document_intake")) return r(finalizeReceipt);
      return r({ status: "ok" });
    },
  };
  return { client, withRuntime: (fn) => fn(client), seen };
}

async function drive(finalizeReceipt) {
  const intakeId = randomUUID();
  const firmId = randomUUID();
  const { client, withRuntime } = mockDb(finalizeReceipt, intakeId);
  const started = [];
  const begun = await beginDocumentIntake(client, { sub: randomUUID(), firmId }, {
    filename: "recovery-fixture.pdf", mime: "application/pdf", declared_bytes: PDF.length, origin: "documents_tab",
  });
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([PDF]) });
  const finalized = await finalizeDocumentIntake({
    withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
    enqueue: async (taskId) => (started.push(taskId), { runId: "fake-run" }),
  });
  return { finalized, started, firmId };
}

test("[0051 §2] the canonical key really is the content-addressed template the DB constraint enforces", async () => {
  // The namespace claim, asserted rather than argued: ck_documents_storage_path_v2
  // (0007_document_pipeline.sql:53-54) enforces
  // `^firms/<firm_id>/docs/<sha256>[.]<ext>$` on clara.documents.storage_path, and this is the
  // string intake.mjs:273 computes for the SAME bytes. Adoption means same firm + same sha256,
  // so a re-upload's key and the adopted document's storage_path cannot diverge.
  const firmId = randomUUID();
  const recovered = { document_id: randomUUID(), status: "adopted", task_id: randomUUID(),
    recovery: { task_id: randomUUID(), lane: "ocr", version_n: 2, engine_id: AZURE_ENGINE_SNAPSHOT.engineId,
      storage_path: `firms/${firmId}/docs/${SHA}.pdf`, sha256: SHA, mime_type: "application/pdf", format: "pdf", mode: "mint" } };
  const intakeId = randomUUID();
  const { client, withRuntime } = mockDb(recovered, intakeId);
  const started = [];
  const begun = await beginDocumentIntake(client, { sub: randomUUID(), firmId }, {
    filename: "ns.pdf", mime: "application/pdf", declared_bytes: PDF.length, origin: "documents_tab",
  });
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([PDF]) });
  await finalizeDocumentIntake({
    withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
    enqueue: async (taskId) => (started.push(taskId), { runId: "fake-run" }),
  });
  const meta = await readTaskMeta(recovered.recovery.task_id);
  assert.ok(meta, "the recovery task got a sidecar");
  assert.equal(meta.storageKey, `firms/${firmId}/docs/${SHA}.pdf`,
    "…whose storageKey is exactly the constraint's template for this firm + these bytes — so "
    + "the DB value and the fresh upload's computed key are the same object, and the re-upload "
    + "discarded nothing");
  assert.equal(started.length, 1, "…and exactly one run was started");
});

test("[0051 §2] an ADOPTED receipt carrying a recovery STARTS it, with the sidecar written first", async () => {
  const recoveryTask = randomUUID();
  const firmId = randomUUID();
  const receipt = { document_id: randomUUID(), status: "adopted", task_id: recoveryTask,
    recovery: { task_id: recoveryTask, lane: "ocr", version_n: 3, engine_id: AZURE_ENGINE_SNAPSHOT.engineId,
      storage_path: `firms/${firmId}/docs/${SHA}.pdf`, sha256: SHA, mime_type: "application/pdf", format: "pdf", mode: "mint" } };
  const intakeId = randomUUID();
  const { client, withRuntime } = mockDb(receipt, intakeId);
  const started = [];
  const begun = await beginDocumentIntake(client, { sub: randomUUID(), firmId }, {
    filename: "recover.pdf", mime: "application/pdf", declared_bytes: PDF.length, origin: "documents_tab",
  });
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([PDF]) });
  const finalized = await finalizeDocumentIntake({
    withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
    enqueue: async (taskId) => (started.push(taskId), { runId: "fake-run" }),
  });

  assert.equal(finalized.status, "adopted",
    "the receipt still says ADOPTED — the document really was adopted, and a recovery does not "
    + "change that fact for any existing reader");
  assert.deepEqual(started, [recoveryTask],
    "…and `needsStart` gained its third case: without it the DB row would sit queued until the "
    + "reconciler dispatched it with no sidecar, which is the whole defect");
  const meta = await readTaskMeta(recoveryTask);
  assert.ok(meta, "the sidecar exists — the frozen behavior_v2 hard-fails without one");
  assert.equal(meta.lane, "ocr", "…on the DB's lane");
  assert.equal(meta.versionN, 3, "…at the DB's version");
  assert.equal(meta.sha256, SHA, "…with the document's sha256");
  assert.equal(meta.format, "pdf", "…and the fresh detection's format");
  assert.equal(meta.runId, "fake-run", "…and the run id was recorded after the enqueue");
});

test("[0051 §2] an ADOPTED receipt with NO recovery starts nothing — the unchanged path", async () => {
  // The contrast cell. Door 3 of ADR-064 §3 stays exactly as it was for every healthy
  // adoption, which is the overwhelmingly common case: no task, no run, no sidecar.
  const { finalized, started } = await drive({ document_id: randomUUID(), status: "adopted", task_id: randomUUID() });
  assert.equal(finalized.status, "adopted", "still adopted");
  assert.deepEqual(started, [], "no run is started for a healthy adoption");
  assert.equal(await readTaskMeta(finalized.task_id), null, "…and no sidecar is written for its task");
});

test("[0051 §2] a FRESH finalize is untouched — it still starts its own task from its own detection", async () => {
  const taskId = randomUUID();
  const { finalized, started } = await drive({ document_id: randomUUID(), status: "finalized", task_id: taskId });
  assert.equal(finalized.status, "finalized", "a fresh document finalizes as it always did");
  assert.deepEqual(started, [taskId], "…and starts ITS task, not a recovery");
  const meta = await readTaskMeta(taskId);
  assert.ok(meta, "the ordinary sidecar is written");
  assert.equal(meta.lane, "ocr", "…on the detected lane");
  assert.equal(meta.versionN, 1, "…at the intake snapshot's version, not a recovery's");
});
