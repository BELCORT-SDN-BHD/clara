// Wave A2.1 — the classify worker (lib/classify.mjs), DB INTEGRATION. Drives the worker's
// processing fn in-process with an injected model mock (armed via globalThis.__claraModelForTest,
// which is NOT available cross-process — so we never spawn the loop). Enqueues a real classify
// task through the DB path (a NULL-kind pdf → the classify lane via enqueue_invoice_facts) and
// proves the claim→classify_document round-trip: a >=0.8 verdict SETS document_kind + emits
// document.classified; an injected <0.8 verdict leaves the kind NULL + opens a review question
// + emits NOTHING (row-scoped assertions; NEVER TRUNCATE — the truncate/deadlock law).
//
// Env from the ENVIRONMENT (rig.mjs throws otherwise); RELAY_TEST_MODE=1; serial
// (--test-concurrency=1). Group-role identity (asRuntime — this consumer has NO login dance).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRuntime, buildFirm, endPool } from "./relay-fixtures.mjs";
import { seedVerifiedDocument, seedExtraction, seedRegion } from "./matcher-testkit.mjs";
import { processClassifyTask, readExtractionText, classifyHealth, CLASSIFY_ENGINE_ID, CLASSIFY_CONSUMER } from "../lib/classify.mjs";
import { mockObjectModel } from "./mockModel.mjs";

// 0016 SKIP-probe (the probeMatcherReady idiom) — skip cleanly when 0016 is absent.
async function probe0016() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname in ('classify_document','enqueue_invoice_facts')`,
  );
  return Number(r.rows[0].n) === 2;
}
const HAS16 = await probe0016();
const skip = HAS16 ? false : "0016 classifier surface absent — migrate the target first";

after(async () => {
  delete globalThis.__claraModelForTest;
  await endPool();
});

const withRuntime = asRuntime;

// Seed a filed NULL-kind pdf with a done OCR extraction+region and enqueue the classify task
// through the DB path (enqueue_invoice_facts → the classify lane for a NULL-kind pdf).
async function seedClassifiable({ firm, owner, client, text = "TAX INVOICE\nInvoice No: INV-RIG-1\nTotal Due: RM 5,000.00" }) {
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  // A minimal filing (basis legacy-0007 allows a null resolution) so classify_document can open
  // its per-filing review question on a low-confidence verdict.
  await rootQuery(
    "insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis) values($1,$2,$3,$4,'legacy-0007')",
    [firm, document, client, owner],
  );
  const extraction = await seedExtraction({ firm, document, status: "done" });
  await seedRegion({ firm, extraction, fieldPath: "invoice.total", textContent: text });
  const enq = await asRuntime((c) => c.query("select clara.enqueue_invoice_facts($1) as r", [document]));
  return { document, receipt: enq.rows[0].r, taskId: enq.rows[0].r.task_id };
}

const docKind = (id) => rootQuery("select document_kind from clara.documents where id=$1", [id]).then((r) => r.rows[0]?.document_kind ?? null);
const taskStatus = (id) => rootQuery("select status from clara.document_processing_tasks where id=$1", [id]).then((r) => r.rows[0]?.status ?? null);
const classifiedEvents = (doc) =>
  rootQuery("select count(*)::int as n from clara.domain_events where event_type='document.classified' and document_id=$1", [doc]).then(
    (r) => Number(r.rows[0].n),
  );
const classificationQuestions = (doc) =>
  rootQuery("select count(*)::int as n from clara.open_questions where document_id=$1 and origin='classification' and status='open'", [doc]).then(
    (r) => Number(r.rows[0].n),
  );

test("META classify-consumer: 0016 classify surface present + a NULL-kind pdf enqueues a classify-lane task", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("clsc");
  const { document, receipt, taskId } = await seedClassifiable({ firm, owner, client });
  assert.equal(receipt.status, "queued", "a NULL-kind pdf enqueues a task (not skipped/stranded)");
  const lane = (await rootQuery("select lane, engine_id from clara.document_processing_tasks where id=$1", [taskId])).rows[0];
  assert.equal(lane.lane, "classify", "the enqueued task is on the classify lane");
  assert.match(lane.engine_id, /^clara-classify-/, "the classify task snapshots a clara-classify engine");
  assert.equal(await docKind(document), null, "the document starts unclassified");
});

test("a >=0.8 verdict: claim→classify_document settles the task 'done', SETS document_kind, and emits document.classified", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("clsc");
  const { document, taskId } = await seedClassifiable({ firm, owner, client });
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.93, rationale: "line items + total due + one seller/buyer" });

  const out = await processClassifyTask(withRuntime, taskId, {});
  assert.equal(out.status, "done");
  assert.equal(out.kind, "invoice");
  assert.equal(await taskStatus(taskId), "done", "the claimed classify task settled to done (via classify_document)");
  assert.equal(await docKind(document), "invoice", "a >=0.8 verdict sets documents.document_kind");
  assert.equal(await classifiedEvents(document), 1, "a document.classified spine event is emitted");
  assert.equal(await classificationQuestions(document), 0, "a confident verdict opens NO review question");
  // The verdict row rides a doc_classify extraction under the classifier engine (never the human id).
  const verdict = (await rootQuery(
    "select engine_id, envelope from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' order by version_n desc limit 1",
    [document],
  )).rows[0];
  assert.equal(verdict.engine_id, CLASSIFY_ENGINE_ID, "the verdict engine id is the classifier engine (never clara-classify-human:v1)");
  assert.equal(Number(verdict.envelope.confidence), 0.93, "the model's confidence was persisted verbatim");
});

test("an injected <0.8 verdict: leaves document_kind NULL, opens a review question, and emits NO document.classified", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("clsc");
  const { document, taskId } = await seedClassifiable({ firm, owner, client });
  globalThis.__claraModelForTest = mockObjectModel({ kind: "invoice", confidence: 0.5, rationale: "ambiguous / truncated" });

  const out = await processClassifyTask(withRuntime, taskId, {});
  assert.equal(out.status, "done", "the task still settles (the worker never loops on low confidence)");
  assert.equal(await taskStatus(taskId), "done", "the claimed task is settled done regardless of confidence");
  assert.equal(await docKind(document), null, "a <0.8 verdict leaves the kind NULL");
  assert.equal(await classificationQuestions(document), 1, "a <0.8 verdict opens a classification review question");
  assert.equal(await classifiedEvents(document), 0, "a <0.8 verdict emits NO document.classified event");
});

test("readExtractionText reads the stored OCR layout text under the runtime role (the matcher read path)", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("clsc");
  const { document } = await seedClassifiable({ firm, owner, client, text: "PAYROLL SUMMARY July 2026 EPF SOCSO EIS" });
  const text = await asRuntime((c) => readExtractionText(c, { documentId: document, firmId: firm }));
  assert.match(text, /PAYROLL SUMMARY/, "the runtime role reads the document's OCR region text");
});

test("a payroll_summary verdict is NEVER misfiled as invoice (the headline failure mode) — the kind the model returns is what the DB stamps", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("clsc");
  const { document, taskId } = await seedClassifiable({ firm, owner, client, text: "PAYROLL SUMMARY\nEmployee EPF SOCSO EIS PCB Net Pay" });
  globalThis.__claraModelForTest = mockObjectModel({ kind: "payroll_summary", confidence: 0.95, rationale: "many employees + EPF/SOCSO/EIS columns" });
  await processClassifyTask(withRuntime, taskId, {});
  assert.equal(await docKind(document), "payroll_summary", "a payroll_summary is stamped payroll_summary, never invoice");
});

test("classifyHealth reports the classify lane's queued/running backlog (pre-0016-safe shape)", { skip }, async () => {
  const h = await asRuntime((c) => classifyHealth(c));
  assert.equal(h.consumer, CLASSIFY_CONSUMER);
  assert.equal(typeof h.queued, "number");
  assert.equal(typeof h.running, "number");
  assert.equal(typeof h.oldestQueuedMs, "number");
  assert.ok(h.queued >= 0 && h.running >= 0);
});
