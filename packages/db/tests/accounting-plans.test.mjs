// #640 — THE AUTHORITY, THE SCHEDULE, THE REVISION MODEL AND THE EXPLICIT CATCH-UP.
//
// The claims this battery exists to prove:
//
//   1. AUTHORITY IS A ROW, NOT A SENTENCE. A plan cites an instruction this database already
//      holds; a Knowledge preference, a calculation policy or an invented id cannot supply it, and
//      `authority_rule` is refused BY NAME rather than silently accepted.
//   2. EVERY DUE EVENT RECHECKS. A de-authorised authoriser stops admission with 0178's own typed
//      CLR04 recorded on the occurrence, nothing is admitted, and the plan stays active — a
//      revocation is not the owner's decision to end a schedule.
//   3. A LOCKED PERIOD IS THE POSTING CORE'S REFUSAL, NOT THE PLAN'S. The occurrence IS admitted,
//      the Work settles refused carrying the period reason, and the due event is not re-admitted.
//   4. REVISION PRESERVES ITS PREDECESSOR AND ITS PAST RUNS.
//   5. CATCH-UP IS EXPLICIT, OLDEST FIRST AND BOUNDED, AND NEVER REACHES BACK PAST THE AUTHORITY.
//
// CONTRACT-BLIND against #640's own contract, frontier-gated on the `accounting_plans$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  gatePlans, buildWorkWorld, freshWorkClient, endPool, printLaneNotes, printSkipCount,
  opk, rootQuery, basis, CLR, REASON, assertPair, assertRaises,
  insertUser, addMember, deactivateMember, claimWorkRun, settleWorkRun,
  mintClientObo, wakeRecordJournalEntry, workRow, receiptsForWork,
  createAccountingPlan, reviseAccountingPlan, pauseAccountingPlan, resumeAccountingPlan,
  endAccountingPlan, requestPlanCatchUp, previewAccountingPlan, listAccountingPlans,
  getAccountingPlan, listPlanOccurrences, wakeDuePlanOccurrences,
  planRow, liveRevision, revisionRows, occurrenceRows, occurrenceCount, instructionRef,
  todayInPlanZone, shiftMonths, setClientStatus, closeYearAround,
  PLAN_KIND, PLAN_REASON, TZ,
} from "./accounting-plans-fixtures.mjs";

let world = null;
let today = null;
let frank = null; // a SECOND active bookkeeper of firm A — the authority this battery revokes.
before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
  frank = await insertUser(world.prefix, "frank");
  await addMember(world.users.alice, {
    firm: world.firms.A, user: frank, role: "bookkeeper", opKey: opk("p640-mem"),
  });
});
after(async () => {
  printLaneNotes("accounting-plans");
  printSkipCount("accounting-plans");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const CAROL = () => world.users.carol;
const DAVE = () => world.users.dave;
const FIRM_A = () => world.firms.A;

const SCAN_LIMIT = 100;
const monthStart = (day) => `${day.slice(0, 7)}-01`;

async function plan({
  sub = ALICE(), tag = "p640", kind = PLAN_KIND.recurring, monthsBack = 2,
  dayRule = "day_of_month", dayOfMonth = 1, frequency = "monthly", effectiveTo = null,
  client = null, purpose = "Monthly office rent accrual", opKey = null,
} = {}) {
  const cli = client ?? (await freshWorkClient(ALICE(), tag));
  const ref = await instructionRef({ client: cli, author: sub });
  const from = monthStart(await shiftMonths(today, -monthsBack));
  const b = basis({ postingDate: from, memo: `${tag} standing instruction` });
  const answer = await createAccountingPlan(sub, {
    client: cli, kind, purpose, authorityRef: ref, frequency, dayRule, dayOfMonth,
    effectiveFrom: from, effectiveTo, basis: b,
    reversalDayRule: kind === PLAN_KIND.reversing ? "next_period_first_day" : null, opKey,
  });
  return { ...answer, client: cli, author: sub, effectiveFrom: from, basis: b, ref };
}

// ===========================================================================================
// p640.auth — AUTHORITY IS A ROW.
// ===========================================================================================

test("p640.auth.ref — a plan cites an instruction this database holds: a Knowledge-shaped id, an invented uuid and a malformed reference are all refused, and authority_rule is refused BY NAME", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "authref");
  const from = monthStart(await shiftMonths(today, -1));
  const b = basis({ postingDate: from });
  const good = await instructionRef({ client, author: ALICE() });

  // An id that names nothing — the shape a Knowledge record, a calculation policy or a
  // remembered chat would arrive as.
  await assertPair(CLR.badRequest, PLAN_REASON.authorityRefUnresolved,
    () => createAccountingPlan(ALICE(), {
      client, authorityRef: { kind: "accounting_work", id: randomUUID() },
      effectiveFrom: from, basis: b,
    }),
    "an unresolvable authority reference");

  // A Work belonging to ANOTHER client of the same firm is not this client's instruction.
  const otherClient = await freshWorkClient(ALICE(), "authref2");
  const foreign = await instructionRef({ client: otherClient, author: ALICE() });
  await assertPair(CLR.badRequest, PLAN_REASON.authorityRefUnresolved,
    () => createAccountingPlan(ALICE(), { client, authorityRef: foreign, effectiveFrom: from, basis: b }),
    "another client's instruction");

  await assertPair(CLR.badRequest, PLAN_REASON.authorityRefInvalid,
    () => createAccountingPlan(ALICE(), {
      client, authorityRef: { kind: "knowledge_preference", id: randomUUID() },
      effectiveFrom: from, basis: b,
    }),
    "a Knowledge preference as an authority kind");

  await assertPair(CLR.badRequest, PLAN_REASON.authorityRefInvalid,
    () => createAccountingPlan(ALICE(), {
      client, authorityRef: { kind: "accounting_work", id: "not-a-uuid" },
      effectiveFrom: from, basis: b,
    }),
    "a malformed authority id");

  await assertPair(CLR.badRequest, PLAN_REASON.authorityRuleUnsupported,
    () => createAccountingPlan(ALICE(), {
      client, authorityKind: "authority_rule", authorityRef: good, effectiveFrom: from, basis: b,
    }),
    "an authority RULE — refused by name, so a later file can widen the CHECK additively");

  await assertPair(CLR.badRequest, PLAN_REASON.invalidAuthorityKind,
    () => createAccountingPlan(ALICE(), {
      client, authorityKind: "observed_repetition", authorityRef: good, effectiveFrom: from, basis: b,
    }),
    "observed repetition as an authority kind");

  // …and the good one works, so none of the above is refusing for an unrelated reason.
  const ok = await createAccountingPlan(ALICE(), {
    client, authorityRef: good, effectiveFrom: from, basis: b,
  });
  assert.equal(ok.status, "active");
  assert.equal(ok.revision, 1);
  const row = await planRow(ok.plan_id);
  assert.equal(row.authority_kind, "explicit_instruction");
  assert.equal(row.authority_ref.id, good.id);
  assert.equal(row.authorised_by, ALICE(), "the authoriser is the human who gave the instruction");
});

test("p640.auth.scope — a viewer cannot create a plan, and another firm's plan is simply not found", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "authscope" });
  const ref = await instructionRef({ client: p.client, author: ALICE() });
  await assertRaises(CLR.authz,
    () => createAccountingPlan(CAROL(), {
      client: p.client, authorityRef: ref, effectiveFrom: p.effectiveFrom, basis: p.basis,
    }),
    "a viewer creating a plan");
  // A viewer may READ — the bookkeeper floor on the writes is authority, not secrecy.
  const listed = await listAccountingPlans(CAROL(), p.client);
  assert.ok(listed.plans.some((x) => x.plan_id === p.plan_id), "a viewer reads the plan list");

  await assertPair(CLR.notFound, PLAN_REASON.planNotFound,
    () => getAccountingPlan(DAVE(), p.plan_id), "another firm's plan");
  await assertPair(CLR.notFound, PLAN_REASON.planNotFound,
    () => pauseAccountingPlan(DAVE(), { plan: p.plan_id }), "another firm pausing this plan");
});

test("p640.auth.loss — a de-authorised authoriser stops admission with 0178's own CLR04 recorded on the occurrence; nothing is admitted and the plan stays active", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "authloss");
  // Frank is the authoriser: the plan executes under HIS live authority.
  const p = await plan({ sub: frank, tag: "authloss", client });
  assert.equal((await planRow(p.plan_id)).authorised_by, frank);

  await deactivateMember(ALICE(), { firm: FIRM_A(), user: frank });
  const m = await rootQuery(
    "select status from clara.firm_memberships where firm_id=$1 and user_id=$2", [FIRM_A(), frank]);
  assert.notEqual(m.rows[0].status, "active", "the authoriser's membership really is gone");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });

  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1, "the due event is RECORDED — an unrecorded refusal would be retried forever");
  assert.equal(occ[0].work_id, null, "…and nothing was admitted");
  assert.equal(occ[0].admitted_at, null);
  assert.equal(occ[0].outcome.state, "refused");
  assert.equal(occ[0].outcome.code, CLR.authz, `expected 0178's CLR04, got ${JSON.stringify(occ[0].outcome)}`);
  assert.equal(occ[0].outcome.reason, REASON.actorNotActive,
    "the occurrence carries 0178's OWN typed reason, not a reworded one");

  const work = await rootQuery(
    "select count(*)::int n from clara.accounting_work where intent_key=$1", [occ[0].intent_key]);
  assert.equal(work.rows[0].n, 0, "no Work exists for the refused due event");
  assert.equal((await planRow(p.plan_id)).status, "active",
    "a revocation is not the owner's decision to end a schedule");

  // A SECOND scan does not retry it: the recorded refusal is what stops the sweep spinning, and
  // re-attempting a missed period is explicitly the catch-up door's job.
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1);
  assert.equal((await occurrenceRows(p.plan_id))[0].work_id, null);
});

test("p640.auth.client — an archived client admits nothing, and the scan says so rather than raising", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "authcli");
  const p = await plan({ tag: "authcli", client });
  await setClientStatus(client, "archived");
  const scan = await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 0, "an archived client's plan admits nothing at all");
  assert.ok(!scan.occurrences.some((o) => o.plan_id === p.plan_id),
    "…and the candidate query never even reaches it");
  await setClientStatus(client, "active");
});

// ===========================================================================================
// p640.auth.period — THE OCCURRENCE IS ADMITTED; THE POSTING CORE REFUSES.
// ===========================================================================================

test("p640.auth.period — a locked period admits the occurrence but the Work settles refused with the period reason, and the due event is not re-admitted", async (t) => {
  if (await gatePlans(t)) return;
  // A DEDICATED client: clara.fiscal_years is append-only, so a year closed here could never be
  // cleaned up and would silently close the period out from under every later cell.
  const client = await freshWorkClient(ALICE(), "authperiod");
  const p = await plan({ tag: "authperiod", client });
  const due = monthStart(today);
  await closeYearAround(FIRM_A(), client, due, ALICE());

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].outcome.state, "admitted",
    "admission does not know about period locks — 0178's door checks authority, the posting core checks the period");
  const work = occ[0].work_id;
  assert.ok(work);

  const w = await workRow(work);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p640-period") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: p.author, client });
  await assertPair(CLR.period, REASON.closedPeriod,
    () => wakeRecordJournalEntry(obo.secret, {
      client, work, logicalOpId: w.logical_op_id, basis: w.basis,
    }),
    "posting a plan occurrence into a closed period");

  await settleWorkRun({
    task: w.current_task_id, outcome: "refused", errorCode: "tool_error",
    error: { reason: REASON.closedPeriod, code: CLR.period },
  });
  const settled = await workRow(work);
  assert.equal(settled.status, "refused");
  assert.equal(settled.error.reason, REASON.closedPeriod, "the Work carries the period reason");
  assert.equal((await receiptsForWork(work)).filter((r) => r.outcome === "committed").length, 0,
    "no committed receipt exists for a refused posting");

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1,
    "the due event is not re-admitted: the occurrence row is its identity, whatever the Work's outcome");
});

// ===========================================================================================
// p640.schedule — THE SCHEDULE RULES.
// ===========================================================================================

test("p640.schedule.rules — every schedule refusal is typed and names its field; the excluded adapters and the unsupported timezone are refused BY NAME", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "sched");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = monthStart(await shiftMonths(today, -1));
  const b = basis({ postingDate: from });
  const mk = (over) => createAccountingPlan(ALICE(), {
    client, authorityRef: ref, effectiveFrom: from, basis: b, ...over,
  });

  for (const kind of ["depreciation", "accrual", "amortisation", "period_close"]) {
    const { detail } = await assertPair(CLR.badRequest, PLAN_REASON.planKindUnsupported,
      () => mk({ kind }), `plan kind ${kind}`);
    assert.deepEqual(detail.supported, ["recurring_journal", "reversing_journal"],
      "the refusal NAMES what this slice does support");
  }
  await assertPair(CLR.badRequest, PLAN_REASON.timezoneUnsupported,
    () => mk({ timezone: "UTC" }), "a timezone other than Asia/Kuala_Lumpur");
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk({ frequency: "weekly" }), "an unsupported frequency");
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk({ dayOfMonth: 31 }), "a 31st-of-the-month schedule (no unambiguous February)");
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk({ dayRule: "last_day_of_month", dayOfMonth: 5 }), "a month-end rule carrying a day number");
  const longBefore = monthStart(await shiftMonths(today, -6));
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk({ effectiveTo: longBefore }), "an end before the start");
  await assertPair(CLR.badRequest, PLAN_REASON.invalidSchedule,
    () => mk({ reversalDayRule: "next_period_first_day" }), "a recurring plan carrying a reversal rule");

  // THE ONE COLLIDING SHAPE, refused by name rather than discovered as a bare unique violation.
  await assertPair(CLR.badRequest, PLAN_REASON.reversalCollides,
    () => mk({ kind: PLAN_KIND.reversing, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
      reversalDayRule: "next_period_first_day" }),
    "a monthly reversing plan accruing on the 1st");

  await assertPair(CLR.badRequest, PLAN_REASON.invalidOpKey,
    () => mk({ opKey: "   " }), "a blank op key");
  await assertPair(CLR.badRequest, PLAN_REASON.invalidPurpose,
    () => mk({ purpose: "  " }), "a blank purpose");
  // The basis is 0178's own validator, reached unchanged.
  await assertPair(CLR.badRequest, REASON.invalidBasis,
    () => mk({ basis: basis({ lines: [{ account_code: "6100", debit_cents: 1, credit_cents: 0 }] }) }),
    "a one-legged basis");
});

test("p640.schedule.replay — the same op key replays the same answer and never creates a second plan", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "replay");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = monthStart(await shiftMonths(today, -1));
  const b = basis({ postingDate: from });
  const key = opk("p640-replay");
  const first = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, effectiveFrom: from, basis: b, opKey: key,
  });
  const again = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, effectiveFrom: from, basis: b, opKey: key,
  });
  assert.equal(again.plan_id, first.plan_id, "a lost response replays; it does not create a second plan");
  const n = await rootQuery(
    "select count(*)::int n from clara.accounting_plans where client_id=$1", [client]);
  assert.equal(n.rows[0].n, 1);
});

test("p640.schedule.overlap — creating a plan over a LIVE 0045 adjustment template's accounts answers an advisory overlap_warning and refuses nothing", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "overlap");
  const ref = await instructionRef({ client, author: ALICE() });
  const from = monthStart(await shiftMonths(today, -1));
  const b = basis({ postingDate: from });
  const codes = b.lines.map((l) => l.account_code);

  // A live signed template of the 0045 lane, planted directly: this battery is about #640's
  // WARNING, not about 0045's own propose/sign ceremony, which has its own battery.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
  await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, proposed_by, proposed_op_key,
        signed_by, signed_at)
       values ($1,$2,'live','Rig overlap template','monthly',$3,false,
               $4::jsonb,'rig overlap', repeat('f',64), $5, $6, $5, now())`,
    [firm, client, from,
      JSON.stringify(codes.map((c, i) => ({ account_code: c, debit_cents: i === 0 ? 100 : 0, credit_cents: i === 0 ? 0 : 100 }))),
      ALICE(), opk("p640-tpl")]);

  const created = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, effectiveFrom: from, basis: b,
  });
  assert.ok(created.plan_id, "the overlap is ADVISORY: the plan is created");
  assert.ok(created.overlap_warning, "…and the answer names the overlap");
  assert.equal(created.overlap_warning.kind, "adjustment_template_overlap");
  assert.equal(created.overlap_warning.templates.length, 1);
  assert.equal(created.overlap_warning.templates[0].name, "Rig overlap template");
  assert.ok(created.overlap_warning.templates[0].accounts.some((a) => codes.includes(a)),
    "the warning names the intersecting account codes");

  // A plan on UNRELATED accounts carries no warning at all.
  const other = await freshWorkClient(ALICE(), "overlap2");
  const ref2 = await instructionRef({ client: other, author: ALICE() });
  const clean = await createAccountingPlan(ALICE(), {
    client: other, authorityRef: ref2, effectiveFrom: from, basis: b,
  });
  assert.equal(clean.overlap_warning, null, "no live template of THAT client, so no warning");
});

// ===========================================================================================
// p640.revision — REVISION PRESERVES ITS PREDECESSOR AND ITS PAST RUNS.
// ===========================================================================================

test("p640.revision — a revision supersedes its predecessor, keeps it readable, leaves past occurrences on the revision they ran under, and an ended plan can be revised no further", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "revise" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const before = await occurrenceRows(p.plan_id);
  assert.equal(before.length, 1);
  assert.equal(before[0].revision, 1);

  const newBasis = basis({ postingDate: p.effectiveFrom, cents: 250000, memo: "revised rent" });
  const revised = await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "quarterly", dayRule: "last_day_of_month", dayOfMonth: null,
    effectiveFrom: p.effectiveFrom, basis: newBasis,
  });
  assert.equal(revised.revision, 2);
  assert.equal(revised.superseded_revision, 1);

  const all = await revisionRows(p.plan_id);
  assert.equal(all.length, 2, "the predecessor is PRESERVED, never rewritten");
  assert.ok(all[0].superseded_at, "revision 1 is superseded");
  assert.equal(all[0].frequency, "monthly", "…with its own schedule intact");
  assert.equal(all[1].superseded_at, null, "revision 2 is live");
  assert.equal(all[1].frequency, "quarterly");
  assert.equal((await liveRevision(p.plan_id)).revision, 2);
  assert.equal((await planRow(p.plan_id)).current_revision, 2);

  const after = await occurrenceRows(p.plan_id);
  assert.equal(after[0].revision, 1, "a past occurrence still names the revision it RAN under");
  assert.equal(after[0].intent_key, before[0].intent_key, "…and its identity never moved");

  const detail = await getAccountingPlan(ALICE(), p.plan_id);
  assert.equal(detail.revisions.length, 2, "the read door serves the whole revision history");
  assert.equal(detail.live_revision.revision, 2);

  // A superseded revision is immutable even to a direct write.
  await assertPair(CLR.immutable, PLAN_REASON.revisionImmutable,
    () => rootQuery("update clara.accounting_plan_revisions set frequency='annual' where id=$1", [all[0].id]),
    "editing a superseded revision");

  await endAccountingPlan(ALICE(), { plan: p.plan_id, reason: "the client cancelled the instruction" });
  assert.equal((await planRow(p.plan_id)).status, "ended");
  await assertPair(CLR.badRequest, PLAN_REASON.planEnded,
    () => reviseAccountingPlan(ALICE(), {
      plan: p.plan_id, effectiveFrom: p.effectiveFrom, basis: newBasis,
    }), "revising an ended plan");
  await assertPair(CLR.badRequest, PLAN_REASON.planEnded,
    () => resumeAccountingPlan(ALICE(), { plan: p.plan_id }), "resuming an ended plan");
  await assertPair(CLR.badRequest, PLAN_REASON.planEnded,
    () => pauseAccountingPlan(ALICE(), { plan: p.plan_id }), "pausing an ended plan");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(p.plan_id), 1, "an ended plan admits nothing further");
});

test("p640.revision.immutable — a plan's identity and authority cannot be rewritten, and an occurrence never renames its Work", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "immut" });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const occ = (await occurrenceRows(p.plan_id))[0];

  for (const [col, value] of [["purpose", "'something else'"], ["authorised_by", `'${BOB()}'::uuid`],
    ["kind", "'reversing_journal'"], ["client_id", `'${world.clients.A1}'::uuid`]]) {
    const { detail } = await assertPair(CLR.immutable, PLAN_REASON.planImmutable,
      () => rootQuery(`update clara.accounting_plans set ${col}=${value} where id=$1`, [p.plan_id]),
      `rewriting accounting_plans.${col}`);
    assert.equal(detail.column, col, "the refusal names the column that moved");
  }
  await assertPair(CLR.immutable, PLAN_REASON.planImmutable,
    () => rootQuery("delete from clara.accounting_plans where id=$1", [p.plan_id]),
    "deleting a plan");

  await assertPair(CLR.immutable, PLAN_REASON.occurrenceImmutable,
    () => rootQuery("update clara.accounting_plan_occurrences set due_date=due_date+1 where id=$1", [occ.id]),
    "moving an occurrence's due date");
  await assertPair(CLR.immutable, "plan_occurrence_work_set_once",
    () => rootQuery("update clara.accounting_plan_occurrences set work_id=null where id=$1", [occ.id]),
    "un-naming an occurrence's Work");
});

// ===========================================================================================
// p640.catchup.scope — EXPLICIT, OLDEST FIRST, BOUNDED, NEVER BEFORE THE AUTHORITY.
// ===========================================================================================

test("p640.catchup.scope — the scan never backfills; a window before effective_from is CLR10 catch_up_before_authority; an in-range window admits oldest first and converges on what is already there", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "catchup", monthsBack: 3 });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const scanned = await occurrenceRows(p.plan_id);
  assert.equal(scanned.length, 1, "the SCAN admits only the current due event — a schedule does not authorise a silent backfill");
  assert.equal(scanned[0].due_date, monthStart(today));

  const beforeAuthority = await shiftMonths(p.effectiveFrom, -1);
  const { detail } = await assertPair(CLR.badRequest, PLAN_REASON.catchUpBeforeAuthority,
    () => requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: beforeAuthority, to: today }),
    "a catch-up window reaching back past the plan's own authority");
  assert.equal(detail.effective_from, p.effectiveFrom, "the refusal names where the authority actually starts");

  const future = await shiftMonths(today, 1);
  await assertPair(CLR.badRequest, PLAN_REASON.catchUpInFuture,
    () => requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: future }),
    "a catch-up window reaching into the future");

  const caught = await requestPlanCatchUp(ALICE(), {
    plan: p.plan_id, from: p.effectiveFrom, to: today,
  });
  assert.equal(caught.cap, 12, "the batch is bounded, and the answer says by how much");
  assert.equal(caught.admitted, 3, "the three missed periods, and only those");
  const events = caught.events.map((e) => e.due_date);
  assert.deepEqual([...events].sort(), events, "oldest first");
  const converged = caught.events.filter((e) => e.converged === true);
  assert.equal(converged.length, 1, "the period the scan already admitted CONVERGES rather than admitting twice");

  const after = await occurrenceRows(p.plan_id);
  assert.equal(after.length, 4, "four due events in the window, four occurrences");
  assert.ok(after.every((o) => o.due_date >= p.effectiveFrom),
    "not one occurrence predates the authority");
  const works = new Set(after.map((o) => o.work_id));
  assert.equal(works.size, 4, "four distinct Work rows, none shared");
  for (const o of after) {
    assert.equal(o.intent_key, `plan:${p.plan_id}:r1:${o.due_date}`);
    const w = await workRow(o.work_id);
    assert.equal(w.basis.posting_date, o.due_date, "each caught-up occurrence posts on ITS OWN date");
  }
});

test("p640.catchup.bounded — a catch-up over twenty periods admits at most the cap in one call, oldest first", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "catchcap", monthsBack: 20 });
  const caught = await requestPlanCatchUp(ALICE(), {
    plan: p.plan_id, from: p.effectiveFrom, to: today,
  });
  assert.equal(caught.events.length, 12, "one call never walks more than its cap");
  assert.equal(caught.admitted, 12);
  const occ = await occurrenceRows(p.plan_id);
  assert.equal(occ.length, 12);
  assert.equal(occ[0].due_date, p.effectiveFrom, "it started at the OLDEST period in the window");
  const expected = await shiftMonths(p.effectiveFrom, 11);
  assert.equal(occ[11].due_date, expected, "…and walked forward, never backward");
});

test("p640.catchup.paused — a paused or ended plan catches nothing up", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "catchpause", monthsBack: 3 });
  await pauseAccountingPlan(ALICE(), { plan: p.plan_id });
  await assertPair(CLR.badRequest, PLAN_REASON.planPaused,
    () => requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: today }),
    "catching up a paused plan");
  assert.equal(await occurrenceCount(p.plan_id), 0);
  await resumeAccountingPlan(ALICE(), { plan: p.plan_id });
  await endAccountingPlan(ALICE(), { plan: p.plan_id, reason: "no longer wanted" });
  await assertPair(CLR.badRequest, PLAN_REASON.planEnded,
    () => requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: today }),
    "catching up an ended plan");
  assert.equal(await occurrenceCount(p.plan_id), 0);
});

// ===========================================================================================
// p640.read — THE READ SURFACE THE UI RENDERS.
// ===========================================================================================

test("p640.read.list — the plan list carries purpose, kind, schedule, timezone, effective dates, status and the next occurrence", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "read");
  const p = await plan({ tag: "read", client, purpose: "Quarterly management fee" });
  const listed = await listAccountingPlans(BOB(), client);
  assert.equal(listed.client_id, client);
  assert.equal(listed.plans.length, 1);
  const row = listed.plans[0];
  assert.equal(row.plan_id, p.plan_id);
  assert.equal(row.purpose, "Quarterly management fee");
  assert.equal(row.kind, PLAN_KIND.recurring);
  assert.equal(row.status, "active");
  assert.equal(row.frequency, "monthly");
  assert.equal(row.day_rule, "day_of_month");
  assert.equal(row.day_of_month, 1);
  assert.equal(row.timezone, TZ);
  assert.equal(row.effective_from, p.effectiveFrom);
  assert.equal(row.effective_to, null);
  assert.equal(row.occurrence_count, 0);
  assert.ok(row.next_occurrence, "an active plan names its next due date");
  assert.ok(row.next_occurrence >= p.effectiveFrom);

  const detail = await getAccountingPlan(BOB(), p.plan_id);
  assert.equal(detail.authority_ref.id, p.ref.id, "the detail names the instruction that authorised it");
  assert.equal(detail.live_revision.basis.memo, p.basis.memo, "…and the basis it posts");
  assert.equal(detail.live_revision.basis_digest.length, 64);

  const occ = await listPlanOccurrences(BOB(), p.plan_id);
  assert.deepEqual(occ.occurrences, [], "an empty occurrence history is an empty ARRAY, never a null");

  const preview = await previewAccountingPlan(BOB(), { plan: p.plan_id, count: 24 });
  assert.equal(preview.occurrences.length, 24, "the preview honours its count, up to the cap");
  const capped = await previewAccountingPlan(BOB(), { plan: p.plan_id, count: 500 });
  assert.equal(capped.occurrences.length, 24, "…and the cap is 24, never a caller's number");
});
