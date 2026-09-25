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
import { rootQuery, ensureReady, endPool, buildWorld, upsertAccount, human, humanQuery } from "./rig-fixtures.mjs";
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
//  The month is a PARAMETER because every cell below that actually POSTS must post a DIFFERENT
//  month: 0297's duplicate guard refuses a second payroll run for one client and one month by name
//  (`same_month_payroll_run`), and it is right to. One month each keeps the cells readable against
//  a single seeded chart, which one client each would not.
const noTotals = (period) =>
  Object.fromEntries(RUN_FIELDS.map((f) => [f, f === "payroll.run.period" ? value(period) : notPrinted()]));
const NO_TOTALS = noTotals("2026-08");

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

/** The eleven accounts this lane reaches, with the names 0150/0295 seed them under. A client's
 *  own chart is what the plan resolves against; this puts a payroll-capable chart on a rig
 *  client, through the real writer door. */
const PAYROLL_CHART = [
  { code: "6000", name: "Salaries and Wages", type: "expense" },
  { code: "6010", name: "EPF Contribution (Employer)", type: "expense" },
  { code: "6020", name: "SOCSO Contribution (Employer)", type: "expense" },
  { code: "6030", name: "EIS Contribution (Employer)", type: "expense" },
  { code: "6040", name: "HRDF (HRD Corp) Levy Expense", type: "expense" },
  { code: "2100", name: "EPF (KWSP) Payable", type: "liability" },
  { code: "2110", name: "SOCSO (PERKESO) Payable", type: "liability" },
  { code: "2120", name: "EIS (SIP) Payable", type: "liability" },
  { code: "2130", name: "PCB (MTD) Payable", type: "liability" },
  { code: "2140", name: "HRDF (HRD Corp) Levy Payable", type: "liability" },
  { code: "2040", name: "Salaries Payable", type: "liability" },
];

let opSeq = 0;
const opk = (tag) => `p1048-${tag}-${Date.now()}-${++opSeq}`;

async function seedPayrollChart(sub, client) {
  for (const a of PAYROLL_CHART) {
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk("coa") });
  }
}

async function hasWitnessConsent(client) {
  const r = await rootQuery(
    `select exists(select 1 from clara.client_egress_purpose_activations a
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where a.client_id=$1 and a.purpose='witness_extraction'
         and a.deactivated_at is null and c.revoked_at is null) as live`,
    [client],
  );
  return r.rows[0].live === true;
}

/** A FILED payroll-summary pdf with a done OCR extraction and one cited region, born through the
 *  real doors (#945's own `payrollDoc` shape), never by surgery. */
async function payrollDoc(sub, client) {
  const firm = await firmOf(client);
  if (!(await hasWitnessConsent(client))) {
    const evidence = await consentEvidenceDoc(sub, { firm });
    const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
    await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  }
  const doc = await filedDocument(sub, { firm, client, kind: "payroll_summary" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: extractionId, fieldPath: "payroll.run.gross_pay", textContent: "5,000.00" });
  return { ...doc, firm, client, extractionId };
}

/** Drive a payroll document all the way through the lane: filed, routed, claimed, read. Returns
 *  the document and the persist receipt (whose `posting` object says what the read led to).
 *
 *  `witnessVision` lets the two channels answer the witness questions DIFFERENTLY, which is the
 *  only way to drive the ADV-01 split (one model finds a small "Total employees:" label the other
 *  misses) end to end rather than at the evaluator alone. It defaults to `witness`, so every
 *  existing caller sends the same witness on both channels exactly as before. */
async function readPayrollDoc(
  sub, client, { answers = PRINTED, witness = null, witnessVision = undefined, rows = null } = {},
) {
  const visionWitness = witnessVision === undefined ? witness : witnessVision;
  const doc = await payrollDoc(sub, client);
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      `select id from clara.document_processing_tasks
        where document_id=$1 and lane='payroll_facts' and status='queued'
        order by version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a payroll_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;

  const receipt = (
    await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({
        input_pin: doc.extractionId,
        prompt_hash: "p1048-text",
        envelope: envelope({ channel: "text", answers, witness, rows }),
      }),
      JSON.stringify({
        input_pin: sha,
        prompt_hash: "p1048-vision",
        envelope: envelope({ channel: "vision", answers, witness: visionWitness, rows }),
      }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, taskId: task.id, receipt };
}

/** The fact state this lane BANKED for a document -- read off the stored text row, never
 *  re-derived, because the rows the evaluator summed no longer exist by the time it is read. */
async function bankedState(documentId) {
  const r = await rootQuery(
    `select e.envelope->'payroll_state' as state
       from clara.document_extractions e
      where e.document_id=$1 and e.engine_kind='payroll_text_facts' and e.status='done'
      order by e.version_n desc limit 1`,
    [documentId],
  );
  return r.rows[0]?.state ?? null;
}

async function verdict(documentId) {
  return (await rootQuery("select clara._payroll_posting_verdict($1) as v", [documentId])).rows[0].v;
}

const entriesOf = async (documentId) =>
  (
    await rootQuery(
      `select id, status, posting_date::text as posting_date, memo, flags, maker_actor, checker_actor
         from clara.journal_entries where document_id=$1 order by created_at`,
      [documentId],
    )
  ).rows;

const legsOf = async (entryId) =>
  (
    await rootQuery(
      `select line_no, account_code, debit_cents::bigint, credit_cents::bigint, description
         from clara.journal_lines where entry_id=$1 order by line_no`,
      [entryId],
    )
  ).rows;

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

// ---------------------------------------------------------------------------
// W2 — the answer vocabulary
// ---------------------------------------------------------------------------

const answersOk = async (env, channel) =>
  (await rootQuery("select clara._payroll_answers_ok($1::jsonb, $2) as ok", [JSON.stringify(env), channel]))
    .rows[0].ok;

test("W2 · the two witness questions are KNOWN but OPTIONAL: the eleven are still required and an unknown key is still refused", async (t) => {
  if (unready(t)) return;

  // THE LIVE LANE MUST NOT STOP READING. The frozen payrollFacts_v1 worker sends exactly eleven
  // run-level answers and no witness at all; if this door began requiring thirteen, every payroll
  // read in the estate would be refused at the write boundary. That is the FIRST assertion here,
  // not an afterthought.
  assert.equal(
    await answersOk(envelope({ answers: NO_TOTALS }), "text"),
    true,
    "an ELEVEN-key envelope -- exactly what the frozen prompts send today -- is still admitted",
  );
  assert.equal(
    await answersOk(
      envelope({ answers: NO_TOTALS, witness: { "payroll.run.employee_count": value("2") } }),
      "text",
    ),
    true,
    "…and so is one that answers ONE of the two witnesses: each is independently optional",
  );
  assert.equal(
    await answersOk(
      envelope({
        answers: NO_TOTALS,
        witness: { "payroll.run.employee_count": value("2"), "payroll.run.page_count": notPrinted() },
      }),
      "text",
    ),
    true,
    "…and `not_printed` is a first-class answer for a witness too",
  );

  // The two halves the vocabulary has always enforced are untouched.
  const missingOne = { ...NO_TOTALS };
  delete missingOne["payroll.run.pcb"];
  assert.equal(
    await answersOk({ payroll: { channel: "text", answers: missingOne, rows: [] } }, "text"),
    false,
    "one of the ELEVEN omitted is still a refusal -- optional applies to the witnesses alone",
  );
  const unknown = envelope({ answers: NO_TOTALS });
  unknown.payroll.answers["payroll.run.headcount"] = value("2");
  assert.equal(
    await answersOk(unknown, "text"),
    false,
    "a near-miss spelling is still an unknown key, not a witness",
  );
  const overlong = envelope({
    answers: NO_TOTALS,
    witness: { "payroll.run.employee_count": value("9".repeat(201)) },
  });
  assert.equal(await answersOk(overlong, "text"), false, "the 200-character bound applies to a witness answer too");
  const blank = envelope({ answers: NO_TOTALS, witness: { "payroll.run.page_count": { state: "value", raw: "   " } } });
  assert.equal(await answersOk(blank, "text"), false, "`state:value` with a blank rendering is still malformed");
  const badState = envelope({
    answers: NO_TOTALS,
    witness: { "payroll.run.page_count": { state: "computed", raw: "1" } },
  });
  assert.equal(await answersOk(badState, "text"), false, "there is still no third state");
});

// ---------------------------------------------------------------------------
// W3 — the persist door banks a v2 state
// ---------------------------------------------------------------------------

test("W3 · the lane banks a v2 fact state, and the witness answers ride the stored run-level answers", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: noTotals("2026-01"),
    witness: { "payroll.run.employee_count": value("2"), "payroll.run.page_count": value("1") },
  });

  const state = await bankedState(doc.documentId);
  assert.ok(state, "the read banked a fact state on the text row");
  assert.equal(state.state_version, "v2", "…and it is the SUCCESSOR's state, so the witness is durable");
  assert.equal(state.completeness.verdict, "witnessed");
  assert.equal(state.completeness.witness, "headcount");
  assert.equal(state.completeness.rows_read, 2);

  // The witness answers are stored beside the eleven, because the persist door stores the
  // channel's answers verbatim -- so a later reader can see WHAT the page printed, not merely
  // what the evaluator concluded.
  const stored = (
    await rootQuery(
      `select e.envelope->'payroll'->'answers' as answers
         from clara.document_extractions e
        where e.document_id=$1 and e.engine_kind='payroll_text_facts' and e.status='done'
        order by e.version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0].answers;
  assert.equal(stored["payroll.run.employee_count"].raw, "2");
  assert.equal(stored["payroll.run.page_count"].raw, "1");

  // AND THE STRIP IS UNTOUCHED: no per-employee cell reached the store, on either row of the pair.
  const anyRows = (
    await rootQuery(
      `select count(*)::int as n from clara.document_extractions e
        where e.document_id=$1 and e.engine_kind in ('payroll_text_facts','payroll_vision_facts')
          and e.envelope->'payroll' ? 'rows'`,
      [doc.documentId],
    )
  ).rows[0].n;
  assert.equal(anyRows, 0, "the per-employee quotes are still consumed and discarded, never stored");
});

// ---------------------------------------------------------------------------
// W4 — the drafting body (AC1's first half: the plan)
// ---------------------------------------------------------------------------

async function plan(client, state) {
  return (
    await rootQuery("select clara._payroll_entry_plan($1, $2::jsonb) as plan", [client, JSON.stringify(state)])
  ).rows[0].plan;
}

/** The entry a WITNESSED row sum should draft, transcribed from the worked example at the top of
 *  this file. The five employer-side/levy legs are ABSENT because the page prints those figures
 *  nowhere and a payslip row has no counterpart for them. */
const EXPECTED_ROW_SUM_LEGS = [
  { account_code: "6000", side: "debit", cents: 500000, basis: "payroll.run.gross_pay#row_sum" },
  { account_code: "2100", side: "credit", cents: 55000, basis: "payroll.run.epf_employee#row_sum" },
  { account_code: "2110", side: "credit", cents: 2450, basis: "payroll.run.socso_employee#row_sum" },
  { account_code: "2120", side: "credit", cents: 980, basis: "payroll.run.eis_employee#row_sum" },
  { account_code: "2130", side: "credit", cents: 16000, basis: "payroll.run.pcb#row_sum" },
  { account_code: "2040", side: "credit", cents: 425570, basis: "payroll.run.net_pay#row_sum" },
];

test("W4 · a witnessed row sum is a posting basis, and every leg says the figure was summed", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const [textEnv, visionEnv] = bothChannels({
    answers: NO_TOTALS,
    witness: { "payroll.run.employee_count": value("2") },
  });
  const state = await evaluate("v2", textEnv, visionEnv);
  assert.equal(state.completeness.verdict, "witnessed", "mandatory setup: the page witnesses itself");

  const p = await plan(world.clients.A1, state);

  assert.equal(p.ready, true, `the plan drafts from the row sum: ${JSON.stringify(p.refusals)}`);
  assert.deepEqual(
    p.legs.map((l) => ({
      account_code: l.account_code,
      side: l.side,
      cents: Number(l.cents),
      basis: l.basis,
    })),
    EXPECTED_ROW_SUM_LEGS,
    "six legs, in the spec's own order, each naming the question it was summed from",
  );
  assert.equal(Number(p.debit_cents), 500000, "the debits are the worked example's own gross sum");
  assert.equal(
    Number(p.credit_cents),
    500000,
    "…and the entry balances EXACTLY, because gross - (epf + socso + eis + pcb) = net at run level too",
  );
  assert.equal(p.posting_date, "2026-08-31", "the entry is still dated at the END of the payslip's own month");

  // AC1: "the entry's basis names the row-sum and the witness."
  assert.equal(p.posting_basis.kind, "row_sum");
  assert.equal(p.posting_basis.witness, "headcount");
  assert.equal(p.posting_basis.rows_read, 2);
  assert.equal(p.posting_basis.employee_count, 2);
  assert.deepEqual(p.posting_basis.row_sum_fields, [
    "payroll.run.gross_pay",
    "payroll.run.epf_employee",
    "payroll.run.socso_employee",
    "payroll.run.eis_employee",
    "payroll.run.pcb",
    "payroll.run.net_pay",
  ]);
});

test("W4b · AC4's control: a page that DOES print its totals is untouched -- the printed total wins and the basis says so", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const [textEnv, visionEnv] = bothChannels({ witness: { "payroll.run.employee_count": value("2") } });
  const state = await evaluate("v2", textEnv, visionEnv);
  const p = await plan(world.clients.A1, state);

  assert.equal(p.ready, true, `${JSON.stringify(p.refusals)}`);
  assert.equal(Number(p.debit_cents), 576145, "#946's own worked total, unmoved: eleven legs from printed figures");
  assert.equal(Number(p.credit_cents), 576145);
  assert.equal(p.legs.length, 11, "the employer-side legs are back, because the page prints them");
  assert.equal(p.posting_basis.kind, "printed_totals", "a witness present alongside printed totals changes nothing");
  assert.deepEqual(p.posting_basis.row_sum_fields, [], "…and no leg was summed");
  for (const leg of p.legs) {
    assert.doesNotMatch(leg.basis, /#row_sum/, `leg ${leg.account_code} came from a printed figure`);
  }
});

// ---------------------------------------------------------------------------
// W5 — the unattended gate and the post (AC1 end to end)
// ---------------------------------------------------------------------------

test("W5 · AC1: a summary with no totals row but a printed headcount equal to its lines POSTS, and the entry names the row sum and the witness", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: noTotals("2026-02"),
    witness: { "payroll.run.employee_count": value("2") },
  });

  // The lane posts inside the READ's own transaction: the settle receipt says what it did.
  assert.equal(doc.receipt.posting.posted, true, `the run posted: ${JSON.stringify(doc.receipt.posting)}`);

  const entries = await entriesOf(doc.documentId);
  assert.equal(entries.length, 1, "exactly one entry, with no human in the loop");
  const e = entries[0];
  assert.equal(e.status, "approved");
  assert.equal(e.posting_date, "2026-02-28", "dated at the end of the payslip's own month");
  assert.equal(e.memo, "Payroll run February 2026");

  // AC1: "the entry's basis names the row-sum and the witness." On the entry itself, so a reader
  // of the ledger never has to go back to the reading to learn what the figures came from.
  assert.equal(e.flags.payroll_run.posting_basis.kind, "row_sum");
  assert.equal(e.flags.payroll_run.posting_basis.witness, "headcount");
  assert.equal(e.flags.payroll_run.posting_basis.rows_read, 2);
  assert.equal(e.flags.payroll_run.posting_basis.employee_count, 2);

  const legs = await legsOf(e.id);
  assert.deepEqual(
    legs.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [
      ["6000", 500000, 0],
      ["2100", 0, 55000],
      ["2110", 0, 2450],
      ["2120", 0, 980],
      ["2130", 0, 16000],
      ["2040", 0, 425570],
    ],
    "the six-leg entry the worked example computes by hand, and it balances at 500000 both ways",
  );

  // …and on the receipt, in words a person reads, with the whole plan beside it.
  const receipt = (
    await rootQuery(
      `select rationale, gate_verdicts, approval_arm, via_wake_kind
         from clara.entry_post_receipts where entry_id=$1`,
      [e.id],
    )
  ).rows[0];
  assert.equal(receipt.approval_arm, "payroll_unattended");
  assert.equal(receipt.via_wake_kind, "payroll_facts");
  assert.match(receipt.rationale, /row sum/i, "the receipt says the figures were summed, not printed");
  assert.match(receipt.rationale, /headcount/i, "…and names the witness that admitted the sum");
  assert.equal(receipt.gate_verdicts.plan.posting_basis.kind, "row_sum");
  assert.equal(receipt.gate_verdicts.rung_vector.completeness_witness, "pass");
});

test("W6 · AC3: a summary whose printed headcount disagrees with its lines is REFUSED, and the sentence says which two numbers disagree", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The page says three employees; the reading found two. The reading is KNOWN incomplete, so a
  // witness here is worse than silence and nothing may post -- not even a parked question, because
  // there is nothing for a person to affirm.
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: noTotals("2026-03"),
    witness: { "payroll.run.employee_count": value("3") },
  });

  assert.equal(doc.receipt.posting.posted, false);
  assert.deepEqual(await entriesOf(doc.documentId), [], "nothing at all was written");

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "completeness_witness");
  assert.equal(v.reason, "completeness_contradicted");
  assert.equal(v.rung_vector.completeness_witness, "completeness_contradicted");
  assert.equal(v.rung_vector.run_totals_printed, "pass", "the rung about a printed total is not the one that failed");
  assert.equal(v.completeness.parked, false, "a contradiction is not a question a person can answer away");
  assert.match(v.sentence, /3/, "the sentence names the printed headcount");
  assert.match(v.sentence, /2/, "…and the number of lines read");
  assert.match(v.sentence, /March 2026/, "…and the month it is about");
});

// ---------------------------------------------------------------------------
// W7 / W8 / W9 / W10 — Needs you, and the answer door (AC2)
// ---------------------------------------------------------------------------

async function queueRows(sub, client) {
  const env = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 200 });
  return env.rows;
}

const escapeRe = (s) => s.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

const answerCompleteness = (sub, { document, answer, note = null }) =>
  humanQuery(sub, "select clara.answer_payroll_completeness($1,$2,$3,$4) as r", [
    document,
    answer,
    note,
    opk("answer"),
  ]);

test("W7 · AC2: a summary that witnesses nothing PARKS a question under Needs you, and the blocked row stands down", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2026-04") });
  assert.equal(doc.receipt.posting.posted, false, "mandatory setup: nothing posted on an unwitnessed page");

  const v = await verdict(doc.documentId);
  assert.equal(v.rung, "completeness_witness");
  assert.equal(v.reason, "completeness_unwitnessed");
  assert.equal(v.completeness.parked, true, "…and this one a person CAN settle by answering");

  const rows = (await queueRows(world.users.alice, world.clients.A1)).filter(
    (r) => r.document_id === doc.documentId,
  );
  const parked = rows.filter((r) => r.row_kind === "payroll_completeness_question");
  const blocked = rows.filter((r) => r.row_kind === "payroll_posting_blocked");
  assert.equal(parked.length, 1, "exactly one parked-question row for this reading");
  assert.equal(
    blocked.length,
    0,
    "…and NO blocked row beside it: one document never produces two rows about one question",
  );

  const row = parked[0];
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.period, "2026-04-01", "the row names the month it is about");
  // The sentence on screen is the DATABASE's own, built in clara._payroll_posting_verdict and
  // rendered verbatim -- so the words a person reads and the decision the lane took are one body.
  assert.equal(row.question_text, v.sentence);
  assert.match(row.question_text, /prints no total; is this every employee for the month\?/);
  assert.match(row.question_text, /2 employee line/, "…with the line count a person is affirming");
  assert.match(row.question_text, /RM 5,000\.00 gross/, "…and the gross it would post");
  assert.match(row.question_text, /RM 4,255\.70 net/, "…and the net");
});

test("W8 · AC2: a named YES becomes the basis, posts the run in the same call, and is recorded as the evidence", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2026-05") });
  assert.equal(doc.receipt.posting.posted, false, "mandatory setup: parked, not posted");

  const r = (
    await answerCompleteness(world.users.alice, {
      document: doc.documentId,
      answer: "yes",
      note: "Checked against the EPF submission: two employees in May.",
    })
  ).rows[0].r;

  assert.equal(r.answer, "yes");
  assert.equal(r.posted, true, `the run posts in the same call: ${JSON.stringify(r)}`);
  assert.ok(r.entry_id, "…and the door hands back the entry it made");

  const entries = await entriesOf(doc.documentId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "approved");
  assert.equal(entries[0].posting_date, "2026-05-31");
  assert.equal(entries[0].flags.payroll_run.posting_basis.kind, "row_sum");
  assert.equal(
    entries[0].flags.payroll_run.posting_basis.witness,
    "answered_question",
    "the basis names the ANSWER as the witness, not a page that printed nothing",
  );
  assert.equal(
    entries[0].flags.payroll_run.posting_basis.answer.answer_id,
    r.answer_id,
    "…and points at the answer row itself, which is the evidence",
  );

  // The answer row: who, what they affirmed, and the reading it was about.
  const stored = (
    await rootQuery(
      `select a.answer, a.note, a.rows_read, a.answered_by, a.extraction_id, u.display_name
         from clara.payroll_completeness_answers a join clara.users u on u.id = a.answered_by
        where a.id = $1`,
      [r.answer_id],
    )
  ).rows[0];
  assert.equal(stored.answer, "yes");
  assert.equal(stored.rows_read, 2, "the line count the person affirmed is frozen on the row");
  assert.equal(stored.note, "Checked against the EPF submission: two employees in May.");
  assert.equal(
    stored.extraction_id,
    (await verdict(doc.documentId)).extraction_id,
    "bound to the READING, so a re-read asks again rather than inheriting this yes",
  );

  // …and the receipt a person reads says the same thing in words, naming them.
  const receipt = (
    await rootQuery("select rationale from clara.entry_post_receipts where entry_id=$1", [entries[0].id])
  ).rows[0];
  assert.match(receipt.rationale, /ROW SUM/);
  assert.match(receipt.rationale, new RegExp(escapeRe(stored.display_name)));

  // The question is settled, so the row is gone -- and no blocked row replaced it.
  const rows = (await queueRows(world.users.alice, world.clients.A1)).filter(
    (r2) => r2.document_id === doc.documentId,
  );
  assert.deepEqual(
    rows.map((r2) => r2.row_kind).sort(),
    // #947's own row, and it SHOULD be here: the run is posted, so the net pay is now owed and
    // has not left the bank yet. What must be gone is the question and any block.
    ["payroll_net_pay_unsettled"],
    "the parked question is settled and no posting block replaced it -- only #947's settlement row remains",
  );

  // AND IT CANNOT BE ANSWERED TWICE: the question is no longer parked, and the door says so.
  await assert.rejects(
    () => answerCompleteness(world.users.alice, { document: doc.documentId, answer: "no" }),
    /no parked completeness question/i,
    "a settled question is not answerable again",
  );
});

test("W9 · AC2: a NO leaves the document unposted and the row says who said so", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2026-06") });

  const r = (
    await answerCompleteness(world.users.alice, {
      document: doc.documentId,
      answer: "no",
      note: "Page 2 of the summary is missing.",
    })
  ).rows[0].r;
  assert.equal(r.answer, "no");
  assert.equal(r.posted, false, "a no posts nothing");
  assert.deepEqual(await entriesOf(doc.documentId), [], "…and writes no entry at all");

  const v = await verdict(doc.documentId);
  assert.equal(v.rung, "completeness_witness");
  assert.equal(v.reason, "completeness_declined");
  assert.equal(v.completeness.parked, false, "the question is answered, so it is no longer parked");

  const rows = (await queueRows(world.users.alice, world.clients.A1)).filter(
    (r2) => r2.document_id === doc.documentId,
  );
  assert.deepEqual(
    rows.map((r2) => r2.row_kind).sort(),
    // `uncoded_filing` rides beside it, which is 0297 §H's own recorded model: before the entry
    // exists the payslip IS an uncoded filing, and the payroll row sits beside it saying why.
    ["payroll_posting_blocked", "uncoded_filing"],
    "the parked question is gone and the ordinary blocked row takes its place -- a declined run is still a run nobody has booked",
  );
  const name = (
    await rootQuery(
      "select u.display_name from clara.users u join clara.payroll_completeness_answers a on a.answered_by=u.id where a.id=$1",
      [r.answer_id],
    )
  ).rows[0].display_name;
  assert.match(rows[0].question_text, new RegExp(escapeRe(name)));
  assert.match(rows[0].question_text, /not every employee for the month/);
  // FIX ROUND (ADV-12): and the row names BOTH remedies. A changed mind is a new reading, so a
  // mis-clicked `no` is cleared by a re-read -- not by re-filing a document that was never wrong.
  assert.match(rows[0].question_text, /read this payslip again/i);
});

test("W10 · the answer door refuses a question that was never asked, and an answer that is neither yes nor no", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // A page that prints its totals has no completeness question at all -- it posted. Answering it
  // would be recording a judgement nobody was asked for.
  const posted = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { ...PRINTED, "payroll.run.period": value("2026-07") },
  });
  assert.equal(posted.receipt.posting.posted, true, "mandatory setup: this one posted on its printed totals");
  await assert.rejects(
    () => answerCompleteness(world.users.alice, { document: posted.documentId, answer: "yes" }),
    /no parked completeness question/i,
  );

  const parkedDoc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2026-09") });
  await assert.rejects(
    () => answerCompleteness(world.users.alice, { document: parkedDoc.documentId, answer: "maybe" }),
    /yes.*no|answer must be/i,
    "there are two answers to this question and no third",
  );
  await assert.rejects(
    () =>
      humanQuery(world.users.alice, "select clara.answer_payroll_completeness($1,$2,$3,$4) as r", [
        parkedDoc.documentId,
        "yes",
        null,
        "  ",
      ]),
    /op_key is required/i,
    "…and the door is a governed act, so it needs an op key like any other",
  );
});

test("W4c · the SECOND witness: a page count of one admits the sum, and a page count above one does not", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);

  // ONE PAGE, NO HEADCOUNT. The document says it is not truncated, which is exactly the gap the row
  // sum opens ("did I read every line of this document?"). The OTHER gap -- is this document the
  // whole firm's run -- is not opened by the sum and is not closed here: a printed totals row is
  // equally silent about it, and #946 has posted from printed totals since without asking.
  const onePage = await evaluate(
    "v2",
    ...bothChannels({ answers: NO_TOTALS, witness: { "payroll.run.page_count": value("1") } }),
  );
  assert.equal(onePage.completeness.verdict, "witnessed");
  assert.equal(onePage.completeness.witness, "single_page");
  assert.equal(onePage.completeness.employee_count, null, "…on the page count alone, with no headcount printed");
  const p1 = await plan(world.clients.A1, onePage);
  assert.equal(p1.ready, true, `${JSON.stringify(p1.refusals)}`);
  assert.equal(p1.posting_basis.kind, "row_sum");
  assert.equal(p1.posting_basis.witness, "single_page");
  assert.equal(p1.posting_basis.page_count, 1);
  assert.equal(Number(p1.debit_cents), 500000);

  // THREE PAGES, NO HEADCOUNT. The summary names more pages than the one that was read, which is the
  // case the row sum is least safe in -- so nothing is witnessed and the question is parked.
  const threePages = await evaluate(
    "v2",
    ...bothChannels({ answers: NO_TOTALS, witness: { "payroll.run.page_count": value("3") } }),
  );
  assert.equal(threePages.completeness.verdict, "absent");
  assert.equal(threePages.completeness.witness, null);
  assert.equal(threePages.completeness.reason, "the_summary_names_more_pages_than_the_one_read");
  const p3 = await plan(world.clients.A1, threePages);
  assert.equal(p3.ready, false);
  assert.deepEqual(p3.refusals.map((r) => r.reason), ["completeness_unwitnessed"]);
  assert.deepEqual(p3.legs, []);

  // AND THE HEADCOUNT STILL WINS OVER THE PAGE COUNT when both are printed: a page that says it is
  // one page AND names three employees, over two lines read, is CONTRADICTED, not witnessed. A
  // truncation the page itself does not know about is exactly the case the weaker witness misses.
  const both = await evaluate(
    "v2",
    ...bothChannels({
      answers: NO_TOTALS,
      witness: { "payroll.run.page_count": value("1"), "payroll.run.employee_count": value("3") },
    }),
  );
  assert.equal(both.completeness.verdict, "contradicted");
  assert.equal(both.completeness.witness, null);
  const pb = await plan(world.clients.A1, both);
  assert.equal(pb.ready, false);
  assert.deepEqual(pb.refusals.map((r) => r.reason), ["completeness_contradicted"]);

  // ZERO PAGES (fix round, ADV-11). The count regex admits 0, and the outcome was already safe --
  // nothing is witnessed -- but the REASON said "the summary names more pages than the one read",
  // which is not what a page count of zero says. It gets its own reason now.
  const zeroPages = await evaluate(
    "v2",
    ...bothChannels({ answers: NO_TOTALS, witness: { "payroll.run.page_count": value("0") } }),
  );
  assert.equal(zeroPages.completeness.verdict, "absent");
  assert.equal(zeroPages.completeness.reason, "the_summary_prints_a_page_count_of_zero");
});

test("W4d · a witness neither channel was asked is `not_asked`, and it parks the question rather than blocking the estate", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // THE SHAPE THE FROZEN payrollFacts_v1 WORKER SENDS TODAY: eleven answers, no witness at all. This
  // is the compatibility cell -- if an unasked witness read as `unanswered` inside `facts`, the
  // verdict would fold it into `arithmetic_holds` and EVERY payroll run in the estate would be
  // refused on the grounds that the page does not add up.
  const state = await evaluate("v2", ...bothChannels({ answers: NO_TOTALS }));
  assert.equal(state.witness["payroll.run.employee_count"].state, "not_asked");
  assert.equal(state.witness["payroll.run.page_count"].state, "not_asked");
  assert.equal(
    state.witness["payroll.run.employee_count"].reason,
    "neither_channel_was_asked_this_question",
    "…and it says so: a prompt that never asked and a page that prints nothing are different facts",
  );
  assert.deepEqual(
    Object.keys(state.facts).sort(),
    [...RUN_FIELDS].sort(),
    "the witness never joins `facts`, which is what keeps the arithmetic rung out of this",
  );
  assert.equal(state.completeness.verdict, "absent");
  assert.equal(state.completeness.reason, "no_completeness_witness_printed");

  const p = await plan(world.clients.A1, state);
  assert.deepEqual(
    p.refusals.map((r) => r.reason),
    ["completeness_unwitnessed"],
    "the parked question, and NOT `arithmetic_failed` or `run_totals_not_printed`",
  );

  // A witness ONE channel answered and the other did not is `not_asked` too, not a disagreement:
  // a half-configured prompt is a prompt problem, not a page problem.
  const half = await evaluate(
    "v2",
    envelope({ channel: "text", answers: NO_TOTALS, witness: { "payroll.run.employee_count": value("2") } }),
    envelope({ channel: "vision", answers: NO_TOTALS }),
  );
  assert.equal(half.witness["payroll.run.employee_count"].state, "not_asked");
  assert.equal(half.witness["payroll.run.employee_count"].reason, "only_one_channel_answered_this_question");
  assert.equal(half.completeness.verdict, "absent");

  // …and a witness BOTH channels read DIFFERENTLY is `channels_disagree`, which the completeness
  // verdict resolves to `absent` -- the parked question -- rather than to a witness. It does NOT
  // fail the `channels_agree` rung: see W11/W12 and the fix round's ADV-01, which measured what
  // that fold did to a page printing all eleven of its own run totals.
  const disagree = await evaluate(
    "v2",
    envelope({ channel: "text", answers: NO_TOTALS, witness: { "payroll.run.employee_count": value("2") } }),
    envelope({ channel: "vision", answers: NO_TOTALS, witness: { "payroll.run.employee_count": value("3") } }),
  );
  assert.equal(disagree.witness["payroll.run.employee_count"].state, "channels_disagree");
  assert.equal(disagree.completeness.verdict, "absent");
  assert.equal(disagree.completeness.reason, "printed_headcount_could_not_be_read");
});

// ---------------------------------------------------------------------------
// FIX ROUND — the adversarial lens's ADV-01. A completeness witness is a FALLBACK for a page that
// prints no totals. It must never veto a page that prints them.
// ---------------------------------------------------------------------------

test("W11 · ADV-01: a witness only ONE channel found never vetoes a page that prints its own run totals", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The likely production split, once payrollFacts_v2 asks these two questions: one model spots a
  // small "Total employees: 2" label and the other does not. Every one of the eleven run totals is
  // printed, both channels agree on all of them, and the arithmetic holds -- this is a page the
  // lane has posted unattended since #946.
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { ...PRINTED, "payroll.run.period": value("2026-10") },
    witness: { "payroll.run.employee_count": value("2") },
    witnessVision: { "payroll.run.employee_count": notPrinted() },
  });
  assert.equal(
    doc.receipt.posting.posted, true,
    `a fully printed page still posts: ${JSON.stringify(doc.receipt.posting)}`,
  );

  const v = await verdict(doc.documentId);
  assert.equal(v.rung_vector.channels_agree, "pass", "a witness is not a reading of a figure this entry posts");
  assert.equal(v.rung_vector.completeness_witness, "pass", "…and the rung it does belong to was never reached");

  const entries = await entriesOf(doc.documentId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].flags.payroll_run.posting_basis.kind, "printed_totals");
  assert.equal((await legsOf(entries[0].id)).length, 11, "#946's own eleven legs, from the printed figures");

  // And the same for the harder split: two channels that read two DIFFERENT counts off a page whose
  // totals they agree about. The counts contradict each other, but nothing this entry posts came
  // from either of them.
  const twoCounts = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { ...PRINTED, "payroll.run.period": value("2026-11") },
    witness: { "payroll.run.employee_count": value("2") },
    witnessVision: { "payroll.run.employee_count": value("3") },
  });
  assert.equal(
    twoCounts.receipt.posting.posted, true,
    `…and so does a page whose two channels read the label differently: ${JSON.stringify(twoCounts.receipt.posting)}`,
  );
});

test("W12 · ADV-01: a no-totals page whose witness the channels split on PARKS the question instead of refusing", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: noTotals("2026-12"),
    witness: { "payroll.run.employee_count": value("2") },
    witnessVision: { "payroll.run.employee_count": notPrinted() },
  });
  assert.equal(doc.receipt.posting.posted, false, "no run totals and no readable witness: nothing posts");

  const state = await bankedState(doc.documentId);
  assert.equal(
    state.witness["payroll.run.employee_count"].state, "one_channel_printed",
    "a value against a not_printed is not two readings of one number -- it is one reading and one silence",
  );
  assert.equal(state.completeness.verdict, "absent");

  const v = await verdict(doc.documentId);
  assert.equal(v.rung_vector.channels_agree, "pass", "the eleven answers and every quoted row still agree");
  assert.equal(v.rung, "completeness_witness");
  assert.equal(v.reason, "completeness_unwitnessed");
  assert.equal(v.completeness.parked, true, "a person can settle this by answering, which is the whole point");
  assert.match(v.sentence, /is this every employee for the month\?/);
});

test("W13 · ADV-04: the entry records the STATE version it was judged from, not the plan's own literal", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: noTotals("2027-01"),
    witness: { "payroll.run.employee_count": value("2") },
  });
  assert.equal(doc.receipt.posting.posted, true, `${JSON.stringify(doc.receipt.posting)}`);

  const state = await bankedState(doc.documentId);
  assert.equal(state.state_version, "v2", "mandatory setup: this reading was banked by the successor evaluator");

  const entries = await entriesOf(doc.documentId);
  assert.equal(entries.length, 1);
  assert.equal(
    entries[0].flags.payroll_run.state_version, "v2",
    "0343's own premise is that an auditor reading the LEDGER can tell a stated figure from a " +
      "computed one; an entry claiming evaluator v1 -- which cannot produce a completeness " +
      "verdict at all -- says the opposite of what happened",
  );
  assert.equal(
    entries[0].flags.payroll_run.state_version, state.state_version,
    "the ledger and the reading it came from name ONE version between them",
  );

  // The PLAN's own shape version is a different fact and keeps its own key on the plan.
  const v = await verdict(doc.documentId);
  assert.equal(v.plan.plan_version, "v1", "the drafting body's output shape is still v1");
  assert.equal(v.plan.state_version, "v2", "…and it says which state it drafted from");
});

test("W14 · ADV-02: a HIGH-STAKES run posted from a person's answer is left a DRAFT for a distinct checker", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const firm = await firmOf(world.clients.A1);
  const restore = (
    await rootQuery("select high_stakes_amount_cents as v from clara.firms where id=$1", [firm])
  ).rows[0].v;
  // An ORDINARY firm setting: RM1,000. The run's gross sum is RM5,000, so this is the everyday
  // case, not a contrived floor -- and it is the SAME setting payroll-settlement.test.mjs's S7
  // uses to prove the sibling settlement door leaves its entry a draft.
  await rootQuery("update clara.firms set high_stakes_amount_cents=100000 where id=$1", [firm]);
  try {
    const checkers = (await rootQuery("select clara.eligible_checker_count($1)::int as n", [firm])).rows[0].n;
    assert.ok(checkers >= 2, "the premise: this firm really does have a second pair of eyes available");

    const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2027-02") });
    assert.equal(doc.receipt.posting.posted, false, "mandatory setup: parked, not posted");

    // BOB, a bookkeeper, answers. This is the first human-initiated post the payroll family has
    // ever had, and it is the one case where a second pair of eyes matters most: the figure is
    // not on the page.
    const r = (await answerCompleteness(world.users.bob, { document: doc.documentId, answer: "yes" })).rows[0].r;
    assert.equal(r.answer, "yes", "the answer still stands -- it is a fact about what a person said");
    assert.equal(r.posted, false, "…but one bookkeeper's click does not approve an unlimited payroll entry");
    assert.equal(r.status, "awaiting_checker");
    assert.equal(r.reason, "high_stakes_needs_checker");
    assert.ok(r.entry_id, "the entry EXISTS, balanced and drafted: nothing is dark");

    const e = (
      await rootQuery(
        `select status, maker_actor, checker_actor, last_human_editor, revision_token
           from clara.journal_entries where id=$1`,
        [r.entry_id],
      )
    ).rows[0];
    assert.equal(e.status, "draft");
    assert.equal(e.checker_actor, null, "nobody has checked it");
    assert.equal(
      e.last_human_editor, world.users.bob,
      "and the LEDGER names the human who authorised it on its face, not only inside flags",
    );
    assert.equal((await rootQuery("select clara.is_high_stakes($1) as h", [r.entry_id])).rows[0].h, true);

    // THE RUN IS NOT STUCK. A distinct checker finishes it through the ordinary approve door --
    // the one that carries all three governance arms -- and the sentence a person reads while it
    // waits says so rather than claiming the run is posted.
    const v = await verdict(doc.documentId);
    assert.match(v.sentence, /waiting for a checker/i, `got: ${v.sentence}`);

    const approved = (
      await humanQuery(world.users.alice, "select clara.approve_entry($1,$2,$3,$4) as r", [
        r.entry_id, e.revision_token, null, opk("approve"),
      ])
    ).rows[0].r;
    assert.equal(approved.status, "approved", `${JSON.stringify(approved)}`);
    const after = (await rootQuery("select status, checker_actor from clara.journal_entries where id=$1", [r.entry_id])).rows[0];
    assert.equal(after.status, "approved");
    assert.equal(after.checker_actor, world.users.alice, "a DISTINCT checker, which is the whole point");
  } finally {
    await rootQuery("update clara.firms set high_stakes_amount_cents=$2 where id=$1", [firm, restore]);
  }
});

test("W15 · ADV-06: the parked question names the employer cost the entry a yes books will NOT book", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2027-03") });
  assert.equal(doc.receipt.posting.posted, false, "mandatory setup: parked");

  const v = await verdict(doc.documentId);
  assert.equal(v.completeness.parked, true);
  // The question asked is still the brief's own; what is added is the CONSEQUENCE of answering it,
  // which is what makes the answer a professional judgement rather than a guess.
  assert.match(v.sentence, /is this every employee for the month\?/);
  assert.match(v.sentence, /prints no figure for/, `got: ${v.sentence}`);
  assert.match(v.sentence, /employer's EPF/, `got: ${v.sentence}`);
  assert.match(v.sentence, /employer's SOCSO/);
  assert.match(v.sentence, /employer's EIS/);
  assert.match(v.sentence, /HRDF levy/);
  assert.match(v.sentence, /books none of those/);

  // …and the sentence is TRUE, driven rather than asserted: the entry a yes actually books carries
  // no employer-side leg and no levy leg on either side.
  const r = (await answerCompleteness(world.users.alice, { document: doc.documentId, answer: "yes" })).rows[0].r;
  assert.equal(r.posted, true, `${JSON.stringify(r)}`);
  const legs = await legsOf(r.entry_id);
  assert.deepEqual(
    legs.map((l) => l.account_code),
    ["6000", "2100", "2110", "2120", "2130", "2040"],
    "gross, the four EMPLOYEE deductions and the net -- and nothing else",
  );
  for (const code of ["6010", "6020", "6030", "6040", "2140"]) {
    assert.equal(legs.filter((l) => l.account_code === code).length, 0, `no ${code} leg`);
  }
});

test("W16 · ADV-07: two people answering the same question at once get a NAMED refusal, never a raw 23505", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, { answers: noTotals("2027-04") });
  assert.equal(doc.receipt.posting.posted, false, "mandatory setup: parked");

  // TWO BOOKKEEPERS WORKING THE SAME NEEDS-YOU INBOX -- the ordinary case this row kind exists
  // for. Two real connections (the rig pool hands out one each), two different op keys, so the
  // dedupe belt is not what decides this.
  const [a, b] = await Promise.allSettled([
    answerCompleteness(world.users.alice, { document: doc.documentId, answer: "yes" }),
    answerCompleteness(world.users.bob, { document: doc.documentId, answer: "yes" }),
  ]);
  const winners = [a, b].filter((r) => r.status === "fulfilled");
  const losers = [a, b].filter((r) => r.status === "rejected");
  assert.equal(winners.length, 1, "exactly one answer lands");
  assert.equal(losers.length, 1);

  const err = losers[0].reason;
  assert.doesNotMatch(
    String(err.message), /duplicate key value|payroll_completeness_answers_extraction_id_key/i,
    "the loser must not see an internal database error for the benign cause the lane predicts",
  );
  assert.match(String(err.message), /no parked completeness question/i, `got: ${err.message}`);
  assert.equal(err.code, "CLR10");
  assert.equal(
    JSON.parse(err.detail ?? "{}").reason, "no_parked_completeness_question",
    "…and it carries the discriminant the web refusal mapper already reads",
  );

  // The belt held either way: one entry, one answer row.
  assert.equal((await entriesOf(doc.documentId)).length, 1);
  const answers = (
    await rootQuery("select count(*)::int as n from clara.payroll_completeness_answers where document_id=$1", [
      doc.documentId,
    ])
  ).rows[0].n;
  assert.equal(answers, 1);
});
