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
  workRow, taskRow, receiptsForWork,
  createAccountingPlan, pauseAccountingPlan, resumeAccountingPlan, reviseAccountingPlan,
  previewAccountingPlan, listPlanOccurrences, getWorkPlanOrigin, wakeDuePlanOccurrences,
  planRow, liveRevision, occurrenceRows, occurrenceCount, instructionRef,
  todayInPlanZone, shiftMonths, PLAN_KIND, TZ, PLAN_MODEL,
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
  const todayDay = Number(today.slice(8, 10));
  if (todayDay < 3) {
    // The cell needs TWO distinct due days inside the current month (the 1st, already admitted,
    // and a second the revision moves to). Stated rather than silently weakened.
    t.skip("p640.occ.pause_race needs a calendar day >= 3 to have two distinct due days this month");
    return;
  }
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

  // A due day this month that has NO occurrence yet, so "the next scan is blocked" is a real
  // claim rather than a vacuous one.
  await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 2,
    effectiveFrom: p.effectiveFrom, basis: p.basis,
  });
  const rev = await liveRevision(p.plan_id);
  assert.equal(rev.revision, 2);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1,
    "a paused plan admits nothing, even with an unoccupied due day at or before today");

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

  // RESUME UNBLOCKS. The same unoccupied due day is admitted the moment the plan is active again.
  const resumed = await resumeAccountingPlan(ALICE(), { plan: p.plan_id });
  assert.equal(resumed.status, "active");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ2 = await occurrenceRows(p.plan_id);
  assert.equal(occ2.length, 2, "resume admits the outstanding due day");
  const second = occ2.find((o) => o.due_date !== due);
  assert.ok(second, "the second occurrence is a different due day");
  assert.equal(second.revision, 2, "it ran under the LIVE revision, not the superseded one");
  assert.equal(second.intent_key, `plan:${p.plan_id}:r2:${second.due_date}`);
});

// ===========================================================================================
// p640.occ.reversal — A REVERSING PLAN'S SECOND LEG IS ITS OWN DUE EVENT, WITH THE SIDES SWAPPED.
// ===========================================================================================

test("p640.occ.reversal — a reversing plan's latest due event is the previous period's reversal, admitted with every line's debit and credit exchanged", async (t) => {
  if (await gatePlans(t)) return;
  // A month-end accrual two months back: today's latest event is the reversal of LAST month's
  // accrual, dated the first of THIS month.
  const p = await plan({
    tag: "occrev", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly audit fee accrual",
  });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1, "one due event per scan, even for a two-legged plan");
  assert.equal(occ[0].leg, "reversal", "the reversal is the later of the two events at or before today");
  assert.equal(occ[0].due_date, monthStart(today), "a reversal falls on the first of the month after its accrual");

  const w = await workRow(occ[0].work_id);
  const original = p.basis.lines;
  assert.equal(w.basis.lines.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.equal(w.basis.lines[i].account_code, original[i].account_code, "the accounts are unchanged");
    assert.equal(w.basis.lines[i].debit_cents, original[i].credit_cents, `line ${i}: the credit became the debit`);
    assert.equal(w.basis.lines[i].credit_cents, original[i].debit_cents, `line ${i}: the debit became the credit`);
  }
  assert.equal(w.basis.posting_date, occ[0].due_date);
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
