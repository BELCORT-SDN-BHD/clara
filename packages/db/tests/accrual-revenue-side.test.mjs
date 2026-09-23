// #942 (riders wave 4, lane 03) — THE ACCRUAL LANE GAINS A REVENUE SIDE.
//
// The claims this battery exists to prove, every one through a REAL door (WORK-ORDER rule 10):
//
//   1. THE DETAIL CARRIES A SIDE. An accrual is configured `expense` (the default every existing
//      row and every existing caller gets) or `revenue`, the reads answer it, and the account
//      pair is judged BY that side: expense + non-control liability, or income + non-control
//      asset, with the SAME typed refusal reasons the expense side already raises.
//   2. A REVENUE ACCRUAL POSTS THE MIRROR ENTRY. Dr accrued income (asset) / Cr the revenue
//      account on the due date, and the schedule's own reversal undoes exactly that on the first
//      day of the following month — so an invoice issued afterwards leaves ONE live revenue
//      amount for the period.
//   3. THE SIDE IS PART OF THE ACCRUAL'S IDENTITY. The correction path carries it and refuses to
//      flip it; the per-period stated amounts (#937) post on both sides.
//   4. THE "A DOCUMENT ARRIVED INSIDE AN ACCRUED PERIOD" READ HAS A REVENUE ARM. An issued
//      invoice or receipt posting to the accrual's revenue account inside a posted, un-reversed
//      period surfaces with the same two remedies, and the row NAMES the side.
//
// CONTRACT-BLIND-ADJACENT: built against #942's own body, its 2026-09-20 owner ruling and the
// shapes 0222/0284/0302/0303 already ship — never against an implementation file.
// FRONTIER-GATED on the `accrual_revenue_side$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  freshAccrualClient, accrual, createAccrualAdjustment, getAccrualAdjustment,
  listAccrualAdjustments, postPlanWork, requestPlanCatchUp, occurrenceRows, instructionRef,
  CLR, assertPair, humanQuery, namedCall,
  todayInPlanZone, shiftMonths, ACHART, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import {
  upsertAccountClassed, filedDocument, draftEntryV3, billLines, freshResolution,
} from "./s6-helpers.mjs";
import { approveEntry } from "./rig-fixtures.mjs";
import { applyTemplate, newInterviewClient } from "./coa-template-pr-b-helpers.mjs";
import { correctAccrualAdjustment } from "./accrual-correction-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

const STEM = "accrual_revenue_side$";

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

async function gate942(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_REVENUE_SIDE !== "1") {
    assert.fail(
      `#942 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/accrual-revenue-side-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#942 accrual revenue side lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("accrual-revenue-side");
  printSkipCount("accrual-revenue-side");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const FIRM_A = () => world.firms.A;

/** The revenue side's own chart, on top of `freshAccrualClient`'s expense-side one.
 *
 *  `1180 Accrued Income` is NOT planted here. It belongs to the platform standard chart
 *  (0295, `my_sme_starter` v2) and #942 CONSUMES that row rather than minting a sibling — the
 *  cell that needs it applies the CURRENT published template through the real doors. What a cell
 *  needs HERE is the other half of the same owner ruling (2026-09-20): "the accountant may choose
 *  another suitable account the client already has (active, asset, not a control account), for
 *  example the professional-services template's 1320 Unbilled Receivables (Work-in-Progress)" —
 *  so that is exactly the account these cells choose. */
export const RCHART = {
  income: "4000",       // income, no control class — the revenue accrual's CREDIT leg
  asset: "1320",        // asset,  no control class — its DEBIT leg (the ruling's own example)
  assetControl: "3050", // asset,  account_class='receivable' — the CONTROL leg refused
};

async function freshRevenueClient(tag) {
  const client = await freshAccrualClient(ALICE(), tag);
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.income, name: "Sales / Fees Income", type: "income", accountClass: null,
    opKey: opk("p942-coa"),
  });
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.asset, name: "Unbilled Receivables (Work-in-Progress)", type: "asset",
    accountClass: null, opKey: opk("p942-coa"),
  });
  return client;
}

const monthStart = (day) => `${day.slice(0, 7)}-01`;
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/** The same window shape every accrual battery on this lane uses: `monthsBack` months, ending at
 *  the month end `monthsBack - 1` months ago, so every due date is in the past on EVERY calendar
 *  day the battery runs. */
async function span(monthsBack) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** A revenue-side accrual, configured through the human door. */
async function configureRevenue({
  tag, monthsBack = 2, cents = 120000, sub = BOB(), client = null,
  incomeAccount = RCHART.income, assetAccount = RCHART.asset, extra = {},
} = {}) {
  const c = client ?? await freshRevenueClient(tag);
  const ref = await instructionRef({ client: c, author: sub });
  const s = await span(monthsBack);
  const particulars = {
    ...accrual({
      expenseAccount: incomeAccount, liabilityAccount: assetAccount, cents,
      servicePeriodStart: s.from, servicePeriodEnd: s.to,
      memo: "Accrued fees delivered, not yet invoiced",
    }),
    side: "revenue",
    ...extra,
  };
  const answer = await createAccrualAdjustment(sub, {
    client: c, purpose: "Monthly unbilled fee accrual", authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
  });
  return { client: c, span: s, particulars, ...answer };
}

// ===========================================================================================
// p942.side — THE DETAIL CARRIES A SIDE, AND `expense` IS WHAT EVERY EXISTING CALLER GETS.
// ===========================================================================================

test("p942.side.configure — a revenue accrual is configured and every read answers side='revenue'; an accrual that states no side is 'expense'", async (t) => {
  if (await gate942(t)) return;

  const r = await configureRevenue({ tag: "sideconf" });
  const detail = await getAccrualAdjustment(BOB(), r.accrual_id);
  assert.equal(detail.side, "revenue", "the detail read answers the side it was configured with");
  assert.equal(detail.expense_account_code, RCHART.income,
    "the profit-and-loss leg carries the income account");
  assert.equal(detail.liability_account_code, RCHART.asset,
    "the balance-sheet leg carries the accrued-income asset");

  const register = await listAccrualAdjustments(BOB(), { client: r.client });
  const row = register.accruals.find((x) => x.accrual_id === r.accrual_id);
  assert.equal(row?.side, "revenue", "the register carries the side too");

  // THE DEFAULT. A caller that states no side at all — every caller that exists today, including
  // the FROZEN start_accrual_work tool — configures an expense accrual, unchanged.
  const client = await freshAccrualClient(ALICE(), "sideconf-exp");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const e = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ servicePeriodStart: s.from, servicePeriodEnd: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
  });
  const expenseDetail = await getAccrualAdjustment(BOB(), e.accrual_id);
  assert.equal(expenseDetail.side, "expense",
    "an accrual configured with no side at all is an EXPENSE accrual");
});

// ===========================================================================================
// p942.posts — THE MIRROR ENTRY, ITS REVERSAL, AND WHAT THE PERIOD IS LEFT CARRYING.
// ===========================================================================================

async function entryLines(entryId) {
  const r = await rootQuery(
    `select account_code, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents,
            description
       from clara.journal_lines where entry_id = $1 order by line_no`, [entryId]);
  return r.rows;
}

/** The net movement on one account across every APPROVED, un-reversed entry of a client — the
 *  ledger's own answer to "what does this period carry", read after the fact. */
async function netOnAccount(client, account) {
  const r = await rootQuery(
    `select coalesce(sum(jl.credit_cents - jl.debit_cents), 0)::bigint as net
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where je.client_id = $1 and jl.account_code = $2
        and je.status = 'approved' and je.reversed_by is null`, [client, account]);
  return Number(r.rows[0].net);
}

const reversalDateOf = async (due) => {
  const r = await rootQuery(
    "select (date_trunc('month', $1::date) + interval '1 month')::date::text as d", [due]);
  return r.rows[0].d;
};

/** Admit one named due event through the EXISTING human catch-up door and post it. */
async function catchUpAndPost({ plan, client, due, leg }) {
  const answer = await requestPlanCatchUp(BOB(), { plan, from: due, to: due, opKey: opk("p942-catch") });
  assert.ok(answer.admitted >= 1,
    `the catch-up admitted nothing for ${leg} ${due}: ${JSON.stringify(answer.events)}`);
  const row = (await occurrenceRows(plan)).find((o) => o.leg === leg && o.due_date === due);
  assert.ok(row?.work_id, `no admitted ${leg} occurrence for ${due}`);
  return postPlanWork({ work: row.work_id, client, author: BOB(), firm: FIRM_A() });
}

test("p942.posts — a revenue accrual posts Dr accrued income / Cr revenue on the due date, its reversal undoes exactly that on the first of the next month, and an invoice issued afterwards leaves ONE live revenue amount for the period", async (t) => {
  if (await gate942(t)) return;

  const CENTS = 480000;
  const r = await configureRevenue({ tag: "posts", cents: CENTS });
  const due = r.occurrence?.due_date;
  assert.ok(due, "the configuration admitted the current period's accrual leg");

  // 1 · THE ACCRUAL. Dr the accrued-income ASSET, Cr the REVENUE account — the mirror of
  //     Dr expense / Cr accrued liability, and the whole of what this ticket asks the books for.
  const accrualEntry = await postPlanWork({
    work: r.occurrence.work_id, client: r.client, author: BOB(), firm: FIRM_A(),
  });
  const lines = await entryLines(accrualEntry);
  assert.deepEqual(
    lines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [[RCHART.asset, CENTS, 0], [RCHART.income, 0, CENTS]],
    "Dr accrued income / Cr revenue");

  // 2 · THE REVERSAL, on the first day of the following month — the schedule's own second leg,
  //     unchanged by this ticket, undoing this entry with the sides exchanged.
  const revDue = await reversalDateOf(due);
  const reversalEntry = await catchUpAndPost({
    plan: r.plan_id, client: r.client, due: revDue, leg: "reversal",
  });
  const revLines = await entryLines(reversalEntry);
  assert.deepEqual(
    revLines.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [[RCHART.asset, 0, CENTS], [RCHART.income, CENTS, 0]],
    "the reversal is Dr revenue / Cr accrued income");

  // 3 · WHAT THE BOOKS ARE LEFT CARRYING. The accrual and its reversal net to nothing on BOTH
  //     legs, so once the invoice is issued the period carries the invoice's revenue and no
  //     estimate beside it. Computed from the ledger, not from the two entries above.
  assert.equal(await netOnAccount(r.client, RCHART.income), 0,
    "accrual + reversal leave no revenue of their own");
  assert.equal(await netOnAccount(r.client, RCHART.asset), 0,
    "…and no accrued income either");

  const INVOICE = 510000;
  const doc = await filedDocument(BOB(), { firm: FIRM_A(), client: r.client });
  const d = await draftEntryV3(BOB(), {
    client: r.client,
    resolution: freshResolution(BOB(), r.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    // A receipt: Dr bank / Cr the revenue account the accrual estimated.
    lines: billLines(ACHART.bank, RCHART.income, INVOICE, { desc: "942-invoice" }),
    memo: "942 rig: the fee finally invoiced", postingDate: revDue, opKey: opk("p942-inv-draft"),
  });
  await approveEntry(ALICE(), {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p942-inv-approve"),
  });
  assert.equal(await netOnAccount(r.client, RCHART.income), INVOICE,
    "the period carries exactly the invoiced revenue — one live amount, not the estimate as well");
});

// ===========================================================================================
// p942.correct — THE CORRECTION PATH CARRIES THE SIDE, AND WILL NOT TURN ONE INTO THE OTHER.
// ===========================================================================================

test("p942.correct — a revenue accrual is corrected on its own side and every leg still posts the right way round; asking for the other side is refused accrual_side_immutable", async (t) => {
  if (await gate942(t)) return;

  const r = await configureRevenue({ tag: "correct", cents: 300000 });
  const restated = { ...r.particulars, amount_cents: 275000 };

  const corrected = await correctAccrualAdjustment(BOB(), {
    accrualId: r.accrual_id, accrual: restated, opKey: opk("p942-correct"),
  });
  assert.equal(corrected.corrects_accrual_id, r.accrual_id);
  const detail = await getAccrualAdjustment(BOB(), corrected.accrual_id);
  assert.equal(detail.side, "revenue", "the successor row carries the side it corrects");
  assert.equal(detail.amount_cents, 275000);

  // A CORRECTED REVENUE ACCRUAL STILL POSTS THE RIGHT WAY ROUND, on both legs. The occurrence
  // admitted at configuration carries its own frozen basis, so it posts the figure it was
  // admitted with; the reversal admitted after the correction is built from the LIVE revision's
  // basis. This cell asserts the SIDE of every leg — what #942 owns — and the configured figure
  // on the accrual itself. It deliberately does NOT assert that the reversal's AMOUNT equals the
  // accrual's: that they can differ when a correction lands between the two is 0193/#936's own
  // behaviour, identical on the expense side, and #942's report carries it as a follow-up rather
  // than blessing it here.
  const due = r.occurrence?.due_date;
  const entry = await postPlanWork({
    work: r.occurrence.work_id, client: r.client, author: BOB(), firm: FIRM_A(),
  });
  assert.ok(entry && due);
  assert.deepEqual(
    (await entryLines(entry)).map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [[RCHART.asset, 300000, 0], [RCHART.income, 0, 300000]],
    "the accrual posts Dr accrued income / Cr revenue for the figure it was admitted with");

  const revDue = await reversalDateOf(due);
  const laterEntry = await catchUpAndPost({
    plan: r.plan_id, client: r.client, due: revDue, leg: "reversal",
  });
  const revLines = await entryLines(laterEntry);
  const assetLeg = revLines.find((l) => l.account_code === RCHART.asset);
  const incomeLeg = revLines.find((l) => l.account_code === RCHART.income);
  assert.equal(revLines.length, 2, "the reversal posts the same two legs");
  assert.ok(Number(assetLeg.credit_cents) > 0 && Number(assetLeg.debit_cents) === 0,
    "the reversal CREDITS the accrued-income asset");
  assert.ok(Number(incomeLeg.debit_cents) > 0 && Number(incomeLeg.credit_cents) === 0,
    "…and DEBITS the revenue account");
  assert.equal(Number(assetLeg.credit_cents), Number(incomeLeg.debit_cents),
    "…by one amount, so the reversal balances on the revenue side's own two legs");

  // THE WALL. The same restatement, asking for the expense side, on the LIVE successor.
  await assertPair(CLR.badRequest, "accrual_side_immutable",
    () => correctAccrualAdjustment(BOB(), {
      accrualId: corrected.accrual_id,
      accrual: { ...restated, side: "expense", expense_account_code: ACHART.expense,
        liability_account_code: ACHART.liability },
      opKey: opk("p942-flip"),
    }),
    "correcting a revenue accrual onto the expense side");

  // …and an accrual that states no side at all is asking for the expense side, so it is refused
  // by the same wall rather than silently re-interpreted.
  await assertPair(CLR.badRequest, "accrual_side_immutable",
    () => correctAccrualAdjustment(BOB(), {
      accrualId: corrected.accrual_id,
      accrual: (() => { const a = { ...restated }; delete a.side; return a; })(),
      opKey: opk("p942-silent-flip"),
    }),
    "correcting a revenue accrual with the side left unstated");
});

// ===========================================================================================
// p942.periods — #937's PER-PERIOD STATED AMOUNTS, ON THE REVENUE SIDE.
// ===========================================================================================

/** Every `last_day_of_month` due date inside a window, oldest first — computed in Postgres
 *  rather than re-derived in JS (the accrual batteries' own convention). */
async function monthEndsBetween(from, to) {
  const r = await rootQuery(
    `select ((date_trunc('month', d) + interval '1 month' - interval '1 day')::date)::text as due
       from generate_series($1::date, $2::date, interval '1 month') d
      order by 1`, [from, to]);
  return r.rows.map((x) => x.due).filter((d) => d >= from && d <= to);
}

test("p942.periods — a revenue accrual whose amount a person stated per period posts each period's own figure Dr accrued income / Cr revenue", async (t) => {
  if (await gate942(t)) return;

  const client = await freshRevenueClient("periods");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const dues = await monthEndsBetween(s.from, s.to);
  assert.equal(dues.length, 2, "the window reaches exactly two month ends");
  const AMOUNTS = { [dues[0]]: 420000, [dues[1]]: 365000 };

  const created = await createAccrualAdjustment(BOB(), {
    client, purpose: "Unbilled fees, stated month by month", authorityRef: ref,
    accrual: {
      ...accrual({
        expenseAccount: RCHART.income, liabilityAccount: RCHART.asset,
        cents: AMOUNTS[dues[0]] + AMOUNTS[dues[1]],
        servicePeriodStart: s.from, servicePeriodEnd: s.to,
        method: { rule: "stated_period_amount" },
        periodAmounts: dues.map((d) => ({ due_date: d, amount_cents: AMOUNTS[d] })),
      }),
      side: "revenue",
    },
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
    opKey: opk("p942-periods"),
  });
  assert.equal(created.occurrence?.due_date, dues[1]);

  const posted = {};
  posted[dues[1]] = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  posted[dues[0]] = await catchUpAndPost({
    plan: created.plan_id, client, due: dues[0], leg: "primary",
  });

  for (const due of dues) {
    assert.deepEqual(
      (await entryLines(posted[due])).map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
      [[RCHART.asset, AMOUNTS[due], 0], [RCHART.income, 0, AMOUNTS[due]]],
      `the ${due} entry accrues THAT period's stated income, Dr accrued income / Cr revenue`);
  }
  assert.notEqual(AMOUNTS[dues[0]], AMOUNTS[dues[1]],
    "the two periods really do differ — otherwise this cell would pass on a constant");
  // The line that names the period sits on the PROFIT-AND-LOSS leg on this side, as it does on
  // the expense side: it is the leg that says which period's trading the figure belongs to.
  const lines = await entryLines(posted[dues[0]]);
  assert.equal(lines[1].description, `the accrual period ending ${dues[0]}`);
  assert.equal(lines[0].description, "accrued income");
});

// ===========================================================================================
// p942.conflict — #938's "a document arrived inside an accrued period" READ, ON BOTH SIDES.
// ===========================================================================================

async function listReviewQueue(sub, { scope = {}, cursor = null, limit = 50 } = {}) {
  const r = await humanQuery(sub, namedCall("list_review_queue", [
    { name: "p_scope", cast: "jsonb" }, { name: "p_cursor", cast: "jsonb" },
    { name: "p_limit", cast: "int" },
  ]), [JSON.stringify(scope), cursor ? JSON.stringify(cursor) : null, limit]);
  return r.rows[0].result;
}

const conflictRows = (env) => env.rows.filter((r) => r.row_kind === "accrual_bill_conflict");

/** A real document-sourced, approved entry hitting `credit` from `debit` — filed, drafted and
 *  approved through the estate's own three doors. Drafted by BOB, approved by ALICE. */
async function postedDocumentEntry({ client, debit, credit, postingDate, cents = 90000, memo }) {
  const doc = await filedDocument(BOB(), { firm: FIRM_A(), client });
  const d = await draftEntryV3(BOB(), {
    client,
    resolution: freshResolution(BOB(), client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    lines: billLines(debit, credit, cents, { desc: "942-doc" }),
    memo, postingDate, opKey: opk("p942-doc-draft"),
  });
  await approveEntry(ALICE(), {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p942-doc-approve"),
  });
  return d.entry_id;
}

test("p942.conflict — an invoice or receipt posted to the accrual's revenue account inside a posted, un-reversed period surfaces the same item, and the row NAMES the side", async (t) => {
  if (await gate942(t)) return;

  // 1 · THE REVENUE ARM. A posted revenue accrual, then a receipt hitting the same revenue
  //     account inside the accrual's own period.
  const r = await configureRevenue({ tag: "conflict", cents: 200000 });
  await postPlanWork({ work: r.occurrence.work_id, client: r.client, author: BOB(), firm: FIRM_A() });
  const invoiceDate = `${r.occurrence.due_date.slice(0, 8)}01`;
  const entry = await postedDocumentEntry({
    client: r.client, debit: ACHART.bank, credit: RCHART.income, postingDate: invoiceDate,
    memo: "942 rig: the fee invoiced inside the accrued period",
  });

  const env = await listReviewQueue(BOB(), { scope: { client_id: r.client } });
  const rows = conflictRows(env);
  assert.equal(rows.length, 1, `exactly one row for the one open accrual (got ${JSON.stringify(rows)})`);
  assert.equal(rows[0].id, r.plan_id, "the row's shared id IS the plan id, so both remedies act on it");
  assert.equal(rows[0].entry_id, entry, "…and it names the invoice that collided");
  assert.equal(rows[0].period, r.occurrence.due_date);
  assert.equal(rows[0].accrual_side, "revenue", "the row names the side it belongs to");
  assert.match(rows[0].question_text, /invoice or receipt/i,
    "a revenue accrual's conflict is an invoice or a receipt, never 'a bill'");
  assert.match(rows[0].question_text, /accrued period/i);

  // 2 · THE EXPENSE ARM IS UNMOVED — the same read, the same sentence #938 shipped, and a side
  //     of its own. Built beside the revenue one so the two are compared, not remembered.
  const client = await freshAccrualClient(ALICE(), "conflict-exp");
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const e = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ servicePeriodStart: s.from, servicePeriodEnd: s.to }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
  });
  await postPlanWork({ work: e.occurrence.work_id, client, author: BOB(), firm: FIRM_A() });
  await postedDocumentEntry({
    client, debit: ACHART.expense, credit: ACHART.liability,
    postingDate: `${e.occurrence.due_date.slice(0, 8)}01`, memo: "942 rig: the bill arrived",
  });
  const expenseEnv = await listReviewQueue(BOB(), { scope: { client_id: client } });
  const expenseRows = conflictRows(expenseEnv);
  assert.equal(expenseRows.length, 1);
  assert.equal(expenseRows[0].accrual_side, "expense");
  assert.match(expenseRows[0].question_text, /^A document-sourced entry posted inside the accrued period /,
    "#938's own sentence is byte-for-byte what the expense side still says");
});

// ===========================================================================================
// p942.walls — THE PAIR IS JUDGED BY THE SIDE, WITH THE SAME TYPED REFUSALS AS THE EXPENSE SIDE.
// ===========================================================================================

/** Send one set of particulars at the configuration door and return whatever it does. */
async function send({ client, particulars, tag }) {
  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  return createAccrualAdjustment(BOB(), {
    client, purpose: "Monthly unbilled fee accrual", authorityRef: ref,
    accrual: { ...particulars, service_period_start: s.from, service_period_end: s.to },
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk(`p942-${tag}`),
  });
}

test("p942.walls — each side judges its own two account types, and the balance-sheet leg refuses a control account on BOTH sides", async (t) => {
  if (await gate942(t)) return;

  const client = await freshRevenueClient("walls");
  const s = await span(2);
  const revenue = (over = {}) => ({
    ...accrual({
      expenseAccount: RCHART.income, liabilityAccount: RCHART.asset,
      servicePeriodStart: s.from, servicePeriodEnd: s.to,
    }),
    side: "revenue", ...over,
  });

  // THE PROFIT-AND-LOSS LEG OF A REVENUE ACCRUAL IS AN INCOME ACCOUNT.
  const { detail: d1 } = await assertPair(CLR.badRequest, "accrual_account_relationship",
    () => send({ client, particulars: revenue({ expense_account_code: ACHART.expense }), tag: "w1" }),
    "an expense account on the revenue side's P&L leg");
  assert.equal(d1.constraint, "income_account");
  assert.equal(d1.field, "accrual.expense_account_code");
  assert.equal(d1.expected_account_type, "income");

  // …AND ITS BALANCE-SHEET LEG IS AN ASSET.
  const { detail: d2 } = await assertPair(CLR.badRequest, "accrual_account_relationship",
    () => send({ client, particulars: revenue({ liability_account_code: ACHART.liability }), tag: "w2" }),
    "a liability on the revenue side's balance-sheet leg");
  assert.equal(d2.constraint, "asset_account");
  assert.equal(d2.field, "accrual.liability_account_code");
  assert.equal(d2.expected_account_type, "asset");

  // A CONTROL ACCOUNT IS REFUSED ON THE ASSET SIDE, for the reason it is refused on the liability
  // side: a control account reconciles to identified detail, and an accrual has none.
  const { detail: d3 } = await assertPair(CLR.badRequest, "accrual_account_relationship",
    () => send({ client, particulars: revenue({ liability_account_code: RCHART.assetControl }), tag: "w3" }),
    "the receivables control account as accrued income");
  assert.equal(d3.constraint, "non_control_asset");
  assert.equal(d3.account_class, "receivable");

  // THE EXPENSE SIDE IS UNMOVED: its own control refusal still reads non_control_liability, and
  // its P&L leg still wants an expense account.
  const expenseClient = await freshAccrualClient(ALICE(), "walls-exp");
  const expense = (over = {}) => ({
    ...accrual({ servicePeriodStart: s.from, servicePeriodEnd: s.to }), ...over,
  });
  const { detail: d4 } = await assertPair(CLR.badRequest, "accrual_account_relationship",
    () => send({ client: expenseClient, particulars: expense({ liability_account_code: ACHART.payableControl }), tag: "w4" }),
    "the payables control account as an accrued liability");
  assert.equal(d4.constraint, "non_control_liability");
  const { detail: d5 } = await assertPair(CLR.badRequest, "accrual_account_relationship",
    () => send({ client, particulars: expense({ expense_account_code: RCHART.income }), tag: "w5" }),
    "an income account on the expense side's P&L leg");
  assert.equal(d5.constraint, "expense_account");

  // A SIDE THAT IS NOT ONE OF THE TWO IS REFUSED BY NAME, and the refusal says what is on offer.
  const { detail: d6 } = await assertPair(CLR.badRequest, "accrual_side_unsupported",
    () => send({ client, particulars: revenue({ side: "income" }), tag: "w6" }),
    "an accrual that names a side this lane does not perform");
  assert.equal(d6.field, "accrual.side");
  assert.deepEqual(d6.supported, ["expense", "revenue"]);
  await assertPair(CLR.badRequest, "accrual_side_unsupported",
    () => send({ client, particulars: revenue({ side: "" }), tag: "w7" }),
    "an accrual whose side is blank");
});

test("p942.op_key — one idempotency key cannot answer for two accruals that differ only in their side", async (t) => {
  if (await gate942(t)) return;

  const client = await freshRevenueClient("opkey");
  const s = await span(2);
  const key = opk("p942-one-key");
  const base = accrual({
    expenseAccount: RCHART.income, liabilityAccount: RCHART.asset,
    servicePeriodStart: s.from, servicePeriodEnd: s.to,
  });
  const ref = await instructionRef({ client, author: BOB() });
  const call = (particulars) => createAccrualAdjustment(BOB(), {
    client, purpose: "Monthly unbilled fee accrual", authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: key,
  });

  const first = await call({ ...base, side: "revenue" });
  assert.ok(first.accrual_id);
  // The SAME key, the same everything else, the other side: a conflict, never a replay.
  await assertPair(CLR.badRequest, "op_key_conflict",
    () => call({ ...base, side: "expense", expense_account_code: ACHART.expense,
      liability_account_code: ACHART.liability }),
    "one key, two sides");
  // …and the same key with the SAME side is still the replay it has always been.
  const replay = await call({ ...base, side: "revenue" });
  assert.equal(replay.accrual_id, first.accrual_id, "an identical re-send replays");
});

// ===========================================================================================
// p942.standard_chart — THE ACCOUNT THE OWNER'S RULING NAMES, CONSUMED RATHER THAN MINTED.
// ===========================================================================================

test("p942.standard_chart — a client born onto the CURRENT published platform chart accrues income into 1180 Accrued Income, the row 0295 already ships", async (t) => {
  if (await gate942(t)) return;

  // THE CURRENT PUBLISHED STANDARD CHART — highest published version, the estate's own
  // "whichever one is live" convention. #942 mints nothing here: 1180 Accrued Income and
  // 4000 Sales / Fees Income are 0295's and 0150's rows, reached through the real doors.
  const templates = (await rootQuery(
    `select id, version from clara.coa_templates
      where scope='platform' and template_key='my_sme_starter' and state='published'
      order by version desc limit 1`)).rows;
  assert.equal(templates.length, 1, "exactly one published my_sme_starter is live");
  const template = templates[0];

  const client = await newInterviewClient(ALICE(), FIRM_A(), { tag: "p942sc" });
  const receipt = await applyTemplate(ALICE(), {
    client, template: template.id, families: null, opKey: opk("p942-apply"),
  });
  assert.ok(receipt.accounts > 0, "the standard chart was planted through clara.apply_coa_template");
  const planted = (await rootQuery(
    `select account_code, name, account_type, account_class, is_active
       from clara.coa_accounts where client_id=$1 and account_code in ('1180','4000')
      order by account_code`, [client])).rows;
  assert.deepEqual(
    planted.map((a) => [a.account_code, a.name, a.account_type, a.account_class, a.is_active]),
    [["1180", "Accrued Income", "asset", null, true],
     ["4000", "Sales / Fees Income", "income", null, true]],
    "the client carries the standard chart's own accrued-income asset and its revenue account");

  const ref = await instructionRef({ client, author: BOB() });
  const s = await span(2);
  const created = await createAccrualAdjustment(BOB(), {
    client, purpose: "Fees delivered in the period, not yet invoiced", authorityRef: ref,
    accrual: {
      ...accrual({
        expenseAccount: "4000", liabilityAccount: "1180", cents: 250000,
        servicePeriodStart: s.from, servicePeriodEnd: s.to,
      }),
      side: "revenue",
    },
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ, opKey: opk("p942-sc"),
  });
  const entry = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  assert.deepEqual(
    (await entryLines(entry)).map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [["1180", 250000, 0], ["4000", 0, 250000]],
    "Dr 1180 Accrued Income / Cr 4000 Sales — the ruling's own default, on the chart every new client gets");
});
