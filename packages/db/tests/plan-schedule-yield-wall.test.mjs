// #908 — `clara._assert_plan_schedule` GAINS the accrual entrance's own wall: every caller of the
// SHARED plan-creation validator — not only `clara.create_accrual_adjustment`'s own
// `_assert_accrual_schedule_yields` (0222:806) — refuses a schedule that reaches no due date
// inside its own effective window.
//
// The claims this battery exists to prove (the ticket's own Agent Brief, 2026-09-17T17:02:59Z):
//
//   1. `clara.create_accounting_plan` refuses a no-due-date schedule with the typed reason
//      `plan_schedule_yields_no_occurrence` and the field the day rule (or day number) at fault,
//      writing nothing.
//   2. `clara.revise_accounting_plan` refuses the SAME shape, leaving the live revision unmoved.
//   3. Every shape `_assert_plan_schedule` already refused for its OWN reason keeps that reason —
//      never re-spelled as a yield failure.
//   4. The accrual entrance keeps ITS OWN token (`accrual_schedule_yields_no_occurrence`):
//      `clara.create_accrual_adjustment` raises it BEFORE ever reaching this arm, because it
//      calls `clara._assert_accrual_schedule_yields` first (0222:1182), strictly before its
//      nested `clara._accrual_plan_core` ever calls `_assert_plan_schedule` (0222:1027).
//   5. NO LEGITIMATE PLAN IS REFUSED — an open-ended schedule (`effective_to` null, this whole
//      estate's own DEFAULT shape) is not this wall's business, exactly mirroring
//      `_assert_accrual_schedule_yields`'s own guard (0222:820); nor is a bounded schedule that
//      genuinely reaches a due date, of any of the three plan kinds — including a
//      'reversing_journal' plan created DIRECTLY through the shared door, the very bypass #908's
//      issue names.
//
// SEAM: `clara.create_accounting_plan` and `clara.revise_accounting_plan` (the two doors the
// Agent Brief names), each driven through a real `humanQuery` persona. `clara.create_accrual_
// adjustment` is driven once, directly, as the cross-check that the accrual entrance's own token
// is unmoved (claim 4) — a door's behaviour is asserted only after it was driven (WORK-ORDER.md's
// wave-3 addendum).
//
// CONTRACT-BLIND against the ticket's own Agent Brief, frontier-gated on migration 0280's own
// STABLE STEM (`plan_schedule_yield_wall$`) — never `accounting_plans$` (0193) or
// `accrual_adjustments$` (0222), both of which a database can carry WITHOUT this ticket's arm.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, buildWorkWorld, freshWorkClient, opk, basis,
  CLR, PLAN_REASON, PLAN_KIND, assertPair, assertRaises, detailOf,
  createAccountingPlan, reviseAccountingPlan, instructionRef, liveRevision, revisionRows,
  // the accrual entrance's own cross-check (claim 4)
  ACCRUAL_REASON, createAccrualAdjustment, accrual, freshAccrualClient,
} from "./accrual-adjustments-fixtures.mjs";

const MIGRATION = "0280_plan_schedule_yield_wall.sql";
const STEM = "plan_schedule_yield_wall$";
const FN = "clara._assert_plan_schedule(text,text,text,int,text,date,date,text)";
const YIELDS_FN = "clara._accrual_schedule_yields(text,text,int,date,date)";
const FN_ACL = "{clara_fn_owner=X/clara_fn_owner}";

/** `clara._accrual_schedule_yields`'s own sha256(prosrc) — measured on this rig at 267 migrations
 *  (0001->0272) before 0280 existed, and asserted UNMOVED by 0280's own prestate/tail. This file's
 *  own outside-in re-proof, never transcribed from 0280's header. */
const YIELDS_SHA = "c75bf4c036cbd54e2c2e737d159cc628e07e3a88fffc46a60e5b82a22add1a42";

let world = null;
let ready = false;

before(async () => {
  world = await buildWorkWorld();
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_PLAN_SCHEDULE_YIELD_WALL !== "1") {
    throw new Error(
      `#908 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) ` +
      "and CLARA_ALLOW_MISSING_PLAN_SCHEDULE_YIELD_WALL is unset -- this is a FOCUSED run and " +
      "must fail loudly, not skip. Preload " +
      "./tests/plan-schedule-yield-wall-preintegration-gate.mjs for an estate sweep against a " +
      "pre-#908 chain.");
  }
});
after(async () => {
  printLaneNotes("plan-schedule-yield-wall");
  printSkipCount("plan-schedule-yield-wall");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return true; }
  return false;
}

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

async function planCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id=$1", [client]);
  return r.rows[0].n;
}

/** A `create_accounting_plan` call on a fixed, literal window — schedule validation is about the
 *  window's own internal structure, not about "today", so a literal date needs no relative
 *  scaffolding (the same convention `accrual-adjustments.test.mjs`'s own
 *  "p652.schedule.yields" cell already uses for the identical shape on the accrual side). */
function mk(client, ref, over = {}) {
  return createAccountingPlan(ALICE(), {
    client, authorityRef: ref, kind: PLAN_KIND.recurring, effectiveFrom: "2026-07-01",
    basis: basis({ postingDate: "2026-07-01" }), ...over,
  });
}

test("pw908.create — a half-month term on a month-end rule, and the same miss under a day-of-month rule, are refused by name at the control that holds the mistake, writing nothing", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "pw908create");
  const ref = await instructionRef({ client, author: ALICE() });

  // 1 - A HALF-MONTH TERM ON A MONTH-END RULE. Last day of July (07-31) falls outside a window
  //     that ends 07-15 — the exact shape #652's accrual-side wall already refuses; this proves
  //     the SHARED door, reached directly (not through create_accrual_adjustment), refuses it too.
  const half = await assertPair(CLR.badRequest, PLAN_REASON.scheduleYieldsNoOccurrence,
    () => mk(client, ref, { dayRule: "last_day_of_month", dayOfMonth: null, effectiveTo: "2026-07-15" }),
    "a half-month term whose month-end rule falls outside it");
  assert.equal(half.detail.field, "day_rule", "at the control that holds the mistake");
  assert.equal(half.detail.constraint, "yields_occurrence");
  assert.equal(half.detail.kind, PLAN_KIND.recurring);
  assert.equal(half.detail.effective_from, "2026-07-01");
  assert.equal(half.detail.effective_to, "2026-07-15");

  // 2 - THE SAME MISS UNDER A DAY-OF-MONTH RULE names the DAY, because that is the number the
  //     preparer would change: the 20th is outside a term that ends on the 15th.
  const wrongDay = await assertPair(CLR.badRequest, PLAN_REASON.scheduleYieldsNoOccurrence,
    () => mk(client, ref, { dayRule: "day_of_month", dayOfMonth: 20, effectiveTo: "2026-07-15" }),
    "a day-of-month rule whose day falls outside the term");
  assert.equal(wrongDay.detail.field, "day_of_month");

  assert.equal(await planCount(client), 0, "nothing at all is written");
});

test("pw908.revise — the same shape, through revise_accounting_plan (the shared door's OTHER caller), leaves the live revision unmoved", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "pw908revise");
  const ref = await instructionRef({ client, author: ALICE() });
  const created = await mk(client, ref, {
    dayRule: "day_of_month", dayOfMonth: 1, effectiveTo: "2026-12-31",
  });
  const liveBefore = await liveRevision(created.plan_id);
  assert.equal(liveBefore.revision, 1);

  const refused = await assertPair(CLR.badRequest, PLAN_REASON.scheduleYieldsNoOccurrence,
    () => reviseAccountingPlan(ALICE(), {
      plan: created.plan_id, dayRule: "last_day_of_month", dayOfMonth: null,
      effectiveFrom: "2026-07-01", effectiveTo: "2026-07-15",
      basis: basis({ postingDate: "2026-07-01" }),
    }),
    "a revision moving the plan onto a half-month, month-end schedule");
  assert.equal(refused.detail.field, "day_rule");

  const liveAfter = await liveRevision(created.plan_id);
  assert.equal(liveAfter.revision, 1, "the live revision is unmoved");
  assert.equal(liveAfter.id, liveBefore.id, "the SAME revision row is still live");
  assert.equal((await revisionRows(created.plan_id)).length, 1, "no orphan revision row was inserted");
});

test("pw908.other-arms-unmoved — three shapes _assert_plan_schedule already refused keep their OWN reason, never the new one", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "pw908other");
  const ref = await instructionRef({ client, author: ALICE() });

  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk(client, ref, { frequency: "weekly", effectiveTo: "2026-12-31" }),
    "an unsupported frequency");
  await assertPair(CLR.badRequest, PLAN_REASON.reversalCollides,
    () => mk(client, ref, {
      kind: PLAN_KIND.reversing, dayRule: "day_of_month", dayOfMonth: 1,
      reversalDayRule: "next_period_first_day", effectiveTo: "2026-12-31",
    }),
    "a monthly reversing plan accruing on the 1st");
  await assertPair(CLR.badRequest, PLAN_REASON.timezoneUnsupported,
    () => mk(client, ref, { timezone: "UTC", effectiveTo: "2026-12-31" }),
    "an unsupported timezone");
});

test("pw908.accrual-entrance-unmoved — clara.create_accrual_adjustment keeps its OWN token; this arm is never reached through it", async (t) => {
  if (unready(t)) return;
  const client = await freshAccrualClient(ALICE(), "pw908accrual");
  const ref = await instructionRef({ client, author: BOB() });
  const err = await assertRaises(CLR.badRequest, () => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, dayRule: "last_day_of_month",
    accrual: accrual({ servicePeriodStart: "2026-07-01", servicePeriodEnd: "2026-07-15" }),
    effectiveFrom: "2026-07-01", effectiveTo: "2026-07-15", opKey: opk("pw908-accrual"),
  }), "a half-month accrual term whose month-end rule falls outside it");
  const detail = detailOf(err);
  assert.equal(detail.reason, ACCRUAL_REASON.scheduleYieldsNone,
    "the accrual entrance's OWN token, not #908's new one -- _assert_accrual_schedule_yields "
    + "raises BEFORE _accrual_plan_core ever reaches _assert_plan_schedule");
  assert.notEqual(detail.reason, PLAN_REASON.scheduleYieldsNoOccurrence);
});

test("pw908.legitimate-plans — an open-ended schedule, and every bounded schedule that genuinely reaches a due date, of all three plan kinds, are ACCEPTED", async (t) => {
  if (unready(t)) return;
  const client = await freshWorkClient(ALICE(), "pw908ok");
  const ref = await instructionRef({ client, author: ALICE() });

  // OPEN-ENDED (this estate's own DEFAULT shape: `accounting-plans-fixtures.mjs`'s
  // `createAccountingPlan` defaults `effectiveTo` to null). `clara._plan_due_events` returns no
  // rows once its own `p_end` argument is null, so an unguarded arm would refuse EVERY
  // open-ended plan; this is the regression #908's own "prove no legitimate plan is refused"
  // instruction means most concretely.
  const open = await mk(client, ref, { dayRule: "day_of_month", dayOfMonth: 1, effectiveTo: null });
  assert.ok(open.plan_id, "an open-ended schedule is accepted");

  // BOUNDED, GENUINELY REACHABLE, one of each plan kind.
  const recurring = await mk(client, ref, {
    dayRule: "day_of_month", dayOfMonth: 15, effectiveTo: "2026-09-30",
  });
  assert.ok(recurring.plan_id, "a bounded recurring schedule that reaches a due date is accepted");

  const reversing = await mk(client, ref, {
    kind: PLAN_KIND.reversing, dayRule: "day_of_month", dayOfMonth: 15,
    reversalDayRule: "next_period_first_day", effectiveTo: "2026-09-30",
  });
  assert.ok(reversing.plan_id,
    "a reversing plan created DIRECTLY through the shared door (bypassing "
    + "create_accrual_adjustment) and genuinely reaching a due date is accepted -- the very "
    + "caller #908's issue names");

  const amortisation = await mk(client, ref, {
    kind: "amortisation_schedule", frequency: "monthly", dayRule: "last_day_of_month",
    dayOfMonth: null, effectiveTo: "2026-09-30",
  });
  assert.ok(amortisation.plan_id, "an amortisation schedule spanning whole months is accepted");
});

test("pw908.tail — outside-in re-proof of 0280's own tail: the new arm is present, the helper it calls is unmoved, and the posture is unmoved", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select p.prosrc as src, pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
            p.provolatile as vol, coalesce(p.proacl::text,'(null)') as acl,
            coalesce(array_to_string(p.proconfig,','),'<none>') as cfg
       from pg_proc p where p.oid = to_regprocedure($1)`,
    [FN]);
  assert.equal(r.rowCount, 1, "clara._assert_plan_schedule does not resolve");
  const row = r.rows[0];
  assert.match(row.src, /plan_schedule_yields_no_occurrence/, "the new arm's token is missing");
  assert.match(row.src, /clara\._accrual_schedule_yields\(/, "the new arm no longer calls the yield helper");
  assert.match(row.src, /p_effective_to is not null/, "the open-ended guard is missing");
  // Every arm 0223 wrote is STILL there -- this file ADDS, it does not rewrite.
  for (const token of ["amortisation_schedule", "last_day_of_month",
      "reversal_collides_with_next_occurrence", "invalid_schedule", "timezone_unsupported"]) {
    assert.ok(row.src.includes(token),
      `an existing arm's own token (${token}) is missing -- 0280 must ADD, not rewrite`);
  }
  assert.equal(row.owner, "clara_fn_owner");
  assert.equal(row.secdef, true);
  assert.equal(row.vol, "i", "clara._assert_plan_schedule must stay IMMUTABLE");
  assert.equal(row.cfg, "search_path=clara, pg_temp");
  assert.equal(row.acl, FN_ACL, "0280 must not grant EXECUTE to any application role");

  const y = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha, p.provolatile as vol
       from pg_proc p where p.oid = to_regprocedure($1)`, [YIELDS_FN]);
  assert.equal(y.rows[0].sha, YIELDS_SHA,
    "0280 must not touch clara._accrual_schedule_yields -- it only CALLS it");
  assert.equal(y.rows[0].vol, "i");
});
