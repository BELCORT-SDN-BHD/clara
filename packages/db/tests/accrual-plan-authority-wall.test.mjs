// #1080 — THE ACCRUAL LANE JOINS THE ONE AUTHORITY WALL. Migration:
// 0331_accrual_plan_authority_wall.sql. Frontier-gated on its own STABLE STEM
// (`accrual_plan_authority_wall$`), never its number — numbers are claimed at merge
// (packages/db/README.md).
//
// THE DEFECT, IN ONE SENTENCE. `clara._accrual_plan_core` — the body BOTH accrual entrances nest,
// the human `clara.create_accrual_adjustment` and the on-behalf `clara.create_accrual_adjustment_for`
// — resolved a `{kind:'chat_task', id}` authority by a bare EXISTENCE probe against
// `clara.agent_tasks` (`0222_accrual_adjustments.sql:1014-1025`, carried forward verbatim by
// 0283's recut). #977 (0250) ruled that a task the estate enqueued FOR ITSELF is not a person's
// instruction and wired `clara.sign_depreciation_authority` and `clara.create_accounting_plan` at
// one shared definition; #1051 (0330) folded the plan family's whole wall into
// `clara._assert_plan_authority`. The accrual lane was never carried across, so until 0331 a wake
// task or an autodraft run COULD authorise an accrual adjustment plan through the runtime door.
//
// SEAMS, the public interfaces the brief names (WORK-ORDER rule 4):
//   1. `clara.create_accrual_adjustment_for` — the ON-BEHALF entrance, driven on a real
//      least-privileged `clara_runtime` connection carrying no human JWT. This is the lane the
//      ticket's own threat model names.
//   2. `clara.create_accrual_adjustment` — the human accrual door, driven as a bookkeeper.
//   3. THE CATALOG — this estate's documented structural standard for a recut body (a census, a
//      prestate pin, a tail assertion). WORK-ORDER rule 4 says that standard wins where it
//      applies, and "there is now exactly ONE spelling of the plan authority wall, and the inline
//      chat-lane probe survives nowhere" is a claim only a census can carry.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply;
// this file describes the live catalog and what the two accrual entrances actually do.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAccruals, assertAccrualCohortPresent, buildWorkWorld, endPool, printLaneNotes,
  printSkipCount, opk, rootQuery, CLR, assertPair, instructionRef, todayInPlanZone, shiftMonths,
  accrual, freshAccrualClient, createAccrualAdjustment, createAccrualAdjustmentFor,
  ACCRUAL_REASON, ACCRUAL_TZ,
} from "./accrual-adjustments-fixtures.mjs";
import { mintAgentTaskRef } from "./fa-authority-sign-compat.mjs";

const MIGRATION = "0331_accrual_plan_authority_wall.sql";
const STEM = "accrual_plan_authority_wall$";

/** #977's own token for "that row is a real row of this client's chat lane, and it is NOT a
 *  person's instruction". The whole of this ticket is that the accrual lane can now say it. */
const NOT_HUMAN = "authority_ref_not_human_instruction";

let world = null;
let today = null;
let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_ACCRUAL_PLAN_AUTHORITY_WALL !== "1") {
    throw new Error(
      `#1080 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
      + "and CLARA_ALLOW_MISSING_ACCRUAL_PLAN_AUTHORITY_WALL is unset -- this is a FOCUSED run "
      + "and must fail loudly, not skip. Preload "
      + "./tests/accrual-plan-authority-wall-preintegration-gate.mjs for an estate sweep against "
      + "a pre-#1080 chain.");
  }
});

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  printLaneNotes("accrual-plan-authority-wall");
  printSkipCount("accrual-plan-authority-wall");
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return; }
    if (await assertAccrualCohortPresent(t)) return;
    if (await gateAccruals(t)) return;
    executed += 1;
    await fn(t);
  });
}

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

/** The window this battery configures over, and the stated term that brackets it — 0222's own
 *  term law, which is not what this file is about: every cell uses one valid span so a refusal
 *  can only ever be the authority wall's. */
async function span() {
  const from = `${(await shiftMonths(today, -2)).slice(0, 7)}-01`;
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + interval '-1 month')) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today]);
  return { from, to: r.rows[0].d };
}

/** Every relation ONE accrual configuration writes, counted for one client. "Nothing was written"
 *  is asserted on the whole vector, never on a single table. */
async function footprint(client) {
  const r = await rootQuery(
    `select (select count(*)::int from clara.accounting_plans where client_id=$1) as plans,
            (select count(*)::int from clara.accounting_plan_revisions where client_id=$1) as revisions,
            (select count(*)::int from clara.accounting_plan_occurrences where client_id=$1) as occurrences,
            (select count(*)::int from clara.accrual_adjustments where client_id=$1) as accruals,
            (select count(*)::int from clara.accounting_work where client_id=$1) as work`,
    [client]);
  return r.rows[0];
}

// ===========================================================================================
// AC1 — THE GAP, AT THE SEAM THE TICKET NAMES: the ON-BEHALF entrance, on a real clara_runtime
//       connection with no human JWT, must refuse a machine-created chat task.
//
//       BOTH shapes #977 named, because they fail for DIFFERENT reasons and a wall that caught
//       only one would still be open: a `wake` task carries no author at all, and an `autodraft`
//       run DOES carry one (the human it was started for) without being that human's instruction.
// ===========================================================================================

cell("p1080.accrual.obo_machine_task_refused — clara.create_accrual_adjustment_for, on a real "
  + "clara_runtime connection, refuses a chat_task reference naming a task the estate made for "
  + "itself (a wake task with no author, and an autodraft run that does carry one) with CLR10 and "
  + "#977's own authority_ref_not_human_instruction token, naming the kind and the row; and it "
  + "writes no plan, revision, occurrence, accrual or Work",
async () => {
  const client = await freshAccrualClient(ALICE(), "p1080-obo");
  const { from, to } = await span();

  for (const [kind, author, label] of [
    ["wake", false, "a wake task — the estate enqueuing work for itself, no author by construction"],
    ["autodraft", true, "an autodraft run that DOES carry a named author — a run is not an instruction"],
  ]) {
    const ref = await mintAgentTaskRef(client, { kind, author });
    const before = await footprint(client);

    const { detail } = await assertPair(CLR.badRequest, NOT_HUMAN,
      () => createAccrualAdjustmentFor({
        client, author: BOB(), purpose: "p1080 monthly office rent accrual", authorityRef: ref,
        accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
        timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to,
        opKey: opk(`p1080-obo-${kind}`),
      }),
      `the on-behalf accrual entrance, on ${label}`);

    assert.notEqual(detail.reason, ACCRUAL_REASON.authorityRefUnresolved,
      `${label}: "that row is not a person's instruction" is told apart from "there is no such row"`);
    assert.equal(detail.kind, "chat_task", `${label}: the refusal names the reference's own kind`);
    assert.equal(detail.id, ref.id, `${label}: …and the row it refused`);
    assert.deepEqual(await footprint(client), before,
      `${label}: NOTHING is written — not a plan, a revision, an occurrence, an accrual or a Work`);
  }

  // …AND THE LANE'S OWN GOOD AUTHORITY STILL CONFIGURES, on the SAME client, so the refusals
  // above are the wall answering and not the scene being unusable.
  const good = await instructionRef({ client, author: BOB() });
  const ok = await createAccrualAdjustmentFor({
    client, author: BOB(), purpose: "p1080 monthly office rent accrual", authorityRef: good,
    accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk("p1080-obo-ok"),
  });
  assert.ok(ok.accrual_id, "a real accounting_work instruction still configures an accrual");
});
