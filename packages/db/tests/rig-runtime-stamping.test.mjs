// Slice-4 rig — DURABLE RUNTIME part 5: STAMPING / DERIVATION + ERROR CODES
// (§6 items 5–6; contract §3.2 derivation triggers / C6-s3 law, §3.4, §3.7
// S4-D9, §3.2 S4-C1). Contract-blind: derived from the contract v2.1, never
// from 0006.
//
// The law under test: caller-supplied identity on tasks/interruptions/outbox/
// spans is NEVER trusted — chat tasks derive firm/client from the session, wake
// tasks from intent→event, interruptions/spans from the task, outbox rows from
// the intent (condition = the intent's decision); kind/parent/status
// inconsistencies are rejected; the span upsert key is (trace_id, span_id) so a
// span-id collision can never cross traces or firms; error_code is a bounded DB
// CHECK allowlist. (The CLR13/CLR14 SQLSTATE house-style asserts live in the
// metering suite where both codes are provoked exactly.)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  CLR13,
  PG,
  ERROR_CODES,
  assertRaisesOneOf,
  opk,
  rootQuery,
  ensureReady,
  runtimeReady,
  endPool,
  buildWorld,
  insertUser,
  readRow,
  printLaneNotes,
  createChatSession,
  beginChatTurn,
  taskIdOf,
  settleChatTurn,
  driveTaskStatus,
  finishTask,
  makeConsumableIntent,
  consumeIntent,
  insertWakeTask,
  insertChatTask,
  insertInterruption,
  insertOutbox,
  insertSpan,
  spanRows,
  ensureTaskTrace,
} from "./rig-runtime-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("stamping");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-4 runtime core not present — 0006 not yet applied");
    return true;
  }
  return false;
}

const REJECTED = [CLR.badRequest, CLR13, PG.checkViolation];

// ===========================================================================
// §3.2 — task derivation (C6-s3 law: caller values overwritten).
// ===========================================================================

test("§3.2 chat task derivation: a wrong caller firm/client is OVERWRITTEN from the session (task firm == session firm)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task = await insertChatTask({ session, firm: firms.B, client: clients.B1, createdBy: users.alice });
  const row = await readRow("agent_tasks", task);
  assert.equal(row.firm_id, firms.A, "the task firm was DERIVED from the session (forged firm-B value overwritten)");
  assert.notEqual(row.client_id, clients.B1, "a foreign client_id cannot be smuggled onto a chat task");
  await finishTask(task); // cap hygiene
});

test("§3.2 wake task derivation: firm == the intent's EVENT firm (forged value overwritten); origin_intent_id is UNIQUE", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const { intentId, firm } = await makeConsumableIntent({ sub: users.alice, client: clients.A1 });
  assert.equal(firm, firms.A, "fixture sanity: the intent belongs to firm A");
  await consumeIntent(intentId);

  const task = await insertWakeTask({ intent: intentId, firm: firms.B });
  const row = await readRow("agent_tasks", task);
  assert.equal(row.firm_id, firms.A, "the wake task firm was DERIVED from intent→event (forged firm-B overwritten)");
  assert.equal(row.status, "held", "the drained wake task lands held (§0.2)");

  await assertRaisesOneOf(
    [PG.uniqueViolation, CLR13, CLR.badRequest],
    () => insertWakeTask({ intent: intentId, firm: firms.A }),
    "a SECOND task for the same origin intent (origin_intent_id UNIQUE)",
  );
});

test("§3.2 kind/parent/status consistency: chat×intent, wake×session, wake×queued, chat×held all rejected", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const { intentId } = await makeConsumableIntent({ sub: users.alice, client: clients.A1 });
  await consumeIntent(intentId);

  await assertRaisesOneOf(REJECTED, () => insertChatTask({ session, firm: firms.A, extra: { origin_intent_id: intentId } }), "a chat_turn task carrying origin_intent_id");
  await assertRaisesOneOf(REJECTED, () => insertWakeTask({ intent: intentId, firm: firms.A, extra: { session_id: session } }), "a wake task carrying session_id");
  await assertRaisesOneOf(REJECTED, () => insertWakeTask({ intent: intentId, firm: firms.A, status: "queued" }), "a wake task in a compute status (held is the only live wake state)");
  await assertRaisesOneOf(REJECTED, () => insertChatTask({ session, firm: firms.A, status: "held" }), "a chat_turn task in held (wake-only status)");
});

test("§3.5 session author trigger: member accepted; cross-firm / non-member / unknown authors rejected; created_by immutable post-insert", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  // Probe with a leak diagnostic: if a bad-author insert is ACCEPTED, read back
  // what landed so the divergence report carries the observed row, then fail.
  const reject = async (author, label) => {
    let leaked = null;
    try {
      leaked = await createChatSession({ firm: firms.A, author });
    } catch (e) {
      assert.ok(
        [CLR.authz, CLR.badRequest, CLR13, PG.foreignKeyViolation].includes(e.code),
        `${label}: refused with a clean code (got ${e.code}: ${e.message})`,
      );
      return;
    }
    const row = await readRow("chat_sessions", leaked);
    assert.fail(`${label}: the INSERT was ACCEPTED (contract §3.5 requires the author trigger) — landed row: ${JSON.stringify(row)}`);
  };

  // A LIVE ACTIVE member of the session's firm is accepted (positive control).
  const good = await createChatSession({ firm: firms.A, author: users.bob });
  assert.ok(good, "a live active member (bob, bookkeeper) authors a session");

  // Cross-firm member, membership-less user, and unknown user all rejected.
  await reject(users.erin, "a CROSS-FIRM author (erin is an active member of firm S, not A)");
  const nonMember = await insertUser(`s4auth_${Date.now().toString(36)}`, "nomember");
  await reject(nonMember, "a NON-member author (a real user with NO membership anywhere)");
  await reject(randomUUID(), "an UNKNOWN author (no users row at all)");

  // The author stamp is identity: created_by is immutable after insert.
  await assertRaisesOneOf(
    [CLR13, CLR.immutable],
    () => rootQuery("update clara.chat_sessions set created_by = $2 where id = $1", [good, users.alice]),
    "UPDATE created_by on a chat session",
  );
});

// ===========================================================================
// §3.3 / §3.4 — child-surface stamping.
// ===========================================================================

test("§3.3 interruption stamping: a wrong caller firm is corrected from the parent task", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task = taskIdOf(await beginChatTurn({ session, author: users.alice, turnKey: opk("stI") }));
  const interruption = await insertInterruption({ task, firm: firms.B });
  const row = await readRow("agent_interruptions", interruption);
  assert.equal(row.firm_id, firms.A, "the interruption firm was DERIVED from the task (forged firm-B overwritten)");
  await finishTask(task); // cap hygiene (also closes the probe clarify)
});

test("§3.4 outbox stamping: firm from intent→event; condition == the INTENT'S decision (forged values overwritten)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const { intentId } = await makeConsumableIntent({ sub: users.alice, client: clients.A1 });
  await consumeIntent(intentId);
  const { id, conditionCol } = await insertOutbox({ intent: intentId, firm: firms.B, condition: "internal_task" });
  const row = await readRow("wakes_outbox", id);
  assert.equal(row.firm_id, firms.A, "the outbox firm was DERIVED from the intent (forged firm-B overwritten)");
  if (conditionCol) {
    assert.equal(row[conditionCol], "background_review", `the outbox ${conditionCol} equals the INTENT'S decision (forged 'internal_task' overwritten)`);
  }
});

// ===========================================================================
// §3.7 — span identity (S4-D9): upsert key (trace_id, span_id); firm from task.
// ===========================================================================

test("§3.7 span_key_is_trace_scoped (S4-D9): same span_id under different traces does NOT collide; firm derived from the task; exact-pair duplicate rejected", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const sessA = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const taskA = taskIdOf(await beginChatTurn({ session: sessA, author: users.alice, turnKey: opk("spA") }));
  const traceA = await ensureTaskTrace(taskA);
  const sessB = await createChatSession({ firm: firms.B, author: users.dave, visibility: "private" });
  const taskB = taskIdOf(await beginChatTurn({ session: sessB, author: users.dave, turnKey: opk("spB") }));
  const traceB = await ensureTaskTrace(taskB);
  assert.ok(traceA && traceB && traceA !== traceB, "both tasks carry distinct trace ids");

  const spanId = randomUUID();
  await insertSpan({ traceId: traceA, spanId, task: taskA, firm: firms.B }); // forged firm
  const a = await spanRows(traceA, spanId);
  assert.equal(a.length, 1, "the firm-A span landed");
  assert.equal(a[0].firm_id, firms.A, "span firm DERIVED from the task row (forged firm-B overwritten — S4-D9)");

  // The SAME span_id under a DIFFERENT trace must NOT collide (trace-scoped key).
  await insertSpan({ traceId: traceB, spanId, task: taskB });
  const b = await spanRows(traceB, spanId);
  assert.equal(b.length, 1, "the same span_id under another trace coexists (key = (trace_id, span_id))");
  assert.equal(b[0].firm_id, firms.B, "the second span derived ITS task's firm — a span-id collision can never cross firms");

  // A plain duplicate of the exact (trace_id, span_id) pair violates the key.
  await assertRaisesOneOf(
    [PG.uniqueViolation, CLR13],
    () => insertSpan({ traceId: traceA, spanId, task: taskA }),
    "a duplicate (trace_id, span_id) plain INSERT",
  );

  // Cap hygiene: free both firms' compute slots.
  await finishTask(taskA);
  await finishTask(taskB);
});

// ===========================================================================
// §3.2 — error_code: a bounded DB CHECK allowlist (S4-C1).
// ===========================================================================

test("§3.2 error_code allowlist: the six classes pass; free text is impossible (DB CHECK); the constraint enumerates exactly the contract set", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;

  // Structural: a CHECK constraint on agent_tasks enumerates the six classes.
  const chk = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'clara' and t.relname = 'agent_tasks' and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%error_code%'`,
  );
  assert.ok(chk.rowCount >= 1, "agent_tasks carries a CHECK constraint on error_code (S4-C1: DB-enforced, not app discipline)");
  const def = chk.rows.map((r) => r.def).join(" ");
  for (const code of ERROR_CODES) assert.ok(def.includes(`'${code}'`), `the CHECK allowlist includes '${code}'`);

  // Behavioral: a failed settle with a LEGAL class lands status+code.
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task = taskIdOf(await beginChatTurn({ session, author: users.alice, turnKey: opk("ec") }));
  await driveTaskStatus(task, ["running"]); // S4-AB11: running→failed is the legal fail edge
  await settleChatTurn({ task, tokens: 1, outcome: "failed", errorCode: "model_error" });
  const row = await readRow("agent_tasks", task);
  assert.equal(row.status, "failed", "the failed settle landed");
  assert.equal(row.error_code, "model_error", "the bounded error class was stored");

  // Behavioral negative: free text is rejected — through the fn AND on a raw insert.
  const session2 = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const task2 = taskIdOf(await beginChatTurn({ session: session2, author: users.alice, turnKey: opk("ec2") }));
  await driveTaskStatus(task2, ["running"]); // so the error_code check (not the transition guard) is what raises
  await assertRaisesOneOf(
    [PG.checkViolation, CLR.badRequest, CLR13],
    () => settleChatTurn({ task: task2, tokens: 1, outcome: "failed", errorCode: "the model exploded spectacularly" }),
    "settle with free-text error_code",
  );
  const { intentId } = await makeConsumableIntent({ sub: users.alice, client: world.clients.A1 });
  await consumeIntent(intentId);
  await assertRaisesOneOf(
    [PG.checkViolation, CLR.badRequest, CLR13],
    () => insertWakeTask({ intent: intentId, firm: firms.A, extra: { error_code: "bogus_code" } }),
    "a raw INSERT with an out-of-allowlist error_code",
  );

  // Cap hygiene: task2's rejected settle left it running — settle it cleanly.
  await finishTask(task2);
});
