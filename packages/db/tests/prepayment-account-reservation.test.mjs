// #1078 — THE PREPAYMENT-ACCOUNT ROSTER RESERVES ITS ENROLLED CODES. Migration:
// 0337_prepayment_account_reservation.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_account_reservation$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_account_roster$` / `revenue_recognition_plan_op_key$`
// idiom.
//
// CONTRACT-BLIND against the migration's own tail: the tail's `raise notice … OK` describes one
// apply; this file describes the live catalog and what the DOORS actually answer.
//
// EVERY CLAIM ABOUT A DOOR IS DRIVEN AT THAT DOOR. "The bank belt refuses", "the fixed-asset
// profile door refuses", "the advance door refuses" are sentences about behaviour, so each one is
// measured by calling the door and reading what came back — never by reading a body's source.
// The one structural cell at the bottom is the exception the house standard names (a catalog
// census and a pin), and it says so.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, rootQuery, CLR, CLR37, assertPair,
  statedTermScene, account, CONTROL_ASSET_CODE,
  enrolPrepaymentAccount, retirePrepaymentAccount,
  plainAssetRecognition, createPrepaymentSchedule, scheduleCountFor,
  reserveAsFixedAssetCost, bindBankAccount, ROSTER_PURPOSE,
  RESERVATION_STEM, RESERVATION_GATE, reservationApplied,
  RESERVED_DOMAIN, RESERVED_ROLE, BANK_BELT_REASON, ADV_REMEDY_PREPAYMENT,
  RESERVATION_RECUTS, reservedRolesFor, eligibilityBreach, enrolStaffAdvanceAccount,
  reservationConsumers, bankBindingCount, faProfileCount, advanceEnrolmentCount, bodySha,
} from "./prepayment-account-reservation-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 6;

before(async () => { ready = await reservationApplied().catch(() => false); });

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

/** The pre-integration discriminator: a FOCUSED run against a database without 0337 is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. A skip
 *  is not evidence. */
function cell(name, fn) {
  test(name, async (t) => {
    if (!(await reservationApplied())) {
      if (process.env[RESERVATION_GATE] === "1") {
        console.warn(`SKIP prepayment-account-reservation: no ${RESERVATION_STEM} migration applied.`);
        t.skip("#1078 prepayment-account reservation absent — explicit pre-integration run");
        return;
      }
      assert.fail(
        `#1078: the prepayment-account reservation is absent. Apply `
        + `0337_prepayment_account_reservation.sql, or set ${RESERVATION_GATE}=1 for the `
        + `package-wide pre-integration sweep.`);
    }
    executed += 1;
    await fn(t);
  });
}

/** A fresh prepaid-asset code on a fresh scene, enrolled on the roster through the real door. */
async function enrolledScene(tag, { code, purpose = ROSTER_PURPOSE.prepayment, type = "asset" } = {}) {
  const scene = await statedTermScene(tag, { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const acct = await account(scene.alice, {
    client: scene.client, code, name: `#1078 ${tag}`, type });
  const enrolled = await enrolPrepaymentAccount(scene.bob, {
    client: scene.client, account: acct, purpose });
  return { scene, code: acct, enrolment: enrolled };
}

// ===========================================================================================
// AC — "a prepayment-account enrolment reserves its account code the same way the fixed-asset
// and staff-advance rosters do" (the owner ruling of 2026-09-24 on #1078).
// ===========================================================================================

cell("p1078.reserve.roster — a live prepayment enrolment RESERVES its code in the shared reader with its own domain and its purpose as the role, a deferred-revenue enrolment reserves the same way, and RETIRING the enrolment releases it so the code can be used again", async () => {
  const { scene, code } = await enrolledScene("res", { code: "19000101" });

  const rows = await reservedRolesFor(scene.client, code);
  assert.equal(rows.length, 1,
    `an enrolled prepayment account is reserved exactly once (got ${JSON.stringify(rows)})`);
  assert.equal(rows[0].domain, RESERVED_DOMAIN.prepayment,
    "…in the roster's OWN domain, so every caller can name which register holds the code");
  assert.equal(rows[0].role, RESERVED_ROLE.prepayment,
    "…and the role is the enrolment's PURPOSE, which is the only thing that distinguishes two roster rows");
  assert.equal(rows[0].owner_ref, code,
    "…and owner_ref points at the code itself, the staff-advance arm's own shape");

  // THE SECOND PURPOSE RESERVES TOO. #941 opened `deferred_revenue` on the SAME roster, and a
  // contract liability released over a term is owned by the machine exactly as a prepaid asset is.
  const liabilityCode = await account(scene.alice, {
    client: scene.client, code: "24000101", name: "#1078 deferred revenue", type: "liability" });
  assert.deepEqual(await reservedRolesFor(scene.client, liabilityCode), [],
    "mandatory setup: the liability code starts FREE");
  await enrolPrepaymentAccount(scene.bob, {
    client: scene.client, account: liabilityCode, purpose: ROSTER_PURPOSE.deferredRevenue });
  const dr = await reservedRolesFor(scene.client, liabilityCode);
  assert.equal(dr.length, 1, `the deferred-revenue enrolment reserves too (got ${JSON.stringify(dr)})`);
  assert.equal(dr[0].domain, RESERVED_DOMAIN.prepayment);
  assert.equal(dr[0].role, RESERVED_ROLE.deferredRevenue,
    "…and its role is its own purpose, so a refusal can say WHICH half of the roster holds the code");

  // RETIREMENT RELEASES, and that is the staff-advance arm's own law (0043: only ACTIVE enrolments
  // reserve, because a retired generation owns nothing live and must not block re-use).
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: code });
  assert.deepEqual(await reservedRolesFor(scene.client, code), [],
    "a RETIRED enrolment releases the code — a retired generation must never block re-use");
  assert.equal((await reservedRolesFor(scene.client, liabilityCode)).length, 1,
    "…and retiring one enrolment released only its own code");
});

cell("p1078.wall.unmoved — the shared negative wall answers EXACTLY what it answered before this ticket: an enrolled prepayment account is NOT a breach, the prepayment lane's own doors still admit it end to end, and the wall's five existing axes are untouched", async () => {
  const scene = await statedTermScene("wall", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const deposit = await plainAssetRecognition(scene, { code: "19000102", cents: 66000, tag: "wall" });

  assert.equal(await eligibilityBreach(scene.client, deposit.code), null,
    "mandatory setup: the code passes the wall before it is enrolled");
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: deposit.code });

  // THE RESERVATION IS REAL…
  assert.equal((await reservedRolesFor(scene.client, deposit.code)).length, 1,
    "mandatory setup: the enrolment reserved the code");
  // …AND THE WALL IS STILL BLIND TO IT. The prepayment roster is a POSITIVE roster: the whole
  // point of enrolling an account is that this account carries these postings, and the lane's own
  // doors ask this very wall about this very code. A wall that saw the roster would refuse the
  // lane its own accounts.
  assert.equal(await eligibilityBreach(scene.client, deposit.code), null,
    "the wall must not see the prepayment domain — its answers are the same before and after 0337");

  // MEASURED AT THE DOOR, not at the predicate: the schedule the roster exists to admit is still
  // admitted, which is the claim a body-reading cell could not make.
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: deposit.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  assert.ok(created.schedule_id, "an enrolled account still passes the schedule door");
  assert.equal(created.prepaid_account_code, deposit.code);
  assert.equal(await scheduleCountFor(deposit.entry), 1);

  // …AND THE ENROLMENT DOOR ITSELF STILL RESTATES. `clara.enrol_prepayment_account` asks the SAME
  // wall about the SAME code, so a roster that reserved into the wall would make every restatement
  // of a reason refuse its own live enrolment (0315 §H's version-forward path).
  const restated = await enrolPrepaymentAccount(scene.bob, {
    client: scene.client, account: deposit.code,
    reason: "#1078 battery: the reason is restated, which version-forwards the enrolment" });
  assert.ok(restated.enrolment_id, "a restated reason still version-forwards the enrolment");
  assert.equal((await reservedRolesFor(scene.client, deposit.code)).length, 1,
    "…and the code is still reserved exactly once afterwards");

  // THE WALL'S EXISTING AXES ARE UNTOUCHED, measured on the same client: a control account and a
  // code no chart holds still answer with the tokens they answered with yesterday.
  const control = await eligibilityBreach(scene.client, CONTROL_ASSET_CODE);
  assert.equal(control?.axis, "control_account",
    `the control-account axis is unmoved (got ${JSON.stringify(control)})`);
  const unknown = await eligibilityBreach(scene.client, "99999998");
  assert.equal(unknown?.axis, "account_unknown",
    `the unknown-account axis is unmoved (got ${JSON.stringify(unknown)})`);
});

cell("p1078.claim.bank — the ticket's own headline: an account the prepayment roster holds cannot be bound as a REGISTERED BANK ACCOUNT, the refusal names the register that holds it with a reason token of its own, nothing is bound by the refusal, and retiring the enrolment opens the code again", async () => {
  const { scene, code } = await enrolledScene("bank", { code: "19000103" });
  assert.equal(await bankBindingCount(scene.client, code), 0, "mandatory setup: nothing bound yet");

  // BEFORE #1078 THIS CALL SUCCEEDED. Measured on this rig at 0336: the roster reserved nothing, so
  // the bank belt read the shared census, found no claim and bound the code — leaving the
  // prepayment machine and the bank register both believing they owned one account.
  const refused = await assertPair(CLR.badRequest, BANK_BELT_REASON.prepayment,
    () => bindBankAccount(scene.alice, {
      client: scene.client, coaAccountCode: code, accountNumber: "5141078001" }),
    "binding an enrolled prepayment account as a registered bank account");
  assert.equal(refused.detail.reservation_domain, RESERVED_DOMAIN.prepayment,
    "the refusal says WHICH register holds the code, so the person knows where to look");
  assert.equal(refused.detail.reservation_role, RESERVED_ROLE.prepayment,
    "…and which half of the roster holds it");
  assert.equal(refused.detail.account_code, code);
  assert.match(refused.err.message, /reserved by the prepayment register/,
    `the sentence a person reads names the register too: ${refused.err.message}`);
  assert.equal(await bankBindingCount(scene.client, code), 0, "the refusal bound nothing");

  // THE ADVANCE TOKEN IS UNCHANGED. A surface that branches on `coa_account_advance_reserved` today
  // must read exactly what it read yesterday, so the other domain is driven on the same client.
  const advCode = await account(scene.alice, {
    client: scene.client, code: "19000104", name: "#1078 advance", type: "asset" });
  await enrolStaffAdvanceAccount(scene.alice, { client: scene.client, account: advCode });
  const adv = await assertPair(CLR.badRequest, BANK_BELT_REASON.advance,
    () => bindBankAccount(scene.alice, {
      client: scene.client, coaAccountCode: advCode, accountNumber: "5141078002" }),
    "binding an enrolled staff-advance account as a registered bank account");
  assert.equal(adv.detail.reservation_domain, RESERVED_DOMAIN.staffAdvance,
    "…and the advance domain still answers with the advance token, byte for byte");

  // RETIRING THE ENROLMENT OPENS THE CODE. The reservation is a LIVE claim, not a brand: a firm
  // that decides the account is really a bank account retires the enrolment and binds it.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: code });
  const bound = await bindBankAccount(scene.alice, {
    client: scene.client, coaAccountCode: code, accountNumber: "5141078003" });
  assert.ok(bound, "a retired enrolment no longer holds the code");
  assert.equal(await bankBindingCount(scene.client, code), 1, "…and the binding really happened");
});

cell("p1078.claim.fixed_asset — an account the prepayment roster holds cannot be enrolled in the FIXED-ASSET register, and the refusal names the door that actually releases the claim rather than the staff-advance one", async () => {
  const { scene, code } = await enrolledScene("fa", { code: "19000105" });
  assert.equal(await faProfileCount(scene.client, code), 0, "mandatory setup: no profile yet");

  const refused = await assertPair(CLR37, "fa_profile_invalid",
    () => reserveAsFixedAssetCost(scene.alice, { client: scene.client, assetAccount: code }),
    "enrolling an account the prepayment roster holds into the fixed-asset register");
  assert.equal(refused.detail.axis, "role_reserved",
    "the refusal rides 0041's own axis rather than a new vocabulary");
  assert.equal(refused.detail.reserved_domain, RESERVED_DOMAIN.prepayment,
    "…and names the register that holds the code");
  assert.equal(refused.detail.reserved_role, RESERVED_ROLE.prepayment);
  assert.equal(refused.detail.account_code, code);
  // THE REMEDY IS THE ONE THAT WORKS. Until 0337 §D this sentence named retire_staff_advance_account
  // whatever register held the code, which for a roster claim is a dead end: that door cannot
  // release an enrolment it does not own.
  assert.match(refused.err.message, /retire_prepayment_account/,
    `the refusal names the door that releases THIS claim: ${refused.err.message}`);
  assert.doesNotMatch(refused.err.message, /retire_staff_advance_account/,
    `…and does not send the person to a door that cannot: ${refused.err.message}`);
  assert.equal(await faProfileCount(scene.client, code), 0, "the refusal enrolled no profile");

  // AND THE REMEDY REALLY IS THE REMEDY, driven rather than promised.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: code });
  const enrolled = await reserveAsFixedAssetCost(scene.alice, {
    client: scene.client, assetAccount: code });
  assert.ok(enrolled, "the named door releases the claim and the profile then enrols");
  assert.equal(await faProfileCount(scene.client, code), 1);

  // THE ADVANCE BRANCH'S WORDS ARE UNCHANGED, measured on the same client.
  const advCode = await account(scene.alice, {
    client: scene.client, code: "19000106", name: "#1078 advance for fa", type: "asset" });
  await enrolStaffAdvanceAccount(scene.alice, { client: scene.client, account: advCode });
  const adv = await assertPair(CLR37, "fa_profile_invalid",
    () => reserveAsFixedAssetCost(scene.alice, { client: scene.client, assetAccount: advCode }),
    "enrolling an enrolled staff-advance account into the fixed-asset register");
  assert.equal(adv.detail.reserved_domain, RESERVED_DOMAIN.staffAdvance);
  assert.match(adv.err.message, /retire_staff_advance_account, which needs every advance on it settled/,
    `the advance branch still says what it always said: ${adv.err.message}`);
});

cell("p1078.claim.staff_advance — an account the prepayment roster holds cannot be enrolled as a STAFF-ADVANCE account, the refusal carries its own remedy token and an advice that names retire_prepayment_account, and the two existing remedies are unmoved", async () => {
  const { scene, code } = await enrolledScene("adv", { code: "19000107" });
  assert.equal(await advanceEnrolmentCount(scene.client, code), 0, "mandatory setup: not enrolled");

  const refused = await assertPair(CLR.badRequest, "advance_enrolment_invalid",
    () => enrolStaffAdvanceAccount(scene.alice, { client: scene.client, account: code }),
    "enrolling an account the prepayment roster holds as a staff-advance account");
  assert.equal(refused.detail.axis, "role_reserved",
    "the refusal rides 0043's own axis rather than a new vocabulary");
  assert.equal(refused.detail.reserved_domain, RESERVED_DOMAIN.prepayment);
  assert.equal(refused.detail.reserved_role, RESERVED_ROLE.prepayment);
  assert.equal(refused.detail.remedy, ADV_REMEDY_PREPAYMENT,
    "the remedy TOKEN is the roster's own — clara._adv_on_approve composes its advice from it");
  assert.match(refused.err.message, /reserved by the prepayment register/,
    `the sentence names the register: ${refused.err.message}`);
  assert.equal(await advanceEnrolmentCount(scene.client, code), 0, "the refusal enrolled nothing");

  // THE ADVICE IS WHAT A PERSON ACTUALLY READS when they try to reverse an entry on this code, so
  // it is read from the predicate itself rather than inferred from the remedy token.
  const advice = await rootQuery(
    `select clara._adv_enrolment_admission($1::uuid, $2::text, null) as a`, [scene.client, code]);
  assert.equal(advice.rows[0].a.admitted, false);
  assert.match(advice.rows[0].a.advice, /retire_prepayment_account/,
    `the advice names the door that releases THIS claim: ${advice.rows[0].a.advice}`);
  assert.doesNotMatch(advice.rows[0].a.advice, /retire_staff_advance_account/,
    "…and not one that cannot");

  // AND THE REMEDY REALLY IS THE REMEDY.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: code });
  await enrolStaffAdvanceAccount(scene.alice, { client: scene.client, account: code });
  assert.equal(await advanceEnrolmentCount(scene.client, code), 1,
    "the named door releases the claim and the advance enrolment then lands");

  // THE FIXED-ASSET BRANCH IS UNMOVED, measured on the same client.
  const faCode = await account(scene.alice, {
    client: scene.client, code: "19000108", name: "#1078 fa for adv", type: "asset" });
  await reserveAsFixedAssetCost(scene.alice, { client: scene.client, assetAccount: faCode });
  const fa = await assertPair(CLR.badRequest, "advance_enrolment_invalid",
    () => enrolStaffAdvanceAccount(scene.alice, { client: scene.client, account: faCode }),
    "enrolling a fixed-asset-reserved account as a staff-advance account");
  assert.equal(fa.detail.remedy, "retire_fa_profile_then_re_enrol",
    "the fixed-asset remedy is still 0043's own");
});

// ===========================================================================================
// THE STRUCTURAL CELL. Everything above drives a door; this one reads the CATALOG, because the
// claim it holds is about the SHAPE of the authority rather than about any one answer — the house
// standard the work order names ("a catalog census, a prestate pin, a tail assertion"). It reads
// `pg_proc`, never a migration's text, so a body a later file recuts is measured as it stands.
// ===========================================================================================

cell("p1078.census.authority — ONE census, FOUR consumers, ONE place that mints the new domain: the reservation authority's shape is held against the live catalog, the as-of twin is still FA+advance only, and every body 0337 recut still carries its change", async () => {
  // (a) THE CONSUMER SET IS EXACT, read comment-stripped so a body that merely NAMES the census in
  //     prose is not counted as a consult (0042 S5.14's own instrument, replayed after 0337).
  assert.deepEqual(await reservationConsumers(), [
    "clara._adj_line_eligibility_breach(uuid,jsonb)",
    "clara._adv_enrolment_admission(uuid,text,uuid)",
    "clara._fa_assert_code_unreserved(uuid,text)",
    "clara._fa_role_claim_conflict(uuid,text,text)",
  ], "the shared census is consulted by exactly the wall, the bank belt, the FA discriminator and the advance admission delegate — a fifth reader is a design decision, not an accident");

  // (b) THE DOMAIN IS MINTED IN EXACTLY ONE BODY. Two arms answering "which register holds this
  //     code" with the same word is the drift the one-authority doctrine exists to prevent.
  const minters = await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc like '%''prepayment''::text%' order by 1`);
  assert.deepEqual(minters.rows.map((r) => r.sig), ["clara._acct_role_reserved(uuid,text)"],
    "only the census itself emits the 'prepayment' reservation domain");

  // (c) THE AS-OF TWIN IS DELIBERATELY NOT WIDENED. Its single reader, clara._fa_gl_leg_foreign,
  //     asks "was a NON-FA register holding this code when that leg was booked"; a prepayment arm
  //     would make every leg on a prepayment account foreign to the fixed-asset register as of that
  //     date, which is an accounting answer #1078 did not ask for.
  const asOf = await rootQuery(
    `select p.prosrc as src from pg_proc p
      where p.oid = 'clara._acct_role_reserved_at(uuid,text,timestamptz)'::regprocedure`);
  assert.equal(/prepayment/.test(asOf.rows[0].src), false,
    "the as-of reservation twin carries no prepayment arm");

  // (d) EVERY BODY 0337 RECUT STILL CARRIES ITS CHANGE. A later migration that re-emits one of
  //     these from an older pre-image would drop #1078 silently; it fails here, by name.
  for (const sig of RESERVATION_RECUTS) {
    const r = await rootQuery(
      "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig]);
    assert.equal(/#1078 \[0337\]/.test(r.rows[0]?.src ?? ""), true,
      `${sig} no longer carries #1078's own attribution — a later recut dropped it`);
    assert.ok(await bodySha(sig), `${sig} resolves at its exact signature`);
  }
});
