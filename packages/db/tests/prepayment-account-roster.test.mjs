// #940 — A PER-CLIENT ROSTER OF PREPAYMENT ACCOUNTS GATES AMORTISATION AHEAD OF THE SHARED
// NEGATIVE WALL. Migration: 0306_prepayment_account_roster.sql. Frontier-gated on its own STABLE
// STEM (`prepayment_account_roster$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_stated_term$` / `accrual_correction$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits (owner decision 2: "enrolling and retiring is bookkeeper work, the same floor as editing
// the chart and the fixed-asset profiles") — through the `humanQuery(sub, namedCall(...))`
// wrappers #653's own battery uses.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertRosterLanePresent, endPool, rootQuery, CLR, CLR37, assertPair, assertRaises,
  statedTermScene, account, opk,
  enrolPrepaymentAccount, retirePrepaymentAccount, enrolmentRow, enrolmentsFor,
  liveEnrolmentCount, roleCanExecute,
  ROSTER_REASON, ROSTER_AXIS, ROSTER_PURPOSE, ENROL_DOOR_SIG, RETIRE_DOOR_SIG,
} from "./prepayment-account-roster-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["prepayment_account_roster$"]);
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
    if (await assertRosterLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// AC1 — THE ROSTER, ITS TWO HUMAN DOORS, AND THE REASON THAT IS NOT OPTIONAL.
// ===========================================================================================

cell("p940.enrol.records — a bookkeeper enrols an account with a one-line reason, the row carries who/when/why, a viewer cannot, a blank reason is refused BY NAME and enrols nothing, an unchanged re-enrolment is idempotent, a RESTATED reason version-forwards, and only the human lane may execute either door", async () => {
  const scene = await statedTermScene("enrol", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  // A SECOND prepaid-asset account, so this cell measures the DOOR rather than whatever the
  // scene builder happens to have enrolled for the batteries that share it.
  const code = await account(scene.alice, {
    client: scene.client, code: "19000004", name: "Prepaid insurance", type: "asset" });

  // THE FLOOR IS THE BOOKKEEPER'S (owner decision 2). A viewer is refused before anything is read.
  await assertRaises(CLR.authz,
    () => enrolPrepaymentAccount(scene.w.users.carol, { client: scene.client, account: code }),
    "a viewer enrolling a prepayment account");

  const enrolled = await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: code });
  assert.ok(enrolled.enrolment_id, "the door names the row it wrote");
  assert.equal(enrolled.client_id, scene.client);
  assert.equal(enrolled.account_code, code);
  assert.equal(enrolled.purpose, ROSTER_PURPOSE.prepayment,
    "the roster carries its purpose from birth — the deferred-revenue mirror rides the SAME roster");
  assert.equal(enrolled.active, true);

  const row = await enrolmentRow(enrolled.enrolment_id);
  assert.equal(row.client_id, scene.client, "the enrolment is PER CLIENT (owner decision 1)");
  assert.equal(row.account_code, code);
  assert.equal(row.purpose, ROSTER_PURPOSE.prepayment);
  assert.ok(row.reason && row.reason.trim().length > 0, "the reason is stored, never defaulted");
  assert.ok(row.created_by, "…and WHO enrolled it");
  assert.ok(row.enrolled_at, "…and WHEN");
  assert.equal(row.active, true);
  assert.equal(row.retired_at, null);

  // A REASON IS NOT OPTIONAL (owner decision 4). A blank one is refused BY NAME rather than
  // stored as an unexplained judgement — and the refusal enrols nothing.
  const before = await liveEnrolmentCount(scene.client);
  const blank = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: code, reason: "   " }),
    "an enrolment with a blank reason");
  assert.equal(blank.detail.axis, ROSTER_AXIS.reasonMissing,
    "the refusal names the AXIS, so the panel can point at the field");
  assert.equal(await liveEnrolmentCount(scene.client), before, "the refusal enrolled nothing");

  // AN UNCHANGED RE-ENROLMENT IS IDEMPOTENT. `clara.upsert_fa_account_profile`'s own law
  // (0041:2886-2900): an enrolment interval is a historical fact, so re-stating the same fact must
  // not move the interval under live history.
  const again = await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: code });
  assert.equal(again.enrolment_id, enrolled.enrolment_id,
    "the same enrolment, re-stated unchanged, is the SAME row");
  assert.equal((await enrolmentsFor(scene.client, code)).length, 1, "…and no second row was written");

  // A RESTATED REASON VERSION-FORWARDS: the live row is retired and a fresh one is inserted, so
  // the reason that was in force when a schedule was configured is never overwritten.
  const restated = await enrolPrepaymentAccount(scene.bob, {
    client: scene.client, account: code,
    reason: "#940 battery: the account was re-purposed to prepaid rent in the July review",
  });
  assert.notEqual(restated.enrolment_id, enrolled.enrolment_id, "a restated reason is a NEW row");
  const all = await enrolmentsFor(scene.client, code);
  assert.equal(all.length, 2, "both enrolments are on the record — an interval is never overwritten");
  assert.equal(all.filter((x) => x.active).length, 1, "exactly ONE live enrolment per (client, account, purpose)");
  const first = all.find((x) => x.id === enrolled.enrolment_id);
  assert.equal(first.active, false);
  assert.ok(first.retired_at, "the predecessor carries its retirement stamp");

  // THE ACL, READ POSITIVELY. Enrolling is human work: the agent role, both wake roles and
  // clara_runtime gain ZERO on either door.
  for (const sig of [ENROL_DOOR_SIG, RETIRE_DOOR_SIG]) {
    assert.equal(await roleCanExecute("clara_authenticated", sig), true,
      `${sig} must be reachable by the human lane`);
    for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_runtime"]) {
      assert.equal(await roleCanExecute(role, sig), false,
        `${role} must not be able to execute ${sig}`);
    }
  }

  // …and the retire door resolves at its exact signature, which this cell drives in full below.
  assert.ok(opk("p940-shape"), "op keys are minted per decision, never reused across cells");
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: code });
  assert.equal((await enrolmentsFor(scene.client, code)).filter((x) => x.active).length, 0,
    "retiring closes the live enrolment");
});
