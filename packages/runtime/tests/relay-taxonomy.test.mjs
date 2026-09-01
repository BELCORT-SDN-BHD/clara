// Slice-3 relay — taxonomy-facing behaviour: (c) zero active pointer HALT, the
// (X5) redrive edge cases, and (f) redrive-after-coverage + the (D4) taxonomy
// flip. These mutate GLOBAL state (the singleton pointer) and each RESTORES it in
// a finally. Contract: docs/plan/completed/slice3-event-spine-contract.md §2.9 / D3 / D4.
//
// PRIVATE DISPOSABLE DATABASE — the #485/#490 class (committed estate-global writes vs
// pointer-resolving/unscoped-roster reads under `pnpm -r` concurrency; both halves must
// hold — packages/db/tests/wave-a-upgrade.test.mjs's own hardening at its taxonomy
// snapshot is the other half). Under CI's `pnpm -r --if-present test`, this file and
// packages/db's own tests run CONCURRENTLY against the SAME shared clara_ci Postgres.
// Every cell below COMMITS its taxonomy mutations — never a rolled-back transaction: (c)'s
// trigger-disable + delete dance and (f)'s version flip both need CROSS-STATEMENT
// visibility of what they just committed (drainInProcess/runRedriveCli run in separate
// connections/processes), which a savepoint- or transaction-scoped fixture cannot give
// them. So the `clara.taxonomy_active` SINGLETON gets emptied then restored, and (c)
// additionally disables a USER TRIGGER on that shared table for a committed window in
// which the singleton DOES NOT EXIST. Ten packages/db readers resolve `taxonomy_active`
// mid-flight (nine "version-pinned" reads that are actually reading $1 off the very
// pointer this file mutates, plus one unscoped `trigger_taxonomy` snapshot) and would see
// that window, or an unexpected extra version, if this file shared their database.
// Transaction-scoping the fixture would silence the exact cross-statement-commit
// behaviour these cells exist to prove (FORBIDDEN — the test bodies below are otherwise
// unchanged), so the fix is the OTHER side: give this file its OWN disposable database,
// migrated fresh, so its estate-global writes never reach the shared clara_ci at all.
//
// Built directly on packages/db's own migration runner + its existing
// disposable-database harness (packages/db/tests/migrate-harness.mjs, already reused
// across a package boundary by packages/runtime/tests/correction-adjudication.test.mjs) —
// no shared helper for a PRIVATE FULL-SCHEMA database existed for a runtime test file at
// the time this was written, so this duplicates the minimal CREATE DATABASE / migrate /
// DROP DATABASE pattern already proven by packages/db/tests/migrate-lock-serialization.test.mjs
// et al. (idempotent role creation — `if not exists (select 1 from pg_roles ...)` in
// 0002/0006/0131 — makes a from-scratch full migrate safe on a cluster that already has
// clara_ci's roles).
//
// ORDERING IS LOAD-BEARING: the private-DB setup below runs as plain top-level `await`
// code, NOT inside a node:test `before()` hook — a `before()` callback would run too
// late. relay-testkit.mjs (imported by every other relay-*.test.mjs) opens its own pool
// and probes the schema via a top-level `await fx.probeReady()`, and a STATIC import of
// it is hoisted ahead of everything else in this file, hook registrations included. So
// relay.mjs / relay-fixtures.mjs / relay-testkit.mjs are imported DYNAMICALLY here,
// deferred until AFTER `process.env` points at the private, migrated database — never as
// static imports at the top of the file.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../../db/scripts/migrate.mjs";
import { connectionConfig, disposableDatabaseName, setDatabaseEnv } from "../../db/tests/migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_relay_taxonomy");

const admin = new pg.Client(connectionConfig());
await admin.connect();
await admin.query(`create database "${DBNAME}"`);

// Registered as early as possible (right after the database exists) so a THROW from
// migrate() below still leaves the disposable database cleaned up — never reference the
// `fx`/`restoreEnv` bindings declared further down from inside this closure without a
// fallback, since a failure before they are assigned would otherwise leave this hook
// throwing a TDZ ReferenceError instead of actually cleaning up.
let restoreEnv = () => {};
after(async () => {
  try {
    const mod = await import("./relay-fixtures.mjs"); // side-effect-free at import time
    await mod.endPool();
  } catch {
    /* best-effort — the pool may never have been created */
  }
  restoreEnv();
  await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {});
  await admin.end();
});

restoreEnv = setDatabaseEnv(DBNAME);
// No explicit `dir` — migrate()'s own default resolution (dir || CLARA_MIGRATIONS_DIR ||
// its file-relative packages/db/migrations) is what every other rig entrypoint honors;
// overriding it here would silently defeat a deliberate CLARA_MIGRATIONS_DIR override
// (e.g. the deploy-onto-existing CI step's pattern) for this one file alone.
await migrate({ log: () => {} });

// Deferred until the private database above is live — see the header note.
const { redrive, TaxonomyHaltError, CONSUMER, WAKE_ENGINE_CONSUMER } = await import("../lib/relay.mjs");
const fx = await import("./relay-fixtures.mjs");
const { skip, drainInProcess, assertExactlyOnce, runRedriveCli } = await import("./relay-testkit.mjs");

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
  let redrivePid;
  let redrivePidKnown;
  const redrivePidPromise = new Promise((resolve) => { redrivePidKnown = resolve; });
  const redrivePromise = fx
    .asRuntime(async (c) => {
      // round-7 NOTE rider (native adversarial leg): capture THIS specific connection's own
      // backend pid before calling redrive() on it, so the wait below can require exactly THIS
      // pid be blocked — not "some backend, somewhere" (the original check counted ANY backend
      // blocked by holderPid, sound here only because nothing else concurrent existed, not
      // because the check itself pinned down WHICH backend was waiting).
      redrivePid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
      redrivePidKnown();
      return redrive(c, CONSUMER, eventId);
    })
    .then((r) => { redriveDone = true; return r; });
  await redrivePidPromise;

  let blocked = false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await fx.rootQuery(
      "select count(*)::int as n from pg_stat_activity where pid = $1 and wait_event_type = 'Lock' and $2 = any(pg_blocking_pids(pid))",
      [redrivePid, holderPid],
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

// ===========================================================================
// SHOULD C (round-8, native adversarial leg) — the checkpoint rewind used to fire on EVERY call
// to redrive() that reached the wake-bound branch, even an IDEMPOTENT re-redrive of an
// already-drained event whose own insertWakeIntent call hits its own ON CONFLICT DO NOTHING arm
// (no new row, nothing changed) — a harmless but pointless rescan every single time. Fixed:
// insertWakeIntent now reports whether it actually inserted (rowCount > 0); redrive()'s own
// rewind is gated on that flag, so a second (or Nth) redrive of the SAME already-resolved event
// touches the checkpoint not at all.
// ===========================================================================
test("SHOULD C: an idempotent re-redrive of an already-drained event does NOT rewind the wake_engine checkpoint a second time", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("should-c");
  await fx.pumpDocuments(owner, client, 1, "should-c-cov");
  const eventId = await fx.asRoot(async (c) => {
    const r = await c.query(
      "select id from clara.domain_events where firm_id = $1 and event_type = $2 order by seq limit 1",
      [firm, fx.WAKE_EVENT_TYPE],
    );
    return r.rows[0].id;
  });
  await fx.asRuntime((c) =>
    c.query(
      `insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason, status, resolved_at)
         select $1, id, firm_id, seq, event_type, 'should-c battery: simulated already-resolved dead-letter', 'resolved', now()
           from clara.domain_events where id = $2`,
      [CONSUMER, eventId],
    ),
  );

  // Seed the wake_engine checkpoint AT/PAST this event's own seq, so a rewind (if it fired)
  // would be an observable write — the same "trap is set" idiom every MUST A cell above uses.
  const eventSeq = await fx.asRoot(async (c) => {
    const r = await c.query("select seq from clara.domain_events where id = $1", [eventId]);
    return Number(r.rows[0].seq);
  });
  await fx.rootQuery(
    `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ($1,$2,$3)
       on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
    [WAKE_ENGINE_CONSUMER, firm, eventSeq + 1000],
  );

  // FIRST redrive: a genuine mint. The rewind fires (checkpoint is at/past eventSeq) — this half
  // is round-7's own mechanism, re-confirmed here only as mandatory setup for what follows.
  const res1 = await fx.asRuntime((c) => redrive(c, CONSUMER, eventId));
  assert.equal(res1.resolved, true);
  assert.equal(res1.wakeBound, true, "mandatory setup: this event's own type IS wake-bound");
  const cpAfterFirst = (await fx.rootQuery("select last_seq from clara.relay_checkpoints where consumer=$1 and firm_id=$2", [WAKE_ENGINE_CONSUMER, firm])).rows[0];
  assert.equal(Number(cpAfterFirst.last_seq), eventSeq - 1, "mandatory setup: the FIRST redrive's own genuine mint DID rewind the checkpoint");

  // Raise the checkpoint back up past eventSeq again — simulating a LATER, legitimate advance
  // (the row drained and dispatched normally, and the checkpoint caught back up through ordinary
  // operation) — so THE PROBE below has something observable to NOT disturb.
  await fx.rootQuery(
    `update clara.relay_checkpoints set last_seq = $3 where consumer=$1 and firm_id=$2`,
    [WAKE_ENGINE_CONSUMER, firm, eventSeq + 500],
  );

  // THE PROBE: redrive the SAME event again. insertWakeIntent's own ON CONFLICT DO NOTHING means
  // this call mints NOTHING new — the rewind must not fire at all.
  const res2 = await fx.asRuntime((c) => redrive(c, CONSUMER, eventId));
  assert.equal(res2.resolved, true);
  assert.equal(res2.wakeBound, true);

  const cpAfterSecond = (await fx.rootQuery("select last_seq from clara.relay_checkpoints where consumer=$1 and firm_id=$2", [WAKE_ENGINE_CONSUMER, firm])).rows[0];
  assert.equal(
    Number(cpAfterSecond.last_seq),
    eventSeq + 500,
    "SHOULD C: THE CORE ASSERTION — an idempotent re-redrive (no new insert) must leave the wake_engine checkpoint UNTOUCHED, not rewind it a second time for nothing",
  );
});
