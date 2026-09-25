// #915 — #653's CHAT ENTRANCE STOPS AT A GRANT WALL: `clara.create_prepayment_schedule` has no
// `clara_runtime` twin. Migration: 0307_prepayment_schedule_obo_twin.sql. Frontier-gated on its own
// STABLE STEM (`prepayment_schedule_obo_twin$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_account_roster$` / `prepayment_stated_term$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY OBO CELL RUNS ON A REAL `clara_runtime` CONNECTION — `roleQuery(ROLES.runtime, …)`, the
// least-privileged lane the pool actually uses, carrying NO `request.jwt.claims` at all. A cell
// that drove this door as `postgres` would prove nothing about the grant it rides, and would not
// see the CLR04 a nested `clara._human_ctx` raises.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertOboLanePresent, endPool, rootQuery, CLR, assertPair, assertRaises,
  prepaymentScene, createPrepaymentSchedule, createPrepaymentScheduleFor,
  createPrepaymentScheduleForAs, chatTaskRef, planAuthority, scheduleRow, scheduleRowsFor,
  scheduleCountFor, opReceiptsFor, deactivateMember, reactivateMember,
  roleCanExecute, ROLES, opk, nowhere,
  extraExpenseAccount, refusalOf, memoOnlyRecognition, setClientStatus,
  plainAssetRecognition, ineligibleAssetEntry, enrolPrepaymentAccount, bindBankAccount,
  extraRecognition, recordPeriod, recordStatedTerm,
  readPrepaymentSourceFor, readPrepaymentSourceForAs, prepaymentLaneGrants,
  READ_SIG, READ_REASON,
  OBO_REASON, TWIN_SIG, HUMAN_SIG, AMORTISATION_KIND, PREPAY_BASIS,
  PREPAY_REASON, PREPAID_NOT_ENROLLED_AXIS,
} from "./prepayment-schedule-obo-fixtures.mjs";
import { callerContractCode } from "./internal-refusal-errcode-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 7;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["prepayment_schedule_obo_twin$"]);
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
    if (await assertOboLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// AC1 — A RUNTIME SESSION CONFIGURES A SCHEDULE OBO A BOOKKEEPER, AND IS REFUSED OBO A VIEWER.
// ===========================================================================================

// #939 AC4 (0317) — THIS FILE'S OWN LANE-SPECIFIC FRONTIER. 0307's stem is true long before 0317
// exists, and 0317 adds ONE name to the human roster this file enumerates, so the expectation asks
// the catalog rather than assuming it: the db-slice-frontiers matrix runs this battery against
// chains where 0307 has applied and 0317 has not.
let corrected = null;
async function hasCorrection() {
  if (corrected !== null) return corrected;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'schedule_term_correction$'");
  corrected = Number(r.rows[0].n) > 0;
  return corrected;
}

cell("p915.obo.configures — on a real clara_runtime connection with no JWT, the twin configures a "
  + "schedule OBO a bookkeeper and records THAT human as its author; OBO a viewer it refuses CLR04 "
  + "insufficient_role and writes nothing; and the twin is the ONLY lane the runtime role holds",
async () => {
  const scene = await prepaymentScene("obo-configures");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });

  // THE VIEWER FIRST, so the success below is also the proof that the refusal wrote nothing: a
  // schedule left behind by the refused call would make the second call answer
  // `prepayment_schedule_exists` instead.
  await assertPair(CLR.authz, OBO_REASON.insufficientRole,
    () => createPrepaymentScheduleFor({
      client: scene.client, author: scene.w.users.carol, sourceEntry: scene.entry,
      expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-viewer"),
    }), "an OBO configuration for a viewer");
  assert.equal(await scheduleCountFor(scene.entry), 0, "the refused call wrote no schedule");

  const answer = await createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-obo-ok"),
  });
  assert.ok(answer.schedule_id, "a real schedule");
  assert.ok(answer.plan_id, "…on a real plan");
  assert.equal(answer.kind, AMORTISATION_KIND);
  assert.equal(answer.configuration_only, true, "…that has posted nothing");
  assert.equal(answer.term_source, "document_service_period",
    "the document lane, unchanged by the entrance the call arrived through");
  assert.equal(Number(answer.total_cents), scene.cents);
  assert.equal(answer.period_count, scene.termMonths);
  assert.equal(answer.prepaid_account_code, scene.prepaid);
  assert.equal(answer.expense_account_code, scene.target);

  // THE AUTHOR IS THE ARGUMENT'S HUMAN, never the run. Read off the ROW and the PLAN, because
  // "acting on behalf of" means the durable records name the person, not the process.
  const row = await scheduleRow(answer.schedule_id);
  assert.equal(row.created_by, scene.bob, "the schedule records the human it acted for");
  const plan = await planAuthority(answer.plan_id);
  assert.equal(plan.authorised_by, scene.bob, "…and the plan's authority is that human's");
  assert.equal(plan.created_by, scene.bob);
  assert.equal(plan.kind, AMORTISATION_KIND);
  assert.equal(plan.authority_kind, "explicit_instruction");
  assert.deepEqual(plan.authority_ref, ref, "…citing the conversation it was asked in");

  // THE ACL, READ POSITIVELY IN BOTH DIRECTIONS. A grant assertion that only reads "runtime can"
  // would miss the second door being opened to a lane that must never hold it.
  assert.equal(await roleCanExecute(ROLES.runtime, TWIN_SIG), true);
  for (const role of [ROLES.authenticated, ROLES.agentRo,
    ROLES.wakeInteractive, ROLES.wakeProactive, "public"]) {
    assert.equal(await roleCanExecute(role, TWIN_SIG), false,
      `${role} must not reach the OBO twin`);
  }
  // …and the HUMAN door's own posture is untouched: this ticket adds a twin, it does not widen a
  // grant. `clara_runtime` reaching the human door would mean an OBO call with no named author.
  assert.equal(await roleCanExecute(ROLES.authenticated, HUMAN_SIG), true);
  assert.equal(await roleCanExecute(ROLES.runtime, HUMAN_SIG), false);

  // A LANE THAT HOLDS NO GRANT IS REFUSED BY POSTGRES, not by the body: 42501, before a single
  // line of the twin runs.
  await assertRaises("42501",
    () => createPrepaymentScheduleForAs(ROLES.agentRo, {
      client: scene.client, author: scene.bob, sourceEntry: scene.entry,
      expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-agent"),
    }), "the agent read role calling the OBO twin");
});

// ===========================================================================================
// AC2 — LIVE AUTHORITY: A WITHDRAWN MEMBERSHIP, AND A NON-MEMBER ANSWERED AS AN UNKNOWN CLIENT.
// ===========================================================================================

cell("p915.obo.authority — the twin refuses CLR04 authority_lost for a human whose membership was "
  + "withdrawn, answers a NON-MEMBER author with the same CLR11 client_not_found (same message, "
  + "byte for byte) as a client this database does not hold, refuses a null author by name, and "
  + "writes nothing on any of them",
async () => {
  const scene = await prepaymentScene("obo-authority");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const call = (over = {}) => createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-auth"), ...over,
  });

  // 1 — A NULL AUTHOR is its own mistake, and it is answered before the client is even read, so it
  //     can leak nothing about which clients exist.
  //
  //     #1114 — AND IT IS NOT A `bad-request`. The only caller of this door is a `clara_runtime`
  //     body that always holds the actor, so a null here is the calling PROGRAM's fault, has no
  //     sentence to show anyone and no remedy to offer. It carries CLR44, the caller-contract
  //     class, and the distinctness from the renderable roster refusal is asserted below.
  const nullAuthor = await assertPair(await callerContractCode(), OBO_REASON.invalidAuthor,
    () => call({ author: null }), "an OBO configuration naming no human at all");
  assert.equal(nullAuthor.detail.field, "author");
  assert.equal(nullAuthor.detail.constraint, "present");

  // 2 — A NON-MEMBER AUTHOR AND AN UNKNOWN CLIENT ARE ONE ANSWER. Dave owns a firm of his own and
  //     has no membership here at all; the pair (this client, that human) must not be usable to
  //     learn that this client exists. Compared MESSAGE AND DETAIL, not merely code+reason: a
  //     sentence that differed would be the oracle the code was written to prevent.
  const stranger = await assertPair(CLR.notFound, OBO_REASON.clientNotFound,
    () => call({ author: scene.w.users.dave }), "an OBO configuration for a non-member");
  const unknownClient = await assertPair(CLR.notFound, OBO_REASON.clientNotFound,
    () => call({ client: nowhere() }), "an OBO configuration for a client this database does not hold");
  assert.equal(stranger.err.message, unknownClient.err.message,
    "a non-member author and an unknown client answer the SAME sentence");
  assert.equal(stranger.err.detail, unknownClient.err.detail,
    "…and the same payload");

  // 3 — AUTHORITY MUST BE LIVE AT THE MOMENT THE BOOKS ARE CONFIGURED. Bob's membership is
  //     withdrawn through the estate's OWN door, and the deactivated member of THIS firm gets the
  //     precise answer instead of the oracle-safe one: they already knew the client exists.
  await deactivateMember(scene.alice, { firm: scene.firm, user: scene.bob });
  try {
    await assertPair(CLR.authz, OBO_REASON.authorityLost, () => call(),
      "an OBO configuration for a human whose membership was withdrawn");
  } finally {
    await reactivateMember({ firm: scene.firm, user: scene.bob });
  }

  // 4 — NOTHING WAS WRITTEN BY ANY OF THEM, and the positive control proves the scene was
  //     configurable all along: the same call, after the membership is back, succeeds.
  assert.equal(await scheduleCountFor(scene.entry), 0, "no schedule from any refusal");
  assert.deepEqual(await opReceiptsFor(scene.firm, opk("p915-auth")), [],
    "and not even a reservation survived");
  const ok = await call({ opKey: opk("p915-auth-ok") });
  assert.ok(ok.schedule_id, "the same configuration succeeds once authority is live again");
});

// ===========================================================================================
// AC3 — ONE OP-KEY NAMESPACE: A CHAT CONFIGURATION AND A HUMAN REPLAY CONVERGE.
// ===========================================================================================

cell("p915.obo.one_key — the twin and the human door share ONE _reserve_op namespace: the same key "
  + "and the same decision replay each other's receipt in BOTH directions, one schedule exists, and "
  + "a DIFFERENT decision under a used key is refused identically by both entrances",
async () => {
  const scene = await prepaymentScene("obo-one-key");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const args = {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    expenseBasis: PREPAY_BASIS, purpose: "Prepaid subscription amortisation", authorityRef: ref,
  };

  // 1 — CHAT FIRST, THEN THE HUMAN REPLAY. This is the case the brief names: a person asks Clara to
  //     configure the schedule, the response is lost, and the person then does it themselves under
  //     the key their own client already holds. One receipt, one schedule, the SAME answer.
  const key = opk("p915-shared-key");
  const byChat = await createPrepaymentScheduleFor({ ...args, author: scene.bob, opKey: key });
  const byHuman = await createPrepaymentSchedule(scene.bob, { ...args, opKey: key });
  assert.equal(byHuman.schedule_id, byChat.schedule_id, "the human replay REPLAYS the chat's receipt");
  assert.deepEqual(byHuman, byChat, "…byte for byte, including the derived allocation");
  assert.equal(await scheduleCountFor(scene.entry), 1, "and exactly ONE schedule exists");
  const receipts = await opReceiptsFor(scene.firm, key);
  assert.equal(receipts.length, 1, "ONE op receipt — the two entrances did not open two namespaces");
  assert.equal(receipts[0].fn, "create_prepayment_schedule",
    "…under the HUMAN door's own verb name, which is what makes the namespace shared");
  assert.equal(receipts[0].finished, true);

  // 2 — AND THE OTHER WAY ROUND, on a second recognition: human first, chat replays.
  const second = await prepaymentScene("obo-one-key-rev");
  const ref2 = await chatTaskRef({ firm: second.firm, client: second.client, author: second.bob });
  const args2 = {
    client: second.client, sourceEntry: second.entry, expenseAccount: second.target,
    expenseBasis: PREPAY_BASIS, purpose: "Prepaid subscription amortisation", authorityRef: ref2,
  };
  const key2 = opk("p915-shared-key-rev");
  const humanFirst = await createPrepaymentSchedule(second.bob, { ...args2, opKey: key2 });
  const chatReplay = await createPrepaymentScheduleFor({ ...args2, author: second.bob, opKey: key2 });
  assert.equal(chatReplay.schedule_id, humanFirst.schedule_id, "the chat lane REPLAYS the human's receipt");
  assert.deepEqual(chatReplay, humanFirst);
  assert.equal((await scheduleRowsFor(second.client)).length, 1, "one schedule for the client");

  // 3 — THE AUTHOR IS NOT IN THE REQUEST HASH, and that is the point rather than an oversight: the
  //     key identifies the DECISION, and "who typed it" is not part of the decision. A replay by a
  //     DIFFERENT bookkeeper under the same key returns the first one's receipt rather than
  //     colliding with it — measured here, because a hash that included the author would make the
  //     convergence this AC asks for impossible.
  const byAlice = await createPrepaymentScheduleFor({ ...args, author: scene.alice, opKey: key });
  assert.equal(byAlice.schedule_id, byChat.schedule_id,
    "a second human replaying the same decision gets the same schedule, not a conflict");
  const row = await scheduleRow(byChat.schedule_id);
  assert.equal(row.created_by, scene.bob, "…and the schedule still names the human who made it");

  // 4 — A DIFFERENT DECISION UNDER A USED KEY IS REFUSED, and both entrances refuse it with the
  //     SAME sentence, because the reservation is taken in the ONE body they share.
  const other = await extraExpenseAccount(scene.alice, scene.client, { code: "59000002" });
  const chatConflict = await assertRaises(CLR.badRequest,
    () => createPrepaymentScheduleFor({ ...args, author: scene.bob, expenseAccount: other, opKey: key }),
    "a DIFFERENT expense account under a used key, through the chat lane");
  const humanConflict = await assertRaises(CLR.badRequest,
    () => createPrepaymentSchedule(scene.bob, { ...args, expenseAccount: other, opKey: key }),
    "…and through the human door");
  assert.equal(chatConflict.message, humanConflict.message,
    "one namespace, one answer: `op_key reused with different args`");
  assert.equal(await scheduleCountFor(scene.entry), 1, "and still exactly one schedule");
});

// ===========================================================================================
// AC4 — THE TWIN'S REFUSAL VOCABULARY IS THE HUMAN DOOR'S, FOR EVERY SHARED RULE.
// ===========================================================================================

cell("p915.obo.refusals_match — sixteen shared rules, each driven through BOTH entrances on the "
  + "same state, answer the same SQLSTATE, the same sentence and the same payload byte for byte — "
  + "including the four authority rules, which the two lanes reach through DIFFERENT plan steps",
async () => {
  const scene = await prepaymentScene("obo-match");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const memo = await memoOnlyRecognition(scene, { cents: 45000 });
  const base = {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    expenseBasis: PREPAY_BASIS, purpose: "Prepaid subscription amortisation", authorityRef: ref,
  };

  /** Drive ONE rule through both entrances and compare the WHOLE answer. A raise that carried the
   *  right token with a different sentence would still be a divergence a person would read. */
  const both = async (label, over) => {
    const human = await refusalOf(() => createPrepaymentSchedule(scene.bob,
      { ...base, ...over, opKey: over.opKey ?? opk("p915-match-h") }), `${label} (human door)`);
    const obo = await refusalOf(() => createPrepaymentScheduleFor(
      { ...base, author: scene.bob, ...over, opKey: over.opKey ?? opk("p915-match-o") }),
    `${label} (OBO twin)`);
    assert.deepEqual(obo, human, `${label}: the two entrances must answer identically`);
    return human;
  };

  // ---- the shape rules, one of which each wrapper spells for itself ------------------------
  const key = await both("a blank idempotency key", { opKey: "   " });
  assert.deepEqual([key.code, key.detail.reason], [CLR.badRequest, "invalid_op_key"]);

  const purpose = await both("a blank purpose", { purpose: "   " });
  assert.equal(purpose.detail.reason, "invalid_purpose");

  const stranger = await both("a client of another firm", { client: scene.w.clients.B1 });
  assert.deepEqual([stranger.code, stranger.detail.reason], [CLR.notFound, "client_not_found"]);

  // ---- the source rules --------------------------------------------------------------------
  const noEntry = await both("a source entry this client does not hold", { sourceEntry: nowhere() });
  assert.equal(noEntry.detail.reason, "prepayment_source_unfit");

  const noTerm = await both("a memo-only recognition nobody has stated a term for",
    { sourceEntry: memo.entry });
  assert.equal(noTerm.detail.reason, "prepayment_term_underivable");
  assert.equal(noTerm.detail.missing, "prepayment_stated_terms");
  assert.equal(noTerm.detail.remedy, "clara.record_prepayment_stated_term",
    "…and both entrances name the HUMAN door that fills it");

  // ---- the expense half --------------------------------------------------------------------
  const noTarget = await both("no expense account at all", { expenseAccount: null });
  assert.deepEqual([noTarget.detail.reason, noTarget.detail.axis],
    ["prepayment_target_underivable", "account_missing"]);

  const noBasis = await both("an expense account with no stated grounds", { expenseBasis: "  " });
  assert.deepEqual([noBasis.detail.reason, noBasis.detail.axis],
    ["prepayment_target_underivable", "basis_missing"]);

  const unknown = await both("an expense code this chart does not hold", { expenseAccount: "59999999" });
  assert.deepEqual([unknown.detail.reason, unknown.detail.axis],
    ["prepayment_target_ineligible", "account_unknown"]);

  const notExpense = await both("the prepaid asset itself as the charge target",
    { expenseAccount: scene.prepaid });
  assert.deepEqual([notExpense.detail.reason, notExpense.detail.axis],
    ["prepayment_target_ineligible", "not_expense_class"]);

  // ---- THE AUTHORITY RULES. These are the ones that matter most here: the human lane reaches
  //      them inside `clara.create_accounting_plan` and the OBO lane inside
  //      `clara._prepayment_plan_core`, so this is where two bodies would drift.
  const notObject = await both("an authority reference that is not an object",
    { authorityRef: "the conversation" });
  assert.deepEqual([notObject.detail.reason, notObject.detail.constraint],
    ["authority_ref_invalid", "object"]);

  const badKind = await both("an authority reference of an unknown kind",
    { authorityRef: { kind: "email", id: nowhere() } });
  assert.deepEqual([badKind.detail.reason, badKind.detail.constraint],
    ["authority_ref_invalid", "kind"]);

  const badId = await both("an authority reference whose id is not a uuid",
    { authorityRef: { kind: "chat_task", id: "the one we just had" } });
  assert.deepEqual([badId.detail.reason, badId.detail.constraint],
    ["authority_ref_invalid", "id"]);

  const unresolved = await both("a conversation this database does not hold",
    { authorityRef: { kind: "chat_task", id: nowhere() } });
  assert.equal(unresolved.detail.reason, "authority_ref_unresolved");

  // …and #977's own narrowing: a task nobody signed is not a person's instruction. This is the
  // wall that stops a run from authorising its own amortisation schedule, and it must be the same
  // wall on both lanes or the chat entrance would be the way around it.
  const unsigned = await chatTaskRef({
    firm: scene.firm, client: scene.client, author: scene.bob, createdBy: null });
  const notHuman = await both("a chat task nobody signed", { authorityRef: unsigned });
  assert.equal(notHuman.detail.reason, "authority_ref_not_human_instruction");

  // ---- the duplicate, and then the client's own status -------------------------------------
  const made = await createPrepaymentSchedule(scene.bob, { ...base, opKey: opk("p915-match-made") });
  const exists = await both("a recognition that is already amortised", {});
  // CLR13, the estate's conflict class — spelled as a literal because rig-helpers' CLR map stops
  // at CLR12 and this battery does not widen a shared roster for one cell.
  assert.deepEqual([exists.code, exists.detail.reason], ["CLR13", "prepayment_schedule_exists"]);
  assert.equal(exists.detail.schedule_id, made.schedule_id,
    "…and both entrances name the SAME schedule to go to instead");

  // LAST, because it disables the client for everything above it.
  // `archived` is the estate's own non-active status (`clients_status_check_0017` admits
  // active | archived | onboarding); the door's token for any of them is `client_inactive`.
  await setClientStatus(scene.client, "archived");
  const inactive = await both("an inactive client", { sourceEntry: memo.entry });
  assert.deepEqual([inactive.code, inactive.detail.reason], [CLR.badRequest, "client_inactive"]);
});

// ===========================================================================================
// THE 2026-09-18 CROSS-REFERENCE — THE TWIN RUNS #940'S ROSTER CHECK, AHEAD OF THE SHARED WALL.
// ===========================================================================================

cell("p915.obo.roster_first — the twin refuses an unenrolled prepaid leg with #940's own "
  + "prepaid_account_not_enrolled axis, its remedy and its panel, identically to the human door; "
  + "enrolling the account makes the SAME OBO call succeed; and an account that fails BOTH the "
  + "roster and the shared wall is answered by the ROSTER",
async () => {
  const scene = await prepaymentScene("obo-roster");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const plain = await plainAssetRecognition(scene, { code: "19000009", tag: "obo" });

  // 1 — THE REFUSAL, THROUGH THE TWIN, WITH THE PANEL NAMED. The account passes every one of the
  //     shared wall's five negative axes; what it lacks is the POSITIVE statement #940 carries.
  const refused = await assertPair(CLR.badRequest, "prepayment_source_unfit",
    () => createPrepaymentScheduleFor({
      client: scene.client, author: scene.bob, sourceEntry: plain.entry,
      expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-roster"),
    }), "an OBO configuration against an unenrolled prepaid account");
  assert.equal(refused.detail.axis, "prepaid_account_not_enrolled");
  assert.equal(refused.detail.prepaid_account_code, plain.code);
  assert.equal(refused.detail.remedy, "clara.enrol_prepayment_account");
  assert.equal(refused.detail.panel, "client_registers_prepayment_accounts");
  assert.equal(await scheduleCountFor(plain.entry), 0, "and it configured nothing");

  // …and the human door says exactly the same thing, which is what "one body" means here.
  const humanSide = await refusalOf(() => createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: plain.entry, expenseAccount: scene.target,
    expenseBasis: PREPAY_BASIS, purpose: "Prepaid subscription amortisation",
    authorityRef: ref, opKey: opk("p915-roster-h"),
  }), "the human door against the same unenrolled account");
  assert.deepEqual(humanSide.detail, refused.detail);

  // 2 — ENROL IT AND THE SAME OBO CALL SUCCEEDS. A gate cell that only ever measured the refusal
  //     could not tell a gate from a ban.
  await enrolPrepaymentAccount(scene.bob, { client: scene.client, account: plain.code });
  const ok = await createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: plain.entry,
    expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-roster-ok"),
  });
  assert.ok(ok.schedule_id, "the enrolled account amortises through the chat lane");
  assert.equal(ok.prepaid_account_code, plain.code);

  // 3 — THE ORDER. A receivable CONTROL account fails the roster AND the shared wall; the answer a
  //     person can act on is the roster one, and #940's owner decision 6 puts it first. The twin
  //     inherits that order by running the same body rather than by restating it.
  const control = await ineligibleAssetEntry(scene, { tag: "obo-ctl" });
  const both = await assertPair(CLR.badRequest, "prepayment_source_unfit",
    () => createPrepaymentScheduleFor({
      client: scene.client, author: scene.bob, sourceEntry: control.entry,
      expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-roster-ctl"),
    }), "an OBO configuration against an account that fails both gates");
  assert.equal(both.detail.axis, "prepaid_account_not_enrolled",
    "the ROSTER answers first, and names where to go");

  // …and the WALL is still live behind it on this lane too: the scene's OWN prepaid account is
  // enrolled, and binding it as a bank account makes the next configuration answer the wall.
  await bindBankAccount(scene.alice, {
    client: scene.client, coaAccountCode: scene.prepaid, accountNumber: "915000112233" });
  const extra = await extraRecognition(scene, { cents: 24000, tag: "obo-wall" });
  await recordPeriod(scene.bob, {
    document: extra.document, start: scene.termStart, end: scene.termEnd });
  const walled = await assertPair(CLR.badRequest, "prepayment_source_unfit",
    () => createPrepaymentScheduleFor({
      client: scene.client, author: scene.bob, sourceEntry: extra.entry,
      expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-roster-wall"),
    }), "an OBO configuration against an enrolled account that has since been bound as a bank account");
  assert.equal(walled.detail.axis, "prepaid_account_ineligible");
  assert.equal(walled.detail.breach.axis, "bank_account");
});

// ===========================================================================================
// THE MACHINE-LANE READ — THE RECORDED TERM, AND NOT ONE BYTE MORE.
// ===========================================================================================

cell("p915.read.recorded_term — on a clara_runtime connection the read answers the RECORDED term "
  + "for both carriers, names the human door when there is none, carries no document bytes and no "
  + "key that could hold one, answers a foreign entry exactly as an id naming nothing does, and no "
  + "other lane can call it at all",
async () => {
  const scene = await prepaymentScene("obo-read");
  const scope = { firm: scene.firm, client: scene.client };

  // 1 — THE DOCUMENT CARRIER. Everything here is a fact a PERSON recorded: the period through
  //     `clara.record_document_service_period`, and the basis text in their own words.
  const doc = await readPrepaymentSourceFor({ ...scope, sourceEntry: scene.entry });
  assert.equal(doc.status, "ok");
  assert.equal(doc.source_entry_id, scene.entry);
  assert.equal(doc.entry.status, "approved");
  assert.equal(doc.entry.document_id, scene.document);
  assert.equal(doc.entry.posting_date, scene.postingDate);
  assert.equal(doc.prepaid.account_code, scene.prepaid);
  assert.equal(Number(doc.prepaid.total_cents), scene.cents);
  assert.equal(doc.prepaid.candidate_legs, 1);
  assert.equal(doc.term.source, "document_service_period");
  assert.equal(doc.term.period_start, scene.termStart);
  assert.equal(doc.term.period_end, scene.termEnd);
  assert.equal(doc.term.basis_kind, "human_stated",
    "the carrier records WHO said it, and only a person ever does");
  assert.equal(doc.term.basis_text,
    "f-a4-pr2a battery: the invoice states the service term on its face",
    "…and the run reads the grounds the person gave, which is what it may cite");
  assert.ok(doc.term.service_period_id, "naming the carrier row it came from");
  assert.equal(doc.term.stated_term_id, null);
  assert.equal(doc.schedule, null, "nothing amortises this recognition yet");

  // NO BYTES, AND NO KEY THAT COULD EVER HOLD ONE. Asserted as the EXACT key set rather than as
  // "storage_key is absent": a later widening that added a `document` object with bytes inside it
  // would pass an absence test and fail this one.
  assert.deepEqual(Object.keys(doc).sort(),
    ["client_id", "entry", "firm_id", "prepaid", "schedule", "source_entry_id", "status", "term"]);
  assert.deepEqual(Object.keys(doc.entry).sort(), ["document_id", "posting_date", "status"]);
  for (const forbidden of ["storage_key", "sha256", "bytes", "content", "url", "filename"]) {
    assert.equal(JSON.stringify(doc).includes(forbidden), false,
      `the machine-lane read must never carry ${forbidden}`);
  }

  // 2 — AND IT SEES THE SCHEDULE ONCE THERE IS ONE, so a run can say "already amortised" instead of
  //     driving the door to find out.
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const made = await createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: ref, opKey: opk("p915-read-made") });
  const after = await readPrepaymentSourceFor({ ...scope, sourceEntry: scene.entry });
  assert.equal(after.schedule.schedule_id, made.schedule_id);
  assert.equal(after.schedule.plan_id, made.plan_id);
  assert.equal(after.schedule.term_source, "document_service_period");

  // 3 — THE MEMO-ONLY LANE, BEFORE AND AFTER A PERSON STATES THE TERM. Before, the read reports the
  //     ABSENCE and names the human door that fills it — never an empty term a run could read as
  //     "no term is needed".
  const memo = await memoOnlyRecognition(scene, { cents: 45000 });
  const bare = await readPrepaymentSourceFor({ ...scope, sourceEntry: memo.entry });
  assert.equal(bare.entry.document_id, null, "no document at all on this lane");
  assert.equal(bare.term.source, null);
  assert.equal(bare.term.period_start, null);
  assert.equal(bare.term.remedy, "clara.record_prepayment_stated_term");
  assert.equal(Number(bare.prepaid.total_cents), 45000);

  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: memo.entry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#915 battery: the supplier's email states the twelve-month term" });
  const stated = await readPrepaymentSourceFor({ ...scope, sourceEntry: memo.entry });
  assert.equal(stated.term.source, "human_stated");
  assert.equal(stated.term.period_start, scene.termStart);
  assert.equal(stated.term.period_end, scene.termEnd);
  assert.equal(stated.term.basis_kind, "human_stated");
  assert.equal(stated.term.basis_text,
    "#915 battery: the supplier's email states the twelve-month term");
  assert.ok(stated.term.stated_term_id);
  assert.equal(stated.term.service_period_id, null);

  // 4 — NO EXISTENCE ORACLE. A real entry read under the WRONG client, a real entry read under the
  //     wrong FIRM and an id naming nothing all answer the same sentence and the same payload.
  const nowhereEntry = await assertPair(CLR.notFound, READ_REASON.sourceNotFound,
    () => readPrepaymentSourceFor({ ...scope, sourceEntry: nowhere() }), "an entry id naming nothing");
  const wrongClient = await assertPair(CLR.notFound, READ_REASON.sourceNotFound,
    () => readPrepaymentSourceFor({
      firm: scene.firm, client: scene.w.clients.A2, sourceEntry: scene.entry }),
    "a real entry read under another client of the same firm");
  const wrongFirm = await assertPair(CLR.notFound, READ_REASON.sourceNotFound,
    () => readPrepaymentSourceFor({
      firm: scene.w.firms.B, client: scene.client, sourceEntry: scene.entry }),
    "a real entry read under another firm");
  assert.equal(wrongClient.err.message, nowhereEntry.err.message);
  assert.equal(wrongFirm.err.message, nowhereEntry.err.message);
  assert.equal(wrongFirm.err.detail, nowhereEntry.err.detail);

  // 5 — THE SCOPE IS REQUIRED, and a missing one is its own refusal rather than a null-shaped
  //     answer that a caller might read as "nothing is recorded".
  await assertPair(CLR.badRequest, READ_REASON.scopeRequired,
    () => readPrepaymentSourceFor({ firm: null, client: scene.client, sourceEntry: scene.entry }),
    "a read with no firm");

  // 6 — AND NO OTHER LANE CAN CALL IT AT ALL: 42501 from Postgres, before a line of the body runs.
  assert.equal(await roleCanExecute(ROLES.runtime, READ_SIG), true);
  for (const role of [ROLES.authenticated, ROLES.agentRo,
    ROLES.wakeInteractive, ROLES.wakeProactive, "public"]) {
    assert.equal(await roleCanExecute(role, READ_SIG), false,
      `${role} must not reach the machine-lane read`);
  }
  await assertRaises("42501",
    () => readPrepaymentSourceForAs(ROLES.authenticated, { ...scope, sourceEntry: scene.entry }),
    "the human lane calling the machine-lane read");
});

// ===========================================================================================
// AC5 — THE GRANT CENSUS: THE RUNTIME ROLE REACHES THE TWIN AND THE READ, AND NOTHING ELSE.
// ===========================================================================================

cell("p915.grants.census — over the WHOLE prepayment/amortisation lane of the clara schema, "
  + "clara_runtime reaches exactly the OBO twin and the machine-lane read; the agent role and the "
  + "proactive wake role reach nothing at all; the interactive wake role still reaches only the "
  + "legacy template door #1036 owns; and no member of the lane is executable by PUBLIC",
async () => {
  const lane = await prepaymentLaneGrants();
  assert.ok(lane.length >= 15,
    `the census must enumerate the lane, not sample it (saw ${lane.length} functions)`);

  const named = (pick) => lane.filter(pick).map((r) => r.signature).sort();

  // 1 — THE RUNTIME LANE, ENUMERATED. This is the acceptance criterion itself: an exact set, not a
  //     membership test, so a later grant to any other prepayment function fails here.
  assert.deepEqual(named((r) => r.runtime), [
    "clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)",
    "clara.read_prepayment_source_for(uuid,uuid,uuid)",
  ]);

  // 2 — THE AGENT READ ROLE AND THE PROACTIVE WAKE ROLE REACH NOTHING in this lane, and the
  //     INTERACTIVE one reaches exactly the legacy wake door that was already there — measured
  //     rather than assumed, because "this ticket granted the wake lane nothing" is a claim about
  //     what is there now, and #1036 is the ticket that reroutes that door onto this one.
  assert.deepEqual(named((r) => r.agent_ro), []);
  assert.deepEqual(named((r) => r.wake_proactive), []);
  assert.deepEqual(named((r) => r.wake_interactive),
    ["clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)"]);

  // 3 — NOTHING IN THE LANE IS PUBLIC, and the three internals are reachable from a definer body
  //     and from nowhere else (the one-ungranted-core law).
  assert.deepEqual(named((r) => r.pub), []);
  const internals = lane.filter((r) => ["_prepayment_schedule_core", "_prepayment_plan_core",
    "_prepayment_account_enrolled"].includes(r.proname));
  assert.equal(internals.length, 3, "the two cores and #940's roster predicate");
  for (const r of internals) {
    assert.deepEqual(
      [r.authenticated, r.runtime, r.agent_ro, r.wake_interactive, r.wake_proactive, r.pub],
      [false, false, false, false, false, false],
      `${r.signature} must hold no application grant at all`);
  }

  // 4 — THE HUMAN LANE IS UNTOUCHED BY THIS TICKET: the four #653/#939/#940 doors and the three
  //     reads still hold clara_authenticated, and the human write door still does NOT hold
  //     clara_runtime — which is what makes the twin a second door rather than a widened grant.
  assert.deepEqual(named((r) => r.authenticated), [
    "clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)",
    "clara.enrol_prepayment_account(uuid,text,text,text,text)",
    "clara.get_prepayment_schedule(uuid)",
    "clara.list_prepayment_attention(uuid)",
    "clara.list_prepayment_schedules(uuid)",
    "clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)",
    // #939 AC4 (0317) — the term-correction door joins the HUMAN roster and nothing else: the two
    // assertions above still pin clara_runtime to the twin and the machine read, and the agent and
    // wake roles to nothing. Asked at the frontier rather than assumed, because this battery also
    // runs against chains where 0307 has applied and 0317 has not.
    ...(await hasCorrection()
      ? ["clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)"] : []),
    "clara.retire_prepayment_account(uuid,text,text,text)",
  ]);
  assert.equal(lane.find((r) => r.signature === HUMAN_SIG).runtime, false);
});
