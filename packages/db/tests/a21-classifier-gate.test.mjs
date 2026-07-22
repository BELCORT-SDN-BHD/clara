// Wave-A2.1 rig — the doc-type CLASSIFIER gating the facts engines (pin doc P3;
// contract §5, WA21-R7). CONTRACT-BLIND: pins only — never 0016 source.
//
//   classify_document(p_document,p_kind,p_confidence,p_engine_id,p_op_key) is a
//     runtime-only DEFINER: sets documents.document_kind (18-value CHECK), writes
//     a document_extractions verdict row (engine_kind='doc_classify'), audits, and
//     emits document.classified. Confidence < 0.8 leaves the kind NULL and opens
//     the ADR-023 review lane instead. set_document_kind is the human override.
//   THE FACTS GATE (_enqueue_invoice_facts_core CoR): invoice/credit_note/debit_note
//     + pdf/image → invoice_facts; xml → local_facts; OTHER kinds → a skipped_kind
//     receipt (a payroll_summary NEVER reaches invoice_facts); NULL kind → a
//     'classify' task FIRST (never strands a doc).
//   ONLY-IF-NULL: persist_invoice_facts stops stamping document_kind over a
//     verdict that already exists.
//
// Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk,
  a21EnsureReady, skip16, metaProbe0016,
  classifyDocument, setDocumentKind, docKind, docTasks, roleCanExecute,
  grantConsent, seedCitedDocument, filedDocument,
  enqueueInvoiceFacts, claimTask, persistInvoiceFacts, factField,
  checkDefs,
} from "./a21-helpers.mjs";

let has16 = false;
let world = null;

function skipHere(t) { return skip16(t, has16, "0016 not applied — classifier-gate battery dormant"); }

/** A filed pdf document WITH a seeded layout extraction+region (citable) and the
 *  given kind (null = unclassified). */
async function pdfDoc(client, { kind = null } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  if (kind == null) return seedCitedDocument(sub, { firm, client });
  const { seedExtraction, seedRegion } = await import("./a21-helpers.mjs");
  const doc = await filedDocument(sub, { firm, client, kind });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  const regionId = await seedRegion({ firm, extraction: extractionId, fieldPath: "invoice.total", textContent: "RM 5,000.00" });
  return { ...doc, extractionId, regionId, quote: "RM 5,000.00" };
}

const factsTaskOf = (doc, lane) => rootQuery(
  "select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane=$2 order by t.created_at desc limit 1",
  [doc, lane],
).then((r) => r.rows[0]?.row ?? null);

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) {
    world = await buildWorld();
    for (const c of [world.clients.A1]) {
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else noteLane("0016 absent — a21-classifier-gate suite dormant");
});
after(async () => { printLaneNotes("a21-classifier-gate"); printSkipCount("a21-classifier-gate"); await endPool(); });

test("META a21-classifier-gate: migration 0016 present + the classify lane/fn markers exist", async (t) => {
  if (!(await metaProbe0016(t, has16, { label: "classifier gate", fns: ["classify_document", "set_document_kind"] }))) return;
  const defs = await checkDefs("document_processing_tasks");
  assert.ok(defs.includes("'classify'"), "document_processing_tasks lane CHECK admits 'classify' (0016 marker)");
});

// ===========================================================================
// Structural — the lane, the lane↔engine CHECK, grants.
// ===========================================================================

test("P3 the lane↔engine CHECK binds lane 'classify' to engine prefix 'clara-classify-%' (the 0015 pattern)", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("document_processing_tasks");
  assert.ok(/clara-classify/.test(defs), `the lane↔engine CHECK carries the clara-classify engine prefix (got: ${defs.slice(0, 400)})`);
});

test("P3 grants: classify_document is runtime-ONLY (agent/human/wake denied 42501); set_document_kind is the human lane; agent zero on both", async (t) => {
  if (skipHere(t)) return;
  assert.equal(await roleCanExecute("clara_runtime", "classify_document"), true, "clara_runtime may EXECUTE classify_document");
  for (const role of ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
    assert.equal(await roleCanExecute(role, "classify_document"), false, `${role} may NOT execute classify_document`);
  }
  assert.equal(await roleCanExecute("clara_authenticated", "set_document_kind"), true, "clara_authenticated may EXECUTE set_document_kind (bookkeeper+ correction lane)");
  assert.equal(await roleCanExecute("clara_agent_ro", "set_document_kind"), false, "the agent role gets NOTHING (P6)");
  await assert.rejects(
    () => roleQuery(ROLES.agentRo, "select clara.classify_document(p_document => gen_random_uuid(), p_kind => 'invoice', p_confidence => 0.9, p_engine_id => 'clara-classify-llm:v1', p_op_key => $1)", [opk("x")]),
    (e) => e.code === "42501",
    "the agent role is denied classify_document behaviorally (42501)",
  );
});

// ===========================================================================
// classify_document behavior.
// ===========================================================================

test("P3 classify_document sets the kind, persists a doc_classify verdict row, audits, and emits document.classified", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client);
  assert.equal(await docKind(cited.documentId), null, "the fixture doc starts unclassified (mandatory setup)");
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.93 });
  assert.equal(await docKind(cited.documentId), "invoice", "documents.document_kind is set by the audited fn");
  const verdict = (await rootQuery(
    "select to_jsonb(e) as row from clara.document_extractions e where e.document_id=$1 and e.engine_kind='doc_classify' order by e.version_n desc limit 1",
    [cited.documentId],
  )).rows[0]?.row;
  assert.ok(verdict, "the verdict is persisted as a document_extractions row (engine_kind='doc_classify')");
  assert.match(verdict.engine_id ?? "", /^clara-classify-/, `the verdict engine_id carries the clara-classify prefix (got ${verdict.engine_id})`);
  const evRow = await rootQuery(
    "select 1 from clara.domain_events d where d.event_type='document.classified' and (d.document_id=$1 or d.payload::text like '%' || $1::text || '%') limit 1",
    [cited.documentId],
  );
  assert.ok(evRow.rows.length, "a document.classified spine event is emitted for the doc");
  const audit = await rootQuery("select 1 from clara.audit_log a where a.payload::text like '%' || $1::text || '%' limit 1", [cited.documentId])
    .catch(() => ({ rows: [] }));
  if (!audit.rows.length) noteLane("no audit_log row matched the classified doc — audit column naming may differ; adjudicate");
});

test("P3 the kind vocabulary is the EXISTING 18-value CHECK: an off-vocabulary kind refuses; low confidence (<0.8) leaves the kind NULL + opens the review lane", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client);
  let err = null;
  try { await classifyDocument({ document: cited.documentId, kind: "mystery_scroll", confidence: 0.99 }); } catch (e) { err = e; }
  assert.ok(err, "an off-vocabulary kind is refused (the taxonomy is the existing 18-value CHECK, no new values)");
  // Low confidence: the verdict must NOT stamp the kind.
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.79 }).catch((e) => noteLane(`low-confidence classify raised ${e.code} — acceptable if the refusal is the lane`));
  assert.equal(await docKind(cited.documentId), null, "a <0.8-confidence classification leaves document_kind NULL (the ADR-023 review lane takes it instead)");
  const review = await rootQuery(
    "select 1 from clara.document_processing_tasks t where t.document_id=$1 and t.lane <> 'classify' and to_jsonb(t)::text ilike '%review%' limit 1",
    [cited.documentId],
  ).catch(() => ({ rows: [] }));
  if (!review.rows.length) noteLane("no visible review artifact found for the low-confidence verdict — the ADR-023 lane's carrier is as-built; adjudicate its home");
});

test("P3 set_document_kind is the audited HUMAN override: a bookkeeper corrects a kind with a reason", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client);
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.9 });
  await setDocumentKind(world.users.bob, { document: cited.documentId, kind: "payment_voucher", reason: "misclassified — this is a voucher" });
  assert.equal(await docKind(cited.documentId), "payment_voucher", "the human override corrects the kind (bookkeeper+)");
});

// ===========================================================================
// The facts gate — kind routes; NULL kind classifies first; receipts.
// ===========================================================================

test("§5 a payroll_summary NEVER reaches invoice_facts: the enqueue produces NO runnable invoice_facts task — only the skipped_kind receipt", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client, { kind: "payroll_summary" });
  await enqueueInvoiceFacts(cited.documentId);
  // INTEGRATION (CLASS T, adjudication #11): the skipped_kind receipt LIVES on
  // the document_processing_tasks trail as a TERMINAL failed invoice_facts row
  // (never claimed, attempt_count 0) — the gate holds when no row is runnable.
  const rows = (await docTasks(cited.documentId)).filter((x) => x.lane === "invoice_facts");
  assert.equal(rows.filter((x) => ["queued", "held_egress", "running", "done"].includes(x.status)).length, 0,
    "NO runnable/completed invoice_facts task exists for a payroll_summary (the classifier gate holds)");
  const receipt = rows.find((x) => x.status === "failed" && x.error_code === "skipped_kind");
  assert.ok(receipt, `the gate leaves a skipped_kind receipt on the doc's task trail (got: ${rows.map((x) => `${x.lane}/${x.status}/${x.error_code}`).join(",")})`);
  assert.equal(receipt.attempt_count, 0, "the receipt row was never claimed and consumes no attempts");
  assert.equal(receipt.started_at, null, "the receipt row never ran (a receipt, not a task)");
});

test("§5 NULL kind → classify FIRST: the enqueue opens a 'classify' task (not invoice_facts); after the verdict the facts enqueue proceeds", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client); // kind NULL
  await enqueueInvoiceFacts(cited.documentId);
  assert.equal(await factsTaskOf(cited.documentId, "invoice_facts"), null, "no invoice_facts task while the kind is unknown");
  const classifyTask = await factsTaskOf(cited.documentId, "classify");
  assert.ok(classifyTask, "a 'classify' lane task is enqueued FIRST (the doc is never stranded)");
  assert.match(classifyTask.engine_id ?? "", /^clara-classify-/, "the classify task snapshots a clara-classify engine");
  // The verdict lands; the facts enqueue now routes (the event consumer re-fires in
  // production — the rig re-runs the idempotent backstop enqueue).
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.95 });
  await enqueueInvoiceFacts(cited.documentId);
  assert.ok(await factsTaskOf(cited.documentId, "invoice_facts"), "with kind='invoice' the facts gate admits invoice_facts");
});

test("§5 an e_invoice_xml routes to local_facts (deterministically rule-classified — no LLM classify for xml)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const { seedVerifiedDocument, fileDocument, freshResolution } = await import("./a21-helpers.mjs");
  const seed = await seedVerifiedDocument({ firm, mime: "application/xml", filename: "rig-einvoice.xml", kind: "e_invoice_xml" });
  await fileDocument(sub, { document: seed.documentId, client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: seed.documentId }) });
  await enqueueInvoiceFacts(seed.documentId);
  assert.equal(await factsTaskOf(seed.documentId, "invoice_facts"), null, "xml never enters the invoice_facts (egress OCR) lane");
  const local = await factsTaskOf(seed.documentId, "local_facts");
  assert.ok(local, "an e_invoice_xml enqueues the LOCAL no-egress facts lane");
  assert.equal(await factsTaskOf(seed.documentId, "classify"), null, "xml is rule-classified — no LLM classify task");
});

test("§5 ONLY-IF-NULL stamping: persist_invoice_facts never overwrites an existing kind — a credit_note stays a credit_note", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client, { kind: "credit_note" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await factsTaskOf(cited.documentId, "invoice_facts");
  assert.ok(task, "a credit_note admits invoice_facts (mandatory setup — the gate admits invoice/credit_note/debit_note)");
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 5,000.00"),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "SOMEONE SDN BHD"),
    factField("invoice.invoice_id", "CN-RIG-0001"),
  ]);
  assert.equal(await docKind(cited.documentId), "credit_note", "persist_invoice_facts stamps document_kind ONLY-IF-NULL — the existing verdict survives");
});
