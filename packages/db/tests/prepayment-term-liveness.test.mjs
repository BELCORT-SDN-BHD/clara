// #919 — NEITHER PREPAYMENT SCHEDULE READ SAID WHETHER THE TERM ROW A SCHEDULE RODE IS STILL LIVE.
// Migration: 0285_prepayment_term_liveness.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_term_liveness$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `firm_setup_applicability$` / `accrual_correction$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog.
//
// WHAT IS UNDER TEST, one cell per acceptance criterion the Agent Brief still lists open:
//   AC1 — `p919.term.superseded` — a period is recorded, a schedule is derived from it, the period
//     is superseded through the human term door, and BOTH `clara.get_prepayment_schedule` and
//     `clara.list_prepayment_schedules` report the term superseded and name the row that
//     superseded it. The re-record here restates the SAME dates, so the same cell also pins the
//     other half of the answer: the term row was superseded and the TERM ITSELF did not move.
//   AC2 — `p919.term.live` — an UNTOUCHED schedule's term reports live on both reads, with no
//     superseding row named.
//   AC1b — `p919.term.moved` — a re-record that states DIFFERENT dates is the only case in which a
//     surface may tell a firm its schedule needs rebuilding, and both reads say so by name.
//
// WHY `term_moved` EXISTS BESIDE `term_live` (ADV-02, riders wave 3 review round 1).
// `clara._record_document_service_period_core` supersedes the live row UNCONDITIONALLY: it
// compares no dates. So `term_live` goes false on ANY re-record of a document's service period,
// including one that restates the term byte for byte — which is exactly what `p919.term.superseded`
// below does. A surface keyed on `term_live` alone therefore told a firm "the service period …
// has since been CORRECTED … a corrected term needs a new schedule" when nothing about the term
// had changed: a false statement of fact and materially wrong advice about a running amortisation.
// `term_live`/`term_superseded_by` remain the AUDIT facts (which row this schedule rode, and
// whether it is still the live statement); `term_moved` is the one the surface may act on, and
// `term_current_start`/`term_current_end` are the live term itself, so a reader can check the
// flag against the dates rather than take it on trust.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary bookkeeper — through the SAME `humanQuery`/`namedCall`
// wrappers `prepayment-schedule.test.mjs` uses; this file reuses that battery's own scene builder
// and verb wrappers (`prepayment-schedule-fixtures.mjs`) rather than building a third copy of them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, rootQuery, prepaymentScene, createPrepaymentSchedule, getPrepaymentSchedule,
  listPrepaymentSchedules, recordPeriod,
} from "./prepayment-schedule-fixtures.mjs";

const STEM = "prepayment_term_liveness$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing.
 *  Only the package run, which preloads `prepayment-term-liveness-preintegration-gate.mjs`, turns
 *  the absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_TERM_LIVENESS === "1") {
    console.warn(`SKIP prepayment-term-liveness: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("prepayment-term-liveness lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #919 prepayment-term-liveness lane is required for a focused run: apply 0285_prepayment_term_liveness.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

cell("p919.term.superseded — a schedule's term row, superseded through the human term door AFTER the schedule was derived, is reported superseded (naming the row that superseded it) on BOTH reads", async () => {
  const scene = await prepaymentScene("liveness-superseded", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });

  // BEFORE the correction, the term this schedule rode is still the live one.
  const before = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.equal(before.term_live, true, "before any correction, the schedule's term row is live");
  assert.equal(before.term_superseded_by, null);
  assert.equal(before.term_moved, false, "…and nothing about the term has moved");
  assert.equal(before.term_current_start, scene.termStart, "the live term is the one the schedule rode");
  assert.equal(before.term_current_end, scene.termEnd);

  // THE CORRECTION, through the SAME human door #653's own header names as the one lawful
  // producer — recording a period on a document that already carries a LIVE one supersedes it
  // (0140's own supersede-never-mutate shape), without moving anything this schedule already
  // stored (0223's own header: "a genuinely re-derived schedule is a NEW schedule").
  const corrected = await recordPeriod(scene.bob, {
    document: scene.document, start: scene.termStart, end: scene.termEnd,
    basis: "#919 battery: the term was verified a second time against the original invoice",
  });
  assert.ok(corrected.service_period_id, "the door names the new, now-live row");
  assert.equal(corrected.superseded_id, before.service_period_id,
    "…and the row it superseded is exactly the one this schedule named");

  const detail = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.equal(detail.term_live, false, "get_prepayment_schedule reports the term superseded");
  assert.equal(detail.term_superseded_by, corrected.service_period_id,
    "…and NAMES the row that superseded it");
  assert.equal(detail.service_period_id, before.service_period_id,
    "the schedule itself keeps naming the row it actually rode — this file does not re-derive it");

  // …AND THE TERM ITSELF DID NOT MOVE. The re-record above restated the SAME two dates, so the
  // schedule's allocation is still derived from the term that stands today. A surface may not tell
  // this firm to rebuild anything (ADV-02).
  assert.equal(detail.term_moved, false,
    "the term row was superseded, but the TERM did not move — the schedule is still right");
  assert.equal(detail.term_current_start, scene.termStart, "the live term names the same dates");
  assert.equal(detail.term_current_end, scene.termEnd);

  const listed = await listPrepaymentSchedules(scene.bob, scene.client);
  const row = listed.schedules.find((s) => s.schedule_id === created.schedule_id);
  assert.ok(row, "the schedule is in the client's list");
  assert.equal(row.term_live, false, "list_prepayment_schedules reports the SAME fact");
  assert.equal(row.term_superseded_by, corrected.service_period_id,
    "…and names the SAME superseding row");
  assert.equal(row.term_moved, false, "…and agrees that the term did not move");
  assert.equal(row.term_current_start, scene.termStart);
  assert.equal(row.term_current_end, scene.termEnd);
});

cell("p919.term.moved — a re-record that states DIFFERENT dates reports term_moved on BOTH reads, and names the term that stands now", async () => {
  const scene = await prepaymentScene("liveness-moved", { cents: 75000, termMonthsBack: 4, termMonths: 3 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });

  // THE TERM GENUINELY MOVES: the same start, an end one month later. Computed by the database
  // rather than by string arithmetic here, so the expected value is independent of JS date maths.
  const movedEnd = (await rootQuery(
    `select ((date_trunc('month', $1::date + interval '1 month') + interval '1 month'
              - interval '1 day')::date)::text as d`, [scene.termEnd])).rows[0].d;
  assert.notEqual(movedEnd, scene.termEnd, "the corrected term really is a different term");

  const corrected = await recordPeriod(scene.bob, {
    document: scene.document, start: scene.termStart, end: movedEnd,
    basis: "#919 battery: the supplier confirmed the service runs a month longer than invoiced",
  });

  const detail = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.equal(detail.term_live, false, "the row the schedule rode is no longer the live one");
  assert.equal(detail.term_superseded_by, corrected.service_period_id);
  assert.equal(detail.term_moved, true, "…and THIS time the term itself moved");
  assert.equal(detail.term_current_start, scene.termStart, "the live term keeps the same start");
  assert.equal(detail.term_current_end, movedEnd, "…and names the corrected end");
  assert.equal(detail.term_end, scene.termEnd,
    "the schedule's own stored term is untouched — a corrected term needs a NEW schedule, which is exactly why the surface may say so here");

  const listed = await listPrepaymentSchedules(scene.bob, scene.client);
  const row = listed.schedules.find((s) => s.schedule_id === created.schedule_id);
  assert.ok(row, "the schedule is in the client's list");
  assert.equal(row.term_moved, true, "list_prepayment_schedules reports the SAME fact");
  assert.equal(row.term_current_end, movedEnd, "…and names the SAME corrected end");
});

cell("p919.term.live — an untouched schedule's term reports live on both reads, naming no superseding row", async () => {
  const scene = await prepaymentScene("liveness-live", { cents: 60000, termMonthsBack: 4, termMonths: 3 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });

  const detail = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.equal(detail.term_live, true);
  assert.equal(detail.term_superseded_by, null);
  assert.equal(detail.term_moved, false);
  assert.equal(detail.term_current_start, scene.termStart);
  assert.equal(detail.term_current_end, scene.termEnd);

  const listed = await listPrepaymentSchedules(scene.bob, scene.client);
  const row = listed.schedules.find((s) => s.schedule_id === created.schedule_id);
  assert.ok(row, "the schedule is in the client's list");
  assert.equal(row.term_live, true);
  assert.equal(row.term_superseded_by, null);
  assert.equal(row.term_moved, false);
  assert.equal(row.term_current_end, scene.termEnd);
});
