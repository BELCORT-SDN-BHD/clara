// #1136 [0352_agent_read_twins_payroll_agreement.sql] — THE MODEL LANE'S ENTRANCE TO THE PAYROLL
// AND AGREEMENT READS, opened the house way and without a second definition of a single row.
//
// WHAT THIS FILE IS ABOUT. Three successor contracts of riders wave 4 name doors the chat lane
// cannot reach: `read_payroll_posting_state` (#946) and `read_agreement_terms` (#948) both read
// `clara.list_review_queue`, and `read_payroll_settlement_state` (#947) reads
// `clara.get_payroll_settlement_candidates`. Both doors were `clara_authenticated` only, and a
// chat tool runs on a pooled credential that carries no JWT at all — so cutting those tools as
// written would have shipped tools that can only answer a grant refusal, which is why CUT-PLAN.md
// §1.4 deferred them. #1136 opens both doors the house way, in #1000's [0320] shape: each read's
// computation moves into ONE ungranted core that takes the caller's FIRM as an argument, the human
// door becomes that core's own thin audited wrapper (same signature, same ACL, same refusals), and
// a SECOND audited wrapper — EXECUTE to `clara_agent_ro` alone, one `clara.wake_fn_allowlist` row
// for the `interactive` kind the chat lane's `readScoped` mints — is the model lane's door.
//
// THE SEAMS, named up front (WORK-ORDER rule 4):
//   S1. `clara.wake_get_payroll_settlement_candidates(p_client uuid)` — the model lane's door onto
//       #947's granted read.
//   S2. `clara.wake_list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer)` — the model
//       lane's door onto the review queue, which is where BOTH #946's `payroll_posting_blocked`
//       row and #948's `agreement_posting_blocked` row live.
//   S3. The two HUMAN doors, `clara.get_payroll_settlement_candidates(uuid)` and
//       `clara.list_review_queue(jsonb,jsonb,integer)` — same signature, same ACL, same answers
//       after the split. Their own batteries (payroll-settlement.test.mjs,
//       payroll-summary-posting.test.mjs, agreement-contract-acquisition.test.mjs and every other
//       file that reads the queue) are this change's real regression proof and run unchanged.
//   S4. The ACL and the wake-kind allowlist — DRIVEN role by role, never read off the catalog.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. The whole of #946/#947/#948's behaviour: that is their own
// three batteries. This file proves the NEW lane and the ONE property the split must never lose —
// that both lanes answer from the same body, row for row.
//
// FRONTIER-GATED on the `agent_read_twins_payroll_agreement$` stable stem, the
// client-financial-pack-wake-read.test.mjs idiom: a package-wide sweep preloads this file's
// pre-integration gate module and skips LOUDLY on a chain below 0352; a FOCUSED run sets nothing
// and fails, because a skip is not evidence.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, wakeQuery, asWake, namedCall,
  ensureReady, endPool, buildWorld, createClient, upsertAccount,
  mintWake, revokeWake, assertRaises, opk, ROLES, PG,
} from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";

const STEM = "agent_read_twins_payroll_agreement$";
const SETTLEMENT_DOOR = "wake_get_payroll_settlement_candidates";

let ready = false;
let world = null;
let lane = null;

async function lanePresent() {
  if (lane !== null) return lane;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  lane = Number(r.rows[0].n) > 0;
  return lane;
}

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  if (!(await lanePresent())) {
    if (process.env.CLARA_ALLOW_MISSING_AGENT_READ_TWINS_PAYROLL_AGREEMENT !== "1") {
      throw new Error(
        `#1136: no migration matching /${STEM}/ is applied to this database and `
        + "CLARA_ALLOW_MISSING_AGENT_READ_TWINS_PAYROLL_AGREEMENT is unset — this is a FOCUSED run "
        + "and must fail loudly rather than skip. Apply "
        + "0352_agent_read_twins_payroll_agreement.sql, or preload "
        + "./tests/agent-read-twins-payroll-agreement-preintegration-gate.mjs for an estate sweep "
        + "against a pre-0352 chain.");
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  // This battery drives the real payroll and agreement read lanes, which mint one witness-pair
  // task per fixture inside ONE firm. 0296's per-lane concurrency wall defaults to 2 RUNNING at
  // once (CLR18); raised for the fixture firm alone, exactly as payroll-settlement.test.mjs does.
  const firm = await firmOf(world.clients.A1);
  await rootQuery(
    `insert into clara.firm_document_limits(firm_id, llm_witness_concurrency)
       values ($1, 50)
     on conflict (firm_id) do update set llm_witness_concurrency = 50`,
    [firm],
  );
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip(`#1136 lane absent or rig not ready (no ${STEM} migration applied)`);
    return true;
  }
  return false;
}

const ALICE = () => world.users.alice; // owner, firm A — the maker
const BOB = () => world.users.bob;     // bookkeeper, firm A — the checker, and the OBO human the
                                       // chat lane acts for (bookkeeper+ is the wake floor)
const CAROL = () => world.users.carol; // viewer, firm A — the queue's own human floor
const FIRM_A = () => world.firms.A;

// ---------------------------------------------------------------------------
// The worked example — #946's OWN hand-worked payroll figures, reused verbatim from
// payroll-summary-posting.test.mjs / payroll-settlement.test.mjs as an independent source of
// truth (WORK-ORDER rule 4: never re-derived from what the code computes). Net pay
// RM 4,255.70 = 425570 cents, posted to 2040 by clara._post_payroll_run.
// ---------------------------------------------------------------------------

const value = (raw) => ({ state: "value", raw });

const RUN_FIELDS = [
  "payroll.run.period", "payroll.run.gross_pay", "payroll.run.epf_employee",
  "payroll.run.epf_employer", "payroll.run.socso_employee", "payroll.run.socso_employer",
  "payroll.run.eis_employee", "payroll.run.eis_employer", "payroll.run.pcb",
  "payroll.run.hrdf_levy", "payroll.run.net_pay",
];
const ROW_FIELDS = [
  "payroll.row.gross_pay", "payroll.row.epf_employee", "payroll.row.socso_employee",
  "payroll.row.eis_employee", "payroll.row.pcb", "payroll.row.net_pay",
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
const NET_PAY_CENTS = 425570;

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
const BANKCOA = "1010";

let clientSeq = 0;
async function freshClient(sub = ALICE()) {
  clientSeq += 1;
  return createClient(sub, { name: `p1136-cli-${clientSeq}-${Date.now()}`, opKey: opk("p1136-client") });
}

/** The payroll chart, minus whatever the caller wants missing (a missing code is how #946's own
 *  gate produces a payroll_posting_blocked row instead of an entry). */
async function seedPayrollChart(sub, client, { without = [] } = {}) {
  for (const a of PAYROLL_CHART) {
    if (without.includes(a.code)) continue;
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk("p1136-coa") });
  }
  await upsertAccount(sub, { client, code: BANKCOA, name: "Maybank current (p1136)", type: "asset", opKey: opk("p1136-bankcoa") });
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

async function ensureConsent(sub, client) {
  if (await hasWitnessConsent(client)) return;
  const firm = await firmOf(client);
  const evidence = await consentEvidenceDoc(sub, { firm });
  const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
  await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
}

function payslipRow(rowNo, r) {
  const cells = {
    "payroll.row.gross_pay": value(r.gross), "payroll.row.epf_employee": value(r.epf),
    "payroll.row.socso_employee": value(r.socso), "payroll.row.eis_employee": value(r.eis),
    "payroll.row.pcb": value(r.pcb), "payroll.row.net_pay": value(r.net),
  };
  return { row_no: rowNo, cells: Object.fromEntries(ROW_FIELDS.map((f) => [f, cells[f]])) };
}

function payrollEnvelope({ channel = "text", answers = {} } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : PRINTED[f];
  return { payroll: { channel, answers: a, rows: [payslipRow(1, R1), payslipRow(2, R2)] } };
}

async function payrollDoc(sub, client) {
  const firm = await firmOf(client);
  await ensureConsent(sub, client);
  const doc = await filedDocument(sub, { firm, client, kind: "payroll_summary" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: extractionId, fieldPath: "payroll.run.gross_pay", textContent: "5,000.00" });
  return { ...doc, firm, client, extractionId };
}

/** Files, routes, claims and reads a payroll document all the way through the (already-landed)
 *  #945/#946 lane, through the estate's OWN doors. Returns the persist receipt's posting block,
 *  so a caller can assert whether the run posted or was blocked. */
async function readPayrollRun(sub, client, { answers = {} } = {}) {
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
      JSON.stringify({ input_pin: doc.extractionId, prompt_hash: "p1136-text", envelope: payrollEnvelope({ channel: "text", answers }) }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p1136-vision", envelope: payrollEnvelope({ channel: "vision", answers }) }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, receipt, posting: receipt.posting };
}

async function freshBank(sub, client) {
  const acct = await addBankAccount(sub, { client, coaAccountCode: BANKCOA, accountNumber: `1136${Date.now()}`.slice(0, 12) });
  return acct.bank_account_id ?? acct.id;
}

// ---------------------------------------------------------------------------
// The two lanes' calls, spelled once.
// ---------------------------------------------------------------------------

const SETTLEMENT_SPECS = [{ name: "p_client", cast: "uuid" }];

/** The bookkeeper's own door. */
async function humanCandidates(sub, client) {
  const r = await humanQuery(sub, namedCall("get_payroll_settlement_candidates", SETTLEMENT_SPECS), [client]);
  return r.rows[0].result;
}

/** The model lane's door: an `interactive` wake credential minted ON BEHALF OF a live
 *  bookkeeper+, bound txn-locally, on the READ role the chat lane's `readScoped` runs as. */
async function wakeCandidates(secret, client) {
  const r = await wakeQuery(ROLES.agentRo, secret, namedCall(SETTLEMENT_DOOR, SETTLEMENT_SPECS), [client]);
  return r.rows[0].result;
}

async function chatCredential(onBehalfOf = BOB()) {
  return mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf });
}

// ===========================================================================================
// S1 — THE SETTLEMENT TWIN ANSWERS THE SAME ROWS, FROM THE SAME BODY.
// ===========================================================================================

test("p1136.settlement.same_rows — the model lane's door answers, for one client, the SAME unsettled runs and the SAME candidate bank lines the bookkeeper's own door answers", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  await seedPayrollChart(ALICE(), client);
  const run = await readPayrollRun(ALICE(), client);
  assert.equal(run.posting.posted, true, `mandatory setup: the run posted (got ${JSON.stringify(run.posting)})`);
  const bank = await freshBank(ALICE(), client);
  await enterStatement(ALICE(), {
    client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-01", periodEnd: "2026-09-15", opening: 900000,
    specs: [
      { entryDate: "2026-09-05", description: "SALARY GIRO", amountCents: -NET_PAY_CENTS },
      { entryDate: "2026-09-06", description: "unrelated deposit", amountCents: -(NET_PAY_CENTS + 100) },
    ],
  });

  const humanRows = await humanCandidates(BOB(), client);
  const { secret } = await chatCredential();
  const machineRows = await wakeCandidates(secret, client);

  // ROW FOR ROW, not merely "both non-empty": this read stores nothing and samples nothing, so
  // there is no per-call key that may legitimately differ. If these two ever diverge, a person
  // and Clara are looking at different money.
  assert.deepEqual(machineRows, humanRows,
    "the model lane's settlement candidates differ from the bookkeeper's own");
  const mine = machineRows.find((c) => c.entry_id === run.posting.entry_id);
  assert.ok(mine, "the posted run is offered to the model lane at all");
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS);
  assert.equal(mine.candidates.length, 1,
    `exactly one exact, in-window candidate reaches the model lane: ${JSON.stringify(mine.candidates)}`);
  assert.equal(mine.candidates[0].description, "SALARY GIRO");
});

// ===========================================================================================
// S2 — THE QUEUE TWIN ANSWERS THE SAME ENVELOPE, AND #946'S ROW TRAVELS ON IT.
// ===========================================================================================

const QUEUE_SPECS = [
  { name: "p_scope", cast: "jsonb" }, { name: "p_cursor", cast: "jsonb" },
  { name: "p_limit", cast: "integer" },
];

async function humanQueue(sub, { scope = null, cursor = null, limit = 200 } = {}) {
  const r = await humanQuery(sub, namedCall("list_review_queue", QUEUE_SPECS),
    [scope === null ? null : JSON.stringify(scope), cursor === null ? null : JSON.stringify(cursor), limit]);
  return r.rows[0].result;
}

async function wakeQueueRead(secret, { scope = null, cursor = null, limit = 200 } = {}) {
  const r = await wakeQuery(ROLES.agentRo, secret, namedCall("wake_list_review_queue", QUEUE_SPECS),
    [scope === null ? null : JSON.stringify(scope), cursor === null ? null : JSON.stringify(cursor), limit]);
  return r.rows[0].result;
}

test("p1136.queue.payroll_blocked_row_travels — a payroll run that did not post reaches the model lane as the SAME row, carrying the gate's own sentence verbatim, inside an envelope identical to the bookkeeper's", async (t) => {
  if (unready(t)) return;
  // A client with NO payroll chart at all: the run is blocked on an account it does not hold,
  // which is #946's own worked block and a condition a person can actually clear.
  const client = await freshClient();
  const run = await readPayrollRun(ALICE(), client, { answers: { "payroll.run.period": value("2026-03") } });
  assert.equal(run.posting.posted, false, `mandatory setup: the run is blocked (got ${JSON.stringify(run.posting)})`);

  const humanEnv = await humanQueue(BOB(), { scope: { client_id: client } });
  const { secret } = await chatCredential();
  const machineEnv = await wakeQueueRead(secret, { scope: { client_id: client } });

  // THE WHOLE ENVELOPE, not just the row: counts, watermark, sweep, the two staleness flags and
  // the cursor. This read samples nothing per call, so any difference is a difference in what the
  // two lanes are being told about the same firm.
  assert.deepEqual(machineEnv, humanEnv,
    "the model lane's queue envelope differs from the bookkeeper's for the same scope");

  const rows = machineEnv.rows.filter(
    (r) => r.row_kind === "payroll_posting_blocked" && r.document_id === run.documentId);
  assert.equal(rows.length, 1, "exactly one blocked row for this run reaches the model lane");
  const row = rows[0];
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.client_id, client);
  assert.equal(row.period, "2026-03-01", "the month the payslip covers travels with the row");
  // THE SENTENCE IS THE DATABASE'S OWN. #946's contract says a tool reports `question_text`
  // VERBATIM because rewording it would put a reason on screen nobody decided; that is only true
  // while both lanes read it from ONE body, which is what this assertion pins.
  assert.match(row.question_text, /account/i, `the row NAMES the condition: ${row.question_text}`);
  assert.match(row.question_text, /6000/, "…down to the account code a person must add");
  const humanRow = humanEnv.rows.find(
    (r) => r.row_kind === "payroll_posting_blocked" && r.document_id === run.documentId);
  assert.equal(row.question_text, humanRow.question_text,
    "the words Clara would say and the words the person reads are the same body's, byte for byte");
});

// ---------------------------------------------------------------------------
// #948's OWN worked example, reused verbatim from agreement-contract-acquisition.test.mjs as an
// independent source of truth: a hire-purchase agreement for a lorry — cash price 120,000.00,
// deposit 20,000.00, financed 100,000.00, charges 8,400.00, payable 108,400.00 over 36 months at
// 3,011.11, with a three-row printed schedule that reconciles to those figures by hand.
// ---------------------------------------------------------------------------

const AGREEMENT_RUN_FIELDS = [
  "contract.agreement.kind", "contract.agreement.financier", "contract.agreement.agreement_date",
  "contract.agreement.asset_description", "contract.agreement.cash_price",
  "contract.agreement.deposit", "contract.agreement.amount_financed",
  "contract.agreement.total_charges", "contract.agreement.total_payable",
  "contract.agreement.term_months", "contract.agreement.instalment_amount",
];
const AGREEMENT_PRINTED = {
  "contract.agreement.kind": value("Hire Purchase Agreement"),
  "contract.agreement.financier": value("Maybank Islamic Berhad"),
  "contract.agreement.agreement_date": value("2026-03-14"),
  "contract.agreement.asset_description": value("Isuzu NLR77 3.0 lorry, chassis JAANLR77LP7100123"),
  "contract.agreement.cash_price": value("120,000.00"),
  "contract.agreement.deposit": value("20,000.00"),
  "contract.agreement.amount_financed": value("100,000.00"),
  "contract.agreement.total_charges": value("8,400.00"),
  "contract.agreement.total_payable": value("108,400.00"),
  "contract.agreement.term_months": value("36"),
  "contract.agreement.instalment_amount": value("3,011.11"),
};

function scheduleRow(rowNo, { due, instalment, principal, interest }) {
  return {
    row_no: rowNo,
    cells: {
      "contract.schedule.due_date": value(due),
      "contract.schedule.instalment": value(instalment),
      "contract.schedule.principal": value(principal),
      "contract.schedule.interest": value(interest),
    },
  };
}
const AGREEMENT_SCHEDULE = () => [
  scheduleRow(1, { due: "2026-04-14", instalment: "43,400.00", principal: "40,000.00", interest: "3,400.00" }),
  scheduleRow(2, { due: "2026-05-14", instalment: "38,000.00", principal: "35,000.00", interest: "3,000.00" }),
  scheduleRow(3, { due: "2026-06-14", instalment: "27,000.00", principal: "25,000.00", interest: "2,000.00" }),
];

function agreementEnvelope(channel) {
  const a = {};
  for (const f of AGREEMENT_RUN_FIELDS) a[f] = AGREEMENT_PRINTED[f];
  return { contract: { channel, answers: a, rows: AGREEMENT_SCHEDULE() } };
}

/** Files, routes, claims and READS an agreement contract through the (already-landed) #948 lane,
 *  through the estate's OWN doors. A client with no chart cannot post the acquisition, which is
 *  exactly the `agreement_posting_blocked` state #948's tool has to report. */
async function readAgreementContract(sub, client) {
  const firm = await firmOf(client);
  await ensureConsent(sub, client);
  const doc = await filedDocument(sub, { firm, client, kind: "agreement_contract" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({
    firm, extraction: extractionId, fieldPath: "contract.agreement.cash_price", textContent: "120,000.00",
  });
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      `select id from clara.document_processing_tasks
        where document_id=$1 and lane='contract_facts' and status='queued'
        order by version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a contract_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  const receipt = (
    await rootQuery("select clara.persist_agreement_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({ input_pin: extractionId, prompt_hash: "p1136-agreement-text", envelope: agreementEnvelope("text"), citations: [] }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p1136-agreement-vision", envelope: agreementEnvelope("vision"), citations: [] }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the agreement read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, receipt };
}

test("p1136.queue.agreement_blocked_row_travels — an agreement that was read and did not post reaches the model lane as the SAME row, carrying the GATE'S own sentence, while clara._agreement_posting_verdict stays granted to nobody", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  const doc = await readAgreementContract(ALICE(), client);
  assert.equal(doc.receipt.posting.posted, false,
    `mandatory setup: the acquisition is blocked (got ${JSON.stringify(doc.receipt.posting)})`);

  const humanEnv = await humanQueue(BOB(), { scope: { client_id: client } });
  const { secret } = await chatCredential();
  const machineEnv = await wakeQueueRead(secret, { scope: { client_id: client } });
  assert.deepEqual(machineEnv, humanEnv,
    "the model lane's queue envelope differs from the bookkeeper's for the same scope");

  const rows = machineEnv.rows.filter(
    (r) => r.row_kind === "agreement_posting_blocked" && r.document_id === doc.documentId);
  assert.equal(rows.length, 1, "exactly one row for this agreement, never one per condition");
  const row = rows[0];
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.client_id, client);
  assert.ok(row.filing_id, "…pointing at the filing the agreement was filed under");

  // THE SENTENCE IS clara._agreement_posting_verdict's OWN, and the model lane reads it the same
  // way a person does — through the queue. This is the whole reason #948's contract forbids
  // calling the verdict body from a tool, and why this ticket minted no third door for it.
  const verdict = (
    await rootQuery("select clara._agreement_posting_verdict($1) as v", [doc.documentId])
  ).rows[0].v;
  assert.equal(row.question_text, verdict.sentence,
    "the words Clara would say are the GATE's own, verbatim — one body, so they cannot drift");

  // …and the verdict body itself is still reachable from NO application role, so there is no
  // second path to that sentence for anyone to drift from.
  const acl = await rootQuery(
    `select bool_or(has_function_privilege(r, 'clara._agreement_posting_verdict(uuid)', 'EXECUTE')) as any_role
       from unnest(array['clara_agent_ro','clara_runtime','clara_authenticated','clara_wake_interactive']) r`);
  assert.equal(acl.rows[0].any_role, false,
    "#1136 opened a queue door, never the verdict body 0299 granted to nobody");
});

// ===========================================================================================
// THE CEREMONY — what each model-lane door asks for before it reads anything. Driven on BOTH
// doors together, because a wall that exists on one of them is not a wall.
// ===========================================================================================

const DOORS = () => [
  {
    name: SETTLEMENT_DOOR,
    sql: namedCall(SETTLEMENT_DOOR, SETTLEMENT_SPECS),
    args: (client) => [client],
  },
  {
    name: "wake_list_review_queue",
    sql: namedCall("wake_list_review_queue", QUEUE_SPECS),
    args: (client) => [JSON.stringify({ client_id: client }), null, 200],
  },
];

const reasonOf = (err) => {
  try { return JSON.parse(err.detail).reason; } catch { return null; }
};

test("p1136.wake.no_credential — a session on the read role with no wake secret is refused CLR03 by both doors, and the refusal says nothing about the client it was asked for", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  const invented = "00000000-0000-4000-8000-0000000011aa";
  for (const door of DOORS()) {
    // The READ role, no secret bound: this is what a pooled checkout looks like before
    // `withReadWakeScoped` binds anything.
    await assertRaises("CLR03", () => roleQuery(ROLES.agentRo, door.sql, door.args(client)),
      `${door.name} without a credential`);
    // …and the SAME refusal for a client that does not exist at all, so a credential-less caller
    // cannot use either door as an existence probe.
    await assertRaises("CLR03", () => roleQuery(ROLES.agentRo, door.sql, door.args(invented)),
      `${door.name} without a credential, on an invented id`);
  }
});

test("p1136.wake.kind_not_allowlisted — a wake kind with no allowlist row is refused CLR03 by both doors even holding the EXECUTE, and each door holds exactly one row", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  // `proactive` is a live kind with a credential of its own and NO row for either door. The
  // EXECUTE is on the ROLE, so this is the kind gate refusing, not the ACL.
  const { secret } = await mintWake({ kind: "proactive", firm: FIRM_A() });
  for (const door of DOORS()) {
    await assertRaises("CLR03", () => wakeQuery(ROLES.agentRo, secret, door.sql, door.args(client)),
      `${door.name} under a proactive credential`);
    const rows = await rootQuery(
      "select wake_kind from clara.wake_fn_allowlist where function_name = $1 order by 1", [door.name]);
    assert.deepEqual(rows.rows.map((r) => r.wake_kind), ["interactive"],
      `${door.name} must be reachable from exactly one wake kind`);
  }
});

test("p1136.wake.needs_a_named_person — a credential that names no on_behalf_of is refused CLR03 wake_authority_absent by both doors: these reads ride a person's authority or they do not happen", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  const { secret } = await mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf: null });
  for (const door of DOORS()) {
    let err = null;
    try { await wakeQuery(ROLES.agentRo, secret, door.sql, door.args(client)); } catch (e) { err = e; }
    assert.ok(err, `${door.name}: an unattended credential read a firm's inbox`);
    assert.equal(err.code, "CLR03", `${door.name}: errcode`);
    assert.equal(reasonOf(err), "wake_authority_absent", `${door.name}: the door's own detail reason`);
  }
});

test("p1136.wake.floor_is_the_credential — the model lane's floor is the credential's own BOOKKEEPER+, strictly above the queue's VIEWER floor, and a revoked credential goes inert on both doors", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();

  // (a) THE QUEUE'S OWN FLOOR IS VIEWER, driven rather than recited: CAROL is a viewer of firm A
  //     and the human door answers her.
  const asViewer = await humanQueue(CAROL(), { scope: { client_id: client } });
  assert.ok(Array.isArray(asViewer.rows), "the queue's own floor is not VIEWER any more");

  // (b) THE MODEL LANE CANNOT ACT FOR HER. The credential cannot even be minted: #630's typed
  //     authority_lost, raised by clara.mint_wake_credential before either door is involved. So
  //     the machine lane is NARROWER than the door it reaches.
  await assertRaises("CLR10",
    () => mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf: CAROL() }),
    "an OBO credential for a viewer");

  // (c) AND A CREDENTIAL THAT WAS VALID GOES INERT the moment it is revoked — the same mechanism
  //     that makes a demotion mid-conversation stop the read.
  const live = await chatCredential();
  assert.ok(await wakeQueueRead(live.secret, { scope: { client_id: client } }));
  assert.ok(await wakeCandidates(live.secret, client));
  await revokeWake(live.credentialId);
  for (const door of DOORS()) {
    await assertRaises("CLR03", () => wakeQuery(ROLES.agentRo, live.secret, door.sql, door.args(client)),
      `${door.name} under a revoked credential`);
  }
});

// ===========================================================================================
// THE TENANT WALL — the one predicate this file added, driven from the outside.
// ===========================================================================================

test("p1136.wake.tenant_wall — through firm A's credential, firm B's real client answers exactly what an invented id answers, and an unscoped read returns firm A's rows and nobody else's", async (t) => {
  if (unready(t)) return;
  const theirs = world.clients.B1;                       // a real client of firm B
  const invented = "00000000-0000-4000-8000-0000000011bb";
  const { secret } = await chatCredential();

  // THE QUEUE: both are the read's OWN CLR10 `queue scope is malformed` — the same answer a
  // person gets, so a caller learns the same thing about a client that exists elsewhere and one
  // that exists nowhere.
  const a = await assertRaises("CLR10",
    () => wakeQueueRead(secret, { scope: { client_id: theirs } }), "firm B's client through firm A's credential");
  const b = await assertRaises("CLR10",
    () => wakeQueueRead(secret, { scope: { client_id: invented } }), "an invented id");
  assert.equal(a.message, b.message,
    "another firm's client and an invented id must be indistinguishable to this lane");
  await assertRaises("CLR10", () => humanQueue(BOB(), { scope: { client_id: theirs } }),
    "…and the bookkeeper's own door answers the same way, so the split moved no wall");

  // THE SETTLEMENT READ: 0298's own CLR11, unchanged, for both.
  const c = await assertRaises("CLR11", () => wakeCandidates(secret, theirs), "firm B's client");
  const d = await assertRaises("CLR11", () => wakeCandidates(secret, invented), "an invented id");
  assert.equal(c.message, d.message, "the settlement read must not be an existence oracle either");

  // AN UNSCOPED READ IS SCOPED ANYWAY — by the credential's firm, inside the core. Firm B's
  // clients cannot appear in it whatever the caller does or does not ask for.
  const wide = await wakeQueueRead(secret, { scope: null, limit: 500 });
  const theirIds = (await rootQuery("select id from clara.clients where firm_id = $1", [world.firms.B]))
    .rows.map((r) => r.id);
  assert.equal(wide.rows.filter((r) => theirIds.includes(r.client_id)).length, 0,
    "an unscoped model-lane read reached another firm's rows");
  assert.deepEqual(wide, await humanQueue(BOB(), { scope: null, limit: 500 }),
    "…and it is the same unscoped envelope the bookkeeper sees");
});

// ===========================================================================================
// THE GRANT THIS TICKET BOUGHT, AND NOTHING ELSE.
// ===========================================================================================

test("p1136.acl.two_doors_one_role — clara_agent_ro holds the two new doors, every other role is refused 42501 on them, the two cores are reachable by nobody, and the human doors stay closed to the machine lane", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  const { secret } = await chatCredential();
  // DRIVEN, not read off the catalog: the role that is supposed to hold them does.
  assert.ok(await wakeCandidates(secret, client), "clara_agent_ro cannot call the settlement door");
  assert.ok(await wakeQueueRead(secret, { scope: { client_id: client } }), "clara_agent_ro cannot call the queue door");

  for (const door of DOORS()) {
    for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege,
        () => roleQuery(role, door.sql, door.args(client)), `${role} on ${door.name}`);
    }
  }

  // THE CORES: nobody, including the read role that holds the doors in front of them.
  const cores = [
    ["select clara._payroll_settlement_candidates_core($1::uuid, $2::uuid)", [FIRM_A(), client]],
    ["select clara._list_review_queue_core($1::uuid, null, null, 10)", [FIRM_A()]],
  ];
  for (const [sql, args] of cores) {
    for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.authenticated, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege, () => roleQuery(role, sql, args), `${role} on an ungranted core`);
    }
  }

  // THE HUMAN DOORS are still closed to the machine lane — 0011:4210-4213's own assertion about
  // clara_agent_ro and clara.list_review_queue, driven rather than re-read from the catalog.
  const humanDoors = [
    [namedCall("list_review_queue", QUEUE_SPECS), [JSON.stringify({ client_id: client }), null, 50]],
    [namedCall("get_payroll_settlement_candidates", SETTLEMENT_SPECS), [client]],
  ];
  for (const [sql, args] of humanDoors) {
    for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege, () => roleQuery(role, sql, args), `${role} on a HUMAN door`);
    }
  }

  // AND NO ACT CAME WITH THEM. #947's settlement door is the one a person uses on the bank
  // surface or in Needs you; the chat lane holds nothing on it.
  await assertRaises(PG.insufficientPrivilege,
    () => roleQuery(ROLES.agentRo,
      namedCall("settle_payroll_net_pay", [
        { name: "p_client", cast: "uuid" }, { name: "p_entry", cast: "uuid" },
        { name: "p_line", cast: "uuid" }, { name: "p_op_key", cast: "text" }]),
      [client, client, client, "p1136-never"]),
    "clara_agent_ro on the settlement ACT");
});

test("p1136.wake.read_only — both model-lane doors answer inside a READ ONLY transaction, which is the only kind the chat lane's read pool opens, and neither writes a row", async (t) => {
  if (unready(t)) return;
  const client = await freshClient();
  await seedPayrollChart(ALICE(), client);
  const run = await readPayrollRun(ALICE(), client, { answers: { "payroll.run.period": value("2026-06") } });
  assert.equal(run.posting.posted, true, "mandatory setup: the run posted");
  const { secret } = await chatCredential();

  const before = (await rootQuery(
    "select (select count(*) from clara.domain_events) as ev, (select count(*) from clara.operation_receipts) as ops")
  ).rows[0];

  const answers = await asWake(ROLES.agentRo, secret, async (c) => {
    await c.query("select set_config('transaction_read_only', 'on', true)");
    // The control: this transaction really IS read-only, proven by a write that 25006s in it. It
    // runs inside a savepoint, because a refused statement aborts the transaction it was refused
    // in and the doors still have to be called in the SAME one.
    await c.query("savepoint p1136_ro");
    let refused = null;
    try { await c.query("create temporary table _p1136_ro_probe(x int)"); }
    catch (e) { refused = e.code; }
    await c.query("rollback to savepoint p1136_ro");
    assert.equal(refused, PG.readOnly, "the read-only probe did not make the transaction read-only");
    const q = (await c.query(namedCall("wake_list_review_queue", QUEUE_SPECS),
      [JSON.stringify({ client_id: client }), null, 200])).rows[0].result;
    const s = (await c.query(namedCall(SETTLEMENT_DOOR, SETTLEMENT_SPECS), [client])).rows[0].result;
    return { q, s };
  });
  assert.ok(Array.isArray(answers.q.rows), "the queue door answered read-only");
  assert.equal(answers.s.length, 1, "the settlement door answered read-only, with this client's one unsettled run");

  // NO ACT, stated as a measurement: these are readings, so the estate's two act ledgers do not
  // move. #946's and #947's contracts both say the tools mint no work_accepted and ask no
  // work_question; this is the database half of that promise.
  const after = (await rootQuery(
    "select (select count(*) from clara.domain_events) as ev, (select count(*) from clara.operation_receipts) as ops")
  ).rows[0];
  assert.equal(after.ev, before.ev, "a model-lane read emitted a domain event");
  assert.equal(after.ops, before.ops, "a model-lane read wrote an operation receipt");
});
