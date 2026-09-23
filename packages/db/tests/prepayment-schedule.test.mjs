// #653 — THE DOOR: WHAT A PREPAYMENT SCHEDULE REQUIRES, WHAT IT DERIVES, AND WHAT IT REFUSES.
//
// The claims this battery exists to prove:
//
//   1. THE ALLOCATION IS EXACT TO THE CENT AND THE REMAINDER IS WHOLLY IN THE FINAL PERIOD, at
//      the NEW door, on a schedule the estate stored — not only inside the evaluator a root
//      connection can call.
//   2. THE CADENCE IS DERIVED FROM THE EVALUATOR, NEVER TYPED. Every due date the shared
//      scheduler generates matches EXACTLY ONE emitted period line by `period_end`; a
//      caller-supplied day rule is refused.
//   3. NOTHING IS INVENTED. A missing term refuses by a token that NAMES `document_service_periods`
//      and writes no plan and no schedule row; an unfit source, an ineligible target, a target
//      with no stated basis and an amount below its own period granularity each refuse by 0140's
//      OWN token rather than a new one.
//   4. THE KIND WIDENING IS ADDITIVE. `amortisation_schedule` is admitted; depreciation and close
//      still answer `plan_kind_unsupported`.
//   5. A REVISION CANNOT MOVE THE CADENCE, and the stored period lines do not move with it.
//   6. THE NEW RELATION CARRIES NO APPLICATION GRANT, and the frozen evaluator is still ungranted
//      and still matches its registered `clara.evaluator_versions` member hash.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits — through `humanQuery(sub, namedCall(...))`. A `rootQuery` cell is not AC8 evidence, and
// the battery this one replaces reached the evaluator exactly that way.
//
// CONTRACT-BLIND against #653's own contract, frontier-gated on the `prepayment_amortisation$`
// stem.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertPrepaymentCohortPresent, endPool, printLaneNotes, printSkipCount,
  opk, rootQuery, CLR, assertPair, assertRaises, namedCall, getPool, ROLES,
  prepaymentScene, createPrepaymentSchedule, getPrepaymentSchedule, listPrepaymentSchedules,
  createAccountingPlan, reviseAccountingPlan, previewAccountingPlan,
  scheduleRow, scheduleRowsFor, relationPosture, functionGrants, evaluatorFreezeMatches,
  unapprovedEntry, ambiguousAssetEntry, ineligibleAssetEntry, nowhere,
  AMORTISATION_KIND, CONTROL_ASSET_CODE, PREPAY_REASON, TARGET_BASIS, TZ,
} from "./prepayment-schedule-fixtures.mjs";

after(async () => {
  printLaneNotes("prepayment-schedule");
  printSkipCount("prepayment-schedule");
  await endPool();
});

const DOOR_SIG =
  "clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)";

/** The period line amounts, in emitted order, as integers. The stored lines are jsonb and their
 *  cents arrive as JSON numbers; a cell about EXACT cents reads them as integers deliberately. */
const amounts = (lines) => lines.map((l) => Number(l.credit_cents));

/** The door's seven named arguments, spelled once for the race cell — which cannot go through
 *  `createPrepaymentSchedule` because it needs the call to stay inside an OPEN transaction. */
const DOOR_ARGS = [
  { name: "p_client", cast: "uuid" }, { name: "p_source_entry", cast: "uuid" },
  { name: "p_expense_account", cast: "text" }, { name: "p_expense_basis", cast: "text" },
  { name: "p_purpose", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
  { name: "p_op_key", cast: "text" },
];

// RAW HUMAN CONNECTIONS — the `prepayment-occurrences.test.mjs` / `work-cancel.test.mjs` idiom.
// The pooled `humanQuery` helper commits and resets, which is exactly what a race cell cannot
// have: the winner must sit UNCOMMITTED while the loser queues behind its row.
async function rawHuman(sub) {
  const c = await getPool().connect();
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({ sub, role: "authenticated" })]);
  return c;
}
async function releaseRaw(c) {
  if (!c) return;
  await c.query("rollback").catch(() => {});
  await c.query("reset role").catch(() => {});
  await c.query("reset all").catch(() => {});
  c.release();
}
const backendPid = async (c) => (await c.query("select pg_backend_pid() as p")).rows[0].p;
/** The estate's own witness that a transaction is queued behind a lock — never a sleep. */
async function waitingOnLock(pid, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await rootQuery("select wait_event_type as w from pg_stat_activity where pid=$1", [pid]);
    if (r.rows[0]?.w === "Lock") return true;
    await new Promise((x) => setTimeout(x, 25));
  }
  return false;
}

// ===========================================================================================
// p653.schedule — THE ARITHMETIC AND THE CADENCE, AT THE NEW DOOR.
// ===========================================================================================

test("p653.schedule.exact_cents — a twelve-month term over 100,000 cents stores twelve period lines summing EXACTLY to the total, with the remainder wholly in the final period and both sides named on every line", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("exact", { cents: 100000, termMonthsBack: 12, termMonths: 12 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });

  assert.equal(created.period_count, 12, "twelve whole calendar months are charged");
  assert.equal(created.total_cents, 100000);
  assert.equal(created.remainder_placement, "final_period");
  assert.equal(created.schedule_version, "v1", "the frozen evaluator's own version, echoed");
  assert.equal(created.kind, AMORTISATION_KIND);

  const row = await scheduleRow(created.schedule_id);
  assert.ok(row, "the schedule row exists");
  const cents = amounts(row.period_lines);
  assert.equal(cents.length, 12);
  assert.equal(cents.reduce((a, b) => a + b, 0), 100000, "the twelve periods sum EXACTLY to the total");
  // 100000 / 12 = 8333 remainder 4 — eleven base periods and one that carries the residual.
  assert.deepEqual(cents.slice(0, 11), Array(11).fill(8333), "every period but the last is the base");
  assert.equal(cents[11], 8337, "the remainder lands WHOLLY in the final period, never spread");

  for (const line of row.period_lines) {
    assert.equal(line.expense_account_code, scene.target,
      "every line names the judged EXPENSE account — the half the evaluator does not emit");
    assert.equal(line.prepaid_account_code, scene.prepaid,
      "…and the prepaid-asset account read off the source entry's own leg");
    assert.ok(line.period_start && line.period_end, "each line names its own calendar period");
  }
  assert.equal(row.total_cents, "100000");
  assert.equal(row.prepaid_account_code, scene.prepaid);
  assert.equal(row.expense_account_code, scene.target);
  assert.equal(row.source_entry_id, scene.entry);
  assert.equal(row.document_id, scene.document);
  assert.equal(row.basis_kind, "human_stated", "the term this schedule rode is the HUMAN-stated one");
});

test("p653.schedule.due_dates_cover — the created plan is monthly / last_day_of_month over the derived window, and every due date the shared scheduler generates matches EXACTLY ONE period line by period_end", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("cover", { cents: 100000, termMonthsBack: 12, termMonths: 12 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  const row = await scheduleRow(created.schedule_id);
  const ends = row.period_lines.map((l) => String(l.period_end).slice(0, 10));

  assert.equal(created.frequency, "monthly", "derived, never asked");
  assert.equal(created.day_rule, "last_day_of_month",
    "the evaluator emits whole calendar months, so every due date IS a month end");
  assert.equal(created.day_of_month, null);
  assert.equal(created.timezone, TZ);
  assert.equal(created.effective_from, ends[0], "the window opens on the FIRST line's period_end");
  assert.equal(created.effective_to, ends[ends.length - 1], "…and closes on the LAST line's");

  // The shared scheduler's OWN arithmetic, asked for more events than the term has.
  const preview = await previewAccountingPlan(scene.bob, { plan: created.plan_id, count: 24 });
  const dues = preview.occurrences.map((o) => o.due_date);
  assert.equal(dues.length, ends.length,
    `the scheduler generates exactly ${ends.length} due events for a ${ends.length}-period term`);
  assert.deepEqual(dues, ends, "no gap and no double cover: date for date, the join key is exact");
  for (const o of preview.occurrences) {
    const line = row.period_lines.filter((l) => String(l.period_end).slice(0, 10) === o.due_date);
    assert.equal(line.length, 1, `due date ${o.due_date} matches EXACTLY one period line`);
    const positive = o.basis.lines.find((l) => Number(l.debit_cents) > 0);
    assert.equal(Number(positive.debit_cents), Number(line[0].credit_cents),
      `the previewed basis for ${o.due_date} carries THAT period's own amount, not the constant`);
  }
});

test("p653.schedule.cadence_not_asked — a caller-supplied day-of-month cadence for an amortisation plan is refused by the shared schedule validator, at create and at revise alike", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("cadence", { cents: 60000, termMonthsBack: 4, termMonths: 3 });
  const from = scene.termEnd;
  const b = {
    posting_date: from, memo: "#653 cadence probe", currency: "MYR",
    lines: [
      { account_code: scene.target, debit_cents: 20000, credit_cents: 0, description: "charge" },
      { account_code: scene.prepaid, debit_cents: 0, credit_cents: 20000, description: "release" },
    ],
  };
  const { detail } = await assertPair(CLR.badRequest, PREPAY_REASON.invalidSchedule,
    () => createAccountingPlan(scene.bob, {
      client: scene.client, kind: AMORTISATION_KIND, purpose: "hand-typed cadence",
      authorityRef: scene.authorityRef, frequency: "monthly", dayRule: "day_of_month",
      dayOfMonth: 15, effectiveFrom: from, basis: b,
    }),
    "an amortisation plan created with a typed day-of-month cadence");
  assert.equal(detail.field, "day_rule",
    "the refusal names the control that holds the mistake, so a form can focus it");
});

test("p653.schedule.term_missing — a source entry whose document has no live service period refuses prepayment_term_underivable NAMING document_service_periods, and writes no plan and no schedule row", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("noterm", { cents: 90000, termMonthsBack: 4, termMonths: 3, recordTerm: false });
  const plansBefore = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id = $1", [scene.client]);

  const { detail } = await assertPair(CLR.badRequest, PREPAY_REASON.termUnderivable,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a recognition entry whose document states no term");
  assert.equal(detail.missing, "document_service_periods",
    "the refusal names the fact to record and where — never a twelve-month default");
  assert.equal(detail.document_id, scene.document, "…and the document to record it against");

  const plansAfter = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id = $1", [scene.client]);
  assert.equal(plansAfter.rows[0].n, plansBefore.rows[0].n, "no plan was written");
  assert.deepEqual(await scheduleRowsFor(scene.client), [], "and no schedule row");
});

test("p653.schedule.zero_basis — C08.2's owner: the one balanced all-zero amortisation basis this estate can construct is refused AT THE NEW DOOR by clara._assert_journal_basis, and the refusal carries that predicate's OWN constraint rather than a second zero check's", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // 1 cent over 2 months: the base truncates to 0, so the FIRST period's derived basis moves no
  // money at all. That is the only balanced all-zero amortisation basis this estate can construct
  // — the evaluator's own prepaid-leg predicate is `debit_cents > 0`, so a zero-value source entry
  // never reaches the allocation at all.
  const scene = await prepaymentScene("zero", { cents: 1, termMonthsBack: 4, termMonths: 2 });
  const { detail } = await assertPair(CLR.badRequest, PREPAY_REASON.belowGranularity,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "one cent amortised over two months");
  assert.equal(detail.owner, "clara._assert_journal_basis",
    "the door routes the proposal through the SHARED predicate rather than minting a second zero check");
  // MEASURED, AND IT IS A FINDING ABOUT 0178 RATHER THAN ABOUT THIS DOOR. `_assert_journal_basis`'s
  // `nonzero_total` arm (0178:785-787) is UNREACHABLE for an all-zero balanced basis: its per-line
  // `exactly_one_side` arm (0178:771-775) fires first, and every line that survives that arm
  // carries exactly one POSITIVE side, so the debit total can never be zero. C08.2's owner is
  // confirmed; the arm that answers is this one.
  assert.equal(detail.constraint, "exactly_one_side",
    "the constraint carried through is the arm 0178 actually raised, not a word this door chose");
});

test("p653.schedule.granularity — the same proposal's typed payload names the total, the period count and the zero base, so the human's remedy is a judgement they can make", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("gran", { cents: 1, termMonthsBack: 4, termMonths: 2 });
  const { detail } = await assertPair(CLR.badRequest, PREPAY_REASON.belowGranularity,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "one cent amortised over two months");
  assert.equal(detail.total_cents, 1);
  assert.equal(detail.period_count, 2);
  assert.equal(detail.base_cents, 0);
  assert.deepEqual(await scheduleRowsFor(scene.client), [], "nothing was written");
});

test("p653.schedule.target_ineligible — a balance-sheet target, an unknown code and the receivable CONTROL account each refuse prepayment_target_ineligible and NAME the axis", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("tgtelig", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  const notExpense = await assertPair(CLR.badRequest, PREPAY_REASON.targetIneligible,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.prepaid,
      authorityRef: scene.authorityRef,
    }),
    "an amortisation charged to a balance-sheet account");
  assert.equal(notExpense.detail.axis, "not_expense_class",
    "a balance-sheet target would move the prepayment sideways and never charge it");

  const unknown = await assertPair(CLR.badRequest, PREPAY_REASON.targetIneligible,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: "59999999",
      authorityRef: scene.authorityRef,
    }),
    "an amortisation charged to a code this chart does not hold");
  assert.equal(unknown.detail.axis, "account_unknown");

  // THE CONTROL ACCOUNT, which the title promised and no leg measured. MEASURED HERE: it answers
  // `not_expense_class`, because every control class this estate carries is an asset or a
  // liability and the expense-class wall fires FIRST — so `_adj_line_eligibility_breach`'s own
  // `control_account` arm is structurally unreachable from the EXPENSE side. It is reachable from
  // the PREPAID side, which is what the next cell measures. The assertion admits either axis
  // rather than pinning the one that happens to fire, because both are refusals and which one
  // wins is 0042's precedence, not this door's claim.
  const control = await assertPair(CLR.badRequest, PREPAY_REASON.targetIneligible,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: CONTROL_ASSET_CODE,
      authorityRef: scene.authorityRef,
    }),
    "an amortisation charged to the receivable CONTROL account");
  assert.ok(["not_expense_class", "control_account"].includes(String(control.detail.axis)),
    `a control account is refused by an axis, not admitted: ${JSON.stringify(control.detail)}`);

  assert.deepEqual(await scheduleRowsFor(scene.client), [], "no refusal wrote anything");
});

test("p653.schedule.prepaid_leg_ineligible — an APPROVED, document-bound entry whose ONE debited asset is the receivable CONTROL account (an ordinary sales invoice) is refused at the door: the estate's line-eligibility wall is applied to the PREPAID leg, not only to the judged expense target", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // THE EVALUATOR'S OWN PREDICATE IS NOT A JUDGEMENT OF THE ACCOUNT. `prepayment_schedule_v1`
  // takes "the one debited asset leg" verbatim (0140:1046-1064) and never asks WHICH asset — so a
  // sales invoice, a documented bank receipt and a fixed-asset purchase all satisfy it. Without
  // this wall the door would post Dr expense / Cr <receivable> every month for a whole term.
  const scene = await prepaymentScene("prepaidelig", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const invoice = await ineligibleAssetEntry(scene, { cents: 77000 });

  const refused = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: invoice.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a schedule whose prepaid leg is a receivable control account");
  assert.equal(refused.detail.axis, "prepaid_account_ineligible",
    "the refusal names the AXIS, so the surface can say which leg is wrong");
  assert.equal(refused.detail.prepaid_account_code, CONTROL_ASSET_CODE);
  assert.equal(refused.detail.breach?.axis, "control_account",
    `the breach is the SHARED helper's own answer, carried through: ${JSON.stringify(refused.detail)}`);

  assert.deepEqual(await scheduleRowsFor(scene.client), [], "the refusal wrote nothing");
});

test("p653.schedule.authority_ref_unresolved — an authority_ref naming the RECOGNITION ENTRY rather than an instruction Work is refused CLR10 authority_ref_unresolved and writes nothing; the same call with a real accounting_work id is accepted", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // THE REGRESSION GUARD FOR THE WEB FORM'S OWN PAYLOAD. A surface that filled
  // `{kind:'accounting_work', id: <the journal entry>}` could never succeed against this door, and
  // an entry id is NEVER a Work id: `create_accounting_plan` RESOLVES the reference (0193) and
  // refuses by name. This cell calls the door with exactly the object such a form builds.
  const scene = await prepaymentScene("authref", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  const fabricated = await assertPair(CLR.badRequest, PREPAY_REASON.authorityRefUnresolved,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: { kind: "accounting_work", id: scene.entry },
    }),
    "an authority_ref carrying the recognition entry's own id");
  assert.ok(fabricated.detail, "the refusal is typed rather than a bare message");
  assert.deepEqual(await scheduleRowsFor(scene.client), [], "no plan and no schedule row");

  const ok = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  assert.ok(ok.schedule_id, "the SAME call with a real instruction Work is accepted");
});

test("p653.schedule.duplicate_race — two humans configuring the SAME recognition concurrently: the loser is answered the TYPED prepayment_schedule_exists, never a bare unique-violation naming an index", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  // THE TYPED PRE-CHECK CANNOT SEE AN UNCOMMITTED WINNER, so the structural backstop
  // (`uq_prepayment_schedules_source`) is what actually answers the loser. A bare 23505 reaches the
  // surface as `duplicate key value violates unique constraint "…"` — a sentence with no next act.
  // The BARRIER here is the unique index itself: B's insert queues on A's uncommitted row.
  const scene = await prepaymentScene("race", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  const a = await rawHuman(scene.bob);
  const b = await rawHuman(scene.bob);
  let loser = null;
  try {
    const call = (key) => a.query(namedCall("create_prepayment_schedule", DOOR_ARGS),
      [scene.client, scene.entry, scene.target, TARGET_BASIS, "Prepaid subscription amortisation",
        JSON.stringify(scene.authorityRef), key]);
    await a.query("begin");
    await call(opk("p653-raceA"));
    await b.query("begin");
    const pidB = await backendPid(b);
    const pb = b.query(namedCall("create_prepayment_schedule", DOOR_ARGS),
      [scene.client, scene.entry, scene.target, TARGET_BASIS, "Prepaid subscription amortisation",
        JSON.stringify(scene.authorityRef), opk("p653-raceB")])
      .then(() => null, (e) => e);
    assert.ok(await waitingOnLock(pidB),
      "B must be queued behind A's uncommitted row — otherwise this cell proves nothing about a race");
    await a.query("commit");
    loser = await pb;
  } finally {
    await releaseRaw(a);
    await releaseRaw(b);
  }

  assert.ok(loser, "the second configuration of one recognition does not succeed");
  assert.notEqual(loser.code, "23505",
    `the loser is answered by the lane's own vocabulary, not by an index name: ${loser.message}`);
  assert.equal(loser.code, CLR.conflict);
  const detail = JSON.parse(loser.detail ?? "{}");
  assert.equal(detail.reason, PREPAY_REASON.scheduleExists);
  assert.equal(detail.source_entry, scene.entry);
  assert.ok(detail.schedule_id, "…and it NAMES the schedule that already exists, so the surface can open it");
  assert.equal((await scheduleRowsFor(scene.client)).length, 1, "exactly one schedule survives the race");
});

test("p653.schedule.target_underivable — a target proposed with NO stated grounds, and no target at all, both refuse prepayment_target_underivable", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("tgtbasis", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  const noBasis = await assertPair(CLR.badRequest, PREPAY_REASON.targetUnderivable,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      expenseBasis: "   ", authorityRef: scene.authorityRef,
    }),
    "a judged expense account with no recorded grounds");
  assert.equal(noBasis.detail.axis, "basis_missing",
    "a classification with no stated basis is refused rather than receipted unexplained");

  const noTarget = await assertPair(CLR.badRequest, PREPAY_REASON.targetUnderivable,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: null,
      authorityRef: scene.authorityRef,
    }),
    "no expense account proposed at all");
  assert.equal(noTarget.detail.axis, "account_missing");
});

test("p653.schedule.source_unfit — an UNAPPROVED recognition entry and one debiting TWO asset accounts each refuse prepayment_source_unfit", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("unfit", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  const draft = await unapprovedEntry(scene);
  const notPosted = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: draft, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a schedule over an entry that has not posted");
  assert.match(String(notPosted.detail.reason_text ?? notPosted.error.message), /draft|POSTED|approved/i,
    "the refusal says WHY: a prepayment schedule amortises a POSTED entry");

  const ambiguous = await ambiguousAssetEntry(scene);
  const twoLegs = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: ambiguous, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a schedule over an entry whose prepaid leg is ambiguous");
  assert.equal(twoLegs.detail.candidate_legs, 2, "the refusal counts the candidate legs rather than picking one");

  assert.deepEqual(await scheduleRowsFor(scene.client), [], "neither refusal wrote anything");
});

test("p653.schedule.one_per_entry — a second schedule over the SAME recognition entry is refused; a repeat of the SAME op key replays the first", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("once", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const key = opk("p653-once");
  const first = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: key,
  });
  const replay = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef, opKey: key,
  });
  assert.equal(replay.schedule_id, first.schedule_id, "the same decision replays rather than asking twice");

  await assertPair(CLR.conflict, PREPAY_REASON.scheduleExists,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef, opKey: opk("p653-second"),
    }),
    "a SECOND schedule over one recognition entry");
  assert.equal((await scheduleRowsFor(scene.client)).length, 1);
});

// ===========================================================================================
// p653.kind — THE WIDENING IS ADDITIVE.
// ===========================================================================================

test("p653.kind.unsupported — depreciation and close STILL answer plan_kind_unsupported after the widening, and the refusal names the three supported kinds", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("kind", { cents: 60000, termMonthsBack: 4, termMonths: 3 });
  const b = {
    posting_date: scene.termEnd, memo: "#653 kind probe", currency: "MYR",
    lines: [
      { account_code: scene.target, debit_cents: 20000, credit_cents: 0, description: "charge" },
      { account_code: scene.prepaid, debit_cents: 0, credit_cents: 20000, description: "release" },
    ],
  };
  for (const kind of ["depreciation", "close", "period_close", "amortisation"]) {
    const { detail } = await assertPair(CLR.badRequest, PREPAY_REASON.planKindUnsupported,
      () => createAccountingPlan(scene.bob, {
        client: scene.client, kind, purpose: `unsupported ${kind}`,
        authorityRef: scene.authorityRef, frequency: "monthly", dayRule: "last_day_of_month",
        dayOfMonth: null, effectiveFrom: scene.termEnd, basis: b,
      }),
      `plan kind ${kind}`);
    assert.deepEqual(detail.supported,
      ["recurring_journal", "reversing_journal", "amortisation_schedule"],
      "the refusal NAMES what the widened slice does support");
  }

  // …and the new member IS admitted, through the plan door itself.
  const ok = await createAccountingPlan(scene.bob, {
    client: scene.client, kind: AMORTISATION_KIND, purpose: "hand-built amortisation plan",
    authorityRef: scene.authorityRef, frequency: "monthly", dayRule: "last_day_of_month",
    dayOfMonth: null, effectiveFrom: scene.termEnd, basis: b,
  });
  assert.equal(ok.kind, AMORTISATION_KIND);
  const chk = await rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'clara.accounting_plans'::regclass and conname = 'accounting_plans_kind_check'`);
  for (const member of ["recurring_journal", "reversing_journal", "amortisation_schedule"]) {
    assert.match(chk.rows[0].d, new RegExp(member), `the CHECK still admits ${member}`);
  }
});

// ===========================================================================================
// p653.revision — THE CADENCE IS UNREVISABLE, AND THE STORED LINES DO NOT MOVE.
// ===========================================================================================

test("p653.revision.cadence_pinned — revising an amortisation plan with a changed frequency or day rule refuses CLR10 through the shared schedule validator, and the stored period lines do not move", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("revise", { cents: 100000, termMonthsBack: 12, termMonths: 12 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  const before = await scheduleRow(created.schedule_id);
  const liveBasis = (await getPrepaymentSchedule(scene.bob, created.schedule_id)).live_revision.basis;

  for (const over of [{ frequency: "quarterly" }, { dayRule: "day_of_month", dayOfMonth: 15 }]) {
    await assertPair(CLR.badRequest, PREPAY_REASON.invalidSchedule,
      () => reviseAccountingPlan(scene.bob, {
        plan: created.plan_id, frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
        effectiveFrom: created.effective_from, effectiveTo: created.effective_to,
        basis: liveBasis, ...over,
      }),
      `revising an amortisation plan with ${JSON.stringify(over)}`);
  }

  // A revision that keeps the derived cadence and only narrows the authority window is ADMITTED —
  // "a revision can only move the authority window inside the derived bounds".
  const revised = await reviseAccountingPlan(scene.bob, {
    plan: created.plan_id, frequency: "monthly", dayRule: "last_day_of_month", dayOfMonth: null,
    effectiveFrom: created.effective_from, effectiveTo: created.effective_to, basis: liveBasis,
  });
  assert.equal(revised.revision, 2, "the predecessor is superseded and kept");

  const after = await scheduleRow(created.schedule_id);
  assert.deepEqual(after.period_lines, before.period_lines,
    "a revision is not a re-derivation: the stored allocation is untouched");
  assert.equal(after.total_cents, before.total_cents);
});

// ===========================================================================================
// p653.census — LEAST PRIVILEGE, AND THE FREEZE THAT BINDS THE EVALUATOR.
// ===========================================================================================

test("p653.census.grants — clara.prepayment_schedules is RLS-FORCED with a NULL relacl, the four doors are granted to clara_authenticated and nothing else, and the frozen evaluator is still ungranted and still matches its registered member hash", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const posture = await relationPosture("prepayment_schedules");
  assert.ok(posture, "the relation exists");
  assert.equal(posture.relrowsecurity, true);
  assert.equal(posture.relforcerowsecurity, true);
  assert.equal(posture.relacl, null,
    "zero relacl: every reach is a definer door, and a materialised owner ACL cannot be dumped");

  for (const sig of [
    DOOR_SIG,
    "clara.get_prepayment_schedule(uuid)",
    "clara.list_prepayment_schedules(uuid)",
    "clara.list_prepayment_attention(uuid)",
  ]) {
    const grants = await functionGrants(sig);
    assert.deepEqual(grants, [{ grantee: "clara_authenticated", privilege: "EXECUTE" }],
      `${sig} is granted to clara_authenticated and to nothing else`);
  }
  assert.deepEqual(await functionGrants("clara._plan_amortisation_period_line(uuid,date)"), [],
    "the per-period resolver is an internal, reachable only from the two basis callers");

  // THE EVALUATOR IS STILL DARK, AND STILL FROZEN. A grant minted to reach it from the new door
  // would red the rig (`rig-meta.mjs`'s closed ungranted census); an edit would red the apply.
  assert.deepEqual(await functionGrants("clara.prepayment_schedule_v1(uuid,uuid)"), [],
    "clara.prepayment_schedule_v1 holds NO grant — the door reaches it as a definer");
  const freeze = await evaluatorFreezeMatches();
  // #939 registered `prepayment_schedule` v2 BESIDE v1 (0305: v1's formula with the amount and the
  // term as arguments, for the memo-only lane). The reader returns every member of every version
  // of this evaluator NAME, so the count is now one member per registered version rather than one
  // outright — and the property this cell exists for is unchanged and asserted per row: each
  // registration is single-member, and each live body still hashes to what was registered.
  const v1Member = freeze.filter((r) => r.member_signature === "clara.prepayment_schedule_v1(uuid,uuid)");
  assert.equal(v1Member.length, 1, "0140's registration is still single-member");
  for (const m of freeze) {
    assert.equal(m.live, m.registered,
      `${m.member_signature}'s live body still hashes to its registered clara.evaluator_versions member`);
  }
});

test("p653.census.floor — a VIEWER cannot create a schedule, and a schedule id belonging to another firm answers exactly as an id naming nothing does", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("floor", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  await assertRaises(CLR.authz,
    () => createPrepaymentSchedule(scene.w.users.carol, {
      client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
      authorityRef: scene.authorityRef,
    }),
    "a viewer creating a prepayment schedule");

  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  // A viewer READS it — the read floor is viewer, as every 0193 read is.
  const seen = await getPrepaymentSchedule(scene.w.users.carol, created.schedule_id);
  assert.equal(seen.schedule_id, created.schedule_id);

  await assertPair(CLR.notFound, PREPAY_REASON.scheduleNotFound,
    () => getPrepaymentSchedule(scene.bob, nowhere()),
    "a schedule id this firm does not hold");
  await assertPair(CLR.notFound, PREPAY_REASON.scheduleNotFound,
    () => getPrepaymentSchedule(scene.w.users.dave, created.schedule_id),
    "another firm's member reading this schedule");
});

test("p653.list.schedules — the client's schedules list with their plan, status, window and next due date, and a client of another firm answers client_not_found", async (t) => {
  if (await assertPrepaymentCohortPresent(t)) return;
  const scene = await prepaymentScene("list", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, expenseAccount: scene.target,
    authorityRef: scene.authorityRef,
  });
  const answer = await listPrepaymentSchedules(scene.bob, scene.client);
  assert.equal(answer.client_id, scene.client);
  assert.equal(answer.schedules.length, 1);
  const row = answer.schedules[0];
  assert.equal(row.schedule_id, created.schedule_id);
  assert.equal(row.plan_id, created.plan_id);
  assert.equal(row.status, "active");
  assert.equal(row.period_count, 3);
  assert.equal(row.total_cents, 90000);
  assert.equal(row.expense_account_code, scene.target);
  assert.equal(row.prepaid_account_code, scene.prepaid);

  await assertPair(CLR.notFound, PREPAY_REASON.clientNotFound,
    () => listPrepaymentSchedules(scene.w.users.dave, scene.client),
    "another firm's member listing this client's schedules");
});
