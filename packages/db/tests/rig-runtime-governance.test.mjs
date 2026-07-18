// Slice-4 rig — DURABLE RUNTIME part 3: GOVERNANCE FNS (§6 item 3; contract
// §3.2 cancel_agent_task, §3.3 answer_interruption, §3.5 share_chat_session,
// rulings §0.5/§0.10). Contract-blind: derived from the contract v2.1, never
// from 0006.
//
// The law under test: all three are human-lane, `_reserve_op`-idempotent
// (op_key replay returns the ORIGINAL receipt); non-member / viewer-role /
// wrong-firm / expired / double all RAISE cleanly; share by a non-author fails;
// every call writes audit_log whose args (and the receipt) carry NO prose from
// question/answer/message content; cancel cascades atomically (pending
// interruptions → cancelled AND a held wake task's outbox row → cancelled).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  CLR13,
  PG,
  assertRaises,
  assertRaisesOneOf,
  opk,
  humanQuery,
  rootQuery,
  ensureReady,
  runtimeReady,
  endPool,
  buildWorld,
  readRow,
  printLaneNotes,
  noteLane,
  createChatSession,
  beginChatTurn,
  taskIdOf,
  settleChatTurn,
  finishTask,
  driveTaskStatus,
  makeConsumableIntent,
  consumeIntent,
  insertWakeTask,
  insertInterruption,
  insertOutbox,
  openInterruption,
  interruptionColumns,
  answerInterruption,
  cancelAgentTask,
  shareChatSession,
  auditRows,
} from "./rig-runtime-fixtures.mjs";
import { crossTaskTokenRace } from "./rig-runtime-race.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("governance");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-4 runtime core not present — 0006 not yet applied");
    return true;
  }
  return false;
}

/** A running firm-A chat task on a fresh private session (alice-authored). */
async function runningTask(marker = "rig turn") {
  const { users, firms } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task = taskIdOf(
    await beginChatTurn({ session, author: users.alice, turnKey: opk("gov"), parts: [{ type: "text", text: marker }] }),
  );
  await driveTaskStatus(task, ["running"]);
  return { session, task };
}

// ===========================================================================
// answer_interruption (§3.3, ruling 5).
// ===========================================================================

test("§3.3 answer_interruption: any write-capable member answers; answered_by recorded; op_key replay returns the ORIGINAL receipt; double answer raises", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const QM = `RIGQ_${randomUUID().slice(0, 8)}`;
  const AM = `RIGA_${randomUUID().slice(0, 8)}`;
  const { task } = await runningTask();
  const interruption = await insertInterruption({ task, firm: firms.A, question: `${QM} which client?`, askedOf: users.alice });

  // Bob (bookkeeper, NOT the session author) answers — ruling 5: any
  // write-capable member.
  const key = opk("ans");
  const receipt = await answerInterruption(users.bob, { id: interruption, answer: `${AM} client Alpha`, opKey: key });
  const row = await readRow("agent_interruptions", interruption);
  assert.equal(row.status, "answered", "pending→answered");
  assert.equal(row.answered_by, users.bob, "answered_by records the ANSWERING member");
  assert.ok(JSON.stringify(row).includes(AM), "the answer content is stored on the interruption row");

  // Replay with the SAME op_key → the original receipt, no second effect.
  const auditBefore = (await auditRows(firms.A, "answer_interruption")).length;
  const replay = await answerInterruption(users.bob, { id: interruption, answer: `${AM} client Alpha`, opKey: key });
  assert.deepEqual(replay, receipt, "op_key replay returns the ORIGINAL receipt byte-identically");
  const auditAfter = (await auditRows(firms.A, "answer_interruption")).length;
  assert.equal(auditAfter, auditBefore, "a replay writes NO second audit row");

  // A SECOND answer (fresh op_key) hits a non-pending row → CLR13 state conflict.
  await assertRaises(CLR13, () => answerInterruption(users.alice, { id: interruption, answer: "too late", opKey: opk() }), "double answer");

  // §0.5 hygiene: neither the audit args nor the receipt carry the question/answer prose.
  for (const a of await auditRows(firms.A, "answer_interruption")) {
    const s = JSON.stringify(a.args ?? {});
    assert.ok(!s.includes(QM), `audit args leak the QUESTION prose: ${s}`);
    assert.ok(!s.includes(AM), `audit args leak the ANSWER prose: ${s}`);
  }
  const rs = JSON.stringify(receipt ?? {});
  assert.ok(!rs.includes(QM) && !rs.includes(AM), `the receipt leaks clarify prose: ${rs}`);

  // Cap hygiene: free the running task's compute slot for the later tests.
  await settleChatTurn({ task, tokens: 1, outcome: "completed" });
});

test("§3.3 answer authz + expiry: viewer-role, cross-firm, and past-deadline answers all RAISE cleanly (CLR13-class, no oracle)", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const { task } = await runningTask();

  // Viewer (carol): below the write floor.
  const i1 = await insertInterruption({ task, firm: firms.A });
  await assertRaisesOneOf([CLR.authz, CLR13], () => answerInterruption(users.carol, { id: i1, answer: "viewer try", opKey: opk() }), "viewer answers");

  // Cross-firm (dave): must read as not-found-in-your-firm — no existence oracle.
  await assertRaisesOneOf([CLR.notFound, CLR.authz, CLR13], () => answerInterruption(users.dave, { id: i1, answer: "wrong firm", opKey: opk() }), "cross-firm answer");

  // Expired (single-session path; the cross-deadline race lives in part 1).
  const i2 = await insertInterruption({ task, firm: firms.A, expiresAt: new Date(Date.now() - 2000).toISOString() });
  await assertRaises(CLR13, () => answerInterruption(users.bob, { id: i2, answer: "past deadline", opKey: opk() }), "answer past expires_at");

  // Cap hygiene: free the running task's compute slot for the later tests.
  await settleChatTurn({ task, tokens: 1, outcome: "completed" });
});

// ===========================================================================
// cancel_agent_task (§3.2, ruling 10).
// ===========================================================================

test("§3.2 cancel (engine-active): a running task → cancel_requested; pending interruptions → cancelled ATOMICALLY; replay returns the original receipt", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const { task } = await runningTask();
  const interruption = await insertInterruption({ task, firm: firms.A });

  const key = opk("cx");
  const receipt = await cancelAgentTask(users.bob, { task, opKey: key });
  const trow = await readRow("agent_tasks", task);
  assert.equal(trow.status, "cancel_requested", "an engine-active (running) task moves to cancel_requested (S4-D6: non-terminal, engine-abort pending)");
  const irow = await readRow("agent_interruptions", interruption);
  assert.equal(irow.status, "cancelled", "the pending interruption was cancelled in the SAME call");

  const replay = await cancelAgentTask(users.bob, { task, opKey: key });
  assert.deepEqual(replay, receipt, "cancel op_key replay returns the ORIGINAL receipt");

  // Ruling 10 says cancel is IDEMPOTENT; a fresh-key cancel of an already
  // cancel-requested task must therefore not corrupt state — record its shape.
  try {
    await cancelAgentTask(users.alice, { task, opKey: opk() });
    noteLane("cancel_agent_task: a fresh-key second cancel of a cancel_requested task SUCCEEDED (idempotent no-op reading of ruling 10)");
  } catch (e) {
    assert.equal(e.code, CLR13, `a refused second cancel must be CLR13 (got ${e.code}: ${e.message})`);
    noteLane("cancel_agent_task: a fresh-key second cancel RAISES CLR13 (state-conflict reading of ruling 10)");
  }
  assert.ok(["cancel_requested", "cancelled"].includes((await readRow("agent_tasks", task)).status), "the task stayed in a cancel state");

  // Audit hygiene: id-shaped args only.
  const audits = await auditRows(firms.A, "cancel_agent_task");
  assert.ok(audits.length >= 1, "cancel_agent_task wrote audit_log");

  // Cap hygiene: cancel_requested is a COMPUTE state (it holds a slot until the
  // engine settles) — play the engine's abort-then-settle move to free it.
  if ((await readRow("agent_tasks", task)).status === "cancel_requested") {
    await driveTaskStatus(task, ["cancelled"]);
  }
});

test("§3.2 cancel (held wake task): terminal settle + the outbox row → cancelled atomically; the consumed intent stays consumed", async (t) => {
  if (unready(t)) return;
  const { users } = world;
  const { intentId, firm } = await makeConsumableIntent({ sub: world.users.alice, client: world.clients.A1 });
  await consumeIntent(intentId);
  const task = await insertWakeTask({ intent: intentId, firm });
  const { id: outboxId } = await insertOutbox({ intent: intentId, firm });

  await cancelAgentTask(users.bob, { task, opKey: opk("cw") });
  assert.equal((await readRow("agent_tasks", task)).status, "cancelled", "a held wake task settles terminally to cancelled (no engine abort needed)");
  assert.equal((await readRow("wakes_outbox", outboxId)).status, "cancelled", "the held outbox row was cancelled in the SAME call (§0.10 cascade)");
  assert.equal((await readRow("wake_intents", intentId)).status, "consumed", "the consumed intent is untouched by the cancel");
});

test("§3.2 cancel authz: viewer-role and cross-firm cancels RAISE cleanly; a queued task's cancel branch is recorded", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const queued = taskIdOf(await beginChatTurn({ session, author: users.alice, turnKey: opk("q") }));

  await assertRaisesOneOf([CLR.authz, CLR13], () => cancelAgentTask(users.carol, { task: queued, opKey: opk() }), "viewer cancels");
  await assertRaisesOneOf([CLR.notFound, CLR.authz, CLR13], () => cancelAgentTask(users.dave, { task: queued, opKey: opk() }), "cross-firm cancel");

  // §3.2 branch probe: a QUEUED task is admitted-but-not-necessarily-engine-active;
  // the contract allows either terminal settle or cancel_requested — record which.
  await cancelAgentTask(users.bob, { task: queued, opKey: opk() });
  const st = (await readRow("agent_tasks", queued)).status;
  assert.ok(["cancelled", "cancel_requested"].includes(st), `a cancelled queued task lands in a cancel state (got ${st})`);
  noteLane(`cancel_agent_task on a QUEUED chat task → '${st}' (branch record for the as-built review)`);
  if (st === "cancel_requested") await driveTaskStatus(queued, ["cancelled"]); // cap hygiene
});

// ===========================================================================
// share_chat_session (§3.5, ruling 9).
// ===========================================================================

test("§3.5 share_chat_session: the AUTHOR shares → visibility=firm + member-readable; replay returns the original receipt; non-author/cross-firm fail; no prose in audit", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const MM = `RIGM_${randomUUID().slice(0, 8)}`;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task = taskIdOf(
    await beginChatTurn({ session, author: users.alice, turnKey: opk("sh"), parts: [{ type: "text", text: `${MM} sensitive draft context` }] }),
  );
  await finishTask(task); // S4-AB11-legal settle path (queued→running→completed)

  // Invisible to bob pre-share.
  assert.equal((await humanQuery(users.bob, "select id from clara.chat_sessions where id = $1", [session])).rowCount, 0, "pre-share: invisible to a non-author");

  const key = opk("share");
  const receipt = await shareChatSession(users.alice, { session, opKey: key });
  const srow = await readRow("chat_sessions", session);
  assert.equal(srow.visibility, "firm", "share flips visibility to 'firm' (author-stamped share)");
  assert.equal((await humanQuery(users.bob, "select id from clara.chat_sessions where id = $1", [session])).rowCount, 1, "post-share: member-readable");
  assert.ok((await humanQuery(users.bob, "select id from clara.chat_messages where session_id = $1", [session])).rowCount >= 1, "post-share: messages readable too");

  const replay = await shareChatSession(users.alice, { session, opKey: key });
  assert.deepEqual(replay, receipt, "share op_key replay returns the ORIGINAL receipt");

  // A NON-AUTHOR (even write-capable) cannot share someone else's private session.
  const other = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  await assertRaisesOneOf([CLR.authz, CLR.notFound, CLR13], () => shareChatSession(users.bob, { session: other, opKey: opk() }), "share by a non-author");
  assert.equal((await readRow("chat_sessions", other)).visibility, "private", "the non-author share left visibility private");

  // Cross-firm: not-found-shaped, no oracle.
  await assertRaisesOneOf([CLR.notFound, CLR.authz, CLR13], () => shareChatSession(users.dave, { session: other, opKey: opk() }), "cross-firm share");

  // §0.5/§0.9 hygiene: audit args + receipt carry no MESSAGE prose.
  for (const a of await auditRows(firms.A, "share_chat_session")) {
    assert.ok(!JSON.stringify(a.args ?? {}).includes(MM), "share audit args leak message prose");
  }
  assert.ok(!JSON.stringify(receipt ?? {}).includes(MM), "the share receipt leaks message prose");
});

// ===========================================================================
// Round-2 S4-AB4 — open_interruption: the runtime's atomic clarify opener.
// ===========================================================================

test("S4-AB4 open_interruption: atomic park+insert; idempotent by hook_token; CLR13 non-running + linearized; token unique/not-null; firm from task; runtime-only", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const { taskCol } = await interruptionColumns();
  const rowsFor = async (task) =>
    (await rootQuery(`select count(*)::int as n from clara.agent_interruptions where ${taskCol} = $1`, [task])).rows[0].n;

  // Atomic open: running→awaiting_input + a pending insert in ONE call.
  const { task } = await runningTask();
  const token = `hook-${randomUUID()}`;
  const id1 = await openInterruption({ task, hookToken: token, askedOf: users.alice });
  assert.ok(id1, "open_interruption returned the interruption id");
  assert.equal((await readRow("agent_tasks", task)).status, "awaiting_input", "the task PARKED in the same call (atomic)");
  const irow = await readRow("agent_interruptions", id1);
  assert.equal(irow.status, "pending", "the clarify landed pending");
  assert.equal(irow.firm_id, firms.A, "the clarify firm is DERIVED from the task");
  assert.equal(irow.hook_token, token, "the hook token is recorded");

  // Idempotent replay: same token → same id, no dup row, no state change.
  const id2 = await openInterruption({ task, hookToken: token });
  assert.equal(id2, id1, "same hook_token → the SAME interruption id");
  assert.equal(await rowsFor(task), 1, "no duplicate interruption row on replay");
  assert.equal((await readRow("agent_tasks", task)).status, "awaiting_input", "no state change on replay");

  // Linearized: with the clarify still pending (task resumed to running), a
  // SECOND open with a fresh token refuses CLR13. On an (illegal) success the
  // failure message carries the landed state for classification.
  await driveTaskStatus(task, ["running"]);
  let second = null;
  try {
    second = await openInterruption({ task, hookToken: `hook-${randomUUID()}` });
  } catch (e) {
    assert.equal(e.code, CLR13, `the linearize refusal is CLR13 (got ${e.code}: ${e.message})`);
  }
  if (second != null) {
    const n = await rowsFor(task);
    const st = (await readRow("agent_tasks", task)).status;
    assert.fail(`a SECOND open while one is pending SUCCEEDED (id ${second}; task now '${st}' with ${n} interruption rows) — §3.3 linearization not enforced`);
  }

  // Non-running task → CLR13 with NO insert.
  const s2 = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const queued = taskIdOf(await beginChatTurn({ session: s2, author: users.alice, turnKey: opk("oi") }));
  await assertRaises(CLR13, () => openInterruption({ task: queued, hookToken: `hook-${randomUUID()}` }), "open on a non-running (queued) task");
  assert.equal(await rowsFor(queued), 0, "the refused open inserted NOTHING");

  // hook_token is UNIQUE (cross-task reuse refused) and NOT NULL.
  await driveTaskStatus(queued, ["running"]);
  await assertRaisesOneOf([PG.uniqueViolation, CLR13, CLR.badRequest], () => openInterruption({ task: queued, hookToken: token }), "hook_token reuse across tasks (unique)");
  await assertRaisesOneOf(["23502", CLR.badRequest, CLR13], () => openInterruption({ task: queued, hookToken: null }), "a NULL hook_token");

  // Runtime-only EXECUTE (the matrix asserts it too; this is the live denial).
  await assertRaises(
    PG.insufficientPrivilege,
    () => humanQuery(users.alice, "select clara.open_interruption(p_task => $1, p_hook_token => $2, p_question => '{}'::jsonb)", [queued, "human-token"]),
    "human EXECUTE open_interruption",
  );

  // AB4-L4: once the pending clarify CLEARS (answered), a fresh token opens
  // again — the linearize guard blocks concurrency, never the next clarify.
  await answerInterruption(users.bob, { id: id1, answer: "cleared for L4", opKey: opk() });
  const id3 = await openInterruption({ task, hookToken: `hook-${randomUUID()}` });
  assert.ok(id3 && id3 !== id1, "a pending-cleared task accepts a FRESH token (AB4-L4: no over-blocking)");
  assert.equal((await readRow("agent_tasks", task)).status, "awaiting_input", "the new open parked the task again");

  // Cap hygiene: finish both legally (settle also closes the pending clarify — S4-D6).
  await finishTask(task);
  await finishTask(queued);
});

// ===========================================================================
// FX4 — the CONCURRENT cross-task hook-token race (two-session forced
// schedule). The loser must refuse CLR13 with its transition rolled back —
// never cross-bind to the winner's interruption (the pre-fix stranding bug).
// ===========================================================================

test("FX4 cross-task token race: both running, same token; loser PROVEN blocked then CLR13; task B stays running with ZERO interruptions; A's clarify intact", async (t) => {
  if (unready(t)) return;
  const { taskCol } = await interruptionColumns();
  const countFor = async (task) =>
    (await rootQuery(`select count(*)::int as n from clara.agent_interruptions where ${taskCol} = $1`, [task])).rows[0].n;

  const { task: taskA } = await runningTask("fx4-A");
  const { task: taskB } = await runningTask("fx4-B");
  const token = `hook-${randomUUID()}`;

  const out = await crossTaskTokenRace({ taskA, taskB, token });
  assert.ok(out.first?.ok, `the first open landed for task A (got ${JSON.stringify(out.first)})`);
  assert.equal(out.provedBlocked, true, "X7: the second open was PROVEN blocked on the hook_token unique index before the winner committed");
  assert.ok(out.second && out.second.ok === false, `the loser was REFUSED (got ${JSON.stringify(out.second)}) — an ok:true with the winner's id is the FX4 cross-bind bug`);
  assert.equal(out.second.code, CLR13, `the loser refuses with CLR13 (got ${out.second.code}: ${out.second.message})`);

  // The loser's WHOLE txn rolled back: task B not stranded, zero interruptions.
  assert.equal((await readRow("agent_tasks", taskB)).status, "running", "task B remains RUNNING (its awaiting_input transition rolled back with the refusal)");
  assert.equal(await countFor(taskB), 0, "task B carries ZERO interruptions");

  // The winner's clarify is intact and correctly bound.
  assert.equal((await readRow("agent_tasks", taskA)).status, "awaiting_input", "task A stays parked on its clarify");
  const aRow = await readRow("agent_interruptions", out.first.id);
  assert.ok(aRow, "task A's interruption row exists");
  assert.equal(aRow[taskCol], taskA, "the winner's interruption is bound to task A");
  assert.equal(aRow.status, "pending", "the winner's clarify is still pending");
  assert.equal(aRow.hook_token, token, "the winner's clarify holds the raced token");

  await finishTask(taskA); // cap hygiene (settle closes A's pending clarify — S4-D6)
  await finishTask(taskB);
});

// ===========================================================================
// S4-D6 — every terminal settlement closes pending interruptions.
// ===========================================================================

test("S4-D6 terminal_settle_closes_pending_interruptions: settle_chat_turn to a terminal outcome closes the task's pending clarifies atomically", async (t) => {
  if (unready(t)) return;
  const { firms } = world;
  const { task } = await runningTask();
  const interruption = await insertInterruption({ task, firm: firms.A });

  await settleChatTurn({ task, tokens: 4, outcome: "completed" });
  assert.equal((await readRow("agent_tasks", task)).status, "completed", "the task settled terminally");
  const st = (await readRow("agent_interruptions", interruption)).status;
  assert.notEqual(st, "pending", "NO pending interruption survives a terminal settlement (S4-D6)");
  assert.ok(["cancelled", "expired"].includes(st), `the closed clarify carries a terminal status (got ${st})`);
  noteLane(`terminal settle closes pending interruptions with status '${st}' (record for the as-built review)`);
});
