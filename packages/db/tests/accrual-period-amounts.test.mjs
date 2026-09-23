// #937 (riders wave 4, lane 03) — AN ACCRUAL WITH A PERSON-STATED AMOUNT PER PERIOD.
//
// The claims this battery exists to prove, every one through a REAL door (WORK-ORDER rule 10):
//
//   1. THE RELATION AND ITS RESOLVER. Configuring an accrual under the `stated_period_amount` rule
//      records ONE clara.accrual_period_amounts row per scheduled due date, keyed on the accrual
//      DETAIL and the due date, and nothing else moves.
//   2. EACH DUE DATE POSTS ITS OWN AMOUNT. Two periods post two DIFFERENT amounts and two matching
//      reversals; the plan revision's frozen constant is never used as a fallback.
//   3. A MISSING PERIOD IS A TYPED REFUSAL ON THE OCCURRENCE. A due date the stated set does not
//      cover records `accrual_period_amount_missing` and posts nothing — exactly as prepayment
//      amortisation records `amortisation_period_line_missing`.
//   4. THE DOOR'S OWN ARITHMETIC WALLS. The stated amounts sum EXACTLY to the accrual's total; a
//      due date that is not a schedule date is refused; a scheduled date nobody stated is refused;
//      an equal split whose odd cent sits anywhere but the FINAL period is refused.
//   5. `stated_amount` IS UNCHANGED. It writes no period-amount row and posts its constant.
//
// CONTRACT-BLIND-ADJACENT: built against #937's own body (the acceptance criteria) and the shapes
// 0222/0223 already ship, not against any implementation file. FRONTIER-GATED on the
// `accrual_period_amounts$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  CLR, assertPair,
  freshAccrualClient, accrual, createAccrualAdjustment, postPlanWork, requestPlanCatchUp,
  reviseAccountingPlan, occurrenceRows, instructionRef, todayInPlanZone, shiftMonths,
  accrualCount, getAccrualAdjustment, ACHART, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import { correctAccrualAdjustment } from "./accrual-correction-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

const STEM = "accrual_period_amounts$";

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

async function gate937(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_PERIOD_AMOUNTS !== "1") {
    assert.fail(
      `#937 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/accrual-period-amounts-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#937 per-period accrual amounts lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("accrual-period-amounts");
  printSkipCount("accrual-period-amounts");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const FIRM_A = () => world.firms.A;

const monthStart = (day) => `${day.slice(0, 7)}-01`;
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/** The SAME window shape accrual-adjustments.test.mjs's own `span()` uses — `monthsBack` months,
 *  ending at the month end `monthsBack - 1` months ago, so every due date is in the past on EVERY
 *  calendar day the battery runs (a skipped battery is not evidence). */
async function span(monthsBack) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** Every `last_day_of_month` due date inside a window, oldest first — the dates the schedule
 *  itself will produce, computed in Postgres rather than re-derived in JS. */
async function monthEndsBetween(from, to) {
  const r = await rootQuery(
    `select ((date_trunc('month', d) + interval '1 month' - interval '1 day')::date)::text as due
       from generate_series($1::date, $2::date, interval '1 month') d
      order by 1`, [from, to]);
  return r.rows.map((x) => x.due).filter((d) => d >= from && d <= to);
}

// ── readers (corroboration only; every SUBJECT below is exercised through a door) ─────────────

async function periodAmountRows(accrualId) {
  const r = await rootQuery(
    `select id, firm_id, client_id, accrual_id, due_date::text as due_date, amount_cents,
            currency, recorded_by, created_at
       from clara.accrual_period_amounts where accrual_id = $1 order by due_date`, [accrualId]);
  return r.rows;
}

async function entryLines(entryId) {
  const r = await rootQuery(
    `select account_code, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents,
            description
       from clara.journal_lines where entry_id = $1 order by line_no`, [entryId]);
  return r.rows;
}

/** The particulars for a per-period accrual: the total, and one stated amount per due date. */
function perPeriod({ dues, amounts, start, end, expenseAccount = ACHART.expense }) {
  return accrual({
    expenseAccount,
    cents: amounts.reduce((a, b) => a + b, 0),
    servicePeriodStart: start,
    servicePeriodEnd: end,
    method: { rule: "stated_period_amount" },
    periodAmounts: dues.map((due, i) => ({ due_date: due, amount_cents: amounts[i] })),
  });
}

// ===========================================================================================
// p937.record — THE RELATION: ONE ROW PER DUE DATE, KEYED ON THE ACCRUAL DETAIL.
// ===========================================================================================

test("p937.record — a stated_period_amount accrual records one period amount per scheduled due date, keyed on the accrual detail and the due date", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937rec");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  assert.equal(dues.length, 2, "the rig window must hold exactly two month-end due dates");

  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
    opKey: opk("p937-rec"),
  });

  const rows = await periodAmountRows(created.accrual_id);
  assert.deepEqual(rows.map((r) => [r.due_date, Number(r.amount_cents)]),
    [[dues[0], 300000], [dues[1], 350000]],
    "each due date carries the amount the accountant stated for it, and only that");
  assert.ok(rows.every((r) => r.client_id === client && r.firm_id === FIRM_A()),
    "every row is filed to the accrual's own firm and client");
  assert.ok(rows.every((r) => r.currency === "MYR"), "and to the one currency the estate posts in");
  assert.equal(await accrualCount(client), 1, "one accrual detail, not two");
});

// ===========================================================================================
// p937.posts — EACH DUE DATE POSTS ITS OWN AMOUNT, AND SO DOES ITS REVERSAL.
// ===========================================================================================

/** Admit one named due event through the EXISTING human catch-up door and post it. Returns the
 *  entry id the run committed. */
async function catchUpAndPost({ plan, client, due, leg }) {
  const answer = await requestPlanCatchUp(BOB(), { plan, from: due, to: due, opKey: opk("p937-catch") });
  assert.ok(answer.admitted >= 1,
    `the catch-up admitted nothing for ${leg} ${due}: ${JSON.stringify(answer.events)}`);
  const row = (await occurrenceRows(plan)).find((o) => o.leg === leg && o.due_date === due);
  assert.ok(row?.work_id, `no admitted ${leg} occurrence for ${due}`);
  return postPlanWork({ work: row.work_id, client, author: BOB(), firm: FIRM_A() });
}

test("p937.posts — two periods post two DIFFERENT stated amounts, each reversal undoes its own period's amount, and the revision's frozen constant is never posted", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937post");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  assert.equal(dues.length, 2);
  const AMOUNTS = { [dues[0]]: 300000, [dues[1]]: 350000 };

  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [AMOUNTS[dues[0]], AMOUNTS[dues[1]]], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
    opKey: opk("p937-post"),
  });
  // The configuration admits the LATEST due event at or before today (0193's own picker).
  assert.equal(created.occurrence?.due_date, dues[1]);
  const posted = {};
  posted[dues[1]] = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  posted[dues[0]] = await catchUpAndPost({ plan: created.plan_id, client, due: dues[0], leg: "primary" });

  // THE TWO ACCRUAL LEGS: each period's OWN amount, on the accrual's own two accounts.
  for (const due of dues) {
    const lines = await entryLines(posted[due]);
    assert.deepEqual(
      lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [[ACHART.expense, AMOUNTS[due], 0], [ACHART.liability, 0, AMOUNTS[due]]],
      `the ${due} entry posts the amount stated for THAT period`);
    assert.equal(lines[0].description, `the accrual period ending ${due}`,
      "…and the line names the period it is for, rather than the whole term");
  }
  assert.notEqual(AMOUNTS[dues[0]], AMOUNTS[dues[1]],
    "the two periods really do differ — otherwise this cell would pass on a constant");
  // THE TOTAL IS NEVER POSTED. 650000 is the accrual's own amount_cents under this rule, and it
  // is exactly what the frozen basis would have posted for every period before this lane.
  const total = AMOUNTS[dues[0]] + AMOUNTS[dues[1]];
  for (const due of dues) {
    const lines = await entryLines(posted[due]);
    assert.notEqual(Number(lines[0].debit_cents), total,
      "the revision's frozen constant (the TOTAL) is never used as a fallback");
  }

  // THE TWO REVERSALS: the same two amounts, sides exchanged, each naming the entry it undoes.
  const reversalOf = async (due) => {
    const r = await rootQuery(
      "select (date_trunc('month', $1::date) + interval '1 month')::date::text as d", [due]);
    return r.rows[0].d;
  };
  for (const due of dues) {
    const revDue = await reversalOf(due);
    const entry = await catchUpAndPost({
      plan: created.plan_id, client, due: revDue, leg: "reversal",
    });
    const lines = await entryLines(entry);
    assert.deepEqual(
      lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [[ACHART.expense, 0, AMOUNTS[due]], [ACHART.liability, AMOUNTS[due], 0]],
      `the reversal due ${revDue} undoes the amount its OWN period (${due}) posted`);
  }
});

// ===========================================================================================
// p937.missing — A DUE DATE NOBODY STATED POSTS NOTHING AND SAYS SO ON THE OCCURRENCE.
// ===========================================================================================

test("p937.missing — a due date the stated set does not cover records the typed accrual_period_amount_missing refusal on its own occurrence, admits no Work and posts nothing", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937miss");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(3);
  const dues = await monthEndsBetween(s.from, s.to);
  assert.equal(dues.length, 2);

  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
    opKey: opk("p937-miss"),
  });

  // THE AUTHORITY WINDOW IS WIDENED BY THE EXISTING PLAN-LANE DOOR — the one real path to a due
  // date that appears AFTER the accrual was configured, and the one the door's own completeness
  // wall cannot see. The accrual's stated term is widened with it, because the window must stay
  // bracketed by the term (0222's SIXTH MEASUREMENT).
  const widened = await monthEndBack(1);
  await reviseAccountingPlan(BOB(), {
    plan: created.plan_id, frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: s.from, effectiveTo: widened,
    basis: {
      posting_date: dues[1], memo: "937 rig widened accrual", currency: "MYR",
      lines: [
        { account_code: ACHART.expense, debit_cents: 650000, credit_cents: 0 },
        { account_code: ACHART.liability, debit_cents: 0, credit_cents: 650000 },
      ],
    },
    reversalDayRule: "next_period_first_day", opKey: opk("p937-widen"),
  });

  const answer = await requestPlanCatchUp(BOB(), {
    plan: created.plan_id, from: widened, to: widened, opKey: opk("p937-miss-catch"),
  });
  assert.equal(answer.admitted, 0, "nothing is admitted for a period nobody stated an amount for");
  const event = answer.events.find((e) => e.due_date === widened && e.leg === "primary");
  assert.ok(event, `no event for ${widened}: ${JSON.stringify(answer.events)}`);
  assert.equal(event.reason, "accrual_period_amount_missing",
    "the refusal names THIS lane, not the amortisation lane's own missing-line reason");
  assert.equal(event.code, "CLR10");

  const row = (await occurrenceRows(created.plan_id))
    .find((o) => o.leg === "primary" && o.due_date === widened);
  assert.ok(row, "the occurrence row exists — the refusal is legible in the plan's own history");
  assert.equal(row.work_id, null, "no Work was admitted");
  assert.equal(row.outcome?.state, "refused");
  assert.equal(row.outcome?.reason, "accrual_period_amount_missing");
  assert.equal(row.outcome?.code, "CLR10");
  assert.equal(row.outcome?.due_date, widened);

  // AND NOTHING POSTED. The frozen basis carries 650000 (the accrual's total); if the constant
  // were ever a fallback, this is where it would appear on the books.
  const n = await rootQuery(
    `select count(*)::int as n from clara.journal_entries e
      where e.client_id = $1 and e.posting_date = $2::date`, [client, widened]);
  assert.equal(n.rows[0].n, 0, "no entry exists for the unstated period");
});

// ===========================================================================================
// p937.walls — WHAT THE DOOR REFUSES, EACH BY ITS OWN NAME.
// ===========================================================================================

test("p937.walls — the door refuses an unscheduled date, an uncovered period, a duplicate, a malformed element, a set that does not sum to the total, and a misplaced remainder — and records nothing", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937wall");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  const send = (a) => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: a,
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-wall"),
  });

  // NOT A DUE DATE OF THIS SCHEDULE. The 15th is inside the window and is not a month end.
  const mid = `${dues[0].slice(0, 7)}-15`;
  await assertPair(CLR.badRequest, "accrual_period_amount_not_scheduled",
    () => send(perPeriod({ dues: [mid, dues[1]], amounts: [300000, 350000], start: s.from, end: s.to })),
    "a date the schedule never produces");

  // A PERIOD NOBODY STATED, refused at the door as well as at the occurrence.
  const incomplete = await assertPair(CLR.badRequest, "accrual_period_amount_missing",
    () => send(perPeriod({ dues: [dues[0]], amounts: [650000], start: s.from, end: s.to })),
    "a schedule date the stated set does not cover");
  assert.equal(incomplete.detail.due_date, dues[1], "…and it names the FIRST period it is missing");

  // TWO STATEMENTS FOR ONE DATE.
  await assertPair(CLR.badRequest, "accrual_period_amount_duplicate",
    () => send(perPeriod({ dues: [dues[0], dues[0]], amounts: [300000, 350000], start: s.from, end: s.to })),
    "two stated amounts naming one due date");

  // SHAPE: a fractional amount is not minor units.
  await assertPair(CLR.badRequest, "accrual_period_amount_invalid",
    () => send(perPeriod({ dues, amounts: [300000.5, 349999.5], start: s.from, end: s.to })),
    "an amount that is not an integer number of minor units");

  // THE EXACT-SUM RULE.
  const unbalanced = await assertPair(CLR.badRequest, "accrual_period_amounts_unbalanced",
    () => send(accrual({
      cents: 700000, servicePeriodStart: s.from, servicePeriodEnd: s.to,
      method: { rule: "stated_period_amount" },
      periodAmounts: [
        { due_date: dues[0], amount_cents: 300000 },
        { due_date: dues[1], amount_cents: 350000 }],
    })),
    "stated amounts that do not sum to the accrual's own total");
  assert.equal(Number(unbalanced.detail.total_cents), 700000);
  assert.equal(Number(unbalanced.detail.stated_cents), 650000);
  assert.equal(Number(unbalanced.detail.difference_cents), -50000);

  // THE FINAL-PERIOD REMAINDER, over exactly the shape it governs: an equal split of 100001 over
  // two periods is 50000 + 50000 with one cent over, and that cent belongs to the LAST period.
  const misplaced = await assertPair(CLR.badRequest, "accrual_period_remainder_misplaced",
    () => send(accrual({
      cents: 100001, servicePeriodStart: s.from, servicePeriodEnd: s.to,
      method: { rule: "stated_period_amount" },
      periodAmounts: [
        { due_date: dues[0], amount_cents: 50001 },
        { due_date: dues[1], amount_cents: 50000 }],
    })),
    "an even split whose odd cent sits in the first period");
  assert.equal(Number(misplaced.detail.remainder_cents), 1);
  assert.equal(misplaced.detail.remainder_placement, "final_period");
  assert.equal(misplaced.detail.final_due_date, dues[1]);

  assert.equal(await accrualCount(client), 0, "…and not one of the six refusals recorded anything");

  // THE SAME SPLIT WITH THE REMAINDER IN THE FINAL PERIOD IS ACCEPTED.
  const ok = await send(accrual({
    cents: 100001, servicePeriodStart: s.from, servicePeriodEnd: s.to,
    method: { rule: "stated_period_amount" },
    periodAmounts: [
      { due_date: dues[0], amount_cents: 50000 },
      { due_date: dues[1], amount_cents: 50001 }],
  }));
  assert.ok(ok.accrual_id, "the accrual is recorded");
  assert.deepEqual((await periodAmountRows(ok.accrual_id)).map((r) => Number(r.amount_cents)),
    [50000, 50001]);
});

test("p937.walls.uneven — the remainder rule governs an EVEN split alone: a genuinely uneven set that leaves a cent over is accepted, because the convention says where a division's leftover goes, not what a person may state", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937uneven");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  // 100001 over two periods: base 50000, one cent over — but NEITHER stated amount is the base,
  // so this is not the shape the convention governs.
  const ok = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({
      cents: 100001, servicePeriodStart: s.from, servicePeriodEnd: s.to,
      method: { rule: "stated_period_amount" },
      periodAmounts: [
        { due_date: dues[0], amount_cents: 40001 },
        { due_date: dues[1], amount_cents: 60000 }],
    }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-uneven"),
  });
  assert.deepEqual((await periodAmountRows(ok.accrual_id)).map((r) => Number(r.amount_cents)),
    [40001, 60000]);
});

// ===========================================================================================
// p937.methods — THE CLOSED SET AND THE TABLE CHECK NOW HOLD TWO RULES, AND ONLY TWO.
// ===========================================================================================

test("p937.methods — stated_period_amount is a supported rule and the two withdrawn rules are still refused by name, with the refusal listing exactly what is honoured", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937meth");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  for (const rule of ["source_document_amount", "prior_period_amount"]) {
    const refused = await assertPair(CLR.badRequest, "accrual_method_unsupported",
      () => createAccrualAdjustment(BOB(), {
        client, authorityRef: ref,
        accrual: accrual({ method: { rule }, servicePeriodStart: s.from, servicePeriodEnd: s.to }),
        frequency: "monthly", dayRule: "last_day_of_month",
        effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-meth"),
      }),
      `the withdrawn selection rule ${rule} (owner ruling 2026-09-18)`);
    assert.deepEqual(refused.detail.supported, ["stated_amount", "stated_period_amount"],
      "the refusal LISTS what is honoured — the two rules the ledger actually performs");
  }
  // …AND PER-PERIOD AMOUNTS BELONG TO THE RULE THAT PERFORMS THEM.
  await assertPair(CLR.badRequest, "accrual_period_amounts_unexpected",
    () => createAccrualAdjustment(BOB(), {
      client, authorityRef: ref,
      accrual: accrual({
        cents: 650000, servicePeriodStart: s.from, servicePeriodEnd: s.to,
        periodAmounts: [{ due_date: dues[0], amount_cents: 650000 }],
      }),
      frequency: "monthly", dayRule: "last_day_of_month",
      effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-meth-x"),
    }),
    "per-period amounts sent under the stated_amount rule");
  assert.equal(await accrualCount(client), 0);
});

// ===========================================================================================
// p937.stated_amount — THE EXISTING RULE IS UNCHANGED.
// ===========================================================================================

test("p937.stated_amount — a stated_amount accrual writes no period-amount row and every period still posts its one constant", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937const");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ cents: 120000, servicePeriodStart: s.from, servicePeriodEnd: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-const"),
  });
  assert.deepEqual(await periodAmountRows(created.accrual_id), [],
    "a constant accrual states no period amounts, so none are recorded");
  const first = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  const second = await catchUpAndPost({ plan: created.plan_id, client, due: dues[0], leg: "primary" });
  for (const entry of [first, second]) {
    const lines = await entryLines(entry);
    assert.deepEqual(
      lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [[ACHART.expense, 120000, 0], [ACHART.liability, 0, 120000]],
      "every period posts the ONE stated amount, from the revision's frozen basis");
    assert.equal(lines[0].description,
      `one period of the accrual term ${s.from} to ${s.to}`,
      "…and 0222's own line wording is untouched");
  }
});

// ===========================================================================================
// p937.append_only — A STATED PERIOD AMOUNT IS NOT EDITED.
// ===========================================================================================

test("p937.append_only — clara.accrual_period_amounts admits no UPDATE and no DELETE, even to the owner every migration runs as", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937append");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-append"),
  });
  for (const sql of [
    "update clara.accrual_period_amounts set amount_cents = 1 where accrual_id = $1",
    "delete from clara.accrual_period_amounts where accrual_id = $1",
  ]) {
    await assert.rejects(() => rootQuery(sql, [created.accrual_id]),
      (e) => e.code === CLR.immutable && JSON.parse(e.detail).reason === "append_only",
      `append-only refuses: ${sql}`);
  }
  assert.equal((await periodAmountRows(created.accrual_id)).length, 2, "both rows survive");
});

// ===========================================================================================
// p937.correction — AN AMOUNT CHANGE IS A CORRECTION, AND IT CARRIES ITS OWN PERIODS.
// ===========================================================================================

test("p937.correction — correcting a per-period accrual writes the SUCCESSOR detail's own period amounts, leaves the superseded row's untouched, and the next due date posts the corrected figure", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937corr");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);

  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-corr"),
  });

  const corrected = await correctAccrualAdjustment(BOB(), {
    accrualId: created.accrual_id,
    accrual: perPeriod({ dues, amounts: [280000, 400000], start: s.from, end: s.to }),
    opKey: opk("p937-corr-fix"),
  });
  assert.equal(corrected.corrects_accrual_id, created.accrual_id);

  assert.deepEqual((await periodAmountRows(created.accrual_id)).map((r) => Number(r.amount_cents)),
    [300000, 350000],
    "the SUPERSEDED detail keeps the amounts it actually ran under — that is the lineage");
  assert.deepEqual((await periodAmountRows(corrected.accrual_id)).map((r) => Number(r.amount_cents)),
    [280000, 400000], "and the successor carries its own");

  // THE NEXT DUE DATE POSTS THE CORRECTED FIGURE. `dues[0]` was never admitted (the configuration
  // admitted the LATEST due event), so it is exactly "what has not yet come due".
  const entry = await catchUpAndPost({ plan: created.plan_id, client, due: dues[0], leg: "primary" });
  const lines = await entryLines(entry);
  assert.deepEqual(
    lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [[ACHART.expense, 280000, 0], [ACHART.liability, 0, 280000]],
    "the corrected period amount is what posts, resolved off the LIVE (highest-revision) detail");
});

test("p937.op_key — two different per-period sets under ONE op key are a typed conflict, not a replay", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937key");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  const key = opk("p937-onekey");
  const send = (amounts) => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts, start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: key,
  });

  const first = await send([300000, 350000]);
  // THE SAME SET REPLAYS — the reservation answers with the decision already taken.
  const replay = await send([300000, 350000]);
  assert.equal(replay.accrual_id, first.accrual_id, "the same decision replays");
  // A DIFFERENT SET UNDER THE SAME KEY IS A CONFLICT. Before clara._accrual_canonical saw the
  // per-period amounts, this branch was a REPLAY: the second caller was told their figures had
  // been recorded when the first caller's had.
  await assertPair(CLR.badRequest, "op_key_conflict",
    () => send([250000, 400000]),
    "one key, two different per-period sets");
  assert.equal(await accrualCount(client), 1, "and exactly one accrual exists");
});

// ===========================================================================================
// p937.resolver — NULL IS A REAL ANSWER, AND NO APPLICATION ROLE CAN ASK.
// ===========================================================================================

test("p937.resolver — clara._plan_accrual_period_line answers NULL for a date nobody stated, for a constant accrual and for a plan with no accrual at all; it is STABLE and reachable by no application role", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937res");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);

  const perPeriodAccrual = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-res-a"),
  });
  const constantAccrual = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ cents: 120000, servicePeriodStart: s.from, servicePeriodEnd: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-res-b"),
  });

  const ask = async (plan, due) => {
    const r = await rootQuery(
      "select clara._plan_accrual_period_line($1::uuid, $2::date) as line", [plan, due]);
    return r.rows[0].line;
  };

  const line = await ask(perPeriodAccrual.plan_id, dues[0]);
  assert.equal(Number(line.amount_cents), 300000, "a stated period resolves to its own amount");
  assert.deepEqual(line.lines.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [[ACHART.expense, 300000, 0], [ACHART.liability, 0, 300000]]);

  assert.equal(await ask(perPeriodAccrual.plan_id, `${dues[0].slice(0, 7)}-15`), null,
    "a date nobody stated is NULL — a real answer, refused by name at admission");
  assert.equal(await ask(constantAccrual.plan_id, dues[0]), null,
    "a stated_amount accrual has no per-period line at all");
  assert.equal(await ask(perPeriodAccrual.accrual_id, dues[0]), null,
    "and a uuid naming no plan resolves to nothing rather than raising");

  // THE CATALOG HALF (AC1: STABLE, ungranted). The tail of 0303 asserts it at apply time; this
  // re-asks it against the database the battery actually ran on.
  const meta = await rootQuery(
    `select p.provolatile::text as vol, p.prosecdef as definer,
            has_function_privilege('public', p.oid, 'execute') as pub,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as human,
            has_function_privilege('clara_runtime', p.oid, 'execute') as runtime
       from pg_proc p
      where p.oid = 'clara._plan_accrual_period_line(uuid,date)'::regprocedure`);
  assert.deepEqual(meta.rows[0], { vol: "s", definer: true, pub: false, human: false, runtime: false },
    "STABLE, SECURITY DEFINER, and reachable by no application role");
});

// ===========================================================================================
// p937.read — THE DETAIL READ ANSWERS WITH WHAT WILL POST FOR EACH PERIOD.
// ===========================================================================================

test("p937.read — clara.get_accrual_adjustment returns period_amounts for a per-period accrual and an empty array for a constant one, under the least-privileged human who may see it", async (t) => {
  if (await gate937(t)) return;
  const client = await freshAccrualClient(ALICE(), "p937read");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);

  const perPeriodAccrual = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: perPeriod({ dues, amounts: [300000, 350000], start: s.from, end: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-read-a"),
  });
  const constantAccrual = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ cents: 120000, servicePeriodStart: s.from, servicePeriodEnd: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p937-read-b"),
  });

  const detail = await getAccrualAdjustment(BOB(), perPeriodAccrual.accrual_id);
  assert.deepEqual(detail.period_amounts,
    [{ due_date: dues[0], amount_cents: 300000 }, { due_date: dues[1], amount_cents: 350000 }],
    "the read answers with the figure each due date will post, oldest first");
  assert.equal(detail.method.rule, "stated_period_amount");

  const flat = await getAccrualAdjustment(BOB(), constantAccrual.accrual_id);
  assert.deepEqual(flat.period_amounts, [],
    "a stated_amount accrual answers with an EMPTY array rather than null — the key always exists");
});
