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
  occurrenceExtras, primaryEntryFor, postPlanWork,
  todayInPlanZone, todayDayOfMonth, shiftMonths, requestPlanCatchUp,
  CLR, PLAN_REASON, PLAN_KIND, TZ, PLAN_MODEL,
  humanQuery, assertPair,   // #787 — the human correction door, and the (code, reason) pair assertion
} from "./accounting-plans-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";   // #787 — a counted skip for the new cell's two gates

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

/** True when TODAY is the last day of its month — the one calendar shape in which a month-end
 *  reversing plan's LATEST accrual is today's rather than last month's, so the two-legs-outstanding
 *  scenario the reversal cells set up does not exist. A counted skip beats a cell that is only
 *  green 30 days in 31. */
async function isMonthEnd() {
  const r = await rootQuery(
    "select ((date_trunc('month', $1::date) + interval '1 month' - interval '1 day')::date)::text as d",
    [today]);
  return r.rows[0].d === today;
}

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
// p640.occ.reversal — A REVERSING PLAN'S SECOND LEG REVERSES A POSTED ENTRY, AND NAMES IT.
//
// THE LAW THE SECOND REVIEW ROUND WROTE (BLOCKER-1). "Admitted" was never the fact a reversal
// needs, and neither was "not a dead end": a `queued` accrual with zero receipts has posted
// NOTHING, so a reversal admitted behind it is a swapped-sides entry waiting to reverse an entry
// that may never exist — and when the accrual then dies (0184's cancel door, or a settle `failed`
// on a locked period) nothing revokes the reversal Work and the naked leg reaches the ledger. The
// wall is therefore a POSTED accrual: its Work carries a COMMITTED receipt whose journal entry is
// still live, and the reversal's basis and occurrence row both NAME that entry id.
// ===========================================================================================

test("p640.occ.reversal — a reversal is admitted only once its accrual has POSTED, and it NAMES the entry it reverses (with every line's sides exchanged)", async (t) => {
  if (await gatePlans(t)) return;
  if (await isMonthEnd()) {
    t.skip("p640.occ.reversal needs a day that is not the month end, so this month's accrual is still in the future");
    return;
  }
  // A month-end accrual two months back. BOTH of the two events at or before today are
  // outstanding: last month's accrual (its month end) and the reversal of it (the first of this
  // month). The ORDER is the whole claim of this cell — an accrual must have POSTED before
  // anything reverses it.
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
  assert.equal((await receiptsForWork(first[0].work_id)).length, 0, "but it has posted nothing yet");

  // THE WALL. A scan while the accrual is merely QUEUED admits nothing: an admitted accrual is
  // not a posted one.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const second = await occurrenceRows(p.plan_id);
  assert.equal(second.length, 1,
    `a reversal is not due while its accrual has posted nothing; got ${JSON.stringify(second.map((x) => [x.due_date, x.leg]))}`);
  assert.equal(await primaryEntryFor(p.plan_id, first[0].due_date), null,
    "clara._plan_primary_entry answers NULL while the accrual holds no committed receipt");

  // THE HAPPY PATH. The accrual posts; the very next scan admits its reversal, naming that entry.
  const entry = await postPlanWork({ work: first[0].work_id, client: p.client, author: p.author, firm: FIRM_A() });
  assert.equal(await primaryEntryFor(p.plan_id, first[0].due_date), entry,
    "and names the entry once the accrual is on the books");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 2, "the reversal becomes due once its accrual has POSTED");
  const reversal = occ.find((x) => x.leg === "reversal");
  assert.ok(reversal, "the second event is the reversal");
  assert.equal(reversal.due_date, monthStart(today), "a reversal falls on the first of the month after its accrual");
  assert.equal(reversal.period_key, first[0].period_key,
    "the reversal is keyed to its ACCRUAL's period, not to the month it falls in");

  // IT NAMES THE ENTRY — on the row, and in the basis the Work will post under, so the posted
  // reversal is auditable against the entry it reverses.
  const extras = await occurrenceExtras(p.plan_id);
  assert.equal(extras.find((x) => x.leg === "reversal").reverses_entry_id, entry,
    "the occurrence row names the entry this reversal undoes");
  assert.equal(extras.find((x) => x.leg === "primary").reverses_entry_id, null,
    "and an accrual names none: it reverses nothing");
  const listed = await listPlanOccurrences(ALICE(), p.plan_id);
  assert.equal(listed.occurrences.find((x) => x.leg === "reversal").reverses_entry_id, entry,
    "the read surface carries it too");

  const w = await workRow(reversal.work_id);
  // IN THE MEMO, which is the one part of the basis that reaches `clara.journal_entries` — and the
  // one place a FROZEN `.strict()` tool schema lets an id travel (a new top-level basis key made
  // the run's echo fail validation and the Work settle failed/no_effect; measured by
  // packages/runtime/tests/plan-occurrence-e2e.mjs leg 5).
  assert.ok(w.basis.memo.includes(entry),
    `the BASIS the reversal posts under names the entry it reverses (memo=${JSON.stringify(w.basis.memo)})`);
  assert.ok(w.basis.memo.startsWith(p.basis.memo), "…appended to the plan's own memo, never replacing it");
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
// p640.occ.reversal_before_primary — THE ORPHAN WALL (review finding B2, recut on BLOCKER-1's law).
// ===========================================================================================

test("p640.occ.reversal_before_primary — a leader that was down across an accrual admits the ACCRUAL, never its reversal standalone; the reversal follows only once that accrual has POSTED", async (t) => {
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

  // AN ADMITTED ACCRUAL IS STILL NOT A POSTED ONE.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal((await occurrenceRows(p.plan_id)).length, 1,
    "and an ADMITTED accrual does not make its reversal due either — only a posted one does");

  const entry = await postPlanWork({ work: one[0].work_id, client: p.client, author: p.author, firm: FIRM_A() });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const two = await occurrenceRows(p.plan_id);
  assert.equal(two.length, 2, "once the accrual has POSTED its reversal becomes due");
  const rev = two.find((x) => x.leg === "reversal");
  assert.equal(rev.due_date, reversal);
  assert.ok(rev.work_id, "and it is admitted");
  assert.equal((await occurrenceExtras(p.plan_id)).find((x) => x.leg === "reversal").reverses_entry_id, entry);

  // NO BACKFILL, still. The OLDER period's accrual (two months back) and its reversal are left for
  // an explicit catch-up — the scan never walks back.
  const older = `${(await shiftMonths(today, -2)).slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  assert.equal(two.filter((x) => x.due_date === older).length, 0,
    "the missed older accrual is catch-up, not something the scan picks up on its own");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 2, "and a third scan admits nothing further");
});

test("p640.occ.reversal_refusal — the DOOR refuses a reversal whose accrual has posted nothing, records CLR13 reversal_before_primary on the occurrence, and the SAME row is admitted once the accrual is on the books", async (t) => {
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
  assert.equal(refused.events[0].primary_state, "no_occurrence",
    "the refusal says WHICH of the ways the accrual fails to stand behind it");

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

  // A CATCH-UP OVER THE WHOLE WINDOW ADMITS THE ACCRUALS AND STILL REFUSES THE REVERSALS: oldest
  // first is not enough any more, because an accrual admitted one statement earlier has posted
  // nothing.
  const whole = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: today });
  const after = await occurrenceRows(p.plan_id);
  const accruals = after.filter((x) => x.leg === "primary");
  assert.ok(accruals.length >= 2 && accruals.every((x) => x.work_id !== null),
    `every accrual in the window is admitted (got ${JSON.stringify(after.map((x) => [x.due_date, x.leg, x.work_id !== null]))})`);
  const stillRefused = after.find((x) => x.due_date === reversalDay);
  assert.equal(stillRefused.work_id, null,
    `the reversal is STILL refused while its accrual holds no receipt; answer ${JSON.stringify(whole.events)}`);
  assert.equal(stillRefused.outcome.reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(stillRefused.outcome.primary_state, "not_posted",
    "and now for the OTHER reason: the accrual exists and has posted nothing");

  // AND THE SAME ROW BECOMES ADMISSIBLE once its accrual is on the books.
  const lastMonth = await shiftMonths(today, -1);
  const accrualDue = `${lastMonth.slice(0, 7)}-${String(dom).padStart(2, "0")}`;
  const accrual = after.find((x) => x.due_date === accrualDue);
  const entry = await postPlanWork({ work: accrual.work_id, client: p.client, author: p.author, firm: FIRM_A() });
  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(caught.admitted, 1, `the reversal is admitted now that its accrual has posted; got ${JSON.stringify(caught.events)}`);
  const reRead = (await occurrenceRows(p.plan_id)).find((x) => x.due_date === reversalDay);
  assert.ok(reRead.work_id, "the previously refused reversal is admitted on its OWN row, not a second one");
  assert.equal(reRead.id, stillRefused.id, "the same row: the identity of a due event never moves");
  assert.equal(reRead.outcome.state, "admitted");
  assert.equal((await occurrenceExtras(p.plan_id)).find((x) => x.id === reRead.id).reverses_entry_id, entry);
});

// ===========================================================================================
// p640.occ.reversal_after_cancel — THE REVIEWER'S MEASURED SEQUENCE, END TO END (BLOCKER-1).
//
//   scan #1 -> the accrual is admitted: queued, zero receipts
//   scan #2 -> the reversal must NOT be admitted. Before this round it WAS, and the Work it
//              created outlived the accrual's death to post `Dr 1150 / Cr 6100` reversing nothing.
//   cancel  -> the accrual is terminal with no receipt, and there is no reversal Work to revoke.
// ===========================================================================================

test("p640.occ.reversal_after_cancel — a reversal is never admitted behind an unposted accrual, so an accrual a human later CANCELS leaves no reversal Work behind to post a naked leg", async (t) => {
  if (await gatePlans(t)) return;
  if (await isMonthEnd()) {
    t.skip("p640.occ.reversal_after_cancel needs a day that is not the month end");
    return;
  }
  const p = await plan({
    tag: "occrevcancel", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly accrued insurance",
  });
  const reversalDay = monthStart(today);

  // SCAN #1 — the accrual, queued, nothing posted.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  assert.equal(first.length, 1);
  assert.equal(first[0].leg, "primary");
  const accrualDue = first[0].due_date;
  const accrualWork = first[0].work_id;
  assert.ok(accrualWork);
  assert.equal((await workRow(accrualWork)).status, "queued");
  assert.equal((await receiptsForWork(accrualWork)).length, 0);

  // SCAN #2 — THE STEP THAT USED TO ADMIT THE NAKED LEG. Nothing may be admitted: the accrual has
  // posted nothing, so there is no entry for a reversal to name.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const afterSecond = await occurrenceRows(p.plan_id);
  assert.equal(afterSecond.length, 1,
    `a reversal must not be admitted while its accrual is merely QUEUED; got ${JSON.stringify(afterSecond.map((x) => [x.due_date, x.leg]))}`);
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.accounting_work w join clara.accounting_plan_occurrences o on o.work_id=w.id where o.plan_id=$1 and o.leg='reversal'", [p.plan_id])).rows[0].n,
    0,
    "no reversal Work exists to outlive the accrual's death",
  );

  // THE ACCRUAL DIES. There was no reversal Work to revoke, which is the whole point.
  await cancelAccountingWork({ work: accrualWork, author: ALICE() });
  assert.equal((await workRow(accrualWork)).status, "cancelled");
  assert.equal((await receiptsForWork(accrualWork)).length, 0, "nothing was posted for the accrual");
  assert.equal(await primaryEntryFor(p.plan_id, accrualDue), null);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const afterScan = await occurrenceRows(p.plan_id);
  assert.equal(afterScan.length, 1,
    `a reversal behind a cancelled accrual is not a due event; got ${JSON.stringify(afterScan.map((x) => [x.due_date, x.leg]))}`);

  // AND NEITHER MAY THE HUMAN CATCH-UP DOOR, which is the other way to the naked leg.
  const refused = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(refused.admitted, 0, `nothing is admitted; got ${JSON.stringify(refused.events)}`);
  const reversalRow = (await occurrenceRows(p.plan_id)).find((x) => x.leg === "reversal");
  assert.ok(reversalRow, "the refused due event is RECORDED rather than silent");
  assert.equal(reversalRow.work_id, null);
  assert.equal(reversalRow.outcome.reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(reversalRow.outcome.code, CLR.conflict);

  // ONCE THE ACCRUAL IS RE-ATTEMPTED **AND POSTED** (review finding S7's own exit), the reversal
  // becomes admissible again — on its own row, with no second row anywhere.
  const redo = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: accrualDue, to: accrualDue });
  assert.equal(redo.admitted, 1, `the cancelled accrual is re-admitted; got ${JSON.stringify(redo.events)}`);
  const redone = (await occurrenceRows(p.plan_id)).find((x) => x.due_date === accrualDue);
  assert.equal(redone.attempt, 2);
  assert.notEqual(redone.work_id, accrualWork);

  const stillNothing = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(stillNothing.admitted, 0,
    "a RE-ADMITTED accrual is still not a posted one — the wall is the receipt, not the Work row");

  const entry = await postPlanWork({ work: redone.work_id, client: p.client, author: p.author, firm: FIRM_A() });

  // THE SCAN STILL DOES NOT RETRY A RECORDED REFUSAL — that is §C's own law, and it holds here
  // too: the reversal's row exists, so the picker passes over it and a human decides.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const stillRefused = (await occurrenceRows(p.plan_id)).find((x) => x.leg === "reversal");
  assert.equal(stillRefused.work_id, null, "the scan does not re-attempt a refusal it already recorded");

  // AN EXPLICIT CATCH-UP DOES, and admits it on the row the refusal was recorded on.
  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(caught.admitted, 1, `the reversal is admitted now that its accrual has posted; got ${JSON.stringify(caught.events)}`);
  const done = await occurrenceRows(p.plan_id);
  assert.equal(done.length, 2, "one accrual row and one reversal row, no more");
  const rev = done.find((x) => x.leg === "reversal");
  assert.equal(rev.id, reversalRow.id, "the reversal was admitted on the row its refusal was recorded on");
  assert.ok(rev.work_id);
  assert.equal(rev.due_date, reversalDay);
  assert.equal((await occurrenceExtras(p.plan_id)).find((x) => x.id === rev.id).reverses_entry_id, entry,
    "and it names the entry that finally exists to be reversed");
});

// ===========================================================================================
// p640.occ.reversal_stopping — 0184's TRANSIENT `stopping` IS NOT A STANDING ACCRUAL (NOTE-2).
// ===========================================================================================

test("p640.occ.reversal_stopping — an accrual whose run is STOPPING has posted nothing, so it neither makes its reversal admissible nor is re-attemptable", async (t) => {
  if (await gatePlans(t)) return;
  if (await isMonthEnd()) {
    t.skip("p640.occ.reversal_stopping needs a day that is not the month end");
    return;
  }
  const p = await plan({
    tag: "occrevstop", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly accrued utilities",
  });
  const reversalDay = monthStart(today);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  assert.equal(first.length, 1);
  const accrualWork = first[0].work_id;

  // A LIVE run, then a cancel request: 0184 writes `stopping` rather than a terminal, because the
  // run may still be holding the pen.
  const w = await workRow(accrualWork);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p640-stop") });
  await cancelAccountingWork({ work: accrualWork, author: ALICE() });
  assert.equal((await workRow(accrualWork)).status, "stopping",
    "0184 says `stopping` while an admitted run is still settling");
  assert.equal((await receiptsForWork(accrualWork)).length, 0);

  // NOT STANDING. `stopping` is on its way to cancelled and has posted nothing.
  assert.equal(await primaryEntryFor(p.plan_id, first[0].due_date), null);
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal((await occurrenceRows(p.plan_id)).length, 1,
    "a reversal behind a STOPPING accrual is not a due event");
  const refused = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(refused.admitted, 0, `and the door refuses it too; got ${JSON.stringify(refused.events)}`);

  // AND NEITHER IS IT RE-ATTEMPTABLE. A `stopping` Work is not terminal: re-admitting the period
  // now could put two Works on one period, one of which may still post.
  const redo = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: first[0].due_date, to: first[0].due_date });
  assert.equal(redo.admitted, 0, "a STOPPING accrual is not re-attempted");
  assert.equal(redo.events[0].converged, true, "the catch-up converges on the Work already there");
  assert.equal((await occurrenceRows(p.plan_id)).find((x) => x.leg === "primary").attempt, 1,
    "and the attempt counter did not move");
});

// ===========================================================================================
// p640.occ.reversal_entry_reversed — THE ACCRUAL'S ENTRY MUST STILL BE LIVE AT ADMISSION.
// ===========================================================================================

test("p640.occ.reversal_entry_reversed — an accrual entry that has itself been reversed is not something to reverse again", async (t) => {
  if (await gatePlans(t)) return;
  if (await isMonthEnd()) {
    t.skip("p640.occ.reversal_entry_reversed needs a day that is not the month end");
    return;
  }
  const p = await plan({
    tag: "occreventry", kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: "Monthly accrued licence fee",
  });
  const reversalDay = monthStart(today);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  const entry = await postPlanWork({ work: first[0].work_id, client: p.client, author: p.author, firm: FIRM_A() });
  assert.equal(await primaryEntryFor(p.plan_id, first[0].due_date), entry);

  // THE ESTATE'S OWN COLUMN, written directly: `clara.journal_entries.reversed_by` is what every
  // correction lane in the estate sets when an entry is undone (0004/0007/0009/0027), and this
  // battery has no correction door of its own to walk. A FIXTURE shortcut around an absent
  // writer, stated as one.
  await rootQuery(
    "update clara.journal_entries set reversed_by=$1, reversal_reason='reversed by the rig' where id=$1",
    [entry]);
  assert.equal(await primaryEntryFor(p.plan_id, first[0].due_date), null,
    "an entry that has itself been reversed is no longer a live accrual to reverse");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal((await occurrenceRows(p.plan_id)).length, 1, "so the scan admits no reversal");
  const refused = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: reversalDay, to: today });
  assert.equal(refused.admitted, 0, `and the door refuses it; got ${JSON.stringify(refused.events)}`);
  assert.equal(refused.events[0].reason, PLAN_REASON.reversalBeforePrimary);
  assert.equal(refused.events[0].primary_state, "entry_not_live",
    "naming the third way an accrual can fail to stand behind its reversal");
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
  // The accruals first — and then they must POST, because after BLOCKER-1 a reversal reverses an
  // entry rather than an admission.
  await requestPlanCatchUp(ALICE(), { plan: created.plan_id, from, to: today });
  const admitted = await occurrenceRows(created.plan_id);
  const finalAccrual = admitted.find((x) => x.leg === "primary" && x.due_date === lastAccrual);
  assert.ok(finalAccrual?.work_id, `the final accrual is admitted (got ${JSON.stringify(admitted.map((x) => [x.due_date, x.leg]))})`);
  const entry = await postPlanWork({ work: finalAccrual.work_id, client, author: ALICE(), firm: FIRM_A() });

  const caught = await requestPlanCatchUp(ALICE(), { plan: created.plan_id, from, to: today });
  const occ = await occurrenceRows(created.plan_id);
  const legs = occ.filter((x) => x.work_id !== null).map((x) => `${x.leg}@${x.due_date}`);
  assert.ok(
    legs.includes(`reversal@${monthStart(today)}`),
    `the final accrual's REVERSAL is admitted too — an authority that ends on the last accrual must still let that accrual be undone (got ${JSON.stringify(legs)}, answer ${JSON.stringify(caught.events)})`,
  );
  assert.equal(
    (await occurrenceExtras(created.plan_id)).find((x) => x.leg === "reversal" && x.due_date === monthStart(today)).reverses_entry_id,
    entry,
    "and the final reversal names the entry it undoes",
  );
});

// ===========================================================================================
// p640.occ.attempts — EVERY ATTEMPT STAYS REACHABLE FROM THE PLAN (review finding SHOULD-2).
// ===========================================================================================

test("p640.occ.attempts — a superseded attempt's Work is still named by the occurrence and still resolves to its plan", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "occattempt", purpose: "Monthly software subscription" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  const firstWork = first[0].work_id;
  assert.ok(firstWork);

  await cancelAccountingWork({ work: firstWork, author: ALICE() });
  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: first[0].due_date, to: first[0].due_date });
  assert.equal(caught.admitted, 1);
  const row = (await occurrenceRows(p.plan_id)).find((x) => x.id === first[0].id);
  assert.equal(row.attempt, 2);
  assert.notEqual(row.work_id, firstWork);

  // THE LIST DOOR NAMES BOTH. Before this round the cancelled Work dropped out of the plan's view
  // entirely and only clara.audit_log remembered it.
  const listed = await listPlanOccurrences(ALICE(), p.plan_id);
  const o = listed.occurrences.find((x) => x.occurrence_id === first[0].id);
  assert.ok(Array.isArray(o.attempts), "the occurrence carries its attempts");
  assert.equal(o.attempts.length, 2, `both admissions are named; got ${JSON.stringify(o.attempts)}`);
  assert.equal(o.attempts[0].work_id, firstWork, "the FIRST attempt is the cancelled Work");
  assert.equal(o.attempts[0].attempt, 1);
  assert.equal(o.attempts[1].work_id, row.work_id, "the second is the live one");
  assert.equal(o.attempts[1].attempt, 2);
  assert.match(o.attempts[1].intent_key, /:a2$/);

  // AND THE SUPERSEDED WORK STILL RESOLVES TO ITS PLAN. `get_work_plan_origin(old)` answered null
  // before this round, so B3's Work detail could not say where a cancelled plan Work came from.
  const old = await getWorkPlanOrigin(ALICE(), firstWork);
  assert.ok(old, "a superseded attempt's Work still knows which plan created it");
  assert.equal(old.plan_id, p.plan_id);
  assert.equal(old.superseded, true, "and says it has been superseded");
  assert.equal(old.attempt, 1);
  assert.equal(old.work_id, row.work_id, "naming the attempt that replaced it");

  const live = await getWorkPlanOrigin(ALICE(), row.work_id);
  assert.equal(live.superseded, false);
  assert.equal(live.attempt, 2);
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

// #787 ---------------------------------------------------------------------------------------
// ===========================================================================================
// p640.occ.reversal_post_liveness — THE POST-TIME WALL (#787).
//
// The residual #640 measured and accepted: the admission wall re-reads the accrual's liveness,
// and NOTHING reads it again between that admission and the reversal's posting. A human who
// reverses the accrual inside that gap used to leave the plan's reversal free to post a SECOND
// reversal of one accrual — balances standing for nothing.
//
// Migration 0204's fifth recut of `clara._record_journal_entry_core` re-asks 0193's OWN question
// (`clara._plan_primary_entry`, approved AND not reversed) at the write, under the same
// "no committed receipt for this Work" condition every other refusal arm in that body carries.
//
// THREE LEGS IN ONE CELL, because they are one claim about one door:
//   1 · the reviewer's exact sequence REFUSES, and the ledger keeps exactly one reversal;
//   2 · the CONTROL leg — a reversal whose entry is still live posts through the same door;
//   3 · the REPLAY leg — a reversal Work that already holds a committed receipt gets its stored
//       result back even after the accrual is reversed, because a replay is not a new post.
// ===========================================================================================

/** 0204's STABLE STEM. The cell asserts a wall that only exists from that migration on, so on a
 *  database pinned earlier it SKIPS (counted) rather than failing. */
const REVERSAL_LIVENESS_STEM = "record_journal_entry_core_reversal_liveness$";
let _revLiveReady = null;
async function reversalLivenessReady() {
  if (_revLiveReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [REVERSAL_LIVENESS_STEM]);
      _revLiveReady = r.rows[0].n > 0;
    } catch {
      _revLiveReady = false;
    }
  }
  return _revLiveReady;
}
async function gateReversalLiveness(t) {
  if (await reversalLivenessReady()) return false;
  markSkip();
  t.skip(`#787 post-time reversal-liveness wall absent (no ${REVERSAL_LIVENESS_STEM} migration applied)`);
  return true;
}

/** Post a plan occurrence's Work by hand, returning the wake verb's own answer (or letting it
 *  raise) — `postPlanWork` settles the Work and swallows the answer, and these legs assert on
 *  the REFUSAL and on the `replayed` flag. */
async function attemptPost({ work, client, author }) {
  const w = await workRow(work);
  if (w.status === "queued") await claimWorkRun({ task: w.current_task_id, runId: opk("p787-post") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: author, client });
  return wakeRecordJournalEntry(obo.secret, {
    client, work, logicalOpId: w.logical_op_id, basis: w.basis,
  });
}

/** The human's own correction door (0009), which is what opens the gap this cell closes. */
async function humanReverse(entry, tag) {
  const r = await humanQuery(ALICE(),
    "select clara.reverse_entry(p_entry => $1::uuid, p_reason => $2::text,"
    + " p_op_key => $3::text) as result",
    [entry, `#787 ${tag}: posted in error`, opk(`p787-${tag}`)]);
  return r.rows[0].result;
}

/** A reversing plan whose accrual has POSTED and whose reversal is ADMITTED — the state the
 *  reviewer's sequence starts from. Returns the accrual entry and the reversal occurrence. */
async function admittedReversal(tag) {
  const p = await plan({
    tag, kind: PLAN_KIND.reversing, monthsBack: 2,
    dayRule: "last_day_of_month", dayOfMonth: null, purpose: `#787 ${tag} accrual`,
  });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const accrual = (await occurrenceRows(p.plan_id))[0];
  assert.equal(accrual.leg, "primary", `${tag}: the accrual goes first`);
  const entry = await postPlanWork({
    work: accrual.work_id, client: p.client, author: p.author, firm: FIRM_A() });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const reversal = (await occurrenceRows(p.plan_id)).find((x) => x.leg === "reversal");
  assert.ok(reversal?.work_id, `${tag}: the reversal is admitted once its accrual has posted`);
  assert.equal(
    (await occurrenceExtras(p.plan_id)).find((x) => x.leg === "reversal").reverses_entry_id, entry,
    `${tag}: and it NAMES the entry it undoes`);
  return { p, accrual, entry, reversal };
}

test("p640.occ.reversal_post_liveness — a human reversing the accrual between admission and posting makes the plan's reversal REFUSE at the write (one reversal on the books, no receipt), while a live accrual still posts and a committed replay is unaffected", async (t) => {
  if (await gatePlans(t)) return;
  if (await gateReversalLiveness(t)) return;
  if (await isMonthEnd()) {
    markSkip();
    t.skip("p640.occ.reversal_post_liveness needs a day that is not the month end, so this month's accrual is still in the future");
    return;
  }

  // ---- LEG 1 · THE REVIEWER'S SEQUENCE -----------------------------------------------------
  const a = await admittedReversal("occrevpost");
  const mirror = await humanReverse(a.entry, "gap");
  assert.equal(mirror.status, "approved",
    `the rig's accrual is below the firm's high-stakes ceiling, so the human's mirror is auto-approved and the accrual is marked reversed (got ${JSON.stringify(mirror)})`);
  assert.equal(await primaryEntryFor(a.p.plan_id, a.accrual.due_date), null,
    "the accrual is no longer a live entry to reverse — which is the fact the admission wall read and nothing re-read");

  const { detail } = await assertPair(CLR.badRequest, PLAN_REASON.reversalBeforePrimary,
    () => attemptPost({ work: a.reversal.work_id, client: a.p.client, author: a.p.author }),
    "p640.occ.reversal_post_liveness");
  assert.equal(detail.primary_state, "entry_not_live",
    "the admission side's own words for this fact, not a second name for it");
  assert.equal(detail.entry_id, a.entry, "and the detail names the entry that is no longer live");

  const receipts = await receiptsForWork(a.reversal.work_id);
  assert.equal(receipts.filter((r) => r.outcome === "committed").length, 0,
    "the plan's reversal Work holds NO committed operation receipt: it posted nothing");
  const reversing = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where reversal_of=$1", [a.entry]);
  assert.equal(reversing.rows[0].n, 1,
    "exactly ONE reversing entry stands against the accrual — the human's mirror, and no phantom beside it");
  const ledger = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [a.p.client]);
  assert.equal(ledger.rows[0].n, 2,
    "the client's ledger holds the accrual and the human's reversal, and nothing else");

  // ---- LEG 2 · THE CONTROL LEG, and ---- LEG 3 · THE REPLAY ---------------------------------
  const b = await admittedReversal("occrevlive");
  const posted = await attemptPost({ work: b.reversal.work_id, client: b.p.client, author: b.p.author });
  assert.equal(posted.replayed, false, "a reversal whose named entry is STILL live posts through the same door");
  assert.ok(posted.entry_id, "…and names the entry it wrote");
  assert.equal((await receiptsForWork(b.reversal.work_id)).filter((r) => r.outcome === "committed").length, 1,
    "with exactly one committed receipt");

  // The accrual is reversed by a human AFTER the plan's reversal committed. A replay of that
  // committed step must still answer with the stored result: the new arm sits under the same
  // no-committed-receipt condition every other refusal arm in this body carries.
  const late = await humanReverse(b.entry, "late");
  assert.equal(late.status, "approved");
  const replay = await attemptPost({ work: b.reversal.work_id, client: b.p.client, author: b.p.author });
  assert.equal(replay.replayed, true,
    "a run that committed and died re-executes its step and gets its ORIGINAL receipt back, never the new refusal");
  assert.equal(replay.entry_id, posted.entry_id, "…the same entry, not a second one");
});
// #787 ---------------------------------------------------------------------------------------
