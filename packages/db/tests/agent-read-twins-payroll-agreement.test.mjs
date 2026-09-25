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
  rootQuery, humanQuery, wakeQuery, namedCall,
  ensureReady, endPool, buildWorld, createClient, upsertAccount,
  mintWake, opk, ROLES,
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
