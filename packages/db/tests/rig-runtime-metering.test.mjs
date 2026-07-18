// Slice-4 rig — DURABLE RUNTIME part 4: METERING (§6 item 4; contract §3.6 +
// §0.4 ruling). Contract-blind: derived from the contract v2.1, never from 0006.
//
// The law under test: atomic admission under the namespaced advisory lock — at
// cap−1 (and at the last budget slot) a second concurrent admission BLOCKS
// (PROVEN via pg_blocking_pids — the X7 law) until the first commits, then is
// REFUSED with CLR14 carrying which-limit; held + awaiting_input are
// zero-compute and consume NO slot; same-turn_key replay returns the original
// task; one-live-turn raises CLR13; settle replay is a stored-outcome no-op
// (usage counted exactly once via task_usage).
//
// Every test seeds its OWN fresh firm so per-firm cap/budget counting is
// isolated from the other suites running concurrently on the shared test DB.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  CLR13,
  CLR14,
  PG,
  ROLES,
  DEFAULT_RUN_CAP,
  assertRaises,
  assertRaisesOneOf,
  opk,
  rootQuery,
  roleQuery,
  ensureReady,
  runtimeReady,
  endPool,
  seedFreshFirm,
  readRow,
  readRowsWhere,
  printLaneNotes,
  noteLane,
  createChatSession,
  beginChatTurn,
  taskIdOf,
  settleChatTurn,
  finishTask,
  checkpointTurn,
  columnMap,
  firstPresent,
  assertIdent,
  driveTaskStatus,
  makeConsumableIntent,
  consumeIntent,
  insertWakeTask,
  usageSnapshot,
  usageCounterColumn,
  setDailyUsage,
  taskUsageRows,
  DEFAULT_DAILY_TOKENS,
} from "./rig-runtime-fixtures.mjs";
import { admissionRace } from "./rig-runtime-race.mjs";

let ready = false;

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
});
after(async () => {
  printLaneNotes("metering");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-4 runtime core not present — 0006 not yet applied");
    return true;
  }
  return false;
}

const P = () => `s4mt_${Date.now().toString(36)}_${randomUUID().slice(0, 4)}`;

/** As-landed observation: begin/settle replay receipts carry a transport flag
 *  `replayed: true` alongside the ORIGINAL task/outcome. The contract's law is
 *  "replay → the original task / stored outcome"; the flag is contract-silent,
 *  so identity is compared with the flag stripped (recorded as a lane note). */
function stripReplayFlag(receipt) {
  if (receipt == null || typeof receipt !== "object") return receipt;
  const rest = { ...receipt };
  if ("replayed" in rest) {
    noteLane(`replay receipt carried replayed=${rest.replayed} (contract-silent transport flag)`);
    delete rest.replayed;
  }
  return rest;
}

async function firmWithSessions(tag, n) {
  const w = await seedFreshFirm(P(), tag);
  const sessions = [];
  for (let i = 0; i < n; i++) sessions.push(await createChatSession({ firm: w.firm, author: w.owner, visibility: "private" }));
  return { ...w, sessions };
}

// ===========================================================================
// §3.6 — turn_key idempotency + the one-live-turn constraint.
// ===========================================================================

test("§3.6 begin_chat_turn same-turn_key replay returns the ORIGINAL task (one task, ONE user message); a different key on a live turn → CLR13", async (t) => {
  if (unready(t)) return;
  const { owner, sessions } = await firmWithSessions("tk", 1);
  const [session] = sessions;
  const turnKey = opk("tk");

  const first = await beginChatTurn({ session, author: owner, turnKey });
  const replay = await beginChatTurn({ session, author: owner, turnKey });
  assert.ok(taskIdOf(first), "admission yielded a task");
  assert.equal(taskIdOf(replay), taskIdOf(first), "same-turn_key replay returns the ORIGINAL task");
  assert.deepEqual(stripReplayFlag(replay), stripReplayFlag(first), "the replay receipt carries the original task/outcome");

  const msgs = (await readRowsWhere("chat_messages", "session_id", session)).filter((m) => m.role === "user" && m.turn_key === turnKey);
  assert.equal(msgs.length, 1, "exactly ONE user message for the replayed turn_key");

  // The one-live-turn constraint: a NEW key while the turn is live → CLR13
  // (§3.2: partial unique; ingress maps the conflict to CLR13/409 — S4-ND7).
  await assertRaises(CLR13, () => beginChatTurn({ session, author: owner, turnKey: opk("tk2") }), "a second concurrent turn on one session");

  // Terminal-settle frees the slot; the next turn admits (S4-AB11 legal path).
  await finishTask(taskIdOf(first));
  const next = await beginChatTurn({ session, author: owner, turnKey: opk("tk3") });
  assert.ok(taskIdOf(next), "after settle, the session takes a new turn");
  assert.equal((await readRow("agent_tasks", taskIdOf(first))).model_snapshot, "gpt-5.6-terra", "the admitted task snapshotted the model id (S4-D3)");
});

// ===========================================================================
// §6 — admission_second_session_blocks_on_firm_guard (compute cap).
// ===========================================================================

test("§6 cap race at cap−1: the second admission BLOCKS (pg_blocking_pids proven) until the first commits, then CLR14 (which-limit = runs); no partial state", async (t) => {
  if (unready(t)) return;
  const { firm, owner, sessions } = await firmWithSessions("cap", DEFAULT_RUN_CAP + 1);
  // Fill cap−1 = 2 compute slots (queued counts as compute).
  for (let i = 0; i < DEFAULT_RUN_CAP - 1; i++) {
    await beginChatTurn({ session: sessions[i], author: owner, turnKey: opk(`fill${i}`) });
  }

  const winner = { session: sessions[DEFAULT_RUN_CAP - 1], author: owner, turnKey: opk("win") };
  const loser = { session: sessions[DEFAULT_RUN_CAP], author: owner, turnKey: opk("lose") };
  const out = await admissionRace({ winner, loser });

  assert.ok(out.winner?.ok, `the winner admitted the LAST slot (got ${JSON.stringify(out.winner)})`);
  assert.equal(out.provedBlocked, true, "X7: the loser was PROVEN blocked on the admission guard before the winner committed");
  assert.ok(out.loser && out.loser.ok === false, `the loser was refused (got ${JSON.stringify(out.loser)})`);
  assert.equal(out.loser.code, CLR14, `the refusal is CLR14 (got ${out.loser.code}: ${out.loser.message})`);
  assert.match(out.loser.message ?? "", /run|concurren|cap|slot/i, `CLR14 carries WHICH limit (runs) — got: ${out.loser.message}`);

  const compute = await rootQuery(
    "select count(*)::int as n from clara.agent_tasks where firm_id = $1 and status in ('queued','running','cancel_requested')",
    [firm],
  );
  assert.equal(compute.rows[0].n, DEFAULT_RUN_CAP, "exactly cap compute tasks exist after the race (no over-admission — P5)");
  const loserMsgs = await readRowsWhere("chat_messages", "session_id", loser.session);
  assert.equal(loserMsgs.length, 0, "the refused admission left NO user message (atomic refusal)");
});

// ===========================================================================
// §0.4 — held + awaiting_input are zero-compute.
// ===========================================================================

test("§0.4 held and awaiting_input tasks consume NO compute slot; the cap still bites at 3 compute", async (t) => {
  if (unready(t)) return;
  const w = await firmWithSessions("zc", 5);
  const { firm, owner, client, sessions } = w;

  // 2 compute (queued) turns.
  await beginChatTurn({ session: sessions[0], author: owner, turnKey: opk("z0") });
  await beginChatTurn({ session: sessions[1], author: owner, turnKey: opk("z1") });
  // 1 held wake task (zero-compute).
  const { intentId } = await makeConsumableIntent({ sub: owner, client });
  await consumeIntent(intentId);
  await insertWakeTask({ intent: intentId, firm });
  // 1 awaiting_input chat task (zero-compute — parked visibility bookkeeping).
  const parked = taskIdOf(await beginChatTurn({ session: sessions[2], author: owner, turnKey: opk("z2") }));
  await driveTaskStatus(parked, ["running", "awaiting_input"]);

  // Compute is now 2 (the parked turn left the compute set). If held/awaiting
  // consumed slots this begin would be the 5th "run" and MUST have been refused
  // — its success is exactly the §0.4 zero-compute law.
  const third = await beginChatTurn({ session: sessions[3], author: owner, turnKey: opk("z3") });
  assert.ok(taskIdOf(third), "a third COMPUTE turn admits — held + awaiting_input consumed no slot (S4-C7/ND3)");

  // And the cap still bites at 3 compute.
  await assertRaises(CLR14, () => beginChatTurn({ session: sessions[4], author: owner, turnKey: opk("z4") }), "the 4th compute turn");
});

// ===========================================================================
// §6 — budget metering, RATIFIED as-built semantics (orchestrator adjudication
// 2026-07-18, accepted deviation D-A from §3.6's original wording): admission
// CHECKS the committed daily counter but CONSUMES nothing — usage lands only at
// settle. Consequences under test: (a) used ≥ budget refuses exactly (CLR14,
// which-limit, UTC-reset copy); (b) at budget−1, concurrent admissions
// serialize on the admission guard (proven block) and MAY all admit, hard-
// bounded by the run cap (§0.4: overshoot ≤ the sum of admitted in-flight
// runs' usage); (c) every admitted turn's settle lands its usage, after which
// the boundary refuses again (fail-closed after overshoot).
// ===========================================================================

test("§6 budget (ratified D-A): used ≥ budget refuses CLR14+copy; at budget−1 admission serializes (proven) and may admit ≤ cap; usage lands at settle then the boundary closes", async (t) => {
  if (unready(t)) return;
  const { firm, owner, sessions } = await firmWithSessions("bg", 4);

  // Materialize the daily row organically (round-2 S4-AB6: usage = the task's
  // CHECKPOINTED sum, so the setup turn checkpoints its tokens before settling),
  // then pin usage as the operator (root).
  const setup = taskIdOf(await beginChatTurn({ session: sessions[0], author: owner, turnKey: opk("b0") }));
  await checkpointTurn({ task: setup, segment: 1, tokens: 1000 });
  await driveTaskStatus(setup, ["running"]); // S4-AB11: settle only from a compute state
  await settleChatTurn({ task: setup, tokens: 0, outcome: "completed" });
  const rows = await usageSnapshot(firm);
  assert.ok(rows.length >= 1, "settle materialized a firm_usage_daily row");
  const col = usageCounterColumn(rows, 1000);
  assert.ok(col, `a daily token-usage counter column was found (rows: ${JSON.stringify(rows)})`);
  noteLane(`firm_usage_daily token counter column discovered as '${col}'`);
  const usedNow = async () => Number((await usageSnapshot(firm))[0]?.[col]);

  // (a) The boundary: at used ≥ budget a single admission is refused CLR14 with
  // which-limit AND the UTC-reset copy (§0.4 fail-closed, §3.6 copy law).
  assert.ok((await setDailyUsage(firm, col, DEFAULT_DAILY_TOKENS + 1_000_000)) >= 1, "pinned usage over budget");
  const over = await assertRaises(CLR14, () => beginChatTurn({ session: sessions[1], author: owner, turnKey: opk("bo") }), "admission with usage OVER budget (§0.4 fail-closed)");
  const overCopy = `${over.message} ${over.detail ?? ""} ${over.hint ?? ""}`;
  assert.match(overCopy, /token|budget|daily/i, `CLR14 carries WHICH limit (tokens) — got: ${over.message}`);
  assert.match(overCopy, /utc|reset|myt/i, `the CLR14 budget copy surfaces the UTC reset — got: ${over.message}`);

  // (b) At budget−1: admission SERIALIZES on the firm guard (the loser must be
  // proven blocked until the winner commits) and MAY admit — the ratified
  // overshoot, hard-bounded by the run cap. A refused loser is ALSO legal
  // (a future admission-time reservation) but must then be a clean CLR14.
  assert.ok((await setDailyUsage(firm, col, DEFAULT_DAILY_TOKENS - 1)) >= 1, "pinned usage to budget−1");
  const out = await admissionRace({
    winner: { session: sessions[1], author: owner, turnKey: opk("bw") },
    loser: { session: sessions[2], author: owner, turnKey: opk("bl") },
  });
  noteLane(`budget race (D-A semantics): winner=${JSON.stringify(out.winner)} loser=${JSON.stringify(out.loser)} provedBlocked=${out.provedBlocked}`);
  assert.ok(out.winner?.ok, `the winner admitted the last budget slot (got ${JSON.stringify(out.winner)})`);
  assert.equal(out.provedBlocked, true, "X7: the second admission was PROVEN blocked on the admission guard before the first committed");
  if (out.loser?.ok === false) {
    assert.equal(out.loser.code, CLR14, `a refused concurrent admission must be a clean CLR14 (got ${out.loser.code}: ${out.loser.message})`);
    noteLane("budget race: the loser was REFUSED — admission now reserves budget (stricter than the ratified minimum; fine)");
  }
  // Usage is untouched by admission (consume-at-settle is the ratified mechanic).
  assert.equal(await usedNow(), DEFAULT_DAILY_TOKENS - 1, "the daily counter is UNCHANGED by admissions (usage lands at settle)");
  // The overshoot is hard-bounded by the run cap.
  const compute = await rootQuery(
    "select count(*)::int as n from clara.agent_tasks where firm_id = $1 and status in ('queued','running','cancel_requested')",
    [firm],
  );
  assert.ok(compute.rows[0].n <= DEFAULT_RUN_CAP, `admitted-over-budget turns never exceed the run cap (got ${compute.rows[0].n})`);

  // (c) Each admitted turn's settle LANDS its usage exactly once (round-2
  // S4-AB6: via its CHECKPOINTED sum — settle's p_tokens is ignored), and the
  // boundary then refuses again — the §0.4 overshoot loop closes.
  const before = await usedNow();
  let settled = 0;
  for (const [i, side] of [out.winner, out.loser].entries()) {
    if (!side?.ok) continue;
    const tk = 50 + i * 20;
    await checkpointTurn({ task: taskIdOf(side.receipt), segment: 1, tokens: tk });
    await driveTaskStatus(taskIdOf(side.receipt), ["running"]);
    await settleChatTurn({ task: taskIdOf(side.receipt), tokens: 0, outcome: "completed" });
    settled += tk;
  }
  assert.ok(settled > 0, "at least the winner settles");
  assert.equal(await usedNow(), before + settled, "every admitted turn's settle landed exactly its CHECKPOINTED tokens on the daily counter");
  await assertRaises(CLR14, () => beginChatTurn({ session: sessions[3], author: owner, turnKey: opk("bx") }), "post-settle admission at used ≥ budget (fail-closed after overshoot)");
});

// ===========================================================================
// §3.6 — settle idempotency: usage counted exactly once.
// ===========================================================================

test("§3.6 settle_chat_turn replay is a stored-outcome no-op: task_usage single row (checkpointed sum), daily total unchanged, assistant parts not rewritten", async (t) => {
  if (unready(t)) return;
  const { firm, owner, sessions } = await firmWithSessions("st", 1);
  const task = taskIdOf(await beginChatTurn({ session: sessions[0], author: owner, turnKey: opk("s0") }));

  // Round-2 S4-AB6: the authoritative usage source is the task's checkpoints.
  await checkpointTurn({ task, segment: 1, tokens: 500 });
  await driveTaskStatus(task, ["running"]); // S4-AB11: settle only from a compute state
  const first = await settleChatTurn({ task, tokens: 123, outcome: "completed", parts: [{ type: "text", text: "first answer" }] });
  const dailyAfterFirst = await usageSnapshot(firm);
  const usageAfterFirst = await taskUsageRows(task);
  assert.ok(usageAfterFirst.length === 1, `task_usage carries exactly one row for the task (got ${usageAfterFirst.length})`);
  assert.ok(Object.values(usageAfterFirst[0]).some((v) => Number(v) === 500), `task_usage recorded the CHECKPOINTED 500 (p_tokens=123 ignored): ${JSON.stringify(usageAfterFirst[0])}`);
  const col = usageCounterColumn(dailyAfterFirst, 1);
  assert.equal(Number(dailyAfterFirst[0]?.[col]), 500, "the daily counter carries exactly the checkpointed sum");

  // Replay with DIFFERENT tokens/parts — must be a no-op returning the stored
  // outcome. The EFFECTS law is asserted first (it is the contract's point);
  // the receipt shape is compared on its semantic core, with any field-set
  // difference recorded for the as-built review.
  const replay = await settleChatTurn({ task, tokens: 700, outcome: "completed", parts: [{ type: "text", text: "SECOND answer that must not land" }] });
  assert.deepEqual(await usageSnapshot(firm), dailyAfterFirst, "the daily total is UNCHANGED on replay (usage counted once via task_usage)");
  assert.deepEqual(await taskUsageRows(task), usageAfterFirst, "task_usage is unchanged on replay (on-conflict-nothing)");
  // Round-3 fix: the replay receipt is SHAPE-IDENTICAL to the stored outcome
  // (carries tokens) — byte-parity modulo the replayed transport flag.
  assert.deepEqual(stripReplayFlag(replay), stripReplayFlag(first), "the replay receipt is the stored outcome, shape-identical (incl. tokens)");

  const asst = (await readRowsWhere("chat_messages", "session_id", sessions[0])).find((m) => m.role === "assistant");
  assert.ok(asst, "the assistant message exists");
  assert.ok(!JSON.stringify(asst.parts ?? asst).includes("must not land"), "the replay did NOT rewrite the assistant parts");
  assert.equal((await readRow("agent_tasks", task)).status, "completed", "the task stays completed");
});

// ===========================================================================
// Round-2 S4-AB6 — task_checkpoints + checkpoint_turn: the authoritative usage
// pipe. Idempotent per segment; rows immutable; settle sums checkpoints
// (p_tokens IGNORED); a null-parts settle recovers the CONCATENATED
// checkpointed parts (cancel/repair never discards incurred work).
// ===========================================================================

test("S4-AB6 checkpoints: dup segment is a no-op; rows immutable; settle lands sum(checkpoints) ignoring p_tokens; null-parts settle concatenates checkpointed parts", async (t) => {
  if (unready(t)) return;
  const { firm, owner, sessions } = await firmWithSessions("cp", 1);
  const task = taskIdOf(await beginChatTurn({ session: sessions[0], author: owner, turnKey: opk("cp0") }));

  await checkpointTurn({ task, segment: 1, tokens: 100, parts: [{ type: "text", text: "CPART-ONE" }] });
  await checkpointTurn({ task, segment: 2, tokens: 200, parts: [{ type: "text", text: "CPART-TWO" }] });
  // Idempotent: a duplicate segment changes NOTHING (ON CONFLICT DO NOTHING).
  await checkpointTurn({ task, segment: 2, tokens: 9999, parts: [{ type: "text", text: "DUP-MUST-NOT-LAND" }] });
  const cps = await readRowsWhere("task_checkpoints", "task_id", task);
  assert.equal(cps.length, 2, "the duplicate segment added NO row");
  assert.ok(!JSON.stringify(cps).includes("DUP-MUST-NOT-LAND"), "the duplicate segment changed NO stored parts");

  // Rows are immutable (audit-grade usage source).
  const tokCol = firstPresent(await columnMap("task_checkpoints"), ["tokens", "token_count", "usage_tokens"]);
  assert.ok(tokCol, `a checkpoint tokens column exists (rows: ${JSON.stringify(cps[0])})`);
  await assertRaisesOneOf(
    [CLR13, CLR.immutable],
    () => rootQuery(`update clara.task_checkpoints set ${assertIdent(tokCol)} = 1 where task_id = $1`, [task]),
    "UPDATE a checkpoint row",
  );
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("delete from clara.task_checkpoints where task_id = $1", [task]), "DELETE a checkpoint row");

  // Owner-only surface: no app lane reads checkpoints directly.
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select count(*) from clara.task_checkpoints"), "human SELECT task_checkpoints");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "select count(*) from clara.task_checkpoints"), "agent SELECT task_checkpoints");

  // Settle with p_tokens=9999 and NULL parts: daily lands +300 (the checkpointed
  // sum) and the assistant message is the CONCATENATED checkpointed parts.
  await driveTaskStatus(task, ["running"]); // S4-AB11: settle only from a compute state
  await settleChatTurn({ task, parts: null, tokens: 9999, outcome: "completed" });
  const daily = await usageSnapshot(firm);
  const col = usageCounterColumn(daily, 1);
  assert.equal(Number(daily[0]?.[col]), 300, `daily counter == 300 (sum of checkpoints; p_tokens=9999 IGNORED) — rows: ${JSON.stringify(daily)}`);

  const asst = (await readRowsWhere("chat_messages", "session_id", sessions[0])).find((m) => m.role === "assistant");
  assert.ok(asst, "the null-parts settle still upserted an assistant message");
  const parts = JSON.stringify(asst.parts ?? asst);
  assert.ok(parts.includes("CPART-ONE") && parts.includes("CPART-TWO"), `the assistant parts are the concatenated checkpoints: ${parts}`);
  assert.ok(parts.indexOf("CPART-ONE") < parts.indexOf("CPART-TWO"), "checkpointed parts concatenate in segment order");
});
