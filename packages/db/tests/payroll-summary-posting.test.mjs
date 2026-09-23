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
