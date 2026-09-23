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
  STATED_TERM_REASON, STATED_TERM_DOOR_SIG, EVALUATOR_V2_SIG,
} from "./prepayment-stated-term-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

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
