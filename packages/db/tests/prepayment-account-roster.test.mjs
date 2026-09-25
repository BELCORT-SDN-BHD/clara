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
  listPrepaymentAttention, extraRecognition, recordPeriod, scheduleRow, getPrepaymentSchedule,
  wakeDuePlanOccurrences, occurrenceRows, workRow, claimWorkRun, settleWorkRun,
  mintClientObo, wakeRecordJournalEntry, receiptsForWork,
  PREPAY_REASON, PREPAID_NOT_ENROLLED_AXIS,
  ROSTER_REASON, ROSTER_AXIS, ROSTER_PURPOSE, ENROL_DOOR_SIG, RETIRE_DOOR_SIG,
} from "./prepayment-account-roster-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 6;

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
  // #941 (0308) STATED THAT RULE, so this arm now measures the RULE rather than its absence: the
  // scene's PREPAID ASSET under the deferred-revenue purpose is refused `not_liability_class`,
  // which is the same sentence in the other direction and the same one axis the door has always
  // answered with. Before 0308 the answer here was `purpose_rule_not_stated`; the cell keeps its
  // place in the closed-set sweep because "the second purpose is not the first" is still what it
  // proves. `p941.enrol.deferred_revenue` owns the positive half.
  const secondPurpose = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, {
      client: scene.client, account: scene.prepaid, purpose: ROSTER_PURPOSE.deferredRevenue }),
    "enrolling a prepaid ASSET under the deferred-revenue purpose");
  assert.equal(secondPurpose.detail.axis, "not_liability_class");
  assert.equal(secondPurpose.detail.account_type, "asset");
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

cell("p940.enrol.race — two bookkeepers of one firm enrolling the SAME account concurrently leave exactly ONE live enrolment, and the loser is answered by NAME with the winner's enrolment id rather than a bare 23505; two concurrent RETIREMENTS answer the loser its own typed not_enrolled with no handler needed", async () => {
  const scene = await statedTermScene("race", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const code = await account(scene.alice, {
    client: scene.client, code: "19000009", name: "Prepaid licences", type: "asset" });
  const { getPool, ROLES } = await import("./rig-helpers.mjs");
  const claims = (sub) => JSON.stringify({ sub, role: "authenticated" });

  // THE BARRIER IS A REAL ONE. The version-forward block does `select … for update` and, with NO
  // live row, there is nothing to lock: both sessions fall through and the loser meets
  // `uq_prepayment_account_enrolments_live` at its INSERT. Session A is held open so that is
  // exactly what happens, rather than the second call seeing A's committed row and version-
  // forwarding (which is the ordinary, non-racing path the `records` cell already covers).
  const race = async (fn) => {
    const c1 = await getPool().connect();
    const c2 = await getPool().connect();
    try {
      await c1.query(`set role ${ROLES.authenticated}`);
      await c1.query("begin");
      await c1.query("select set_config('request.jwt.claims', $1, true)", [claims(scene.bob)]);
      const a = await fn(c1, "a");
      await c2.query(`set role ${ROLES.authenticated}`);
      await c2.query("begin");
      await c2.query("select set_config('request.jwt.claims', $1, true)", [claims(scene.alice)]);
      const pending = fn(c2, "b").then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));
      await new Promise((r) => setTimeout(r, 300));   // let B reach its INSERT and block
      await c1.query("commit");
      const out = await pending;
      await c2.query(out.ok ? "commit" : "rollback").catch(() => {});
      return { a: a.rows[0].r, b: out.ok ? out.r.rows[0].r : null, bError: out.ok ? null : out.e };
    } finally {
      for (const c of [c1, c2]) {
        await c.query("rollback").catch(() => {});
        await c.query("reset role").catch(() => {});
        c.release();
      }
    }
  };

  const enrolled = await race((c, tag) => c.query(
    `select clara.enrol_prepayment_account($1::uuid,$2::text,$3::text,$4::text,$5::text) as r`,
    [scene.client, code, ROSTER_PURPOSE.prepayment,
      "#940 battery: this account holds prepaid software licences", opk(`p940-race-${tag}`)]));

  assert.ok(enrolled.a && enrolled.a.enrolment_id, "session A did not enrol");
  assert.ok(enrolled.bError,
    "the loser SUCCEEDED -- the race did not happen, so this cell measured nothing");
  assert.equal(enrolled.bError.code, "CLR13",
    `the loser was answered ${enrolled.bError.code} (${enrolled.bError.constraint ?? "no constraint"}) `
    + "rather than the lane's own conflict class -- a bare 23505 is unclassifiable by any surface");
  const detail = JSON.parse(enrolled.bError.detail);
  assert.equal(detail.reason, ROSTER_REASON.raced);
  assert.equal(detail.enrolment_id, enrolled.a.enrolment_id,
    "the refusal does not name the enrolment that actually stands");
  assert.equal(detail.account_code, code);
  assert.equal(detail.purpose, ROSTER_PURPOSE.prepayment);

  // THE INVARIANT HELD THROUGHOUT: one live enrolment per (client, account, purpose).
  assert.equal((await enrolmentsFor(scene.client, code)).filter((x) => x.active).length, 1,
    "the race left two live enrolments -- the index did not hold");

  // ---- THE RETIREMENT DOOR NEEDS NO HANDLER, and that is measured rather than assumed. It is an
  // UPDATE with no INSERT, so the loser blocks on the winner's row lock, then matches ZERO rows
  // and takes the door's own `not_enrolled` arm. Nothing to re-raise; nothing to add.
  const retired = await race((c, tag) => c.query(
    `select clara.retire_prepayment_account($1::uuid,$2::text,$3::text,$4::text) as r`,
    [scene.client, code, ROSTER_PURPOSE.prepayment, opk(`p940-race-ret-${tag}`)]));
  assert.ok(retired.a && retired.a.enrolment_id, "session A did not retire");
  assert.ok(retired.bError, "two retirements of one enrolment both succeeded");
  assert.equal(retired.bError.code, CLR37);
  assert.equal(JSON.parse(retired.bError.detail).reason, ROSTER_REASON.invalid);
  assert.equal(JSON.parse(retired.bError.detail).axis, ROSTER_AXIS.notEnrolled,
    "the retirement loser was answered something other than its own typed not_enrolled");
  assert.equal((await enrolmentsFor(scene.client, code)).filter((x) => x.active).length, 0);
});

cell("p940.schedule.roster_gate — an eligible but UNENROLLED prepaid leg is refused by name with the enrolment door and the panel as the remedy and writes nothing; the SAME call succeeds once the account is enrolled; the roster is asked BEFORE the shared wall, so an account that fails both answers the roster; and the wall is still live afterwards, driven at the door #1078's reservation leaves open", async () => {
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

  // …AND THE WALL IS STILL LIVE AFTERWARDS — reached the way that is still open.
  //
  // [#1078, migration 0337_prepayment_account_reservation] THIS HALF USED TO EXPLOIT THE HOLE
  // #1078 CLOSED. Until 0337 a live prepayment enrolment reserved nothing, so an enrolled account
  // could still be bound as a registered bank account, and this cell used that to make an
  // ALREADY-ENROLLED account ineligible and watch the schedule door refuse it with
  // `prepaid_account_ineligible`. The roster now reserves its live enrolments in
  // `clara._acct_role_reserved`, so the bank belt refuses that binding outright — which is
  // measured at the belt in `p1078.claim.bank`, not paraphrased here.
  //
  // WHAT THAT COSTS THIS CELL, STATED RATHER THAN QUIETLY DROPPED: the schedule door's
  // `prepaid_account_ineligible` arm is no longer reachable for an ENROLLED account through any
  // governed door. Each of the wall's five axes is now closed ahead of it — `account_unknown` and
  // `account_inactive` have no door at all (the #1078 ruling of 2026-09-24 keeps the latter a
  // known dead axis), `control_account` needs a re-type that `clara._upsert_account_core` refuses
  // on any account carrying lines, and `bank_account` and `account_reserved` are what 0337 itself
  // now refuses. The arm stays in the body as defence in depth, and `p1078.wall.unmoved` measures
  // that it is still asked.
  //
  // SO THE SAME WALL IS DRIVEN ON THE SAME ACCOUNT, at the door that can still reach it: retire
  // the enrolment, bind the bank account, and try to enrol it again.
  const later = await plainAssetRecognition(scene, {
    code: "17000010", name: "Maybank current (gate)", cents: 45000, tag: "later" });
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: later.code });
  await assertRaises(CLR.badRequest,
    () => bindBankAccount(scene.alice, {
      client: scene.client, coaAccountCode: later.code, accountNumber: "5140940941" }),
    "binding an account the prepayment roster holds as a registered bank account");
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: later.code });
  await bindBankAccount(scene.alice, {
    client: scene.client, coaAccountCode: later.code, accountNumber: "5140940941" });
  const walled = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolPrepaymentAccount(scene.bob, { client: scene.client, account: later.code }),
    "enrolling an account that has since been bound as a registered bank account");
  assert.equal(walled.detail.axis, ROSTER_AXIS.bankAccount,
    "the shared negative wall still guards the roster, with its OWN axis carried through");
  assert.equal(await scheduleCountFor(later.entry), 0);
});

// ===========================================================================================
// AC3 (second half) — THE BAND NEVER ADVERTISES A RECOGNITION THE DOOR WOULD REFUSE.
// ===========================================================================================

cell("p940.attention.arm_b_roster — arm B lists only recognitions whose debited asset account is enrolled, the list and the door agree BOTH ways (enrol makes a row appear, retire makes it vanish and the door refuse), and no row the band offers can be refused by the roster", async () => {
  const scene = await statedTermScene("armb", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const deposit = await plainAssetRecognition(scene, { code: "19000007", cents: 66000, tag: "armb" });

  // BEFORE THE ENROLMENT: the band advertises the scene's own prepayment (its account is on the
  // roster) and NOT the deposit — because "configure the schedule" on the deposit is an action
  // that could only refuse, which is the exact reason #939 gave for arm B's earlier filter.
  const before = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(before.unscheduled.filter((r) => r.entry_id === scene.entry).length, 1,
    "the enrolled recognition is advertised");
  assert.equal(before.unscheduled.filter((r) => r.entry_id === deposit.entry).length, 0,
    "a recognition on an account nobody enrolled is not offered for configuration");

  // ENROL, AND THE ROW APPEARS. The band reports the database's answer, not a cached one.
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: deposit.code });
  const enrolled = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(enrolled.unscheduled.filter((r) => r.entry_id === deposit.entry).length, 1,
    "enrolling the account makes its recognition appear in the band");

  // RETIRE, AND THE ROW VANISHES — AND THE DOOR REFUSES IT. This is the "both ways" half: the two
  // answers are the same predicate, so they cannot drift apart.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: deposit.code });
  const retired = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(retired.unscheduled.filter((r) => r.entry_id === deposit.entry).length, 0,
    "retiring the account closes it to NEW schedules, and the band stops offering one");
  const refused = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: deposit.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "configuring a schedule on a since-retired account");
  assert.equal(refused.detail.axis, PREPAID_NOT_ENROLLED_AXIS);

  // …AND THE SCENE'S OWN RECOGNITION GOES THE SAME WAY when ITS account is retired, so this is a
  // property of the roster rather than of one fixture.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: scene.prepaid });
  const none = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(none.unscheduled.length, 0,
    "with no live enrolment at all, arm B advertises nothing — every action it could offer would refuse");

  // THE AGREEMENT, MEASURED OVER THE WHOLE ARM rather than over the row this cell happens to know:
  // re-enrol both accounts and assert that EVERY row the band offers survives the door's roster
  // question. A band that advertised an entry the door refuses is the defect this cell exists for.
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: scene.prepaid });
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: deposit.code });
  const both = await listPrepaymentAttention(scene.bob, scene.client);
  assert.ok(both.unscheduled.length >= 2, "both recognitions are back");
  for (const row of both.unscheduled) {
    const live = await rootQuery(
      `select count(*)::int as n from clara.prepayment_account_enrolments
        where client_id = $1 and account_code = $2 and purpose = 'prepayment' and active`,
      [scene.client, row.prepaid_account_code]);
    assert.equal(live.rows[0].n, 1,
      `the band offered ${row.prepaid_account_code}, which the door's roster question would refuse`);
  }
});

// ===========================================================================================
// AC4 — MONTHLY ADMISSION DOES NOT CONSULT THE ROSTER.
//
// Owner decision 5: "retiring an account closes it to new schedules; running schedules continue to
// term end". This cell does not assert that by reading the migration — it RETIRES the account and
// then drives a real period all the way to a committed receipt.
// ===========================================================================================

cell("p940.retire.future_only — a schedule configured on an enrolled account keeps posting after the account is retired: the occurrence is admitted, the Work is claimed and the entry REALLY posts with a committed receipt, the stored allocation is byte-identical, no roster row is back-filled by any of it, and only a NEW schedule is refused", async () => {
  const scene = await statedTermScene("future", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  const rowBefore = await scheduleRow(created.schedule_id);
  const detailBefore = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  const rosterBefore = await enrolmentsFor(scene.client, scene.prepaid);
  assert.equal(rosterBefore.filter((x) => x.active).length, 1,
    "the scene's prepaid account is enrolled, which is why the schedule exists at all");

  // ---- THE ACCOUNT IS RETIRED FROM THE ROSTER, BEFORE A SINGLE PERIOD HAS POSTED. This is the
  // worst case for decision 5: nothing about this schedule has yet reached the books.
  await retirePrepaymentAccount(scene.bob, { client: scene.client, account: scene.prepaid });
  assert.equal((await enrolmentsFor(scene.client, scene.prepaid)).filter((x) => x.active).length, 0,
    "no live enrolment stands on this account any more");

  // ---- AND A PERIOD STILL POSTS. Not an admitted Work: a COMMITTED receipt, which is the only
  // thing that means money reached the books.
  await wakeDuePlanOccurrences({ limit: 100 });
  const occ = await occurrenceRows(created.plan_id);
  assert.equal(occ.length, 1, "the monthly scan admitted the due period, roster or no roster");
  const workId = occ[0].work_id;
  assert.ok(workId, "…and it admitted a Work");
  const w = await workRow(workId);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p940-run") });
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: scene.client, work: workId, logicalOpId: w.logical_op_id, basis: w.basis });
  assert.equal(posted.posted, true,
    "the amortisation charge really reached the books on an account since retired from the roster");
  await settleWorkRun({
    task: w.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });
  const receipts = await receiptsForWork(workId);
  assert.equal(receipts.filter((r) => r.outcome === "committed").length, 1,
    "exactly one committed receipt stands");

  // ---- NOTHING ABOUT THE SCHEDULE MOVED. Retiring an enrolment ends an interval and nothing else.
  const rowAfter = await scheduleRow(created.schedule_id);
  assert.deepEqual(rowAfter.period_lines, rowBefore.period_lines,
    "the stored allocation is byte-identical after the retirement");
  assert.equal(rowAfter.term_start, rowBefore.term_start);
  assert.equal(rowAfter.term_end, rowBefore.term_end);
  assert.equal(rowAfter.prepaid_account_code, rowBefore.prepaid_account_code);
  const detailAfter = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.deepEqual(detailAfter.periods.map((x) => [x.period_start, x.period_end]),
    detailBefore.periods.map((x) => [x.period_start, x.period_end]),
    "…and the read's period projection did not move either (its occurrence did, because one posted)");

  // ---- NO BACK-FILL. Configuring a schedule, retiring the account and posting a period between
  // them changed the roster exactly once — the retirement this cell performed.
  const rosterAfter = await enrolmentsFor(scene.client, scene.prepaid);
  assert.equal(rosterAfter.length, rosterBefore.length,
    "no enrolment row was minted by the schedule, the scan, the Work or the posting");
  assert.equal(rosterAfter.filter((x) => x.active).length, 0,
    "…and nothing re-enrolled the account behind the retirement");

  // ---- ONLY THE FUTURE IS CLOSED. A NEW schedule on the same account is refused by name; the
  // running one is untouched, which is the whole of decision 5 in two assertions.
  const nextOne = await extraRecognition(scene, {
    cents: 33000, postingDate: scene.postingDate, tag: "future" });
  await recordPeriod(scene.bob, {
    document: nextOne.document, start: scene.termStart, end: scene.termEnd });
  const refused = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: nextOne.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef }),
    "a NEW schedule on a since-retired account");
  assert.equal(refused.detail.axis, PREPAID_NOT_ENROLLED_AXIS);
});
