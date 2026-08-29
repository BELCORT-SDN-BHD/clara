// Admission + settlement (contract §3.6 / §0.4). begin_chat_turn is the atomic,
// fail-closed gate: turn_key replay, one-live-turn (CLR13), and — since F-A9 PR-0 —
// the COMPUTE-RUN CAP alone (CLR14). The daily token budget that used to share that
// SQLSTATE is gone by owner ruling (TA-P12 = A; law 76 "meter, never cap"), so the
// over-limit cell below is a positive-by-absence differential rather than a refusal.
// settle_chat_turn is idempotent and records usage — the METER stays. These run the
// REAL DB functions the runtime calls, as clara_runtime.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

after(async () => {
  await rig.endPool();
});

test("admission: turn_key replay returns the ORIGINAL task (idempotent)", { skip }, async () => {
  const { owner, client } = await rig.buildFirm("adm1");
  const session = await rig.createChatSession({ author: owner, client });
  const tk = "turn-key-A";
  const first = await rig.beginChatTurn({ session, author: owner, turnKey: tk });
  const replay = await rig.beginChatTurn({ session, author: owner, turnKey: tk });
  assert.equal(first.task_id, replay.task_id, "same task on replay");
  assert.equal(replay.replayed, true, "flagged as replayed");
});

test("admission: same-session concurrent turn is rejected CLR13", { skip }, async () => {
  const { owner, client } = await rig.buildFirm("adm2");
  const session = await rig.createChatSession({ author: owner, client });
  await rig.beginChatTurn({ session, author: owner, turnKey: "t1" }); // live (queued)
  await assert.rejects(
    () => rig.beginChatTurn({ session, author: owner, turnKey: "t2" }),
    (e) => e.code === "CLR13",
    "a second live turn on the session is CLR13",
  );
});

// F-A9 PR-0 INVERTED THIS CELL (law 31 — the pre-change half ran for real against the
// pre-change body; this is the post-change half). It used to assert that a firm at/over
// its daily token limit was REFUSED CLR14. The owner ruled that gate out (TA-P12 = A, the
// 2026-08-22 Track-A sitting; digest law 76 "meter, never cap"), so the same fixture must
// now ADMIT.
// F-A9 PR-1B RE-CUT IT AGAIN: `firm_limits.daily_token_limit` is now a DROPPED column, so
// the per-firm pin it used to write would raise 42703. The premise is still MEASURED, not
// merely unobserved — the column's ABSENCE is asserted positively, and the recorded
// UTC-day usage is read back far above the fn-constant default (1,000,000) the pre-hotfix
// body fell back to for a firm carrying no limit row. That is the exact state that raised
// CLR14 before, expressed in the only terms the schema still has.
test("admission: the daily token budget gate is GONE and so is its column — a firm far over the old fn-constant default still admits (F-A9 PR-0 → PR-1B)", { skip }, async () => {
  const { owner, client, firm } = await rig.buildFirm("adm3");
  const session = await rig.createChatSession({ author: owner, client });
  const deadCol = await rig.rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='firm_limits' and column_name='daily_token_limit'",
  );
  assert.equal(deadCol.rowCount, 0, "firm_limits.daily_token_limit is DROPPED at F-A9 PR-1B — there is no per-firm cap left to pin");
  const used = await rig.rootQuery(
    "insert into clara.firm_usage_daily (firm_id, usage_date, tokens_used) values ($1, (now() at time zone 'UTC')::date, 5000000) on conflict (firm_id, usage_date) do update set tokens_used=excluded.tokens_used returning tokens_used",
    [firm],
  );
  assert.ok(Number(used.rows[0].tokens_used) > 1000000, "the firm's recorded UTC-day usage really is far above the fn-constant default the removed gate used");

  const admitted = await rig.beginChatTurn({ session, author: owner, turnKey: "b1" });
  assert.ok(admitted?.task_id, `an over-limit admission returns a task (got ${JSON.stringify(admitted)})`);
  const task = await rig.readTask(admitted.task_id);
  assert.equal(task?.status, "queued", "a real queued chat task stands behind the receipt");
});

test("admission: compute-run cap reached -> CLR14 (held/awaiting excluded)", { skip }, async () => {
  const { owner, client } = await rig.buildFirm("adm4");
  // Default cap = 3 concurrent compute runs. Open 3 live turns (3 sessions), then a 4th must reject.
  for (let i = 0; i < 3; i++) {
    const s = await rig.createChatSession({ author: owner, client });
    await rig.beginChatTurn({ session: s, author: owner, turnKey: `cap${i}` });
  }
  const s4 = await rig.createChatSession({ author: owner, client });
  await assert.rejects(
    () => rig.beginChatTurn({ session: s4, author: owner, turnKey: "cap3" }),
    (e) => e.code === "CLR14",
    "the 4th concurrent compute run is CLR14",
  );
});

test("settle: idempotent, records usage, closes pending interruptions", { skip }, async () => {
  const { owner, client, firm } = await rig.buildFirm("adm5");
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "s1" });
  await rig.driveTask(task_id, ["running"]);
  // Usage is now the sum of durable checkpoints (S4-AB6) — the workflow checkpoints
  // each segment; settle IGNORES the passed token count. Checkpoint 42 before settling.
  await rig.checkpointTurn({ task: task_id, segment: 0, tokens: 42, parts: [{ type: "text", text: "done" }] });
  // A pending interruption present at settle must be closed (S4-D6). settle running->completed is matrix-legal.
  await rig.insertInterruption({ task: task_id });

  const r1 = await rig.settleChatTurn({ task: task_id, parts: [{ type: "text", text: "done" }], tokens: 999, outcome: "completed" });
  assert.equal(r1.status, "completed");
  assert.equal(r1.replayed, false);
  assert.equal(Number(r1.tokens), 42, "settle reports the checkpoint-sum token total (passed 999 ignored)");

  const task = await rig.readTask(task_id);
  assert.equal(task.status, "completed");
  const asst = await rig.readAssistantMessage(task_id);
  assert.ok(asst, "assistant message persisted");

  const usage = await rig.readUsage(firm);
  assert.ok(usage.some((u) => Number(u.tokens_used) >= 42), "42 tokens recorded on the UTC day");

  // Pending interruption closed on terminal settle (S4-D6).
  const inter = await rig.rootQuery("select status from clara.agent_interruptions where task_id=$1", [task_id]);
  assert.ok(inter.rows.every((x) => x.status === "cancelled"), "pending interruptions cancelled on settle");

  // Replay is a stored-outcome no-op.
  const r2 = await rig.settleChatTurn({ task: task_id, parts: [{ type: "text", text: "again" }], tokens: 999, outcome: "completed" });
  assert.equal(r2.replayed, true, "terminal replay is a no-op");
  const usage2 = await rig.readUsage(firm);
  const total = usage2.reduce((a, u) => a + Number(u.tokens_used), 0);
  assert.equal(total, 42, "usage did not double-count on replay");
});
