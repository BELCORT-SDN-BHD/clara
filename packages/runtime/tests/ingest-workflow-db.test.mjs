import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import * as rig from "./rig.mjs";
import {
  beginDocumentIntake,
  finalizeDocumentIntake,
  processDocumentTask,
  uploadDocumentBytes,
} from "../lib/intake.mjs";
import { reconcileDocumentTasks } from "../lib/reconciler.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { readTaskMeta, writeTaskMeta } from "../lib/spool.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
const withRuntime = (fn) => rig.asRuntime(fn);
let root;
let previousSpool;
let previousStorage;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-workflow-db-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  previousStorage = process.env.CLARA_TEST_STORAGE_DIR;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  delete globalThis.__claraAzureForTest;
  await rig.endPool();
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  if (previousStorage === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorage;
  await rm(root, { recursive: true, force: true });
});

async function admit(owner, firm, bytes, filename, mime) {
  const begun = await rig.asRuntime((client) =>
    beginDocumentIntake(client, { sub: owner, firmId: firm }, {
      filename, mime, declared_bytes: bytes.length, origin: "documents_tab",
    }),
  );
  await uploadDocumentBytes({ withRuntime, intakeId: begun.intake_id, token: begun.upload_token, readable: Readable.from([bytes]) });
  const finalized = await finalizeDocumentIntake({
    withRuntime,
    intakeId: begun.intake_id,
    token: begun.upload_token,
    enqueue: async () => {
      throw new Error("kill-after-commit drill");
    },
  });
  return finalized;
}

test("enqueue-crash sidecar is re-enqueued, then OCR parks/releases/claims and persists", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("workflow-ocr");
  const bytes = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  const receipt = await admit(owner, firm, bytes, "workflow.pdf", "application/pdf");
  const meta = await readTaskMeta(receipt.task_id);
  await writeTaskMeta(receipt.task_id, { ...meta, createdAt: new Date(Date.now() - 60_000).toISOString() });
  const starts = [];
  const reconciled = await rig.asRuntime((client) =>
    reconcileDocumentTasks(client, {
      // [S6 facts-discovery fix] the DB-authority snapshot now actually works under
      // the runtime role (task-only SELECT), so scope to THIS fixture's firm (the
      // shared test DB carries other files' queued tasks) and zero the grace (the
      // DB row's created_at is immutability-protected and always fresh here).
      onlyFirm: firm,
      graceMs: 0,
      enqueueDocumentIngest: async (id) => (starts.push(id), { runId: "recovered-run" }),
      getRun: () => ({ status: Promise.resolve("running") }),
    }),
  );
  assert.equal(reconciled.documentReenqueued, 1);
  assert.deepEqual(starts, [receipt.task_id]);

  const held = await rig.asRuntime((client) =>
    client.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [receipt.task_id, "held-run", false]),
  );
  assert.equal(held.rows[0].receipt.status, "held_egress");
  assert.equal((await rig.readDocumentTask(receipt.task_id)).workflow_run_id, null);
  await rig.asRuntime((client) => client.query("select clara.release_held_document_tasks($1)", [10]));
  const claimed = await rig.asRuntime((client) =>
    client.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [receipt.task_id, "ocr-run", true]),
  );
  assert.equal(claimed.rows[0].receipt.status, "running");
  await assert.rejects(
    rig.asRuntime((client) => client.query("select clara.claim_document_processing_task($1,$2,$3)", [receipt.task_id, "other-run", true])),
    (err) => err.code === "CLR16",
  );

  const azurePayload = {
    operationId: "fixture-op",
    analyzeResult: { content: "MYR 123.45", pages: [{ pageNumber: 1, lines: [{ content: "MYR 123.45", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }] },
  };
  globalThis.__claraAzureForTest = async () => azurePayload;
  const current = await readTaskMeta(receipt.task_id);
  const normalized = normalizeAzureLayout(azurePayload, current);
  await writeTaskMeta(receipt.task_id, { ...current, status: "running", runId: "ocr-run" });
  await processDocumentTask(withRuntime, receipt.task_id);
  assert.equal((await rig.readDocumentTask(receipt.task_id)).status, "done");
  const extraction = await rig.rootQuery("select status,page_count from clara.document_extractions where document_id=$1", [receipt.document_id]);
  assert.equal(extraction.rows[0].status, "done");
  assert.equal(extraction.rows[0].page_count, 1);

  const eventCount = async () => Number((await rig.rootQuery(
    "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.extraction_completed'",
    [receipt.document_id],
  )).rows[0].n);
  const beforeReplay = await eventCount();
  const replay = await rig.asRuntime((client) => client.query(
    "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
    [
      receipt.task_id,
      "done",
      normalized.pageCount,
      JSON.stringify(normalized.envelope),
      JSON.stringify(normalized.regions),
      null,
      normalized.vendorOpRef,
      `doc-extract-done:${receipt.task_id}`,
    ],
  ));
  assert.equal(replay.rows[0].receipt.status, "done", "terminal-state replay returns the stored receipt");
  assert.equal(await eventCount(), beforeReplay, "double-persist emits no duplicate extraction event");
});

// Wave A2: an uploaded XML now rides the LOCAL MyInvois structured_parse identity pass
// (laneSnapshot xml -> structured_parse + clara-myinvois:v1), NOT the pre-A2 store-only
// lane. It is still fully local (no vendor egress). The minimal synthetic XML carries no
// AccountingSupplierParty, so the identity pass yields an extraction with ZERO regions.
test("XML rides the local MyInvois structured_parse identity pass — no vendor egress", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("workflow-xml");
  const bytes = Buffer.from("<?xml version=\"1.0\"?><Invoice><ID>SYNTHETIC-1</ID></Invoice>");
  const receipt = await admit(owner, firm, bytes, "invoice.xml", "application/xml");
  const task = await rig.readDocumentTask(receipt.task_id);
  assert.equal(task.lane, "structured_parse", "XML routes to the local identity pass, not store-only");
  // A local lane claims WITHOUT egress approval (0015 S6: structured_parse is kill-switch-exempt).
  await rig.asRuntime((client) =>
    client.query("select clara.claim_document_processing_task($1,$2,$3)", [receipt.task_id, "xml-run", false]),
  );
  await processDocumentTask(withRuntime, receipt.task_id);
  assert.equal((await rig.readDocumentTask(receipt.task_id)).status, "done");
  assert.equal((await rig.readDocument(receipt.document_id)).extraction_status, "done", "structured_parse done marks the document extracted");
  // ONE structured_parse identity extraction is created (engine clara-myinvois:v1)...
  const extraction = await rig.rootQuery(
    "select engine_id,engine_kind,status from clara.document_extractions where document_id=$1",
    [receipt.document_id],
  );
  assert.equal(extraction.rowCount, 1, "one identity extraction row");
  assert.equal(extraction.rows[0].engine_kind, "structured_parse");
  assert.equal(extraction.rows[0].engine_id, "clara-myinvois:v1");
  assert.equal(extraction.rows[0].status, "done");
  // ...with ZERO regions (the synthetic XML has no AccountingSupplierParty/CustomerParty).
  const regions = await rig.rootQuery(
    "select count(*)::int n from clara.document_regions r join clara.document_extractions e on e.id=r.extraction_id where e.document_id=$1",
    [receipt.document_id],
  );
  assert.equal(regions.rows[0].n, 0, "no parties in the synthetic XML → 0 identity regions");
});
