// Gate G1 — the wake-execution engine's RUNTIME-half battery, against the throwaway DB.
// Design of record: docs/plan/active/g1-wake-engine-{survey,design,annexes}.md. Mirrors
// wave-a-autodraft-db.test.mjs's own shape (real rig, onlyFirm-scoped, planted rows, injected
// enqueue/getRun) — never a mock pg client for the DB-dependent cells (that lane belongs to a
// pure-logic unit-test file this design does not need, since wake-engine.mjs's own logic is
// thin glue over real SQL, not a fan-out worth mocking).
//
// EVERY synthetic source this file registers is its OWN row (source_key prefixed `g1_test_`),
// deleted in `after()` — the REAL bank_agent/close_prep rows are NEVER touched, so this file can
// never pollute another suite sharing the same rig.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { WAKE_EVENT_TYPE } from "./relay-fixtures.mjs";
import {
  WAKE_ENGINE_CONSUMER, runWakeEngineCycle, wakeEngineHealth, loadEnabledSources,
} from "../lib/wake-engine.mjs";
import { reconcileWakeEngineTasks } from "../lib/reconciler-wake.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

async function hasG1() {
  if (!READY) return false;
  const r = await rig.rootQuery("select to_regclass('clara.wake_engine_sources') as t");
  return r.rows[0].t != null;
}
const G1_READY = await hasG1();
const skipG1 = G1_READY ? false : "Gate G1 (clara.wake_engine_sources) not applied";

const REGISTERED = [];
async function registerSource(row) {
  // ck_wes_enabled_audit requires enabled_by/enabled_at NON-NULL whenever enabled=true — an
  // `enabled:true` row needs a real actor (any users.id); the caller supplies one whenever it
  // registers pre-enabled (every enabled:false registration — the common case — needs none).
  const on = row.enabled ?? true;
  if (on && !row.actor) throw new Error(`registerSource(${row.sourceKey}): enabled:true requires { actor: <users.id> }`);
  await rig.rootQuery(
    `insert into clara.wake_engine_sources
       (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool, max_attempts, enabled, enabled_by, enabled_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $9 then now() else null end)`,
    [row.sourceKey, row.carrier, row.eventType ?? null, row.taskKind, row.wakeKind, row.workflowExport ?? "g1TestWorkflow",
      row.loginPool ?? "runtime", row.maxAttempts ?? 5, on, on ? row.actor : null],
  );
  REGISTERED.push(row.sourceKey);
}
async function setEnabled(sourceKey, on, actor) {
  // ck_wes_enabled_audit requires enabled_by/enabled_at NON-NULL whenever enabled=true — the
  // registry's own writer (set_wake_source_enabled) stamps them from _human_ctx; this raw-SQL
  // helper stamps them from a caller-supplied actor id (any real users.id satisfies the FK).
  await rig.rootQuery(
    `update clara.wake_engine_sources set enabled=$2,
        enabled_by = case when $2 then $3 else enabled_by end,
        enabled_at = case when $2 then now() else enabled_at end
      where source_key=$1`,
    [sourceKey, on, actor ?? null],
  );
}

after(async () => {
  if (REGISTERED.length) {
    await rig.rootQuery("delete from clara.wake_engine_sources where source_key = any($1)", [REGISTERED]);
  }
  await rig.endPool();
});

// =====================================================================================
// Health shape — mirrors autodraftHealth's own cells; extended with heldForDisabledSource.
// =====================================================================================
test("wakeEngineHealth reports consumer/lag/pendingDeadLetters/firmsTracked/heldForDisabledSource", { skip: skip || skipG1 }, async () => {
  const h = await rig.asRuntime((c) => wakeEngineHealth(c));
  assert.equal(h.consumer, WAKE_ENGINE_CONSUMER);
  for (const k of ["lag", "pendingDeadLetters", "firmsTracked", "heldForDisabledSource"]) {
    assert.equal(typeof h[k], "number", `${k} is a number`);
    assert.ok(h[k] >= 0, `${k} is non-negative`);
  }
});

test("loadEnabledSources re-reads the registry EVERY call — never cached (design battery D4's own premise)", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_lc_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1lc");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "g1_test_poison", enabled: false });
  const before = await rig.asRuntime((c) => loadEnabledSources(c));
  assert.equal(before.byEventType.has(WAKE_EVENT_TYPE) && before.byEventType.get(WAKE_EVENT_TYPE).sourceKey === key, false, "disabled source is absent from the loaded map");
  await setEnabled(key, true, w.owner);
  const after1 = await rig.asRuntime((c) => loadEnabledSources(c));
  assert.equal(after1.byEventType.get(WAKE_EVENT_TYPE)?.sourceKey, key, "enabling makes it visible on the VERY NEXT read, no restart, no cache");
  // Test-isolation hygiene (found while fixing G1's opus/Codex review round): wake_engine_sources
  // is ESTATE-WIDE, not firm-scoped — leaving this source ENABLED under the SHARED WAKE_EVENT_TYPE
  // key leaks into every LATER test's own byEventType lookup for that same event type (proven: it
  // broke D4 when run in the same file). Disable it again so this test's own state never survives
  // past its own body — REGISTERED's file-level after() only DELETES the row, too late for a
  // sibling test's mid-file assertion.
  await setEnabled(key, false, w.owner);
});

// =====================================================================================
// D4 — a disabled source's held rows are NEVER claimed; enabling claims on the VERY NEXT
// cycle (no restart required).
// =====================================================================================
test("D4 a disabled synthetic source's held row is untouched across a real engine cycle; enabling claims it on the NEXT cycle", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_d4_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1d4");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: false });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task = await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId]);
  const taskId = task.rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,$2,'held')", [intent.intentId, "background_review"]);

  const enqueued1 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued1.push(a), log: () => {} }));
  const stillHeld = await rig.readTask(taskId);
  assert.equal(stillHeld.status, "held", "D4: a disabled source's row is NEVER claimed");
  assert.deepEqual(enqueued1, [], "D4: nothing was dispatched while disabled");

  await setEnabled(key, true, w.owner);
  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const claimed = await rig.readTask(taskId);
  assert.equal(claimed.status, "running", "D4: enabling claims it on the VERY NEXT cycle — no restart required");
  assert.equal(enqueued2.length, 1, "D4: exactly one dispatch");
  assert.equal(enqueued2[0][0], "g1TestWorkflow", "D4: dispatched with the source's own workflow_export");
});

// =====================================================================================
// MUST F liveness (opus/Codex review) — with zero held wake rows, the checkpoint must
// COALESCE to the firm's live head, not sit at its last claim forever. Pre-fix, ordinary
// (non-wake) traffic never advanced this checkpoint at all — measured lag=170 on a rig where
// the engine was perfectly healthy, so /ready's WARN could never distinguish a dead engine
// from a live one.
// =====================================================================================
test("MUST F(liveness): with zero held wake rows, the checkpoint coalesces to the firm's live head — lag returns to zero on ordinary traffic, never stuck at the last claim", { skip: skip || skipG1 }, async () => {
  const w = await rig.buildFirm("g1mustfliveness");
  // Ordinary, non-wake-triggering traffic — no registerSource call, no held wake row: nothing
  // here is even claimable, which is exactly the common case this coalescing fixes.
  await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });

  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async () => {}, log: () => {} }));

  const head = (await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n;
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(cp, "MUST F(liveness): a checkpoint row now exists for this firm after one cycle");
  assert.equal(Number(cp.last_seq), Number(head), "MUST F(liveness): the checkpoint coalesced all the way to the firm's live head — pre-fix this stayed at its last claim (often null/0 with zero wake traffic), the measured lag=170-on-a-healthy-rig defect");
});

// =====================================================================================
// MUST F (opus/Codex review) — plaintext credentials never cross into durable WDK state.
// A REAL wake credential is minted independently (the exact secret this cell must never see
// echoed back), a real held row is claimed through a REAL engine cycle, and every captured
// `enqueue` call — the ONLY boundary through which anything could reach start()'s durably-
// persisted args — is asserted to carry exactly two plain string identifiers, with the real
// secret (and the generic shape a wake secret takes) appearing NOWHERE in what was captured.
// =====================================================================================
test("MUST F: enqueue never carries a credential — captured args are exactly [workflowExport, taskId], and a real minted secret never appears in them", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_mustf_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1mustf");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // A REAL secret, minted independently of the engine — the exact string this cell asserts
  // never leaks into an enqueue call.
  const realSecret = (await rig.rootQuery(
    "select secret from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    ["proactive", w.firm, null, null],
  )).rows[0].secret;
  assert.ok(realSecret && realSecret.length > 20, "mandatory setup: a real secret was minted");

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task = await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId]);
  const taskId = task.rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,$2,'held')", [intent.intentId, "background_review"]);

  const calls = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...args) => calls.push(args), log: () => {} }));

  assert.equal(calls.length, 1, "mandatory setup: exactly one dispatch happened");
  const args = calls[0];
  assert.equal(args.length, 2, "MUST F: enqueue receives EXACTLY two arguments — workflowExport and taskId, never a third (credential) argument");
  assert.equal(typeof args[0], "string", "MUST F: arg 0 (workflowExport) is a plain string");
  assert.equal(typeof args[1], "string", "MUST F: arg 1 (taskId) is a plain string");
  assert.equal(args[1], taskId, "MUST F: arg 1 is the plain task id, not an object wrapping it");

  const serialized = JSON.stringify(calls);
  assert.ok(!serialized.includes(realSecret), "MUST F: the real minted secret does not appear anywhere in what was captured");
  assert.ok(!/secret/i.test(serialized), "MUST F: no captured arg carries a 'secret'-named field at all");
  assert.ok(!serialized.includes("credential"), "MUST F: no captured arg carries a 'credential'-named field at all");
});

test("MUST F: the direct_queue carrier's dispatch is equally credential-free", { skip: skip || skipG1 }, async () => {
  // close_prep is the only live direct_queue kind; register a SYNTHETIC direct_queue source on
  // it so this cell never touches the real (disabled) close_prep registry row.
  const key = `g1_test_mustfdq_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1mustfdq");
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", enabled: true, actor: w.owner });
  const task = await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  );
  const taskId = task.rows[0].id;

  const calls = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...args) => calls.push(args), log: () => {} }));
  assert.equal(calls.length, 1, "mandatory setup: exactly one direct_queue dispatch happened");
  assert.equal(calls[0].length, 2, "MUST F: direct_queue dispatch also carries exactly two plain identifiers");
  assert.equal(calls[0][1], taskId);
  assert.ok(!JSON.stringify(calls).toLowerCase().includes("secret"), "MUST F: no secret-shaped field in the direct_queue dispatch either");
});

// =====================================================================================
// MUST E (opus/Codex review) — the direct_queue carrier must dispatch in the PRODUCTION cycle
// shape too, not only when a caller passes onlyFirm (the test-only knob every OTHER cell here
// uses). startWorld.ts never passes onlyFirm — pre-fix, the whole direct_queue-with-no-backlog
// scan was gated on `onlyFirm != null`, so this exact path was dead code in production (probed
// live by the reviewer: task stayed 'queued', dispatched=0, in the real production shape).
// =====================================================================================
test("MUST E: a direct_queue task with no wake_outbox backlog dispatches in the PRODUCTION cycle shape — runWakeEngineCycle called WITHOUT onlyFirm", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_muste_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1muste");
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", enabled: true, actor: w.owner });
  const task = await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  );
  const taskId = task.rows[0].id;

  const calls = [];
  // NO onlyFirm — exactly the shape startWorld.ts uses in production.
  await rig.asRuntime((c) => runWakeEngineCycle(c, { enqueue: async (...args) => calls.push(args), log: () => {} }));

  const row = (await rig.rootQuery("select status from clara.agent_tasks where id=$1", [taskId])).rows[0];
  assert.equal(row.status, "running", "MUST E: the task IS claimed in the production shape — pre-fix this stayed 'queued' (dispatched=0)");
  const mine = calls.filter((c) => c[1] === taskId);
  assert.equal(mine.length, 1, "MUST E: exactly one dispatch happened for this task in the production shape");
});

// =====================================================================================
// D6 — per-source isolation: a poisoned source's item dead-letters and stays visibly held
// (poison-skip advances the checkpoint PAST it, never settling the task — carrier-1's own
// asymmetry vs carrier-2, design Annex C); a HEALTHY source's item in the SAME cycle, SAME
// firm, LATER in event_seq order still dispatches normally.
// =====================================================================================
test("D6 per-source isolation: a poisoned source dead-letters + stays held; a healthy source's item in the SAME cycle still dispatches", { skip: skip || skipG1 }, async () => {
  const poisonKey = `g1_test_d6p_${randomUUID().slice(0, 8)}`;
  const healthyKey = `g1_test_d6h_${randomUUID().slice(0, 8)}`;
  const poisonEventType = `${WAKE_EVENT_TYPE}.poison.${randomUUID().slice(0, 6)}`;
  const w = await rig.buildFirm("g1d6");

  // A distinct event_type for the poison source (registering the ORDINARY WAKE_EVENT_TYPE
  // twice would collide with the healthy source's own registration below).
  await rig.rootQuery(
    `insert into clara.event_types (name, client_scoped, description) values ($1,false,'g1 battery poison type') on conflict (name) do nothing`,
    [poisonEventType],
  );
  await rig.rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision)
       select a.version, $1, 'background_review' from clara.taxonomy_active a on conflict (version, event_type) do nothing`,
    [poisonEventType],
  );
  await registerSource({ sourceKey: poisonKey, carrier: "wake_outbox", eventType: poisonEventType, taskKind: "wake", wakeKind: "g1_test_poison_kind", maxAttempts: 1, enabled: true, actor: w.owner });
  await registerSource({ sourceKey: healthyKey, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // Poisoned row FIRST (lower seq) via a raw _append_event under the poison type.
  const poisonEv = await rig.rootQuery(
    `select clara._append_event(p_firm=>$1,p_type=>$2,p_client=>null,p_actor=>$3,p_obo=>null,p_wake_kind=>null,p_entry=>null,p_document=>null,p_resolution=>null,p_payload=>'{}'::jsonb) as seq`,
    [w.firm, poisonEventType, w.owner],
  );
  const poisonEvId = (await rig.rootQuery("select id from clara.domain_events where firm_id=$1 and seq=$2", [w.firm, Number(poisonEv.rows[0].seq)])).rows[0].id;
  const poisonIntent = await rig.rootQuery(
    "insert into clara.wake_intents (event_id, decision, taxonomy_version) values ($1,'background_review',(select version from clara.taxonomy_active)) returning id",
    [poisonEvId],
  );
  const poisonTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [poisonIntent.rows[0].id])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [poisonIntent.rows[0].id]);

  // Healthy row SECOND (higher seq).
  const healthyIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const healthyTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [healthyIntent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [healthyIntent.intentId]);

  // MUST F (opus/Codex review) removed credential minting from the claim transaction entirely
  // — pre-fix, this cell poisoned the claim by giving the source a wake_kind the
  // wake_credentials CHECK would reject, which failed the mint INSIDE claimWakeOutboxRow. That
  // surface no longer exists (claimWakeOutboxRow is now just an UPDATE + a checkpoint write, and
  // the workflow's own first step mints post-dispatch). Inject a genuine, isolated claim failure
  // the same way this codebase tests such things elsewhere — a REAL trigger, scoped to exactly
  // this one task id via a WHEN clause, never a mock (mocks can't see triggers): every OTHER
  // row's UPDATE, including the healthy task's, is untouched.
  const poisonFn = `g1_test_d6_poison_${randomUUID().slice(0, 8)}`;
  await rig.rootQuery(`create function clara.${poisonFn}() returns trigger language plpgsql as $f$ begin raise exception 'g1 battery D6: deliberate poison injection'; end $f$`);
  // DDL cannot take a bind parameter for the WHEN clause — poisonTask is a DB-generated uuid
  // (never user input), safe to embed directly with an explicit ::uuid cast.
  await rig.rootQuery(`create trigger ${poisonFn} before update on clara.agent_tasks for each row when (old.id = '${poisonTask}'::uuid) execute function clara.${poisonFn}()`);

  const enqueued = [];
  try {
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));

    const poisonRow = await rig.readTask(poisonTask);
    assert.equal(poisonRow.status, "held", "D6: the poisoned row is NEVER claimed — poison-skip leaves it VISIBLY held, never silently settled");
    const dl = await rig.rootQuery("select attempt_count, reason from clara.relay_dead_letters where consumer=$1 and event_id=$2", [WAKE_ENGINE_CONSUMER, poisonEvId]);
    assert.equal(dl.rowCount, 1, "D6: the poisoned event dead-lettered exactly once (max_attempts=1 poison-skips on the first failure)");
    assert.equal(dl.rows[0].attempt_count, 1);
    assert.match(dl.rows[0].reason, /deliberate poison injection/, "D6: the dead-letter reason names the REAL claim-transaction failure, not a stale/guessed cause");

    const healthyRow = await rig.readTask(healthyTask);
    assert.equal(healthyRow.status, "running", "D6: the healthy source's item, later in the SAME cycle, dispatches normally — isolation holds");
    assert.ok(enqueued.some((a) => a[1] === healthyTask), "D6: the healthy task was enqueued in the SAME cycle the poison ran in");
  } finally {
    await rig.rootQuery(`drop trigger if exists ${poisonFn} on clara.agent_tasks`);
    await rig.rootQuery(`drop function if exists clara.${poisonFn}()`);
  }
});

// =====================================================================================
// D7 — reconciler crash-recovery is GENERIC across kinds: a 'wake'-kind task stuck
// running-with-a-bound-run settles via terminalFor + _settle_wake_task (unmodified from
// reconciler.mjs), and its wakes_outbox twin settles in the SAME belt call.
// =====================================================================================
test("D7 reconcileWakeEngineTasks settles a stuck running 'wake' task via terminalFor + _settle_wake_task; wakes_outbox settles too", { skip: skip || skipG1 }, async () => {
  const w = await rig.buildFirm("g1d7");
  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent.intentId]);
  await rig.driveTask(task, ["running"]);
  const runId = `g1-fake-run-${randomUUID()}`;
  await rig.rootQuery("update clara.agent_tasks set workflow_run_id=$2 where id=$1", [task, runId]);

  const out = await rig.asRuntime((c) =>
    reconcileWakeEngineTasks(c, {
      onlyFirm: w.firm,
      getRun: (id) => ({ status: id === runId ? Promise.resolve("completed") : Promise.resolve("running") }),
      enqueue: async () => {},
      log: () => {},
    }),
  );
  assert.equal(out.wakeSettled, 1, "D7: exactly one task settled via the generic belt");
  const settled = await rig.readTask(task);
  assert.equal(settled.status, "completed", "D7: terminalFor(running, completed) -> completed, applied through _settle_wake_task");
  const outbox = await rig.readOutboxForIntent(intent.intentId);
  assert.equal(outbox.status, "settled", "D7: the SAME belt call settles the wakes_outbox twin — crash-recovery keeps both projections in sync");
});

test("D7b a task belonging to ANOTHER firm is left alone by the firm-scoped belt", { skip: skip || skipG1 }, async () => {
  const mine = await rig.buildFirm("g1d7b-mine");
  const other = await rig.buildFirm("g1d7b-other");
  const intent = await rig.makeConsumableIntent({ ownerSub: other.owner, client: other.client });
  const task = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
  await rig.driveTask(task, ["running"]);
  await rig.rootQuery("update clara.agent_tasks set workflow_run_id=$2 where id=$1", [task, `g1-fake-${randomUUID()}`]);

  const out = await rig.asRuntime((c) =>
    reconcileWakeEngineTasks(c, { onlyFirm: mine.firm, getRun: () => ({ status: Promise.resolve("completed") }), enqueue: async () => {}, log: () => {} }),
  );
  assert.equal(out.wakeSettled, 0, "D7b: scoped to a DIFFERENT firm, the other firm's stuck task is untouched");
  const untouched = await rig.readTask(task);
  assert.equal(untouched.status, "running", "D7b: still running — the firm predicate is real, not decoration");
});
