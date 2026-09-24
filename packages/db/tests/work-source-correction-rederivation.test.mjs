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
import { rootQuery, humanQuery, roleQuery, opk, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import {
  buildWorkWorld, admitJournalWork, claimWorkRun, basis, workRow,
} from "./work-journal-fixtures.mjs";
import {
  openWorkQuestion, interruptionRow, answerWorkQuestion, twoFieldAnswer, listReviewQueue,
} from "./work-question-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";

const STEM = "work_source_correction_rederivation$";
const EXPECTED_CELLS = 10;
const RUNTIME = "clara_runtime";

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
    [["_fact_calendar_day", "_source_correction_rederivation_brief",
      "source_correction_rederivations", "settle_source_corrected_rederivation",
      "source_correction_successor_brief"]]);
  if (fns.rows[0].n !== 5) {
    assert.fail(`0321 ledger row present but only ${fns.rows[0].n}/5 of its routines exist — half-applied migration`);
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

// ---------------------------------------------------------------------------------------------
// The three lane doors, as the Work runtime reaches them: `clara_runtime`, named arguments only.
// ---------------------------------------------------------------------------------------------
async function backlog({ limit = 200 } = {}) {  // the door caps at 200; a shared rig accumulates retirements from every earlier cell
  const r = await roleQuery(RUNTIME,
    "select clara.source_correction_rederivations(p_limit => $1::integer) as r", [limit]);
  return r.rows[0].r;
}
async function settleRederivation({ opKey, successor = null, reason = null }) {
  const r = await roleQuery(RUNTIME,
    `select clara.settle_source_corrected_rederivation(p_op_key => $1::text,
       p_successor => $2::uuid, p_reason => $3::text) as r`, [opKey, successor, reason]);
  return r.rows[0].r;
}
async function successorBrief(work) {
  const r = await roleQuery(RUNTIME,
    "select clara.source_correction_successor_brief(p_work => $1::uuid) as r", [work]);
  return r.rows[0].r;
}
const entryFor = (list, opKey) => (list ?? []).find((b) => b.op_key === opKey) ?? null;

/** Correct `invoice.total` on a document a parked Work cites, and hand back the retirement's own
 *  durable op key — the link #885 deliberately left for this ticket to claim. */
async function correctAndRetire({ document, parked, to }) {
  const receipt = await reviseFact(KEEPER(), {
    document, fieldPath: "invoice.total", value: to, observedVersion: 1,
  });
  assert.equal(receipt.superseded_work.length, 1, "mandatory setup: exactly one Work was retired");
  assert.equal(receipt.superseded_work[0].work_id, parked.work_id);
  assert.equal(receipt.superseded_work[0].replaced, false,
    "mandatory setup: 0268 still admits no successor of its own");
  return { receipt, opKey: `source_corrected:${receipt.revision_id}:${parked.work_id}` };
}

// =============================================================================================
// §2 · THE BACKLOG — what the Work runtime is handed, and what it is NOT handed.
// =============================================================================================

cell("r1030.backlog.names_the_retirement: a retirement with no successor is listed with the correction, the retired instruction and the document's LIVE facts", async () => {
  // Both figures are LITERALS off the fixture document, neither recomputed the way the code
  // computes it: the reader took RM 640.00 and a professional corrects it to RM 999.00.
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "backlog" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 64000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 999.00" });

  const list = await backlog();
  assert.ok(Array.isArray(list), "the backlog is an array, empty or not");
  const b = entryFor(list, opKey);
  assert.ok(b, "the retirement this correction performed is ON the backlog, by its own op key");

  assert.equal(b.retired_work_id, parked.work_id, "…naming the Work that was retired");
  assert.equal(b.document_id, s.documentId, "…the document that was corrected");
  assert.equal(b.field_path, "invoice.total", "…the field that moved");
  assert.equal(Number(b.prior_value.cents), 64000, "…what the document used to say");
  assert.equal(Number(b.new_value.cents), 99900, "…and what it says now");
  assert.equal(b.corrected_by, KEEPER(), "…on whose authority, so the successor is admitted for them");
  assert.equal(b.client_id, A1(), "…for which client");

  // THE RETIRED INSTRUCTION, which is what did NOT change: the evidence and the shape.
  assert.equal(b.retired_basis_origin, "clara_interpreted");
  assert.ok(Array.isArray(b.retired_source_refs) && b.retired_source_refs.length === 1,
    "…and the source refs the successor must carry unchanged");
  assert.equal(b.retired_source_refs[0].document_id, s.documentId);
  assert.equal(b.retired_basis.lines[0].debit_cents, 64000,
    "…and the basis it was admitted on, so a question can name the figure a person last saw");

  // THE LIVE FACTS, which is what DID change, read off the document's newest done extraction —
  // never off the retired Work.
  assert.equal(Number(b.live_facts["invoice.total"].cents), 99900,
    "the LIVE reading of invoice.total is the corrected one");
  assert.equal(b.facts_version, 2, "…on the facts version the correction produced");
  assert.ok(b.live_extraction_id, "…named by the extraction it was read from");

  noteLane(`r1030.backlog.names_the_retirement: ${opKey} listed, live total ${b.live_facts["invoice.total"].cents}`);
});

cell("r1030.backlog.excludes: a retirement already settled leaves the backlog, and a Work nothing corrected never joins it", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 41000, tag: "excl" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 41000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 470.00" });
  assert.ok(entryFor(await backlog(), opKey), "mandatory setup: it is on the backlog first");

  // A DECLINE is a settlement: the lane decided, and it must not be asked again every cycle.
  const declined = await settleRederivation({
    opKey, reason: "the correction moves no line of this basis",
  });
  assert.equal(declined.claimed, false);
  assert.equal(declined.successor_work_id, null);
  assert.equal(entryFor(await backlog(), opKey), null, "a settled retirement is OFF the backlog");

  // …and a parked Work nobody corrected is not on it at all.
  const quiet = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const list = await backlog();
  assert.equal((list ?? []).filter((x) => x.retired_work_id === quiet.work_id).length, 0,
    "a Work no correction retired is never on the backlog");

  noteLane(`r1030.backlog.excludes: ${opKey} settled as a decline and left the backlog`);
});

// =============================================================================================
// §3 · THE SETTLEMENT — the link, claimed through the correction's OWN durable op key.
// =============================================================================================

cell("r1030.settle.claims_the_link: a successor admitted under the correction's own op key claims superseded_by, once, and only for that correction", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "claim" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 64000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 999.00" });

  // THE SUCCESSOR, admitted through the ORDINARY door with the correction's key as its intent —
  // carrying the CORRECTED figure, a literal from the corrected document.
  const successor = await admitJournalWork({
    client: A1(), author: KEEPER(), intentKey: opKey, origin: "clara_interpreted",
    basis: basis({ cents: 99900 }),
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });
  assert.notEqual(successor.work_id, parked.work_id);

  const claimed = await settleRederivation({ opKey, successor: successor.work_id });
  assert.equal(claimed.claimed, true, "the link is claimed");
  assert.equal(claimed.successor_work_id, successor.work_id);
  assert.equal(claimed.retired_work_id, parked.work_id);

  const oldRow = await workRow(parked.work_id);
  assert.equal(oldRow.superseded_by, successor.work_id,
    "the RETIRED Work now points at the successor it produced — the AC's own words");
  const newRow = await workRow(successor.work_id);
  assert.equal(newRow.supersedes, parked.work_id, "…and the successor points back");

  // IDEMPOTENT: the lane crashes between admitting and settling and comes back.
  const again = await settleRederivation({ opKey, successor: successor.work_id });
  assert.equal(again.claimed, true, "a second settlement is a replay, not a second claim");
  assert.equal(again.replayed, true);
  assert.equal(entryFor(await backlog(), opKey), null, "and the retirement is off the backlog");

  // THE WALL: a Work that was NOT admitted for this correction cannot claim it. Without this the
  // op key would be a label rather than a link.
  const stranger = await admitJournalWork({
    client: A1(), author: KEEPER(), origin: "user_direct", basis: basis({ cents: 12300 }),
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });
  const s2 = await invoiceWithFacts({ client: A1(), totalCents: 33000, tag: "claim2" });
  const parked2 = await workParkedOnDocument({
    client: A1(), document: s2.documentId, b: basis({ cents: 33000 }),
  });
  const second = await correctAndRetire({ document: s2.documentId, parked: parked2, to: "RM 350.00" });
  const err = await caught(() => settleRederivation({
    opKey: second.opKey, successor: stranger.work_id,
  }));
  assert.ok(err, "a Work whose intent key is not this correction's is REFUSED the link");
  assert.equal(err.code, "CLR10");
  assert.equal(detailOf(err).reason, "successor_not_for_this_correction");
  assert.equal((await workRow(parked2.work_id)).superseded_by, null, "…and nothing was written");

  noteLane(`r1030.settle.claims_the_link: ${String(parked.work_id).slice(0, 8)} -> ${String(successor.work_id).slice(0, 8)} through ${opKey}`);
});

cell("r1030.settle.refusals: an unknown correction, a malformed key and a decline with no reason are each refused by name", async () => {
  const e1 = await caught(() => settleRederivation({ opKey: "not-a-source-corrected-key", reason: "x" }));
  assert.equal(e1?.code, "CLR10", "a key that is not this lane's shape is refused");
  assert.equal(detailOf(e1).reason, "invalid_op_key");

  const e2 = await caught(() => settleRederivation({
    opKey: "source_corrected:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    reason: "x",
  }));
  assert.equal(e2?.code, "CLR11", "a correction nobody performed is NOT FOUND");
  assert.equal(detailOf(e2).reason, "correction_not_found");

  const s = await invoiceWithFacts({ client: A1(), totalCents: 29000, tag: "refuse" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 29000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 300.00" });
  const e3 = await caught(() => settleRederivation({ opKey }));
  assert.equal(e3?.code, "CLR10", "a decline must say WHY — a silent one is a fact nobody can read");
  assert.equal(detailOf(e3).reason, "decline_reason_required");
  assert.ok(entryFor(await backlog(), opKey), "…and the refusal settled nothing");
});

// =============================================================================================
// §4 · THE SUCCESSOR'S OWN BRIEF — both figures, so its run can name them before anything posts.
// =============================================================================================

cell("r1030.successor.brief: the successor's own run is handed BOTH figures and the Work it replaces, and an ordinary Work is handed nothing", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "brief" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 64000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 999.00" });
  const successor = await admitJournalWork({
    client: A1(), author: KEEPER(), intentKey: opKey, origin: "clara_interpreted",
    basis: basis({ cents: 99900 }),
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });

  const b = await successorBrief(successor.work_id);
  assert.ok(b, "a Work admitted under a correction's op key KNOWS it is a successor");
  assert.equal(b.retired_work_id, parked.work_id);
  assert.equal(b.document_id, s.documentId);
  assert.equal(b.field_path, "invoice.total");
  assert.equal(Number(b.retired_reading.cents), 64000,
    "the figure the retired Work was admitted on — the first of the two the question must name");
  assert.equal(Number(b.corrected_reading.cents), 99900,
    "…and what the document now says — the second");
  assert.equal(b.retired_basis.lines[0].debit_cents, 64000,
    "…with the retired basis itself, so the question can quote it rather than paraphrase it");

  // THE CONTROL: an ordinary Work is not a successor and must not be told it is.
  const ordinary = await admitJournalWork({
    client: A1(), author: KEEPER(), origin: "user_direct", basis: basis({ cents: 15000 }),
    sourceRefs: [],
  });
  assert.equal(await successorBrief(ordinary.work_id), null,
    "an ordinary Work gets NULL — the brief is not a default");

  noteLane(`r1030.successor.brief: ${Number(b.retired_reading.cents)} -> ${Number(b.corrected_reading.cents)}`);
});

// =============================================================================================
// §5 · #885'S NON-NEGOTIABLES, STILL TRUE AFTER ALL OF IT.
// =============================================================================================

cell("r1030.nonnegotiables: after the lane exists, the retired question still refuses, no pre-correction figure survives, and a same-value edit still refuses before anything is written", async () => {
  // A · THE RETIRED QUESTION IS STILL CLOSED AND STILL REFUSES — with a successor now standing.
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "nonneg" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 64000 }),
  });
  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 999.00" });
  const successor = await admitJournalWork({
    client: A1(), author: KEEPER(), intentKey: opKey, origin: "clara_interpreted",
    basis: basis({ cents: 99900 }),
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });
  await settleRederivation({ opKey, successor: successor.work_id });

  const err = await caught(() => answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  }));
  assert.equal(err?.code, "CLR13", "the retired question is still unanswerable");
  assert.equal(detailOf(err).reason, "source_corrected", "…for the same reason it always was");
  assert.equal(detailOf(err).current.superseded_by, successor.work_id,
    "…and NOW it can name the replacement, which is the whole point of the link");

  // B · NO PRE-CORRECTION FIGURE SURVIVES ON THIS DOCUMENT. The blocker #885 measured was a
  // successor whose `basis_digest` was byte-identical to the retired Work's, so it could post the
  // pre-correction figure against the corrected document and be accepted. Scoped to the Works
  // that CITE this document, because a basis digest is a hash of the payload alone and an
  // unrelated Work of another document may legitimately carry the same figures.
  assert.equal((await rootQuery(
    `select count(*)::int as n from clara.accounting_work w
      where w.firm_id = (select firm_id from clara.accounting_work where id = $1)
        and w.id <> $1
        and w.basis_digest = (select basis_digest from clara.accounting_work where id = $1)
        and exists (select 1 from jsonb_array_elements(coalesce(w.source_refs,'[]'::jsonb)) x
                     where x->>'document_id' = $2)`,
    [parked.work_id, s.documentId])).rows[0].n, 0,
  "no Work citing the corrected document carries the retired Work's own basis digest");
  assert.notEqual((await workRow(successor.work_id)).basis_digest,
    (await workRow(parked.work_id)).basis_digest,
    "…and the successor's basis is a DIFFERENT payload, which is the blocker #885 measured");

  // C · A SAME-VALUE EDIT STILL REFUSES BEFORE ANYTHING IS WRITTEN.
  const quiet = await invoiceWithFacts({ client: A1(), totalCents: 80000, tag: "noop" });
  const quietParked = await workParkedOnDocument({ client: A1(), document: quiet.documentId });
  const noop = await caught(() => reviseFact(KEEPER(), {
    document: quiet.documentId, fieldPath: "invoice.total", value: "RM 800.00", observedVersion: 1,
  }));
  assert.equal(noop?.code, "CLR10");
  assert.equal(detailOf(noop).reason, "value_unchanged");
  assert.equal((await workRow(quietParked.work_id)).status, "awaiting_input",
    "…and the Work parked on that document is untouched");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.document_fact_revisions where document_id=$1",
    [quiet.documentId])).rows[0].n, 0, "…with no revision row written");

  noteLane("r1030.nonnegotiables: retired question still refuses, now naming its successor");
});

/** Needs-you, flattened to the rows that carry a QUESTION id, whatever envelope key the read
 *  puts them under. Keyed on the id rather than on a path so this cell is about the ROW reaching a
 *  person, not about the envelope shape #840 owns. */
async function reviewQueue(sub) {
  const q = await listReviewQueue(sub, { limit: 200 });
  const rows = [];
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === "object") {
      const id = v.interruption_id ?? v.question_id;
      if (typeof id === "string") rows.push(Object.assign({ interruption_id: id }, v));
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(q);
  return rows;
}

// =============================================================================================
// §6 · NEEDS-YOU — the first moment "the replacement is ready" becomes literally true.
// =============================================================================================

cell("r1030.needsyou.shows_the_successor: after a correction Needs-you shows the successor's confirmation question, where before this change it showed nothing", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "needsyou" });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b: basis({ cents: 64000 }),
  });

  // BEFORE: the retired Work's question is the only row this document has, and Needs-you has it.
  const before = await reviewQueue(KEEPER());
  assert.ok(before.some((r) => r.interruption_id === parked.questionId),
    "mandatory setup: Needs-you shows the parked Work's question before the correction");

  const { opKey } = await correctAndRetire({ document: s.documentId, parked, to: "RM 999.00" });

  // …AND THE ROW DISAPPEARS. That is #885 as shipped, and it is what "the person is told nothing
  // arrives" meant: the retirement cancels the question, so it leaves the list.
  const afterCorrection = await reviewQueue(KEEPER());
  assert.equal(afterCorrection.some((r) => r.interruption_id === parked.questionId), false,
    "the retired Work's question leaves Needs-you");

  // NOW THE LANE RUNS. The successor is admitted under the correction's own key and its OWN run
  // opens the confirmation question — here the run is the fixture's claim + open rather than a
  // live claraWork_v6 engine (this file has no World), and that boundary is stated rather than
  // blurred: what `claraWork.v6.ts` opens, and that it opens BEFORE anything can post, is proved
  // in `packages/runtime/tests/clara-work-v6.test.mjs`. What is proved HERE is the half that is
  // the database's: a question on the successor reaches Needs-you.
  const successor = await admitJournalWork({
    client: A1(), author: KEEPER(), intentKey: opKey, origin: "clara_interpreted",
    basis: basis({ cents: 99900 }),
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });
  await settleRederivation({ opKey, successor: successor.work_id });
  await claimWorkRun({ task: successor.task_id, runId: opk("r1030-succ-run") });
  const asked = await openWorkQuestion({ task: successor.task_id });

  const afterSuccessor = await reviewQueue(KEEPER());
  const row = afterSuccessor.find((r) => r.interruption_id === asked.question_id);
  assert.ok(row, "Needs-you shows the SUCCESSOR's question — the first moment a replacement is real");
  // …ATTRIBUTED TO THE SUCCESSOR, read off the row the surface renders from rather than off
  // whichever envelope key the queue happens to carry the id under (#840 owns that shape).
  const askedRow = await interruptionRow(asked.question_id);
  assert.equal(askedRow.work_id, successor.work_id,
    "…and the question it shows belongs to the successor, not to the Work it replaced");
  assert.equal(askedRow.status, "pending", "…and it is open, so a person can actually answer it");

  noteLane(`r1030.needsyou.shows_the_successor: ${String(parked.questionId).slice(0, 8)} left the list, ${String(asked.question_id).slice(0, 8)} joined it`);
});
