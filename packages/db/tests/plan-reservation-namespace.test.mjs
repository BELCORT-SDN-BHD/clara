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
  callConfirmCore, callRevisionCore, receiptsLike, confirmRentPlanFor, confirmationAuditVia,
  bodyOf, planRow, planCreateAudit, setClientStatus, callOboPlanCore, createPrepaymentScheduleFor,
  basis,
} from "./plan-reservation-namespace-fixtures.mjs";

const ACCRUAL_TZ = "Asia/Kuala_Lumpur";

let ready = false;
let lane = false;
let applied = false;

// FRONTIER-GATED on the `plan_reservation_namespace_obo_fold$` stable stem, the
// revenue-recognition-plan-op-key idiom: a package-wide sweep preloads this file's pre-integration
// gate module and skips LOUDLY on a chain below 0364; a FOCUSED run sets nothing and FAILS,
// because a skip is not evidence.
before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  lane = await tenancyLanePresent();
  applied = await planNamespaceApplied();
  if (!applied && process.env[PLAN_NS_GATE] !== "1") {
    throw new Error(
      `#1150 premise: no migration matching /${PLAN_NS_STEM}/ is applied to this database and `
      + `${PLAN_NS_GATE} is unset -- this is a FOCUSED run and must fail loudly, not skip. Apply `
      + "0364_plan_reservation_namespace_obo_fold.sql, or preload "
      + "./tests/plan-reservation-namespace-preintegration-gate.mjs for an estate sweep against a "
      + "pre-0364 chain.");
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) { t.skip("rig not ready"); return true; }
  if (!applied) {
    t.skip("0364_plan_reservation_namespace_obo_fold is not applied -- probed at the live ledger");
    return true;
  }
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

// ===========================================================================================
// AC6 — `p_lane` IS A CLOSED SET IN BOTH CONFIRMATION CORES.
//
// ADV-L08-05, declined in the sweep wave's lane L8 with the reason that the core was not being
// rewritten. It is being rewritten here. The harm an unknown lane does is not hypothetical in the
// REVISION core: `p_lane` there decides nothing but the `via` the audit row carries, so an unknown
// lane stamps the HUMAN `via` on an act no person took, silently. In the confirmation core it
// decides which plan step runs, and the branch tests for `obo`, so an unknown lane took the JWT
// path and failed closed on CLR04 — safe, but answering a question nobody asked.
// ===========================================================================================

test("p1150.lane.closed_set — both tenancy confirmation cores refuse a lane outside {human, obo} "
  + "by name, above every other wall, and write nothing; and both real lanes are still admitted",
async (t) => {
  if (unready(t)) return;
  const scene = await namespaceScene("lane");
  const ten = await tenancyLaneIn(scene, "lane");

  for (const [label, call] of [["confirmation", callConfirmCore], ["revision", callRevisionCore]]) {
    for (const lane of ["human ", "HUMAN", "chat", "", null]) {
      const key = opk1150(`lane-${label}`);
      const err = await caught(() => call({
        firm: scene.firm, actor: scene.bob, lane, client: ten.client,
        document: ten.document, opKey: key }));
      assert.ok(err, `${label}: the core admitted the lane ${JSON.stringify(lane)}`);
      assert.equal(err.code, "CLR10", `${label}/${JSON.stringify(lane)}: wrong sqlstate`);
      assert.equal(detailOf(err).reason, "invalid_lane",
        `${label}/${JSON.stringify(lane)}: the refusal is not typed`);
      assert.equal(detailOf(err).field, "lane");
      assert.deepEqual(await receiptsLike(scene.firm, key), [],
        `${label}/${JSON.stringify(lane)}: a refused lane left a reservation behind`);
    }
    // …AND IT IS ABOVE THE OP-KEY WALL, which is the first thing either core checked before this.
    // An unknown lane is a programming error, and answering `invalid_op_key` to it would send a
    // caller after the wrong argument.
    const both = await caught(() => call({
      firm: scene.firm, actor: scene.bob, lane: "chat", client: ten.client,
      document: ten.document, opKey: "   " }));
    assert.equal(detailOf(both).reason, "invalid_lane",
      `${label}: with BOTH the lane and the op key wrong, the core answers the op key`);
  }

  // BOTH REAL LANES ARE STILL ADMITTED, end to end through their own public entrances, and each
  // stamps its own `via` on 0193's audit row.
  const human = await confirmRentPlan(scene.bob, {
    client: ten.client, document: ten.document, opKey: opk1150("lane-human") });
  assert.ok(human.plan_id, "the human entrance stopped confirming");
  assert.equal(await confirmationAuditVia(human.plan_id), "confirm_tenancy_rent_plan",
    "the human lane's confirmation no longer carries its own `via`");

  const other = await tenancyLaneIn(scene, "lane-obo");
  const obo = await confirmRentPlanFor({
    client: other.client, author: scene.bob, document: other.document,
    opKey: opk1150("lane-obo") });
  assert.ok(obo.plan_id, "the on-behalf-of entrance stopped confirming");
  assert.equal(await confirmationAuditVia(obo.plan_id), "confirm_tenancy_rent_plan_for",
    "the on-behalf-of lane's confirmation no longer carries its own `via`");
});

// ===========================================================================================
// AC4 / AC5 — THE THIRD ON-BEHALF-OF PLAN STEP BECOMES A CALLER OF THE FIRST.
//
// `clara._tenancy_plan_core` (0353) was a third snapshot of the on-behalf-of plan-creation step,
// beside `clara._obo_plan_core` (0338) and `clara._accrual_plan_core` (0331). The estate paid for
// that twice: ADV-L08-01 found a client-status wall its siblings had and it did not, and the sweep
// wave's integration merge had to fold its hand-copied authority wall. It is now a caller.
//
// The one wall that stays is the CLIENT-STATUS wall, above the delegation — it is the tenancy
// lane's, not the shared body's, and moving it into `clara._obo_plan_core` would refuse acts the
// prepayment and deferred-revenue on-behalf-of lanes admit today.
// ===========================================================================================

const OBO_PLAN_STEP =
  "clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";
const TENANCY_PLAN_STEP =
  "clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";

test("p1150.obo.fold_parity — the tenancy plan step is a CALLER of clara._obo_plan_core with no "
  + "computation of its own, it keeps the client-status wall at its own position, and both "
  + "entrances still admit and refuse exactly what they did",
async (t) => {
  if (unready(t)) return;

  // 1 — THE DELEGATE, structurally: it names the body that holds the computation and holds no
  //     rung, no plan row and no overlap advisory of its own. The shape
  //     `plan-overlap-template-arm-retired.test.mjs` (T.5) already makes of 0353's thin revision
  //     delegate, made here of the step this file folds.
  const step = await bodyOf(TENANCY_PLAN_STEP);
  assert.ok(step, `${TENANCY_PLAN_STEP} is absent`);
  assert.match(step.src, /clara\._obo_plan_core\(/,
    "the tenancy plan step does not delegate to the body that holds the computation");
  assert.doesNotMatch(step.src, /pg_advisory_xact_lock|insert\s+into\s+clara\.accounting_plan/,
    "the tenancy plan step still holds a rung or writes a plan row of its own");
  assert.match(step.src, /client_inactive/,
    "the tenancy plan step has lost the client-status wall ADV-L08-01 put there");

  // …AND THE SHARED BODY DID NOT SWALLOW THAT WALL. The prepayment and deferred-revenue
  // on-behalf-of lanes do not carry a client-status wall, and giving them one here would refuse
  // acts they admit today — a widening this ticket has no ruling for.
  const shared = await bodyOf(OBO_PLAN_STEP);
  assert.doesNotMatch(shared.src, /client_inactive/,
    "clara._obo_plan_core has gained the tenancy lane's client-status wall");

  // 2 — THE CLIENT-STATUS WALL STILL ANSWERS, ON BOTH ENTRANCES, IDENTICALLY.
  const scene = await namespaceScene("fold");
  const live = await tenancyLaneIn(scene, "fold-live");
  for (const status of ["archived", "onboarding"]) {
    await setClientStatus(live.client, status);
    const h = await caught(() => confirmRentPlan(scene.bob, {
      client: live.client, document: live.document, opKey: opk1150(`fold-h-${status}`) }));
    const o = await caught(() => confirmRentPlanFor({
      client: live.client, author: scene.bob, document: live.document,
      opKey: opk1150(`fold-o-${status}`) }));
    assert.ok(h && o, `${status}: one of the two entrances admitted a non-active client`);
    assert.equal(o.code, h.code, `${status}: the sqlstates differ`);
    assert.equal(o.message, h.message, `${status}: the sentences differ`);
    assert.deepEqual(detailOf(o), detailOf(h), `${status}: the typed details differ`);
    assert.equal(detailOf(h).reason, "client_inactive");
    assert.match(h.message, /client is not active -- no new accounting plan/,
      `${status}: the sentence is not clara.create_accounting_plan's own`);
  }
  await setClientStatus(live.client, "active");

  // 3 — AND IT IS STILL AT THE PLAN STEP'S OWN POSITION, not at the entrance: a tenancy with
  //     NOTHING recorded is answered by the DRAFT wall on both lanes, even for an archived client.
  const bare = await tenancyLaneIn(scene, "fold-bare", { recordTerms: false });
  await setClientStatus(bare.client, "archived");
  const hBare = await caught(() => confirmRentPlan(scene.bob, {
    client: bare.client, document: bare.document, opKey: opk1150("fold-bare-h") }));
  const oBare = await caught(() => confirmRentPlanFor({
    client: bare.client, author: scene.bob, document: bare.document,
    opKey: opk1150("fold-bare-o") }));
  assert.ok(hBare && oBare, "one of the two entrances admitted an archived client with no terms");
  assert.equal(detailOf(hBare).reason, "terms_incomplete",
    "the human door no longer answers the draft wall first -- this cell's premise moved");
  assert.equal(oBare.code, hBare.code);
  assert.equal(oBare.message, hBare.message);
  assert.deepEqual(detailOf(oBare), detailOf(hBare),
    "the on-behalf-of twin reports the client's status where the human door reports missing terms");

  // 4 — AND THE REPLAY. The status wall sits BELOW clara._reserve_op on both lanes, so a
  //     confirmation a person already made replays to its stored receipt after the client is
  //     archived. An entrance-level copy of the wall would refuse the replay instead.
  for (const [label, confirm] of [
    ["human", (s, k) => confirmRentPlan(scene.bob, { client: s.client, document: s.document, opKey: k })],
    ["obo", (s, k) => confirmRentPlanFor({ client: s.client, author: scene.bob, document: s.document, opKey: k })],
  ]) {
    const s = await tenancyLaneIn(scene, `fold-replay-${label}`);
    const key = opk1150(`fold-replay-${label}`);
    const first = await confirm(s, key);
    await setClientStatus(s.client, "archived");
    assert.deepEqual(await confirm(s, key), first,
      `${label}: replaying a confirmation the person already made stopped returning its receipt `
      + "once the client was archived");
  }

  // 5 — WHAT THE ON-BEHALF-OF LANE WRITES IS UNCHANGED, read at the rows rather than off the door.
  const ok = await tenancyLaneIn(scene, "fold-ok");
  const made = await confirmRentPlanFor({
    client: ok.client, author: scene.bob, document: ok.document, opKey: opk1150("fold-ok") });
  assert.ok(made.plan_id, "the on-behalf-of entrance stopped confirming");
  const row = await planRow(made.plan_id);
  assert.equal(row.kind, "recurring_journal");
  assert.equal(row.status, "active");
  assert.equal(row.authority_kind, "explicit_instruction");
  assert.equal(row.authority_ref.kind, "contract_confirmation");
  assert.equal(row.authorised_by, scene.bob, "the plan is no longer authorised by the NAMED human");
  assert.equal(row.created_by, scene.bob);
  assert.equal(row.current_revision, 1);
  const audit = await planCreateAudit(made.plan_id);
  assert.equal(audit.via, "confirm_tenancy_rent_plan_for",
    "0193's own audit row no longer says which entrance created the plan");
  assert.equal(audit.kind, "recurring_journal");

  // 6 — THE SHARED BODY'S KIND SET IS STILL CLOSED, driven at the body (no door takes a kind).
  const acc = await accrualLaneIn(scene, "fold-kind");
  const span = await pastSpan(2);
  const badKind = await caught(() => callOboPlanCore({
    kind: "a_kind_nobody_minted", firm: scene.firm, client: acc.client, author: scene.bob,
    authorityRef: acc.authorityRef, from: span.from, to: span.to,
    basis: basis({ postingDate: span.from, memo: "p1150 kind probe" }) }));
  assert.ok(badKind, "clara._obo_plan_core admitted a kind nobody minted");
  assert.equal(badKind.code, "CLR10");
  assert.equal(detailOf(badKind).reason, "plan_kind_unsupported");
  assert.equal(detailOf(badKind).kind, "a_kind_nobody_minted");

  // 7 — AND THE LANE THAT ALREADY USED THE SHARED BODY IS UNTOUCHED BY THE WIDENING: the
  //     prepayment on-behalf-of twin still configures, on its own least-privileged runtime
  //     connection, and 0193's audit row still names ITS entrance.
  const prepaid = await createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef,
    opKey: opk1150("fold-prepay-obo") });
  assert.ok(prepaid.schedule_id, "the prepayment on-behalf-of twin stopped configuring");
  const prepaidAudit = await planCreateAudit(prepaid.plan_id);
  assert.equal(prepaidAudit.via, "create_prepayment_schedule_for",
    "the prepayment on-behalf-of lane's plan no longer names its own entrance");
  assert.equal(prepaidAudit.kind, "amortisation_schedule");
});

// ===========================================================================================
// THE STANDING GUARD OVER THE PLAN STEP, CARRIED FORWARD FROM #1137.
//
// 0353's fix round added `p1137.obo.plan_step_parity` for ADV-L08-02 — a refusal the HUMAN plan
// step raises must either be raised by the on-behalf-of plan step too, or be on a named roster
// that says why it cannot be reached. Its own comment said it would go "until clara._obo_plan_core
// absorbs `recurring_journal` and this body becomes a two-line caller of it", and #1150's brief
// says the same: "`p1137.obo.plan_step_parity` becomes unnecessary and goes with it".
//
// IT IS NOT UNNECESSARY, AND THAT IS WORTH WRITING DOWN RATHER THAN QUIETLY LOSING. The brief's
// reason is "the parity that cell measures becomes exact by construction, because both entrances
// reach the same body". Measured, they do not: the HUMAN entrance still reaches
// `clara.create_accounting_plan` (0193) and the on-behalf-of entrance now reaches
// `clara._obo_plan_core`. The fold makes the OBO lane's plan step TWO bodies instead of one; it
// does not merge the two lanes. A wall a later ticket adds to 0193's door would still be missed by
// the machine lane, which is exactly what ADV-L08-01 was.
//
// So the cell MOVES here rather than dying: same claim, re-aimed at the two bodies that now hold
// the OBO lane's plan step. The OLD cell is removed from tenancy-agent-twins.test.mjs, where it
// named `clara._tenancy_plan_core` alone and would have read an empty body.
// ===========================================================================================

const PLAN_DOOR =
  "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)";
const PLAN_WALL = "clara._assert_plan_authority(text,jsonb,uuid,uuid)";

/** Why a refusal `clara.create_accounting_plan` raises is NOT in the on-behalf-of lane's plan
 *  step. Every entry is a wall taken ABOVE that step on BOTH lanes, or an argument the step does
 *  not take. A STALE entry — a token the human door no longer raises — is a red too, so the roster
 *  cannot quietly outlive its reason.
 *
 *  #1150 [0364]: `plan_kind_unsupported` LEFT this roster. 0353's version excused it with "the
 *  kind is the literal 'recurring_journal' in this step, never an argument"; after the fold the
 *  step takes the kind as its first argument and raises that very token, so the excuse is gone and
 *  the guard is real. */
const PLAN_STEP_NOT_REACHED = {
  client_not_found:
    "clara._confirm_tenancy_rent_plan_core walls the client to the caller's firm above BOTH lanes "
    + "(CLR11 'client is not in your firm'), so neither plan step can be entered with a client "
    + "outside it -- driven in p1137.obo.refusals_match case 9 and p1137.obo.authority",
  invalid_op_key:
    "this step takes no op key of its own: the confirmation's own key covers the whole act and is "
    + "checked FIRST on both entrances -- driven in p1137.obo.authority case 1",
  operation_in_flight:
    "clara.create_accounting_plan's own reservation under `<key>:tnplan`; the on-behalf-of step "
    + "takes no reservation at all, and the outer clara._reserve_op on the confirmation's key sits "
    + "above both lanes -- driven in p1137.obo.one_op_key_namespace and p1150.cross_lane.create",
};

const REASON_TOKENS = /(?:"reason"\s*:\s*"([a-z_]+)")|(?:'reason'\s*,\s*'([a-z_]+)')/g;
const reasonsOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(REASON_TOKENS)) out.add(m[1] ?? m[2]);
  return out;
};

test("p1150.obo.wall_census — every refusal the HUMAN plan door raises is either raised by the "
  + "on-behalf-of lane's plan step or named as unreachable, and both still resolve authority "
  + "through the ONE shared wall",
async (t) => {
  if (unready(t)) return;

  const human = reasonsOf((await bodyOf(PLAN_DOOR)).src);
  const lane = new Set([
    ...reasonsOf((await bodyOf(OBO_PLAN_STEP)).src),
    ...reasonsOf((await bodyOf(TENANCY_PLAN_STEP)).src),
  ]);
  assert.ok(human.size > 0, "clara.create_accounting_plan raises no typed refusal at all");

  const unguarded = [...human].filter((r) => !lane.has(r) && !(r in PLAN_STEP_NOT_REACHED)).sort();
  assert.deepEqual(unguarded, [],
    `clara.create_accounting_plan refuses ${unguarded.join(", ")} and the on-behalf-of lane's plan `
    + "step does not -- either copy the wall into clara._tenancy_plan_core (if it is the tenancy "
    + "lane's alone) or clara._obo_plan_core (if every on-behalf-of lane owes it), or add it to "
    + "PLAN_STEP_NOT_REACHED with the reason it cannot be reached (ADV-L08-01 was exactly this, "
    + "for client_inactive)");
  const stale = Object.keys(PLAN_STEP_NOT_REACHED).filter((r) => !human.has(r)).sort();
  assert.deepEqual(stale, [],
    `PLAN_STEP_NOT_REACHED still excuses ${stale.join(", ")}, which clara.create_accounting_plan no `
    + "longer raises -- the roster has outlived its reason");
  assert.ok(lane.has("client_inactive"),
    "the on-behalf-of lane's plan step has lost the client-status wall ADV-L08-01 put there");
  assert.ok(lane.has("plan_kind_unsupported"),
    "the shared step no longer closes its kind set -- PLAN_STEP_NOT_REACHED would need it back");

  // …AND THE SHARED AUTHORITY RESOLUTION, whose refusal token is a VARIABLE and so invisible to
  // the census above: both the human door and the on-behalf-of step must still resolve the cited
  // instruction through #1051's ONE wall rather than merely checking its shape, and that wall must
  // itself resolve through #977's one definition, so the hop is a fold and not a second copy.
  for (const sig of [PLAN_DOOR, OBO_PLAN_STEP]) {
    assert.match((await bodyOf(sig)).src, /clara\._assert_plan_authority\(/,
      `${sig} no longer resolves its authority through clara._assert_plan_authority (#1051, 0330)`);
  }
  assert.match((await bodyOf(PLAN_WALL)).src, /clara\._authority_ref_refusal\(/,
    "#1051's shared plan wall does not resolve through clara._authority_ref_refusal (#977, 0250)");
  // The tenancy step reaches the wall THROUGH the shared body now, and names neither itself —
  // which is the fold, and is what #1051's own census (p1051.wall.one_definition) requires of it.
  const delegate = (await bodyOf(TENANCY_PLAN_STEP)).src;
  assert.doesNotMatch(delegate, /clara\._assert_plan_authority\(|clara\._authority_ref_refusal\(/,
    "the tenancy plan step still reaches the authority wall itself -- after the fold the shared "
    + "body does that, and a second reach is the drift #1051 exists to close");
});
