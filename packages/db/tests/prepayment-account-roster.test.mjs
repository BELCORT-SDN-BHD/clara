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
  statedTermScene, account, opk, CONTROL_ASSET_CODE,
  enrolPrepaymentAccount, retirePrepaymentAccount, enrolmentRow, enrolmentsFor,
  liveEnrolmentCount, roleCanExecute, reserveAsFixedAssetCost, bindBankAccount, nowhereRosterId,
  plainAssetRecognition, createPrepaymentSchedule, scheduleCountFor, ineligibleAssetEntry,
  PREPAY_REASON, PREPAID_NOT_ENROLLED_AXIS,
  ROSTER_REASON, ROSTER_AXIS, ROSTER_PURPOSE, ENROL_DOOR_SIG, RETIRE_DOOR_SIG,
} from "./prepayment-account-roster-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

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

// ===========================================================================================
// AC1 (second half) — EVERY REASON AN ACCOUNT CANNOT HOLD PREPAYMENTS IS ANSWERED AT ENROLMENT.
//
// Owner decision 6: "the refusal happens at enrolment with a stated reason, not later at the
// schedule door". Each axis below is driven through a GOVERNED door — the chart writer, 0041's
// fixed-asset enrolment, 0038's bank binding — never by a hand-written row, because what is under
// test is that the ESTATE's own judgement reaches this door, not that this battery can insert.
// ===========================================================================================

cell("p940.enrol.refusals — an unknown, control-class, bank-bound, fixed-asset-reserved or non-asset account is refused AT ENROLMENT with the shared wall's own axis carried through, an unknown purpose and the not-yet-ruled deferred-revenue purpose are refused by name, retiring an account nobody enrolled is refused by name, and not one refusal enrols anything", async () => {
  const scene = await statedTermScene("refuse", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const before = await liveEnrolmentCount(scene.client);

  // (a) AN ACCOUNT THIS CLIENT'S CHART DOES NOT HOLD. The wall's own token, not a second one.
  const unknown = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: "19009999" }),
    "enrolling an account that is not on this chart");
  assert.equal(unknown.detail.axis, ROSTER_AXIS.accountUnknown);

  // (b) A CONTROL ACCOUNT. `coa_accounts.account_class` admits only 'payable' and 'receivable',
  // and the shared wall refuses ANY non-null class — which is exactly why #911's ruling did not
  // widen that enum: a 'prepaid' member would make every prepaid account ineligible.
  const control = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: CONTROL_ASSET_CODE }),
    "enrolling the receivable control account");
  assert.equal(control.detail.axis, ROSTER_AXIS.controlAccount);
  assert.equal(control.detail.account_class, "receivable",
    "the breach is the SHARED helper's own answer, carried through rather than paraphrased");

  // (c) AN ACCOUNT RESERVED BY THE FIXED-ASSET ROSTER (owner decision 6, first clause). A
  // fixed-asset cost account is asset-typed and non-control, so nothing but the reservation
  // stands between it and this roster.
  const faCode = await account(scene.alice, {
    client: scene.client, code: "19000005", name: "Plant and machinery", type: "asset" });
  await reserveAsFixedAssetCost(scene.alice, { client: scene.client, assetAccount: faCode });
  const reserved = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: faCode }),
    "enrolling an account the fixed-asset register already reserves");
  assert.equal(reserved.detail.axis, ROSTER_AXIS.accountReserved);
  assert.equal(reserved.detail.domain, "fa",
    "…and the refusal says WHICH roster reserves it, so the person knows where to look");

  // (d) A REGISTERED BANK ACCOUNT. Asset-typed, non-control, unreserved — the wall's two bank
  // instruments are the only thing that refuses it.
  const bankCode = await account(scene.alice, {
    client: scene.client, code: "17000009", name: "Maybank current (940)", type: "asset" });
  await bindBankAccount(scene.alice, {
    client: scene.client, coaAccountCode: bankCode, accountNumber: "5140940940" });
  const bank = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: bankCode }),
    "enrolling a registered bank account");
  assert.equal(bank.detail.axis, ROSTER_AXIS.bankAccount);

  // (e) THE ONE POSITIVE RULE THIS PURPOSE ADDS. A prepayment is a prepaid ASSET; the scene's
  // expense target passes every negative axis and is still not a prepayment account.
  const notAsset = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: scene.target }),
    "enrolling an expense account as a prepayment account");
  assert.equal(notAsset.detail.axis, ROSTER_AXIS.notAssetClass);
  assert.equal(notAsset.detail.account_type, "expense");

  // (f) THE PURPOSE IS A CLOSED SET, and the second member is a COLUMN before it is a RULE. The
  // relation admits 'deferred_revenue' from birth so #941 adds an arm rather than a second
  // roster; until that ticket states the account-type rule (a non-control LIABILITY), admitting
  // the purpose would enrol a liability under the asset rule above.
  const badPurpose = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, {
      client: scene.client, account: scene.prepaid, purpose: "prepaid_expense" }),
    "enrolling under a purpose the closed set does not carry");
  assert.equal(badPurpose.detail.axis, ROSTER_AXIS.purposeUnknown);
  const notYet = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, {
      client: scene.client, account: scene.prepaid, purpose: ROSTER_PURPOSE.deferredRevenue }),
    "enrolling under the deferred-revenue purpose before #941 states its rule");
  assert.equal(notYet.detail.axis, ROSTER_AXIS.purposeRuleNotStated);
  // …and the COLUMN admits it, which is the half that makes #941 an arm rather than a relation.
  const admits = await rootQuery(`select pg_get_constraintdef(c.oid) as def from pg_constraint c
     where c.conrelid = 'clara.prepayment_account_enrolments'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%purpose%'`);
  assert.equal(admits.rows.length, 1, "one CHECK governs the purpose");
  assert.ok(admits.rows[0].def.includes("deferred_revenue"),
    `the closed set carries the second purpose from birth: ${admits.rows[0].def}`);

  // (g) RETIRING WHAT NOBODY ENROLLED. A no-op that answered "done" would let a panel report a
  // retirement that never happened.
  const notEnrolled = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => retirePrepaymentAccount(scene.bob, { client: scene.client, account: "19000004" }),
    "retiring an account with no live enrolment");
  assert.equal(notEnrolled.detail.axis, ROSTER_AXIS.notEnrolled);

  // (h) A FOREIGN CLIENT IS NOT-FOUND, never an existence oracle (the 0021 rule).
  await assertPair(CLR.notFound, "client_not_found",
    () => enrolPrepaymentAccount(scene.bob, { client: nowhereRosterId(), account: scene.prepaid }),
    "enrolling against a client of another firm");

  // NOT ONE OF THE REFUSALS ABOVE ENROLLED ANYTHING.
  assert.equal(await liveEnrolmentCount(scene.client), before,
    "every refusal above wrote no enrolment row");
});

// ===========================================================================================
// AC3 — THE SCHEDULE DOOR ASKS THE ROSTER FIRST, AND THE EXISTING WALL AFTERWARDS.
// ===========================================================================================

cell("p940.schedule.roster_gate — an eligible but UNENROLLED prepaid leg is refused by name with the enrolment door and the panel as the remedy and writes nothing; the SAME call succeeds once the account is enrolled; the roster is asked BEFORE the shared wall, so an account that fails both answers the roster; and the wall is still live afterwards for an account enrolled while it was eligible", async () => {
  const scene = await statedTermScene("gate", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const deposit = await plainAssetRecognition(scene, { code: "19000006", cents: 66000, tag: "dep" });

  // BEFORE #940 THIS CALL SUCCEEDED. Every one of the shared wall's five negative axes passes on
  // this account — active, no class, no bank stamp, no bank binding, no reserved role — and
  // `prepayment_schedule_v1` never asks WHICH asset, so a utility deposit was amortised into
  // expense for a whole stated term with every entry balanced.
  const refused = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: deposit.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "configuring a schedule on an account nobody enrolled as a prepayment account");
  assert.equal(refused.detail.axis, PREPAID_NOT_ENROLLED_AXIS,
    "the ineligibility refusal gains a NOT-ENROLLED axis rather than a second token");
  assert.equal(refused.detail.prepaid_account_code, deposit.code);
  assert.equal(refused.detail.remedy, "clara.enrol_prepayment_account",
    "the refusal names the DOOR that fixes it");
  assert.equal(refused.detail.panel, "client_registers_prepayment_accounts",
    "…and the PANEL a person goes to, which is what owner decision 6 asks the refusal to say");
  assert.equal(await scheduleCountFor(deposit.entry), 0, "the refusal wrote no schedule row");

  // THE SAME CALL, AFTER THE ENROLMENT. Nothing else about it changes.
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: deposit.code });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: deposit.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  assert.ok(created.schedule_id, "an enrolled account passes");
  assert.equal(created.prepaid_account_code, deposit.code);
  assert.equal(await scheduleCountFor(deposit.entry), 1);

  // THE ROSTER IS ASKED FIRST (the brief's own order). An ordinary sales invoice's receivable
  // control leg fails BOTH the roster and the wall; the answer a person gets is the roster's,
  // because the reason it can never be enrolled is stated at the enrolment door (decision 6) and
  // not here, where the person is doing something else.
  const invoice = await ineligibleAssetEntry(scene, { cents: 77000 });
  const control = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: invoice.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a schedule whose prepaid leg is a receivable control account");
  assert.equal(control.detail.axis, PREPAID_NOT_ENROLLED_AXIS,
    "the roster is asked BEFORE the wall, so an account failing both answers the roster");
  assert.equal(await scheduleCountFor(invoice.entry), 0);

  // …AND THE WALL IS STILL LIVE AFTERWARDS. An account may be eligible on the day it is enrolled
  // and ineligible later: binding it as a registered bank account is the estate's own way of
  // making that happen. The roster admits it; the wall refuses it, with the SHARED helper's own
  // breach carried through, exactly as it did before this ticket.
  const later = await plainAssetRecognition(scene, {
    code: "17000010", name: "Maybank current (gate)", cents: 45000, tag: "later" });
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: later.code });
  await bindBankAccount(scene.alice, {
    client: scene.client, coaAccountCode: later.code, accountNumber: "5140940941" });
  const walled = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: later.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a schedule on an enrolled account that has since been bound as a bank account");
  assert.equal(walled.detail.axis, "prepaid_account_ineligible",
    "the shared negative wall still guards the prepaid leg AFTER the roster admits it");
  assert.equal(walled.detail.breach?.axis, "bank_account",
    `the breach is the SHARED helper's own answer: ${JSON.stringify(walled.detail)}`);
  assert.equal(await scheduleCountFor(later.entry), 0);
});
