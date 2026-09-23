// Battery for migration 0297_payroll_summary_posting.sql — #946: A PAYROLL SUMMARY THAT HAS BEEN
// READ AND WHOSE ARITHMETIC HOLDS POSTS ITSELF.
//
// Spec of record: issue #946's Agent Brief (the body; its one comment, 2026-09-19, is an AI
// triage coordination note, not an owner ruling, and nothing on this ticket is dated
// 2026-09-20). Parent #926's owner ruling (2026-09-18, option G): "a payroll summary and a
// contract go down the same lane as any other accounting document, read and posted, not merely
// stored." #945 shipped the READING half (migration 0296); this is the DRAFTING AND POSTING half.
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S0. THE STANDARD CHART TEMPLATE — clara.coa_template_accounts at the CURRENT published
//       platform `my_sme_starter` version. AC1's salaries-payable row. Already satisfied on this
//       base by migration 0295 (the wave-4 pre-step that landed the four shared rows once), so
//       this cell is EVIDENCE that AC1 holds, not a slice this ticket drove red.
//   S1. THE DRAFTING BODY — clara._payroll_entry_plan(uuid, jsonb). An established payroll fact
//       state in, the entry the brief describes out: every leg carrying the account it resolved
//       and the basis it resolved from, the employee portions reducing the net-pay credit and
//       never debited to expense, an unprinted line contributing no leg.
//   S2. THE UNATTENDED GATE — clara._payroll_posting_verdict(uuid). The five conditions the brief
//       names, each failure a NAMED, TYPED refusal: channel agreement, every arithmetic check
//       passing, an established month, every account resolving in this client's own chart, and no
//       already-posted payroll entry for that client and month.
//   S3. THE UNATTENDED POST — clara.persist_payroll_facts(uuid, jsonb, jsonb, integer), the door
//       the payroll worker already settles through. A read whose arithmetic holds leaves an
//       APPROVED entry behind it, dated at the end of the payslip's own month, with no human in
//       the loop; a read that fails any condition leaves none.
//   S4. NEEDS YOU — clara.list_review_queue(jsonb, jsonb, integer), the ONE paginated queue the
//       estate ships. A blocked payroll run appears as row_kind='payroll_posting_blocked' naming
//       the condition that failed, and the row clears itself when the block clears.
//   S5. THE UNCODED FILING — the same read's existing `uncoded_filing` row. A filed payroll
//       summary stops appearing as uncoded once its entry exists, through the derived queue
//       itself and with no new dismissal mechanism.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool, buildWorld, upsertAccount } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0297@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_SUMMARY_POSTING !== "1") {
      throw new Error(
        "payroll-summary-posting premise missing (migration 0297 is not applied) -- this is a " +
          "FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/payroll-summary-posting-preintegration-gate.mjs for an estate sweep against a " +
          "chain that predates 0297.",
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
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0297 is not applied");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The worked example — arithmetic done BY HAND here, never by re-running what the database
// runs (WORK-ORDER rule 4: an expected value comes from an independent source of truth).
// The two employee rows are #945's own worked example, unchanged, so the two batteries agree
// about what this document says before they say anything about what it should post.
//
//   row 1   gross 3,000.00   epf 330.00   socso 14.75   eis 5.90   pcb 120.00   net 2,529.35
//   row 2   gross 2,000.00   epf 220.00   socso  9.75   eis 3.90   pcb  40.00   net 1,726.35
//   sums    gross 5,000.00   epf 550.00   socso 24.50   eis 9.80   pcb 160.00   net 4,255.70
//
// The printed totals row adds the four employer-side columns and the levy, which have no
// per-employee counterpart:
//   epf_employer 650.00   socso_employer 51.65   eis_employer 9.80   hrdf_levy 50.00
//
// THE ENTRY THE BRIEF DESCRIBES, worked out by hand from those figures:
//   Dr 6000 Salaries and Wages            500000   (the gross)
//   Dr 6010 EPF Contribution (Employer)    65000
//   Dr 6020 SOCSO Contribution (Employer)   5165
//   Dr 6030 EIS Contribution (Employer)      980
//   Dr 6040 HRDF Levy Expense               5000
//                                        --------
//                                          576145
//   Cr 2100 EPF Payable                   120000   (550.00 employee + 650.00 employer)
//   Cr 2110 SOCSO Payable                   7615   ( 24.50 employee +  51.65 employer)
//   Cr 2120 EIS Payable                     1960   (  9.80 employee +   9.80 employer)
//   Cr 2130 PCB Payable                    16000   (employee only — PCB has no employer side)
//   Cr 2140 HRDF Levy Payable               5000
//   Cr 2040 Salaries Payable              425570   (the net)
//                                        --------
//                                          576145
// The employee EPF/SOCSO/EIS/PCB appear ONLY inside the payable credits: they are deductions
// from gross, never a second expense, and 500000 - (55000 + 2450 + 980 + 16000) = 425570 is the
// same identity holding at run level.
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

/** The entry the brief describes, transcribed from the worked example above. */
const EXPECTED_LEGS = [
  { account_code: "6000", side: "debit", cents: 500000, basis: "payroll.run.gross_pay" },
  { account_code: "6010", side: "debit", cents: 65000, basis: "payroll.run.epf_employer" },
  { account_code: "6020", side: "debit", cents: 5165, basis: "payroll.run.socso_employer" },
  { account_code: "6030", side: "debit", cents: 980, basis: "payroll.run.eis_employer" },
  { account_code: "6040", side: "debit", cents: 5000, basis: "payroll.run.hrdf_levy" },
  { account_code: "2100", side: "credit", cents: 120000, basis: "payroll.run.epf_employee+payroll.run.epf_employer" },
  { account_code: "2110", side: "credit", cents: 7615, basis: "payroll.run.socso_employee+payroll.run.socso_employer" },
  { account_code: "2120", side: "credit", cents: 1960, basis: "payroll.run.eis_employee+payroll.run.eis_employer" },
  { account_code: "2130", side: "credit", cents: 16000, basis: "payroll.run.pcb" },
  { account_code: "2140", side: "credit", cents: 5000, basis: "payroll.run.hrdf_levy" },
  { account_code: "2040", side: "credit", cents: 425570, basis: "payroll.run.net_pay" },
];
const EXPECTED_TOTAL = 576145;

/** The eleven accounts this lane reaches, with the names 0150/0295 seed them under in the
 *  platform standard chart. A client's own chart is what the plan resolves against; this is the
 *  fixture that puts a payroll-capable chart on a rig client. */
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
const opk = (tag) => `p946-${tag}-${Date.now()}-${++opSeq}`;

/** Put a payroll-capable chart on a client THROUGH the real writer door (upsert_account) —
 *  `omit` names codes to leave out, which is how the "one missing an account" cell is built. */
async function seedPayrollChart(sub, client, { omit = [] } = {}) {
  for (const a of PAYROLL_CHART) {
    if (omit.includes(a.code)) continue;
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk("coa") });
  }
}

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

/** The wire shape the answer-vocabulary gate and the evaluator both read (#945's own
 *  `{ payroll: { channel, answers, rows } }`). Every run-level question is answered, because
 *  clara._payroll_answers_ok refuses an envelope that omits one. */
function envelope({ channel = "text", answers = {}, rows = null } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : PRINTED[f];
  return { payroll: { channel, answers: a, rows: rows ?? [payslipRow(1, R1), payslipRow(2, R2)] } };
}

/** The same document read twice, agreeing — the shape the persist door admits. */
function bothChannels({ answers = {}, rows = null } = {}) {
  return [envelope({ channel: "text", answers, rows }), envelope({ channel: "vision", answers, rows })];
}

async function evaluate(textEnv, visionEnv) {
  const r = await rootQuery("select clara.evaluate_payroll_run_state_v1($1::jsonb, $2::jsonb) as state", [
    JSON.stringify(textEnv),
    JSON.stringify(visionEnv),
  ]);
  return r.rows[0].state;
}

async function plan(client, state) {
  const r = await rootQuery("select clara._payroll_entry_plan($1, $2::jsonb) as plan", [
    client,
    JSON.stringify(state),
  ]);
  return r.rows[0].plan;
}

// ---------------------------------------------------------------------------
// S0 — the standard chart template (AC1)
// ---------------------------------------------------------------------------

test("S0 · the standard chart carries a salaries-payable account as an ordinary liability with no class", async (t) => {
  if (unready(t)) return;

  // The CURRENT published platform template, resolved by state and version rather than by a
  // pinned id, so this cell keeps reading the live standard chart after any later version.
  const rows = (
    await rootQuery(
      `select a.account_code, a.name, a.account_type, a.account_class, a.special_acc_type, a.statutory
         from clara.coa_template_accounts a
         join clara.coa_templates t on t.id = a.template_id
        where t.template_key = 'my_sme_starter' and t.scope = 'platform' and t.state = 'published'
          and a.account_code = '2040'`,
    )
  ).rows;
  assert.equal(rows.length, 1, "exactly one salaries-payable row on the published standard chart");
  assert.equal(rows[0].name, "Salaries Payable");
  assert.equal(rows[0].account_type, "liability", "an ordinary liability");
  assert.equal(rows[0].account_class, null, "…with NO class: deliberately not a control account");
  assert.equal(rows[0].special_acc_type, null);
  assert.equal(rows[0].statutory, null, "salaries payable is not a statutory payable");
});

// ---------------------------------------------------------------------------
// S1 — the drafting body
// ---------------------------------------------------------------------------

test("S1 · a clean payroll fact state becomes the eleven-leg entry, and it balances", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const [textEnv, visionEnv] = bothChannels();
  const state = await evaluate(textEnv, visionEnv);
  assert.deepEqual(state.disagreed, [], "mandatory setup: this state is clean before the plan reads it");

  const p = await plan(world.clients.A1, state);

  assert.equal(p.ready, true, `the plan drafts from an established state: ${JSON.stringify(p.refusals)}`);
  assert.equal(Number(p.debit_cents), EXPECTED_TOTAL, "the debits are the worked example's own total");
  assert.equal(Number(p.credit_cents), EXPECTED_TOTAL, "…and the entry balances exactly, with no rounding leg");
  assert.equal(p.posting_date, "2026-08-31", "the entry is dated at the END of the payslip's own month");
  assert.equal(p.period_month, "2026-08-01");

  const got = p.legs.map((l) => ({
    account_code: l.account_code,
    side: l.side,
    cents: Number(l.cents),
    basis: l.basis,
  }));
  assert.deepEqual(got, EXPECTED_LEGS, "every leg, in the brief's own order, with the basis it resolved from");

  for (const leg of p.legs) {
    const seeded = PAYROLL_CHART.find((a) => a.code === leg.account_code);
    assert.equal(
      leg.account_name,
      seeded.name,
      `leg ${leg.account_code} carries the account it RESOLVED in this client's own chart`,
    );
  }
});

test("S1 · a line the document does not print produces no leg — never a zero one", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The same payslip with no HRDF levy line printed. Both the levy EXPENSE and the levy PAYABLE
  // come off, and nothing else moves.
  const [textEnv, visionEnv] = bothChannels({ answers: { "payroll.run.hrdf_levy": notPrinted() } });
  const p = await plan(world.clients.A1, await evaluate(textEnv, visionEnv));

  assert.equal(p.ready, true, `an unprinted line is a lawful reading, not a refusal: ${JSON.stringify(p.refusals)}`);
  const codes = p.legs.map((l) => l.account_code);
  assert.equal(codes.includes("6040"), false, "no HRDF levy expense leg");
  assert.equal(codes.includes("2140"), false, "…and no HRDF levy payable leg");
  assert.equal(codes.length, 9, `the other nine legs are untouched: ${JSON.stringify(codes)}`);
  assert.deepEqual(p.unprinted, ["payroll.run.hrdf_levy"], "the plan SAYS what the page was silent about");

  // 576145 - 5000 (the levy debit) = 571145 on both sides, by hand from the worked example.
  assert.equal(Number(p.debit_cents), 571145);
  assert.equal(Number(p.credit_cents), 571145);

  // A printed ZERO is the same answer as silence for posting purposes — a zero-cent line moves
  // nothing and would assert a levy the page priced at nothing.
  const [zText, zVision] = bothChannels({ answers: { "payroll.run.hrdf_levy": value("0.00") } });
  const z = await plan(world.clients.A1, await evaluate(zText, zVision));
  assert.equal(z.legs.map((l) => l.account_code).includes("6040"), false, "a printed 0.00 levy books no leg either");
  assert.equal(Number(z.debit_cents), 571145);
});

test("S1 · the employee portions reduce the net-pay credit and are never debited to expense", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const [textEnv, visionEnv] = bothChannels();
  const p = await plan(world.clients.A1, await evaluate(textEnv, visionEnv));

  // NO debit anywhere carries an employee-side figure. 55000/2450/980/16000 are the four
  // employee deductions from the worked example; expensing any of them twice is the defect this
  // cell exists to catch.
  const debitCents = p.legs.filter((l) => l.side === "debit").map((l) => Number(l.cents));
  for (const employee of [55000, 2450, 16000]) {
    assert.equal(
      debitCents.includes(employee),
      false,
      `no debit leg carries the employee-side figure ${employee}: ${JSON.stringify(debitCents)}`,
    );
  }
  // …and NO debit leg's basis names an employee-side question at all. (The figure test above
  // deliberately skips 980: employee EIS and employer EIS are both 9.80 on this document, so a
  // cell that read the employer debit as an employee figure would be reading a coincidence. The
  // basis test below is the one that binds for that column.)
  for (const leg of p.legs.filter((l) => l.side === "debit")) {
    assert.equal(
      /employee|payroll\.run\.pcb/.test(leg.basis),
      false,
      `debit leg ${leg.account_code} resolved from ${leg.basis}, which is an employee-side deduction`,
    );
  }

  // The payable credits carry BOTH portions, and the net credit is the gross less the four
  // employee deductions — which is the same identity, read off the plan.
  const credit = (code) => Number(p.legs.find((l) => l.account_code === code).cents);
  assert.equal(credit("2100"), 120000, "EPF payable is employee 550.00 + employer 650.00");
  assert.equal(credit("2130"), 16000, "PCB payable is the employee deduction alone — PCB has no employer side");
  assert.equal(credit("2040"), 425570, "salaries payable is the NET, never the gross");
  const grossLeg = p.legs.find((l) => l.account_code === "6000");
  assert.equal(Number(grossLeg.cents) - (55000 + 2450 + 980 + 16000), credit("2040"));
});

test("S1 · an account the client's own chart does not hold is a named refusal, and nothing is drafted on a substitute", async (t) => {
  if (unready(t)) return;

  // A client whose chart is payroll-capable EXCEPT for salaries payable — the case a client born
  // before 0295's template version is in.
  await seedPayrollChart(world.users.alice, world.clients.A2, { omit: ["2040"] });
  const [textEnv, visionEnv] = bothChannels();
  const p = await plan(world.clients.A2, await evaluate(textEnv, visionEnv));

  assert.equal(p.ready, false, "a run whose net has nowhere to go does not draft");
  assert.deepEqual(p.missing_accounts, ["2040"], "the plan names the account it could not resolve");
  const refusal = p.refusals.find((r) => r.reason === "account_missing");
  assert.ok(refusal, `a NAMED, typed refusal: ${JSON.stringify(p.refusals)}`);
  assert.equal(refusal.detail.account_code, "2040", "…carrying the code, so a person can add exactly that account");
  assert.equal(
    p.legs.some((l) => l.basis === "payroll.run.net_pay"),
    false,
    "the net leg is ABSENT — it is never re-pointed at some other liability the client does hold",
  );
  // And the imbalance the missing leg causes is NOT reported as an imbalance: a missing account
  // reports itself as a missing account, or a reader chases the wrong defect.
  assert.equal(p.refusals.some((r) => r.reason === "entry_unbalanced"), false);
});

test("S1 · the month comes from the page, in every rendering the lane admits — and an ambiguous one is refused", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);

  // Every admitted rendering of the SAME month lands on the same last-day posting date.
  for (const raw of ["2026-08", "2026/08", "08/2026", "8-2026", "2026-08-15", "August 2026", "Aug 2026", "AUGUST, 2026", "2026 August"]) {
    const [tx, vx] = bothChannels({ answers: { "payroll.run.period": value(raw) } });
    const p = await plan(world.clients.A1, await evaluate(tx, vx));
    assert.equal(p.posting_date, "2026-08-31", `"${raw}" is the August 2026 run: ${JSON.stringify(p.refusals)}`);
    assert.equal(p.period_month, "2026-08-01");
  }

  // A month Clara cannot establish is ASKED, never assumed — and an all-numeric triple is
  // exactly such a case, because 08/09/2026 cannot be told apart from its own reversal.
  for (const raw of ["08/09/2026", "2026", "August", "Q3 2026", "Aug-Sep 2026", "Augustus 2026"]) {
    const [tx, vx] = bothChannels({ answers: { "payroll.run.period": value(raw) } });
    const p = await plan(world.clients.A1, await evaluate(tx, vx));
    assert.equal(p.ready, false, `"${raw}" must not establish a month`);
    assert.equal(p.posting_date, null, "…and no posting date is invented");
    const refusal = p.refusals.find((r) => r.reason === "period_not_established");
    assert.ok(refusal, `a NAMED refusal for "${raw}": ${JSON.stringify(p.refusals)}`);
    assert.equal(refusal.detail.period_raw, raw, "…quoting back the rendering the page carries");
  }

  // A page that prints no period at all is the same refusal, with the reading that produced it.
  const [nt, nv] = bothChannels({ answers: { "payroll.run.period": notPrinted() } });
  const none = await plan(world.clients.A1, await evaluate(nt, nv));
  assert.equal(none.ready, false);
  assert.equal(none.refusals.find((r) => r.reason === "period_not_established").detail.period_state, "not_printed");
});

test("S1 · a run whose totals the page does not print has nothing to post, and says so", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The summary page that prints per-employee rows but NO totals row: 0296's evaluator marks
  // every run-level question `not_printed` and offers a row sum instead. This lane does not post
  // from that sum — the evaluator's own verdict is what it drafts from.
  const silent = Object.fromEntries(RUN_FIELDS.map((f) => [f, notPrinted()]));
  const [tx, vx] = bothChannels({ answers: silent });
  const state = await evaluate(tx, vx);
  assert.equal(
    String(state.facts["payroll.run.gross_pay"].computed_cents),
    "500000",
    "mandatory setup: the evaluator DID sum the rows — this cell is about what the lane posts, not what it read",
  );

  const p = await plan(world.clients.A1, state);
  assert.equal(p.ready, false);
  assert.deepEqual(
    p.refusals.filter((r) => r.reason === "run_totals_not_printed").map((r) => r.detail.field).sort(),
    ["payroll.run.gross_pay", "payroll.run.net_pay"],
    "both totals without which there is no entry are named",
  );
  assert.deepEqual(p.legs, [], "and nothing at all is drafted");
});

// ---------------------------------------------------------------------------
// S2 — the unattended gate
//
// From here on the cells drive REAL documents: filed through the real doors, routed into the
// payroll lane by the real router, claimed as a real task and settled through the real persist
// door. Nothing below writes an extraction, a region or a task by surgery.
// ---------------------------------------------------------------------------

/** The typed witness_extraction consent is granted ONCE per client (the grant door refuses a
 *  second live consent for the same purpose), so this asks before it grants. */
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
 *  the document and the persist receipt. */
async function readPayrollDoc(sub, client, { answers = {}, rows = null, visionAnswers = null } = {}) {
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

  const textEnv = envelope({ channel: "text", answers, rows });
  const visionEnv = envelope({ channel: "vision", answers: visionAnswers ?? answers, rows });
  const receipt = (
    await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({ input_pin: doc.extractionId, prompt_hash: "p946-text", envelope: textEnv }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p946-vision", envelope: visionEnv }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, taskId: task.id, receipt };
}

async function verdict(documentId) {
  const r = await rootQuery("select clara._payroll_posting_verdict($1) as v", [documentId]);
  return r.rows[0].v;
}

const entriesOf = async (documentId) =>
  (
    await rootQuery(
      `select id, status, posting_date::text as posting_date, origin, memo, flags, filing_id,
              document_id, maker_actor, checker_actor
         from clara.journal_entries where document_id=$1 order by created_at`,
      [documentId],
    )
  ).rows;

test("S2 · a clean run is READY, and the verdict carries the entry it would post", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1);

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "ready", `every condition holds: ${JSON.stringify(v.rung_vector)}`);
  assert.equal(v.reason, null);
  assert.equal(v.rung, null);
  assert.equal(v.client_id, world.clients.A1);
  assert.equal(v.posting_date, "2026-08-31", "the END of the payslip's own month");
  assert.equal(Number(v.plan.debit_cents), EXPECTED_TOTAL);
  assert.equal(v.plan.legs.length, 11);
  // EVERY rung is evaluated, not just up to the first pass: a vector with a missing key is how
  // a gate fails open (the invoice lane's own D26 lesson).
  for (const rung of ["filed", "facts_read", "channels_agree", "arithmetic_holds", "period_established",
    "run_totals_printed", "accounts_resolve", "entry_balances"]) {
    assert.equal(v.rung_vector[rung], "pass", `rung ${rung} must carry an explicit verdict`);
  }
});

test("S2 · two channels that read a figure differently never post, and the gate names the question", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The text channel read PCB as 160.00; the vision channel read 180.00. Everything else agrees.
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    visionAnswers: { "payroll.run.pcb": value("180.00") },
  });

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "channels_agree", `the FIRST failing condition: ${JSON.stringify(v.rung_vector)}`);
  assert.equal(v.reason, "channels_disagree");
  assert.deepEqual(v.detail.fields, ["payroll.run.pcb"], "…naming the question the two readings differ on");
  assert.equal(v.rung_vector.channels_agree, "channels_disagree");
});

test("S2 · a row that does not balance never posts, and the gate names the row", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // Row 2's own identity fails: gross 2,000.00 less 273.65 of deductions is 1,726.35, not
  // 1,700.00. The page contradicts itself, and nothing is posted on a page that does.
  const broken = { ...R2, net: "1,700.00" };
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    rows: [payslipRow(1, R1), payslipRow(2, broken)],
  });

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "arithmetic_holds", `${JSON.stringify(v.rung_vector)}`);
  assert.equal(v.reason, "arithmetic_failed");
  assert.deepEqual(v.detail.unbalanced_rows, [2], "…naming WHICH row did not balance");
  assert.equal((await entriesOf(doc.documentId)).length, 0, "and no entry exists for this document at all");
});

test("S2 · a printed total the rows contradict never posts", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // The rows sum to 5,000.00 gross; the totals row prints 5,100.00. Both readings agree about
  // the contradiction, which is exactly why it is an ARITHMETIC failure and not a channel one.
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.gross_pay": value("5,100.00") },
  });

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "arithmetic_holds");
  assert.equal(v.reason, "arithmetic_failed");
  assert.deepEqual(v.detail.fields, ["payroll.run.gross_pay"], "…naming the total that contradicts its rows");
});

test("S2 · a month the page does not establish asks instead of posting", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": notPrinted() },
  });

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "period_established");
  assert.equal(v.reason, "period_not_established");
  assert.equal(v.posting_date, null, "no date is invented for a month nobody established");
  assert.equal((await entriesOf(doc.documentId)).length, 0);
});

test("S2 · an account this client's chart does not hold never posts, and the gate names the code", async (t) => {
  if (unready(t)) return;

  // world.clients.B1 belongs to firm B and has never been given a payroll chart.
  const doc = await readPayrollDoc(world.users.dave, world.clients.B1);

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "accounts_resolve");
  assert.equal(v.reason, "account_missing");
  assert.ok(v.detail.missing_accounts.includes("6000"), `${JSON.stringify(v.detail)}`);
  assert.ok(v.detail.missing_accounts.includes("2040"), "…including the salaries-payable row this lane needs");
});

test("S2 · a document that was never read has no verdict to give, and says so", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await payrollDoc(world.users.alice, world.clients.A1);

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "blocked");
  assert.equal(v.rung, "facts_read");
  assert.equal(v.reason, "payroll_not_read");
  assert.equal(v.rung_vector.filed, "pass", "it IS filed — the gate distinguishes unfiled from unread");
});
