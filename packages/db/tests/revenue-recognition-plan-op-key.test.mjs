// #1077 — ONE OPERATION KEY, TWO LANES, ONE NESTED RESERVATION NAMESPACE.
// Migration: 0336_revenue_recognition_plan_op_key.sql.
//
// THE DEFECT, in the ticket's own words: "the prepayment lane and the deferred-revenue lane share
// one idempotency key namespace for their nested plan reservation, so an operation key reused
// across the two lanes can collide and answer with an untyped CLR10, giving a caller no way to
// tell what actually went wrong."
//
// Both lanes' human arms write their underlying accounting plan through 0193's own door, and both
// derive the nested key the same way — `p_op_key || ':plan'`. `clara._reserve_op` keys a receipt on
// (firm, fn, op_key), and the fn for BOTH nested calls is `create_accounting_plan`, so a caller
// that derives its keys from a shared seed reserves the SAME row twice with different arguments and
// is answered `op_key reused with different args` under CLR10 with no detail at all. The two
// correction doors collide the same way, one step earlier, on `p_op_key || ':end'` under
// `end_accounting_plan`.
//
// EVERY CELL DRIVES THE DOORS. The claim is about what a caller sees, so no cell asserts on a
// reservation the doors did not actually take.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeferredLanePresent, endPool, opk,
  deferredRevenueScene, createRecognitionSchedule, recordStatedTerm,
  createPrepaymentSchedule, opReceiptsFor,
} from "./revenue-recognition-fixtures.mjs";
import {
  RR_PLAN_OP_KEY_GATE, RR_PLAN_OP_KEY_STEM, rrPlanOpKeyApplied,
} from "./revenue-recognition-plan-op-key-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => { ready = await rrPlanOpKeyApplied().catch(() => false); });

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (!await rrPlanOpKeyApplied()) {
      if (process.env[RR_PLAN_OP_KEY_GATE] !== "1") {
        throw new Error(
          `#1077 premise 0336_revenue_recognition_plan_op_key.sql is not applied (no `
          + `${RR_PLAN_OP_KEY_STEM} row in clara.schema_migrations) and ${RR_PLAN_OP_KEY_GATE} is `
          + "unset -- this is a FOCUSED run and must fail loudly, not skip. Preload "
          + "./tests/revenue-recognition-plan-op-key-preintegration-gate.mjs for an estate sweep "
          + "against a pre-0336 chain.");
      }
      t.skip("0336_revenue_recognition_plan_op_key not applied -- probed at the live ledger");
      return;
    }
    if (await assertDeferredLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// AC1 / AC2 — THE CREATE DOORS.
// ===========================================================================================

cell("p1077.cross_lane.create — one operation key spent on the prepayment lane and again on the "
  + "deferred-revenue lane configures BOTH schedules: each lane's nested plan reservation stands "
  + "under its own key, and neither lane can see the other's",
async () => {
  const scene = await deferredRevenueScene("xlanecreate", {
    cents: 90000, termMonthsBack: 4, termMonths: 3 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#1077 battery: the member said three months when they paid" });

  // ONE KEY, the shape the ticket names: a caller that derives its operation keys from a seed it
  // shares across the two lanes.
  const shared = opk("p1077-shared");

  const prepaid = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: shared });
  assert.ok(prepaid.schedule_id, "the prepayment lane configured its schedule");
  assert.ok(prepaid.plan_id, "…and named the plan it rides");

  const deferred = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef, opKey: shared });
  assert.ok(deferred.schedule_id,
    "the deferred-revenue lane is admitted on a key the prepayment lane already spent");
  assert.notEqual(deferred.plan_id, prepaid.plan_id,
    "the two lanes wrote two different plans, so nothing was replayed from the other's receipt");

  // THE OUTER RESERVATIONS never collided: they differ by `fn`. The claim is the NESTED ones.
  const outer = await opReceiptsFor(scene.firm, shared);
  assert.deepEqual(outer.map((r) => r.fn).sort(),
    ["create_prepayment_schedule", "create_revenue_recognition_schedule"],
    "one key, two outer reservations, one per lane's own door");

  const prepayNested = await opReceiptsFor(scene.firm, `${shared}:plan`);
  assert.deepEqual(prepayNested.map((r) => r.fn), ["create_accounting_plan"],
    "the prepayment lane keeps `:plan`, exactly as before");
  const deferredNested = await opReceiptsFor(scene.firm, `${shared}:rrplan`);
  assert.deepEqual(deferredNested.map((r) => r.fn), ["create_accounting_plan"],
    "the deferred-revenue lane reserves its nested plan under a key of its own");
  assert.equal(deferredNested.length, 1,
    "…and exactly one row, so the lane really took the reservation rather than skipping it");
});
