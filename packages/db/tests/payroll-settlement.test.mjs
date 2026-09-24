// Battery for migration 0298_payroll_net_pay_settlement.sql — #947: FIND THE NET-PAY PAYMENT ON
// THE BANK STATEMENT AND PROPOSE ITS SETTLEMENT.
//
// Spec of record: issue #947's Agent Brief (the body; both comments are AI-triage coordination
// notes dated 2026-09-18/19, not owner rulings, and nothing is dated 2026-09-20 — the body
// stands). Parent #926 (owner ruling 2026-09-18, question 4): "always two steps, and Clara finds
// the payment." Blocked by #946 (0297, same lane, already applied).
//
// THE SHAPE THIS FILE PROVES, per CONTEXT.md's "Settlement candidate row" (#657's own, WAVE-4
// LANE RULE (c)): a row DERIVED from live state, storing nothing, that offers candidates and
// never chooses, and clears itself the moment the underlying facts stop producing it — by any of
// the three routes AC3 names.
//
// THE SEAMS, named up front (WORK-ORDER rule 4):
//   S1. THE LEDGER READ — clara._payroll_net_pay_unsettled(uuid). A per-client FIFO allocation of
//       every approved, non-reversed 2040 debit against every approved, non-reversed
//       payroll_run-flagged 2040 credit, oldest run first, excluding anything flagged
//       payroll_obligation (0194/#643's own lane, which can share the account).
//   S2. THE CANDIDATE READ (AC1) — clara.get_payroll_settlement_candidates(uuid). Per client, each
//       unsettled run with its own candidate bank lines (exact amount, date window, live/unspent/
//       unexcepted lines only).
//   S3. THE SETTLEMENT DOOR (AC2) — clara.settle_payroll_net_pay(client, entry, line, op_key).
//       Books Dr 2040 / Cr bank COA, approves it, and reuses clara._match_bank_line_core (an
//       EXISTING bank-side door) to bind it to the chosen line. A receipt is written.
//   S4. THE THREE ROUTES CLEAR THE ROW (AC3) — Clara's own door, a hand-booked entry, and a
//       hand-booked entry then reconciled through the ordinary match_bank_line door. No dismissal
//       record is written anywhere (there is no dismissal mechanism to drive).
//   S5. AMBIGUITY (AC4) — two equally-matching bank lines are both offered; nothing auto-picks.
//   S6. NEEDS YOU (AC2's arm) — clara.list_review_queue(jsonb,jsonb,integer), row_kind=
//       'payroll_net_pay_unsettled'.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, human,
  ensureReady, endPool, buildWorld, upsertAccount, draftEntry, approveEntry, createClient,
  freshResolution,
} from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";
import { listReviewQueue } from "./wave-a-reads.mjs";

async function queueRows(sub, client) {
  const env = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 200 });
  return env.rows;
}

let ready = false;
let world = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0298@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_SETTLEMENT !== "1") {
      throw new Error(
        "payroll-settlement premise missing (migration 0298 is not applied) -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/payroll-settlement-preintegration-gate.mjs for an estate sweep against a chain " +
          "that predates 0298.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  // This battery mints a payroll_facts task per test (~15 across the file) inside ONE firm.
  // 0296's own per-lane concurrency wall defaults to 2 RUNNING at once (CLR18) -- generous for a
  // real firm, but this file races well past it within one run. Raised for the fixture firm
  // alone, the same way a firm's own admin would raise it in the product.
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
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0298 is not applied");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The worked example — #946's OWN hand-worked figures (payroll-summary-posting.test.mjs), reused
// verbatim as an independent source of truth (WORK-ORDER rule 4: never re-derived from what the
// code computes). Net pay RM 4,255.70 = 425570 cents, posted to 2040 by clara._post_payroll_run.
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

let opSeq = 0;
const opk947 = (tag) => `p947-${tag}-${Date.now()}-${++opSeq}`;

/** buildWorld() only seeds clients A1/A2/B1/S1 (rig-fixtures.mjs), and B1 belongs to a
 *  DIFFERENT firm (dave's). Every cell below needs its own isolated client in alice's firm, so
 *  each test mints a FRESH one rather than reusing the world's small fixed set. */
let clientSeq = 0;
async function freshClient(sub) {
  clientSeq += 1;
  return createClient(sub, { name: `p947-cli-${clientSeq}-${Date.now()}`, opKey: opk947(`client${clientSeq}`) });
}

async function seedPayrollChart(sub, client) {
  for (const a of PAYROLL_CHART) {
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk947("coa") });
  }
  await upsertAccount(sub, { client, code: BANKCOA, name: "Maybank current (p947)", type: "asset", opKey: opk947("bankcoa") });
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

function payslipRow(rowNo, r) {
  const cells = {
    "payroll.row.gross_pay": value(r.gross), "payroll.row.epf_employee": value(r.epf),
    "payroll.row.socso_employee": value(r.socso), "payroll.row.eis_employee": value(r.eis),
    "payroll.row.pcb": value(r.pcb), "payroll.row.net_pay": value(r.net),
  };
  return { row_no: rowNo, cells: Object.fromEntries(ROW_FIELDS.map((f) => [f, cells[f]])) };
}

function envelope({ channel = "text", answers = {} } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : PRINTED[f];
  return { payroll: { channel, answers: a, rows: [payslipRow(1, R1), payslipRow(2, R2)] } };
}

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

/** Files, routes, claims and reads a payroll document all the way through the (already-landed)
 *  #945/#946 lane, leaving a POSTED entry behind it (net pay 425570 cents on account 2040). */
async function postPayrollRun(sub, client, { answers = {} } = {}) {
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
  const textEnv = envelope({ channel: "text", answers });
  const visionEnv = envelope({ channel: "vision", answers });
  const receipt = (
    await rootQuery("select clara.persist_payroll_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({ input_pin: doc.extractionId, prompt_hash: "p947-text", envelope: textEnv }),
      JSON.stringify({ input_pin: (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256, prompt_hash: "p947-vision", envelope: visionEnv }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the read settled (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.posting.posted, true, `mandatory setup: the run posted (got ${JSON.stringify(receipt.posting)})`);
  return { ...doc, entryId: receipt.posting.entry_id, postingDate: receipt.posting.posting_date };
}

async function freshBank(sub, client) {
  const acct = await addBankAccount(sub, { client, coaAccountCode: BANKCOA, accountNumber: `9470${Date.now()}` });
  return acct.bank_account_id ?? acct.id;
}

async function candidatesOf(sub, client) {
  const r = await humanQuery(sub, namedCall("get_payroll_settlement_candidates", [{ name: "p_client" }]), [client]);
  return r.rows[0].result;
}

async function settle(sub, { client, entry, line, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("settle_payroll_net_pay", [{ name: "p_client" }, { name: "p_entry" }, { name: "p_line" }, { name: "p_op_key" }]),
    [client, entry, line, opKey ?? opk947("settle")],
  );
  return r.rows[0].result;
}

async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// S1 — the ledger read (arithmetic, by hand)
// ---------------------------------------------------------------------------

test("S1 · a posted run's own credit is fully unsettled with no debit against it", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const rows = (await rootQuery("select entry_id, document_id, filing_id, posting_date::text as posting_date, period_month::text as period_month, net_pay_cents, unsettled_cents from clara._payroll_net_pay_unsettled($1)", [client])).rows;
  const mine = rows.find((r) => r.entry_id === run.entryId);
  assert.ok(mine, "the posted run appears in its own client's ledger read");
  assert.equal(Number(mine.net_pay_cents), NET_PAY_CENTS);
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS, "nothing has paid it yet");
  assert.equal(mine.period_month, "2026-08-01");
});

test("S1 · a hand-booked debit to 2040 reduces the run's own unsettled cents, to the cent", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-07") } });

  const drafted = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-07-31", memo: "partial hand payment",
    lines: [
      { account_code: "2040", debit_cents: 100000, credit_cents: 0, description: "partial" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: 100000, description: "bank" },
    ],
    opKey: opk947("partial-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk947("partial-approve") });

  const rows = (await rootQuery("select entry_id, document_id, filing_id, posting_date::text as posting_date, period_month::text as period_month, net_pay_cents, unsettled_cents from clara._payroll_net_pay_unsettled($1)", [client])).rows;
  const mine = rows.find((r) => r.entry_id === run.entryId);
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS - 100000, "unsettled shrinks by exactly the hand-booked debit");
});

test("S1 · a payroll_obligation-flagged 2040 credit and its own debit never mix into a payroll run's own balance", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-06") } });

  // A periodic-adjustment-lane obligation on 2040 (#946's own S2 duplicate-guard fixture shape),
  // booked and then PAID OFF, all on 2040 -- and it must not be read as a payment toward the real
  // payroll run above.
  const oblDraft = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-09-30", memo: "September statutory obligation",
    lines: [
      { account_code: "6000", debit_cents: 50000, credit_cents: 0, description: "wages" },
      { account_code: "2040", debit_cents: 0, credit_cents: 50000, description: "payable" },
    ],
    opKey: opk947("obl-draft"),
  });
  await rootQuery(
    `update clara.journal_entries set flags = jsonb_build_object('payroll_obligation',
        jsonb_build_object('period_start','2026-09-01','period_end','2026-09-30','obligation_kind','epf'))
      where id=$1 and status='draft'`,
    [oblDraft.entry_id],
  );
  const oblToken = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [oblDraft.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: oblDraft.entry_id, expectedRevision: oblToken, opKey: opk947("obl-approve") });

  const payDraft = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-10-05", memo: "pay off September obligation",
    lines: [
      { account_code: "2040", debit_cents: 50000, credit_cents: 0, description: "clear obligation" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: 50000, description: "bank" },
    ],
    opKey: opk947("obl-pay-draft"),
  });
  // LABELLED FIXTURE, same discipline as #946's own S2 duplicate-guard cell: 0194's lane has no
  // payment door of its own yet (out of scope here), so this stands in for one, flagged the SAME
  // way its own credit was -- the only honest way to represent "a debit that is DEFINITELY this
  // obligation's own payment, not the payroll run's" without a real door to drive. Without SOME
  // marker distinguishing the two, an unflagged debit to a SHARED account is genuinely ambiguous
  // (plain accrual-account FIFO, applied fairly, would charge whichever credit is OLDER — here
  // the payroll run itself) and this file's own exclusion (§A) is what keeps a firm's choice to
  // share the account from corrupting a real payroll run's own balance.
  await rootQuery(
    `update clara.journal_entries set flags = jsonb_build_object('payroll_obligation',
        jsonb_build_object('period_start','2026-09-01','period_end','2026-09-30','obligation_kind','epf'))
      where id=$1 and status='draft'`,
    [payDraft.entry_id],
  );
  const payToken = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [payDraft.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: payDraft.entry_id, expectedRevision: payToken, opKey: opk947("obl-pay-approve") });

  const rows = (await rootQuery("select entry_id, document_id, filing_id, posting_date::text as posting_date, period_month::text as period_month, net_pay_cents, unsettled_cents from clara._payroll_net_pay_unsettled($1)", [client])).rows;
  const mine = rows.find((r) => r.entry_id === run.entryId);
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS, "the obligation's own debit never touches the payroll run's balance");
});

test("S1 · two runs, oldest charged first (FIFO)", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const july = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-07") } });
  const august = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-08") } });

  // A single hand-booked debit smaller than one run's own net pay: FIFO says the OLDER run (July)
  // is charged first, and August is untouched until July is fully covered.
  const partial = Math.floor(NET_PAY_CENTS / 2);
  const drafted = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-08-05", memo: "partial",
    lines: [
      { account_code: "2040", debit_cents: partial, credit_cents: 0, description: "partial" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: partial, description: "bank" },
    ],
    opKey: opk947("fifo-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk947("fifo-approve") });

  const rows = (await rootQuery("select entry_id, document_id, filing_id, posting_date::text as posting_date, period_month::text as period_month, net_pay_cents, unsettled_cents from clara._payroll_net_pay_unsettled($1)", [client])).rows;
  const julyRow = rows.find((r) => r.entry_id === july.entryId);
  const augustRow = rows.find((r) => r.entry_id === august.entryId);
  assert.equal(Number(julyRow.unsettled_cents), NET_PAY_CENTS - partial, "July (the older run) absorbs the whole partial debit");
  assert.equal(Number(augustRow.unsettled_cents), NET_PAY_CENTS, "August is untouched while July still has an open balance");
});

// ---------------------------------------------------------------------------
// S2 — the candidate read (AC1)
// ---------------------------------------------------------------------------

test("S2 · a run with no candidate bank line offers an empty candidate list, and an unrelated client sees nothing", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const cands = await candidatesOf(world.users.alice, client);
  const mine = cands.find((c) => c.entry_id === run.entryId);
  assert.ok(mine, "the unsettled run is offered");
  assert.deepEqual(mine.candidates, [], "no bank line yet -> no candidates, never a guess");
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS);
  assert.equal(mine.period_month.slice(0, 10), "2026-08-01");
});

test("S2 · an exact-amount bank line within the window is offered; a wrong amount and a far date are not", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);

  await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-01", periodEnd: "2026-09-15", opening: 900000,
    specs: [
      { entryDate: "2026-09-05", description: "SALARY GIRO", amountCents: -NET_PAY_CENTS },
      { entryDate: "2026-09-06", description: "unrelated deposit", amountCents: -(NET_PAY_CENTS + 100) },
      { entryDate: "2026-09-15", description: "too far out", amountCents: -NET_PAY_CENTS },
    ],
  });

  const cands = await candidatesOf(world.users.alice, client);
  const mine = cands.find((c) => c.entry_id === run.entryId);
  assert.equal(mine.candidates.length, 1, `expected exactly one exact, in-window candidate, got ${JSON.stringify(mine.candidates)}`);
  assert.equal(mine.candidates[0].description, "SALARY GIRO");
  assert.equal(mine.candidates[0].amount_cents, -NET_PAY_CENTS);
  assert.equal(mine.candidates[0].date_delta_days, 5);
  assert.equal(mine.candidates[0].class_hint, "payroll", "the estate's own classifier recognises SALARY");
});

test("S2 · a candidate already riding a live match, or under an open exception, is never offered", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-01", periodEnd: "2026-09-10", opening: 900000,
    specs: [{ entryDate: "2026-09-02", description: "SALARY", amountCents: -NET_PAY_CENTS }],
  });
  const lineId = stmt.lines[0].id;
  // Through the REAL door (owner floor) -- alice is the firm's founding member.
  await humanQuery(
    world.users.alice,
    namedCall("except_bank_line", [
      { name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
    ]),
    [lineId, "bank_error", "p947 fixture", opk947("except")],
  );

  const cands = await candidatesOf(world.users.alice, client);
  const mine = cands.find((c) => c.entry_id === run.entryId);
  assert.deepEqual(mine.candidates, [], "an excepted line is never offered as a candidate");
});

// ---------------------------------------------------------------------------
// S3 — the settlement door (AC2), driven end to end, and its refusals
// ---------------------------------------------------------------------------

test("S3 · accepting the candidate books Dr 2040 / Cr bank, approves it, writes a receipt, and matches the line through the existing bank-side door", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });
  const lineId = stmt.lines[0].id;

  const settleOpKey = opk947("c1-settle");
  const receipt = await settle(world.users.alice, { client: client, entry: run.entryId, line: lineId, opKey: settleOpKey });
  assert.ok(receipt.entry_id, "a settlement entry was created");
  assert.ok(receipt.match_id, "a match was created through the reused core");
  assert.equal(Number(receipt.unsettled_cents), NET_PAY_CENTS);
  assert.equal(receipt.posting_date, "2026-09-01", "posted on the bank line's own date");

  const lines = (await rootQuery("select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id=$1 order by line_no", [receipt.entry_id])).rows;
  assert.deepEqual(lines.map((l) => ({ account_code: l.account_code, debit_cents: Number(l.debit_cents), credit_cents: Number(l.credit_cents) })), [
    { account_code: "2040", debit_cents: NET_PAY_CENTS, credit_cents: 0 },
    { account_code: BANKCOA, debit_cents: 0, credit_cents: NET_PAY_CENTS },
  ], "Dr 2040 / Cr bank, for exactly the unsettled amount");

  const entry = (await rootQuery("select status, maker_actor, checker_actor, origin, flags from clara.journal_entries where id=$1", [receipt.entry_id])).rows[0];
  assert.equal(entry.status, "approved");
  assert.equal(entry.maker_actor, entry.checker_actor, "one human's own accept act, both sides");
  assert.equal(entry.flags.payroll_settlement.payroll_entry_id, run.entryId);

  const rcpt = (await rootQuery("select via_wake_kind, approval_arm, acting_actor, maker_active_at_approval from clara.entry_post_receipts where entry_id=$1", [receipt.entry_id])).rows;
  assert.equal(rcpt.length, 1);
  assert.equal(rcpt[0].via_wake_kind, "interactive");
  assert.equal(rcpt[0].approval_arm, "payroll_settlement_interactive");

  // THROUGH THE REUSED CORE: a real bank_matches row, live, one line member, one entry member
  // carrying the SETTLEMENT entry (never the original payroll entry) at the negative (credit-side)
  // amount -- exactly clara._match_bank_line_core's own shape.
  const match = (await rootQuery("select status, bank_account_id from clara.bank_matches where id=$1", [receipt.match_id])).rows[0];
  assert.equal(match.status, "live");
  assert.equal(match.bank_account_id, bank);
  const lineMember = (await rootQuery("select line_id, amount_cents::int as amount_cents, group_status from clara.bank_match_line_members where match_id=$1", [receipt.match_id])).rows;
  assert.deepEqual(lineMember, [{ line_id: lineId, amount_cents: -NET_PAY_CENTS, group_status: "live" }]);
  const entryMember = (await rootQuery("select entry_id, matched_cents::int as matched_cents, group_status from clara.bank_match_entry_members where match_id=$1", [receipt.match_id])).rows;
  assert.deepEqual(entryMember, [{ entry_id: receipt.entry_id, matched_cents: -NET_PAY_CENTS, group_status: "live" }]);

  // A replay of the SAME op_key returns the BYTE-IDENTICAL receipt and writes no second entry,
  // no second receipt and no second match.
  const replay = await settle(world.users.alice, { client: client, entry: run.entryId, line: lineId, opKey: settleOpKey });
  assert.deepEqual(replay, receipt, "a replayed op_key returns the identical receipt");
  const entryCount = (await rootQuery("select count(*)::int as n from clara.journal_entries where flags->'payroll_settlement'->>'payroll_entry_id'=$1", [run.entryId])).rows[0].n;
  assert.equal(entryCount, 1, "the replay wrote no second settlement entry");
});

test("S3 · a bank line whose amount does not match the unsettled cents is refused by name, and nothing is written", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -(NET_PAY_CENTS - 100) }],
  });
  const err = await caught(() => settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id }));
  assert.ok(err, "expected a refusal");
  assert.equal(err.code, "CLR10");
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "amount_mismatch");
  const entries = (await rootQuery("select count(*)::int as n from clara.journal_entries where flags->'payroll_settlement'->>'payroll_entry_id'=$1", [run.entryId])).rows[0].n;
  assert.equal(entries, 0, "no settlement entry was left behind by a refused attempt");
});

test("S3 · an already-settled run refuses a second acceptance, and a non-payroll entry is refused by name", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-10", opening: 900000,
    specs: [
      { entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS },
      { entryDate: "2026-09-02", description: "PAYROLL AGAIN", amountCents: -NET_PAY_CENTS },
    ],
  });
  await settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id });

  const err = await caught(() => settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[1].id }));
  assert.ok(err);
  assert.equal(err.code, "CLR10");
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "already_settled");

  // a non-payroll entry (an ordinary manual entry with no payroll_run flag) is refused by name.
  const manual = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-09-01", memo: "not payroll",
    lines: [
      { account_code: "6000", debit_cents: 500, credit_cents: 0, description: "x" },
      { account_code: "2040", debit_cents: 0, credit_cents: 500, description: "y" },
    ],
    opKey: opk947("notpayroll-draft"),
  });
  const tok = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [manual.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: manual.entry_id, expectedRevision: tok, opKey: opk947("notpayroll-approve") });
  const err2 = await caught(() => settle(world.users.alice, { client: client, entry: manual.entry_id, line: stmt.lines[1].id }));
  assert.ok(err2);
  assert.equal(err2.code, "CLR10");
  assert.equal(JSON.parse(err2.detail ?? "{}").reason, "not_a_payroll_entry");
});

// ---------------------------------------------------------------------------
// S4 — the three routes clear the row (AC3), with no dismissal record anywhere
// ---------------------------------------------------------------------------

test("S4 · route (a): Clara's own door clears the row", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });
  const before1 = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.ok(before1, "the row exists before settling");
  await settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id });
  const after1 = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.equal(after1, undefined, "route (a): the row is gone once Clara's own settlement lands");
});

test("S4 · route (b): a person's own hand-booked entry clears the row, with no involvement of clara.settle_payroll_net_pay", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const before1 = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.ok(before1);
  const drafted = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-09-02", memo: "salaries paid, booked by hand",
    lines: [
      { account_code: "2040", debit_cents: NET_PAY_CENTS, credit_cents: 0, description: "salaries" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: NET_PAY_CENTS, description: "bank" },
    ],
    opKey: opk947("byhand-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk947("byhand-approve") });
  const after1 = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.equal(after1, undefined, "route (b): a hand-booked debit alone clears the row -- no settlement door involved");
});

test("S4 · route (c): a hand-booked entry, then reconciled through the ordinary match_bank_line door, clears (and stays clear of) the row", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });
  const drafted = await draftEntry(human(world.users.alice), {
    client: client, resolution: await freshResolution(world.users.alice, client), postingDate: "2026-09-01", memo: "salaries paid, booked by hand then reconciled",
    lines: [
      { account_code: "2040", debit_cents: NET_PAY_CENTS, credit_cents: 0, description: "salaries" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: NET_PAY_CENTS, description: "bank" },
    ],
    opKey: opk947("recon-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk947("recon-approve") });

  // The row is ALREADY gone from the hand-booked debit alone (route (b)'s own fact) —
  const midway = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.equal(midway, undefined, "the balance already clears it before any reconciliation happens");

  // — and reconciling the bank line against it through the ORDINARY /bank door leaves it cleared.
  await humanQuery(
    world.users.alice,
    namedCall("match_bank_line", [
      { name: "p_client" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
      { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" }, { name: "p_op_key" },
    ]),
    [client, JSON.stringify([stmt.lines[0].id]), JSON.stringify([{ entry_id: drafted.entry_id, matched_cents: -NET_PAY_CENTS }]), null, false, opk947("recon-match")],
  );
  const after1 = (await candidatesOf(world.users.alice, client)).find((c) => c.entry_id === run.entryId);
  assert.equal(after1, undefined, "route (c): still clear after the ordinary bank reconciliation");
});

test("S4 · no dismissal record is written by any route: nothing new appears anywhere but the settlement entry itself and (route a) its match", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const before = (
    await rootQuery(
      `select (select count(*) from clara.journal_entries where client_id=$1) as entries,
              (select count(*) from clara.bank_matches where client_id=$1) as matches`,
      [client],
    )
  ).rows[0];
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });
  await settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id });
  const after = (
    await rootQuery(
      `select (select count(*) from clara.journal_entries where client_id=$1) as entries,
              (select count(*) from clara.bank_matches where client_id=$1) as matches`,
      [client],
    )
  ).rows[0];
  assert.equal(Number(after.entries) - Number(before.entries), 1, "exactly one new journal entry, the settlement itself");
  assert.equal(Number(after.matches) - Number(before.matches), 1, "exactly one new bank_matches row, the reused core's own");
});

// ---------------------------------------------------------------------------
// S5 — ambiguity (AC4): two equally-matching lines are both offered, and nothing chooses
// ---------------------------------------------------------------------------

test("S5 · two bank lines matching the same run's unsettled cents are BOTH offered, and settle neither", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-10", opening: 900000,
    specs: [
      { entryDate: "2026-09-01", description: "PAYROLL A", amountCents: -NET_PAY_CENTS },
      { entryDate: "2026-09-03", description: "PAYROLL B", amountCents: -NET_PAY_CENTS },
    ],
  });
  const cands = await candidatesOf(world.users.alice, client);
  const mine = cands.find((c) => c.entry_id === run.entryId);
  assert.equal(mine.candidates.length, 2, `both equally-matching lines are offered: ${JSON.stringify(mine.candidates)}`);
  const descriptions = mine.candidates.map((c) => c.description).sort();
  assert.deepEqual(descriptions, ["PAYROLL A", "PAYROLL B"]);
  // NOTHING chose: the run is still fully unsettled, and neither line rides a match.
  assert.equal(Number(mine.unsettled_cents), NET_PAY_CENTS);
  const matched = (await rootQuery("select count(*)::int as n from clara.bank_match_line_members where line_id = any($1)", [stmt.lines.map((l) => l.id)])).rows[0].n;
  assert.equal(matched, 0, "the read never matches a candidate by itself");
});

// ---------------------------------------------------------------------------
// S6 — Needs you (AC2's arm)
// ---------------------------------------------------------------------------

test("S6 · the queue carries the row with the month and the amount, and clears it once the run is settled", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);

  const rows1 = await queueRows(world.users.alice, client);
  const row = rows1.find((r) => r.row_kind === "payroll_net_pay_unsettled" && r.entry_id === run.entryId);
  assert.ok(row, `expected a payroll_net_pay_unsettled row: ${JSON.stringify(rows1.map((r) => r.row_kind))}`);
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(Number(row.amount_cents), NET_PAY_CENTS);
  assert.equal(row.period, "2026-08-01");
  assert.match(row.question_text, /Payroll for August 2026 is posted/);
  assert.equal(row.auto, false);
  assert.equal(row.high_stakes, false);

  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });
  await settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id });
  const rows2 = await queueRows(world.users.alice, client);
  assert.equal(rows2.some((r) => r.row_kind === "payroll_net_pay_unsettled" && r.entry_id === run.entryId), false, "the row is gone once settled");
});

test("S6 · declining leaves the row untouched: reading the queue twice without acting changes nothing", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const rows1 = await queueRows(world.users.alice, client);
  const rows2 = await queueRows(world.users.alice, client);
  const a = rows1.find((r) => r.row_kind === "payroll_net_pay_unsettled" && r.entry_id === run.entryId);
  const b = rows2.find((r) => r.row_kind === "payroll_net_pay_unsettled" && r.entry_id === run.entryId);
  assert.ok(a && b);
  assert.deepEqual(a, b, "no act, no state change -- the row reads identically both times, and there is no dismissal call to make");
});

// ---------------------------------------------------------------------------
// S7 — the fix round's own two walls, each DRIVEN through the real doors.
// ---------------------------------------------------------------------------

test("S7 · reversing ONE run leaves every other run's balance exactly where it was (ADV-01)", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const may = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-05") } });
  const august = await postPayrollRun(world.users.alice, client, { answers: { "payroll.run.period": value("2026-08") } });

  const unsettled = async () => {
    const rows = (await rootQuery(
      "select entry_id, unsettled_cents from clara._payroll_net_pay_unsettled($1)", [client])).rows;
    return Object.fromEntries(rows.map((r) => [r.entry_id, Number(r.unsettled_cents)]));
  };
  const before = await unsettled();
  assert.equal(before[may.entryId], NET_PAY_CENTS, "May is wholly unpaid before anything is reversed");
  assert.equal(before[august.entryId], NET_PAY_CENTS, "…and so is August");

  // THE ACT: reverse AUGUST through the estate's own door. clara.reverse_entry builds the mirror
  // with the legs SWAPPED and does not copy flags, so an approved, non-reversed 2040 DEBIT is
  // left behind that belongs to no payment at all.
  const rev = (await humanQuery(
    world.users.alice,
    namedCall("reverse_entry", [{ name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [august.entryId, "read the wrong month", opk947("rev")],
  )).rows[0].result;
  assert.equal(rev.status, "approved", "the reversal itself posts (an ordinary-stakes mirror)");

  const after = await unsettled();
  assert.equal(after[august.entryId], undefined, "the reversed run drops out of the read entirely");
  assert.equal(after[may.entryId], NET_PAY_CENTS,
    "MAY IS STILL UNPAID: a reversal mirror is not a payment, and charging it against another run would settle a debt nobody paid");

  const offered = await candidatesOf(world.users.alice, client);
  assert.equal(offered.filter((r) => r.entry_id === may.entryId).length, 1,
    "…and May is still offered for settlement");
});

test("S7 · a HIGH-STAKES settlement is left a draft for a distinct checker, not self-approved (ADV-04)", async (t) => {
  if (unready(t)) return;
  const client = await freshClient(world.users.alice);
  await seedPayrollChart(world.users.alice, client);
  const run = await postPayrollRun(world.users.alice, client);
  const bank = await freshBank(world.users.alice, client);
  const stmt = await enterStatement(world.users.alice, {
    client: client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-08-25", periodEnd: "2026-09-05", opening: 900000,
    specs: [{ entryDate: "2026-09-01", description: "PAYROLL", amountCents: -NET_PAY_CENTS }],
  });

  const firm = await firmOf(client);
  const restore = (await rootQuery("select high_stakes_amount_cents as v from clara.firms where id=$1", [firm])).rows[0].v;
  // An ORDINARY firm setting: RM1,000. Ten staff clears it, and so does commercial rent.
  await rootQuery("update clara.firms set high_stakes_amount_cents=100000 where id=$1", [firm]);
  try {
    const checkers = (await rootQuery("select clara.eligible_checker_count($1)::int as n", [firm])).rows[0].n;
    assert.ok(checkers >= 2, "the premise: this firm really does have a second pair of eyes available");

    // THE CONTRAST, DRIVEN FIRST so the claim is not an argument: the SAME entry booked by hand
    // and approved by its own maker is refused by the ordinary door.
    const byHand = await draftEntry(human(world.users.alice), {
      client: client, resolution: await freshResolution(world.users.alice, client),
      postingDate: "2026-09-01", memo: "by hand",
      lines: [
        { account_code: "2040", debit_cents: NET_PAY_CENTS, credit_cents: 0, description: "dr" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: NET_PAY_CENTS, description: "cr" },
      ],
      opKey: opk947("hs-draft"),
    });
    const tok = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [byHand.entry_id])).rows[0].revision_token;
    const refused = await caught(() => approveEntry(world.users.alice, { entry: byHand.entry_id, expectedRevision: tok, opKey: opk947("hs-self") }));
    assert.ok(refused, "the ordinary door refuses a maker's own approval of a high-stakes entry");
    assert.equal(refused.code, "CLR05");
    assert.equal(JSON.parse(refused.detail ?? "{}").reason, "distinct_checker");

    // AND NOW THE SETTLEMENT DOOR, at parity.
    const out = await settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id });
    assert.equal(out.status, "awaiting_checker", "the settlement does NOT self-approve a high-stakes entry");
    assert.equal(out.reason, "high_stakes_needs_checker");
    assert.equal(out.match_id, null, "and nothing is matched: an unapproved entry is not a match candidate");
    const e = (await rootQuery(
      "select status, checker_actor, self_approval_attestation from clara.journal_entries where id=$1",
      [out.entry_id])).rows[0];
    assert.equal(e.status, "draft", "the entry is left a DRAFT — clara.reverse_entry's own posture");
    assert.equal(e.checker_actor, null, "nobody checked it");
    assert.equal(e.self_approval_attestation, null, "and no attestation was invented on a person's behalf");
    const receipts = (await rootQuery(
      "select count(*)::int as n from clara.entry_post_receipts where entry_id=$1", [out.entry_id])).rows[0].n;
    assert.equal(receipts, 0, "no post receipt for an entry that was never posted");

    // NOTHING IS DARK: the run stays open by the ledger, so the work is still visible…
    const still = (await rootQuery(
      "select unsettled_cents from clara._payroll_net_pay_unsettled($1) where entry_id=$2",
      [client, run.entryId])).rows[0];
    assert.equal(Number(still.unsettled_cents), NET_PAY_CENTS, "the run is still unsettled until a checker approves");

    // …and a SECOND accept is refused by name rather than minting a second draft.
    const dup = await caught(() => settle(world.users.alice, { client: client, entry: run.entryId, line: stmt.lines[0].id, opKey: opk947("hs-again") }));
    assert.ok(dup, "a second accept while one is awaiting its checker is refused");
    assert.equal(JSON.parse(dup.detail ?? "{}").reason, "settlement_awaiting_checker");

    // …and the ordinary door FINISHES it: a DISTINCT checker approves the draft the door left.
    const tok2 = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [out.entry_id])).rows[0].revision_token;
    await approveEntry(world.users.bob, { entry: out.entry_id, expectedRevision: tok2, opKey: opk947("hs-check") });
    const settled = (await rootQuery(
      "select count(*)::int as n from clara._payroll_net_pay_unsettled($1) where entry_id=$2 and unsettled_cents > 0",
      [client, run.entryId])).rows[0].n;
    assert.equal(settled, 0, "once a distinct checker approves, the run is settled — the act completes through existing doors");
  } finally {
    await rootQuery("update clara.firms set high_stakes_amount_cents=$2 where id=$1", [firm, restore]);
  }
});
