// Battery for migration 0344_payroll_fact_revision.sql — #1056: A PERSON CORRECTS A MISREAD
// PAYROLL FACT THROUGH THE DOCUMENT REVISE CONTROL.
//
// Spec of record: issue #1056's Agent Brief (the body; the issue carries no comment, so nothing
// later than the body binds). Parent #945 shipped the payroll READING (migration 0296) and #946
// the unattended POST (0297); this closes the one thing neither gave a person — a way to correct
// a figure the reader took wrong.
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S1. THE CLOSED PREDICATE — clara._revisable_fact_lane(text). The brief's own first key
//       interface: "the closed predicate that decides which field paths are revisable … or a
//       sibling predicate needs to exist". It is the SIBLING arm: it answers WHICH LANE a path
//       belongs to, asking clara._revisable_invoice_field for the invoice arm rather than
//       widening it, so neither closed set learns the other's members.
//   S2. THE HUMAN DOOR — clara.revise_document_fact(uuid,text,jsonb,int,text,text), driven as a
//       bookkeeper through humanQuery. A payroll run question is admitted, lands in the PAYROLL
//       facts chain (never the invoice one), and carries the other ten questions forward.
//   S3. THE POSTING VERDICT — clara._payroll_posting_verdict(uuid), the brief's own second key
//       interface. It is STABLE and derived, so what a correction does to it is measured by
//       asking it before and after.
//   S4. THE LINEAGE READ — clara.list_source_revisions(uuid), the read the document surface takes
//       its facts version from. A payroll document's version is the PAYROLL chain's.
//   S5. THE AUDIT TRAIL — clara.document_fact_revisions, read as COMMITTED rows (AC3: who
//       revised, when, what the prior value was).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import {
  readPayrollDoc, seedPayrollChart, bankedState, verdictOf, payrollExtractionsOf, regionsOf,
  value, opk, RUN_FIELDS,
} from "./payroll-fact-revision-fixtures.mjs";

const STEM = "payroll_fact_revision$";

let live = false;
let world = null;

before(async () => {
  const applied = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM])).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_FACT_REVISION === "1") {
      console.warn("SKIP payroll-fact-revision: the 0344 cohort is not applied (explicit pre-integration run).");
      return;
    }
    assert.fail(
      "payroll-fact-revision is required for a focused run: apply "
      + "0344_payroll_fact_revision.sql. Preload ./tests/payroll-fact-revision-preintegration-gate.mjs "
      + "for an estate sweep against a chain that predates it.");
  }
  live = true;
  world = await buildWorld();
});

after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  t.skip("payroll-fact-revision cohort absent -- explicit pre-integration run");
  return true;
}

// ---------------------------------------------------------------------------------------------
// S1 — the closed predicate
// ---------------------------------------------------------------------------------------------

const lane = async (path) =>
  (await rootQuery("select clara._revisable_fact_lane($1) as lane", [path])).rows[0].lane;

test("S1 · the lane predicate names the payroll lane, the invoice lane, and refuses everything else", async (t) => {
  if (gate(t)) return;

  // The ELEVEN run-level questions clara.persist_payroll_facts writes a region for (0296's own
  // clara._payroll_answers_ok vocabulary), transcribed from that migration rather than read back
  // out of the predicate under test.
  for (const f of [
    "payroll.run.period", "payroll.run.gross_pay",
    "payroll.run.epf_employee", "payroll.run.epf_employer",
    "payroll.run.socso_employee", "payroll.run.socso_employer",
    "payroll.run.eis_employee", "payroll.run.eis_employer",
    "payroll.run.pcb", "payroll.run.hrdf_levy", "payroll.run.net_pay",
  ]) {
    assert.equal(await lane(f), "payroll", `${f} is a payroll-lane fact`);
  }

  // The invoice lane's own closed set still answers `invoice`, unwidened.
  assert.equal(await lane("invoice.total"), "invoice");
  assert.equal(await lane("invoice.tax_breakdown"), "invoice");

  // NOTHING BELOW THE RUN LEVEL. The per-employee quotes are summed and discarded by
  // clara.persist_payroll_facts (0296 step 7), so no region carries them and no human can revise
  // one — admitting the path would offer a control over a figure that is not on file.
  assert.equal(await lane("payroll.row.gross_pay"), null);
  // A canonical path from another lane, and a layout fragment.
  assert.equal(await lane("statement.closing_balance"), null);
  assert.equal(await lane("pages.1.lines.0"), null);
  // A path that is not canonical at all is still just "no lane" here: the grammar wall
  // (clara._assert_field_path) is what refuses it, and it runs FIRST inside the door.
  assert.equal(await lane("payroll.run.bonus"), null);
  assert.equal(await lane(null), null);
});

// ---------------------------------------------------------------------------------------------
// S2 — the payroll chain's own observation
// ---------------------------------------------------------------------------------------------

const payrollObservation = async (document) =>
  (await rootQuery(
    "select facts_extraction_id, facts_version from clara._payroll_source_observation($1)",
    [document])).rows[0];

test("S2 · the payroll observation points at the payroll chain, and counts it", async (t) => {
  if (gate(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1);

  const obs = await payrollObservation(doc.documentId);
  // ONE read has happened, so the payroll facts version is 1 — the same counting rule
  // clara._document_source_observation applies to the invoice chain (0217:441), asked of the
  // kind this lane actually writes.
  assert.equal(obs.facts_version, 1, "one done payroll_text_facts extraction");

  // …and it is the row clara._payroll_posting_verdict judges, not some neighbour of it. Measured
  // by reading the extraction the door will supersede rather than by trusting the observation.
  const banked = await payrollExtractionsOf(doc.documentId);
  const text = banked.filter((e) => e.engine_kind === "payroll_text_facts");
  assert.equal(text.length, 1, "mandatory setup: exactly one text row on file");
  assert.equal(obs.facts_extraction_id, text[0].id);

  // THE INVOICE CHAIN IS EMPTY on this document, which is the whole reason a payroll lane was
  // needed: the door's existing observation would have answered 0 and refused `no_facts_to_revise`.
  const invoice = (await rootQuery(
    "select facts_version from clara._document_source_observation($1)", [doc.documentId])).rows[0];
  assert.equal(invoice.facts_version, 0, "no invoice_facts extraction exists on a payroll summary");
});

// ---------------------------------------------------------------------------------------------
// S3 — what a human declaration does to the banked fact state
// ---------------------------------------------------------------------------------------------

const declared = async (state, field, raw, cents) =>
  (await rootQuery(
    "select clara._payroll_state_with_human_fact($1::jsonb, $2, $3, $4::bigint) as s",
    [JSON.stringify(state), field, raw, cents])).rows[0].s;

test("S3 · a declared figure establishes its own question, discloses itself, and moves nothing else", async (t) => {
  if (gate(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The two channels read the printed gross differently — the exact condition #1056 names first
  // ("a channel disagreement the evaluator could not resolve"). Everything else agrees.
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.gross_pay": value("5,050.00") },
    visionAnswers: { "payroll.run.gross_pay": value("5,000.00") },
  });
  const before = await bankedState(doc.documentId);
  assert.equal(before.facts["payroll.run.gross_pay"].state, "channels_disagree",
    "mandatory setup: the evaluator could not resolve the gross");
  // The COLUMN SUM the evaluator computed from the two quoted rows: 3,000.00 + 2,000.00, by hand
  // from the worked example. It is what a later reader compares a declared figure against.
  assert.equal(Number(before.facts["payroll.run.gross_pay"].computed_cents), 500000);

  // A person reads the page and states the figure: RM 5,000.00.
  const after = await declared(before, "payroll.run.gross_pay", "5,000.00", 500000);
  const fact = after.facts["payroll.run.gross_pay"];

  assert.equal(fact.state, "established", "the question the person answered is answered");
  assert.equal(Number(fact.printed_cents), 500000, "…carrying the figure they stated");
  assert.equal(fact.printed_raw, "5,000.00", "…rendered as they typed it");
  assert.equal(fact.basis, "human_declared",
    "the basis vocabulary says WHO established it — never a printed_* basis a person did not read off a page");
  assert.equal(fact.reason, null, "the evaluator's refusal reason is spent");

  // THE MACHINE'S OWN READING SURVIVES BESIDE IT. A declaration replaces the verdict, never the
  // evidence: both channel quotes and the row-sum stay on the fact, so a reviewer can still see
  // what the two readings said and what the rows added up to.
  assert.equal(Number(fact.computed_cents), 500000, "the row sum is carried, never recomputed");
  assert.equal(fact.text_raw, "5,050.00");
  assert.equal(fact.vision_raw, "5,000.00");

  // DISCLOSED ON THE STATE ITSELF: `state_version` still says v1 (clara._payroll_entry_plan
  // refuses anything else), so the provenance has to be said somewhere a reader will find it.
  assert.equal(after.state_version, "v1");
  assert.deepEqual(after.human_declared, ["payroll.run.gross_pay"]);
  assert.equal(before.human_declared, undefined, "…and the machine's own state never carries the key");

  // THE BUCKETS ARE RE-DERIVED, in the eleven questions' own order.
  assert.ok(after.established.includes("payroll.run.gross_pay"));
  assert.equal(after.disagreed.includes("payroll.run.gross_pay"), false);
  assert.deepEqual(after.established, RUN_FIELDS.filter((f) => after.facts[f].state === "established"),
    "every established question, in the roster's own order");

  // NOTHING ELSE MOVED. The other ten facts and the whole rows object are byte-identical.
  assert.deepEqual(after.rows, before.rows,
    "a run-level declaration says NOTHING about the quoted employee rows");
  for (const f of RUN_FIELDS.filter((x) => x !== "payroll.run.gross_pay")) {
    assert.deepEqual(after.facts[f], before.facts[f], `${f} is untouched`);
  }
});

test("S3 · a second declaration joins the first, and the month is declared without cents", async (t) => {
  if (gate(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": value("Aug 2026") },
    visionAnswers: { "payroll.run.period": value("2026-08") },
  });
  const before = await bankedState(doc.documentId);
  assert.equal(before.facts["payroll.run.period"].state, "channels_disagree",
    "mandatory setup: the two channels read the month differently");

  // THE ONE NON-MONETARY QUESTION. It is declared as a rendering and carries no cents at all —
  // the same asymmetry clara.persist_payroll_facts writes it under (0296 step 9's
  // `v_f <> 'payroll.run.period'` arm).
  const once = await declared(before, "payroll.run.period", "2026-08", null);
  assert.equal(once.facts["payroll.run.period"].state, "established");
  assert.equal(once.facts["payroll.run.period"].printed_raw, "2026-08");
  assert.equal(once.facts["payroll.run.period"].printed_cents, null, "a month is not a figure");

  // A SECOND declaration on the same state APPENDS to the disclosure rather than replacing it:
  // two questions a person answered are two questions a person answered.
  const twice = await declared(once, "payroll.run.hrdf_levy", "50.00", 5000);
  assert.deepEqual(twice.human_declared, ["payroll.run.hrdf_levy", "payroll.run.period"],
    "sorted, so the disclosure has one spelling however the declarations arrived");

  // RE-DECLARING a question already declared does not list it twice.
  const thrice = await declared(twice, "payroll.run.period", "2026-09", null);
  assert.deepEqual(thrice.human_declared, ["payroll.run.hrdf_levy", "payroll.run.period"]);
  assert.equal(thrice.facts["payroll.run.period"].printed_raw, "2026-09", "…and the newest wins");
});
