// #653 — WHAT THE BELT DOES WITH A DERIVED AMORTISATION, AND WHERE A FAILURE BECOMES VISIBLE.
//
// The claims this battery exists to prove:
//
//   1. EACH OCCURRENCE POSTS ITS OWN PERIOD'S AMOUNT. Not the revision's constant, and the FINAL
//      period carries the whole residual — measured through the real scan and the real catch-up
//      door, on the real plan lane, not by reading the stored allocation back.
//   2. A DUE DATE THE ALLOCATION DOES NOT COVER IS A TYPED REFUSAL, never a fall-back.
//   3. TWO SCANS RACING BEHIND A REAL LOCK BARRIER LEAVE ONE OCCURRENCE AND ONE WORK.
//   4. A LOCKED PERIOD IS THE POSTING CORE'S REFUSAL, NOT THE PLAN'S — and the attention read is
//      where that becomes reachable, because the occurrence was ADMITTED and nothing else surfaces
//      a Work that settled refused.
//   5. THE ATTENTION READ'S TWO ARMS REACH TWO DIFFERENT RESIDUES, and neither reaches the other's.
//   6. CATCH-UP IS EXPLICIT, OLDEST FIRST, AND NEVER REACHES BACK PAST THE AUTHORITY.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary BOOKKEEPER — through `humanQuery`. The SCAN runs as
// `clara_runtime`, which is the only lane granted it.
//
// CONTRACT-BLIND against #653's own contract, frontier-gated on the `prepayment_amortisation$` stem.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertPrepaymentCohortPresent, endPool, printLaneNotes, printSkipCount,
  opk, rootQuery, getPool, ROLES, namedCall, CLR, REASON, assertPair,
  prepaymentScene, createPrepaymentSchedule, getPrepaymentSchedule, listPrepaymentAttention,
  reviseAccountingPlan, requestPlanCatchUp, wakeDuePlanOccurrences, occurrenceRows,
  occurrenceCount, recordPeriod, workRow, claimWorkRun, settleWorkRun, mintClientObo,
  wakeRecordJournalEntry, receiptsForWork, deactivateMember, monthEndAfter, monthStartBack,
  closeFiscalYearOf, unapprovedEntry, scheduleRow,
  PREPAY_REASON, PLAN_MODEL,
} from "./prepayment-schedule-fixtures.mjs";
import { EGRESS_REASON } from "./work-egress-fixtures.mjs";

after(async () => {
  printLaneNotes("prepayment-occurrences");
  printSkipCount("prepayment-occurrences");
  await endPool();
});

const SCAN_LIMIT = 100;

/** A scene with a derived schedule already configured, ready for the belt. */
async function scheduled(tag, over = {}) {
  const scene = await prepaymentScene(tag, { cents: 100000, termMonthsBack: 4, termMonths: 3, ...over });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  return { ...scene, ...created, schedule_id: created.schedule_id };
}

/** The positive side of a basis, in cents — the amount ONE occurrence actually posts. */
const charged = (basis) => Number(basis.lines.find((l) => Number(l.debit_cents) > 0).debit_cents);

// RAW CONNECTIONS, the `accounting-plan-occurrences.test.mjs` idiom: the race cell needs two scans
// genuinely IN FLIGHT behind a barrier, which the pooled helpers deliberately cannot express.
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
/** The estate's own witness that a transaction is queued behind a row lock — never a sleep. */
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
// p653.occ — THE PER-PERIOD BASIS, ON THE REAL BELT.
// ===========================================================================================

test("p653.occ.per_period — the scan admits the LATEST due period carrying its OWN amount (the final period's residual), and an explicit catch-up admits the earlier periods oldest-first, each with its own base", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // 100,000 cents over three months: 33,333 / 33,333 / 33,334. The term ends LAST month, so every
  // due date is in the past and the scan's own candidate — the latest due event at or before today
  // — is the FINAL period. That is the arrangement that makes "the residual, not the base"
  // measurable through the belt rather than asserted about the stored rows.
  const s = await scheduled("perperiod");
  const row = await scheduleRow(s.schedule_id);
  const ends = row.period_lines.map((l) => String(l.period_end).slice(0, 10));
  const cents = row.period_lines.map((l) => Number(l.credit_cents));
  assert.deepEqual(cents, [33333, 33333, 33334], "eleven-cent-style residual: the last period eats it");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  let occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 1, "one scan admits ONE due event, not the whole term");
  assert.equal(occ[0].due_date, ends[2], "…the latest due date at or before today: the FINAL period");
  const finalWork = await workRow(occ[0].work_id);
  assert.equal(charged(finalWork.basis), 33334,
    "the final occurrence posts the RESIDUAL, not the base — the whole point of the per-period seam");
  assert.equal(finalWork.basis.posting_date, ends[2]);
  assert.equal(finalWork.basis.lines.length, 2);
  assert.equal(finalWork.basis.lines[0].account_code, s.expense_account_code);
  assert.equal(finalWork.basis.lines[1].account_code, s.prepaid_account_code);

  // THE EARLIER PERIODS ARE A HUMAN'S EXPLICIT CATCH-UP, never the scan's business.
  const catchUp = await requestPlanCatchUp(s.bob, { plan: s.plan_id, from: ends[0], to: ends[2] });
  assert.equal(catchUp.admitted, 2, "the two earlier periods are admitted; the third converges");
  occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 3, "one occurrence per period, no more");
  const byDue = Object.fromEntries(occ.map((o) => [o.due_date, o]));
  for (const [i, due] of ends.entries()) {
    const w = await workRow(byDue[due].work_id);
    assert.equal(charged(w.basis), cents[i],
      `the occurrence due ${due} posts ITS OWN amount (${cents[i]}), not the revision's constant`);
    assert.equal(w.basis.posting_date, due, "…on its own period's month end");
  }
  const total = ends.reduce((a, d, i) => a + cents[i], 0);
  assert.equal(total, 100000, "and the three occurrences together charge the whole prepayment exactly");
});

test("p653.occ.line_missing — a due date the derived allocation does not cover refuses CLR10 amortisation_period_line_missing on the occurrence, admits nothing, and NEVER falls back to the revision's constant", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // A two-month term ending TWO months ago, then a revision that widens the authority window by one
  // month. The widened window produces a due date with no period line behind it — which is exactly
  // what a corrected term would produce if this lane ever let a revision re-derive, and is the
  // reason the fall-back is refused rather than silently constant.
  const s = await scheduled("linemiss", { termMonthsBack: 4, termMonths: 2 });
  const beyond = await monthEndAfter(s.termStart, 2);
  const live = (await getPrepaymentSchedule(s.bob, s.schedule_id)).live_revision;
  await reviseAccountingPlan(s.bob, {
    plan: s.plan_id, frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    effectiveFrom: s.effective_from, effectiveTo: beyond, basis: live.basis,
  });

  const before = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1", [s.client]);
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(s.plan_id);
  const uncovered = occ.find((o) => o.due_date === beyond);
  assert.ok(uncovered, `the scan reached the uncovered due date ${beyond}`);
  assert.equal(uncovered.outcome.state, "refused");
  assert.equal(uncovered.outcome.reason, PREPAY_REASON.periodLineMissing);
  assert.equal(uncovered.outcome.code, "CLR10");
  assert.equal(uncovered.work_id, null, "a refused occurrence names no Work");
  const after = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1", [s.client]);
  assert.equal(after.rows[0].n, before.rows[0].n, "nothing was admitted");
});

test("p653.occ.identity — two scans racing behind a REAL lock barrier leave ONE occurrence and ONE Work, and the loser converges on the same work_id", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const s = await scheduled("identity");
  const row = await scheduleRow(s.schedule_id);
  const due = String(row.period_lines[row.period_lines.length - 1].period_end).slice(0, 10);

  const blocker = await rawClient();
  const a = await rawClient(ROLES.runtime);
  const b = await rawClient(ROLES.runtime);
  let answers = null;
  try {
    // THE BARRIER: hold the plan row so both scans reach `_plan_admit_occurrence`'s own
    // `for update` and queue there. Without it the two calls could serialise by luck and this cell
    // would assert nothing about a race.
    await blocker.query("begin");
    await blocker.query("select 1 from clara.accounting_plans where id=$1 for update", [s.plan_id]);
    const sql = namedCall("wake_due_plan_occurrences", [
      { name: "p_limit", cast: "int" }, { name: "p_model", cast: "text" },
    ]);
    const pidA = await backendPid(a);
    const pidB = await backendPid(b);
    const pa = a.query(sql, [SCAN_LIMIT, PLAN_MODEL]);
    const pb = b.query(sql, [SCAN_LIMIT, PLAN_MODEL]);
    assert.ok((await waitingOnLock(pidA)) || (await waitingOnLock(pidB)),
      "at least one scan must be queued behind the plan row lock — otherwise this cell proves nothing");
    await blocker.query("commit");
    answers = (await Promise.all([pa, pb])).map((r) => r.rows[0].result);
  } finally {
    await releaseRaw(blocker);
    await releaseRaw(a);
    await releaseRaw(b);
  }

  const occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 1, "exactly ONE occurrence survives two concurrent scans");
  assert.equal(occ[0].due_date, due);
  const works = await rootQuery(
    "select id from clara.accounting_work where client_id=$1 and intent_key=$2",
    [s.client, `plan:${s.plan_id}:r1:${due}`]);
  assert.equal(works.rows.length, 1, "exactly ONE Work carries the due event's intent key");
  assert.equal(works.rows[0].id, occ[0].work_id);

  const mine = answers.flatMap((x) => x.occurrences.filter((o) => o.plan_id === s.plan_id));
  assert.equal(mine.filter((o) => o.admitted === true).length, 1, "exactly one scan admitted");
  const converged = mine.filter((o) => o.converged === true);
  assert.equal(converged.length, 1, "exactly one scan converged");
  assert.equal(converged[0].work_id, occ[0].work_id,
    "the loser names the SAME Work the winner admitted — a converge, never a second identity");
});

test("p653.occ.locked_period — a closed period ADMITS the occurrence, the posting refuses CLR19 write_into_closed_period, the Work settles refused carrying the typed reason, the due event is not re-admitted, and the attention read reaches it", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const s = await scheduled("locked");
  const row = await scheduleRow(s.schedule_id);
  const due = String(row.period_lines[row.period_lines.length - 1].period_end).slice(0, 10);
  await closeFiscalYearOf(s.client, due);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].outcome.state, "admitted",
    "admission does not know about period locks — 0178's door checks authority, the posting core checks the period");
  const work = occ[0].work_id;
  assert.ok(work);

  const w = await workRow(work);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p653-period") });
  const obo = await mintClientObo({ firm: s.firm, obo: s.bob, client: s.client });
  await assertPair(CLR.period, REASON.closedPeriod,
    () => wakeRecordJournalEntry(obo.secret, {
      client: s.client, work, logicalOpId: w.logical_op_id, basis: w.basis,
    }),
    "posting an amortisation occurrence into a closed period");
  await settleWorkRun({
    task: w.current_task_id, outcome: "refused", errorCode: "tool_error",
    error: { reason: REASON.closedPeriod, code: CLR.period },
  });
  const settled = await workRow(work);
  assert.equal(settled.status, "refused");
  assert.equal(settled.error.reason, REASON.closedPeriod);
  assert.equal((await receiptsForWork(work)).filter((r) => r.outcome === "committed").length, 0,
    "no committed receipt exists for a refused posting");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(s.plan_id), 1,
    "the due event is not re-admitted: the occurrence row is its identity, whatever the Work's outcome");

  // …AND THIS IS WHY THE ATTENTION READ HAS A POSTING ARM. Nothing else in the estate surfaces a
  // plan Work that settled refused: the occurrence says `admitted`, so an arm that only read
  // `outcome` would call this schedule healthy while it charges nothing, every month.
  const attention = await listPrepaymentAttention(s.bob, s.client);
  const mine = attention.refusing.filter((r) => r.schedule_id === s.schedule_id);
  assert.equal(mine.length, 1, "arm A returns this schedule");
  assert.equal(mine[0].stage, "posting", "…and says WHERE it stopped");
  assert.equal(mine[0].reason, REASON.closedPeriod, "…with the typed reason the books refused for");
  assert.equal(mine[0].code, CLR.period);
  assert.equal(mine[0].due_date, due);
  assert.equal(mine[0].catch_up_from, due,
    "…and names the window the EXISTING catch-up door would need, rather than inventing a recovery");
});

// ===========================================================================================
// p653.attention — THE TWO ARMS, AND WHAT NEITHER OF THEM REACHES.
// ===========================================================================================

test("p653.attention.arm_a — a deactivated authoriser stops a live schedule at ADMISSION with 0178's own typed CLR04, and arm A returns it with that reason and the stage it stopped at", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const s = await scheduled("arma");
  const row = await scheduleRow(s.schedule_id);
  const due = String(row.period_lines[row.period_lines.length - 1].period_end).slice(0, 10);

  // `authorised_by` is the human who created the plan — bob, the bookkeeper — and 0178's own door
  // rechecks that membership at EVERY due event. A routine departure therefore stops a multi-year
  // schedule, silently, which is #625's other side and this read's whole reason to exist.
  await deactivateMember(s.alice, { firm: s.firm, user: s.bob, opKey: opk("p653-deact") });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 1, "the due event is RECORDED even though nothing was admitted");
  assert.equal(occ[0].outcome.state, "refused");
  assert.equal(occ[0].outcome.reason, REASON.actorNotActive,
    "0178's own typed refusal is preserved verbatim on the occurrence");
  assert.equal(occ[0].work_id, null);

  // Read as ALICE: bob no longer has a membership to read with, which is itself the point.
  const attention = await listPrepaymentAttention(s.alice, s.client);
  const mine = attention.refusing.filter((r) => r.schedule_id === s.schedule_id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].stage, "admission");
  assert.equal(mine[0].reason, REASON.actorNotActive);
  assert.equal(mine[0].due_date, due);
  assert.equal(mine[0].purpose, "Prepaid subscription amortisation");
});

test("p653.attention.arm_b — a posted recognition whose schedule REFUSED appears as unscheduled with has_live_term:false; recording the term flips it true; creating the schedule removes it; and an ordinary expense coding never appears at all", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // The create-time residue (Q8's (a)): the recognition has POSTED and the schedule refused, so no
  // plan and no schedule row exists — and therefore NO schedule-scoped read can ever reach it.
  const scene = await prepaymentScene("armb", { cents: 90000, termMonthsBack: 4, termMonths: 3, recordTerm: false });
  await assertPair(CLR.badRequest, PREPAY_REASON.termUnderivable,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a recognition whose document states no term");

  let attention = await listPrepaymentAttention(scene.bob, scene.client);
  let mine = attention.unscheduled.filter((r) => r.entry_id === scene.entry);
  assert.equal(mine.length, 1, "the posted prepayment is reachable from somewhere a person looks");
  assert.equal(mine[0].arm, "unscheduled");
  assert.equal(mine[0].has_live_term, false, "…and the surface can name the NEXT act: record the term");
  // A JSON number, not a string: the cents ride inside a jsonb object rather than coming back as a
  // bare `bigint` column, which node-postgres would hand over as text.
  assert.equal(mine[0].amount_cents, 90000);
  assert.equal(mine[0].prepaid_account_code, scene.prepaid);
  assert.equal(mine[0].document_id, scene.document);

  // RECORDING THE TERM FLIPS THE NEXT ACT, and nothing else moves.
  await recordPeriod(scene.bob, {
    document: scene.document, start: scene.termStart, end: scene.termEnd });
  attention = await listPrepaymentAttention(scene.bob, scene.client);
  mine = attention.unscheduled.filter((r) => r.entry_id === scene.entry);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].has_live_term, true, "…now the next act is to configure the schedule");

  // CREATING IT REMOVES THE ROW: the residue is closed by the act it was asking for.
  await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  attention = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(attention.unscheduled.filter((r) => r.entry_id === scene.entry).length, 0,
    "a scheduled prepayment is no longer waiting for one");

  // AN ORDINARY EXPENSE CODING NEVER APPEARS. Arm B's predicate is the EVALUATOR'S OWN — approved,
  // document-bound, exactly one DEBITED ASSET line — so it makes no judgement of its own and
  // produces no expense-coding false positives.
  const draft = await unapprovedEntry(scene);
  attention = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(attention.unscheduled.filter((r) => r.entry_id === draft).length, 0,
    "an entry that has not posted is not a recognised prepayment");
});

test("p653.attention.egress — an occurrence whose run holds no consumed model-egress authorisation refuses CLR13 at the POSTING core, and arm A reaches that too: the standing precondition every period of a multi-year schedule depends on", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // MODEL EGRESS IS A STANDING PRECONDITION FOR EVERY OCCURRENCE (0195:502; claraWork.v3.ts:10-19
  // prepares and consumes an authorisation immediately before each model call, and the accounting
  // write re-verifies it independently). A superseded Terms/DPA version therefore stops EVERY
  // future period of EVERY schedule — silently, because a refused posting writes nothing anyone
  // reads. This cell reaches the same state locally, by running the write with NO consumed
  // dispatch, rather than by publishing a newer legal version (which is estate-wide and would
  // perturb every sibling battery on this rig).
  const s = await scheduled("egress");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(s.plan_id);
  assert.equal(occ.length, 1);
  const work = occ[0].work_id;
  const w = await workRow(work);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p653-egress") });
  const obo = await mintClientObo({ firm: s.firm, obo: s.bob, client: s.client });
  const { detail } = await assertPair(CLR.conflict, EGRESS_REASON.notAuthorized,
    () => wakeRecordJournalEntry(obo.secret, {
      client: s.client, work, logicalOpId: w.logical_op_id, basis: w.basis, egress: false,
    }),
    "posting an amortisation occurrence with no consumed egress dispatch");
  assert.ok(detail, "the refusal is typed");
  await settleWorkRun({
    task: w.current_task_id, outcome: "refused", errorCode: "tool_error",
    error: { reason: EGRESS_REASON.notAuthorized, code: CLR.conflict },
  });

  const attention = await listPrepaymentAttention(s.bob, s.client);
  const mine = attention.refusing.filter((r) => r.schedule_id === s.schedule_id);
  assert.equal(mine.length, 1, "arm A returns the schedule whose period charged nothing");
  assert.equal(mine[0].stage, "posting");
  assert.equal(mine[0].reason, EGRESS_REASON.notAuthorized,
    "…with the typed reason, so a firm can be told its Terms acceptance is what stopped the books");
  assert.equal((await receiptsForWork(work)).filter((r) => r.outcome === "committed").length, 0);
});

// ===========================================================================================
// p653.catchup — EXPLICIT, OLDEST FIRST, AND NEVER PAST THE AUTHORITY.
// ===========================================================================================

test("p653.catchup.window — a window reaching back past the plan's authority is refused BY NAME, an in-range window admits oldest-first, and a second catch-up over the same window re-attempts nothing", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const s = await scheduled("catchup");
  const row = await scheduleRow(s.schedule_id);
  const ends = row.period_lines.map((l) => String(l.period_end).slice(0, 10));

  // The plan's authority starts on the FIRST line's period_end (the derived `effective_from`), so
  // a window opening on the term's own first DAY is already before it — a future schedule never
  // authorises history, and the refusal says what the authority actually covers.
  const { detail } = await assertPair(CLR.badRequest, "catch_up_before_authority",
    () => requestPlanCatchUp(s.bob, { plan: s.plan_id, from: s.termStart, to: ends[2] }),
    "a catch-up reaching back past the plan's authority");
  assert.equal(detail.effective_from, ends[0]);
  assert.equal(await occurrenceCount(s.plan_id), 0, "nothing was admitted by the refused window");

  const answer = await requestPlanCatchUp(s.bob, { plan: s.plan_id, from: ends[0], to: ends[2] });
  assert.equal(answer.admitted, 3, "all three periods admit under one explicit window");
  const admittedDues = answer.events.filter((e) => e.admitted === true).map((e) => e.due_date);
  assert.deepEqual(admittedDues, ends, "…oldest first, in the books' own order");

  const again = await requestPlanCatchUp(s.bob, {
    plan: s.plan_id, from: ends[0], to: ends[2], opKey: opk("p653-catchup2") });
  assert.equal(again.admitted, 0, "a completed period is not re-attemptable");
  assert.equal(again.events.filter((e) => e.converged === true).length, 3,
    "…each event converges on the occurrence that already exists");
  assert.equal(await occurrenceCount(s.plan_id), 3, "and no fourth occurrence appears");
});
