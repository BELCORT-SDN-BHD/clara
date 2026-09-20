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
} from "./work-question-fixtures.mjs";
import {
  filedDocument, ensureClientEgress, mintLegacyInvoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields,
} from "./s6-fixtures.mjs";
import { timelineEvents } from "./work-cancel-fixtures.mjs";

const STEM = "work_source_correction_supersede$";
const EXPECTED_CELLS = 6;

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
cell("w885.feed.successor: the correction's cancellation appears on the Activity feed as one superseded row deep-linked to the Work, after the correction that caused it", async () => {
  const s = await invoiceWithFacts({ client: A1(), totalCents: 88000, tag: "feed" });
  const parked = await workParkedOnDocument({ client: A1(), document: s.documentId });
  const before = await timelineEvents(FIRM_A(), "work.cancelled");

  const receipt = await reviseFact(KEEPER(), {
    document: s.documentId, fieldPath: "invoice.total", value: "RM 899.00", observedVersion: 1,
  });
  const successor = receipt.superseded_work[0].new_work_id;

  // 1 · EXACTLY ONE EVENT, and it carries the link 0199 built the payload for.
  const after = await timelineEvents(FIRM_A(), "work.cancelled");
  const mine = after.filter((e) => e.payload?.work === parked.work_id);
  assert.equal(mine.length, 1, "exactly one work.cancelled event for the retired Work");
  assert.equal(after.length, before.length + 1, "…and exactly one new row in the firm");
  assert.equal(mine[0].payload.outcome, "superseded",
    "…whose outcome is SUPERSEDED, not a bare cancellation");
  assert.equal(mine[0].payload.superseded_by, successor, "…naming the Work that replaced it");
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
