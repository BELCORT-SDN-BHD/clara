// #640 — A PLAN'S DUE EVENT INITIATES WORK, EXACTLY ONCE.
//
// The one claim this battery exists to prove: A DUE EVENT ADMITS ONE ACCOUNTING WORK, through
// 0178's own door, under the authorising human's live authority — and a second scan of the same
// due event converges on the first instead of making a second Work or a second effect.
//
// Everything else here (pause blocking future admission without touching an in-flight Work, the
// reversal leg, the Work's plan origin) is a consequence of that one claim.
//
// CONTRACT-BLIND against #640's own contract, frontier-gated on the `accounting_plans$` stem.
//
// THE SCAN IS GLOBAL, SO EVERY ASSERTION IS PER PLAN. `clara.wake_due_plan_occurrences` sweeps
// every active plan in the database, including ones sibling cells (and the sibling FILE) left
// behind. No cell here asserts on the scan's TOTALS; each asserts on its own plan's occurrence
// rows, and the limit is raised well above the number of plans this package can create so a
// sibling plan can never starve the plan under test out of one call's batch.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gatePlans, assertPlanCohortPresent, buildWorkWorld, freshWorkClient, endPool,
  printLaneNotes, printSkipCount, opk, rootQuery, ROLES, namedCall, basis,
  admitJournalWork, claimWorkRun, settleWorkRun, mintClientObo, wakeRecordJournalEntry,
  workRow, taskRow, receiptsForWork, cancelAccountingWork,
  createAccountingPlan, pauseAccountingPlan, resumeAccountingPlan, reviseAccountingPlan,
  previewAccountingPlan, listPlanOccurrences, getWorkPlanOrigin, wakeDuePlanOccurrences,
  planRow, liveRevision, occurrenceRows, occurrenceCount, instructionRef,
  todayInPlanZone, todayDayOfMonth, shiftMonths, requestPlanCatchUp,
  CLR, PLAN_REASON, PLAN_KIND, TZ, PLAN_MODEL,
} from "./accounting-plans-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";

let world = null;
let today = null;
before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
});
after(async () => {
  printLaneNotes("accounting-plan-occurrences");
  printSkipCount("accounting-plan-occurrences");
  await endPool();
});

const ALICE = () => world.users.alice;
const FIRM_A = () => world.firms.A;

/** The scan's batch ceiling for this battery. Deliberately far above the number of plans the
 *  package can leave active, so a sibling cell's plan can never push the plan under test out of
 *  one call's `limit` and turn a real defect into a green "nothing was due". */
const SCAN_LIMIT = 100;

/** The first day of the month `n` months back, as YYYY-MM-DD in the plan timezone. */
const monthStart = (day) => `${day.slice(0, 7)}-01`;

/** A plan on a FRESH client, authorised by a real instruction Work on that same client. Returns
 *  everything a cell needs to address it. */
async function plan({
  sub = ALICE(), tag = "p640", kind = PLAN_KIND.recurring, monthsBack = 2,
  dayRule = "day_of_month", dayOfMonth = 1, frequency = "monthly", effectiveTo = null,
  cents = 120000, purpose = "Monthly office rent accrual", client = null, author = null,
} = {}) {
  const cli = client ?? (await freshWorkClient(sub, tag));
  const who = author ?? sub;
  const ref = await instructionRef({ client: cli, author: who });
  const from = monthStart(await shiftMonths(today, -monthsBack));
  const b = basis({ postingDate: from, cents, memo: `${tag} standing instruction` });
  const answer = await createAccountingPlan(sub, {
    client: cli, kind, purpose, authorityRef: ref, frequency, dayRule, dayOfMonth,
    effectiveFrom: from, effectiveTo, basis: b,
    reversalDayRule: kind === PLAN_KIND.reversing ? "next_period_first_day" : null,
  });
  return { ...answer, client: cli, author: who, effectiveFrom: from, basis: b, ref };
}

// -------------------------------------------------------------------------------------------
// RAW CONNECTIONS. The duplicate-scan cell needs two scans genuinely IN FLIGHT at once behind a
// barrier, which the pooled helpers deliberately cannot express: they commit and reset.
// -------------------------------------------------------------------------------------------

async function rawClient(role = null) {
  const c = await getPool().connect();
  if (role) await c.query(`set role ${role}`);
  else await c.query("reset role");
  return c;
}

async function releaseRaw(c) {
  if (!c) return;
  await c.query("rollback").catch(() => {});
  await c.query("reset role").catch(() => {});
  await c.query("reset all").catch(() => {});
  c.release();
}

const backendPid = async (c) => (await c.query("select pg_backend_pid() as p")).rows[0].p;

/** Poll pg_stat_activity until `pid` is actually WAITING ON A LOCK — the estate's own witness that
 *  a transaction is queued behind a row lock, never a sleep, which asserts nothing. */
async function waitingOnLock(pid, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await rootQuery("select wait_event_type as w from pg_stat_activity where pid=$1", [pid]);
    if (r.rows[0]?.w === "Lock") return true;
    await new Promise((x) => setTimeout(x, 25));
  }
  return false;
}

// ===========================================================================================
// p640.occ.first — ONE DUE EVENT, ONE OCCURRENCE, ONE WORK.
// ===========================================================================================

test("p640.occ.cohort — the accounting-plan lane is present (a focused run must not skip in silence)", async (t) => {
  if (await assertPlanCohortPresent(t)) return;
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in
        ('create_accounting_plan','revise_accounting_plan','pause_accounting_plan',
         'resume_accounting_plan','end_accounting_plan','request_plan_catch_up',
         'preview_accounting_plan','list_accounting_plans','get_accounting_plan',
         'list_accounting_plan_occurrences','get_work_plan_origin','wake_due_plan_occurrences')`);
  assert.equal(r.rows[0].n, 12, "all twelve #640 doors must resolve");
});

test("p640.occ.first — a plan whose authority already started admits EXACTLY ONE occurrence and ONE Work, keyed plan:<plan>:r1:<due_date>", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occfirst" });
  const due = monthStart(today);

  const scan = await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.ok(scan.scanned >= 1, "the scan must have looked at at least this plan");

  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1, `exactly one occurrence, got ${JSON.stringify(occ.map((o) => o.due_date))}`);
  assert.equal(occ[0].due_date, due, "the occurrence is THIS month's due day, not a backfill of the months since effective_from");
  assert.equal(occ[0].leg, "primary");
  assert.equal(occ[0].revision, 1);
  assert.equal(occ[0].intent_key, `plan:${p.plan_id}:r1:${due}`);
  assert.equal(occ[0].outcome.state, "admitted");
  assert.ok(occ[0].work_id, "the occurrence names its Work");
  assert.ok(occ[0].admitted_at, "an admitted occurrence carries its admission instant");

  const w = await workRow(occ[0].work_id);
  assert.equal(w.purpose, "journal_entry", "the plan link lives on the occurrence; the Work's purpose stays journal_entry");
  assert.equal(w.status, "queued");
  assert.equal(w.client_id, p.client);
  assert.equal(w.initiator, p.author, "the Work executes under the plan's authorising human");
  assert.equal(w.initiated_by, p.author, "and that human is also who asked");
  assert.equal(w.intent_key, `plan:${p.plan_id}:r1:${due}`);
  assert.equal(w.logical_op_id, `work:${occ[0].work_id}:journal_entry:1`);
  assert.equal(w.basis_origin, "user_direct");
  assert.equal(w.basis.posting_date, due, "the occurrence posts on its own due date");

  const task = await taskRow(w.current_task_id);
  assert.equal(task.kind, "accounting_work");
  assert.equal(task.model_snapshot, PLAN_MODEL, "the scan records the model the caller said would serve the run");
});

test("p640.occ.no_global_switch — the occurrence admitted while BOTH clara.wake_engine_sources rows are disabled: a plan's authority is its own instruction, and there is no global agentic switch to turn on", async (t) => {
  if (await gatePlans(t)) return;
  const sources = await rootQuery("select source_key, enabled from clara.wake_engine_sources order by source_key");
  assert.ok(sources.rows.length >= 1, "the operator wake-source registry exists (0133)");
  assert.ok(sources.rows.every((r) => r.enabled === false),
    `every operator wake source is still disabled: ${JSON.stringify(sources.rows)}`);

  const p = await plan({ tag: "occnosw" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1,
    "the plan admitted its due occurrence with every operator wake source OFF — so no operator flag gates it");

  // …and no door anywhere in the estate offers a global autonomy switch.
  const fns = await rootQuery(
    `select coalesce(string_agg(p.proname, ',' order by p.proname), '(none)') as names
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and (p.proname like '%enable_agentic%' or p.proname like '%set_autonomy%'
             or p.proname like '%autonomy_mode%' or p.proname like '%enable_plans%')`);
  assert.equal(fns.rows[0].names, "(none)",
    "no global enable-agentic / autonomy door exists anywhere in clara");
});

// ===========================================================================================
// p640.occ.duplicate — TWO SCANS, ONE OCCURRENCE.
// ===========================================================================================

test("p640.occ.duplicate — two scans racing behind a barrier converge on ONE occurrence and ONE Work; the loser names the same work_id with converged:true", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occdup" });
  const due = monthStart(today);

  const blocker = await rawClient();
  const a = await rawClient(ROLES.runtime);
  const b = await rawClient(ROLES.runtime);
  let answers = null;
  try {
    // THE BARRIER: hold the plan row so both scans reach `_plan_admit_occurrence`'s own
    // `for update` and queue there. Without it the two calls could serialise by luck and the cell
    // would assert nothing about a race.
    await blocker.query("begin");
    await blocker.query("select 1 from clara.accounting_plans where id=$1 for update", [p.plan_id]);

    const sql = namedCall("wake_due_plan_occurrences", [
      { name: "p_limit", cast: "int" }, { name: "p_model", cast: "text" },
    ]);
    // THE PIDS ARE READ FIRST. A `pg_backend_pid()` issued after the racing query would queue
    // behind it on the same connection and never answer until the race was already over.
    const pidA = await backendPid(a);
    const pidB = await backendPid(b);
    const pa = a.query(sql, [SCAN_LIMIT, PLAN_MODEL]);
    const pb = b.query(sql, [SCAN_LIMIT, PLAN_MODEL]);
    assert.ok((await waitingOnLock(pidA)) || (await waitingOnLock(pidB)),
      "at least one scan must be queued behind the plan row lock — otherwise this cell proves nothing about a race");

    await blocker.query("commit");
    answers = (await Promise.all([pa, pb])).map((r) => r.rows[0].result);
  } finally {
    await releaseRaw(blocker);
    await releaseRaw(a);
    await releaseRaw(b);
  }

  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1, "exactly ONE occurrence survives two concurrent scans");
  assert.equal(occ[0].due_date, due);

  const works = await rootQuery(
    "select id from clara.accounting_work where client_id=$1 and intent_key=$2",
    [p.client, `plan:${p.plan_id}:r1:${due}`]);
  assert.equal(works.rows.length, 1, "exactly ONE Work carries the due event's intent key");
  assert.equal(works.rows[0].id, occ[0].work_id);

  const mine = answers.flatMap((x) => x.occurrences.filter((o) => o.plan_id === p.plan_id));
  assert.equal(mine.length, 2, "both scans reported on this plan");
  const admitted = mine.filter((o) => o.admitted === true);
  const converged = mine.filter((o) => o.converged === true);
  assert.equal(admitted.length, 1, `exactly one scan admitted: ${JSON.stringify(mine)}`);
  assert.equal(converged.length, 1, `exactly one scan converged: ${JSON.stringify(mine)}`);
  assert.equal(converged[0].work_id, admitted[0].work_id,
    "the loser names the SAME Work the winner admitted — a converge, never a second identity");
});

// ===========================================================================================
// p640.occ.pause_race — PAUSE BLOCKS FUTURE ADMISSION AND TOUCHES NOTHING IN FLIGHT.
// ===========================================================================================

test("p640.occ.pause_race — pause answers paused, leaves the in-flight Work running, blocks the next scan, and the in-flight Work still settles completed with its receipt", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occpause" });
  const due = monthStart(today);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ0 = await occurrenceRows(p.plan_id);
  assert.equal(occ0.length, 1);
  const work = occ0[0].work_id;

  // The run is live.
  const w0 = await workRow(work);
  await claimWorkRun({ task: w0.current_task_id, runId: opk("p640-run") });
  assert.equal((await workRow(work)).status, "running");

  const paused = await pauseAccountingPlan(ALICE(), { plan: p.plan_id });
  assert.equal(paused.status, "paused");
  assert.equal(paused.changed, true);
  assert.equal((await planRow(p.plan_id)).status, "paused");

  // PAUSE IS NOT CANCEL. The in-flight Work is untouched: same status, same task, no cancel
  // request, no `stopping` mirror.
  const w1 = await workRow(work);
  assert.equal(w1.status, "running", "pausing a plan never cancels an already admitted Work");
  const task1 = await taskRow(w1.current_task_id);
  assert.equal(task1.status, "running");
  assert.notEqual(task1.status, "cancel_requested");

  // "THE NEXT SCAN IS BLOCKED" NEEDS AN OUTSTANDING DUE EVENT, and it cannot be this plan's: its
  // current period has already run, and after review finding B1 a revised due day inside the SAME
  // period is `period_already_admitted` rather than a fresh event. So the claim is made on a SECOND
  // plan of the same client whose own period has never been admitted — paused before any scan
  // reaches it, then resumed.
  const blocked = await plan({ tag: "occpause2", client: p.client });
  await pauseAccountingPlan(ALICE(), { plan: blocked.plan_id });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(blocked.plan_id), 0,
    "a paused plan admits nothing, even with its own period outstanding at or before today");
  assert.equal(await occurrenceCount(p.plan_id), 1, "and nothing was re-admitted for the paused sibling either");

  // …and the in-flight Work goes on to complete, with its receipt.
  const obo = await mintClientObo({ firm: FIRM_A(), obo: p.author, client: p.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: p.client, work, logicalOpId: w1.logical_op_id, basis: w1.basis,
  });
  assert.equal(posted.posted, true);
  await settleWorkRun({ task: w1.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });
  const w2 = await workRow(work);
  assert.equal(w2.status, "completed", "the admitted occurrence settled under 0184's own boundary");
  assert.equal((await receiptsForWork(work)).length, 1, "exactly one committed receipt");

  // RESUME UNBLOCKS. The outstanding due event is admitted the moment the plan is active again.
  const resumed = await resumeAccountingPlan(ALICE(), { plan: blocked.plan_id });
  assert.equal(resumed.status, "active");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ2 = await occurrenceRows(blocked.plan_id);
  assert.equal(occ2.length, 1, "resume admits the outstanding due event");
  assert.equal(occ2[0].due_date, due);
  assert.ok(occ2[0].work_id);
  assert.equal(occ2[0].intent_key, `plan:${blocked.plan_id}:r1:${due}`);

  // AND THE PAUSED PLAN'S OWN REVISION STILL ONLY CHANGES FUTURE PERIODS (review finding B1): a
  // revised due day inside a period that already ran is not a second due event.
  await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 2,
    effectiveFrom: p.effectiveFrom, basis: p.basis,
  });
  assert.equal((await liveRevision(p.plan_id)).revision, 2);
  await resumeAccountingPlan(ALICE(), { plan: p.plan_id });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1,
    "the revision moved the schedule, not the period that had already run");
});

// ===========================================================================================
// p640.occ.reversal — A REVERSING PLAN'S SECOND LEG IS ITS OWN DUE EVENT, WITH THE SIDES SWAPPED.
// ===========================================================================================

test("p640.occ.reversal — the accrual is admitted FIRST and its reversal only on the next scan, with every line's debit and credit exchanged", async (t) => {
  if (await gatePlans(t)) return;
  // A month-end accrual two months back. BOTH of the two events at or before today are
  // outstanding: last month's accrual (its month end) and the reversal of it (the first of this
  // month). The ORDER is the whole claim of this cell — an accrual must exist before anything
  // reverses it.
  const p = await plan({
    tag: "occrev", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly audit fee accrual",
  });

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  assert.equal(first.length, 1, "one due event per scan, even for a two-legged plan");
  assert.equal(first[0].leg, "primary",
    "the ACCRUAL goes first: a reversal admitted ahead of its own accrual would post a swapped-sides entry reversing nothing");
  assert.ok(first[0].work_id, "and it is admitted");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 2, "the reversal becomes due once its accrual has been admitted");
  const reversal = occ.find((x) => x.leg === "reversal");
  assert.ok(reversal, "the second event is the reversal");
  assert.equal(reversal.due_date, monthStart(today), "a reversal falls on the first of the month after its accrual");
  assert.equal(reversal.period_key, first[0].period_key,
    "the reversal is keyed to its ACCRUAL's period, not to the month it falls in");

  const w = await workRow(reversal.work_id);
  const original = p.basis.lines;
  assert.equal(w.basis.lines.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.equal(w.basis.lines[i].account_code, original[i].account_code, "the accounts are unchanged");
    assert.equal(w.basis.lines[i].debit_cents, original[i].credit_cents, `line ${i}: the credit became the debit`);
    assert.equal(w.basis.lines[i].credit_cents, original[i].debit_cents, `line ${i}: the debit became the credit`);
  }
  assert.equal(w.basis.posting_date, reversal.due_date);
});

// ===========================================================================================
// p640.occ.reversal_before_primary — THE ORPHAN WALL (review finding B2).
// ===========================================================================================

test("p640.occ.reversal_before_primary — a leader that was down across an accrual admits the ACCRUAL, never its reversal standalone; the reversal follows on the next scan and the missed older period is left to catch-up", async (t) => {
  if (await gatePlans(t)) return;
  const dayNow = await todayDayOfMonth();
  if (dayNow > 27) {
    // The scenario needs a day-of-month STRICTLY AFTER today inside the 1..28 ceiling, so that
    // this month's accrual is still in the future while last month's reversal has arrived.
    t.skip("p640.occ.reversal_before_primary needs a calendar day <= 27 to place an unreached accrual this month");
    return;
  }
  const dom = dayNow + 1;
  // The reviewer's own scenario: a reversing monthly plan whose authority started two periods ago
  // and whose leader has been down ever since. The LATEST event at or before today is the reversal
  // of LAST month's accrual (the first of this month) — and that accrual was never admitted.
  const p = await plan({
    tag: "occrevorphan", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "day_of_month", dayOfMonth: dom, purpose: "Monthly accrued audit fee",
  });
  const lastMonth = await shiftMonths(today, -1);
  const accrual = `${lastMonth.slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  const reversal = monthStart(today);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const one = await occurrenceRows(p.plan_id);
  assert.equal(one.length, 1, `exactly one occurrence, got ${JSON.stringify(one.map((x) => [x.due_date, x.leg]))}`);
  assert.equal(one[0].leg, "primary", "the ACCRUAL is what a scan admits — never its reversal ahead of it");
  assert.equal(one[0].due_date, accrual, "and it is LAST month's accrual, the latest one at or before today");
  assert.ok(one[0].work_id);
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.accounting_plan_occurrences where plan_id=$1 and leg='reversal'", [p.plan_id])).rows[0].n,
    0,
    "no reversal Work exists yet: there was nothing admitted for it to reverse",
  );

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const two = await occurrenceRows(p.plan_id);
  assert.equal(two.length, 2, "once the accrual is admitted its reversal becomes due");
  const rev = two.find((x) => x.leg === "reversal");
  assert.equal(rev.due_date, reversal);
  assert.ok(rev.work_id, "and it is admitted");

  // NO BACKFILL, still. The OLDER period's accrual (two months back) and its reversal are left for
  // an explicit catch-up — the scan never walks back.
  const older = `${(await shiftMonths(today, -2)).slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  assert.equal(two.filter((x) => x.due_date === older).length, 0,
    "the missed older accrual is catch-up, not something the scan picks up on its own");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 2, "and a third scan admits nothing further");
});

test("p640.occ.reversal_refusal — the DOOR refuses a reversal whose accrual is not admitted, records CLR13 reversal_before_primary on the occurrence, and the SAME row is admitted once the accrual lands", async (t) => {
  if (await gatePlans(t)) return;
  const dayNow = await todayDayOfMonth();
  if (dayNow > 27) {
    t.skip("p640.occ.reversal_refusal needs a calendar day <= 27 to place an unreached accrual this month");
    return;
  }
  const dom = dayNow + 1;
  const p = await plan({
    tag: "occrevdoor", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "day_of_month", dayOfMonth: dom, purpose: "Monthly accrued rent",
  });
  const reversalDay = monthStart(today);

  // A CATCH-UP WINDOW NAMING ONLY THE REVERSAL — the one path a human can reach the naked leg by.
  const refused = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(refused.admitted, 0, "nothing is admitted");
  assert.equal(refused.events.length, 1, "the window named exactly one event");
  assert.equal(refused.events[0].reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(refused.events[0].code, CLR.conflict, "a typed CLR13, not a bare raise");

  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1, "the refused due event is RECORDED — legible, not silent");
  assert.equal(occ[0].leg, "reversal");
  assert.equal(occ[0].work_id, null, "and nothing was admitted for it");
  assert.equal(occ[0].outcome.state, "refused");
  assert.equal(occ[0].outcome.reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(occ[0].outcome.code, CLR.conflict);
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.accounting_work where intent_key=$1", [occ[0].intent_key])).rows[0].n,
    0,
    "no Work carries the refused reversal's intent key",
  );

  // AND THE SAME ROW BECOMES ADMISSIBLE once its accrual exists: a catch-up over the whole window
  // walks oldest-first, so the accrual lands before the reversal is re-attempted.
  const whole = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: today });
  assert.ok(whole.admitted >= 3, `the accruals and the reversals in range are admitted (got ${whole.admitted})`);
  const after = await occurrenceRows(p.plan_id);
  const reRead = after.find((x) => x.due_date === reversalDay);
  assert.ok(reRead.work_id, "the previously refused reversal is admitted on its OWN row, not a second one");
  assert.equal(reRead.id, occ[0].id, "…the same row: the identity of a due event never moves");
  assert.equal(reRead.outcome.state, "admitted");
  assert.ok(after.every((x) => x.work_id !== null), "every occurrence in the window ended up admitted");
});

test("p640.occ.reversal_after_cancel — an accrual whose Work a human CANCELLED leaves nothing to reverse: neither the scan nor a catch-up admits its reversal until the accrual is re-attempted and stands", async (t) => {
  if (await gatePlans(t)) return;
  // The SAME shape as p640.occ.reversal — both of the two events at or before today are
  // outstanding — but the accrual's Work is CANCELLED before the reversal comes up. "Admitted" is
  // not the same fact as "stands": a cancelled Work is terminal with no committed receipt, so the
  // accrual posted nothing and a reversal behind it would swap the sides of an entry that does not
  // exist. This is the same defect review finding B2 named, reached through 0184's cancel door
  // rather than through a leader outage.
  const p = await plan({
    tag: "occrevcancel", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly accrued insurance",
  });
  const reversalDay = monthStart(today);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  assert.equal(first.length, 1);
  assert.equal(first[0].leg, "primary");
  const accrualDue = first[0].due_date;
  const accrualWork = first[0].work_id;
  assert.ok(accrualWork);

  await cancelAccountingWork({ work: accrualWork, author: ALICE() });
  assert.equal((await workRow(accrualWork)).status, "cancelled");
  assert.equal((await receiptsForWork(accrualWork)).length, 0, "nothing was posted for the accrual");

  // THE SCAN MUST NOT SURFACE THE REVERSAL.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const afterScan = await occurrenceRows(p.plan_id);
  assert.equal(afterScan.length, 1,
    `a reversal behind a cancelled accrual is not a due event; got ${JSON.stringify(afterScan.map((x) => [x.due_date, x.leg]))}`);
  assert.equal(afterScan[0].leg, "primary");

  // …AND NEITHER MAY THE HUMAN CATCH-UP DOOR, which is the other way to the naked leg.
  const refused = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(refused.admitted, 0, `nothing is admitted; got ${JSON.stringify(refused.events)}`);
  const reversalRow = (await occurrenceRows(p.plan_id)).find((x) => x.leg === "reversal");
  assert.ok(reversalRow, "the refused due event is RECORDED rather than silent");
  assert.equal(reversalRow.work_id, null);
  assert.equal(reversalRow.outcome.reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(reversalRow.outcome.code, CLR.conflict);

  // ONCE THE ACCRUAL IS RE-ATTEMPTED AND STANDS (review finding S7's own exit), the reversal
  // becomes admissible again — on its own row, with no second row anywhere.
  const redo = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: accrualDue, to: accrualDue });
  assert.equal(redo.admitted, 1, `the cancelled accrual is re-admitted; got ${JSON.stringify(redo.events)}`);
  const redone = (await occurrenceRows(p.plan_id)).find((x) => x.due_date === accrualDue);
  assert.equal(redone.attempt, 2);
  assert.notEqual(redone.work_id, accrualWork);

  // THE SCAN STILL DOES NOT RETRY A RECORDED REFUSAL — that is §C's own law, and it holds here
  // too: the reversal's row exists, so the picker passes over it and a human decides whether the
  // period is still wanted.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const stillRefused = (await occurrenceRows(p.plan_id)).find((x) => x.leg === "reversal");
  assert.equal(stillRefused.work_id, null, "the scan does not re-attempt a refusal it already recorded");

  // AN EXPLICIT CATCH-UP DOES, and admits it on the row the refusal was recorded on.
  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(caught.admitted, 1, `the reversal is admitted now that its accrual stands again; got ${JSON.stringify(caught.events)}`);
  const done = await occurrenceRows(p.plan_id);
  assert.equal(done.length, 2, "one accrual row and one reversal row, no more");
  const rev = done.find((x) => x.leg === "reversal");
  assert.equal(rev.id, reversalRow.id, "the reversal was admitted on the row its refusal was recorded on");
  assert.ok(rev.work_id);
  assert.equal(rev.due_date, reversalDay);
});

test("p640.occ.final_reversal — a plan whose authority ends ON its last accrual still admits that accrual's reversal (review finding S6)", async (t) => {
  if (await gatePlans(t)) return;
  const dayNow = await todayDayOfMonth();
  if (dayNow < 2) {
    t.skip("p640.occ.final_reversal needs a calendar day >= 2 so the final reversal has arrived");
    return;
  }
  const dom = Math.min(dayNow, 28);
  const client = await freshWorkClient(ALICE(), "occfinalrev");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = `${(await shiftMonths(today, -2)).slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  const lastAccrual = `${(await shiftMonths(today, -1)).slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  const b = basis({ postingDate: from, memo: "final reversing accrual" });
  const created = await createAccountingPlan(ALICE(), {
    client, kind: PLAN_KIND.reversing, purpose: "Accrual with a closing authority",
    authorityRef: ref, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: dom,
    effectiveFrom: from, effectiveTo: lastAccrual, basis: b,
    reversalDayRule: "next_period_first_day",
  });
  const caught = await requestPlanCatchUp(ALICE(), { plan: created.plan_id, from, to: today });
  const occ = await occurrenceRows(created.plan_id);
  const legs = occ.filter((x) => x.work_id !== null).map((x) => `${x.leg}@${x.due_date}`);
  assert.ok(legs.includes(`primary@${lastAccrual}`), `the final accrual is admitted (got ${JSON.stringify(legs)})`);
  assert.ok(
    legs.includes(`reversal@${monthStart(today)}`),
    `the final accrual's REVERSAL is admitted too — an authority that ends on the last accrual must still let that accrual be undone (got ${JSON.stringify(legs)}, answer ${JSON.stringify(caught.events)})`,
  );
});

// ===========================================================================================
// p640.occ.origin — THE WORK KNOWS WHICH PLAN CREATED IT, AND A MANUAL WORK DOES NOT PRETEND TO.
// ===========================================================================================

test("p640.occ.origin — get_work_plan_origin names the plan for an occurrence's Work and answers NULL for a Work nobody scheduled", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occorigin", purpose: "Monthly cleaning contract" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1);

  const origin = await getWorkPlanOrigin(ALICE(), occ[0].work_id);
  assert.equal(origin.plan_id, p.plan_id);
  assert.equal(origin.purpose, "Monthly cleaning contract");
  assert.equal(origin.kind, PLAN_KIND.recurring);
  assert.equal(origin.leg, "primary");
  assert.equal(origin.due_date, occ[0].due_date);
  assert.equal(origin.revision, 1);
  assert.equal(origin.authorised_by, p.author);
  assert.equal(origin.authority_kind, "explicit_instruction");

  const manual = await admitJournalWork({ client: p.client, author: ALICE() });
  assert.equal(await getWorkPlanOrigin(ALICE(), manual.work_id), null,
    "a Work nobody scheduled has NO plan origin — the honest answer, never a fabricated one");
});

// ===========================================================================================
// p640.occ.history — THE OCCURRENCE LIST LINKS WORK AND RECEIPT; PREVIEW STAYS HONEST WHEN PAUSED.
// ===========================================================================================

test("p640.occ.history — list_accounting_plan_occurrences links the Work and its receipt, and preview reports admitting:false while the plan is paused", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occhist" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  const work = occ[0].work_id;
  const w = await workRow(work);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p640-hist") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: p.author, client: p.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: p.client, work, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  await settleWorkRun({ task: w.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });

  const listed = await listPlanOccurrences(ALICE(), p.plan_id);
  assert.equal(listed.occurrences.length, 1);
  const row = listed.occurrences[0];
  assert.equal(row.work_id, work);
  assert.equal(row.work_status, "completed");
  assert.ok(row.receipt_id, "the occurrence history carries the committed receipt id");
  assert.equal(row.entry_id, posted.entry_id, "…and the journal entry it produced");
  assert.equal(row.outcome.state, "admitted");

  const preview = await previewAccountingPlan(ALICE(), { plan: p.plan_id, count: 3 });
  assert.equal(preview.admitting, true);
  assert.equal(preview.timezone, TZ);
  assert.equal(preview.occurrences.length, 3, "the preview names the next three due dates");
  assert.ok(preview.occurrences[0].due_date > occ[0].due_date,
    "the preview starts AFTER the last occurrence, never repeating one already run");
  assert.equal(preview.occurrences[0].basis.posting_date, preview.occurrences[0].due_date,
    "each previewed occurrence carries the basis it would post");

  await pauseAccountingPlan(ALICE(), { plan: p.plan_id });
  const paused = await previewAccountingPlan(ALICE(), { plan: p.plan_id, count: 3 });
  assert.equal(paused.admitting, false,
    "a paused plan still SHOWS its schedule and says it is not being admitted — an empty preview would read as 'nothing is scheduled', a different fact");
  assert.equal(paused.occurrences.length, 3);
});
