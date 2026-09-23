// #931 — ONE STAFF EXPENSE CLAIM DISCHARGES SEVERAL OPEN ADVANCES THROUGH AN EXPLICIT
// ALLOCATION LIST. Migration: 0301_staff_expense_claim_allocations.sql.
//
// Frontier-gated on the `staff_expense_claim_allocations$` stem, so `db-slice-frontiers` legs
// pinned below this migration skip cleanly (the #638 battery's own `gateSec` idiom, keyed on a
// SECOND stem because #931 is a separate frontier from #638's).
//
// WHAT THIS FILE IS ABOUT. #881's owner ruling of 2026-09-18: a staff expense claim may discharge
// SEVERAL open advances through an EXPLICIT allocation list, so WD-R10's "no silent FIFO" still
// stands — the stored record is always the confirmed list. The rules mirror the staff-advance
// register's own allocation door: the allocations add up to the claim total to the cent, every
// advance named belongs to this claimant on an enrolled account, each allocation passes the
// temporal over-application cap ON ITS OWN, and a claim that outruns an advance is refused naming
// THAT advance, its outstanding on the day and the shortfall.
//
// EVERY EXPECTED FIGURE BELOW IS A WORKED EXAMPLE stated in the cell, never a re-computation of
// what the code computes. The basis handed to the wake verb is derived by this file's OWN
// `allocatedBasis`, written from the ruling's sentence ("one credit leg per advance account"), so
// a drift between that sentence and `clara._claim_journal_basis` shows up as the wake verb's own
// basis-digest refusal rather than as a green cell.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  assertPair, rootQuery, opk,
  entryCount, committedReceiptCount,
  SEC_REASON, SECHART, SETTLEMENT, SEC_DATE, ensureSecChart, enrolAdvanceFor, liveEnrolment,
  claim, admitStaffExpenseClaimWork, getStaffExpenseClaim,
  listStaffExpenseClaims, claimRow, claimCount, applicationsForEntry, advanceOutstanding,
  seedAdvance, linesWithIds,
} from "./staff-expense-claim-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// 0 · The #931 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

export const SEC_ALLOC_STEM = "staff_expense_claim_allocations$";

let _ready = null;
async function allocLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SEC_ALLOC_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

async function gateAlloc(t) {
  if (await allocLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_SEC_ALLOCATIONS === "1") {
    markSkip();
    t.skip(`#931 multi-advance allocation lane absent (no ${SEC_ALLOC_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#931: the multi-advance allocation lane is absent. Apply "
    + "0301_staff_expense_claim_allocations.sql (or its numbered suite copy), or set "
    + "CLARA_ALLOW_MISSING_SEC_ALLOCATIONS=1 for the package-wide pre-integration sweep.",
  );
  return true;
}

let world = null;
before(async () => { world = await buildWorkWorld(); });
after(async () => {
  printLaneNotes("staff-expense-claim-allocations");
  printSkipCount("staff-expense-claim-allocations");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

async function allocClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureSecChart(ALICE(), client, tag);
  return client;
}

/**
 * A claim settled by advance application, naming its allocations EXPLICITLY.
 *
 * The head of the list is what the claim row's own `advance_id` / `advance_account_code` columns
 * carry, so the single-advance shape those columns were built for stays structurally true.
 */
function allocClaim({ allocations, ...rest }) {
  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: allocations[0].account_code ?? SECHART.advance,
    advanceId: allocations[0].advance_id,
    payableAccountCode: null,
    ...rest,
  });
  c.advance_allocations = allocations.map((a) => ({
    advance_id: a.advance_id,
    amount_cents: a.amount_cents,
    ...(a.account_code === undefined ? {} : { account_code: a.account_code }),
  }));
  return c;
}

/**
 * THE JOURNAL A CLAIM WITH AN ALLOCATION LIST IMPLIES, written from the ruling's own sentence:
 * every non-pending item is one expense debit, and the settlement is ONE CREDIT LEG PER ADVANCE
 * ACCOUNT, carrying the allocations booked against that account added together. Account order is
 * the account code's own, so the derivation is deterministic.
 */
function allocatedBasis(c) {
  const lines = c.items
    .filter((i) => !i.pending_fact)
    .map((i) => ({
      account_code: String(i.expense_account_code).trim(),
      debit_cents: i.amount_cents,
      credit_cents: 0,
      description: String(i.description).trim().slice(0, 2000),
    }));
  const byAccount = new Map();
  for (const a of c.advance_allocations) {
    const code = String(a.account_code ?? c.advance_account_code).trim();
    byAccount.set(code, (byAccount.get(code) ?? 0) + a.amount_cents);
  }
  for (const code of [...byAccount.keys()].sort()) {
    lines.push({
      account_code: code,
      debit_cents: 0,
      credit_cents: byAccount.get(code),
      description: c.settlement,
    });
  }
  return {
    posting_date: c.posting_date,
    memo: String(c.instruction).trim().slice(0, 4000),
    currency: "MYR",
    lines,
  };
}

async function armed({ client, claim: c, intentKey = null }) {
  const work = await admitStaffExpenseClaimWork({
    client, author: ALICE(), claim: c, sourceRefs: [], intentKey,
  });
  await claimWorkRun({ task: work.task_id, runId: opk("alloc-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  return { ...work, cred, client, claim: c, basis: allocatedBasis(c) };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

/** A refusal leaves NOTHING behind — the #638 battery's own probe. */
async function refusesAlloc(client, code, reason, fn, label) {
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);
  const claims = await claimCount(client);
  const out = await assertPair(code, reason, fn, label);
  assert.equal(await entryCount(client), entries, `${label}: no journal row was written`);
  assert.equal(await committedReceiptCount(client), receipts, `${label}: no committed receipt`);
  assert.equal(await claimCount(client), claims, `${label}: no staff_expense_claims row`);
  return out;
}

// ===========================================================================================
// 1 · p931.two — TWO advances discharged by ONE claim.
// ===========================================================================================

test("p931.two one claim discharges TWO advances on one enrolled account: two allocations, one credit leg, each advance moved by its own amount", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("alloc2");
  // THE WORKED EXAMPLE. Two advances to Farah on the ONE account dedicated to her:
  //   A = 40,000 sen issued 2026-01-10, B = 30,000 sen issued 2026-02-01.
  // Her March claim is 48,000 + 12,500 = 60,500 sen, settled against BOTH:
  //   A takes 40,000 (all of it), B takes 20,500 (leaving 9,500).
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;

  const c = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advB.id, amount_cents: 20500 },
    ],
  });
  const a = await armed({ client, claim: c });
  const out = await post(a);
  assert.equal(out.posted, true, "two: the belt did NOT raise — both allocations covered the credit leg");

  // ONE credit leg, because both advances sit on ONE account.
  const lines = await linesWithIds(out.entry_id);
  const credits = lines.filter((l) => Number(l.credit_cents) > 0);
  assert.equal(credits.length, 1, "two: ONE credit leg per advance ACCOUNT, and there is one account");
  assert.equal(credits[0].account_code, SECHART.advance);
  assert.equal(String(credits[0].credit_cents), "60500");

  // TWO register allocations, both keyed to that very credit leg.
  const apps = await applicationsForEntry(out.entry_id);
  assert.equal(apps.length, 2, "two: the register minted ONE allocation per named advance");
  const byAdvance = new Map(apps.map((r) => [r.advance_id, r]));
  assert.equal(String(byAdvance.get(advA.id).amount_cents), "40000");
  assert.equal(String(byAdvance.get(advB.id).amount_cents), "20500");
  for (const r of apps) {
    assert.equal(r.kind, "claim", "two: minted under 0043's own `claim` kind");
    assert.equal(r.application_line_id, credits[0].id,
      "two: every allocation is keyed to the very credit leg the belt reads");
    assert.equal(r.effective_date_text, SEC_DATE.posting,
      "two: the effective date is the ENTRY's posting date (0043 SS3.2)");
  }

  // EACH ADVANCE MOVED BY ITS OWN AMOUNT — the arithmetic the ruling promises.
  assert.equal(await advanceOutstanding(advA.id, SEC_DATE.posting), 0, "two: A is fully discharged");
  assert.equal(await advanceOutstanding(advB.id, SEC_DATE.posting), 9500, "two: B keeps 9,500 sen");

  // THE CLAIM RECORD: the head columns keep the single-advance shape, and the READ answers a LIST.
  const row = await claimRow(a.claim_id);
  assert.equal(row.settlement, SETTLEMENT.advance);
  assert.equal(row.advance_id, advA.id, "two: the head of the confirmed list is the claim row's own advance");
  assert.equal(row.advance_account_code, SECHART.advance);

  const read = await getStaffExpenseClaim(ALICE(), a.claim_id);
  assert.deepEqual(
    read.advance_allocations.map((x) => [x.advance_id, Number(x.amount_cents)]),
    [[advA.id, 40000], [advB.id, 20500]],
    "two: the claim read returns the CONFIRMED allocations, in the order they were confirmed",
  );
  const listed = (await listStaffExpenseClaims(ALICE(), { client }))
    .find((x) => x.id === a.claim_id);
  assert.equal(listed.advance_allocations.length, 2,
    "two: the register list shows ONE discharge per named advance");
});

// ===========================================================================================
// 2 · p931.cap — the per-allocation temporal cap, and the typed shortfall that NAMES the advance.
// ===========================================================================================

test("p931.cap an allocation beyond ITS OWN advance's outstanding is refused naming THAT advance, its outstanding on the day and the shortfall", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("alloccap");
  // THE WORKED EXAMPLE. A = 40,000 sen (enough for its own share), B = 10,000 sen (not enough).
  // The 60,500 claim is split A 40,000 / B 20,500, so the SECOND allocation outruns B by
  // 20,500 - 10,000 = 10,500 sen. The claim TOTAL is inside the pair's combined 50,000 + …, so a
  // cap asked once for the claim against the head advance would have let this through.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 10000, issueDate: "2026-02-01" })).advance;

  const c = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advB.id, amount_cents: 20500 },
    ],
  });
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "cap");

  assert.equal(detail.advance_id, advB.id, "cap: the refusal names the SECOND advance, not the head");
  assert.equal(Number(detail.outstanding_cents), 10000,
    "cap: …its outstanding on the boundary day the cap stopped at");
  assert.equal(String(detail.boundary_date).slice(0, 10), SEC_DATE.posting,
    "cap: …and which day that was");
  assert.equal(Number(detail.proposed_cents), 20500, "cap: …what was asked of it");
  assert.equal(Number(detail.shortfall_cents), 10500,
    "cap: …and the SHORTFALL, so the preparer can move exactly that many sen");
  assert.equal(detail.field, "claim.advance_allocations[2].amount_cents",
    "cap: the refusal addresses the ALLOCATION the preparer must change, not the claim total");
  assert.equal(detail.constraint, "over_application");

  // Neither advance moved: the refusal is raised before anything durable.
  assert.equal(await advanceOutstanding(advA.id, SEC_DATE.posting), 40000, "cap: A is untouched");
  assert.equal(await advanceOutstanding(advB.id, SEC_DATE.posting), 10000, "cap: B is untouched");
});

test("p931.cap.single a SINGLE-advance over-application keeps its existing reason and its existing field", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("alloccap1");
  // 0221's own `p638.advance.over` shape, restated here as #931's non-regression: a claim that
  // names ONE advance is refused at `claim.amount_cents`, because that IS the control a preparer
  // would change — there is no allocation row to address.
  const adv = (await seedAdvance(ALICE(), BOB(), { client, cents: 20000, issueDate: "2026-02-01" })).advance;
  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: adv.id,
    payableAccountCode: null,
  });
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "cap.single");
  assert.equal(detail.field, "claim.amount_cents", "cap.single: the 0221 field path is unmoved");
  assert.equal(detail.constraint, "over_application");
  assert.equal(detail.advance_id, adv.id);
  assert.equal(Number(detail.shortfall_cents), 40500,
    "cap.single: …and the shortfall rides beside it (60,500 claimed against 20,000 outstanding)");
});

// ===========================================================================================
// 3 · p931.accounts — advances on TWO enrolled accounts, and the TWO credit legs they imply.
// ===========================================================================================

test("p931.accounts allocations on two enrolled accounts produce TWO credit legs, one allocation each", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocacct");
  // THE WORKED EXAMPLE. Farah holds TWO dedicated advance accounts — 1190 (enrolled by the rig's
  // own chart) and 1191, enrolled here through 0043's admin door under the SAME attested label,
  // which is what makes her second account HERS for this claim (0301's fourth measurement).
  //   A = 40,000 sen on 1190, C = 30,000 sen on 1191.
  // The 60,500 claim takes 40,000 from A and 20,500 from C, so the entry must credit BOTH
  // accounts: 1190 by 40,000 and 1191 by 20,500. One leg carrying 60,500 would say the whole
  // claim was settled out of one account, which is not what happened.
  await enrolAdvanceFor(ALICE(), {
    client, code: SECHART.advanceFresh, person: "Farah binti Idris",
  });
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advC = (await seedAdvance(ALICE(), BOB(), {
    client, code: SECHART.advanceFresh, cents: 30000, issueDate: "2026-02-01",
  })).advance;

  const c = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advC.id, amount_cents: 20500, account_code: SECHART.advanceFresh },
    ],
  });
  const a = await armed({ client, claim: c });
  const out = await post(a);
  assert.equal(out.posted, true, "accounts: the belt did NOT raise on either credit leg");

  const lines = await linesWithIds(out.entry_id);
  const credits = lines.filter((l) => Number(l.credit_cents) > 0);
  assert.equal(credits.length, 2, "accounts: ONE credit leg per advance ACCOUNT, and there are two");
  const byCode = new Map(credits.map((l) => [l.account_code, l]));
  assert.equal(String(byCode.get(SECHART.advance).credit_cents), "40000");
  assert.equal(String(byCode.get(SECHART.advanceFresh).credit_cents), "20500");

  const apps = await applicationsForEntry(out.entry_id);
  assert.equal(apps.length, 2, "accounts: one register allocation per named advance");
  const appOf = new Map(apps.map((r) => [r.advance_id, r]));
  assert.equal(appOf.get(advA.id).application_line_id, byCode.get(SECHART.advance).id,
    "accounts: each allocation is keyed to the credit leg on ITS OWN advance account");
  assert.equal(appOf.get(advC.id).application_line_id, byCode.get(SECHART.advanceFresh).id);
  assert.equal(String(appOf.get(advA.id).amount_cents), "40000");
  assert.equal(String(appOf.get(advC.id).amount_cents), "20500");

  assert.equal(await advanceOutstanding(advA.id, SEC_DATE.posting), 0, "accounts: A is fully discharged");
  assert.equal(await advanceOutstanding(advC.id, SEC_DATE.posting), 9500, "accounts: C keeps 9,500 sen");

  const row = await claimRow(a.claim_id);
  assert.equal(row.advance_account_code, SECHART.advance,
    "accounts: the claim row's own account column carries the HEAD of the confirmed list");
});
