import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import * as rig from "./rig.mjs";
import { beginDocumentIntake, finalizeDocumentIntake, recoverPendingDocumentIntakes, uploadDocumentBytes } from "../lib/intake.mjs";
import { reconcileDocumentIntakes } from "../lib/reconciler.mjs";
import { localObjectExists, StorageError } from "../lib/storage.mjs";
import { intakePaths, readIntakeMeta, writeIntakeMeta } from "../lib/spool.mjs";
import { EICAR, eicarSkipForThisHost } from "./eicar-fixture.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
// #693 — on win32 with Defender real-time protection on, the EICAR bytes are quarantined between
// this cell's write and the scanner's read, and the cell reds on an I/O error that reads like a
// scanner regression. Probed once, before any test is defined; `false` everywhere else. The
// pipeline gate still wins when it applies — an absent surface is the more fundamental reason.
const eicarSkip = skip || (await eicarSkipForThisHost());
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

test("malware and entity-expansion inputs fail before canonical Storage", { skip: eicarSkip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-quarantine");
  const eicar = Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n${EICAR}\nstartxref\n0\n%%EOF\n`);
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

/** THE FIXTURE IS ABANDONED, so its sidecar is OLD (#966). The recovery belt now decides what to
 *  skip from the file's mtime, before it opens anything — so a cell that writes its fixture and
 *  sweeps in the same millisecond is describing a LIVE upload, which the belt is right to leave
 *  alone. Ageing the file is what makes the fixture mean what its name says; the alternative
 *  (turning the quiet window off) would have proven the belt works with its guard disabled. */
async function ageSidecar(intakeId, ms = 60_000) {
  const when = new Date(Date.now() - ms);
  await utimes(intakePaths(intakeId).meta, when, when);
}

test("reconciler expires abandoned sidecars through the DB writer before unlink", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-expiry");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "abandoned.pdf", mime: "application/pdf", declared_bytes: 10, origin: "documents_tab",
    }),
  );
  const meta = await readIntakeMeta(begun.intake_id);
  await writeIntakeMeta(begun.intake_id, { ...meta, expiresAt: new Date(Date.now() - 1000).toISOString() });
  await ageSidecar(begun.intake_id);
  const out = await recoverPendingDocumentIntakes({ withRuntime, enqueue: async () => ({}) });
  assert.equal(out.expired, 1);
  const row = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(row.status, "failed");
  assert.equal(row.failure_code, "expired");
  assert.equal(await readIntakeMeta(begun.intake_id), null);
});

test("p966 the belt still recovers a crashed mid-flight intake — bytes spooled, finalize never reached", { skip }, async () => {
  // THE CRASH THIS BELT EXISTS FOR: the bytes arrived and the process died before the finalize.
  // The sidecar is the only record, and it carries the capability HASH rather than the token.
  const { owner, firm } = await rig.buildFirm("intake-p966-recover");
  const bytes = Buffer.from("%PDF-1.7\n9 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename: "crashed.pdf", mime: "application/pdf", declared_bytes: bytes.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]) });
  assert.equal((await readIntakeMeta(begun.intake_id)).status, "spooled", "the fixture really is mid-flight");

  // Inside the quiet window this intake is indistinguishable from a live upload, and the belt says so.
  const live = await recoverPendingDocumentIntakes({ withRuntime, enqueue: async () => ({ runId: "never" }) });
  assert.deepEqual(live, { recovered: 0, deferred: 0, expired: 0 },
    "a sidecar written moments ago belongs to a request still in flight — the belt neither opens nor drives it");

  await ageSidecar(begun.intake_id);
  const starts = [];
  const out = await recoverPendingDocumentIntakes({
    withRuntime,
    enqueue: async (taskId) => (starts.push(taskId), { runId: "fake-run" }),
  });
  assert.equal(out.recovered, 1, "…and past the guard it is finalized, exactly as before #966");
  const intake = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(intake.status, "finalized");
  assert.equal(starts.length, 1, "…and its ingest task is dispatched");
  assert.equal((await rig.readDocumentTask(starts[0])).status, "queued");
  assert.equal(await readIntakeMeta(begun.intake_id), null, "…and the spool is cleared behind it");
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

// =============================================================================================
// #620 AC3 — CUSTODY DURABILITY AT THE STORAGE SEAM, and H-53's consent-evidence exemption.
//
// AC3's rule, ratified rather than discovered: a custody failure BEFORE the canonical write —
// INCLUDING a transient storage_error — leaves NO clara.documents row, a terminal and typed
// user-visible failed intake, and no reliance on the serving process's spool for recovery. The
// recovery is a re-upload. `intake.mjs`'s failure branch deletes the local spool whenever
// `canonicalReached` is false, which means a transient Storage fault costs the reader their bytes;
// that is the accepted behaviour and these cells PIN it, so a later "improvement" that retained the
// spool for storage_error is a deliberate change with a red test, not an accident.
//
// THE SEAM IS THE SHIPPED ONE. `globalThis.__claraStorageForTest` is the injection point
// packages/runtime/lib/storage.mjs already reads under RELAY_TEST_MODE (putCanonical reads
// `injected.put`, responseFor reads `injected.get`) — no module is stubbed and no production
// branch is bypassed.
// =============================================================================================

/** Run `fn` with the shipped storage shim replaced, and ALWAYS put the previous one back — a
 *  leaked shim would silently reroute every later cell in this file. */
async function withStorageShim(shim, fn) {
  const previous = globalThis.__claraStorageForTest;
  globalThis.__claraStorageForTest = shim;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.__claraStorageForTest;
    else globalThis.__claraStorageForTest = previous;
  }
}

async function beginAndUpload(owner, firm, bytes, filename = "custody.pdf") {
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename, mime: "application/pdf", declared_bytes: bytes.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({
    withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]),
  });
  return begun;
}

const documentsWithSha = async (firm, sha) => (await rig.rootQuery(
  "select count(*)::int n from clara.documents where firm_id=$1 and sha256=$2", [firm, sha])).rows[0].n;

test("AC3 a FAILED putCanonical leaves no document, a terminal typed intake, and no spool", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-put-fail");
  const bytes = Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n% ac3 put ${randomUUID()}\nstartxref\n0\n%%EOF\n`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const begun = await beginAndUpload(owner, firm, bytes);

  await withStorageShim({
    put: async () => {
      throw new StorageError("storage_error", "Storage upload failed (503) injected", 502, "unavailable");
    },
  }, async () => {
    await assert.rejects(
      finalizeDocumentIntake({
        withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
        enqueue: async () => { throw new Error("a failed custody write must never enqueue"); },
      }),
      (err) => err.code === "storage_error",
    );
  });

  // 1. NO DURABLE ROW. The document row is written by clara.finalize_document_intake and nothing
  // else, and the canonical write never succeeded — so there is nothing for a reader to open, and
  // no half-document a later verify could "repair".
  assert.equal(await documentsWithSha(firm, sha), 0, "a pre-canonical failure must create no document");

  // 2. A TERMINAL, TYPED, USER-VISIBLE FAILURE. `storage_error` is on the 0007 failure_code
  // allowlist, so the client reads a word rather than a stack.
  const intake = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(intake.status, "failed");
  assert.equal(intake.failure_code, "storage_error");

  // 3. THE SPOOL IS GONE — both halves. This is the clause AC3 warns about: recovery must not
  // depend on a serving process's temporary bytes, and here it structurally cannot, because they
  // are deleted. Re-upload IS the recovery.
  assert.equal(await readIntakeMeta(begun.intake_id), null, "the sidecar must be gone");
  assert.equal(existsSync(intakePaths(begun.intake_id).bytes), false, "the spooled BYTES must be gone");
  assert.equal(await localObjectExists(`firms/${firm}/docs/${sha}.pdf`), false, "no canonical object");

  // 4. A REPLAY OF THE SAME INTAKE answers the estate's existing typed shape, never a 500 and never
  // a second attempt at custody: with the sidecar gone the capability cannot be re-presented, and
  // the durable replay path only re-issues a receipt for a FINALIZED or ADOPTED intake.
  await assert.rejects(
    finalizeDocumentIntake({
      withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
      enqueue: async () => { throw new Error("a replay must never enqueue"); },
    }),
    (err) => err.status === 404 && err.code === "not_found",
  );
  assert.equal(await documentsWithSha(firm, sha), 0, "the replay must not have created one either");
});

test("AC3 a verifyCanonical MISMATCH is refused before any document row exists", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-verify-fail");
  const bytes = Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n% ac3 verify ${randomUUID()}\nstartxref\n0\n%%EOF\n`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const begun = await beginAndUpload(owner, firm, bytes);

  // The shim ACCEPTS the write and stores DIFFERENT bytes at the same content address — the
  // substituted-object case the read-back verify exists to catch. `get` is left undefined on
  // purpose so verifyCanonical reads through the SHIPPED local-store path, not through the shim.
  await withStorageShim({
    put: async (_filePath, key) => {
      const dest = join(process.env.CLARA_TEST_STORAGE_DIR, ...key.split("/"));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from("not the bytes that were hashed"));
      return { created: true, existed: false };
    },
  }, async () => {
    await assert.rejects(
      finalizeDocumentIntake({
        withRuntime, intakeId: begun.intake_id, token: begun.upload_token,
        enqueue: async () => { throw new Error("an unverified object must never enqueue"); },
      }),
      (err) => err.code === "checksum_mismatch",
    );
  });

  assert.equal(await documentsWithSha(firm, sha), 0,
    "the read-back verify runs BEFORE the first DB call that learns the key — so no row can exist");
  const intake = await rig.readDocumentIntake(begun.intake_id);
  assert.equal(intake.status, "failed");
  assert.equal(intake.failure_code, "checksum_mismatch");
  assert.equal(await readIntakeMeta(begun.intake_id), null);
});

test("H-53 a consent_evidence document keeps its durable custody row and produces NO coding-lane task", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("intake-consent-evidence");
  const bytes = Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n% h53 consent ${randomUUID()}\nstartxref\n0\n%%EOF\n`);
  const { finalized } = await transport(owner, firm, bytes, { filename: "signed-consent.pdf" });
  const documentId = finalized.document_id;

  // THE STAMP COMES FROM THE PRODUCT'S OWN VERB, not from an UPDATE: clara.grant_client_egress is
  // what turns a cited document into consent evidence (migration 0014), and its own refusals are
  // the reason a coded invoice can never be re-labelled this way.
  await rig.humanQuery(owner,
    "select clara.grant_client_egress(p_client=>$1,p_evidence_document=>$2,p_scope_note=>$3,p_op_key=>$4) as r",
    [client, documentId, "h53 rig consent - the signed letter itself", rig.opk("h53consent")]);

  // 1. THE CUSTODY ROW IS DURABLE AND UNCHANGED. Being routed out of the bookkeeping pipeline must
  // not cost the document its bytes: it is the legal artifact the consent RESTS on.
  const document = await rig.readDocument(documentId);
  assert.equal(document.document_kind, "consent_evidence");
  assert.ok(document.bytes_verified_at, "the custody bond stays stamped");
  assert.equal(document.storage_path, `firms/${firm}/docs/${document.sha256}.pdf`);
  assert.equal(await localObjectExists(document.storage_path), true, "the bytes are still in custody");

  // 2. NO CODING-LANE TASK, EVER. clara.coding_tasks is the bookkeeping lane's own queue; a consent
  // letter owes no journal entry, and it is never filed to a client, so nothing enqueues one.
  const coding = await rig.rootQuery(
    "select count(*)::int n from clara.coding_tasks where document_id=$1", [documentId]);
  assert.equal(coding.rows[0].n, 0, "a consent letter is not bookkeeping work");

  // 3. …and the STRUCTURAL egress exemption is forced rather than assumed (0014 §4): the facts
  // lane's own verb refuses this document by KIND, before it looks at the mime type.
  const enqueued = await rig.asRuntime((c) =>
    c.query("select clara.enqueue_invoice_facts($1) as r", [documentId]));
  assert.equal(enqueued.rows[0].r.status, "skipped_consent_evidence",
    "the signed consent letter must never be facts-extracted - that would egress it");
  const facts = await rig.rootQuery(
    "select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane='invoice_facts'",
    [documentId]);
  assert.equal(facts.rows[0].n, 0, "…and no invoice_facts task may be left behind");
});
