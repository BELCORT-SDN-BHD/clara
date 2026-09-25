// #1073 (riders sweep wave, lane 01) — A THIRD ACCRUAL/BILL-CONFLICT REMEDY: ONE PERIOD'S OWN
// CORRECTING ENTRY.
//
// THE GAP THIS BATTERY EXISTS TO CLOSE. A document-sourced bill posting inside a period an accrual
// has already posted for (`row_kind='accrual_bill_conflict'`, 0302) offers a bookkeeper exactly two
// remedies: `clara.request_plan_catch_up` over a WINDOW from the flagged due date through the
// accrual's scheduled reversal date ("reverse now"), and `clara.skip_plan_occurrence`, which marks
// a FUTURE due date handled and touches the flagged period not at all. Neither is "book the
// correcting entry for exactly this one conflicting period": the first is a catch-up over a window
// and admits whatever else falls due inside it, the second settles a different period.
//
// THE CLAIMS:
//
//   1. ONE PERIOD, ONE ENTRY. Naming the flagged period's own due date books that period's accrual
//      reversal and nothing else, and the LEDGER is then left carrying exactly the bill's own
//      amount — read back off `clara.journal_lines`, never off the entries the cell posted.
//   2. IT NETS WHAT "REVERSE NOW" NETS. Two identically configured clients, one settled through
//      the existing catch-up remedy and one through this door, are left with the SAME sums on both
//      legs and the same reversal lines.
//   3. IT IS SCOPED WHERE THE CATCH-UP IS NOT. On a schedule whose next due date falls ON the
//      flagged period's reversal date, "reverse now" admits that next period's ACCRUAL too; this
//      door admits exactly one occurrence, the reversal.
//   4. IT IS A GOVERNED ACT. A receipt in `clara.op_receipts`, idempotent under a replayed op_key,
//      a bookkeeper floor, and a typed refusal for every way it cannot act — the conventions
//      `clara.skip_plan_occurrence` already carries.
//   5. THE TWO EXISTING REMEDIES ARE UNTOUCHED, and the catalog says so.
//
// CONTRACT-BLIND against #1073's own Agent Brief (issue body, zero comments, re-verified live on
// this branch) and the shapes 0193/0222/0302/0304/0332 already ship — never against an
// implementation file. FRONTIER-GATED on the `plan_occurrence_reversal_door$` stem.
//
// Every assertion under test runs through a real door at the least privilege that should succeed;
// `rootQuery` appears only to READ BACK the ledger and the catalog after a door wrote them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  humanQuery, namedCall, CLR, assertPair,
  freshAccrualClient, accrual, createAccrualAdjustment, postPlanWork, requestPlanCatchUp,
  occurrenceRows, occurrenceCount, instructionRef, opReceiptRows,
  endAccountingPlan, pauseAccountingPlan,
  todayInPlanZone, shiftMonths, ACHART, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import { filedDocument, draftEntryV3, billLines, freshResolution } from "./s6-helpers.mjs";
import { approveEntry } from "./rig-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// The frontier gate. Keyed on THIS migration's STABLE STEM, never its number.
// ===========================================================================================

const STEM = "plan_occurrence_reversal_door$";

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

/** A FOCUSED run against a database without the door is a real FAILURE — a skip is not evidence. */
async function gate1073(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PLAN_OCCURRENCE_REVERSAL_DOOR !== "1") {
    assert.fail(
      `#1073 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/plan-occurrence-reversal-door-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#1073 one-period reversal door absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("plan-occurrence-reversal-door");
  printSkipCount("plan-occurrence-reversal-door");
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

// ── the door under test, wrapped the house way ────────────────────────────────────────────────

/** #1073's own new door: reverse the accrual ONE named period posted, and only that one. */
async function reversePlanOccurrence(sub, { plan, due, opKey = null }) {
  const r = await humanQuery(sub, namedCall("reverse_plan_occurrence", [
    { name: "p_plan", cast: "uuid" }, { name: "p_due", cast: "date" },
    { name: "p_op_key", cast: "text" },
  ]), [plan, due, opKey ?? opk("p1073-rev")]);
  return r.rows[0].result;
}

async function listReviewQueue(sub, { scope = {}, limit = 50 } = {}) {
  const r = await humanQuery(sub, namedCall("list_review_queue", [
    { name: "p_scope", cast: "jsonb" }, { name: "p_cursor", cast: "jsonb" },
    { name: "p_limit", cast: "int" },
  ]), [JSON.stringify(scope), null, limit]);
  return r.rows[0].result;
}

const conflictRows = (env) => env.rows.filter((r) => r.row_kind === "accrual_bill_conflict");

// ── the ledger's own answers ───────────────────────────────────────────────────────────────────

/** The lines ONE journal entry actually carries, in its own order. */
async function entryLines(entryId) {
  const r = await rootQuery(
    `select account_code, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents
       from clara.journal_lines where entry_id = $1 order by line_no`, [entryId]);
  return r.rows.map((l) => [l.account_code, Number(l.debit_cents), Number(l.credit_cents)]);
}

/** What ONE account of ONE client is left carrying across every APPROVED, un-reversed entry —
 *  debit-positive, the reader #938's and #942's own batteries use for "one live expense". */
async function liveOnAccount(client, account) {
  const r = await rootQuery(
    `select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as net
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where je.client_id = $1 and jl.account_code = $2
        and je.status = 'approved' and je.reversed_by is null`, [client, account]);
  return Number(r.rows[0].net);
}

// ── the scene: an accrual that has posted, and a bill inside its own period ───────────────────

/** An EXPENSE accrual configured through the human door, its current-period occurrence posted.
 *  `monthsBack = 2` puts the flagged due date at LAST month's month end on every calendar day the
 *  battery runs, so its scheduled reversal (this month's first day) is always already due. */
async function postedAccrual({ tag, cents = 300000, monthsBack = 2, dayRule = "last_day_of_month",
                               dayOfMonth = null, effectiveTo = null } = {}) {
  const client = await freshAccrualClient(ALICE(), `p1073-${tag}`);
  const ref = await instructionRef({ client, author: BOB() });
  const from = monthStart(await shiftMonths(today, -monthsBack));
  const to = await monthEndBack(Math.max(monthsBack - 1, 0));
  const particulars = accrual({
    cents, expenseAccount: ACHART.expense, servicePeriodStart: from, servicePeriodEnd: to,
  });
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule, dayOfMonth,
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: effectiveTo ?? to,
  });
  assert.equal(created.occurrence?.leg, "primary",
    "the configuration admitted the current period's accrual leg");
  const entry = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  return {
    ...created, client, particulars, cents, from, to,
    dueDate: created.occurrence.due_date, entry,
  };
}

/** A real document-sourced, approved journal entry hitting `account` — filed, drafted and approved
 *  through the estate's own three doors, the same way #938's own battery builds the bill it flags. */
async function postedBill({ client, account, postingDate, cents = 290000 }) {
  const doc = await filedDocument(BOB(), { firm: FIRM_A(), client });
  const d = await draftEntryV3(BOB(), {
    client,
    resolution: freshResolution(BOB(), client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    lines: billLines(account, ACHART.liability, cents, { desc: "1073-bill" }),
    memo: "1073 rig bill, inside the accrued period", postingDate,
    opKey: opk("p1073-bill-draft"),
  });
  await approveEntry(ALICE(), {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p1073-bill-approve"),
  });
  return { entry: d.entry_id, cents };
}

/** The accrual, the bill inside its own period, and the conflict row the pair produces — the exact
 *  scene the ticket's third remedy is offered from. */
async function conflictScene({ tag, cents = 300000, billCents = 290000, ...rest }) {
  const a = await postedAccrual({ tag, cents, ...rest });
  const bill = await postedBill({
    client: a.client, account: ACHART.expense, cents: billCents,
    postingDate: `${a.dueDate.slice(0, 8)}01`,
  });
  const rows = conflictRows(await listReviewQueue(BOB(), { scope: { client_id: a.client } }));
  assert.equal(rows.length, 1,
    `the scene produced exactly one conflict row (got ${JSON.stringify(rows)})`);
  assert.equal(rows[0].period, a.dueDate, "and it names the flagged occurrence's own due date");
  return { ...a, bill, row: rows[0] };
}

/** Post the reversal occurrence this plan now carries for `revDue`, and answer its entry. */
async function postReversal({ plan, client, revDue }) {
  const row = (await occurrenceRows(plan)).find((o) => o.leg === "reversal" && o.due_date === revDue);
  assert.ok(row?.work_id, `no admitted reversal occurrence for ${revDue}`);
  return postPlanWork({ work: row.work_id, client, author: BOB(), firm: FIRM_A() });
}

// ===========================================================================================
// p1073.one_period — THE THIRD REMEDY ITSELF, beside the one it must agree with.
// ===========================================================================================

test("p1073.one_period.nets_like_reverse_now — the new remedy books exactly the flagged period's own reversal, and leaves the SAME sums on both legs as 'reverse now' does", async (t) => {
  if (await gate1073(t)) return;
  const ACCRUED = 300000;
  const BILLED = 290000;

  // TWO IDENTICALLY CONFIGURED CLIENTS. `a` is settled through the EXISTING remedy, `b` through
  // the new door, so "the same net state" is a comparison rather than a promise.
  const a = await conflictScene({ tag: "parity-catchup", cents: ACCRUED, billCents: BILLED });
  const b = await conflictScene({ tag: "parity-door", cents: ACCRUED, billCents: BILLED });
  const revDue = monthStart(today);

  // BEFORE EITHER REMEDY: the period carries BOTH amounts. That is the double count the row names.
  assert.equal(await liveOnAccount(a.client, ACHART.expense), ACCRUED + BILLED,
    "the accrual and the bill are both live on the profit-and-loss leg");

  // 1 · THE EXISTING REMEDY, unchanged and untouched by this ticket.
  await requestPlanCatchUp(BOB(), {
    plan: a.plan_id, from: a.dueDate, to: revDue, opKey: opk("p1073-catchup"),
  });
  const aRev = await postReversal({ plan: a.plan_id, client: a.client, revDue });

  // 2 · THE NEW REMEDY. It names the FLAGGED PERIOD's own due date — the value the conflict row
  //     carries, byte for byte — and never a window, and never a date the caller computed.
  const answer = await reversePlanOccurrence(BOB(), { plan: b.plan_id, due: b.row.period });
  assert.equal(answer.reversed, true, "the door reports the reversal it booked");
  assert.equal(answer.due_date, b.dueDate, "…for the period it was named");
  assert.equal(answer.reversal_due_date, revDue,
    "…and it resolved the scheduled reversal date itself, in the database");
  assert.equal(answer.leg, "reversal");
  assert.equal(answer.occurrence?.admitted, true);
  const bRev = await postReversal({ plan: b.plan_id, client: b.client, revDue });

  // 3 · THE SAME REVERSAL, LINE FOR LINE.
  assert.deepEqual(await entryLines(bRev), await entryLines(aRev),
    "the two remedies post the same reversal for the same period");
  assert.deepEqual(await entryLines(bRev),
    [[ACHART.expense, 0, ACCRUED], [ACHART.liability, ACCRUED, 0]],
    "…Cr the expense leg / Dr the accrued liability, at the figure the period POSTED");

  // 4 · THE LEDGER'S OWN ANSWER (the ticket's second acceptance criterion), summed over
  //     clara.journal_lines — and the expected value is the BILL's own amount, an independent
  //     figure, never a re-computation of what the door did.
  assert.equal(await liveOnAccount(b.client, ACHART.expense), BILLED,
    "ONE live expense amount is left for the period: the bill's own");
  assert.equal(await liveOnAccount(b.client, ACHART.expense),
    await liveOnAccount(a.client, ACHART.expense),
    "…the same amount 'reverse now' leaves");
  assert.equal(await liveOnAccount(b.client, ACHART.liability), -BILLED,
    "the accrued-liability leg is left carrying the bill's own credit alone");
  assert.equal(await liveOnAccount(b.client, ACHART.liability),
    await liveOnAccount(a.client, ACHART.liability), "…the same as 'reverse now' leaves");

  // 5 · AND THE CONFLICT ROW IS GONE FROM THE NEXT READ — nothing dismissed it.
  assert.equal(
    conflictRows(await listReviewQueue(BOB(), { scope: { client_id: b.client } })).length, 0,
    "the derived row cleared itself the moment a reversal for the period was admitted");
});
