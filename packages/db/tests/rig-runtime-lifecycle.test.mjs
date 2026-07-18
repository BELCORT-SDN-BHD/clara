// Slice-4 rig — DURABLE RUNTIME part 1: LIFECYCLE ALLOWLISTS (§6 item 1 of the
// work order; contract §3.1–§3.5). Contract-blind: derived from
// docs/plan/slice4-durable-runtime-contract.md v2.1, never from reading 0006.
//
// Covers: wake_intents consumption lifecycle (forge-proof INSERT, the single
// pending→consumed update, DELETE/TRUNCATE blocks, the column-scoped runtime
// UPDATE grant); interruption transitions incl. the S4-D5 named schedule
// `wait_across_deadline_answer_loses`; agent_tasks terminal-terminality +
// identity immutability; wakes_outbox held→cancelled-only; chat message parts
// immutability + the §3.5 turn_key laws.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  CLR13,
  PG,
  ROLES,
  assertRaises,
  assertRaisesOneOf,
  opk,
  rootQuery,
  roleQuery,
  ensureReady,
  runtimeReady,
  endPool,
  seedFreshFirm,
  human,
  sha,
  ingestDocument,
  readRow,
  readRowsWhere,
  columnMap,
  firstPresent,
  adaptiveInsert,
  printLaneNotes,
  makeConsumableIntent,
  consumeIntent,
  insertInterruption,
  insertOutbox,
  outboxRowsForIntent,
  createChatSession,
  beginChatTurn,
  taskIdOf,
  settleChatTurn,
} from "./rig-runtime-fixtures.mjs";
import { answerAcrossDeadline } from "./rig-runtime-race.mjs";
import { truncateGuardError } from "./rig-txn.mjs";

let ready = false;
let W = null; // { owner, firm, client, coa }

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
  if (ready) W = await seedFreshFirm(`s4lc_${Date.now().toString(36)}_${randomUUID().slice(0, 4)}`, "lc");
});
after(async () => {
  printLaneNotes("lifecycle");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-4 runtime core not present — 0006 not yet applied");
    return true;
  }
  return false;
}

/** Direct chat-message insert (negative-space tests only; the sanctioned path is
 *  begin/settle). Adaptive: contract names turn_key/role/parts, not the rest.
 *  As-landed interface fact (build report, not 0006): BOTH roles carry a NOT
 *  NULL task_id — pass a REAL task so the FK cannot mask the assertion under test. */
async function insertMessage({ session, task = null, role, parts = [{ type: "text", text: "raw" }], turnKey = undefined, author = null, seq = undefined, lane = "root" }) {
  const byName = await columnMap("chat_messages");
  const desired = { session_id: session, role };
  if (task != null && byName.has("task_id")) desired.task_id = task;
  const partsCol = firstPresent(byName, ["parts", "content", "body"]);
  if (partsCol) desired[partsCol] = parts;
  if (turnKey !== undefined) desired.turn_key = turnKey;
  const authorCol = firstPresent(byName, ["created_by", "author_id", "user_id", "sender_id"]);
  if (author != null && authorCol) desired[authorCol] = author;
  const seqCol = firstPresent(byName, ["seq", "message_seq", "position", "idx", "message_index"]);
  if (seq !== undefined && seqCol) desired[seqCol] = seq;
  const r = await adaptiveInsert("chat_messages", desired, { lane, label: "insert chat message" });
  return r.rows[0].id;
}

// ===========================================================================
// §3.1 — wake_intents consumption lifecycle.
// ===========================================================================

test("§3.1 insert_cannot_forge_consumed_intent (S4-D7): a runtime INSERT with consumed fields is forced to pending + NULL consumption", async (t) => {
  if (unready(t)) return;
  // A fresh document.ingested event that carries NO intent yet, then a runtime
  // INSERT that forges the whole consumption state. The BEFORE INSERT stamping
  // law must force status='pending' and null both consumption fields.
  await ingestDocument(human(W.owner), { client: W.client, sha256: sha(randomUUID()), opKey: opk("forge") });
  const ev = (
    await rootQuery(
      `select de.id, de.firm_id, de.seq from clara.domain_events de
        left join clara.wake_intents wi on wi.event_id = de.id
       where de.client_id = $1 and de.event_type = 'document.ingested' and wi.id is null
       order by de.seq desc limit 1`,
      [W.client],
    )
  ).rows[0];
  assert.ok(ev, "a fresh intent-less document.ingested event exists");
  const r = await roleQuery(
    ROLES.runtime,
    `insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version, status, consumed_at, consumed_by)
     values ($1, $2, $3, 'document.ingested', 'background_review', 1, 'consumed', now(), $4) returning id`,
    [ev.id, ev.firm_id, ev.seq, randomUUID()],
  );
  const row = await readRow("wake_intents", r.rows[0].id);
  assert.equal(row.status, "pending", "INSERT cannot forge status=consumed (forced pending)");
  assert.equal(row.consumed_at ?? null, null, "consumed_at nulled on INSERT");
  assert.equal(row.consumed_by ?? null, null, "consumed_by nulled on INSERT");
});

test("§3.1 pending→consumed is the ONLY update: consumed_at derived, consumed_by required; revert/re-update/identity/DELETE/TRUNCATE all blocked", async (t) => {
  if (unready(t)) return;
  const { intentId } = await makeConsumableIntent({ sub: W.owner, client: W.client });

  // consumed_by required: an update to consumed WITHOUT consumed_by must fail.
  await assertRaisesOneOf(
    [CLR13, CLR.badRequest, PG.checkViolation],
    () => roleQuery(ROLES.runtime, "update clara.wake_intents set status = 'consumed' where id = $1", [intentId]),
    "consume without consumed_by",
  );

  // The legal transition: pending→consumed with consumed_by; consumed_at derived.
  const consumer = randomUUID();
  const row = await consumeIntent(intentId, consumer);
  assert.ok(row, "pending→consumed succeeded for the runtime lane");
  assert.equal(row.status, "consumed");
  assert.ok(row.consumed_at, "consumed_at derived (now()) by the transition");
  assert.equal(String(row.consumed_by), String(consumer), "consumed_by recorded");

  // consumed→pending (revert) and consumed→consumed (re-update) are blocked.
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.wake_intents set status = 'pending', consumed_at = null, consumed_by = null where id = $1", [intentId]), "consumed→pending revert");
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.wake_intents set consumed_by = $2 where id = $1", [intentId, randomUUID()]), "re-writing consumed_by on a consumed intent");

  // Identity/derivation columns are frozen even while pending.
  const { intentId: p2 } = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.wake_intents set decision = 'ignore' where id = $1", [p2]), "UPDATE decision on a pending intent");
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.wake_intents set firm_id = $2 where id = $1", [p2, randomUUID()]), "UPDATE firm_id on a pending intent");

  // DELETE blocked; TRUNCATE guard stays.
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("delete from clara.wake_intents where id = $1", [p2]), "DELETE wake_intents");
  const te = await truncateGuardError("truncate clara.wake_intents cascade");
  assert.ok(te, "TRUNCATE wake_intents did not silently succeed");
  assert.equal(te.code, CLR.immutable, `TRUNCATE wake_intents → CLR08 (got ${te.code}: ${te.message})`);
});

test("§3.1 column-scoped UPDATE grant: the runtime lane may update only (status, consumed_by) — another column → 42501", async (t) => {
  if (unready(t)) return;
  const { intentId } = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.runtime, "update clara.wake_intents set decision = 'ignore' where id = $1", [intentId]),
    "runtime UPDATE of a non-granted wake_intents column (decision)",
  );
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.runtime, "update clara.wake_intents set event_seq = 999999 where id = $1", [intentId]),
    "runtime UPDATE of a non-granted wake_intents column (event_seq)",
  );
});

// ===========================================================================
// §3.3 — interruption transitions (lifecycle side; governance fns in part 3).
// ===========================================================================

test("§3.3 transitions: pending→expired via the conditional pipe; terminal rows re-transition blocked; lease/delivery columns runtime-only", async (t) => {
  if (unready(t)) return;
  const session = await createChatSession({ firm: W.firm, author: W.owner, visibility: "private" });
  const task = taskIdOf(await beginChatTurn({ session, author: W.owner, turnKey: opk("lc33") }));
  assert.ok(task, "begin_chat_turn yielded a task id");

  // (a) pending→expired: the sweeper's conditional single-statement UPDATE.
  const expired = await insertInterruption({ task, firm: W.firm, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const sweep = await roleQuery(
    ROLES.runtime,
    "update clara.agent_interruptions set status = 'expired' where id = $1 and status = 'pending' and expires_at < clock_timestamp() returning id",
    [expired],
  );
  assert.equal(sweep.rowCount, 1, "the runtime expiry sweep transitions pending→expired");

  // (b) a terminal row cannot go back to pending, nor hop terminal→terminal.
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_interruptions set status = 'pending' where id = $1", [expired]), "expired→pending revert");
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_interruptions set status = 'answered' where id = $1", [expired]), "expired→answered hop");

  // (c) leased delivery (S4-D2): the listener leases a deliverable terminal row,
  //     then marks delivered_at; both are runtime-lane operations.
  const lease = await roleQuery(
    ROLES.runtime,
    `update clara.agent_interruptions
        set claimed_by = 'rig-listener', claim_lease_until = clock_timestamp() + interval '60 seconds'
      where id = $1 and delivered_at is null
        and (claim_lease_until is null or claim_lease_until < clock_timestamp())
      returning claimed_by`,
    [expired],
  );
  assert.equal(lease.rowCount, 1, "the runtime lane leases a deliverable row (claimed_by + claim_lease_until)");
  const delivered = await roleQuery(
    ROLES.runtime,
    "update clara.agent_interruptions set delivered_at = clock_timestamp() where id = $1 and delivered_at is null returning delivered_at",
    [expired],
  );
  assert.equal(delivered.rowCount, 1, "the runtime lane marks delivered_at after resume");

  // (d) the human lane has NO direct UPDATE on interruptions (answers go through
  //     answer_interruption only).
  const p2 = await insertInterruption({ task, firm: W.firm });
  await assertRaises(
    PG.insufficientPrivilege,
    () =>
      roleQuery(ROLES.authenticated, "update clara.agent_interruptions set claimed_by = 'human' where id = $1", [p2]),
    "human direct UPDATE on agent_interruptions",
  );

  // Cap hygiene: free the compute slot for the later tests in this firm.
  await settleChatTurn({ task, tokens: 1, outcome: "completed" });
});

test("§3.3 wait_across_deadline_answer_loses (S4-D5): an answer txn that STARTED pre-deadline but acquires the row post-deadline LOSES", async (t) => {
  if (unready(t)) return;
  const session = await createChatSession({ firm: W.firm, author: W.owner, visibility: "private" });
  const task = taskIdOf(await beginChatTurn({ session, author: W.owner, turnKey: opk("d5") }));
  const expiresAt = new Date(Date.now() + 4000).toISOString();
  const interruption = await insertInterruption({ task, firm: W.firm, expiresAt });

  const out = await answerAcrossDeadline({ interruption, sub: W.owner, expiresAt });
  assert.equal(out.provedBlocked, true, "X7: the answer was PROVEN blocked on the held row lock (pg_blocking_pids)");
  assert.equal(out.txnStartedBeforeDeadline, true, "the answer txn started BEFORE the deadline (else the schedule proves nothing)");
  assert.ok(out.answer && out.answer.ok === false, `the late answer must FAIL (got ${JSON.stringify(out.answer)})`);
  assert.equal(out.answer.code, CLR13, `the late answer loses with CLR13 (got ${out.answer.code}: ${out.answer.message})`);
  const row = await readRow("agent_interruptions", interruption);
  assert.notEqual(row.status, "answered", "the interruption did NOT become answered");

  // Cap hygiene: free the compute slot for the later tests in this firm.
  await settleChatTurn({ task, tokens: 1, outcome: "completed" });
});

// ===========================================================================
// §3.2 — agent_tasks: terminal states terminal; identity immutable.
// ===========================================================================

test("§3.2 terminal tasks are terminal and task identity is immutable (model_snapshot / firm / kind / session / created_by)", async (t) => {
  if (unready(t)) return;
  const session = await createChatSession({ firm: W.firm, author: W.owner, visibility: "private" });
  const task = taskIdOf(await beginChatTurn({ session, author: W.owner, turnKey: opk("term") }));
  await settleChatTurn({ task, tokens: 5, outcome: "completed" });
  assert.equal((await readRow("agent_tasks", task)).status, "completed", "settle landed the terminal status");

  // Terminal → anything is blocked.
  for (const to of ["running", "queued", "cancelled", "awaiting_input"]) {
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set status = $2 where id = $1", [task, to]), `completed→${to}`);
  }

  // Identity columns are immutable — on a terminal AND a live task.
  const live = taskIdOf(await beginChatTurn({ session: await createChatSession({ firm: W.firm, author: W.owner }), author: W.owner, turnKey: opk("live") }));
  for (const id of [task, live]) {
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set model_snapshot = 'forged-model' where id = $1", [id]), "UPDATE model_snapshot (S4-D3: stamped at admission, immutable)");
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set firm_id = $2 where id = $1", [id, randomUUID()]), "UPDATE firm_id");
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set kind = 'wake' where id = $1", [id]), "UPDATE kind");
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set session_id = null where id = $1", [id]), "UPDATE session_id");
    await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.agent_tasks set created_by = $2 where id = $1", [id, randomUUID()]), "UPDATE created_by");
  }

  // Tasks are an audit-grade surface: DELETE must not pass silently.
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("delete from clara.agent_tasks where id = $1", [task]), "DELETE agent_tasks");

  // Cap hygiene: free the live task's compute slot for the later tests.
  await settleChatTurn({ task: live, tokens: 1, outcome: "completed" });
});

// ===========================================================================
// §3.4 — wakes_outbox: held→cancelled only.
// ===========================================================================

test("§3.4 wakes_outbox: rows land held; held→cancelled is the only transition; cancelled→held / identity edits / DELETE blocked", async (t) => {
  if (unready(t)) return;
  const { intentId } = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await consumeIntent(intentId);
  const { id: outboxId, conditionCol } = await insertOutbox({ intent: intentId, firm: W.firm });
  const row = await readRow("wakes_outbox", outboxId);
  assert.equal(row.status, "held", "an outbox row lands status=held");

  // held→cancelled (runtime) is legal.
  const upd = await roleQuery(ROLES.runtime, "update clara.wakes_outbox set status = 'cancelled' where id = $1 and status = 'held' returning status", [outboxId]);
  assert.equal(upd.rowCount, 1, "runtime held→cancelled succeeds");

  // cancelled→held revert blocked; a non-status column is frozen.
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.wakes_outbox set status = 'held' where id = $1", [outboxId]), "cancelled→held revert");
  if (conditionCol) {
    await assertRaisesOneOf([CLR13, CLR.immutable, PG.insufficientPrivilege], () => rootQuery(`update clara.wakes_outbox set ${conditionCol} = 'internal_task' where id = $1`, [outboxId]), "UPDATE the outbox condition");
  }
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("delete from clara.wakes_outbox where id = $1", [outboxId]), "DELETE wakes_outbox");

  // A bogus status value is impossible (CHECK ('held','cancelled')).
  const { intentId: i2 } = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await consumeIntent(i2);
  const { id: o2 } = await insertOutbox({ intent: i2, firm: W.firm });
  await assertRaisesOneOf([PG.checkViolation, CLR13, CLR.immutable], () => rootQuery("update clara.wakes_outbox set status = 'delivered' where id = $1", [o2]), "an out-of-enum outbox status");
  assert.ok((await outboxRowsForIntent(i2)).length >= 1, "the outbox row is linked to its intent");
});

// ===========================================================================
// §3.5 — chat messages: parts immutable; turn_key laws.
// ===========================================================================

test("§3.5 chat messages: parts immutable once written; turn_key NOT NULL for user rows; (session_id, turn_key) unique for user rows", async (t) => {
  if (unready(t)) return;
  const session = await createChatSession({ firm: W.firm, author: W.owner, visibility: "private" });
  const turnKey = opk("msg");
  const task = taskIdOf(await beginChatTurn({ session, author: W.owner, turnKey }));
  await settleChatTurn({ task, tokens: 3, outcome: "completed" });

  const msgs = await readRowsWhere("chat_messages", "session_id", session);
  const userMsg = msgs.find((m) => m.role === "user");
  const asstMsg = msgs.find((m) => m.role === "assistant");
  assert.ok(userMsg, "begin_chat_turn inserted the user message");
  assert.ok(asstMsg, "settle_chat_turn upserted the assistant message");
  assert.equal(userMsg.turn_key, turnKey, "the user row carries its turn_key (§3.5 / S4-ND7)");

  // Parts are immutable (both roles).
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.chat_messages set parts = '[]'::jsonb where id = $1", [userMsg.id]), "UPDATE user message parts");
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("update clara.chat_messages set parts = '[]'::jsonb where id = $1", [asstMsg.id]), "UPDATE assistant message parts");
  await assertRaisesOneOf([CLR13, CLR.immutable], () => rootQuery("delete from clara.chat_messages where id = $1", [userMsg.id]), "DELETE a chat message");

  // turn_key NOT NULL for user rows (conditional constraint → CHECK or trigger).
  await assertRaisesOneOf(
    [PG.checkViolation, "23502", CLR.badRequest, CLR13],
    () => insertMessage({ session, task, role: "user", turnKey: null, author: W.owner, seq: 95001 }),
    "a user message with NULL turn_key",
  );

  // (session_id, turn_key) unique where role='user'.
  await assertRaises(
    PG.uniqueViolation,
    () => insertMessage({ session, task, role: "user", turnKey, author: W.owner, seq: 95002 }),
    "a duplicate (session_id, turn_key) user row",
  );
});
