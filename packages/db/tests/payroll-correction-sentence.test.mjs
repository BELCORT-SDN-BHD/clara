// Battery for migration 0360_payroll_correction_sentences.sql — #1056 FIX ROUND: THE TWO
// SENTENCES A PAYROLL CORRECTION LEAVES BEHIND.
//
// Spec of record: issue #1056's Agent Brief plus the review round of 2026-09-25 against 0344
// (ADV-L05-01 major, SPEC-1056-A minor). 0344 is the subject those findings are about; this file
// is about the two strings 0360 corrects, and it drives them through the SAME public seams the
// 0344 battery uses — no new seam is invented for a sentence.
//
//   S3c. THE SENTENCE A PERSON READS — clara.list_review_queue(jsonb,jsonb,integer), read as a
//        human through the real door. The Needs-you row renders clara._payroll_posting_verdict's
//        own sentence verbatim (0297 §H), so the queue is where a sentence is true or false, not
//        the verdict's return value. Every cell here reads the words off the QUEUE.
//   S6b. THE ALREADY-STANDING-ENTRY REFUSAL — clara.revise_document_fact(...), driven as a
//        bookkeeper, with an entry bound to the document that is NOT the payroll acquisition.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool } from "./rig-helpers.mjs";
import {
  buildWorld, reverseEntry, draftEntry, approveEntry, freshResolution, human,
} from "./rig-fixtures.mjs";
import { listReviewQueue } from "./wave-a-reads.mjs";
import {
  readPayrollDoc, seedPayrollChart, verdictOf, value, opk,
} from "./payroll-fact-revision-fixtures.mjs";

const STEM = "payroll_correction_sentences$";

let live = false;
let world = null;

before(async () => {
  const applied = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM])).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_CORRECTION_SENTENCES === "1") {
      console.warn("SKIP payroll-correction-sentence: the 0360 cohort is not applied (explicit pre-integration run).");
      return;
    }
    assert.fail(
      "payroll-correction-sentence is required for a focused run: apply "
      + "0360_payroll_correction_sentences.sql. Preload "
      + "./tests/payroll-correction-sentence-preintegration-gate.mjs for an estate sweep against a "
      + "chain that predates it.");
  }
  live = true;
  world = await buildWorld();
});

after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  t.skip("payroll-correction-sentence cohort absent -- explicit pre-integration run");
  return true;
}

async function reviseFact(sub, { document, fieldPath, value: v, observedVersion,
    reason = "#1056 fix rig: the reader misread the printed figure", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.revise_document_fact(p_document => $1, p_field_path => $2, p_value => $3::jsonb,
       p_observed_version => $4, p_reason => $5, p_op_key => $6) as r`,
    [document, fieldPath, JSON.stringify(v), observedVersion, reason, opKey ?? opk("fixfact")]);
  return r.rows[0].r;
}

function refusal(err) {
  let detail = {};
  try { detail = JSON.parse(err.detail); } catch { detail = {}; }
  return { code: err.code, reason: detail.reason, detail };
}

/** The Needs-you row this document raises, read through the human door a person's screen reads. */
async function blockedRow(sub, client, document) {
  const env = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 200 });
  return env.rows.find((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === document)
    ?? null;
}

/** A run the gate blocks because the two channels read the gross differently — #1056's own first
 *  named case, and the one road to a CORRECTED `ready`. */
async function blockedRun(month) {
  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    month,
    answers: { "payroll.run.gross_pay": value("5,050.00") },
    visionAnswers: { "payroll.run.gross_pay": value("5,000.00") },
  });
  const v = await verdictOf(doc.documentId);
  assert.equal(v.verdict, "blocked", `mandatory setup: the run did not post (${JSON.stringify(v.reason)})`);
  assert.equal(v.rung, "channels_agree", "…and stopped on the disagreement, not on something else");
  return doc;
}

const entriesOf = async (document) =>
  (await rootQuery(
    `select id, status, posting_date::text as posting_date, memo, flags, reversed_by
       from clara.journal_entries where document_id=$1 order by created_at`, [document])).rows;

// ---------------------------------------------------------------------------------------------
// S3c — the corrected run's own sentence
// ---------------------------------------------------------------------------------------------

test("S3c · a corrected run is no longer told to re-file: the Needs-you row says nothing will post it and names an act that keeps the correction", async (t) => {
  if (gate(t)) return;

  const doc = await blockedRun("2027-01");
  const before = await blockedRow(world.users.alice, world.clients.A1, doc.documentId);
  assert.ok(before, "mandatory setup: the blocked run is on the queue");
  assert.match(before.question_text, /disagree/i, `…naming the disagreement: ${before.question_text}`);

  await reviseFact(world.users.alice, {
    document: doc.documentId, fieldPath: "payroll.run.gross_pay",
    value: "5,000.00", observedVersion: 1,
  });

  // THE MEASURED TRUTH, RECORDED RATHER THAN WISHED AWAY: the verdict clears, nothing posts, and
  // the row does NOT clear — its WHERE clause never asks the verdict. What 0360 changes is the
  // sentence that row then shows.
  const after = await verdictOf(doc.documentId);
  assert.equal(after.verdict, "ready", "the correction re-derived the gate off the corrected figure");
  assert.deepEqual(await entriesOf(doc.documentId), [], "…and nothing posted it");

  const row = await blockedRow(world.users.alice, world.clients.A1, doc.documentId);
  assert.ok(row, "the row stands: a cleared block is not an entry, and only an entry retires it");
  assert.doesNotMatch(row.question_text, /re-file the payslip to post it/,
    `the person is NOT sent to the one act that discards the correction: ${row.question_text}`);
  assert.match(row.question_text, /nothing will post it/,
    "…the row says plainly that no unattended post is coming");
  assert.match(row.question_text, /re-filing reads the page afresh without that correction/,
    "…and why re-filing is the wrong move here, rather than leaving a person to find out");
  assert.match(row.question_text, /Book this month by hand from the corrected figures/,
    "…and names the act that keeps the correction");
  assert.match(row.question_text, /January 2027/, "…for the month the payslip covers");
});

test("S3c · a machine-read run that is ready for a reason nobody typed keeps 0297's own sentence, to the byte", async (t) => {
  if (gate(t)) return;

  // THE CONTROL that makes the cell above a BRANCH rather than a blanket rewrite. A clean run
  // posts itself; reversing its entry puts the same document back at `ready` with NO live entry
  // and NO human declaration anywhere in the reading — 0297's own road to this sentence, which
  // 0360 must leave exactly as it was.
  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { month: "2027-02" });
  assert.equal(doc.receipt.posting?.posted, true,
    `mandatory setup: the clean run posted itself (${JSON.stringify(doc.receipt.posting)})`);
  const posted = (await entriesOf(doc.documentId)).find((e) => e.status === "approved");

  await reverseEntry(world.users.alice, {
    entry: posted.id, reason: "#1056 fix rig: taking the entry down to re-open the month",
    opKey: opk("fixrev"),
  });

  const v = await verdictOf(doc.documentId);
  assert.equal(v.verdict, "ready", "a reversal re-opens the month (0297:697)");
  assert.equal((await rootQuery(
    "select (envelope->'payroll_state'->'human_declared') as hd from clara.document_extractions where document_id=$1 and engine_kind='payroll_text_facts' order by version_n desc limit 1",
    [doc.documentId])).rows[0].hd, null,
    "mandatory setup: nobody declared anything on this reading");

  const row = await blockedRow(world.users.alice, world.clients.A1, doc.documentId);
  assert.ok(row, "the reversed run is back on the queue");
  assert.equal(row.question_text,
    "Payroll run February 2027 is ready to post but no entry exists yet -- re-file the payslip to post it.",
    "0297's sentence is untouched on its own road: re-filing here reads the page afresh and posts, and discards nothing");
});

// ---------------------------------------------------------------------------------------------
// S6b — the refusal names what it found
// ---------------------------------------------------------------------------------------------

test("S6b · an entry that is NOT the payroll acquisition still blocks the revision, and the refusal no longer calls it the payroll run", async (t) => {
  if (gate(t)) return;

  const doc = await blockedRun("2027-03");
  assert.deepEqual(await entriesOf(doc.documentId), [],
    "mandatory setup: the blocked run booked nothing, so anything found is not the acquisition");

  // A MANUAL JOURNAL that merely CITES this payslip as evidence — the ordinary act the probe
  // admits and the old sentence misdescribed. It is raised against no document at all; the
  // binding is the evidence link, which clara._document_posting_entry ranks FIRST.
  // (clara.attach_entry_evidence refuses a draft entry in those words — measured here by
  // approving first, which is why this cell's entry is approved and still not a payroll run.)
  const resolution = await freshResolution(world.users.alice, world.clients.A1);
  const drafted = await draftEntry(human(world.users.alice), {
    client: world.clients.A1,
    resolution,
    postingDate: "2027-03-31",
    memo: "March 2027 accrual, raised by hand and citing the payslip as evidence",
    lines: [
      { account_code: "6000", debit_cents: 100000, credit_cents: 0, description: "wages" },
      { account_code: "2040", debit_cents: 0, credit_cents: 100000, description: "payable" },
    ],
    opKey: opk("manual-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1",
    [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, {
    entry: drafted.entry_id, expectedRevision: token, opKey: opk("manual-approve"),
  });
  const approvedToken = (await rootQuery(
    "select revision_token from clara.journal_entries where id=$1", [drafted.entry_id]))
    .rows[0].revision_token;
  await humanQuery(world.users.alice,
    `select clara.attach_entry_evidence(p_entry => $1, p_document => $2,
       p_expected_revision => $3, p_op_key => $4) as r`,
    [drafted.entry_id, doc.documentId, approvedToken, opk("manual-evidence")]);
  assert.deepEqual(await entriesOf(doc.documentId), [],
    "the entry is bound by its evidence link alone: journal_entries.document_id is still null for this document");

  await assert.rejects(
    () => reviseFact(world.users.alice, {
      document: doc.documentId, fieldPath: "payroll.run.gross_pay",
      value: "5,000.00", observedVersion: 1,
    }),
    (e) => {
      const r = refusal(e);
      assert.equal(r.code, "CLR10");
      assert.equal(r.reason, "live_entry_present",
        "the reason names what the probe measures -- 0217's live_bank_statement_present shape");
      assert.equal(r.detail.entry_id, drafted.entry_id, "…pointing at the entry it actually found");
      assert.equal(r.detail.is_payroll_run, false,
        "…and disclosing that this is NOT the payroll acquisition, which is the whole correction");
      assert.doesNotMatch(e.message, /this payroll run is already posted/,
        `the sentence no longer asserts what was never measured: ${e.message}`);
      assert.match(e.message, /an entry already stands on this document/);
      assert.match(e.message, /reverse that entry/,
        "…and names the one act that takes it down: a reversal also releases every live evidence link it carries");
      return true;
    });
});

test("S6b · the payroll acquisition's own refusal says so, so the correction did not cost the caller the fact it had", async (t) => {
  if (gate(t)) return;

  // THE CONTROL: the same refusal on the run 0344 was written for. `is_payroll_run` is what lets a
  // surface keep saying "this payroll run is already posted" when that IS what was found.
  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { month: "2027-04" });
  assert.equal(doc.receipt.posting?.posted, true, "mandatory setup: the clean run posted itself");
  const posted = (await entriesOf(doc.documentId)).find((e) => e.status === "approved");

  await assert.rejects(
    () => reviseFact(world.users.alice, {
      document: doc.documentId, fieldPath: "payroll.run.gross_pay",
      value: "5,100.00", observedVersion: 1,
    }),
    (e) => {
      const r = refusal(e);
      assert.equal(r.reason, "live_entry_present");
      assert.equal(r.detail.entry_id, posted.id);
      assert.equal(r.detail.status, "approved");
      assert.equal(r.detail.is_payroll_run, true,
        "the acquisition IS a payroll run, and the detail says so in the same key");
      return true;
    });
});
