// #646 — SOURCE REVISION: a human corrects what a document SAYS, and the estate records which
// reading the decision was made against.
//
// FRONTIER-GATED on the 0217 migration's stable STEM (`document_source_revision$`), never on its
// number: a `db-slice-frontiers` leg pinned below it SKIPS LOUDLY through the pre-integration gate
// module, and a FOCUSED run without that module FAILS rather than skipping — a skip is not
// evidence.
//
// WHAT EVERY CELL BELOW IS ABOUT. The doors are called through `humanQuery` under the LEAST
// privilege that should succeed (bookkeeper for every door in this file), with the rank below it
// proven to refuse on the same fixture. Every positive assertion re-reads the COMMITTED rows
// rather than trusting a door's own receipt: a receipt is what the door says happened, and this
// file is about what did.
//
// THE FIVE PROPERTIES THIS BATTERY EXISTS TO PIN:
//   1. a revision APPENDS — the superseded extraction's own regions are byte-identical afterwards;
//   2. a revision quoting a reading that has MOVED refuses CLR19 and echoes the attempted value;
//   3. the arithmetic belt measures the NEW numbers, not the ones the UI stopped showing;
//   4. NOTHING in this ticket reaches the Work lane — the merge guard against the wave's
//      0221->0223 purpose-CHECK spine;
//   5. the orphan classification door is NARROW: zero live filings, and nothing else.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, opk, ROLES, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import {
  freshResolution, previewCorrection, proposeCorrection, approveCorrection,
  retireDocumentFiling, activeFilings, allFilings,
} from "./rig-docs-fixtures.mjs";
import { buildWorkWorld, admitJournalWork, claimWorkRun, basis } from "./work-journal-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";
import { setDocumentKind, classifyDocument } from "./a21-helpers.mjs";
import { openQuestion, resolveOpenQuestion } from "./wave-a-fixtures.mjs";
import { openWorkQuestion, answerWorkQuestion, twoFieldAnswer } from "./work-question-fixtures.mjs";

const STEM = "document_source_revision$";
const EXPECTED_CELLS = 16;

let live = false;
let world = null;
let executed = 0;

async function cohortApplied() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) return false;
  // WHOLLY PRESENT OR WHOLLY ABSENT: a half-applied 0217 is a defect, not a narrower boundary.
  const fns = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = any($1::text[])`,
    [["revise_document_fact", "dismiss_orphaned_classification_question",
      "list_source_revisions", "list_source_dependents", "_document_source_observation"]]);
  if (fns.rows[0].n !== 5) {
    assert.fail(`0217 ledger row present but only ${fns.rows[0].n}/5 of its routines exist — half-applied migration`);
  }
  return true;
}

before(async () => {
  live = await cohortApplied();
  if (live) world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("rig-docs-source-revision");
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_SOURCE_REVISION === "1") {
    console.warn("SKIP rig-docs-source-revision: the 0217 cohort is not applied (explicit pre-integration run).");
    t.skip("document-source-revision cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "rig-docs-source-revision is required for a focused run: apply "
    + "0217_document_source_revision.sql",
  );
}

// #885 [0268] — this file's SECOND frontier. `p646.question.version` below asserts the OWNER'S
// RULING when 0268 is applied and the pre-0268 measurement when it is not; both are true of the
// chain they run against, and neither is a skip.
const SUPERSEDE_STEM = "work_source_correction_supersede$";
let _supersedeReady = null;
async function supersedeLaneReady() {
  if (_supersedeReady === null) {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SUPERSEDE_STEM]);
    _supersedeReady = r.rows[0].n > 0;
  }
  return _supersedeReady;
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

const FIRM_A = () => world.firms.A;
const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;      // owner, firm A
const KEEPER = () => world.users.bob;       // bookkeeper, firm A — the least privilege every door admits
const VIEWER = () => world.users.carol;     // viewer, firm A — the rank below it

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}
function reasonOf(err) {
  if (!err || !err.detail) return null;
  try { return JSON.parse(err.detail).reason ?? null; } catch { return null; }
}
function detailOf(err) {
  if (!err || !err.detail) return {};
  try { return JSON.parse(err.detail); } catch { return {}; }
}
const money = (cents) => `RM ${(cents / 100).toFixed(2)}`;

// ---------------------------------------------------------------------------------------------
// Door wrappers — named arguments only, so a parameter-name divergence is a real finding rather
// than a silent positional mismatch.
// ---------------------------------------------------------------------------------------------
async function reviseFact(sub, { document, fieldPath, value, observedVersion, reason = "#646 rig: the reader misread the printed figure", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.revise_document_fact(p_document => $1, p_field_path => $2, p_value => $3::jsonb,
       p_observed_version => $4, p_reason => $5, p_op_key => $6) as r`,
    [document, fieldPath, JSON.stringify(value), observedVersion, reason, opKey ?? opk("p646-fact")]);
  return r.rows[0].r;
}
async function dismissOrphan(sub, { question, reason = "#646 rig: the filing this question was asked about is gone", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.dismiss_orphaned_classification_question(p_question => $1, p_reason => $2,
       p_op_key => $3) as r`,
    [question, reason, opKey ?? opk("p646-orphan")]);
  return r.rows[0].r;
}
const listRevisions = (sub, document) => humanQuery(sub,
  "select clara.list_source_revisions(p_document => $1) as r", [document]).then((r) => r.rows[0].r);
const listDependents = (sub, document) => humanQuery(sub,
  "select clara.list_source_dependents(p_document => $1) as r", [document]).then((r) => r.rows[0].r);
const documentState = (sub, document, client) => humanQuery(sub,
  "select clara.get_document_state(p_document => $1, p_client => $2) as r", [document, client])
  .then((r) => r.rows[0].r);

// ---------------------------------------------------------------------------------------------
// Readers (superuser — fixtures and assertions only, never the lane under test).
// ---------------------------------------------------------------------------------------------
const extractionsOf = (document) => rootQuery(
  `select id, engine_id, engine_kind, version_n, status, superseded_by, envelope, extracted_at
     from clara.document_extractions where document_id=$1 order by extracted_at, id`, [document])
  .then((r) => r.rows);
const regionsOf = (extraction) => rootQuery(
  `select id, field_path, text_content, monetary_cents, monetary_raw, engine_confidence,
          locator_kind, locator
     from clara.document_regions where extraction_id=$1 order by field_path, id`, [extraction])
  .then((r) => r.rows);
const revisionsOf = (document) => rootQuery(
  "select * from clara.document_fact_revisions where document_id=$1 order by recorded_at, id", [document])
  .then((r) => r.rows);
const validationsOf = (document) => rootQuery(
  `select extraction_id, check_name, outcome, detail, revision, evaluated_at
     from clara.document_fact_validations where document_id=$1 order by evaluated_at, revision`, [document])
  .then((r) => r.rows);
const opReceipt = (fn, opKey) => rootQuery(
  "select result from clara.op_receipts where fn=$1 and op_key=$2", [fn, opKey])
  .then((r) => r.rows[0]?.result ?? null);

/** A filed INVOICE of `client` carrying a real machine `invoice_facts` extraction. Built through
 *  the estate's own verbs (`file_document`, the facts lane's claim + persist) rather than planted
 *  rows: a planted extraction would prove nothing about the supersede chain or the belt. */
async function invoiceWithFacts({ client, totalCents = 115000, tax = 0, tag = "p646" }) {
  const firm = FIRM_A();
  await ensureClientEgress(OWNER(), { client }).catch(() => {});
  const doc = await filedDocument(KEEPER(), { firm, client, kind: "invoice" });
  const task = await mintLegacyInvoiceFactsTask(doc.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", money(totalCents)),
    ...statedIdentityFields(totalCents, { tax }),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", `RIG ${tag.toUpperCase()} SUPPLIER SDN BHD`),
  ]);
  const machine = (await extractionsOf(doc.documentId))
    .filter((e) => e.engine_kind === "invoice_facts" && e.status === "done");
  assert.equal(machine.length, 1, "mandatory setup: exactly one machine invoice_facts extraction landed");
  return { ...doc, machineExtraction: machine[0].id };
}

// =============================================================================================
// p646.fact.appends — THE DOOR EXISTS, IT APPENDS, AND IT NEVER EDITS A REGION.
// =============================================================================================
cell("p646.fact.appends: a human revision appends ONE clara-fact-human:v1 extraction, leaves the prior regions byte-identical, and writes one revision row plus one committed receipt", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 105000, tag: "appends" });
  const before = await regionsOf(s.machineExtraction);
  assert.ok(before.length >= 4, "mandatory setup: the machine extraction carries the fact set");

  const opKey = opk("p646-appends");
  const out = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 1,150.00",
    observedVersion: 1, opKey,
  });

  // ONE new extraction, under the declarative human engine, at version 1 of ITS OWN chain.
  const after = await extractionsOf(s.documentId);
  const human = after.filter((e) => e.engine_id === "clara-fact-human:v1" && e.engine_kind === "invoice_facts");
  assert.equal(human.length, 1, "exactly one human facts extraction");
  assert.equal(human[0].version_n, 1, "version_n is scoped to (document, engine_id, engine_kind)");
  assert.equal(human[0].status, "done");
  assert.equal(human[0].id, out.extraction_id, "the receipt names the extraction it wrote");

  // THE PRIOR READING IS SUPERSEDED, NOT EDITED. Its regions are byte-identical — this is the
  // assertion that makes "the original source stays readable" true at the row level.
  const machineAfter = after.find((e) => e.id === s.machineExtraction);
  assert.equal(machineAfter.superseded_by, human[0].id, "the machine reading is superseded by the human one");
  assert.deepEqual(await regionsOf(s.machineExtraction), before,
    "the superseded extraction's own regions are UNTOUCHED — the revision appended, it did not edit");

  // THE NEW READING CARRIES THE WHOLE FACT SET, with the revised field changed and every other
  // field carried forward. Without this the appended extraction would supersede the machine's
  // whole reading with one field.
  const newRegions = await regionsOf(human[0].id);
  assert.equal(newRegions.length, before.length, "every other fact was carried forward");
  const total = newRegions.find((r) => r.field_path === "invoice.total");
  assert.equal(Number(total.monetary_cents), 115000,
    "the revised total is the DB's own integer cents: RM 1,150.00 is 115,000 sen");
  assert.equal(Number(total.engine_confidence), 1, "a human declaration is stated, not estimated");
  const vendorBefore = before.find((r) => r.field_path === "invoice.vendor_name");
  const vendorAfter = newRegions.find((r) => r.field_path === "invoice.vendor_name");
  assert.equal(vendorAfter.text_content, vendorBefore.text_content, "an unrevised fact is carried verbatim");

  // ONE revision row, with the observation, the actor and the reason.
  const rows = await revisionsOf(s.documentId);
  assert.equal(rows.length, 1, "exactly one source-revision row");
  assert.equal(rows[0].revision_kind, "fact");
  assert.equal(rows[0].field_path, "invoice.total");
  assert.equal(rows[0].observed_version_n, 1, "it records the facts version the human was reading");
  assert.equal(rows[0].observed_extraction_id, out.observed_extraction_id);
  assert.equal(rows[0].recorded_by, KEEPER(), "attributed to the human who revised it");
  assert.match(rows[0].reason, /misread/, "carrying the human's own reason");
  assert.equal(Number(rows[0].new_value.cents), 115000);
  assert.equal(Number(rows[0].prior_value.cents), 105000, "and the value it replaced, still readable");

  // ONE committed receipt, replayable byte-identically.
  const receipt = await opReceipt("revise_document_fact", opKey);
  assert.ok(receipt, "the op receipt is committed");
  assert.equal(receipt.revision_id, rows[0].id);
  assert.equal(receipt.facts_version, 2, "the document's facts version moved by exactly one");
});

// =============================================================================================
// p646.fact.floor — THE LEAST PRIVILEGE THAT SHOULD SUCCEED, AND THE RANK BELOW IT.
// =============================================================================================
cell("p646.fact.floor: a bookkeeper may revise and read; a viewer is refused CLR04 by every one of the four doors", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 22000, tag: "floor" });

  const denied = await caught(() => reviseFact(VIEWER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 230.00", observedVersion: 1 }));
  assert.equal(denied?.code, "CLR04", "a viewer cannot revise what a document says");
  assert.equal((await revisionsOf(s.documentId)).length, 0, "and nothing was written");

  for (const [label, fn] of [
    ["list_source_revisions", () => listRevisions(VIEWER(), s.documentId)],
    ["list_source_dependents", () => listDependents(VIEWER(), s.documentId)],
    ["dismiss_orphaned_classification_question", () => dismissOrphan(VIEWER(), { question: s.documentId })],
  ]) {
    const err = await caught(fn);
    assert.equal(err?.code, "CLR04", `${label} holds the same bookkeeper floor as the writers`);
  }

  // …and the bookkeeper, one rank up, succeeds on the same fixture.
  const ok = await listRevisions(KEEPER(), s.documentId);
  assert.equal(ok.document_id, s.documentId);
  assert.equal(ok.facts_version, 1);
});

// =============================================================================================
// p646.fact.stale — A REVISION QUOTING A READING THAT HAS MOVED REFUSES, AND KEEPS THE VALUE.
// =============================================================================================
cell("p646.fact.stale: a revision quoting a superseded facts version refuses CLR19 stale_source_version, writes nothing, and echoes the attempted value back", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 50000, tag: "stale" });
  await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 600.00", observedVersion: 1 });
  const afterFirst = await revisionsOf(s.documentId);
  assert.equal(afterFirst.length, 1, "mandatory setup: the first revision landed and moved the version");

  const err = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 700.00", observedVersion: 1 }));
  assert.equal(err?.code, "CLR19", "a stale reading is a governed refusal, not a silent overwrite");
  assert.equal(reasonOf(err), "stale_source_version");
  const d = detailOf(err);
  assert.equal(d.observed_version, 1);
  assert.equal(d.current_version, 2, "the refusal names BOTH numbers so the surface can say which way round it is");
  assert.equal(d.attempted_value, "RM 700.00",
    "the attempted value comes back so the UI can re-show what the human typed (AC2)");
  assert.deepEqual(await revisionsOf(s.documentId), afterFirst, "nothing was written");

  // A version ABOVE the live one is refused too — it is not a reading of this document at all.
  const ahead = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 800.00", observedVersion: 9 }));
  assert.equal(ahead?.code, "CLR19");
  assert.equal(reasonOf(ahead), "stale_source_version");

  // …and quoting the CURRENT version succeeds, so the refusal is about staleness and nothing else.
  const ok = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 700.00", observedVersion: 2 });
  assert.equal(ok.facts_version, 3);
});

// =============================================================================================
// p646.fact.grammar — THE CANONICAL FIELD-PATH GRAMMAR, AND THE NARROWER LANE WALL.
// =============================================================================================
cell("p646.fact.grammar: an out-of-grammar field path refuses CLR10 from the canonical grammar, a canonical path from another lane refuses CLR10 field_path_not_revisable, and both write zero rows", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 33000, tag: "grammar" });

  const syntax = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "not a path at all", value: "1", observedVersion: 1 }));
  assert.equal(syntax?.code, "CLR10");
  assert.equal(reasonOf(syntax), "field_path_syntax", "clara._assert_field_path's own refusal, verbatim");

  const namespace = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "ledger.total", value: "1", observedVersion: 1 }));
  assert.equal(reasonOf(namespace), "field_path_namespace", "an unregistered namespace is the grammar's refusal too");

  // A PERFECTLY CANONICAL path from another lane: the grammar admits it, this door does not.
  const lane = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "statement.closing_balance", value: "1", observedVersion: 1 }));
  assert.equal(lane?.code, "CLR10");
  assert.equal(reasonOf(lane), "field_path_not_revisable",
    "an invoice-facts extraction cannot carry a statement path — the six-term identity would never measure it");

  // A malformed MONETARY value is its own refusal, never a version problem.
  const money_ = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "N/A", observedVersion: 1 }));
  assert.equal(reasonOf(money_), "monetary_value_malformed");
  // …and a negative stated component is refused in cents, at this boundary.
  const negative = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.discount", value: "RM -5.00", observedVersion: 1 }));
  assert.equal(reasonOf(negative), "component_must_not_be_negative");

  assert.equal((await revisionsOf(s.documentId)).length, 0, "five refusals, zero rows");
  assert.equal((await extractionsOf(s.documentId)).filter((e) => e.engine_id === "clara-fact-human:v1").length, 0,
    "and zero appended extractions");
});

// =============================================================================================
// p646.fact.validation_belt — THE ARITHMETIC BELT MEASURES THE NEW NUMBERS.
// =============================================================================================
cell("p646.fact.validation_belt: after a revision the belt records a verdict for the NEW extraction whose terms are the NEW numbers, and the prior extraction's verdict is untouched", async () => {
  // A document whose identity TIES: net 1,000.00 + tax 60.00 = total 1,060.00.
  const s = await invoiceWithFacts({ client: A1(), totalCents: 106000, tax: 6000, tag: "belt" });
  const beforeRows = await validationsOf(s.documentId);
  const machineVerdict = beforeRows.find((v) => v.extraction_id === s.machineExtraction
    && v.check_name === "invoice.six_term_identity");
  assert.ok(machineVerdict, "mandatory setup: the belt recorded a verdict for the machine reading");
  assert.equal(machineVerdict.outcome, "pass", "mandatory setup: 1000.00 + 60.00 = 1060.00 ties");

  // The human corrects the TOTAL to a figure that no longer ties.
  const out = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 1,160.00", observedVersion: 1 });

  const after = await validationsOf(s.documentId);
  const fresh = after.filter((v) => v.extraction_id === out.extraction_id
    && v.check_name === "invoice.six_term_identity");
  assert.equal(fresh.length, 1, "the belt recorded ONE verdict for the appended extraction");
  assert.equal(fresh[0].outcome, "fail",
    "and it measured the NEW total — a belt that measured the old one would report pass while the UI showed 1,160.00");
  assert.equal(Number(fresh[0].detail.total_cents), 116000);
  assert.equal(Number(fresh[0].detail.residual_cents), -10000,
    "the residual is the exact-cent difference the human now has to explain");

  // The earlier measurement is still on file, unmoved: append-only means the record of what was
  // believed before is never rewritten.
  const machineAfter = after.find((v) => v.extraction_id === s.machineExtraction
    && v.check_name === "invoice.six_term_identity");
  assert.deepEqual(machineAfter, machineVerdict, "the superseded reading's verdict is untouched");

  // And a second revision that makes the identity tie again appends a PASSING verdict, so the
  // surface can show the correction actually fixing the arithmetic.
  const fixed = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 1,060.00", observedVersion: 2 });
  const tied = (await validationsOf(s.documentId)).filter((v) => v.extraction_id === fixed.extraction_id);
  assert.equal(tied.length, 1);
  assert.equal(tied[0].outcome, "pass");
});

// =============================================================================================
// p646.kind.stamps_version — THE RECUT STAMPS THE READING, AND H-22 STILL HOLDS.
// =============================================================================================
cell("p646.kind.stamps_version: set_document_kind stamps the observed extraction and facts version on its receipt, audit payload and revision row, and still resolves the classification question it answers", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 41000, tag: "kind" });
  const obsBefore = (await rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [s.documentId])).rows[0];

  const opKey = opk("p646-kind");
  const out = await setDocumentKind(KEEPER(), {
    document: s.documentId, kind: "receipt", reason: "#646 rig: it is a cash receipt, not a bill", opKey });

  assert.equal(out.observed_extraction_id, obsBefore.authoritative_extraction_id,
    "the receipt names the reading the human was looking at, NOT the row this call just created");
  assert.equal(out.observed_version, 1, "and the facts version at that instant");
  assert.ok(out.revision_id, "the receipt names its source-revision row");

  const rows = await revisionsOf(s.documentId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revision_kind, "kind");
  assert.equal(rows[0].field_path, null, "a kind revision names no field path");
  assert.equal(rows[0].new_value, "receipt");
  assert.equal(rows[0].prior_value, "invoice");
  assert.equal(rows[0].observed_extraction_id, obsBefore.authoritative_extraction_id);
  assert.equal(rows[0].observed_version_n, 1);

  const audit = await rootQuery(
    "select args from clara.audit_log where fn='set_document_kind' and args->>'op_key'=$1", [opKey]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].args.observed_extraction, obsBefore.authoritative_extraction_id);
  assert.equal(audit.rows[0].args.observed_version, 1);

  // H-22's regression, carried into the new contract on a SECOND document: the verb that answers
  // the classification question still closes it, and a manual question still survives.
  const doc2 = await filedDocument(KEEPER(), { firm: FIRM_A(), client: A1() });
  const task = await rootQuery(
    "select id from clara.document_processing_tasks where document_id=$1 and lane='classify' order by created_at desc limit 1",
    [doc2.documentId]);
  assert.equal(task.rowCount, 1, "mandatory setup: file_document auto-enqueued the classify task");
  const claimed = await claimTask(task.rows[0].id, { egressApproved: false });
  const low = await classifyDocument({
    document: doc2.documentId, kind: "invoice", confidence: 0.4,
    task: task.rows[0].id, run: claimed.workflow_run_id, secret: claimed.claim_secret });
  assert.equal(low.kind_set, false, "mandatory setup: a <0.8 verdict opens the question instead of stamping the kind");
  const manual = await openQuestion(KEEPER(), {
    client: A1(), scopeKind: "document", scopeId: doc2.documentId,
    question: "#646 rig: whose document is this?" });
  const manualId = manual.question_id ?? manual.id ?? manual;

  const k2 = await setDocumentKind(KEEPER(), {
    document: doc2.documentId, kind: "invoice", reason: "#646 rig: a supplier bill" });
  assert.equal(k2.resolved_question_count, 1, "dba.5b's property, unmoved: the classification question is closed");
  const byOrigin = Object.fromEntries((await rootQuery(
    "select origin, status from clara.open_questions where document_id=$1", [doc2.documentId])).rows
    .map((r) => [r.origin, r.status]));
  assert.equal(byOrigin.classification, "resolved");
  assert.equal(byOrigin.manual, "open", "and the MANUAL question survives — answering one is not answering the other");
  assert.ok(manualId);

  // dba.5c's property, unmoved, on a THIRD document carrying ONLY the classification question:
  // the filing is no longer pinned at needs_you on that ground. (doc2 above deliberately still
  // carries an open MANUAL question, which legitimately keeps it blocked — that is dba.5b's
  // narrowness, not a lane regression.)
  const doc3 = await filedDocument(KEEPER(), { firm: FIRM_A(), client: A1() });
  const t3 = await rootQuery(
    "select id from clara.document_processing_tasks where document_id=$1 and lane='classify' order by created_at desc limit 1",
    [doc3.documentId]);
  const c3 = await claimTask(t3.rows[0].id, { egressApproved: false });
  await classifyDocument({
    document: doc3.documentId, kind: "invoice", confidence: 0.4,
    task: t3.rows[0].id, run: c3.workflow_run_id, secret: c3.claim_secret });
  const laneBefore = (await rootQuery(
    "select clara._coding_lane_core($1,$2) as r", [A1(), doc3.filingId])).rows[0].r;
  assert.ok(String(laneBefore.reasons ?? laneBefore).includes("open_question"),
    "mandatory setup: the open classification question really does pin the filing at needs_you");
  await setDocumentKind(KEEPER(), {
    document: doc3.documentId, kind: "invoice", reason: "#646 rig: a supplier bill" });
  const laneAfter = (await rootQuery(
    "select clara._coding_lane_core($1,$2) as r", [A1(), doc3.filingId])).rows[0].r;
  assert.ok(!String(laneAfter.reasons ?? laneAfter).includes("open_question"),
    "the filing left needs_you on the answered-question ground");
});

// =============================================================================================
// p646.fact.observes_facts_reading — WHICH READING A 'fact' ROW NAMES, ON THE ORDINARY SEQUENCE.
//
// THE SEQUENCE IS THE MOST ORDINARY ONE THERE IS: classify the document, then correct a figure on
// it. `clara.set_document_kind` appends a `clara-classify-human:v1` / `doc_classify` extraction and
// 0089:237 repoints `clara.documents.authoritative_extraction_id` at it, so from that instant the
// DOCUMENT-WIDE pointer names a classification rather than a reading of the figures. A 'fact'
// revision's answer to "which reading was this decision made against" must therefore be the
// KIND-CURRENT `invoice_facts` row it actually superseded, not the document-wide pointer.
//
// p646.fact.appends cannot catch this: it never re-kinds, so the two pointers are the same row
// there. This cell is the one that separates them (round-1 review finding
// 646-A1-observed-extraction-names-the-wrong-chain).
// =============================================================================================
cell("p646.fact.observes_facts_reading: after a kind change repoints the document-wide pointer at a classification, a fact revision's ledger row, receipt, audit payload and read all still name the invoice_facts reading it superseded", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 88000, tag: "obschain" });

  await setDocumentKind(KEEPER(), {
    document: s.documentId, kind: "receipt", reason: "#646 rig: it is a cash receipt, not a bill" });
  const pointer = (await rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [s.documentId]))
    .rows[0].authoritative_extraction_id;
  const pointed = (await extractionsOf(s.documentId)).find((e) => e.id === pointer);
  assert.equal(pointed.engine_kind, "doc_classify",
    "mandatory setup: the document-wide pointer now names the CLASSIFICATION, not the figures");
  assert.notEqual(pointer, s.machineExtraction, "mandatory setup: the two pointers have separated");

  const opKey = opk("p646-obschain");
  const out = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 900.00",
    observedVersion: 1, opKey });

  // THE LEDGER ROW. Its observed reading is the invoice_facts extraction this revision superseded.
  const rows = await revisionsOf(s.documentId);
  const factRow = rows.find((r) => r.revision_kind === "fact");
  const observed = (await extractionsOf(s.documentId)).find((e) => e.id === factRow.observed_extraction_id);
  assert.equal(observed.engine_kind, "invoice_facts",
    "a 'fact' row's observed reading is a reading of the FIGURES, never a classification row");
  assert.equal(factRow.observed_extraction_id, s.machineExtraction,
    "and it is the very extraction the appended one superseded");
  assert.equal(factRow.observed_version_n, 1);

  // THE RECEIPT AND THE AUDIT PAYLOAD SAY THE SAME THING — three surfaces, one answer.
  assert.equal(out.observed_extraction_id, s.machineExtraction, "the receipt agrees with the ledger");
  assert.equal(await opReceipt("revise_document_fact", opKey).then((r) => r.observed_extraction_id),
    s.machineExtraction, "and the COMMITTED receipt does too");
  const audit = await rootQuery(
    "select args from clara.audit_log where fn='revise_document_fact' and args->>'op_key'=$1", [opKey]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].args.observed_extraction, s.machineExtraction,
    "and so does the audit payload");

  // THE ENVELOPE'S OWN `revises_extraction_id` ALWAYS NAMED THE RIGHT ROW — this cell is what
  // stops the ledger from disagreeing with it.
  const appended = (await extractionsOf(s.documentId)).find((e) => e.id === out.extraction_id);
  assert.equal(appended.envelope.revises_extraction_id, factRow.observed_extraction_id,
    "the appended extraction's envelope and the ledger row name ONE reading between them");

  // THE 'kind' ROW IS UNMOVED: the document-wide pointer is the right answer for a classification,
  // and the fix must not have changed it. At that instant the pointer was still the machine facts.
  const kindRow = rows.find((r) => r.revision_kind === "kind");
  assert.equal(kindRow.observed_extraction_id, s.machineExtraction,
    "the 'kind' writer keeps naming clara.documents.authoritative_extraction_id as it stood");

  // AND THE READ RE-EXPORTS IT VERBATIM, so the audit answer a human sees is the same row.
  const lineage = await listRevisions(KEEPER(), s.documentId);
  const entry = lineage.lineage.find((l) => l.entry_kind === "fact");
  assert.equal(entry.observed_extraction_id, s.machineExtraction,
    "clara.list_source_revisions projects the ledger's own answer");
});

// =============================================================================================
// p646.orphan.dismiss / p646.orphan.narrow — THE DOOR 0169 NAMED AS MISSING, AND ITS NARROWNESS.
// =============================================================================================
async function orphanedQuestion({ client, tag }) {
  const doc = await filedDocument(KEEPER(), { firm: FIRM_A(), client });
  const task = await rootQuery(
    "select id from clara.document_processing_tasks where document_id=$1 and lane='classify' order by created_at desc limit 1",
    [doc.documentId]);
  const claimed = await claimTask(task.rows[0].id, { egressApproved: false });
  await classifyDocument({
    document: doc.documentId, kind: "invoice", confidence: 0.4,
    task: task.rows[0].id, run: claimed.workflow_run_id, secret: claimed.claim_secret });
  const q = await rootQuery(
    "select id from clara.open_questions where document_id=$1 and origin='classification'", [doc.documentId]);
  assert.equal(q.rowCount, 1, `mandatory setup (${tag}): one classification question is open`);
  return { ...doc, questionId: q.rows[0].id };
}

cell("p646.orphan.dismiss: a classification question whose filing was retired can finally be closed, and only as DISMISSED", async () => {
  const s = await orphanedQuestion({ client: A1(), tag: "dismiss" });

  // THE PRE-EXISTING DEAD END, re-measured on this rig before the door is used: every other verb
  // refuses because clara._active_document_filing walls all of them.
  const filing = (await activeFilings(s.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: filing.id, reason: "#646 rig: filed in error", expectedRevision: filing.revision_token });
  assert.equal((await activeFilings(s.documentId)).length, 0, "mandatory setup: the filing is retired");

  const resolveDead = await caught(() => resolveOpenQuestion(KEEPER(), { question: s.questionId }));
  assert.equal(resolveDead?.code, "CLR02",
    "resolve_open_question is walled by clara._active_document_filing — the dead end 0169:236-255 names");
  const kindDead = await caught(() => setDocumentKind(KEEPER(), {
    document: s.documentId, kind: "invoice", reason: "#646 rig: try to re-kind an orphan" }));
  assert.equal(kindDead?.code, "CLR02", "and since 0169 the re-kind is walled by it too");

  // THE NEW DOOR. It closes the question as DISMISSED — the human did not answer it, it lost its
  // subject — and records its own reason.
  const out = await dismissOrphan(KEEPER(), { question: s.questionId });
  assert.equal(out.status, "dismissed");
  const row = (await rootQuery(
    "select status, resolved_by, resolution_text from clara.open_questions where id=$1", [s.questionId])).rows[0];
  assert.equal(row.status, "dismissed", "dismissed, never resolved: recording an answer nobody gave is the defect H-22 removed");
  assert.equal(row.resolved_by, KEEPER());
  assert.match(row.resolution_text, /filing this question was asked about is gone/);

  const ev = await rootQuery(
    `select payload from clara.domain_events where event_type='open_question.resolved'
      and (payload->>'question_id')::uuid=$1`, [s.questionId]);
  assert.equal(ev.rowCount, 1);
  assert.equal(ev.rows[0].payload.status, "dismissed");
  assert.equal(ev.rows[0].payload.source, "dismiss_orphaned_classification_question",
    "the timeline still says WHICH door closed it");

  // clara._active_document_filing was NOT relaxed: its siblings still refuse on a fresh orphan.
  const s2 = await orphanedQuestion({ client: A1(), tag: "unrelaxed" });
  const f2 = (await activeFilings(s2.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: f2.id, reason: "#646 rig: filed in error", expectedRevision: f2.revision_token });
  const still = await caught(() => resolveOpenQuestion(KEEPER(), { question: s2.questionId }));
  assert.equal(still?.code, "CLR02", "the shared provenance predicate is exactly as narrow as it was");
});

cell("p646.orphan.narrow: the predicate is ZERO LIVE FILINGS — a question whose filing is merely not the current one still refuses, and so does a non-classification question", async () => {
  // (a) A LIVE filing — the ordinary case. The door refuses and names the live filing.
  const live_ = await orphanedQuestion({ client: A1(), tag: "narrow-live" });
  const stillLive = await caught(() => dismissOrphan(KEEPER(), { question: live_.questionId }));
  assert.equal(stillLive?.code, "CLR10");
  assert.equal(reasonOf(stillLive), "filing_still_live",
    "a question with a live subject belongs to resolve_open_question, not to this door");
  assert.equal(detailOf(stillLive).live_filings, 1);

  // (b) RETIRED AND RE-FILED — the drift this cell exists to catch. If the predicate ever slips
  //     from "zero live filings" to "not the ORIGINAL filing", this call goes green and the door
  //     starts dismissing questions that are still answerable.
  const refiled = await orphanedQuestion({ client: A1(), tag: "narrow-refiled" });
  const f = (await activeFilings(refiled.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: f.id, reason: "#646 rig: retire before re-filing", expectedRevision: f.revision_token });
  const res = await freshResolution(KEEPER(), A1(), { subjectKind: "document", subjectId: refiled.documentId });
  await humanQuery(KEEPER(),
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4) as r",
    [refiled.documentId, A1(), res, opk("p646-refile")]);
  assert.equal((await activeFilings(refiled.documentId)).length, 1,
    "mandatory setup: the document is live in this client again, on a DIFFERENT filing row");
  const notOrphan = await caught(() => dismissOrphan(KEEPER(), { question: refiled.questionId }));
  assert.equal(reasonOf(notOrphan), "filing_still_live",
    "the question's subject is live again — 'not the current filing' is NOT orphaned");
  assert.equal((await rootQuery(
    "select status from clara.open_questions where id=$1", [refiled.questionId])).rows[0].status, "open");

  // (c) A DIFFERENT ORIGIN on an orphaned document is still refused: this door closes exactly one
  //     kind of question.
  const other = await orphanedQuestion({ client: A1(), tag: "narrow-origin" });
  const manual = await openQuestion(KEEPER(), {
    client: A1(), scopeKind: "document", scopeId: other.documentId, question: "#646 rig: a manual question" });
  const manualId = manual.question_id ?? manual.id ?? manual;
  const of = (await activeFilings(other.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: of.id, reason: "#646 rig: filed in error", expectedRevision: of.revision_token });
  const wrongOrigin = await caught(() => dismissOrphan(KEEPER(), { question: manualId }));
  assert.equal(reasonOf(wrongOrigin), "question_not_classification");
  assert.equal((await rootQuery(
    "select status from clara.open_questions where id=$1", [manualId])).rows[0].status, "open");
});

// =============================================================================================
// p646.replay.one_receipt — LOST-RESPONSE RECOVERY ON BOTH NEW DOORS.
// =============================================================================================
cell("p646.replay.one_receipt: replaying either new door's op key returns the ORIGINAL receipt and mints no second revision, and a concurrent duplicate converges on one row", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 77000, tag: "replay" });
  const opKey = opk("p646-replay");
  const first = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 780.00", observedVersion: 1, opKey });

  // THE REPLAY quotes the SAME (now stale) observed version, because that is what a retry of a
  // lost response actually sends. It must answer with the receipt, not with CLR19.
  const replay = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 780.00", observedVersion: 1, opKey });
  assert.deepEqual(replay, first, "byte-identical replay of the original receipt");
  assert.equal((await revisionsOf(s.documentId)).length, 1, "and exactly one revision row");
  assert.equal((await extractionsOf(s.documentId))
    .filter((e) => e.engine_id === "clara-fact-human:v1").length, 1, "and exactly one appended extraction");

  // A DIFFERENT payload under the same key is a conflict, never a second effect.
  const conflict = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 999.00", observedVersion: 1, opKey }));
  assert.equal(conflict?.code, "CLR10", "one operation identity, one payload");

  // TWO CONCURRENT CALLS with DIFFERENT keys: the document row lock serialises them, so the second
  // sees a moved version and refuses rather than overwriting.
  const settled = await Promise.allSettled([
    reviseFact(KEEPER(), { document: s.documentId, fieldPath: "invoice.currency", value: "MYR", observedVersion: 2 }),
    reviseFact(KEEPER(), { document: s.documentId, fieldPath: "invoice.currency", value: "MYR", observedVersion: 2 }),
  ]);
  const ok = settled.filter((r) => r.status === "fulfilled");
  const no = settled.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, "exactly one of two concurrent revisions is accepted");
  assert.equal(no[0].reason.code, "CLR19", "and the loser is told its reading moved, not silently dropped");
  assert.equal((await revisionsOf(s.documentId)).length, 2, "two revisions in all: the first, and one of the pair");

  // The orphan door replays too.
  const orphan = await orphanedQuestion({ client: A2(), tag: "replay-orphan" });
  const of = (await activeFilings(orphan.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: of.id, reason: "#646 rig: filed in error", expectedRevision: of.revision_token });
  const oKey = opk("p646-replay-orphan");
  const a = await dismissOrphan(KEEPER(), { question: orphan.questionId, opKey: oKey });
  const b = await dismissOrphan(KEEPER(), { question: orphan.questionId, opKey: oKey });
  assert.deepEqual(b, a, "the orphan door replays byte-identically");
});

// =============================================================================================
// p646.horn_a.no_work — THE MERGE GUARD.
//
// #885 NARROWED THE CLAIM, AND THE CELL SAYS SO RATHER THAN QUIETLY MEANING LESS. Migration 0268
// gave `clara.revise_document_fact` exactly one path to the Work lane: a correction RESTATES every
// Work of the firm that is still parked on a question about the corrected document (the owner's
// 2026-09-17 ruling, re-confirmed 2026-09-20 on issue #885). This cell's fixture parks NOTHING on
// its document, so every count below is unchanged and every assertion still holds — but what it
// now proves is "these doors mint no Work of their own accord", not "#646 never reaches the Work
// lane". The ruling's own path is measured in `tests/work-source-correction-supersede.test.mjs`
// and in `p646.question.version` below, and 0268 still widens NO purpose CHECK, which is the part
// of this guard the wave's 0221->0223 spine actually depends on.
// =============================================================================================
cell("p646.horn_a.no_work: after every door in this file, zero new accounting_work, zero new agent_tasks, zero correction-purpose operation_receipts, and both purpose CHECK texts byte-identical", async () => {
  // SCOPED TO THIS FIRM — the wave-2026-09-15 integration repair, and the claim is unchanged by it.
  // The first cut counted the WHOLE database, so any row ANY other file left behind inside this
  // cell's before/after window moved the number. On the merged estate run (all 39 db files as one
  // continuous process) that is exactly what happened: `agent_tasks` tipped by one (2297 !== 2296)
  // with nothing in #646 having minted anything, and the file was 16/16 the moment it ran alone.
  // What this cell asserts was never a property of the database — it is "no door in THIS file mints
  // Work for THIS firm" — so the predicate now says so, and the guard is deterministic under
  // `tests/**/*.test.mjs` instead of only under single-file iteration.
  const counts = async () => (await rootQuery(
    `select (select count(*)::int from clara.accounting_work where firm_id = $1) as work,
            (select count(*)::int from clara.agent_tasks where firm_id = $1) as tasks,
            (select count(*)::int from clara.operation_receipts where firm_id = $1) as receipts,
            (select count(*)::int from clara.agent_interruptions where firm_id = $1) as interruptions`,
    [FIRM_A()])).rows[0];
  // A NARROWED CENSUS CAN GO VACUOUS, which is the one risk scoping introduces: a predicate bound
  // to nothing counts zero everywhere and every equality below passes for free. The binding is
  // asserted before it is used.
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.firms where id = $1", [FIRM_A()])).rows[0].n, 1,
  "the scoping predicate names a real firm — a census narrowed onto nothing would pass no matter what these doors did");
  const checks = async () => (await rootQuery(
    `select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conname in ('accounting_work_purpose_check','operation_receipts_purpose_check')
      order by conname`)).rows;

  const before = await counts();
  const checksBefore = await checks();

  const s = await invoiceWithFacts({ client: A2(), totalCents: 60000, tag: "horn" });
  const afterFixture = await counts();
  await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 650.00", observedVersion: 1 });
  await setDocumentKind(KEEPER(), {
    document: s.documentId, kind: "receipt", reason: "#646 rig: horn A" });
  const orphan = await orphanedQuestion({ client: A2(), tag: "horn-orphan" });
  const of = (await activeFilings(orphan.documentId))[0];
  await retireDocumentFiling(KEEPER(), {
    filing: of.id, reason: "#646 rig: filed in error", expectedRevision: of.revision_token });
  await dismissOrphan(KEEPER(), { question: orphan.questionId });
  await listRevisions(KEEPER(), s.documentId);
  await listDependents(KEEPER(), s.documentId);

  const after = await counts();
  assert.equal(after.work, afterFixture.work,
    "no door in #646 mints accounting work of its own accord (D6). Since #885/0268 a correction DOES restate a Work parked on a question about the corrected document — this fixture parks none, "
    + "so the count is unchanged; the ruling's own path is measured in work-source-correction-supersede.test.mjs");
  assert.equal(after.tasks, afterFixture.tasks, "…and therefore no agent task is minted either");
  assert.equal(after.receipts, afterFixture.receipts, "…and no operation receipt");
  assert.equal(after.interruptions, afterFixture.interruptions, "…and no work question");
  assert.ok(before.work <= afterFixture.work, "the fixture's own baseline is recorded, not assumed");

  assert.deepEqual(await checks(), checksBefore,
    "both purpose CHECK texts are byte-identical — #646 joins no purpose-CHECK spine");
  assert.equal(checksBefore.length, 2, "and both CHECKs really are on this database");
  assert.ok(!checksBefore.some((c) => /source_correction|correction/.test(c.def)),
    "no correction purpose exists anywhere on either CHECK");

  // THE POSITIVE CONTROL, LAST so it cannot move a single arm above. The four zeros are only
  // evidence if this counter can see a mint that really happens in this firm — a guard that
  // counted nothing would report the same four zeros forever. One journal Work admitted through
  // the same door and fixture `p646.question.version` already uses (so this cell leaves no residue
  // of a kind this file does not already leave) must move BOTH work and tasks by one.
  const control = await invoiceWithFacts({ client: A2(), totalCents: 61000, tag: "horn-control" });
  const ctlBefore = await counts();
  await admitJournalWork({
    client: A2(), author: KEEPER(), basis: basis(),
    sourceRefs: [{ kind: "document", document_id: control.documentId }] });
  const ctlAfter = await counts();
  assert.equal(ctlAfter.work, ctlBefore.work + 1,
    "the firm-scoped counter SEES an accounting_work this firm really mints — the zero above is a measurement, not an empty predicate");
  assert.equal(ctlAfter.tasks, ctlBefore.tasks + 1,
    "…and the agent_tasks half of the predicate is live too, which is the number the whole-database form got wrong");
  noteLane("p646.horn_a.no_work: the four counts are FIRM-SCOPED since wave-2026-09-15 integration — the whole-database form was tipped by one unrelated agent_task during the 39-file estate run (2297 !== 2296) while the file was 16/16 alone. The positive control at the end proves the scoped counter still moves on a real mint");
});

// =============================================================================================
// p646.dependents.projection — A READ, AND NOTHING BUT A READ.
// =============================================================================================
cell("p646.dependents.projection: knowledge records standing on the superseded reading are LISTED and byte-unchanged — state unmoved, superseded_by still null, the immutability trigger never fires", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 88000, tag: "dependents" });
  const region = (await regionsOf(s.machineExtraction)).find((r) => r.field_path === "invoice.vendor_name");

  const captured = await humanQuery(OWNER(),
    `select clara.capture_knowledge(
       p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
       p_scope_kind => 'client', p_client => $5, p_source_kind => 'document_extraction',
       p_applies_when => '{}'::jsonb, p_effective_from => null, p_effective_to => null,
       p_source => $6::jsonb) as r`,
    ["msic", JSON.stringify("46900"), "#646 rig: read from this supplier bill", opk("p646-kn"), A1(),
      JSON.stringify({ document_id: s.documentId, extraction_id: s.machineExtraction,
        region_id: region.id, field_path: "invoice.vendor_name" })]);
  const knowledgeId = captured.rows[0].r.revision_id;
  const knBefore = (await rootQuery("select * from clara.knowledge_records where id=$1", [knowledgeId])).rows[0];
  assert.equal(knBefore.state, "live", "mandatory setup: the knowledge record is live and pinned to this reading");

  const listedBefore = await listDependents(KEEPER(), s.documentId);
  assert.equal(listedBefore.knowledge_records.length, 1);
  assert.equal(listedBefore.knowledge_records[0].source_superseded, false,
    "before the revision it stands on the CURRENT reading");

  await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.vendor_name", value: "RIG CORRECTED SUPPLIER SDN BHD",
    observedVersion: 1 });

  const listed = await listDependents(KEEPER(), s.documentId);
  assert.equal(listed.knowledge_records.length, 1, "the record is LISTED, which is what AC3 asks of #646");
  assert.equal(listed.knowledge_records[0].id, knowledgeId);
  assert.equal(listed.knowledge_records[0].source_superseded, true,
    "and it is now standing on a superseded reading — the honest projection a human reviews");

  const knAfter = (await rootQuery("select * from clara.knowledge_records where id=$1", [knowledgeId])).rows[0];
  assert.deepEqual(knAfter, knBefore,
    "…and the record itself is byte-unchanged: #646 writes NOTHING on clara.knowledge_records (the "
    + "automatic re-assessment engine is #658/#663, docs/PRD.md:123)");
  assert.equal(knAfter.state, "live");
  assert.equal(knAfter.superseded_by, null);
});

// =============================================================================================
// p646.question.version — THE DISCRIMINATING CELL, REWRITTEN BY #885.
//
// WHAT CHANGED, AND WHY THE OTHER HORN SURVIVES. When this cell was written, #646 could not move
// anything `clara.answer_work_question` compares, so it RECORDED that answering at the
// pre-revision version succeeded and named the missing mechanism. The owner ruled on 2026-09-17
// (re-confirmed 2026-09-20 on issue #885) that the mechanism must exist: a corrected source
// CANCELS the Work waiting on it and admits a successor, so the stale question can never be
// answered. Migration 0268 is that mechanism. The measured fallback is KEPT because a
// `db-slice-frontiers` leg pinned between 0217 and 0268 really does have 0217's own behaviour,
// and reporting that as a failure would say nothing about the chain under test — this cell has
// always been written as the measurement rather than as a wish, and it still is.
//
// The deep assertions about the supersession itself live in
// `tests/work-source-correction-supersede.test.mjs` (#885's own battery). What THIS cell owns is
// the #646-side claim: after a fact revision, the parked question is no longer answerable.
// =============================================================================================
cell("p646.question.version: a changed source and an open Work question — measured, not assumed", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 99000, tag: "qversion" });
  const b = basis();
  const admitted = await admitJournalWork({
    client: A1(), author: KEEPER(), basis: b,
    sourceRefs: [{ kind: "document", document_id: s.documentId }] });
  await claimWorkRun({ task: admitted.task_id, runId: opk("p646-run") });
  const opened = await openWorkQuestion({ task: admitted.task_id });
  assert.equal(opened.question_version, 1, "mandatory setup: the Work is parked on question version 1");

  // The projection SEES it — that half is #646's own deliverable and is asserted outright.
  const dependents = await listDependents(KEEPER(), s.documentId);
  assert.equal(dependents.work_questions.length, 1,
    "the parked Work question standing on this document is projected");
  assert.equal(dependents.work_questions[0].id, opened.question_id);
  assert.equal(dependents.work_questions[0].question_version, 1);

  const revision = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 1,010.00", observedVersion: 1 });

  const rowAfter = (await rootQuery(
    `select i.question_version, i.status, i.basis_digest, w.status as work_status,
            w.basis_digest as work_digest, w.superseded_by
       from clara.agent_interruptions i join clara.accounting_work w on w.id = i.work_id
      where i.id = $1`, [opened.question_id])).rows[0];
  const answered = await caught(() => answerWorkQuestion(KEEPER(), {
    question: opened.question_id, version: 1, answer: twoFieldAnswer() }));

  if (await supersedeLaneReady()) {
    // #885's HORN — the owner's ruling, on a chain that carries migration 0268.
    noteLane(
      `p646.question.version MEASURED (#885 lane live): the question is ${rowAfter.status} at version `
      + `${rowAfter.question_version}, its Work is ${rowAfter.work_status} with superseded_by `
      + `${String(rowAfter.superseded_by)}; answering at the pre-revision version `
      + `${answered === null ? "SUCCEEDED (no refusal)" : `refused ${answered.code}/${reasonOf(answered)}`}.`);

    assert.equal(revision.superseded_work.length, 1,
      "the revision receipt names the ONE Work its correction retired");
    assert.equal(revision.superseded_work[0].work_id, admitted.work_id);
    assert.equal(revision.superseded_work[0].reason, "source_corrected");
    // SECOND FIX ROUND (recheck L09-RC-02): this fixture's basis is the human's OWN
    // (user_direct) and it is STILL not re-admitted. "Re-admitted on the corrected facts" needs
    // somebody to re-read the corrected document; nothing below the runtime can, so the door
    // retires the Work and a person restates it. See w885.no_stale_post for the end-to-end
    // measurement that no pre-correction figure can reach the ledger afterwards.
    assert.equal(revision.superseded_work[0].replaced, false,
      "no arm re-admits: a basis nobody re-derived from the corrected document is not the corrected facts");
    assert.equal(revision.superseded_work[0].new_work_id, null, "…so there is no successor id");
    assert.equal(revision.superseded_work[0].not_replaced_reason, "basis_predates_correction",
      "…and the receipt says WHY, in the words a person is owed");
    assert.equal(rowAfter.superseded_by, null, "the retired Work points at nothing");
    assert.equal(rowAfter.status, "cancelled", "…and its question is closed");
    assert.ok(answered, "ANSWERING AT THE PRE-REVISION VERSION IS REFUSED — the ruling, measured");
    assert.equal(answered.code, "CLR13", "…as a convergence");
    assert.equal(reasonOf(answered), "source_corrected",
      "…named `source_corrected`: the reading this question stands on was corrected");
    assert.ok(detailOf(answered).current.source_corrected_at,
      "…and the refusal carries WHEN, so the sentence can be about the document");
  } else {
    // THE MEASURED FALLBACK, unchanged: a chain between 0217 and 0268 has #646's own behaviour.
    noteLane(
      `p646.question.version MEASURED (#885 lane absent): after a fact revision the Work question is still at version `
      + `${rowAfter.question_version}, interruption basis_digest ${String(rowAfter.basis_digest).slice(0, 12)} `
      + `vs work basis_digest ${String(rowAfter.work_digest).slice(0, 12)}; answering at the `
      + `pre-revision version ${answered === null ? "SUCCEEDED (no refusal)" : `refused ${answered.code}/${reasonOf(answered)}`}.`);

    assert.equal(rowAfter.question_version, 1,
      "MEASURED: the question version does not move — #646 touches no accounting_work row (D6)");
    assert.equal(answered, null,
      "MEASURED: below the #885 frontier, answering at the pre-revision version SUCCEEDS. That is "
      + "what 0217 alone does, and it is the defect issue #885 was filed for — not a property this "
      + "estate keeps.");
  }
});

// =============================================================================================
// p646.refile.original_client_view — TWO IDENTITY RELATIONS, ONE LINEAGE, ZERO DENORMALISATION.
// =============================================================================================
cell("p646.refile.original_client_view: a wrong-client correction appears in list_source_revisions through the read-side join while document_fact_revisions holds ZERO rows for it", async () => {
  const doc = await filedDocument(KEEPER(), { firm: FIRM_A(), client: A1(), kind: "invoice" });
  const preview = await previewCorrection(KEEPER(), {
    document: doc.documentId, fromClient: A1(), toClient: A2() });
  assert.ok(preview, "mandatory setup: the blast-radius preview reads");
  await freshResolution(KEEPER(), A2(), { subjectKind: "document", subjectId: doc.documentId });
  const proposal = await proposeCorrection(KEEPER(), {
    document: doc.documentId, fromClient: A1(), toClient: A2(),
    reason: "#646 rig: this bill belongs to the other client" });
  await approveCorrection(OWNER(), {
    correction: proposal.correction_id, planHash: proposal.plan_hash,
    attestation: "#646 rig: solo attestation" });

  const filings = await allFilings(doc.documentId);
  const retired = filings.filter((f) => f.retired_at !== null);
  assert.equal(retired.length, 1, "mandatory setup: A1's filing was retired by the correction");
  assert.equal(retired[0].correction_id, proposal.correction_id);

  // THE LEDGER HOLDS NOTHING FOR IT — the proof the two-kind CHECK is right. Nothing in #646 ever
  // writes a refile row, so a third CHECK value and its correction_id FK would be dead in every
  // row this ticket can produce.
  assert.equal((await revisionsOf(doc.documentId)).length, 0,
    "clara.document_fact_revisions holds ZERO rows for a wrong-client correction");

  // …and yet the lineage shows it, joined READ-SIDE, with the filing it retired hanging off it.
  const lineage = await listRevisions(KEEPER(), doc.documentId);
  const entry = lineage.lineage.find((e) => e.entry_kind === "wrong_client_correction");
  assert.ok(entry, "the correction appears in the one chronological lineage");
  assert.equal(entry.correction_id, proposal.correction_id);
  assert.equal(entry.from_client, A1());
  assert.equal(entry.to_client, A2());
  assert.equal(entry.retired_filings.length, 1, "with the filing it retired attached to it");
  assert.equal(entry.retired_filings[0].filing_id, retired[0].id);

  // A kind revision on the SAME document then lands in the SAME lineage, so one read answers "how
  // did this document's reading get here" for both relations.
  await setDocumentKind(KEEPER(), {
    document: doc.documentId, kind: "receipt", reason: "#646 rig: re-kind after the refile" });
  const both = await listRevisions(KEEPER(), doc.documentId);
  assert.deepEqual(
    both.lineage.map((e) => e.entry_kind).sort(),
    ["kind", "wrong_client_correction"],
    "one ordered lineage, two identity relations, nothing denormalised");

  // THE ORIGINAL CLIENT'S FACE, measured rather than assumed. clara.get_document_state answers
  // NULL for the client the document was moved AWAY from (its admission requires a LIVE filing for
  // p_client, 0191:1219-1227) and clara.get_document_for_human_read_v2 folds to not-found for the
  // same reason (0190:216-226) — so the "transferred on <date>, correction <id>" sentence cannot
  // come from either door. clara.list_source_revisions is firm-scoped and carries it, which is
  // what the web surface renders. Recorded as brief drift in 646-final.md.
  const stateForOrigin = await documentState(KEEPER(), doc.documentId, A1());
  assert.equal(stateForOrigin, null,
    "MEASURED: get_document_state folds to NULL for the original client — the no-existence-oracle "
    + "property, unchanged by this ticket");
  const bytes = await humanQuery(KEEPER(),
    `select clara.get_document_for_human_read_v2(p_document => $1, p_user => $2, p_client => $3,
       p_purpose => 'preview') as r`,
    [doc.documentId, KEEPER(), A1()]).then((r) => r.rows[0].r).catch((e) => ({ refused: e.code, message: e.message }));
  assert.ok(bytes === null || bytes.refused !== undefined || bytes.outcome !== "ok",
    "MEASURED: the human lane does not get this document's bytes back for the client it moved away "
    + "from. On this rig the refusal arrives at the GRANT wall (the v2 byte door holds no "
    + "clara_authenticated EXECUTE; the runtime's own route serves bytes), so the origin client's "
    + "bytes question is settled before 0190:216-226's active-filing fold is even reached. Either "
    + "way #646 changes nothing about it.");
  noteLane(`p646.refile.original_client_view MEASURED: get_document_for_human_read_v2 for the origin client answered ${JSON.stringify(bytes)?.slice(0, 160)}`);
  const stateForDestination = await documentState(KEEPER(), doc.documentId, A2());
  assert.ok(stateForDestination, "and the destination client reads the document normally");
});

// =============================================================================================
// p646.reads.scope — THE READS ARE FIRM-SCOPED AND HAVE NO EXISTENCE ORACLE.
// =============================================================================================
cell("p646.reads.scope: both reads answer NULL for another firm's document and for a uuid naming nothing, and neither writes a row", async () => {
  const foreign = (await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, uploaded_by)
     values ($1, repeat('c',64), 'p646-foreign.pdf', 'application/pdf', 10, $2, $3) returning id`,
    [world.firms.B, `firms/${world.firms.B}/docs/${"c".repeat(64)}.pdf`, world.users.dave])).rows[0].id;

  assert.equal(await listRevisions(KEEPER(), foreign), null, "another firm's document is not there");
  assert.equal(await listDependents(KEEPER(), foreign), null);
  const nothing = "00000000-0000-4000-8000-000000000000";
  assert.equal(await listRevisions(KEEPER(), nothing), null,
    "a uuid naming nothing answers identically — no existence oracle");
  assert.equal(await listDependents(KEEPER(), nothing), null);

  const auditBefore = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn in ('list_source_revisions','list_source_dependents')")).rows[0].n;
  const s = await invoiceWithFacts({ client: A1(), totalCents: 12300, tag: "scope" });
  await listRevisions(KEEPER(), s.documentId);
  await listDependents(KEEPER(), s.documentId);
  const auditAfter = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn in ('list_source_revisions','list_source_dependents')")).rows[0].n;
  assert.equal(auditAfter, auditBefore, "a read writes no audit row, no receipt and no revision");
  assert.equal((await revisionsOf(s.documentId)).length, 0);
});

// =============================================================================================
// p646.neighbours — THE PINS THIS TICKET PROMISED NOT TO MOVE.
// =============================================================================================
cell("p646.neighbours: the two non-regression bodies are byte-identical to the bodies 0217's prestate pinned, and no role but clara_authenticated reaches any 0217 door", async () => {
  const shas = (await rootQuery(
    `select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = any($1::regprocedure[])`,
    [["clara._document_posting_entry(uuid,uuid)",
      "clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)"]])).rows;
  const by = Object.fromEntries(shas.map((r) => [r.sig, r.sha]));
  assert.equal(by["clara._document_posting_entry(uuid,uuid)"],
    "8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0",
    "0197's pin, re-measured through the door rather than transcribed");
  // RE-ISSUED 2026-09-17 at the wave's re-base. This was 0191's post-splice pin (0230031f…); the
  // riders batch (PR #838) recut the body in 0201_document_regions_unique_field_path (#778), so
  // the literal moves to the body the chain now holds — the SAME value 0217's own prestate pins,
  // which is what makes this cell a second, independent reading of it rather than a copy.
  assert.equal(by["clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)"],
    "b94260ab1999db379c79a6ad2ad44f07445f019c1e7c8640bb5699725f74d7a8",
    "the post-#778 body 0217 measured");

  const doors = ["revise_document_fact", "dismiss_orphaned_classification_question",
    "list_source_revisions", "list_source_dependents"];
  for (const role of [ROLES.agentRo, ROLES.runtime]) {
    const reach = await rootQuery(
      `select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='clara' and p.proname = any($1::text[])
          and has_function_privilege($2, p.oid, 'execute')`, [doors, role]);
    assert.equal(reach.rowCount, 0, `${role} reaches no 0217 door`);
  }
  const pub = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname='clara' and p.proname = any($1::text[])
        and has_function_privilege('public', p.oid, 'execute')`, [doors]);
  assert.equal(pub.rowCount, 0, "and PUBLIC reaches none of them");
});
