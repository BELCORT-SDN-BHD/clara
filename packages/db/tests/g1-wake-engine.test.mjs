// Gate G1 — the universal wake-execution engine, DB-half battery. Design of record:
// docs/plan/active/g1-wake-engine-{survey,design,annexes}.md; migration 0133_g1_wake_engine
// (number claimed at merge, hard constraint 10). Cells below mirror Annex D's own numbering (D1-D3, D9) plus the registry
// writer/credential-gate/dead-letter-table cells the design names but does not itself enumerate as
// D-cells. Both-polarity throughout (db-tests.md): every GREEN cell has a RED-first inverted twin.
//
// GATED on clara.wake_engine_sources' existence (never a migration filename/number).
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, humanQuery, assertRaises, opk,
  seedFreshFirm, makeConsumableIntent, insertWakeTask, insertOutbox, driveTaskStatus, readRow,
  insertUser, addMember, cancelAgentTask,
  ROLES, getPool,
} from "./rig-runtime-fixtures.mjs";

// Mirrors packages/runtime/tests/rig.mjs's exported `WAKE_ENGINE_TEST_PREFIX` BY VALUE — a
// literal, not a cross-package import (this package has no dependency edge on @clara/runtime,
// and none is warranted for one shared test string). If the two ever diverge, T1 below reds
// against a genuine runtime fixture row, which is the correct fail-closed direction — see T1's
// own comment for the full cross-package concurrency class this constant exists to carve out.
const WAKE_ENGINE_TEST_PREFIX = "g1_test_";

// T1's own live-roster predicate, hoisted to ONE module-level string (opus review round on PR
// #497, finding D2(i)): T1 and T1-negative-control below both execute THIS EXACT string — never
// two independently-typed copies. Two copies is how a negative control silently stops
// discriminating the moment either one drifts: widen/typo T1's own WHERE clause and a SEPARATE
// literal in the control would still test its own untouched copy, catching nothing.
const T1_LIVE_ROSTER_SQL = `select source_key, carrier, enabled from clara.wake_engine_sources
      where left(source_key, char_length($1)) <> $1
      order by source_key`;

let ready = false;
let SKIPPED = 0;
function skip(t, why) {
  SKIPPED += 1;
  t.skip(why);
}

async function hasG1() {
  const r = await rootQuery("select to_regclass('clara.wake_engine_sources') as t");
  return r.rows[0].t != null;
}

function gate(t) {
  if (!ready) {
    skip(t, "Gate G1 (clara.wake_engine_sources) not applied — battery dormant");
    return true;
  }
  return false;
}

let W = null; // { owner, firm, client, coa } — an ORDINARY tenant fixture, NEVER marked operator
let OP = null; // { owner, firm, client, coa } — the ONE firm this file marks is_operator=true,
// simulating the raw, audited ops ceremony MUST B requires (never an app-facing RPC — the
// migration itself ships ZERO operator firms, T.5c). Mirrors constraint 13: in the real estate
// exactly BELCORT holds this flag; every other firm (ROME PROPERTIES, Alara, Borneo, ...) is a
// resettable, non-operator test fixture — W plays that role here, OP plays BELCORT's role.

before(async () => {
  ready = await hasG1();
  if (!ready) {
    noteLane("Gate G1 surface absent — g1-wake-engine battery skipped whole");
    return;
  }
  // Defensive: a PRIOR partial/aborted run of this file (or a rig re-run) may have left
  // bank_agent enabled — reset to the shipped default before this run's own assertions,
  // which assume the birth state (this file never touches close_prep's flag).
  await rootQuery("update clara.wake_engine_sources set enabled=false, enabled_by=null, enabled_at=null, disabled_by=null, disabled_at=null, disabled_reason=null where source_key='bank_agent'");
  // Defensive (MUST B): uq_firms_one_operator allows AT MOST ONE true across the WHOLE database
  // — a prior partial/aborted run of THIS file may have left its old OP firm marked operator,
  // which would block this run's OWN OP firm from ever being markable. S6 (both legs): SCOPED
  // to this file's own `g1op_` fixture-name prefix — an UNSCOPED estate-wide clear would also
  // silently strip a genuinely-set BELCORT operator flag on a shared/persistent rig (constraint
  // 13's real ceremony fact, not this file's own residue) were one ever present. Only a firm
  // this file itself could have created is ever touched.
  await rootQuery("update clara.firms set is_operator=false where is_operator and name like 'g1op\\_%'");
  W = await seedFreshFirm(`g1_${randomUUID().slice(0, 8)}`, "w");
  OP = await seedFreshFirm(`g1op_${randomUUID().slice(0, 8)}`, "op");
  await rootQuery("update clara.firms set is_operator=true where id=$1", [OP.firm]);
});
after(async () => {
  printLaneNotes("g1-wake-engine");
  console.log(`[g1-wake-engine] skipped: ${SKIPPED}`);
  await endPool();
});

// =====================================================================================
// T1 — the registry table: forced RLS, exactly the two seed rows, both disabled at birth.
// Re-derived FRESH (review law 2/3), never trusted from the migration's own tail notice.
// =====================================================================================
test("T1 wake_engine_sources: forced RLS, exactly bank_agent+close_prep, both enabled=false at birth", async (t) => {
  if (gate(t)) return;
  const rls = (await rootQuery(
    `select relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='wake_engine_sources'`,
  )).rows[0];
  assert.equal(rls.relrowsecurity, true, "T1: RLS enabled");
  assert.equal(rls.relforcerowsecurity, true, "T1: RLS FORCED (binds even the owner's own writes)");
  // Cross-package concurrency carve-out (the #485/#490 class — committed estate-global writes vs
  // an unscoped roster read; both halves must hold): CI's db-estate job runs `pnpm -r
  // --if-present test`, so this package and packages/runtime run CONCURRENTLY against ONE
  // shared postgres — no ordering exists between them. TWO runtime producers register their own
  // synthetic rows into this SAME estate-global table (COMMITTED, never rolled back — see below
  // for why): packages/runtime/tests/wake-engine.test.mjs's own registerSource() (29 call sites)
  // and packages/runtime/tests/g1-wake-bodies.fixtures.mjs's registerSource() (used by
  // g1-wake-bodies.test.mjs's G1B-C1 cell) — a SECOND producer this exclusion originally missed
  // (opus review round on PR #497, finding F1: that file had hand-typed its own `g1b_test_`
  // literal, a silent drift from the first producer's `g1_test_`). Both now key EVERY row under
  // ONE shared, enforced constant — `WAKE_ENGINE_TEST_PREFIX` exported from
  // packages/runtime/tests/rig.mjs — and both registerSource() implementations THROW at
  // registration if a caller's sourceKey does not carry it, so a future drift fails loud on the
  // producing side rather than silently escaping this exclusion again.
  //
  // Why the writes stay committed (never transaction-scoped/rolled back): several
  // wake-engine.test.mjs cells need a row committed by ONE registerSource() call to be visible
  // to a DIFFERENT, later connection. This is not an assumption about connection reuse — the
  // rig's own persona helper (packages/runtime/tests/relay-fixtures.mjs's `withActor`, lines
  // 41-70) does a fresh `pool.connect()` on EVERY call and unconditionally issues `rollback`
  // in its own `finally` before releasing the connection back to the pool — so nothing opened
  // inside one rootQuery/asRuntime call can ever survive un-committed into a later call, on
  // that file or any other. On top of that structural fact, several cells (the M1 skip-locked
  // variant, wake-engine.test.mjs:258-320; `#1(a)`, :335-401; `#1` round-6, :586-671) explicitly
  // open a SECOND, concurrent session specifically to hold a row lock the main flow's own
  // connection must NOT see, proving the interleave by a lock-acquired handshake (a promise that
  // resolves only once the locker's own `select ... for update` has genuinely returned), never a
  // sleep — genuinely multi-session by construction, which a rolled-back fixture would defeat
  // outright.
  //
  // T1's birth-roster proof stays a real closed-world assertion for every OTHER source key: it
  // excludes ONLY the documented, enforced prefix, by exact substring — never widened to a
  // "contains" check (a durable negative control follows this cell, executing this SAME query —
  // T1_LIVE_ROSTER_SQL, hoisted above — to prove two independently-shaped unprefixed third
  // sources are NOT swallowed). This file's own S3 cell below also inserts one row under this
  // same prefix shape (`g1_test_s3_legit_...`) but deletes it immediately after asserting — so
  // this file leaves no residue of its own under the prefix it excludes here, even on a reused DB.
  const rows = (await rootQuery(T1_LIVE_ROSTER_SQL, [WAKE_ENGINE_TEST_PREFIX])).rows;
  assert.deepEqual(rows.map((r) => r.source_key), ["bank_agent", "close_prep"], "T1: exactly these two source keys, closed-world (excluding the documented, enforced runtime concurrency fixture prefix — see comment above)");
  for (const r of rows) assert.equal(r.enabled, false, `T1: ${r.source_key} must ship disabled`);
});

// =====================================================================================
// T1-negative-control (opus review round on PR #497, finding F4; hardened at D2) — a DURABLE
// proof, not PR-body prose, that T1's exclusion above is narrow. Runs T1_LIVE_ROSTER_SQL itself
// — the EXACT same string T1 executes, never a second hand-typed copy (D2(i): two copies is how
// a control stops discriminating the instant either one drifts) — on the SAME client that holds
// the INSERT's own open transaction (D2, coordinator note: a rootQuery read here would go out on
// a DIFFERENT pooled connection and never see the uncommitted rows at all — this would fail
// LOUD, not silently, but only because it happens to be wrong in the discriminating direction).
//
// TWO unprefixed keys, not one (D2(ii)): the reviewer's own mutation table showed a single
// `genuinely_third_source_...` key stays GREEN under several widened (wrong) exclusion
// predicates that would still be dangerous in production — `not like '%test%'` (no "test"
// substring; a hex slice can't produce one), `not like 'g1%'` (doesn't start with "g1"), and a
// shortened constant `'g1'` (same reason). `g1_third_source_test_${uuid}` closes all three:
// `left(key,8)` is `'g1_third'`, distinct from the real prefix `'g1_test_'` so it survives the
// CURRENT correct predicate — but it contains "test", starts with "g1", and starts with the
// shortened `'g1'` too, so any of those three widenings would wrongly swallow it, discriminating
// where the first key alone stayed blind. Both keys are asserted independently; either missing
// is a red naming which mutation shape it caught. Runs inside its own transaction, rolled back —
// neither of this cell's own synthetic rows may ever become residue.
// =====================================================================================
test("T1-negative-control: an UNPREFIXED third source is never excluded by T1's carve-out — the closed-world proof stays narrow", async (t) => {
  if (gate(t)) return;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const keyA = `genuinely_third_source_${randomUUID().slice(0, 8)}`;
    const keyB = `g1_third_source_test_${randomUUID().slice(0, 8)}`;
    for (const key of [keyA, keyB]) {
      await client.query(
        `insert into clara.wake_engine_sources
           (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool)
         values ($1,'wake_outbox','g1.negative.control','wake','proactive','g1TestWorkflow','runtime')`,
        [key],
      );
    }
    const rows = (await client.query(T1_LIVE_ROSTER_SQL, [WAKE_ENGINE_TEST_PREFIX])).rows;
    assert.ok(
      rows.some((r) => r.source_key === keyA),
      "T1-negative-control: the plain unprefixed key is not excluded by T1's own predicate",
    );
    assert.ok(
      rows.some((r) => r.source_key === keyB),
      "T1-negative-control: a key containing 'test' and starting with 'g1' (but NOT the real 'g1_test_' prefix) is not excluded either — catches a widened 'contains test', 'starts with g1', or shortened-constant predicate that the plain key alone would miss",
    );
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
});

// =====================================================================================
// T1b — MUST B: clara.firms.is_operator's shape, re-derived FRESH from the live catalog
// (review law 2/3 — never trusted from the migration's own tail notice). Also proves the
// partial unique index actually BINDS: exactly one firm (OP, this file's own operator-firm
// fixture, set via a raw UPDATE in before() — never an app RPC) carries it.
// =====================================================================================
test("T1b clara.firms.is_operator: boolean NOT NULL DEFAULT false, uq_firms_one_operator enforces at most one true, exactly OP holds it", async (t) => {
  if (gate(t)) return;
  const col = (await rootQuery(
    `select data_type, is_nullable, column_default from information_schema.columns
      where table_schema='clara' and table_name='firms' and column_name='is_operator'`,
  )).rows[0];
  assert.ok(col, "T1b: clara.firms.is_operator column exists");
  assert.equal(col.data_type, "boolean", "T1b: is_operator is boolean");
  assert.equal(col.is_nullable, "NO", "T1b: is_operator is NOT NULL");
  assert.match(col.column_default ?? "", /false/i, "T1b: is_operator defaults false");
  const idx = (await rootQuery(
    `select pg_get_indexdef(indexrelid) as def from pg_index
      where indexrelid = 'clara.uq_firms_one_operator'::regclass`,
  )).rows[0];
  assert.ok(idx, "T1b: uq_firms_one_operator exists");
  assert.match(idx.def, /UNIQUE/i, "T1b: uq_firms_one_operator is a UNIQUE index");
  assert.match(idx.def, /WHERE\s+is_operator/i, "T1b: uq_firms_one_operator is the partial (WHERE is_operator) form — a full unique index would forbid TWO false rows too");
  const operators = (await rootQuery("select id from clara.firms where is_operator")).rows;
  assert.equal(operators.length, 1, "T1b: exactly one firm is marked operator on this rig");
  assert.equal(operators[0].id, OP.firm, "T1b: it is THIS file's own OP fixture (set via raw UPDATE in before(), never an app RPC)");
});

// =====================================================================================
// T2 — set_wake_source_enabled: owner floor enforced, reason required, idempotent replay.
// =====================================================================================
test("T2 set_wake_source_enabled requires OWNER rank — a bookkeeper-rank member of the SAME firm is refused CLR04", async (t) => {
  if (gate(t)) return;
  const bookkeeper = await insertUser(`g1_${randomUUID().slice(0, 8)}`, "t2_bk");
  await addMember(W.owner, { firm: W.firm, user: bookkeeper, role: "bookkeeper", opKey: opk("g1t2-add") });
  const err = await assertRaises(
    "CLR04",
    () => humanQuery(bookkeeper, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "test", opk("g1t2a")]),
    "set_wake_source_enabled as a bookkeeper-rank (below-owner) member",
  );
  assert.match(err.message ?? "", /insufficient role/i, "T2: the refusal names the rank gate, not a different guard");
  // Confirm the row was NOT touched by the refused call.
  const row = (await rootQuery("select enabled from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(row.enabled, false, "T2: a refused non-owner call leaves the registry row untouched");
});

// =====================================================================================
// T2z — MUST B (opus/Codex review): owner rank alone is NECESSARY but NOT SUFFICIENT.
// W is an ordinary tenant fixture (never marked is_operator) — its OWNER, at full owner
// rank, is STILL refused. This is the cross-tenant probe MUST B asked for: it proves that
// ANY tenant firm's owner (a real firm's owner, or a resettable test fixture's like Alara's
// or Borneo's — constraint 13) cannot reach this estate-global switch merely by being an
// owner somewhere. Only the flag on clara.firms — set by a raw, audited ops act, never an
// app RPC — grants the door (T.5c; OP, this file's operator-firm fixture, holds it below).
// =====================================================================================
test("T2z set_wake_source_enabled refuses an OWNER-rank member of a NON-operator firm — CLR04, the operator-only door, not the rank gate", async (t) => {
  if (gate(t)) return;
  const err = await assertRaises(
    "CLR04",
    () => humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "cross-tenant probe", opk("g1t2z")]),
    "set_wake_source_enabled as a full OWNER-rank member of a firm that is not the operator firm",
  );
  assert.match(err.message ?? "", /operator firm/i, "T2z: the refusal names the OPERATOR-firm gate specifically, not the rank gate (owner rank was satisfied)");
  const row = (await rootQuery("select enabled from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(row.enabled, false, "T2z: a refused non-operator-firm call leaves the registry row untouched");
});

test("T2b a blank reason is refused CLR10; a real reason FLIPS the row and stamps enabled_by/enabled_at (called as the OPERATOR firm's owner — MUST B)", async (t) => {
  if (gate(t)) return;
  const blank = await assertRaises(
    "CLR10",
    () => humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "", opk("g1t2b-blank")]),
    "set_wake_source_enabled with a blank reason",
  );
  assert.match(blank.message ?? "", /reason/i, "T2b: the refusal names the missing reason");

  const before1 = (await rootQuery("select enabled, enabled_by, enabled_at from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(before1.enabled, false, "mandatory setup: bank_agent starts disabled");

  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b enable", opk("g1t2b-on")]);
  const after1 = (await rootQuery("select enabled, enabled_by, enabled_at from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(after1.enabled, true, "T2b: enabled flips true");
  assert.equal(after1.enabled_by, OP.owner, "T2b: enabled_by stamps the calling (operator-firm) owner");
  assert.ok(after1.enabled_at, "T2b: enabled_at is stamped");

  // Idempotent replay: the SAME op_key (captured ONCE — opk() mints a fresh string per call,
  // so re-calling opk() would test two DIFFERENT keys, not a replay) returns the SAME receipt
  // without re-auditing.
  const auditBefore = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled' and firm_id=$1",
    [OP.firm],
  )).rows[0].n;
  const replayKey = opk("g1t2b-replay");
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b replay", replayKey]);
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b replay", replayKey]);
  const auditAfter = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled' and firm_id=$1",
    [OP.firm],
  )).rows[0].n;
  assert.equal(auditAfter, auditBefore + 1, "T2b: the SAME op_key replayed is a pure dedupe — exactly one new audit row for two calls");

  // Disable it again for the cells below (D4-adjacent hygiene): a disabled source is the
  // baseline every OTHER cell in this file assumes.
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "g1 battery T2b cleanup", opk("g1t2b-off")]);
  const disabled = (await rootQuery("select enabled, disabled_by, disabled_reason from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(disabled.enabled, false, "T2b: re-disable flips back false");
  assert.equal(disabled.disabled_by, OP.owner, "T2b: disabled_by stamps the calling (operator-firm) owner");
  assert.equal(disabled.disabled_reason, "g1 battery T2b cleanup", "T2b: disabled_reason is the given reason");
});

test("T2c an unknown source_key is refused CLR10 (called as the OPERATOR firm's owner, past the operator gate — MUST B)", async (t) => {
  if (gate(t)) return;
  const err = await assertRaises(
    "CLR10",
    () => humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["not_a_real_source", true, "x", opk("g1t2c")]),
    "set_wake_source_enabled on an unregistered source_key",
  );
  assert.match(err.message ?? "", /unknown/i, "T2c: the refusal names the unknown source");
});

// =====================================================================================
// D1 — held->running is the ONLY new legal claim leg; held->completed is a direct jump the
// matrix never admits (RED-first).
// =====================================================================================
test("D1 held->running succeeds; held->completed directly (skipping running) raises CLR13", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });

  await driveTaskStatus(task, ["running"]);
  const row1 = await readRow("agent_tasks", task);
  assert.equal(row1.status, "running", "D1: held->running is the new legal claim leg");

  const intent2 = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent2.intentId);
  const task2 = await insertWakeTask({ intent: intent2.intentId, firm: intent2.firm, status: "held" });
  await assertRaises("CLR13", () => driveTaskStatus(task2, ["completed"]), "a FRESH held row driven straight to completed, skipping running");
  const row2 = await readRow("agent_tasks", task2);
  assert.equal(row2.status, "held", "D1 RED-first: the illegal held->completed jump left the row's real status UNCHANGED");
});

async function require_consumeIntent(intentId) {
  await rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1 and status='pending'", [intentId, randomUUID()]);
}

// =====================================================================================
// D2 — running->cancel_requested->cancelled is reachable; running->cancelled DIRECTLY
// (skipping cancel_requested) raises CLR13 (RED-first).
// =====================================================================================
test("D2 running->cancel_requested->cancelled succeeds in sequence; running->cancelled directly raises CLR13", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });
  await driveTaskStatus(task, ["running"]);

  await driveTaskStatus(task, ["cancel_requested", "cancelled"]);
  const row1 = await readRow("agent_tasks", task);
  assert.equal(row1.status, "cancelled", "D2: the two-step cancel chain succeeds");

  const task2Setup = await (async () => {
    const i2 = await makeConsumableIntent({ sub: W.owner, client: W.client });
    await require_consumeIntent(i2.intentId);
    const t2 = await insertWakeTask({ intent: i2.intentId, firm: i2.firm, status: "held" });
    await driveTaskStatus(t2, ["running"]);
    return t2;
  })();
  await assertRaises("CLR13", () => driveTaskStatus(task2Setup, ["cancelled"]), "running->cancelled directly, skipping cancel_requested");
  const row2 = await readRow("agent_tasks", task2Setup);
  assert.equal(row2.status, "running", "D2 RED-first: the illegal direct jump left the row UNCHANGED");
});

// =====================================================================================
// D3 — _settle_wake_task writes BOTH projections in one call; a re-settle (crash-recovery
// replay) is idempotent, never a raise.
// =====================================================================================
test("D3 _settle_wake_task settles agent_tasks AND flips wakes_outbox to 'settled' together; a replay is a no-op, never a raise", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });
  await driveTaskStatus(task, ["running"]);

  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [task, "completed", null]);
  const taskRow = await readRow("agent_tasks", task);
  assert.equal(taskRow.status, "completed", "D3: the task settles to the given outcome");
  const outboxRow = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(outboxRow.status, "settled", "D3: the SAME call flips the paired wakes_outbox row to 'settled'");

  // Idempotent replay: settling the SAME task again must NOT raise (the update affects the
  // task row 0 times since it is no longer kind='wake' AND status-filtered... actually the
  // verb filters on kind='wake' only, not status, so a re-settle re-writes the SAME outcome —
  // proven a no-op on the OUTBOX half, which is the crash-recovery-critical one).
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [task, "completed", null]);
  const outboxRow2 = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(outboxRow2.status, "settled", "D3: a replayed settle is idempotent — still 'settled', no raise");
});

test("D3b unknown outcome is refused CLR10; settling a non-existent/non-wake task is refused CLR10", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await driveTaskStatus(task, ["running"]);
  await assertRaises("CLR10", () => rootQuery("select clara._settle_wake_task($1,$2,$3)", [task, "bogus_outcome", null]), "an unknown outcome");
  await assertRaises("CLR10", () => rootQuery("select clara._settle_wake_task($1,$2,$3)", [randomUUID(), "completed", null]), "a non-existent task id");
});

// =====================================================================================
// mint_wake_credential — close_prep is now mintable end-to-end: the EARLY gate (the
// ANNEX-B CORRECTION) AND the per-kind arm both admit it.
// =====================================================================================
test("mint_wake_credential(close_prep, ...) mints for a firm-congruent active client with no on_behalf_of", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    ["close_prep", W.firm, null, W.client],
  );
  assert.ok(r.rows[0].credential_id, "mint_wake_credential(close_prep) returns a credential id — the early-gate fix + the new arm both fired");
  const row = (await rootQuery("select wake_kind, client_id, on_behalf_of from clara.wake_credentials where id=$1", [r.rows[0].credential_id])).rows[0];
  assert.equal(row.wake_kind, "close_prep");
  assert.equal(row.client_id, W.client);
  assert.equal(row.on_behalf_of, null, "law 68: the clocked lane's on_behalf_of is structurally NULL");
});

test("mint_wake_credential(close_prep, ...) refuses an on_behalf_of (CLR10) and a missing client (CLR10)", async (t) => {
  if (gate(t)) return;
  const withObo = await assertRaises(
    "CLR10",
    () => rootQuery("select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)", ["close_prep", W.firm, W.owner, W.client]),
    "close_prep mint carrying an on_behalf_of",
  );
  assert.match(withObo.message ?? "", /on_behalf_of/i);
  const noClient = await assertRaises(
    "CLR10",
    () => rootQuery("select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)", ["close_prep", W.firm, null, null]),
    "close_prep mint with no client",
  );
  assert.match(noClient.message ?? "", /client/i);
});

// =====================================================================================
// D9 — THE STRANDED-ROW CURE, BOTH DIRECTIONS. (a) a held row that predates any source
// registering/enabling is left EXACTLY as it was by the migration (proven at the migration
// tail — restated here as a live re-derivation). (b) THE CURE ITSELF: that SAME shape of row
// can now be legally driven held->running->completed by the new matrix, with its wakes_outbox
// twin settling in the SAME call — the disposition that was previously unreachable.
// =====================================================================================
test("D9 the cure: a held wake row (the pre-existing shape) is legally claimable end-to-end — held->running->completed, wakes_outbox settles in step", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });

  // (a) freshly held — untouched, visible, exactly the pre-cure shape.
  const born = await readRow("agent_tasks", task);
  assert.equal(born.status, "held", "mandatory setup: born held, exactly the stranded-row shape");
  const bornOutbox = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(bornOutbox.status, "held", "mandatory setup: its outbox twin is also held");

  // (b) THE CURE: what an enabled engine's own claim + a workflow's own terminal settle would
  // do — held->running (the claim), then _settle_wake_task (the settlement path), all through
  // the LEGAL matrix this gate's migration ships. No special "backfill" path — the disposition
  // is finally reachable through the ordinary transition legs.
  await driveTaskStatus(task, ["running"]);
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [task, "completed", null]);

  const settled = await readRow("agent_tasks", task);
  assert.equal(settled.status, "completed", "D9 cure: the previously-stranded shape now reaches a REAL terminal state");
  const settledOutbox = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(settledOutbox.status, "settled", "D9 cure: the wakes_outbox twin settles IN STEP with the task, one verb, one transaction");
});

// =====================================================================================
// wake_engine_task_dead_letters — the direct_queue carrier's own dead-letter home (Annex D8).
// =====================================================================================
test("wake_engine_task_dead_letters: stamps firm_id from the task, allowlists status/attempt_count/resolved_at, refuses DELETE", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });

  const ins = await rootQuery(
    "insert into clara.wake_engine_task_dead_letters (consumer, task_id, reason) values ($1,$2,$3) returning firm_id, attempt_count, status",
    ["wake_engine", task, "battery-seeded poison"],
  );
  assert.equal(ins.rows[0].firm_id, intent.firm, "the stamping trigger derives firm_id from the referenced task, not a caller-supplied value");
  assert.equal(ins.rows[0].attempt_count, 1);
  assert.equal(ins.rows[0].status, "pending");

  // Allowlisted column changes.
  await rootQuery("update clara.wake_engine_task_dead_letters set attempt_count=2, status='resolved', resolved_at=now() where consumer=$1 and task_id=$2", ["wake_engine", task]);

  // A frozen-identity column change is refused CLR08.
  await assertRaises(
    "CLR08",
    () => rootQuery("update clara.wake_engine_task_dead_letters set reason='rewritten' where consumer=$1 and task_id=$2", ["wake_engine", task]),
    "changing `reason` on an existing dead-letter row",
  );

  // DELETE is refused CLR08.
  await assertRaises(
    "CLR08",
    () => rootQuery("delete from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2", ["wake_engine", task]),
    "DELETE on wake_engine_task_dead_letters",
  );
});

// =====================================================================================
// wakes_outbox's CHECK admits exactly {held,cancelled,settled} — read FRESH from the live
// catalog (never trusted from the migration's own tail notice, review law 2/3). A foreign
// status value is unreachable through UPDATE at all: the BEFORE-trigger's own guard is
// STRICTER than the CHECK and fires first (Postgres runs BEFORE ROW triggers before CHECK
// constraints), raising CLR08 before the CHECK ever gets a chance — proven as its own
// (positive) cell below, not assumed.
// =====================================================================================
test("wakes_outbox status CHECK, read fresh, admits exactly held/cancelled/settled and nothing else", async (t) => {
  if (gate(t)) return;
  const def = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.wakes_outbox'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%'`,
  )).rows[0].def;
  const listed = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  assert.deepEqual(new Set(listed), new Set(["held", "cancelled", "settled"]), `wakes_outbox status CHECK: ${def}`);
});

test("wakes_outbox: a foreign status value is refused by the TRIGGER (CLR08) before the CHECK ever runs — the trigger is the reachable wall", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });
  const err = await assertRaises(
    "CLR08",
    () => rootQuery("update clara.wakes_outbox set status='bogus' where intent_id=$1", [intent.intentId]),
    "an out-of-CHECK status value via UPDATE",
  );
  assert.match(err.message ?? "", /illegal wakes_outbox transition/i);
});

// =====================================================================================
// MUST A (opus/Codex review) — cancelling a RUNNING wake task must never diverge the two
// projections. Pre-fix: the outbox cascade fired unconditionally on t.kind='wake', so a
// cancel-REQUEST on a running task immediately terminal-ized the outbox row while the task
// itself stayed non-terminal — proven live by the reviewer through this exact door.
// =====================================================================================
test("MUST A: cancelling a RUNNING wake task leaves the outbox row 'held' (a REQUEST, not a settle); a later completion settles both projections together, never diverging", async (t) => {
  if (gate(t)) return;
  const intent = await makeConsumableIntent({ sub: W.owner, client: W.client });
  await require_consumeIntent(intent.intentId);
  const task = await insertWakeTask({ intent: intent.intentId, firm: intent.firm, status: "held" });
  await insertOutbox({ intent: intent.intentId, firm: intent.firm });
  await driveTaskStatus(task, ["running"]);

  const before = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(before.status, "held", "mandatory setup: outbox starts held while the task runs");

  const result = await cancelAgentTask(W.owner, { task, opKey: opk("g1-musta-cancel") });
  assert.equal(result.status, "cancel_requested", "MUST A: a RUNNING wake task's cancel is a REQUEST, not an immediate terminal");

  const afterCancel = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(afterCancel.status, "held", "MUST A: the outbox projection is NOT prematurely terminal-ized by a cancel REQUEST — the pre-fix bug set this to 'cancelled' here");

  // The in-flight workflow finishes anyway (a cancel is a request, never a guarantee) — settle
  // through the REAL settlement path and prove BOTH projections land together, never diverging.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [task, "completed", null]);
  const taskRow = await readRow("agent_tasks", task);
  assert.equal(taskRow.status, "completed", "MUST A: the task settles to its real outcome");
  const outboxRow = (await rootQuery("select status from clara.wakes_outbox where intent_id=$1", [intent.intentId])).rows[0];
  assert.equal(outboxRow.status, "settled", "MUST A: the outbox settles IN STEP — task=completed, outbox=settled, never task=completed/outbox=cancelled (the pre-fix permanent divergence)");
});

// =====================================================================================
// MUST B (opus/Codex review) — _settle_wake_task must settle a direct_queue (close_prep) task
// too, not just kind='wake'. Pre-fix: the literal `kind = 'wake'` filter never matched a
// close_prep row, so v_intent stayed null and every close_prep settle raised CLR10 — which,
// chained through reconciler-wake.mjs's own cancel repair, converted a recoverable running row
// into a permanently stranded cancel_requested one.
// =====================================================================================
test("MUST B: _settle_wake_task settles a direct_queue (close_prep) task — no wakes_outbox row exists or is touched, GET DIAGNOSTICS never conflates a structural NULL origin_intent_id with 'no such task'", async (t) => {
  if (gate(t)) return;
  const task = await rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [W.firm, W.client],
  );
  const taskId = task.rows[0].id;
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const preRow = await readRow("agent_tasks", taskId);
  assert.equal(preRow.origin_intent_id, null, "mandatory setup: a close_prep task carries NO origin_intent_id (Annex B — direct_queue rides no wake_intent)");

  // MUST B: this used to raise CLR10 'no wake task % to settle' unconditionally.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "completed", null]);
  const settled = await readRow("agent_tasks", taskId);
  assert.equal(settled.status, "completed", "MUST B: a close_prep (direct_queue) task settles through the SAME verb a wake task uses");

  // A SECOND settle (crash-recovery replay shape) must stay idempotent, never raise, even though
  // v_intent is structurally null on every close_prep row (never "zero rows matched").
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "completed", null]);
  const replayed = await readRow("agent_tasks", taskId);
  assert.equal(replayed.status, "completed", "MUST B: a replayed close_prep settle is idempotent — no raise, no wakes_outbox touch attempted");
});

test("NOTE C: a re-settle replay with a null error_code never ERASES an earlier real error_code", async (t) => {
  if (gate(t)) return;
  const task = await rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [W.firm, W.client],
  );
  const taskId = task.rows[0].id;
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", "internal"]);
  const first = await readRow("agent_tasks", taskId);
  assert.equal(first.error_code, "internal", "mandatory setup: the first settle stamps a real error_code");

  // A replay carrying a null error_code (a caller that does not re-derive the original code)
  // must NOT blank it out — NOTE C's own finding, probed live pre-fix.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", null]);
  const replayed = await readRow("agent_tasks", taskId);
  assert.equal(replayed.error_code, "internal", "NOTE C: error_code survives a null-carrying replay — coalesce, never overwrite");
});

// =====================================================================================
// S2 (both legs) — widens NOTE C: a plain coalesce() over-corrected in TWO ways a plain
// null-replay test alone never caught. Both polarities, both proven live.
// =====================================================================================
test("S2 (a): FIRST-WRITE-WINS — a LATER replay carrying a DIFFERENT non-null error_code must NOT overwrite the first cause", async (t) => {
  if (gate(t)) return;
  const task = await rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [W.firm, W.client],
  );
  const taskId = task.rows[0].id;
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", "internal"]);
  assert.equal((await readRow("agent_tasks", taskId)).error_code, "internal", "mandatory setup: the first settle stamps 'internal'");

  // A plain coalesce() would have picked THIS non-null value and clobbered the first cause —
  // that is exactly the bug S2 closes: only the FIRST non-null write may ever land.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "failed", "timeout"]);
  const after = await readRow("agent_tasks", taskId);
  assert.equal(after.error_code, "internal", "S2(a): a LATER replay's DIFFERENT error_code ('timeout') must be discarded — the FIRST cause ('internal') is the one that survives, forever");
});

test("S2 (b): GUARD COMPLETED — a 'completed' outcome NEVER carries an error_code, even if one is (erroneously) passed", async (t) => {
  if (gate(t)) return;
  const task = await rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [W.firm, W.client],
  );
  const taskId = task.rows[0].id;
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  // A caller bug (or a stale retry racing a real success) passes a stray error_code alongside
  // a 'completed' outcome — the settle verb must refuse to let it land regardless.
  await rootQuery("select clara._settle_wake_task($1,$2,$3)", [taskId, "completed", "stray_error_that_must_never_land"]);
  const row = await readRow("agent_tasks", taskId);
  assert.equal(row.status, "completed");
  assert.equal(row.error_code, null, "S2(b): 'completed' NEVER carries an error_code — a plain coalesce()/first-write-wins alone would have let this stray value land on an otherwise-successful task");
});

test("S3: wake_engine_sources.task_kind refuses an out-of-domain value (e.g. 'autodraft') — _settle_wake_task can never be handed authority over a kind it does not own", async (t) => {
  if (gate(t)) return;
  const err = await assertRaises(
    "23514", // Postgres CHECK-violation SQLSTATE — this is a raw catalog wall, not a CLRxx application refusal
    () => rootQuery(
      `insert into clara.wake_engine_sources (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool)
         values ($1,'direct_queue',null,'autodraft','proactive','g1TestWorkflow','runtime')`,
      [`${WAKE_ENGINE_TEST_PREFIX}s3_${randomUUID().slice(0, 8)}`],
    ),
    "registering a wake_engine_sources row with task_kind='autodraft' (out of the wake-owned domain)",
  );
  assert.match(err.message ?? "", /ck_wes_task_kind_wake_owned/i, "S3: the refusal names the S3 wall specifically");
  // (the refused INSERT above never commits a row — Postgres rolls back the whole statement on
  // the CHECK violation — so there is nothing of ITS OWN to clean up here.)

  // The two LEGITIMATE values are unaffected.
  const legitKey = `${WAKE_ENGINE_TEST_PREFIX}s3_legit_${randomUUID().slice(0, 8)}`;
  try {
    const legit = await rootQuery(
      `insert into clara.wake_engine_sources (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool)
         values ($1,'direct_queue',null,'close_prep','close_prep','g1TestWorkflow','runtime') returning task_kind`,
      [legitKey],
    );
    assert.equal(legit.rows[0].task_kind, "close_prep", "S3: the wall admits the real, legitimate direct_queue kind without friction");
  } finally {
    // Cleanup (opus review round on PR #497, finding F3): this row DOES commit (unlike the
    // refused one above), and it happens to carry the same documented prefix T1 excludes — left
    // uncleaned, it is residue this file's OWN test leaves behind on a reused DB, silently
    // swallowed by T1's carve-out along with the genuine runtime fixture rows the carve-out
    // exists for. Delete it here, immediately, the same discipline wake-engine.test.mjs's own
    // after() applies to its rows — this cell is the only writer of this exact key.
    await rootQuery("delete from clara.wake_engine_sources where source_key=$1", [legitKey]);
  }
});

// =====================================================================================
// MUST D (opus/Codex review) — the estate-wide switch broadcasts a receipt to every OTHER
// firm's own audit_log, so a tenant firm can discover its automation posture changed even
// though only the OPERATOR firm can ever flip it (T2z proves the flip itself refuses).
// =====================================================================================
test("MUST D: set_wake_source_enabled broadcasts an estate-wide receipt into every OTHER firm's own audit_log — W (a non-operator, non-acting firm) gets one, OP's own op-key-scoped receipt is unaffected", async (t) => {
  if (gate(t)) return;
  const before = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1",
    [W.firm],
  )).rows[0].n;

  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "MUST D receipt probe", opk("g1-mustd-on")]);
  const afterOn = (await rootQuery(
    "select firm_id, actor, args from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1 order by id desc limit 1",
    [W.firm],
  )).rows[0];
  assert.ok(afterOn, "MUST D: W's OWN audit_log gained a receipt row, though W never called this function and never could (T2z)");
  assert.equal(afterOn.args.source, "bank_agent");
  assert.equal(afterOn.args.on, true);

  const afterCount = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1",
    [W.firm],
  )).rows[0].n;
  assert.equal(afterCount, before + 1, "MUST D: exactly one new receipt row landed in W's audit_log for this flip");

  // Cleanup for hygiene (matches T2b's own convention) — restore the birth default.
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "MUST D receipt probe cleanup", opk("g1-mustd-off")]);
});

// =====================================================================================
// M3 (Codex MUST / opus NOTE-4, folded into MUST D) — the FIRST draft of the estate-wide
// broadcast leaked the operator's user uuid, the operator firm's own uuid, and an unbounded
// free-text reason into EVERY other firm's bookkeeper-readable audit_log, and amplified
// arbitrarily on repeated no-op flips (a DIFFERENT op_key re-asserting the SAME already-current
// state is not caught by _reserve_op's replay dedup). Two cells: payload minimality/actor
// nulling, and no-op non-amplification.
// =====================================================================================
test("M3: the broadcast payload carries ONLY {source, on} — no reason, no operator-firm uuid, no operator-user uuid (actor is NULL)", async (t) => {
  if (gate(t)) return;
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "M3 payload-minimality probe — this exact reason text must NEVER appear in any other firm's audit_log", opk("g1-m3-payload-on")]);
  const row = (await rootQuery(
    "select actor, args from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1 order by id desc limit 1",
    [W.firm],
  )).rows[0];
  assert.ok(row, "mandatory setup: W's audit_log gained the receipt");
  assert.equal(row.actor, null, "M3: actor is NULL on the broadcast copy — a receiving firm has no legitimate need to know WHICH operator-firm user acted");
  assert.deepEqual(Object.keys(row.args).sort(), ["on", "source"], "M3: the payload carries EXACTLY {source, on} — closed-world, nothing else");
  assert.equal(row.args.reason, undefined, "M3: the free-text reason never lands in another firm's audit_log");
  assert.equal(row.args.set_by_operator_firm, undefined, "M3: the operator firm's own uuid never lands in another firm's audit_log");

  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "M3 payload-minimality probe cleanup", opk("g1-m3-payload-off")]);
});

test("M3: a repeated NO-OP flip (a DIFFERENT op_key re-asserting the SAME already-current state) does NOT amplify — zero new broadcast rows", async (t) => {
  if (gate(t)) return;
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "M3 no-op probe: first real flip", opk("g1-m3-noop-on1")]);
  const afterFirstFlip = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1",
    [W.firm],
  )).rows[0].n;

  // Re-assert the SAME state (already true) THREE more times, each with a genuinely DIFFERENT
  // op_key — _reserve_op's replay dedup does not catch this (different op_keys are different
  // "operations" to that ledger); only the M3 state-change check must suppress the broadcast.
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "M3 no-op probe: repeat 1", opk("g1-m3-noop-on2")]);
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "M3 no-op probe: repeat 2", opk("g1-m3-noop-on3")]);
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "M3 no-op probe: repeat 3", opk("g1-m3-noop-on4")]);
  const afterNoops = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1",
    [W.firm],
  )).rows[0].n;
  assert.equal(afterNoops, afterFirstFlip, "M3: three genuinely-distinct-op_key no-op re-assertions of the SAME state broadcast ZERO new rows — the pre-fix version amplified every OTHER firm's audit_log arbitrarily here");

  // A REAL flip (the state actually changes) still broadcasts exactly one.
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "M3 no-op probe: real flip back off", opk("g1-m3-noop-off")]);
  const afterRealFlip = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled_estate_notice' and firm_id=$1",
    [W.firm],
  )).rows[0].n;
  assert.equal(afterRealFlip, afterFirstFlip + 1, "M3: a GENUINE state change still broadcasts exactly one new row — the fix suppresses no-ops only, never a real transition");
});

// =====================================================================================
// N1 (round-5, opus NOTE) — #2's advisory-lock fix (round-4) spans TWO files: the runtime
// claim path (packages/runtime/lib/wake-engine.mjs) and this migration's own
// set_wake_source_enabled body, each independently spelling the SAME key expression
// ('wake_source_gate:' || source_key). Review law 3 (spelling is not identity) applies
// directly: nothing short of PROVING the two sides actually contend on the SAME lock confirms
// they didn't drift apart (a typo'd prefix on either side would silently degrade #2 back to
// the unlocked race it was meant to close, with no test ever failing). Two real sessions,
// PROVEN blocked via pg_blocking_pids (never a sleep, which proves nothing about whether the
// interleave actually happened — db-tests.md's own standing law).
// =====================================================================================
async function pollBlockedByOrThrow(blockedPid, blockerPid, { timeoutMs = 5000, intervalMs = 25, what = "the lock" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [blockedPid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`pollBlockedByOrThrow: backend ${blockedPid} never observably blocked on ${what} (held by ${blockerPid}) within ${timeoutMs}ms`);
}

test("N1: the runtime's own JS-side advisory-lock key literal is the IDENTICAL lock set_wake_source_enabled's SQL-side takes — proven by a real cross-session block, not string comparison", async (t) => {
  if (gate(t)) return;
  const sourceKey = "bank_agent"; // a real, already-registered source_key -- no synthetic registration needed for a lock-identity probe

  // Hold the EXACT expression wake-engine.mjs's own claim path uses, verbatim, on a raw
  // connection: `select pg_advisory_xact_lock(hashtext($1)::bigint)` keyed on
  // `wake_source_gate:${sourceKey}`.
  const c1 = await getPool().connect();
  let releaseHolder;
  const holderShouldRelease = new Promise((resolve) => { releaseHolder = resolve; });
  let holderPid;
  const holderTxn = (async () => {
    await c1.query("begin");
    holderPid = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_source_gate:${sourceKey}`]);
    await holderShouldRelease;
    await c1.query("rollback");
  })();
  // Wait for the holder to actually report its own pid (cheap, deterministic — the SELECT
  // pg_backend_pid() above always returns immediately, well before the lock acquisition
  // itself, which is instant here anyway since nothing else holds it yet).
  while (holderPid === undefined) await new Promise((r) => setTimeout(r, 5));

  // set_wake_source_enabled, called normally (as the real operator-firm owner) — if the
  // migration's own key expression genuinely matches the runtime's, this call must BLOCK
  // behind holderPid.
  const c2 = await getPool().connect();
  let callerPid;
  const callerDone = (async () => {
    await c2.query(`set role ${ROLES.authenticated}`);
    // is_local=false (SESSION-scoped, matching withActor's own non-transaction `asHuman` shape)
    // -- this connection never opens an explicit `begin`, so an is_local=true (transaction-
    // scoped) config would vanish the instant this single autocommit statement ends, leaving
    // the very next statement (the set_wake_source_enabled call below) with no actor at all.
    await c2.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OP.owner, role: "authenticated" })]);
    callerPid = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    return c2.query("select clara.set_wake_source_enabled($1,$2,$3,$4)", [sourceKey, true, "N1 lock-identity probe", opk("g1-n1-lock-identity")]);
  })();
  while (callerPid === undefined) await new Promise((r) => setTimeout(r, 5));

  try {
    await pollBlockedByOrThrow(callerPid, holderPid, { what: "the #2 advisory lock (wake_source_gate:bank_agent)" });
  } finally {
    releaseHolder();
    await holderTxn;
    await callerDone.catch(() => {}); // whatever it settles to, we only needed the block proof above
    try {
      await c2.query("rollback");
    } catch {
      /* no open txn on a bare autocommit statement */
    }
    await c2.query("reset role").catch(() => {});
    await c2.query("reset all").catch(() => {});
    c1.release();
    c2.release();
  }

  // Cleanup: bank_agent's own enabled state may have flipped true above (or not, depending on
  // whether callerDone's own call actually landed vs raced with cleanup) — restore false, the
  // seed's own birth default, unconditionally.
  await humanQuery(OP.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "N1 cleanup", opk("g1-n1-cleanup")]);
});
