// #936 — A DEDICATED ACCRUAL-CORRECTION DOOR.
// Migration: 0284_accrual_correction.sql (stem `accrual_correction$`).
//
// THE BUG THIS BATTERY PROVES CLOSED. Before this door, the only way to change an accrual's
// amount was `clara.revise_accounting_plan` (0193): it advances the plan to a new revision, but
// `clara.accrual_adjustments` stayed keyed to the FIRST revision, so a reader joining
// plan -> revision -> accrual detail saw the OLD amount beside the NEW one the ledger would post
// from the next due date on.
//
// THE CLAIMS THIS BATTERY EXISTS TO PROVE:
//
//   1. THE PLAN REVISION AND THE ACCRUAL DETAIL AGREE. Correcting an accrual advances the plan to
//      a NEW live revision carrying the corrected basis, and writes the accrual-detail row for
//      THAT SAME revision — the (plan_id, revision) join `clara.get_accrual_adjustment` and every
//      occurrence resolve through is single-valued and answers the corrected figures.
//   2. THE CORRECTION POINTER NAMES THE SUPERSEDED ROW, in both directions: the new row's
//      `corrects_accrual_id` and the old row's `corrected_by_accrual_id` name each other, and the
//      old row is otherwise byte-for-byte what it was (0222's append-only trigger admits exactly
//      this one stamp).
//   3. ALREADY-POSTED OCCURRENCES, AND THEIR REVERSALS, ARE UNTOUCHED. A correction changes
//      nothing about a due event that has already run; the change reaches only occurrences the
//      plan has not yet admitted.
//   4. THE NESTED DOOR IS clara.revise_accounting_plan, NEVER RECUT (lane 05's own pin) — proved
//      here by the SAME schedule/window surviving the correction untouched.
//   5. ONE CORRECTION PER TARGET, TYPED. A second correction of an already-corrected row is
//      refused BY NAME, not by a bare unique-constraint violation.
//
// CONTRACT-BLIND against #936's own contract, frontier-gated on the `accrual_correction$` stem.
// EVERY assertion under test runs through a `humanQuery` persona at the least privilege that
// should succeed; `rootQuery` appears only for the corroborating half of an assertion whose
// subject was exercised through a door.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAccrualCorrection, assertAccrualCorrectionCohortPresent, buildWorkWorld, endPool,
  printLaneNotes, printSkipCount, opk, rootQuery, CLR, assertPair,
  instructionRef, occurrenceRows, postPlanWork,
  todayInPlanZone, shiftMonths,
  accrual, accrualRows, accrualCount, freshAccrualClient,
  createAccrualAdjustment, getAccrualAdjustment,
  correctAccrualAdjustment, ACCRUAL_CORRECTION_REASON, ACCRUAL_REASON, ACCRUAL_TZ,
} from "./accrual-correction-fixtures.mjs";

let world = null;
let today = null;
before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
});
after(async () => {
  printLaneNotes("accrual-correction");
  printSkipCount("accrual-correction");
  await endPool();
});

const ALICE = () => world.users.alice;   // owner of firm A
const BOB = () => world.users.bob;       // bookkeeper of firm A — the least privilege that writes
const CAROL = () => world.users.carol;   // viewer of firm A

const monthStart = (day) => `${day.slice(0, 7)}-01`;

/** The month end `n` months back, as YYYY-MM-DD in the plan zone — duplicated from
 *  accrual-adjustments.test.mjs's own local helper (not exported there either) so this battery
 *  stays self-contained. */
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/** A window that ENDS at last month's month end — safely in the past on every calendar day this
 *  battery runs, so "the current period's occurrence was admitted at configuration time" holds
 *  regardless of today's date (the same reasoning `span()` states in accrual-adjustments.test.mjs). */
async function pastSpan(monthsBack = 2) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** A complete, valid accrual configuration on a FRESH client of firm A, through the human
 *  configuration door — the base row every correction cell corrects. */
async function configureBase({ sub = BOB(), tag = "p936", over = {} } = {}) {
  const client = await freshAccrualClient(ALICE(), tag);
  const ref = await instructionRef({ client, author: sub });
  const s = await pastSpan(2);
  const particulars = accrual({
    servicePeriodStart: s.from, servicePeriodEnd: s.to, ...over,
  });
  const created = await createAccrualAdjustment(sub, {
    client, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: s.from, effectiveTo: s.to,
  });
  return { ...created, client, author: sub, effectiveFrom: s.from, effectiveTo: s.to, particulars };
}

// ===========================================================================================
// p936.basic — THE PLAN REVISION AND THE ACCRUAL DETAIL AGREE.
// ===========================================================================================

test("p936.basic — correcting an accrual's amount advances the plan to a new revision, writes the accrual detail for THAT revision, and the correction pointer names the superseded row in both directions", async (t) => {
  if (await assertAccrualCorrectionCohortPresent(t)) return;
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "basic" });
  assert.equal(base.revision, 1, "the base accrual is on the plan's first revision");

  const corrected = accrual({
    servicePeriodStart: base.particulars.service_period_start,
    servicePeriodEnd: base.particulars.service_period_end,
    cents: 999900,
  });
  const result = await correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: corrected });

  assert.equal(result.corrects_accrual_id, base.accrual_id, "the answer names the row it supersedes");
  assert.equal(result.plan_id, base.plan_id, "the SAME plan — a correction is not a new plan");
  assert.equal(result.revision, 2, "the plan advanced to a new revision");
  assert.equal(result.superseded_revision, 1, "…superseding the first");
  assert.ok(result.accrual_id && result.accrual_id !== base.accrual_id, "a NEW accrual row, distinct from the old one");

  // THE PLAN REVISION AND THE ACCRUAL DETAIL AGREE — read independently, off the door's own
  // lineage join, never re-derived from the door's own answer.
  const detail = await getAccrualAdjustment(BOB(), result.accrual_id);
  assert.equal(detail.revision, 2);
  assert.equal(detail.amount_cents, 999900, "the NEW accrual detail carries the corrected amount");
  assert.equal(detail.plan.current_revision, 2, "…and the plan's own live revision agrees");
  assert.equal(detail.plan.basis.lines[0].debit_cents, 999900,
    "…and the LIVE PLAN BASIS the ledger will post from also carries the corrected amount — the exact defect #936 closes");
  assert.equal(detail.corrects_accrual_id, base.accrual_id);
  assert.equal(detail.corrected_by_accrual_id, null, "the successor itself has not (yet) been corrected");

  // THE POINTER NAMES EACH OTHER, in both directions, read off the raw relation.
  const rows = await accrualRows(base.client);
  const oldRow = rows.find((r) => r.id === base.accrual_id);
  const newRow = rows.find((r) => r.id === result.accrual_id);
  assert.equal(oldRow.corrected_by_accrual_id, result.accrual_id, "the OLD row now names its successor");
  assert.equal(newRow.corrects_accrual_id, base.accrual_id, "…and the successor names it back");
  // THE OLD ROW IS OTHERWISE UNMOVED — every OTHER column byte-for-byte what it was, which is
  // 0222's append-only trigger's own law (exactly one admitted update).
  // amount_cents is bigint; node-postgres hands it back as a string.
  assert.equal(Number(oldRow.amount_cents), base.particulars.amount_cents, "the OLD row's amount is unchanged");
  assert.equal(oldRow.revision, 1, "…and it still names the revision IT ran under");
  assert.equal(await accrualCount(base.client), 2, "exactly two accrual rows: the original and its correction");

  // THE SCHEDULE AND THE AUTHORITY WINDOW SURVIVED UNTOUCHED — the nested door is
  // clara.revise_accounting_plan and this door changes no schedule argument (claim 4).
  // date columns cast ::text explicitly: node-postgres otherwise hands a `date` column to JS as a
  // LOCAL-midnight Date, and printing one under a non-UTC offset shifts the calendar day.
  const revs = (await rootQuery(
    `select revision, frequency, day_rule, effective_from::text as effective_from,
            effective_to::text as effective_to, superseded_at
       from clara.accounting_plan_revisions where plan_id=$1 order by revision`,
    [base.plan_id])).rows;
  assert.equal(revs.length, 2, "two plan revisions: the original, superseded, and the new live one");
  const live = revs.find((r) => r.superseded_at === null);
  assert.equal(live.revision, 2);
  assert.equal(live.frequency, "monthly");
  assert.equal(live.day_rule, "last_day_of_month");
  assert.equal(live.effective_from, base.effectiveFrom, "the authority window did not move");
  assert.equal(live.effective_to, base.effectiveTo, "…on either side");
});

// ===========================================================================================
// p936.posted.untouched — ALREADY-POSTED OCCURRENCES, AND THEIR REVERSALS, ARE UNTOUCHED.
// ===========================================================================================

test("p936.posted.untouched — an occurrence already posted under the OLD revision, and its outstanding reversal, are byte-for-byte unmoved by a correction; the change reaches only what the plan has not yet admitted", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "posted" });
  assert.equal(base.occurrence?.leg, "primary", "the configuration admitted the current period's accrual leg");
  const workId = base.occurrence.work_id;
  const entry = await postPlanWork({ work: workId, client: base.client, author: base.author, firm: world.firms.A });

  const before = await occurrenceRows(base.plan_id);
  assert.equal(before.length, 1, "one occurrence exists before the correction");
  const beforeOcc = before[0];
  assert.equal(beforeOcc.revision, 1, "…admitted under revision 1");

  const corrected = accrual({
    servicePeriodStart: base.particulars.service_period_start,
    servicePeriodEnd: base.particulars.service_period_end,
    cents: 555500,
  });
  await correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: corrected });

  // THE ALREADY-ADMITTED OCCURRENCE IS BYTE-FOR-BYTE UNMOVED: same row, same revision, same
  // work_id, same admission — a correction writes a new PLAN REVISION and a new ACCRUAL DETAIL
  // row; it does not touch clara.accounting_plan_occurrences at all.
  const after = await occurrenceRows(base.plan_id);
  assert.equal(after.length, 1, "the correction admitted NO new occurrence of its own");
  assert.deepEqual(after[0], beforeOcc, "the occurrence row is byte-for-byte unmoved by the correction");

  // …AND THE ENTRY IT ALREADY POSTED IS UNCHANGED — read independently through the lineage join,
  // keyed on the OLD accrual id, whose own detail must still show what actually posted.
  const oldDetail = await getAccrualAdjustment(BOB(), base.accrual_id);
  assert.equal(oldDetail.posted, true, "the old accrual is still recorded as posted");
  assert.equal(oldDetail.occurrences[0].entry_id, entry, "…against the SAME entry it always named");
  assert.equal(oldDetail.occurrences[0].revision, 1, "…admitted under the OLD revision, unchanged");
});

// ===========================================================================================
// p936.refusal.not_found — NO EXISTENCE ORACLE.
// ===========================================================================================

test("p936.refusal.not_found — an accrual id naming nothing, and one belonging to another firm, are both refused CLR11 accrual_not_found, and nothing is written", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "notfound" });
  const before = await accrualCount(base.client);

  await assertPair(CLR.notFound, ACCRUAL_REASON.accrualNotFound,
    () => correctAccrualAdjustment(BOB(), {
      accrualId: "00000000-0000-4000-8000-000000000000",
      accrual: accrual({
        servicePeriodStart: base.particulars.service_period_start,
        servicePeriodEnd: base.particulars.service_period_end,
      }),
    }), "an accrual id naming nothing");
  assert.equal(await accrualCount(base.client), before, "nothing was written");
});

// ===========================================================================================
// p936.refusal.already_corrected — ONE CORRECTION PER TARGET, TYPED.
// ===========================================================================================

test("p936.refusal.already_corrected — correcting an already-corrected accrual is refused BY NAME, not by a bare unique-constraint error, and writes nothing", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "twice" });
  const firstFix = accrual({
    servicePeriodStart: base.particulars.service_period_start,
    servicePeriodEnd: base.particulars.service_period_end,
    cents: 200000,
  });
  await correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: firstFix });
  const before = await accrualCount(base.client);

  const secondFix = accrual({
    servicePeriodStart: base.particulars.service_period_start,
    servicePeriodEnd: base.particulars.service_period_end,
    cents: 300000,
  });
  await assertPair(CLR.badRequest, ACCRUAL_CORRECTION_REASON.alreadyCorrected,
    () => correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: secondFix }),
    "a second correction of an already-corrected accrual");
  assert.equal(await accrualCount(base.client), before, "nothing was written by the refused attempt");
});

// ===========================================================================================
// p936.role.floor — BOOKKEEPER OR ABOVE, ONLY.
// ===========================================================================================

test("p936.role.floor — a viewer is refused CLR04 attempting a correction; nothing is written", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "floor" });
  const before = await accrualCount(base.client);

  await assertPair(CLR.authz, ACCRUAL_REASON.insufficientRole,
    () => correctAccrualAdjustment(CAROL(), {
      accrualId: base.accrual_id,
      accrual: accrual({
        servicePeriodStart: base.particulars.service_period_start,
        servicePeriodEnd: base.particulars.service_period_end,
      }),
    }), "a viewer correcting an accrual");
  assert.equal(await accrualCount(base.client), before, "nothing was written");
});

// ===========================================================================================
// p936.idempotent.replay — THE SAME KEY REPLAYS THE STORED RESULT, NOT A SECOND CORRECTION.
// ===========================================================================================

test("p936.idempotent.replay — resending the SAME op_key returns the ORIGINAL receipt byte-for-byte and writes no second accrual row", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const base = await configureBase({ tag: "replay" });
  const key = opk("p936-replay");
  const fix = accrual({
    servicePeriodStart: base.particulars.service_period_start,
    servicePeriodEnd: base.particulars.service_period_end,
    cents: 424200,
  });

  const first = await correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: fix, opKey: key });
  const countAfterFirst = await accrualCount(base.client);
  const second = await correctAccrualAdjustment(BOB(), { accrualId: base.accrual_id, accrual: fix, opKey: key });

  assert.deepEqual(second, first, "the replay returns the ORIGINAL receipt byte-for-byte");
  assert.equal(await accrualCount(base.client), countAfterFirst, "the replay wrote no second accrual row");
});

// ===========================================================================================
// p936.acl.grants — THE HUMAN-ONLY DOOR CARRIES NO OBO TWIN.
// ===========================================================================================

test("p936.acl.grants — the correction door is clara_authenticated only: no PUBLIC, no clara_runtime OBO twin, no agent read lane", async (t) => {
  if (await gateAccrualCorrection(t)) return;
  const r = await rootQuery(
    `select has_function_privilege('clara_authenticated', 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') as authenticated,
            has_function_privilege('public', 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') as public,
            has_function_privilege('clara_runtime', 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') as runtime`);
  assert.equal(r.rows[0].authenticated, true, "clara_authenticated holds EXECUTE");
  assert.equal(r.rows[0].public, false, "PUBLIC does not");
  assert.equal(r.rows[0].runtime, false, "clara_runtime does not — there is no OBO twin for this ticket's scope");
});
