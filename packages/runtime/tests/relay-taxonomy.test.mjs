// Slice-3 relay — taxonomy-facing behaviour: (c) zero active pointer HALT, the
// (X5) redrive edge cases, and (f) redrive-after-coverage + the (D4) taxonomy
// flip. These mutate GLOBAL state (the singleton pointer) and each RESTORES it in
// a finally. Contract: docs/plan/completed/slice3-event-spine-contract.md §2.9 / D3 / D4.

import { test } from "node:test";
import assert from "node:assert/strict";

import { redrive, TaxonomyHaltError, CONSUMER } from "../lib/relay.mjs";
import * as fx from "./relay-fixtures.mjs";
import { skip, drainInProcess, assertExactlyOnce, runRedriveCli } from "./relay-testkit.mjs";

// ===========================================================================
// (c) ZERO-ACTIVE-POINTER — HALT loudly, checkpoint frozen, zero dead-letters
// ===========================================================================

test("(c) zero active pointer: relay HALTS, no advance, no dead-letters; restore drains", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("halt");
  await fx.pumpDocuments(owner, client, 4, "halt"); // pending work exists
  const origVersion = await fx.activeTaxonomyVersion();

  // Empty the singleton pointer as superuser (disable the user guard trigger so
  // the DELETE lands — allowed on this throwaway).
  await fx.rootQuery("alter table clara.taxonomy_active disable trigger user");
  await fx.rootQuery("delete from clara.taxonomy_active");

  try {
    const before = await fx.checkpointSeq(firm);
    let halted = null;
    try {
      await drainInProcess(firm, { batchSize: 3 });
    } catch (err) {
      halted = err;
    }
    assert.ok(halted instanceof TaxonomyHaltError, `HALTs with TaxonomyHaltError (got ${halted?.name}: ${halted?.message})`);
    assert.equal(await fx.checkpointSeq(firm), before, "checkpoint frozen (no advance past an un-routable state)");
    assert.equal((await fx.deadLettersForFirm(firm)).length, 0, "zero dead-letters while halted");
  } finally {
    await fx.rootQuery("insert into clara.taxonomy_active (singleton, version) values (true, $1)", [origVersion]);
    await fx.rootQuery("alter table clara.taxonomy_active enable trigger user");
  }

  await drainInProcess(firm, { batchSize: 3 });
  await assertExactlyOnce(firm, 4);
});

// ===========================================================================
// (X5) REDRIVE edge cases — missing dead-letter throws; still-uncovered reopens
//      a resolved row. No taxonomy repoint (the uncovered type is simply never
//      covered), so no global-state restore needed.
// ===========================================================================

test("(X5) redrive: missing dead-letter throws; still-uncovered reopens a resolved row", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("x5");

  // (X5a) a covered, never-dead-lettered event ⇒ redrive throws (never resolved:true).
  await fx.pumpDocuments(owner, client, 1, "x5-cov");
  const coveredEventId = await fx.asRoot(async (c) => {
    const r = await c.query(
      "select id from clara.domain_events where firm_id = $1 and event_type = $2 order by seq limit 1",
      [firm, fx.WAKE_EVENT_TYPE],
    );
    return r.rows[0].id;
  });
  await assert.rejects(
    () => fx.asRuntime((c) => redrive(c, CONSUMER, coveredEventId)),
    /no dead-letter/i,
    "redriving an event with no dead-letter must throw, not report resolved",
  );

  // (X5b) an uncovered event: dead-letter it, force it RESOLVED, then redrive while
  // still uncovered ⇒ it must REOPEN to pending and bump attempt_count.
  const uncoveredType = `rig.uncov2.${Date.now().toString(36)}`;
  await fx.rootQuery("insert into clara.event_types (name, client_scoped, description) values ($1, false, 'x5 uncovered')", [
    uncoveredType,
  ]);
  await fx.asFnOwner((c) =>
    c.query(
      `select clara._append_event(p_firm => $1, p_type => $2, p_client => null, p_actor => $3,
          p_obo => null, p_wake_kind => null, p_entry => null, p_document => null,
          p_resolution => null, p_payload => '{}'::jsonb)`,
      [firm, uncoveredType, owner],
    ),
  );
  const event2Id = await fx.asRoot(async (c) => {
    const r = await c.query("select id from clara.domain_events where firm_id = $1 and event_type = $2 limit 1", [firm, uncoveredType]);
    return r.rows[0].id;
  });

  await drainInProcess(firm, { batchSize: 3 }); // dead-letters event2 (uncovered under v1)
  await fx.asRuntime((c) =>
    c.query("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
      CONSUMER,
      event2Id,
    ]),
  );

  const res = await fx.asRuntime((c) => redrive(c, CONSUMER, event2Id));
  assert.deepEqual(res, { resolved: false, reason: "still-uncovered" });
  const dl = (await fx.deadLettersForFirm(firm)).find((d) => d.eventId === event2Id);
  assert.equal(dl.status, "pending", "a still-uncovered redrive REOPENS a resolved dead-letter");
  assert.equal(dl.attemptCount, 2, "attempt_count bumped");
});

// ===========================================================================
// #1 (round-6, Codex) — redrive() now takes the SAME per-firm advisory lock
// (wake-engine.mjs's own advanceCheckpointIfClear, 'wake_coalesce:'||firm_id) BEFORE either of
// its own exit branches, closing a TOCTOU: the wake-engine's own checkpoint-writer bounds
// itself on THIS dead-letter's live status, and without serialization a reopen landing between
// that bound read and the checkpoint write would go unseen. Proven here the SAME way N1 proves
// wake_source_gate's own JS/SQL pairing (packages/db/tests/g1-wake-engine.test.mjs) — a real
// cross-session block via pg_blocking_pids, never a spelling comparison: hold the EXACT literal
// wake-engine.mjs uses open on one session, call the REAL redrive() on another, prove it
// genuinely blocks behind the holder regardless of which of redrive()'s own two branches it is
// about to take.
// ===========================================================================
test("#1 (round-6, Codex): redrive() takes the SAME wake_coalesce advisory lock wake-engine.mjs's own checkpoint-writer does — a real cross-session block, not a spelling match", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("x1lock");

  // Any legitimate dead-letter works — the lock is acquired before redrive() ever branches on
  // covered-vs-uncovered, so this cell does not need to construct the uncovered-type fixture
  // the X5 cell above does.
  await fx.pumpDocuments(owner, client, 1, "x1lock-cov");
  const eventId = await fx.asRoot(async (c) => {
    const r = await c.query(
      "select id from clara.domain_events where firm_id = $1 and event_type = $2 order by seq limit 1",
      [firm, fx.WAKE_EVENT_TYPE],
    );
    return r.rows[0].id;
  });
  await fx.asRuntime((c) =>
    c.query(
      `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status)
         select $1, id, firm_id, seq, event_type, 'x1lock battery: forced dead-letter for the lock-pairing probe', 'pending'
           from clara.domain_events where id = $2`,
      [CONSUMER, eventId],
    ),
  );

  let holderPid;
  let releaseLock;
  const lockHeld = new Promise((resolve) => { releaseLock = resolve; });
  let lockAcquired;
  const lockIsHeld = new Promise((resolve) => { lockAcquired = resolve; });
  const c1 = await fx.getPool().connect();
  const holderDone = (async () => {
    await c1.query("begin");
    holderPid = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    // The EXACT literal wake-engine.mjs's own advanceCheckpointIfClear uses — a mismatch here
    // would silently defeat the whole #1 fix, so this string is deliberately not factored
    // through a shared helper that could drift independently on either side.
    await c1.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`wake_coalesce:${firm}`]);
    lockAcquired();
    await lockHeld;
    await c1.query("rollback");
  })();
  await lockIsHeld;

  let redriveDone = false;
  const redrivePromise = fx.asRuntime((c) => redrive(c, CONSUMER, eventId)).then((r) => { redriveDone = true; return r; });

  let blocked = false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await fx.rootQuery(
      "select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and $1 = any(pg_blocking_pids(pid))",
      [holderPid],
    );
    if (r.rows[0].n > 0) {
      blocked = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 25));
  }

  releaseLock();
  await holderDone;
  c1.release();
  const result = await redrivePromise;

  assert.equal(blocked, true, "#1 (round-6): THE CORE ASSERTION — redrive() must be observably BLOCKED behind the JS-side's own held wake_coalesce lock; if the two literals ever desync, this call would race straight through instead");
  assert.equal(redriveDone, true, "mandatory: once the lock released, redrive() actually completed");
  assert.equal(result.resolved, true, "mandatory setup: this dead-letter's own event type IS covered (wake-bound), so redrive resolves it — proving the lock acquisition happens before EITHER branch, not just the reopen one");
});

// ===========================================================================
// (f) REDRIVE + (D4) TAXONOMY FLIP — uncovered ⇒ dead-letter ⇒ cover ⇒ redrive;
//     batches straddling the repoint each carry exactly one version.
// ===========================================================================

test("(f) uncovered ⇒ dead-letter, redrive after coverage; flip stamps one version per batch", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("flip");
  const origVersion = await fx.activeTaxonomyVersion();
  const uncoveredType = `rig.uncovered.${Date.now().toString(36)}`;

  try {
    // ---- Phase v1: pump covered docs + emit ONE uncovered event -------------
    await fx.pumpDocuments(owner, client, 3, "flip-v1");
    await fx.rootQuery("insert into clara.event_types (name, client_scoped, description) values ($1, false, 'relay redrive test')", [
      uncoveredType,
    ]);
    await fx.asFnOwner((c) =>
      c.query(
        `select clara._append_event(p_firm => $1, p_type => $2, p_client => null, p_actor => $3,
            p_obo => null, p_wake_kind => null, p_entry => null, p_document => null,
            p_resolution => null, p_payload => '{}'::jsonb)`,
        [firm, uncoveredType, owner],
      ),
    );
    const uncoveredEventId = await fx.asRoot(async (c) => {
      const r = await c.query("select id from clara.domain_events where firm_id = $1 and event_type = $2 limit 1", [firm, uncoveredType]);
      return r.rows[0].id;
    });

    await drainInProcess(firm, { batchSize: 3 });
    {
      const intentsV1 = await fx.wakeIntentsForFirm(firm);
      assert.equal(intentsV1.length, 3, "3 wake intents from the covered docs");
      for (const it of intentsV1) assert.equal(it.taxonomyVersion, origVersion, "phase-v1 intents stamped v1");
      const dls = await fx.deadLettersForFirm(firm);
      assert.equal(dls.length, 1, "the uncovered event is dead-lettered");
      assert.equal(dls[0].eventId, uncoveredEventId);
      assert.equal(dls[0].status, "pending");
      assert.equal(await fx.checkpointSeq(firm), await fx.headSeq(firm), "checkpoint advanced past the dead-lettered event");
    }

    // ---- Add coverage: a NEW version covering everything + the uncovered type -
    const nextVersion = await fx.asRoot(async (c) => {
      const r = await c.query("select coalesce(max(version), 0) + 1 as v from clara.taxonomy_versions");
      return Number(r.rows[0].v);
    });
    await fx.rootQuery("insert into clara.taxonomy_versions (version, note) values ($1, $2)", [nextVersion, "relay flip test"]);
    await fx.rootQuery(
      "insert into clara.trigger_taxonomy (version, event_type, decision) select $1, event_type, decision from clara.trigger_taxonomy where version = $2",
      [nextVersion, origVersion],
    );
    await fx.rootQuery("insert into clara.trigger_taxonomy (version, event_type, decision) values ($1, $2, 'internal_task')", [
      nextVersion,
      uncoveredType,
    ]);
    await fx.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [nextVersion]);

    // ---- Phase v2: pump more docs, drain under v2 --------------------------
    await fx.pumpDocuments(owner, client, 3, "flip-v2");
    await drainInProcess(firm, { batchSize: 3 });

    const intents = await fx.wakeIntentsForFirm(firm);
    const v1 = intents.filter((i) => i.taxonomyVersion === origVersion);
    const v2 = intents.filter((i) => i.taxonomyVersion === nextVersion);
    assert.equal(v1.length, 3, "the phase-v1 batch's intents still carry exactly v1");
    assert.equal(v2.length, 3, "the phase-v2 batch's intents carry exactly v2 (one version per batch, D4)");
    assert.equal(intents.length, 6, "no batch mixed versions");

    // ---- Redrive the dead-lettered event under the now-covering v2 (CLI, D3) -
    const res1 = await runRedriveCli(uncoveredEventId);
    assert.deepEqual(res1, { resolved: true, decision: "internal_task", wakeBound: true });

    const afterRedrive = await fx.wakeIntentsForFirm(firm);
    const forEvent = afterRedrive.filter((i) => i.eventId === uncoveredEventId);
    assert.equal(forEvent.length, 1, "the redriven intent appears EXACTLY once");
    assert.equal(forEvent[0].decision, "internal_task");
    assert.equal(forEvent[0].taxonomyVersion, nextVersion, "redriven intent stamped the active (v2) version");
    const dlNow = (await fx.deadLettersForFirm(firm)).find((d) => d.eventId === uncoveredEventId);
    assert.equal(dlNow.status, "resolved", "the dead-letter is marked resolved");

    // Redrive again — idempotent.
    const res2 = await fx.asRuntime((c) => redrive(c, CONSUMER, uncoveredEventId));
    assert.equal(res2.resolved, true);
    assert.equal((await fx.wakeIntentsForFirm(firm)).filter((i) => i.eventId === uncoveredEventId).length, 1, "redrive is idempotent");
  } finally {
    // ALWAYS restore the global pointer to the original version (bulletproof —
    // a no-op UPDATE when already there).
    await fx.rootQuery("update clara.taxonomy_active set version = $1 where singleton = true", [origVersion]);
  }
});
