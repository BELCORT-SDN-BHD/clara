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
 *  the document and the persist receipt (whose `posting` object says what the read led to). */
async function readPayrollDoc(sub, client, { answers = PRINTED, witness = null, rows = null } = {}) {
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
        envelope: envelope({ channel: "vision", answers, witness, rows }),
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
    answers: NO_TOTALS,
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
