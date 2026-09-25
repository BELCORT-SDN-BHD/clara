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
  assertDeferredLanePresent, endPool, opk, CLR, assertRaises, scheduleRowsFor,
  recognitionScheduleCountFor,
  deferredRevenueScene, createRecognitionSchedule, recordStatedTerm,
  createPrepaymentSchedule, opReceiptsFor,
  replaceRecognitionSchedule, replacePrepaymentSchedule, recordPeriod, monthEndAfter,
} from "./revenue-recognition-fixtures.mjs";
import {
  RR_PLAN_OP_KEY_GATE, RR_PLAN_OP_KEY_STEM, rrPlanOpKeyApplied,
  NESTED_KEY, DEFERRED_NESTING_BODIES, PREPAYMENT_NESTING_BODIES, bodiesDeriving,
} from "./revenue-recognition-plan-op-key-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 4;

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

// ===========================================================================================
// AC1 / AC2 — THE CORRECTION DOORS, which collide one step EARLIER than the create pair: on the
// derived key they hand `clara.end_accounting_plan` before they ever reach the plan door.
// ===========================================================================================

cell("p1077.cross_lane.replace — one operation key spent on both correction doors replaces BOTH "
  + "schedules: each lane ends its predecessor and opens its successor under its own derived keys, "
  + "and the four reservations stand as four rows rather than colliding on two",
async () => {
  const scene = await deferredRevenueScene("xlanereplace", {
    cents: 90000, termMonthsBack: 4, termMonths: 3 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#1077 battery: the member said three months when they paid" });

  // Two schedules, each configured under ITS OWN key — the collision this cell is about is the
  // CORRECTION pair's, and configuring them under one key would measure the create pair again.
  const madePrepaid = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: opk("p1077-pcreate") });
  const madeDeferred = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef, opKey: opk("p1077-dcreate") });

  // BOTH TERMS ARE CORRECTED, each through its own carrier's door: the prepayment schedule rode a
  // DOCUMENT service period, the deferred-revenue one a person's STATED term. Two months instead of
  // three, so the correction stays inside the fiscal year the scene opened.
  const shorter = await monthEndAfter(scene.termStart, 1);
  assert.notEqual(shorter, scene.termEnd, "the correction really moves the term");
  await recordPeriod(scene.bob, {
    document: scene.document, start: scene.termStart, end: shorter,
    basis: "#1077 battery: the invoice's own term is two months, not three" });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, start: scene.termStart, end: shorter,
    reason: "#1077 battery: the member's agreement ran two months, not three" });

  // ONE KEY, BOTH CORRECTIONS.
  const shared = opk("p1077-shared-rep");

  const repPrepaid = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: madePrepaid.schedule_id,
    authorityRef: scene.authorityRef, opKey: shared });
  assert.ok(repPrepaid.schedule_id, "the prepayment lane opened its replacement");

  const repDeferred = await replaceRecognitionSchedule(scene.bob, {
    client: scene.client, schedule: madeDeferred.schedule_id,
    authorityRef: scene.authorityRef, opKey: shared });
  assert.ok(repDeferred.schedule_id,
    "the deferred-revenue correction is admitted on a key the prepayment correction already spent");
  assert.notEqual(repDeferred.plan_id, repPrepaid.plan_id,
    "the two corrections wrote two different plans, so neither replayed the other's receipt");

  // FOUR NESTED RESERVATIONS, in two namespaces of two. Before 0336 the two lanes shared `:end` and
  // `:plan`, so the second correction met the first's rows.
  assert.deepEqual((await opReceiptsFor(scene.firm, `${shared}:end`)).map((r) => r.fn),
    ["end_accounting_plan"], "the prepayment correction keeps `:end`");
  assert.deepEqual((await opReceiptsFor(scene.firm, `${shared}:plan`)).map((r) => r.fn),
    ["create_accounting_plan"], "…and `:plan`");
  assert.deepEqual((await opReceiptsFor(scene.firm, `${shared}:rrend`)).map((r) => r.fn),
    ["end_accounting_plan"], "the deferred-revenue correction ends its predecessor under its own key");
  assert.deepEqual((await opReceiptsFor(scene.firm, `${shared}:rrplan`)).map((r) => r.fn),
    ["create_accounting_plan"], "…and opens its successor under its own key");

  // AND THE TWO OUTER RESERVATIONS, which never collided, are still one per door.
  assert.deepEqual((await opReceiptsFor(scene.firm, shared)).map((r) => r.fn).sort(),
    ["replace_prepayment_schedule", "replace_revenue_recognition_schedule"]);
});

// ===========================================================================================
// AC3 — NEITHER LANE'S ORDINARY IDEMPOTENCY MOVED.
//
// 0336 touches only the key a door DERIVES for the plan door it nests. What a caller experiences as
// idempotency is the OUTER reservation, which this ticket does not touch — and because that outer
// reservation short-circuits the whole body, a true retry never reaches the nested call at all.
// ===========================================================================================

cell("p1077.same_lane.idempotent — on BOTH lanes a retry of the same door with the same key and "
  + "the same arguments still replays the first answer and writes no second schedule, a retry with "
  + "different arguments is still refused by the same reuse wall, and the nested reservation is "
  + "taken exactly once",
async () => {
  const scene = await deferredRevenueScene("samelane", {
    cents: 90000, termMonthsBack: 4, termMonths: 3 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#1077 battery: the member said three months when they paid" });

  // ---- THE PREPAYMENT LANE, which 0336 did not recut: the control.
  const pKey = opk("p1077-pidem");
  const pArgs = {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: pKey };
  const pFirst = await createPrepaymentSchedule(scene.bob, pArgs);
  const pAgain = await createPrepaymentSchedule(scene.bob, pArgs);
  assert.deepEqual(pAgain, pFirst, "the retry replays the stored answer rather than deciding again");
  assert.equal((await scheduleRowsFor(scene.client)).length, 1, "…and wrote no second schedule");
  await assertRaises(CLR.badRequest,
    () => createPrepaymentSchedule(scene.bob, { ...pArgs, purpose: "a different decision" }),
    "the prepayment lane's key reused with different arguments");

  // ---- THE DEFERRED-REVENUE LANE, the one 0336 recut.
  const dKey = opk("p1077-didem");
  const dArgs = {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef, opKey: dKey };
  const dFirst = await createRecognitionSchedule(scene.bob, dArgs);
  const dAgain = await createRecognitionSchedule(scene.bob, dArgs);
  assert.deepEqual(dAgain, dFirst, "the retry replays the stored answer rather than deciding again");
  assert.equal(await recognitionScheduleCountFor(scene.receipt), 1,
    "…and wrote no second schedule");
  // THE SAME UNTYPED CLR10 THE TICKET COMPLAINS ABOUT IS STILL CORRECT HERE, and deliberately so:
  // this is one door answering its OWN caller's genuine retry-with-different-arguments, not two
  // lanes meeting on a reservation neither of them named. #1077 puts that raise out of scope.
  await assertRaises(CLR.badRequest,
    () => createRecognitionSchedule(scene.bob, { ...dArgs, purpose: "a different decision" }),
    "the deferred-revenue lane's key reused with different arguments");

  // THE NESTED RESERVATION WAS TAKEN ONCE, by the first call only: the replay short-circuits the
  // whole body, so it never reaches the plan door at all.
  assert.equal((await opReceiptsFor(scene.firm, `${dKey}:rrplan`)).length, 1,
    "one nested reservation for two identical calls");
  assert.equal((await opReceiptsFor(scene.firm, `${dKey}:plan`)).length, 0,
    "…and nothing under the prepayment lane's suffix");
});

// ===========================================================================================
// THE CENSUS THAT HOLDS THE FIX AFTERWARDS.
//
// The three cells above measure what two callers experience. This one measures the PARTITION over
// the whole `clara` schema, so a later body that reaches for the deferred-revenue lane's suffixes —
// or a recut that hands the prepayment lane's back to it — fails here by name instead of quietly
// re-creating the collision. It reads `pg_proc.prosrc` and nothing else: the CATALOG as it stands
// after whatever later migration recut these bodies, never a migration's own text.
//
// It deliberately does NOT enumerate every `:plan` deriver in the estate. Three more exist
// (`clara.create_accrual_adjustment`, `clara.correct_accrual_adjustment`,
// `clara.confirm_tenancy_rent_plan`); #1077 names the prepayment and deferred-revenue pair and only
// that pair, and those three sit in bodies other lanes of this wave are recutting.
// ===========================================================================================

cell("p1077.namespace.census — over the whole clara schema the deferred-revenue lane's derived "
  + "suffixes belong to its two bodies and to nothing else, the prepayment siblings still hold "
  + "theirs, and no body derives from both namespaces",
async () => {
  assert.deepEqual(await bodiesDeriving(NESTED_KEY.deferredPlan), DEFERRED_NESTING_BODIES.slice().sort(),
    "`:rrplan` is the deferred-revenue lane's, and a third body reaching for it is a second "
    + "namespace collision waiting to happen");
  assert.deepEqual(await bodiesDeriving(NESTED_KEY.deferredEnd),
    ["clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)"],
    "`:rrend` belongs to the one door that ends a predecessor");

  // THE PREPAYMENT SIBLINGS STILL HOLD THEIRS — asserted by membership rather than by an exact
  // list, because other lanes of the estate derive `:plan` too and enumerating them here would
  // make this cell a tripwire for work that has nothing to do with #1077.
  const planDerivers = await bodiesDeriving(NESTED_KEY.prepaymentPlan);
  for (const sig of PREPAYMENT_NESTING_BODIES) {
    assert.ok(planDerivers.includes(sig), `${sig} no longer derives ':plan'`);
  }
  for (const sig of DEFERRED_NESTING_BODIES) {
    assert.equal(planDerivers.includes(sig), false, `${sig} still derives ':plan'`);
  }
  assert.deepEqual((await bodiesDeriving(NESTED_KEY.prepaymentEnd)),
    ["clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)"],
    "`:end` is derived by the prepayment correction door alone, now that its sibling has `:rrend`");

  // NO BODY DERIVES FROM BOTH NAMESPACES. This is the partition itself, and it is the one statement
  // that stays true however the two lanes grow.
  const deferredSet = new Set([
    ...await bodiesDeriving(NESTED_KEY.deferredPlan),
    ...await bodiesDeriving(NESTED_KEY.deferredEnd)]);
  const prepaySet = new Set([
    ...planDerivers,
    ...await bodiesDeriving(NESTED_KEY.prepaymentEnd)]);
  assert.deepEqual([...deferredSet].filter((s) => prepaySet.has(s)), [],
    "a body on both sides of the partition can collide with itself across the two lanes");
});
