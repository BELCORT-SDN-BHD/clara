// #1078 fix round — the widened claim census gets ONE map of "which door releases a claim of this
// domain", and its FOURTH consumer stops lying.
// Migration: 0361_reservation_release_advice.sql. Frontier-gated on its own STABLE STEM
// (`reservation_release_advice$`), never its number — numbers are claimed at merge
// (packages/db/README.md).
//
// WHAT THE SPEC REVIEW FOUND (L02-SPEC-01, major, 2026-09-25). 0337 widened
// `clara._acct_role_reserved` to a third domain and taught three of its consumers to answer per
// domain. The fourth — `clara._draft_opening_item_core`, the opening-balance carry-down, which
// asks the same census through `clara._fa_role_claim_conflict` — was not touched: it reported
// EVERY non-fixed-asset claim as `coa_account_advance_reserved` and offered a remedy naming only
// `retire_staff_advance_account` and "retire the profile that holds it". Neither releases a
// prepayment-roster claim. That is the class 0042:2110 names (WDB-R2: a refusal must name a
// followable remedy, or say honestly that there is none).
//
// AND WHY THE FIX IS A MAP. Three sites re-derived the same dispatch inline and the fourth had
// simply never been widened, because every one of them was written as "prepayment → its answer,
// ELSE the advance answer". `clara._reservation_release_advice` RAISES on a domain it does not
// know, so a fifth register cannot inherit the advance answer by default.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply;
// this file describes the live catalog and the doors' behaviour, driven for real.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, caught, upsertAccountClassed, ACCUM, EXPENSE, mon,
  freshEnrolledFaClient, x41EnsureReady, wb,
} from "./x41-fa-world.mjs";
import { enrolPrepaymentAccount, enrolStaffAdvanceAccount, RESERVED_DOMAIN, BANK_BELT_REASON }
  from "./prepayment-account-reservation-fixtures.mjs";

/** This migration's STABLE STEM. */
const ADVICE_STEM = "reservation_release_advice$";
const ADVICE_GATE = "CLARA_ALLOW_MISSING_RESERVATION_RELEASE_ADVICE";

let _applied = null;
async function adviceApplied() {
  if (_applied === null) {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [ADVICE_STEM]);
    _applied = Number(r.rows[0].n) > 0;
  }
  return _applied;
}

async function gate(t) {
  if (!(await adviceApplied())) {
    if (process.env[ADVICE_GATE] !== "1") {
      throw new Error(
        `#1078 fix-round premise 0361_reservation_release_advice.sql is not applied (no `
        + `${ADVICE_STEM} row in clara.schema_migrations) and ${ADVICE_GATE} is unset -- this is a `
        + `FOCUSED run and must fail loudly, not skip. Preload `
        + `./tests/reservation-release-advice-preintegration-gate.mjs for an estate sweep against `
        + `a pre-fix chain.`);
    }
    t.skip("#1078 fix round (0361_reservation_release_advice) not applied -- probed at the live catalog");
    return true;
  }
  return false;
}

before(async () => { await x41EnsureReady(); });

/** The map, asked the way every consumer asks it. `rootQuery` because it is ungranted (0361
 *  revokes it from public) and is reached only from inside a definer body. */
async function advice(domain) {
  const r = await rootQuery(
    "select reason_token, release_sentence from clara._reservation_release_advice($1::text)",
    [domain]);
  return r.rows[0] ?? null;
}

/** A fresh eight-digit chart code. `ck_coa_account_code_0009` admits `^[0-9]{4,8}$`. */
const freshCode = (lead) => `${lead}${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;

/** A client on the x41 fixed-asset chart, plus one extra account this cell owns outright.
 *
 *  THE CLIENT IS MOVED TO `active`, and this is the ONE raw write in this file. The registers
 *  whose claims the carry-down meets are enrolled through their own audited doors, and both
 *  (`clara.enrol_prepayment_account`, `clara.enrol_staff_advance_account`) refuse an onboarding
 *  client outright -- "client is not active", measured. `wb.onboardingClient` necessarily starts
 *  a client in `onboarding`, and no audited verb in this rig completes an onboarding without also
 *  closing the opening seed this cell needs open. The status is an ordinary lifecycle fact about
 *  the SCENE, not the door under test, and the state it makes is a real one: a firm whose client
 *  is live and whose opening seed is still being filled in. Every DOOR below is driven for real.
 */
async function sceneWithSpareAsset(label, { type = "asset" } = {}) {
  const { w, o } = await freshEnrolledFaClient(label);
  const code = freshCode(type === "asset" ? "19" : "29");
  await upsertAccountClassed(w.users.alice, {
    client: o.client, code, name: `spare ${label} ${code}`, type,
    accountClass: null, opKey: opk("p1078fix-coa"),
  });
  await rootQuery("update clara.clients set status = 'active' where id = $1", [o.client]);
  return { w, o, code };
}

/** Drive the opening-balance carry-down at its own door, with `code` in the COST role. */
async function seedCarryDown({ w, o, code }) {
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, asOf: mon(-6).end,
    tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = sr.seed_id ?? sr.id;
  return caught(() => wb.seedFixedAsset(w.users.bob, {
    client: o.client, seed,
    asset: {
      description: "#1078 fix round carry-down", acquired_date: mon(-24).start,
      cost_cents: 500_000, useful_life_months: 60, depreciation_method: "straight_line",
      asset_account_code: code, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
      accumulated_depreciation_cents: 0, depreciation_start_date: mon(-24).start,
      residual_cents: 0, item_key: "fa:p1078fix",
    },
  }));
}

// ---------------------------------------------------------------------------------------------
// THE MAP ITSELF.
// ---------------------------------------------------------------------------------------------
test("p1078fix.map.by_name -- the map answers each of the census's THREE domains by name, and the "
  + "two it answers with are the token a machine reads and the sentence a person acts on",
async (t) => {
  if (await gate(t)) return;

  const prepayment = await advice(RESERVED_DOMAIN.prepayment);
  assert.equal(prepayment.reason_token, BANK_BELT_REASON.prepayment,
    "the prepayment domain's machine token is not the one 0337 minted");
  assert.match(prepayment.release_sentence, /retire_prepayment_account/,
    "the prepayment sentence does not name the door that releases the claim");
  // THE COST OF THE REMEDY IS STATED, which is the half of WDB-R2 that is easy to miss: #940's
  // owner decision 5 leaves a running schedule posting to term end.
  assert.match(prepayment.release_sentence, /posting to term end/,
    "the prepayment sentence hides what retiring the enrolment does NOT do");

  const advance = await advice(RESERVED_DOMAIN.staffAdvance);
  assert.equal(advance.reason_token, BANK_BELT_REASON.advance,
    "the staff-advance token moved -- 0041's token is not this fix round's to change");
  assert.match(advance.release_sentence, /retire_staff_advance_account/);

  const fa = await advice(RESERVED_DOMAIN.fa);
  assert.equal(fa.reason_token, "coa_account_fa_reserved",
    "the fixed-asset token is not the one 0041's own belt raises");
  assert.match(fa.release_sentence, /retire_fa_account_profile/);
});

test("p1078fix.map.unmapped -- a domain the map does not know is REFUSED BY NAME, not answered "
  + "with the staff-advance default, which is the whole reason the map exists",
async (t) => {
  if (await gate(t)) return;

  const err = await caught(() => advice("a_register_nobody_built"));
  assert.ok(err, "the map invented an answer for a register nobody has stated a release door for");
  assert.equal(err.code, "CLR10");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "reservation_domain_unmapped");
  assert.equal(d.reservation_domain, "a_register_nobody_built");
});

// ---------------------------------------------------------------------------------------------
// THE FOURTH CONSUMER — THE OPENING-BALANCE CARRY-DOWN (L02-SPEC-01).
// ---------------------------------------------------------------------------------------------
test("p1078fix.carrydown.prepayment -- a carry-down onto a code the PREPAYMENT ROSTER holds names "
  + "the roster as the register that holds it and a door that can actually release the claim; it "
  + "no longer reports an advance claim, nor offers two doors that cannot let go",
async (t) => {
  if (await gate(t)) return;
  const scene = await sceneWithSpareAsset("p1078fixprep");
  await enrolPrepaymentAccount(scene.w.users.bob, { client: scene.o.client, account: scene.code });

  const err = await seedCarryDown(scene);
  assert.ok(err, "the carry-down was admitted onto a code the prepayment roster already holds");
  assert.equal(err.code, "CLR10", `the carry-down's own class (got ${err.code}: ${err.message})`);
  const d = JSON.parse(err.detail);

  assert.equal(d.reservation_domain, RESERVED_DOMAIN.prepayment,
    "the refusal names the wrong register as holding the code");
  // THE TOKEN. This is the half a surface branches on, and it said `advance` for a roster row.
  assert.equal(d.reason, BANK_BELT_REASON.prepayment,
    "the carry-down still reports a prepayment-roster claim under the staff-advance token");
  assert.equal(d.account_code, scene.code);
  assert.equal(d.claim_role, "cost");

  // THE SENTENCE. This is the half a PERSON acts on, and it named two doors, neither of which
  // releases a roster claim.
  assert.match(err.message, /retire_prepayment_account/,
    "the refusal does not name the door that releases this claim");
  assert.match(err.message, /posting to term end/,
    "the refusal does not say what retiring the enrolment leaves running");
  assert.ok(!/retire_staff_advance_account/.test(err.message),
    `the refusal still points at the staff-advance door for a roster claim: ${err.message}`);
});

test("p1078fix.carrydown.fa_cross_role -- a carry-down onto a code the FIXED-ASSET register "
  + "already holds in ANOTHER role names the fixed-asset register and its own release door; "
  + "before this fix round it reported that claim under the staff-advance token too",
async (t) => {
  if (await gate(t)) return;
  // ACCUM is held by the scene's own profile in the `accum` role; claiming it as `cost` is the
  // cross-role conflict clara._fa_role_claim_conflict exists to catch, and it needs no second
  // register at all -- which is why this arm was reachable long before 0337 widened the census.
  const { w, o } = await freshEnrolledFaClient("p1078fixfa");
  const err = await seedCarryDown({ w, o, code: ACCUM });
  assert.ok(err, "the carry-down was admitted onto a code the register holds in another role");
  assert.equal(err.code, "CLR10");
  const d = JSON.parse(err.detail);
  assert.equal(d.reservation_domain, RESERVED_DOMAIN.fa);
  assert.equal(d.reason, "coa_account_fa_reserved",
    "a fixed-asset cross-role claim is still reported under the staff-advance token");
  assert.match(err.message, /retire_fa_account_profile/,
    "the refusal does not name the door that releases a fixed-asset claim");
  assert.ok(!/retire_staff_advance_account/.test(err.message),
    `the refusal still points at the staff-advance door for a fixed-asset claim: ${err.message}`);
});

test("p1078fix.carrydown.advance_unmoved -- a carry-down onto a STAFF-ADVANCE code answers exactly "
  + "what it answered before this fix round: the same token, the same door, the same sentence",
async (t) => {
  if (await gate(t)) return;
  const scene = await sceneWithSpareAsset("p1078fixadv");
  await enrolStaffAdvanceAccount(scene.w.users.alice, {
    client: scene.o.client, account: scene.code,
  });

  const err = await seedCarryDown(scene);
  assert.ok(err, "the carry-down was admitted onto an enrolled staff-advance code");
  assert.equal(err.code, "CLR10");
  const d = JSON.parse(err.detail);
  assert.equal(d.reservation_domain, RESERVED_DOMAIN.staffAdvance);
  assert.equal(d.reason, BANK_BELT_REASON.advance,
    "0041's advance token moved -- nothing in this fix round is allowed to change it");
  assert.match(err.message, /retire_staff_advance_account/,
    "the advance remedy no longer names its own door");
  assert.match(err.message, /every advance on it settled/,
    "the advance sentence's own words moved");
});

// ---------------------------------------------------------------------------------------------
// THE OTHER CONSUMERS, AND THE STRUCTURE THAT KEEPS THEM HONEST.
// ---------------------------------------------------------------------------------------------
test("p1078fix.consumers.no_default -- none of the three consumers of the claim census still "
  + "hard-codes the staff-advance token; each reads the map. This is the census that would have "
  + "caught the defect the day 0337 landed",
async (t) => {
  if (await gate(t)) return;

  const rows = await rootQuery(
    `select p.proname,
            position('_reservation_release_advice' in p.prosrc) > 0 as reads_map,
            position('''coa_account_advance_reserved''' in p.prosrc) > 0 as hardcodes
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('_fa_assert_code_unreserved', 'upsert_fa_account_profile',
                          '_draft_opening_item_core')
      order by p.proname`);
  assert.equal(rows.rows.length, 3, "one of the three consumers is missing from the catalog");
  for (const row of rows.rows) {
    assert.equal(row.reads_map, true, `${row.proname} does not read the shared map`);
    assert.equal(row.hardcodes, false,
      `${row.proname} still hard-codes the staff-advance reason token`);
  }

  // AND THE MAP IS UNGRANTED, like every other internal in this family.
  const acl = await rootQuery(
    `select coalesce(p.proacl::text, '(null)') as acl from pg_proc p
      where p.oid = 'clara._reservation_release_advice(text)'::regprocedure`);
  assert.equal(acl.rows[0].acl, "{clara_fn_owner=X/clara_fn_owner}",
    "the map is reachable from outside a definer body -- it holds only the owner's own EXECUTE, "
    + "which is exactly what clara._fa_assert_code_unreserved carries");
});

test("p1078fix.conflict.deterministic -- the claim discriminator chooses the SAME claim every "
  + "time it is asked, because which claim it names now decides which release door the refusal "
  + "names (ADV-L02-10)",
async (t) => {
  if (await gate(t)) return;

  const src = await rootQuery(
    `select p.prosrc from pg_proc p
      where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure`);
  assert.match(src.rows[0].prosrc, /order by rr\.domain, rr\.role/,
    "the discriminator still chooses its claim by physical order");

  // DRIVEN, not only read: the same question twice on the same state gives the same answer.
  const scene = await sceneWithSpareAsset("p1078fixdet");
  await enrolPrepaymentAccount(scene.w.users.bob, { client: scene.o.client, account: scene.code });
  const ask = async () => (await rootQuery(
    `select res_domain, res_role from clara._fa_role_claim_conflict($1::uuid, $2::text, 'cost')`,
    [scene.o.client, scene.code])).rows;
  assert.deepEqual(await ask(), await ask(),
    "two identical questions about one code got two different answers");
  assert.equal((await ask())[0].res_domain, RESERVED_DOMAIN.prepayment);
});
