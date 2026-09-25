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
  createAccountingPlan, endAccountingPlan, pauseAccountingPlan, resumeAccountingPlan, PLAN_KIND,
  setClientStatus,
  todayInPlanZone, shiftMonths, ACHART, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import {
  filedDocument, draftEntryV3, billLines, freshResolution, upsertAccountClassed,
} from "./s6-helpers.mjs";
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
const CAROL = () => world.users.carol;
const FIRM_A = () => world.firms.A;

const monthStart = (day) => `${day.slice(0, 7)}-01`;

async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/** The first day of the month AFTER `day`'s. That is the rule 0193 states for a reversal date,
 *  computed here from the calendar so the expectation does not come from the body under test. */
async function monthAfter(day) {
  const r = await rootQuery(
    "select ((date_trunc('month', $1::date) + interval '1 month')::date)::text as d", [day]);
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

// ===========================================================================================
// p1073.scope — "SCOPED TO EXACTLY THE CONFLICTING PERIOD", MEASURED RATHER THAN CLAIMED.
//
// The first draft of this cell tried to show the window admitting MORE than the reversal, on a
// monthly schedule due on the 1st (where `clara._plan_reversal_date` of period k IS period k+1's
// own due date). The estate refuses that schedule outright — `clara._assert_plan_schedule`
// (0193:1611, restated by 0223:512) raises `reversal_collides_with_next_occurrence` for exactly
// that shape, because `unique (plan_id, due_date)` would otherwise refuse the collision as a bare
// 23505. The first assertion below drives that refusal, because it is the REASON the two remedies
// agree on this lane: on every reversing schedule this estate admits, the window "reverse now"
// sends carries exactly two due events, the flagged period's own primary (which converges) and its
// reversal.
//
// So this cell claims what is true: the new remedy adds EXACTLY ONE occurrence, leaves the
// flagged period's own primary row untouched, and the existing remedy adds the same one — and the
// "never a window" guarantee is STRUCTURAL, read off the catalog, rather than a difference visible
// on today's schedules.
// ===========================================================================================

/** Every occurrence of a plan as `leg@due`, sorted — the plan's own record of what it has. */
async function occurrenceKeys(plan) {
  return (await occurrenceRows(plan)).map((o) => `${o.leg}@${o.due_date}`).sort();
}

/** The flagged primary's own identity row, so "untouched" is a comparison of values. */
async function primaryIdentity(plan, due) {
  const o = (await occurrenceRows(plan)).find((x) => x.leg === "primary" && x.due_date === due);
  return o ? { work_id: o.work_id, attempt: o.attempt, revision: o.revision } : null;
}

test("p1073.scope.one_occurrence_only — the new remedy adds EXACTLY the flagged period's reversal, leaves its primary untouched, and never walks a window", async (t) => {
  if (await gate1073(t)) return;

  // 0 · WHY THE TWO REMEDIES AGREE ON THIS LANE AT ALL. The one schedule shape whose reversal
  //     would land on the next accrual's own day is refused by the estate before a plan exists, so
  //     a reversing plan's [due, reversal_date] window can never carry a second primary.
  const probe = await freshAccrualClient(ALICE(), "p1073-scope-probe");
  const probeRef = await instructionRef({ client: probe, author: BOB() });
  const pFrom = monthStart(await shiftMonths(today, -2));
  await assertPair(CLR.badRequest, "reversal_collides_with_next_occurrence",
    () => createAccrualAdjustment(BOB(), {
      client: probe, authorityRef: probeRef,
      accrual: accrual({ servicePeriodStart: pFrom, servicePeriodEnd: monthStart(today) }),
      frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
      timezone: ACCRUAL_TZ, effectiveFrom: pFrom, effectiveTo: monthStart(today),
    }),
    "a monthly reversing accrual due on the 1st");

  // 1 · THE NEW REMEDY ADDS ONE ROW.
  const b = await conflictScene({ tag: "scope-door" });
  const revDue = monthStart(today);
  assert.deepEqual(await occurrenceKeys(b.plan_id), [`primary@${b.dueDate}`],
    "the scene starts with the flagged period's accrual and nothing else");
  const beforeIdentity = await primaryIdentity(b.plan_id, b.dueDate);

  await reversePlanOccurrence(BOB(), { plan: b.plan_id, due: b.row.period });
  assert.deepEqual(await occurrenceKeys(b.plan_id),
    [`primary@${b.dueDate}`, `reversal@${revDue}`].sort(),
    "…and gains exactly one: the flagged period's own reversal");
  assert.deepEqual(await primaryIdentity(b.plan_id, b.dueDate), beforeIdentity,
    "the flagged period's ACCRUAL row is untouched — same Work, same attempt, same revision");

  // 2 · AND THE EXISTING REMEDY ADDS THE SAME ONE, measured on an identical scene rather than
  //     assumed from the ticket's own sentence.
  const a = await conflictScene({ tag: "scope-catchup" });
  await requestPlanCatchUp(BOB(), {
    plan: a.plan_id, from: a.dueDate, to: revDue, opKey: opk("p1073-scope-window"),
  });
  assert.deepEqual(await occurrenceKeys(a.plan_id), await occurrenceKeys(b.plan_id),
    "the window and the single act leave the same occurrence set on this lane");

  // 3 · THE GUARANTEE ITSELF IS STRUCTURAL, not a property of today's schedules: the door's body
  //     reaches no window walker and neither existing remedy, so a future schedule shape or a
  //     future catch-up cap cannot widen it.
  const src = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure",
    ["clara.reverse_plan_occurrence(uuid,date,text)"]);
  const body = src.rows[0].src;
  for (const forbidden of ["clara._plan_due_events(", "clara.request_plan_catch_up(",
                           "clara.skip_plan_occurrence("]) {
    assert.equal(body.includes(forbidden), false,
      `the one-period remedy must not reach ${forbidden}`);
  }
  assert.ok(body.includes("clara._plan_admit_occurrence("),
    "…it admits its one occurrence through the shared core rather than writing a row itself");
});

// ===========================================================================================
// p1073.receipt — A GOVERNED ACT, on the conventions the other two remedies already carry
// (the ticket's third acceptance criterion).
// ===========================================================================================

test("p1073.receipt.idempotent — the remedy writes its own op receipt, a replayed op_key returns the SAME answer and reverses nothing twice, and a second key is refused by name", async (t) => {
  if (await gate1073(t)) return;
  const s = await conflictScene({ tag: "receipt" });
  const key = opk("p1073-receipt");

  const first = await reversePlanOccurrence(BOB(), { plan: s.plan_id, due: s.row.period, opKey: key });
  assert.equal(first.reversed, true);
  const after = await occurrenceCount(s.plan_id);

  // 1 · THE REPLAY. Byte-for-byte the same answer, and nothing new on the plan.
  const replay = await reversePlanOccurrence(BOB(), { plan: s.plan_id, due: s.row.period, opKey: key });
  assert.deepEqual(replay, first, "the replayed key answers with the stored result, not a new act");
  assert.equal(await occurrenceCount(s.plan_id), after,
    "…and the plan gained no second occurrence");

  // 2 · THE RECEIPT ITSELF, read off clara.op_receipts — the same reader #652's own battery uses
  //     for the configuration door's receipt.
  const receipts = (await opReceiptRows(FIRM_A(), key))
    .filter((r) => r.fn === "reverse_plan_occurrence");
  assert.equal(receipts.length, 1, `exactly one receipt for this key (got ${JSON.stringify(receipts)})`);
  assert.equal(receipts[0].finished, true, "…and it carries the door's own finished result");

  // 3 · A DIFFERENT KEY FOR A PERIOD ALREADY REVERSED is not a second reversal. The admission
  //     core CONVERGES (it answers with the occurrence that already exists and no `reason` of its
  //     own); this door names that fact and refuses, the way its sibling names an already-skipped
  //     period.
  await assertPair(CLR.conflict, "reversal_already_admitted",
    () => reversePlanOccurrence(BOB(), { plan: s.plan_id, due: s.row.period, opKey: opk("p1073-again") }),
    "reversing the same period twice under a fresh key");
  assert.equal(await occurrenceCount(s.plan_id), after, "…and still nothing new on the plan");
});

test("p1073.receipt.floor — a viewer cannot book a correcting entry, and the refusal says which of the three ways the floor was missed", async (t) => {
  if (await gate1073(t)) return;
  const s = await conflictScene({ tag: "floor" });
  await assertPair(CLR.authz, "insufficient_role",
    () => reversePlanOccurrence(CAROL(), { plan: s.plan_id, due: s.row.period }),
    "a viewer reversing one period");
  assert.equal(await occurrenceCount(s.plan_id), 1,
    "the refusal wrote nothing: the flagged accrual is still the plan's only occurrence");
  assert.equal(
    conflictRows(await listReviewQueue(BOB(), { scope: { client_id: s.client } })).length, 1,
    "…and the conflict row is still there, not silently cleared");
});

// ===========================================================================================
// p1073.refusals — EVERY WAY THE REMEDY CANNOT ACT IS A TYPED RAISE.
//
// Four of them are the door's own (an empty key, a missing period, a plan that does not reverse,
// a date this schedule never reached); the rest are the admission core's, passed outward under
// the core's own token so no second vocabulary is minted for a fact the estate already names.
// ===========================================================================================

/** An accrual whose term reaches into NEXT month, so the battery has three kinds of period to
 *  name on one plan: one that has posted (the configuration's own), one that is a real due date
 *  whose reversal has NOT arrived (this month's), and one that is a real due date nothing ever
 *  admitted (two months back). */
async function longAccrual({ tag }) {
  const client = await freshAccrualClient(ALICE(), `p1073-${tag}`);
  const ref = await instructionRef({ client, author: BOB() });
  const from = monthStart(await shiftMonths(today, -3));
  const to = await monthEndBack(-1); // NEXT month's month end
  const created = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ expenseAccount: ACHART.expense, servicePeriodStart: from, servicePeriodEnd: to }),
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to,
  });
  return {
    client, plan_id: created.plan_id, admittedDue: created.occurrence?.due_date,
    futureDue: await monthEndBack(0),      // THIS month's end: its reversal is next month's 1st
    unpostedDue: await monthEndBack(2),    // a real due date nothing ever admitted
  };
}

test("p1073.refusals.own — the door's own four: an empty key, a missing period, a plan that does not reverse, and a date this schedule never reached", async (t) => {
  if (await gate1073(t)) return;
  const s = await conflictScene({ tag: "refuse-own" });

  await assertPair(CLR.badRequest, "invalid_op_key",
    () => reversePlanOccurrence(BOB(), { plan: s.plan_id, due: s.row.period, opKey: "" }),
    "an empty op_key");
  await assertPair(CLR.badRequest, "invalid_request",
    () => reversePlanOccurrence(BOB(), { plan: s.plan_id, due: null }),
    "no period named");
  await assertPair(CLR.badRequest, "accrual_occurrence_not_found",
    () => reversePlanOccurrence(BOB(), { plan: s.plan_id, due: "2019-01-15" }),
    "a date this schedule never reached");
  assert.equal(await occurrenceCount(s.plan_id), 1, "none of the three wrote anything");

  // A PLAN THAT DOES NOT REVERSE. ck_plan_revisions_auto_reverse (0193:561) ties `auto_reverse` to
  // plan_kind='reversing_journal', so a recurring journal has no reversal leg in its schedule at
  // all — while `clara._plan_primary_for_reversal` would still resolve one from the date
  // arithmetic alone. Refused here by name, before anything is reserved or written.
  const rClient = await freshAccrualClient(ALICE(), "p1073-recurring");
  const rRef = await instructionRef({ client: rClient, author: BOB() });
  const rFrom = monthStart(await shiftMonths(today, -2));
  const rDue = monthStart(await shiftMonths(today, -1));
  const plan = await createAccountingPlan(BOB(), {
    client: rClient, kind: PLAN_KIND.recurring, purpose: "Monthly recurring journal",
    authorityRef: rRef, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
    timezone: ACCRUAL_TZ, effectiveFrom: rFrom, effectiveTo: monthStart(today),
    basis: {
      posting_date: rFrom, memo: "1073 rig recurring journal", currency: "MYR",
      lines: [
        { account_code: ACHART.expense, debit_cents: 120000, credit_cents: 0 },
        { account_code: ACHART.liability, debit_cents: 0, credit_cents: 120000 },
      ],
    },
    opKey: opk("p1073-recurring"),
  });
  await assertPair(CLR.badRequest, "plan_does_not_reverse",
    () => reversePlanOccurrence(BOB(), { plan: plan.plan_id, due: rDue }),
    "reversing one period of a plan whose schedule has no reversal leg");
});

test("p1073.refusals.core — the admission core's own answers travel outward unchanged: not yet due, nothing posted behind it, and a plan that is no longer active", async (t) => {
  if (await gate1073(t)) return;

  // 1 · NOT YET DUE. This month's own period is a real due date of the schedule, and its scheduled
  //     reversal falls on the FIRST of next month — which is in the future on every day the
  //     battery runs. "Reverse now" refuses the same case as `catch_up_in_future`, naming the
  //     window's end; this door names the OCCURRENCE.
  const a = await longAccrual({ tag: "notyetdue" });
  await assertPair(CLR.badRequest, "not_yet_due",
    () => reversePlanOccurrence(BOB(), { plan: a.plan_id, due: a.futureDue }),
    "a period whose scheduled reversal has not arrived");

  // 2 · THE ORPHAN WALL. A period nothing ever admitted has no posted accrual behind it, so there
  //     is nothing to undo — the core's own wall, reached through this door and named by it.
  await assertPair(CLR.conflict, "reversal_before_primary",
    () => reversePlanOccurrence(BOB(), { plan: a.plan_id, due: a.unpostedDue }),
    "a period whose accrual never posted");

  // 3 · A PLAN THAT IS NO LONGER ACTIVE. Both existing remedies refuse the same two states under
  //     the same two tokens, and the surfaces render a different sentence for each — so this door
  //     must not invent a third.
  const ended = await conflictScene({ tag: "refuse-ended" });
  await endAccountingPlan(BOB(), { plan: ended.plan_id, opKey: opk("p1073-end") });
  await assertPair(CLR.badRequest, "plan_ended",
    () => reversePlanOccurrence(BOB(), { plan: ended.plan_id, due: ended.row.period }),
    "reversing one period of an ended plan");

  // …AND A REFUSAL LEAVES THE KEY FREE. The paused plan refuses under `key`; once it is resumed
  // the SAME key does the real act. That is the whole reason this door RAISES rather than
  // reporting an outcome and committing a receipt for something that did not happen.
  const paused = await conflictScene({ tag: "refuse-paused" });
  await pauseAccountingPlan(BOB(), { plan: paused.plan_id, opKey: opk("p1073-pause") });
  const key = opk("p1073-retry");
  await assertPair(CLR.badRequest, "plan_paused",
    () => reversePlanOccurrence(BOB(), { plan: paused.plan_id, due: paused.row.period, opKey: key }),
    "reversing one period of a paused plan");
  assert.equal(await occurrenceCount(paused.plan_id), 1, "…and it wrote nothing");

  await resumeAccountingPlan(BOB(), { plan: paused.plan_id, opKey: opk("p1073-resume") });
  const done = await reversePlanOccurrence(BOB(), {
    plan: paused.plan_id, due: paused.row.period, opKey: key,
  });
  assert.equal(done.reversed, true, "a key a refusal rolled back is free for the real act");

  // 4 · A CLIENT THAT IS NO LONGER ACTIVE. The fourth arm of the door's own code map, driven
  //     rather than assumed (adversarial round 2026-09-25, ADV-L01-06): the core answers
  //     `client_inactive` for any non-active client status and this door must map it to the same
  //     CLR13 its siblings do, not invent a code for it.
  const dormant = await conflictScene({ tag: "refuse-dormant" });
  await setClientStatus(dormant.client, "archived");
  try {
    await assertPair(CLR.conflict, "client_inactive",
      () => reversePlanOccurrence(BOB(), { plan: dormant.plan_id, due: dormant.row.period }),
      "reversing one period for a client that is no longer active");
  } finally {
    await setClientStatus(dormant.client, "active");
  }
});

test("p1073.refusals.payload_identity — a refusal names an occurrence row only when that row outlives it, and the payload says which case the reader holds", async (t) => {
  if (await gate1073(t)) return;

  // 1 · A REFUSAL THE ADMISSION CORE RECORDED. The orphan wall writes the occurrence row, stamps
  //     the refused outcome on it and returns its id — "legible in the plan's own history" is its
  //     own reason for doing so. This door RAISES, so that write rolls back with the transaction,
  //     and a payload that still named the row would hand a surface an identifier for something it
  //     cannot open (adversarial round 2026-09-25, ADV-L01-01).
  const a = await longAccrual({ tag: "payload" });
  const beforeOrphan = await occurrenceCount(a.plan_id);
  const orphan = await assertPair(CLR.conflict, "reversal_before_primary",
    () => reversePlanOccurrence(BOB(), { plan: a.plan_id, due: a.unpostedDue }),
    "a period whose accrual never posted");
  assert.equal(orphan.detail.occurrence_recorded, false,
    `the recorded-then-rolled-back refusal says so: ${JSON.stringify(orphan.detail)}`);
  assert.equal(Object.prototype.hasOwnProperty.call(orphan.detail, "occurrence_id"), false,
    `…and names no occurrence row: ${JSON.stringify(orphan.detail)}`);
  assert.equal(orphan.detail.primary_state, "no_occurrence",
    "…while every answer the core gave that is still TRUE after the rollback survives");
  assert.equal(await occurrenceCount(a.plan_id), beforeOrphan,
    "…and the plan really did keep nothing");

  // 2 · A REFUSAL THE CORE REACHED BEFORE IT WROTE ANYTHING. A period this plan has already
  //     reversed CONVERGES on a row an earlier transaction committed, so the id is real — and this
  //     cell OPENS it rather than trusting the key.
  const s = await conflictScene({ tag: "payload-converged" });
  const first = await reversePlanOccurrence(BOB(), {
    plan: s.plan_id, due: s.row.period, opKey: opk("p1073-payload-1"),
  });
  assert.equal(first.reversed, true, "the period is reversed once, for real");
  const again = await assertPair(CLR.conflict, "reversal_already_admitted",
    () => reversePlanOccurrence(BOB(), {
      plan: s.plan_id, due: s.row.period, opKey: opk("p1073-payload-2"),
    }),
    "reversing a period this plan has already reversed");
  assert.equal(again.detail.occurrence_recorded, true,
    `the converged refusal says its row was kept: ${JSON.stringify(again.detail)}`);
  const rows = await occurrenceRows(s.plan_id);
  assert.ok(rows.some((r) => r.id === again.detail.occurrence_id),
    `…and the row it names is one a reader can open: ${JSON.stringify(again.detail)}`);
});

test("p1073.history.refusal_record_diverges — the SAME refusal is kept in the plan's history by 'reverse now' and kept by nothing when the one-period remedy raises it", async (t) => {
  if (await gate1073(t)) return;

  // The two remedies this screen offers for one fact answer the same way and leave DIFFERENT
  // durable records, because one commits its receipt either way and the other raises. The
  // adversarial round (2026-09-25, ADV-L01-02) found that difference undocumented and unmeasured;
  // this cell measures it on two identically built scenes so the trade is a decision, not an
  // accident. 0333's header, packages/db/README.md's 0333 section and CONTEXT.md's
  // `accrual_bill_conflict` paragraph all state it.
  const viaWindow = await longAccrual({ tag: "hist-window" });
  const viaDoor = await longAccrual({ tag: "hist-door" });
  const revDue = await monthAfter(viaWindow.unpostedDue);
  assert.equal(revDue, await monthAfter(viaDoor.unpostedDue),
    "the two scenes reverse the same period on the same day");
  const windowBefore = await occurrenceCount(viaWindow.plan_id);
  const doorBefore = await occurrenceCount(viaDoor.plan_id);

  // 1 · "REVERSE NOW" — a catch-up over exactly that reversal day. The orphan wall refuses, the
  //     core RECORDS the refusal on the occurrence, and the receipt commits: the row stays.
  await requestPlanCatchUp(BOB(), {
    plan: viaWindow.plan_id, from: revDue, to: revDue, opKey: opk("p1073-hist-window"),
  });
  const kept = (await occurrenceRows(viaWindow.plan_id))
    .filter((r) => r.leg === "reversal" && r.due_date === revDue);
  assert.equal(kept.length, 1,
    `the window left the refused reversal on the plan (got ${JSON.stringify(kept)})`);
  assert.equal(kept[0].outcome?.state, "refused",
    `…recorded as refused: ${JSON.stringify(kept[0].outcome)}`);
  assert.equal(kept[0].outcome?.reason, "reversal_before_primary", "…under the core's own token");
  assert.equal(kept[0].work_id, null, "…and it admitted no Work");
  assert.equal(await occurrenceCount(viaWindow.plan_id), windowBefore + 1,
    "…so the plan's history gained a row a colleague can read later");

  // 2 · THE ONE-PERIOD REMEDY — the same refusal, raised. The transaction rolls back, which is
  //     what frees the op key, and the record goes with it.
  await assertPair(CLR.conflict, "reversal_before_primary",
    () => reversePlanOccurrence(BOB(), { plan: viaDoor.plan_id, due: viaDoor.unpostedDue }),
    "the same refusal reached through the one-period remedy");
  assert.equal(await occurrenceCount(viaDoor.plan_id), doorBefore,
    "the raised refusal left the plan exactly as it found it");
  assert.equal((await occurrenceRows(viaDoor.plan_id))
    .filter((r) => r.leg === "reversal" && r.due_date === revDue).length, 0,
    "…and in particular no refused reversal for that period");
});

// ===========================================================================================
// p1073.revenue — THE OTHER SIDE (#942). The ticket's own AC2 says "one live expense OR REVENUE
// amount for the period", so the claim is made on both halves of the books.
// ===========================================================================================

/** The revenue side's own two accounts, the pair #942's and #1074's batteries both choose. */
const RCHART = { income: "4000", asset: "1320" };

test("p1073.revenue.one_live_amount — a REVENUE accrual's conflicting period reverses the same way, and the income account is left carrying the invoice's own amount alone", async (t) => {
  if (await gate1073(t)) return;
  const ACCRUED = 300000;
  const INVOICED = 290000;

  const client = await freshAccrualClient(ALICE(), "p1073-revenue");
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.income, name: "Sales / Fees Income", type: "income",
    accountClass: null, opKey: opk("p1073-coa"),
  });
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.asset, name: "Unbilled Receivables (Work-in-Progress)", type: "asset",
    accountClass: null, opKey: opk("p1073-coa"),
  });
  const ref = await instructionRef({ client, author: BOB() });
  const from = monthStart(await shiftMonths(today, -2));
  const to = await monthEndBack(1);
  const created = await createAccrualAdjustment(BOB(), {
    client, purpose: "Monthly unbilled fee accrual", authorityRef: ref,
    accrual: {
      ...accrual({
        expenseAccount: RCHART.income, liabilityAccount: RCHART.asset, cents: ACCRUED,
        servicePeriodStart: from, servicePeriodEnd: to,
        memo: "Accrued fees delivered, not yet invoiced",
      }),
      side: "revenue",
    },
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to,
  });
  const dueDate = created.occurrence.due_date;
  const accrualEntry = await postPlanWork({
    work: created.occurrence.work_id, client, author: BOB(), firm: FIRM_A(),
  });
  assert.deepEqual(await entryLines(accrualEntry),
    [[RCHART.asset, ACCRUED, 0], [RCHART.income, 0, ACCRUED]],
    "the revenue accrual posted Dr accrued income / Cr revenue");

  // THE INVOICE THAT COLLIDES: a document-sourced, approved entry crediting the SAME income
  // account inside the accrued period — the revenue half of the conflict 0304 widened the read to.
  const doc = await filedDocument(BOB(), { firm: FIRM_A(), client });
  const d = await draftEntryV3(BOB(), {
    client,
    resolution: freshResolution(BOB(), client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    lines: billLines(ACHART.bank, RCHART.income, INVOICED, { desc: "1073-invoice" }),
    memo: "1073 rig invoice, inside the accrued period",
    postingDate: `${dueDate.slice(0, 8)}01`, opKey: opk("p1073-inv-draft"),
  });
  await approveEntry(ALICE(), {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p1073-inv-approve"),
  });

  const rows = conflictRows(await listReviewQueue(BOB(), { scope: { client_id: client } }));
  assert.equal(rows.length, 1, `one conflict row on the revenue side (got ${JSON.stringify(rows)})`);
  assert.equal(rows[0].accrual_side, "revenue", "…and the row says which way the accrual runs");
  assert.equal(rows[0].period, dueDate);

  // BEFORE: the period carries BOTH the estimate and the invoice.
  assert.equal(await liveOnAccount(client, RCHART.income), -(ACCRUED + INVOICED),
    "both amounts are live on the income account (credit-side, so negative debit-positive)");

  // THE REMEDY, naming the flagged period.
  const answer = await reversePlanOccurrence(BOB(), { plan: created.plan_id, due: rows[0].period });
  assert.equal(answer.reversed, true);
  const revEntry = await postReversal({
    plan: created.plan_id, client, revDue: monthStart(today),
  });
  assert.deepEqual(await entryLines(revEntry),
    [[RCHART.asset, 0, ACCRUED], [RCHART.income, ACCRUED, 0]],
    "the reversal exchanges the sides of what that period POSTED");

  // AFTER: ONE live revenue amount for the period — the invoice's own.
  assert.equal(await liveOnAccount(client, RCHART.income), -INVOICED,
    "the income account is left carrying the invoice's own amount alone");
  assert.equal(await liveOnAccount(client, RCHART.asset), 0,
    "…and the accrued-income asset nets to zero");
  assert.equal(conflictRows(await listReviewQueue(BOB(), { scope: { client_id: client } })).length, 0,
    "the conflict row cleared itself on the next read");
});
