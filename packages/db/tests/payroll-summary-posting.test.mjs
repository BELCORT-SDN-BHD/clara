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
import { rootQuery, ensureReady, endPool, buildWorld, upsertAccount, draftEntry, approveEntry, freshResolution, human } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { fiscalYear } from "./depreciation-history-fixtures.mjs";
import { listReviewQueue } from "./wave-a-reads.mjs";

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
  // every run-level question `not_printed` and offers a row sum instead.
  //
  // WHAT #1048 (migration 0343) CHANGED HERE, and why this cell's expectation moved. Until 0343
  // this lane refused such a page `run_totals_not_printed` outright, and 0297 §C's own header said
  // the row sum was deliberately left unused because "whether the owner wants a row sum admitted
  // as a posting basis is a product question this ticket does not answer for them." #1048 is that
  // answer (the ruling on #946, 2026-09-24): the sum IS a posting basis when the page witnesses
  // its own completeness, and when it does not the lane PARKS A QUESTION instead of refusing. This
  // page prints no witness, so the refusal it now earns is `completeness_unwitnessed` — the parked
  // question — and `run_totals_not_printed` is reserved for a page that has no sum to offer at all
  // (the cell below). Nothing is posted either way, which is what this cell has always been about.
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
    p.refusals.map((r) => r.reason).sort(),
    ["completeness_unwitnessed", "period_not_established"],
    "the page prints no month and no completeness witness, and BOTH are named",
  );
  assert.deepEqual(p.legs, [], "and nothing at all is drafted");
});

test("S1b · #1048: a page with no rows to sum is still `run_totals_not_printed` — the parked question needs a sum to be about", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  // No totals row AND no employee rows: there is no figure anywhere on this page, so there is
  // nothing to ask a person about. The refusal 0297 shipped is still the right one, and this cell
  // is what keeps #1048's widening from swallowing it.
  const silent = Object.fromEntries(RUN_FIELDS.map((f) => [f, notPrinted()]));
  silent["payroll.run.period"] = value("2026-08");
  const [tx, vx] = bothChannels({ answers: silent, rows: [] });
  const state = await evaluate(tx, vx);
  assert.equal(
    state.facts["payroll.run.gross_pay"].computed_cents,
    null,
    "mandatory setup: with no quoted rows the evaluator computes nothing",
  );

  const p = await plan(world.clients.A1, state);
  assert.equal(p.ready, false);
  assert.deepEqual(
    p.refusals.filter((r) => r.reason === "run_totals_not_printed").map((r) => r.detail.field).sort(),
    ["payroll.run.gross_pay", "payroll.run.net_pay"],
    "both totals without which there is no entry are named",
  );
  assert.equal(
    p.refusals.some((r) => r.reason.startsWith("completeness_")),
    false,
    "…and no completeness question is parked about a page that offers no sum",
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

/** Every payroll-run entry this lane has posted for a client, newest last. */
const payrollEntriesOf = async (client) =>
  (
    await rootQuery(
      `select id, status, posting_date::text as posting_date, memo, flags
         from clara.journal_entries
        where client_id=$1 and status='approved' and reversed_by is null
          and flags ? 'payroll_run' order by created_at`,
      [client],
    )
  ).rows;

const entriesOf = async (documentId) =>
  (
    await rootQuery(
      `select id, status, posting_date::text as posting_date, origin, memo, flags, filing_id,
              document_id, maker_actor, checker_actor
         from clara.journal_entries where document_id=$1 order by created_at`,
      [documentId],
    )
  ).rows;

test("S2 · the verdict is DERIVED: a run blocked by a missing account reads READY the moment the chart gains it", async (t) => {
  if (unready(t)) return;

  // The gate stores nothing, so its answer is always about the estate as it is NOW. This cell
  // drives that end to end: a client whose chart lacks salaries payable reads a payslip, the run
  // is blocked, a person adds the account through the ordinary chart door, and the SAME document
  // now reads ready — with no re-extraction, no dismissal and nothing to clean up.
  await seedPayrollChart(world.users.alice, world.clients.A2, { omit: ["2040"] });
  const doc = await readPayrollDoc(world.users.alice, world.clients.A2, {
    answers: { "payroll.run.period": value("2026-01") },
  });

  const blocked = await verdict(doc.documentId);
  assert.equal(blocked.verdict, "blocked");
  assert.equal(blocked.rung, "accounts_resolve", `${JSON.stringify(blocked.rung_vector)}`);
  assert.equal(doc.receipt.posting.posted, false, "…so the read posted nothing");

  await upsertAccount(world.users.alice, {
    client: world.clients.A2, code: "2040", name: "Salaries Payable", type: "liability", opKey: opk("coa-fix"),
  });

  const v = await verdict(doc.documentId);
  assert.equal(v.verdict, "ready", `every condition now holds: ${JSON.stringify(v.rung_vector)}`);
  assert.equal(v.reason, null);
  assert.equal(v.rung, null);
  assert.equal(v.client_id, world.clients.A2);
  assert.equal(v.posting_date, "2026-01-31", "the END of the payslip's own month");
  assert.equal(Number(v.plan.debit_cents), EXPECTED_TOTAL);
  assert.equal(v.plan.legs.length, 11);
  // EVERY rung is evaluated, not just up to the first pass: a vector with a missing key is how a
  // gate fails open (the invoice lane's own D26 lesson).
  for (const rung of ["filed", "facts_read", "channels_agree", "arithmetic_holds", "period_established",
    "period_open", "run_totals_printed", "accounts_resolve", "entry_balances", "no_duplicate_entry"]) {
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

// ---------------------------------------------------------------------------
// S3 — the unattended post
// ---------------------------------------------------------------------------

const linesOf = async (entryId) =>
  (
    await rootQuery(
      `select line_no, account_code, debit_cents::bigint as debit_cents,
              credit_cents::bigint as credit_cents, description, counterparty_id
         from clara.journal_lines where entry_id=$1 order by line_no`,
      [entryId],
    )
  ).rows;

test("S3 · a payroll summary whose arithmetic holds posts itself, with no human in the loop", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1);

  // The READ's own settle receipt says what the read led to.
  assert.equal(doc.receipt.posting.posted, true, `the run posted: ${JSON.stringify(doc.receipt.posting)}`);
  assert.ok(doc.receipt.posting.entry_id);

  const entries = await entriesOf(doc.documentId);
  assert.equal(entries.length, 1, "exactly one entry, and nobody drafted a second");
  const e = entries[0];
  assert.equal(e.status, "approved", "POSTED, not left as a draft for a person to approve");
  assert.equal(e.origin, "document", "…as a document entry");
  assert.equal(e.posting_date, "2026-08-31", "dated at the END of the payslip's own month");
  assert.equal(e.memo, "Payroll run August 2026");
  assert.ok(e.filing_id, "bound to the document's own filing — which is what clears the uncoded row");
  assert.equal(e.flags.payroll_run.period_month, "2026-08-01", "the marker the duplicate guard reads");

  // The actor is the estate's agent identity on BOTH sides: nobody was asked, and nobody
  // approved by hand.
  const agent = (await rootQuery("select clara.agent_user_id() as id")).rows[0].id;
  assert.equal(e.maker_actor, agent);
  assert.equal(e.checker_actor, agent);

  // THE LEGS, against the worked example rather than against what the plan said.
  const lines = await linesOf(e.id);
  assert.equal(lines.length, 11, `eleven legs: ${JSON.stringify(lines.map((l) => l.account_code))}`);
  const got = lines.map((l) => ({
    account_code: l.account_code,
    side: Number(l.debit_cents) > 0 ? "debit" : "credit",
    cents: Number(l.debit_cents) > 0 ? Number(l.debit_cents) : Number(l.credit_cents),
  }));
  assert.deepEqual(got, EXPECTED_LEGS.map(({ account_code, side, cents }) => ({ account_code, side, cents })));
  assert.equal(
    got.filter((l) => l.side === "debit").reduce((a, l) => a + l.cents, 0),
    EXPECTED_TOTAL,
    "…and the posted entry balances at the worked example's own total",
  );
  assert.equal(
    lines.some((l) => l.counterparty_id !== null),
    false,
    "no leg carries a counterparty: salaries payable is deliberately not a control account",
  );

  // THE RECEIPT. An agent-approved entry owes exactly one; this is the document-shaped one, and
  // it names the lane that posted rather than borrowing the invoice lane's.
  const receipts = (
    await rootQuery(
      `select via_wake_kind, approval_arm, acting_actor, on_behalf_of, model_snapshot,
              gate_verdicts, maker_active_at_approval, rationale
         from clara.entry_post_receipts where entry_id=$1`,
      [e.id],
    )
  ).rows;
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].via_wake_kind, "payroll_facts");
  assert.equal(receipts[0].approval_arm, "payroll_unattended");
  assert.equal(receipts[0].on_behalf_of, null, "nobody was acted for");
  assert.equal(receipts[0].model_snapshot.provider, "clara_db", "no model took part in the POST");
  assert.ok(receipts[0].gate_verdicts.extraction_id, "…but the reading it posted from is named");
  assert.equal(receipts[0].gate_verdicts.rung_vector.accounts_resolve, "pass");
  assert.equal(
    (
      await rootQuery("select count(*)::int as n from clara.operation_receipts where effects->>'entry_id'=$1", [e.id])
    ).rows[0].n,
    0,
    "…and NOT an operation-shaped one as well: exactly one writer claims this post",
  );

  // THE EVENT.
  const events = (
    await rootQuery(
      "select event_type, payload, actor from clara.domain_events where entry_id=$1 order by seq",
      [e.id],
    )
  ).rows;
  assert.equal(events.filter((x) => x.event_type === "entry.posted").length, 1);
  assert.equal(events.find((x) => x.event_type === "entry.posted").payload.approval_arm, "payroll_unattended");
});

test("S3 · a run the gate blocks leaves no entry and tells the read why", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    visionAnswers: { "payroll.run.socso_employer": value("99.99") },
  });

  assert.equal(doc.receipt.status, "done", "the READ still settles — a blocked post never loses the facts");
  assert.equal(doc.receipt.posting.posted, false);
  assert.equal(doc.receipt.posting.reason, "channels_disagree");
  assert.equal(doc.receipt.posting.rung, "channels_agree");
  assert.equal(doc.receipt.posting.entry_id, null);

  assert.equal((await entriesOf(doc.documentId)).length, 0, "nothing at all was written");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.entry_post_receipts r join clara.journal_entries j on j.id=r.entry_id where j.document_id=$1", [doc.documentId])).rows[0].n,
    0,
    "…and no receipt: a receipt is written for a POST, never for a refusal",
  );
  // The facts themselves are all there, which is the whole point of refusing rather than raising.
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.document_regions r join clara.document_extractions e on e.id=r.extraction_id where e.document_id=$1 and e.engine_kind='payroll_text_facts'", [doc.documentId])).rows[0].n,
    RUN_FIELDS.length,
    "the eleven typed facts a person needs in order to clear the block are banked",
  );
});

test("S3 · a payroll run whose month falls in a closed year is not posted", async (t) => {
  if (unready(t)) return;

  // Firm S / client S1 owns this cell: clara.fiscal_years is append-only, so a closed year on a
  // shared client would follow every other cell around.
  await seedPayrollChart(world.users.erin, world.clients.S1);
  const firmS = await firmOf(world.clients.S1);
  await fiscalYear(firmS, world.clients.S1, {
    startsOn: "2026-01-01", endsOn: "2026-12-31", status: "closed", owner: world.users.erin,
  });

  const doc = await readPayrollDoc(world.users.erin, world.clients.S1);
  assert.equal(doc.receipt.posting.posted, false);
  assert.equal(doc.receipt.posting.rung, "period_open", `${JSON.stringify(doc.receipt.posting.rung_vector)}`);
  assert.equal(doc.receipt.posting.reason, "period_closed");
  assert.equal((await entriesOf(doc.documentId)).length, 0);

  const v = await verdict(doc.documentId);
  assert.equal(v.detail.closed_fiscal_year.status, "closed", "the gate names the year that is shut");
});

// ---------------------------------------------------------------------------
// S2 (continued) — the duplicate guard (AC4)
//
// These cells run AFTER the clean post above, deliberately: the August 2026 run for
// world.clients.A1 is already on the books by the time they start, which is the real state a
// re-upload arrives in.
// ---------------------------------------------------------------------------

test("S2 · a second upload of the same month never posts, and the refusal points at the entry that exists", async (t) => {
  if (unready(t)) return;

  // The August 2026 run for this client was posted by the cell above. What arrives now is the
  // SAME month on a DIFFERENT document — a re-upload, or a corrected payslip somebody re-filed.
  const posted = (await payrollEntriesOf(world.clients.A1)).filter(
    (e) => e.flags?.payroll_run?.period_month === "2026-08-01",
  );
  assert.equal(posted.length, 1, "mandatory setup: exactly one August 2026 payroll entry is already posted");

  const again = await readPayrollDoc(world.users.alice, world.clients.A1);

  assert.equal(again.receipt.posting.posted, false, "the second upload does NOT post");
  assert.equal(again.receipt.posting.rung, "no_duplicate_entry");
  assert.equal(again.receipt.posting.reason, "duplicate_entry");
  assert.equal((await entriesOf(again.documentId)).length, 0, "…and leaves no entry of its own");

  const v = await verdict(again.documentId);
  assert.equal(
    v.existing_entry_id,
    posted[0].id,
    "the guard POINTS AT the entry that already exists, so a person can tell a correction from a re-upload",
  );
  assert.equal(v.detail.duplicate.scope, "same_month_payroll_run");
  assert.equal(v.detail.duplicate.posting_date, "2026-08-31", "…with the date it was posted on");
  assert.equal(v.detail.duplicate.memo, "Payroll run August 2026");

  // Every earlier rung still passed: this run is BLOCKED because it is a duplicate, not because
  // anything about the document itself was wrong.
  for (const rung of ["channels_agree", "arithmetic_holds", "period_established", "period_open",
    "run_totals_printed", "accounts_resolve", "entry_balances"]) {
    assert.equal(v.rung_vector[rung], "pass", `rung ${rung}`);
  }

  // A DIFFERENT month on the same client is not a duplicate at all.
  const july = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": value("July 2026") },
  });
  assert.equal(july.receipt.posting.posted, true, `a different month posts: ${JSON.stringify(july.receipt.posting)}`);
  assert.equal(july.receipt.posting.posting_date, "2026-07-31");
});

test("S2 · an obligation already booked through the periodic-adjustment lane blocks the same month too", async (t) => {
  if (unready(t)) return;

  // `0194_periodic_adjustments.sql` (#643) books a statutory payroll obligation through the
  // accounting-Work lane and stamps `flags->'payroll_obligation'` with the period it covers
  // (0225:1830). A client whose September obligation was booked THAT way must not get a second,
  // conflicting entry when a September payslip is read — the guard sees both lanes, not only
  // its own.
  //
  // LABELLED FIXTURE: the entry is built through the real draft/approve doors and its marker is
  // stamped while it is still a DRAFT, which is the only window `clara._tf_entry_immutable`
  // admits a `flags` change. Driving the whole Work admission ceremony (admit_periodic_
  // adjustment_work, its intent key, its bundle digest and its operation receipt) would add a
  // hundred lines of fixture that prove nothing this cell claims: what is under test is whether
  // THIS lane's guard reads that marker.
  await seedPayrollChart(world.users.alice, world.clients.A1);
  const resolution = await freshResolution(world.users.alice, world.clients.A1);
  const drafted = await draftEntry(human(world.users.alice), {
    client: world.clients.A1,
    resolution,
    postingDate: "2026-09-30",
    memo: "September 2026 statutory payroll obligation (periodic adjustment lane)",
    lines: [
      { account_code: "6000", debit_cents: 100000, credit_cents: 0, description: "wages" },
      { account_code: "2040", debit_cents: 0, credit_cents: 100000, description: "payable" },
    ],
    opKey: opk("obl-draft"),
  });
  await rootQuery(
    `update clara.journal_entries
        set flags = jsonb_build_object('payroll_obligation', jsonb_build_object(
              'period_start','2026-09-01','period_end','2026-09-30','obligation_kind','epf'))
      where id=$1 and status='draft'`,
    [drafted.entry_id],
  );
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id]))
    .rows[0].revision_token;
  await approveEntry(world.users.bob, {
    entry: drafted.entry_id,
    expectedRevision: token,
    opKey: opk("obl-approve"),
  });

  const sept = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": value("September 2026") },
  });
  assert.equal(sept.receipt.posting.posted, false, "the payslip does not double-book the month");
  assert.equal(sept.receipt.posting.reason, "duplicate_entry");

  const v = await verdict(sept.documentId);
  assert.equal(v.detail.duplicate.scope, "payroll_obligation", "…and says WHICH lane already booked it");
  assert.equal(v.existing_entry_id, drafted.entry_id, "pointing at that lane's own entry");
});

// ---------------------------------------------------------------------------
// S4 / S5 — Needs you, and the uncoded filing
// ---------------------------------------------------------------------------

async function queueRows(sub, client) {
  const env = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 200 });
  return env.rows;
}

test("S4 · a blocked payroll run appears under Needs you naming the condition that failed", async (t) => {
  if (unready(t)) return;

  // world.clients.B1 has no payroll chart at all, so its run is blocked on an account it does
  // not hold — a condition a person can actually clear.
  const doc = await readPayrollDoc(world.users.dave, world.clients.B1, {
    answers: { "payroll.run.period": value("2026-03") },
  });
  assert.equal(doc.receipt.posting.posted, false, "mandatory setup: the run is blocked");

  const rows = (await queueRows(world.users.dave, world.clients.B1))
    .filter((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === doc.documentId);
  assert.equal(rows.length, 1, "exactly one row for this run, never one per condition");
  const row = rows[0];
  assert.equal(row.section, "needs_you", "a person must act before this month can be booked");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.client_id, world.clients.B1);
  assert.ok(row.filing_id, "…pointing at the filing the payslip was filed under");
  assert.equal(row.period, "2026-03-01", "…and at the month the payslip covers");
  assert.match(row.question_text, /account/i, `the row NAMES the condition: ${row.question_text}`);
  assert.match(row.question_text, /6000/, "…down to the account code a person must add");
});

test("S4 · the row names whichever condition failed, and clears itself when the block clears", async (t) => {
  if (unready(t)) return;

  // A DIFFERENT condition on a fully-charted client: the two channels read the levy differently.
  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": value("2026-04") },
    visionAnswers: { "payroll.run.period": value("2026-04"), "payroll.run.hrdf_levy": value("70.00") },
  });
  assert.equal(doc.receipt.posting.reason, "channels_disagree", "mandatory setup");

  const row = (await queueRows(world.users.alice, world.clients.A1))
    .find((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === doc.documentId);
  assert.ok(row, "the run is on the queue");
  assert.match(row.question_text, /read.*differently|disagree/i, `${row.question_text}`);
  assert.match(row.question_text, /hrdf_levy/, "…naming the question the two readings differ on");

  // THE ROW IS DERIVED AND SELF-CLEARING: retiring the filing removes the run from the queue on
  // the next read, with no dismissal act anywhere and nothing left behind to reconcile.
  await rootQuery("update clara.document_filings set retired_at=now(), retired_by=$2, retirement_reason='p946 cell' where document_id=$1 and retired_at is null",
    [doc.documentId, world.users.alice]);
  const after = (await queueRows(world.users.alice, world.clients.A1))
    .filter((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === doc.documentId);
  assert.deepEqual(after, [], "the row is gone — nothing was dismissed, because nothing was stored");
});

test("S4 · a payroll run that POSTED leaves no blocked row behind", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: { "payroll.run.period": value("2026-05") },
  });
  assert.equal(doc.receipt.posting.posted, true, "mandatory setup: this one posts");

  const rows = (await queueRows(world.users.alice, world.clients.A1))
    .filter((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === doc.documentId);
  assert.deepEqual(rows, [], "a posted run is not a blocked run");
});

test("S5 · the filed payroll summary stops appearing as uncoded once its entry exists", async (t) => {
  if (unready(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);

  // BEFORE: a filed payroll summary that has not been read yet is uncoded, exactly as any other
  // codeable document is — nothing about this ticket changes that.
  const doc = await payrollDoc(world.users.alice, world.clients.A1);
  const before = (await queueRows(world.users.alice, world.clients.A1))
    .filter((r) => r.row_kind === "uncoded_filing" && r.document_id === doc.documentId);
  assert.equal(before.length, 1, "a filed, unread payroll summary is an uncoded filing");

  // Read it. The run posts, and the filing now carries an approved entry.
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      `select id from clara.document_processing_tasks
        where document_id=$1 and lane='payroll_facts' and status='queued' order by version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0];
  await claimTask(task.id, { egressApproved: true });
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  const answers = { "payroll.run.period": value("2026-06") };
  const receipt = (
    await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({ input_pin: doc.extractionId, prompt_hash: "p946-text", envelope: envelope({ channel: "text", answers }) }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p946-vision", envelope: envelope({ channel: "vision", answers }) }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.posting.posted, true, `mandatory setup: ${JSON.stringify(receipt.posting)}`);

  // AFTER: through the EXISTING derived queue — the filing_rows CTE already excludes a filing
  // that carries a live entry — and with no dismissal act of any kind.
  const after = await queueRows(world.users.alice, world.clients.A1);
  assert.deepEqual(
    after.filter((r) => r.row_kind === "uncoded_filing" && r.document_id === doc.documentId),
    [],
    "the uncoded row is gone because the entry exists, not because anybody dismissed it",
  );
  assert.deepEqual(
    after.filter((r) => r.row_kind === "payroll_posting_blocked" && r.document_id === doc.documentId),
    [],
    "…and it is not replaced by a blocked row either",
  );
});
