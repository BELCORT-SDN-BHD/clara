// Gate G1 — the universal wake-execution engine, DB-half battery. Design of record:
// docs/plan/active/g1-wake-engine-{survey,design,annexes}.md; migration UNNUMBERED_g1_wake_engine
// (numbered at merge). Cells below mirror Annex D's own numbering (D1-D3, D9) plus the registry
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
  insertUser, addMember,
} from "./rig-runtime-fixtures.mjs";

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

let W = null; // { owner, firm, client, coa }

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
  W = await seedFreshFirm(`g1_${randomUUID().slice(0, 8)}`, "w");
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
  const rows = (await rootQuery("select source_key, carrier, enabled from clara.wake_engine_sources order by source_key")).rows;
  assert.deepEqual(rows.map((r) => r.source_key), ["bank_agent", "close_prep"], "T1: exactly these two source keys, closed-world");
  for (const r of rows) assert.equal(r.enabled, false, `T1: ${r.source_key} must ship disabled`);
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

test("T2b a blank reason is refused CLR10; a real reason FLIPS the row and stamps enabled_by/enabled_at", async (t) => {
  if (gate(t)) return;
  const blank = await assertRaises(
    "CLR10",
    () => humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "", opk("g1t2b-blank")]),
    "set_wake_source_enabled with a blank reason",
  );
  assert.match(blank.message ?? "", /reason/i, "T2b: the refusal names the missing reason");

  const before1 = (await rootQuery("select enabled, enabled_by, enabled_at from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(before1.enabled, false, "mandatory setup: bank_agent starts disabled");

  await humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b enable", opk("g1t2b-on")]);
  const after1 = (await rootQuery("select enabled, enabled_by, enabled_at from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(after1.enabled, true, "T2b: enabled flips true");
  assert.equal(after1.enabled_by, W.owner, "T2b: enabled_by stamps the calling owner");
  assert.ok(after1.enabled_at, "T2b: enabled_at is stamped");

  // Idempotent replay: the SAME op_key (captured ONCE — opk() mints a fresh string per call,
  // so re-calling opk() would test two DIFFERENT keys, not a replay) returns the SAME receipt
  // without re-auditing.
  const auditBefore = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled' and firm_id=$1",
    [W.firm],
  )).rows[0].n;
  const replayKey = opk("g1t2b-replay");
  await humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b replay", replayKey]);
  await humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", true, "g1 battery T2b replay", replayKey]);
  const auditAfter = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_wake_source_enabled' and firm_id=$1",
    [W.firm],
  )).rows[0].n;
  assert.equal(auditAfter, auditBefore + 1, "T2b: the SAME op_key replayed is a pure dedupe — exactly one new audit row for two calls");

  // Disable it again for the cells below (D4-adjacent hygiene): a disabled source is the
  // baseline every OTHER cell in this file assumes.
  await humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["bank_agent", false, "g1 battery T2b cleanup", opk("g1t2b-off")]);
  const disabled = (await rootQuery("select enabled, disabled_by, disabled_reason from clara.wake_engine_sources where source_key='bank_agent'")).rows[0];
  assert.equal(disabled.enabled, false, "T2b: re-disable flips back false");
  assert.equal(disabled.disabled_by, W.owner, "T2b: disabled_by stamps the calling owner");
  assert.equal(disabled.disabled_reason, "g1 battery T2b cleanup", "T2b: disabled_reason is the given reason");
});

test("T2c an unknown source_key is refused CLR10", async (t) => {
  if (gate(t)) return;
  const err = await assertRaises(
    "CLR10",
    () => humanQuery(W.owner, "select clara.set_wake_source_enabled($1,$2,$3,$4)", ["not_a_real_source", true, "x", opk("g1t2c")]),
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
