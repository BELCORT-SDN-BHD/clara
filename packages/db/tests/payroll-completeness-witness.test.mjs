// Battery for migration 0343_payroll_completeness_witness.sql — #1048: A PAYROLL SUMMARY THAT
// PRINTS NO RUN TOTAL POSTS FROM ITS OWN ROW SUM WHEN THE PAGE WITNESSES ITS OWN COMPLETENESS,
// AND OTHERWISE PARKS A QUESTION INSTEAD OF REFUSING.
//
// Spec of record: issue #1048's Agent Brief (the body; the ticket carries ZERO comments, so there
// is no later brief and no owner ruling comment to override it). Its parent decision is the
// ruling recorded on #946 on 2026-09-24, which #1048's summary quotes: "the run's own row-sum is
// a posting basis when the document witnesses its own completeness, and otherwise parks a
// question instead of refusing."
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief's
// own "Key interfaces" names, and no cell sits anywhere else):
//   W1. THE EVALUATOR'S SUCCESSOR — clara.evaluate_payroll_run_state_v2(jsonb, jsonb). The frozen
//       v1 gains nothing; a new witness field read off the page is a _v2, because 0296:710
//       registers v1's closure and refuses an in-place recut by name. The witness questions live
//       in their OWN top-level `witness` object and the completeness verdict in its own
//       `completeness` object, so `facts` stays exactly eleven keys and every v1 consumer's
//       arithmetic is byte-unchanged.
//   W2. THE ANSWER VOCABULARY — clara._payroll_answers_ok(jsonb, text). The two witness questions
//       are KNOWN but OPTIONAL: the frozen payrollFacts_v1 prompts do not ask them yet, and an
//       envelope that omits them must still be admitted or the live lane stops reading.
//   W3. THE PERSIST DOOR — clara.persist_payroll_facts(uuid, jsonb, jsonb, integer). It banks a
//       v2 state, and the witness answers ride the stored run-level answers.
//   W4. THE DRAFTING BODY — clara._payroll_entry_plan(uuid, jsonb). A witnessed row sum is a
//       posting basis, each leg naming which question it came from and whether the figure was
//       printed or summed; the plan's own `posting_basis` names the row sum and the witness.
//   W5. THE UNATTENDED GATE — clara._payroll_posting_verdict(uuid). One new rung,
//       `completeness_witness`, carrying three named reasons (contradicted / unwitnessed /
//       declined) and the parked flag the queue reads.
//   W6. NEEDS YOU — clara.list_review_queue(jsonb, jsonb, integer). The parked question appears
//       as row_kind='payroll_completeness_question' and the blocked row does NOT, so one document
//       never produces two rows about one question.
//   W7. THE ANSWER DOOR — clara.answer_payroll_completeness(uuid, text, text, text). A named
//       person's yes becomes the basis and the run posts in the same call; a no keeps the document
//       unposted and says who said so.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool, buildWorld, upsertAccount } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { listReviewQueue } from "./wave-a-reads.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0343@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_COMPLETENESS_WITNESS !== "1") {
      throw new Error(
        "payroll-completeness-witness premise missing (migration 0343 is not applied) -- this is a " +
          "FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/payroll-completeness-witness-preintegration-gate.mjs for an estate sweep against " +
          "a chain that predates 0343.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0343 is not applied");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// THE WORKED EXAMPLE, done BY HAND here and never by re-running what the database runs
// (WORK-ORDER rule 4). The two employee rows are #945's own worked example, byte for byte, so
// this battery and payroll-summary-{facts,posting}.test.mjs agree about what the page says before
// any of them says anything about what it should post.
//
//   row 1   gross 3,000.00   epf 330.00   socso 14.75   eis 5.90   pcb 120.00   net 2,529.35
//   row 2   gross 2,000.00   epf 220.00   socso  9.75   eis 3.90   pcb  40.00   net 1,726.35
//   sums    gross 5,000.00   epf 550.00   socso 24.50   eis 9.80   pcb 160.00   net 4,255.70
//
// THE ENTRY A PAGE WITH NO TOTALS ROW SHOULD POST, worked out by hand from the ROW SUMS alone.
// Only the six columns a payslip row prints have a sum; the four employer-side contributions and
// the levy have NO per-employee counterpart, so a page that prints no totals row prints them
// nowhere at all and they produce no leg (0297 §C's own "an unprinted line produces no leg" rule,
// unchanged by this ticket and named as a pre-existing residual in 0343's header):
//   Dr 6000 Salaries and Wages     500000   (the gross sum)
//   Cr 2100 EPF Payable             55000   (the EMPLOYEE portion alone -- no employer figure exists)
//   Cr 2110 SOCSO Payable            2450
//   Cr 2120 EIS Payable               980
//   Cr 2130 PCB Payable             16000
//   Cr 2040 Salaries Payable       425570   (the net sum)
// It balances EXACTLY, and not by luck: 500000 - (55000 + 2450 + 980 + 16000) = 425570 is the row
// identity gross - (epf + socso + eis + pcb) = net, holding at run level over the summed column.
// ---------------------------------------------------------------------------

const value = (raw) => ({ state: "value", raw });
const notPrinted = () => ({ state: "not_printed" });

const RUN_FIELDS = [
  "payroll.run.period",
  "payroll.run.gross_pay",
  "payroll.run.epf_employee",
  "payroll.run.epf_employer",
  "payroll.run.socso_employee",
  "payroll.run.socso_employer",
  "payroll.run.eis_employee",
  "payroll.run.eis_employer",
  "payroll.run.pcb",
  "payroll.run.hrdf_levy",
  "payroll.run.net_pay",
];

const WITNESS_FIELDS = ["payroll.run.employee_count", "payroll.run.page_count"];

const ROW_FIELDS = [
  "payroll.row.gross_pay",
  "payroll.row.epf_employee",
  "payroll.row.socso_employee",
  "payroll.row.eis_employee",
  "payroll.row.pcb",
  "payroll.row.net_pay",
];

const R1 = { gross: "3,000.00", epf: "330.00", socso: "14.75", eis: "5.90", pcb: "120.00", net: "2,529.35" };
const R2 = { gross: "2,000.00", epf: "220.00", socso: "9.75", eis: "3.90", pcb: "40.00", net: "1,726.35" };

/** The page that DOES print a totals row (#946's own fixture, unchanged) -- the control AC4 asks
 *  to still pass. */
const PRINTED = {
  "payroll.run.period": value("2026-08"),
  "payroll.run.gross_pay": value("5,000.00"),
  "payroll.run.epf_employee": value("550.00"),
  "payroll.run.epf_employer": value("650.00"),
  "payroll.run.socso_employee": value("24.50"),
  "payroll.run.socso_employer": value("51.65"),
  "payroll.run.eis_employee": value("9.80"),
  "payroll.run.eis_employer": value("9.80"),
  "payroll.run.pcb": value("160.00"),
  "payroll.run.hrdf_levy": value("50.00"),
  "payroll.run.net_pay": value("4,255.70"),
};

/** The page that prints the month and the employee rows and NO run totals at all -- the summary
 *  #1048 exists for. */
const NO_TOTALS = Object.fromEntries(
  RUN_FIELDS.map((f) => [f, f === "payroll.run.period" ? value("2026-08") : notPrinted()]),
);

function payslipRow(rowNo, r) {
  const cells = {
    "payroll.row.gross_pay": value(r.gross),
    "payroll.row.epf_employee": value(r.epf),
    "payroll.row.socso_employee": value(r.socso),
    "payroll.row.eis_employee": value(r.eis),
    "payroll.row.pcb": value(r.pcb),
    "payroll.row.net_pay": value(r.net),
  };
  return { row_no: rowNo, cells: Object.fromEntries(ROW_FIELDS.map((f) => [f, cells[f]])) };
}

/** `{ payroll: { channel, answers, rows } }` -- #945's own wire shape. `witness` adds the two
 *  OPTIONAL questions this ticket introduces; omitting it produces exactly the eleven-key
 *  envelope the frozen payrollFacts_v1 worker sends today. */
function envelope({ channel = "text", answers = PRINTED, witness = null, rows = null } = {}) {
  const a = { ...answers };
  if (witness) for (const f of WITNESS_FIELDS) if (f in witness) a[f] = witness[f];
  return { payroll: { channel, answers: a, rows: rows ?? [payslipRow(1, R1), payslipRow(2, R2)] } };
}

function bothChannels(opts = {}) {
  return [envelope({ ...opts, channel: "text" }), envelope({ ...opts, channel: "vision" })];
}

async function evaluate(version, textEnv, visionEnv) {
  const r = await rootQuery(
    `select clara.evaluate_payroll_run_state_${version}($1::jsonb, $2::jsonb) as state`,
    [JSON.stringify(textEnv), JSON.stringify(visionEnv)],
  );
  return r.rows[0].state;
}

// ---------------------------------------------------------------------------
// W1 — the evaluator's successor
// ---------------------------------------------------------------------------

test("W1 · v2 reads a printed headcount that matches the lines as a completeness witness, and leaves v1's eleven facts byte-identical", async (t) => {
  if (unready(t)) return;

  const [textEnv, visionEnv] = bothChannels({
    answers: NO_TOTALS,
    witness: { "payroll.run.employee_count": value("2"), "payroll.run.page_count": value("1") },
  });

  const v2 = await evaluate("v2", textEnv, visionEnv);

  assert.equal(v2.state_version, "v2", "the successor names itself");
  assert.equal(v2.completeness.rows_read, 2, "two agreed employee lines were read");
  assert.equal(v2.completeness.employee_count, 2, "…and the page printed a headcount of two");
  assert.equal(v2.completeness.witness, "headcount", "the headcount is the witness, not the page count");
  assert.equal(v2.completeness.verdict, "witnessed");
  assert.equal(v2.witness["payroll.run.employee_count"].state, "established");
  assert.equal(v2.witness["payroll.run.page_count"].state, "established");

  // The eleven are UNTOUCHED: v2 must be v1 plus the witness, never v1 with a moved figure. The
  // independent source of truth is v1 itself, run on the SAME envelopes -- which is the one
  // comparison a _vN beside a frozen body has to make.
  const v1 = await evaluate("v1", textEnv, visionEnv);
  assert.deepEqual(
    Object.keys(v2.facts).sort(),
    Object.keys(v1.facts).sort(),
    "`facts` still carries exactly the eleven run-level questions -- the witness lives elsewhere",
  );
  assert.deepEqual(v2.facts, v1.facts, "every one of the eleven verdicts is byte-identical to v1's");
  assert.deepEqual(v2.rows, v1.rows, "the row census is byte-identical to v1's");
  assert.deepEqual(v2.established, v1.established);
  assert.deepEqual(v2.disagreed, v1.disagreed);
  assert.deepEqual(v2.missing, v1.missing);
  assert.equal(v1.completeness, undefined, "…and v1 itself gained nothing: it is frozen");
  assert.equal(
    Number(v2.facts["payroll.run.gross_pay"].computed_cents),
    500000,
    "mandatory setup: the row sum this witness admits is the worked example's own gross",
  );
});
