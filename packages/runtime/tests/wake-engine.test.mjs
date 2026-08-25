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
  WAKE_ENGINE_CONSUMER, WAKE_ENGINE_CLAIM_CONSUMER, WAKE_ENGINE_ENQUEUE_CONSUMER,
  runWakeEngineCycle, wakeEngineHealth, loadEnabledSources,
} from "../lib/wake-engine.mjs";
import { reconcileWakeEngineTasks } from "../lib/reconciler-wake.mjs";
// round-7 (native adversarial leg, MUST #1) — the two new cells below need redrive() itself
// (relay.mjs), not a raw-SQL simulation, plus its own ROUTER-side consumer name (dead-letters in
// this battery are always keyed under 'router', matching every other cell in this file).
import { redrive, CONSUMER as ROUTER_CONSUMER } from "../lib/relay.mjs";

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
  // Test-isolation fix (found reproducing M6, not a review finding): wake_engine_sources has no
  // firm_id — it is a genuinely GLOBAL registry (confirmed against the CREATE TABLE), and
  // production's own resolution path (loadEnabledSources' byEventType Map, reconciler-wake.mjs's
  // resolveSource) correlates a wake_outbox row to its source by event_type ALONE, with no other
  // discriminator — the design's implicit invariant is AT MOST ONE enabled wake_outbox source per
  // event_type at a time. This file's own tests never disabled their own registered source
  // afterward, so by the time a LATER test's assertions actually depend on WHICH source answers
  // (M6's max_attempts, specifically), several earlier tests' sources are still enabled and share
  // the same WAKE_EVENT_TYPE — the earlier tests never noticed because none of them depended on
  // max_attempts. Enforce the invariant here, at registration time, exactly where a real operator
  // would be expected to hold it: registering a new ENABLED wake_outbox source for an event_type
  // first disables any other currently-enabled wake_outbox source(s) for that SAME event_type, so
  // every test that follows this one sees exactly the source IT registered — never a stale one
  // from a test that ran earlier in the same file.
  if (on && row.carrier === "wake_outbox" && row.eventType) {
    await rig.rootQuery(
      `update clara.wake_engine_sources set enabled=false, disabled_by=$2, disabled_at=now(), disabled_reason='g1 test isolation: superseded by a later registerSource for the same event_type'
         where carrier='wake_outbox' and event_type=$1 and enabled`,
      [row.eventType, row.actor],
    );
  }
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
test("wakeEngineHealth reports consumer/lag/pendingDeadLetters/firmsTracked/heldForDisabledSource/cancelRequestedStuck/heldBelowCheckpoint", { skip: skip || skipG1 }, async () => {
  const h = await rig.asRuntime((c) => wakeEngineHealth(c));
  assert.equal(h.consumer, WAKE_ENGINE_CONSUMER);
  // NOTE-b (opus, round-4 review): cancelRequestedStuck added to this signal set.
  // round-7 (native adversarial leg, MUST #1): heldBelowCheckpoint added — defense-in-depth for
  // exactly the shape of hole this round's own structural fix closes (see wakeEngineHealth's own
  // header comment).
  for (const k of ["lag", "pendingDeadLetters", "firmsTracked", "heldForDisabledSource", "cancelRequestedStuck", "heldBelowCheckpoint"]) {
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
test("MUST F(liveness): with zero held wake rows and nothing pending, the checkpoint coalesces to the firm's live head — lag returns to zero on genuinely-clear ordinary traffic, never stuck at the last claim", { skip: skip || skipG1 }, async () => {
  const w = await rig.buildFirm("g1mustfliveness");
  // M1 (opus+Codex review) REWRITE: the ORIGINAL version of this cell called
  // rig.makeConsumableIntent() here, which mints a PENDING (undrained) wake_intent — exactly
  // the race M1 found, so this cell was accidentally CERTIFYING the pre-fix unsafe behaviour
  // (asserting the checkpoint reaches raw head) using a fixture that should have BLOCKED it.
  // This cell now tests the genuinely-safe case only: buildFirm's own setup traffic (firm/
  // client creation) bumps firm_event_seq with ZERO wake_intents ever created — nothing
  // pending, nothing to strand. The race itself (a pending/undrained intent) is M1's own cell
  // below, which asserts the OPPOSITE — that the checkpoint must NOT reach head while one
  // exists.
  //
  // M1's safe bound is least(router's own checkpoint, min-pending-intent - 1) — a router
  // checkpoint that has NEVER been written (this unit test never runs the router consumer
  // itself, only wake-engine) is indistinguishable from "the router has looked at nothing yet",
  // so the bound correctly floors at 0 and refuses to coalesce — fail-closed, by design (found
  // reproducing this cell, not a review finding: the ORIGINAL rewrite omitted the setup step
  // M1's own cell below already established for exactly this reason — "isolates this assertion
  // to the PENDING-wake_intent half of the bound specifically, not a side effect of an absent
  // router checkpoint"). Seed the router checkpoint at head, mirroring M1 verbatim, so THIS
  // cell isolates the pending-wake_intent half the same way and is not itself blocked by the
  // OTHER half of the same bound.
  const headBefore = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, headBefore],
  );

  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async () => {}, log: () => {} }));

  const head = (await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n;
  assert.ok(Number(head) > 0, "mandatory setup: buildFirm's own creation traffic bumped firm_event_seq");
  const pending = (await rig.rootQuery("select count(*)::int as n from clara.wake_intents where firm_id=$1 and status='pending'", [w.firm])).rows[0].n;
  assert.equal(pending, 0, "mandatory setup: nothing pending — this cell isolates the genuinely-safe case");
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(cp, "MUST F(liveness): a checkpoint row now exists for this firm after one cycle");
  assert.equal(Number(cp.last_seq), Number(head), "MUST F(liveness): with nothing pending, the checkpoint coalesces all the way to the firm's live head — pre-fix this stayed at its last claim (often null/0 with zero wake traffic), the measured lag=170-on-a-healthy-rig defect");
});

// =====================================================================================
// M1 (opus+Codex independent review, both legs) — the ORIGINAL MUST-F(liveness) fix coalesced
// straight to the raw firm_event_seq head, which is UNSAFE: an event can commit (bumping
// firm_event_seq) before the router has turned it into a wake_intents row, or after the router
// but before drain.mjs has turned that wake_intent into the held agent_tasks row this consumer
// actually reads. Coalescing past a seq whose wake-bound row has not materialized YET strands
// it FOREVER (writeCheckpoint's greatest() never rewinds). Two cells: the primary race (a
// pending/undrained wake_intent), and the "skip-locked variant" (a held row hidden from THIS
// cycle's own locking read by a concurrent transaction holding its lock).
// =====================================================================================
test("M1: a PENDING (undrained) wake_intent's own seq is never coalesced past — the task materializes later and is still eventually dispatched, never stranded", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m1_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m1");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // Simulate the router/drain race directly: an event has committed (bumping firm_event_seq)
  // and the router has decided it is wake-bound (a wake_intents row exists, status='pending')
  // — but drain.mjs has not YET run, so there is no held agent_tasks row for it yet. This is
  // the exact gap M1 found.
  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const pendingSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent.intentId])).rows[0].event_seq);
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  // Simulate the ROUTER having fully caught up to head (so the router-checkpoint half of the
  // safe bound would not itself be what blocks coalescing here) — isolates this assertion to
  // the PENDING-wake_intent half of the bound specifically, not a side effect of an absent
  // router checkpoint.
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  const enqueued1 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued1.push(a), log: () => {} }));
  assert.deepEqual(enqueued1, [], "mandatory setup: nothing dispatched yet — the task has not materialized");
  const cpAfterPending = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(!cpAfterPending || Number(cpAfterPending.last_seq) < pendingSeq, "M1: the checkpoint must NOT coalesce past a PENDING (undrained) wake_intent's own seq, even though the router has fully caught up to head — this is the exact stranding race, reproduced");

  // Drain catches up (the D4/D6 tests' own established manual-materialization pattern): the
  // held task + outbox row now exist, and the intent is consumed.
  const task = await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId]);
  const taskId = task.rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,$2,'held')", [intent.intentId, "background_review"]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent.intentId, randomUUID()]);

  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const claimed = await rig.readTask(taskId);
  assert.equal(claimed.status, "running", "M1: once materialized, the previously-pending task IS eventually dispatched — never stranded by an earlier coalesce (the exact acceptance test the coordinator required: 'the task is EVENTUALLY dispatched, not that the coalesce happened')");
  assert.equal(enqueued2.length, 1, "M1: exactly one dispatch on the cycle that finds it");
  assert.equal(enqueued2[0][1], taskId);
});

test("M1 skip-locked variant: a held row hidden from THIS cycle's own locking read by a concurrent transaction is never coalesced past either", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m1skip_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m1skip");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const pendingSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent.intentId])).rows[0].event_seq);
  const task = await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId]);
  const taskId = task.rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,$2,'held')", [intent.intentId, "background_review"]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent.intentId, randomUUID()]);

  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  // Simulate the router having fully caught up (isolates this cell to the SKIP LOCKED gap —
  // the row IS fully materialized; only its lock visibility is the problem being probed).
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  // Hold the row's lock open on a SEPARATE connection — simulating a concurrent transaction
  // (a real cancel_agent_task, or another leader mid-claim) — never released until after this
  // cycle's own assertions below. NOTE-e (opus, round-4 review): deflake — a fixed 100ms sleep
  // was a GUESS that the locker's own `for update` had completed by then, not a proof; on a
  // slow/loaded runner it can fire before the lock is actually held, silently certifying the
  // race it means to construct. Signal deterministically instead: `lockAcquired` resolves only
  // AFTER the locker's own `for update` SELECT has genuinely returned (Postgres has granted the
  // lock by the time that statement completes), so the main cycle below never starts before the
  // lock is real — no timing margin to get wrong.
  let releaseLock, lockAcquired;
  const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  const lockIsHeld = new Promise((resolve) => { lockAcquired = resolve; });
  const lockerDone = rig.asRuntime(async (c) => {
    await c.query("begin");
    await c.query("select 1 from clara.agent_tasks where id=$1 for update", [taskId]);
    lockAcquired();
    await lockHeld;
    await c.query("rollback");
  });
  await lockIsHeld;

  const enqueued = [];
  try {
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));
  } finally {
    releaseLock();
    await lockerDone;
  }

  const row = await rig.readTask(taskId);
  assert.equal(row.status, "held", "M1 skip-locked variant: the row survives untouched — SKIP LOCKED made it invisible to THIS cycle's own claim read, but hasHiddenHeldRow must still refuse to coalesce past it");
  assert.deepEqual(enqueued, [], "M1: nothing was dispatched — the row was never claimed by this cycle");
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(!cp || Number(cp.last_seq) < pendingSeq, "M1 skip-locked variant: the checkpoint must NOT have coalesced past the hidden row's own seq");

  // Now that the lock released, a fresh cycle finds and dispatches it normally.
  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const claimed = await rig.readTask(taskId);
  assert.equal(claimed.status, "running", "M1 skip-locked variant: once the lock releases, the row is claimed on the very next cycle");
  assert.equal(enqueued2.length, 1);
});

// =====================================================================================
// #1(a) (round-4 review, both legs, REOPENED) — hidden-earlier + visible-later IN ONE BATCH.
// The skip-locked variant above has ONE hidden row and nothing else — it never exercised the
// actual defect: claimWakeOutboxRow used to write the checkpoint straight to a CLAIMED row's own
// seq the instant its claim committed, with no regard for whether an EARLIER seq was still
// unaccounted for. Lock the LOWER-seq row (hiding it from THIS cycle's own SKIP LOCKED read)
// while the HIGHER-seq row stays visible and claimable — pre-fix, claiming the higher row alone
// would race the checkpoint straight past the still-hidden lower one, stranding it forever
// (writeCheckpoint's own greatest() never rewinds; readHeldWakeRows' `event_seq > lastSeq` would
// permanently exclude it once the lock released). Post-fix: the higher row still claims and
// dispatches normally (SKIP LOCKED does not block ITS claim), but the checkpoint stays below the
// hidden row's own seq until it clears.
// =====================================================================================
test("#1(a): a hidden-earlier row alongside a visible-later one in the SAME batch — the later row still claims, but the checkpoint never races past the hidden earlier one; it is still claimable once the lock releases", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_1a_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_1a");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // The LOWER-seq row (will be locked, hidden from this cycle's own claim read).
  const intentLow = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const lowSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intentLow.intentId])).rows[0].event_seq);
  const taskLow = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intentLow.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intentLow.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intentLow.intentId, randomUUID()]);

  // The HIGHER-seq row (stays visible, genuinely claimable this cycle).
  const intentHigh = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intentHigh.intentId])).rows[0].event_seq);
  const taskHigh = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intentHigh.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intentHigh.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intentHigh.intentId, randomUUID()]);
  assert.ok(highSeq > lowSeq, "mandatory setup: the two rows are genuinely ordered low < high");

  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  // Lock ONLY the lower-seq row — the higher one stays fully visible to readHeldWakeRows' own
  // SKIP LOCKED read. Deterministic signal (NOTE-e), never a fixed sleep.
  let releaseLock, lockAcquired;
  const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  const lockIsHeld = new Promise((resolve) => { lockAcquired = resolve; });
  const lockerDone = rig.asRuntime(async (c) => {
    await c.query("begin");
    await c.query("select 1 from clara.agent_tasks where id=$1 for update", [taskLow]);
    lockAcquired();
    await lockHeld;
    await c.query("rollback");
  });
  await lockIsHeld;

  const enqueued = [];
  try {
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));
  } finally {
    releaseLock();
    await lockerDone;
  }

  const rowHigh = await rig.readTask(taskHigh);
  assert.equal(rowHigh.status, "running", "#1(a): the visible HIGHER-seq row still claims and dispatches normally — SKIP LOCKED never blocked IT");
  assert.equal(enqueued.length, 1, "#1(a): exactly one dispatch, the higher row");
  assert.equal(enqueued[0][1], taskHigh);
  const rowLow = await rig.readTask(taskLow);
  assert.equal(rowLow.status, "held", "#1(a): the hidden LOWER-seq row survives untouched — it was never visible to this cycle's own claim read");
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(!cp || Number(cp.last_seq) < lowSeq, "#1(a): THE CORE ASSERTION — claiming the higher row must NOT have raced the checkpoint past the still-hidden lower row's own seq, even though the higher row's own claim committed successfully");

  // Now release the lock and prove the lower row is STILL discoverable and claimable — the
  // review's own acceptance line: "prove 3 still claimable after release."
  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const rowLowAfter = await rig.readTask(taskLow);
  assert.equal(rowLowAfter.status, "running", "#1(a): once the lock releases, the previously-hidden lower row is claimed on the very next cycle — never permanently stranded");
  assert.equal(enqueued2.length, 1);
  assert.equal(enqueued2[0][1], taskLow);
});

// =====================================================================================
// #1(b) (round-4 review, both legs, REOPENED) — router dead-letter REDRIVE can insert a
// pending wake_intents row at an OLD (low) seq, at ANY time, including AFTER this engine has
// already coalesced its checkpoint past that seq (the router's own checkpoint advances past a
// dead-lettered event just like this engine's own poison-skip advances past an exhausted row —
// dead-lettering is a terminal outcome under the taxonomy version active AT THE TIME, not a
// block). safeCoalesceBound's bound-3 (this round's own fix) closes it: never coalesce past the
// lowest seq among this firm's own still-PENDING router dead-letters, since any one of them
// could resolve wake-bound on a future redrive at exactly that seq.
// =====================================================================================
test("#1(b): a firm with a pending (unredriven) router dead-letter never coalesces past it — a later redrive's low-seq wake_intent is still discoverable, never stranded by an earlier coalesce", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_1b_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_1b");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // A genuinely OLD event, dead-lettered by the router (uncovered under some earlier taxonomy
  // state) and still pending redrive — emitWakeEvent mints a REAL domain_events row with its own
  // seq WITHOUT ever creating a wake_intents row for it (rig.mjs's own §3.1 helper, the exact
  // "the router dead-lettered it instead of routing it wake-bound" shape this cell needs;
  // wake_intents is append-only/no-delete by design, so a delete-then-fake approach cannot work
  // here — this mints the event correctly the first time instead).
  const oldEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const oldSeq = Number(oldEvent.seq);
  const oldEventId = oldEvent.id;
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status)
       values ('router',$1,$2,$3,$4,'#1(b) battery: simulated pre-fix uncovered event','pending')`,
    [oldEventId, w.firm, oldSeq, WAKE_EVENT_TYPE],
  );

  // The router's own checkpoint has ALREADY moved past the dead-letter (dead-lettering is
  // terminal for the router, same as this engine's own poison-skip advancing past an exhausted
  // row) — seeded at the firm's own current head, which already includes oldSeq's own event —
  // the exact pre-condition bound-1 alone would otherwise treat as "safe to coalesce."
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );
  const pendingNow = (await rig.rootQuery("select count(*)::int as n from clara.wake_intents where firm_id=$1 and status='pending'", [w.firm])).rows[0].n;
  assert.equal(pendingNow, 0, "mandatory setup: nothing pending in wake_intents right now — bound-2 alone would not block this coalesce");

  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async () => {}, log: () => {} }));
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(!cp || Number(cp.last_seq) < oldSeq, "#1(b): THE CORE ASSERTION — the checkpoint must not coalesce past the still-pending router dead-letter's own seq, even though the router's own checkpoint and firm_event_seq are both well past it");

  // Redrive lands NOW (relay.mjs's own redrive() shape, inlined here since importing relay.mjs's
  // CLI-facing redrive would also require a full taxonomy fixture this cell does not need) —
  // proves the freshly-minted pending wake_intent is still discoverable and dispatched normally.
  // rig.rootQuery is one connection per call (relay-fixtures.mjs's own withActor), so this is
  // two independently-autocommitted statements, not a real multi-statement transaction — that
  // matches redrive()'s OWN net effect closely enough for this cell (both rows land before the
  // engine's next cycle runs; the atomicity of redrive()'s own real transaction is relay.mjs's
  // own test surface, not this one's).
  await rig.rootQuery(
    "insert into clara.wake_intents (event_id, decision, taxonomy_version) values ($1,'background_review',(select version from clara.taxonomy_active)) on conflict (event_id) do nothing",
    [oldEventId],
  );
  await rig.rootQuery("update clara.relay_dead_letters set status='resolved', resolved_at=now() where consumer='router' and event_id=$1", [oldEventId]);
  const redrivenIntentId = (await rig.rootQuery("select id from clara.wake_intents where event_id=$1", [oldEventId])).rows[0].id;
  const redrivenTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [redrivenIntentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [redrivenIntentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [redrivenIntentId, randomUUID()]);

  const enqueued = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));
  const redrivenRow = await rig.readTask(redrivenTask);
  assert.equal(redrivenRow.status, "running", "#1(b): the redrive's own low-seq wake_intent is still discoverable and dispatched — never stranded by the earlier coalesce");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0][1], redrivenTask);
});

// =====================================================================================
// SHOULD-1 (round-5, opus reviewer's own trace) — round-4's #1(a)/#1(b) fixes were internally
// INCONSISTENT: the row-loop's own checkpoint-advance (claimed/raced/poison-skip-exhausted)
// only consulted hasHiddenHeldRow (materialized held rows), never safeCoalesceBound's own
// pending-intent/pending-dead-letter bounds the way coalesceIfSafe already does. Exact trace: a
// pending router dead-letter at seq=3 (NOT YET materialized into any wake_intent/held task —
// hasHiddenHeldRow cannot see it, it isn't a held row at all) alongside a fully claimable held
// row at seq=9. Claiming seq=9 alone: hasHiddenHeldRow(0,8) sees nothing (correctly — nothing
// IS held there), so pre-fix the checkpoint raced straight to 9. A later redrive mints intent(3)
// at that low seq; drain births held(3); `event_seq > 9` excludes it forever, same class as
// #1(b), just reached through the CLAIM path instead of the coalesce path.
// =====================================================================================
test("SHOULD-1: a pending router dead-letter at a LOW seq blocks the checkpoint even while a HIGHER-seq row claims successfully in the SAME cycle", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_sh1_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_sh1");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // The pending (unredriven) router dead-letter at the LOW seq — never materialized into a
  // wake_intent, exactly the reviewer's own trace.
  const lowEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const lowSeq = Number(lowEvent.seq);
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status)
       values ('router',$1,$2,$3,$4,'SHOULD-1 battery: simulated pre-fix uncovered event','pending')`,
    [lowEvent.id, w.firm, lowSeq, WAKE_EVENT_TYPE],
  );

  // A fully materialized, genuinely claimable held row at a HIGHER seq.
  const highIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [highIntent.intentId])).rows[0].event_seq);
  const highTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [highIntent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [highIntent.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [highIntent.intentId, randomUUID()]);
  assert.ok(highSeq > lowSeq, "mandatory setup: the dead-letter's own seq is genuinely lower than the claimable row's");

  // Router checkpoint well past both, so bound-1 alone would not block this (isolates the cell
  // to bound-3, the dead-letter bound, specifically).
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  const enqueued = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));

  const highRow = await rig.readTask(highTask);
  assert.equal(highRow.status, "running", "SHOULD-1: the higher-seq row still claims and dispatches normally — the pending dead-letter never blocks the ROW's own claim, only the checkpoint");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0][1], highTask);
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  // round-7 NOTE rider (native adversarial leg): `!cp ||` was a vacuous escape hatch — target
  // here is lowSeq-1, strictly greater than the priorSeq=0 this firm starts at, so a checkpoint
  // row MUST exist by now; removing the `!cp` branch means a future regression that stopped
  // writing the row at all would FAIL this assertion instead of passing through it unnoticed.
  assert.ok(cp && Number(cp.last_seq) < lowSeq, "SHOULD-1: THE CORE ASSERTION — the checkpoint must stay below the pending dead-letter's own seq, even though a HIGHER-seq row claimed successfully in the SAME cycle");

  // Redrive the dead-letter now and prove its own (low-seq) task is still discoverable.
  await rig.rootQuery(
    "insert into clara.wake_intents (event_id, decision, taxonomy_version) values ($1,'background_review',(select version from clara.taxonomy_active)) on conflict (event_id) do nothing",
    [lowEvent.id],
  );
  await rig.rootQuery("update clara.relay_dead_letters set status='resolved', resolved_at=now() where consumer='router' and event_id=$1", [lowEvent.id]);
  const redrivenIntentId = (await rig.rootQuery("select id from clara.wake_intents where event_id=$1", [lowEvent.id])).rows[0].id;
  const redrivenTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [redrivenIntentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [redrivenIntentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [redrivenIntentId, randomUUID()]);

  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const redrivenRow = await rig.readTask(redrivenTask);
  assert.equal(redrivenRow.status, "running", "SHOULD-1: once redriven, the low-seq task is still discoverable and dispatched — never stranded by the earlier claim of the higher-seq row");
  assert.equal(enqueued2.length, 1);
  assert.equal(enqueued2[0][1], redrivenTask);
});

// =====================================================================================
// #1 (round-6, Codex, REOPENED) — the bound READ races the dead-letter STATE MACHINE itself
// (a TOCTOU, not a widening-the-bound problem): a dead-letter already RESOLVED excludes nothing
// from safeCoalesceBound's own bound-3 — but a concurrent reopen (relay.mjs's own redrive(),
// "still uncovered" branch: resolved -> pending) landing BETWEEN this cycle's own bound read and
// its checkpoint write would let the checkpoint sail straight over a seq a LATER genuine redrive
// then resurrects, invisible forever. Closed by serialization: advanceCheckpointIfClear now
// holds a per-firm advisory lock ('wake_coalesce:'||firmId) for its ENTIRE bound-read-through-
// checkpoint-write transaction, and redrive() takes the SAME lock before either of its own exit
// branches. Proof: hold the lock open on a second session (simulating an in-flight reopen),
// prove THIS cycle's own checkpoint-advance is genuinely BLOCKED behind it (pg_blocking_pids,
// never a sleep), flip the dead-letter resolved->pending while still holding the lock, release,
// and prove the checkpoint that then lands stays below the dead-letter's own seq.
// =====================================================================================
// round-7 NOTE rider (native adversarial leg): the original helper counted ANY backend blocked
// by blockerPid — sound only because nothing else concurrent happened to exist in these cells'
// own setups, not because the check itself pinned down WHICH backend was waiting. Tightened to
// require the SPECIFIC waiter pid (the cycle's own connection, captured before it runs) is the
// one observed blocked — a bystander backend blocked on some unrelated lock the holder also
// happens to carry could otherwise satisfy a bare count(*) and pass this wait vacuously.
async function waitPidBlockedByOrThrow(waiterPid, blockerPid, { timeoutMs = 5000, intervalMs = 25, what = "the lock" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rig.rootQuery(
      "select count(*)::int as n from pg_stat_activity where pid = $1 and wait_event_type = 'Lock' and $2 = any(pg_blocking_pids(pid))",
      [waiterPid, blockerPid],
    );
    if (r.rows[0].n > 0) return true;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`waitPidBlockedByOrThrow: pid ${waiterPid} never observably blocked on ${what} (held by ${blockerPid}) within ${timeoutMs}ms`);
}

test("#1 (round-6, Codex): the bound-read -> checkpoint-write critical section is serialized against a concurrent dead-letter REOPEN — the checkpoint never lands on a stale pre-reopen read", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_1r6_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_1r6");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // A dead-letter that is ALREADY resolved (a prior redrive covered it) — bound-3 excludes
  // nothing for it as it stands right now.
  const lowEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const lowSeq = Number(lowEvent.seq);
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
       values ('router',$1,$2,$3,$4,'#1 round-6 battery: simulated already-resolved dead-letter','resolved',now())`,
    [lowEvent.id, w.firm, lowSeq, WAKE_EVENT_TYPE],
  );

  // A fully materialized, genuinely claimable held row at a HIGHER seq.
  const highIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [highIntent.intentId])).rows[0].event_seq);
  const highTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [highIntent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [highIntent.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [highIntent.intentId, randomUUID()]);
  assert.ok(highSeq > lowSeq, "mandatory setup: the dead-letter's own seq is genuinely lower than the claimable row's");

  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  // Hold the SAME wake_coalesce:firmId lock advanceCheckpointIfClear itself takes, open on a
  // separate session — simulating a concurrent reopen already in flight.
  let releaseLock, lockAcquired;
  const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  const lockIsHeld = new Promise((resolve) => { lockAcquired = resolve; });
  let holderPid;
  const holderDone = rig.asRuntime(async (c) => {
    await c.query("begin");
    holderPid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_coalesce:${w.firm}`]);
    lockAcquired();
    await lockHeld;
    // The reopen itself, matching redrive()'s own "still uncovered" branch shape — landing
    // WHILE still holding the lock, so the checkpoint-writer (blocked below) can only ever see
    // this AFTER it commits, never mid-flight.
    await c.query(
      "update clara.relay_dead_letters set status='pending', resolved_at=null, attempt_count=attempt_count+1 where consumer='router' and event_id=$1",
      [lowEvent.id],
    );
    await c.query("commit");
  });
  await lockIsHeld;

  const enqueued = [];
  let cyclePid;
  let cyclePidKnown;
  const cyclePidPromise = new Promise((resolve) => { cyclePidKnown = resolve; });
  const cyclePromise = rig.asRuntime(async (c) => {
    // round-7 NOTE rider: capture THIS specific connection's own backend pid before running the
    // cycle, so the wait below can require exactly THIS pid be blocked — not "someone, somewhere".
    cyclePid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
    cyclePidKnown();
    return runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} });
  });
  await cyclePidPromise;

  try {
    await waitPidBlockedByOrThrow(cyclePid, holderPid, { what: "the #1 wake_coalesce advisory lock" });
  } finally {
    releaseLock();
    await holderDone;
    await cyclePromise;
  }

  const highRow = await rig.readTask(highTask);
  assert.equal(highRow.status, "running", "#1 (round-6): the higher-seq row still claims and dispatches normally once the lock releases");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0][1], highTask);
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  // round-7 NOTE rider: `!cp ||` was a vacuous escape hatch — target here is lowSeq-1, strictly
  // greater than this firm's priorSeq=0, so a checkpoint row MUST exist by now.
  assert.ok(cp && Number(cp.last_seq) < lowSeq, "#1 (round-6): THE CORE ASSERTION — the checkpoint must stay below the reopened dead-letter's own seq; a stale pre-reopen bound read would have let it race straight to the higher row's own seq instead");

  const dl = (await rig.rootQuery("select status from clara.relay_dead_letters where consumer='router' and event_id=$1", [lowEvent.id])).rows[0];
  assert.equal(dl.status, "pending", "mandatory setup: the reopen actually landed — the dead-letter really is 'pending' now, not still 'resolved'");
});

// =====================================================================================
// #1 (round-7, native adversarial leg, MUST, REOPENED) — round-6 closed the RACE (a concurrent
// reopen landing mid-flight between this cycle's own bound read and checkpoint write); it never
// claimed to close the SEQUENTIAL case, which needs NO race at all: a dead-letter already
// 'resolved' when the checkpoint advances excludes NOTHING from bound-3 (which only ever protects
// PENDING dead-letters BY DESIGN) — the checkpoint correctly sails past its seq. redrive() itself
// never branched on the dead-letter's own CURRENT status before minting; a LATER call (with or
// without an intervening reopen) can mint a wake-bound intent at that SAME already-passed seq,
// and writeCheckpoint's own greatest() semantics mean nothing ever rewinds it back —
// readHeldWakeRows' own `event_seq > lastSeq` gate then excludes the row FOREVER, silently. Fix:
// under the SAME wake_coalesce:<firmId> lock redrive() already takes, it now rewinds the
// wake_engine checkpoint (a DIRECT, non-greatest() write) whenever it mints an intent at or below
// the firm's current checkpoint. Two cells against the REAL redrive() (never simulated), both
// must fail against the pre-fix code:
//   (b) below — the no-race DIRECT path: redrive a dead-letter that is ALREADY 'resolved', whose
//       event type is CURRENTLY wake-bound, with no reopen step at all.
//   (a) further below — the LOSING ordering: a dead-letter reopened via redrive() while its type
//       is still genuinely uncovered ((X5b)'s own branch), THEN covered by a real taxonomy
//       repoint, THEN redriven again.
// Both prove the row is EVENTUALLY dispatched by a real runWakeEngineCycle, not merely that the
// checkpoint number looks right.
// =====================================================================================
test("#1 (round-7, native adversarial leg): redrive() rewinds a checkpoint it advanced past — the no-race DIRECT path (redrive an already-resolved dead-letter whose type is NOW wake-bound)", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_1r7b_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_1r7b");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // The low-seq event: dead-lettered DIRECTLY as 'resolved' — never drained through the normal
  // router batch flow, so no wake_intent exists for it yet. WAKE_EVENT_TYPE is covered and
  // wake-bound in the currently-active taxonomy from the start, so a SINGLE redrive() call below
  // goes straight to the mint branch — no reopen, no concurrency, no race at all.
  const lowEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const lowSeq = Number(lowEvent.seq);
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
       values ('router',$1,$2,$3,$4,'#1 round-7b battery: simulated already-resolved dead-letter, never drained','resolved',now())`,
    [lowEvent.id, w.firm, lowSeq, WAKE_EVENT_TYPE],
  );

  // A fully materialized, genuinely claimable held row at a HIGHER seq — claiming it drives the
  // wake_engine checkpoint PAST lowSeq (bound-3 excludes nothing for an already-RESOLVED
  // dead-letter, so this is the checkpoint's own correct, non-buggy behavior at THIS point).
  const highIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [highIntent.intentId])).rows[0].event_seq);
  const highTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [highIntent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [highIntent.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [highIntent.intentId, randomUUID()]);
  assert.ok(highSeq > lowSeq, "mandatory setup: the dead-letter's own seq is genuinely lower than the claimable row's");

  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  const enqueued1 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued1.push(a), log: () => {} }));
  const highRow = await rig.readTask(highTask);
  assert.equal(highRow.status, "running", "mandatory setup: the higher-seq row claimed normally");
  const cpBefore = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(
    cpBefore && Number(cpBefore.last_seq) >= lowSeq,
    "mandatory setup: THE TRAP IS SET — the wake_engine checkpoint has genuinely advanced past (or onto) the resolved dead-letter's own seq, correctly, since bound-3 excludes nothing for a resolved row",
  );

  // THE PROBE: redrive the ALREADY-RESOLVED dead-letter. No concurrency, no intervening reopen —
  // decision is wake-bound from the start, so this goes straight to the mint branch. Pre-fix,
  // this minted intent(lowSeq) below an already-advanced checkpoint and never rewound it — the
  // row would have been born already invisible.
  const res = await rig.asRuntime((c) => redrive(c, ROUTER_CONSUMER, lowEvent.id));
  assert.equal(res.resolved, true);
  assert.equal(res.wakeBound, true, "mandatory: this redrive genuinely minted a wake-bound intent");

  const cpAfter = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(
    cpAfter && Number(cpAfter.last_seq) < lowSeq,
    "#1 (round-7b): THE CORE ASSERTION — redrive() itself must have rewound the wake_engine checkpoint back below the seq it just minted an intent at",
  );

  // Materialize the newly-minted intent into a held row (mirrors every other cell's own pattern
  // in this file — the wake_intents -> held agent_tasks drain is a separate mechanism this
  // battery always constructs by hand) and prove it is EVENTUALLY dispatched by a real cycle.
  const lowIntentId = (await rig.rootQuery("select id from clara.wake_intents where event_id=$1", [lowEvent.id])).rows[0].id;
  const lowTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [lowIntentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [lowIntentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [lowIntentId, randomUUID()]);

  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const lowRow = await rig.readTask(lowTask);
  assert.equal(lowRow.status, "running", "#1 (round-7b): the low-seq row is EVENTUALLY dispatched — never permanently stranded below an already-advanced checkpoint");
  assert.equal(enqueued2.length, 1);
  assert.equal(enqueued2[0][1], lowTask);
});

test("#1 (round-7, native adversarial leg): redrive() rewinds a checkpoint it advanced past — the LOSING ordering (checkpoint advances past a resolved dead-letter, redrive() reopens it while still uncovered, a taxonomy repoint covers it, redrive() again mints)", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_1r7a_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_1r7a");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  const origVersion = await rig.activeTaxonomyVersion();
  // round-9b (db-estate fallout, "two cars first meeting" — the checkpoint-durability family's
  // own test residue meets packages/db's full-coverage census for the first time in the shared
  // estate suite): this custom type is deliberately UNCOVERED for part of this test's own
  // lifetime, and its event_types row is NEVER deleted afterward (matching this file's own D6
  // cell and relay-taxonomy.test.mjs's sibling X5/flip cells, none of which clean up either) —
  // the reserved `rig.%` namespace is the established, house-wide convention EVERY db-side
  // full-coverage test (rig-events-structure.test.mjs §7, s6-tasks.test.mjs P5/P6,
  // wave-a-shape.test.mjs §3, rig-docs-events.test.mjs §3.7 — all four explicitly comment on and
  // exclude it) relies on to tolerate exactly this residue on a SHARED estate DB. This literal
  // was minted `g1.round7a.uncov.*` — outside that namespace — so it silently broke all four the
  // first time CI's own db-estate leg ran packages/runtime's tests and packages/db's tests
  // against the SAME migrated+seeded database with no reset between them (pnpm -r, no per-
  // package isolation). Fixed to match this file's own sibling pattern
  // (relay-taxonomy.test.mjs's `rig.uncov2.`/`rig.uncovered.`) exactly.
  const uncoveredType = `rig.g1round7a.uncov.${Date.now().toString(36)}`;

  try {
    // A CUSTOM event type, genuinely uncovered by the CURRENT taxonomy — the only way to reach
    // redrive()'s own (X5b) reopen branch (decision === undefined) for real, not simulated. Also
    // needs its OWN registered wake_outbox source (a different event_type than WAKE_EVENT_TYPE),
    // or the eventual held row would sit "held for disabled source" forever, never claimed.
    const key2 = `g1_test_1r7a2_${randomUUID().slice(0, 8)}`;
    await registerSource({ sourceKey: key2, carrier: "wake_outbox", eventType: uncoveredType, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });
    await rig.rootQuery("insert into clara.event_types (name, client_scoped, description) values ($1, false, 'g1 round-7a uncovered')", [uncoveredType]);
    await rig.asFnOwner((c) =>
      c.query(
        `select clara._append_event(p_firm => $1, p_type => $2, p_client => null, p_actor => $3,
            p_obo => null, p_wake_kind => null, p_entry => null, p_document => null,
            p_resolution => null, p_payload => '{}'::jsonb)`,
        [w.firm, uncoveredType, w.owner],
      ),
    );
    const lowEventRow = await rig.asRoot(async (c) => {
      const r = await c.query("select id, seq from clara.domain_events where firm_id = $1 and event_type = $2 limit 1", [w.firm, uncoveredType]);
      return r.rows[0];
    });
    const lowEventId = lowEventRow.id;
    const lowSeq = Number(lowEventRow.seq);

    // Dead-lettered DIRECTLY as 'resolved' — how it GOT resolved does not matter to this bug
    // (round-6's own #1 cell above uses the identical shortcut); what matters is that it IS
    // resolved when the checkpoint advances past it, correctly, per bound-3's own design.
    await rig.rootQuery(
      `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
         values ('router',$1,$2,$3,$4,'#1 round-7a battery: simulated already-resolved dead-letter, still uncovered','resolved',now())`,
      [lowEventId, w.firm, lowSeq, uncoveredType],
    );

    // A fully materialized, genuinely claimable held row at a HIGHER seq, over WAKE_EVENT_TYPE's
    // own registered source — drives the wake_engine checkpoint PAST lowSeq.
    const highIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
    const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [highIntent.intentId])).rows[0].event_seq);
    const highTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [highIntent.intentId])).rows[0].id;
    await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [highIntent.intentId]);
    await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [highIntent.intentId, randomUUID()]);
    assert.ok(highSeq > lowSeq, "mandatory setup: the dead-letter's own seq is genuinely lower than the claimable row's");

    const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
    await rig.rootQuery(
      `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
         on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
      [w.firm, head],
    );

    const enqueued1 = [];
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued1.push(a), log: () => {} }));
    const highRow = await rig.readTask(highTask);
    assert.equal(highRow.status, "running", "mandatory setup: the higher-seq row claimed normally");
    const cpAfterClaim = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
    assert.ok(
      cpAfterClaim && Number(cpAfterClaim.last_seq) >= lowSeq,
      "mandatory setup: THE TRAP IS SET — the wake_engine checkpoint has genuinely advanced past (or onto) the resolved dead-letter's own seq before any reopen",
    );

    // Step 1: redrive() while STILL genuinely uncovered — the real (X5b) reopen branch, not
    // simulated raw SQL. Must NOT mint anything.
    const reopenRes = await rig.asRuntime((c) => redrive(c, ROUTER_CONSUMER, lowEventId));
    assert.deepEqual(reopenRes, { resolved: false, reason: "still-uncovered" });
    const dlAfterReopen = (await rig.rootQuery("select status from clara.relay_dead_letters where consumer='router' and event_id=$1", [lowEventId])).rows[0];
    assert.equal(dlAfterReopen.status, "pending", "mandatory: the reopen actually landed — resolved -> pending, for real, via redrive() itself");

    // Step 2: cover the type as wake-bound via a REAL taxonomy repoint (mirrors relay-taxonomy
    // .test.mjs's own (f) "TAXONOMY FLIP" pattern).
    const nextVersion = await rig.asRoot(async (c) => {
      const r = await c.query("select coalesce(max(version), 0) + 1 as v from clara.taxonomy_versions");
      return Number(r.rows[0].v);
    });
    await rig.rootQuery("insert into clara.taxonomy_versions (version, note) values ($1, $2)", [nextVersion, "g1 round-7a battery"]);
    await rig.rootQuery(
      "insert into clara.trigger_taxonomy (version, event_type, decision) select $1, event_type, decision from clara.trigger_taxonomy where version = $2",
      [nextVersion, origVersion],
    );
    await rig.rootQuery("insert into clara.trigger_taxonomy (version, event_type, decision) values ($1, $2, 'background_review')", [nextVersion, uncoveredType]);
    await rig.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [nextVersion]);

    // Step 3: redrive() AGAIN — now covered and wake-bound, so this is the mint branch. THE
    // PROBE: the checkpoint is still sitting at/past lowSeq from the claim above; pre-fix this
    // mints below it and never rewinds.
    const res2 = await rig.asRuntime((c) => redrive(c, ROUTER_CONSUMER, lowEventId));
    assert.equal(res2.resolved, true);
    assert.equal(res2.wakeBound, true, "mandatory: the covering redrive genuinely minted a wake-bound intent");

    const cpAfterMint = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
    assert.ok(
      cpAfterMint && Number(cpAfterMint.last_seq) < lowSeq,
      "#1 (round-7a): THE CORE ASSERTION — the covering redrive rewound the wake_engine checkpoint back below the reopened-then-minted seq",
    );

    // Materialize the newly-minted intent and prove it is EVENTUALLY dispatched.
    const lowIntentId = (await rig.rootQuery("select id from clara.wake_intents where event_id=$1", [lowEventId])).rows[0].id;
    const lowTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [lowIntentId])).rows[0].id;
    await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [lowIntentId]);
    await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [lowIntentId, randomUUID()]);

    const enqueued2 = [];
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
    const lowRow = await rig.readTask(lowTask);
    assert.equal(lowRow.status, "running", "#1 (round-7a): the low-seq row is EVENTUALLY dispatched — never permanently stranded below an already-advanced checkpoint, even through the LOSING reopen-then-cover ordering");
    assert.equal(enqueued2.length, 1);
    assert.equal(enqueued2[0][1], lowTask);
  } finally {
    // ALWAYS restore the global taxonomy pointer — this mutates GLOBAL state (matches
    // relay-taxonomy.test.mjs's own (f) test's own finally block, bulletproof no-op if already there).
    await rig.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [origVersion]);
  }
});

// =====================================================================================
// MUST A (round-8, BOTH review legs, independently constructed) — round-7's rewind writes the
// checkpoint DIRECTLY, but its CALLER (runWakeEngineCycle/processWakeOutboxFirm) carries
// `priorSeq` as an IN-MEMORY cursor across an entire cycle — potentially many
// advanceCheckpointIfClear calls, with the wake_coalesce lock released BETWEEN each one. A
// redrive() landing in that gap rewinds the PERSISTED checkpoint; the NEXT call still passes the
// stale (too-high) cursor, so its own hasHiddenHeldRow window starts too high to see the
// newly-materialized held row, and writeCheckpoint's own greatest() silently RE-RAISES the
// checkpoint straight back past the rewind — erasing round-7's own fix within the SAME cycle.
// Fix (wake-engine.mjs's own advanceCheckpointIfClear): re-read the LIVE checkpoint under the
// lock on every call, floor everything on effectivePrior = min(priorSeq, liveCp), and RETURN
// effectivePrior (not the stale input) whenever nothing advances — since every call site already
// threads the return value into the variable it next passes as priorSeq, correcting the return
// value here self-heals every later call in the SAME cycle automatically, closing BOTH interleave
// windows below through the identical mechanism (stated here per the coordinator's own ask, not
// left implicit).
//
// Both cells drive the REAL runWakeEngineCycle's own internals — never simulated, never a second
// session — by injecting the redrive()+drain as a side effect of the TEST'S OWN `enqueue` hook,
// which the engine itself calls, on the SAME connection, at the EXACT point between two
// checkpoint-advancing calls the interleave needs to land. This is deliberately sequential-but-
// precisely-timed rather than concurrent: the whole point is that NO race or second session is
// needed for this hole — a single execution thread hitting the two calls in the wrong order is
// sufficient, exactly as MUST A's own real-world trace describes.
// =====================================================================================

/** Materializes an already-minted wake_intent into a genuinely claimable held row — the
 *  drain-simulation idiom every cell in this file already uses by hand. */
async function materializeHeldRowForEvent(eventId) {
  const intentId = (await rig.rootQuery("select id from clara.wake_intents where event_id=$1", [eventId])).rows[0].id;
  const taskId = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intentId, randomUUID()]);
  return taskId;
}

test("MUST A (round-8) cell (i): the TRAILING-COALESCE erasure — a redrive+drain landing between a batch's own claims and its end-of-batch coalesceIfSafe call must not silently re-raise the checkpoint past a mid-cycle rewind", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_r8i_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_r8i");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // The low-seq event: dead-lettered DIRECTLY as 'resolved' (the round-7b shortcut — how it got
  // resolved does not matter to THIS bug); WAKE_EVENT_TYPE is covered+wake-bound from the start,
  // so the interleaved redrive() below goes straight to the mint branch, no reopen needed.
  const lowEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const lowSeq = Number(lowEvent.seq);
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
       values ('router',$1,$2,$3,$4,'MUST-A round-8 (i) battery: simulated already-resolved dead-letter','resolved',now())`,
    [lowEvent.id, w.firm, lowSeq, WAKE_EVENT_TYPE],
  );

  // ONE claimable held row at a HIGHER seq — this batch's own claim raises the checkpoint to
  // highSeq; the trailing coalesce (rows.length < batchSize) fires right after, on the SAME
  // in-memory cursor the claim's own advanceCheckpointIfClear call just returned.
  const highIntent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const highSeq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [highIntent.intentId])).rows[0].event_seq);
  const highTask = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [highIntent.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [highIntent.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [highIntent.intentId, randomUUID()]);
  assert.ok(highSeq > lowSeq, "mandatory setup: the dead-letter's own seq is genuinely lower than the claimable row's");

  // round-8 debugging note (kept as a comment, not a mistake to repeat): safeCoalesceBound's own
  // bound-1 is the ROUTER's own checkpoint value — NOT capped by firm_event_seq, but if seeded at
  // EXACTLY `head` (== highSeq here, since highSeq is this firm's last real event), it caps the
  // trailing coalesce's own `target` at exactly highSeq too, making `target <= effectivePrior`
  // true regardless of the fix under test and masking the erasure entirely (no write is even
  // attempted, so nothing can be silently mis-written). Seed it comfortably ABOVE head so bound-1
  // is never the limiting factor — the trailing coalesce must be free to WANT to advance well
  // past highSeq for this cell to exercise anything.
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head + 1000],
  );

  const enqueued = [];
  let interleaveRan = false;
  let lowTask = null;
  let redriveResult = null;
  await rig.asRuntime((c) =>
    runWakeEngineCycle(c, {
      onlyFirm: w.firm,
      log: () => {},
      // THE INTERLEAVE: fires as a side effect of the batch's OWN claim of the higher-seq row —
      // strictly AFTER that claim's own advanceCheckpointIfClear call has already committed (the
      // real code calls enqueue() only after that), and strictly BEFORE this batch's own trailing
      // coalesceIfSafe call runs (the loop has not returned to the caller yet — the trailing
      // coalesce is still to come, right after this row loop finishes). Same connection, same
      // client — a real interleave inside the cycle's own internals, not a simulation.
      enqueue: async (...a) => {
        enqueued.push(a);
        if (!interleaveRan) {
          interleaveRan = true;
          redriveResult = await redrive(c, ROUTER_CONSUMER, lowEvent.id);
          lowTask = await materializeHeldRowForEvent(lowEvent.id);
        }
      },
    }),
  );

  assert.equal(interleaveRan, true, "mandatory: the interleave actually fired mid-cycle, not before or after runWakeEngineCycle");
  assert.ok(redriveResult && redriveResult.resolved === true && redriveResult.wakeBound === true, "mandatory: the interleaved redrive genuinely minted a wake-bound intent");
  assert.ok(lowTask, "mandatory: the interleaved drain materialized a genuinely held row");

  const highRow = await rig.readTask(highTask);
  assert.equal(highRow.status, "running", "MUST A (i): the higher-seq row still claims and dispatches normally");

  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(
    cp && Number(cp.last_seq) < lowSeq,
    `MUST A (i): THE CORE ASSERTION — the SAME cycle's own trailing coalesce must not silently re-raise the checkpoint past the mid-cycle rewind; got last_seq=${cp && cp.last_seq}, must stay below ${lowSeq}`,
  );

  // Prove the row is EVENTUALLY dispatched, not merely that the checkpoint number looks right.
  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const lowRow = await rig.readTask(lowTask);
  assert.equal(lowRow.status, "running", "MUST A (i): the low-seq row is EVENTUALLY dispatched on the very next cycle — never permanently stranded by the trailing-coalesce erasure");
  assert.equal(enqueued2.length, 1);
  assert.equal(enqueued2[0][1], lowTask);
});

test("MUST A (round-8) cell (ii): the CLAIMED-ROW-ADVANCE erasure — a redrive+drain landing between two claims in the SAME batch must not let the LATER claim's own advance (still carrying the pre-rewind cursor) re-raise the checkpoint", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_r8ii_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_r8ii");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  // The low-seq event, resolved dead-letter, exactly as cell (i).
  const lowEvent = await rig.emitWakeEvent(w.firm, { actor: w.owner });
  const lowSeq = Number(lowEvent.seq);
  await rig.rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
       values ('router',$1,$2,$3,$4,'MUST-A round-8 (ii) battery: simulated already-resolved dead-letter','resolved',now())`,
    [lowEvent.id, w.firm, lowSeq, WAKE_EVENT_TYPE],
  );

  // THREE claimable held rows at ascending higher seqs (the coordinator's own trace: 200/210/220
  // — reproduced with three genuinely distinct rows here, not two, to match it exactly). All
  // three must land in the SAME batch read (well under batchSize) so the SAME `rows` for-loop
  // processes claim(A) -> [interleave] -> claim(B) -> claim(C) without ever returning to the
  // caller between them.
  const mkHigh = async () => {
    const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
    const seq = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent.intentId])).rows[0].event_seq);
    const taskId = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
    await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent.intentId]);
    await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent.intentId, randomUUID()]);
    return { seq, taskId };
  };
  const rowA = await mkHigh();
  const rowB = await mkHigh();
  const rowC = await mkHigh();
  assert.ok(rowA.seq < rowB.seq && rowB.seq < rowC.seq, "mandatory setup: three genuinely ascending claimable rows");
  assert.ok(lowSeq < rowA.seq, "mandatory setup: the dead-letter's own seq is genuinely lower than every claimable row");

  // round-8 debugging note (see cell (i)'s own identical note): seed the router checkpoint
  // comfortably ABOVE head, never AT it — bound-1 in safeCoalesceBound is the raw router
  // checkpoint value, and pinning it exactly at head can coincidentally cap `target` at the last
  // claimed row's own seq for reasons that have nothing to do with THIS cell's own mechanism,
  // masking the erasure this cell exists to exercise.
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head + 1000],
  );

  const enqueued = [];
  let interleaveRan = false;
  let lowTask = null;
  let redriveResult = null;
  await rig.asRuntime((c) =>
    runWakeEngineCycle(c, {
      onlyFirm: w.firm,
      log: () => {},
      // THE INTERLEAVE: fires after row A's own claim (and its own advanceCheckpointIfClear call
      // — cp now at rowA.seq, the in-memory cursor now rowA.seq too) but strictly BEFORE row B's
      // own claim/advance runs — the for-loop is mid-iteration, has not reached the trailing
      // coalesce at all. Row B's (and row C's) own advanceCheckpointIfClear call is what MUST
      // re-derive the floor instead of trusting the stale rowA.seq cursor.
      enqueue: async (...a) => {
        enqueued.push(a);
        if (!interleaveRan) {
          interleaveRan = true;
          redriveResult = await redrive(c, ROUTER_CONSUMER, lowEvent.id);
          lowTask = await materializeHeldRowForEvent(lowEvent.id);
        }
      },
    }),
  );

  assert.equal(interleaveRan, true, "mandatory: the interleave fired between row A's own claim and row B's, not at the trailing coalesce");
  assert.ok(redriveResult && redriveResult.resolved === true && redriveResult.wakeBound === true, "mandatory: the interleaved redrive genuinely minted a wake-bound intent");
  assert.ok(lowTask, "mandatory: the interleaved drain materialized a genuinely held row");
  assert.equal(enqueued.length, 3, "mandatory: all three rows (A, B, C) were claimed in this SAME batch/cycle — the interleave landed mid-batch, not degenerated to a second cycle");

  for (const row of [rowA, rowB, rowC]) {
    const r = await rig.readTask(row.taskId);
    assert.equal(r.status, "running", `MUST A (ii): row at seq=${row.seq} still claims and dispatches normally regardless of the checkpoint staying conservative`);
  }

  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.ok(
    cp && Number(cp.last_seq) < lowSeq,
    `MUST A (ii): THE CORE ASSERTION — row B's (and row C's) own advance, carrying the PRE-rewind cursor from row A's claim, must not silently re-raise the checkpoint past the mid-batch rewind; got last_seq=${cp && cp.last_seq}, must stay below ${lowSeq}`,
  );

  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const lowRow = await rig.readTask(lowTask);
  assert.equal(lowRow.status, "running", "MUST A (ii): the low-seq row is EVENTUALLY dispatched on the very next cycle — never permanently stranded by the claimed-row-advance erasure");
  assert.equal(enqueued2.length, 1);
  assert.equal(enqueued2[0][1], lowTask);
});

// =====================================================================================
// M2 (Codex review) — the kill switch used a STALE per-cycle snapshot: loadEnabledSources runs
// ONCE at the top of runWakeEngineCycle, so a set_wake_source_enabled(false) call landing
// mid-cycle used to keep claiming the REST of an already-in-flight batch against the stale
// in-memory sources object. Separately, reconciler-wake.mjs's own resolveSource filtered on
// `enabled`, so a task legitimately claimed BEFORE the disable, if it then needed crash
// recovery, was refused re-enqueue FOREVER once the source was disabled — invisible, never
// dead-lettered, never retried. Two cells: the claim-time half, and the recovery half.
// =====================================================================================
test("M2: a source disabled MID-CYCLE stops claiming the rest of an in-flight batch — the row it stops on stays visibly held, checkpoint never advances past it", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m2_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m2");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  const intent1 = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task1 = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent1.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent1.intentId]);
  // SHOULD-1 (round-5): drain's own real shape flips the wake_intent to 'consumed' in the SAME
  // transaction it creates the held task in (never leaving a 'pending' intent alongside an
  // already-materialized held row) — safeCoalesceBound's own bound-2 now depends on this being
  // true (a 'pending' intent is treated as NOT YET materialized), matching #1(a)/#1(b)/M1's own
  // already-established fixture pattern.
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent1.intentId, randomUUID()]);
  const seq1 = Number((await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent1.intentId])).rows[0].event_seq);

  const intent2 = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task2 = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent2.intentId])).rows[0].id;
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent2.intentId]);
  await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent2.intentId, randomUUID()]);

  // SHOULD-1 (round-5): advanceCheckpointIfClear now ALSO caps by safeCoalesceBound's own
  // bound-1 (the router's own checkpoint) — with none seeded, bound-1 defaults to 0 and would
  // cap EVERY advance in this cycle to 0 regardless of what this test is actually isolating.
  // Seed it at head, mirroring M1's own established pattern, so this cell isolates the M2
  // mid-cycle-disable concern specifically, not a side effect of an absent router checkpoint.
  const head = Number((await rig.rootQuery("select n from clara.firm_event_seq where firm_id=$1", [w.firm])).rows[0].n);
  await rig.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('router',$1,$2)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [w.firm, head],
  );

  const enqueued = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, {
    onlyFirm: w.firm,
    enqueue: async (...args) => {
      enqueued.push(args);
      // Disable the source the INSTANT the first task dispatches — simulating a concurrent
      // set_wake_source_enabled(false) landing mid-cycle, between the two rows' claims.
      if (enqueued.length === 1) {
        await rig.rootQuery("update clara.wake_engine_sources set enabled=false where source_key=$1", [key]);
      }
    },
    log: () => {},
  }));

  assert.equal(enqueued.length, 1, "M2: only the FIRST row dispatched — the second row's claim was refused by the fresh in-transaction enabled re-check");
  assert.equal(enqueued[0][1], task1);
  const row1 = await rig.readTask(task1);
  assert.equal(row1.status, "running", "M2: the first row (claimed before the disable) is unaffected");
  const row2 = await rig.readTask(task2);
  assert.equal(row2.status, "held", "M2: the second row (claim attempted AFTER the disable) stays held, untouched — never claimed against a stale snapshot");
  const cp = (await rig.rootQuery("select last_seq from clara.relay_checkpoints where consumer='wake_engine' and firm_id=$1", [w.firm])).rows[0];
  assert.equal(Number(cp.last_seq), seq1, "M2: the checkpoint stops at the first (successfully claimed) row — never advances past the disabled-mid-cycle second row, which would strand it exactly like M1");
});

test("M2 recovery: a stuck running/no-run task whose source has since been DISABLED is still recovered by the reconciler — visible, never stranded", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m2r_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m2r");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  // A wake task is born 'held' (the insert-time invariant) -- claim it (held->running) as its
  // own step, then simulate: the row WAS legitimately claimed (running, workflow_run_id still
  // null — the crash-between-commit-and-enqueue shape reconcileWakeEngineTasks §A recovers)
  // while the source was enabled — and the source has SINCE been disabled, before recovery runs.
  const task = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  await rig.rootQuery("update clara.wake_engine_sources set enabled=false where source_key=$1", [key]);

  const reenq = [];
  await rig.asRuntime((c) => reconcileWakeEngineTasks(c, {
    onlyFirm: w.firm,
    enqueue: async (...a) => reenq.push(a),
    getRun: async () => ({ status: "running" }),
    graceInterval: "0 seconds",
    log: () => {},
  }));
  assert.equal(reenq.length, 1, "M2 recovery: the reconciler still recovers a claimed-but-now-disabled task — visible, never stranded, the pre-fix behaviour silently dropped this forever");
  assert.equal(reenq[0][1], task);
});

// =====================================================================================
// M4 (both legs) — the direct_queue carrier's poison-exhaustion terminal (queued->failed) was
// ILLEGAL in close_prep's own matrix arm pre-fix: the UPDATE raised CLR13, which was NOT
// caught, aborting the WHOLE wake-engine cycle every time it fired — the poisoned row stayed
// queued forever and the dead-letter count overran its own cap on every subsequent re-attempt.
// A genuine, isolated claim failure (the SAME trigger-injection recipe D6 uses, since MUST F
// removed the credential-mint failure surface this poison mechanism used to rely on) proves
// BOTH halves: the poisoned task terminalizes to 'failed', and a HEALTHY task in the SAME
// cycle, SAME source, still gets processed — the cycle continues, it does not crash.
// =====================================================================================
test("M4: a poisoned close_prep claim terminalizes to 'failed' (queued->failed, now legal) instead of crashing the whole cycle — a healthy task in the SAME cycle still dispatches", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m4_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m4");
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", maxAttempts: 1, enabled: true, actor: w.owner });

  const poisonTask = (await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  )).rows[0].id;
  const healthyTask = (await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  )).rows[0].id;

  // Inject a genuine, isolated claim failure on ONLY the poison task — the same real-trigger
  // recipe D6 uses (mocks can't see triggers), never a config-only "poison" that MUST F's
  // credential-mint removal already retired. Scoped to `new.status = 'running'` — the CLAIM
  // UPDATE's own target status — not a bare `old.id = poisonTask`: this row gets TWO separate
  // UPDATEs in the poisoned path (the claim attempt, then the exhaustion-terminal
  // queued->failed write), and an unscoped trigger poisons BOTH, which would make the terminal
  // write ITSELF fail too — a real, separate bug this cell found and wake-engine.mjs's own
  // exhaustion-terminal try/catch now handles correctly (leaves the row 'queued' rather than
  // crashing the cycle), but is not what THIS cell means to prove. Scoping to the claim's own
  // target status isolates the claim failure only, leaving the terminal write unpoisoned.
  const poisonFn = `g1_test_m4_poison_${randomUUID().slice(0, 8)}`;
  await rig.rootQuery(`create function clara.${poisonFn}() returns trigger language plpgsql as $f$ begin raise exception 'g1 battery M4: deliberate poison injection'; end $f$`);
  await rig.rootQuery(`create trigger ${poisonFn} before update on clara.agent_tasks for each row when (old.id = '${poisonTask}'::uuid and new.status = 'running') execute function clara.${poisonFn}()`);

  const enqueued = [];
  try {
    await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued.push(a), log: () => {} }));

    const poisonRow = await rig.readTask(poisonTask);
    assert.equal(poisonRow.status, "failed", "M4: the poisoned task terminalizes to 'failed' — pre-fix this UPDATE itself raised CLR13 (queued->failed was illegal), crashing the whole cycle before it ever reached the healthy task below");
    assert.equal(poisonRow.error_code, "internal");

    const healthyRow = await rig.readTask(healthyTask);
    assert.equal(healthyRow.status, "running", "M4: the healthy task, in the SAME cycle and SAME source's own row loop, still dispatches — the cycle continued past the poison, it did not crash");
    assert.ok(enqueued.some((a) => a[1] === healthyTask), "M4: the healthy task was actually enqueued");
  } finally {
    await rig.rootQuery(`drop trigger if exists ${poisonFn} on clara.agent_tasks`);
    await rig.rootQuery(`drop function if exists clara.${poisonFn}()`);
  }
});

// =====================================================================================
// #6 (round-4 review, both legs + opus SHOULD-A, converged) — the CLAIM path's own ledger used
// to be attempted UNCONDITIONALLY every cycle, checked only AFTER a claim failed — mirroring the
// exact pre-fix M6 shape, but on processDirectQueueSource's own claim UPDATE rather than the
// reconciler's enqueue() call. Two cells, mirroring M6's own pair: cap-exact on the claim mode,
// and an exhausted task never re-attempts a claim (and therefore never dispatches) even once the
// poison lifts.
// =====================================================================================
test("#6: a claim that always fails exhausts the CLAIM ledger to an exact hard cap — the task settles 'failed', and the claim dead-letter count never overruns it", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_6claim_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_6claim");
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", maxAttempts: 2, enabled: true, actor: w.owner });

  const poisonTask = (await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  )).rows[0].id;
  // Poison ONLY the claim's own target (`new.status='running'`) — matching M4's own established
  // scoping, so the exhaustion-terminal write (new.status='failed') stays unpoisoned and can
  // actually land once the cap is reached.
  const poisonFn = `g1_test_6claim_poison_${randomUUID().slice(0, 8)}`;
  await rig.rootQuery(`create function clara.${poisonFn}() returns trigger language plpgsql as $f$ begin raise exception 'g1 battery #6: deliberate claim-poison injection'; end $f$`);
  await rig.rootQuery(`create trigger ${poisonFn} before update on clara.agent_tasks for each row when (old.id = '${poisonTask}'::uuid and new.status = 'running') execute function clara.${poisonFn}()`);

  const sweep = () => rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async () => {}, log: () => {} }));
  try {
    await sweep(); // attempt 1/2 -- claim fails, recorded on the CLAIM ledger, stays 'queued'
    let row = await rig.readTask(poisonTask);
    assert.equal(row.status, "queued", "mandatory setup: not yet exhausted after 1 claim attempt (max_attempts=2)");

    await sweep(); // attempt 2/2 -- claim fails again -> exhausted -> terminal settle (unpoisoned)
    row = await rig.readTask(poisonTask);
    assert.equal(row.status, "failed", "#6: the task settles 'failed' once the CLAIM ledger reaches max_attempts");
    const dl = await rig.rootQuery(
      "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
      [WAKE_ENGINE_CLAIM_CONSUMER, poisonTask],
    );
    assert.equal(dl.rows[0].attempt_count, 2, "#6: the CLAIM ledger's own count stops EXACTLY at max_attempts — never overruns it");

    // Sweep 3: 'failed' is no longer 'queued' -- outside the direct_queue SELECT's own WHERE
    // clause entirely; no further claim attempt, no further ledger growth.
    await sweep();
    const dl2 = await rig.rootQuery(
      "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
      [WAKE_ENGINE_CLAIM_CONSUMER, poisonTask],
    );
    assert.equal(dl2.rows[0].attempt_count, 2, "#6: still exactly 2 — a hard cap, not merely a threshold crossed once");
  } finally {
    await rig.rootQuery(`drop trigger if exists ${poisonFn} on clara.agent_tasks`);
    await rig.rootQuery(`drop function if exists clara.${poisonFn}()`);
  }
});

test("#6: once the CLAIM ledger is exhausted, a later cycle never re-attempts the claim (and so never dispatches) even after the poison lifts — exhaustion is STICKY on the claim ledger too", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_6claim2_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1_6claim2");
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", maxAttempts: 1, enabled: true, actor: w.owner });

  const poisonTask = (await rig.rootQuery(
    `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
       values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
    [w.firm, w.client],
  )).rows[0].id;
  // Poison BOTH the claim's own target AND the exhaustion-terminal write this time — simulating
  // the exhaustion-terminal settle ALSO failing (M4's own accepted "leave 'queued' for a later
  // sweep" path), so the task stays 'queued' despite already being at the cap.
  const poisonFn = `g1_test_6claim2_poison_${randomUUID().slice(0, 8)}`;
  await rig.rootQuery(`create function clara.${poisonFn}() returns trigger language plpgsql as $f$ begin raise exception 'g1 battery #6: deliberate claim+terminal poison injection'; end $f$`);
  await rig.rootQuery(`create trigger ${poisonFn} before update on clara.agent_tasks for each row when (old.id = '${poisonTask}'::uuid) execute function clara.${poisonFn}()`);

  const enqueued1 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued1.push(a), log: () => {} }));
  let row = await rig.readTask(poisonTask);
  assert.equal(row.status, "queued", "mandatory setup: the claim failed (max_attempts=1, immediately exhausted) AND the terminal settle itself failed (poisoned too) — stuck 'queued' despite being at the cap");
  const dl = await rig.rootQuery(
    "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
    [WAKE_ENGINE_CLAIM_CONSUMER, poisonTask],
  );
  assert.equal(dl.rows[0].attempt_count, 1, "mandatory setup: exhaustion WAS recorded on the claim ledger despite the terminal settle failure");

  // Lift the poison entirely — if the check-first guard were absent, the NEXT cycle would
  // re-attempt (and this time succeed at) the claim, dispatching a task the cap already meant to
  // stop. With the guard, it must go straight to a (now-successful) terminal re-settle instead.
  await rig.rootQuery(`drop trigger if exists ${poisonFn} on clara.agent_tasks`);
  await rig.rootQuery(`drop function if exists clara.${poisonFn}()`);

  const enqueued2 = [];
  await rig.asRuntime((c) => runWakeEngineCycle(c, { onlyFirm: w.firm, enqueue: async (...a) => enqueued2.push(a), log: () => {} }));
  const rowAfter = await rig.readTask(poisonTask);
  assert.equal(rowAfter.status, "failed", "#6: once the poison lifts, the retried TERMINAL settle finally succeeds");
  assert.equal(enqueued2.length, 0, "#6: THE CORE ASSERTION — the claim was never re-attempted, so nothing was ever dispatched, even though this sweep's own claim UPDATE would have succeeded had it been tried");
  const dl2 = await rig.rootQuery(
    "select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2",
    [WAKE_ENGINE_CLAIM_CONSUMER, poisonTask],
  );
  assert.equal(dl2.rows[0].attempt_count, 1, "#6: the claim ledger's own count is still exactly 1 — the check-first guard skipped straight to the settle-only path, never touching the claim again");
});

// =====================================================================================
// M6 (both legs demanded the cell) — enqueue() was attempted UNCONDITIONALLY every sweep,
// checked only AFTER it failed. Once genuinely exhausted, a settle FAILURE (the
// _settle_wake_task call itself erroring) left the row 'running', so the next sweep
// re-attempted enqueue AGAIN — wasting budget and pushing the dead-letter count arbitrarily
// past its own cap instead of the cap actually stopping anything. Two cells: throwing-enqueue
// exhaustion (a hard cap is reached and respected), and settle-failure-then-resweep (exhaustion
// is STICKY — a second sweep never re-attempts enqueue, only the settle retries).
// =====================================================================================
test("M6: an enqueue() that always throws exhausts to a hard cap — the task settles 'failed', and the dead-letter count never overruns the cap", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m6_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m6");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", maxAttempts: 2, enabled: true, actor: w.owner });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent.intentId]);
  const alwaysThrows = async () => { throw new Error("enqueue always fails in this cell"); };
  const sweep = (enqueueFn) => rig.asRuntime((c) => reconcileWakeEngineTasks(c, { onlyFirm: w.firm, enqueue: enqueueFn, getRun: async () => ({ status: "running" }), graceInterval: "0 seconds", log: () => {} }));

  await sweep(alwaysThrows); // attempt 1/2
  let row = await rig.readTask(task);
  assert.equal(row.status, "running", "mandatory setup: not yet exhausted after 1 attempt (max_attempts=2)");

  await sweep(alwaysThrows); // attempt 2/2 -> exhausted -> settles
  row = await rig.readTask(task);
  assert.equal(row.status, "failed", "M6: the task settles 'failed' once max_attempts is reached");
  const dl = (await rig.rootQuery("select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2", [WAKE_ENGINE_ENQUEUE_CONSUMER, task])).rows[0];
  assert.equal(dl.attempt_count, 2, "M6: the dead-letter count stops EXACTLY at max_attempts — never overruns it");

  // Sweep 3: 'failed' is no longer 'running' — outside stuck's own WHERE clause entirely.
  let enqueueCalled = false;
  await sweep(async () => { enqueueCalled = true; });
  assert.equal(enqueueCalled, false, "M6: once settled failed, a later sweep does not even select this task again");
  const dl2 = (await rig.rootQuery("select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2", [WAKE_ENGINE_ENQUEUE_CONSUMER, task])).rows[0];
  assert.equal(dl2.attempt_count, 2, "M6: the dead-letter count is still exactly 2 — a hard cap, not merely a threshold crossed once");
});

test("M6: a settle FAILURE after exhaustion does NOT re-attempt enqueue on the next sweep — exhaustion is STICKY, only the settle retries", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_m6s_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1m6s");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", maxAttempts: 1, enabled: true, actor: w.owner });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const task = (await rig.rootQuery("insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id", [intent.intentId])).rows[0].id;
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [intent.intentId]);

  // Poison the SETTLE itself (not the claim) — _settle_wake_task's own internal UPDATE on
  // agent_tasks fires this trigger too, the same D6 real-trigger recipe (mocks can't see
  // triggers).
  const poisonFn = `g1_test_m6_poison_${randomUUID().slice(0, 8)}`;
  await rig.rootQuery(`create function clara.${poisonFn}() returns trigger language plpgsql as $f$ begin raise exception 'g1 battery M6: deliberate settle-failure injection'; end $f$`);
  await rig.rootQuery(`create trigger ${poisonFn} before update on clara.agent_tasks for each row when (old.id = '${task}'::uuid) execute function clara.${poisonFn}()`);
  const sweep = (enqueueFn) => rig.asRuntime((c) => reconcileWakeEngineTasks(c, { onlyFirm: w.firm, enqueue: enqueueFn, getRun: async () => ({ status: "running" }), graceInterval: "0 seconds", log: () => {} }));

  try {
    let enqueueCallCount1 = 0;
    // Sweep 1: enqueue throws -> exhausted immediately (max_attempts=1) -> settle attempted ->
    // settle ITSELF throws (the poison trigger) -> caught, logged, task stays running.
    await sweep(async () => { enqueueCallCount1 += 1; throw new Error("enqueue fails"); });
    assert.equal(enqueueCallCount1, 1, "mandatory setup: sweep 1 attempted enqueue once");
    assert.equal((await rig.readTask(task)).status, "running", "mandatory setup: the settle FAILED (poisoned) — still running, not failed");
    let dl = (await rig.rootQuery("select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2", [WAKE_ENGINE_ENQUEUE_CONSUMER, task])).rows[0];
    assert.equal(dl.attempt_count, 1, "mandatory setup: exhaustion WAS recorded despite the settle failure");

    // Sweep 2: the task is STILL 'running' (reappears in `stuck`) — M6's fix must check
    // attempt history FIRST and skip enqueue entirely, retrying ONLY the settle.
    let enqueueCallCount2 = 0;
    await sweep(async () => { enqueueCallCount2 += 1; throw new Error("enqueue fails"); });
    assert.equal(enqueueCallCount2, 0, "M6: sweep 2 does NOT re-attempt enqueue at all — exhaustion is STICKY, only the settle retries");
    dl = (await rig.rootQuery("select attempt_count from clara.wake_engine_task_dead_letters where consumer=$1 and task_id=$2", [WAKE_ENGINE_ENQUEUE_CONSUMER, task])).rows[0];
    assert.equal(dl.attempt_count, 1, "M6: the dead-letter count did NOT grow further — the pre-fix bug pushed this arbitrarily past the cap on every resweep");
  } finally {
    await rig.rootQuery(`drop trigger if exists ${poisonFn} on clara.agent_tasks`);
    await rig.rootQuery(`drop function if exists clara.${poisonFn}()`);
  }

  // Sweep 3 (unpoisoned): the retried settle finally succeeds.
  await sweep(async () => { throw new Error("must not be called — enqueue is never re-attempted once exhausted"); });
  assert.equal((await rig.readTask(task)).status, "failed", "M6: once the poison is lifted, the retried settle finally succeeds and the task terminalizes");
});

// =====================================================================================
// S1 (Codex review) — the reconciler's re-enqueue grace window keyed off `created_at`, not
// `updated_at`: a row HELD for a long time (old created_at) before being claimed just seconds
// ago was IMMEDIATELY past grace on the very next sweep, triggering an unnecessary re-enqueue —
// a repeated DURABLE start() every poll for a perfectly healthy claim.
// =====================================================================================
test("S1: a task claimed SECONDS ago (with an OLD created_at from a long-held row) is not treated as stuck — grace keys off updated_at, not created_at", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_s1_${randomUUID().slice(0, 8)}`;
  const w = await rig.buildFirm("g1s1");
  await registerSource({ sourceKey: key, carrier: "wake_outbox", eventType: WAKE_EVENT_TYPE, taskKind: "wake", wakeKind: "proactive", enabled: true, actor: w.owner });

  const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  // Simulate a row that sat HELD for 2 hours (old created_at) before being claimed just now —
  // a wake task is born held (the insert-time invariant), backdate created_at at INSERT time
  // (the immutability trigger only fires on UPDATE), then the held->running claim's own UPDATE
  // re-stamps updated_at=now() automatically, matching a claim that JUST happened.
  const task = (await rig.rootQuery(
    "insert into clara.agent_tasks (origin_intent_id, kind, status, created_at) values ($1,'wake','held', now() - interval '2 hours') returning id",
    [intent.intentId],
  )).rows[0].id;
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  const row = await rig.readTask(task);
  assert.ok(new Date(row.created_at).getTime() < Date.now() - 60 * 60 * 1000, "mandatory setup: created_at is genuinely old (2 hours back)");

  let enqueueCalled = false;
  await rig.asRuntime((c) => reconcileWakeEngineTasks(c, {
    onlyFirm: w.firm,
    enqueue: async () => { enqueueCalled = true; },
    getRun: async () => ({ status: "running" }),
    graceInterval: "15 seconds",
    log: () => {},
  }));
  assert.equal(enqueueCalled, false, "S1: an OLD created_at with a FRESH updated_at (claimed seconds ago) must NOT be re-enqueued — the pre-fix bug keyed grace off created_at and would have fired immediately here");

  // Control: a SEPARATE task whose updated_at is ALSO genuinely stale IS correctly picked up.
  // t_agent_task_update's own `new.updated_at:=now()` is UNCONDITIONAL on every UPDATE — there
  // is no ordinary way to land a stale updated_at on a 'running' row (birth requires 'held',
  // and any UPDATE off 'held' re-stamps updated_at fresh) — so this control backdates via a
  // direct catalog write with the trigger momentarily disabled, restored in a finally.
  const intent2 = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
  const staleTask = (await rig.rootQuery(
    "insert into clara.agent_tasks (origin_intent_id, kind, status, created_at) values ($1,'wake','held', now() - interval '2 hours') returning id",
    [intent2.intentId],
  )).rows[0].id;
  await rig.rootQuery("alter table clara.agent_tasks disable trigger t_agent_task_update");
  try {
    await rig.rootQuery("update clara.agent_tasks set status='running', updated_at = now() - interval '1 hour' where id=$1", [staleTask]);
  } finally {
    await rig.rootQuery("alter table clara.agent_tasks enable trigger t_agent_task_update");
  }
  const enqueuedTasks2 = [];
  await rig.asRuntime((c) => reconcileWakeEngineTasks(c, {
    onlyFirm: w.firm,
    enqueue: async (workflowExport, taskId) => enqueuedTasks2.push(taskId),
    getRun: async () => ({ status: "running" }),
    graceInterval: "15 seconds",
    log: () => {},
  }));
  assert.ok(enqueuedTasks2.includes(staleTask), "S1 control: once updated_at is genuinely stale, the row IS re-enqueued — the fix narrows the false positive, it does not disable recovery");
  assert.ok(!enqueuedTasks2.includes(task), "S1: the FRESH task from above is STILL untouched by this second sweep — its own updated_at is still recent");
});

// =====================================================================================
// S5 (both legs) — discoverDirectQueueFirms (MUST E's own production-shape discovery) had no
// ORDER BY on its DISTINCT/LIMIT query (undefined result ordering — could starve the same
// firms cycle after cycle once distinct-firm count exceeds the batch limit) and no supporting
// index (a full sequential scan of agent_tasks every production cycle). Proves: several firms'
// direct_queue work is all discovered and dispatched together (no arbitrary subset dropped
// under the batch limit), and the supporting index is live in the catalog.
// =====================================================================================
test("S5: several firms' direct_queue work is ALL discovered together in the production shape (no onlyFirm) — deterministic, not an arbitrary subset", { skip: skip || skipG1 }, async () => {
  const key = `g1_test_s5_${randomUUID().slice(0, 8)}`;
  const firms = [];
  for (let i = 0; i < 3; i++) firms.push(await rig.buildFirm(`g1s5${i}`));
  await registerSource({ sourceKey: key, carrier: "direct_queue", taskKind: "close_prep", wakeKind: "close_prep", enabled: true, actor: firms[0].owner });

  const tasks = [];
  for (const f of firms) {
    const t = (await rig.rootQuery(
      `insert into clara.agent_tasks (firm_id, client_id, kind, status, model_snapshot)
         values ($1,$2,'close_prep','queued','gpt-5.6-terra') returning id`,
      [f.firm, f.client],
    )).rows[0].id;
    tasks.push(t);
  }

  const enqueued = [];
  // NO onlyFirm — the real production shape MUST E fixed.
  await rig.asRuntime((c) => runWakeEngineCycle(c, { enqueue: async (...a) => enqueued.push(a), log: () => {} }));
  for (const t of tasks) {
    assert.ok(enqueued.some((a) => a[1] === t), `S5: task ${t} (one of ${firms.length} distinct firms) was discovered and dispatched — none arbitrarily dropped`);
  }

  const idx = (await rig.rootQuery("select 1 from pg_indexes where schemaname='clara' and tablename='agent_tasks' and indexname='ix_agent_tasks_kind_queued'")).rows;
  assert.equal(idx.length, 1, "S5: the supporting partial index (ix_agent_tasks_kind_queued) is live in the catalog");
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
