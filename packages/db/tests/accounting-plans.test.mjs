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
  todayInPlanZone, todayDayOfMonth, shiftMonths, setClientStatus, closeYearAround,
  cancelAccountingWork, reactivateMember,
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

  // THE SUPPORTED ROSTER IS DERIVED FROM THE RELATION'S OWN CHECK, not re-typed. #653's 0208
  // added `amortisation_schedule` (a ratified recut of the 0193 plan family, DECISIONS §1.3), and
  // this cell went red at wave integration with the literal pair it was written against — the
  // honest reading of which is that a second place was carrying the roster. The door's advertised
  // `detail.supported` and `clara.accounting_plans`' `kind` CHECK are two DIFFERENT objects, so
  // comparing them is a real cross-check: a kind the CHECK admits but the refusal does not name
  // (or the reverse) is exactly the drift worth catching, and neither can move alone again.
  const checkDef = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.accounting_plans'::regclass and conname = 'accounting_plans_kind_check'`
  )).rows[0].def;
  const admitted = [...checkDef.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  assert.ok(admitted.includes("recurring_journal") && admitted.includes("reversing_journal"),
    `the kind CHECK no longer admits this lane's own two kinds: ${checkDef}`);
  for (const kind of ["depreciation", "accrual", "amortisation", "period_close"]) {
    const { detail } = await assertPair(CLR.badRequest, PLAN_REASON.planKindUnsupported,
      () => mk({ kind }), `plan kind ${kind}`);
    assert.deepEqual([...detail.supported].sort(), [...admitted].sort(),
      "the refusal NAMES exactly what clara.accounting_plans' own kind CHECK admits");
    assert.equal(detail.supported.includes(kind), false,
      `the refusal for ${kind} must not also list it as supported`);
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
  // THE NEW SCHEDULE STARTS AFTER THE PERIOD THAT HAS ALREADY RUN. A frequency change re-aligns
  // every period key, so 0193 refuses one whose first period would cover a period this plan has
  // already run (CLR10 `period_already_covered`, review finding SHOULD-1); that refusal is its own
  // cell, and this one is about the revision MODEL.
  const lawfulFrom = await shiftMonths(monthStart(today), 1);
  const revised = await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "quarterly", dayRule: "last_day_of_month", dayOfMonth: null,
    effectiveFrom: lawfulFrom, basis: newBasis,
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

  // `authority_from` is in this list because it is the FLOOR every revision and every catch-up
  // window is measured against (review finding B3). A frozen column nobody tests is a promise.
  for (const [col, value] of [["purpose", "'something else'"], ["authorised_by", `'${BOB()}'::uuid`],
    ["kind", "'reversing_journal'"], ["client_id", `'${world.clients.A1}'::uuid`],
    ["authority_from", "date '2020-01-01'"]]) {
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
  // …AND ITS PERIOD, which is the other half of the identity after review finding B1: a period key
  // that could be edited is a uniqueness law that can be walked around by one UPDATE.
  await assertPair(CLR.immutable, PLAN_REASON.occurrenceImmutable,
    () => rootQuery("update clara.accounting_plan_occurrences set period_key=period_key+1 where id=$1", [occ.id]),
    "moving an occurrence's period key");
  await assertPair(CLR.immutable, "plan_occurrence_work_set_once",
    () => rootQuery("update clara.accounting_plan_occurrences set work_id=null where id=$1", [occ.id]),
    "un-naming an occurrence's Work");
  // THE S7 EXIT IS NARROW, AND THE TRIGGER IS WHERE THAT NARROWNESS LIVES: re-pointing an
  // occurrence at a different Work is refused while the Work it names is still LIVE, whatever
  // attempt counter the writer offers.
  await assertPair(CLR.immutable, "plan_occurrence_work_set_once",
    () => rootQuery(
      "update clara.accounting_plan_occurrences set work_id=$2, attempt=attempt+1 where id=$1",
      [occ.id, p.ref.id]),
    "re-pointing an occurrence at another Work while the one it names is still live");
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

// ===========================================================================================
// The adversarial round on 0193 (review findings B1, B3, S4, S5, S7).
// ===========================================================================================

test("p640.revision.no_double_post — a revision changes only FUTURE periods: the period already admitted is not admitted a second time under a new due day (review finding B1)", async (t) => {
  if (await gatePlans(t)) return;
  const dayNow = await todayDayOfMonth();
  if (dayNow < 2) {
    // The scenario needs TWO distinct due days at or before today inside one month.
    t.skip("p640.revision.no_double_post needs a calendar day >= 2 for two due days this month");
    return;
  }
  const dom = Math.min(dayNow, 28);
  const p = await plan({ tag: "revdouble", monthsBack: 3, dayOfMonth: dom });

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const before = await occurrenceRows(p.plan_id);
  assert.equal(before.length, 1, "this month's period is admitted once");
  const admitted = before[0];

  // THE REVISION MOVES THE DUE DAY INSIDE THE SAME MONTH, which is exactly the shape that used to
  // produce a second Work for one period: a different due_date satisfies unique (plan_id, due_date)
  // while naming the same accounting period and the same basis.
  await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: dom - 1,
    effectiveFrom: p.effectiveFrom, basis: p.basis,
  });
  assert.equal((await liveRevision(p.plan_id)).revision, 2);

  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const after = await occurrenceRows(p.plan_id);
  assert.equal(after.length, 1,
    `the revision must not re-admit a period already run; got ${JSON.stringify(after.map((x) => [x.due_date, x.period_key]))}`);
  assert.equal(after[0].id, admitted.id, "…and the occurrence that stands is the original one");

  // THE DOOR HOLDS THE SAME WALL for the path a human can reach: a catch-up over the whole window
  // admits the periods that never ran and refuses the one that did.
  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: p.effectiveFrom, to: today });
  const rows = await occurrenceRows(p.plan_id);
  const primaries = rows.filter((x) => x.leg === "primary");
  const keys = primaries.map((x) => x.period_key);
  assert.equal(new Set(keys).size, keys.length,
    `one occurrence per period per leg, whatever the schedule was revised to; got ${JSON.stringify(primaries.map((x) => [x.due_date, x.period_key]))}`);
  const refusedPeriods = caught.events.filter((e) => e.reason === PLAN_REASON.periodAlreadyAdmitted);
  assert.equal(refusedPeriods.length, 1, `the already-run period is refused by name; got ${JSON.stringify(caught.events)}`);
  const works = rows.filter((x) => x.work_id !== null).map((x) => x.work_id);
  assert.equal(new Set(works).size, works.length, "no Work is named twice");
});

test("p640.revision.authority_floor — a revision cannot move the plan's authority backwards, so catch_up_before_authority cannot be dissolved (review finding B3)", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "revfloor");
  const ref = await instructionRef({ client, author: ALICE() });
  const b = basis({ postingDate: today, memo: "authority floor" });
  // Authority starts TODAY: nothing historical is authorised at all.
  const created = await createAccountingPlan(ALICE(), {
    client, authorityRef: ref, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
    effectiveFrom: today, basis: b,
  });

  const longAgo = "2020-01-15";
  await assertPair(CLR.badRequest, PLAN_REASON.effectiveFromBeforeAuthority,
    () => reviseAccountingPlan(ALICE(), {
      plan: created.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
      effectiveFrom: longAgo, basis: b,
    }),
    "a revision back-dating the authority");

  // The floor is the PLAN's, not the live revision's, so moving it FORWARD is still allowed and
  // does not lower the floor afterwards.
  const forward = await shiftMonths(today, 1);
  await reviseAccountingPlan(ALICE(), {
    plan: created.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
    effectiveFrom: forward, basis: b,
  });
  await assertPair(CLR.badRequest, PLAN_REASON.effectiveFromBeforeAuthority,
    () => reviseAccountingPlan(ALICE(), {
      plan: created.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
      effectiveFrom: longAgo, basis: b,
    }),
    "a revision back-dating the authority after it had been moved forward");

  // …and no historical catch-up became reachable.
  await assertPair(CLR.badRequest, PLAN_REASON.catchUpBeforeAuthority,
    () => requestPlanCatchUp(ALICE(), { plan: created.plan_id, from: longAgo, to: today }),
    "a catch-up reaching back past the plan's own authority");
  assert.equal(await occurrenceCount(created.plan_id), 0, "nothing historical was admitted");
});

test("p640.revision.end_race — an ENDED plan cannot gain a fresh live revision, and the test is made under the plan row lock (review finding S4)", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "revendrace" });
  await endAccountingPlan(ALICE(), { plan: p.plan_id, reason: "the client cancelled it" });
  await assertPair(CLR.badRequest, PLAN_REASON.planEnded,
    () => reviseAccountingPlan(ALICE(), {
      plan: p.plan_id, effectiveFrom: p.effectiveFrom, basis: p.basis,
    }), "revising an ended plan");
  const revs = await revisionRows(p.plan_id);
  assert.equal(revs.length, 1, "no second revision exists");
  assert.equal(revs[0].superseded_at, null, "…and the one revision was not superseded by the refused call");

  // THE LOCK IS WHAT MAKES IT A RACE ANSWER RATHER THAN A LUCKY ONE: the refusal is decided on a
  // re-read taken UNDER the plan row lock, which the body's own text is asserted to do.
  const src = await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='revise_accounting_plan'");
  const body = src.rows[0].prosrc;
  const lockAt = body.indexOf("for update");
  const endTestAfterLock = body.indexOf("plan_ended", lockAt);
  assert.ok(lockAt > 0, "revise takes the plan row lock");
  assert.ok(endTestAfterLock > lockAt,
    "the ended test is re-made AFTER the lock, not only on the unlocked read");
});

test("p640.occ.retry_intent_key — a refused occurrence re-attempted after a revision records the revision it actually ran under (review finding S5)", async (t) => {
  if (await gatePlans(t)) return;
  const client = await freshWorkClient(ALICE(), "retrykey");
  // p640.auth.loss (above) revokes frank and the estate has no re-admit door, so this cell restores
  // him first — the fixture shortcut is stated at its own definition.
  await reactivateMember({ firm: FIRM_A(), user: frank });
  // Frank authorises it, so deactivating him refuses the first attempt.
  const p = await plan({ sub: frank, tag: "retrykey", client, monthsBack: 2 });
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: frank });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const refused = await occurrenceRows(p.plan_id);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].work_id, null);
  assert.equal(refused[0].revision, 1);
  assert.match(refused[0].intent_key, /:r1:/);

  // Restore frank's authority and revise, then catch that period up.
  await reactivateMember({ firm: FIRM_A(), user: frank });
  await reviseAccountingPlan(ALICE(), {
    plan: p.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
    effectiveFrom: p.effectiveFrom, basis: p.basis,
  });
  await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: refused[0].due_date, to: refused[0].due_date });

  const after = await occurrenceRows(p.plan_id);
  const row = after.find((x) => x.id === refused[0].id);
  assert.ok(row.work_id, "the re-attempt admitted on the same row");
  assert.equal(row.revision, 2, "the occurrence records the revision it RAN under, not the one it first failed under");
  assert.match(row.intent_key, /:r2:/, "…and its intent key says so too");
  const w = await workRow(row.work_id);
  assert.equal(w.intent_key, row.intent_key, "the Work and the occurrence agree on the key");
});

test("p640.catchup.reattempt — a CANCELLED plan Work does not make its due date permanently unpostable (review finding S7)", async (t) => {
  if (await gatePlans(t)) return;
  const p = await plan({ tag: "reattempt", monthsBack: 2 });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const first = await occurrenceRows(p.plan_id);
  assert.equal(first.length, 1);
  const firstWork = first[0].work_id;
  assert.ok(firstWork);

  // A human cancels it — the Work is terminal with no committed receipt, so nothing was posted for
  // this period and the period is still owed.
  const cancelled = await cancelAccountingWork({ work: firstWork, author: ALICE() });
  assert.ok(cancelled, "the cancel door answered");
  assert.equal((await workRow(firstWork)).status, "cancelled");

  const caught = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: first[0].due_date, to: first[0].due_date });
  assert.equal(caught.admitted, 1, `the cancelled period is re-admitted; got ${JSON.stringify(caught.events)}`);
  const after = await occurrenceRows(p.plan_id);
  const row = after.find((x) => x.id === first[0].id);
  assert.notEqual(row.work_id, firstWork, "a NEW Work carries the re-attempt");
  assert.equal(row.attempt, 2, "…and the occurrence counts the attempt");
  assert.match(row.intent_key, /:a2$/, "a re-attempt takes a distinguishing intent key, so 0178 cannot replay the cancelled Work");
  assert.equal((await workRow(row.work_id)).status, "queued");

  // A COMPLETED Work is NOT re-attemptable: money is on the books and a second admission would be
  // a second entry for one period.
  const w = await workRow(row.work_id);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p640-reatt") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: p.author, client: p.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: p.client, work: row.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  await settleWorkRun({ task: w.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });
  const again = await requestPlanCatchUp(ALICE(), { plan: p.plan_id, from: first[0].due_date, to: first[0].due_date });
  assert.equal(again.admitted, 0, "a completed period is not re-admitted");
  assert.equal((await occurrenceRows(p.plan_id)).find((x) => x.id === first[0].id).attempt, 2,
    "…and the attempt counter did not move");
});

// ===========================================================================================
// p640.revision.frequency_alignment — A FREQUENCY CHANGE CANNOT RE-COVER A PERIOD ALREADY RUN
// (review finding SHOULD-1).
//
// `unique (plan_id, leg, period_key)` is exact PER ALIGNMENT and blind ACROSS alignments: the key
// is computed from the live revision's frequency, so monthly `2026-09-01` and quarterly
// `2026-08-01` are two different keys naming one September. Measured both directions by the
// reviewer, through the plain scan and with no catch-up anywhere. The wall is arithmetic: a
// revision that CHANGES the frequency must start after the last period this plan has already run.
// ===========================================================================================

test("p640.revision.frequency_alignment — a frequency change is refused while its first period would cover one the plan has already run, in BOTH directions, and is allowed the day after", async (t) => {
  if (await gatePlans(t)) return;
  const thisMonth = monthStart(today);
  const nextMonth = await shiftMonths(thisMonth, 1);

  // ---- MONTHLY -> QUARTERLY. The monthly plan has run September; a quarterly alignment anchored
  // on the plan's own authority puts September inside its FIRST period, so September would take a
  // second entry.
  const m = await plan({ tag: "freqmq", monthsBack: 2, frequency: "monthly", dayOfMonth: 1 });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const ran = await occurrenceRows(m.plan_id);
  assert.equal(ran.length, 1, "the monthly plan has run its current period");
  assert.equal(ran[0].due_date, thisMonth);

  const mq = await assertPair(CLR.badRequest, PLAN_REASON.periodAlreadyCovered,
    () => reviseAccountingPlan(ALICE(), {
      plan: m.plan_id, frequency: "quarterly", dayRule: "day_of_month", dayOfMonth: 1,
      effectiveFrom: thisMonth, basis: m.basis,
    }),
    "re-aligning a monthly plan onto quarters over a month it has already run");
  assert.equal(mq.detail.period_start, m.effectiveFrom,
    "the refusal NAMES the period the new alignment would cover again");
  assert.ok(mq.detail.covered_through >= thisMonth, "and how far this plan has already run");
  assert.equal(mq.detail.earliest_effective_from, nextMonth,
    "and the first date the change would be lawful from");

  // …and it is lawful from exactly that date.
  const ok = await reviseAccountingPlan(ALICE(), {
    plan: m.plan_id, frequency: "quarterly", dayRule: "day_of_month", dayOfMonth: 1,
    effectiveFrom: mq.detail.earliest_effective_from, basis: m.basis,
  });
  assert.equal(ok.revision, 2, "a frequency change that starts after the covered periods is a legitimate revision");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(m.plan_id), 1,
    "and the re-aligned plan does not post the covered month a second time");

  // ---- QUARTERLY -> MONTHLY. The quarterly plan has run the quarter that CONTAINS this month, so
  // a monthly alignment starting inside that quarter would post this month again.
  const q = await plan({ tag: "freqqm", monthsBack: 2, frequency: "quarterly", dayOfMonth: 1 });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const qran = await occurrenceRows(q.plan_id);
  assert.equal(qran.length, 1, "the quarterly plan has run its current period");
  assert.equal(qran[0].due_date, q.effectiveFrom, "the quarter's own due day");

  const qm = await assertPair(CLR.badRequest, PLAN_REASON.periodAlreadyCovered,
    () => reviseAccountingPlan(ALICE(), {
      plan: q.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
      effectiveFrom: thisMonth, basis: q.basis,
    }),
    "re-aligning a quarterly plan onto months inside a quarter it has already run");
  assert.equal(qm.detail.period_start, thisMonth,
    "the refusal names the month the new alignment would cover again");
  assert.ok(qm.detail.covered_through >= thisMonth,
    "the quarter already run reaches at least to the end of this month");
  assert.equal(qm.detail.earliest_effective_from, nextMonth,
    "and the first date a monthly alignment would be lawful from is the day after the covered quarter");

  const qok = await reviseAccountingPlan(ALICE(), {
    plan: q.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 1,
    effectiveFrom: qm.detail.earliest_effective_from, basis: q.basis,
  });
  assert.equal(qok.revision, 2);
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(q.plan_id), 1,
    "and no month inside the covered quarter is posted a second time");

  // ---- AND THE WALL IS THE FREQUENCY CHANGE, NOT EVERY REVISION. A revision that keeps the
  // frequency is governed by `unique (plan_id, leg, period_key)` and review finding B1's own
  // refusal, which this cell must not have widened into a refusal of ordinary schedule edits.
  const same = await plan({ tag: "freqsame", monthsBack: 2, frequency: "monthly", dayOfMonth: 1 });
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  const kept = await reviseAccountingPlan(ALICE(), {
    plan: same.plan_id, frequency: "monthly", dayRule: "day_of_month", dayOfMonth: 5,
    effectiveFrom: same.effectiveFrom, basis: same.basis,
  });
  assert.equal(kept.revision, 2, "moving the due DAY inside the same frequency is still allowed");
  await wakeDuePlanOccurrences({ limit: SCAN_LIMIT });
  assert.equal(await occurrenceCount(same.plan_id), 1,
    "and B1's period wall still keeps the already-run period from taking a second entry");
});
