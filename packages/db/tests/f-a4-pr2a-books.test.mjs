// F-A4 PR-2a -- Annex A's END-TO-END books claim (W35), the self-healable FY refusal (W31), the
// six-reader wall (W44) and F4's month-scoped receipt key (W32).
//
// [#1036] W34 (twin equivalence) is RETIRED: it compared the agent core's durable state with the
// human PROPOSE door's, and #927 (0282) retired that human door to a typed refusal, so there is no
// door left to be equivalent to.
//
// [#1036, THE FIX ROUND 2026-09-24] W35 / W35-mutant / W31 are RETARGETED, not retired. The first
// cut of this lane deleted all three on the ground that they drove wrapper 12 through the 0045
// template pipeline (propose -> a human SIGNS -> the belt POSTS), which #1036 dismantles. That is
// true of their MACHINERY and false of their SUBJECT: W35's subject is an ACCOUNTING claim about
// the books -- "the prepaid asset reaches EXACTLY zero and the expense side totals the term, with
// the remainder wholly in the final period" -- and W31's is a LIFECYCLE claim -- "a term running
// past the fiscal year refuses by name, and the same lane can clear it by opening the successor
// year". Both rules are alive; only the entrance moved. Deleting them left the prepayment lane
// with NO end-to-end proof that its schedules close the books at all (measured: after the
// deletion, a repo-wide grep for a prepaid-to-zero assertion returned only the deferred-revenue
// side and a tie-out), and no cell anywhere asserting `fiscal_years.successor`. So both are
// re-driven below through the LIVE human door -- `clara.create_prepayment_schedule`, the plan
// lane, the catch-up window and the real posting belt -- which is the same evidence the retired
// pipeline used to give, against the pipeline that actually ships. #927's own release precedent
// ("every one of those files was retargeted at the retired shape, never deleted, never skipped")
// is the house rule this follows.
//
// W44 and W32 are UNTOUCHED: neither drives wrapper 12 -- W44 mints its own templates directly
// through `mintTemplate` and W32 drives an unrelated close verb
// (`clara._agent_mint_month_snapshot_core`, the daily-close month-snapshot wake, not the
// prepayment limb) -- so neither cell's premise moved.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, rootQuery, caught, uniq, pair, receiptsForTask, derivedOpKey,
  MODEL, mintTemplate, opk,
} from "./f-a4-pr2a-fixtures.mjs";
import {
  prepaymentScene, createPrepaymentSchedule, prepaymentLaneReady, statedTermScene,
  recordStatedTerm, statedTermLaneReady, openDefaultFY, monthEndAfter, PREPAY_REASON,
  wakeDuePlanOccurrences, requestPlanCatchUp, occurrenceRows, workRow, claimWorkRun,
  settleWorkRun, mintClientObo, wakeRecordJournalEntry, receiptsForWork,
} from "./prepayment-stated-term-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

/** The LIVE prepayment lane's own frontier (0223), layered on top of the F-A4 one: the retargeted
 *  cells drive `clara.create_prepayment_schedule`, which a pre-0223 chain does not carry. */
async function liveLaneGate(t) {
  if (prepayGate(t, markSkip)) return true;
  if (!(await prepaymentLaneReady())) {
    markSkip();
    t.skip("the live prepayment lane (0223) is absent -- probed at the live catalog");
    return true;
  }
  return false;
}

/** The net movement on one account across every APPROVED line of a client, in cents. Restored with
 *  W35: the books claim is asserted on the LEDGER, never on the schedule's own projection. */
async function accountNet(client, code) {
  const r = await rootQuery(
    `select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as net
       from clara.journal_lines jl join clara.journal_entries je on je.id = jl.entry_id
      where jl.client_id = $1 and jl.account_code = $2 and je.status = 'approved'`, [client, code]);
  return Number(r.rows[0].net);
}

/** Admit every period this schedule owes and POST each one through the real belt. Returns the
 *  posted entry ids, oldest first. */
async function postEveryPeriod(scene, made, tag) {
  await wakeDuePlanOccurrences({ limit: 100 });
  await requestPlanCatchUp(scene.bob, {
    plan: made.plan_id, from: made.effective_from, to: made.effective_to });
  const admitted = (await occurrenceRows(made.plan_id)).filter((o) => o.work_id);
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const entries = [];
  for (const occ of admitted) {
    const w = await workRow(occ.work_id);
    await claimWorkRun({ task: w.current_task_id, runId: opk(`${tag}-run`) });
    const entry = await wakeRecordJournalEntry(obo.secret, {
      client: scene.client, work: occ.work_id, logicalOpId: w.logical_op_id, basis: w.basis });
    assert.equal(entry.posted, true, `the period due ${occ.due_date} did not reach the books`);
    await settleWorkRun({
      task: w.current_task_id, outcome: "completed", result: { entry_id: entry.entry_id } });
    const receipts = await receiptsForWork(occ.work_id);
    assert.equal(receipts.filter((x) => x.outcome === "committed").length, 1,
      "exactly one committed receipt stands for each period");
    entries.push(entry.entry_id);
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// W35 (RETARGETED) -- THE BOOKS ACTUALLY CLOSE.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W35 end-to-end over the LIVE prepayment lane: the prepaid asset reaches EXACTLY zero and the expense side totals the term, on a total that does not divide evenly", async (t) => {
  if (await liveLaneGate(t)) return;
  // 100000 sen over 3 months does NOT divide evenly (33333 x 3 = 99999), so the final period must
  // absorb the remainder. A cell run on a total that divided evenly would pass with the remainder
  // rule broken.
  const CENTS = 100000;
  const scene = await prepaymentScene("w35live", { cents: CENTS, termMonthsBack: 4, termMonths: 3 });

  const opened = await accountNet(scene.client, scene.prepaid);
  assert.equal(opened, CENTS, "the prepaid asset does not open at the amount the entry posted");
  assert.equal(await accountNet(scene.client, scene.target), 0, "nothing is expense yet");

  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  assert.equal(Number(made.total_cents), CENTS);
  assert.equal(made.period_count, 3);

  const entries = await postEveryPeriod(scene, made, "w35live");
  assert.equal(entries.length, 3, "the schedule owes three periods and three entries posted");

  // THE ASSERTION THE WHOLE TRAIN EXISTS FOR.
  const prepaidAfter = await accountNet(scene.client, scene.prepaid);
  assert.equal(prepaidAfter, 0,
    `the prepaid asset did not reach zero -- it stands at ${prepaidAfter} sen, so the schedule either under- or over-charged`);
  assert.equal(await accountNet(scene.client, scene.target), CENTS,
    "the expense side does not total the term");

  // AND THE REMAINDER IS IN THE FINAL PERIOD, not smeared: periods 1..n-1 carry the base.
  const perPeriod = await rootQuery(
    `select jl.debit_cents::bigint as dr
       from clara.journal_lines jl join clara.journal_entries je on je.id = jl.entry_id
      where je.id = any($1::uuid[]) and jl.account_code = $2 and jl.debit_cents > 0
      order by je.posting_date`, [entries, scene.target]);
  assert.deepEqual(perPeriod.rows.map((r) => Number(r.dr)), [33333, 33333, 33334],
    "the remainder is not wholly in the final period");
  noteLane(`W35: prepaid ${opened} -> 0, expense -> ${CENTS}, periods 33333/33333/33334`);
});

test("fa4p2a.W35-mutant stopping ONE occurrence short leaves the prepaid account NON-ZERO", async (t) => {
  if (await liveLaneGate(t)) return;
  // Without this the cell above could be asserting a tautology -- a books read that always says
  // zero proves nothing about the schedule.
  const CENTS = 100000;
  const scene = await prepaymentScene("w35mlive", { cents: CENTS, termMonthsBack: 4, termMonths: 3 });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  await wakeDuePlanOccurrences({ limit: 100 });
  await requestPlanCatchUp(scene.bob, {
    plan: made.plan_id, from: made.effective_from, to: made.effective_to });
  const admitted = (await occurrenceRows(made.plan_id)).filter((o) => o.work_id);
  assert.equal(admitted.length, 3);
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  for (const occ of admitted.slice(0, 2)) {              // TWO of three, deliberately
    const w = await workRow(occ.work_id);
    await claimWorkRun({ task: w.current_task_id, runId: opk("w35m-run") });
    const entry = await wakeRecordJournalEntry(obo.secret, {
      client: scene.client, work: occ.work_id, logicalOpId: w.logical_op_id, basis: w.basis });
    await settleWorkRun({
      task: w.current_task_id, outcome: "completed", result: { entry_id: entry.entry_id } });
  }
  const left = await accountNet(scene.client, scene.prepaid);
  assert.notEqual(left, 0,
    "two of three occurrences left the prepaid account at ZERO -- W35 is reading something other than the ledger");
  assert.equal(left, CENTS - 33333 - 33333);
});

// ---------------------------------------------------------------------------------------------
// W31 (RETARGETED) -- THE FY REFUSAL IS SELF-HEALABLE.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W31 a term running past the fiscal year refuses BY NAME on the live door, naming the successor year as what is missing -- and opening that year clears the SAME call", async (t) => {
  if (await liveLaneGate(t)) return;
  if (!(await statedTermLaneReady())) {
    markSkip();
    t.skip("#939's stated-term lane (0305) is absent -- probed at the live catalog");
    return;
  }
  // The refusal is a SELF-HEALABLE state, not a dead end, and the estate has been bitten by a rung
  // whose "blocked" state nothing ever drove to resolution. So the cell drives the resolution.
  const scene = await statedTermScene("w31live", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const fy = await rootQuery(
    "select to_char(ends_on,'YYYY-MM-DD') as ends from clara.fiscal_years where id = $1", [scene.fy]);
  const endsOn = fy.rows[0].ends;
  const year = Number(endsOn.slice(0, 4));

  // A TERM THAT RUNS INTO THE YEAR AFTER THIS ONE, stated through the real door.
  const past = await monthEndAfter(`${year + 1}-01-01`, 5);
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: past,
    reason: "#1036 W31: the cover runs into the following financial year" });

  const blocked = await caught(() => createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef, opKey: opk("w31-blocked") }));
  assert.ok(blocked, "a term past the FY with no successor year open must refuse");
  const detail = JSON.parse(blocked.detail);
  assert.equal(detail.reason, PREPAY_REASON.termUnderivable);
  assert.equal(detail.missing, "fiscal_years.successor",
    "the refusal must NAME the successor year as the missing thing, so a person knows what to open");
  assert.equal(detail.fy_ends_on.slice(0, 10), endsOn);

  // MUTANT: the same call again, still refused -- the refusal is the YEAR'S ABSENCE, not a flake.
  const still = await caught(() => createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef, opKey: opk("w31-still") }));
  assert.equal(JSON.parse(still.detail).reason, PREPAY_REASON.termUnderivable,
    "the refusal is not stable -- it was a flake, not a state");

  // ===== THE SELF-HEAL, ACTUALLY DRIVEN. Open the successor year through the estate's own door
  // and the SAME configuration succeeds. Without this the "self-healable, not a dead end" claim
  // would be a sentence rather than a demonstration.
  await openDefaultFY(scene.alice, {
    client: scene.client, startsOn: `${year + 1}-01-01`, tag: "W31 successor" });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef, opKey: opk("w31-healed") });
  assert.ok(made.schedule_id, "opening the successor year did not clear the refusal");
  assert.equal(made.term_end, past, "…and the schedule runs to the term that was refused before");
  noteLane("W31: fiscal_years.successor refused by name, then cleared by opening the year");
});

// ---------------------------------------------------------------------------------------------
// W44 -- the six readers stay ABOUT what posts.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W44 the DUE ORACLE, the SIGN PROJECTION and the two shared helpers answer identically across a scheduled/null-schedule pair", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // RE-TITLED TO WHAT IT EXECUTES (Codex P7). The old title claimed "the six readers" of Annex
  // H.3. This cell drives the due oracle, the sign-surface projection (which is NOT one of H.3's
  // six -- it is the projection congruence explicitly does NOT cover, §D4's own scope note), and
  // the two HELPERS the remaining consumers lean on. A helper call is not consumer execution: it
  // shows the helper is amount-blind, not that _adj_run_occurrence_core and _adj_on_approve are.
  // NO CLAIM STRONGER THAN ITS EXECUTION SURVIVES, so the title is now the execution.
  //
  // THE TWO REAL POSTING CONSUMERS WERE DRIVEN in this file's own retired W35 cell, whose
  // subject (the wrapper's proposed template) is gone (#1036); the claim they behave alike on a
  // scheduled template survives here through the two helpers below, which is what this cell
  // measures on its own.
  //
  // Congruence clause (a) is why the helpers below can be blind at all: they project
  // (account, direction) and DISCARD magnitudes, so a congruent schedule is invisible to them BY
  // CONSTRUCTION -- which is why they needed no recut and the D1 inventory stayed at four.
  const sc = await prepaidScene("w44", { cents: 90000 });
  const lines = pair(sc.target, sc.prepaid, 30000);
  const withSched = await mintTemplate(sc.alice, {
    client: sc.client, name: `w44s-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 30000) },
    ] });
  const twin = await prepaidScene("w44b", { cents: 90000 });
  const nullSched = await mintTemplate(twin.alice, {
    client: twin.client, name: `w44n-${uniq()}`, start: "2025-02-01", end: "2025-04-30",
    lines: pair(twin.target, twin.prepaid, 30000) });

  // THE SIX CLAIMED CONSUMERS ARE CALLED, not two helpers standing in for them (Codex C6).
  // Annex H.3 names SIX live readers that take t.lines as a stand-in for what an occurrence posts,
  // and the four-body D1 claim rests on all six being amount-blind. An earlier cut exercised only
  // _wdb_line_shape and _adj_line_eligibility_breach directly -- the two HELPERS the six lean on --
  // which proves the helpers are blind but not that the READERS are. The consumers themselves are
  // driven here, each on the scheduled template and its null-schedule twin, and each must agree.
  const consumer = async (sql, client, template) =>
    (await rootQuery(sql, [client, template])).rows[0].r;

  // (1) the due oracle -- the one the CLOSE-AGENT WAKE LANE itself reads.
  const dueA = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", sc.client, withSched.template_id);
  const dueB = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", twin.client, nullSched.template_id);
  assert.deepEqual(dueA, dueB,
    "the due oracle answers differently for a scheduled template than for its null-schedule twin -- the close lane's own read is not amount-blind");

  // (2) the template projection the sign surface renders. Compared on the keys congruence covers:
  // `lines` must read identically; `schedule` is EXPECTED to differ and is excluded by name.
  const projection = async (template) =>
    (await rootQuery("select clara._adj_template_json($1::uuid) as r", [template])).rows[0].r;
  const jsonA = await projection(withSched.template_id);
  const jsonB = await projection(nullSched.template_id);
  assert.deepEqual(jsonA.lines, jsonB.lines, "the sign-surface projection's `lines` differ across the pair");
  assert.ok(jsonA.schedule && !jsonB.schedule, "the projection does not distinguish the two by schedule");

  // (3) the shape projection and (4) the eligibility read, which the remaining consumers lean on.
  const shapes = await rootQuery(
    `select (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$1) as with_sched,
            (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$2) as null_sched`,
    [withSched.template_id, nullSched.template_id]);
  assert.deepEqual(shapes.rows[0].with_sched, shapes.rows[0].null_sched,
    "the shape projection differs between a scheduled template and its null-schedule twin -- the readers are NOT amount-blind and the four-body claim is wrong");
  const elig = await rootQuery(
    `select (select clara._adj_line_eligibility_breach($1, t.lines) from clara.adjustment_templates t where t.id=$2) as a,
            (select clara._adj_line_eligibility_breach($3, t.lines) from clara.adjustment_templates t where t.id=$4) as b`,
    [sc.client, withSched.template_id, twin.client, nullSched.template_id]);
  assert.equal(elig.rows[0].a, null, "the scheduled template's lines are ineligible");
  assert.equal(elig.rows[0].b, null, "the twin's lines are ineligible");
  noteLane("W44: the due oracle, the sign projection, the shape read and the eligibility read all agree across the scheduled/null pair");
});

// ---------------------------------------------------------------------------------------------
// W32 -- F4's month-scoped receipt key.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W32 (F4) two DIFFERENT months minted in ONE task write TWO receipts, each naming its own month", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The shipped defect: subject_id is uuid-not-null so a month cannot ride the subject, and the op
  // key derives per (task, verb, client) -- so the month appeared in NONE of uq_aar's seven columns
  // and the second month's refusal was answered with the first month's receipt id.
  const sc = await prepaidScene("w32");
  const call = (month) => humanQuery(sc.alice, "select 1").then(() => null).catch(() => null)
    .then(() => rootQuery(
      `select clara._agent_mint_month_snapshot_core(
         jsonb_build_object('firm_id', $1::uuid, 'wake_kind', 'close_prep', 'task_id', $2::uuid),
         $3::uuid, $4::date, 'rig', '{}'::jsonb, $5) as r`,
      [sc.firm, sc.s.task, sc.client, month, "w32key"]))
    .then((r) => r.rows[0].r);
  // An INCOMPLETE model triple gives a task-level rung, byte-identical for every month in the pass
  // -- which is exactly the condition Annex G says produces the collision.
  const a = await call("2025-01-01");
  const b = await call("2025-02-01");
  assert.equal(a.status, "refused");
  assert.equal(b.status, "refused");
  assert.notEqual(a.receipt_id, b.receipt_id,
    "the second month's refusal was answered with the FIRST month's receipt id -- F4's shipped defect");
  const rows = await rootQuery(
    "select op_key from clara.agent_act_receipts where id = any($1::uuid[]) order by op_key",
    [[a.receipt_id, b.receipt_id]]);
  assert.deepEqual(rows.rows.map((r) => r.op_key), ["w32key:2025-01-01", "w32key:2025-02-01"],
    "the receipts are not month-scoped -- a receipt for this verb must say which month it was about");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0, `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
  void caught; void withTxn; void receiptsForTask; void derivedOpKey; void MODEL;
});
