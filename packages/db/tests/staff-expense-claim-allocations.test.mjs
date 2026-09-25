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
  assertPair, rootQuery, opk, detailOf, withClientRungHeld, awaitRungWaiters, reverseEntry,
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

// ===========================================================================================
// 4 · p931.sum / p931.twice / p931.claimant — the list's own walls.
// ===========================================================================================

test("p931.sum allocations that do not add up to the claim are refused, naming both figures", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocsum");
  // 40,000 + 20,000 = 60,000 against a 60,500 claim: 500 sen owed to nobody. The parent ruling
  // takes partial settlement and over-allocation out of scope, so this is a refusal, not a
  // remainder.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;
  const c = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advB.id, amount_cents: 20000 },
    ],
  });
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "sum");
  assert.equal(detail.constraint, "exact_sum");
  assert.equal(detail.field, "claim.advance_allocations");
  assert.equal(Number(detail.allocated_cents), 60000);
  assert.equal(Number(detail.amount_cents), 60500);
});

test("p931.twice one advance named twice in a list is refused", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("alloctwice");
  // A list that names one advance twice would make "the allocations add up" true while saying two
  // different things about one advance. The register would hold one row, the claim two.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 80000, issueDate: "2026-01-10" })).advance;
  const c = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advA.id, amount_cents: 20500 },
    ],
  });
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "twice");
  assert.equal(detail.constraint, "distinct");
  assert.equal(detail.field, "claim.advance_allocations[2].advance_id");
  assert.equal(detail.advance_id, advA.id);
});

test("p931.claimant an advance issued to ANOTHER claimant is refused naming that advance", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocwho");
  // 1191 is enrolled here to a DIFFERENT attested person. 0221 never asked WHOSE advance a claim
  // discharged — only which account it sat on — so this is a NEW wall, and the cell that holds it.
  await enrolAdvanceFor(ALICE(), {
    client, code: SECHART.advanceFresh, person: "Hakim bin Omar",
  });
  const advFarah = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advHakim = (await seedAdvance(ALICE(), BOB(), {
    client, code: SECHART.advanceFresh, cents: 30000, issueDate: "2026-02-01",
  })).advance;
  const c = allocClaim({
    allocations: [
      { advance_id: advFarah.id, amount_cents: 40000 },
      { advance_id: advHakim.id, amount_cents: 20500, account_code: SECHART.advanceFresh },
    ],
  });
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "claimant");
  assert.equal(detail.constraint, "not_this_claimant");
  assert.equal(detail.advance_id, advHakim.id, "claimant: the refusal names the advance that is not hers");
  assert.equal(detail.field, "claim.advance_allocations[2].advance_id");
  assert.equal(detail.claimant_enrolment_id, await liveEnrolment(client, SECHART.advance));
});

// ===========================================================================================
// 5 · p931.single — a claim that names ONE advance is unchanged, end to end.
// ===========================================================================================

test("p931.single a single-advance claim still replays under its intent key and reads back as a ONE-element list", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocone");
  const adv = (await seedAdvance(ALICE(), BOB(), { client, cents: 100000, issueDate: "2026-02-01" })).advance;
  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: adv.id,
    payableAccountCode: null,
  });
  const key = `alloc-single-${opk("k")}`;
  const first = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c, intentKey: key });
  const again = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c, intentKey: key });
  assert.equal(again.replayed, true, "single: the SAME claim under the SAME key still replays");
  assert.equal(again.claim_id, first.claim_id, "single: …onto the very claim it already admitted");

  // THE SAME CLAIM SPELLED AS A ONE-ELEMENT LIST canonicalises to the same bytes, so it replays too
  // — which is what makes the new field a spelling rather than a second claim.
  const spelled = allocClaim({ allocations: [{ advance_id: adv.id, amount_cents: 60500 }] });
  const third = await admitStaffExpenseClaimWork({
    client, author: ALICE(), claim: spelled, intentKey: key,
  });
  assert.equal(third.replayed, true,
    "single: a plain advance_id and a one-element list naming it are ONE claim, not a conflict");
  assert.equal(third.claim_id, first.claim_id);

  const read = await getStaffExpenseClaim(ALICE(), first.claim_id);
  assert.deepEqual(read.advance_allocations.map((x) => [x.advance_id, Number(x.amount_cents)]),
    [[adv.id, 60500]],
    "single: the claim read answers a LIST whatever shape the submission used");
});

test("p931.split.conflict re-submitting one intent key with a DIFFERENT split is a typed conflict", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocsplit");
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 50000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 50000, issueDate: "2026-02-01" })).advance;
  const key = `alloc-split-${opk("k")}`;
  const first = await admitStaffExpenseClaimWork({
    client,
    author: ALICE(),
    intentKey: key,
    claim: allocClaim({
      allocations: [
        { advance_id: advA.id, amount_cents: 40000 },
        { advance_id: advB.id, amount_cents: 20500 },
      ],
    }),
  });
  assert.ok(first.claim_id);
  // Same total, same advances, DIFFERENT split. The stored record is the confirmed list, so a
  // second confirmation that says something else is a conflict rather than a silent overwrite.
  await assertPair("CLR10", SEC_REASON.intentConflict, () => admitStaffExpenseClaimWork({
    client,
    author: ALICE(),
    intentKey: key,
    claim: allocClaim({
      allocations: [
        { advance_id: advA.id, amount_cents: 30000 },
        { advance_id: advB.id, amount_cents: 30500 },
      ],
    }),
  }), "split.conflict");
});

// ===========================================================================================
// 6 · p931.race — TWO admissions of ONE intent key, both past the payload comparison before
//     either holds the client rung.
//
//     WHY THIS SHAPE IS REACHABLE RATHER THAN THEORETICAL. The claim form mints ONE `intentKey`
//     when the draft starts and keeps it across reloads
//     (`apps/web/components/accounting/staff-expense-claim-form.tsx`,
//     `apps/web/lib/work/staff-expense-claim-draft.ts`), so one draft edited into a different
//     split and submitted twice — two tabs, or a retry while the first request is still in
//     flight — is exactly two concurrent admissions under one key with two different confirmed
//     lists.
//
//     WHY THE DOOR CANNOT ANSWER FROM STEP 4 ALONE. Step 4's canonical comparison is the only
//     place a changed split is caught, and it runs BEFORE `pg_advisory_xact_lock`, so it cannot
//     see a sibling that has not committed. `clara._admit_accounting_work_core` then converges on
//     the intent key and compares the JOURNAL BASIS DIGEST — and #931's own second measurement
//     groups allocations on ONE account into ONE credit leg, so a single-advance claim and a
//     split of the same total on that account derive the SAME digest. The second caller is
//     therefore told `replayed` and arrives at the claim insert holding a DIFFERENT confirmed
//     list from the one already stored.
// ===========================================================================================

test("p931.race.graft two concurrent admissions under ONE key with DIFFERENT lists: the loser is a typed conflict, and the stored list still adds up to its claim", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocrace");
  // THE WORKED EXAMPLE. Two advances to Farah on her one dedicated account:
  //   A = 60,500 sen issued 2026-01-10 — enough to carry the whole claim on its own,
  //   B = 30,000 sen issued 2026-02-01.
  // ONE 60,500 claim is submitted TWICE under ONE key: once naming A alone, once split
  // A 40,000 / B 20,500. Both derive the SAME journal (one 60,500 credit leg on the one
  // account), so the core answers the second caller `replayed`; the two CONFIRMED LISTS are
  // different, and the door has to say so rather than merge them.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 60500, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;

  const single = claim({
    settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
    advanceId: advA.id, payableAccountCode: null,
  });
  const split = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advB.id, amount_cents: 20500 },
    ],
  });
  const key = `alloc-race-${opk("k")}`;
  const settled = await withClientRungHeld(client, async (release) => {
    const race = Promise.allSettled([
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: single, intentKey: key }),
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: split, intentKey: key }),
    ]);
    await awaitRungWaiters(2);
    await release();
    return race;
  });

  const won = settled.filter((r) => r.status === "fulfilled");
  const lost = settled.filter((r) => r.status === "rejected");
  assert.equal(won.length, 1,
    `race.graft: exactly ONE of the two lists may be the confirmed record (got ${won.length}); `
    + `outcomes ${JSON.stringify(settled.map((r) => (r.status === "fulfilled" ? "ok" : (r.reason?.code ?? "err"))))}`);
  const err = lost[0].reason;
  assert.equal(err.code, "CLR10",
    `race.graft: the loser is a TYPED refusal, not a raw ${err.code} — "${err.message}"`);
  assert.equal(detailOf(err)?.reason, SEC_REASON.intentConflict,
    `race.graft: …and it says the key already carries a different claim, got ${JSON.stringify(detailOf(err))}`);
  assert.equal(detailOf(err)?.field, "claim",
    "race.graft: …addressed at the claim, the same field step 4's own comparison uses");

  // THE DATA IS THE POINT. One claim, and the confirmed list stored against it adds up to it to
  // the sen — migration 0301's own tail T.3b arithmetic, asked here of the row this race wrote.
  assert.equal(await claimCount(client), 1, "race.graft: ONE claim was admitted, not one and a half");
  const stored = await getStaffExpenseClaim(ALICE(), won[0].value.claim_id);
  assert.equal(
    stored.advance_allocations.reduce((n, x) => n + Number(x.amount_cents), 0),
    Number(stored.amount_cents),
    `race.graft: the confirmed list adds up to its claim, got `
    + `${JSON.stringify(stored.advance_allocations)} against ${stored.amount_cents}`,
  );
});

test("p931.race.ordinal the same race with a DIFFERENT head is refused by NAME, never as a raw 23505 on the list's ordinal", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocraceord");
  // THE SAME RACE, ONE FIGURE MOVED. Here the single-advance spelling names the SECOND advance:
  //   A = 40,000 sen issued 2026-01-10, B = 60,500 sen issued 2026-02-01.
  //   caller 1: the whole 60,500 against B alone.   caller 2: A 40,000 / B 20,500.
  // Both still derive ONE 60,500 credit leg, so the core still answers `replayed`; but now the
  // two lists disagree about WHICH advance is FIRST, so the second payload's head collides with
  // the stored head on `uq_sec_allocations_claim_ordinal` — an index the allocation insert's
  // `on conflict (claim_id, advance_id)` arbiter does not cover. A raw 23505 is an error
  // `workErrorResponse` does not classify, so the route would answer 500 {error:"internal"} and
  // the browser would say "unavailable" where the preparer needs to be told their split changed.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 60500, issueDate: "2026-02-01" })).advance;

  const single = claim({
    settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance,
    advanceId: advB.id, payableAccountCode: null,
  });
  const split = allocClaim({
    allocations: [
      { advance_id: advA.id, amount_cents: 40000 },
      { advance_id: advB.id, amount_cents: 20500 },
    ],
  });
  const key = `alloc-race-ord-${opk("k")}`;
  const settled = await withClientRungHeld(client, async (release) => {
    const race = Promise.allSettled([
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: single, intentKey: key }),
      admitStaffExpenseClaimWork({ client, author: ALICE(), claim: split, intentKey: key }),
    ]);
    await awaitRungWaiters(2);
    await release();
    return race;
  });

  const won = settled.filter((r) => r.status === "fulfilled");
  const lost = settled.filter((r) => r.status === "rejected");
  assert.equal(won.length, 1,
    `race.ordinal: exactly ONE of the two lists may be the confirmed record (got ${won.length})`);
  const err = lost[0].reason;
  assert.equal(err.code, "CLR10",
    `race.ordinal: the loser is a TYPED refusal, not a raw ${err.code} — "${err.message}"`);
  assert.equal(detailOf(err)?.reason, SEC_REASON.intentConflict,
    `race.ordinal: …and it names WHAT happened, got ${JSON.stringify(detailOf(err))}`);

  // The confirmed list is WHOLE and it is ONE payload's: its head is the claim row's own advance
  // (tail T.3c's arithmetic) and it adds up to the claim (T.3b's).
  const row = await claimRow(won[0].value.claim_id);
  const stored = await getStaffExpenseClaim(ALICE(), won[0].value.claim_id);
  assert.equal(stored.advance_allocations[0].advance_id, row.advance_id,
    "race.ordinal: the stored head is the claim row's own advance, not the loser's");
  assert.equal(
    stored.advance_allocations.reduce((n, x) => n + Number(x.amount_cents), 0),
    Number(stored.amount_cents),
    `race.ordinal: the confirmed list adds up to its claim, got ${JSON.stringify(stored.advance_allocations)}`,
  );
});

// ===========================================================================================
// 7 · p931.replay.birth — AC3's second half, DRIVEN.
//
//     `t_je_adv_claim_application_birth` is a DEFERRABLE constraint trigger on
//     `clara.journal_entries`, `after insert or update ... when (new.status = 'approved')`. The
//     public act that re-enters it on an entry already approved is the REVERSAL, which stamps
//     `reversed_by` on that very row: an UPDATE whose `new.status` is still `approved`. So a
//     posted multi-advance claim that is then reversed runs the per-allocation registration loop
//     a SECOND time over the same allocations — which is the only path on which "registers every
//     allocation idempotently" is a property of behaviour rather than of the unique index alone.
// ===========================================================================================

test("p931.replay.birth re-entering the post-approve registration for a TWO-allocation claim registers nothing twice", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("allocidem");
  // THE WORKED EXAMPLE, p931.two's own: A = 40,000 (2026-01-10), B = 30,000 (2026-02-01); the
  // 60,500 claim takes 40,000 from A and 20,500 from B.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;
  const a = await armed({
    client,
    claim: allocClaim({
      allocations: [
        { advance_id: advA.id, amount_cents: 40000 },
        { advance_id: advB.id, amount_cents: 20500 },
      ],
    }),
  });
  const out = await post(a);
  assert.equal(out.posted, true);

  const born = (await applicationsForEntry(out.entry_id)).filter((r) => r.kind === "claim");
  assert.equal(born.length, 2, "replay.birth: the first pass registered ONE allocation per advance");
  assert.equal(await advanceOutstanding(advA.id, SEC_DATE.posting), 0);
  assert.equal(await advanceOutstanding(advB.id, SEC_DATE.posting), 9500);

  // THE SECOND PASS. `reverse_entry` stamps `reversed_by` on the approved entry, so the birth
  // trigger's WHEN clause is true again and the loop walks BOTH allocations a second time.
  await reverseEntry(ALICE(), { entry: out.entry_id, reason: "#931: posted in error" });

  const after = (await applicationsForEntry(out.entry_id)).filter((r) => r.kind === "claim");
  assert.equal(after.length, 2,
    `replay.birth: the second pass registered NOTHING again — still one 'claim' row per advance, `
    + `got ${JSON.stringify(after.map((r) => [r.advance_id, String(r.amount_cents)]))}`);
  assert.deepEqual(
    after.map((r) => [r.advance_id, String(r.amount_cents), r.application_line_id]).sort(),
    born.map((r) => [r.advance_id, String(r.amount_cents), r.application_line_id]).sort(),
    "replay.birth: …and they are the very rows the first pass minted, unchanged",
  );

  // THE ARITHMETIC IS THE REVERSAL'S ALONE, on BOTH days that matter.
  //
  // ON THE CLAIM'S OWN DAY nothing moved at all: the second pass registered no further discharge,
  // so 0043's outstanding still reads exactly what the FIRST pass left.
  assert.equal(await advanceOutstanding(advA.id, SEC_DATE.posting), 0,
    "replay.birth: A's outstanding on the claim's day is untouched by the second pass");
  assert.equal(await advanceOutstanding(advB.id, SEC_DATE.posting), 9500,
    "replay.birth: …and so is B's");

  // ON THE REVERSAL'S OWN DAY each advance is whole again, and the unwind is ONE correction per
  // application rather than one per pass — a second registration would have left a correction with
  // nothing to correct, or a discharge with no correction at all.
  const rev = (await rootQuery(
    "select id, posting_date::text as posting_date from clara.journal_entries where reversal_of = $1",
    [out.entry_id])).rows[0];
  assert.ok(rev, "replay.birth: the reversal entry is in the books");
  const corrections = (await applicationsForEntry(rev.id)).filter((r) => r.kind === "correction");
  assert.equal(corrections.length, 2,
    `replay.birth: ONE correction per allocation, got ${corrections.length}`);
  assert.equal(await advanceOutstanding(advA.id, rev.posting_date), 40000,
    "replay.birth: as of the reversal's own day A carries its whole 40,000 again");
  assert.equal(await advanceOutstanding(advB.id, rev.posting_date), 30000,
    "replay.birth: …and B its whole 30,000");
});

// ===========================================================================================
// 8 · p931.claimant.samelabel — WHAT "BELONGS TO THIS CLAIMANT" CAN AND CANNOT TELL APART.
//
//     0301's fourth measurement reads ownership in two arms: (a) the advance's own enrolment IS
//     the claimant's, or (b) the advance's enrolment is another LIVE enrolment of this client
//     whose `btrim(person_label)` is byte-identical. Arm (b) is the ONLY thing that makes #931's
//     own listed default — "advances on different enrolled accounts may be discharged together" —
//     reachable while 0221's D4 stands (the claimant IS an enrolment handle; there is no staff
//     master).
//
//     THE LIMIT, NAMED RATHER THAN HIDDEN. `person_label` is free text: its only wall is
//     `nullif(btrim(coalesce(p_person_label,'')),'')` inside `clara.enrol_staff_advance_account`,
//     and `clara.staff_advance_accounts` carries no CHECK on the column. So TWO DIFFERENT PEOPLE
//     of one client who happen to be labelled identically are ONE person to this rule — even when
//     the claim itself states a `claimant.identifier` that says otherwise, because the rule never
//     reads it.
//
//     THIS CELL PINS THE ANSWER AS IT STANDS so the owner's ruling has somewhere to land (#931
//     report, "Flag for review"; adversarial A931-2; spec SPEC-931-B). If the ruling is arm (a)
//     only, THIS is the cell that flips to a `not_this_claimant` refusal and p931.accounts becomes
//     unreachable until a staff master lands.
// ===========================================================================================

test("p931.claimant.samelabel two enrolments of ONE client sharing a person_label are ONE claimant to this wall, whatever the claim's own identifier says", async (t) => {
  if (await gateAlloc(t)) return;
  const client = await allocClient("alloclabel");
  // 1190 is enrolled by the rig to "Farah binti Idris". 1191 is enrolled here to a SECOND person
  // carrying the same written name — a different human, a different attestation, a different
  // staff number — and the advance on it is HERS, not the claimant's.
  await enrolAdvanceFor(ALICE(), {
    client, code: SECHART.advanceFresh, person: "Farah binti Idris",
  });
  const enrolOne = await liveEnrolment(client, SECHART.advance);
  const enrolTwo = await liveEnrolment(client, SECHART.advanceFresh);
  assert.notEqual(enrolOne, enrolTwo, "samelabel: two distinct enrolment rows");

  const mine = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const hers = (await seedAdvance(ALICE(), BOB(), {
    client, code: SECHART.advanceFresh, cents: 30000, issueDate: "2026-02-01",
  })).advance;
  assert.equal(hers.enrolment_id, enrolTwo, "samelabel: the second advance sits on the OTHER enrolment");

  const a = await armed({
    client,
    claim: allocClaim({
      identifier: "STAFF-0001",
      allocations: [
        { advance_id: mine.id, amount_cents: 40000 },
        { advance_id: hers.id, amount_cents: 20500, account_code: SECHART.advanceFresh },
      ],
    }),
  });

  // PINNED, PENDING THE OWNER'S RULING: admitted. The claim is recorded against the FIRST
  // enrolment and states an identifier of its own, and neither fact stopped it discharging an
  // advance issued under the SECOND.
  const row = await claimRow(a.claim_id);
  assert.equal(row.claimant_enrolment_id, enrolOne,
    "samelabel: the claim is the FIRST enrolment's");
  assert.equal(row.claimant_identifier, "STAFF-0001",
    "samelabel: …and it carries an identifier the ownership rule never consults");
  const stored = await getStaffExpenseClaim(ALICE(), a.claim_id);
  assert.deepEqual(
    stored.advance_allocations.map((x) => [x.advance_id, Number(x.amount_cents)]),
    [[mine.id, 40000], [hers.id, 20500]],
    "samelabel: the confirmed list discharges an advance enrolled to the OTHER row — arm (b), "
    + "on a byte-equal person_label and nothing else",
  );
});

// ===========================================================================================
// 9 · #1067 [0339] — AN ALLOCATION LIST THAT IS PRESENT CARRIES AT LEAST ONE ALLOCATION.
//
// 0301 reads the list through `v_listed`, which is "an array with MORE THAN ZERO members", so a
// present-but-EMPTY array is not a list at all to this validator: every rule the list has —
// its settlement, its distinctness, its exact sum and its head — is skipped, and what the claim
// is then judged on is whatever ELSE it happens to carry. The runtime's own wire schema refuses
// an empty list (`workRoutes.ts`, `advance_allocations` / `at_least_one`), but the door is the
// boundary any caller can reach, so the rule belongs here too and under the same word.
//
// THIS SECTION'S OWN FRONTIER, layered on top of `gateAlloc` above. 0301's stem is true from its
// own migration onward, long before 0339 exists, so these cells need their OWN stem check —
// prepayment-stated-term.test.mjs's own two-frontier idiom.
// ===========================================================================================

export const SEC_EMPTY_ALLOC_STEM = "staff_expense_claim_empty_allocation$";

let _empty = null;
async function emptyLaneReady() {
  if (_empty === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [SEC_EMPTY_ALLOC_STEM]);
      _empty = r.rows[0].n > 0;
    } catch {
      _empty = false;
    }
  }
  return _empty;
}

async function gateEmpty(t) {
  if (await emptyLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_SEC_EMPTY_ALLOCATION === "1") {
    markSkip();
    t.skip(`#1067 empty-allocation refusal absent (no ${SEC_EMPTY_ALLOC_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#1067: the empty-allocation refusal is absent. Apply "
    + "0339_staff_expense_claim_empty_allocation.sql (or its numbered suite copy), or set "
    + "CLARA_ALLOW_MISSING_SEC_EMPTY_ALLOCATION=1 for the package-wide pre-integration sweep.",
  );
  return true;
}

test("p1067.empty an advance application that states an allocation list and allocates NOTHING is refused by its own name, at the list's own field", async (t) => {
  if (await gateAlloc(t) || await gateEmpty(t)) return;
  const client = await allocClient("emptyalloc");
  // THE WORKED EXAMPLE. The rig claim totals 60,500 sen and ONE 80,000-sen advance stands ready
  // to carry it, so every other rule this door has would admit this submission: the exact-sum
  // check cannot fire (an empty list is never compared), the cap is not reached, the claimant
  // owns the advance. The list is present and it allocates nothing — that alone is the refusal.
  const adv = (await seedAdvance(ALICE(), BOB(), { client, cents: 80000, issueDate: "2026-01-10" })).advance;
  const c = claim({
    settlement: SETTLEMENT.advance,
    advanceAccountCode: SECHART.advance,
    advanceId: adv.id,
    payableAccountCode: null,
  });
  c.advance_allocations = [];
  const { detail } = await refusesAlloc(client, "CLR10", SEC_REASON.allocationMismatch,
    () => admitStaffExpenseClaimWork({ client, author: ALICE(), claim: c }), "empty");
  assert.equal(detail.field, "claim.advance_allocations");
  assert.equal(detail.constraint, "at_least_one");
});
