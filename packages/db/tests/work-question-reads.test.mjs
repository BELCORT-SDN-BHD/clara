// #629 — THE READ DOORS, THE FIRM INBOX, THE CASCADES, THE EXPIRY ARM, THE IMMUTABILITY BELTS AND
// THE GRANT WALLS. The open verb and the first-answer gate are `work-question.test.mjs`.
//
// Frontier-gated on the `work_questions$` stem.
//
// THE CLAIM THIS FILE EXISTS FOR: "render the same pending and settled record on B3/B4/B6 rather
// than creating surface-specific questions". That is only true if ONE database record answers all
// three, so the cells below assert that `clara.get_work_question`,
// `clara.get_work_pending_question` and the firm inbox's `work_question` row all name the SAME
// question id, version and client — and that the inbox's own 30-key row shape did not move to make
// room for it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateQuestion, buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, settleWorkRun, cancelAgentTask,
  openWorkQuestion, answerWorkQuestion, parkedWork, interruptionRow,
  getWorkQuestion, getWorkPendingQuestion, expireDueInterruptions, listReviewQueue,
  twoFields, twoFieldAnswer, questionPayload, QREASON, CLR, ROLES, roleQuery, namedCall,
  assertPair, assertRaises, detailOf, rootQuery, opk, workRow, freshWorkClient,
} from "./work-question-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-question-reads");
  printSkipCount("work-question-reads");
  await endPool();
});

const A1 = () => world.clients.A1;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const CAROL = () => world.users.carol;
const DAVE = () => world.users.dave;

/** The EXACT key set every `clara.list_review_queue` row carries. Re-stated here rather than
 *  imported because `ninth-rowkind-seeding-proposal.test.mjs` keeps it as a file-local const; the
 *  point of restating it is that #629 must NOT have moved it. */
const FULL_ROW_KEYS = [
  "row_kind", "section", "sort", "client_id", "counterparty_id", "filing_id",
  "entry_id", "question_id", "task_id", "document_id", "lane", "auto",
  "rule_backed", "high_stakes", "aged_since", "amount_cents", "period",
  "question_text", "created_at", "id", "coding_kind", "watch_id", "tier",
  "finding_id", "asset_id", "advance_id", "autodraft",
  "client_name", "batch_ids", "open_proposal_count",
].sort();

// ===========================================================================================
// 1 · The read doors — ONE record, every surface.
// ===========================================================================================

test("w629.read.record get_work_question serves the whole record every surface renders", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({
    client: A1(), author: BOB(),
    question: questionPayload("Which date and how much?", "The message named neither."),
    reason: "The admitted basis names no amount.",
    sourceRef: { kind: "chat_message", id: "msg-629" },
  });
  const rec = await getWorkQuestion(BOB(), p.questionId);

  assert.equal(rec.question_id, p.questionId);
  assert.equal(rec.work_id, p.workId);
  assert.equal(rec.client_id, A1());
  assert.equal(rec.task_id, p.taskId);
  assert.equal(rec.question_version, 1);
  assert.equal(rec.status, "pending");
  assert.equal(rec.question, "Which date and how much?",
    "read.record: the question text is parsed from the runtime's own jsonb shape, once");
  assert.equal(rec.context, "The message named neither.");
  assert.equal(rec.reason, "The admitted basis names no amount.");
  assert.deepEqual(rec.fields, twoFields());
  assert.deepEqual(rec.source_ref, { kind: "chat_message", id: "msg-629" });
  assert.equal(rec.delivery_state, "pending");
  assert.equal(rec.delivery_attempts, 0);
  assert.equal(rec.answer, null);
  assert.equal(rec.answered_by, null);
  assert.equal(rec.work_status, "awaiting_input",
    "read.record: the Work's own status rides along, so a card never has to make a second read");
  assert.equal(rec.basis_digest, rec.work_basis_digest,
    "read.record: a pending question's basis matches its Work — the comparison the answer gate makes");
  assert.ok(rec.expires_at && rec.created_at);
});

test("w629.read.settled the SAME record carries the accepted answer once it is answered", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() });
  const rec = await getWorkQuestion(ALICE(), p.questionId);

  assert.equal(rec.status, "answered");
  assert.equal(rec.answered_by, BOB());
  assert.equal(rec.answered_role, "bookkeeper");
  assert.ok(rec.answered_at);
  assert.equal(rec.answer.amount_cents, 120000,
    "read.settled: the settled record shows the EXACT accepted minor unit");
  assert.equal(await getWorkPendingQuestion(ALICE(), p.workId), null,
    "read.settled: …and the Work offers no pending question any more");
});

test("w629.read.pending get_work_pending_question addresses the Work, not the question", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const byWork = await getWorkPendingQuestion(BOB(), p.workId);
  const byId = await getWorkQuestion(BOB(), p.questionId);
  assert.deepEqual(byWork, byId,
    "read.pending: B3 (which knows the Work) and B4/B6 (which know the question) read the SAME record");
});

test("w629.read.no-oracle another firm, an unknown id and a chat clarify all answer NULL", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  assert.equal(await getWorkQuestion(DAVE(), p.questionId), null,
    "read.no-oracle: another firm's owner learns nothing");
  assert.equal(await getWorkPendingQuestion(DAVE(), p.workId), null);
  assert.equal(await getWorkQuestion(BOB(), "00000000-0000-4000-8000-0000000629cc"), null);
  const chat = await rootQuery("select id from clara.agent_interruptions where work_id is null limit 1");
  if (chat.rowCount === 1) {
    assert.equal(await getWorkQuestion(BOB(), chat.rows[0].id), null,
      "read.no-oracle: a CHAT clarify is not a work question and this door does not serve it");
  }
});

test("w629.read.floor a viewer cannot read a work question", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await assertRaises(CLR.authz, () => getWorkQuestion(CAROL(), p.questionId), "read.floor get");
  await assertRaises(CLR.authz, () => getWorkPendingQuestion(CAROL(), p.workId), "read.floor pending");
});

// ===========================================================================================
// 2 · The firm inbox — the SAME question, offered where a person looks for work.
// ===========================================================================================

test("w629.inbox.row list_review_queue offers the pending work question in needs_you", async (t) => {
  if (await gateQuestion(t)) return;
  const client = await freshWorkClient(ALICE(), "w629inbox");
  const p = await parkedWork({
    client, author: BOB(), question: questionPayload("How much was the rent?"),
  });
  const env = await listReviewQueue(BOB(), { scope: { client_id: client } });
  const rows = env.rows.filter((r) => r.row_kind === "work_question");

  assert.equal(rows.length, 1, "inbox.row: exactly one row for one pending question");
  const row = rows[0];
  assert.equal(row.id, p.questionId, "inbox.row: the row IS the question");
  assert.equal(row.question_id, p.questionId);
  assert.equal(row.task_id, p.taskId);
  assert.equal(row.client_id, client);
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you", "inbox.row: a person must act before the Work can move");
  assert.equal(row.question_text, "How much was the rent?");
  assert.ok(row.aged_since, "inbox.row: waiting-since is the question's own created_at");
  assert.equal(env.counts.work_questions, 1, "inbox.row: the counts envelope names them");
  assert.ok(env.counts.needs_you >= 1,
    "inbox.row: …and the existing needs_you count already includes them, as it does open questions");

  // THE ROW SHAPE DID NOT MOVE. Every row in this read — the work_question one included — still
  // carries the exact 30-key shape the ninth row kind pinned.
  for (const r of env.rows) {
    assert.deepEqual([...Object.keys(r)].sort(), FULL_ROW_KEYS,
      `inbox.row: row_kind='${r.row_kind}' carries a DIFFERENT key set than the pinned 30-key shape`);
  }
});

test("w629.inbox.settles the row leaves the inbox the moment the question is answered", async (t) => {
  if (await gateQuestion(t)) return;
  const client = await freshWorkClient(ALICE(), "w629settles");
  const p = await parkedWork({ client, author: BOB() });
  assert.equal((await listReviewQueue(BOB(), { scope: { client_id: client } }))
    .rows.filter((r) => r.row_kind === "work_question").length, 1);
  await answerWorkQuestion(BOB(), { question: p.questionId, version: 1, answer: twoFieldAnswer() });
  const after = await listReviewQueue(BOB(), { scope: { client_id: client } });
  assert.equal(after.rows.filter((r) => r.row_kind === "work_question").length, 0,
    "inbox.settles: an answered question is not an action surface");
  assert.equal(after.counts.work_questions, 0);
});

test("w629.inbox.archived an archived client's question is not chased in the inbox", async (t) => {
  if (await gateQuestion(t)) return;
  const client = await freshWorkClient(ALICE(), "w629arch");
  await parkedWork({ client, author: BOB() });
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
  const env = await listReviewQueue(BOB(), { scope: {} });
  assert.equal(env.rows.filter((r) => r.row_kind === "work_question" && r.client_id === client).length, 0,
    "inbox.archived: the active-client guard eight other kinds carry binds this one too");
});

test("w629.inbox.cross-firm another firm's inbox never shows this firm's work question", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const env = await listReviewQueue(DAVE(), { scope: {} });
  assert.equal(env.rows.filter((r) => r.id === p.questionId).length, 0);
});

// ===========================================================================================
// 3 · The cascades a settled or cancelled run owes its question.
// ===========================================================================================

test("w629.cascade.settle a terminal settle closes the pending question (0178's own cascade)", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await settleWorkRun({ task: p.taskId, outcome: "expired", error: { code: "x", reason: "x", message: "x" } });
  assert.equal((await interruptionRow(p.questionId)).status, "cancelled");
  assert.equal(await getWorkPendingQuestion(BOB(), p.workId), null,
    "cascade.settle: a settled Work leaves no unanswerable question on any surface");
  assert.equal((await workRow(p.workId)).status, "expired");
});

test("w629.cascade.cancel the estate's own human cancel door closes it too", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  await cancelAgentTask(BOB(), { task: p.taskId });
  assert.equal((await interruptionRow(p.questionId)).status, "cancelled");
});

// ===========================================================================================
// 4 · Expiry — the deadline that had no enforcer.
// ===========================================================================================

test("w629.expire.due a past-due work question is expired, audited, and refused thereafter", async (t) => {
  if (await gateQuestion(t)) return;
  const admitted = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w629-run") });
  // `expires_at` is immutable (0006), so a past-due row is PLANTED at insert time — the only way
  // to produce a fourteen-day-old question without waiting fourteen days.
  const planted = await rootQuery(
    `insert into clara.agent_interruptions
       (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
        basis_digest, fields)
     select $1, $2, $3::jsonb, now() - interval '1 hour', w.id, w.client_id, 1, w.basis_digest, $4::jsonb
       from clara.accounting_work w where w.id = $5
     returning id`,
    [admitted.task_id, `hook-due-${Date.now().toString(36)}`, JSON.stringify(questionPayload()),
      JSON.stringify(twoFields()), admitted.work_id]);
  const id = planted.rows[0].id;

  const out = await expireDueInterruptions({ limit: 50 });
  assert.ok(out.expired >= 1, "expire.due: at least the planted row moved");
  assert.ok(out.question_ids.includes(id), "expire.due: …and it names which");
  assert.equal((await interruptionRow(id)).status, "expired");

  const audit = await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='expire_due_interruptions' and args->>'question'=$1",
    [id]);
  assert.equal(audit.rows[0].n, 1, "expire.due: exactly one audit row names this question");

  await assertPair(CLR.conflict, QREASON.expired,
    () => answerWorkQuestion(BOB(), { question: id, version: 1, answer: twoFieldAnswer() }),
    "expire.due answer");
});

test("w629.expire.not-due a question inside its deadline is untouched, and so is a chat clarify", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  const chatBefore = await rootQuery(
    "select count(*)::int as n from clara.agent_interruptions where work_id is null and status='pending'");
  await expireDueInterruptions({ limit: 50 });
  assert.equal((await interruptionRow(p.questionId)).status, "pending",
    "expire.not-due: a live question is not swept");
  const chatAfter = await rootQuery(
    "select count(*)::int as n from clara.agent_interruptions where work_id is null and status='pending'");
  assert.equal(chatAfter.rows[0].n, chatBefore.rows[0].n,
    "expire.not-due: the arm is scoped to WORK questions — the chat lane's identical gap is a "
    + "separate finding, not a side effect of this one");
});

// ===========================================================================================
// 5 · The immutability belts on the columns #629 adds.
// ===========================================================================================

test("w629.immutable.identity the Work identity, the fields and the reason are frozen after the open", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB(), reason: "no amount" });
  const cases = [
    ["work_id", "update clara.agent_interruptions set work_id=null where id=$1"],
    ["client_id", "update clara.agent_interruptions set client_id=null where id=$1"],
    ["question_version", "update clara.agent_interruptions set question_version=9 where id=$1"],
    ["basis_digest", `update clara.agent_interruptions set basis_digest='${"e".repeat(64)}' where id=$1`],
    ["fields", "update clara.agent_interruptions set fields='[]'::jsonb where id=$1"],
    ["reason", "update clara.agent_interruptions set reason='something else' where id=$1"],
    ["source_ref", `update clara.agent_interruptions set source_ref='{"a":1}'::jsonb where id=$1`],
  ];
  for (const [column, sql] of cases) {
    const { err } = await assertPair(CLR.immutable, QREASON.workQuestionImmutable,
      () => rootQuery(sql, [p.questionId]), `immutable.identity ${column}`);
    assert.equal(detailOf(err).column, column,
      `immutable.identity ${column}: the refusal names the column it protected`);
  }
});

test("w629.immutable.delivery delivery is a RATCHET: delivered is terminal and attempts only rise", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });
  // The lawful walk the runtime makes.
  await rootQuery(
    "update clara.agent_interruptions set delivery_state='leased', delivery_attempts=delivery_attempts+1 where id=$1",
    [p.questionId]);
  await rootQuery(
    "update clara.agent_interruptions set delivery_state='hook_missing' where id=$1", [p.questionId]);
  await rootQuery(
    "update clara.agent_interruptions set delivery_state='leased', delivery_attempts=delivery_attempts+1 where id=$1",
    [p.questionId]);
  await rootQuery(
    "update clara.agent_interruptions set delivery_state='delivered', delivered_at=now() where id=$1",
    [p.questionId]);
  const row = await interruptionRow(p.questionId);
  assert.equal(row.delivery_state, "delivered");
  assert.equal(row.delivery_attempts, 2);

  await assertPair(CLR.immutable, QREASON.workQuestionImmutable,
    () => rootQuery("update clara.agent_interruptions set delivery_state='pending' where id=$1", [p.questionId]),
    "immutable.delivery un-deliver");
  await assertPair(CLR.immutable, QREASON.workQuestionImmutable,
    () => rootQuery("update clara.agent_interruptions set delivery_attempts=0 where id=$1", [p.questionId]),
    "immutable.delivery attempts");
});

test("w629.immutable.chat the new belt leaves a CHAT clarify's own lifecycle alone", async (t) => {
  if (await gateQuestion(t)) return;
  const chat = await rootQuery(
    "select id, status from clara.agent_interruptions where work_id is null and status='pending' limit 1");
  if (chat.rowCount === 0) {
    assert.ok(true, "immutable.chat: no pending chat clarify exists in this database to probe with");
    return;
  }
  await rootQuery(
    "update clara.agent_interruptions set claimed_by='rig', claim_lease_until=now()+interval '60 seconds' where id=$1",
    [chat.rows[0].id]);
  assert.ok(true, "immutable.chat: a chat clarify still leases exactly as it did before 0180");
});

// ===========================================================================================
// 6 · The grant walls. The lane that opens a question cannot answer it, and vice versa.
// ===========================================================================================

test("w629.grants.lanes each door is reachable by exactly one role", async (t) => {
  if (await gateQuestion(t)) return;
  const p = await parkedWork({ client: A1(), author: BOB() });

  // The HUMAN role cannot open a question (that is the run's act, not a person's).
  await assertRaises("42501", () => roleQuery(ROLES.authenticated, namedCall("open_work_question", [
    { name: "p_task", cast: "uuid" }, { name: "p_hook_token", cast: "text" },
    { name: "p_question", cast: "jsonb" }, { name: "p_fields", cast: "jsonb" },
    { name: "p_reason", cast: "text" }, { name: "p_source_ref", cast: "jsonb" },
  ]), [p.taskId, "x", "{}", JSON.stringify(twoFields()), null, null]), "grants.lanes human open");

  // The RUNTIME role cannot answer one, or read one through the human doors.
  await assertRaises("42501", () => roleQuery(ROLES.runtime, namedCall("answer_work_question", [
    { name: "p_question", cast: "uuid" }, { name: "p_question_version", cast: "int" },
    { name: "p_answer", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
  ]), [p.questionId, 1, "{}", "k"]), "grants.lanes runtime answer");
  await assertRaises("42501",
    () => roleQuery(ROLES.runtime, "select clara.get_work_question($1::uuid)", [p.questionId]),
    "grants.lanes runtime read");

  // The HUMAN role cannot run the expiry sweep.
  await assertRaises("42501",
    () => roleQuery(ROLES.authenticated, "select clara.expire_due_interruptions(1, null)"),
    "grants.lanes human expire");

  // The AGENT read-only role holds NOTHING here.
  for (const call of [
    "select clara.get_work_question($1::uuid)",
    "select clara.get_work_pending_question($1::uuid)",
  ]) {
    await assertRaises("42501", () => roleQuery(ROLES.agentRo, call, [p.questionId]),
      `grants.lanes agent_ro ${call}`);
  }
});
