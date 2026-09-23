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
  scheduleRow, monthStartBack, opk,
  wakeDuePlanOccurrences, occurrenceRows, workRow, claimWorkRun, settleWorkRun,
  mintClientObo, wakeRecordJournalEntry, receiptsForWork,
} from "./prepayment-stated-term-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 7;

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

cell("p939.supersede.running — a stated term corrected AFTER its schedule has posted a period moves nothing: the stored allocation, the term the schedule rode, its occurrences and its COMMITTED receipt are byte-identical afterwards, the schedule keeps naming the statement it was derived from, and a second schedule over the same recognition is still refused by name", async () => {
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
