// #939 — A PREPAYMENT POSTED WITH NO DOCUMENT CAN BE AMORTISED FROM A PERSON-STATED SERVICE
// PERIOD. Migration: 0305_prepayment_stated_term.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_stated_term$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_term_liveness$` / `accrual_correction$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits — through the `humanQuery(sub, namedCall(...))` wrappers #653's own battery uses. The two
// evaluator cells call `rootQuery`, and that is not a shortcut: `clara.prepayment_schedule_v1` and
// `clara.prepayment_schedule_v2` hold NO application grant at all, so the owner is the only
// principal that can reach them and minting a grant to test one would be the defect.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertStatedTermLanePresent, endPool, rootQuery, CLR, assertPair, assertRaises,
  statedTermScene, recordStatedTerm, statedTermRow, statedTermsFor, roleCanExecute,
  functionsMatching, nowhereId, prepaymentScene, scheduleV1, scheduleV2, monthEndAfter, maxTermScene,
  STATED_TERM_REASON, STATED_TERM_DOOR_SIG, EVALUATOR_V2_SIG, PREPAY_REASON,
  createPrepaymentSchedule, scheduleTermSource, scheduleCountFor, unapprovedEntry, ambiguousAssetEntry,
  getPrepaymentSchedule, listPrepaymentSchedules, listPrepaymentAttention, memoOnlyIneligible,
  scheduleRow, monthStartBack, opk, endAccountingPlan, planRow,
  replacePrepaymentSchedule, scheduleSupersession, liveScheduleCountFor,
  CORRECTION_REASON, CORRECTION_AXIS, REPLACE_DOOR_SIG,
  wakeDuePlanOccurrences, occurrenceRows, workRow, claimWorkRun, settleWorkRun,
  mintClientObo, wakeRecordJournalEntry, receiptsForWork,
} from "./prepayment-stated-term-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 15;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["prepayment_stated_term$"]);
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
    if (await assertStatedTermLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

// #939 AC4 / #941 AC3 — THIS FILE'S OWN LANE-SPECIFIC FRONTIER, layered on top of the shared one
// above. 0305's stem is true from its own migration onward, long before 0317 exists, so the
// correction cells need their OWN stem check — prepayment-wake-reroute.test.mjs's own idiom.
let corrected = null;
async function hasCorrection() {
  if (corrected !== null) return corrected;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'schedule_term_correction$'");
  corrected = Number(r.rows[0].n) > 0;
  return corrected;
}
async function correctionGate(t) {
  if (await hasCorrection()) return false;
  if (process.env.CLARA_ALLOW_MISSING_SCHEDULE_TERM_CORRECTION !== "1") {
    throw new Error(
      "#939 AC4 / #941 AC3 premise 0317_schedule_term_correction.sql is not applied (no "
      + "schedule_term_correction$ row in clara.schema_migrations) and "
      + "CLARA_ALLOW_MISSING_SCHEDULE_TERM_CORRECTION is unset -- this is a FOCUSED run and must "
      + "fail loudly, not skip. Preload ./tests/schedule-term-correction-preintegration-gate.mjs "
      + "for an estate sweep against a pre-0317 chain.");
  }
  t.skip("0317_schedule_term_correction not applied -- probed at the live catalog");
  return true;
}

// ===========================================================================================
// AC1 — THE STATED-TERM CARRIER AND ITS ONE HUMAN DOOR.
// ===========================================================================================

cell("p939.stated_term.record — a bookkeeper states the service period of a MEMO-ONLY recognition with a reason, the row is live and carries who said so, a second statement SUPERSEDES the first, the machine roles cannot reach the door and no wake wrapper exists for it", async () => {
  const scene = await statedTermScene("record", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  // The door is BOOKKEEPER-FLOORED, exactly as `clara.record_document_service_period` is: stating
  // a term is the same act on the other lane, and the ticket's ruling 2 says the same floor.
  await assertRaises(CLR.authz,
    () => recordStatedTerm(scene.w.users.carol, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: scene.termStart, end: scene.termEnd }),
    "a viewer stating a prepayment term");

  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
  });
  assert.ok(stated.stated_term_id, "the door names the row it wrote");
  assert.equal(stated.superseded_id, null, "the first statement supersedes nothing");
  assert.equal(stated.period_start, scene.termStart);
  assert.equal(stated.period_end, scene.termEnd);

  const row = await statedTermRow(stated.stated_term_id);
  assert.equal(row.source_entry_id, scene.memoEntry, "the term is anchored to the ENTRY, not to a document");
  assert.equal(row.client_id, scene.client);
  assert.equal(row.period_start, scene.termStart);
  assert.equal(row.period_end, scene.termEnd);
  assert.ok(row.reason && row.reason.trim().length > 0, "the stated reason is stored, never defaulted");
  assert.ok(row.stated_by, "…and WHO said so");
  assert.ok(row.stated_at, "…and WHEN");
  assert.equal(row.superseded_at, null, "the row is live");

  // A REASON IS NOT OPTIONAL. The ruling is "the term must be stated by a named person with a
  // reason"; a blank one is refused BY NAME rather than stored as an unexplained judgement.
  await assertPair(CLR.badRequest, STATED_TERM_REASON.reasonMissing,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: scene.termStart, end: scene.termEnd, reason: "   " }),
    "a stated term with a blank reason");

  // SUPERSEDE, NEVER UPDATE — decision 3's "corrected by superseding it". The predecessor is
  // stamped with the successor's id and stays on the record.
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: the client sent the policy schedule and the dates were confirmed",
  });
  assert.notEqual(corrected.stated_term_id, stated.stated_term_id, "a correction is a NEW row");
  assert.equal(corrected.superseded_id, stated.stated_term_id,
    "…and it names the row it superseded");
  const all = await statedTermsFor(scene.memoEntry);
  assert.equal(all.length, 2, "both statements are on the record — this relation is append-only");
  const first = all.find((x) => x.id === stated.stated_term_id);
  assert.equal(first.superseded_by, corrected.stated_term_id);
  assert.ok(first.superseded_at, "the predecessor carries its supersession stamp");
  assert.equal(all.filter((x) => x.superseded_at === null).length, 1,
    "exactly ONE live stated term per source entry");

  // A DOCUMENT-BOUND RECOGNITION IS NOT THIS DOOR'S BUSINESS. The two lanes share nothing: the
  // ticket's own line is "without touching the document service-period table the two lanes share".
  await assertPair(CLR.badRequest, STATED_TERM_REASON.sourceHasDocument,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.entry,
      start: scene.termStart, end: scene.termEnd }),
    "stating a term for an entry that binds a document");

  // THE 0021 RULE: absent and foreign answer with ONE refusal, so this door is not an existence
  // oracle for another client's entries.
  await assertPair(CLR.notFound, STATED_TERM_REASON.entryNotFound,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: nowhereId(),
      start: scene.termStart, end: scene.termEnd }),
    "stating a term for an entry that does not exist");

  // DECISION 6 — NOT OPENED TO CLARA. No agent grant, and no wake wrapper: a model may only ever
  // ask the fixed two-date question. Both halves are read POSITIVELY off the catalog.
  for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive",
                      "clara_runtime"]) {
    assert.equal(await roleCanExecute(role, STATED_TERM_DOOR_SIG), false,
      `${role} must not be able to execute the stating door`);
  }
  assert.equal(await roleCanExecute("clara_authenticated", STATED_TERM_DOOR_SIG), true,
    "the human lane holds it");
  assert.deepEqual(await functionsMatching("prepayment_stated_term"),
    ["record_prepayment_stated_term"],
    "exactly one function carries this name — no wake wrapper, no agent core");
});

// ===========================================================================================
// AC2 — THE SECOND EVALUATOR. Same formula, the amount and the term as INPUTS.
// ===========================================================================================

cell("p939.evaluator.v2_agrees — on the SAME document-backed recognition clara.prepayment_schedule_v2 emits the frozen v1's period lines, total, period count and remainder placement byte for byte, agrees again at the carrier's 120-month maximum, mirrors the amounts onto the DEBIT side when the released leg is a liability, and refuses a 121-month term, a non-positive amount, an unknown side and a term covering no month's first day by name", async () => {
  // ---- THE ORDINARY CASE, and the remainder is the point. 100,001 cents over three whole months
  // is 33,333 / 33,333 / 33,335: the base truncates toward zero and the remainder lands WHOLLY in
  // the final period. The expected amounts are a worked example, never a re-computation of what
  // the subject computes.
  const scene = await prepaymentScene("v2-agree", {
    cents: 100001, termMonthsBack: 4, termMonths: 3 });
  const v1 = await scheduleV1(scene.client, scene.entry);
  assert.equal(v1.refusal, undefined, "the document-backed scene really does derive a schedule");
  assert.equal(v1.period_count, 3);
  assert.deepEqual(v1.period_lines.map((l) => Number(l.credit_cents)), [33333, 33333, 33335],
    "the frozen evaluator's own arithmetic, stated as a worked example");

  const v2 = await scheduleV2({
    totalCents: 100001, accountCode: scene.prepaid, releaseSide: "credit",
    termStart: scene.termStart, termEnd: scene.termEnd });
  assert.equal(v2.refusal, undefined, "v2 admits the same input");
  assert.equal(v2.schedule_version, "v2", "…and says which evaluator answered");
  assert.deepEqual(v2.period_lines, v1.period_lines,
    "v2's period lines are v1's, byte for byte — identical formula, the term and the amount merely supplied rather than read");
  assert.equal(v2.total_cents, v1.total_cents);
  assert.equal(v2.period_count, v1.period_count);
  assert.equal(v2.remainder_placement, v1.remainder_placement);
  assert.equal(v2.term_start, v1.term_start);
  assert.equal(v2.term_end, v1.term_end);
  assert.equal(v2.release_account_code, v1.prepaid_account_code,
    "the released leg is the one the CALLER picked; v1 read the same code off the entry itself");
  assert.equal(v2.release_side, "credit");

  // ---- THE 120-MONTH MAXIMUM. `record_document_service_period` admits exactly 120 charged months
  // and `ck_dsp_max_periods` holds the same line, so this is the LONGEST term v1 can ever see —
  // and the two evaluators must still agree there rather than only on short terms.
  const long = await maxTermScene("v2-cap", { cents: 1200000 });
  const longV1 = await scheduleV1(long.client, long.entry);
  assert.equal(longV1.refusal, undefined,
    "a 120-month document-backed term is admissible — the cap is inclusive");
  assert.equal(longV1.period_count, 120);
  const longV2 = await scheduleV2({
    totalCents: 1200000, accountCode: long.prepaid, releaseSide: "credit",
    termStart: long.termStart, termEnd: long.termEnd });
  assert.equal(longV2.period_count, 120);
  assert.deepEqual(longV2.period_lines, longV1.period_lines,
    "at the carrier's maximum the two evaluators still agree line for line");

  // ---- ONE MONTH FURTHER. v1 can never meet a 121-month term because its carrier refuses to hold
  // one; v2 takes the term as an ARGUMENT, so the same cap has to live inside v2 or it would emit a
  // 121st line for a term no door in this estate would accept.
  const tooLong = await monthEndAfter(long.termStart, 120);
  const over = await scheduleV2({
    totalCents: 1200000, accountCode: long.prepaid, releaseSide: "credit",
    termStart: long.termStart, termEnd: tooLong });
  assert.equal(over.refusal, "prepayment_term_underivable",
    "121 charged months is refused, by the same cap the document carrier enforces");
  assert.equal(over.derived_periods, 121);
  assert.equal(over.max_periods, 120);

  // ---- THE MIRROR. #941's deferred-revenue lane releases a CREDITED LIABILITY: the same
  // arithmetic, the other side. The amounts do not move; only which side of the released leg they
  // land on does, which is why the side is the caller's and not the evaluator's guess.
  const mirrored = await scheduleV2({
    totalCents: 100001, accountCode: "2030", releaseSide: "debit",
    termStart: scene.termStart, termEnd: scene.termEnd });
  assert.equal(mirrored.refusal, undefined);
  assert.deepEqual(mirrored.period_lines.map((l) => Number(l.debit_cents)), [33333, 33333, 33335],
    "the same three amounts, released by DEBIT");
  assert.deepEqual(mirrored.period_lines.map((l) => Number(l.credit_cents)), [0, 0, 0]);
  assert.deepEqual(mirrored.period_lines.map((l) => l.account_code), ["2030", "2030", "2030"]);
  assert.equal(mirrored.release_side, "debit");

  // ---- THE REFUSALS ARE RETURNED, NEVER RAISED — 0140's contract for an evaluator, which is what
  // lets a door re-raise them with their payloads intact and an agent lane land them as rungs.
  const noAmount = await scheduleV2({
    totalCents: 0, accountCode: scene.prepaid, releaseSide: "credit",
    termStart: scene.termStart, termEnd: scene.termEnd });
  assert.equal(noAmount.refusal, "prepayment_source_unfit");
  assert.equal(noAmount.axis, "amount_not_positive");

  const noAccount = await scheduleV2({
    totalCents: 100001, accountCode: "   ", releaseSide: "credit",
    termStart: scene.termStart, termEnd: scene.termEnd });
  assert.equal(noAccount.refusal, "prepayment_source_unfit");
  assert.equal(noAccount.axis, "account_missing");

  const badSide = await scheduleV2({
    totalCents: 100001, accountCode: scene.prepaid, releaseSide: "sideways",
    termStart: scene.termStart, termEnd: scene.termEnd });
  assert.equal(badSide.refusal, "prepayment_source_unfit");
  assert.equal(badSide.axis, "release_side_unknown");

  const inverted = await scheduleV2({
    totalCents: 100001, accountCode: scene.prepaid, releaseSide: "credit",
    termStart: scene.termEnd, termEnd: scene.termStart });
  assert.equal(inverted.refusal, "prepayment_term_underivable");
  assert.equal(inverted.axis, "dates_inverted");

  // A term wholly inside one calendar month covers no month's FIRST day, so it charges no whole
  // month — v1's own `v_n < 1` arm, restated on v2's own inputs.
  const noMonth = await scheduleV2({
    totalCents: 100001, accountCode: scene.prepaid, releaseSide: "credit",
    termStart: "2026-03-02", termEnd: "2026-03-20" });
  assert.equal(noMonth.refusal, "prepayment_term_underivable");
  assert.equal(noMonth.axis, "no_whole_month");
});

cell("p939.evaluator.frozen — clara.prepayment_schedule_v2 is registered as its OWN clara.evaluator_versions closure with exactly ONE member whose registered hash equals the live body's, v1's own registration is unmoved beside it, and neither evaluator holds an application grant", async () => {
  const rows = await rootQuery(
    `select e.evaluator_name, e.version, e.entrypoint_signature, e.deployed,
            e.migration_version,
            (select count(*)::int from clara.evaluator_version_members m
              where m.evaluator_version_id = e.id) as members,
            encode(e.closure_sha256,'hex') as closure
       from clara.evaluator_versions e
      where e.evaluator_name = 'prepayment_schedule'
      order by e.version`);
  assert.equal(rows.rows.length, 2,
    "the prepayment_schedule evaluator now has exactly two registered versions");
  const [v1, v2] = rows.rows;
  assert.equal(v1.version, 1);
  assert.equal(v1.entrypoint_signature, "clara.prepayment_schedule_v1(uuid,uuid)");
  assert.equal(v1.members, 1, "0140's registration is still single-member");
  assert.equal(v2.version, 2);
  assert.equal(v2.entrypoint_signature, EVALUATOR_V2_SIG);
  assert.equal(v2.members, 1,
    "…and v2's is too: it calls no other clara function, so its closure can honestly have one entry");
  assert.equal(v2.deployed, false,
    "evaluator versions are born undeployed — the flip is a one-way ceremony act, not this file's");
  assert.equal(v2.migration_version, "0305_prepayment_stated_term",
    "the registration names the file that minted it");

  // THE FREEZE IS MEASURED, never restated: the member hash is recomputed LIVE off
  // pg_get_functiondef — the same instrument clara.verify_evaluator_freeze() uses between every
  // migration body and its commit.
  const members = await rootQuery(
    `select m.member_signature,
            encode(m.body_sha256,'hex') as registered,
            encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text,'UTF8')),'hex') as live
       from clara.evaluator_version_members m
       join clara.evaluator_versions e on e.id = m.evaluator_version_id
      where e.evaluator_name = 'prepayment_schedule'
      order by e.version`);
  assert.equal(members.rows.length, 2);
  for (const m of members.rows) {
    assert.equal(m.live, m.registered,
      `${m.member_signature}'s live body still hashes to its registered member hash`);
  }
  // …and the verifier itself agrees, over the WHOLE estate rather than over these two rows.
  const verified = await rootQuery("select clara.verify_evaluator_freeze() as r");
  assert.equal(verified.rows[0].r.ok, true);

  // NEITHER EVALUATOR IS REACHABLE BY ANY APPLICATION ROLE. A grant minted to reach one from a
  // door would red the rig's closed ungranted census; this reads the same fact positively.
  for (const sig of ["clara.prepayment_schedule_v1(uuid,uuid)", EVALUATOR_V2_SIG]) {
    for (const role of ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive",
                        "clara_wake_proactive", "clara_runtime"]) {
      assert.equal(await roleCanExecute(role, sig), false,
        `${role} must not be able to execute ${sig}`);
    }
  }
});

// ===========================================================================================
// AC3 — THE DOOR ADMITS A MEMO-ONLY SOURCE ONCE A TERM STANDS, AND NAMES THE STATING DOOR UNTIL
//       ONE DOES.
// ===========================================================================================

cell("p939.create.memo_only — with no stated term the door refuses prepayment_term_underivable and the payload NAMES the stating door as the remedy; once a term is stated the SAME door configures the schedule off clara.prepayment_schedule_v2 with the same cent-exact straight line, and the row records that its term came from a person rather than a document — while a document-backed recognition is untouched and still rides v1", async () => {
  const scene = await statedTermScene("create", {
    cents: 100001, termMonthsBack: 4, termMonths: 3, memoCents: 100001 });

  // ---- BEFORE A TERM STANDS. The refusal is the old one by token — no new vocabulary — but its
  // payload now says what to do, and 0140's own line for the document lane ("the refusal NAMES
  // what to record and where") is what this restates for the lane that had no such answer at all.
  const refused = await assertPair(CLR.badRequest, PREPAY_REASON.termUnderivable,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "configuring a memo-only prepayment before anybody has stated its term");
  assert.equal(refused.detail.missing, "prepayment_stated_terms",
    "the payload names the carrier the term is missing from");
  assert.equal(refused.detail.remedy, "clara.record_prepayment_stated_term",
    "…and the DOOR that fills it — the whole point of this ticket's third criterion");
  assert.equal(await scheduleCountFor(scene.memoEntry), 0,
    "a create-time refusal writes no schedule row");

  // ---- THE TERM IS STATED, and the same door now goes through.
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  // The allocation is v2's, and v2's is v1's: 100,001 cents over three whole months is
  // 33,333 / 33,333 / 33,335 with the remainder wholly in the final period.
  assert.equal(created.period_count, 3);
  assert.equal(created.total_cents, 100001);
  assert.deepEqual(created.period_lines.map((l) => Number(l.amount_cents)), [33333, 33333, 33335],
    "the same cent-exact straight line a document-backed term produces");
  assert.equal(created.remainder_placement, "final_period");
  assert.equal(created.schedule_version, "v2", "the memo-only lane rides the second evaluator");
  assert.equal(created.term_source, "human_stated",
    "the envelope says the term came from a person, not a document");
  assert.equal(created.stated_term_id, stated.stated_term_id,
    "…and names the exact statement it rode");
  assert.equal(created.document_id, null);
  assert.equal(created.service_period_id, null);
  assert.equal(created.term_start, scene.termStart);
  assert.equal(created.term_end, scene.termEnd);

  // The STORED row says the same thing — read off the relation, not off the door whose projection
  // is what a later cell is about.
  const row = await scheduleTermSource(created.schedule_id);
  assert.equal(row.term_source, "human_stated");
  assert.equal(row.stated_term_id, stated.stated_term_id);
  assert.equal(row.service_period_id, null);
  assert.equal(row.document_id, null);
  assert.equal(row.schedule_version, "v2");

  // ---- THE DOCUMENT LANE IS UNTOUCHED. Same client, same door, the scene's own document-bound
  // recognition: still v1, still naming its document_service_periods row.
  const backed = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  assert.equal(backed.schedule_version, "v1", "a document-backed term still rides the frozen v1");
  assert.equal(backed.term_source, "document_service_period");
  const backedRow = await scheduleTermSource(backed.schedule_id);
  assert.equal(backedRow.term_source, "document_service_period");
  assert.equal(backedRow.stated_term_id, null);
  assert.ok(backedRow.service_period_id, "…and still names the document term row it rode");
  assert.ok(backedRow.document_id);

  // ---- A MEMO-ONLY SOURCE THAT IS NOT FIT IS STILL UNFIT, and by 0140's own token: the term is
  // the LAST thing this lane asks about, so an unapproved entry and an ambiguous prepaid leg
  // answer exactly as they did before this ticket.
  const draftEntry = await unapprovedEntry(scene);
  await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: draftEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "a memo-only recognition that never posted");
  const twoLegs = await ambiguousAssetEntry(scene);
  await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: twoLegs,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "a memo-only recognition debiting two asset accounts");
});

// ===========================================================================================
// AC4 — A CORRECTED STATEMENT NEVER MOVES A RUNNING SCHEDULE.
// ===========================================================================================

cell("p939.supersede.running — a stated term corrected AFTER its schedule has posted a period moves nothing: the stored allocation, the term the schedule rode, its occurrences and its COMMITTED receipt are byte-identical afterwards, the schedule keeps naming the statement it was derived from, a second schedule over the same recognition is still refused by name, and ENDING the first one does not open that door either", async () => {
  const scene = await statedTermScene("supersede", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 90000 });
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const created = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  // ---- ONE PERIOD ACTUALLY POSTS. Not an admitted Work: a COMMITTED receipt, which is the only
  // thing that means money reached the books — and the fact AC4 is about.
  await wakeDuePlanOccurrences({ limit: 100 });
  const occBefore = await occurrenceRows(created.plan_id);
  assert.equal(occBefore.length, 1, "one scan admits the latest due event at or before today");
  const workId = occBefore[0].work_id;
  assert.ok(workId, "…and it admitted a Work");
  const w = await workRow(workId);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p939-run") });
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: scene.client, work: workId, logicalOpId: w.logical_op_id, basis: w.basis });
  assert.equal(posted.posted, true, "the amortisation charge really reached the books");
  await settleWorkRun({
    task: w.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });
  const receiptsBefore = await receiptsForWork(workId);
  assert.equal(receiptsBefore.filter((r) => r.outcome === "committed").length, 1,
    "exactly one committed receipt stands before the correction");

  const rowBefore = await scheduleRow(created.schedule_id);
  const detailBefore = await getPrepaymentSchedule(scene.bob, created.schedule_id);

  // ---- THE CORRECTION. A genuinely DIFFERENT term — one month later at both ends — stated through
  // the same door, which supersedes the statement this schedule rode.
  const newStart = await monthStartBack(3);
  const newEnd = await monthEndAfter(newStart, 2);
  assert.notEqual(newStart, scene.termStart, "the correction really states different dates");
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: newStart, end: newEnd,
    reason: "#939 battery: the client's bank statement showed the payment covered a later year" });
  assert.equal(corrected.superseded_id, stated.stated_term_id,
    "the correction superseded exactly the statement this schedule rode");

  // ---- NOTHING MOVED. The relation is append-only by trigger, but a trigger proves only that an
  // UPDATE would raise; this proves the correction path does not even try.
  const rowAfter = await scheduleRow(created.schedule_id);
  assert.deepEqual(rowAfter.period_lines, rowBefore.period_lines,
    "the stored allocation is byte-identical after the correction");
  assert.equal(rowAfter.term_start, scene.termStart, "…and the schedule still carries the term it rode");
  assert.equal(rowAfter.term_end, scene.termEnd);
  assert.equal(rowAfter.total_cents, rowBefore.total_cents);
  assert.equal(rowAfter.period_count, rowBefore.period_count);
  const sourceAfter = await scheduleTermSource(created.schedule_id);
  assert.equal(sourceAfter.stated_term_id, stated.stated_term_id,
    "the schedule keeps naming the SUPERSEDED statement — it is a derived record and says what it was derived from");
  assert.equal(sourceAfter.term_source, "human_stated");

  // THE POSTED PERIOD AND ITS RECEIPT ARE UNTOUCHED — the sentence AC4 asks for, driven rather
  // than asserted.
  const occAfter = await occurrenceRows(created.plan_id);
  assert.deepEqual(occAfter.map((o) => [o.due_date, o.work_id, o.attempt]),
    occBefore.map((o) => [o.due_date, o.work_id, o.attempt]),
    "the occurrences are the same rows, in the same state");
  const receiptsAfter = await receiptsForWork(workId);
  assert.deepEqual(receiptsAfter.map((r) => [r.id, r.outcome]),
    receiptsBefore.map((r) => [r.id, r.outcome]),
    "the committed receipt is the same receipt");
  const detailAfter = await getPrepaymentSchedule(scene.bob, created.schedule_id);
  assert.deepEqual(detailAfter.periods, detailBefore.periods,
    "and the read's period projection did not move either");

  // ---- RE-DERIVING IN PLACE IS NOT A PATH THIS ESTATE OFFERS. A second schedule over the same
  // recognition is refused BY NAME and names the schedule that already stands, so a surface sends
  // the person there rather than offering a second configuration.
  await assertPair(CLR.conflict, PREPAY_REASON.scheduleExists,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "configuring a second schedule over a recognition whose term was corrected");

  // ---- AND ENDING THE SCHEDULE DOES NOT OPEN THAT PATH EITHER. [L04-SPEC-04, fix round 2.]
  // The register used to offer "end this schedule and configure a new one" as the remedy, in three
  // separate sentences. `uq_prepayment_schedules_source` (0223) is UNCONDITIONAL — it carries no
  // status predicate at all — so the refusal is the SAME once the plan has ended, and the advice
  // was an act nobody could perform. Driven rather than reasoned about: the plan is ended through
  // its own door, and only then is the replacement asked for.
  const ended = await endAccountingPlan(scene.bob, {
    plan: created.plan_id,
    reason: "#939 battery: the stated term was wrong, so the firm stopped the schedule" });
  assert.equal(ended.status, "ended", "the schedule really ended before the replacement was asked for");
  await assertPair(CLR.conflict, PREPAY_REASON.scheduleExists,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "configuring a REPLACEMENT schedule after ending the first one");
  assert.equal(await scheduleCountFor(scene.memoEntry), 1,
    "…and the recognition still carries exactly the one schedule it has always carried");
});

// ===========================================================================================
// AC4, SECOND HALF — THE CORRECTION PATH ITSELF. "a new schedule from the next period is the only
//   correction path" names an ACT, not only a prohibition, and until this door existed the estate
//   performed none. Decision 3's other half — "already-posted periods are never touched" — is what
//   makes the derivation PROSPECTIVE: the posted periods stand and the remaining balance is
//   re-spread over what is left of the corrected term.
// ===========================================================================================

cell("p939.replace.clean — with nothing yet posted, correcting the term and then asking for the replacement opens a NEW schedule over the corrected term for the whole amount, ends the predecessor's plan, stamps the predecessor with its successor while leaving its own allocation byte-identical, and leaves exactly ONE live schedule over the recognition", async (t) => {
  if (await correctionGate(t)) return;
  const scene = await statedTermScene("replaceClean", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 90000 });
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  assert.equal(made.period_count, 3, "the schedule this correction is about charges three months");
  const rowBefore = await scheduleRow(made.schedule_id);

  // ---- THE CORRECTION, through the door decision 3 names. The corrected term starts a month
  // later and ends where it always did: two charged months instead of three.
  const newStart = await monthStartBack(3);
  const newEnd = await monthEndAfter(newStart, 1);
  assert.notEqual(newStart, scene.termStart, "the correction really states different dates");
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, start: newStart, end: newEnd,
    reason: "#939 battery: the policy schedule arrived and cover began a month later" });
  assert.equal(corrected.superseded_id, stated.stated_term_id);

  // ---- THE REPLACEMENT.
  const replacement = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef });
  assert.ok(replacement.schedule_id, "the door names the schedule it wrote");
  assert.notEqual(replacement.schedule_id, made.schedule_id, "a correction is a NEW schedule");
  assert.equal(replacement.replaces_schedule_id, made.schedule_id,
    "…and it names the one it replaced, so the chain reads forwards as well as back");

  // THE DERIVED NUMBERS, from the worked example rather than from re-running the code's own
  // arithmetic: nothing posted, so the whole 90000 sen is re-spread over the corrected term's TWO
  // charged months — 45000 each, with no remainder to place.
  assert.equal(replacement.term_start, newStart);
  assert.equal(replacement.term_end, newEnd);
  assert.equal(replacement.period_count, 2);
  assert.equal(replacement.total_cents, 90000);
  assert.deepEqual(
    (replacement.period_lines ?? []).map((l) => Number(l.amount_cents)), [45000, 45000]);
  assert.equal(replacement.term_source, "human_stated");
  assert.equal(replacement.stated_term_id, corrected.stated_term_id,
    "the replacement rides the statement that stands TODAY, not the one it is correcting");
  assert.equal(replacement.expense_account_code, rowBefore.expense_account_code,
    "a term correction corrects the TERM: the judged expense account is carried forward, never re-picked");
  assert.equal(replacement.expense_account_basis, rowBefore.expense_account_basis);

  // ---- THE PREDECESSOR. Its plan is ended, it is stamped, and its own row never moved.
  const pred = await scheduleSupersession(made.schedule_id);
  assert.equal(pred.superseded_by, replacement.schedule_id);
  assert.ok(pred.superseded_at, "the predecessor carries its supersession stamp");
  assert.equal((await planRow(made.plan_id)).status, "ended",
    "the schedule it replaced stops posting, through the plan's own door");
  const rowAfter = await scheduleRow(made.schedule_id);
  assert.deepEqual(rowAfter.period_lines, rowBefore.period_lines,
    "the predecessor's stored allocation is byte-identical — it is a derived record, never edited");
  assert.equal(rowAfter.term_start, rowBefore.term_start);
  assert.equal(rowAfter.term_end, rowBefore.term_end);
  assert.equal(rowAfter.total_cents, rowBefore.total_cents);

  // ---- AND THE REPLACEMENT IS THE ONE THAT STANDS.
  assert.notEqual(replacement.plan_id, made.plan_id, "the replacement rides a plan of its own");
  assert.equal((await planRow(replacement.plan_id)).status, "active");
  assert.equal(await scheduleCountFor(scene.memoEntry), 2,
    "both schedules are on the record — the chain is the audit trail");
  assert.equal(await liveScheduleCountFor(scene.memoEntry), 1,
    "…and exactly one of them is live");

  // THE CREATE DOOR IS STILL NOT A SECOND CORRECTION PATH. It answers about the LIVE schedule,
  // which is now the replacement.
  const refused = await assertPair(CLR.conflict, PREPAY_REASON.scheduleExists,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "configuring a third schedule over a recognition that already carries a replacement");
  assert.equal(refused.detail.schedule_id, replacement.schedule_id,
    "…and it names the schedule that STANDS, never the superseded one");
});

cell("p939.replace.posted — a month the plan has already taken up is never re-opened and never re-charged: the replacement starts the day after it, re-spreads the balance the books still carry (including a month the scanner never picked up), and the admitted occurrence with its COMMITTED receipt is byte-identical afterwards", async (t) => {
  if (await correctionGate(t)) return;
  // FOUR CHARGED MONTHS STRADDLING TODAY, so the plan's own scanner takes up exactly one of them
  // and the others stay open. 90000 sen over four months is 22500 a month with no remainder — a
  // worked example, so every number below comes from the term rather than from the code.
  const scene = await statedTermScene("replacePosted", {
    cents: 90000, termMonthsBack: 2, termMonths: 4, memoCents: 90000 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  assert.equal(made.period_count, 4);
  assert.deepEqual((made.period_lines ?? []).map((l) => Number(l.amount_cents)),
    [22500, 22500, 22500, 22500]);
  const rowBefore = await scheduleRow(made.schedule_id);

  // ---- ONE MONTH REACHES THE BOOKS. Not an admitted Work: a COMMITTED receipt, which is the only
  // thing that means money moved — and the fact AC4's "posted occurrences and their receipts are
  // unchanged" is about.
  await wakeDuePlanOccurrences({ limit: 100 });
  const occBefore = await occurrenceRows(made.plan_id);
  assert.equal(occBefore.length, 1, "one scan admits the latest due event at or before today");
  const takenUp = String(occBefore[0].due_date).slice(0, 10);
  const secondPeriodEnd = await monthEndAfter(scene.termStart, 1);
  assert.equal(takenUp, secondPeriodEnd,
    "…which is this term's SECOND month, so the first one is a gap the scanner never picked up");
  const workId = occBefore[0].work_id;
  const w = await workRow(workId);
  await claimWorkRun({ task: w.current_task_id, runId: opk("p939-rep-run") });
  const obo = await mintClientObo({ firm: scene.firm, obo: scene.bob, client: scene.client });
  const posted = await wakeRecordJournalEntry(obo.secret, {
    client: scene.client, work: workId, logicalOpId: w.logical_op_id, basis: w.basis });
  assert.equal(posted.posted, true, "the amortisation charge really reached the books");
  await settleWorkRun({
    task: w.current_task_id, outcome: "completed", result: { entry_id: posted.entry_id } });
  const receiptsBefore = (await receiptsForWork(workId)).filter((r) => r.outcome === "committed");
  assert.equal(receiptsBefore.length, 1, "exactly one committed receipt stands before the correction");

  // ---- THE CORRECTION: the cover runs a month LONGER than the firm was first told.
  const newEnd = await monthEndAfter(scene.termStart, 4);
  assert.notEqual(newEnd, scene.termEnd, "the correction really moves the term");
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, start: scene.termStart, end: newEnd,
    reason: "#939 battery: the policy schedule showed the cover ran five months, not four" });

  const replacement = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef });

  // ---- THE PROSPECTIVE BOUNDARY. One month was taken up, so the replacement begins with the
  // month after it, and the remaining 67500 sen — the 22500 the scanner never picked up plus the
  // 45000 that was never due — is re-spread over the THREE months the corrected term leaves open:
  // 22500 each, which is the worked example rather than the code's own arithmetic.
  const firstOpenStart = await monthStartBack(0);
  assert.equal(replacement.admitted_periods, 1);
  assert.equal(Number(replacement.admitted_cents), 22500);
  assert.equal(replacement.term_start, firstOpenStart,
    "the replacement starts the day after the month the plan took up, never on top of it");
  assert.equal(replacement.first_open_period_start, firstOpenStart);
  assert.equal(replacement.term_end, newEnd);
  assert.equal(replacement.period_count, 3);
  assert.equal(Number(replacement.total_cents), 67500);
  assert.deepEqual((replacement.period_lines ?? []).map((l) => Number(l.amount_cents)),
    [22500, 22500, 22500]);
  // NOTHING IS LOST AND NOTHING IS CHARGED TWICE: what the books have taken up plus what the
  // replacement will charge is exactly the payment.
  assert.equal(Number(replacement.admitted_cents) + Number(replacement.total_cents), 90000);

  // ---- THE POSTED MONTH AND ITS RECEIPT ARE UNTOUCHED — AC4's own sentence, driven through the
  // CORRECTION rather than only through a restatement that did nothing.
  const occAfter = await occurrenceRows(made.plan_id);
  assert.deepEqual(occAfter.map((o) => [o.due_date, o.work_id, o.attempt]),
    occBefore.map((o) => [o.due_date, o.work_id, o.attempt]),
    "the occurrences are the same rows, in the same state");
  assert.deepEqual((await receiptsForWork(workId)).filter((r) => r.outcome === "committed")
    .map((r) => [r.id, r.outcome]), receiptsBefore.map((r) => [r.id, r.outcome]),
    "the committed receipt is the SAME receipt");
  const rowAfter = await scheduleRow(made.schedule_id);
  assert.deepEqual(rowAfter.period_lines, rowBefore.period_lines,
    "the predecessor's stored allocation never moved");
  assert.equal((await planRow(made.plan_id)).status, "ended");
  assert.equal(await liveScheduleCountFor(scene.memoEntry), 1);
  assert.equal((await scheduleSupersession(replacement.schedule_id)).replaces_schedule_id,
    made.schedule_id);
  assert.equal(replacement.stated_term_id, corrected.stated_term_id);
});

cell("p939.replace.refuses — a term that was never corrected, a re-statement that moved neither date, a schedule that has already been replaced, one that names nothing, a blank reason and a viewer are each refused by NAME, and none of them writes a schedule", async (t) => {
  if (await correctionGate(t)) return;
  const scene = await statedTermScene("replaceRefuses", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 90000 });
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  // ---- A CORRECTION THAT WAS NEVER MADE. The term this schedule rode is still the one on record,
  // so there is nothing to correct TO, and the refusal names the door that would make one.
  const live = await assertPair(CLR.badRequest, CORRECTION_REASON.termNotCorrected,
    () => replacePrepaymentSchedule(scene.bob, {
      client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef }),
    "replacing a schedule whose term nobody has corrected");
  assert.equal(live.detail.axis, CORRECTION_AXIS.termLive);
  assert.equal(live.detail.remedy, "clara.record_prepayment_stated_term",
    "…and it names the door that states a corrected term");

  // ---- A RE-STATEMENT THAT MOVED NOTHING IS NOT GROUNDS. Both term doors supersede
  // unconditionally, so term_live flips on a statement that repeats the same two dates; only
  // term_moved is a fact to act on (ADV-02), and this door asks the same question the read does.
  const same = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: re-recorded after a review, with the same two dates" });
  assert.equal(same.superseded_id, stated.stated_term_id, "it really superseded the predecessor");
  const unmoved = await assertPair(CLR.badRequest, CORRECTION_REASON.termNotCorrected,
    () => replacePrepaymentSchedule(scene.bob, {
      client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef }),
    "replacing a schedule after a re-statement that moved neither date");
  assert.equal(unmoved.detail.axis, CORRECTION_AXIS.termUnmoved);
  assert.equal(await scheduleCountFor(scene.memoEntry), 1, "neither refusal wrote a schedule");

  // ---- A REAL CORRECTION, so the remaining arms have something to refuse ABOUT.
  const newStart = await monthStartBack(3);
  const newEnd = await monthEndAfter(newStart, 1);
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, start: newStart, end: newEnd,
    reason: "#939 battery: the cover began a month later than we were told" });

  // A BLANK REASON. This act re-derives a client's books; an unexplained one is the
  // judgement-without-a-basis the estate refuses everywhere else.
  await assertPair(CLR.badRequest, "invalid_request",
    () => replacePrepaymentSchedule(scene.bob, {
      client: scene.client, schedule: made.schedule_id, reason: "   ",
      authorityRef: scene.authorityRef }),
    "replacing a schedule with no stated reason");

  // A VIEWER. The floor is the bookkeeper's, the same one that states the term and configures the
  // schedule: this door does neither more nor less than those two together.
  await assertRaises(CLR.authz,
    () => replacePrepaymentSchedule(scene.w.users.carol, {
      client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef }),
    "a viewer replacing a schedule");

  // A SCHEDULE THAT NAMES NOTHING — absent and foreign answer alike, so this door is not an
  // existence oracle for another client's schedules.
  await assertPair(CLR.notFound, PREPAY_REASON.scheduleNotFound,
    () => replacePrepaymentSchedule(scene.bob, {
      client: scene.client, schedule: nowhereId(), authorityRef: scene.authorityRef }),
    "replacing a schedule that names nothing");
  assert.equal(await scheduleCountFor(scene.memoEntry), 1, "…and still nothing was written");

  // ---- THE REPLACEMENT ITSELF, then the same call again: a schedule already replaced is closed.
  const replacement = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef });
  const closed = await assertPair(CLR.conflict, CORRECTION_REASON.scheduleSuperseded,
    () => replacePrepaymentSchedule(scene.bob, {
      client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef,
      reason: "#939 battery: a second correction of the same predecessor" }),
    "replacing a schedule that has already been replaced");
  assert.equal(closed.detail.superseded_by, replacement.schedule_id,
    "…and it names the schedule that took over, so a surface can send the person there");
  assert.equal(await scheduleCountFor(scene.memoEntry), 2, "exactly two rows stand on the chain");
  assert.equal(await liveScheduleCountFor(scene.memoEntry), 1);
});

cell("p939.replace.boundary — a corrected term that ends before the first month the plan has not taken up is refused by name, and so is one whose every month has already been taken up; both name the periods already admitted and neither writes a schedule", async (t) => {
  if (await correctionGate(t)) return;
  // ---- ARM 1: the corrected term ends inside the month the plan already took up.
  const a = await statedTermScene("replaceNoOpen", {
    cents: 90000, termMonthsBack: 2, termMonths: 4, memoCents: 90000 });
  await recordStatedTerm(a.bob, {
    client: a.client, sourceEntry: a.memoEntry, start: a.termStart, end: a.termEnd });
  const madeA = await createPrepaymentSchedule(a.bob, {
    client: a.client, sourceEntry: a.memoEntry,
    expenseAccount: a.target, authorityRef: a.authorityRef });
  await wakeDuePlanOccurrences({ limit: 100 });
  const occA = await occurrenceRows(madeA.plan_id);
  assert.equal(occA.length, 1, "one month was taken up");
  const shortEnd = await monthEndAfter(a.termStart, 1);
  assert.equal(String(occA[0].due_date).slice(0, 10), shortEnd,
    "…and the corrected term below ends on exactly that month");
  await recordStatedTerm(a.bob, {
    client: a.client, sourceEntry: a.memoEntry, start: a.termStart, end: shortEnd,
    reason: "#939 battery: the cover was two months, not four" });
  const noOpen = await assertPair(CLR.badRequest, CORRECTION_REASON.noOpenPeriod,
    () => replacePrepaymentSchedule(a.bob, {
      client: a.client, schedule: madeA.schedule_id, authorityRef: a.authorityRef }),
    "replacing a schedule whose corrected term leaves no open month");
  assert.equal(noOpen.detail.admitted_periods, 1);
  assert.equal(await scheduleCountFor(a.memoEntry), 1, "nothing was written");

  // ---- ARM 2: a one-month schedule whose one month has been taken up. There is no balance left
  // to re-spread, whatever the corrected term says, and the refusal says which periods took it.
  const b = await statedTermScene("replaceNothingLeft", {
    cents: 90000, termMonthsBack: 1, termMonths: 1, memoCents: 90000 });
  await recordStatedTerm(b.bob, {
    client: b.client, sourceEntry: b.memoEntry, start: b.termStart, end: b.termEnd });
  const madeB = await createPrepaymentSchedule(b.bob, {
    client: b.client, sourceEntry: b.memoEntry,
    expenseAccount: b.target, authorityRef: b.authorityRef });
  assert.equal(madeB.period_count, 1);
  await wakeDuePlanOccurrences({ limit: 100 });
  assert.equal((await occurrenceRows(madeB.plan_id)).filter((o) => o.work_id).length, 1,
    "its one month was taken up");
  const longerEnd = await monthEndAfter(b.termStart, 2);
  await recordStatedTerm(b.bob, {
    client: b.client, sourceEntry: b.memoEntry, start: b.termStart, end: longerEnd,
    reason: "#939 battery: the cover ran three months after all" });
  const nothing = await assertPair(CLR.badRequest, CORRECTION_REASON.nothingRemaining,
    () => replacePrepaymentSchedule(b.bob, {
      client: b.client, schedule: madeB.schedule_id, authorityRef: b.authorityRef }),
    "replacing a schedule whose every month has already been taken up");
  assert.equal(nothing.detail.admitted_periods, 1);
  assert.equal(Number(nothing.detail.admitted_cents), 90000);
  assert.equal(await scheduleCountFor(b.memoEntry), 1, "nothing was written");
});

cell("p939.replace.posture — the correction door is clara_fn_owner-owned, SECURITY DEFINER with its search_path pinned, reachable by clara_authenticated and by no machine principal, has no wake wrapper and no OBO twin, and replays a lost response under the same op key instead of answering that the schedule has already been replaced", async (t) => {
  if (await correctionGate(t)) return;
  // THE CATALOG POSTURE, read POSITIVELY rather than as the absence of a grant statement.
  const posture = await rootQuery(
    `select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg
       from pg_proc p where p.oid = to_regprocedure($1)`, [REPLACE_DOOR_SIG]);
  assert.equal(posture.rows[0].owner, "clara_fn_owner");
  assert.equal(posture.rows[0].prosecdef, true);
  assert.equal(posture.rows[0].cfg, "search_path=clara, pg_temp");

  for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive",
                      "clara_runtime"]) {
    assert.equal(await roleCanExecute(role, REPLACE_DOOR_SIG), false,
      `${role} must not be able to execute the correction door`);
  }
  assert.equal(await roleCanExecute("clara_authenticated", REPLACE_DOOR_SIG), true,
    "the human lane holds it");
  // NO SECOND ENTRANCE OF ANY KIND — no "_for" twin, no wake wrapper, no agent core. Read off the
  // catalog by name pattern, so a later lane that mints one fails here rather than in review.
  assert.deepEqual(await functionsMatching("replace_.*schedule"),
    ["replace_prepayment_schedule", "replace_revenue_recognition_schedule"],
    "exactly two functions carry this shape, both of them human doors");

  // ---- IDEMPOTENCY. A caller whose response was lost retries under the SAME key and must get the
  // replacement it already made, never CLR13 prepayment_schedule_superseded — which is why the
  // reservation is taken before every other question in the body.
  const scene = await statedTermScene("replaceReplay", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 90000 });
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const made = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  const newStart = await monthStartBack(3);
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: newStart, end: await monthEndAfter(newStart, 1),
    reason: "#939 battery: the cover began a month later than we were told" });

  const key = opk("p939-replay");
  const first = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef,
    opKey: key });
  const again = await replacePrepaymentSchedule(scene.bob, {
    client: scene.client, schedule: made.schedule_id, authorityRef: scene.authorityRef,
    opKey: key });
  assert.equal(again.schedule_id, first.schedule_id,
    "the retry replays the replacement rather than answering that one already exists");
  assert.equal(await scheduleCountFor(scene.memoEntry), 2, "…and wrote no third schedule");
});

// ===========================================================================================
// AC5/AC6 — THE TWO READS CARRY THE TERM SOURCE, AND #919's LIVENESS FIELDS ARE EXTENDED TO THE
//           SECOND CARRIER RATHER THAN FORKED.
// ===========================================================================================

cell("p939.reads.term_source — both schedule reads return a human-stated schedule beside a document-backed one, each saying which carrier its term came from, with WHO stated it, WHEN and WHY on the stated lane; #919's term_live / term_superseded_by / term_moved / term_current_* are the SAME five fields computed against whichever carrier the schedule rode, and a re-statement that changes nothing leaves term_moved false", async () => {
  const scene = await statedTermScene("reads", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 60000 });
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: the client confirmed the cover runs three months from the payment" });
  const memoSchedule = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, purpose: "Memo-only insurance",
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  const docSchedule = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, purpose: "Documented subscription",
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  // ---- THE LIST RETURNS BOTH. Before this ticket it joined clara.document_service_periods
  // INNER, so a schedule with no document row would have been absent from the firm's own list
  // entirely — present in the books, invisible on the screen.
  const list = await listPrepaymentSchedules(scene.bob, scene.client);
  assert.equal(list.schedules.length, 2, "the memo-only schedule is not dropped by the term join");
  const memoRow = list.schedules.find((r) => r.schedule_id === memoSchedule.schedule_id);
  const docRow = list.schedules.find((r) => r.schedule_id === docSchedule.schedule_id);
  assert.ok(memoRow && docRow);

  assert.equal(memoRow.term_source, "human_stated");
  assert.equal(memoRow.stated_term_id, stated.stated_term_id);
  assert.equal(memoRow.document_id, null);
  assert.equal(memoRow.term_live, true, "the statement it rode is still the live one");
  assert.equal(memoRow.term_superseded_by, null);
  assert.equal(memoRow.term_moved, false);
  assert.equal(memoRow.term_current_start, scene.termStart);
  assert.equal(memoRow.term_current_end, scene.termEnd);

  assert.equal(docRow.term_source, "document_service_period");
  assert.equal(docRow.stated_term_id, null);
  assert.ok(docRow.document_id, "the document lane still names its document");
  assert.equal(docRow.term_live, true);
  assert.equal(docRow.term_moved, false);

  // ---- THE DETAIL SAYS WHO, WHEN AND WHY. That trio is the whole difference between a term a
  // document states on its face and a term a named person stated on the telephone.
  const memoDetail = await getPrepaymentSchedule(scene.bob, memoSchedule.schedule_id);
  assert.equal(memoDetail.term_source, "human_stated");
  assert.equal(memoDetail.stated_term_id, stated.stated_term_id);
  assert.equal(memoDetail.term_stated_by, stated.stated_by, "WHO stated it");
  assert.ok(memoDetail.term_stated_at, "WHEN");
  assert.equal(memoDetail.term_reason,
    "#939 battery: the client confirmed the cover runs three months from the payment", "…and WHY");
  assert.equal(memoDetail.document_id, null);
  assert.equal(memoDetail.service_period_id, null);
  assert.equal(memoDetail.term_live, true);
  assert.equal(memoDetail.basis_kind, "human_stated");

  const docDetail = await getPrepaymentSchedule(scene.bob, docSchedule.schedule_id);
  assert.equal(docDetail.term_source, "document_service_period");
  assert.equal(docDetail.stated_term_id, null);
  assert.equal(docDetail.term_stated_by, null,
    "the document lane's provenance is the document, so the stated trio is absent rather than invented");
  assert.equal(docDetail.term_stated_at, null);
  assert.equal(docDetail.term_reason, null);
  assert.ok(docDetail.service_period_id);
  assert.equal(docDetail.term_live, true, "#919's own fields still answer on the document lane");
  assert.equal(docDetail.term_moved, false);

  // ---- A RE-STATEMENT THAT CHANGES NOTHING. The stating door supersedes unconditionally — it
  // compares no dates — so `term_live` goes false on a restatement that repeats the term byte for
  // byte. `term_moved` is the fact a surface may act on, and it stays FALSE. That is #919's ADV-02
  // ruling, extended to this carrier rather than re-decided for it.
  const restated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: the same dates, verified a second time against the bank statement" });
  const afterRestate = await getPrepaymentSchedule(scene.bob, memoSchedule.schedule_id);
  assert.equal(afterRestate.term_live, false, "the statement this schedule rode is no longer live");
  assert.equal(afterRestate.term_superseded_by, restated.stated_term_id, "…and it names its successor");
  assert.equal(afterRestate.term_moved, false, "but the TERM did not move, so no surface may say it did");
  assert.equal(afterRestate.term_current_start, scene.termStart);
  assert.equal(afterRestate.term_current_end, scene.termEnd);
  assert.equal(afterRestate.stated_term_id, stated.stated_term_id,
    "the schedule still names the statement it actually rode");
  assert.equal(afterRestate.term_reason,
    "#939 battery: the client confirmed the cover runs three months from the payment",
    "…and shows THAT statement's reason, not the newest one's");

  // ---- A CORRECTION THAT REALLY MOVES THE TERM. Now both flags say so, on both reads.
  const newStart = await monthStartBack(3);
  const newEnd = await monthEndAfter(newStart, 2);
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, start: newStart, end: newEnd,
    reason: "#939 battery: the cover actually began a month later" });
  const moved = await getPrepaymentSchedule(scene.bob, memoSchedule.schedule_id);
  assert.equal(moved.term_live, false);
  assert.equal(moved.term_moved, true, "the term that stands today states different dates");
  assert.equal(moved.term_current_start, newStart);
  assert.equal(moved.term_current_end, newEnd);
  assert.equal(moved.term_start, scene.termStart, "the schedule's own allocation did not move");
  const movedList = await listPrepaymentSchedules(scene.bob, scene.client);
  const movedRow = movedList.schedules.find((r) => r.schedule_id === memoSchedule.schedule_id);
  assert.equal(movedRow.term_moved, true, "the list says the same thing the detail does");
  assert.equal(movedRow.term_current_start, newStart);
});

// ===========================================================================================
// THE FIX ROUND (ADV-05) — A REVERSED RECOGNITION IS NOT AMORTISABLE, ON EITHER CARRIER.
// ===========================================================================================

cell("p939.create.reversed — a recognition that has been REVERSED is refused by name on both carriers, the stating door refuses it too, nothing is written on any of them, and the refusal matches the predicate the attention band already filters on", async () => {
  const scene = await statedTermScene("reversed", { cents: 90000, termMonthsBack: 4, termMonths: 3 });
  const { humanQuery } = await import("./rig-helpers.mjs");
  const reverse = (entry, tag) => humanQuery(scene.alice,
    "select clara.reverse_entry($1,$2,$3) as r", [entry, `#939 battery: ${tag}`, opk("p939-rev")]);

  // ---- THE ATTENTION BAND'S OWN PREDICATE, read first, because it is the rule the doors must
  // match: `clara.list_prepayment_attention` filters `je.reversed_by is null` (0305:1571), so the
  // band will never advertise a receipt the door was happily accepting.
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: the client confirmed the cover on the telephone" });
  const beforeBand = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(beforeBand.unscheduled.some((r) => r.entry_id === scene.memoEntry), true,
    "the scene's memo-only recognition is not offered at all -- this cell cannot measure the change");

  await reverse(scene.memoEntry, "the client cancelled and the payment was refunded");
  const afterBand = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(afterBand.unscheduled.some((r) => r.entry_id === scene.memoEntry), false,
    "the band still advertises a reversed recognition");

  // ---- THE MEMO-ONLY LANE. A refunded advance put on a schedule would post Dr expense / Cr the
  // prepaid asset every month against money the client got back, driving the asset into a credit
  // balance and charging an expense that was never incurred.
  const memo = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "amortising a reversed memo-only recognition");
  assert.equal(memo.detail.axis, "source_reversed", "the refusal does not name WHICH unfitness");
  assert.ok(memo.detail.reversed_by, "…nor the reversal that made it unfit");
  assert.equal(await scheduleCountFor(scene.memoEntry), 0, "a schedule was written anyway");

  // ---- THE DOCUMENT LANE, the same rule from the same body: the check sits above the branch, so
  // neither carrier can drift from the other.
  await reverse(scene.entry, "the supplier credited the whole subscription");
  const doc = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => createPrepaymentSchedule(scene.bob, {
      client: scene.client, sourceEntry: scene.entry,
      expenseAccount: scene.target, authorityRef: scene.authorityRef }),
    "amortising a reversed document-bound recognition");
  assert.equal(doc.detail.axis, "source_reversed");
  assert.equal(await scheduleCountFor(scene.entry), 0);

  // ---- AND THE STATING DOOR. It already read `je.reversed_by` into its record and never looked
  // at it; a term stated over a refunded payment describes a service nobody is going to receive.
  const memoOnly2 = await (await import("./prepayment-stated-term-fixtures.mjs"))
    .memoOnlyRecognition(scene, { cents: 45000 });
  await reverse(memoOnly2.entry, "refunded before the cover began");
  const stating = await assertPair(CLR.badRequest, PREPAY_REASON.sourceUnfit,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: memoOnly2.entry,
      start: scene.termStart, end: scene.termEnd }),
    "stating a term over a reversed recognition");
  assert.equal(stating.detail.axis, "source_reversed");
  assert.deepEqual(await statedTermsFor(memoOnly2.entry), [],
    "a stated term was written for a reversed recognition");
});

// ===========================================================================================
// THE FIX ROUND (ADV-03) — THE THREE CARRIER BOUNDS ARE REFUSED BY NAME, NOT BY CONSTRAINT.
// ===========================================================================================

cell("p939.stated_term.bounds — an out-of-domain date, a non-finite date and a term past the 120-month cap are each refused by the DOOR with the token this battery's own vocabulary declares, carrying the bound they broke, and never as a raw 23514 a surface cannot classify; the carrier's constraints still stand behind them", async () => {
  const scene = await statedTermScene("bounds", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  // (a) OUT OF DOMAIN. `ck_pst_domain` admits 1900-01-01 .. 2200-12-31 — the SAME window
  // `clara.document_service_periods` uses, because the two carriers describe the same kind of fact.
  // An `<input type="date">` happily submits 1899-01-01 and the web form validates only presence,
  // order and a non-blank reason, so this arrives from a real surface.
  const domain = await assertPair(CLR.badRequest, STATED_TERM_REASON.datesOutOfDomain,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: "1899-01-01", end: "1899-12-31" }),
    "a stated term outside the carrier's date domain");
  assert.equal(domain.detail.domain_start, "1900-01-01", "the refusal names the bound it broke");
  assert.equal(domain.detail.domain_end, "2200-12-31");

  // (b) NOT FINITE. `date` admits 'infinity', and it is asked BEFORE the domain so the answer says
  // what is actually wrong rather than "out of range".
  await assertPair(CLR.badRequest, STATED_TERM_REASON.datesNotFinite,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: scene.termStart, end: "infinity" }),
    "a stated term whose end is infinite");
  await assertPair(CLR.badRequest, STATED_TERM_REASON.datesNotFinite,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: "-infinity", end: scene.termEnd }),
    "a stated term whose start is infinite");

  // (c) THE 120-MONTH CAP, decision 5's "the same cap as a document term". The count is the RULED
  // predicate's own — charged whole months — not a date subtraction, so the cell asserts the
  // number the door computed as well as the cap it compared against.
  const long = await assertPair(CLR.badRequest, STATED_TERM_REASON.termTooLong,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: "2025-01-01", end: "2041-08-31" }),
    "a 200-month stated term");
  assert.equal(long.detail.period_count, 200, "the refusal does not say how many months it counted");
  assert.equal(long.detail.max_periods, 120);

  // …AND 120 EXACTLY IS ADMITTED, so the cap is a boundary rather than a fence in the wrong place.
  // (The fiscal-year arm belongs to the SCHEDULE door, not to this one: stating a term records a
  // fact, and a fact outside an opened year is still the fact.)
  const atCap = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: "2025-01-01", end: "2034-12-31",
    reason: "#939 battery: a ten-year maintenance contract, the carrier's stated maximum" });
  assert.ok(atCap.stated_term_id, "exactly 120 charged months is refused -- the cap is off by one");

  // THE CARRIER'S OWN CONSTRAINTS STILL STAND BEHIND THE DOOR. 0305's comment is "the door refuses
  // these BY NAME so a caller gets a reason; these exist so no OTHER writer, now or later, can get
  // past them" — so the cell proves the second half too, by writing straight at the table as the
  // owner and watching the constraint fire.
  const raw = await rootQuery(
    `select count(*)::int as n from pg_constraint
      where conrelid = 'clara.prepayment_stated_terms'::regclass
        and conname in ('ck_pst_finite','ck_pst_domain','ck_pst_max_periods')`);
  assert.equal(raw.rows[0].n, 3, "a door refusal replaced the carrier's own constraint");
});

// ===========================================================================================
// THE FIX ROUND (ADV-02) — THE STATED REASON IS BOOKKEEPER-FLOORED ON THE READS TOO.
// ===========================================================================================

cell("p939.reads.reason_floor — a VIEWER of the owning firm reads both schedule reads and gets no stated reason, no stater and no stated-at, with term_reason_withheld:true saying the fact exists and who may see it; a bookkeeper on the same schedule gets all three; and the wall matches the one clara.prepayment_stated_terms' own RLS policy applies to a direct read", async () => {
  const scene = await statedTermScene("reasonfloor", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 60000 });
  const carol = scene.w.users.carol;                      // a VIEWER of this same firm
  const SECRET =
    "#939 battery: the partner judged the term from a phone call with the client's CFO, and the "
    + "call is the only record";
  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd, reason: SECRET });
  const schedule = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry, purpose: "Memo-only insurance",
    expenseAccount: scene.target, authorityRef: scene.authorityRef });

  // ---- THE TABLE'S OWN WALL, measured first, because it is the wall the reads must match:
  // `p_pst_human` admits `clara.actor_role_rank() >= clara.role_rank('bookkeeper')` and 0305's own
  // comment says why ("this table holds a professional's STATED REASON, the same data class 0140
  // walled off there"). `clara.document_service_periods` carries the identical policy.
  const { humanQuery } = await import("./rig-helpers.mjs");
  const direct = async (sub) => Number((await humanQuery(sub,
    "select count(*)::int as n from clara.prepayment_stated_terms where source_entry_id = $1",
    [scene.memoEntry])).rows[0].n);
  assert.equal(await direct(scene.bob), 1, "the bookkeeper cannot see the row through the table");
  assert.equal(await direct(carol), 0, "the table's own policy does not wall the viewer");

  // ---- THE DETAIL READ. A definer read that projected the reason handed a viewer exactly what
  // the policy above refuses them, which made that floor decorative.
  const asViewer = await getPrepaymentSchedule(carol, schedule.schedule_id);
  assert.equal(asViewer.term_reason, null, "the viewer was handed the stated reason");
  assert.equal(asViewer.term_stated_by, null, "…and the professional who stated it");
  assert.equal(asViewer.term_stated_at, null, "…and when");
  assert.equal(asViewer.term_reason_withheld, true,
    "the viewer is told the statement EXISTS and is withheld, never that there is none");
  // EVERYTHING ELSE THE VIEWER COULD SEE BEFORE, THEY STILL SEE: this is a field wall, not a
  // narrower read, and a viewer who lost the schedule would be a different defect.
  assert.equal(asViewer.term_source, "human_stated");
  assert.equal(asViewer.stated_term_id, stated.stated_term_id);
  assert.equal(asViewer.term_live, true);
  assert.equal(asViewer.term_start, scene.termStart);
  assert.equal(asViewer.total_cents, 60000);

  const asBookkeeper = await getPrepaymentSchedule(scene.bob, schedule.schedule_id);
  assert.equal(asBookkeeper.term_reason, SECRET, "the floor now hides the reason from its OWNER");
  assert.equal(asBookkeeper.term_stated_by, stated.stated_by);
  assert.ok(asBookkeeper.term_stated_at);
  assert.equal(asBookkeeper.term_reason_withheld, false,
    "nothing is withheld from a reader above the floor");

  // ---- THE LIST READ ANSWERS THE SAME WAY. Two reads that disagreed would leave the reason one
  // click away from the surface that hid it.
  const viewerList = await listPrepaymentSchedules(carol, scene.client);
  const viewerRow = viewerList.schedules.find((r) => r.schedule_id === schedule.schedule_id);
  assert.ok(viewerRow, "the viewer lost the schedule entirely -- this is a FIELD wall");
  assert.equal(viewerRow.term_reason, null);
  assert.equal(viewerRow.term_stated_by, null);
  assert.equal(viewerRow.term_stated_at, null);
  assert.equal(viewerRow.term_reason_withheld, true);
  assert.equal(viewerRow.term_source, "human_stated", "…and still sees which carrier it rode");
  assert.equal(viewerRow.term_live, true);

  const bookkeeperList = await listPrepaymentSchedules(scene.bob, scene.client);
  const bookkeeperRow = bookkeeperList.schedules.find((r) => r.schedule_id === schedule.schedule_id);
  assert.equal(bookkeeperRow.term_reason, SECRET);
  assert.equal(bookkeeperRow.term_reason_withheld, false);

  // ---- NOTHING IS WITHHELD ON THE DOCUMENT LANE, because there is no stated trio to withhold:
  // `withheld` must mean "there is something here you may not see", never "this field is null".
  const docSchedule = await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.entry, purpose: "Documented subscription",
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  const docAsViewer = await getPrepaymentSchedule(carol, docSchedule.schedule_id);
  assert.equal(docAsViewer.term_source, "document_service_period");
  assert.equal(docAsViewer.term_reason, null);
  assert.equal(docAsViewer.term_reason_withheld, false,
    "the document lane has no stated reason at all, so nothing is being withheld");
});

// ===========================================================================================
// AC3 (second half) — THE ATTENTION BAND FINDS A MEMO-ONLY PREPAYMENT AND NAMES THE NEXT ACT.
// ===========================================================================================

cell("p939.attention.memo_only — arm B lists a memo-only recognition with 'state the service period' as its next step, names the carrier its term would live in, flips to 'configure the schedule' the moment a term is stated, drops the row once a schedule exists, and still refuses to advertise a memo-only RECEIVABLE", async () => {
  const scene = await statedTermScene("attention", {
    cents: 90000, termMonthsBack: 4, termMonths: 3, memoCents: 45000 });
  const decoy = await memoOnlyIneligible(scene);

  const before = await listPrepaymentAttention(scene.bob, scene.client);
  const memoBefore = before.unscheduled.find((r) => r.entry_id === scene.memoEntry);
  assert.ok(memoBefore,
    "a memo-only prepayment is a CANDIDATE -- before this ticket the arm filtered it out entirely, so a prepaid asset could sit on the books with nothing on any screen saying so");
  assert.equal(memoBefore.document_id, null);
  assert.equal(memoBefore.term_carrier, "human_stated",
    "the read says WHERE this recognition's term would live");
  assert.equal(memoBefore.has_live_term, false);
  assert.equal(memoBefore.next_step, "state_service_period",
    "…and names the person's next act as a closed token the surface maps to its own copy");
  assert.equal(memoBefore.prepaid_account_code, scene.prepaid);
  assert.equal(memoBefore.amount_cents, 45000);

  // THE DOCUMENT LANE IS UNCHANGED, and it is the contrast that makes the token useful: the
  // scene's own document-bound recognition already carries a live service period.
  const docBefore = before.unscheduled.find((r) => r.entry_id === scene.entry);
  assert.ok(docBefore);
  assert.equal(docBefore.term_carrier, "document_service_period");
  assert.equal(docBefore.has_live_term, true);
  assert.equal(docBefore.next_step, "configure_schedule");

  // THE WALL THAT KEEPS THE ARM HONEST NOW THAT THE FILTER IS GONE. A memo-only entry whose one
  // debited asset is the receivable CONTROL account is an ordinary uninvoiced sale, not a
  // prepayment, and the door would refuse it -- so the band must not offer it.
  assert.equal(before.unscheduled.filter((r) => r.entry_id === decoy.entry).length, 0,
    "a memo-only RECEIVABLE is not advertised as a prepayment awaiting a term");

  // ---- THE TERM IS STATED. Same row, next act moves.
  await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd });
  const stated = await listPrepaymentAttention(scene.bob, scene.client);
  const memoStated = stated.unscheduled.find((r) => r.entry_id === scene.memoEntry);
  assert.ok(memoStated, "it is still a candidate -- stating a term is not configuring a schedule");
  assert.equal(memoStated.has_live_term, true);
  assert.equal(memoStated.next_step, "configure_schedule");

  // ---- THE SCHEDULE IS CONFIGURED. The row leaves the band, because the band is "recognised, NOT
  // YET amortised".
  await createPrepaymentSchedule(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    expenseAccount: scene.target, authorityRef: scene.authorityRef });
  const done = await listPrepaymentAttention(scene.bob, scene.client);
  assert.equal(done.unscheduled.filter((r) => r.entry_id === scene.memoEntry).length, 0,
    "an amortised prepayment is no longer awaiting amortisation");
  assert.equal(done.unscheduled.filter((r) => r.entry_id === scene.entry).length, 1,
    "…and the document-bound sibling is untouched");
});
