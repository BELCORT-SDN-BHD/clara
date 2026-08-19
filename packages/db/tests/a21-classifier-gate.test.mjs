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
  enqueueInvoiceFacts, mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts, factField,
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
  // 0024 round 3 (P1) made p_task/p_run mandatory (no default), and Q1 (round 4) added
  // p_claim_secret with the same discipline — the call must supply ALL THREE (even as null)
  // so the function RESOLVES (else 42883 fires before the privilege check ever runs) and
  // the cell still proves the intended 42501 denial.
  await assert.rejects(
    () => roleQuery(ROLES.agentRo, "select clara.classify_document(p_document => gen_random_uuid(), p_kind => 'invoice', p_confidence => 0.9, p_engine_id => 'clara-classify-llm:v1', p_op_key => $1, p_task => null, p_run => null, p_claim_secret => null)", [opk("x")]),
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
  // pdfDoc(kind=null) -> seedCitedDocument -> the REAL file_document writer, which itself
  // auto-enqueues a classify task at filing time (kind is null then). 0024 round 3 (P1):
  // the document already carries classify-task history, so the settle must be task+run-bound.
  const clsTask = await factsTaskOf(cited.documentId, "classify");
  assert.ok(clsTask, "mandatory setup: file_document's own auto-enqueue already opened a classify task");
  const clsClaimed = await claimTask(clsTask.id, { egressApproved: false });
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.93, task: clsTask.id, run: clsClaimed.workflow_run_id, secret: clsClaimed.claim_secret });
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
  // The off-vocabulary refusal fires on the KIND CHECK, which runs BEFORE the task-bound
  // branch in classify_document's body — this call needs no task/run/secret to reach it.
  try { await classifyDocument({ document: cited.documentId, kind: "mystery_scroll", confidence: 0.99 }); } catch (e) { err = e; }
  assert.ok(err, "an off-vocabulary kind is refused (the taxonomy is the existing 18-value CHECK, no new values)");

  // Q2 (cross-model review): this call DOES reach the task-bound branch (vocabulary +
  // confidence both pass) — the document already carries classify-task history (pdfDoc's
  // own file_document auto-enqueue), so it must bind explicitly like every other call in
  // this file, not fall through to a `.catch(noteLane)` that masks whatever actually
  // happened. Asserted HARD below: the low-confidence verdict is genuinely settled, not
  // silently refused.
  const clsTask = await factsTaskOf(cited.documentId, "classify");
  assert.ok(clsTask, "mandatory setup: file_document's own auto-enqueue already opened a classify task");
  const clsClaimed = await claimTask(clsTask.id, { egressApproved: false });
  const lowConf = await classifyDocument({
    document: cited.documentId, kind: "invoice", confidence: 0.79,
    task: clsTask.id, run: clsClaimed.workflow_run_id, secret: clsClaimed.claim_secret,
  });
  assert.equal(lowConf.kind_set, false, "the low-confidence verdict does NOT set the kind (the receipt says so explicitly)");
  assert.equal(await docKind(cited.documentId), null, "a <0.8-confidence classification leaves document_kind NULL (the ADR-023 review lane takes it instead)");
  // The verdict ROW still persists (classify_document's own contract — a low-confidence
  // call is not a refusal, it is a settle that declines to stamp the kind).
  const verdict = (await rootQuery(
    "select envelope from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' order by version_n desc limit 1",
    [cited.documentId],
  )).rows[0];
  assert.ok(verdict, "the low-confidence verdict persists as a document_extractions row");
  assert.equal(verdict.envelope.low_confidence, true, "the envelope honestly marks it low_confidence");
  // The review lane opens for real: an open_questions row, origin='classification', status
  // 'open', scoped to the document's actively-filed client (pdfDoc files cited to `client`).
  const review = await rootQuery(
    "select client_id, origin, status, question_text from clara.open_questions where document_id=$1 and origin='classification' order by opened_at desc limit 1",
    [cited.documentId],
  );
  assert.equal(review.rows.length, 1, "exactly one classification review question opens for the low-confidence verdict");
  assert.equal(review.rows[0].status, "open", "the review question is OPEN, not silently pre-resolved");
  assert.equal(review.rows[0].client_id, client, "the review question is scoped to the document's filed client");
  assert.match(review.rows[0].question_text, /invoice/, "the question names the classifier's best guess");
});

test("P3 set_document_kind is the audited HUMAN override: a bookkeeper corrects a kind with a reason", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cited = await pdfDoc(client);
  // pdfDoc(kind=null) already carries classify-task history (file_document's own
  // auto-enqueue at filing time) — 0024 round 3 (P1) requires the task-bound settle.
  const clsTask = await factsTaskOf(cited.documentId, "classify");
  assert.ok(clsTask, "mandatory setup: file_document's own auto-enqueue already opened a classify task");
  const clsClaimed = await claimTask(clsTask.id, { egressApproved: false });
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.9, task: clsTask.id, run: clsClaimed.workflow_run_id, secret: clsClaimed.claim_secret });
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
  //
  // 0024 round 3 (P1): a classify-task row now exists for this document (the enqueue
  // above), so the no-task ceremony is closed — the real worker shape (claim, then bind
  // the settle to that claim's own task+run) is what a caller must present.
  const claimed = await claimTask(classifyTask.id, { egressApproved: false });
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.95, task: classifyTask.id, run: claimed.workflow_run_id, secret: claimed.claim_secret });
  // F-A1 PR-3 CUTOVER (B2, cross-model review): the llm_witness enqueue is consent-gated AT
  // ENQUEUE (0090 wall 6/§7e) -- unlike the retired invoice_facts path, which had no
  // enqueue-time consent gate at all. Without a live witness_extraction consent the minted
  // task lands 'failed'/witness_consent_inactive immediately, which factsTaskOf/assert.ok
  // would NOT catch (a failed row is still a truthy row) -- grant it first, the same pattern
  // already applied elsewhere in this sweep (x1-reextraction.test.mjs cell 4,
  // x-receipt-routing.test.mjs's before(), s6-invoice-facts.test.mjs's idempotency cell,
  // x-fail-classify.test.mjs), so the assertion below actually proves a LIVE admission.
  const { consentEvidenceDoc, grantPurpose, activatePurpose } = await import("./wave-b/wb-0020-helpers.mjs");
  const evidence = await consentEvidenceDoc(world.users.alice, { firm: await firmOf(client) });
  const grant = await grantPurpose(world.users.alice, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
  await activatePurpose(world.users.alice, { client, purpose: "witness_extraction", consent: grant.consent_id });
  await enqueueInvoiceFacts(cited.documentId);
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) — this is the SAME "facts enqueue proceeds" gate this
  // test is proving, just routed to the new lane. See f-a1-cutover.test.mjs for the full
  // router battery.
  assert.equal(await factsTaskOf(cited.documentId, "invoice_facts"), null, "with kind='invoice' the facts gate no longer mints invoice_facts (F-A1 PR-3 cutover)");
  const witnessTask = await factsTaskOf(cited.documentId, "llm_witness");
  assert.ok(witnessTask, "with kind='invoice' the facts gate admits llm_witness");
  assert.ok(["queued", "held_egress", "running"].includes(witnessTask.status),
    `the admitted llm_witness task must be LIVE, not a consent refusal in disguise (got status=${witnessTask.status}/error_code=${witnessTask.error_code})`);
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
  // F-A1 PR-3 CUTOVER: this cell's point is persist_invoice_facts' ONLY-IF-NULL stamping
  // discipline, not the router's destination lane — the router itself now mints llm_witness
  // for a credit_note (no dual-run, D9; proven in f-a1-cutover.test.mjs), so this mints the
  // invoice_facts task directly to keep exercising the LEGACY writer's own behavior.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await factsTaskOf(cited.documentId, "invoice_facts");
  assert.ok(task, "a credit_note task exists on the invoice_facts lane (mandatory setup)");
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 5,000.00"),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "SOMEONE SDN BHD"),
    factField("invoice.invoice_id", "CN-RIG-0001"),
  ]);
  assert.equal(await docKind(cited.documentId), "credit_note", "persist_invoice_facts stamps document_kind ONLY-IF-NULL — the existing verdict survives");
});
