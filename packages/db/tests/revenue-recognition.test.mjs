// #941 (second half) — DEFERRED REVENUE: RECOGNISE A RECEIPT PAID AHEAD BY A CUSTOMER AS REVENUE
// OVER ITS SERVICE PERIOD. Migration: 0308_deferred_revenue_recognition.sql. Frontier-gated on its
// own STABLE STEM (`deferred_revenue_recognition$`), never its number — numbers are claimed at
// merge (packages/db/README.md) — the `prepayment_schedule_obo_twin$` / `prepayment_stated_term$`
// idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY HUMAN CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits — through the `humanQuery(sub, namedCall(...))` wrappers #653's own battery uses. Every
// OBO cell runs on a REAL `clara_runtime` connection with no `request.jwt.claims` at all.
//
// THE FIRST HALF OF #941 IS NOT HERE. `2030 Deferred Revenue` reached the standard chart in the
// wave-4 pre-step (migration 0295, `my_sme_starter` v2); this battery CONSUMES it by name in
// `p941.standard_chart` and mints no chart row anywhere (lane rule (a)).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeferredLanePresent, endPool, rootQuery, CLR, CLR37, assertPair, assertRaises,
  account, opk, CONTROL_ASSET_CODE, ROSTER_AXIS, ROSTER_REASON,
  enrolDeferredAccount, retirePrepaymentAccount, enrolmentRow, enrolmentsFor,
  deferredRevenueScene, DEFERRED_PURPOSE, NOT_LIABILITY_AXIS,
  createRecognitionSchedule, recognitionScheduleRow, recognitionScheduleCountFor,
  recordStatedTerm, DR_REASON, DR_AXIS, RECOGNITION_KIND, RECOGNITION_PATTERN, REVENUE_BASIS,
  advanceReceipt, accountBalance, accountLines,
  wakeDuePlanOccurrences, occurrenceRows, workRow, claimWorkRun, settleWorkRun,
  mintClientObo, wakeRecordJournalEntry, receiptsForWork, requestPlanCatchUp,
  createRecognitionScheduleFor, createRecognitionScheduleForAs,
  readRecognitionSourceFor, readRecognitionSourceForAs, recognitionLaneGrants,
  chatTaskRef, refusalOf, planAuthority, opReceiptsFor, roleCanExecute, ROLES, nowhere,
  deactivateMember, reactivateMember,
  DR_HUMAN_SIG, DR_OBO_SIG, DR_READ_SIG,
  getRecognitionSchedule, listRecognitionSchedules, listRecognitionAttention,
  extraDocument, recordPeriod, monthEndAfter,
} from "./revenue-recognition-fixtures.mjs";
// THE STANDARD-CHART CELL's own doors, from the chart batteries that own them: a client born
// through clara.create_client and the onboarding commit, and clara.apply_coa_template against
// the estate's CURRENT published template. No surgery, and no chart row minted here.
import {
  applyTemplate, newInterviewClient, clientChartMap,
} from "./coa-template-pr-b-helpers.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 12;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["deferred_revenue_recognition$"]);
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
    if (await assertDeferredLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

/** #940's roster question, read as the owner — it is granted to NOBODY by design, so a cell that
 *  reached it as a human would be measuring a grant this lane must never mint. */
async function enrolled(client, code, purpose) {
  const r = await rootQuery(
    "select clara._prepayment_account_enrolled($1::uuid,$2::text,$3::text) as ok",
    [client, code, purpose]);
  return r.rows[0].ok;
}

// ===========================================================================================
// AC "the roster from #940 carries the purpose from birth; this ticket adds `deferred_revenue`
// and requires it at the door; no second roster" (owner decision 5, 2026-09-18).
// ===========================================================================================

cell("p941.enrol.deferred_revenue — the second purpose stops being a column and becomes a rule: a LIABILITY enrols under deferred_revenue with who/when/why, an asset does not, a liability still cannot enrol as a prepayment, the shared wall still guards both, the two purposes do not leak into one another, and retiring closes the one it names", async () => {
  const scene = await deferredRevenueScene("enrol", { cents: 90000, termMonths: 3, enrol: false });

  // BEFORE #941 THIS EXACT CALL ANSWERED `purpose_rule_not_stated` NAMING THIS TICKET (0306 §B).
  // The positive control is the whole first acceptance row: the purpose now has a rule.
  const enrolment = await enrolDeferredAccount(scene.bob, {
    client: scene.client, account: scene.deferred });
  assert.ok(enrolment.enrolment_id, "the door names the row it wrote");
  assert.equal(enrolment.client_id, scene.client);
  assert.equal(enrolment.account_code, scene.deferred);
  assert.equal(enrolment.purpose, DEFERRED_PURPOSE,
    "the SAME roster carries the second purpose — no second relation (owner decision 5)");
  assert.equal(enrolment.active, true);

  const row = await enrolmentRow(enrolment.enrolment_id);
  assert.equal(row.client_id, scene.client, "the enrolment is PER CLIENT");
  assert.equal(row.account_code, scene.deferred);
  assert.equal(row.purpose, DEFERRED_PURPOSE);
  assert.ok(row.reason && row.reason.trim().length > 0, "the reason is stored, never defaulted");
  assert.ok(row.created_by, "…and WHO enrolled it");
  assert.ok(row.enrolled_at, "…and WHEN");
  assert.equal(row.active, true);
  assert.equal(row.retired_at, null);

  // A VIEWER STILL CANNOT. The floor did not move with the purpose.
  await assertRaises(CLR.authz,
    () => enrolDeferredAccount(scene.w.users.carol, {
      client: scene.client, account: scene.deferred }),
    "a viewer enrolling a deferred-revenue account");

  // THE ONE POSITIVE RULE THIS PURPOSE ADDS: deferred revenue is a LIABILITY. The scene's own
  // prepaid ASSET is refused by name, and the refusal names the type it found.
  const asAsset = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, { client: scene.client, account: scene.prepaid }),
    "an ASSET enrolled as deferred revenue");
  assert.equal(asAsset.detail.axis, NOT_LIABILITY_AXIS,
    "the refusal names the AXIS, so the panel can point at the field");
  assert.equal(asAsset.detail.account_type, "asset", "…and the type it actually found");
  assert.equal(asAsset.detail.purpose, DEFERRED_PURPOSE);

  // …AND THE PREPAYMENT RULE IS UNTOUCHED: the liability cannot enrol as a prepaid asset.
  const asPrepay = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, {
      client: scene.client, account: scene.deferred, purpose: "prepayment" }),
    "a LIABILITY enrolled as a prepayment");
  assert.equal(asPrepay.detail.axis, ROSTER_AXIS.notAssetClass,
    "#940's own axis, unmoved — this file widens the door, it does not rewrite it");

  // THE SHARED NEGATIVE WALL IS STILL ASKED FIRST, and it is purpose-agnostic: the estate's own
  // receivable CONTROL account is refused with the WALL's own axis carried through, whichever
  // purpose is named.
  const ctl = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, {
      client: scene.client, account: CONTROL_ASSET_CODE }),
    "a control account enrolled as deferred revenue");
  assert.equal(ctl.detail.axis, ROSTER_AXIS.controlAccount,
    "the wall answers before the type rule — an account that fails both is told the harder fact");

  // AN UNKNOWN CODE IS THE WALL'S ANSWER TOO, not a type answer: the type rule reads a row that
  // is not there, and a rule that ran first would answer `not_liability_class` about nothing.
  const unknown = await assertPair(CLR37, ROSTER_REASON.invalid,
    () => enrolDeferredAccount(scene.bob, { client: scene.client, account: "29999999" }),
    "an unknown code enrolled as deferred revenue");
  assert.equal(unknown.detail.axis, ROSTER_AXIS.accountUnknown);

  // THE TWO PURPOSES DO NOT LEAK. One live enrolment answers for the purpose it names and for no
  // other — the predicate three doors share is keyed on (client, account, purpose).
  assert.equal(await enrolled(scene.client, scene.deferred, DEFERRED_PURPOSE), true);
  assert.equal(await enrolled(scene.client, scene.deferred, "prepayment"), false,
    "enrolling an account for deferred revenue does not enrol it for prepayments");
  assert.equal(await enrolled(scene.client, scene.prepaid, DEFERRED_PURPOSE), false,
    "…and the scene's enrolled PREPAID account is not a deferred-revenue account");

  // VERSION-FORWARD, NEVER MUTATE, on this purpose too: a restated reason retires the live row and
  // inserts a fresh one, so the basis a schedule was configured under stays readable.
  const restated = await enrolDeferredAccount(scene.bob, {
    client: scene.client, account: scene.deferred,
    reason: "#941 battery: re-purposed to annual membership advances at the July review" });
  assert.notEqual(restated.enrolment_id, enrolment.enrolment_id, "a restated reason is a NEW row");
  const all = await enrolmentsFor(scene.client, scene.deferred, DEFERRED_PURPOSE);
  assert.equal(all.length, 2, "both enrolments are on the record — an interval is never overwritten");
  assert.equal(all.filter((x) => x.active).length, 1,
    "exactly ONE live enrolment per (client, account, purpose)");

  // RETIRING NAMES ITS PURPOSE. The account comes off the deferred-revenue roster and the
  // predicate goes false — driven through the real door, never asserted.
  await retirePrepaymentAccount(scene.bob, {
    client: scene.client, account: scene.deferred, purpose: DEFERRED_PURPOSE });
  assert.equal(await enrolled(scene.client, scene.deferred, DEFERRED_PURPOSE), false,
    "retiring closes the enrolment the caller named");
});

// ===========================================================================================
// AC1 / AC2 / AC3 — THE SCHEDULE ITSELF: a plan of the new kind, a relation in the prepayment
// schedule's shape, the single CREDITED LIABILITY leg as the amount, #939's evaluator with the
// release side set to DEBIT, and a term a person stated.
// ===========================================================================================

cell("p941.create.configures — an advance receipt with no stated term is refused by name and configures nothing; once a person states the term the door derives twelve whole months from the credited liability leg, puts the cent remainder in the final period, records the revenue account with its written basis, rides a revenue_recognition_schedule plan, and refuses a second schedule over the same receipt", async () => {
  // A TWELVE-MONTH MEMBERSHIP FEE of RM 12,000.07 — an amount with a remainder, so the final
  // period is a measurement rather than a coincidence.
  const scene = await deferredRevenueScene("create", {
    cents: 1200007, termMonthsBack: 13, termMonths: 12 });

  // (a) NO TERM YET. The refusal NAMES the carrier and the door that fills it — #939's own remedy
  // shape — and writes nothing.
  const noTerm = await assertPair(CLR.badRequest, DR_REASON.termUnderivable,
    () => createRecognitionSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
      authorityRef: scene.authorityRef }),
    "recognising an advance whose service period nobody has stated");
  assert.equal(noTerm.detail.missing, "prepayment_stated_terms");
  assert.equal(noTerm.detail.remedy, "clara.record_prepayment_stated_term",
    "the refusal names the person's next act, not a dead end");
  assert.equal(noTerm.detail.source_entry, scene.receipt);
  assert.equal(await recognitionScheduleCountFor(scene.receipt), 0,
    "a create-time refusal writes no schedule row");

  // (b) THE TERM, stated by a named person with their reason — #939's door unchanged, reached
  // here over a RECEIPT rather than a payment, which is why anchoring it to the ENTRY rather than
  // to a side of the books was the right shape.
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: the membership runs twelve months from the date of the advance" });
  assert.ok(stated.stated_term_id);

  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });

  assert.ok(made.schedule_id, "the door names the schedule it wrote");
  assert.ok(made.plan_id, "…and the plan it rides");
  assert.equal(made.kind, RECOGNITION_KIND, "a plan kind of its own, not the amortisation one");
  assert.equal(made.configuration_only, true,
    "accepted configuration is not a posted occurrence, and the door says so itself");
  assert.equal(made.client_id, scene.client);
  assert.equal(made.source_entry_id, scene.receipt);
  assert.equal(made.term_source, "human_stated");
  assert.equal(made.stated_term_id, stated.stated_term_id);
  assert.equal(made.document_id, null, "a memo-only receipt binds no document");
  assert.equal(made.service_period_id, null);
  assert.equal(made.basis_kind, "human_stated");
  assert.equal(made.term_start, scene.termStart);
  assert.equal(made.term_end, scene.termEnd);

  // THE AMOUNT IS THE CREDITED LIABILITY LEG'S, never the receipt's debit total — the SST cell
  // below is where the two genuinely differ.
  assert.equal(Number(made.total_cents), 1200007);
  assert.equal(made.period_count, 12, "twelve whole calendar months");
  assert.equal(made.deferred_account_code, scene.deferred);
  assert.equal(made.revenue_account_code, scene.revenue);
  assert.equal(made.revenue_account_basis, REVENUE_BASIS,
    "the accountant's written grounds for the revenue classification are recorded verbatim");
  assert.equal(made.remainder_placement, "final_period");
  assert.equal(made.recognition_pattern, RECOGNITION_PATTERN);
  assert.equal(made.schedule_version, "v2", "#939's evaluator, ridden with the release side DEBIT");

  // THE ALLOCATION, against a worked example rather than a re-computation: 1,200,007 over twelve
  // months is eleven periods of 100,000 and a final period of 100,007.
  const lines = made.period_lines;
  assert.equal(lines.length, 12);
  for (let i = 0; i < 11; i += 1) {
    assert.equal(Number(lines[i].amount_cents), 100000, "each ordinary period charges the base");
    assert.equal(Number(lines[i].debit_cents), 100000,
      "the evaluator released the LIABILITY by debit");
    assert.equal(Number(lines[i].credit_cents), 0);
  }
  assert.equal(Number(lines[11].amount_cents), 100007,
    "the cent remainder lands in the final period");
  assert.equal(lines.reduce((a, l) => a + Number(l.amount_cents), 0), 1200007,
    "…and the twelve periods sum to the liability, so it clears to zero");
  for (const l of lines) {
    assert.equal(l.deferred_account_code, scene.deferred);
    assert.equal(l.revenue_account_code, scene.revenue);
  }

  // THE DERIVED CADENCE IS NOT THE CALLER'S. The door echoes it so a surface can SEE that none of
  // it was theirs to choose.
  assert.equal(made.frequency, "monthly");
  assert.equal(made.day_rule, "last_day_of_month");
  assert.equal(made.day_of_month, null);
  assert.equal(made.timezone, "Asia/Kuala_Lumpur");
  assert.equal(made.effective_from, lines[0].period_end,
    "the window opens on the FIRST period's month end");
  assert.equal(made.effective_to, lines[11].period_end, "…and closes on the LAST period's");

  // THE ROW SAYS THE SAME THING, read off the RELATION rather than off the door's own answer.
  const row = await recognitionScheduleRow(made.schedule_id);
  assert.equal(row.client_id, scene.client);
  assert.equal(row.plan_kind, RECOGNITION_KIND);
  assert.equal(row.source_entry_id, scene.receipt);
  assert.equal(row.deferred_account_code, scene.deferred);
  assert.equal(row.revenue_account_code, scene.revenue);
  assert.equal(row.revenue_account_basis, REVENUE_BASIS);
  assert.equal(Number(row.total_cents), 1200007);
  assert.equal(row.period_count, 12);
  assert.equal(row.term_source, "human_stated");
  assert.equal(row.stated_term_id, stated.stated_term_id);
  assert.equal(row.document_id, null);
  assert.equal(row.service_period_id, null);
  assert.equal(row.recognition_pattern, RECOGNITION_PATTERN);
  assert.ok(row.created_by, "…and WHO configured it");

  // THE PLAN ROW ITSELF CARRIES THE NEW KIND, which is what makes the monthly admission arm
  // reachable at all.
  const plan = await rootQuery(
    "select kind, status from clara.accounting_plans where id = $1", [made.plan_id]);
  assert.equal(plan.rows[0].kind, RECOGNITION_KIND);
  assert.equal(plan.rows[0].status, "active");

  // ONE SCHEDULE PER RECEIPT, answered by name and naming the schedule that already stands, so a
  // surface can send the caller there instead of offering a second configuration.
  const dup = await assertPair("CLR13", DR_REASON.scheduleExists,
    () => createRecognitionSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
      authorityRef: scene.authorityRef }),
    "a second recognition schedule over one receipt");
  assert.equal(dup.detail.schedule_id, made.schedule_id);
  assert.equal(await recognitionScheduleCountFor(scene.receipt), 1);
});

// ===========================================================================================
// AC2 / AC4 — EVERY REASON A RECEIPT CANNOT BE RECOGNISED, answered by name on the SOURCE side.
// ===========================================================================================

cell("p941.create.refusals — a draft receipt, a receipt with no liability leg, a receipt with two, an unenrolled account and a pattern this estate does not offer are each refused by name; the roster answers ahead of the shared wall; enrolling the account makes the same call succeed; and not one refusal writes a schedule", async () => {
  const scene = await deferredRevenueScene("refuse", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, enrol: false });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: a three-month retainer paid up front" });
  const call = (over = {}) => createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef, ...over });

  // (a) THE ROSTER ANSWERS FIRST, and it names the remedy and the panel — the axis #940's own web
  // surface already renders, so a twin that spells it identically inherits the surface for free.
  const notEnrolled = await assertPair(CLR.badRequest, DR_REASON.sourceUnfit, () => call(),
    "recognising into an account nobody enrolled");
  assert.equal(notEnrolled.detail.axis, DR_AXIS.notEnrolled);
  assert.equal(notEnrolled.detail.deferred_account_code, scene.deferred);
  assert.equal(notEnrolled.detail.remedy, "clara.enrol_prepayment_account");
  assert.equal(notEnrolled.detail.panel, "client_registers_prepayment_accounts");
  assert.equal(await recognitionScheduleCountFor(scene.receipt), 0, "…and it configured nothing");

  // …AND IT IS A GATE, NOT A BAN: enrolling the very same account makes the very same call
  // succeed. A refusal a person cannot clear would be a wall, and this one is a door.
  await enrolDeferredAccount(scene.bob, { client: scene.client, account: scene.deferred });
  const ok = await call();
  assert.ok(ok.schedule_id, "once the account is on the roster the same call configures");
  assert.equal(ok.deferred_account_code, scene.deferred);

  // (b) A DRAFT RECEIPT. A schedule recognises money that is ON the books.
  const draft = await advanceReceipt(scene, { cents: 30000, approve: false, tag: "draft" });
  const notPosted = await assertPair(CLR.badRequest, DR_REASON.sourceUnfit,
    () => call({ sourceEntry: draft.entry }), "recognising a receipt that has not posted");
  assert.equal(notPosted.detail.axis, DR_AXIS.notPosted);
  assert.equal(notPosted.detail.status, "draft");

  // (c) NO CANDIDATE LEG AT ALL — a receipt taken straight to revenue has nothing deferred about
  // it, and the count is REPORTED rather than guessed at.
  const straight = await advanceReceipt(scene, {
    cents: 25000, creditIncome: scene.revenue, tag: "straight" });
  const noLeg = await assertPair(CLR.badRequest, DR_REASON.sourceUnfit,
    () => call({ sourceEntry: straight.entry }),
    "recognising a receipt that credits no liability");
  assert.equal(noLeg.detail.candidate_legs, 0);

  // (d) TWO CANDIDATE LEGS. Picking one of them would be the database choosing a number.
  const second = await account(scene.alice, {
    client: scene.client, code: "20300002", name: "Deferred maintenance revenue",
    type: "liability" });
  const ambiguous = await advanceReceipt(scene, {
    cents: 40000, extraLiability: { code: second, cents: 15000 }, tag: "ambiguous" });
  const twoLegs = await assertPair(CLR.badRequest, DR_REASON.sourceUnfit,
    () => call({ sourceEntry: ambiguous.entry }),
    "recognising a receipt that credits two liability accounts");
  assert.equal(twoLegs.detail.candidate_legs, 2,
    "the ambiguity is reported as a COUNT, so a surface can say what it found");
  assert.equal(await recognitionScheduleCountFor(ambiguous.entry), 0);

  // (e) ONE PATTERN ONLY. The argument exists so a caller can ASK; the answer names what this
  // estate does offer rather than silently substituting it.
  const pattern = await assertPair(CLR.badRequest, DR_REASON.patternUnsupported,
    () => call({ sourceEntry: draft.entry, pattern: "usage" }),
    "recognising on a usage-based pattern");
  assert.equal(pattern.detail.pattern, "usage");
  assert.deepEqual(pattern.detail.supported, ["straight_line"]);
  // …and it is answered BEFORE anything about the receipt, which is why a DRAFT receipt still
  // gets the pattern refusal rather than the not-posted one: an argument the door cannot honour
  // is the caller's own mistake and is named first.
  const milestone = await assertPair(CLR.badRequest, DR_REASON.patternUnsupported,
    () => call({ pattern: "milestone" }), "recognising on a milestone pattern");
  assert.equal(milestone.detail.pattern, "milestone");
});

// ===========================================================================================
// AC2 — THE REVENUE ACCOUNT IS A JUDGEMENT, AND IT CARRIES ITS GROUNDS.
// ===========================================================================================

cell("p941.target.refusals — the revenue account must be named, must be on this client's chart, must be an INCOME account, must pass the estate's own eligibility wall, and must arrive with the accountant's written grounds", async () => {
  const scene = await deferredRevenueScene("target", { cents: 90000, termMonths: 3 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: a three-month retainer paid up front" });
  const call = (over = {}) => createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef, ...over });

  const missing = await assertPair(CLR.badRequest, DR_REASON.targetUnderivable,
    () => call({ revenueAccount: "   " }), "recognising with no revenue account named");
  assert.equal(missing.detail.axis, DR_AXIS.accountMissing);

  const unknown = await assertPair(CLR.badRequest, DR_REASON.targetIneligible,
    () => call({ revenueAccount: "49999999" }), "recognising into a code this chart does not hold");
  assert.equal(unknown.detail.axis, DR_AXIS.accountUnknown);
  assert.equal(unknown.detail.account_code, "49999999");

  // RECOGNISING AN ADVANCE CREDITS INCOME. The scene's own EXPENSE target would recognise it
  // backwards; the deferred LIABILITY itself would move it sideways and never recognise anything.
  const expense = await assertPair(CLR.badRequest, DR_REASON.targetIneligible,
    () => call({ revenueAccount: scene.target }), "recognising into an expense account");
  assert.equal(expense.detail.axis, DR_AXIS.notIncomeClass);
  assert.equal(expense.detail.account_type, "expense");
  const liability = await assertPair(CLR.badRequest, DR_REASON.targetIneligible,
    () => call({ revenueAccount: scene.deferred }), "recognising into the liability itself");
  assert.equal(liability.detail.axis, DR_AXIS.notIncomeClass);
  assert.equal(liability.detail.account_type, "liability");

  // A JUDGEMENT WITH NO RECORDED BASIS is what this wall exists to prevent.
  const noBasis = await assertPair(CLR.badRequest, DR_REASON.targetUnderivable,
    () => call({ revenueBasis: "   " }), "recognising with no stated grounds");
  assert.equal(noBasis.detail.axis, DR_AXIS.basisMissing);

  assert.equal(await recognitionScheduleCountFor(scene.receipt), 0,
    "not one of the five refusals wrote a schedule");

  // THE POSITIVE CONTROL, so none of the above is vacuous.
  const made = await call();
  assert.equal(made.revenue_account_code, scene.revenue);
});

// ===========================================================================================
// AC1 / AC3 / AC4 — THE BOOKS. Twelve months really post, the liability really clears to zero,
// and the SST output line the invoice put on the receipt is never moved.
// ===========================================================================================

cell("p941.posts.full_year — a twelve-month advance with SST output tax on the same receipt recognises twelve months through the plan lane, each period posting Dr deferred revenue / Cr revenue for its own amount with the remainder in the final period, clearing the liability to exactly zero and recognising exactly the advance, while the SST output account keeps the ONE line the receipt gave it", async () => {
  // THE SHAPE OF A REAL MALAYSIAN MEMBERSHIP RECEIPT: RM 12,000.07 of service billed ahead plus
  // RM 720.00 of service tax, banked as one sum. The tax is a liability owed to the Royal
  // Malaysian Customs Department and is not part of what this schedule may ever touch.
  const scene = await deferredRevenueScene("posts", {
    cents: 1200007, termMonthsBack: 13, termMonths: 12, sstCents: 72000 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: a twelve-month membership taken in advance, tax charged on the same receipt" });

  const deferredBefore = await accountBalance(scene.client, scene.deferred);
  const revenueBefore = await accountBalance(scene.client, scene.revenue);
  const sstBefore = await accountBalance(scene.client, scene.sst);
  assert.equal(deferredBefore, -1200007n,
    "the receipt credited the liability with the service amount only");
  assert.equal(sstBefore, -72000n, "…and the tax with the tax");
  assert.equal(revenueBefore, 0n, "nothing is revenue yet");

  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });
  assert.equal(Number(made.total_cents), 1200007,
    "the schedule is over the DEFERRED leg, never the receipt's banked total of 1,272,007");
  assert.equal(made.period_count, 12);

  // THE PLAN LANE, DRIVEN RATHER THAN ASSERTED. The nightly scan admits the LATEST due period
  // only (`clara._plan_admissible_event`, measured), so a term that ended before today is caught
  // up through the estate's OWN window door — a bookkeeper asking for the periods the schedule
  // owes. The catch-up admits at most twelve events, which is exactly a year of months.
  await wakeDuePlanOccurrences({ limit: 100 });
  await requestPlanCatchUp(scene.bob, {
    plan: made.plan_id, from: made.effective_from, to: made.effective_to });
  const admitted = (await occurrenceRows(made.plan_id)).filter((o) => o.work_id);
  assert.equal(admitted.length, 12,
    "twelve due periods were admitted, one Work each — the schedule owes a month a month");

  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  for (const occ of admitted) {
    const w = await workRow(occ.work_id);
    await claimWorkRun({ task: w.current_task_id, runId: opk("p941-run") });
    const entry = await wakeRecordJournalEntry(obo.secret, {
      client: scene.client, work: occ.work_id, logicalOpId: w.logical_op_id, basis: w.basis });
    assert.equal(entry.posted, true, `the period due ${occ.due_date} really reached the books`);
    await settleWorkRun({
      task: w.current_task_id, outcome: "completed", result: { entry_id: entry.entry_id } });
    const receipts = await receiptsForWork(occ.work_id);
    assert.equal(receipts.filter((x) => x.outcome === "committed").length, 1,
      "exactly one committed receipt stands for each period");
  }

  // THE LIABILITY CLEARS TO EXACTLY ZERO, which is the whole acceptance row, and the revenue
  // recognised is exactly the advance. Balances are summed off the POSTED ledger, never off the
  // schedule's own projection.
  assert.equal(await accountBalance(scene.client, scene.deferred), 0n,
    "the deferred-revenue liability clears to zero at the end of the service period");
  assert.equal(await accountBalance(scene.client, scene.revenue), -1200007n,
    "…and exactly the advance has become revenue, remainder and all");

  // THE TAX LEG NEVER MOVED. Not "the total is the same" — the ACCOUNT still carries the ONE line
  // the receipt gave it, so nothing in this lane can have touched it and netted out.
  assert.equal(await accountBalance(scene.client, scene.sst), sstBefore,
    "the SST output tax liability is exactly where the receipt left it");
  const sstLines = await accountLines(scene.client, scene.sst);
  assert.equal(sstLines.length, 1, "exactly ONE posted line ever touched the tax account");
  assert.equal(sstLines[0].entry_id, scene.receipt, "…and it is the receipt itself");
  assert.equal(Number(sstLines[0].credit_cents), 72000);

  // THE TWELVE ENTRIES ARE THE MIRROR OF AN AMORTISATION: Dr the liability, Cr the revenue, each
  // for its own period's amount, with the cent remainder in the last one.
  const drLines = await accountLines(scene.client, scene.deferred);
  assert.equal(drLines.length, 13, "the receipt's credit plus twelve debits");
  const debits = drLines.filter((l) => Number(l.debit_cents) > 0)
    .map((l) => Number(l.debit_cents));
  assert.equal(debits.length, 12);
  assert.equal(debits.filter((c) => c === 100000).length, 11);
  assert.equal(debits.filter((c) => c === 100007).length, 1,
    "exactly one period carries the cent remainder");
});

// ===========================================================================================
// AC "an on-behalf twin door in the shape of #915" — the conversation half's DATABASE door.
// ===========================================================================================

/** A scene whose memo-only receipt already carries a stated term, so every OBO cell measures the
 *  IDENTITY walls rather than the term arm. */
async function oboScene(tag, over = {}) {
  const scene = await deferredRevenueScene(tag, { cents: 90000, termMonths: 3, ...over });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: a three-month retainer the member paid up front" });
  return scene;
}

cell("p941.obo.configures — a runtime session with NO jwt configures a recognition schedule on behalf of a named bookkeeper, the schedule and the plan name that human and cite the conversation, the human door's ACL is untouched, every other lane is refused by Postgres before a line of the body runs, and the two entrances share ONE op-key namespace", async () => {
  const scene = await oboScene("obo");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const args = {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: ref };

  const made = await createRecognitionScheduleFor({ ...args, author: scene.bob });
  assert.ok(made.schedule_id, "the twin configures");
  assert.equal(made.kind, RECOGNITION_KIND);
  assert.equal(made.configuration_only, true);
  assert.equal(made.deferred_account_code, scene.deferred);
  assert.equal(made.revenue_account_code, scene.revenue);
  assert.equal(made.term_source, "human_stated");

  // THE AUTHOR IS THE HUMAN, NEVER THE RUN — on the schedule ROW and on the PLAN.
  const row = await recognitionScheduleRow(made.schedule_id);
  assert.equal(row.created_by, scene.bob, "the schedule names the human it acted for");
  const plan = await planAuthority(made.plan_id);
  assert.equal(plan.authorised_by, scene.bob, "…and the plan's authority is that human's");
  assert.equal(plan.created_by, scene.bob);
  assert.equal(plan.kind, RECOGNITION_KIND);
  assert.equal(plan.authority_kind, "explicit_instruction");
  assert.deepEqual(plan.authority_ref, ref, "…citing the conversation it was asked in");

  // THE ACL, READ POSITIVELY IN BOTH DIRECTIONS. A grant assertion that only read "runtime can"
  // would miss a second door being opened to a lane that must never hold it.
  assert.equal(await roleCanExecute(ROLES.runtime, DR_OBO_SIG), true);
  assert.equal(await roleCanExecute(ROLES.runtime, DR_READ_SIG), true);
  for (const role of [ROLES.authenticated, ROLES.agentRo,
    ROLES.wakeInteractive, ROLES.wakeProactive, "public"]) {
    assert.equal(await roleCanExecute(role, DR_OBO_SIG), false, `${role} must not reach the twin`);
    assert.equal(await roleCanExecute(role, DR_READ_SIG), false, `${role} must not reach the read`);
  }
  assert.equal(await roleCanExecute(ROLES.authenticated, DR_HUMAN_SIG), true);
  assert.equal(await roleCanExecute(ROLES.runtime, DR_HUMAN_SIG), false,
    "the human door stays human — a runtime grant there would be a configuration naming nobody");

  // …AND THE WHOLE LANE, ENUMERATED rather than sampled: `clara_runtime` reaches exactly two
  // functions of it, the agent role and both wake roles reach none, and PUBLIC reaches none.
  const lane = await recognitionLaneGrants();
  assert.deepEqual(lane.filter((f) => f.runtime).map((f) => f.proname).sort(),
    ["create_revenue_recognition_schedule_for", "read_revenue_recognition_source_for"]);
  assert.deepEqual(lane.filter((f) => f.agent_ro || f.wake_interactive || f.wake_proactive || f.pub)
    .map((f) => f.proname), [],
    "no agent, wake or PUBLIC principal reaches anything in this lane");
  assert.deepEqual(lane.filter((f) => f.authenticated).map((f) => f.proname).sort(),
    ["create_revenue_recognition_schedule", "get_revenue_recognition_schedule",
      "list_revenue_recognition_attention", "list_revenue_recognition_schedules"],
    "the human lane is the one write and the three reads, and nothing else");

  // A LANE THAT HOLDS NO GRANT IS REFUSED BY POSTGRES, not by the body: 42501, before a single
  // line of the twin runs.
  await assertRaises("42501",
    () => createRecognitionScheduleForAs(ROLES.agentRo, { ...args, author: scene.bob }),
    "the agent read role calling the OBO twin");
  await assertRaises("42501",
    () => readRecognitionSourceForAs(ROLES.agentRo, {
      firm: scene.firm, client: scene.client, sourceEntry: scene.receipt }),
    "the agent read role calling the machine-lane read");

  // ONE OP-KEY NAMESPACE. The case the brief names: a person asks Clara, the response is lost, and
  // the person then does it themselves under the key their own client already holds.
  const second = await oboScene("obo-key");
  const ref2 = await chatTaskRef({ firm: second.firm, client: second.client, author: second.bob });
  const shared = { client: second.client, sourceEntry: second.receipt,
    revenueAccount: second.revenue, authorityRef: ref2 };
  const key = opk("p941-shared-key");
  const byChat = await createRecognitionScheduleFor({ ...shared, author: second.bob, opKey: key });
  const byHuman = await createRecognitionSchedule(second.bob, { ...shared, opKey: key });
  assert.deepEqual(byHuman, byChat,
    "the human replay REPLAYS the chat's receipt, byte for byte, including the allocation");
  assert.equal(await recognitionScheduleCountFor(second.receipt), 1, "exactly ONE schedule exists");
  const receipts = await opReceiptsFor(second.firm, key);
  assert.equal(receipts.length, 1, "ONE op receipt — the two entrances did not open two namespaces");
  assert.equal(receipts[0].fn, "create_revenue_recognition_schedule",
    "…under the shared verb name, which is what makes the namespace one");
});

cell("p941.obo.authority — the twin refuses a null author by name, answers a NON-MEMBER author with the same CLR11 client_not_found (message and payload) as a client this database does not hold, refuses CLR04 authority_lost for a withdrawn membership, writes nothing on any of them, and the shared rules answer identically at both entrances", async () => {
  const scene = await oboScene("obo-auth");
  const ref = await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob });
  const call = (over = {}) => createRecognitionScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.receipt,
    revenueAccount: scene.revenue, authorityRef: ref, opKey: opk("p941-auth"), ...over });

  // 1 — A NULL AUTHOR is its own mistake, answered before the client is read, so it can leak
  //     nothing about which clients exist.
  const nullAuthor = await assertPair(CLR.badRequest, "invalid_author",
    () => call({ author: null }), "an OBO configuration naming no human at all");
  assert.equal(nullAuthor.detail.field, "author");

  // 2 — A NON-MEMBER AUTHOR AND AN UNKNOWN CLIENT ARE ONE ANSWER. Compared MESSAGE AND PAYLOAD,
  //     not merely code plus token: a sentence that differed would be the existence oracle this
  //     shape exists to prevent.
  const stranger = await assertPair(CLR.notFound, "client_not_found",
    () => call({ author: scene.w.users.dave }), "an OBO configuration for a non-member");
  const unknownClient = await assertPair(CLR.notFound, "client_not_found",
    () => call({ client: nowhere() }), "an OBO configuration for an unknown client");
  assert.equal(stranger.err.message, unknownClient.err.message,
    "a non-member author and an unknown client answer the SAME sentence");
  assert.equal(stranger.err.detail, unknownClient.err.detail, "…and the same payload");

  // 3 — AUTHORITY MUST BE LIVE AT THE MOMENT THE BOOKS ARE CONFIGURED.
  await deactivateMember(scene.alice, { firm: scene.firm, user: scene.bob });
  try {
    await assertPair(CLR.authz, "authority_lost", () => call(),
      "an OBO configuration for a human whose membership was withdrawn");
  } finally {
    await reactivateMember({ firm: scene.firm, user: scene.bob });
  }
  // …and a VIEWER author is refused by rank, with the estate's own token.
  await assertPair(CLR.authz, "insufficient_role",
    () => call({ author: scene.w.users.carol }), "an OBO configuration for a viewer");

  assert.equal(await recognitionScheduleCountFor(scene.receipt), 0, "no schedule from any refusal");

  // 4 — THE SHARED RULES ANSWER IDENTICALLY AT BOTH ENTRANCES, compared as ONE value. This is what
  //     the single shared core buys: a divergence that kept the token and changed the sentence
  //     would still be a divergence, because the sentence is what a surface renders.
  const shared = [
    ["a blank purpose", { purpose: "   " }],
    ["a blank revenue account", { revenueAccount: "   " }],
    ["a blank revenue basis", { revenueBasis: "   " }],
    ["an unknown revenue code", { revenueAccount: "49999999" }],
    ["a balance-sheet target", { revenueAccount: scene.deferred }],
    ["a pattern this estate does not offer", { pattern: "usage" }],
    ["an unknown source entry", { sourceEntry: nowhere() }],
    ["an authority reference of the wrong shape", { authorityRef: { kind: "nonsense", id: nowhere() } }],
    ["an authority reference that resolves to nothing", { authorityRef: { kind: "chat_task", id: nowhere() } }],
  ];
  for (const [label, over] of shared) {
    const byObo = await refusalOf(() => createRecognitionScheduleFor({
      client: scene.client, author: scene.bob, sourceEntry: scene.receipt,
      revenueAccount: scene.revenue, authorityRef: ref, opKey: opk("p941-m-obo"), ...over }),
      `${label} (OBO)`);
    const byHuman = await refusalOf(() => createRecognitionSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.receipt,
      revenueAccount: scene.revenue, authorityRef: ref, opKey: opk("p941-m-human"), ...over }),
      `${label} (human)`);
    assert.deepEqual(byObo, byHuman, `${label}: the two entrances answer identically`);
  }

  // 5 — THE POSITIVE CONTROL, so the whole cell is not a list of things that fail anyway.
  const ok = await call({ opKey: opk("p941-auth-ok") });
  assert.ok(ok.schedule_id, "the same configuration succeeds once authority is live and the args are right");
});

cell("p941.read.recorded_term — the machine-lane read answers the RECORDED term on both carriers, reports an absent one as absent with the human door that fills it, reports the candidate-leg count rather than guessing, names the schedule once one stands, answers another firm's entry as not found, and carries no document bytes at all", async () => {
  const scene = await oboScene("read");
  const scope = { firm: scene.firm, client: scene.client, sourceEntry: scene.receipt };

  const stated = await readRecognitionSourceFor(scope);
  assert.equal(stated.status, "ok");
  assert.equal(stated.source_entry_id, scene.receipt);
  assert.equal(stated.entry.status, "approved");
  assert.equal(stated.entry.document_id, null);
  assert.equal(stated.deferred.account_code, scene.deferred);
  assert.equal(Number(stated.deferred.total_cents), 90000);
  assert.equal(stated.deferred.candidate_legs, 1);
  assert.equal(stated.term.source, "human_stated");
  assert.equal(stated.term.period_start, scene.termStart);
  assert.equal(stated.term.period_end, scene.termEnd);
  assert.equal(stated.term.basis_kind, "human_stated");
  assert.ok(stated.term.basis_text.includes("retainer"),
    "the grounds the person WROTE, not a paraphrase");
  assert.equal(stated.schedule, null, "no schedule stands yet");

  // AN ABSENT TERM IS REPORTED AS ABSENT, with the HUMAN door that fills it — never as an empty
  // term a run could read as "no term is needed".
  const bare = await advanceReceipt(scene, { cents: 45000, tag: "bare" });
  const noTerm = await readRecognitionSourceFor({ ...scope, sourceEntry: bare.entry });
  assert.equal(noTerm.term.source, null);
  assert.equal(noTerm.term.period_start, null);
  assert.equal(noTerm.term.remedy, "clara.record_prepayment_stated_term");

  // A RECEIPT WITH NO CANDIDATE LEG REPORTS THE COUNT and names no account, rather than raising:
  // the Work's own prompt has to be able to say what it found.
  const straight = await advanceReceipt(scene, {
    cents: 25000, creditIncome: scene.revenue, tag: "straight" });
  const zero = await readRecognitionSourceFor({ ...scope, sourceEntry: straight.entry });
  assert.equal(zero.deferred.candidate_legs, 0);
  assert.equal(zero.deferred.account_code, null);
  assert.equal(zero.deferred.total_cents, null);

  // ONCE A SCHEDULE STANDS, THE READ NAMES IT — so a run can see the work is already done instead
  // of proposing it again.
  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });
  const after = await readRecognitionSourceFor(scope);
  assert.equal(after.schedule.schedule_id, made.schedule_id);
  assert.equal(after.schedule.plan_id, made.plan_id);
  assert.equal(after.schedule.term_source, "human_stated");

  // ANOTHER FIRM'S ENTRY IS NOT FOUND — the scope is explicit and the answer is the same one an
  // absent entry gets, so the read is no existence oracle.
  await assertPair(CLR.notFound, DR_REASON.sourceNotFound,
    () => readRecognitionSourceFor({ ...scope, firm: nowhere() }),
    "reading a recognition source under another firm's scope");
  await assertPair(CLR.badRequest, DR_REASON.readScopeRequired,
    () => readRecognitionSourceFor({ ...scope, client: null }),
    "reading with no client in scope");

  // NO DOCUMENT BYTES, EVER. Asserted as an EXACT key set plus a forbidden-substring sweep over
  // the whole answer, because a byte key added later would otherwise pass unnoticed.
  assert.deepEqual(Object.keys(after).sort(),
    ["client_id", "deferred", "entry", "firm_id", "schedule", "source_entry_id", "status",
      "term"]);
  assert.deepEqual(Object.keys(after.entry).sort(),
    ["document_id", "posting_date", "status"]);
  const blob = JSON.stringify(after);
  for (const forbidden of ["storage_key", "sha256", "filename", "bytes", "content", "url"]) {
    assert.equal(blob.includes(forbidden), false,
      `the machine-lane read must never carry ${forbidden}`);
  }
});

// ===========================================================================================
// AC3 — THE DOCUMENT CARRIER, AND A CORRECTION THAT NEVER MOVES A RUNNING SCHEDULE.
// ===========================================================================================

cell("p941.term.document — a receipt bound to an issued invoice rides that document's own recorded service period, and the human door that records it does not restrict document direction", async () => {
  const scene = await deferredRevenueScene("docterm", { cents: 90000, termMonths: 3 });
  const doc = await extraDocument(scene, { tag: "invoice" });
  const receipt = await advanceReceipt(scene, {
    cents: 60000, document: doc.documentId, sha256: doc.sha256, tag: "invoiced" });

  // THE EXISTING HUMAN DOOR, unchanged: 0140's `record_document_service_period` takes the term off
  // the client's OWN issued invoice exactly as it takes one off a supplier's bill. Nothing about
  // it is direction-aware, which is the acceptance row's own wording.
  await recordPeriod(scene.bob, {
    document: doc.documentId, start: scene.termStart, end: scene.termEnd,
    basis: "#941 battery: the membership invoice states its service term on its face" });

  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: receipt.entry, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });
  assert.equal(made.term_source, "document_service_period");
  assert.equal(made.document_id, doc.documentId);
  assert.ok(made.service_period_id, "…and the schedule names the exact service-period row it rode");
  assert.equal(made.stated_term_id, null);
  assert.equal(made.term_start, scene.termStart);
  assert.equal(made.term_end, scene.termEnd);
  assert.equal(Number(made.total_cents), 60000);
  assert.equal(made.period_count, 3);

  // A DOCUMENT-BOUND RECEIPT CANNOT ALSO CARRY A STATED TERM — 0305's own wall, which is what
  // keeps "a row names exactly one carrier" true for this relation as well.
  await assertPair(CLR.badRequest, "prepayment_stated_term_source_has_document",
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: receipt.entry,
      start: scene.termStart, end: scene.termEnd, reason: "#941 battery: a second term" }),
    "stating a term over a document-bound receipt");

  const row = await recognitionScheduleRow(made.schedule_id);
  assert.equal(row.term_source, "document_service_period");
  assert.equal(row.stated_term_id, null);
  assert.equal(row.basis_kind, "human_stated",
    "the service period this battery records is a HUMAN's, not an extraction's");
});

cell("p941.supersede.running — a corrected service period never moves a schedule that is already running: the stored allocation, the term it rode, the occurrences and the committed receipt are all byte-identical afterwards, the schedule still names the SUPERSEDED statement, and a second schedule over the same receipt is still refused", async () => {
  const scene = await deferredRevenueScene("supersede", { cents: 90000, termMonths: 3 });
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: the member said three months when they paid" });
  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });

  // DRIVE IT TO MONEY ON THE BOOKS FIRST. A claim about "a RUNNING schedule" that never ran would
  // be a claim about a row.
  await wakeDuePlanOccurrences({ limit: 100 });
  const before = await occurrenceRows(made.plan_id);
  const live = before.filter((o) => o.work_id);
  assert.ok(live.length >= 1, "the monthly scan admitted a due period");
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const w = await workRow(live[0].work_id);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p941-sup-run") });
  const entry = await wakeRecordJournalEntry(obo.secret, {
    client: scene.client, work: live[0].work_id, logicalOpId: w.logical_op_id, basis: w.basis });
  assert.equal(entry.posted, true, "the recognition really reached the books");
  await settleWorkRun({
    task: w.current_task_id, outcome: "completed", result: { entry_id: entry.entry_id } });
  const receiptBefore = (await receiptsForWork(live[0].work_id))
    .filter((x) => x.outcome === "committed");
  assert.equal(receiptBefore.length, 1);

  const rowBefore = await recognitionScheduleRow(made.schedule_id);

  // NOW CORRECT THE TERM, to genuinely different dates, through the same human door.
  const laterEnd = await monthEndAfter(scene.termStart, 5);
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: laterEnd,
    reason: "#941 battery: the member extended to six months and we corrected the record" });
  assert.notEqual(corrected.stated_term_id, stated.stated_term_id);
  assert.equal(corrected.superseded_id, stated.stated_term_id,
    "the correction SUPERSEDES rather than edits");

  // NOTHING MOVED.
  const rowAfter = await recognitionScheduleRow(made.schedule_id);
  assert.deepEqual(rowAfter.period_lines, rowBefore.period_lines,
    "the stored allocation is byte-identical");
  assert.equal(rowAfter.term_start, rowBefore.term_start);
  assert.equal(rowAfter.term_end, rowBefore.term_end);
  assert.equal(rowAfter.period_count, rowBefore.period_count);
  assert.equal(rowAfter.stated_term_id, stated.stated_term_id,
    "the schedule still names the statement it was DERIVED from, not the one that stands today");
  assert.deepEqual(
    (await occurrenceRows(made.plan_id)).map((o) => [o.due_date, o.work_id, o.attempt]),
    before.map((o) => [o.due_date, o.work_id, o.attempt]),
    "no occurrence moved");
  assert.deepEqual((await receiptsForWork(live[0].work_id))
    .filter((x) => x.outcome === "committed").map((x) => x.id),
    receiptBefore.map((x) => x.id), "the committed receipt is the SAME receipt");

  // …AND THE DETAIL READ SAYS SO: the term it rode is not the term that stands today.
  const detail = await getRecognitionSchedule(scene.bob, made.schedule_id);
  assert.equal(detail.term_live, false, "the statement this schedule rode has been superseded");
  assert.equal(detail.term_superseded_by, corrected.stated_term_id);
  assert.equal(detail.term_moved, true, "…and the term that stands today states DIFFERENT dates");
  assert.equal(detail.term_current_end, laterEnd);
  assert.equal(detail.term_end, scene.termEnd, "while the schedule keeps the term it rode");

  // A CORRECTION IS A NEW SCHEDULE FROM THE NEXT PERIOD, never a second one over this receipt.
  await assertPair("CLR13", DR_REASON.scheduleExists,
    () => createRecognitionSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
      authorityRef: scene.authorityRef }),
    "a second schedule over a corrected receipt");
});

// ===========================================================================================
// AC "the web gains a Deferred revenue destination" — its READS, measured at the database seam.
// ===========================================================================================

cell("p941.reads — the list carries the term provenance and the posted-period count, the detail projects each period beside the occurrence that posted it, and the attention band offers only receipts the door would admit: never an unenrolled account, never an ambiguous one, and never one already scheduled", async () => {
  const scene = await deferredRevenueScene("reads", { cents: 90000, termMonths: 3 });

  // ARM B BEFORE THE TERM: the receipt is advertised with the act that unblocks it, which is the
  // whole reason a memo-only receipt is listed at all.
  const bare = await listRecognitionAttention(scene.bob, scene.client);
  const mine = bare.unrecognised.find((r) => r.entry_id === scene.receipt);
  assert.ok(mine, "an enrolled, eligible, unscheduled advance is offered");
  assert.equal(mine.deferred_account_code, scene.deferred);
  assert.equal(Number(mine.amount_cents), 90000);
  assert.equal(mine.term_carrier, "human_stated");
  assert.equal(mine.has_live_term, false);
  assert.equal(mine.next_step, "state_service_period",
    "the next act is a CLOSED token — the copy is the surface's, the fact is the read's");
  assert.equal(bare.cap, 50);
  assert.equal(bare.unrecognised_truncated, false);

  // AN AMBIGUOUS RECEIPT IS NEVER OFFERED: the band asks the door's own candidate predicate.
  const second = await account(scene.alice, {
    client: scene.client, code: "20300003", name: "Deferred event revenue", type: "liability" });
  const ambiguous = await advanceReceipt(scene, {
    cents: 40000, extraLiability: { code: second, cents: 15000 }, tag: "amb" });
  // …AND NEITHER IS AN UNENROLLED ONE: 20300003 is on the chart but not on the roster.
  const unenrolled = await advanceReceipt(scene, {
    cents: 20000, deferred: second, tag: "unenrolled" });
  const band = await listRecognitionAttention(scene.bob, scene.client);
  assert.equal(band.unrecognised.some((r) => r.entry_id === ambiguous.entry), false,
    "a receipt the door would refuse as ambiguous is not advertised");
  assert.equal(band.unrecognised.some((r) => r.entry_id === unenrolled.entry), false,
    "…nor one whose account nobody enrolled");

  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt,
    start: scene.termStart, end: scene.termEnd,
    reason: "#941 battery: a three-month retainer paid up front" });
  const withTerm = await listRecognitionAttention(scene.bob, scene.client);
  assert.equal(withTerm.unrecognised.find((r) => r.entry_id === scene.receipt).next_step,
    "configure_schedule", "with a live term the next act is the configuration itself");

  const made = await createRecognitionSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.receipt, revenueAccount: scene.revenue,
    authorityRef: scene.authorityRef });
  const after = await listRecognitionAttention(scene.bob, scene.client);
  assert.equal(after.unrecognised.some((r) => r.entry_id === scene.receipt), false,
    "once a schedule stands the receipt leaves arm B");

  // THE LIST.
  const list = await listRecognitionSchedules(scene.bob, scene.client);
  const row = list.schedules.find((s) => s.schedule_id === made.schedule_id);
  assert.ok(row, "the client's own schedule is listed");
  assert.equal(row.term_source, "human_stated");
  assert.ok(row.term_stated_by, "…with WHO stated the term");
  assert.ok(row.term_reason.includes("retainer"), "…and the grounds they wrote");
  assert.equal(row.term_live, true);
  assert.equal(row.term_moved, false);
  assert.equal(row.deferred_account_code, scene.deferred);
  assert.equal(row.revenue_account_code, scene.revenue);
  assert.equal(row.recognition_pattern, RECOGNITION_PATTERN);
  assert.equal(Number(row.total_cents), 90000);
  assert.equal(row.period_count, 3);
  assert.equal(row.posted_periods, 0,
    "configuration is not posting, and the list says the second fact");

  // THE DETAIL, before anything posts and after one period does.
  const before = await getRecognitionSchedule(scene.bob, made.schedule_id);
  assert.equal(before.kind, RECOGNITION_KIND);
  assert.equal(before.configuration_only, true);
  assert.equal(before.periods.length, 3);
  assert.equal(before.periods.every((p) => p.occurrence === null), true,
    "no period has an occurrence yet");
  assert.equal(before.revenue_account_basis.length > 0, true);

  await wakeDuePlanOccurrences({ limit: 100 });
  const occ = (await occurrenceRows(made.plan_id)).filter((o) => o.work_id);
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const w = await workRow(occ[0].work_id);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p941-reads-run") });
  const entry = await wakeRecordJournalEntry(obo.secret, {
    client: scene.client, work: occ[0].work_id, logicalOpId: w.logical_op_id, basis: w.basis });
  await settleWorkRun({
    task: w.current_task_id, outcome: "completed", result: { entry_id: entry.entry_id } });

  const detail = await getRecognitionSchedule(scene.bob, made.schedule_id);
  const posted = detail.periods.find((p) => p.period_end === occ[0].due_date);
  assert.ok(posted.occurrence, "the period is joined to the occurrence whose due date equals it");
  assert.ok(posted.occurrence.receipt_id, "…and the occurrence carries its COMMITTED receipt");
  assert.equal(posted.occurrence.entry_id, entry.entry_id, "…and the entry that posted");
  assert.equal(
    (await listRecognitionSchedules(scene.bob, scene.client)).schedules
      .find((s) => s.schedule_id === made.schedule_id).posted_periods, 1,
    "the list's posted count is a committed receipt, never an admitted Work");

  // A SCHEDULE OF ANOTHER FIRM IS NOT FOUND — no existence oracle on the detail read.
  await assertPair(CLR.notFound, DR_REASON.scheduleNotFound,
    () => getRecognitionSchedule(scene.bob, nowhere()), "reading a schedule that does not exist");
});

// ===========================================================================================
// LANE RULE (a) — THIS TICKET'S FIRST HALF IS ALREADY ON THIS BASE, AND THIS LANE CONSUMES IT.
// ===========================================================================================

cell("p941.standard_chart — a client born through the real doors and given the CURRENT published platform template carries 2030 Deferred Revenue as a non-control liability that this lane's roster admits by name, and 2150 SST Output Tax Payable carries the estate's own stamp that keeps it out of the candidate set", async () => {
  const scene = await deferredRevenueScene("chart", { cents: 60000, termMonths: 3 });

  // THE CURRENT PUBLISHED PLATFORM TEMPLATE — the highest published version, the estate's own
  // convention for "whichever one is live" (lane rule (a)). Never a pinned number: 0295 minted v2
  // and retired v1, and a later pre-step may mint a v3.
  const templates = await rootQuery(
    `select id, version from clara.coa_templates
      where scope = 'platform' and template_key = 'my_sme_starter' and state = 'published'
      order by version desc limit 1`);
  assert.equal(templates.rows.length, 1,
    "the picker offers exactly ONE published standard chart");
  const current = templates.rows[0];

  const client = await newInterviewClient(scene.alice, scene.firm, { tag: "p941" });
  const receipt = await applyTemplate(scene.alice, {
    client, template: current.id, families: null, opKey: opk("p941-template") });
  assert.ok(receipt.accounts > 40, "the standard chart was really planted");

  const chart = await clientChartMap(client);
  const deferred = chart["2030"];
  assert.ok(deferred, "the standard chart carries 2030 by code");
  assert.equal(deferred.name, "Deferred Revenue", "…and by name");
  assert.equal(deferred.type, "liability",
    "…as a LIABILITY, which is the type this lane's roster rule requires");
  assert.equal(deferred.class, null, "…and not as a control account");
  assert.equal(deferred.active, true);

  // THE ROSTER ADMITS IT BY NAME, through the real bookkeeper door — which is how this lane
  // CONSUMES 0295's row rather than minting a look-alike of its own.
  const enrolment = await enrolDeferredAccount(scene.bob, {
    client, account: "2030",
    reason: "#941 battery: the standard chart's own deferred-revenue account" });
  assert.equal(enrolment.account_code, "2030");
  assert.equal(enrolment.purpose, DEFERRED_PURPOSE);
  assert.equal(await enrolled(client, "2030", DEFERRED_PURPOSE), true);

  // …AND 2150 IS THE TAX LEG THE CORE EXCLUDES, by the estate's OWN STAMP rather than by code or
  // name. The behavioural half — a receipt with an SST line having exactly one candidate leg, and
  // that leg never moving — is `p941.posts.full_year`'s; this is the chart fact behind it.
  const sst = await rootQuery(
    `select account_code, account_type, special_acc_type from clara.coa_accounts
      where client_id = $1 and special_acc_type = 'sst_output'`, [client]);
  assert.equal(sst.rows.length, 1, "the standard chart carries exactly one SST output account");
  assert.equal(sst.rows[0].account_code, "2150");
  assert.equal(sst.rows[0].account_type, "liability",
    "it is a liability, which is exactly why excluding it by its STAMP is the only safe rule");

  // THE PREPAYMENT SIDE IS UNTOUCHED BY THE SECOND PURPOSE: 2030 is not a prepayment account, and
  // the standard chart's own prepayments row is not a deferred-revenue one.
  assert.equal(await enrolled(client, "2030", "prepayment"), false);
});
