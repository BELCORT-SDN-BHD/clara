// #638 — STAFF EXPENSE CLAIMS, EMPLOYEE PAYABLES AND ADVANCE SETTLEMENT.
// Migration: 0206_staff_expense_claims.sql.
//
// Frontier-gated on the `staff_expense_claims$` stem (and on #623's own stem for the Work verbs it
// drives), so `db-slice-frontiers` legs pinned below either migration skip cleanly.
//
// WHAT THIS FILE IS ABOUT. #638 asks that a supported staff expense claim — with or without an
// attachment — records WHO claimed, WHAT was itemised, WHEN it was incurred and when it posts, and
// then commits the claim object, the balanced journal and the employee-payable / advance
// consequence ATOMICALLY, with one operation receipt per act and a correction that unwinds the
// linked allocation rather than only reversing GL lines. Those are claims about DATA, so every
// cell below reads the committed rows under the real least-privileged roles rather than trusting a
// verb's own answer.
//
// THE STRUCTURAL CLAIM THE WHOLE BATTERY LEANS ON, asserted in its own cell (`p638.core.no_regression`):
// **#638 recuts NOTHING shared.** A staff expense claim is a `journal_entry`-purpose Work with
// `adjustment_basis` NULL, so it posts through the UNCHANGED `clara._record_journal_entry_core`,
// and both purpose CHECKs keep their exact 0194 three-valued text. If a later hand widens a purpose
// or edits the posting core to make a claim "cleaner", that cell goes red.
//
// WHY EVERY POSITIVE FIXTURE RUNS UNDER A REAL `interactive_client` CREDENTIAL: #623's reason,
// unchanged. The whole point of this lane is that role, client, period, chart and the claim's own
// relationships are re-checked AT COMMIT under the initiator's LIVE authority.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND, and all four halves are asserted every time: no journal
// rows, no committed receipt, no `clara.staff_expense_claims` row and no new enrolment.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  WCHART, CLR, BUNDLE_DIGEST, assertPair, assertRaises, detailOf,
  rootQuery, humanQuery, opk, workRow, receiptsForWork, entriesForClient, linesOf,
  entryCount, committedReceiptCount, AGENT_USER_ID, admitJournalWork, basis,
  reverseEntry, seedFiscalYear, entryLinksFor,
  // #638
  gateSec, SEC_REASON, SECHART, SETTLEMENT, SEC_DATE, ensureSecChart, enrolAdvanceFor,
  liveEnrolment, claim, basisForClaim, admitStaffExpenseClaimWork, listStaffExpenseClaims,
  getStaffExpenseClaim, getWorkClaimOrigin, claimsForClient, claimRow, claimCount, claimStatus,
  applicationsForEntry, advancesForClient, advanceOutstanding, seedAdvance,
} from "./staff-expense-claim-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
  for (const [key, client] of [["A1", world.clients.A1], ["A2", world.clients.A2]]) {
    await ensureSecChart(world.users.alice, client, key);
  }
});
after(async () => {
  printLaneNotes("staff-expense-claim");
  printSkipCount("staff-expense-claim");
  await endPool();
});

const A1 = () => world.clients.A1;
const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const CAROL = () => world.users.carol;

/** A dedicated client of firm A carrying this battery's chart — used wherever a cell makes an
 *  IRREVERSIBLE change (an append-only fiscal year, a new enrolment, a seeded advance). */
async function secClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureSecChart(ALICE(), client, tag);
  return client;
}

/** Admit a claim Work, claim its run, and mint the credential the run would hold. */
async function armed({ client = null, author = null, claim: c = null, sourceRefs = [], intentKey = null } = {}) {
  const cli = client ?? A1();
  const who = author ?? ALICE();
  const payload = c ?? claim();
  const work = await admitStaffExpenseClaimWork({
    client: cli, author: who, claim: payload, sourceRefs, intentKey,
  });
  await claimWorkRun({ task: work.task_id, runId: opk("sec-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client: cli });
  return { ...work, cred, client: cli, author: who, claim: payload, basis: basisForClaim(payload) };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

/** A refusal leaves NOTHING behind: no entry, no committed receipt, no claim row, no enrolment. */
async function refusesSec(client, code, reason, fn, label) {
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);
  const claims = await claimCount(client);
  const enrolments = (await rootQuery(
    "select count(*)::int n from clara.staff_advance_accounts where client_id=$1", [client])).rows[0].n;
  const out = await assertPair(code, reason, fn, label);
  assert.equal(await entryCount(client), entries, `${label}: no journal row was written`);
  assert.equal(await committedReceiptCount(client), receipts, `${label}: no committed receipt`);
  assert.equal(await claimCount(client), claims, `${label}: no staff_expense_claims row`);
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.staff_advance_accounts where client_id=$1", [client])).rows[0].n,
  enrolments, `${label}: no enrolment was auto-created by a refused claim`);
  return out;
}

// ===========================================================================================
// 1 · p638.claim.posts — the whole journey, read from the committed rows.
// ===========================================================================================

test("p638.claim.posts a reimbursement claim posts ONE entry, ONE receipt, ONE claim row and ONE posted ledger row", async (t) => {
  if (await gateSec(t)) return;
  const c = claim();                                 // 48000 + 12500 = 60500 cents
  const a = await armed({ claim: c });
  const before = await entryCount(A1());

  // A CLAIM IS A `journal_entry` WORK. The identity says so on its face, which is the machine
  // proof that #638 did not widen the purpose vocabulary to make itself readable.
  assert.equal(a.logical_op_id, `work:${a.work_id}:journal_entry:1`,
    "claim.posts: the server-assigned identity carries the UNWIDENED journal_entry purpose");
  assert.ok(a.claim_id, "claim.posts: admission answers with the claim it wrote");
  assert.equal(a.replayed, false);

  // --- the CLAIM ROW, born at ADMISSION -----------------------------------------------------
  const row = await claimRow(a.claim_id);
  assert.ok(row, "claim.posts: the claim row exists BEFORE the run posts anything");
  assert.equal(row.work_id, a.work_id);
  assert.equal(row.logical_op_id, a.logical_op_id);
  assert.equal(String(row.amount_cents), "60500", "claim.posts: EXACT minor units");
  assert.equal(row.currency, "MYR");
  assert.equal(row.settlement, SETTLEMENT.reimbursement);
  assert.equal(row.payable_account_code, SECHART.payable);
  assert.equal(row.incurred_date_text, SEC_DATE.incurred,
    "claim.posts: the incurred date is its OWN fact, distinct from the posting date");
  assert.equal(row.posting_date_text, SEC_DATE.posting);
  assert.equal(row.claimant_label, "Farah binti Idris");
  assert.equal(row.claimant_enrolment_id, await liveEnrolment(A1(), SECHART.advance),
    "claim.posts: the claimant is the staff-advance ENROLMENT handle, never a counterparty");
  assert.equal(row.items.length, 2, "claim.posts: both itemised lines are kept");
  assert.equal(row.items[0].amount_cents, 48000);
  assert.deepEqual(row.items[0].supplied_tax,
    { stated_code: "SR", stated_cents: 2880, note: "as printed on the receipt" },
    "claim.posts: supplied tax facts are carried VERBATIM and validated against nothing");
  assert.equal(row.on_behalf_of, ALICE());

  const admitted = await claimStatus(a.claim_id);
  assert.deepEqual(admitted.map((s) => s.state), ["admitted"],
    "claim.posts: the status ledger opens at `admitted` and nothing else");

  // --- the POSTING, through the UNCHANGED wake verb -----------------------------------------
  const out = await post(a);
  assert.equal(out.posted, true, "claim.posts: posted");
  assert.equal(out.replayed, false);
  assert.ok(out.entry_id && out.receipt_id, "claim.posts: the answer names the entry and the receipt");
  assert.equal(out.adjustment_id, undefined,
    "claim.posts: no adjustment_id — the claim rides `journal_entry`, so INSERTION 5 never runs");
  assert.equal(await entryCount(A1()), before + 1, "claim.posts: exactly ONE new entry");

  const entry = (await entriesForClient(A1())).find((e) => e.id === out.entry_id);
  assert.equal(entry.status, "approved");
  assert.equal(entry.posting_date, SEC_DATE.posting,
    "claim.posts: the EXACT supplied posting date, never a timezone-shifted one");

  // --- the LINES: two expense debits and ONE non-control payable credit ---------------------
  const lines = await linesOf(out.entry_id);
  assert.equal(lines.length, 3, "claim.posts: two itemised debits and one settlement credit");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.travel).debit_cents), "48000");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.meals).debit_cents), "12500");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.payable).credit_cents), "60500",
    "claim.posts: the employee payable is a NON-CONTROL liability leg (0150:1503), never an open item");

  // THE EMPLOYEE IS NOT A COUNTERPARTY AND HAS NO OPEN ITEM — 0042 tail 20(a)/(b)'s ground, read
  // as data on this very client rather than trusted from the migration's own tail.
  const items = await rootQuery(
    "select count(*)::int n from clara.open_items where client_id=$1 and created_at > now() - interval '1 hour'",
    [A1()]);
  assert.equal(items.rows[0].n, 0, "claim.posts: an employee payable mints NO open item");

  // --- the RECEIPT --------------------------------------------------------------------------
  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts.length, 1, "claim.posts: ONE operation receipt");
  assert.equal(receipts[0].outcome, "committed");
  assert.equal(receipts[0].purpose, "journal_entry",
    "claim.posts: the receipt's purpose is the WORK's purpose, still the unwidened journal_entry");
  assert.equal(receipts[0].on_behalf_of, ALICE());
  assert.equal(receipts[0].bundle_digest, BUNDLE_DIGEST);
  assert.equal(receipts[0].effects.entry_id, out.entry_id);

  // …and ONE `clara.op_receipts` row under the SAME logical identity (0195:1963).
  const ops = await rootQuery(
    "select count(*)::int n from clara.op_receipts where fn='record_journal_entry' and op_key=$1",
    [a.logical_op_id]);
  assert.equal(ops.rows[0].n, 1,
    "claim.posts: one op_receipts row under the same logical_op_id — one-receipt-per-act is inherited");

  // --- the STATUS LEDGER gains `posted`, written by the receipt's own trigger ----------------
  const ledger = await claimStatus(a.claim_id);
  const posted = ledger.find((s) => s.state === "posted");
  assert.ok(posted, "claim.posts: the operation_receipts trigger appended `posted`");
  assert.equal(posted.entry_id, out.entry_id);
  assert.equal(posted.receipt_id, out.receipt_id);

  // --- the WORK -----------------------------------------------------------------------------
  const w = await workRow(a.work_id);
  assert.equal(w.purpose, "journal_entry");
  assert.equal(w.adjustment_basis, null,
    "claim.posts: the claim carries NO adjustment_basis — 0195:2165 is guarded on that column");
  assert.equal(w.result.entry_id, out.entry_id);
  assert.equal(w.result.receipt_id, out.receipt_id);

  // --- the CLAIM ROW IS UNCHANGED BY POSTING ------------------------------------------------
  const after = await claimRow(a.claim_id);
  assert.equal(String(after.amount_cents), "60500");
  assert.deepEqual(after.items, row.items, "claim.posts: the items were born at admission and never moved");
});

// ===========================================================================================
// 2 · p638.core.no_regression — #638 recuts nothing shared.
// ===========================================================================================

test("p638.core.no_regression both purpose CHECKs and the six pinned bodies are byte-identical after 0206", async (t) => {
  if (await gateSec(t)) return;
  const EXPECT = "CHECK ((purpose = ANY (ARRAY['journal_entry'::text, "
    + "'periodic_stock_adjustment'::text, 'payroll_obligation'::text])))";
  for (const [table, name] of [
    ["clara.accounting_work", "accounting_work_purpose_check"],
    ["clara.operation_receipts", "operation_receipts_purpose_check"],
  ]) {
    const r = await rootQuery(
      "select pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass and conname=$2",
      [table, name]);
    assert.equal(r.rows[0].d, EXPECT,
      `core.no_regression: ${name} is NOT the 0194 three-valued CHECK — #638 widened a purpose`);
  }
  // The six bodies #638 edits none of. The migration's own §H pins them by sha; this cell proves
  // they are still REACHABLE and unchanged from the outside, so a later recut in another branch
  // that merged after 0206 shows up here rather than nowhere.
  const SIGS = [
    "clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)",
    "clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)",
    "clara._assert_adjustment_basis(text,jsonb)",
    "clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)",
    "clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)",
    "clara._adv_on_approve(uuid)",
  ];
  for (const sig of SIGS) {
    const r = await rootQuery("select 1 from pg_proc where oid = $1::regprocedure", [sig]);
    assert.equal(r.rowCount, 1, `core.no_regression: ${sig} is absent — a signature moved`);
  }
  // …and the posting core still looks the Work up through its CLOSED three-value IN-list. A
  // fourth value here would mean somebody widened the lookup to carry a claim purpose.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = $1::regprocedure", [SIGS[1]])).rows[0].prosrc;
  assert.ok(src.includes("'journal_entry','periodic_stock_adjustment','payroll_obligation'"),
    "core.no_regression: the posting core's purpose IN-list is no longer the 0195 three");
  assert.equal(src.includes("staff_expense_claim"), false,
    "core.no_regression: the posting core names the claim lane — #638 was supposed to recut nothing");
});

// ===========================================================================================
// 3 · p638.advance.debit — the WALL this ticket does NOT move.
// ===========================================================================================

test("p638.advance.debit a Work-lane entry DEBITING an enrolled advance account is refused CLR40 advance_movement_unregistered", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("advdebit");
  const b = basis({
    postingDate: "2026-04-30", memo: "#638: a Work-lane debit onto an enrolled advance account",
    lines: [
      { account_code: SECHART.advance, debit_cents: 25000, credit_cents: 0, description: "advance" },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 25000, description: "bank" },
    ],
  });
  const w = await admitJournalWork({ client, author: ALICE(), basis: b });
  await claimWorkRun({ task: w.task_id, runId: opk("sec-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });

  // THE MEASURED TRUTH, PINNED RATHER THAN FIXED. `clara._record_journal_entry_core` inserts a
  // draft and flips it approved with a bare UPDATE (0195:2098-2112), so `_subledger_on_approve`
  // — and therefore `_adv_on_approve`'s soft-birth arm — never runs on this lane; the belt, a
  // CONSTRAINT trigger, fires on every approved row and finds no register act. #639 shares this
  // blocker (DECISIONS D5); #638 does not route around it, and the claim lane never debits an
  // advance account (every item account must be expense-class).
  await refusesSec(client, "CLR40", SEC_REASON.movementUnregistered,
    () => wakeRecordJournalEntry(cred.secret, {
      client, work: w.work_id, logicalOpId: w.logical_op_id, basis: b,
    }),
    "advance.debit");
});

// ===========================================================================================
// 4 · p638.advance.order — the birth trigger fires BEFORE the belt.
// ===========================================================================================

test("p638.advance.order the claim birth trigger sorts before t_je_adv_movement_belt", async (t) => {
  if (await gateSec(t)) return;
  const r = await rootQuery(
    `select tgname, tgdeferrable, tginitdeferred from pg_trigger
      where tgrelid='clara.journal_entries'::regclass and not tgisinternal
        and tgname in ('t_je_adv_claim_application_birth','t_je_adv_movement_belt')
      order by tgname collate "C"`);
  assert.deepEqual(r.rows.map((x) => x.tgname),
    ["t_je_adv_claim_application_birth", "t_je_adv_movement_belt"],
    "advance.order: the birth trigger must sort BEFORE the belt — deferred constraint-trigger "
    + "events on one row queue in trigger-NAME order, so the name IS the mechanism");
  for (const row of r.rows) {
    assert.equal(row.tgdeferrable, true, `advance.order: ${row.tgname} is not deferrable`);
    assert.equal(row.tginitdeferred, true, `advance.order: ${row.tgname} is not initially deferred`);
  }
});

// ===========================================================================================
// 5 · p638.advance.happy / p638.advance.over — the advance-application arm.
// ===========================================================================================

test("p638.advance.happy settlement=advance_application mints a kind='claim' allocation and moves outstanding by exactly the claim", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("advhappy");
  const seeded = await seedAdvance(ALICE(), BOB(), {
    client, cents: 100000, issueDate: "2026-02-01",
  });
  assert.equal(await advanceOutstanding(seeded.advance.id, "2026-03-31"), 100000,
    "advance.happy: the seeded advance is outstanding in full before the claim");

  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: seeded.advance.id,
    payableAccountCode: null,
  });
  const a = await armed({ client, claim: c });
  const out = await post(a);
  assert.equal(out.posted, true, "advance.happy: the belt did NOT raise — the birth trigger covered the credit");

  const lines = await linesOf(out.entry_id);
  const creditLine = lines.find((l) => l.account_code === SECHART.advance);
  assert.equal(String(creditLine.credit_cents), "60500");

  const apps = await applicationsForEntry(out.entry_id);
  assert.equal(apps.length, 1, "advance.happy: exactly ONE allocation row");
  assert.equal(apps[0].kind, "claim", "advance.happy: minted under 0043's own `claim` kind");
  assert.equal(String(apps[0].amount_cents), "60500");
  assert.equal(apps[0].advance_id, seeded.advance.id);
  assert.equal(apps[0].application_line_id, creditLine.id,
    "advance.happy: the allocation is keyed to the very credit leg the belt reads");
  assert.equal(apps[0].effective_date_text, SEC_DATE.posting,
    "advance.happy: the effective date is the ENTRY's posting date (0043 SS3.2), never a caller's");

  assert.equal(await advanceOutstanding(seeded.advance.id, SEC_DATE.posting), 100000 - 60500,
    "advance.happy: outstanding moved by EXACTLY the allocated cents at the effective date");
  assert.equal(await advanceOutstanding(seeded.advance.id, "2026-03-30"), 100000,
    "advance.happy: …and not one day earlier");

  const row = await claimRow(a.claim_id);
  assert.equal(row.advance_id, seeded.advance.id, "advance.happy: the claim names the advance it discharged");
  assert.equal(row.settlement, SETTLEMENT.advance);
});

test("p638.advance.over an allocation beyond the advance's outstanding is refused before admission", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("advover");
  const seeded = await seedAdvance(ALICE(), BOB(), { client, cents: 20000, issueDate: "2026-02-01" });
  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: seeded.advance.id,
    payableAccountCode: null,
  });
  // 60500 claimed against a 20000 advance: the SS3.2 equation would go negative.
  await refusesSec(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }),
    "advance.over");
});

test("p638.advance.race two concurrent claims over one advance's boundary: exactly one wins", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("advrace");
  const seeded = await seedAdvance(ALICE(), BOB(), { client, cents: 70000, issueDate: "2026-02-01" });
  const mk = () => claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: seeded.advance.id,
    payableAccountCode: null,
  });
  // 60500 + 60500 = 121000 against 70000 outstanding: at most ONE may post.
  const a = await armed({ client, claim: mk() });
  const b = await armed({ client, claim: mk() });
  const results = await Promise.allSettled([post(a), post(b)]);
  const posted = results.filter((r) => r.status === "fulfilled" && r.value.posted === true);
  assert.equal(posted.length, 1,
    `advance.race: exactly ONE of the two concurrent claims posts (got ${posted.length}); `
    + `outcomes: ${JSON.stringify(results.map((r) => r.status === "fulfilled" ? "ok" : (r.reason?.code ?? "err")))}`);
  assert.equal(await advanceOutstanding(seeded.advance.id, SEC_DATE.posting), 70000 - 60500,
    "advance.race: outstanding moved exactly once");
});

// ===========================================================================================
// 6 · p638.claimant.autoenrol / p638.claimant.floor
// ===========================================================================================

test("p638.claimant.autoenrol a bookkeeper's claim auto-enrols a NEW claimant with every 0043 enrol wall satisfied", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("autoenrol");
  assert.equal(await liveEnrolment(client, SECHART.advanceFresh), null,
    "claimant.autoenrol: the fixture code starts with NO live enrolment");

  const c = claim({
    claimantCode: SECHART.advanceFresh,
    personLabel: "Nur Amirah binti Zainal",
    attestation: "Dedicated to Nur Amirah; she is not a director and this is not a related-party balance.",
    identifier: "EMP-0042",
  });
  const a = await armed({ client, author: BOB(), claim: c });   // BOB is a BOOKKEEPER

  const enrolment = await liveEnrolment(client, SECHART.advanceFresh);
  assert.ok(enrolment, "claimant.autoenrol: the door enrolled the new claimant INSIDE the transaction");
  const row = (await rootQuery(
    "select * from clara.staff_advance_accounts where id=$1", [enrolment])).rows[0];
  assert.equal(row.person_label, "Nur Amirah binti Zainal");
  assert.ok(row.enrolment_attestation.includes("not a related-party"),
    "claimant.autoenrol: the professional's OWN attestation is stored verbatim");
  assert.equal(row.created_by, BOB(), "claimant.autoenrol: attributed to the authorising human");
  assert.equal(row.active, true);
  assert.equal((await claimRow(a.claim_id)).claimant_enrolment_id, enrolment);
  assert.equal((await claimRow(a.claim_id)).claimant_identifier, "EMP-0042");

  // A SECOND claim for the same person REUSES the enrolment rather than minting a second one.
  await armed({ client, author: BOB(), claim: claim({ claimantCode: SECHART.advanceFresh, personLabel: "Nur Amirah binti Zainal" }) });
  const n = (await rootQuery(
    "select count(*)::int n from clara.staff_advance_accounts where client_id=$1 and account_code=$2",
    [client, SECHART.advanceFresh])).rows[0].n;
  assert.equal(n, 1, "claimant.autoenrol: one live enrolment per code, not one per claim");
});

test("p638.claimant.floor the SAME bookkeeper is still refused by clara.enrol_staff_advance_account directly (CLR04, WDB-G6)", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("floor");
  await assertRaises("CLR04", () => enrolAdvanceFor(BOB(), {
    client, code: SECHART.advanceFresh, person: "Direct enrolment by a bookkeeper",
  }), "claimant.floor");
  assert.equal(await liveEnrolment(client, SECHART.advanceFresh), null,
    "claimant.floor: …and nothing was enrolled");
});

// ===========================================================================================
// 7 · p638.items.continue — per-item continuation inside ONE claim.
// ===========================================================================================

test("p638.items.continue an item whose own fact is missing waits alone while the independent items post", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("items");
  const c = claim({
    items: [
      { description: "KL–Penang return flight", expense_account_code: SECHART.travel, amount_cents: 48000 },
      { description: "Taxi, receipt undated", expense_account_code: SECHART.meals,
        pending_fact: "incurred_date" },
    ],
  });
  assert.equal(c.amount_cents, 48000,
    "items.continue: the pending item contributes NOTHING to the claim total");

  const a = await armed({ client, claim: c });
  const out = await post(a);
  assert.equal(out.posted, true);

  const lines = await linesOf(out.entry_id);
  assert.equal(lines.length, 2, "items.continue: the pending item did NOT post a line");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.payable).credit_cents), "48000");

  const ledger = await claimStatus(a.claim_id);
  const states = ledger.map((s) => s.state).sort();
  assert.deepEqual(states, ["admitted", "items_pending", "posted"].sort(),
    "items.continue: the ledger shows BOTH halves — what posted and what is still waiting");
  const pending = ledger.find((s) => s.state === "items_pending");
  assert.equal(pending.detail.items.length, 1);
  assert.equal(pending.detail.items[0].pending_fact, "incurred_date",
    "items.continue: …and it NAMES the fact that is missing, rather than leaving it to be guessed");
  assert.equal(pending.detail.items[0].description, "Taxi, receipt undated");
});

test("p638.items.continue a claim whose EVERY item is pending is refused claim_all_zero", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("itemsallpending");
  const c = claim({
    items: [{ description: "Taxi, receipt undated", expense_account_code: SECHART.meals, pending_fact: "incurred_date" }],
  });
  await refusesSec(client, "CLR10", SEC_REASON.allZero,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }),
    "items.allPending");
});

// ===========================================================================================
// 8 · p638.refusals — the whole §F vocabulary, table-driven.
// ===========================================================================================

test("p638.refusals every typed claim refusal fires by name, before anything durable", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("refusals");
  const advanceId = (await seedAdvance(ALICE(), BOB(), { client, cents: 500000, issueDate: "2026-01-05" })).advance.id;

  const cases = [
    ["claimant_missing", "CLR10", SEC_REASON.claimantMissing,
      { claimantCode: "   ", personLabel: null }],
    ["claimant_not_enrolled", "CLR10", SEC_REASON.claimantNotEnrolled,
      { enrolmentId: "00000000-0000-4000-8000-000000000001" }],
    ["incurred_date_missing", "CLR10", SEC_REASON.incurredMissing, { incurredDate: "" }],
    ["incurred_after_posting", "CLR10", SEC_REASON.incurredAfterPosting,
      { incurredDate: "2026-04-30", postingDate: "2026-03-31" }],
    ["item_account_not_expense", "CLR10", SEC_REASON.itemAccountNotExpense,
      { items: [{ description: "Stock", expense_account_code: SECHART.notAnExpense, amount_cents: 1000 }] }],
    ["items_do_not_sum", "CLR10", SEC_REASON.itemsDoNotSum, { amountCents: 60499 }],
    ["claim_all_zero", "CLR10", SEC_REASON.allZero,
      { items: [{ description: "Nothing", expense_account_code: SECHART.travel, amount_cents: 0 }], amountCents: 0 }],
    ["payable_account_is_control", "CLR10", SEC_REASON.payableIsControl,
      { payableAccountCode: SECHART.control }],
    ["advance_not_enrolled", "CLR10", SEC_REASON.advanceNotEnrolled,
      { settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advanceFresh, advanceId, payableAccountCode: null }],
    ["advance_allocation_mismatch", "CLR10", SEC_REASON.allocationMismatch,
      { settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
        advanceId: "00000000-0000-4000-8000-000000000002", payableAccountCode: null }],
  ];

  for (const [label, code, reason, over] of cases) {
    await refusesSec(client, code, reason,
      () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: claim(over) }),
      `refusals.${label}`);
  }

  // CLR04 — a VIEWER may not admit a claim.
  await refusesSec(client, "CLR04", "insufficient_role",
    () => admitStaffExpenseClaimWork({ client, author: CAROL(), claim: claim() }),
    "refusals.viewer");
});

test("p638.refusals a claim into a CLOSED fiscal year is refused CLR19 write_into_closed_period at COMMIT", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("closedfy");
  await seedFiscalYear(client, {
    startsOn: "2025-01-01", endsOn: "2025-12-31", status: "closed", openedBy: ALICE(),
  });
  const c = claim({ incurredDate: "2025-06-01", postingDate: "2025-06-30" });
  const a = await armed({ client, claim: c });
  await assertRaises("CLR19", () => post(a), "refusals.closedPeriod");
  assert.equal(await entryCount(client), 0, "refusals.closedPeriod: nothing posted");
});

test("p638.refusals CLR04 obo_not_initiator — a credential minted for one human cannot post another's claim", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("obo");
  const a = await armed({ client, author: ALICE(), claim: claim() });
  const wrong = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client });
  await assertPair("CLR04", "obo_not_initiator", () => wakeRecordJournalEntry(wrong.secret, {
    client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis,
  }), "refusals.oboNotInitiator");
  assert.equal(await entryCount(client), 0, "refusals.oboNotInitiator: nothing posted");
});

// ===========================================================================================
// 9 · p638.no_second_approval — PRD:114, pinned.
// ===========================================================================================

test("p638.no_second_approval a claim above the firm's high-stakes floor posts in ONE transaction with no checker ceremony", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("highstakes");
  const floor = Number((await rootQuery(
    "select high_stakes_amount_cents n from clara.firms where id=$1", [FIRM_A()])).rows[0].n);
  const big = floor + 100000;
  const c = claim({
    items: [{ description: "Conference, Singapore", expense_account_code: SECHART.travel, amount_cents: big }],
  });
  const a = await armed({ client, claim: c });
  const out = await post(a);
  assert.equal(out.posted, true,
    "no_second_approval: an amount above the firm floor posts through the Work lane in one act");
  const entry = (await entriesForClient(client)).find((e) => e.id === out.entry_id);
  assert.equal(entry.status, "approved", "no_second_approval: approved, never `drafted`");
  assert.equal(entry.checker_actor, AGENT_USER_ID,
    "no_second_approval: the checker is the agent identity — no second human was demanded");
  // THE RECORDED FINDING (not a blueprint edit): `clara.is_high_stakes` is NOT amount-only
  // (0004:72-78 — opening balance, year end, tax_affecting), and `book_staff_advance_application`
  // (0043:2666) keeps the older DRAFTED branch. The Work lane deliberately does not inherit it
  // (PRD:114 — 不以金额强制增加第二人审批).
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.is_high_stakes(uuid,bigint,boolean,boolean,boolean)'::regprocedure"
  ).catch(() => ({ rows: [] }))).rows[0]?.prosrc ?? "";
  if (src !== "") {
    assert.ok(src.includes("tax_affecting") || src.includes("is_year_end"),
      "no_second_approval: is_high_stakes still fires on a NON-amount axis — recorded as a ticket finding");
  }
});

// ===========================================================================================
// 10 · p638.walls — the four live tail assertions this ticket must not move.
// ===========================================================================================

test("p638.walls 0042 tail 20(a)/(b) are live, a payable-class leg still refuses, and the hook census is still four", async (t) => {
  if (await gateSec(t)) return;
  // (a) open_items names no advance/claim concept.
  const defs = (await rootQuery(
    `select coalesce(string_agg(pg_get_constraintdef(c.oid), ' ~ '), '') d from pg_constraint c
      where c.conrelid='clara.open_items'::regclass and c.contype='c'`)).rows[0].d;
  assert.ok(defs.includes("'ar'") && defs.includes("'ap'"), "walls: open_items lost its ar/ap domain pair");
  assert.equal(defs.includes("advance"), false, "walls: an open_items CHECK admits an advance concept");
  const cols = (await rootQuery(
    `select coalesce(string_agg(column_name, ','), '') c from information_schema.columns
      where table_schema='clara' and table_name='open_items'
        and (column_name like '%advance%' or column_name like '%claim%')`)).rows[0].c;
  assert.equal(cols, "", `walls: clara.open_items gained a claim/advance column (${cols})`);

  // (b) no employee/staff counterparty kind.
  const kind = (await rootQuery(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid='clara.counterparties'::regclass and conname='counterparties_kind_check'`)).rows[0].d;
  assert.equal(kind.includes("employee"), false, "walls: counterparties_kind_check admits an employee kind");
  assert.equal(kind.includes("staff"), false, "walls: counterparties_kind_check admits a staff kind");

  // (c) the subledger hook's caller census is STILL exactly four — #638 is not a fifth caller.
  const callers = (await rootQuery(
    `select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C"), '') s
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prosrc ~ 'clara\\._subledger_on_approve *\\('
        and p.oid <> 'clara._subledger_on_approve(uuid)'::regprocedure`)).rows[0].s;
  assert.equal(callers,
    "clara._approve_entry_core(jsonb,uuid,uuid,text,text), "
    + "clara._approve_opening_entry(uuid,uuid,uuid,text,integer), "
    + "clara.approve_wrong_client_correction(uuid,text,text,text), "
    + "clara.reverse_entry(uuid,text,text)",
    "walls: the subledger hook's caller census moved — #638 must never become the fifth");

  // (d) a payable-CLASS leg on the Work lane still refuses `generic_control_leg`.
  const client = await secClient("controlleg");
  const c = claim({ payableAccountCode: SECHART.control });
  await refusesSec(client, "CLR10", SEC_REASON.payableIsControl,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "walls.controlLeg");
});

// ===========================================================================================
// 11 · p638.correction — the unwind.
// ===========================================================================================

test("p638.correction reversal + a linked correction claim: two rows linked both ways, the advance correction hook-born", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("correction");
  const seeded = await seedAdvance(ALICE(), BOB(), { client, cents: 200000, issueDate: "2026-02-01" });
  const first = await armed({
    client,
    claim: claim({
      settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
      advanceId: seeded.advance.id, payableAccountCode: null,
    }),
  });
  const posted = await post(first);
  assert.equal(posted.posted, true);
  assert.equal((await applicationsForEntry(posted.entry_id)).length, 1);

  // REVERSE the posted entry through the estate's own door. The reversal is one of the FOUR
  // pinned callers of the subledger hook, so the `kind='correction'` advance row is HOOK-BORN
  // (0043:944-947, "no public correction verb").
  await reverseEntry(ALICE(), { entry: posted.entry_id, reason: "#638: the claim was wrong" });
  const corrections = (await rootQuery(
    "select * from clara.staff_advance_applications where advance_id=$1 and kind='correction'",
    [seeded.advance.id])).rows;
  assert.equal(corrections.length, 1, "correction: the reversal hook minted the correction row");

  const ledgerAfterReversal = await claimStatus(first.claim_id);
  assert.ok(ledgerAfterReversal.some((s) => s.state === "reversed"),
    "correction: the claim's own ledger records that its entry was reversed");

  // …then admit the CORRECTED claim, naming its predecessor.
  const second = await armed({
    client,
    claim: claim({
      settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
      advanceId: seeded.advance.id, payableAccountCode: null,
      correctsClaimId: first.claim_id,
      items: [{ description: "KL–Penang return flight (corrected)", expense_account_code: SECHART.travel, amount_cents: 40000 }],
    }),
  });
  const out2 = await post(second);
  assert.equal(out2.posted, true);

  assert.equal((await claimRow(second.claim_id)).corrects_claim_id, first.claim_id);
  assert.equal((await claimRow(first.claim_id)).corrected_by_claim_id, second.claim_id,
    "correction: the chain is readable in BOTH directions");

  const receipts = (await rootQuery(
    "select count(*)::int n from clara.operation_receipts where client_id=$1 and outcome='committed'",
    [client])).rows[0].n;
  assert.equal(receipts, 2, "correction: two committed receipts under two logical identities");
});

// ===========================================================================================
// 12 · p638.origin — the Work label without a purpose value.
// ===========================================================================================

test("p638.origin get_work_claim_origin answers for a claim Work and NULL for a plain journal Work", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("origin");
  const a = await armed({ client, claim: claim() });
  const origin = await getWorkClaimOrigin(CAROL(), a.work_id);   // a VIEWER
  assert.ok(origin, "origin: a viewer of the firm can label a claim Work");
  assert.equal(origin.claim_id, a.claim_id);
  assert.equal(origin.settlement, SETTLEMENT.reimbursement);
  assert.equal(origin.claimant_label, "Farah binti Idris");
  assert.equal(String(origin.amount_cents), "60500");
  assert.equal(origin.incurred_date, SEC_DATE.incurred);

  const plain = await admitJournalWork({ client, author: ALICE(), basis: basis() });
  assert.equal(await getWorkClaimOrigin(CAROL(), plain.work_id), null,
    "origin: a plain journal Work has NO claim origin, and says so honestly");

  // FIRM-SCOPED: a member of another firm gets nothing rather than an existence oracle.
  assert.equal(await getWorkClaimOrigin(world.users.dave, a.work_id), null,
    "origin: another firm's member sees nothing");
});

// ===========================================================================================
// 13 · p638.reads / p638.rls — the read doors and the role posture.
// ===========================================================================================

test("p638.reads list_staff_expense_claims and get_staff_expense_claim answer at the VIEWER floor", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("reads");
  const a = await armed({ client, claim: claim() });
  await post(a);

  const rows = await listStaffExpenseClaims(CAROL(), { client });
  assert.equal(rows.length, 1, "reads: the viewer sees the claim");
  assert.equal(rows[0].id, a.claim_id);
  assert.equal(String(rows[0].amount_cents), "60500");
  assert.equal(rows[0].claimant_label, "Farah binti Idris");
  assert.equal(rows[0].entry_status, "approved");
  assert.ok(rows[0].receipt_id, "reads: the posted receipt is derivable by join");

  const one = await getStaffExpenseClaim(CAROL(), a.claim_id);
  assert.equal(one.id, a.claim_id);
  assert.equal(one.items.length, 2);
  assert.ok(Array.isArray(one.status), "reads: the detail carries its own status ledger");
  assert.ok(one.status.some((s) => s.state === "posted"));

  // WINDOWED by the DATABASE, not sliced in the browser.
  assert.equal((await listStaffExpenseClaims(CAROL(), { client, from: "2026-05-01" })).length, 0,
    "reads: a row outside the window is never sent");

  // ANOTHER FIRM'S MEMBER: not found, never an oracle.
  await assertRaises("CLR11", () => listStaffExpenseClaims(world.users.dave, { client }), "reads.foreign");
});

test("p638.rls the new relations are FORCE-RLS, firm-scoped to read and hold ZERO app-role DML", async (t) => {
  if (await gateSec(t)) return;
  for (const rel of ["staff_expense_claims", "staff_expense_claim_status"]) {
    const r = (await rootQuery(
      `select c.relrowsecurity rls, c.relforcerowsecurity force from pg_class c
         join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1`,
      [rel])).rows[0];
    assert.equal(r.rls, true, `rls: clara.${rel} has RLS off`);
    assert.equal(r.force, true, `rls: clara.${rel} is not RLS-FORCED`);
    const dml = (await rootQuery(
      `select count(*)::int n from (select unnest(array['clara_authenticated','clara_runtime',
         'clara_agent_ro','clara_wake_interactive','clara_wake_proactive']) r) g
        where has_table_privilege(g.r, 'clara.' || $1, 'INSERT')
           or has_table_privilege(g.r, 'clara.' || $1, 'UPDATE')
           or has_table_privilege(g.r, 'clara.' || $1, 'DELETE')`, [rel])).rows[0].n;
    assert.equal(dml, 0, `rls: ${dml} application role(s) hold DML on clara.${rel}`);
    assert.equal(
      (await rootQuery("select has_table_privilege('clara_authenticated','clara.'||$1,'SELECT') p", [rel])).rows[0].p,
      true, `rls: clara_authenticated cannot read clara.${rel}`);
    assert.equal(
      (await rootQuery("select has_table_privilege('clara_runtime','clara.'||$1,'SELECT') p", [rel])).rows[0].p,
      false, `rls: clara_runtime holds a read on clara.${rel} — the run is told its effect by the wake verb`);
  }

  // A cross-firm human cannot select a row directly through RLS either.
  const client = await secClient("rls");
  const a = await armed({ client, claim: claim() });
  const seen = await humanQuery(world.users.dave,
    "select count(*)::int n from clara.staff_expense_claims where id=$1", [a.claim_id]);
  assert.equal(seen.rows[0].n, 0, "rls: another firm's member reads zero rows");
});

// ===========================================================================================
// 14 · p638.replay — one intent key, one Work, one claim, one receipt.
// ===========================================================================================

test("p638.replay a repeated admission converges on ONE Work and ONE claim; a changed claim is a typed conflict", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("replay");
  const key = `sec-replay-${Date.now().toString(36)}`;
  const c = claim();
  const first = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c, intentKey: key });
  const again = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c, intentKey: key });
  assert.equal(again.replayed, true, "replay: the second call REPLAYS");
  assert.equal(again.work_id, first.work_id);
  assert.equal(again.claim_id, first.claim_id, "replay: …and names the SAME claim");
  assert.equal(await claimCount(client), 1, "replay: exactly one claim row");

  await assertPair("CLR10", SEC_REASON.intentConflict,
    () => admitStaffExpenseClaimWork({
      client, author: ALICE(), intentKey: key, claim: claim({ instruction: "different figures entirely", items: [{ description: "x", expense_account_code: SECHART.travel, amount_cents: 999 }] }),
    }), "replay.conflict");
  assert.equal(await claimCount(client), 1, "replay: a conflict mints no second claim");
});
