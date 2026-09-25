// #1074 (riders sweep wave, lane 01) — A REVERSAL REVERSES WHAT ITS OCCURRENCE POSTED.
//
// THE DEFECT THIS BATTERY EXISTS TO CLOSE, measured before a line was written. An accrual
// occurrence posts its period's entry (say 300,000c). Before that occurrence's reversal leg is
// admitted, a correction (`clara.correct_accrual_adjustment`) advances the plan to a NEW live
// revision carrying a NEW basis (say 275,000c). `clara._plan_admit_occurrence` then builds the
// REVERSAL from the LIVE revision — so it reverses 275,000c against a posted 300,000c and strands
// 25,000c on the balance-sheet leg for ever, because nothing ever posted or reversed that amount.
// The body is shared by every plan kind, so the defect is not the accrual lane's alone.
//
// THE CLAIMS:
//
//   1. THE LEDGER NETS TO ZERO. Posting, correcting and then reversing leaves NOTHING on the
//      accrual's balance-sheet leg and nothing on its profit-and-loss leg — read back off
//      `clara.journal_lines`, never off the two entries this battery posted.
//   2. IT IS THE SAME ON BOTH SIDES (#942). An expense accrual and a revenue accrual answer
//      identically, because the fix lives in the shared admission core and the sides are
//      exchanged by the one IMMUTABLE basis body that was already side-agnostic.
//   3. IT IS THE SAME UNDER BOTH CALCULATION RULES (#937). A `stated_period_amount` accrual whose
//      per-period amounts a correction restates still reverses the period's POSTED figure.
//   4. THE OUT-OF-SCOPE LINE HOLDS. A correction still reaches every occurrence that has NOT yet
//      posted: the NEXT period's accrual posts the CORRECTED figure, unchanged.
//   5. THE CATALOG. The resolver this fix adds is an ungranted, STABLE, SECURITY DEFINER internal
//      with a pinned search_path, and the admission core is the ONE body that reaches it.
//
// CONTRACT-BLIND against #1074's own Agent Brief (issue body, zero comments, re-verified live on
// this branch) and the shapes 0193/0222/0284/0303/0304/0308 already ship — never against an
// implementation file. FRONTIER-GATED on the `plan_reversal_posted_basis$` stem.
//
// Every assertion under test runs through a real door at the least privilege that should succeed;
// `rootQuery` appears only to READ BACK the ledger and the catalog after a door wrote them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  freshAccrualClient, accrual, createAccrualAdjustment, getAccrualAdjustment,
  correctAccrualAdjustment, postPlanWork, requestPlanCatchUp, occurrenceRows,
  occurrenceExtras, instructionRef, todayInPlanZone, shiftMonths, ACHART, ACCRUAL_TZ,
} from "./accrual-correction-fixtures.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// The frontier gate. Keyed on THIS migration's STABLE STEM, never its number: the
// `db-slice-frontiers` matrix runs this package against databases pinned at earlier frontiers
// where 0308 has applied and 0332 has not.
// ===========================================================================================

const STEM = "plan_reversal_posted_basis$";

let _ready = null;
async function laneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** A FOCUSED run against a database without the fix is a real FAILURE — a skip is not evidence.
 *  Only the package-wide sweep's preloaded gate module turns it into a counted skip. */
async function gate1074(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PLAN_REVERSAL_POSTED_BASIS !== "1") {
    assert.fail(
      `#1074 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/plan-reversal-posted-basis-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#1074 posted-entry reversal basis absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("plan-reversal-posted-basis");
  printSkipCount("plan-reversal-posted-basis");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const FIRM_A = () => world.firms.A;

/** The revenue side's own two accounts, the pair #942's own battery chooses under the
 *  2026-09-20 owner ruling: an income account and a non-control asset the client already has. */
const RCHART = { income: "4000", asset: "1320" };

const monthStart = (day) => `${day.slice(0, 7)}-01`;

async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/** A window wholly in the past, `monthsBack` months long, so every due date this battery names is
 *  due on EVERY calendar day the battery runs. The plan admits the LATEST accrual at or before
 *  today at configuration time (0193's picker), which is the month end `monthsBack - 1` ago. */
async function span(monthsBack = 2) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** The lines ONE journal entry actually carries, in its own order. */
async function entryLines(entryId) {
  const r = await rootQuery(
    `select account_code, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents,
            description
       from clara.journal_lines where entry_id = $1 order by line_no`, [entryId]);
  return r.rows.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]);
}

/** The net movement on ONE account across every APPROVED, un-reversed entry of a client — the
 *  ledger's own answer to "what is this account left carrying", read after the fact. */
async function netOnAccount(client, account) {
  const r = await rootQuery(
    `select coalesce(sum(jl.credit_cents - jl.debit_cents), 0)::bigint as net
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where je.client_id = $1 and jl.account_code = $2
        and je.status = 'approved' and je.reversed_by is null`, [client, account]);
  return Number(r.rows[0].net);
}

/** Admit ONE named due event through the human catch-up door and post it all the way to a
 *  committed receipt. Returns the journal entry id. */
async function catchUpAndPost({ plan, client, due, leg }) {
  const answer = await requestPlanCatchUp(BOB(), { plan, from: due, to: due, opKey: opk("p1074-catch") });
  assert.ok(answer.admitted >= 1,
    `the catch-up admitted nothing for the ${leg} leg of ${due}: ${JSON.stringify(answer.events)}`);
  const row = (await occurrenceRows(plan)).find((o) => o.leg === leg && o.due_date === due);
  assert.ok(row?.work_id, `no admitted ${leg} occurrence for ${due}`);
  return postPlanWork({ work: row.work_id, client, author: BOB(), firm: FIRM_A() });
}

/** An EXPENSE accrual on a fresh client, configured through the human door. */
async function configureExpense({ tag, cents = 300000, monthsBack = 2, over = {} } = {}) {
  const client = await freshAccrualClient(ALICE(), `p1074-${tag}`);
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(monthsBack);
  const particulars = accrual({
    cents, servicePeriodStart: s.from, servicePeriodEnd: s.to, ...over,
  });
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: s.from, effectiveTo: s.to,
  });
  return { ...created, client, particulars, span: s };
}

/** A REVENUE accrual (#942) on a fresh client carrying the revenue side's own two accounts. */
async function configureRevenue({ tag, cents = 300000, monthsBack = 2 } = {}) {
  const client = await freshAccrualClient(ALICE(), `p1074-${tag}`);
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.income, name: "Sales / Fees Income", type: "income",
    accountClass: null, opKey: opk("p1074-coa"),
  });
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.asset, name: "Unbilled Receivables (Work-in-Progress)", type: "asset",
    accountClass: null, opKey: opk("p1074-coa"),
  });
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(monthsBack);
  const particulars = {
    ...accrual({
      expenseAccount: RCHART.income, liabilityAccount: RCHART.asset, cents,
      servicePeriodStart: s.from, servicePeriodEnd: s.to,
      memo: "Accrued fees delivered, not yet invoiced",
    }),
    side: "revenue",
  };
  const created = await createAccrualAdjustment(BOB(), {
    client, purpose: "Monthly unbilled fee accrual", authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: s.from, effectiveTo: s.to,
  });
  return { ...created, client, particulars, span: s };
}

// ===========================================================================================
// p1074.expense — THE DEFECT ITSELF, ON THE EXPENSE SIDE.
// ===========================================================================================

test("p1074.expense.reverses_what_posted — an accrual posts X, a correction restates it to Y before the reversal runs, and the reversal posts exactly X: the balance-sheet leg nets to zero", async (t) => {
  if (await gate1074(t)) return;
  const POSTED = 300000;
  const CORRECTED = 275000;

  const base = await configureExpense({ tag: "expense", cents: POSTED });
  assert.equal(base.occurrence?.leg, "primary",
    "the configuration admitted the current period's accrual leg");
  const due = base.occurrence.due_date;

  // 1 · THE ACCRUAL, ON THE BOOKS. Dr expense / Cr the accrued liability, at the figure the plan
  //     stated when the occurrence was admitted.
  const entry = await postPlanWork({
    work: base.occurrence.work_id, client: base.client, author: BOB(), firm: FIRM_A(),
  });
  assert.deepEqual(await entryLines(entry),
    [[ACHART.expense, POSTED, 0], [ACHART.liability, 0, POSTED]],
    "the accrual posted Dr expense / Cr accrued liability at the stated amount");

  // 2 · THE CORRECTION, LANDING BETWEEN THE POSTING AND THE REVERSAL. This is the whole scene:
  //     the plan's LIVE revision now states a DIFFERENT amount from the one on the books.
  const corrected = await correctAccrualAdjustment(BOB(), {
    accrualId: base.accrual_id,
    accrual: { ...base.particulars, amount_cents: CORRECTED },
    opKey: opk("p1074-correct"),
  });
  assert.equal((await getAccrualAdjustment(BOB(), corrected.accrual_id)).amount_cents, CORRECTED,
    "the live accrual detail now states the corrected amount");

  // 3 · THE REVERSAL, ADMITTED AFTER THE CORRECTION AND POSTED. It must undo what the occurrence
  //     ACTUALLY POSTED, never what the plan states today.
  const revDue = monthStart(today);
  const revEntry = await catchUpAndPost({
    plan: base.plan_id, client: base.client, due: revDue, leg: "reversal",
  });
  assert.deepEqual(await entryLines(revEntry),
    [[ACHART.expense, 0, POSTED], [ACHART.liability, POSTED, 0]],
    `the reversal undoes the ${POSTED}c that actually posted, not the ${CORRECTED}c the plan now states`);

  // 4 · THE LEDGER'S OWN ANSWER (the ticket's second acceptance criterion), summed over
  //     clara.journal_lines rather than over the two entries above.
  assert.equal(await netOnAccount(base.client, ACHART.liability), 0,
    "the accrual's BALANCE-SHEET leg nets to zero: nothing is stranded");
  assert.equal(await netOnAccount(base.client, ACHART.expense), 0,
    "…and so does its profit-and-loss leg");

  // 5 · AND THE REVERSAL STILL NAMES THE ENTRY IT UNDOES, under the revision it was admitted in.
  const rev = (await occurrenceExtras(base.plan_id)).find((x) => x.leg === "reversal");
  assert.equal(rev.reverses_entry_id, entry, "the reversal occurrence names the entry it undid");
  assert.ok(due < revDue, "the reversal falls after the accrual it undoes");
});
