// F-A4 PR-2a -- Annex A, the F1/N1 group: the CEREMONY PRECONDITIONS (W36/W37 null-stability) and
// the congruence constraint that earns the four-body D1 inventory (W41-W44), plus the evaluator's
// arithmetic (W9/W10). Design part 2 §14 acceptance item 3 requires these green BEFORE the window
// opens, not after -- they are what the four-body correctness claim rests on.
//
// Every wall ships with its MUTANT, and the mutant runs AFTER the fix in a rolled-back transaction:
// a wall whose mutant was only ever run before the fix has proven that the instrument once worked,
// not that it still does.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, evaluate, uniq, caught,
  proposeTemplate as propose, pair,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };

before(async () => { await ensurePrepay(noteLane); });

// ---------------------------------------------------------------------------------------------
// W36 -- F1: NULL-STABILITY OF THE RECUT BODIES. The claim the whole D1 window rests on.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W36 every null-schedule template resolves to EXACTLY its canonical lines -- the recut bodies are unchanged by construction", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Measured over the WHOLE population, not a sample: the resolver is what _adj_run_occurrence_core
  // and _adj_on_approve now call in place of the flat template lines, so if it ever answers
  // differently for a null-schedule row, the daily unattended belt posts different books.
  // SCOPED TO THE NULL-SCHEDULE POPULATION, deliberately. An earlier cut also asserted that NO
  // template anywhere carries a schedule -- but that is §0's PRE-MIGRATION premise, which the
  // prestate already enforces by aborting the apply. After the migration, schedule-bearing
  // templates are exactly what this train exists to create, and this battery creates some itself:
  // the assertion went green on a fresh rig and red the moment its own siblings ran. What
  // null-stability actually claims is about the null-schedule rows, and only those.
  const r = await rootQuery(
    `select count(*) filter (where t.schedule is null)::int as nulls,
            count(*) filter (where t.schedule is null
                               and clara._adj_period_lines(t.schedule, t.lines, t.start_date, t.start_date)
                                   = clara._adj_canon_lines(t.lines))::int as equal,
            count(*) filter (where t.schedule is not null)::int as with_schedule
       from clara.adjustment_templates t`);
  const { nulls, equal, with_schedule } = r.rows[0];
  assert.ok(nulls > 0, "no null-schedule templates on this rig -- the cell would pass vacuously");
  assert.equal(equal, nulls,
    `${nulls - equal} of ${nulls} null-schedule templates resolve to something OTHER than their canonical lines -- the daily unattended belt would post different books`);
  noteLane(`W36: ${equal}/${nulls} null-schedule templates resolve to their canonical lines (${with_schedule} schedule-bearing rows present, which after this migration is lawful)`);
});

test("fa4p2a.W36-mutant a template that DOES carry a schedule resolves DIFFERENTLY -- the cell can see a behaviour change", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The mutant is the point: if the comparison above passed for schedule-bearing rows too, it would
  // be asserting a tautology rather than null-stability.
  //
  // BUILT THROUGH THE DOOR, and the first cut of this cell could not be. Planting a schedule with a
  // bare UPDATE is REFUSED by clara._tf_adjustment_template_transition with CLR38 -- which is
  // design §5.3's argument holding in practice: `schedule` is not in that trigger's frozen-stamp
  // set, so it inherits the immutability with no change to the trigger at all. The cell below pins
  // that refusal on purpose; here we simply use the lawful producer.
  const sc = await prepaidScene("w36m", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const r = await propose(sc.alice, {
    client: sc.client, name: `w36m-${uniq()}`, start: "2025-02-01", end: "2025-03-31", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 12000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 8000) },
    ] });
  assert.ok(r?.template_id, `the schedule-bearing proposal was refused: ${JSON.stringify(r).slice(0, 200)}`);
  const q = await rootQuery(
    `select clara._adj_period_lines(t.schedule, t.lines, date '2025-02-01', date '2025-02-28') as feb,
            clara._adj_canon_lines(t.lines) as flat
       from clara.adjustment_templates t where t.id = $1`, [r.template_id]);
  assert.notDeepEqual(q.rows[0].feb, q.rows[0].flat,
    "with a real schedule live, the resolver still answered the flat lines -- the W36 comparison is blind and its green means nothing");
  assert.equal(Number(q.rows[0].feb[0].debit_cents), 12000,
    "the resolver must answer THIS period's amount, not the template's representative one");
});

test("fa4p2a.W36-immutability a sign-time edit to `schedule` is refused by the STORAGE LAYER, with no change to the transition trigger", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Design §5.3's strongest leg, proven rather than argued: decline-and-re-propose is not a policy
  // preference laid over a permissive schema -- clara._tf_adjustment_template_transition freezes
  // every column outside the eight lifecycle stamps and raises CLR38 on any other difference. A NEW
  // column inherits that for free, which is why F2 wall 3 needed no trigger recut.
  const sc = await prepaidScene("w36i", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const r = await propose(sc.alice, {
    client: sc.client, name: `w36i-${uniq()}`, start: "2025-02-01", end: "2025-02-28", lines,
    schedule: [{ period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 10000) }] });
  const e = await caught(() => rootQuery(
    `update clara.adjustment_templates set schedule = '[]'::jsonb where id = $1`, [r.template_id]));
  assert.ok(e, "a bare UPDATE rewrote a signed-content column -- the immutability the propose->sign->post chain rests on is gone");
  assert.equal(e.code, "CLR38");
  assert.match(String(e.message), /immutable/);
});

// ---------------------------------------------------------------------------------------------
// W37 -- F1: THE HASH EXTENSION IS NULL-STABLE. Re-formed as a DIFFERENTIAL per the conductor's
// 2026-08-27 ruling: the absolute form ("recomputes to the bytes it was stored with") asserts
// something this train never claimed and is FALSE for a pre-existing fixture family.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W37 the eight-argument hash is a DIFFERENTIAL no-op: recompute-before equals recompute-after for every template", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE DELTA IS THE CLAIM, not the absolute agreement. On a seeded rig 67 of ~310 stored hashes do
  // not reproduce under the CURRENT formula -- all of them the pre-existing `x42 p1 staged f*`
  // fixture family, measured identically WITH and WITHOUT PR-2a. That is a pre-existing estate
  // observation carried to the debt ledger, not something this train introduced or must fix.
  // What PR-2a owes is that it moved NOTHING: the seven-key hash and the eight-argument hash with a
  // null schedule must agree on every row, so the duplicate guard behaves exactly as before.
  const r = await rootQuery(
    `select count(*)::int as total,
            count(*) filter (where clara._adj_template_hash(t.name, t.cadence, t.start_date,
                     t.end_date, t.auto_reverse, t.lines, t.memo_template)
                   = clara._adj_template_hash(t.name, t.cadence, t.start_date,
                     t.end_date, t.auto_reverse, t.lines, t.memo_template, null))::int as agree,
            count(*) filter (where t.content_hash = clara._adj_template_hash(t.name, t.cadence,
                     t.start_date, t.end_date, t.auto_reverse, t.lines, t.memo_template))::int as reproduces
       from clara.adjustment_templates t`);
  const { total, agree, reproduces } = r.rows[0];
  assert.ok(total > 0, "no templates -- the differential would be vacuous");
  assert.equal(agree, total,
    `the schedule argument moved ${total - agree} hash(es) with a NULL schedule -- the extension is not null-stable`);
  noteLane(`W37: differential ${agree}/${total} identical; ${reproduces}/${total} stored hashes reproduce (the shortfall is the pre-existing x42-staged family, unchanged by this train)`);
});

test("fa4p2a.W37-mutant folding the schedule key UNCONDITIONALLY breaks every stored hash", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The mutant reproduces the defect the conditional fold exists to avoid, computed inline so it
  // needs no scratch function: an unconditional key changes EVERY recomputed hash.
  const r = await rootQuery(
    `select count(*)::int as total,
            count(*) filter (where clara._adj_template_hash(t.name, t.cadence, t.start_date,
                     t.end_date, t.auto_reverse, t.lines, t.memo_template)
                   = encode(clara._hash(jsonb_build_object(
                       'name', t.name, 'cadence', t.cadence, 'start_date', t.start_date,
                       'end_date', t.end_date, 'auto_reverse', t.auto_reverse,
                       'lines', clara._adj_canon_lines(t.lines), 'memo_template', t.memo_template)
                     || jsonb_build_object('schedule', clara._adj_canon_schedule(t.schedule))), 'hex'))::int as still_equal
       from clara.adjustment_templates t`);
  assert.equal(r.rows[0].still_equal, 0,
    "an unconditionally-folded schedule key left hashes unchanged -- the null-stability instrument cannot see the defect it exists to catch");
});

// ---------------------------------------------------------------------------------------------
// W9 / W10 -- the evaluator's arithmetic, over REAL books.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W9 the schedule sums to total_cents EXACTLY and the remainder lands WHOLLY in the final period", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // 100 sen over 3 months: the case where "round each period" loses sen.
  const sc = await prepaidScene("w9", { cents: 100 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const a = await evaluate(sc.client, sc.entry);
  assert.equal(a.refusal ?? null, null, `expected a schedule, got ${JSON.stringify(a).slice(0, 200)}`);
  const amounts = a.period_lines.map((l) => Number(l.credit_cents));
  assert.equal(amounts.length, 3, "three whole calendar months");
  assert.equal(amounts.reduce((x, y) => x + y, 0), 100, "the periods must sum to total_cents to the sen");
  assert.deepEqual(amounts, [33, 33, 34], "the remainder lands WHOLLY in the FINAL period");
  // DETERMINISM: two calls, byte-identical answers.
  const b = await evaluate(sc.client, sc.entry);
  assert.deepEqual(b.period_lines, a.period_lines, "the evaluator is not deterministic");
});

test("fa4p2a.W10 the split-month rule: a day-1 start and a day-2 start over the SAME span give different first periods", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // SELF-MUTATING BY CONSTRUCTION: the two arms are each other's mutant. Collapse the rule and the
  // two answers become equal, which this cell asserts they are not.
  const sc = await prepaidScene("w10", { cents: 60000 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-07-31" });
  const dayOne = await evaluate(sc.client, sc.entry);
  const sc2 = await prepaidScene("w10b", { cents: 60000 });
  await recordPeriod(sc2.alice, { document: sc2.document, start: "2025-02-02", end: "2025-07-31" });
  const dayTwo = await evaluate(sc2.client, sc2.entry);
  assert.equal(dayOne.refusal ?? null, null);
  assert.equal(dayTwo.refusal ?? null, null);
  assert.equal(dayOne.period_lines[0].period_start, "2025-02-01", "a day-1 start keeps its own month");
  assert.equal(dayTwo.period_lines[0].period_start, "2025-03-01", "a day-2 start yields its month to the predecessor");
  assert.notEqual(dayOne.period_count, dayTwo.period_count,
    "the two arms agreed -- the split-month rule has collapsed and this cell is asserting a tautology");
  assert.equal(dayOne.period_count, 6);
  assert.equal(dayTwo.period_count, 5);
});

test("fa4p2a.W10-companion a term ending MID-MONTH still charges that month (the ruled end behaviour)", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The conductor's 2026-08-27 ruling: a month is charged iff the term covers its FIRST day. The
  // end rule follows from that and is not a second convention -- this is the cell that pins it, so
  // a later lane cannot quietly re-decide it.
  const sc = await prepaidScene("w10c", { cents: 60000 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-07-15" });
  const a = await evaluate(sc.client, sc.entry);
  assert.equal(a.refusal ?? null, null);
  assert.equal(a.period_count, 6, "July's first day is covered, so July is charged in full");
  assert.equal(a.period_lines[5].period_start, "2025-07-01");
});

test("fa4p2a.W10-degenerate a term covering NO month's first day refuses rather than emitting a zero-period schedule", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w10d", { cents: 5000 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-02", end: "2025-02-27" });
  const a = await evaluate(sc.client, sc.entry);
  assert.equal(a.refusal, "prepayment_term_underivable",
    "a term inside one month charges no whole month and must refuse, never emit an empty schedule");
});

// ---------------------------------------------------------------------------------------------
// W41-W43 -- N1: THE CONGRUENCE CONSTRAINT, VALIDATED AT PROPOSE. Without clause (a) the D1
// inventory is SIX bodies, not four.
// ---------------------------------------------------------------------------------------------

test("fa4p2a.W41 a schedule period posting to a BANK account not present in `lines` refuses AT PROPOSE, before any row is written", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE SHARP ONE. An amount-blind reader cannot see this: _wdb_line_shape discards magnitudes and
  // the eligibility reads look at `lines`, so an incongruent schedule would slip past every one of
  // them and post to a bank control. Clause (a) is what makes them correct BY CONSTRUCTION.
  const sc = await prepaidScene("w41", { cents: 30000 });
  const bank = (await rootQuery(
    "select coa_account_code from clara.bank_accounts where client_id = $1 limit 1", [sc.client])).rows[0];
  const bankCode = bank?.coa_account_code ?? "170-C56";
  const lines = pair(sc.target, sc.prepaid, 10000);
  const before = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id = $1", [sc.client]);
  const e = await caught(() => propose(sc.alice, {
    client: sc.client, name: `w41-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(bankCode, sc.prepaid, 10000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 10000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 10000) },
    ],
  }));
  assert.ok(e, "an incongruent schedule proposed cleanly -- clause (a) is not being asked");
  assert.match(String(e.detail ?? e.message), /schedule_shape_incongruent/);
  const after = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id = $1", [sc.client]);
  assert.equal(after.rows[0].n, before.rows[0].n, "a refused proposal still wrote a template row");
});

test("fa4p2a.W41-mutant the CONGRUENT schedule proposes cleanly -- clause (a) is not refusing everything", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w41m", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const r = await propose(sc.alice, {
    client: sc.client, name: `w41m-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 10000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 10000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 10000) },
    ],
  });
  assert.ok(r?.template_id, `a congruent schedule was refused: ${JSON.stringify(r).slice(0, 200)}`);
});

test("fa4p2a.W42 a schedule period out of balance by ONE SEN refuses at propose", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w42", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const bad = [{ account_code: sc.target, debit_cents: 10001, credit_cents: 0, description: "d" },
               { account_code: sc.prepaid, debit_cents: 0, credit_cents: 10000, description: "c" }];
  const e = await caught(() => propose(sc.alice, {
    client: sc.client, name: `w42-${uniq()}`, start: "2025-02-01", end: "2025-03-31", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: bad },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 10000) },
    ],
  }));
  assert.ok(e, "an unbalanced schedule period proposed cleanly");
  assert.match(String(e.detail ?? e.message), /schedule_period_unbalanced/);
});

test("fa4p2a.W43 coverage: an EMPTY schedule and a GAP both refuse at propose", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w43", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const empty = await caught(() => propose(sc.alice, {
    client: sc.client, name: `w43e-${uniq()}`, start: "2025-02-01", end: "2025-03-31", lines,
    schedule: [] }));
  assert.ok(empty, "an EMPTY schedule proposed cleanly -- every occurrence would reach the resolver's no-match branch");
  assert.match(String(empty.detail ?? empty.message), /schedule_coverage_gap/);
  const gap = await caught(() => propose(sc.alice, {
    client: sc.client, name: `w43g-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 10000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 10000) },
    ] }));
  assert.ok(gap, "a schedule with a missing month proposed cleanly");
  assert.match(String(gap.detail ?? gap.message), /schedule_coverage_gap/);
});

test("fa4p2a.W43-resolver a period the schedule does not cover raises a TYPED refusal, never an empty line set", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // REACHED THROUGH LAWFUL MEANS, and the first cut of this cell could not be. Annex A allowed a
  // planted row here as one of two NAMED exceptions, on the reasoning that no governed door can
  // produce an uncovered period. That reasoning was half right: the door cannot, but it does not
  // need to -- a template whose DECLARED range is February alone passes clause (c) honestly, and
  // asking its resolver for MARCH reaches the no-match branch with nothing planted at all. Worth
  // recording, because the planting exception is one fewer than the annex budgeted for.
  //
  // (The plant is also simply impossible: clara._tf_adjustment_template_transition refuses an
  // UPDATE to `schedule` with CLR38, which cell W36-immutability pins.)
  const sc = await prepaidScene("w43r", { cents: 30000 });
  const lines = pair(sc.target, sc.prepaid, 10000);
  const r = await propose(sc.alice, {
    client: sc.client, name: `w43r-${uniq()}`, start: "2025-02-01", end: "2025-02-28", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 10000) },
    ] });
  assert.ok(r?.template_id, "the single-period template was refused");
  // The covered period answers.
  const ok = await rootQuery(
    `select clara._adj_period_lines(t.schedule, t.lines, date '2025-02-01', date '2025-02-28') as l
       from clara.adjustment_templates t where t.id = $1`, [r.template_id]);
  assert.equal(Number(ok.rows[0].l[0].debit_cents), 10000, "the covered period must answer normally");
  // An UNCOVERED period must RAISE, never return an empty set.
  const e = await caught(() => rootQuery(
    `select clara._adj_period_lines(t.schedule, t.lines, date '2025-03-01', date '2025-03-31')
       from clara.adjustment_templates t where t.id = $1`, [r.template_id]));
  assert.ok(e, "the resolver answered for a period the schedule does not cover -- an empty line set would post a zero-line occurrence that balances trivially and charges nothing");
  assert.match(String(e.detail ?? e.message), /schedule_period_uncovered/);
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  // (iv) of Annex A's own vacuity defence: a cell that only ever skips is a false green. This
  // asserts the SHAPE of the run, and it is the last cell in the file so it sees every decision.
  assert.equal(skipped, 0,
    `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip (Annex A's armed-skip statement)`);
});
