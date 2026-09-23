// #941 (second half) — DEFERRED REVENUE: RECOGNISE A RECEIPT PAID AHEAD BY A CUSTOMER AS REVENUE
// OVER ITS SERVICE PERIOD. Migration: 0308_deferred_revenue_recognition.sql. Frontier-gated on its
// own STABLE STEM (`deferred_revenue_recognition$`), never its number — numbers are claimed at
// merge (packages/db/README.md) — the `prepayment_schedule_obo_twin$` / `prepayment_stated_term$`
// idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY HUMAN CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits — through the `humanQuery(sub, namedCall(...))` wrappers #653's own battery uses. Every
// OBO cell runs on a REAL `clara_runtime` connection with no `request.jwt.claims` at all.
//
// THE FIRST HALF OF #941 IS NOT HERE. `2030 Deferred Revenue` reached the standard chart in the
// wave-4 pre-step (migration 0295, `my_sme_starter` v2); this battery CONSUMES it by name in
// `p941.standard_chart` and mints no chart row anywhere (lane rule (a)).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeferredLanePresent, endPool, rootQuery, CLR, CLR37, assertPair, assertRaises,
  account, opk, CONTROL_ASSET_CODE, ROSTER_AXIS, ROSTER_REASON,
  enrolDeferredAccount, retirePrepaymentAccount, enrolmentRow, enrolmentsFor,
  deferredRevenueScene, DEFERRED_PURPOSE, NOT_LIABILITY_AXIS,
} from "./revenue-recognition-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["deferred_revenue_recognition$"]);
    return r.rows[0].n > 0;
  })().catch(() => false);
});

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await assertDeferredLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

/** #940's roster question, read as the owner — it is granted to NOBODY by design, so a cell that
 *  reached it as a human would be measuring a grant this lane must never mint. */
async function enrolled(client, code, purpose) {
  const r = await rootQuery(
    "select clara._prepayment_account_enrolled($1::uuid,$2::text,$3::text) as ok",
    [client, code, purpose]);
  return r.rows[0].ok;
}

// ===========================================================================================
// AC "the roster from #940 carries the purpose from birth; this ticket adds `deferred_revenue`
// and requires it at the door; no second roster" (owner decision 5, 2026-09-18).
// ===========================================================================================

cell("p941.enrol.deferred_revenue — the second purpose stops being a column and becomes a rule: a LIABILITY enrols under deferred_revenue with who/when/why, an asset does not, a liability still cannot enrol as a prepayment, the shared wall still guards both, the two purposes do not leak into one another, and retiring closes the one it names", async () => {
  const scene = await deferredRevenueScene("enrol", { cents: 90000, termMonths: 3, enrol: false });

  // BEFORE #941 THIS EXACT CALL ANSWERED `purpose_rule_not_stated` NAMING THIS TICKET (0306 §B).
  // The positive control is the whole first acceptance row: the purpose now has a rule.
  const enrolment = await enrolDeferredAccount(scene.bob, {
    client: scene.client, account: scene.deferred });
  assert.ok(enrolment.enrolment_id, "the door names the row it wrote");
  assert.equal(enrolment.client_id, scene.client);
  assert.equal(enrolment.account_code, scene.deferred);
  assert.equal(enrolment.purpose, DEFERRED_PURPOSE,
    "the SAME roster carries the second purpose — no second relation (owner decision 5)");
  assert.equal(enrolment.active, true);

  const row = await enrolmentRow(enrolment.enrolment_id);
  assert.equal(row.client_id, scene.client, "the enrolment is PER CLIENT");
  assert.equal(row.account_code, scene.deferred);
  assert.equal(row.purpose, DEFERRED_PURPOSE);
  assert.ok(row.reason && row.reason.trim().length > 0, "the reason is stored, never defaulted");
  assert.ok(row.created_by, "…and WHO enrolled it");
  assert.ok(row.enrolled_at, "…and WHEN");
  assert.equal(row.active, true);
  assert.equal(row.retired_at, null);

  // A VIEWER STILL CANNOT. The floor did not move with the purpose.
  await assertRaises(CLR.authz,
    () => enrolDeferredAccount(scene.w.users.carol, {
      client: scene.client, account: scene.deferred }),
    "a viewer enrolling a deferred-revenue account");

  // THE ONE POSITIVE RULE THIS PURPOSE ADDS: deferred revenue is a LIABILITY. The scene's own
  // prepaid ASSET is refused by name, and the refusal names the type it found.
  const asAsset = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, { client: scene.client, account: scene.prepaid }),
    "an ASSET enrolled as deferred revenue");
  assert.equal(asAsset.detail.axis, NOT_LIABILITY_AXIS,
    "the refusal names the AXIS, so the panel can point at the field");
  assert.equal(asAsset.detail.account_type, "asset", "…and the type it actually found");
  assert.equal(asAsset.detail.purpose, DEFERRED_PURPOSE);

  // …AND THE PREPAYMENT RULE IS UNTOUCHED: the liability cannot enrol as a prepaid asset.
  const asPrepay = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, {
      client: scene.client, account: scene.deferred, purpose: "prepayment" }),
    "a LIABILITY enrolled as a prepayment");
  assert.equal(asPrepay.detail.axis, ROSTER_AXIS.notAssetClass,
    "#940's own axis, unmoved — this file widens the door, it does not rewrite it");

  // THE SHARED NEGATIVE WALL IS STILL ASKED FIRST, and it is purpose-agnostic: the estate's own
  // receivable CONTROL account is refused with the WALL's own axis carried through, whichever
  // purpose is named.
  const ctl = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, {
      client: scene.client, account: CONTROL_ASSET_CODE }),
    "a control account enrolled as deferred revenue");
  assert.equal(ctl.detail.axis, ROSTER_AXIS.controlAccount,
    "the wall answers before the type rule — an account that fails both is told the harder fact");

  // AN UNKNOWN CODE IS THE WALL'S ANSWER TOO, not a type answer: the type rule reads a row that
  // is not there, and a rule that ran first would answer `not_liability_class` about nothing.
  const unknown = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, { client: scene.client, account: "29999999" }),
    "an unknown code enrolled as deferred revenue");
  assert.equal(unknown.detail.axis, ROSTER_AXIS.accountUnknown);

  // THE TWO PURPOSES DO NOT LEAK. One live enrolment answers for the purpose it names and for no
  // other — the predicate three doors share is keyed on (client, account, purpose).
  assert.equal(await enrolled(scene.client, scene.deferred, DEFERRED_PURPOSE), true);
  assert.equal(await enrolled(scene.client, scene.deferred, "prepayment"), false,
    "enrolling an account for deferred revenue does not enrol it for prepayments");
  assert.equal(await enrolled(scene.client, scene.prepaid, DEFERRED_PURPOSE), false,
    "…and the scene's enrolled PREPAID account is not a deferred-revenue account");

  // VERSION-FORWARD, NEVER MUTATE, on this purpose too: a restated reason retires the live row and
  // inserts a fresh one, so the basis a schedule was configured under stays readable.
  const restated = await enrolDeferredAccount(scene.bob, {
    client: scene.client, account: scene.deferred,
    reason: "#941 battery: re-purposed to annual membership advances at the July review" });
  assert.notEqual(restated.enrolment_id, enrolment.enrolment_id, "a restated reason is a NEW row");
  const all = await enrolmentsFor(scene.client, scene.deferred, DEFERRED_PURPOSE);
  assert.equal(all.length, 2, "both enrolments are on the record — an interval is never overwritten");
  assert.equal(all.filter((x) => x.active).length, 1,
    "exactly ONE live enrolment per (client, account, purpose)");

  // RETIRING NAMES ITS PURPOSE. The account comes off the deferred-revenue roster and the
  // predicate goes false — driven through the real door, never asserted.
  await retirePrepaymentAccount(scene.bob, {
    client: scene.client, account: scene.deferred, purpose: DEFERRED_PURPOSE });
  assert.equal(await enrolled(scene.client, scene.deferred, DEFERRED_PURPOSE), false,
    "retiring closes the enrolment the caller named");
});
