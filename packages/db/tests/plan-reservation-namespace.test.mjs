// #1150 — ONE NESTED PLAN RESERVATION NAMESPACE PER LANE, AND ONE ON-BEHALF-OF PLAN BODY.
// Migration: 0364_plan_reservation_namespace_obo_fold.sql.
//
// THE DEFECT, in the ticket's own words: "Three bodies outside #1077's two lanes still derive the
// same nested `:plan` operation key, so one key spent on a tenancy rent plan and a prepayment
// schedule still collides and still answers an untyped refusal. And the estate still carries three
// on-behalf-of plan-creation steps where one would do."
//
// THE SEAMS (WORK-ORDER rule 4), named before the first cell:
//   S1. `clara.create_accrual_adjustment(p_client, p_purpose, p_authority_ref, p_accrual, …,
//       p_op_key)` — the accrual configuration door, whose nested plan reservation moves.
//   S2. `clara.correct_accrual_adjustment(p_accrual_id, p_accrual, p_op_key)` — the accrual
//       correction door, whose nested REVISION reservation moves.
//   S3. `clara.confirm_tenancy_rent_plan(p_client, p_document, …, p_op_key)` — the human tenancy
//       confirmation, whose nested plan reservation moves.
//   S4. `clara.confirm_tenancy_rent_plan_for(p_client, p_author, p_document, …, p_op_key)` — the
//       on-behalf-of twin, whose plan step becomes a caller of `clara._obo_plan_core`.
//   S5. `clara.confirm_tenancy_rent_plan_revision(_for)` — the revision entrances, for the closed
//       lane set.
//   S6. `clara.create_prepayment_schedule(…, p_op_key)` — the lane that KEEPS `:plan`, driven so
//       that "the other lanes moved" is a statement about a key actually spent on it.
//   S7. The LIVE CATALOG (`pg_proc.prosrc`) — the census seam. This repo's own documented shape
//       for a claim about a body a cell written today cannot drive (WORK-ORDER rule 4's carve-out).
//
// EVERY BEHAVIOURAL CELL DRIVES THE DOORS. The claim is about what a caller sees, so no cell
// asserts on a reservation the doors did not actually take.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { endPool, ensureReady } from "./rig-fixtures.mjs";
import {
  PLAN_NS_GATE, PLAN_NS_STEM, planNamespaceApplied, tenancyLanePresent,
  namespaceScene, accrualLaneIn, tenancyLaneIn, pastSpan,
  createPrepaymentSchedule, createAccrualAdjustment, accrual,
  confirmRentPlan, receiptsUnder, opk1150,
} from "./plan-reservation-namespace-fixtures.mjs";

const ACCRUAL_TZ = "Asia/Kuala_Lumpur";

let ready = false;
let lane = false;

before(async () => {
  ready = await ensureReady();
  if (ready) lane = await tenancyLanePresent();
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) { t.skip("rig not ready"); return true; }
  if (!lane) { t.skip("0353_tenancy_agent_twins_obo_confirmations is not applied"); return true; }
  return false;
}

// ===========================================================================================
// AC1 — ONE OPERATION KEY, THREE LANES, NO COLLISION.
//
// `clara._reserve_op` keys on (firm_id, fn, op_key) — the FIRM, not the client — so three clients
// of ONE firm is exactly the shape a caller that derives its operation keys from a shared seed
// has. All three nested reservations land under `create_accounting_plan`, which is why they
// collided at all.
// ===========================================================================================

test("p1150.cross_lane.create — one operation key spent on the prepayment lane, the accrual lane "
  + "and the tenancy lane configures ALL THREE: each lane's nested plan reservation stands under "
  + "its own key, and no lane can see another's",
async (t) => {
  if (unready(t)) return;
  const scene = await namespaceScene("xlane");
  const shared = opk1150("xlane-shared");

  // 1 — THE PREPAYMENT LANE, which keeps `:plan`. Driven FIRST so that every later lane meets a
  //     key that has genuinely been spent on it.
  const prepaid = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: shared });
  assert.ok(prepaid.schedule_id, "the prepayment lane configured its schedule");
  assert.ok(prepaid.plan_id, "…and named the plan it rides");

  // 2 — THE ACCRUAL LANE, on the SAME key.
  const acc = await accrualLaneIn(scene, "xlane");
  const span = await pastSpan(2);
  const created = await createAccrualAdjustment(scene.bob, {
    client: acc.client, authorityRef: acc.authorityRef,
    accrual: accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to }),
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: span.from, effectiveTo: span.to, opKey: shared });
  assert.ok(created.accrual_id,
    "the accrual lane is admitted on a key the prepayment lane already spent");
  assert.notEqual(created.plan_id, prepaid.plan_id,
    "the two lanes wrote two different plans, so nothing was replayed from the other's receipt");

  // 3 — THE TENANCY LANE, on the SAME key again.
  const ten = await tenancyLaneIn(scene, "xlane");
  const confirmed = await confirmRentPlan(scene.bob, {
    client: ten.client, document: ten.document, opKey: shared });
  assert.ok(confirmed.confirmation_id,
    "the tenancy lane is admitted on a key both other lanes already spent");
  assert.ok(confirmed.plan_id, "…and confirmed a rent plan of its own");
  assert.equal(new Set([prepaid.plan_id, created.plan_id, confirmed.plan_id]).size, 3,
    "three lanes, three plans — nothing was replayed across a lane boundary");

  // 4 — THE OUTER RESERVATIONS never collided: they differ by `fn`. The claim is the NESTED ones.
  const outer = await receiptsUnder(scene.firm, shared);
  assert.deepEqual(outer.map((r) => r.fn).sort(),
    ["confirm_tenancy_rent_plan", "create_accrual_adjustment", "create_prepayment_schedule"],
    "one key, three outer reservations, one per lane's own door");

  // 5 — AND THE NESTED ONES STAND IN THREE NAMESPACES, one row each, all under the SAME nested
  //     `fn` — which is the whole reason they could collide.
  for (const [suffix, label] of [
    [":plan", "the prepayment lane keeps `:plan`, exactly as before"],
    [":acplan", "the accrual lane reserves its nested plan under a key of its own"],
    [":tnplan", "the tenancy lane reserves its nested plan under a key of its own"],
  ]) {
    const nested = await receiptsUnder(scene.firm, `${shared}${suffix}`);
    assert.deepEqual(nested.map((r) => r.fn), ["create_accounting_plan"], label);
    assert.equal(nested.length, 1,
      `${suffix}: exactly one row, so the lane really took the reservation rather than skipping it`);
  }
});
