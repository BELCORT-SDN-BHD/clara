// #839 — THE SHARED QUESTION RECORD CARRIES THE ADMITTED BASIS. Migration
// 0265_work_question_admitted_basis.sql.
//
// WHAT THIS BATTERY EXISTS FOR. `clara.get_work_question` / `clara.get_work_pending_question` are
// the ONE record every surface renders (0180, `work-question-reads.test.mjs`'s own header). Before
// this ticket that record carried `basis_digest` / `work_basis_digest` — a fingerprint, never the
// figures — so a surface that only ever asked THIS door (B4's Needs-you row, B6's rail cards) could
// not offer "Restate as a new instruction" the way the Work detail (B3) does, because restating
// needs the admitted posting date, memo and lines to prefill (`work-restate.tsx`'s own
// `restatedBasis`). This file proves the door now hands back exactly the admitted basis, verbatim,
// beside every field it already carried — and that every one of those existing fields is unmoved.
//
// Frontier-gated on the `work_question_admitted_basis$` stem. A FOCUSED run
// (`node --test tests/work-question-admitted-basis.test.mjs`) with the variable unset fails loudly
// against a chain missing 0265; an estate sweep preloads
// `./tests/work-question-admitted-basis-preintegration-gate.mjs` and skips cleanly instead.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, rootQuery,
  parkedWork, getWorkQuestion, getWorkPendingQuestion, answerWorkQuestion, twoFieldAnswer,
  basis,
} from "./work-question-fixtures.mjs";

const MIGRATION = "0265_work_question_admitted_basis.sql";
const STEM = "work_question_admitted_basis$";
// #885 [0268] recuts this SAME record once more, adding `source_corrected_at` (whether the
// reading this question stands on has been corrected since it was asked). That is a SECOND
// frontier above this file's own, so the key-set pin below asserts 0180's twenty-four plus
// `basis` BELOW it and plus `source_corrected_at` as well ABOVE it -- both exact, neither a skip.
const SUPERSEDE_STEM = "work_source_correction_supersede$";

let world = null;
let ready = false;
let corrected = false;   // #885/0268 applied: the record carries source_corrected_at too

before(async () => {
  const at = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (at.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_WORK_QUESTION_ADMITTED_BASIS !== "1") {
      throw new Error(
        `work-question-admitted-basis premise ${MIGRATION} is not applied (no ${STEM} row in `
        + "clara.schema_migrations) and CLARA_ALLOW_MISSING_WORK_QUESTION_ADMITTED_BASIS is unset "
        + "-- this is a FOCUSED run and must fail loudly, not skip. Preload "
        + "./tests/work-question-admitted-basis-preintegration-gate.mjs for an estate sweep against "
        + "a pre-PR chain.");
    }
    return;
  }
  ready = true;
  corrected = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SUPERSEDE_STEM])).rows[0].n > 0;
  world = await buildWorkWorld();
});

after(async () => {
  printLaneNotes("work-question-admitted-basis");
  printSkipCount("work-question-admitted-basis");
  await endPool();
});

const A1 = () => world.clients.A1;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

test("w839.basis.pending get_work_question carries the admitted basis, verbatim, on a pending question", async (t) => {
  if (!ready) return t.skip("0265 not applied");
  const admitted = basis();   // the exact object admit_journal_work will store
  const p = await parkedWork({ client: A1(), author: BOB(), basis: admitted });
  const rec = await getWorkQuestion(BOB(), p.questionId);

  assert.deepEqual(rec.basis, admitted,
    "w839.basis.pending: the record's basis is the admitted basis, transcribed field for field");

  // EVERY FIELD 0180 SHIPPED IS STILL THERE, UNMOVED — the additive-only claim, checked positively
  // rather than only by the migration's own tail census (which reads the function's TEXT; this
  // reads what the door actually RETURNS).
  assert.equal(rec.question_id, p.questionId);
  assert.equal(rec.work_id, p.workId);
  assert.equal(rec.client_id, A1());
  assert.equal(rec.task_id, p.taskId);
  assert.equal(typeof rec.firm_id, "string", "w839.basis.pending: firm_id still rides along");
  assert.equal(rec.question_version, 1);
  assert.equal(rec.status, "pending");
  assert.equal(rec.delivery_state, "pending");
  assert.equal(rec.delivery_attempts, 0);
  assert.equal(rec.answer, null);
  assert.equal(rec.answered_by, null);
  assert.equal(rec.work_status, "awaiting_input");
  assert.equal(rec.basis_digest, rec.work_basis_digest,
    "w839.basis.pending: the digest pair is untouched by the new key");
  assert.ok(rec.expires_at && rec.created_at);

  // THE EXACT KEY SET — 0180's own plus `basis`, and, above the #885 frontier, plus
  // `source_corrected_at`. Exact on both chains: a key nobody declared is still a finding.
  const KEYS_0265 = [
    "answer", "answered_at", "answered_by", "answered_role", "basis", "basis_digest",
    "client_id", "context", "created_at", "delivery_attempts", "delivery_state",
    "expires_at", "fields", "firm_id", "question", "question_id", "question_version",
    "reason", "source_ref", "status", "task_id", "work_basis_digest", "work_id", "work_status",
  ];
  assert.deepEqual(
    [...Object.keys(rec)].sort(),
    (corrected ? [...KEYS_0265, "source_corrected_at", "work_posted"] : KEYS_0265).sort(),
    "w839.basis.pending: the record carries exactly 0180's fields, plus `basis`, plus "
    + "`source_corrected_at` and `work_posted` once #885/0268 is applied",
  );
  assert.equal(corrected ? rec.source_corrected_at : null, null,
    "…and on a question whose source has NOT been corrected since it was asked, that key is null");
  assert.equal(corrected ? rec.work_posted : false, false,
    "…and a Work that has not posted says so, which is what lets a surface offer the exit that works");
});

test("w839.basis.settled the answered record still carries the SAME admitted basis", async (t) => {
  if (!ready) return t.skip("0265 not applied");
  const admitted = basis({ memo: "w839 settled probe", cents: 45600 });
  const p = await parkedWork({ client: A1(), author: BOB(), basis: admitted });
  await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() });
  const rec = await getWorkQuestion(ALICE(), p.questionId);

  assert.equal(rec.status, "answered");
  assert.deepEqual(rec.basis, admitted,
    "w839.basis.settled: answering the question does not change what basis it reports — the basis "
    + "is the WORK's, frozen at admission, never the question's own answer");
});

test("w839.basis.pending get_work_pending_question (B3's own address form) carries the same basis", async (t) => {
  if (!ready) return t.skip("0265 not applied");
  const admitted = basis({ memo: "w839 pending-address probe" });
  const p = await parkedWork({ client: A1(), author: BOB(), basis: admitted });
  const byWork = await getWorkPendingQuestion(BOB(), p.workId);
  const byId = await getWorkQuestion(BOB(), p.questionId);

  assert.deepEqual(byWork.basis, admitted);
  assert.deepEqual(byWork, byId,
    "w839.basis.pending: B3's own address form and B4/B6's still resolve to the identical record");
});
