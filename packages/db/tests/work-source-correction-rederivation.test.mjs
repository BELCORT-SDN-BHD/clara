// #1030 — THE SUCCESSOR A SOURCE CORRECTION OWES, AND THE RULE FOR AN EDIT THAT CHANGES NOTHING.
//
// #885 (migration 0268) shipped the ruling's non-negotiable half: a document fact that a pending
// question stands on is corrected, every Work parked on that question is RETIRED, and no path can
// post or answer against the pre-correction figure. What it could not ship is the other half —
// re-admission ON THE CORRECTED FACTS — because deriving a basis from a corrected reading is an
// interpretation act and only the Work runtime performs one (0268's own header; the successor
// contract in `reports/wave2-lane09-fix.md` §3a).
//
// THIS FILE IS THE DATABASE HALF OF THAT CONTRACT. It proves the doors the runtime lane needs and
// the one rule the correcting door owes a person:
//
//   §1  THE COSMETIC-EDIT RULE. An edit that only re-spells a value the estate has a CANONICAL
//       FORM for (money → cents, `invoice.currency` → the ISO code, `invoice.invoice_date` → the
//       calendar day) changes nothing and is refused BEFORE anything is written. An edit to a
//       value the estate keeps as TEXT (a vendor name, an invoice id) is a real correction, kept
//       on purpose, because the document's own spelling is the fact.
//   §2  THE BACKLOG. `clara.source_correction_rederivations` names every retirement still owed a
//       successor, with the correction, the retired instruction and the document's LIVE facts.
//   §3  THE SETTLEMENT. `clara.settle_source_corrected_rederivation` claims the link through the
//       correction's OWN durable op key, or records a decline, exactly once.
//   §4  THE SUCCESSOR'S OWN BRIEF, so its run can name BOTH figures before anything may post.
//   §5  #885'S NON-NEGOTIABLES, still true after all of it.
//
// FRONTIER-GATED on the migration's stable STEM, never on its number.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, opk, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import {
  buildWorkWorld, admitJournalWork, claimWorkRun, basis, workRow,
} from "./work-journal-fixtures.mjs";
import {
  openWorkQuestion, interruptionRow, answerWorkQuestion, twoFieldAnswer,
} from "./work-question-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";

const STEM = "work_source_correction_rederivation$";
const EXPECTED_CELLS = 3;

let live = false;
let world = null;
let executed = 0;

async function cohortApplied() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) return false;
  // WHOLLY PRESENT OR WHOLLY ABSENT: a half-applied 0321 is a defect, not a narrower boundary.
  const fns = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = any($1::text[])`,
    [["_fact_calendar_day"]]);
  if (fns.rows[0].n !== 1) {
    assert.fail(`0321 ledger row present but only ${fns.rows[0].n}/1 of its routines exist — half-applied migration`);
  }
  return true;
}

before(async () => {
  live = await cohortApplied();
  if (live) world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-source-correction-rederivation");
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_WORK_SOURCE_REDERIVATION === "1") {
    console.warn("SKIP work-source-correction-rederivation: the 0321 cohort is not applied (explicit pre-integration run).");
    t.skip("work-source-correction rederivation cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "work-source-correction-rederivation is required for a focused run: apply "
    + "0321_work_source_correction_rederivation.sql",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

const FIRM_A = () => world.firms.A;
const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;
const KEEPER = () => world.users.bob;

const money = (cents) => `RM ${(cents / 100).toFixed(2)}`;

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}
function detailOf(err) {
  if (!err || !err.detail) return {};
  try { return JSON.parse(err.detail); } catch { return {}; }
}

async function reviseFact(sub, {
  document, fieldPath, value, observedVersion,
  reason = "#1030 rig: the reader misread the printed figure", opKey = null,
}) {
  const r = await humanQuery(sub,
    `select clara.revise_document_fact(p_document => $1, p_field_path => $2, p_value => $3::jsonb,
       p_observed_version => $4, p_reason => $5, p_op_key => $6) as r`,
    [document, fieldPath, JSON.stringify(value), observedVersion, reason, opKey ?? opk("r1030-fact")]);
  return r.rows[0].r;
}

const extractionsOf = (document) => rootQuery(
  `select id, engine_id, engine_kind, version_n, status, superseded_by
     from clara.document_extractions where document_id=$1 order by extracted_at, id`, [document])
  .then((r) => r.rows);

/** A filed INVOICE carrying a real machine `invoice_facts` extraction whose CURRENCY and INVOICE
 *  DATE are stated, because those are the two non-monetary paths the estate keeps a canonical
 *  form for and §1 is about exactly them. */
async function invoiceWithFacts({
  client, totalCents = 115000, tax = 0, tag = "r1030",
  currency = "MYR", invoiceDate = "2026-03-05", vendor = null,
}) {
  const firm = FIRM_A();
  await ensureClientEgress(OWNER(), { client }).catch(() => {});
  const doc = await filedDocument(KEEPER(), { firm, client, kind: "invoice" });
  const task = await mintLegacyInvoiceFactsTask(doc.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", money(totalCents)),
    ...statedIdentityFields(totalCents, { tax }),
    factField("invoice.currency", currency),
    factField("invoice.invoice_date", invoiceDate),
    factField("invoice.vendor_name", vendor ?? `RIG ${tag.toUpperCase()} SUPPLIER SDN BHD`),
  ]);
  const machine = (await extractionsOf(doc.documentId))
    .filter((e) => e.engine_kind === "invoice_facts" && e.status === "done");
  assert.equal(machine.length, 1, "mandatory setup: exactly one machine invoice_facts extraction landed");
  return { ...doc, machineExtraction: machine[0].id };
}

/** A Work admitted on `document`, claimed, and PARKED on one question. */
async function workParkedOnDocument({ client, document, b = null, origin = "clara_interpreted" }) {
  const admitted = await admitJournalWork({
    client, author: KEEPER(), basis: b ?? basis(), origin,
    sourceRefs: [{ kind: "document", document_id: document }],
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("r1030-run") });
  const opened = await openWorkQuestion({ task: admitted.task_id });
  assert.equal(opened.question_version, 1, "mandatory setup: the Work is parked on question version 1");
  return { ...admitted, questionId: opened.question_id };
}

// =============================================================================================
// §1 · THE COSMETIC-EDIT RULE — decided, and the decision is per FIELD, not per keystroke.
// =============================================================================================

cell("r1030.cosmetic.canonical: an edit that only re-spells a value the estate canonicalises (a currency code's case, a date's spelling) is refused value_unchanged before anything is written", async () => {
  const s = await invoiceWithFacts({
    client: A1(), totalCents: 88000, tag: "cosmetic", currency: "MYR", invoiceDate: "2026-03-05",
  });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const extractionsBefore = (await extractionsOf(s.documentId)).length;

  // A · A CURRENCY CODE RE-CASED. ISO 4217 defines the code, not its typography, and the estate
  // stores it upper-cased everywhere it reaches the books.
  const errCcy = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.currency", value: "myr", observedVersion: 1,
  }));
  assert.ok(errCcy, "re-casing the currency code is REFUSED");
  assert.equal(errCcy.code, "CLR10", "…as the door's own malformed-request class");
  assert.equal(detailOf(errCcy).reason, "value_unchanged",
    "…named value_unchanged, the same word a re-typed figure gets");

  // B · A DATE RESPELLED TO THE SAME CALENDAR DAY.
  const errDate = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.invoice_date", value: "5 March 2026",
    observedVersion: 1,
  }));
  assert.ok(errDate, "respelling the invoice date to the same calendar day is REFUSED");
  assert.equal(errDate.code, "CLR10");
  assert.equal(detailOf(errDate).reason, "value_unchanged");

  // C · NOTHING WAS WRITTEN, and that is the whole point: no extraction, no revision row, no
  // retirement, and the question a person is holding is still answerable.
  assert.equal((await extractionsOf(s.documentId)).length, extractionsBefore,
    "no extraction was appended by either refusal");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.document_fact_revisions where document_id=$1",
    [s.documentId])).rows[0].n, 0, "…and no revision row");
  const row = await workRow(parked.work_id);
  assert.equal(row.status, "awaiting_input", "the parked Work was not retired");
  assert.equal((await interruptionRow(parked.questionId)).status, "pending",
    "…and its question is still open");
  const answered = await answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  });
  assert.equal(answered.status, "answered",
    "…and still ANSWERABLE — the strongest form of 'nothing happened'");

  noteLane(`r1030.cosmetic.canonical: currency + date respellings refused, ${extractionsBefore} extractions unchanged`);
});

cell("r1030.cosmetic.control: a REAL change to those same two fields still commits, so the guard is not a wall", async () => {
  const s = await invoiceWithFacts({
    client: A1(), totalCents: 76000, tag: "control", currency: "MYR", invoiceDate: "2026-03-05",
  });
  const ccy = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.currency", value: "SGD", observedVersion: 1,
  });
  assert.equal(ccy.facts_version, 2, "a different currency is a real correction and commits");
  const day = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.invoice_date", value: "2026-03-06",
    observedVersion: 2,
  });
  assert.equal(day.facts_version, 3, "a different calendar day is a real correction and commits");
  noteLane("r1030.cosmetic.control: currency and date corrections still commit (facts_version 2 then 3)");
});

cell("r1030.cosmetic.text: a re-cased value the estate keeps as TEXT is a REAL correction, kept on purpose — the document's own spelling is the fact", async () => {
  const s = await invoiceWithFacts({
    client: A1(), totalCents: 54000, tag: "text", vendor: "ACME SDN BHD",
  });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.vendor_name", value: "Acme Sdn Bhd",
    observedVersion: 1, reason: "#1030 rig: the printed name is mixed case, not upper case",
  });
  assert.equal(receipt.facts_version, 2,
    "a re-cased vendor name COMMITS: the estate has no canonical form for a name, so the "
    + "recorded text IS the fact and a professional must be able to correct it");
  assert.equal(receipt.superseded_work.length, 1,
    "…and it carries the full consequence, deliberately: the parked Work is retired");
  assert.equal(receipt.superseded_work[0].work_id, parked.work_id);

  noteLane("r1030.cosmetic.text: a re-cased vendor name commits and retires, by decision");
});
