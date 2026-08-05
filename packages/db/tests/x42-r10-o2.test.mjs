// 0042 Wave D-b — ROUND-10 FIX WAVE, LANE O2: the triplet's dead branch + instrument
// completeness (session 651d02fc; ladder-r10-record.md findings 4, 5, 6, 7; full evidence in
// r10-Z2-report.json and r10-Z3-report.json).
//
// This file carries the two findings whose durable proof did not fit naturally inside an
// existing round-9 file:
//
//   F7-arm-E (Z3 finding 2, HIGH) — S5.25's five arms (round-9) are all scoped to the `clara`
//   schema; a clara body that reaches a date-deriving helper through an EXPLICIT
//   schema-qualified call to a DIFFERENT schema evades all five simultaneously. Fixed by a new
//   arm (E) in s5-residuals.sql (0042 S5.25). CELL 1 reproduces Z3's own probe
//   (scratchpad/z3-schema-evasion.sql) as a durable, self-cleaning plant-and-detect assertion.
//
//   F4 (Z2 finding 4, MEDIUM) — `active_pair_status='completed'` is DB-unreachable from
//   `_adj_correction_door`'s own pair lookup (scoped to the schema's "active" predicate), so a
//   COMPLETED correction's run envelope carries active_pair_id/active_pair_status:null. The
//   dashboard-side fix (AdjustmentRunReceiptCard.tsx, correctionPhase) re-keys off
//   correction_wall + reversal_entry_id instead — CELL 2/3 prove the DB PREMISE that fix relies
//   on is real, at both stake levels, not merely read off the SQL source.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, printSkipCount, rootQuery, humanQuery,
  x42EnsureReady, skip42, EXPA, ACCR, mon,
  runManual, reversePair, approvePairReversal, accrualLines,
  adjWorld, freshAdjClient, liveTemplate, approveDraft,
  mirrorOf, firmThresholdOf, receiptForEntry,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-r10-o2");
  printSkipCount("x42-r10-o2");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-10 fix-wave O2 battery (cross-schema clock census + the completed-pair door premise)");

const getRun = async (sub, run) =>
  (await humanQuery(sub, "select clara.get_adjustment_run(p_run => $1) as r", [run])).rows[0].r.run;

// ===========================================================================
// F7-arm-E [round-10 fix wave, lane O2; r10 Z3 finding 2, HIGH] — THE CROSS-SCHEMA ESCAPE
// HATCH, PLANTED AND DETECTED. Reproduces Z3's own probe (scratchpad/z3-schema-evasion.sql)
// almost verbatim: a helper OUTSIDE clara deriving a session-clock date, called by a clara
// body through an explicit schema-qualified call. Self-cleaning (drops both planted functions
// in a `finally`, so a failure mid-assertion still leaves the catalog clean for every other
// cell in this suite).
// ===========================================================================
test("x42.r10o2.arme S5.25 arm (E) refuses a clara body that reaches a session-clock date through an explicit schema-qualified call to a helper OUTSIDE clara — the exact evasion r10 Z3 measured", async (t) => {
  if (skipHere(t)) return;

  // (0) BASELINE: the shipped 0042 catalog carries zero such calls (arm E's own zero-tolerance
  // premise) — confirmed by the fact 0042 applied clean in the first place (S5.25's own
  // postcheck DO-block would have refused the migration otherwise), re-measured directly here.
  const baseline = await rootQuery(
    `select coalesce(string_agg(distinct sub.proname, ', ' order by sub.proname), '') as v
       from (
         select p.proname, m[1] as schema_ref
           from pg_proc p,
                lateral regexp_matches(
                  lower(regexp_replace(regexp_replace(regexp_replace(
                    coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                    '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g')),
                  '\\m([a-z_][a-z0-9_]+)\\.[a-z_][a-z0-9_]*\\s*\\(', 'g') as m
          where p.pronamespace = 'clara'::regnamespace
       ) sub
      where sub.schema_ref not in ('clara', 'pg_catalog', 'pg_temp', 'new', 'old')`);
  assert.equal(baseline.rows[0].v, "", "the shipped 0042 catalog must carry ZERO cross-schema calls out of clara — arm E's own zero-tolerance premise");

  // (1) PLANT the exact Z3 evasion: a `public` helper deriving a session-clock date, called by
  // a NEW clara function through an explicit schema-qualified call. Neither function's own
  // text (in isolation) contains a clock-fn token that arms (A)/(D) would catch.
  try {
    await rootQuery(`create function public._x42r10o2_session_today() returns date
        language sql stable as $fn$ select now()::date $fn$`);
    await rootQuery(`create function clara._x42r10o2_planted_reader() returns date
        language sql stable as $fn$ select public._x42r10o2_session_today() $fn$`);

    // The planted READER's own source names no clock-fn token — arms (A)/(D) alone would miss
    // it (MEASURED, matching Z3's own finding).
    const planted = await rootQuery(
      `select lower(coalesce(prosrc,'')) as src from pg_proc
        where pronamespace='clara'::regnamespace and proname='_x42r10o2_planted_reader'`);
    assert.ok(!/now\(\)|current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp/i
      .test(planted.rows[0].src), "the planted clara reader's OWN text must name no clock-fn token — otherwise this cell would not be testing arm E at all");

    // And it IS live and working underneath — the exact defect class this arm forbids.
    const live1 = await rootQuery("select clara._x42r10o2_planted_reader() as d, current_date as cd");
    assert.equal(String(live1.rows[0].d), String(live1.rows[0].cd),
      "the planted reader must be a REAL, working session-clock date — proving the evasion is not merely syntactic");

    // (2) DETECT: re-run arm E's own query (as it now ships in 0042 s5-residuals.sql) and
    // confirm the plant is caught.
    const detected = await rootQuery(
      `select coalesce(string_agg(distinct sub.proname, ', ' order by sub.proname), '') as v
         from (
           select p.proname, m[1] as schema_ref
             from pg_proc p,
                  lateral regexp_matches(
                    lower(regexp_replace(regexp_replace(regexp_replace(
                      coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                      '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g')),
                    '\\m([a-z_][a-z0-9_]+)\\.[a-z_][a-z0-9_]*\\s*\\(', 'g') as m
            where p.pronamespace = 'clara'::regnamespace
         ) sub
        where sub.schema_ref not in ('clara', 'pg_catalog', 'pg_temp', 'new', 'old')`);
    assert.equal(detected.rows[0].v, "_x42r10o2_planted_reader",
      "arm E's cross-schema query must name the planted reader — the r10 Z3 evasion, caught");
  } finally {
    // (3) CLEANUP, unconditional — never leave a planted evasion standing for a sibling cell.
    await rootQuery("drop function if exists clara._x42r10o2_planted_reader()");
    await rootQuery("drop function if exists public._x42r10o2_session_today()");
  }

  // (4) POST-CLEANUP: the catalog reads clean again — the plant left no residue.
  const after1 = await rootQuery(
    `select coalesce(string_agg(distinct sub.proname, ', ' order by sub.proname), '') as v
       from (
         select p.proname, m[1] as schema_ref
           from pg_proc p,
                lateral regexp_matches(
                  lower(regexp_replace(regexp_replace(regexp_replace(
                    coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                    '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g')),
                  '\\m([a-z_][a-z0-9_]+)\\.[a-z_][a-z0-9_]*\\s*\\(', 'g') as m
          where p.pronamespace = 'clara'::regnamespace
       ) sub
      where sub.schema_ref not in ('clara', 'pg_catalog', 'pg_temp', 'new', 'old')`);
  assert.equal(after1.rows[0].v, "", "the plant must leave no residue behind for the next cell in this suite");
});

// ===========================================================================
// F4 [round-10 fix wave, lane O2; r10 Z2 finding 4, MEDIUM] — THE DASHBOARD FIX'S OWN DB
// PREMISE, MEASURED (WDB-R4 off-path support): AdjustmentRunReceiptCard.tsx's correctionPhase
// re-keys a completed pair off correction_wall + reversal_entry_id BECAUSE active_pair_id/
// active_pair_status genuinely read null once a pair completes — proven here at BOTH stake
// levels, not merely read off _adj_correction_door's source.
// ===========================================================================

/** An auto_reverse template plus ONE approved occurrence — a born pair (the
 *  x42-pair-correction.test.mjs precedent, reproduced locally so this file has no
 *  cross-file coupling to another lane's fixture helper). */
async function bornPair(label, { cents = 60_000, period = mon(-3), client = null } = {}) {
  client = client ?? (await freshAdjClient(label));
  const tpl = await liveTemplate({
    client, label, start: period.start, cents, autoReverse: true,
    lines: accrualLines(cents, { debit: EXPA, credit: ACCR }), memo: "x42r10o2 accrual" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, r.entry_id);
  const mirror = await mirrorOf(r.entry_id);
  assert.ok(mirror, `${label}: the pair was born`);
  return { client, tpl, occurrence: r.entry_id, mirror };
}

test("x42.r10o2.f4a LOW-STAKES: once reverse_adjustment_pair completes in one act, the run envelope reads active_pair_id/active_pair_status:null with correction_wall:'entry_already_reversed' and reversal_entry_id carried — the exact shape correctionPhase's wall-based fallback consumes", async (t) => {
  if (skipHere(t)) return;
  const p = await bornPair("r10o2f4a", { cents: 58_400 });
  const receipt = await receiptForEntry(p.occurrence);
  assert.ok(receipt?.id, "the occurrence's own run receipt exists before the correction");

  const rec = await reversePair(w.users.bob, {
    client: p.client, occurrence: p.occurrence, reason: "x42 r10o2f4a: over-accrued" });
  assert.equal(rec.status, "completed", "a low-stakes pair correction completes in one act");

  const run = await getRun(w.users.alice, receipt.id);
  assert.equal(run.active_pair_id, null, "MEASURED: active_pair_id reads null once the pair is completed — _adj_correction_door's lookup excludes finished pairs by construction");
  assert.equal(run.active_pair_status, null, "…and so does active_pair_status");
  assert.equal(run.correctable, false, "the occurrence is not correctable again");
  assert.equal(run.correction_wall, "entry_already_reversed", "the wall correctionPhase's fallback keys on");
  assert.ok(run.reversal_entry_id, "reversal_entry_id (the run's own immutable mint-time fact) is still carried — the signal that tells this apart from a solo reverse_entry completion");
});

test("x42.r10o2.f4b HIGH-STAKES: after the park completes via approve_pair_reversal (a SECOND checker), the run envelope reads the SAME shape — the fallback holds at both stake levels, matching r10-Z2-report.json finding 4's own measurement", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r10o2f4b");
  const cents = (await firmThresholdOf(client)) + 350_000;
  const p = await bornPair("r10o2f4b", { cents, period: mon(-3), client });
  const receipt = await receiptForEntry(p.occurrence);

  const parked = await reversePair(w.users.bob, {
    client: p.client, occurrence: p.occurrence, reason: "x42 r10o2f4b: over-accrued (high-stakes)" });
  assert.equal(parked.status, "pending", "a high-stakes pair correction parks both drafts");

  const midflight = await getRun(w.users.alice, receipt.id);
  assert.equal(midflight.active_pair_id, parked.pair_id, "WHILE parked, active_pair_id names the in-flight pair — the round-8 branch this fallback sits beside");
  assert.equal(midflight.active_pair_status, "pending");

  const done = await approvePairReversal(w.users.hana, { client: p.client, pair: parked.pair_id });
  assert.equal(done.status, "completed", "a distinct checker completes the park");

  const run = await getRun(w.users.alice, receipt.id);
  assert.equal(run.active_pair_id, null, "MEASURED at the high-stakes stake level too: active_pair_id drops to null the moment the pair completes");
  assert.equal(run.active_pair_status, null);
  assert.equal(run.correction_wall, "entry_already_reversed");
  assert.ok(run.reversal_entry_id, "reversal_entry_id is still carried");
});
