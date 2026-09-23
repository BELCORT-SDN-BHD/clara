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
  extraExpenseAccount,
  OBO_REASON, TWIN_SIG, HUMAN_SIG, AMORTISATION_KIND, PREPAY_BASIS,
} from "./prepayment-schedule-obo-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

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
  const nullAuthor = await assertPair(CLR.badRequest, OBO_REASON.invalidAuthor,
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
