// #629 — THE OPEN VERB AND THE FIRST-ANSWER GATE. The read doors, the firm inbox, the cascades,
// the expiry arm and the immutability belts are `work-question-reads.test.mjs`.
//
// Frontier-gated on the `work_questions$` stem.
//
// WHAT THIS FILE IS ABOUT. #629 asks for ONE persistent question per missing accounting fact, with
// a stable identity and version, and for the database to accept EXACTLY ONE current authorised
// answer for it — replaying the same key, refusing a reused key with a different payload, and
// handing every loser (duplicate, concurrent, stale, expired, changed-basis, answered-elsewhere)
// the AUTHORITATIVE current record rather than a bare "no". Every cell below asserts the
// (errcode, detail.reason) PAIR, because an errcode alone cannot tell a stale answer from a
// malformed one and the web's convergence branch keys on the pair.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateQuestion, buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, settleWorkRun, cancelAgentTask,
  openWorkQuestion, answerWorkQuestion, parkedWork, interruptionRow, interruptionsForWork,
  auditForQuestion, getWorkPendingQuestion,
  twoFields, oneField, twoFieldAnswer, questionPayload, QREASON, CLR,
  assertPair, assertRaises, detailOf, rootQuery, opk, workRow, taskRow, freshWorkClient, basis,
  WCHART,
} from "./work-question-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-question");
  printSkipCount("work-question");
  await endPool();
});

const A1 = () => world.clients.A1;
const B1 = () => world.clients.B1;
const ALICE = () => world.users.alice;   // owner, firm A
const BOB = () => world.users.bob;       // bookkeeper, firm A
const CAROL = () => world.users.carol;   // viewer, firm A
const DAVE = () => world.users.dave;     // owner, firm B

// ===========================================================================================
// 1 · clara.open_work_question — the runtime lane.
// ===========================================================================================

test("w629.open.happy one pending question with the Work identity, the fields and version 1", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({
    client: A1(), author: BOB(),
    reason: "The admitted basis names no posting date.",
    sourceRef: { kind: "message", id: "m-1" },
  });

  assert.equal(p.version, 1, "open.happy: the first question on a Work is version 1");
  assert.ok(p.questionId, "open.happy: a question id comes back");
  assert.ok(p.expiresAt, "open.happy: the deadline comes back");

  const row = await interruptionRow(p.questionId);
  assert.equal(row.status, "pending");
  assert.equal(row.work_id, p.workId, "open.happy: the row carries its Work");
  assert.equal(row.client_id, A1(), "open.happy: the client is STAMPED FROM THE WORK, not an argument");
  assert.equal(row.question_version, 1);
  assert.equal(row.delivery_state, "pending", "open.happy: nothing has been delivered yet");
  assert.equal(row.delivery_attempts, 0);
  assert.deepEqual(row.fields, twoFields(), "open.happy: the declared fields are stored verbatim");
  assert.equal(row.reason, "The admitted basis names no posting date.");
  assert.deepEqual(row.source_ref, { kind: "message", id: "m-1" });
  assert.equal(row.answer, null);
  assert.equal(row.answered_by, null);

  const w = await workRow(p.workId);
  assert.equal(row.basis_digest, w.basis_digest,
    "open.happy: the question pins the Work's basis digest, so a later basis change is detectable");
  assert.equal(w.status, "awaiting_input",
    "open.happy: the Work follows its task to awaiting_input through 0178's mirror");
  assert.equal((await taskRow(p.taskId)).status, "awaiting_input");
});

test("w629.open.replay the SAME hook token returns the ORIGINAL question, never a second one", async (t) => {
  if (await gateQuestion(t)) return;
  const token = `hook-replay-${Date.now().toString(36)}`;
  const p = await parkedWork({ client: A1(), author: BOB(), hookToken: token });
  const again = await openWorkQuestion({ task: p.taskId, hookToken: token });

  assert.equal(again.question_id, p.questionId, "open.replay: the same token resolves the same question");
  assert.equal(again.question_version, 1);
  assert.equal(again.replayed, true, "open.replay: and says so");
  assert.equal((await interruptionsForWork(p.workId)).length, 1,
    "open.replay: a memoized-token crash replay opens NO second question");
});

test("w629.open.linearised a DIFFERENT token while one is pending is refused, with no second row", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await assertPair(CLR.conflict, QREASON.questionAlreadyPending,
    () => openWorkQuestion({ task: p.taskId }), "open.linearised");
  assert.equal((await interruptionsForWork(p.workId)).length, 1,
    "open.linearised: no second row was written");
});

test("w629.open.token-bound a token already bound to ANOTHER task is refused", async (t) => {
  if (await gateQuestion(t)) return;
  const token = `hook-cross-${Date.now().toString(36)}`;
  await parkedWork({ client: A1(), author: BOB(), hookToken: token });
  const other = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: other.task_id, runId: opk("w629-run") });
  await assertPair(CLR.conflict, QREASON.hookTokenBound,
    () => openWorkQuestion({ task: other.task_id, hookToken: token }), "open.token-bound");
  assert.equal((await taskRow(other.task_id)).status, "running",
    "open.token-bound: the refused open rolled its own transition back");
});

test("w629.open.not-running a task that never claimed cannot park", async (t) => {
  if (await gateQuestion(t)) return;
  const admitted = await admitJournalWork({ client: A1(), author: BOB() });
  await assertPair(CLR.conflict, QREASON.taskNotRunning,
    () => openWorkQuestion({ task: admitted.task_id }), "open.not-running");
  assert.equal((await interruptionsForWork(admitted.work_id)).length, 0);
});

test("w629.open.kind a chat turn is not an accounting Work and cannot open a work question", async (t) => {
  if (await gateQuestion(t)) return;
  const r = await rootQuery(
    "select id from clara.agent_tasks where kind <> 'accounting_work' order by created_at desc limit 1");
  if (r.rowCount === 0) {
    // Nothing else in this database has ever produced a task of another kind — the claim still
    // holds, but it is not observable here. Say so rather than passing silently.
    assert.ok(true, "open.kind: no non-accounting task exists in this database to probe with");
    return;
  }
  const { err } = await assertPair(CLR.badRequest, QREASON.wrongTaskKind,
    () => openWorkQuestion({ task: r.rows[0].id }), "open.kind");
  assert.ok(detailOf(err).kind, "open.kind: the refusal names the kind it saw");
});

test("w629.open.unknown-task an unknown task is CLR11, never an oracle-shaped success", async (t) => {
  if (await gateQuestion(t)) return;
  await assertPair(CLR.notFound, QREASON.taskNotFound,
    () => openWorkQuestion({ task: "00000000-0000-4000-8000-0000000629aa" }), "open.unknown-task");
});

test("w629.open.fields every malformed field declaration is refused BY KEY, before a human sees it", async (t) => {
  if (await gateQuestion(t)) return;
  const cases = [
    ["not an array", "hello", "array"],
    ["zero fields", [], "one_to_six"],
    ["seven fields", Array.from({ length: 7 }, (_, i) => ({ key: `f${i}`, label: "L", kind: "text" })), "one_to_six"],
    ["an unknown key", [{ key: "a", label: "L", kind: "text", colour: "red" }], "unknown_key"],
    ["a malformed key", [{ key: "Not A Key", label: "L", kind: "text" }], "key_shape"],
    ["a duplicate key", [{ key: "a", label: "L", kind: "text" }, { key: "a", label: "M", kind: "text" }], "duplicate_key"],
    ["the reserved key note", [{ key: "note", label: "L", kind: "text" }], "reserved_key"],
    ["no label", [{ key: "a", label: "   ", kind: "text" }], "label"],
    ["an unknown kind", [{ key: "a", label: "L", kind: "colour" }], "kind"],
    ["a non-boolean required", [{ key: "a", label: "L", kind: "text", required: "yes" }], "required_boolean"],
    ["a choice with no options", [{ key: "a", label: "L", kind: "choice" }], "options"],
    ["a choice with one option", [{ key: "a", label: "L", kind: "choice", options: [{ value: "x", label: "X" }] }], "options"],
    ["a malformed option", [{ key: "a", label: "L", kind: "choice", options: [{ value: "x" }, { value: "y", label: "Y" }] }], "option_shape"],
    ["duplicate option values", [{ key: "a", label: "L", kind: "choice", options: [{ value: "x", label: "X" }, { value: "x", label: "Y" }] }], "option_values_unique"],
    ["options on a text field", [{ key: "a", label: "L", kind: "text", options: [] }], "options_not_allowed"],
  ];
  for (const [label, fields, constraint] of cases) {
    const admitted = await admitJournalWork({ client: A1(), author: BOB() });
    await claimWorkRun({ task: admitted.task_id, runId: opk("w629-run") });
    const { err } = await assertPair(CLR.badRequest, QREASON.invalidFields,
      () => openWorkQuestion({ task: admitted.task_id, fields }), `open.fields ${label}`);
    assert.equal(detailOf(err).constraint, constraint,
      `open.fields ${label}: the refusal names the violated constraint`);
    assert.ok(detailOf(err).field, `open.fields ${label}: the refusal names the offending field path`);
    assert.equal((await taskRow(admitted.task_id)).status, "running",
      `open.fields ${label}: a refused open leaves the task RUNNING — it never half-parks`);
  }
});

test("w629.open.version a re-asked question is a NEW row with the NEXT version; the old one stays", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  // The estate's own way for a parked question to end without an answer: settle the run.
  await settleWorkRun({ task: p.taskId, outcome: "expired", error: { code: "x", reason: "x", message: "x" } });
  assert.equal((await interruptionRow(p.questionId)).status, "cancelled",
    "open.version: 0178's settle cascade closes the pending question");

  // A retry makes a NEW run for the SAME Work; the new run asks again.
  const retried = await rootQuery(
    "select clara.retry_accounting_work(p_work => $1::uuid, p_author => $2::uuid, p_op_key => $3::text) as r",
    [p.workId, BOB(), opk("w629-retry")]);
  const task2 = retried.rows[0].r.task_id;
  await claimWorkRun({ task: task2, runId: opk("w629-run2") });
  const second = await openWorkQuestion({ task: task2 });

  assert.equal(second.question_version, 2, "open.version: the second question is version 2");
  const rows = await interruptionsForWork(p.workId);
  assert.equal(rows.length, 2, "open.version: the first row stays as history");
  assert.deepEqual(rows.map((r) => r.question_version), [1, 2]);
  assert.equal(rows[0].status, "cancelled");
  assert.equal(rows[1].status, "pending");
});

// ===========================================================================================
// 2 · clara.answer_work_question — the first-answer gate.
// ===========================================================================================

test("w629.answer.happy one accepted answer, with the answerer's live role recorded", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const key = opk("w629-answer");
  const out = await answerWorkQuestion(BOB(), {
    question: p.questionId, version: 1, answer: twoFieldAnswer({ note: "from the bank app" }), opKey: key,
  });

  assert.equal(out.status, "answered");
  assert.equal(out.question_id, p.questionId);
  assert.equal(out.work_id, p.workId);
  assert.equal(out.question_version, 1);
  assert.equal(out.answered_by, BOB());
  assert.equal(out.answered_role, "bookkeeper", "answer.happy: the LIVE role at answer time is recorded");
  assert.ok(out.answered_at, "answer.happy: the receipt carries when");

  const row = await interruptionRow(p.questionId);
  assert.equal(row.status, "answered");
  assert.equal(row.answered_by, BOB());
  assert.equal(row.answered_role, "bookkeeper");
  assert.equal(row.answer_key, key, "answer.happy: the op key is recorded on the row");
  assert.equal(row.answer.posting_date, "2026-09-01");
  assert.equal(row.answer.amount_cents, 120000,
    "answer.happy: an integer minor unit is stored EXACTLY, never coerced");
  assert.equal(row.answer.note, "from the bank app");
  assert.equal(row.delivery_state, "pending",
    "answer.happy: accepting an answer is not delivering it — that is the runtime's own state");

  assert.equal((await auditForQuestion("answer_work_question", p.questionId)).length, 1,
    "answer.happy: exactly one audit row names this question");
});

test("w629.answer.replay the SAME key and payload replays the ORIGINAL receipt byte-for-byte", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const key = opk("w629-replay");
  const answer = twoFieldAnswer();
  const first = await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer, opKey: key });
  const second = await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer, opKey: key });

  assert.deepEqual(second, first,
    "answer.replay: a retried submit after a lost response replays rather than re-answers");
  assert.equal((await auditForQuestion("answer_work_question", p.questionId)).length, 1,
    "answer.replay: and writes no second audit row");
});

test("w629.answer.key-conflict the same key with a DIFFERENT payload is a typed refusal", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const key = opk("w629-conflict");
  await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer(), opKey: key });
  await assertPair(CLR.badRequest, QREASON.opKeyConflict,
    () => answerWorkQuestion(BOB(), {
      question: p.questionId, version: 1, answer: twoFieldAnswer({ cents: 999 }), opKey: key,
    }), "answer.key-conflict");
});

test("w629.answer.elsewhere a SECOND member's answer converges on the winner's own record", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const winner = await answerWorkQuestion(BOB(), {
    question: p.questionId, version: 1, answer: twoFieldAnswer(),
  });
  const { err } = await assertPair(CLR.conflict, QREASON.alreadyAnswered,
    () => answerWorkQuestion(ALICE(), {
      question: p.questionId, version: 1, answer: twoFieldAnswer({ cents: 5000 }),
    }), "answer.elsewhere");
  const current = detailOf(err).current;
  assert.equal(current.status, "answered");
  assert.equal(current.answered_by, BOB(),
    "answer.elsewhere: the loser is handed the WINNER's identity, not a bare refusal");
  assert.ok(current.answered_at, "answer.elsewhere: …and when");
  assert.equal(current.question_version, 1);
  assert.equal(current.work_id, p.workId);
  assert.equal((await interruptionRow(p.questionId)).answer.amount_cents, 120000,
    "answer.elsewhere: the winner's answer is untouched");
  assert.equal(winner.answered_by, BOB());
});

test("w629.answer.stale a stale VERSION is refused with the current version in hand", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const { err } = await assertPair(CLR.conflict, QREASON.staleQuestion,
    () => answerWorkQuestion(BOB(), { question: p.questionId, version: 7, answer: twoFieldAnswer() }),
    "answer.stale");
  assert.equal(detailOf(err).current.question_version, 1);
  assert.equal((await interruptionRow(p.questionId)).status, "pending",
    "answer.stale: the question stays open for a correctly-versioned answer");
});

test("w629.answer.cancelled a question the estate's own cancel door closed refuses by name", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await cancelAgentTask(BOB(), { task: p.taskId });
  const { err } = await assertPair(CLR.conflict, QREASON.cancelled,
    () => answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() }),
    "answer.cancelled");
  assert.equal(detailOf(err).current.status, "cancelled");
});

test("w629.answer.expired an expired question refuses by name and keeps the draft answerable nowhere", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  // pending -> expired is a transition 0006's own allowlist admits; the runtime's expiry arm is
  // exercised against a genuinely past-due row in work-question-reads.test.mjs.
  await rootQuery("update clara.agent_interruptions set status='expired' where id=$1", [p.questionId]);
  const { err } = await assertPair(CLR.conflict, QREASON.expired,
    () => answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() }),
    "answer.expired");
  assert.equal(detailOf(err).current.status, "expired");
});

test("w629.answer.deadline an answer that waited PAST the deadline loses, even on a pending row", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  // `expires_at` is immutable (0006), so the past-due row is PLANTED at insert time on the same
  // Work — the only way to produce the window without waiting fourteen days.
  await rootQuery("update clara.agent_interruptions set status='cancelled' where id=$1", [p.questionId]);
  const planted = await rootQuery(
    `insert into clara.agent_interruptions
       (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
        basis_digest, fields)
     select $1, $2, $3::jsonb, now() - interval '1 day', w.id, w.client_id, 2, w.basis_digest, $4::jsonb
       from clara.accounting_work w where w.id = $5
     returning id`,
    [p.taskId, `hook-past-${Date.now().toString(36)}`, JSON.stringify(questionPayload()),
      JSON.stringify(twoFields()), p.workId]);
  const id = planted.rows[0].id;
  const { err } = await assertPair(CLR.conflict, QREASON.expired,
    () => answerWorkQuestion(BOB(), { question: id, version: 2, answer: twoFieldAnswer() }),
    "answer.deadline");
  assert.equal(detailOf(err).current.status, "pending",
    "answer.deadline: the row is still PENDING — it is the clock, not the status, that refused");
});

test("w629.answer.state a Work no longer parked on this question's run refuses state_changed", async (t) => {
  if (await gateQuestion(t)) return;
  const admitted = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w629-run") });
  // A pending question against a RUNNING Work: the shape a resumed run leaves behind if a second
  // question were ever planted out of band. The gate must refuse it rather than answer into a
  // Work that is not waiting.
  const planted = await rootQuery(
    `insert into clara.agent_interruptions
       (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
        basis_digest, fields)
     select $1, $2, $3::jsonb, now() + interval '14 days', w.id, w.client_id, 1, w.basis_digest, $4::jsonb
       from clara.accounting_work w where w.id = $5
     returning id`,
    [admitted.task_id, `hook-state-${Date.now().toString(36)}`, JSON.stringify(questionPayload()),
      JSON.stringify(twoFields()), admitted.work_id]);
  await assertPair(CLR.conflict, QREASON.stateChanged,
    () => answerWorkQuestion(BOB(), { question: planted.rows[0].id, version: 1, answer: twoFieldAnswer() }),
    "answer.state");
});

test("w629.answer.basis a question asked about a DIFFERENT basis is refused basis_changed", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await rootQuery("update clara.agent_interruptions set status='cancelled' where id=$1", [p.questionId]);
  // `accounting_work.basis_digest` is IMMUTABLE (0178 freezes it), so the divergence is produced
  // from the QUESTION's side — which is the same comparison the gate makes.
  const planted = await rootQuery(
    `insert into clara.agent_interruptions
       (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
        basis_digest, fields)
     select $1, $2, $3::jsonb, now() + interval '14 days', w.id, w.client_id, 2, $4, $5::jsonb
       from clara.accounting_work w where w.id = $6
     returning id`,
    [p.taskId, `hook-basis-${Date.now().toString(36)}`, JSON.stringify(questionPayload()),
      "f".repeat(64), JSON.stringify(twoFields()), p.workId]);
  await assertPair(CLR.conflict, QREASON.basisChanged,
    () => answerWorkQuestion(BOB(), { question: planted.rows[0].id, version: 2, answer: twoFieldAnswer() }),
    "answer.basis");
});

test("w629.answer.no-oracle another firm's question, an unknown id and a CHAT clarify all answer the same", async (t) => {
  if (await gateQuestion(t)) return;
  const mine = await parkedWork({ client: A1(), author: BOB() });
  // (a) another firm's real question — DAVE owns firm B and must learn nothing about firm A's.
  await assertPair(CLR.notFound, QREASON.questionNotFound,
    () => answerWorkQuestion(DAVE(), { question: mine.questionId, version: 1, answer: twoFieldAnswer() }),
    "answer.no-oracle cross-firm");
  // (b) an id that exists nowhere.
  await assertPair(CLR.notFound, QREASON.questionNotFound,
    () => answerWorkQuestion(BOB(), {
      question: "00000000-0000-4000-8000-0000000629bb", version: 1, answer: twoFieldAnswer(),
    }), "answer.no-oracle unknown");
  // (c) a CHAT clarify of the caller's OWN firm: it carries no Work, so this door does not own it.
  const chat = await rootQuery(
    "select id from clara.agent_interruptions where work_id is null and firm_id = (select firm_id from clara.accounting_work where id=$1) limit 1",
    [mine.workId]);
  if (chat.rowCount === 1) {
    await assertPair(CLR.notFound, QREASON.questionNotFound,
      () => answerWorkQuestion(BOB(), { question: chat.rows[0].id, version: 1, answer: twoFieldAnswer() }),
      "answer.no-oracle chat clarify");
  }
});

test("w629.answer.floor a viewer cannot answer; the refusal is the estate's own CLR04", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await assertRaises(CLR.authz,
    () => answerWorkQuestion(CAROL(), { question: p.questionId, version: 1, answer: twoFieldAnswer() }),
    "answer.floor viewer");
  assert.equal((await interruptionRow(p.questionId)).status, "pending");
});

test("w629.answer.client-inactive an archived client's question can no longer be answered", async (t) => {
  if (await gateQuestion(t)) return;
  const client = await freshWorkClient(ALICE(), "w629inactive");
  const p = await parkedWork({ client, author: BOB() });
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
  await assertPair(CLR.authz, QREASON.clientInactive,
    () => answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() }),
    "answer.client-inactive");
});

test("w629.answer.validation every field kind refuses its own malformed value BY KEY", async (t) => {
  if (await gateQuestion(t)) return;
  const fields = [
    { key: "posting_date", label: "Date", kind: "date", required: true },
    { key: "amount_cents", label: "Amount", kind: "money", required: true },
    { key: "leg", label: "Leg", kind: "choice", required: true,
      options: [{ value: "expense", label: "Expense" }, { value: "asset", label: "Asset" }] },
    { key: "account", label: "Account", kind: "account", required: true },
    { key: "memo", label: "Memo", kind: "text", required: false },
  ];
  const good = {
    posting_date: "2026-09-01", amount_cents: 120000, leg: "expense", account: WCHART.expense,
  };
  const cases = [
    ["a missing required field", { ...good, posting_date: undefined }, "posting_date", "required"],
    ["a blank required field", { ...good, posting_date: "  " }, "posting_date", "required"],
    ["a non-integer amount", { ...good, amount_cents: 1200.5 }, "amount_cents", "integer_cents"],
    ["a string amount", { ...good, amount_cents: "120000" }, "amount_cents", "integer_cents"],
    ["a malformed date", { ...good, posting_date: "01/09/2026" }, "posting_date", "iso_date"],
    ["an impossible date", { ...good, posting_date: "2026-02-30" }, "posting_date", "iso_date"],
    ["an unlisted choice", { ...good, leg: "liability" }, "leg", "option"],
    ["an unknown account", { ...good, account: "9999" }, "account", "active_account"],
    ["a RETIRED account", { ...good, account: WCHART.retired }, "account", "active_account"],
    ["an unasked key", { ...good, colour: "red" }, "colour", "unknown_key"],
    ["an over-long note", { ...good, note: "x".repeat(4001) }, "note", "max_length"],
    ["an over-long text", { ...good, memo: "x".repeat(4001) }, "memo", "max_length"],
  ];
  for (const [label, answer, field, constraint] of cases) {
    const p = await parkedWork({ client: A1(), author: BOB(), fields });
    const payload = { ...answer };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    const { err } = await assertPair(CLR.badRequest, QREASON.invalidAnswer,
      () => answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: payload }),
      `answer.validation ${label}`);
    const d = detailOf(err);
    assert.equal(d.field, field, `answer.validation ${label}: the refusal names the offending field`);
    assert.equal(d.constraint, constraint, `answer.validation ${label}: …and what it violated`);
    assert.equal((await interruptionRow(p.questionId)).status, "pending",
      `answer.validation ${label}: a refused answer leaves the question open`);
  }
});

test("w629.answer.optional an OPTIONAL field may be left out; the accepted answer says so", async (t) => {
  if (await gateQuestion(t)) return;
  const fields = [
    { key: "amount_cents", label: "Amount", kind: "money", required: true },
    { key: "memo", label: "Memo", kind: "text", required: false },
  ];
  const p = await parkedWork({ client: A1(), author: BOB(), fields });
  const out = await answerWorkQuestion(BOB(), {
    question: p.questionId, version: 1, answer: { amount_cents: 4200 },
  });
  assert.equal(out.status, "answered");
  assert.deepEqual((await interruptionRow(p.questionId)).answer, { amount_cents: 4200 },
    "answer.optional: the accepted answer carries exactly what the human supplied");
});

test("w629.answer.op-key a blank op key is refused BEFORE any reservation exists", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  for (const key of ["", "   ", "\t\n"]) {
    await assertPair(CLR.badRequest, QREASON.invalidOpKey,
      () => answerWorkQuestion(BOB(), {
        question: p.questionId, version: 1, answer: twoFieldAnswer(), opKey: key,
      }), `answer.op-key ${JSON.stringify(key)}`);
  }
  const reserved = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='answer_work_question' and op_key in ('','   ',E'\\t\\n')");
  assert.equal(reserved.rows[0].n, 0,
    "answer.op-key: C82.1 — nothing was reserved, not merely nothing accepted");
  assert.equal((await interruptionRow(p.questionId)).status, "pending");
});

test("w629.answer.version-arg a missing or non-positive version is refused before any effect", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  for (const v of [null, 0, -3]) {
    await assertPair(CLR.badRequest, QREASON.invalidQuestionVersion,
      () => answerWorkQuestion(BOB(), { question: p.questionId, version: v, answer: twoFieldAnswer() }),
      `answer.version-arg ${v}`);
  }
  assert.equal((await interruptionRow(p.questionId)).status, "pending");
});

test("w629.answer.one-effect a single-field question answered once leaves the Work parked for DELIVERY", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB(), fields: oneField() });
  await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: { memo: "September rent" } });
  const w = await workRow(p.workId);
  assert.equal(w.status, "awaiting_input",
    "answer.one-effect: accepting an answer does NOT advance the Work — the run must consume it");
  assert.equal((await getWorkPendingQuestion(BOB(), p.workId)), null,
    "answer.one-effect: …and the Work no longer offers a pending question to answer");
  assert.equal((await interruptionsForWork(p.workId)).length, 1,
    "answer.one-effect: exactly one question, exactly one answer");
  assert.equal((await taskRow(p.taskId)).status, "awaiting_input");
  void basis;
});
