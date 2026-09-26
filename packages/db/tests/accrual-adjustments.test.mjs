// #652 — AN EVIDENCED ACCRUAL, AND THE REVERSAL BOUND TO IT.
//
// The claims this battery exists to prove:
//
//   1. THE TERM IS STATED OR THE ACCRUAL IS REFUSED. Amount, both account legs, the business
//      purpose, the effective window, the service period, the method, the authority and the
//      instruction are all required BEFORE admission — never admitted hoping a Work question
//      completes the basis, because an admitted Work's basis is immutable
//      (`chatTurn.v19.tools.ts:37-41`). A silent term and a stated ZERO are refused by NAME, at the
//      control the preparer typed in.
//   2. CONFIGURATION IS ONE COMMIT AND IT POSTS NOTHING. Plan + revision + accrual record +
//      current-period occurrence + admitted Work land together or not at all; the ENTRY and its
//      committed receipt belong to the run's own later commit. A configuration receipt
//      (`clara.op_receipts`, 0004:46) is not an executed occurrence (`clara.operation_receipts`,
//      0178:411).
//   3. THE REVERSAL IS BOUND TO A POSTED ACCRUAL. 0193's orphan wall (`0193:1326-1360`) is the law
//      and this lane inherits it whole: before the accrual posts the reversal is refused
//      `reversal_before_primary` with a typed `primary_state`; after it posts the reversal is
//      admitted and NAMES the entry it undoes.
//   4. THE RUNTIME DOOR RESOLVES ITS ACTOR FROM AN ARGUMENT. `create_accrual_adjustment_for` is
//      invoked here on a REAL `clara_runtime` connection, which carries no human JWT — the cell
//      that would go red if that door nested a `_human_ctx` call.
//
// CONTRACT-BLIND against #652's own contract, frontier-gated on the `accrual_adjustments$` stem.
// EVERY assertion under test runs through a `humanQuery` persona (or the real `clara_runtime`
// role) at the least privilege that should succeed; `rootQuery` appears only for the corroborating
// half of an assertion whose subject was exercised through a door.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  gateAccruals, assertAccrualCohortPresent, buildWorkWorld, endPool, printLaneNotes,
  printSkipCount, opk, rootQuery, ROLES, roleQuery, basis,
  CLR, assertPair, assertRaises, deactivateMember, reactivateMember, setClientStatus,
  closeYearAround, claimWorkRun, settleWorkRun, mintClientObo, wakeRecordJournalEntry,
  workRow, receiptsForWork, instructionRef, occurrenceRows, occurrenceCount, occurrenceExtras,
  liveRevision, planRow, revisionRows, postPlanWork, wakeDuePlanOccurrences, requestPlanCatchUp,
  linesOf,
  createAccountingPlan, listPlanOccurrences, todayInPlanZone, shiftMonths,
  // #652's own surface
  accrual, accrualRows, accrualCount, opReceiptRows, freshAccrualClient,
  createAccrualAdjustment, createAccrualAdjustmentFor, listAccrualAdjustments,
  getAccrualAdjustment, servicePeriodLaneReady, filedDocumentWithTerm, servicePeriodAsHuman,
  ACCRUAL_REASON, ACCRUAL_METHODS, ACHART, ACCRUAL_TZ, PLAN_REASON, PLAN_KIND,
} from "./accrual-adjustments-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

let world = null;
let today = null;
before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
});
after(async () => {
  printLaneNotes("accrual-adjustments");
  printSkipCount("accrual-adjustments");
  await endPool();
});

const ALICE = () => world.users.alice;   // owner of firm A
const BOB = () => world.users.bob;       // bookkeeper of firm A — the least privilege that writes
const CAROL = () => world.users.carol;   // viewer of firm A
const DAVE = () => world.users.dave;     // owner of firm B
const FIRM_A = () => world.firms.A;

/** The scan's batch ceiling for this battery — far above the number of plans this package can
 *  leave active, so a sibling cell's plan can never push the plan under test out of one call. */
const SCAN_LIMIT = 100;

const monthStart = (day) => `${day.slice(0, 7)}-01`;

/** The month end `n` months back, as YYYY-MM-DD in the plan zone. */
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}

/**
 * THE WINDOW A CONFIGURATION RUNS OVER, AND THE STATED TERM THAT BRACKETS IT (0222's SIXTH
 * MEASUREMENT): `effective_from >= service_period_start` and `effective_to <= service_period_end`,
 * so every occurrence posts a date INSIDE the term its own line names.
 *
 * `monthsBack` months, ENDING at the month end `monthsBack - 1` months ago — which also puts the
 * latest due date of the window in the past on EVERY calendar day, month end included. That is why
 * the reversal, locked-period and entrance-independence cells below no longer carry a month-end
 * skip: "an accrual admitted, its reversal outstanding" now exists every day of the month
 * (review round 1, A5).
 */
async function span(monthsBack = 2) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

/** The canonical particulars for a span: the STATED TERM is the window this configuration runs
 *  over. A cell that cares about something else does not have to restate the term law. */
function termed({ from, to }, over = {}) {
  return accrual({ servicePeriodStart: from, servicePeriodEnd: to, ...over });
}

/** A complete, valid accrual configuration on a FRESH client of firm A, through the HUMAN door as
 *  the least-privileged persona that should succeed (a bookkeeper). `over` carries the ONE
 *  particular a cell wants to change; the term always brackets the window. */
async function configure({
  sub = BOB(), tag = "p652", client = null, monthsBack = 2, over = {},
  purpose = "Monthly office rent accrual", frequency = "monthly",
  dayRule = "last_day_of_month", dayOfMonth = null, effectiveFrom = null, effectiveTo = null,
  opKey = null,
} = {}) {
  const cli = client ?? (await freshAccrualClient(ALICE(), tag));
  const ref = await instructionRef({ client: cli, author: sub });
  // MEASURED AFTER THE AUTHORITY INSTRUCTION IS MINTED. `instructionRef` admits a real
  // `clara.accounting_work` row (a plan cites an instruction this database holds, 0193:1510-1512),
  // so "this configuration admitted ONE Work" is counted against that baseline rather than zero.
  const workBefore = await workCount(cli);
  const s = await span(monthsBack);
  const from = effectiveFrom ?? s.from;
  const to = effectiveTo ?? s.to;
  const particulars = termed({ from, to }, over);
  const answer = await createAccrualAdjustment(sub, {
    client: cli, purpose, authorityRef: ref, accrual: particulars,
    frequency, dayRule, dayOfMonth, timezone: ACCRUAL_TZ,
    effectiveFrom: from, effectiveTo: to, opKey,
  });
  return {
    ...answer, client: cli, author: sub, effectiveFrom: from, effectiveTo: to, particulars,
    ref, workBefore,
  };
}

/** Every relation one configuration writes, counted for ONE client. The atomicity cells assert on
 *  this whole vector rather than on any single table. */
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

/** The instruction Work `instructionRef` mints is itself a `clara.accounting_work` row, so the
 *  "nothing was admitted" assertion counts Work ABOVE that baseline rather than against zero. */
async function workCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1", [client]);
  return r.rows[0].n;
}

// ===========================================================================================
// p652.basis.required — EVERY PARTICULAR THE BOOKS NEED, BEFORE ADMISSION.
// ===========================================================================================

test("p652.basis.required — amount, both account legs, purpose, effective window, authority and instruction are each refused BY NAME when omitted, and nothing at all is written", async (t) => {
  if (await assertAccrualCohortPresent(t)) return;
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "required");
  const ref = await instructionRef({ client, author: BOB() });
  const { from, to } = await span(1);
  const before = await footprint(client);

  const call = (over = {}, a = {}) => createAccrualAdjustment(BOB(), {
    client, purpose: "Monthly office rent accrual", authorityRef: ref,
    accrual: termed({ from, to }, a), frequency: "monthly", dayRule: "last_day_of_month",
    dayOfMonth: null, timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, ...over,
  });

  // THE AMOUNT. Absent is a SHAPE refusal; a stated zero is its own TERM refusal (p652.basis.zero).
  const missingAmount = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidAccrual,
    () => call({}, { omit: ["amount_cents"] }), "an accrual with no stated amount");
  assert.equal(missingAmount.detail.field, "accrual.amount_cents",
    "the refusal names the control the preparer typed in, not 'lines'");

  // BOTH LEGS. An accrual moves an expense against a liability; neither side is derivable.
  for (const [key, field] of [
    ["expense_account_code", "accrual.expense_account_code"],
    ["liability_account_code", "accrual.liability_account_code"],
  ]) {
    const e = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidAccrual,
      () => call({}, { omit: [key] }), `an accrual with no ${key}`);
    assert.equal(e.detail.field, field);
  }

  // THE BUSINESS PURPOSE — what this accrual is FOR, in the firm's own words.
  const purpose = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidPurpose,
    () => call({ purpose: "   " }), "an accrual with a blank purpose");
  assert.equal(purpose.detail.constraint, "nonempty");

  // THE EFFECTIVE WINDOW — the date this accrual's authority starts.
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => call({ effectiveFrom: null }), "an accrual with no effective_from");

  // THE AUTHORITY — a row this database holds, never a sentence.
  await assertPair(CLR.badRequest, ACCRUAL_REASON.authorityRefUnresolved,
    () => call({ authorityRef: { kind: "accounting_work", id: randomUUID() } }),
    "an accrual citing an instruction that does not exist");
  await assertPair(CLR.badRequest, ACCRUAL_REASON.authorityRefInvalid,
    () => call({ authorityRef: { kind: "knowledge_preference", id: randomUUID() } }),
    "a Knowledge preference offered as plan authority");

  // THE INSTRUCTION — where the instruction that authorises this accrual is recorded.
  const instruction = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidAccrual,
    () => call({}, { instruction: "  " }), "an accrual with no instruction");
  assert.equal(instruction.detail.field, "accrual.instruction");

  // AND THE METHOD, which is a CLOSED selection-rule set.
  const method = await assertPair(CLR.badRequest, ACCRUAL_REASON.methodUnsupported,
    () => call({}, { method: { rule: "straight_line_over_term" } }),
    "a method outside the closed selection-rule set");
  assert.deepEqual(method.detail.supported, ACCRUAL_METHODS,
    "and the refusal lists the rules that ARE supported, so the form can offer them");

  assert.deepEqual(await footprint(client), before,
    "not one of the five relations moved: a refusal before admission writes nothing");
});

// ===========================================================================================
// p652.basis.silent_term — C55.13 / C83.7: DO NOT FABRICATE A TERM.
// ===========================================================================================

test("p652.basis.silent_term — an absent service period and a term whose source is not human_stated are both refused CLR10 silent_term; a model-derived period never enters the durable record", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "silentterm");
  const ref = await instructionRef({ client, author: BOB() });
  const from = monthStart(await shiftMonths(today, -1));
  const before = await footprint(client);

  const call = (a) => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: accrual(a), effectiveFrom: from,
  });

  for (const key of ["service_period_start", "service_period_end"]) {
    const e = await assertPair(CLR.badRequest, ACCRUAL_REASON.silentTerm,
      () => call({ omit: [key] }), `an accrual whose ${key} is silent`);
    assert.equal(e.detail.field, `accrual.${key}`,
      "the refusal names the missing term, never a generic 'invalid basis'");
  }

  // AN END BEFORE ITS START is not a term at all.
  await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidAccrual,
    () => call({ servicePeriodStart: "2026-07-31", servicePeriodEnd: "2026-07-01" }),
    "a service period that ends before it starts");

  // THE SOURCE OF THE TERM IS CLOSED TO ONE MEMBER. 0140's table comment is the law and it is
  // CONFIRMED AS LAW: "a model-derived period is NOT an anchored fact and hard constraint 2
  // forbids it entering a durable artifact". `extracted` is a declared SHAPE on that carrier with
  // no writer; on THIS lane it is not even a shape.
  for (const source of ["extracted", "inferred", "clara_interpreted", ""]) {
    const e = await assertPair(CLR.badRequest, ACCRUAL_REASON.silentTerm,
      () => call({ termSource: source }), `a term sourced ${JSON.stringify(source)}`);
    assert.equal(e.detail.field, "accrual.term_source");
  }

  assert.deepEqual(await footprint(client), before, "and nothing was written for any of them");
});

// ===========================================================================================
// p652.basis.zero — C08.2: A ZERO-VALUE PROPOSAL IS NOT MEANINGFUL MERELY BECAUSE IT BALANCES.
//
// TWO HALVES, AND THEY ARE DIFFERENT CLAIMS.
//
//  (a) THE ACCRUAL LANE'S OWN: a STATED accrual amount of zero is a TERM refusal
//      (`accrual_zero_amount` against `accrual.amount_cents`), not merely an unbalanced basis.
//      #643's header states the reason in full for its own lane and it holds here identically:
//      the lines are DERIVED from the particulars, so a degenerate particular produces degenerate
//      lines, and answering `lines[1] exactly_one_side` is true of the derived lines and useless
//      to the preparer.
//
//  (b) THE OWNER OF THE GENERIC RULE, MEASURED RATHER THAN ASSUMED. The gap map records
//      `clara._assert_journal_basis`'s `nonzero_total` arm (0178:785-787) as untested. It is
//      untested because IT IS UNREACHABLE: `clara._journal_cents` (0178:672) refuses a negative,
//      and the per-line `exactly_one_side` arm (0178:770-774) refuses a line whose two sides are
//      both zero — so two or more lines each carrying exactly one POSITIVE side can never sum to
//      zero, and a shape that would has already been refused. This cell asserts the LIVE answer
//      and names the finding rather than editing the expectation quietly. Follow-up: retire the
//      dead arm or give it a reachable caller (reported in #652's final report).
// ===========================================================================================

test("p652.basis.zero — a stated accrual amount of zero is refused as a TERM problem at the control the preparer typed in, and the generic all-zero proposal is refused by _assert_journal_basis's own live arm", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "zero");
  const ref = await instructionRef({ client, author: BOB() });
  const from = monthStart(await shiftMonths(today, -1));
  const before = await footprint(client);

  // (a) THE ACCRUAL LANE.
  const zero = await assertPair(CLR.badRequest, ACCRUAL_REASON.zeroAmount,
    () => createAccrualAdjustment(BOB(), {
      client, authorityRef: ref, accrual: accrual({ cents: 0 }), effectiveFrom: from,
    }), "an accrual that accrues nothing");
  assert.equal(zero.detail.field, "accrual.amount_cents",
    "the refusal names the amount the preparer typed, not a derived line");
  const negative = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidAccrual,
    () => createAccrualAdjustment(BOB(), {
      client, authorityRef: ref, accrual: accrual({ cents: -1 }), effectiveFrom: from,
    }), "a negative accrual");
  assert.equal(negative.detail.field, "accrual.amount_cents");

  // (b) THE GENERIC OWNER, through a HUMAN door that reaches it (`clara.create_accounting_plan`
  //     calls `clara._assert_journal_basis` at 0193:1521).
  const allZero = basis({
    postingDate: from, memo: "an all-zero proposal",
    lines: [
      { account_code: ACHART.expense, debit_cents: 0, credit_cents: 0, description: "nothing" },
      { account_code: ACHART.liability, debit_cents: 0, credit_cents: 0, description: "nothing" },
    ],
  });
  const generic = await assertPair(CLR.badRequest, ACCRUAL_REASON.invalidBasis,
    () => createAccountingPlan(BOB(), {
      client, kind: PLAN_KIND.recurring, authorityRef: ref, effectiveFrom: from, basis: allZero,
    }), "a balanced all-zero journal proposal");
  assert.equal(generic.detail.constraint, "exactly_one_side",
    "MEASURED: the live owner refuses an all-zero proposal per LINE. `nonzero_total` (0178:785-787) "
    + "sits behind this arm and behind the non-negative cents parser, and is therefore unreachable "
    + "— recorded as a finding in #652's report, not edited away here");
  assert.equal(generic.detail.field, "lines[1]");

  assert.deepEqual(await footprint(client), before, "and none of the four wrote anything");
});

// ===========================================================================================
// p652.config.atomic — ONE COMMIT, OR NONE OF THE FIVE.
// ===========================================================================================

test("p652.config.atomic — one accepted configuration leaves exactly one plan, one revision, one accrual, one occurrence and one admitted Work; a fault after the plan insert leaves none of the five", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "atomic");

  const c = await configure({ client, tag: "atomic" });
  const after = await footprint(client);
  assert.equal(after.plans, 1, "one plan");
  assert.equal(after.revisions, 1, "one revision");
  assert.equal(after.accruals, 1, "one accrual record");
  assert.equal(after.occurrences, 1, "one occurrence — the current period's accrual leg");
  assert.equal(after.work, c.workBefore + 1, "one admitted Work above the authority instruction's own");
  assert.equal(c.kind, PLAN_KIND.reversing,
    "an accrual rides the DELIVERED reversing_journal contract — it mints no new plan kind");
  assert.ok(c.accrual_id && c.plan_id && c.revision_id, "and the answer names all three rows");
  assert.equal(c.occurrence?.admitted, true, "the current period's occurrence was admitted");
  assert.equal(c.occurrence?.leg, "primary", "…as the ACCRUAL leg, never a reversal");

  // THE FAULT. An AFTER INSERT trigger on the accrual relation, installed for this cell only, so
  // the failure lands AFTER the plan and revision inserts and BEFORE the door returns. Fault
  // injection, stated as such — the estate's own `CLARA_WORK_TEST_FAULT` idiom, at SQL grain.
  const victim = await freshAccrualClient(ALICE(), "atomicfault");
  const victimRef = await instructionRef({ client: victim, author: BOB() });
  // SNAPSHOT AFTER the authority instruction, which is a real Work this configuration did not
  // create and must not be asked to roll back.
  const victimBase = await footprint(victim);
  const victimSpan = await span(2);
  await rootQuery(`create function clara._p652_fault() returns trigger
      language plpgsql as $f$ begin
        raise exception 'p652 injected fault after the accrual insert' using errcode='CLR13',
          detail='{"reason":"p652_injected_fault"}';
      end $f$`);
  await rootQuery(`create trigger t_p652_fault after insert on clara.accrual_adjustments
      for each row execute function clara._p652_fault()`);
  try {
    await assertPair(CLR.conflict, "p652_injected_fault",
      () => createAccrualAdjustment(BOB(), {
        client: victim, authorityRef: victimRef, accrual: termed(victimSpan),
        effectiveFrom: victimSpan.from, effectiveTo: victimSpan.to,
      }), "a configuration that faults after the plan insert");
  } finally {
    await rootQuery("drop trigger t_p652_fault on clara.accrual_adjustments");
    await rootQuery("drop function clara._p652_fault()");
  }
  assert.deepEqual(await footprint(victim), victimBase,
    "the plan, the revision, the accrual, the occurrence and the Work all rolled back together — "
    + "a half-configured accrual is not a state this lane can reach");
});

// ===========================================================================================
// p652.config.vs.occurrence — A CONFIGURATION RECEIPT IS NOT AN EXECUTED OCCURRENCE.
// ===========================================================================================

test("p652.config.vs.occurrence — accepting a configuration answers posted:false with its clara.op_receipts key and ZERO committed clara.operation_receipts; the entry and its receipt arrive in the run's own later commit", async (t) => {
  if (await gateAccruals(t)) return;
  const c = await configure({ tag: "vsocc", opKey: opk("p652-vsocc") });
  assert.equal(c.posted, false, "configuration posts nothing");
  assert.equal(c.configuration_receipt?.fn, "create_accrual_adjustment",
    "and the answer names the CONFIGURATION receipt it wrote (clara.op_receipts, 0004:46)");
  assert.ok(c.configuration_receipt?.op_key, "…by its own idempotency key");

  const work = c.occurrence?.work_id;
  assert.ok(work, "the current period's occurrence admitted a Work");
  assert.deepEqual(await receiptsForWork(work), [],
    "…and nothing has committed an EXECUTION receipt (clara.operation_receipts, 0178:411) for it");

  const beforePost = await getAccrualAdjustment(BOB(), c.accrual_id);
  assert.equal(beforePost.posted, false, "the read says the same thing");
  assert.equal(beforePost.occurrences[0].entry_id, null, "no entry yet");
  assert.equal(beforePost.occurrences[0].receipt_id, null, "no committed receipt yet");

  // THE RUN'S OWN COMMIT.
  const entry = await postPlanWork({ work, client: c.client, author: c.author, firm: FIRM_A() });
  const afterPost = await getAccrualAdjustment(BOB(), c.accrual_id);
  assert.equal(afterPost.posted, true, "…and only now is this accrual posted");
  assert.equal(afterPost.occurrences[0].entry_id, entry, "the read joins through to the entry");
  assert.ok(afterPost.occurrences[0].receipt_id, "…and to the COMMITTED receipt that produced it");
  const committed = await receiptsForWork(work);
  assert.equal(committed.filter((r) => r.outcome === "committed").length, 1,
    "exactly one committed receipt for one logical operation identity");
});

// ===========================================================================================
// p652.authority.future — A FUTURE INSTRUCTION DOES NOT AUTHORISE HISTORY.
// ===========================================================================================

test("p652.authority.future — an accrual whose authority starts in the future creates the plan and admits NOTHING; the answer is a preview, and a catch-up cannot reach back past the authority", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "future");
  // A WINDOW WHOLLY AHEAD OF TODAY, and the term that brackets it: two months out to the month end
  // four months out, so three due dates are previewed and none has arrived.
  const from = monthStart(await shiftMonths(today, 2));
  const to = await monthEndBack(-4);
  const c = await configure({ client, tag: "future", effectiveFrom: from, effectiveTo: to });

  assert.equal(c.occurrence, null, "no due event has arrived, so none was admitted");
  const f = await footprint(client);
  assert.equal(f.plans, 1, "the plan exists");
  assert.equal(f.accruals, 1, "the accrual record exists");
  assert.equal(f.occurrences, 0, "and there is no occurrence at all");
  assert.equal(f.work, c.workBefore, "…and no Work above the authority instruction's own");
  assert.ok(c.next_occurrences.length > 0, "the answer previews what WILL be due");
  assert.ok(c.next_occurrences.every((e) => e.due_date > today),
    `every previewed due date is in the future (got ${JSON.stringify(c.next_occurrences)})`);

  // THE SCAN AGREES.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(c.plan_id), 0, "a scan admits nothing that is not yet due");

  // AND A CATCH-UP MAY NOT REACH BACK PAST THE AUTHORITY the configuration set.
  const tooFarBack = monthStart(await shiftMonths(today, -6));
  await assertPair(CLR.badRequest, ACCRUAL_REASON.catchUpBeforeAuthority,
    () => requestPlanCatchUp(BOB(), { plan: c.plan_id, from: tooFarBack, to: today }),
    "a catch-up window that starts before this accrual's authority");
});

// ===========================================================================================
// p652.reversal.binds — THE ORPHAN WALL, AND THE BINDING THAT FOLLOWS IT.
// ===========================================================================================

test("p652.reversal.binds — a reversal with no POSTED accrual behind it is refused reversal_before_primary with a typed primary_state; once the accrual posts, the same due event is admitted and NAMES the entry it undoes", async (t) => {
  if (await gateAccruals(t)) return;
  // NO MONTH-END SKIP. The window ENDS at last month's month end (see `span`), so the latest due
  // date is in the past on every calendar day and this scenario exists every day (review round 1,
  // A5 — "a skipped battery is not evidence").
  const c = await configure({ tag: "revbinds", monthsBack: 2, purpose: "Monthly audit fee accrual" });
  const accrualDue = await monthEndBack(1);
  assert.equal(c.occurrence?.due_date, accrualDue,
    "the configuration admitted LAST month's accrual — the latest due event at or before today");
  const reversalDue = monthStart(today);

  // THE WALL. A human catch-up naming ONLY the reversal day, while the accrual is merely ADMITTED.
  const blocked = await requestPlanCatchUp(BOB(), { plan: c.plan_id, from: reversalDue, to: reversalDue });
  assert.equal(blocked.admitted, 0, "nothing is admitted");
  const refused = blocked.events.find((e) => e.reason === "reversal_before_primary");
  assert.ok(refused, `the reversal is refused by name (got ${JSON.stringify(blocked.events)})`);
  assert.equal(refused.primary_state, "not_posted",
    "…and the refusal says WHICH of the three ways the accrual fails to stand behind it");
  assert.equal(refused.primary_due_date, accrualDue);
  assert.equal(await accrualCount(c.client), 1, "and no second accrual record was minted");

  // THE ACCRUAL POSTS.
  const entry = await postPlanWork({
    work: c.occurrence.work_id, client: c.client, author: c.author, firm: FIRM_A(),
  });

  // THE SAME DUE EVENT IS NOW ADMISSIBLE, through the SAME explicitly scoped door.
  const opened = await requestPlanCatchUp(BOB(), { plan: c.plan_id, from: reversalDue, to: reversalDue });
  assert.equal(opened.admitted, 1, "the reversal is admitted once its accrual is on the books");
  const extras = await occurrenceExtras(c.plan_id);
  const reversal = extras.find((x) => x.leg === "reversal");
  assert.ok(reversal, "the reversal occurrence exists");
  assert.equal(reversal.reverses_entry_id, entry,
    "and it NAMES the entry it undoes — 0193:652's column, structurally enforced");
  assert.equal(extras.find((x) => x.leg === "primary").reverses_entry_id, null,
    "an accrual leg reverses nothing and names nothing");

  const w = await workRow(reversal.work_id);
  assert.ok(w.basis.memo.includes(entry), "the basis the reversal posts under names that entry too");
  const original = (await liveRevision(c.plan_id)).basis.lines;
  for (let i = 0; i < original.length; i++) {
    assert.equal(w.basis.lines[i].debit_cents, original[i].credit_cents, `line ${i}: sides exchanged`);
    assert.equal(w.basis.lines[i].credit_cents, original[i].debit_cents, `line ${i}: sides exchanged`);
  }

  // AND THE ACCRUAL'S OWN READ SHOWS BOTH LEGS.
  const read = await getAccrualAdjustment(BOB(), c.accrual_id);
  assert.equal(read.occurrences.length, 2, "the accrual read carries both legs");
  assert.equal(read.reversal?.reverses_entry_id, entry,
    "…and names the reversal's bound entry at the top level, where a surface can render it");
});

// ===========================================================================================
// p652.catchup.locked — AN EXPLICIT SCOPE, AND A LOCKED PERIOD THAT STAYS REFUSED.
// ===========================================================================================

test("p652.catchup.locked — a catch-up window before the authority is refused by name; an occurrence whose period is sealed settles refused CLR19 and the scan does not re-admit it", async (t) => {
  if (await gateAccruals(t)) return;
  const c = await configure({ tag: "locked", monthsBack: 2 });
  const due = c.occurrence.due_date;

  const beforeAuthority = monthStart(await shiftMonths(today, -9));
  await assertPair(CLR.badRequest, ACCRUAL_REASON.catchUpBeforeAuthority,
    () => requestPlanCatchUp(BOB(), { plan: c.plan_id, from: beforeAuthority, to: today }),
    "a catch-up reaching back past this accrual's own authority");

  // SEAL THE PERIOD the admitted accrual belongs to, then let the run try to post it.
  await closeYearAround(FIRM_A(), c.client, due, ALICE());
  const w = await workRow(c.occurrence.work_id);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p652-locked") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: c.author, client: c.client });
  await assertRaises(CLR.period, () => wakeRecordJournalEntry(obo.secret, {
    client: c.client, work: c.occurrence.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  }), "posting an accrual into a sealed period");
  await settleWorkRun({
    task: w.current_task_id, outcome: "failed",
    error: { reason: "write_into_closed_period", message: "the period is closed" },
  });

  const before = await occurrenceCount(c.plan_id);
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(c.plan_id), before,
    "the scan does not re-admit a due event that already has an occurrence — re-attempting a "
    + "sealed period is a human's explicitly scoped catch-up, not the next scan's business");
  assert.deepEqual((await receiptsForWork(c.occurrence.work_id)).filter((r) => r.outcome === "committed"), [],
    "and nothing committed into the sealed period");
});

// ===========================================================================================
// p652.role.floor — THE FLOORS, AND NO EXISTENCE ORACLE.
// ===========================================================================================

test("p652.role.floor — a viewer cannot configure an accrual but reads them; a cross-firm accrual id and an invented uuid answer identically", async (t) => {
  if (await gateAccruals(t)) return;
  const c = await configure({ tag: "floor" });

  await assertPair(CLR.authz, ACCRUAL_REASON.insufficientRole,
    () => createAccrualAdjustment(CAROL(), {
      client: c.client, authorityRef: c.ref, accrual: c.particulars,
      effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo,
    }), "a viewer configuring an accrual");

  const listed = await listAccrualAdjustments(CAROL(), { client: c.client });
  assert.equal(listed.accruals.length, 1, "…but a viewer READS this client's accruals");
  assert.equal(listed.accruals[0].accrual_id, c.accrual_id);
  const got = await getAccrualAdjustment(CAROL(), c.accrual_id);
  assert.equal(got.accrual_id, c.accrual_id, "…and one accrual's own detail");

  // NO EXISTENCE ORACLE ACROSS FIRMS. Dave owns firm B; alice's accrual is not his to discover,
  // and the answer is the same one an id naming nothing gets.
  const foreign = await assertRaises(CLR.notFound,
    () => getAccrualAdjustment(DAVE(), c.accrual_id), "another firm's accrual");
  const invented = await assertRaises(CLR.notFound,
    () => getAccrualAdjustment(DAVE(), randomUUID()), "an invented accrual id");
  assert.equal(foreign.message, invented.message,
    "the two answers are byte-identical: a firm cannot enumerate another firm's accruals");

  // AND AN INACTIVE CLIENT TAKES NO NEW ACCRUAL.
  const parked = await freshAccrualClient(ALICE(), "floorparked");
  const ref = await instructionRef({ client: parked, author: BOB() });
  // `archived`, not `inactive`: clients_status_check_0017 admits active/archived/onboarding, and
  // the door's own wall is `status <> 'active'`.
  await setClientStatus(parked, "archived");
  const parkedSpan = await span(1);
  await assertPair(CLR.badRequest, ACCRUAL_REASON.clientInactive,
    () => createAccrualAdjustment(BOB(), {
      client: parked, authorityRef: ref, accrual: termed(parkedSpan),
      effectiveFrom: parkedSpan.from, effectiveTo: parkedSpan.to,
    }), "an accrual on an inactive client");
});

// ===========================================================================================
// p652.accounts.roles — THE TWO LEGS PLAY THE ROLES THE PARTICULARS SAY THEY DO.
// ===========================================================================================

test("p652.accounts.roles — the expense leg must be an expense account and the liability leg a non-control liability; an inactive account and an unknown code answer identically", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "roles");
  const ref = await instructionRef({ client, author: BOB() });
  const w = await span(1);
  const call = (a) => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: termed(w, a),
    effectiveFrom: w.from, effectiveTo: w.to,
  });

  const asset = await assertPair(CLR.badRequest, ACCRUAL_REASON.accountRelationship,
    () => call({ liabilityAccount: ACHART.bank }), "accruing into a bank asset");
  assert.equal(asset.detail.field, "accrual.liability_account_code");
  assert.equal(asset.detail.account_code, ACHART.bank);

  const control = await assertPair(CLR.badRequest, ACCRUAL_REASON.accountRelationship,
    () => call({ liabilityAccount: ACHART.payableControl }), "accruing into a payable CONTROL account");
  assert.equal(control.detail.constraint, "non_control_liability",
    "a control account reconciles to identified detail; an accrual carries none");

  await assertPair(CLR.badRequest, ACCRUAL_REASON.accountRelationship,
    () => call({ expenseAccount: ACHART.liability }), "an expense leg that is a liability");

  const retired = await assertPair(CLR.badRequest, ACCRUAL_REASON.accountRelationship,
    () => call({ expenseAccount: ACHART.retired }), "an expense leg that was retired");
  const unknown = await assertPair(CLR.badRequest, ACCRUAL_REASON.accountRelationship,
    () => call({ expenseAccount: "99999999" }), "an expense leg that never existed");
  assert.equal(retired.detail.constraint, unknown.detail.constraint,
    "absent and inactive answer identically: neither is a postable account, and telling them "
    + "apart would say whether a code the caller guessed once existed");
});

// ===========================================================================================
// p652.lineage.join — THE WHOLE CHAIN, AND THE TENANT THE FK CARRIES.
// ===========================================================================================

test("p652.lineage.join — get_accrual_adjustment returns plan → revision → occurrence → Work → committed receipt → entry with exact cents and ISO dates, and a revision belonging to ANOTHER client of the same firm is refused by the composite FK rather than by RLS", async (t) => {
  if (await gateAccruals(t)) return;
  const c = await configure({ tag: "lineage", over: { cents: 98765 } });
  const entry = await postPlanWork({
    work: c.occurrence.work_id, client: c.client, author: c.author, firm: FIRM_A(),
  });

  const got = await getAccrualAdjustment(BOB(), c.accrual_id);
  assert.equal(got.amount_cents, 98765, "exact minor units, never a float");
  assert.equal(got.currency, "MYR");
  assert.equal(got.service_period_start, c.effectiveFrom, "ISO dates, not a locale rendering");
  assert.equal(got.service_period_end, c.effectiveTo,
    "…and the stated term is the one the schedule runs inside (0222's SIXTH MEASUREMENT)");
  assert.match(got.service_period_start, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(got.term_source, "human_stated");
  assert.deepEqual(got.method, { rule: "stated_amount" });
  assert.equal(got.plan.plan_id, c.plan_id, "the plan it rides");
  assert.equal(got.plan.kind, PLAN_KIND.reversing);
  assert.equal(got.revision, 1, "…at the revision this accrual was configured under");
  const occ = got.occurrences.find((o) => o.leg === "primary");
  assert.equal(occ.work_id, c.occurrence.work_id, "the occurrence names its Work");
  assert.equal(occ.entry_id, entry, "…and joins through the COMMITTED receipt to the entry");
  assert.ok(occ.receipt_id);
  assert.equal(occ.work_status, "completed");

  // THE LIST CARRIES THE SAME FACTS, WINDOWED.
  const inWindow = await listAccrualAdjustments(BOB(), {
    client: c.client, from: c.effectiveFrom, to: today,
  });
  assert.equal(inWindow.accruals.length, 1);
  assert.equal(inWindow.accruals[0].posted, true);
  const outOfWindow = await listAccrualAdjustments(BOB(), {
    client: c.client, from: await shiftMonths(today, 6), to: await shiftMonths(today, 12),
  });
  assert.equal(outOfWindow.accruals.length, 0, "a window that excludes it returns no rows, honestly");

  // THE TENANT IS STRUCTURAL. FORCE RLS does not stop a DEFINER insert writing another client's
  // plan id under this firm; `fk_accrual_adjustments_plan_revision` does — and the proof is the
  // constraint NAME in the error, not merely that something refused.
  // A PLAIN plan on ANOTHER client of the SAME firm — deliberately not another accrual, because
  // `uq_accrual_adjustments_plan_revision` would fire first and prove the wrong wall.
  const otherClient = await freshAccrualClient(ALICE(), "lineageother");
  const otherRef = await instructionRef({ client: otherClient, author: BOB() });
  const other = await createAccountingPlan(BOB(), {
    client: otherClient, kind: PLAN_KIND.reversing, authorityRef: otherRef,
    dayRule: "last_day_of_month", dayOfMonth: null, reversalDayRule: "next_period_first_day",
    effectiveFrom: c.effectiveFrom,
    basis: basis({ postingDate: c.effectiveFrom, memo: "another client's schedule" }),
  });
  const e = await assertRaises("23503", () => rootQuery(
    `insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
        expense_account_code, liability_account_code, amount_cents, currency, effective_from,
        effective_to, service_period_start, service_period_end, term_source, method, authority_kind,
        authority_ref, instruction, recorded_by)
      values ($1,$2,$3,1,'cross-client smuggle',$4,$5,100,'MYR',$6,$9,$8,$9,
        'human_stated','{"rule":"stated_amount"}'::jsonb,'explicit_instruction','{}'::jsonb,
        'smuggled',$7)`,
    [FIRM_A(), c.client, other.plan_id, ACHART.expense, ACHART.liability, c.effectiveFrom, ALICE(),
     c.effectiveFrom, c.effectiveTo]),
    "an accrual naming another client's plan revision under the same firm");
  assert.match(e.message, /fk_accrual_adjustments_plan_revision/,
    `the composite FK is the wall, by name (got ${e.message})`);
});

// ===========================================================================================
// p652.acl.grants — THE BOUNDARY, READ OFF THE LIVE CATALOG.
// ===========================================================================================

test("p652.acl.grants — the accrual relation is RLS-forced with no application grant, the three human doors are clara_authenticated only, and clara_runtime holds the _for overload and nothing else", async (t) => {
  if (await gateAccruals(t)) return;
  const rel = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity, c.relacl is not null as has_acl
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='accrual_adjustments'`);
  assert.equal(rel.rows[0].relrowsecurity, true, "RLS on");
  assert.equal(rel.rows[0].relforcerowsecurity, true, "…and FORCED, so even the owner obeys it");
  assert.equal(rel.rows[0].has_acl, false,
    "no application role holds ANY grant: every reach is through a definer door, the 0193:408 shape");

  const probe = async (sig, role) => {
    const r = await rootQuery("select has_function_privilege($1, $2::regprocedure, 'execute') as ok",
      [role, sig]);
    return r.rows[0].ok;
  };
  const HUMAN = "clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)";
  const FOR = "clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)";
  // #1075 (0334) widened this door to a fourth argument (p_side, server-side) and #1152 (0365)
  // widened it again to a sixth (p_cursor, p_limit) — each widen drops the signature it replaces
  // (0334's and 0365's own tails each prove the prior signature does not survive as a resolvable
  // overload) — but THIS battery is gated on 0222 alone (gateAccruals), and the `db-slice-
  // frontiers` matrix runs it against earlier frontiers where neither has applied, so the probed
  // signature is picked off the LIVE catalog rather than hardcoded either way (the
  // `list_accounting_work`/0267 idiom, firm-portfolio-pack.test.mjs's own `workListWidened`).
  const sideFilterLive = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    ["accrual_list_side_filter$"])).rows[0].n > 0;
  const paginationLive = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    ["accrual_register_pagination$"])).rows[0].n > 0;
  const LIST = paginationLive
    ? "clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)"
    : sideFilterLive
      ? "clara.list_accrual_adjustments(uuid,date,date,text)"
      : "clara.list_accrual_adjustments(uuid,date,date)";
  const GET = "clara.get_accrual_adjustment(uuid)";

  for (const sig of [HUMAN, LIST, GET]) {
    assert.equal(await probe(sig, "clara_authenticated"), true, `${sig} is a human door`);
    assert.equal(await probe(sig, "clara_runtime"), false, `${sig} is NOT reachable from the run`);
  }
  assert.equal(await probe(FOR, "clara_runtime"), true, "the OBO door is the run's own");
  assert.equal(await probe(FOR, "clara_authenticated"), false,
    "…and is NOT reachable from the browser lane: a human has their own door, with their own JWT");

  // The DML the relation itself does not hold, asserted as a real attempt by a real role.
  await assertRaises("42501", () => roleQuery(ROLES.authenticated,
    "select count(*) from clara.accrual_adjustments"),
    "a direct table read by the browser lane");
  await assertRaises("42501", () => roleQuery(ROLES.runtime,
    "insert into clara.accrual_adjustments(id) values (gen_random_uuid())"),
    "a direct table write by the run");
});

// ===========================================================================================
// p652.plan.occurrence.typed — ENTRANCE INDEPENDENCE.
// ===========================================================================================

test("p652.plan.occurrence.typed — an occurrence admitted by the RUNTIME SCAN resolves to the same typed accrual particulars as the one the configuration door admitted, by plan+revision join", async (t) => {
  if (await gateAccruals(t)) return;
  const c = await configure({ tag: "typed", monthsBack: 2, over: { cents: 54321 } });
  const entry = await postPlanWork({
    work: c.occurrence.work_id, client: c.client, author: c.author, firm: FIRM_A(),
  });

  // THE SCAN'S OWN ADMISSION — the reversal leg, admitted by `clara.wake_due_plan_occurrences` on
  // the runtime role, with no human in the loop.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const rows = await occurrenceRows(c.plan_id);
  const scanned = rows.find((o) => o.leg === "reversal");
  assert.ok(scanned, `the scan admitted the reversal (got ${JSON.stringify(rows.map((x) => [x.due_date, x.leg]))})`);
  assert.ok(scanned.work_id, "…as a real admitted Work");

  // AND IT CARRIES THE SAME PARTICULARS. This is the entrance-independence claim: whether a due
  // event was admitted by the configuration door or by the scan, the accrual particulars behind it
  // are ONE row, reached by (plan_id, revision) — not two durable records for one business fact.
  const got = await getAccrualAdjustment(BOB(), c.accrual_id);
  const ids = got.occurrences.map((o) => o.occurrence_id);
  assert.ok(ids.includes(scanned.id), "the scan-admitted occurrence is on the accrual's own read");
  assert.equal(got.amount_cents, 54321, "with the particulars the human stated, unchanged");
  assert.equal(got.reversal?.reverses_entry_id, entry);
  assert.equal(await accrualCount(c.client), 1,
    "ONE accrual record for this plan — a scan-admitted occurrence never mints a second");

  const listed = await listPlanOccurrences(BOB(), c.plan_id);
  assert.equal(listed.occurrences.length, got.occurrences.length,
    "and the plan lane's own read and the accrual read see the same due events");
});

// ===========================================================================================
// p652.plan.nested_op — THE NESTED RESERVATION, AND THE TWO PATHS THAT MUST NOT DRIFT.
// ===========================================================================================

test("p652.plan.nested_op — the configuration reserves its OWN key and the plan door reserves a derived one, two clara.op_receipts rows under distinct fn values; a replay of the outer key returns the stored result and creates no second plan", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "nested");
  const ref = await instructionRef({ client, author: BOB() });
  const w = await span(2);
  const key = opk("p652-nested");

  const first = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: termed(w),
    effectiveFrom: w.from, effectiveTo: w.to, opKey: key,
  });
  const receipts = await opReceiptRows(FIRM_A(), key);
  assert.deepEqual(receipts.map((r) => r.fn).sort(),
    ["create_accounting_plan", "create_accrual_adjustment"],
    "two reservations, on DISTINCT fn values of the same (firm, fn, op_key) triple (0004:46-52)");
  assert.ok(receipts.every((r) => r.finished), "both finished");

  // THE REPLAY. The same decision, re-sent — a lost response, not a second question.
  const replay = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, accrual: termed(w),
    effectiveFrom: w.from, effectiveTo: w.to, opKey: key,
  });
  assert.deepEqual(replay, first, "the stored result comes back byte-identically");
  const f = await footprint(client);
  assert.equal(f.plans, 1, "and there is exactly ONE plan");
  assert.equal(f.accruals, 1, "one accrual record");
  assert.equal(f.occurrences, 1, "one occurrence");

  // A DIFFERENT PAYLOAD UNDER THE SAME KEY IS A CONFLICT, never a silent replay — and it is a
  // TYPED one. `clara._reserve_op` (0004:46) raises its one CLR10 with NO detail at all, so a
  // surface could neither classify it nor say which control to look at; both doors re-raise it as
  // this lane's own `op_key_conflict` (review round 1, A3).
  const conflict = await assertPair(CLR.badRequest, "op_key_conflict",
    () => createAccrualAdjustment(BOB(), {
      client, authorityRef: ref, accrual: termed(w, { cents: 999 }),
      effectiveFrom: w.from, effectiveTo: w.to, opKey: key,
    }), "the same key carrying different figures");
  assert.equal(conflict.detail.field, "op_key",
    "…named at the identity that collided, not at the figure that changed");
  const stillOne = await footprint(client);
  assert.equal(stillOne.accruals, 1, "and the conflict wrote nothing");
});

test("p652.plan.equivalence — the plan the OBO door writes inline and the plan the human door writes through clara.create_accounting_plan are the same plan, field for field", async (t) => {
  if (await gateAccruals(t)) return;
  const humanSide = await configure({ tag: "equivhuman", monthsBack: 1 });
  const runtimeClient = await freshAccrualClient(ALICE(), "equivruntime");
  const runtimeRef = await instructionRef({ client: runtimeClient, author: BOB() });
  const runtimeSide = await createAccrualAdjustmentFor({
    client: runtimeClient, author: BOB(), authorityRef: runtimeRef, accrual: humanSide.particulars,
    effectiveFrom: humanSide.effectiveFrom, effectiveTo: humanSide.effectiveTo,
  });

  const shape = async (planId, clientId) => {
    const p = await planRow(planId);
    const r = await liveRevision(planId);
    return {
      kind: p.kind, status: p.status, purpose: p.purpose, authority_kind: p.authority_kind,
      authority_from: String(p.authority_from), current_revision: p.current_revision,
      authorised_by_is_author: p.authorised_by === BOB(), created_by_is_author: p.created_by === BOB(),
      client_matches: p.client_id === clientId,
      revision: r.revision, frequency: r.frequency, day_rule: r.day_rule,
      day_of_month: r.day_of_month, timezone: r.timezone,
      effective_from: String(r.effective_from), effective_to: r.effective_to,
      basis: r.basis, basis_digest: r.basis_digest, auto_reverse: r.auto_reverse,
      reversal_day_rule: r.reversal_day_rule,
    };
  };
  assert.deepEqual(await shape(runtimeSide.plan_id, runtimeClient),
    await shape(humanSide.plan_id, humanSide.client),
    "the two entrances write ONE plan shape — including the basis digest, which is what every "
    + "later occurrence's intent-payload comparison rides on");
  assert.equal((await revisionRows(runtimeSide.plan_id)).length, 1, "one revision each");
  assert.equal((await revisionRows(humanSide.plan_id)).length, 1);
});

// ===========================================================================================
// p652.obo.for_door — THE RUNTIME DOOR, ON A REAL RUNTIME CONNECTION.
// ===========================================================================================

test("p652.obo.for_door — create_accrual_adjustment_for admits a real plan, revision, accrual, occurrence and Work on a clara_runtime connection carrying NO human JWT; a deactivated author is refused CLR04 authority_lost with nothing written", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "obo");
  const ref = await instructionRef({ client, author: BOB() });
  const w = await span(2);
  const baseWork = await workCount(client);

  // THE CELL THAT WOULD GO RED IF THIS DOOR NESTED `clara.create_accounting_plan`: that door
  // resolves its actor through `clara._human_ctx` -> `clara.jwt_sub()` (0193:1454, 0004:299-308),
  // and a runtime connection has no `request.jwt.claims` at all, so it would raise CLR04
  // `no authenticated actor` here — a failure a grant assertion could never see.
  const answer = await createAccrualAdjustmentFor({
    client, author: BOB(), authorityRef: ref, accrual: termed(w, { cents: 4242 }),
    effectiveFrom: w.from, effectiveTo: w.to,
  });
  assert.ok(answer.accrual_id, "a real accrual record");
  assert.ok(answer.plan_id, "a real plan");
  assert.equal(answer.kind, PLAN_KIND.reversing);
  assert.equal(answer.posted, false, "…and it posted nothing");
  assert.equal(answer.occurrence?.admitted, true, "the current period's occurrence was admitted");

  const f = await footprint(client);
  assert.equal(f.plans, 1);
  assert.equal(f.revisions, 1);
  assert.equal(f.accruals, 1);
  assert.equal(f.occurrences, 1);
  assert.equal(f.work, baseWork + 1);
  const row = (await accrualRows(client))[0];
  assert.equal(row.recorded_by, BOB(), "the accrual records the author it acted for, from the ARGUMENT");
  assert.equal(row.amount_cents, "4242", "exact cents, carried through the runtime door unchanged");
  assert.equal((await planRow(answer.plan_id)).authorised_by, BOB(),
    "…and the plan's authority is that human's, not the run's");

  // THE NEGATIVE TWIN. Authority must be LIVE at the moment the books are configured.
  const gone = await freshAccrualClient(ALICE(), "obogone");
  const goneRef = await instructionRef({ client: gone, author: BOB() });
  const goneBase = await footprint(gone);
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: BOB(), opKey: opk("p652-obo-deact") });
  try {
    await assertPair(CLR.authz, ACCRUAL_REASON.authorityLost,
      () => createAccrualAdjustmentFor({
        client: gone, author: BOB(), authorityRef: goneRef, accrual: termed(w),
        effectiveFrom: w.from, effectiveTo: w.to,
      }), "an OBO configuration for a human whose membership was withdrawn");
  } finally {
    await reactivateMember({ firm: FIRM_A(), user: BOB() });
  }
  assert.deepEqual(await footprint(gone), goneBase, "and nothing at all was written");
});

// ===========================================================================================
// p652.term.window — THE SCHEDULE RUNS INSIDE THE TERM IT NAMES (review round 1, A1).
// ===========================================================================================

test("p652.term.window — an open-ended authority, a window that starts before the stated term and a term that is a stranger to the window are each refused accrual_term_window_mismatch, and nothing at all is written", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "window");
  const ref = await instructionRef({ client, author: BOB() });
  const TERM = { servicePeriodStart: "2026-07-01", servicePeriodEnd: "2026-09-30" };
  const call = (over = {}) => createAccrualAdjustment(BOB(), {
    client, authorityRef: ref,
    accrual: accrual({ ...TERM, ...(over.accrual ?? {}) }),
    effectiveFrom: "effectiveFrom" in over ? over.effectiveFrom : "2026-07-01",
    effectiveTo: "effectiveTo" in over ? over.effectiveTo : "2026-09-30",
    opKey: opk("p652-window"),
  });

  // 1 - AN OPEN-ENDED AUTHORITY UNDER A TERM THAT ENDS. The schedule would go on posting a line
  //     naming a term it had already run past, for ever.
  const open = await assertPair(CLR.badRequest, ACCRUAL_REASON.termWindowMismatch,
    () => call({ effectiveTo: null }), "a closed term under an open-ended authority");
  assert.equal(open.detail.field, "effective_to", "at the control that holds the mistake");
  assert.equal(open.detail.constraint, "bounded_window");

  // 2 - A WINDOW THAT STARTS BEFORE THE TERM. MEASURED before this wall existed: a June posting
  //     carrying "accrued 2026-07-01 to 2026-07-31" on its face.
  const early = await assertPair(CLR.badRequest, ACCRUAL_REASON.termWindowMismatch,
    () => call({ effectiveFrom: "2026-06-01" }), "an authority starting before the term it accrues for");
  assert.equal(early.detail.field, "effective_from");
  assert.equal(early.detail.constraint, "within_term");

  // 3 - A TERM THAT IS A STRANGER TO THE WINDOW: a 2031 term on a 2026 authority, accepted in full
  //     before this wall.
  const stranger = await assertPair(CLR.badRequest, ACCRUAL_REASON.termWindowMismatch,
    () => call({ accrual: { servicePeriodStart: "2031-01-01", servicePeriodEnd: "2031-12-31" } }),
    "a stated term wholly outside the authority window");
  assert.equal(stranger.detail.field, "effective_from");

  const f = await footprint(client);
  assert.equal(f.plans, 0, "no plan");
  assert.equal(f.accruals, 0, "no accrual record");
  assert.equal(f.occurrences, 0, "no occurrence");
  assert.deepEqual(await opReceiptRows(FIRM_A(), "p652-window"), [],
    "and not even a RESERVATION: the window wall is payload-half, asked before _reserve_op");

  // AND THE BRACKETED CONFIGURATION IS ACCEPTED, which is what keeps this a wall rather than a ban.
  const ok = await call();
  assert.ok(ok.accrual_id, "an authority window bracketed by its own stated term is configured");
  const row = (await accrualRows(client))[0];
  assert.equal(row.service_period_start, "2026-07-01");
  assert.equal(row.service_period_end, "2026-09-30");
  assert.equal(row.effective_to, "2026-09-30", "and the window it recorded is the one it was given");
});

// ===========================================================================================
// p652.schedule.yields — A TERM TOO SHORT FOR ITS OWN SCHEDULE (review round 2, NB1).
// ===========================================================================================

test("p652.schedule.yields — a stated term whose schedule reaches no accrual date inside it is refused BY NAME at the day rule, not configured into a plan that can never post", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "yields");
  const ref = await instructionRef({ client, author: BOB() });
  const call = ({ start, end, dayRule = "last_day_of_month", dayOfMonth = null, frequency = "monthly" }) =>
    createAccrualAdjustment(BOB(), {
      client, authorityRef: ref, frequency, dayRule, dayOfMonth,
      accrual: accrual({ servicePeriodStart: start, servicePeriodEnd: end }),
      effectiveFrom: start, effectiveTo: end, opKey: opk("p652-yields"),
    });

  // 1 - A HALF-MONTH TERM ON A MONTH-END RULE. MEASURED before this wall existed (review round 2,
  //     NB1): the configuration was ACCEPTED, the plan went live, and `clara.request_plan_catch_up`
  //     over the whole window answered `{"events":[],"admitted":0}` — no due date, ever. The list
  //     read said "No due dates reached yet", which is true and will stay true for ever.
  const half = await assertPair(CLR.badRequest, ACCRUAL_REASON.scheduleYieldsNone,
    () => call({ start: "2026-07-01", end: "2026-07-15" }),
    "a half-month term whose month-end rule falls outside it");
  assert.equal(half.detail.field, "day_rule", "at the control that holds the mistake");
  assert.equal(half.detail.constraint, "yields_occurrence");

  // 2 - A ONE-DAY TERM. The same silence, at the smallest possible scale.
  const oneDay = await assertPair(CLR.badRequest, ACCRUAL_REASON.scheduleYieldsNone,
    () => call({ start: "2026-07-10", end: "2026-07-10" }),
    "a one-day term whose month-end rule falls outside it");
  assert.equal(oneDay.detail.field, "day_rule");

  // 3 - THE SAME MISS UNDER A DAY-OF-MONTH RULE names the DAY, because that is the number the
  //     preparer would change: the 20th is outside a term that ends on the 15th.
  const wrongDay = await assertPair(CLR.badRequest, ACCRUAL_REASON.scheduleYieldsNone,
    () => call({ start: "2026-07-01", end: "2026-07-15", dayRule: "day_of_month", dayOfMonth: 20 }),
    "a day-of-month rule whose day falls outside the term");
  assert.equal(wrongDay.detail.field, "day_of_month");

  assert.deepEqual(await footprint(client),
    { plans: 0, revisions: 0, occurrences: 0, accruals: 0, work: (await workCount(client)) },
    "nothing at all is written");
  assert.deepEqual(await opReceiptRows(FIRM_A(), "p652-yields"), [],
    "and not even a RESERVATION: the yield wall is payload-half, asked before _reserve_op");

  // 4 - THIS IS A WALL, NOT A BAN. The SAME half-month term with the day rule that reaches inside
  //     it is configured and MATERIALISES its accrual date — which is why the refusal above names
  //     the day rule rather than the term.
  const ok = await call({
    start: "2026-07-01", end: "2026-07-15", dayRule: "day_of_month", dayOfMonth: 15,
  });
  assert.ok(ok.accrual_id, "a schedule that reaches inside its own term is configured");
  const caught = await requestPlanCatchUp(BOB(), { plan: ok.plan_id, from: "2026-07-01", to: "2026-07-15" });
  const legs = await occurrenceRows(ok.plan_id);
  assert.ok(legs.some((o) => o.leg === "primary" && String(o.due_date) === "2026-07-15"),
    `the accrual date inside the term is reached (catch-up admitted ${caught.admitted}, legs `
    + `${JSON.stringify(legs.map((o) => [String(o.due_date), o.leg]))})`);
});

// ===========================================================================================
// p652.basis.period_text — WHAT THE LEDGER SAYS ABOUT A PERIOD IT DID NOT ACCRUE.
// ===========================================================================================

test("p652.basis.period_text — every occurrence of one accrual posts the SAME true line: one period of the stated term, never a claim that this entry covers the whole of it", async (t) => {
  if (await gateAccruals(t)) return;
  const client = await freshAccrualClient(ALICE(), "periodtext");
  const ref = await instructionRef({ client, author: BOB() });
  // A WINDOW WITH MORE THAN ONE DUE DATE IN IT, wholly in the past: two month ends, two postings,
  // one frozen basis. This is the shape that made the old wording false.
  const from = monthStart(await shiftMonths(today, -3));
  const to = await monthEndBack(2);
  const c = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, purpose: "Monthly office rent accrual",
    accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
    effectiveFrom: from, effectiveTo: to, opKey: opk("p652-periodtext"),
  });
  assert.ok(c.occurrence?.work_id, "the latest due event in the window was admitted");

  // THE SECOND DUE DATE, through the human catch-up door: the same window, explicitly scoped.
  const caught = await requestPlanCatchUp(BOB(), { plan: c.plan_id, from, to });
  assert.equal(caught.admitted, 1, "the window holds a SECOND primary due date (that is the point)");

  const rows = (await occurrenceRows(c.plan_id)).filter((o) => o.leg === "primary");
  assert.equal(rows.length, 2, "two accrual legs, one stated term");
  const expected = `one period of the accrual term ${from} to ${to}`;
  for (const o of rows) {
    const entry = await postPlanWork({ work: o.work_id, client, author: BOB(), firm: FIRM_A() });
    const lines = await linesOf(entry);
    assert.equal(lines[0].account_code, ACHART.expense);
    assert.equal(String(lines[0].debit_cents), "120000", "the amount stated here, in every period");
    assert.equal(lines[0].description, expected,
      "the line is true of EVERY occurrence: it names the accrual term and says this entry is one period of it");
    assert.doesNotMatch(lines[0].description, /^accrued /,
      "and it does NOT claim this one entry accrued the whole stated term");
    assert.ok(String(o.due_date) >= from && String(o.due_date) <= to,
      `every posting date lies inside the stated term (${o.due_date})`);
  }
});

// ===========================================================================================
// p652.method.honoured — THE ENUM HOLDS THE RULE THIS SLICE ACTUALLY POSTS (review round 1, A2).
// ===========================================================================================

test("p652.method.honoured — the closed selection set is exactly the rules the schedule honours; the two WITHDRAWN rules are refused by name and write nothing", async (t) => {
  if (await gateAccruals(t)) return;
  // #937 (0303) added `stated_period_amount` — the second rule the ledger performs — so the census
  // now reads two. The claim this cell has always made is unchanged: a rule is in the set only
  // when a lane HONOURS it (review round 1, A2), and the two that nothing performs stay out.
  assert.deepEqual(ACCRUAL_METHODS, ["stated_amount", "stated_period_amount"],
    "a rule is recorded because a rule is performed: the frozen basis carries the stated amount, "
    + "and #937's resolver hands the shared basis builder one line per due date");
  const client = await freshAccrualClient(ALICE(), "method");
  const ref = await instructionRef({ client, author: BOB() });
  for (const rule of ["source_document_amount", "prior_period_amount"]) {
    const refused = await assertPair(CLR.badRequest, ACCRUAL_REASON.methodUnsupported,
      () => createAccrualAdjustment(BOB(), {
        client, authorityRef: ref,
        accrual: accrual({ method: { rule }, servicePeriodStart: "2026-07-01", servicePeriodEnd: "2026-07-31" }),
        effectiveFrom: "2026-07-01", effectiveTo: "2026-07-31", opKey: opk("p652-method"),
      }),
      `the withdrawn selection rule ${rule}, which nothing in this estate performs`);
    assert.deepEqual(refused.detail.supported, ["stated_amount", "stated_period_amount"],
      "the refusal LISTS what is honoured, so a caller is not left guessing");
  }
  assert.equal(await accrualCount(client), 0, "and no accrual was recorded under a rule nobody applies");
});

// ===========================================================================================
// p652.term.document — THE TERM A HUMAN ANCHORED TO A DOCUMENT (0140:452), BOUND RATHER THAN
// RESTATED.
// ===========================================================================================

test("p652.term.document — an accrual whose basis cites a filed document binds that document's LIVE human-stated service period, refuses a disagreeing term, and the bookkeeper persona can read the bound row", async (t) => {
  if (await gateAccruals(t)) return;
  if (!(await servicePeriodLaneReady())) {
    markSkip();
    t.skip("p652.term.document needs the 0140 service-period carrier and its human door");
    return;
  }
  const client = await freshAccrualClient(ALICE(), "term");
  const ref = await instructionRef({ client, author: BOB() });
  // THE DOCUMENT'S OWN TERM IS THE WINDOW the schedule may run inside (0222's SIXTH MEASUREMENT):
  // an accrual bound to a filed term cannot go on accruing past the period that document states.
  const from = "2026-07-01";
  const to = "2026-07-31";
  const term = await filedDocumentWithTerm(BOB(), {
    firm: FIRM_A(), client, start: from, end: to,
  });
  assert.ok(term.servicePeriodId, "0140's own door anchored the term");

  // THE DISAGREEING TERM IS REFUSED rather than silently preferring one of the two.
  const clash = await assertPair(CLR.badRequest, ACCRUAL_REASON.termDocumentMismatch,
    () => createAccrualAdjustment(BOB(), {
      // The window brackets the STATED term here, so what is under test is the document
      // disagreement and not the window wall in front of it.
      client, authorityRef: ref, effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31",
      accrual: accrual({
        sourceDocumentId: term.document, documentServicePeriodId: term.servicePeriodId,
        servicePeriodStart: "2026-08-01", servicePeriodEnd: "2026-08-31",
      }),
    }), "an accrual whose stated term disagrees with the document's anchored one");
  assert.equal(clash.detail.field, "accrual.document_service_period_id");

  // AND THE AGREEING ONE BINDS.
  const c = await createAccrualAdjustment(BOB(), {
    client, authorityRef: ref, effectiveFrom: from, effectiveTo: to,
    accrual: accrual({
      sourceDocumentId: term.document, documentServicePeriodId: term.servicePeriodId,
    }),
  });
  const row = (await accrualRows(client))[0];
  assert.equal(row.document_service_period_id, term.servicePeriodId,
    "the accrual BINDS the carrier rather than restating the dates as a second fact");
  assert.equal(row.source_document_id, term.document);

  const got = await getAccrualAdjustment(BOB(), c.accrual_id);
  assert.equal(got.document_service_period_id, term.servicePeriodId, "…and the read carries it");
  const dsp = await servicePeriodAsHuman(BOB(), term.servicePeriodId);
  assert.equal(dsp.basis_kind, "human_stated",
    "read under the BOOKKEEPER persona (0140:619-627's floor), the bound term is a human's");
  assert.equal(dsp.superseded_at, null, "…and it is the live one");

  // A SERVICE PERIOD OF A DIFFERENT DOCUMENT can never be bound, even inside one firm.
  const other = await filedDocumentWithTerm(BOB(), {
    firm: FIRM_A(), client, start: "2026-07-01", end: "2026-07-31",
  });
  await assertPair(CLR.badRequest, ACCRUAL_REASON.termDocumentMismatch,
    () => createAccrualAdjustment(BOB(), {
      client, authorityRef: ref, effectiveFrom: from, effectiveTo: to,
      accrual: accrual({
        sourceDocumentId: term.document, documentServicePeriodId: other.servicePeriodId,
      }),
    }), "a term row belonging to a different document");
});
