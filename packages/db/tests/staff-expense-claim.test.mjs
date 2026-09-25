// #638 — STAFF EXPENSE CLAIMS, EMPLOYEE PAYABLES AND ADVANCE SETTLEMENT.
// Migration: 0221_staff_expense_claims.sql.
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
// and both purpose CHECKs carry their exact expected text. If a later hand widens a purpose
// or edits the posting core to make a claim "cleaner", that cell goes red.
//
// #984 RE-DERIVED THAT EXPECTED TEXT ONCE, DELIBERATELY. Migration 0239 widened both purpose
// CHECKs to a FOURTH value, `opening_balance`, on the owner's ruling of 2026-09-20 (issue #984):
// an approved opening batch now carries a real Work and operation receipt. The cell was NOT
// deleted and NOT skipped — the literal below is the four-value text, the three prior values are
// asserted individually so a widening that dropped one still goes red, and the POSTING CORE's
// half is untouched, because that is exactly what #984 promised not to move: an opening Work's
// entries are approved by `clara._approve_opening_entry` before the Work exists, so it never
// reaches `clara._record_journal_entry_core` at all. The claim lane is unaffected either way: a
// claim is still a `journal_entry` Work and still posts through that core.
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
  WCHART, BUNDLE_DIGEST, assertPair, assertRaises,
  rootQuery, humanQuery, opk, workRow, receiptsForWork, entriesForClient, linesOf,
  entryCount, committedReceiptCount, AGENT_USER_ID, admitJournalWork, basis,
  reverseEntry, seedFiscalYear, detailOf,
  // #634's document/evidence doors — AC4's unwind has a document half
  evidenceDocument, docRef, linksForEntry,
  // #638
  gateSec, SEC_REASON, SECHART, SETTLEMENT, SEC_DATE, ensureSecChart, enrolAdvanceFor,
  liveEnrolment, claim, basisForClaim, admitStaffExpenseClaimWork, listStaffExpenseClaims,
  getStaffExpenseClaim, getWorkClaimOrigin, claimRow, claimCount, claimStatus,
  applicationsForEntry, advanceOutstanding, seedAdvance, linesWithIds,
  withClientRungHeld, awaitRungWaiters,
} from "./staff-expense-claim-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// #1069 [0341] — `clara.get_work_claim_origin` PROJECTS `allocation_count`.
//
// This section's OWN frontier, layered on top of `gateSec` above — 0221's own stem is true from
// that migration onward, long before 0341 exists, so these cells need their OWN stem check
// (`staff-expense-claim-allocations.test.mjs`'s #1067/#1052 two-frontier idiom).
// ===========================================================================================

export const WORK_CLAIM_ALLOC_COUNT_STEM = "work_claim_allocation_count$";

let _allocCount = null;
async function allocCountLaneReady() {
  if (_allocCount === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [WORK_CLAIM_ALLOC_COUNT_STEM]);
      _allocCount = r.rows[0].n > 0;
    } catch {
      _allocCount = false;
    }
  }
  return _allocCount;
}

async function gateAllocCount(t) {
  if (await allocCountLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT === "1") {
    markSkip();
    t.skip(`#1069 allocation_count projection absent (no ${WORK_CLAIM_ALLOC_COUNT_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#1069: the allocation_count projection is absent. Apply "
    + "0341_work_claim_allocation_count.sql (or its numbered suite copy), or set "
    + "CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT=1 for the package-wide pre-integration sweep.",
  );
  return true;
}

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
// 1b · p638.claim.settled — the THIRD settlement, posted through the same unchanged core.
//
// AC2 asks that the three settlements be DISTINGUISHED, and `already_settled` is the one the
// itemisation alone cannot tell you about: the employee has already been paid, so there is no
// payable and no advance — the expense debits land against the account the money actually left.
// It is NOT "no journal" (§B's own rule, and the migration header's fifth risk), which is exactly
// why it needs a cell that posts through the real door rather than a derivation unit test.
// ===========================================================================================

test("p638.claim.settled an already-settled claim posts the expense debits against the STATED payment account, with no payable and no advance", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("settled");
  const c = claim({ settlement: SETTLEMENT.settled });   // payment_account_code => 1150 bank
  const a = await armed({ client, claim: c });

  // --- the CLAIM ROW: the settlement is TYPED, and the other two arms' columns are NULL --------
  const row = await claimRow(a.claim_id);
  assert.equal(row.settlement, SETTLEMENT.settled);
  assert.equal(row.payment_account_code, SECHART.bank,
    "claim.settled: the claim names the account the money left");
  assert.equal(row.payable_account_code, null,
    "claim.settled: nothing is owed to the claimant, so no employee payable is recorded");
  assert.equal(row.advance_account_code, null);
  assert.equal(row.advance_id, null,
    "claim.settled: an already-settled claim discharges no advance");
  assert.equal(String(row.amount_cents), "60500");

  // --- the POSTING ---------------------------------------------------------------------------
  const out = await post(a);
  assert.equal(out.posted, true, "claim.settled: posted");
  assert.equal(await entryCount(client), 1, "claim.settled: exactly ONE entry");
  const lines = await linesOf(out.entry_id);
  assert.equal(lines.length, 3,
    "claim.settled: `already_settled` is NOT `no journal` — two expense debits and one payment credit");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.travel).debit_cents), "48000");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.meals).debit_cents), "12500");
  assert.equal(String(lines.find((l) => l.account_code === SECHART.bank).credit_cents), "60500",
    "claim.settled: the credit is the ASSET the payment came out of, never a liability");
  assert.equal(lines.filter((l) => l.account_code === SECHART.payable).length, 0,
    "claim.settled: no employee payable leg is invented for money already paid");

  // --- ONE receipt, ONE claim row, the ledger at admitted+posted -----------------------------
  assert.equal(await committedReceiptCount(client), 1, "claim.settled: ONE committed receipt");
  assert.equal(await claimCount(client), 1, "claim.settled: ONE claim row");
  assert.deepEqual((await claimStatus(a.claim_id)).map((s) => s.state).sort(), ["admitted", "posted"]);
  assert.equal((await applicationsForEntry(out.entry_id)).length, 0,
    "claim.settled: NO staff-advance allocation is minted — §E's birth trigger reads the settlement");

  // …and the register discloses it under its own word, at the viewer floor.
  const seen = await listStaffExpenseClaims(CAROL(), { client });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].settlement, SETTLEMENT.settled,
    "claim.settled: C6 can tell this claim apart from a reimbursement and from an advance application");
});

// ===========================================================================================
// 2 · p638.core.no_regression — #638 recuts nothing shared.
// ===========================================================================================

test("p638.core.no_regression both purpose CHECKs and the six pinned bodies are byte-identical after 0221, and the CHECKs are 0239's four with the three prior values unmoved", async (t) => {
  if (await gateSec(t)) return;
  // #984 · RE-DERIVED ONCE, ON THE OWNER'S RULING. This literal was the 0194 three-value text
  // until migration 0239; it is now the four-value text, and the loop under it re-asserts each of
  // the three PRIOR values by name so a widening that also dropped one cannot hide behind a
  // single string comparison. `opening_balance` is the opening lane's Work purpose (#984); the
  // claim lane is still a `journal_entry` Work and is unaffected.
  const PRIOR_VALUES = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation"];
  const EXPECT = "CHECK ((purpose = ANY (ARRAY['journal_entry'::text, "
    + "'periodic_stock_adjustment'::text, 'payroll_obligation'::text, 'opening_balance'::text])))";
  for (const [table, name] of [
    ["clara.accounting_work", "accounting_work_purpose_check"],
    ["clara.operation_receipts", "operation_receipts_purpose_check"],
  ]) {
    const r = await rootQuery(
      "select pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass and conname=$2",
      [table, name]);
    assert.equal(r.rows[0].d, EXPECT,
      `core.no_regression: ${name} is NOT the 0239 four-valued CHECK — somebody widened or narrowed a purpose`);
    for (const v of PRIOR_VALUES) {
      assert.ok(r.rows[0].d.includes(`'${v}'::text`),
        `core.no_regression: ${name} no longer admits ${v} — 0239 was a widening, and the three prior values are untouched`);
    }
  }
  // The six bodies #638 edits none of. The migration's own §H pins them by sha; this cell proves
  // they are still REACHABLE and unchanged from the outside, so a later recut in another branch
  // that merged after 0221 shows up here rather than nowhere.
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
  // #984 · THE OTHER HALF OF THE SAME PROMISE. The CHECKs grew a fourth value; the posting core's
  // lookup did NOT, and an opening Work must never reach it (its entries are already approved by
  // clara._approve_opening_entry before the Work row is written). A `work_not_found` for the
  // opening purpose is therefore the CORRECT answer here, and this is the assertion that keeps it.
  assert.equal(src.includes("opening_balance"), false,
    "core.no_regression: the posting core names the opening purpose — #984 widened the vocabulary, not the posting lane");
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

  const lines = await linesWithIds(out.entry_id);
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

  // ALREADY-SETTLED PAYS FROM AN ASSET, and from an asset that is not a control account. Money
  // already paid left something the client HAS; a liability or a receivable/payable control is
  // not that, and the claim would balance while saying something untrue. Both arms fold to
  // `invalid_claim` with the SAME `constraint` token the form maps onto `paymentAccountCode`.
  for (const [label, code] of [["liability", SECHART.payable], ["control", SECHART.control]]) {
    const out = await refusesSec(client, "CLR10", SEC_REASON.invalidClaim,
      () => admitStaffExpenseClaimWork({
        client, author: ALICE(),
        claim: claim({ settlement: SETTLEMENT.settled, paymentAccountCode: code }),
      }), `refusals.settledPaymentIs${label}`);
    assert.equal(out.detail.constraint, "asset",
      `refusals.settledPaymentIs${label}: the refusal names the class it needed`);
    assert.equal(out.detail.field, "claim.payment_account_code",
      `refusals.settledPaymentIs${label}: …on the control the preparer chose`);
  }

  // CLR04 — a VIEWER may not admit a claim.
  await refusesSec(client, "CLR04", "insufficient_role",
    () => admitStaffExpenseClaimWork({ client, author: CAROL(), claim: claim() }),
    "refusals.viewer");
});

test("p638.refusals a claim dated into a CLOSED fiscal year is refused CLR19 at ADMISSION, so no register row is stranded", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("closedfy");
  await seedFiscalYear(client, {
    startsOn: "2025-01-01", endsOn: "2025-12-31", status: "closed", openedBy: ALICE(),
  });

  // WHY ADMISSION AND NOT ONLY COMMIT. A claim's admission writes a DURABLE, APPEND-ONLY register
  // row; a journal Work's does not. Refused only at posting, the sealed year would leave a claim
  // `clara.list_staff_expense_claims` can never tell apart from one still queued — entry_id null,
  // ledger ['admitted'], for ever, and the register's own history badge would say "admitted" on a
  // claim that can never post. So §B's world half asks the fiscal year, exactly as
  // `clara._assert_adjustment_relationships` does for a periodic adjustment (0194:975-983).
  // `refusesSec` re-reads all four halves: no entry, no receipt, NO CLAIM ROW, no enrolment.
  const out = await refusesSec(client, "CLR19", SEC_REASON.closedPeriod,
    () => admitStaffExpenseClaimWork({
      client, author: ALICE(),
      claim: claim({ incurredDate: "2025-06-01", postingDate: "2025-06-30" }),
    }), "refusals.closedPeriod");
  assert.equal(out.detail.field, "claim.posting_date",
    "refusals.closedPeriod: the refusal lands on the date the preparer can change");
  assert.equal(out.detail.fy_status, "closed");

  // THE COMMIT WALL IS STILL THE LAW, and this arm is not a substitute for it: a year that seals
  // BETWEEN admission and posting is refused by `clara._tf_period_wall` (0056:643) on the approved
  // INSERT, and that trigger — not this validator — is the one that sees close permits.
  const wall = await rootQuery(
    `select count(*)::int n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'clara.journal_entries'::regclass and not t.tgisinternal
        and p.proname = '_tf_period_wall'`);
  assert.equal(wall.rows[0].n, 1,
    "refusals.closedPeriod: t_period_wall still stands on clara.journal_entries — the admission arm front-runs it, never replaces it");

  // …and a claim dated in an OPEN stretch of the same client posts, so the arm refuses the sealed
  // year and nothing else.
  const open = await armed({ client, claim: claim() });          // 2026-03-31, no fiscal year row
  assert.equal((await post(open)).posted, true,
    "refusals.closedPeriod: a claim outside the sealed year is untouched by the new arm");
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
    "select prosrc from pg_proc where oid='clara.is_high_stakes(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("tax_affecting") || src.includes("is_year_end"),
    "no_second_approval: is_high_stakes still fires on a NON-amount axis (0004:72-78) — recorded as a ticket finding, never a blueprint edit");
  // …and the posting core does not consult it at all, which is what makes PRD:114 true on this lane.
  const core = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure"
  )).rows[0].prosrc;
  assert.equal(core.includes("is_high_stakes"), false,
    "no_second_approval: the Work lane's posting core never asks is_high_stakes");
});

// ===========================================================================================
// 10 · p638.walls — the four live tail assertions this ticket must not move.
// ===========================================================================================

test("p638.walls 0042 tail 20(a)/(b) are live, a payable-class leg still refuses, and the hook census is unmoved", async (t) => {
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
  // MEASURED, NOT TRANSCRIBED. 0037:3840-3845 pinned this roster at FOUR; the live chain carries
  // SIX, because clara.finalize_close (0056) and clara.reopen_fiscal_year (0085) both perform the
  // hook and both landed after 0037's tail ran. The claim that matters here is that #638 adds
  // NONE of them: section E inserts into clara.staff_advance_applications directly and never names
  // the hook. (Recorded as a finding in the ticket's report — the stale pin is not #638's to move.)
  assert.equal(callers,
    "clara._approve_entry_core(jsonb,uuid,uuid,text,text), "
    + "clara._approve_opening_entry(uuid,uuid,uuid,text,integer), "
    + "clara.approve_wrong_client_correction(uuid,text,text,text), "
    + "clara.finalize_close(uuid,text,text), "
    + "clara.reopen_fiscal_year(uuid,text,jsonb,text,text), "
    + "clara.reverse_entry(uuid,text,text)",
    "walls: the subledger hook's caller census moved — #638 must never add one");

  // (d) A CONTROL-CLASS LEG IS REFUSED TWICE, and the two refusals are different facts.
  //   * The CLAIM door refuses it at admission by its own name, so the preparer learns which
  //     control it is that cannot carry money owed to a person.
  //   * The POSTING CORE still refuses any payable/receivable-class leg with `generic_control_leg`
  //     (0195:2021-2028) — unchanged by 0221, and proved here through the plain journal lane so
  //     the claim door's earlier refusal can never be mistaken for the wall itself.
  const client = await secClient("controlleg");
  const c = claim({ payableAccountCode: SECHART.control });
  await refusesSec(client, "CLR10", SEC_REASON.payableIsControl,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "walls.controlLeg");

  const b = basis({
    postingDate: "2026-05-31", memo: "#638: a control-class leg on the plain journal lane",
    lines: [
      { account_code: SECHART.travel, debit_cents: 1000, credit_cents: 0, description: "expense" },
      { account_code: SECHART.control, debit_cents: 0, credit_cents: 1000, description: "control" },
    ],
  });
  const w = await admitJournalWork({ client, author: ALICE(), basis: b });
  await claimWorkRun({ task: w.task_id, runId: opk("sec-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await assertPair("CLR10", SEC_REASON.genericControlLeg,
    () => wakeRecordJournalEntry(cred.secret, {
      client, work: w.work_id, logicalOpId: w.logical_op_id, basis: b,
    }), "walls.genericControlLeg");
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

test("p638.correction.race two concurrent corrections of ONE claim: the loser is a TYPED refusal, never a raw 23505", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("correctrace");
  const first = await armed({ client, claim: claim() });
  const posted = await post(first);
  assert.equal(posted.posted, true);
  await reverseEntry(ALICE(), { entry: posted.entry_id, reason: "#638: posted in error" });

  // BOTH callers pass the world half — including its (iv) correction-target arm — against a world
  // in which the target is NOT yet corrected, then queue on the door's client rung. Exactly one
  // may land: `uq_staff_expense_claims_corrects` is partial-unique on `corrects_claim_id`. The
  // question this cell asks is not WHETHER one loses but WHAT THE LOSER IS TOLD: a raw 23505 is
  // an error `workErrorResponse` does not classify (it claims 40P01/40001 and the CLR codes), so
  // the route answers 500 {error:"internal"} and the browser says "unavailable" — where the
  // successor contract promises `correction_target_already_corrected`.
  const mk = (n) => claim({
    correctsClaimId: first.claim_id,
    instruction: `corrected claim, attempt ${n}`,
    items: [{ description: `KL–Penang return flight (corrected ${n})`,
      expense_account_code: SECHART.travel, amount_cents: 40000 }],
  });
  const settled = await withClientRungHeld(client, async (release) => {
    const race = Promise.allSettled([
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: mk(1) }),
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: mk(2) }),
    ]);
    await awaitRungWaiters(2);
    await release();
    return race;
  });

  const won = settled.filter((r) => r.status === "fulfilled");
  const lost = settled.filter((r) => r.status === "rejected");
  assert.equal(won.length, 1,
    `correction.race: exactly ONE correction lands (got ${won.length}); `
    + `outcomes ${JSON.stringify(settled.map((r) => r.status === "fulfilled" ? "ok" : (r.reason?.code ?? "err")))}`);
  const err = lost[0].reason;
  assert.equal(err.code, "CLR10",
    `correction.race: the loser is a TYPED refusal, not a raw ${err.code} — "${err.message}"`);
  assert.equal(detailOf(err)?.reason, SEC_REASON.correctionAlreadyCorrected,
    `correction.race: …and it names WHAT happened, got ${JSON.stringify(detailOf(err))}`);
  assert.equal(detailOf(err)?.field, "claim.corrects_claim_id");

  // THE DATA WAS NEVER IN DANGER — that is the point. The defect was the WORD, so assert both.
  assert.equal(await claimCount(client), 2, "correction.race: one original and one correction");
  assert.equal((await claimRow(first.claim_id)).corrected_by_claim_id, won[0].value.claim_id,
    "correction.race: the chain names the winner, once");
});

test("p638.correction.evidence the reversal RELEASES the claim's document, so the correcting claim may cite the same receipt", async (t) => {
  if (await gateSec(t)) return;
  const client = await secClient("correctdoc");
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client, kind: "receipt" });

  const first = await armed({
    client, sourceRefs: [docRef(doc.documentId)], claim: claim({ sourceKind: "document" }),
  });
  assert.equal((await claimRow(first.claim_id)).source_document_id, doc.documentId,
    "correction.evidence: the claim register names the document it stands on");
  const posted = await post(first);
  assert.equal(posted.posted, true);

  // THE LINK IS BORN INSIDE THE POSTING TRANSACTION and is LIVE while the entry stands.
  const born = await linksForEntry(posted.entry_id);
  assert.equal(born.length, 1, "correction.evidence: ONE evidence link");
  assert.equal(born[0].document_id, doc.documentId);
  assert.equal(born[0].attached_via, "work_commit");
  assert.equal(born[0].released_at, null, "correction.evidence: LIVE while the entry stands");

  // …so a SECOND claim citing the same receipt is refused CLR13 while that entry is in the books.
  await refusesSec(client, "CLR13", SEC_REASON.sourceAlreadyPosted,
    () => admitStaffExpenseClaimWork({
      client, author: ALICE(), sourceRefs: [docRef(doc.documentId)],
      claim: claim({ sourceKind: "document", instruction: "the same receipt, claimed twice" }),
    }), "correction.evidence.live");

  // THE UNWIND'S DOCUMENT HALF (brief §4 seam 11). `t_entry_evidence_release` (0182:417) stamps
  // `released_at` on the reversal — without it the correcting claim would meet CLR13 for ever and
  // AC4's unwind would be unprovable for a documented claim.
  await reverseEntry(ALICE(), { entry: posted.entry_id, reason: "#638: the receipt was misread" });
  const released = await linksForEntry(posted.entry_id);
  assert.equal(released.length, 1, "correction.evidence: the link is released, never deleted");
  assert.ok(released[0].released_at,
    "correction.evidence: t_entry_evidence_release freed the document on reversal");
  assert.equal(released[0].document_id, doc.documentId,
    "correction.evidence: …and it still says WHICH document backed the reversed entry");

  const second = await armed({
    client, sourceRefs: [docRef(doc.documentId)],
    claim: claim({
      sourceKind: "document", correctsClaimId: first.claim_id,
      items: [{ description: "Client dinner (corrected)", expense_account_code: SECHART.meals,
        amount_cents: 9900 }],
    }),
  });
  const out2 = await post(second);
  assert.equal(out2.posted, true,
    "correction.evidence: the correcting claim cites the SAME receipt and posts");
  const relinked = await linksForEntry(out2.entry_id);
  assert.equal(relinked.length, 1);
  assert.equal(relinked[0].document_id, doc.documentId);
  assert.equal(relinked[0].released_at, null,
    "correction.evidence: the correction now holds the document, and only the correction");
  assert.equal((await claimRow(first.claim_id)).corrected_by_claim_id, second.claim_id);
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
// 12a · p1069.origin — `allocation_count`, the Work card's own count of how many advances a
// claim discharges. #1069's Agent Brief: 1 for a single-advance claim (matching row count for a
// multi-advance one), and — implied by "the advance-application arm" — 0 for a claim that
// discharges no advance at all.
// ===========================================================================================

test("p1069.origin allocation_count is 0 for a reimbursement and 1 for a single-advance claim", async (t) => {
  if (await gateSec(t) || await gateAllocCount(t)) return;
  const client = await secClient("allocCountSingle");

  // A reimbursement discharges no advance at all: the honest count of an arm that is not there.
  const reimbursed = await armed({ client, claim: claim({ settlement: SETTLEMENT.reimbursement }) });
  const originReimbursed = await getWorkClaimOrigin(CAROL(), reimbursed.work_id);
  assert.equal(originReimbursed.settlement, SETTLEMENT.reimbursement);
  assert.equal(originReimbursed.allocation_count, 0,
    "allocCount: a reimbursement claim carries no advance-application arm at all");

  // A single-advance application — the legacy shape, `advance_id` and no `advance_allocations`
  // key — still stores exactly ONE confirmed allocation row (0301's own single-advance branch),
  // so the count is 1, never a fabricated default.
  const adv = (await seedAdvance(ALICE(), BOB(), { client, cents: 80000, issueDate: "2026-01-10" })).advance;
  const single = await armed({ client, claim: claim({
    settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
    advanceId: adv.id, payableAccountCode: null,
  }) });
  const originSingle = await getWorkClaimOrigin(CAROL(), single.work_id);
  assert.equal(originSingle.settlement, SETTLEMENT.advance);
  assert.equal(originSingle.allocation_count, 1,
    "allocCount: a single-advance claim's arm carries exactly one allocation");
});

test("p1069.origin allocation_count matches the register's own row count for a multi-advance claim", async (t) => {
  if (await gateSec(t) || await gateAllocCount(t)) return;
  const client = await secClient("allocCountMulti");
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;

  const c = claim({ settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance, payableAccountCode: null });
  c.advance_allocations = [
    { advance_id: advA.id, amount_cents: 40000, account_code: SECHART.advance },
    { advance_id: advB.id, amount_cents: 20500, account_code: SECHART.advance },
  ];
  const a = await armed({ client, claim: c });

  const origin = await getWorkClaimOrigin(CAROL(), a.work_id);
  assert.equal(origin.allocation_count, 2,
    "allocCount: a two-advance claim's arm carries exactly the two allocations it confirmed");

  // AND IT MATCHES THE REGISTER'S OWN ROW COUNT, read independently — the count is never a
  // re-derivation of the claim's stored basis, only the register's own rows.
  const stored = await getStaffExpenseClaim(ALICE(), a.claim_id);
  assert.equal(origin.allocation_count, stored.advance_allocations.length,
    "allocCount: the projected count matches clara.staff_expense_claim_allocations' own row count");
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
