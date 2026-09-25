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
  occurrenceExtras, instructionRef, workRow, todayInPlanZone, shiftMonths, ACHART, ACCRUAL_TZ,
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

/** A window wholly in the past that ENDS at LAST month's month end and starts `monthsBack` months
 *  ago, so it holds exactly `monthsBack` month-end due dates and every one of them is due on EVERY
 *  calendar day this battery runs. The plan admits the LATEST accrual at or before today at
 *  configuration time (0193's picker), which is therefore last month's month end, and that
 *  accrual's reversal falls on the first day of THIS month. */
async function span(monthsBack = 2) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(1),
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

// ===========================================================================================
// p1074.revenue — THE SAME ON THE OTHER SIDE (#942). The ticket's third acceptance criterion.
// ===========================================================================================

test("p1074.revenue.reverses_what_posted — the same correction-between-posting-and-reversal sequence on a REVENUE accrual reverses the posted figure, and the accrued-income asset nets to zero", async (t) => {
  if (await gate1074(t)) return;
  const POSTED = 300000;
  const CORRECTED = 275000;

  const r = await configureRevenue({ tag: "revenue", cents: POSTED });
  assert.equal(r.occurrence?.leg, "primary", "the configuration admitted the accrual leg");

  const entry = await postPlanWork({
    work: r.occurrence.work_id, client: r.client, author: BOB(), firm: FIRM_A(),
  });
  assert.deepEqual(await entryLines(entry),
    [[RCHART.asset, POSTED, 0], [RCHART.income, 0, POSTED]],
    "the revenue accrual posted Dr accrued income / Cr revenue — the mirror of the expense side");

  await correctAccrualAdjustment(BOB(), {
    accrualId: r.accrual_id,
    accrual: { ...r.particulars, amount_cents: CORRECTED },
    opKey: opk("p1074-correct-rev"),
  });

  const revEntry = await catchUpAndPost({
    plan: r.plan_id, client: r.client, due: monthStart(today), leg: "reversal",
  });
  assert.deepEqual(await entryLines(revEntry),
    [[RCHART.asset, 0, POSTED], [RCHART.income, POSTED, 0]],
    `the reversal undoes the ${POSTED}c that actually posted, sides exchanged, not the ${CORRECTED}c now stated`);

  assert.equal(await netOnAccount(r.client, RCHART.asset), 0,
    "the revenue accrual's BALANCE-SHEET leg (accrued income) nets to zero");
  assert.equal(await netOnAccount(r.client, RCHART.income), 0,
    "…and so does the revenue account");
});

// ===========================================================================================
// p1074.per_period — THE SAME UNDER THE OTHER CALCULATION RULE (#937).
//
// A `stated_period_amount` accrual's figure does NOT live on the plan revision at all: it lives in
// `clara.accrual_period_amounts`, keyed to the accrual detail, and `clara._plan_accrual_period_line`
// reads the HIGHEST revision of that detail — which a correction also supersedes. So the same
// defect reached this rule by a second route, and the posted-entry override closes both with one
// mechanism.
// ===========================================================================================

/** The month-end due dates a monthly last_day_of_month schedule produces inside a window — the
 *  dates the schedule itself will produce, computed in Postgres rather than re-derived in JS. */
async function monthEndsBetween(from, to) {
  const r = await rootQuery(
    `select ((date_trunc('month', d) + interval '1 month' - interval '1 day')::date)::text as due
       from generate_series($1::date, $2::date, interval '1 month') d
      order by 1`, [from, to]);
  return r.rows.map((x) => x.due).filter((d) => d >= from && d <= to);
}

test("p1074.per_period.reverses_what_posted — a stated_period_amount accrual whose PERIOD amounts a correction restates still reverses the amount that period posted", async (t) => {
  if (await gate1074(t)) return;

  const client = await freshAccrualClient(ALICE(), "p1074-perperiod");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  assert.equal(dues.length, 2, "the rig window must hold exactly two month-end due dates");

  // The FIRST period is stated at 100,000c and the SECOND — the one the configuration admits, and
  // therefore the one that posts — at 200,000c.
  const POSTED = 200000;
  const particulars = accrual({
    cents: 100000 + POSTED,
    servicePeriodStart: s.from, servicePeriodEnd: s.to,
    method: { rule: "stated_period_amount" },
    periodAmounts: [
      { due_date: dues[0], amount_cents: 100000 },
      { due_date: dues[1], amount_cents: POSTED },
    ],
  });
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: s.from, effectiveTo: s.to,
  });
  assert.equal(created.occurrence?.due_date, dues[1],
    "the configuration admitted the LATEST due date at or before today");

  const entry = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  assert.deepEqual(await entryLines(entry),
    [[ACHART.expense, POSTED, 0], [ACHART.liability, 0, POSTED]],
    "the period posted ITS OWN stated amount, never the accrual's total");

  // THE CORRECTION RESTATES BOTH PERIODS — including the one already on the books.
  await correctAccrualAdjustment(BOB(), {
    accrualId: created.accrual_id,
    accrual: {
      ...particulars,
      amount_cents: 140000 + 160000,
      period_amounts: [
        { due_date: dues[0], amount_cents: 140000 },
        { due_date: dues[1], amount_cents: 160000 },
      ],
    },
    opKey: opk("p1074-correct-pp"),
  });

  const revEntry = await catchUpAndPost({
    plan: created.plan_id, client, due: monthStart(today), leg: "reversal",
  });
  assert.deepEqual(await entryLines(revEntry),
    [[ACHART.expense, 0, POSTED], [ACHART.liability, POSTED, 0]],
    `the reversal undoes the ${POSTED}c this period posted, not the 160,000c the restated set now names`);

  assert.equal(await netOnAccount(client, ACHART.liability), 0,
    "the balance-sheet leg nets to zero under the per-period rule too");
  assert.equal(await netOnAccount(client, ACHART.expense), 0,
    "…and so does the expense leg");
});

// ===========================================================================================
// p1074.not_posted — THE OUT-OF-SCOPE LINE, DRIVEN.
//
// "Any change to how a correction affects occurrences that have NOT yet posted (those should keep
// reading the live revision)" is the ticket's own out-of-scope line. It is a claim about behaviour,
// so it is driven rather than asserted: the NEXT period's accrual, admitted after the correction,
// must post the CORRECTED figure.
// ===========================================================================================

test("p1074.not_posted.reads_live_revision — an occurrence that has NOT posted still reads the live revision: the next period's accrual, admitted after a correction, posts the CORRECTED figure", async (t) => {
  if (await gate1074(t)) return;
  const FIRST = 300000;
  const CORRECTED = 275000;

  // A THREE-month window, so a LATER due date is still owed after the first one posts.
  const base = await configureExpense({ tag: "notposted", cents: FIRST, monthsBack: 3 });
  const firstDue = base.occurrence?.due_date;
  assert.ok(firstDue, "the configuration admitted a primary leg");
  const dues = await monthEndsBetween(base.span.from, base.span.to);
  assert.equal(dues.length, 3, "the rig window must hold exactly three month-end due dates");
  assert.equal(firstDue, dues[2], "…and the configuration admitted the latest of them");

  await postPlanWork({
    work: base.occurrence.work_id, client: base.client, author: BOB(), firm: FIRM_A(),
  });
  await correctAccrualAdjustment(BOB(), {
    accrualId: base.accrual_id,
    accrual: { ...base.particulars, amount_cents: CORRECTED },
    opKey: opk("p1074-correct-np"),
  });

  // AN EARLIER PERIOD THE SCHEDULE NEVER ADMITTED, caught up AFTER the correction. It has no entry
  // behind it, so it takes no override and posts what the plan states NOW — which is the whole
  // point of a correction and is exactly what this ticket must not disturb.
  const laterEntry = await catchUpAndPost({
    plan: base.plan_id, client: base.client, due: dues[1], leg: "primary",
  });
  assert.deepEqual(await entryLines(laterEntry),
    [[ACHART.expense, CORRECTED, 0], [ACHART.liability, 0, CORRECTED]],
    "a primary that had not posted reads the LIVE revision and posts the corrected figure");
});

// ===========================================================================================
// p1074.basis — THE WHOLE BASIS, NOT ONLY THE LINES.
//
// The fix routes the posted lines through #653's `p_line_override` seam, so every OTHER part of a
// reversal's basis must be exactly what it was: the plan's own memo with the reversed entry
// appended, and the reversal's own posting date. A fix that had replaced the basis wholesale would
// pass every cell above and silently drop both.
// ===========================================================================================

test("p1074.basis.only_the_lines_move — the reversal's admitted basis keeps the plan's memo with the reversed entry appended and the reversal's own posting date; only the LINES come from the posted entry", async (t) => {
  if (await gate1074(t)) return;
  const POSTED = 480000;
  const CORRECTED = 411000;

  const base = await configureExpense({ tag: "basis", cents: POSTED });
  const entry = await postPlanWork({
    work: base.occurrence.work_id, client: base.client, author: BOB(), firm: FIRM_A(),
  });
  await correctAccrualAdjustment(BOB(), {
    accrualId: base.accrual_id,
    accrual: { ...base.particulars, amount_cents: CORRECTED },
    opKey: opk("p1074-correct-basis"),
  });

  const revDue = monthStart(today);
  const opened = await requestPlanCatchUp(BOB(), {
    plan: base.plan_id, from: revDue, to: revDue, opKey: opk("p1074-catch-basis"),
  });
  assert.equal(opened.admitted, 1, "the reversal is admitted once its accrual is on the books");
  const rev = (await occurrenceRows(base.plan_id)).find((o) => o.leg === "reversal");
  const w = await workRow(rev.work_id);

  // THE LINES: the posted entry's, with the sides exchanged by the one IMMUTABLE basis body.
  assert.deepEqual(w.basis.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [[ACHART.expense, 0, POSTED], [ACHART.liability, POSTED, 0]],
    "the admitted basis reverses the posted lines");
  // THE MEMO: the plan's own, with the reversed entry appended — 0193's own rule, unmoved.
  assert.ok(w.basis.memo.includes(entry),
    `the basis names the entry it reverses (memo=${JSON.stringify(w.basis.memo)})`);
  assert.ok(w.basis.memo.startsWith(base.particulars.memo),
    "…appended to the plan's own memo, never replacing it");
  // THE POSTING DATE: the reversal's own due date, not the accrual's.
  assert.equal(w.basis.posting_date, revDue, "the basis posts on the reversal's own due date");
  assert.equal(w.basis.currency, "MYR", "and the rest of the basis is the revision's own");
  // AND NOTHING THE OVERRIDE CARRIES LEAKED INTO THE BASIS: `source` and `entry_id` are the
  // resolver's own bookkeeping and belong to no journal basis.
  assert.deepEqual(Object.keys(w.basis).sort(), ["currency", "lines", "memo", "posting_date"],
    "the basis carries exactly the keys a journal basis carries");
});

// ===========================================================================================
// p1074.catalog — THE STRUCTURAL STANDARD FOR AN UNGRANTED INTERNAL.
//
// `clara._plan_posted_entry_lines` has no public interface of its own: it is reachable by no
// application role, on purpose, because it reads every client's `clara.journal_lines` under a
// SECURITY DEFINER. "There is exactly ONE body that decides what a reversal reverses" is therefore
// a claim only a census can carry, which is the repo's own documented standard for this shape
// (WORK-ORDER rule 4's structural-cell clause).
// ===========================================================================================

test("p1074.catalog.one_resolver — the posted-entry resolver is a STABLE, definer, owner-only internal reachable by no application role, it is called by exactly the admission core, and the basis seam it feeds is still IMMUTABLE", async (t) => {
  if (await gate1074(t)) return;

  const posture = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as path_pinned,
            (select count(*)::int from unnest(coalesce(p.proacl,'{}'::aclitem[])) a
              where a::text not like 'clara_fn_owner=%') as foreign_grants,
            has_function_privilege('public', p.oid, 'execute') as pub,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as human,
            has_function_privilege('clara_runtime', p.oid, 'execute') as runtime,
            has_function_privilege('clara_agent_ro', p.oid, 'execute') as agent
       from pg_proc p where p.oid = 'clara._plan_posted_entry_lines(uuid)'::regprocedure`);
  assert.equal(posture.rows.length, 1, "the resolver exists");
  const q = posture.rows[0];
  assert.equal(q.provolatile, "s", "STABLE: it reads a table, which is why the basis body cannot");
  assert.equal(q.prosecdef, true, "SECURITY DEFINER");
  assert.equal(q.owner, "clara_fn_owner", "owned by clara_fn_owner");
  assert.equal(q.path_pinned, true, "search_path pinned to clara, pg_temp");
  assert.equal(q.foreign_grants, 0, "no grant beyond the owner's own");
  assert.deepEqual([q.pub, q.human, q.runtime, q.agent], [false, false, false, false],
    "reachable by NO application role");

  // THE CENSUS. `order by p.proname` is the catalog's own C ordering (`proname` is `name`, which
  // never takes a database collation), so the comparison is collation-proof by construction.
  const callers = await rootQuery(
    `select coalesce(string_agg(p.proname, ', ' order by p.proname), '') as names
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and position('clara._plan_posted_entry_lines(' in p.prosrc) > 0`);
  assert.equal(callers.rows[0].names, "_plan_admit_occurrence",
    "exactly ONE body reaches the resolver: the one that turns a due date into a Work");

  // THE RESOLVER ANSWERS FROM THE LEDGER AND NOTHING ELSE. A resolver that reached a revision, an
  // accrual detail or a schedule would be re-deriving what the plan STATES, which is the very
  // thing this ticket exists to stop a reversal doing.
  const src = await rootQuery(
    "select p.prosrc from pg_proc p where p.oid = 'clara._plan_posted_entry_lines(uuid)'::regprocedure");
  for (const forbidden of ["accounting_plan_revisions", "accrual_adjustments",
    "accrual_period_amounts", "prepayment_schedules", "revenue_recognition_schedules", "now("]) {
    assert.equal(src.rows[0].prosrc.includes(forbidden), false,
      `the resolver must not read ${forbidden}: it answers from clara.journal_lines alone`);
  }

  // AND THE SEAM IT FEEDS IS STILL IMMUTABLE — the whole reason the lines arrive as an argument.
  const seam = await rootQuery(
    `select p.provolatile from pg_proc p
      where p.oid = 'clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)'::regprocedure`);
  assert.equal(seam.rows[0].provolatile, "i",
    "clara._plan_occurrence_basis is still IMMUTABLE: the override ARRIVES rather than being looked up");
});
