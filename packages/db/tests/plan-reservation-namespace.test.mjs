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
  createPrepaymentSchedule, createAccrualAdjustment, correctAccrualAdjustment, accrual,
  confirmRentPlan, receiptsUnder, opk1150, caught, detailOf, spendReviseKey,
  nestedPlanCensus, partitionProblems, LANE_OF_SUFFIX, PLAN_DOORS,
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

// ===========================================================================================
// AC1 (the correction lane) — THE ACCRUAL CORRECTION'S NESTED **REVISION** RESERVATION.
//
// `clara.correct_accrual_adjustment` derives its key under `revise_accounting_plan`, not under
// `create_accounting_plan`, so it never collided with the create doors. It shared the prepayment
// lane's `:plan` token all the same, which is the partition this ticket closes: a suffix belongs
// to ONE lane, whichever nested door it is spent at. It moves to the accrual lane's own `:acrev`.
// ===========================================================================================

test("p1150.correction.namespace — a correction reserves its nested plan revision under the "
  + "accrual lane's own `:acrev`, holds nothing under `:plan`, and still types a genuine "
  + "collision on that derived key rather than re-raising the primitive's untyped one",
async (t) => {
  if (unready(t)) return;
  const scene = await namespaceScene("corr");
  const acc = await accrualLaneIn(scene, "corr");
  const span = await pastSpan(2);
  const base = await createAccrualAdjustment(scene.bob, {
    client: acc.client, authorityRef: acc.authorityRef,
    accrual: accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to }),
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: span.from, effectiveTo: span.to,
    opKey: opk1150("corr-base") });
  assert.ok(base.accrual_id, "mandatory setup: the accrual to correct was configured");

  const key = opk1150("corr");
  const corrected = await correctAccrualAdjustment(scene.bob, {
    accrualId: base.accrual_id,
    accrual: accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to, cents: 99000 }),
    opKey: key });
  assert.ok(corrected.accrual_id, "the correction was admitted");
  assert.notEqual(corrected.accrual_id, base.accrual_id,
    "mandatory setup: a correction writes a successor row rather than editing the old one");

  const nested = await receiptsUnder(scene.firm, `${key}:acrev`);
  assert.deepEqual(nested.map((r) => r.fn), ["revise_accounting_plan"],
    "the accrual correction reserves its nested revision under a key of its own");
  assert.deepEqual(await receiptsUnder(scene.firm, `${key}:plan`), [],
    "…and holds nothing at all in the prepayment lane's namespace");

  // THE TYPED WRAP STILL FIRES ON THE KEY THAT MOVED. #936's own wall: when the derived key
  // genuinely collides, the correction door types `plan_op_key_conflict` and names the nested key,
  // instead of re-raising `clara._reserve_op`'s detail-less CLR10. Driven by spending the DERIVED
  // key at the nested door directly, which is the one way a person can reach it (0284's header).
  const clash = opk1150("corr-clash");
  await spendReviseKey(scene.bob, {
    client: acc.client, authorityRef: acc.authorityRef, span, opKey: `${clash}:acrev` });
  const blocked = await caught(() => correctAccrualAdjustment(scene.bob, {
    // The SUCCESSOR row, because an accrual may be corrected once: correcting `base` again is
    // refused `accrual_already_corrected` above the plan door and would never reach the
    // reservation this arm is about (measured).
    accrualId: corrected.accrual_id,
    accrual: accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to, cents: 77000 }),
    opKey: clash }));
  assert.ok(blocked, "a genuine collision on the derived key was admitted");
  assert.equal(blocked.code, "CLR10");
  assert.equal(detailOf(blocked).reason, "plan_op_key_conflict",
    "the correction door stopped typing its nested collision");
  assert.equal(detailOf(blocked).nested_op_key, `${clash}:acrev`,
    "…and no longer names the key it actually derived");
});

// ===========================================================================================
// AC3 — ORDINARY, NON-COLLIDING IDEMPOTENCY IS UNCHANGED, DRIVEN PER LANE.
//
// A suffix that moves must not change what a genuine retry does. It cannot: each lane's OUTER
// reservation short-circuits the whole body, so a true retry never reaches the nested call at all
// — which is also why nothing is backfilled. This cell drives that rather than arguing it.
// ===========================================================================================

test("p1150.idempotent.per_lane — on each of the three lanes a genuine retry under the same key "
  + "with the same arguments replays its stored result, and takes no second nested reservation",
async (t) => {
  if (unready(t)) return;
  const scene = await namespaceScene("idem");
  const span = await pastSpan(2);

  // 1 — THE PREPAYMENT LANE, which kept `:plan`.
  const pk = opk1150("idem-prepay");
  const p1 = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: pk });
  const p2 = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: pk });
  assert.deepEqual(p2, p1, "the prepayment lane returned a different receipt on a genuine retry");
  assert.equal((await receiptsUnder(scene.firm, `${pk}:plan`)).length, 1,
    "the prepayment lane took a SECOND nested reservation on a retry");

  // 2 — THE ACCRUAL LANE, which moved to `:acplan`.
  const acc = await accrualLaneIn(scene, "idem");
  const particulars = accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to });
  const ak = opk1150("idem-accrual");
  const call = () => createAccrualAdjustment(scene.bob, {
    client: acc.client, authorityRef: acc.authorityRef, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: span.from, effectiveTo: span.to, opKey: ak });
  const a1 = await call();
  assert.deepEqual(await call(), a1, "the accrual lane returned a different receipt on a genuine retry");
  assert.equal((await receiptsUnder(scene.firm, `${ak}:acplan`)).length, 1,
    "the accrual lane took a SECOND nested reservation on a retry");
  assert.deepEqual(await receiptsUnder(scene.firm, `${ak}:plan`), [],
    "…and left nothing behind in the prepayment lane's namespace");

  // 3 — THE TENANCY LANE, which moved to `:tnplan`.
  const ten = await tenancyLaneIn(scene, "idem");
  const tk = opk1150("idem-tenancy");
  const t1 = await confirmRentPlan(scene.bob, {
    client: ten.client, document: ten.document, opKey: tk });
  const t2 = await confirmRentPlan(scene.bob, {
    client: ten.client, document: ten.document, opKey: tk });
  assert.deepEqual(t2, t1, "the tenancy lane returned a different receipt on a genuine retry");
  assert.equal((await receiptsUnder(scene.firm, `${tk}:tnplan`)).length, 1,
    "the tenancy lane took a SECOND nested reservation on a retry");

  // 4 — AND A RETRY WITH **DIFFERENT** ARGUMENTS IS STILL REFUSED, by each lane's own OUTER
  //     reuse wall. That raise is deliberately left untyped: it is one door answering its own
  //     caller's mistake, not two lanes meeting on a reservation neither of them named.
  const changed = await caught(() => createAccrualAdjustment(scene.bob, {
    client: acc.client, authorityRef: acc.authorityRef,
    accrual: accrual({ servicePeriodStart: span.from, servicePeriodEnd: span.to, cents: 55000 }),
    frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    timezone: ACCRUAL_TZ, effectiveFrom: span.from, effectiveTo: span.to, opKey: ak }));
  assert.ok(changed, "the accrual lane admitted a second, different configuration under one key");
  assert.equal(changed.code, "CLR10");
  assert.equal(detailOf(changed).reason, "op_key_conflict",
    "the accrual door's own outer reuse wall stopped answering");
});

// ===========================================================================================
// AC2 — THE CENSUS. Structural by necessity, and this repo's own documented shape for it
// (WORK-ORDER rule 4's carve-out): the claim is about a body a LATER lane writes, which no cell
// written today can drive. It reads the derivations off `pg_proc.prosrc` — no hand-written roster
// of bodies anywhere — and the only thing it is told is which LANE each suffix belongs to.
// ===========================================================================================

test("p1150.namespace.census — every nested plan reservation in the estate belongs to exactly one "
  + "lane: no suffix is undeclared, none has lost its deriver, and no body sits in two lanes",
async (t) => {
  if (unready(t)) return;

  const rows = await nestedPlanCensus();
  assert.ok(rows.length >= 10,
    `the census found only ${rows.length} nested plan reservations — the instrument, not the estate, `
    + "is what changed");
  assert.deepEqual(partitionProblems(rows), [],
    "the estate's nested plan reservations no longer partition by lane");

  // THE FOUR LANES ARE ALL PRESENT AND ALL DISTINCT, named off the census rather than declared:
  // this is the statement #1077 left for #1150, now true of four lanes instead of two.
  const laneOf = (sig) => new Set(rows.filter((r) => r.sig === sig)
    .map((r) => LANE_OF_SUFFIX.get(r.suffix)));
  const bodiesOfLane = new Map();
  for (const r of rows) {
    const lane = LANE_OF_SUFFIX.get(r.suffix);
    if (!bodiesOfLane.has(lane)) bodiesOfLane.set(lane, new Set());
    bodiesOfLane.get(lane).add(r.sig);
  }
  assert.deepEqual([...bodiesOfLane.keys()].sort(),
    ["accrual", "deferred_revenue", "prepayment", "tenancy"],
    "a lane declared in LANE_SUFFIXES has no body deriving any of its suffixes");
  const lanes = [...bodiesOfLane.entries()].sort();
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const shared = [...lanes[i][1]].filter((s) => lanes[j][1].has(s)).sort();
      assert.deepEqual(shared, [],
        `${lanes[i][0]} and ${lanes[j][0]} share the deriving bod${shared.length === 1 ? "y" : "ies"} `
        + shared.join(", "));
    }
  }
  assert.deepEqual(
    [...laneOf("clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)")],
    ["accrual"], "the accrual configuration door is not in the accrual lane");
  assert.deepEqual(
    [...laneOf("clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)")],
    ["tenancy"], "the tenancy confirmation core is not in the tenancy lane");

  // EVERY DERIVATION REACHES A PLAN DOOR, measured. `:approve`, `:match`, `:settle` and the rest
  // exist on this catalog and belong to other families; the census must not have swept them in.
  for (const r of rows) {
    assert.ok(PLAN_DOORS.includes(r.door), `${r.sig} derives ${r.suffix} at ${r.door}`);
  }

  // THE VACUITY CONTROL (WORK-ORDER rule 4). A cell whose whole deliverable is structural must be
  // shown FAILING against a deliberately broken subject. The subject here is the census's own
  // reader, so it is fed TWO bodies that exist on no database: one reaching into a second lane's
  // namespace, one inventing a suffix nobody declared.
  const twoLanes = await nestedPlanCensus([{
    sig: "clara._p1150_decoy_two_lanes(uuid)",
    src: "begin\n  perform clara.create_accounting_plan(p_client, p_op_key || ':plan');\n"
       + "  perform clara.revise_accounting_plan(p_plan, p_op_key || ':acrev');\nend",
  }]);
  assert.deepEqual(partitionProblems(twoLanes).filter((s) => s.includes("_p1150_decoy_two_lanes")).length, 1,
    "the census does not notice a body that derives two lanes' nested reservations");
  const undeclared = await nestedPlanCensus([{
    sig: "clara._p1150_decoy_undeclared(uuid)",
    src: "begin\n  perform clara.create_accounting_plan(p_client, p_op_key || ':nobodysaid');\nend",
  }]);
  assert.deepEqual(partitionProblems(undeclared).filter((s) => s.includes(":nobodysaid")).length, 1,
    "the census does not notice a suffix no lane declares");
  // …and the decoys really were the only difference: the live estate is still clean.
  assert.deepEqual(partitionProblems(rows), [], "the vacuity control left the census reading dirty");
});
