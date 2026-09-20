// #885 — A DOCUMENT CORRECTION CANCELS AND RE-ADMITS THE WORK PARKED ON A QUESTION ABOUT IT.
//
// THE OWNER'S RULING (2026-09-17, re-confirmed 2026-09-20 on the ticket): when a document fact is
// corrected, every Work parked on a question about that document is CANCELLED with the correction
// as its reason and SUPERSEDED by a fresh Work on the corrected reading, so a person can never
// answer a question that was asked against a stale basis. The 2026-09-20 scan records the
// implementation preference this battery measures: the cancel-and-admit happens inside the
// CORRECTING DOOR'S OWN TRANSACTION, not in a new runtime consumer, so no frozen document-ingest
// closure is touched.
//
// FRONTIER-GATED on the migration's stable STEM (`work_source_correction_supersede$`), never on
// its number: a `db-slice-frontiers` leg pinned below it SKIPS LOUDLY through the pre-integration
// gate module, and a FOCUSED run without that module FAILS rather than skipping — a skip is not
// evidence.
//
// EVERY CELL DRIVES THE PUBLIC DOORS. `clara.revise_document_fact` is called as the least
// privilege that should succeed (bookkeeper), `clara.answer_work_question` as the same human, and
// every positive assertion re-reads the COMMITTED rows rather than trusting a door's receipt.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, opk, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import {
  buildWorkWorld, admitJournalWork, claimWorkRun, basis, workRow,
} from "./work-journal-fixtures.mjs";
import {
  openWorkQuestion, interruptionRow, answerWorkQuestion, twoFieldAnswer, cancelAgentTask,
} from "./work-question-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";

const STEM = "work_source_correction_supersede$";
const EXPECTED_CELLS = 2;

let live = false;
let world = null;
let executed = 0;

async function cohortApplied() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) return false;
  // WHOLLY PRESENT OR WHOLLY ABSENT: a half-applied 0268 is a defect, not a narrower boundary.
  const fns = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = any($1::text[])`,
    [["_source_corrected_work", "_lock_source_corrected_work", "_supersede_source_corrected_work"]]);
  if (fns.rows[0].n !== 3) {
    assert.fail(`0268 ledger row present but only ${fns.rows[0].n}/3 of its routines exist — half-applied migration`);
  }
  return true;
}

before(async () => {
  live = await cohortApplied();
  if (live) world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-source-correction-supersede");
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_WORK_SOURCE_CORRECTION === "1") {
    console.warn("SKIP work-source-correction-supersede: the 0268 cohort is not applied (explicit pre-integration run).");
    t.skip("work-source-correction cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "work-source-correction-supersede is required for a focused run: apply "
    + "0268_work_source_correction_supersede.sql",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

const FIRM_A = () => world.firms.A;
const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;      // owner, firm A
const KEEPER = () => world.users.bob;       // bookkeeper, firm A — the least privilege every door admits

const money = (cents) => `RM ${(cents / 100).toFixed(2)}`;

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}
function detailOf(err) {
  if (!err || !err.detail) return {};
  try { return JSON.parse(err.detail); } catch { return {}; }
}

// ---------------------------------------------------------------------------------------------
// Door wrappers — named arguments only, so a parameter-name divergence is a real finding rather
// than a silent positional mismatch.
// ---------------------------------------------------------------------------------------------
async function reviseFact(sub, {
  document, fieldPath, value, observedVersion,
  reason = "#885 rig: the reader misread the printed figure", opKey = null,
}) {
  const r = await humanQuery(sub,
    `select clara.revise_document_fact(p_document => $1, p_field_path => $2, p_value => $3::jsonb,
       p_observed_version => $4, p_reason => $5, p_op_key => $6) as r`,
    [document, fieldPath, JSON.stringify(value), observedVersion, reason, opKey ?? opk("w885-fact")]);
  return r.rows[0].r;
}

const extractionsOf = (document) => rootQuery(
  `select id, engine_id, engine_kind, version_n, status, superseded_by
     from clara.document_extractions where document_id=$1 order by extracted_at, id`, [document])
  .then((r) => r.rows);

/** A filed INVOICE of `client` carrying a real machine `invoice_facts` extraction, built through
 *  the estate's own verbs — the same fixture #646's own battery uses. */
async function invoiceWithFacts({ client, totalCents = 115000, tax = 0, tag = "w885" }) {
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

/** A Work admitted on `document`, claimed, and PARKED on one question — the shape the ruling is
 *  about. Built through the real verbs: a planted row would prove nothing about parking. */
async function workParkedOnDocument({ client, document, b = null }) {
  const admitted = await admitJournalWork({
    client, author: KEEPER(), basis: b ?? basis(),
    sourceRefs: [{ kind: "document", document_id: document }],
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w885-run") });
  const opened = await openWorkQuestion({ task: admitted.task_id });
  assert.equal(opened.question_version, 1, "mandatory setup: the Work is parked on question version 1");
  return { ...admitted, questionId: opened.question_id };
}

// =============================================================================================
// w885.supersede.cancels — THE RULING, END TO END.
// =============================================================================================
cell("w885.supersede.cancels: correcting a fact a parked question cites cancels that Work with source_corrected and admits a successor on the same basis", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 99000, tag: "supersede" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const before = await workRow(parked.work_id);
  assert.equal(before.status, "awaiting_input", "mandatory setup: the Work really is parked");
  assert.equal(before.superseded_by, null, "mandatory setup: nothing has superseded it yet");

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 1,010.00", observedVersion: 1,
  });

  // 1 · THE RECEIPT NAMES WHAT IT DID. A correction that quietly retired a Work would be the worst
  // possible answer: the door has to say so in the receipt the surface reads.
  assert.ok(Array.isArray(receipt.superseded_work),
    "the revision receipt carries the supersessions it performed");
  assert.equal(receipt.superseded_work.length, 1, "exactly the one Work parked on this document");
  const entry = receipt.superseded_work[0];
  assert.equal(entry.work_id, parked.work_id, "…named by id");
  assert.equal(entry.reason, "source_corrected", "…with the correction as its reason");
  assert.ok(entry.new_work_id && entry.new_work_id !== parked.work_id,
    "…and a successor that is a DIFFERENT Work");

  // 2 · THE COMMITTED ROWS, re-read rather than trusted.
  const oldRow = await workRow(parked.work_id);
  assert.equal(oldRow.superseded_by, entry.new_work_id, "the old Work points at its successor");
  assert.ok(["stopping", "cancelled"].includes(oldRow.status),
    `the old Work is going away (status ${oldRow.status})`);
  const newRow = await workRow(entry.new_work_id);
  assert.equal(newRow.supersedes, parked.work_id, "the successor points back");
  assert.equal(newRow.status, "queued", "the successor is admitted and waiting to run");
  assert.deepEqual(newRow.basis, oldRow.basis,
    "the ADMITTED BASIS is carried forward verbatim — the instruction did not change, the document did");
  assert.deepEqual(newRow.source_refs, oldRow.source_refs, "…and so is the evidence it stands on");
  assert.equal(newRow.client_id, oldRow.client_id);

  // 3 · THE QUESTION IS CLOSED. Nothing can be answered against the reading that moved.
  const q = await interruptionRow(parked.questionId);
  assert.equal(q.status, "cancelled", "the pending question is closed by the cancel cascade");

  noteLane(`w885.supersede.cancels: work ${String(parked.work_id).slice(0, 8)} -> ${String(entry.new_work_id).slice(0, 8)}, old status ${oldRow.status}`);
});

// =============================================================================================
// w885.answer.superseded — THE HALF A PERSON ACTUALLY MEETS, and the narrowness that protects it.
// =============================================================================================
cell("w885.answer.superseded: answering the retired question refuses CLR13 superseded and names the successor, while an ordinary cancel still refuses cancelled", async () => {
  // A · THE CORRECTION'S OWN REFUSAL.
  const s = await invoiceWithFacts({ client: A1(), totalCents: 77000, tag: "answer" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 820.00", observedVersion: 1,
  });
  const successor = receipt.superseded_work[0].new_work_id;

  const err = await caught(() => answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  }));
  assert.ok(err, "answering a question asked against the corrected reading is REFUSED");
  assert.equal(err.code, "CLR13", "…as a convergence, the code every question refusal already uses");
  const d = detailOf(err);
  assert.equal(d.reason, "superseded",
    "…named SUPERSEDED, not `cancelled`: the question was retired because its Work was replaced");
  assert.equal(d.current.superseded_by, successor,
    "…and the refusal names the Work that replaced it, so a surface has somewhere to send the person");
  assert.equal(d.current.work_id, parked.work_id, "…beside the Work it is about");
  assert.equal(d.current.status, "cancelled", "…whose question row really is closed");

  // B · THE NARROWNESS CONTROL. An ORDINARY cancel — no successor — must keep the exact word
  // 0180 gave it. Without this the new arm would silently re-label every cancelled question.
  const plain = await workParkedOnDocument({ client: A1(), document: s.documentId, b: basis({ cents: 45600 }) });
  await cancelAgentTask(KEEPER(), { task: plain.task_id });
  const err2 = await caught(() => answerWorkQuestion(KEEPER(), {
    question: plain.questionId, version: 1, answer: twoFieldAnswer(),
  }));
  assert.ok(err2, "mandatory setup: the plainly-cancelled question is refused too");
  assert.equal(err2.code, "CLR13");
  const d2 = detailOf(err2);
  assert.equal(d2.reason, "cancelled",
    "a cancel with NO successor still answers `cancelled` — the new word is not a rename");
  assert.equal(d2.current.superseded_by, null, "…and there is no successor to name");

  noteLane(`w885.answer.superseded: refusal ${d.reason} -> ${String(d.current.superseded_by).slice(0, 8)}; plain cancel refusal ${d2.reason}`);
});
