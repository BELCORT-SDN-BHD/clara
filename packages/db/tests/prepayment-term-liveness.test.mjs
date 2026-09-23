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
//     superseded it.
//   AC2 — `p919.term.live` — an UNTOUCHED schedule's term reports live on both reads, with no
//     superseding row named.
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
const EXPECTED_CELLS = 2;

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

  const listed = await listPrepaymentSchedules(scene.bob, scene.client);
  const row = listed.schedules.find((s) => s.schedule_id === created.schedule_id);
  assert.ok(row, "the schedule is in the client's list");
  assert.equal(row.term_live, false, "list_prepayment_schedules reports the SAME fact");
  assert.equal(row.term_superseded_by, corrected.service_period_id,
    "…and names the SAME superseding row");
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

  const listed = await listPrepaymentSchedules(scene.bob, scene.client);
  const row = listed.schedules.find((s) => s.schedule_id === created.schedule_id);
  assert.ok(row, "the schedule is in the client's list");
  assert.equal(row.term_live, true);
  assert.equal(row.term_superseded_by, null);
});
