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
  buildWorkWorld, admitJournalWork, claimWorkRun, basis, workRow, mintClientObo,
  wakeRecordJournalEntry, receiptsForWork, settleWorkRun,
} from "./work-journal-fixtures.mjs";
import {
  openWorkQuestion, interruptionRow, answerWorkQuestion, twoFieldAnswer, cancelAgentTask,
  getWorkQuestion,
} from "./work-question-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";
import { timelineEvents } from "./work-cancel-fixtures.mjs";

const STEM = "work_source_correction_supersede$";
const EXPECTED_CELLS = 10;

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
    [["_source_corrected_work", "_lock_source_corrected_work", "_supersede_source_corrected_work",
      "_question_source_corrected", "_fact_value_changed"]]);
  if (fns.rows[0].n !== 5) {
    assert.fail(`0268 ledger row present but only ${fns.rows[0].n}/5 of its routines exist — half-applied migration`);
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

/** The firm's own Activity feed, through its human door (#770's `p_work` arity — this battery's
 *  frontier is far above 0202). */
async function listActivity(sub, { cursor = null, limit = 100, client = null, kinds = null } = {}) {
  const r = await humanQuery(sub,
    "select clara.list_activity($1::text,$2::int,$3::uuid,$4::text[],null::timestamptz,null::timestamptz,null::uuid) as result",
    [cursor, limit, client, kinds]);
  return r.rows[0].result;
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
async function workParkedOnDocument({ client, document, b = null, origin = "user_direct" }) {
  const admitted = await admitJournalWork({
    client, author: KEEPER(), basis: b ?? basis(), origin,
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
cell("w885.supersede.cancels: correcting a fact a parked question cites retires that Work with source_corrected, admits no successor, and closes the question", async () => {
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
  // SECOND FIX ROUND (recheck L09-RC-02): this fixture's basis is the human's OWN (user_direct)
  // and it is STILL not re-admitted. A person who typed the figure printed on the invoice typed
  // the reading that has just moved, so no basis kind survives a correction of the document it
  // stands on — see w885.no_stale_post for the end-to-end measurement.
  assert.equal(entry.replaced, false, "…and NO successor: nothing carries a pre-correction figure");
  assert.equal(entry.new_work_id, null, "…said by id, not only by flag");
  assert.equal(entry.not_replaced_reason, "basis_predates_correction",
    "…with the reason a person is owed: this instruction was stated before the correction");

  // 2 · THE COMMITTED ROWS, re-read rather than trusted.
  const oldRow = await workRow(parked.work_id);
  assert.equal(oldRow.superseded_by, null, "the retired Work points at nothing — there is nothing to point at");
  assert.ok(["stopping", "cancelled"].includes(oldRow.status),
    `the old Work is going away (status ${oldRow.status})`);
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where supersedes = $1", [parked.work_id])).rows[0].n,
  0, "…and nothing was admitted claiming to supersede it");

  // 3 · THE QUESTION IS CLOSED. Nothing can be answered against the reading that moved.
  const q = await interruptionRow(parked.questionId);
  assert.equal(q.status, "cancelled", "the pending question is closed by the cancel cascade");

  noteLane(`w885.supersede.cancels: work ${String(parked.work_id).slice(0, 8)} retired (replaced=${entry.replaced}, ${entry.not_replaced_reason}), old status ${oldRow.status}`);
});

// =============================================================================================
// w885.answer.superseded — THE HALF A PERSON ACTUALLY MEETS, and the narrowness that protects it.
// =============================================================================================
cell("w885.answer.superseded: answering the retired question refuses CLR13 source_corrected, while an ordinary cancel still refuses cancelled", async () => {
  // A · THE CORRECTION'S OWN REFUSAL.
  const s = await invoiceWithFacts({ client: A1(), totalCents: 77000, tag: "answer" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 820.00", observedVersion: 1,
  });
  assert.equal(receipt.superseded_work[0].replaced, false, "mandatory setup: nothing replaced it");

  const err = await caught(() => answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  }));
  assert.ok(err, "answering a question asked against the corrected reading is REFUSED");
  assert.equal(err.code, "CLR13", "…as a convergence, the code every question refusal already uses");
  const d = detailOf(err);
  // SECOND FIX ROUND: the word is SOURCE_CORRECTED, not `cancelled` and not `superseded`. There
  // is no successor to name any more, so the only useful thing the refusal can say is WHAT
  // CHANGED — and that is also the thing the person has to act on.
  assert.equal(d.reason, "source_corrected",
    "…named SOURCE_CORRECTED: the reading this question stands on was corrected");
  assert.ok(d.current.source_corrected_at,
    "…and the refusal carries WHEN it was corrected, so a sentence can be about the document");
  assert.equal(d.current.superseded_by, null, "…with no successor, because none was admitted");
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
    "a cancel with NO source correction still answers `cancelled` — the new word is not a rename");
  assert.equal(d2.current.superseded_by, null, "…and there is no successor to name");
  assert.equal(d2.current.source_corrected_at, null,
    "…and nothing about this Work's own source moved after its question was asked");

  noteLane(`w885.answer.superseded: refusal ${d.reason} at ${d.current.source_corrected_at}; plain cancel refusal ${d2.reason}`);
});

// =============================================================================================
// w885.unrelated.untouched — THE NEGATIVE CONTROL THE BRIEF ASKS FOR BY NAME.
// =============================================================================================
cell("w885.unrelated.untouched: correcting a DIFFERENT document of the same client leaves the parked Work alone and its question answerable", async () => {
  const cited = await invoiceWithFacts({ client: A1(), totalCents: 51000, tag: "cited" });
  const other = await invoiceWithFacts({ client: A1(), totalCents: 52000, tag: "other" });
  assert.notEqual(cited.documentId, other.documentId, "mandatory setup: two different documents");
  const parked = await workParkedOnDocument({ client: A1(), document: cited.documentId });

  const receipt = await reviseFact(KEEPER(), {
    document: other.documentId, fieldPath: "invoice.total", value: "RM 555.00", observedVersion: 1,
  });
  assert.deepEqual(receipt.superseded_work, [],
    "a correction to a document this Work never cited supersedes NOTHING");

  const row = await workRow(parked.work_id);
  assert.equal(row.status, "awaiting_input", "the Work is still parked");
  assert.equal(row.superseded_by, null, "…with no successor");
  assert.equal((await interruptionRow(parked.questionId)).status, "pending",
    "…and its question is still open");

  // THE STRONGEST FORM OF "UNTOUCHED": the question can still be ANSWERED. A cell that only read
  // the rows would pass against a door that closed the question and left the statuses alone.
  const answered = await answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  });
  assert.equal(answered.status, "answered",
    "answering the untouched question still SUCCEEDS — the correction was somebody else's document");
  assert.equal(answered.question_id, parked.questionId);
});

// =============================================================================================
// w885.posted.untouched — #676'S CARVE-OUT, ASSERTED HERE RATHER THAN ASSUMED.
// =============================================================================================
cell("w885.posted.untouched: a Work that already holds a committed receipt is left alone by a correction of the document it posted from", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "posted" });
  const b = basis({ cents: 64000 });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId, b });

  const cred = await mintClientObo({ firm: FIRM_A(), obo: KEEPER(), client: A1() });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: A1(), work: parked.work_id, logicalOpId: parked.logical_op_id, basis: b,
  });
  assert.equal(posted.posted, true, "mandatory setup: the entry really is on the books");
  const receiptsBefore = await receiptsForWork(parked.work_id);
  assert.equal(receiptsBefore.length, 1, "mandatory setup: exactly one committed receipt");
  const rowBefore = await workRow(parked.work_id);
  noteLane(`w885.posted.untouched: after posting, work status ${rowBefore.status}, question ${(await interruptionRow(parked.questionId)).status}`);

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 645.00", observedVersion: 1,
  });
  assert.deepEqual(receipt.superseded_work, [],
    "a Work holding a committed receipt is UNTOUCHED — correcting a posted result is #676's, and docs/PRD.md parks the automation");

  const rowAfter = await workRow(parked.work_id);
  assert.equal(rowAfter.status, rowBefore.status, "its status did not move");
  assert.equal(rowAfter.superseded_by, null, "…nothing superseded it");
  assert.deepEqual(await receiptsForWork(parked.work_id), receiptsBefore,
    "…and its committed receipt is byte-unchanged");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where supersedes = $1", [parked.work_id])).rows[0].n,
  0, "…and no successor was admitted for it");

  // …while the CORRECTION itself still happened. A door that refused the whole call would also
  // leave the Work alone, and that is NOT what the brief asks for.
  assert.ok(receipt.revision_id, "the correction itself was recorded");
  assert.equal(receipt.facts_version, 2, "…and the document's reading really moved");

  // SECOND FIX ROUND (recheck finding L09-RC-03). THE WORK IS LEFT ALONE; THE QUESTION IS NOT
  // ANSWERABLE. The brief carves a posted Work out of the CANCELLATION and the ruling forbids
  // anyone answering a question asked against a corrected reading; both can be true at once, and
  // before this round only the first was. MEASURED before the fix: clara.answer_work_question
  // returned {status:'answered'} against a document whose reading had just moved.
  const stale = await caught(() => answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  }));
  assert.ok(stale, "the question about the corrected document is NOT answerable");
  assert.equal(stale.code, "CLR13", "…refused as a convergence, the code every question refusal uses");
  const sd = detailOf(stale);
  assert.equal(sd.reason, "source_corrected",
    "…and the refusal SAYS the source was corrected, rather than a word about the Work's state");
  assert.equal(sd.current.work_id, parked.work_id, "…beside the Work it is about");
  assert.equal((await interruptionRow(parked.questionId)).status, "pending",
    "the question is still PENDING — nothing was cancelled; it is the ANSWER that is refused");
  assert.equal((await workRow(parked.work_id)).status, rowBefore.status,
    "…and the posted Work itself is still untouched, which is the carve-out");

  // THIRD FIX ROUND (recheck finding L09-RC2-03). The sentence this person meets has to name an
  // exit that WORKS, and on this arm the restatement door does not: a Work holding a committed
  // receipt reads as completed to `clara.restate_accounting_work`. The record carries the fact
  // the surface needs to tell the two arms apart, so the copy and the offered controls can agree
  // with what the doors really allow.
  const rec = await getWorkQuestion(KEEPER(), parked.questionId);
  assert.equal(rec.work_posted, true,
    "the shared question record says this Work has already posted");
  assert.ok(rec.source_corrected_at,
    "…and that its source was corrected after the question was asked");
});

// =============================================================================================
// w885.no_stale_post — THE RULING'S SECOND HALF, MEASURED AS AN ABSENCE.
//
// "Re-admitted ON THE CORRECTED FACTS" has exactly one honest reading at the SQL seam: a basis
// nobody has re-derived from the corrected document is not the corrected facts, whoever first
// stated it. The first fix round applied that to a `clara_interpreted` basis and let a
// `user_direct` one through, and the recheck MEASURED the consequence end to end (L09-RC-02):
// the successor's basis_digest was byte-identical to the retired Work's, posting the CORRECTED
// RM 999.00 under it was refused CLR10 basis_mismatch, and posting the RETIRED RM 640.00 was
// ACCEPTED and evidence-linked to the corrected document.
//
// A human's stated figure is not exempt: this fixture's 64000 cents is exactly the figure printed
// on the document before the correction, and a person who typed it typed what they read. So no
// arm re-admits, and this cell states the property as an ABSENCE over every Work the door TOUCHED
// or CREATED rather than over the one it happened to name — the only form that cannot be
// satisfied by moving the stale figure somewhere else.
//
// BOTH FIGURES ARE LITERALS FROM THE FIXTURE DOCUMENT: RM 640.00 before the correction, RM 999.00
// after it, neither recomputed the way the code computes it.
// =============================================================================================
cell("w885.no_stale_post: after a correction NO Work the door touched or created can post the pre-correction figure", async () => {
  const BEFORE_CENTS = 64000;          // RM 640.00, what the document said
  const AFTER_CENTS = 99900;           // RM 999.00, what it says now
  const s = await invoiceWithFacts({ client: A1(), totalCents: BEFORE_CENTS, tag: "nostale" });
  const b = basis({ cents: BEFORE_CENTS });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId, b, origin: "user_direct" });
  const before = await workRow(parked.work_id);
  assert.equal(before.basis_origin, "user_direct",
    "mandatory setup: the arm the first fix round left open — a human's OWN stated instruction");
  assert.equal(before.basis.lines[0].debit_cents, BEFORE_CENTS,
    "mandatory setup: the admitted basis carries the figure the document printed");

  // The instant the correction starts, so the absence below names rows THIS correction could
  // have admitted rather than every row on a rig that is never reset (a sibling cell posts the
  // same fixture cents).
  const since = (await rootQuery("select now() as t")).rows[0].t;
  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 999.00", observedVersion: 1,
  });
  assert.equal(receipt.facts_version, 2, "the human's correction still commits — that is never traded away");
  assert.equal(receipt.superseded_work.length, 1, "…and it names the one Work it retired");
  const entry = receipt.superseded_work[0];
  assert.equal(entry.work_id, parked.work_id);
  assert.equal(entry.replaced, false, "NO successor: nothing carries a figure nobody re-derived");
  assert.equal(entry.new_work_id, null, "…and the receipt says so by id, not only by flag");
  assert.equal(entry.not_replaced_reason, "basis_predates_correction",
    "…with the reason a person is owed: this instruction was stated before the correction");

  // THE ABSENCE, over every Work this correction could have left behind.
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where supersedes = $1", [parked.work_id])).rows[0].n,
  0, "no successor row points back at the retired Work");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1 and basis_digest = $2 and created_at >= $3",
    [A1(), before.basis_digest, since])).rows[0].n,
  0, "…and the correction admitted NO Work carrying the retired figure");

  // …AND NOT ONE OF THEM CAN POST THE STALE FIGURE. Driven, not inferred: the retired Work is the
  // only one the door touched, and the wake door refuses it.
  const cred = await mintClientObo({ firm: FIRM_A(), obo: KEEPER(), client: A1() });
  const refused = await caught(() => wakeRecordJournalEntry(cred.secret, {
    client: A1(), work: parked.work_id, logicalOpId: parked.logical_op_id, basis: b,
  }));
  assert.ok(refused, "posting the pre-correction figure under the retired Work is refused");

  // THE LEDGER ITSELF, which is what the ruling is ultimately about: nothing of the pre-correction
  // figure is on the books against this document.
  const posted = await rootQuery(
    "select count(*)::int as n from clara.journal_lines jl"
    + " join clara.entry_evidence_links el on el.entry_id = jl.entry_id"
    + " where el.document_id = $1 and (jl.debit_cents = $2 or jl.credit_cents = $2)",
    [s.documentId, BEFORE_CENTS]);
  assert.equal(posted.rows[0].n, 0,
    "NO journal line of the pre-correction figure is evidence-linked to the corrected document");
  const liveRead = await rootQuery(
    "select rg.monetary_cents from clara.document_regions rg"
    + " join clara.document_extractions de on de.id = rg.extraction_id"
    + " where de.document_id = $1 and rg.field_path = 'invoice.total'"
    + " and de.superseded_by is null and de.status = 'done'"
    + " order by de.version_n desc limit 1", [s.documentId]);
  assert.equal(Number(liveRead.rows[0].monetary_cents), AFTER_CENTS,
    "…while the document's own live reading really is the corrected figure");

  noteLane("w885.no_stale_post: retired " + String(parked.work_id).slice(0, 8)
    + ", replaced=" + entry.replaced + ", reason " + entry.not_replaced_reason);
});

// =============================================================================================
// w885.noop.refused — A KEYSTROKE IS NOT A CORRECTION (third fix round, recheck L09-RC2-02).
//
// `clara.revise_document_fact` had no unchanged-value guard, so re-typing the value that is
// already there was accepted, wrote a revision row whose prior_value and new_value are identical,
// RETIRED every parked Work standing on the document, and made a carved-out question permanently
// unanswerable -- `clara._question_source_corrected` keys on the EXISTENCE of a revision row and
// max(recorded_at) can never fall back below the question's created_at.
//
// WHAT 'UNCHANGED' MEANS HERE, and it is the stored value rather than the keystrokes: for a
// monetary fact the NORMALISED cents, for any other the trimmed text. So 'RM 880.00' typed over
// 'RM 880.00' is refused, and so is '880.00' -- same figure, different spelling -- while a real
// change of the figure is admitted exactly as before. The correcting door and
// `clara._question_source_corrected` ask the SAME helper, so they cannot disagree about what a
// correction is.
// =============================================================================================
cell("w885.noop.refused: re-typing the value that is already there is refused, retires nothing, and leaves every question answerable", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 88000, tag: "noop" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const before = await workRow(parked.work_id);
  assert.equal(before.status, "awaiting_input", "mandatory setup: the Work really is parked");

  // 1 · THE SAME TEXT, VERBATIM.
  const same = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 880.00", observedVersion: 1,
  }));
  assert.ok(same, "re-typing the value already on the document is REFUSED");
  assert.equal(same.code, "CLR10", "…as a payload refusal, not a convergence");
  assert.equal(detailOf(same).reason, "value_unchanged", "…named for what it is");

  // 2 · THE SAME FIGURE, A DIFFERENT SPELLING. The stored value is what counts, so this is the
  //     same no-op and gets the same refusal.
  const spelled = await caught(() => reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "880.00", observedVersion: 1,
  }));
  assert.ok(spelled, "…and so is the same figure typed differently");
  assert.equal(detailOf(spelled).reason, "value_unchanged");

  // 3 · NOTHING HAPPENED. No revision row, no retirement, no source-corrected verdict.
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.document_fact_revisions where document_id = $1", [s.documentId])).rows[0].n,
  0, "no revision row was written at all");
  const after = await workRow(parked.work_id);
  assert.equal(after.status, before.status, "the parked Work is untouched");
  assert.equal(after.superseded_by, null);
  assert.equal((await interruptionRow(parked.questionId)).status, "pending", "…and its question is still open");
  const rec = await getWorkQuestion(KEEPER(), parked.questionId);
  assert.equal(rec.source_corrected_at, null,
    "…and the record does not read as source-corrected: a keystroke is not a correction");

  // 4 · …AND THE QUESTION IS STILL ANSWERABLE, which is the consequence a person meets.
  const answered = await answerWorkQuestion(KEEPER(), {
    question: parked.questionId, version: 1, answer: twoFieldAnswer(),
  });
  assert.equal(answered.status, "answered", "the question a no-op could not corrupt is answered normally");

  // 5 · THE CONTROL: a REAL change of the same field, on the same document, still commits.
  const real = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 999.00", observedVersion: 1,
  });
  assert.equal(real.facts_version, 2, "a genuine correction is admitted exactly as before");

  noteLane("w885.noop.refused: same value refused " + detailOf(same).reason
    + ", same figure respelled refused " + detailOf(spelled).reason + ", real change facts_version " + real.facts_version);
});

// =============================================================================================
// w885.terminal_residue.ignored — A DEAD QUESTION ON A DEAD WORK MUST NOT BLOCK A CORRECTION.
//
// THE PAIR IS FORCED, AND SAID SO OUT LOUD. Every door that terminalises a Work also closes its
// pending question (the S4-D6 cascade `clara.settle_work_run` and `clara.cancel_accounting_work`
// both carry), so the estate has no door that produces "terminal Work + pending question". It is
// still reachable CODE — a crash between two writes, an operator repair, a future door — and if
// this file's rule did not exclude it, a professional's correction would be refused by
// `clara.restate_accounting_work`'s own `not_restatable` arm for a row nobody is waiting on. So
// the row is minted by the REAL verbs and only its `status` is forced back as root, which is the
// same idiom (and the same statement of it) `work-cancel.test.mjs` wc.1 uses for the mirror pair.
// =============================================================================================
cell("w885.terminal_residue.ignored: a pending question left on a TERMINAL Work is not restated, and the correction still succeeds", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 33000, tag: "residue" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  await settleWorkRun({ task: parked.task_id, outcome: "failed", errorCode: "internal",
    error: { code: "internal", message: "#885 rig: forced terminal" } });
  const dead = await workRow(parked.work_id);
  assert.equal(dead.status, "failed", "mandatory setup: the Work is terminal");
  // The settle cascade closed the real question, and `clara._tf_agent_interruption_*` refuses
  // cancelled -> pending even to the superuser (MEASURED: "illegal interruption transition
  // cancelled -> pending"), which is exactly why the residue has to be PLANTED as a fresh row
  // rather than forced on the old one.
  const planted = (await rootQuery(
    `insert into clara.agent_interruptions(firm_id, client_id, task_id, work_id, hook_token,
        question, fields, expires_at, question_version)
     select i.firm_id, i.client_id, i.task_id, i.work_id, $2, i.question, i.fields,
            now() + interval '7 days', i.question_version + 1
       -- one version above the real one: uq_agent_interruptions_work_version is (work_id,
       -- question_version) and the settled row still holds version 1.
       from clara.agent_interruptions i where i.id = $1 returning id`,
    [parked.questionId, opk("w885-residue")])).rows[0].id;
  const residue = await interruptionRow(planted);
  assert.equal(residue.status, "pending", "mandatory setup: the forced residue is in place");
  assert.equal(residue.work_id, parked.work_id, "…and it really names the terminal Work");

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 335.00", observedVersion: 1,
  });
  assert.deepEqual(receipt.superseded_work, [],
    "a terminal Work is not restated — the rule names the three statuses a restatement is offered from");
  assert.ok(receipt.revision_id,
    "…and the correction itself SUCCEEDS: residue on a dead Work never refuses a professional's correction");
  assert.equal((await workRow(parked.work_id)).status, "failed", "the dead Work is unmoved");
});

// =============================================================================================
// w885.feed.successor — THE CANCELLATION IS ON THE FEED, WITH ITS SUCCESSOR LINK (#840).
// =============================================================================================
cell("w885.feed.successor: the correction's cancellation appears on the Activity feed as exactly one row deep-linked to the Work, after the correction that caused it", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 88000, tag: "feed" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const before = await timelineEvents(FIRM_A(), "work.cancelled");

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 899.00", observedVersion: 1,
  });
  assert.equal(receipt.superseded_work[0].replaced, false,
    "mandatory setup: the correction retires and admits nothing (second fix round)");

  // 1 · EXACTLY ONE EVENT, and it carries what 0199 built the payload for.
  const after = await timelineEvents(FIRM_A(), "work.cancelled");
  const mine = after.filter((e) => e.payload?.work === parked.work_id);
  assert.equal(mine.length, 1, "exactly one work.cancelled event for the retired Work");
  assert.equal(after.length, before.length + 1, "…and exactly one new row in the firm");
  // SECOND FIX ROUND: the outcome is 0199's own `cancelled` and there is no successor to name,
  // because the correcting door no longer admits one. WHY it was retired is on the cancellation's
  // op key (source_corrected:<revision>:<work>) and on the correction's receipt and audit row —
  // a derived key, not a first-class reason, which is the remainder this lane records.
  assert.equal(mine[0].payload.outcome, "cancelled",
    "…whose outcome is 0199's own word: nothing superseded this Work");
  assert.equal(mine[0].payload.superseded_by, null, "…and there is no successor to name");
  const key = (await rootQuery(
    "select op_key from clara.op_receipts where firm_id = $1 and op_key like $2",
    [FIRM_A(), 'source_corrected:' + receipt.revision_id + ':' + parked.work_id])).rows;
  assert.equal(key.length, 1, "…while the cancellation's own op key records the correction that caused it");
  assert.equal(mine[0].payload.from_status, "awaiting_input",
    "…and the status the correction FOUND: the Work was waiting on the question");
  assert.equal(mine[0].actor, KEEPER(), "…attributed to the human who made the correction");

  // 2 · THE FEED'S OWN DOOR renders it under `work`, deep-linked to the retired Work.
  const feed = await listActivity(KEEPER(), { kinds: ["work"], limit: 200 });
  const row = feed.rows.filter((r) => r.event_type === "work.cancelled" && r.work_id === parked.work_id);
  assert.equal(row.length, 1, "the cancellation lists under the `work` filter");
  assert.equal(row[0].kind, "work");

  // 3 · THE CAUSE COMES FIRST. The feed is ordered by seq, so a reader meets the correction and
  // only then the Work it retired — never a Work retired for a reason not yet recorded.
  const revised = (await rootQuery(
    `select seq from clara.domain_events
      where firm_id=$1 and event_type='document.fact_revised' and payload->>'revision_id'=$2`,
    [FIRM_A(), receipt.revision_id])).rows;
  assert.equal(revised.length, 1, "the correction appended exactly one document.fact_revised");
  const cancelledSeq = (await rootQuery(
    `select seq from clara.domain_events
      where firm_id=$1 and event_type='work.cancelled' and payload->>'work'=$2`,
    [FIRM_A(), parked.work_id])).rows[0];
  assert.ok(Number(revised[0].seq) < Number(cancelledSeq.seq),
    "the correction is appended BEFORE the cancellation it caused");
});

// =============================================================================================
// w885.interpreted.not_carried — THE FIX-ROUND BLOCKER (review finding L09-ADV-01).
//
// A `clara_interpreted` basis is not an instruction a human gave: it is what Clara DERIVED from
// the reading that has just been corrected. Re-admitting it verbatim would hand the successor an
// instruction that is now false, and `clara._record_journal_entry_core` compares the posted basis
// against `basis_digest` — so the successor could post the PRE-CORRECTION figure against the
// corrected document, and nothing else in the estate compares the two. The split is the estate's
// own: `clara.take_over_accounting_work` (0184's BASIS GATE) already treats `user_direct` as
// carryable and anything else as needing confirmation.
//
// THE RULING'S NON-NEGOTIABLE HALF STILL HOLDS: the Work is retired and the question dies. What is
// withheld is the SUCCESSOR, and the receipt says so by name rather than silently.
// =============================================================================================
cell("w885.interpreted.not_carried: a Work whose basis Clara DERIVED from the corrected document is retired with NO successor, and nothing new carries the retired figure", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 64000, tag: "interp" });
  const b = basis({ cents: 64000 });
  const parked = await workParkedOnDocument({
    client: A1(), document: s.documentId, b, origin: "clara_interpreted",
  });
  const before = await workRow(parked.work_id);
  assert.equal(before.basis_origin, "clara_interpreted", "mandatory setup: the basis is Clara's own reading");
  assert.equal(before.status, "awaiting_input", "mandatory setup: the Work really is parked");

  // The instant the correction starts, so the "nothing new carries the retired figure" assertion
  // below can name rows THIS correction admitted rather than every row on the rig that happens to
  // share a fixture digest (a sibling cell posts the same cents, and this rig is not reset).
  const since = (await rootQuery("select now() as t")).rows[0].t;
  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 999.00", observedVersion: 1,
  });

  // 1 · THE CORRECTION COMMITS. A refusal would be the ADV-03 regression, not a fix.
  assert.ok(receipt.revision_id, "the human's correction itself succeeds");
  assert.equal(receipt.facts_version, 2, "…and the document's reading really moved");

  // 2 · THE RECEIPT NAMES THE WITHHELD SUCCESSOR, rather than reporting a replacement that is not
  // there or reporting nothing at all.
  assert.equal(receipt.superseded_work.length, 1, "the parked Work is named on the receipt");
  const entry = receipt.superseded_work[0];
  assert.equal(entry.work_id, parked.work_id);
  assert.equal(entry.reason, "source_corrected", "…retired BY the correction");
  assert.equal(entry.replaced, false, "…and NOT replaced");
  assert.equal(entry.new_work_id, null, "…so there is no successor id to carry");
  assert.equal(entry.not_replaced_reason, "interpreted_basis",
    "…and the reason is the basis origin, said by name");

  // 3 · THE COMMITTED ROWS. The Work is going away, nothing points at a successor, and — the
  // load-bearing one — NO new Work anywhere carries the retired instruction.
  const oldRow = await workRow(parked.work_id);
  assert.ok(["stopping", "cancelled"].includes(oldRow.status), "the old Work is going away, status " + oldRow.status);
  assert.equal(oldRow.superseded_by, null, "…with no successor stamped on it");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where supersedes = $1", [parked.work_id])).rows[0].n,
  0, "…and no Work was admitted claiming to supersede it");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1 and basis_digest = $2 and created_at >= $3",
    [A1(), oldRow.basis_digest, since])).rows[0].n,
  0, "…and the correction admitted NO new Work carrying the retired figure: the pre-correction basis cannot be posted");

  // 4 · AND THE QUESTION IS DEAD ANYWAY — the half of the ruling that is not negotiable.
  assert.equal((await interruptionRow(parked.questionId)).status, "cancelled",
    "the stale question is closed even though no successor was admitted");

  noteLane("w885.interpreted.not_carried: work " + String(parked.work_id).slice(0, 8)
    + " retired, replaced=" + entry.replaced + ", reason " + entry.not_replaced_reason);
});

// =============================================================================================
// w885.sibling_posted.commits — THE FIX-ROUND REGRESSION (review finding L09-ADV-03).
//
// `clara.revise_document_fact` is a HUMAN door with its own floor. Before this fix a SIBLING
// Work's posting made `clara.admit_journal_work` refuse the successor (`source_already_posted`,
// one document one posted entry) and that refusal propagated out of the correcting door — so a
// bookkeeper correcting what a document SAYS was told about an entry they were not acting on and
// given no way forward. The correction now always commits; a Work the restatement door will not
// replace is retired and the door's own refusal reason is reported on the receipt.
// =============================================================================================
cell("w885.sibling_posted.commits: a SIBLING Work's posted entry no longer refuses the correction — the parked Work is retired and the door's refusal is reported", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 71000, tag: "sibling" });
  const bPosted = basis({ cents: 71000 });
  const bParked = basis({ cents: 71500 });

  // W1 and W2 both stand on the SAME document; W2 parks on a question, W1 posts.
  const poster = await admitJournalWork({
    client: A1(), author: KEEPER(), basis: bPosted,
    sourceRefs: [{ kind: "document", document_id: s.documentId }],
  });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId, b: bParked });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: KEEPER(), client: A1() });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: A1(), work: poster.work_id, logicalOpId: poster.logical_op_id, basis: bPosted,
  });
  assert.equal(posted.posted, true, "mandatory setup: the SIBLING Work really posted");
  assert.equal((await receiptsForWork(parked.work_id)).length, 0,
    "mandatory setup: the PARKED Work holds no receipt of its own — it is inside the rule");

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 712.00", observedVersion: 1,
  });

  // 1 · THE CORRECTION COMMITS. This is the whole finding: it used to raise CLR13
  // `source_already_posted` and leave facts_version at 1.
  assert.ok(receipt.revision_id, "the bookkeeper's correction is not hostage to a sibling Work");
  assert.equal(receipt.facts_version, 2, "…and the document's reading really moved");

  // 2 · THE PARKED WORK IS RETIRED, and the door's own refusal is the reported reason.
  assert.equal(receipt.superseded_work.length, 1, "exactly the one parked Work");
  const entry = receipt.superseded_work[0];
  assert.equal(entry.work_id, parked.work_id);
  assert.equal(entry.replaced, false, "…not replaced");
  assert.equal(entry.new_work_id, null);
  // SECOND FIX ROUND: the restatement door is not consulted at all any more, so the reason is
  // the basis one. The PROPERTY this cell protects is unchanged and now structural: a sibling's
  // posted entry cannot refuse a bookkeeper's correction, because nothing in this path can raise
  // that refusal.
  assert.equal(entry.not_replaced_reason, "basis_predates_correction",
    "…and the reason is about THIS Work's basis, never about a sibling's posting");
  const oldRow = await workRow(parked.work_id);
  assert.ok(["stopping", "cancelled"].includes(oldRow.status), "the parked Work is going away, status " + oldRow.status);
  assert.equal((await interruptionRow(parked.questionId)).status, "cancelled",
    "…and its question is closed: the ruling's non-negotiable half survives the refusal");

  // 3 · THE POSTED SIBLING IS UNTOUCHED — carve-out (c), re-asserted under this new arm.
  const posterRow = await workRow(poster.work_id);
  assert.equal(posterRow.superseded_by, null, "the posted sibling is not superseded");
  assert.equal((await receiptsForWork(poster.work_id)).length, 1, "…and its committed receipt stands");

  noteLane("w885.sibling_posted.commits: correction committed to facts_version " + receipt.facts_version
    + "; parked work retired, reason " + entry.not_replaced_reason);
});
