import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import * as rig from "./rig.mjs";
import { beginDocumentIntake, finalizeDocumentIntake, recoverPendingDocumentIntakes, uploadDocumentBytes } from "../lib/intake.mjs";
import { reconcileDocumentIntakes } from "../lib/reconciler.mjs";
import { localObjectExists } from "../lib/storage.mjs";
import { readIntakeMeta, writeIntakeMeta } from "../lib/spool.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
const withRuntime = (fn) => rig.asRuntime(fn);
let root;
let previousSpool;
let previousStorage;

function zipEntryCapFixture() {
  const fixture = Buffer.alloc(52);
  fixture.writeUInt32LE(0x04034b50, 0);
  fixture.writeUInt32LE(0x06054b50, 30);
  fixture.writeUInt16LE(1001, 38);
  fixture.writeUInt16LE(1001, 40);
  fixture.writeUInt32LE(30, 46);
  return fixture;
}

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-intake-db-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  previousStorage = process.env.CLARA_TEST_STORAGE_DIR;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  await rig.endPool();
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  if (previousStorage === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorage;
  await rm(root, { recursive: true, force: true });
});

async function transport(owner, firm, bytes, { filename = "fixture.pdf", mime = "application/pdf", enqueue = async () => ({ runId: "fake-run" }) } = {}) {
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename,
      mime,
      declared_bytes: bytes.length,
      origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]) });
  const finalized = await finalizeDocumentIntake({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, enqueue });
  return { begun, finalized };
}

test("transport-true bytes -> spool -> hash -> immutable object -> finalizer -> queued task", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-transport");
  const bytes = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  const starts = [];
  const { begun, finalized } = await transport(owner, firm, bytes, {
    enqueue: async (taskId) => (starts.push(taskId), { runId: "fake-run" }),
  });
  const intake = await rig.readDocumentIntake(begun.intake_id);
  const document = await rig.readDocument(finalized.document_id);
  const task = await rig.readDocumentTask(finalized.task_id);
  const sha = createHash("sha256").update(bytes).digest("hex");
  assert.equal(intake.status, "finalized");
  assert.equal(document.sha256, sha);
  assert.equal(document.storage_path, `firms/${firm}/docs/${sha}.pdf`);
  assert.equal(await localObjectExists(document.storage_path), true);
  assert.equal(task.status, "queued");
  assert.deepEqual(starts, [task.id]);
});

test("same-firm duplicate adopts one document/task and does not enqueue twice", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-dupe");
  const bytes = Buffer.from("%PDF-1.7\n2 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  let starts = 0;
  const enqueue = async () => (starts += 1, { runId: `fake-${starts}` });
  const first = await transport(owner, firm, bytes, { enqueue });
  const second = await transport(owner, firm, bytes, { enqueue });
  assert.equal(first.finalized.status, "finalized");
  assert.equal(second.finalized.status, "adopted");
  assert.equal(second.finalized.document_id, first.finalized.document_id);
  assert.equal(second.finalized.task_id, first.finalized.task_id);
  assert.equal(starts, 1);
});

test("finalize response-loss retry replays the original receipt after its sidecar is gone", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-finalize-replay");
  const bytes = Buffer.from("%PDF-1.7\n7 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  const first = await transport(owner, firm, bytes);
  assert.equal(await readIntakeMeta(first.begun.intake_id), null, "successful finalize removes the sidecar");
  const replay = await finalizeDocumentIntake({
    withRuntime,
    intakeId: first.begun.intake_id,
    token: first.begun.upload_token,
    enqueue: async () => { throw new Error("a receipt replay must not enqueue"); },
  });
  assert.deepEqual(replay, first.finalized);
});

test("malware and entity-expansion inputs fail before canonical Storage", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-quarantine");
  const eicar = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\nstartxref\n0\n%%EOF\n");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "bad.pdf", mime: "application/pdf", declared_bytes: eicar.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([eicar]) });
  await assert.rejects(
    finalizeDocumentIntake({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, enqueue: async () => ({}) }),
    (err) => err.code === "malware_detected",
  );
  const intake = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(intake.status, "failed");
  assert.equal(intake.failure_code, "malware_detected");
  const sha = createHash("sha256").update(eicar).digest("hex");
  assert.equal(await localObjectExists(`firms/${firm}/docs/${sha}.pdf`), false);

  const xml = Buffer.from(`<?xml version="1.0"?><r>${"x".repeat(9000)}<!DOCTYPE r [<!ENTITY x "y">]></r>`);
  const xmlBegin = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "bad.xml", mime: "application/xml", declared_bytes: xml.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: xmlBegin.intake_id, token: xmlBegin.upload_token, readable: Readable.from([xml]) });
  await assert.rejects(
    finalizeDocumentIntake({ withRuntime, intakeId: xmlBegin.intake_id, token: xmlBegin.upload_token, enqueue: async () => ({}) }),
    (err) => err.code === "quarantined",
  );
  assert.equal((await rig.readDocumentIntake(xmlBegin.intake_id)).failure_code, "quarantined");

  const zipBomb = zipEntryCapFixture();
  const zipBegin = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "entry-cap.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      declared_bytes: zipBomb.length,
      origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: zipBegin.intake_id, token: zipBegin.upload_token, readable: Readable.from([zipBomb]) });
  await assert.rejects(
    finalizeDocumentIntake({ withRuntime, intakeId: zipBegin.intake_id, token: zipBegin.upload_token, enqueue: async () => ({}) }),
    (err) => err.code === "quarantined",
  );
  assert.equal((await rig.readDocumentIntake(zipBegin.intake_id)).failure_code, "quarantined");
  const zipSha = createHash("sha256").update(zipBomb).digest("hex");
  assert.equal(await localObjectExists(`firms/${firm}/docs/${zipSha}.xlsx`), false);
});

test("wrong and unknown capability tokens are indistinguishable", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-token");
  const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "token.pdf", mime: "application/pdf", declared_bytes: bytes.length, origin: "documents_tab",
    }),
  );
  for (const [id, token] of [[begun.intake_id, "wrong"], [randomUUID(), "wrong"]]) {
    await assert.rejects(
      uploadDocumentBytes({ withRuntime, intakeId: id, token, readable: Readable.from([bytes]) }),
      (err) => err.status === 404 && err.code === "not_found",
    );
  }
});

test("corrupt header-only PDF fails pre-finalize and never reaches canonical Storage", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-corrupt-pdf");
  const bytes = Buffer.from("%PDF-1.7\nheader-only-junk");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "corrupt.pdf", mime: "application/pdf", declared_bytes: bytes.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]) });
  await assert.rejects(
    finalizeDocumentIntake({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, enqueue: async () => ({}) }),
    (err) => err.code === "bad_type",
  );
  const sha = createHash("sha256").update(bytes).digest("hex");
  const intake = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(intake.status, "failed");
  assert.equal(intake.failure_code, "bad_type");
  assert.equal(await localObjectExists(`firms/${firm}/docs/${sha}.pdf`), false);
});

test("reconciler expires abandoned sidecars through the DB writer before unlink", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-expiry");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "abandoned.pdf", mime: "application/pdf", declared_bytes: 10, origin: "documents_tab",
    }),
  );
  const meta = await readIntakeMeta(begun.intake_id);
  await writeIntakeMeta(begun.intake_id, { ...meta, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const out = await recoverPendingDocumentIntakes({ withRuntime, enqueue: async () => ({}) });
  assert.equal(out.expired, 1);
  const row = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(row.status, "failed");
  assert.equal(row.failure_code, "expired");
  assert.equal(await readIntakeMeta(begun.intake_id), null);
});

test("DB-first reconciler expires an intake and refunds its reservation without a sidecar", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-db-first-expiry");
  const op = `db-only-expired:${randomUUID()}`;
  const made = await rig.asRuntime((client) => client.query(
    "select clara.create_document_intake($1,'documents_tab',null,$2,$3,$4,$5,$6,$7) as receipt",
    [owner, "db-only.pdf", "application/pdf", 128, "c".repeat(64), new Date(Date.now() - 60_000).toISOString(), op],
  ));
  const intakeId = made.rows[0].receipt.intake_id;
  assert.equal(await readIntakeMeta(intakeId), null, "the DB-only crash fixture has no sidecar");
  const swept = await rig.asRuntime((client) => reconcileDocumentIntakes(client, { onlyFirm: firm }));
  assert.equal(swept.documentIntakesExpired, 1);
  const intake = await rig.readDocumentIntake(intakeId);
  assert.equal(intake.status, "failed");
  assert.equal(intake.failure_code, "expired");
  const reservation = await rig.rootQuery(
    "select state,refund_reason from clara.document_ingest_reservations where intake_id=$1",
    [intakeId],
  );
  assert.equal(reservation.rows[0].state, "refunded");
  assert.equal(reservation.rows[0].refund_reason, "expired");
});
