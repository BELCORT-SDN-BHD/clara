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
  createPrepaymentScheduleForAs, chatTaskRef, planAuthority, scheduleRow, scheduleCountFor,
  roleCanExecute, ROLES, opk,
  OBO_REASON, TWIN_SIG, HUMAN_SIG, AMORTISATION_KIND,
} from "./prepayment-schedule-obo-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

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
