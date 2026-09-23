// #938 (riders wave 4, lane 03) — A BILL POSTS INSIDE AN ACCRUED PERIOD, AND CLARA NOTICES.
//
// The claims this battery exists to prove, every one through a REAL door (WORK-ORDER rule 10):
//
//   1. THE READ IS DERIVED AND SELF-CLEARING. A document-sourced, approved journal entry hitting
//      an accrual plan's own expense account, posted INSIDE the accrual's own period while the
//      accrual has posted and its reversal has not, produces exactly one
//      row_kind='accrual_bill_conflict' row on clara.list_review_queue (needs_you/needs_you,
//      id=the plan's own id, period=the flagged occurrence's own due date). A bill posted in the
//      FOLLOWING period does not surface it. The moment a reversal is admitted for that same
//      period, the row is gone on the next read — nothing dismissed it, nothing was cleaned up.
//   2. "REVERSE NOW" IS THE EXISTING clara.request_plan_catch_up DOOR, UNCHANGED. Once the
//      reversal is due, catching up through it clears the flagged row; while it genuinely is not
//      yet due, the SAME door's own catch_up_in_future refusal answers honestly.
//   3. clara.skip_plan_occurrence REMOVES EXACTLY ONE FUTURE DUE DATE. The automatic scan
//      (clara.wake_due_plan_occurrences) never re-offers a skipped date, every named refusal is
//      typed, and a later DELIBERATE catch-up naming that exact date can still override the skip.
//
// CONTRACT-BLIND-ADJACENT: built against #938's own Agent Brief and migration 0302's header, not
// against any implementation file. FRONTIER-GATED on the `accrual_bill_conflict$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  humanQuery, namedCall, CLR, assertPair,
  freshAccrualClient, accrual, createAccrualAdjustment, reviseAccountingPlan, postPlanWork,
  requestPlanCatchUp, wakeDuePlanOccurrences, occurrenceRows, occurrenceCount, instructionRef,
  todayInPlanZone, shiftMonths, todayDayOfMonth, ACHART, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import { filedDocument, draftEntryV3, billLines, freshResolution } from "./s6-helpers.mjs";
import { approveEntry } from "./rig-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

const STEM = "accrual_bill_conflict$";

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

async function gate938(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_BILL_CONFLICT !== "1") {
    assert.fail(
      `#938 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/accrual-bill-conflict-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#938 accrual-bill-conflict lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("accrual-bill-conflict");
  printSkipCount("accrual-bill-conflict");
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

// ── The two doors this file's own migration adds/reads, wrapped the house way ─────────────────

async function listReviewQueue(sub, { scope = {}, cursor = null, limit = 50 } = {}) {
  const r = await humanQuery(sub, namedCall("list_review_queue", [
    { name: "p_scope", cast: "jsonb" }, { name: "p_cursor", cast: "jsonb" }, { name: "p_limit", cast: "int" },
  ]), [JSON.stringify(scope), cursor ? JSON.stringify(cursor) : null, limit]);
  return r.rows[0].result;
}

async function skipPlanOccurrence(sub, { plan, afterDue, reason = "938 rig: vendor now bills directly", opKey = null }) {
  const r = await humanQuery(sub, namedCall("skip_plan_occurrence", [
    { name: "p_plan", cast: "uuid" }, { name: "p_after_due", cast: "date" },
    { name: "p_reason", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [plan, afterDue, reason, opKey ?? opk("p938-skip")]);
  return r.rows[0].result;
}

const conflictRows = (env) => env.rows.filter((r) => r.row_kind === "accrual_bill_conflict");

/** `clara._plan_reversal_date(p_due)` (0193:837), mirrored client-side the same way
 *  `lib/accruals/api.ts`'s own `accrualReversalDate` does for the web layer's "reverse now": the
 *  first day of the month AFTER `due`'s. */
async function reversalDateOf(due) {
  const r = await rootQuery(
    `select (date_trunc('month', $1::date) + interval '1 month')::date::text as d`, [due]);
  return r.rows[0].d;
}

/** span(): the SAME window shape accrual-adjustments.test.mjs's own `span()` uses — `monthsBack`
 *  months, ending at the month end `monthsBack - 1` months ago, so the latest due date is in the
 *  past on EVERY calendar day the battery runs (review round 1, A5 — "a skipped battery is not
 *  evidence"). */
async function span(monthsBack) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** A posted accrual (accrual configured + its current-period occurrence posted to a committed
 *  entry), `monthsBack` months back — mirrors accrual-adjustments.test.mjs's own `configure()` +
 *  `postPlanWork()` pair. Returns everything a cell needs: the plan/client ids, the accrual's own
 *  expense account, the flagged due date and the entry it posted. */
async function postedAccrual({ tag, monthsBack = 2, sub = BOB() }) {
  const client = await freshAccrualClient(ALICE(), tag);
  const ref = await instructionRef({ client, author: sub });
  const s = await span(monthsBack);
  const particulars = accrual({
    expenseAccount: ACHART.expense, servicePeriodStart: s.from, servicePeriodEnd: s.to,
  });
  const c = await createAccrualAdjustment(sub, {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: s.from, effectiveTo: s.to, timezone: ACCRUAL_TZ,
  });
  const dueDate = c.occurrence?.due_date;
  const entry = await postPlanWork({
    work: c.occurrence.work_id, client, author: sub, firm: FIRM_A(),
  });
  return { client, plan_id: c.plan_id, dueDate, entry, expenseAccount: ACHART.expense };
}

/** A real document-sourced, approved journal entry hitting `account` — filed, drafted and
 *  approved through the estate's own three doors (never a raw INSERT standing in for the bill
 *  under test). Approved by ALICE, drafted by BOB, so a high-stakes solo-approval branch never
 *  engages regardless of amount. */
async function postedBill({ client, account, postingDate, cents = 50000, memo = "938 rig bill" }) {
  const doc = await filedDocument(BOB(), { firm: FIRM_A(), client });
  const d = await draftEntryV3(BOB(), {
    client,
    resolution: freshResolution(BOB(), client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    // ACHART.liability (a plain liability, no account_class) rather than ACHART.payableControl:
    // a control-class credit line requires a resolved counterparty at approve time, which is not
    // this ticket's concern.
    lines: billLines(account, ACHART.liability, cents, { desc: "938-bill" }),
    memo, postingDate, opKey: opk("p938-bill-draft"),
  });
  await approveEntry(ALICE(), { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p938-bill-approve") });
  return d.entry_id;
}

/** A posted accrual (monthsBack=3, so its own due date is safely 2 calendar months back on every
 *  day the battery runs — the accrual-adjustments.test.mjs "no month-end skip" margin, one month
 *  further out), whose authority window is then WIDENED ONE MORE MONTH by
 *  clara.revise_accounting_plan (the EXISTING plan-lane door, never a new one) so the occurrence
 *  immediately after it — 1 month back, ALSO safely in the past on every day of the month — is a
 *  valid schedule date within the authority window but has NOT been admitted by anything. That is
 *  the one clean slot a skip test needs: a real "next occurrence" that is both genuinely due (so a
 *  deliberate override can prove itself) and untouched (so the skip marker is the first row ever
 *  written for it). Revising a LIVE plan admits nothing by itself (0193's own revision door), so
 *  this widening changes no occurrence row. */
async function widenedAccrual({ tag }) {
  const a = await postedAccrual({ tag, monthsBack: 3 });
  const nextDue = await monthEndBack(1);
  await reviseAccountingPlan(BOB(), {
    plan: a.plan_id, frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: monthStart(await shiftMonths(today, -3)),
    effectiveTo: nextDue,
    basis: {
      posting_date: a.dueDate, memo: "938 rig widened accrual", currency: "MYR",
      lines: [
        { account_code: a.expenseAccount, debit_cents: 120000, credit_cents: 0 },
        { account_code: ACHART.liability, debit_cents: 0, credit_cents: 120000 },
      ],
    },
    reversalDayRule: "next_period_first_day",
    opKey: opk("p938-widen"),
  });
  return { ...a, nextDue };
}

// ===========================================================================================
// p938.read — THE DERIVED, SELF-CLEARING ROW.
// ===========================================================================================

test("p938.read.same_period — a document-sourced bill posted inside the accrual's own period surfaces exactly one accrual_bill_conflict row, id=plan, period=the flagged due date", async (t) => {
  if (await gate938(t)) return;
  const a = await postedAccrual({ tag: "sameperiod" });
  const billDate = a.dueDate.slice(0, 8) + "01"; // the first of the SAME month as the accrual's own due date
  const entry = await postedBill({ client: a.client, account: a.expenseAccount, postingDate: billDate });

  const env = await listReviewQueue(BOB(), { scope: { client_id: a.client } });
  const rows = conflictRows(env);
  assert.equal(rows.length, 1, `exactly one row for the one open accrual (got ${JSON.stringify(rows)})`);
  const row = rows[0];
  assert.equal(row.id, a.plan_id, "the row's shared id IS the plan id");
  assert.equal(row.client_id, a.client);
  assert.equal(row.period, a.dueDate, "period carries the flagged occurrence's own due date, verbatim");
  assert.equal(row.entry_id, entry, "entry_id names the conflicting bill");
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.match(row.question_text, /accrued period/i);
});

test("p938.read.next_period — a bill posted in the FOLLOWING period does not surface", async (t) => {
  if (await gate938(t)) return;
  const a = await postedAccrual({ tag: "nextperiod" });
  // The month AFTER the accrual's own due date.
  const nextMonthDay = await monthEndBack(-1);
  await postedBill({ client: a.client, account: a.expenseAccount, postingDate: nextMonthDay });

  const env = await listReviewQueue(BOB(), { scope: { client_id: a.client } });
  assert.equal(conflictRows(env).length, 0,
    "a next-period bill is exactly the case the automatic reversal already nets correctly — no flag");
});

test("p938.read.different_account — a bill hitting a DIFFERENT account does not surface", async (t) => {
  if (await gate938(t)) return;
  const a = await postedAccrual({ tag: "diffaccount" });
  const billDate = a.dueDate.slice(0, 8) + "01";
  // ACHART.bank (an asset, not the accrual's own expense leg) -- any account other than the
  // accrual's own is the claim under test.
  await postedBill({ client: a.client, account: ACHART.bank, postingDate: billDate });
  const env = await listReviewQueue(BOB(), { scope: { client_id: a.client } });
  assert.equal(conflictRows(env).length, 0, "a bill on an unrelated account is not this accrual's conflict");
});

test("p938.read.reverse_clears — admitting the reversal (the existing plan-lane door) clears the row, with no cleanup", async (t) => {
  if (await gate938(t)) return;
  const a = await postedAccrual({ tag: "reverseclears" });
  const billDate = a.dueDate.slice(0, 8) + "01";
  await postedBill({ client: a.client, account: a.expenseAccount, postingDate: billDate });
  assert.equal(conflictRows(await listReviewQueue(BOB(), { scope: { client_id: a.client } })).length, 1,
    "present before the reversal — otherwise the rest of this cell proves nothing");

  // "REVERSE NOW": the plan lane's own existing door, the window from the flagged due date
  // through its scheduled reversal (the first of the following month) — exactly what the web
  // layer's reverseAccrualNow() sends.
  const reversalWindowTo = await reversalDateOf(a.dueDate);
  const opened = await requestPlanCatchUp(BOB(), { plan: a.plan_id, from: a.dueDate, to: reversalWindowTo });
  assert.ok(opened.admitted >= 1, `the reversal admits once its accrual is on the books (got ${JSON.stringify(opened)})`);

  const after = await listReviewQueue(BOB(), { scope: { client_id: a.client } });
  assert.equal(conflictRows(after).length, 0,
    "gone the moment the reversal is admitted — nobody dismissed it, nothing was cleaned up");
});

test("p938.reverse_now.refuses_when_not_due — while the reversal genuinely is not yet due, the SAME request_plan_catch_up door answers catch_up_in_future rather than pretending", async (t) => {
  if (await gate938(t)) return;
  const dom = await todayDayOfMonth();
  if (dom < 3) { markSkip(); t.skip("today is too early in the month for an earlier-this-month due day"); return; }
  const client = await freshAccrualClient(ALICE(), "middayrefuse");
  const ref = await instructionRef({ client, author: BOB() });
  const earlierDay = dom - 1;
  const from = monthStart(today);
  const to = await monthEndBack(-1); // through the END of next month, so the window covers both
  const particulars = accrual({
    expenseAccount: ACHART.expense, servicePeriodStart: from, servicePeriodEnd: to,
  });
  const c = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "day_of_month", dayOfMonth: earlierDay,
    effectiveFrom: from, effectiveTo: to, timezone: ACCRUAL_TZ,
  });
  assert.ok(c.occurrence?.work_id, "this month's accrual (day-of-month before today) is already due and admitted");
  const dueDate = c.occurrence.due_date;
  await postPlanWork({ work: c.occurrence.work_id, client, author: BOB(), firm: FIRM_A() });
  const billDate = dueDate; // same day, same period
  await postedBill({ client, account: ACHART.expense, postingDate: billDate });

  assert.equal(conflictRows(await listReviewQueue(BOB(), { scope: { client_id: client } })).length, 1,
    "the same-period bill surfaces even though the reversal is not yet due");

  const reversalWindowTo = await reversalDateOf(dueDate);
  await assertPair(CLR.badRequest, "catch_up_in_future",
    () => requestPlanCatchUp(BOB(), { plan: c.plan_id, from: dueDate, to: reversalWindowTo }),
    "reverse-now on a period whose reversal has not arrived yet");
  assert.equal(conflictRows(await listReviewQueue(BOB(), { scope: { client_id: client } })).length, 1,
    "the honest refusal changed nothing -- the row is still there, not silently cleared");
});

// ===========================================================================================
// p938.skip — clara.skip_plan_occurrence.
// ===========================================================================================

test("p938.skip.blocks_scan — skipping the next occurrence stops clara.wake_due_plan_occurrences from ever admitting it, and a later DELIBERATE catch-up naming that exact date can still override it", async (t) => {
  if (await gate938(t)) return;
  const a = await widenedAccrual({ tag: "skipblocks" });
  const before = await occurrenceCount(a.plan_id);
  assert.equal(before, 1, "only the flagged accrual occurrence exists before the skip");

  const skip = await skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate });
  assert.equal(skip.skipped, true);
  assert.equal(skip.due_date, a.nextDue);
  const rows = await occurrenceRows(a.plan_id);
  const marker = rows.find((r) => r.due_date === a.nextDue);
  assert.ok(marker, "a second occurrence row now exists for the skipped date");
  assert.equal(marker.leg, "primary");
  assert.equal(marker.work_id, null, "the marker admits no Work");
  assert.equal(marker.outcome?.state, "skipped");

  // The scan may legitimately admit OTHER due events of this reversing_journal plan (its own
  // flagged accrual's reversal becomes admissible the moment the accrual is posted, one calendar
  // month past effective_to — 0193's own window-ceiling law, unrelated to this skip). What must
  // stay untouched is the ONE row this cell is about: the skip marker itself.
  await wakeDuePlanOccurrences({ limit: 100 });
  const afterScan = (await occurrenceRows(a.plan_id)).find((r) => r.due_date === a.nextDue);
  assert.equal(afterScan.leg, "primary", "the scan did not touch the skip marker's own identity");
  assert.equal(afterScan.work_id, null, "the marker still admits no Work after a scan -- the skip held");
  assert.equal(afterScan.outcome?.state, "skipped", "the marker's outcome is unmoved");

  // OVERRIDE: a DELIBERATE catch-up naming the exact skipped date still admits it.
  const opened = await requestPlanCatchUp(BOB(), { plan: a.plan_id, from: a.nextDue, to: a.nextDue });
  assert.equal(opened.admitted, 1, "a human's explicit catch-up overrides the skip");
  const overridden = (await occurrenceRows(a.plan_id)).find((r) => r.due_date === a.nextDue);
  assert.ok(overridden.work_id, "the overridden occurrence now names a real Work");
});

test("p938.skip.refusals — every named reason, typed", async (t) => {
  if (await gate938(t)) return;
  const a = await widenedAccrual({ tag: "skiprefuse" });

  await assertPair(CLR.badRequest, "invalid_op_key",
    () => skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate, opKey: "" }),
    "an empty op_key");
  await assertPair(CLR.badRequest, "invalid_request",
    () => skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate, reason: "" }),
    "an empty reason");
  await assertPair(CLR.badRequest, "accrual_occurrence_not_found",
    () => skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: "2019-01-31" }),
    "a due date this schedule never reached");

  const first = await skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate });
  assert.equal(first.skipped, true);
  await assertPair(CLR.conflict, "period_already_admitted",
    () => skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate, opKey: opk("p938-skip-again") }),
    "skipping the same next occurrence twice");
});

test("p938.skip.idempotent — the same op_key replays the same answer rather than skipping twice", async (t) => {
  if (await gate938(t)) return;
  const a = await widenedAccrual({ tag: "skipidem" });
  const key = opk("p938-skip-idem");
  const first = await skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate, opKey: key });
  const second = await skipPlanOccurrence(BOB(), { plan: a.plan_id, afterDue: a.dueDate, opKey: key });
  assert.deepEqual(first, second, "a replayed op_key answers identically rather than raising period_already_admitted");
  assert.equal(await occurrenceCount(a.plan_id), 2, "exactly one marker was written, not two");
});

test("p938.role_floor — a caller with no part in the accrual, at the queue's existing viewer floor, sees the row (no new restriction, no widening)", async (t) => {
  if (await gate938(t)) return;
  const a = await postedAccrual({ tag: "rolefloor" });
  const billDate = a.dueDate.slice(0, 8) + "01";
  await postedBill({ client: a.client, account: a.expenseAccount, postingDate: billDate });
  const env = await listReviewQueue(world.users.carol, { scope: { client_id: a.client } });
  assert.equal(conflictRows(env).length, 1,
    "reaches exactly the callers who could already read the queue -- no new floor, no new gap");
});
