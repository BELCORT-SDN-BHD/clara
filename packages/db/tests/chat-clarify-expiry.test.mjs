// #720 Half 1 — THE 14-DAY CLARIFICATION DEADLINE GAINS AN ENFORCER ON THE CHAT LANE.
//
// Frontier-gated on the `chat_clarify_expiry$` stem.
//
// THE CLAIM THIS FILE EXISTS FOR, in the owner's own words (issue #720, Agent Brief, 2026-09-13):
// "The same sweep also moves a past-due chat clarification to `expired`, under the same rules it
// applies to Work questions: own clock (no caller-supplied cutoff), bounded batch per cycle,
// skip-locked, runtime-only execute, one audit row per swept row, one notify per non-empty sweep."
//
// SO EVERY CELL BELOW IS A PAIR OR AN INVARIANT, never a single happy path:
//   · the POSITIVE/NEGATIVE pair — a past-due chat clarification moves in the SAME call that moves
//     a past-due Work question; one inside its deadline does not;
//   · the AUDIT — one row per swept row, and a chat row's entry records its NULL Work link as
//     jsonb null rather than raising or dropping the key;
//   · the DOOR — answering a past-due chat clarification is still refused, before AND after the
//     sweep, both times CLR13. #720 opens no door; it closes a question.
//   · the SWEEP INVARIANTS the recut may not have cost — batch bound + oldest-first, skip-locked,
//     the optional firm narrowing, and exactly ONE notify per non-empty sweep (none when empty).
//
// WHAT IS **NOT** HERE, AND WHY. "A clean no-op on a database that predates the Work-question
// columns" cannot be exercised at the DB layer: migration 0198's §0 prestate REFUSES to apply
// unless `clara.expire_due_interruptions` and `clara.agent_interruptions.work_id` already exist
// (0180), so a database without the Work-question columns never has this file's subject on it at
// all. The pre-0180 no-op belongs to the RUNTIME wrapper, which probes for those columns before
// any statement naming the verb is parsed — asserted in
// `packages/runtime/tests/control-work-question.test.mjs`
// ("expire.pre-0180: …no statement naming the verb is parsed"). The cell at the bottom of §5
// pins the prestate coupling from this side so the claim is checkable here too.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateChatExpiry, buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  parkedWork, parkedChatTurn, openChatClarify, plantPastDueChatClarify, plantPastDueWorkQuestion,
  interruptionRow, expireDueInterruptions, answerInterruption, sweepAuditRows,
  rootQuery, roleQuery, ROLES, getPool, opk,
} from "./chat-clarify-expiry-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("chat-clarify-expiry");
  printSkipCount("chat-clarify-expiry");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const FIRM_B = () => world.firms.B;
const A1 = () => world.clients.A1;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const DAVE = () => world.users.dave;

/** Assert `fn()` raises SQLSTATE `code` AND that its message contains `needle` — the message is
 *  load-bearing here because the two refusals this door can give are the same errcode. */
async function assertRaisesSaying(code, needle, fn, label) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  assert.ok(err, `${label}: expected a refusal, got a success`);
  assert.equal(err.code, code, `${label}: wrong SQLSTATE (message was: ${err.message})`);
  assert.ok(String(err.message).includes(needle),
    `${label}: expected the message to contain ${JSON.stringify(needle)}; got ${JSON.stringify(err.message)}`);
  return err;
}

// ===========================================================================================
// 1 · THE POSITIVE / NEGATIVE PAIR — one call, both lanes.
// ===========================================================================================

test("w720.sweep.pair one call expires a past-due CHAT clarification and a past-due WORK question; a live chat clarify is untouched", async (t) => {
  if (await gateChatExpiry(t)) return;

  // The Work half, opened through the real verbs and then given a past-due SECOND question (the
  // first stays pending — `expires_at` is immutable, so a past-due row is planted at insert time).
  const parked = await parkedWork({ client: A1(), author: BOB() });
  const pastWork = await plantPastDueWorkQuestion({ task: parked.taskId, work: parked.workId });

  // The chat half: one past-due clarification and one INSIDE its deadline, on two chat turns.
  const dueTurn = await parkedChatTurn({ firm: FIRM_A(), author: BOB(), client: A1() });
  const pastChat = await plantPastDueChatClarify({ task: dueTurn.taskId });
  const liveTurn = await parkedChatTurn({ firm: FIRM_A(), author: ALICE(), client: A1() });
  const liveChat = await openChatClarify({ task: liveTurn.taskId });

  const out = await expireDueInterruptions({ limit: 50, firm: FIRM_A() });

  assert.ok(out.question_ids.includes(pastChat),
    "sweep.pair: the past-due CHAT clarification is named by the sweep that expired it");
  assert.ok(out.question_ids.includes(pastWork),
    "sweep.pair: …in the SAME call that expired the past-due WORK question");
  assert.equal((await interruptionRow(pastChat)).status, "expired");
  assert.equal((await interruptionRow(pastWork)).status, "expired",
    "sweep.pair: Work-question expiry is unchanged — the recut removed a predicate, not an arm");
  assert.equal((await interruptionRow(liveChat)).status, "pending",
    "sweep.pair: a chat clarification INSIDE its deadline is untouched — the clock is the only gate");
  assert.equal((await interruptionRow(parked.questionId)).status, "pending",
    "sweep.pair: …and so is a Work question inside its deadline");

  // The chat row moved with its Work link still NULL: the sweep reads the deadline, not the lane.
  assert.equal((await interruptionRow(pastChat)).work_id, null);
});

// ===========================================================================================
// 2 · THE AUDIT ROW — one per swept row, and a NULL Work link is RECORDED, not dropped.
// ===========================================================================================

test("w720.audit.chat-row a swept chat clarification writes exactly one audit row whose work link is jsonb null", async (t) => {
  if (await gateChatExpiry(t)) return;
  const turn = await parkedChatTurn({ firm: FIRM_A(), author: BOB(), client: A1() });
  const chatId = await plantPastDueChatClarify({ task: turn.taskId });

  await expireDueInterruptions({ limit: 50, firm: FIRM_A() });
  assert.equal((await interruptionRow(chatId)).status, "expired");

  const rows = await sweepAuditRows(chatId);
  assert.equal(rows.length, 1, "audit.chat-row: exactly one audit row names this question");
  assert.equal(rows[0].has_work_key, true,
    "audit.chat-row: the `work` key is PRESENT — a chat row's absent Work is recorded, not omitted");
  assert.equal(rows[0].work_key, null,
    "audit.chat-row: …and it is recorded as jsonb null (pg renders it as SQL null on read)");
  assert.equal(rows[0].args.question, chatId);

  // A SECOND sweep writes NO second row: the first one moved the status out of `pending`.
  await expireDueInterruptions({ limit: 50, firm: FIRM_A() });
  assert.equal((await sweepAuditRows(chatId)).length, 1,
    "audit.chat-row: one audit row per SWEPT row, not per sweep");
});

// ===========================================================================================
// 3 · THE DOOR — #720 closes a question; it opens nothing.
// ===========================================================================================

test("w720.door.answer answering a past-due chat clarification is refused before AND after the sweep, both CLR13", async (t) => {
  if (await gateChatExpiry(t)) return;
  const turn = await parkedChatTurn({ firm: FIRM_A(), author: BOB(), client: A1() });
  const chatId = await plantPastDueChatClarify({ task: turn.taskId });

  // BEFORE: the row is still `pending`, and 0006's deadline arm refuses it.
  await assertRaisesSaying("CLR13", "the clarify has expired",
    () => answerInterruption(BOB(), { id: chatId, opKey: opk("w720-before") }),
    "door.answer before the sweep");

  await expireDueInterruptions({ limit: 50, firm: FIRM_A() });
  assert.equal((await interruptionRow(chatId)).status, "expired");

  // AFTER: the same door refuses the same answerer with the same errcode — the sweep moved the
  // status BEFORE they knocked, so they read the not-pending sentence instead of the deadline one.
  // The door itself is byte-unchanged by #720; which of its two refusals fires is all that moved.
  await assertRaisesSaying("CLR13", "interruption is not pending (expired)",
    () => answerInterruption(BOB(), { id: chatId, opKey: opk("w720-after") }),
    "door.answer after the sweep");
});

// ===========================================================================================
// 4 · THE SWEEP INVARIANTS THE RECUT MAY NOT HAVE COST.
// ===========================================================================================

test("w720.invariant.batch the per-cycle bound holds on chat rows, oldest deadline first", async (t) => {
  if (await gateChatExpiry(t)) return;
  // FIRM B, whose only past-due interruptions are the three planted here — a bound is only
  // measurable when nothing else is competing for the budget.
  const turn = await parkedChatTurn({ firm: FIRM_B(), author: DAVE(), client: world.clients.B1 });
  const oldest = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "3 hours" });
  const middle = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "2 hours" });
  const newest = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "1 hour" });

  const first = await expireDueInterruptions({ limit: 2, firm: FIRM_B() });
  assert.equal(first.expired, 2, "invariant.batch: the cycle moved exactly its bound, not the backlog");
  assert.deepEqual([...first.question_ids].sort(), [oldest, middle].sort(),
    "invariant.batch: …and it took the two OLDEST deadlines (order by expires_at)");
  assert.equal((await interruptionRow(newest)).status, "pending");

  const second = await expireDueInterruptions({ limit: 2, firm: FIRM_B() });
  assert.deepEqual(second.question_ids, [newest],
    "invariant.batch: the next cycle picks the backlog up — a bound defers, it never drops");
});

test("w720.invariant.skip-locked a chat row locked by another transaction is skipped, not waited on", async (t) => {
  if (await gateChatExpiry(t)) return;
  const turn = await parkedChatTurn({ firm: FIRM_B(), author: DAVE(), client: world.clients.B1 });
  const locked = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "5 hours" });
  const free = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "4 hours" });

  const holder = await getPool().connect();
  try {
    await holder.query("begin");
    await holder.query("select id from clara.agent_interruptions where id=$1 for update", [locked]);
    // The sweep runs on ANOTHER connection while that row lock is held. `for update skip locked`
    // means it must return promptly WITHOUT the locked row — a hang here is the defect.
    const out = await expireDueInterruptions({ limit: 50, firm: FIRM_B() });
    assert.deepEqual(out.question_ids, [free],
      "invariant.skip-locked: the sweep took the free row and stepped over the locked one");
    assert.equal((await interruptionRow(locked)).status, "pending");
  } finally {
    await holder.query("rollback").catch(() => {});
    holder.release();
  }

  // …and once the lock is gone the next cycle takes it. Skipped is DEFERRED, never dropped.
  const after = await expireDueInterruptions({ limit: 50, firm: FIRM_B() });
  assert.deepEqual(after.question_ids, [locked]);
});

test("w720.invariant.notify exactly one NOTIFY per non-empty sweep, and none for an empty one", async (t) => {
  if (await gateChatExpiry(t)) return;
  const turn = await parkedChatTurn({ firm: FIRM_B(), author: DAVE(), client: world.clients.B1 });
  const a = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "7 hours" });
  const b = await plantPastDueChatClarify({ task: turn.taskId, pastBy: "6 hours" });

  const listener = await getPool().connect();
  const seen = [];
  listener.on("notification", (n) => seen.push(n));
  try {
    await listener.query("listen clara_runtime_ctl");

    const out = await expireDueInterruptions({ limit: 50, firm: FIRM_B() });
    assert.equal(out.expired, 2, "invariant.notify: the sweep that is being counted moved TWO rows");
    await listener.query("select 1"); // a round trip after the notifying txn committed
    assert.equal(seen.length, 1,
      "invariant.notify: ONE nudge for the whole non-empty sweep — not one per row, and not none");
    assert.equal(seen[0].channel, "clara_runtime_ctl");

    const empty = await expireDueInterruptions({ limit: 50, firm: FIRM_B() });
    assert.equal(empty.expired, 0);
    await listener.query("select 1");
    assert.equal(seen.length, 1, "invariant.notify: an EMPTY sweep nudges nobody");
  } finally {
    await listener.query("unlisten *").catch(() => {});
    listener.release();
  }
  assert.equal((await interruptionRow(a)).status, "expired");
  assert.equal((await interruptionRow(b)).status, "expired");
});

test("w720.invariant.firm the optional firm narrowing still applies to chat rows", async (t) => {
  if (await gateChatExpiry(t)) return;
  const turnA = await parkedChatTurn({ firm: FIRM_A(), author: BOB(), client: A1() });
  const inA = await plantPastDueChatClarify({ task: turnA.taskId, pastBy: "9 hours" });
  const turnB = await parkedChatTurn({ firm: FIRM_B(), author: DAVE(), client: world.clients.B1 });
  const inB = await plantPastDueChatClarify({ task: turnB.taskId, pastBy: "9 hours" });

  const out = await expireDueInterruptions({ limit: 50, firm: FIRM_B() });
  assert.ok(out.question_ids.includes(inB));
  assert.ok(!out.question_ids.includes(inA),
    "invariant.firm: p_firm narrows the chat lane exactly as it narrows the Work lane");
  assert.equal((await interruptionRow(inA)).status, "pending");

  await expireDueInterruptions({ limit: 50, firm: FIRM_A() });
  assert.equal((await interruptionRow(inA)).status, "expired");
});

test("w720.invariant.lane the sweep is clara_runtime's and nobody else's", async (t) => {
  if (await gateChatExpiry(t)) return;
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive]) {
    let err = null;
    try {
      await roleQuery(role, "select clara.expire_due_interruptions(1, null)");
    } catch (e) { err = e; }
    assert.ok(err, `invariant.lane: ${role} must not reach the sweep`);
    assert.equal(err.code, "42501", `invariant.lane: ${role} got ${err.code} instead of 42501`);
  }
});

// ===========================================================================================
// 5 · THE RECUT ITSELF, read from the catalog — and the prestate coupling that makes the
//     "clean no-op on a pre-0180 database" claim checkable from this side.
// ===========================================================================================

test("w720.catalog.predicate the committed body no longer scopes the sweep to Work questions", async (t) => {
  if (await gateChatExpiry(t)) return;
  const src = await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.expire_due_interruptions(integer,uuid)'::regprocedure")
    .then((r) => r.rows[0].prosrc);
  assert.ok(!src.includes("work_id is not null"),
    "catalog.predicate: `work_id is not null` is gone — that removal IS the ticket");
  assert.ok(src.includes("expires_at < clock_timestamp()"),
    "catalog.predicate: the cutoff is still the function's OWN clock and takes no parameter");
  assert.ok(src.includes("for update skip locked") && src.includes("greatest(coalesce(p_limit, 50), 0)"),
    "catalog.predicate: skip-locked and the batch bound survived the recut");
  assert.ok(!/\bp_(cutoff|now|as_of)\b/.test(src),
    "catalog.predicate: no caller-supplied cutoff was smuggled in");
});

test("w720.catalog.prestate the chat enforcer cannot exist on a database that predates the Work-question columns", async (t) => {
  if (await gateChatExpiry(t)) return;
  // Migration 0198 REPLACES 0180's body, so the `chat_clarify_expiry$` stem and the `work_id`
  // column are inseparable on any database. That is why "a clean no-op on a pre-0180 database" is
  // not a DB-layer cell: on such a database this lane's subject does not exist, and the no-op is
  // the runtime wrapper's column probe (packages/runtime/lib/control.mjs), asserted there.
  const col = await rootQuery(
    `select count(*)::int as n from information_schema.columns
      where table_schema='clara' and table_name='agent_interruptions' and column_name='work_id'`)
    .then((r) => r.rows[0].n);
  assert.equal(col, 1,
    "catalog.prestate: 0198 applied, so 0180's work_id column is present — the two cannot be separated");
  const stems = await rootQuery(
    `select count(*)::int as n from clara.schema_migrations where version ~ 'work_questions$'`)
    .then((r) => r.rows[0].n);
  assert.equal(stems, 1,
    "catalog.prestate: …and the 0180 stem is recorded applied beside this one");
});
