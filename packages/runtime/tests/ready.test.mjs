// /ready fail-vs-warn matrix (contract §4.7). checkReadiness FAILS on DB unreachable,
// world dead, control dead, taxonomy HALT, or the second consecutive storage-write
// failure; relay lag/dead-letters/backlog remain warnings. Exercised against clara_rt_test by
// toggling the world switch and heartbeat freshness. (Taxonomy-HALT is NOT exercised here —
// removing the shared active pointer would corrupt the relay suite.)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as rig from "./rig.mjs";
import { checkReadiness } from "../lib/health.mjs";
import { StorageError } from "../lib/storage.mjs";
import { endPools } from "../lib/pools.mjs";
import {
  _refreshStorageProbeForTest,
  _resetStorageProbeCacheForTest,
  _waitForStorageProbeSettleForTest,
} from "../lib/storage-probe.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

// checkReadiness() now folds in the storage write probe (R9), which — like the four sibling
// storage tests (intake-unit.test.mjs et al.) — needs CLARA_TEST_STORAGE_DIR set, or
// storage.mjs's RELAY_TEST_MODE local-fs fallback (testRoot()) lands at ./test-storage
// relative to CWD, i.e. INSIDE THE REPO WORKING TREE when run from packages/runtime/ (proven
// by execution 2026-08-27 — untracked files showed up under packages/runtime/test-storage/).
let storageDir;
let previousStorageDir;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  storageDir = await mkdtemp(join(base, "clara-ready-storage-"));
  previousStorageDir = process.env.CLARA_TEST_STORAGE_DIR;
  process.env.CLARA_TEST_STORAGE_DIR = storageDir;
});

after(async () => {
  await rig.endPool();
  // Stop the storage probe's background interval before its scratch dir disappears below.
  _resetStorageProbeCacheForTest();
  if (previousStorageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorageDir;
  if (storageDir) await rm(storageDir, { recursive: true, force: true }).catch(() => {});
});

async function setBeat(component, expr) {
  await rig.asRuntime((c) =>
    c.query(`insert into clara.runtime_heartbeats (component, beat_at) values ($1, ${expr}) on conflict (component) do update set beat_at=${expr}`, [component]),
  );
}

test("ready: skeleton mode (world off) is READY on DB reachability alone", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  try {
    const r = await checkReadiness();
    assert.equal(r.ready, true, "ready in skeleton mode");
    assert.equal(r.checks.db.ok, true);
    assert.equal(r.checks.world.enabled, false, "world reported informational");
  } finally {
    if (prev !== undefined) process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with fresh world+control beats is READY", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const r = await checkReadiness();
    assert.equal(r.ready, true, `ready with fresh beats (${JSON.stringify(r.checks)})`);
    assert.ok("storage_write" in r.checks, "the storage probe verdict must surface under its failing-check name");
    assert.equal(r.checks.world.ok, true);
    assert.equal(r.checks.control.ok, true);
    assert.equal(r.checks.taxonomy.ok, true, "seed taxonomy pointer present");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: storage write hard-fails on the second consecutive failure and one success recovers", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  delete process.env.CLARA_START_WORLD;
  _resetStorageProbeCacheForTest();
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError("storage_error", "simulated write rejection");
    },
  };
  try {
    await _waitForStorageProbeSettleForTest();
    const first = await checkReadiness();
    assert.equal(first.ready, true, "one transient storage failure stays inside the tolerance");
    assert.deepEqual(first.checks.storage_write, {
      ok: false,
      reason: "storage_error",
      pending: false,
      consecutive_failures: 1,
    });

    await _refreshStorageProbeForTest();
    const second = await checkReadiness();
    assert.equal(second.ready, false, "the second consecutive storage failure is a hard readiness failure");
    assert.deepEqual(second.checks.storage_write, {
      ok: false,
      reason: "storage_error",
      pending: false,
      consecutive_failures: 2,
    });
    assert.ok(
      second.warnings.some((warning) => warning.includes("storage write probe failed (2 consecutive)")),
      `expected the count-bearing storage warning, got ${JSON.stringify(second.warnings)}`,
    );

    delete globalThis.__claraStorageForTest;
    await _refreshStorageProbeForTest();
    const recovered = await checkReadiness();
    assert.equal(recovered.ready, true, "one successful write probe clears the hard failure immediately");
    assert.deepEqual(recovered.checks.storage_write, {
      ok: true,
      reason: null,
      pending: false,
      consecutive_failures: 0,
    });
  } finally {
    delete globalThis.__claraStorageForTest;
    _resetStorageProbeCacheForTest();
    if (prev !== undefined) process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with a STALE world beat FAILS (world dead)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now() - interval '10 minutes'");
    await setBeat("control", "now()");
    const r = await checkReadiness();
    assert.equal(r.ready, false, "not ready when the world beat is stale");
    assert.equal(r.checks.world.ok, false, "world check failed");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

// round-8 (SHOULD D, native adversarial leg) — wakeEngineHealth's own heldBelowCheckpoint
// counter (round-7's defense-in-depth for the checkpoint-durability hole family) was computed
// but INERT: every sibling wake-engine signal gets wired into a /ready WARN, this one alone did
// not, so the docstring's own "surfaces on /ready" claim was false as shipped. This cell
// constructs the strand shape DIRECTLY (a held wake row whose own event_seq sits at its firm's
// wake_engine checkpoint) rather than via a full engine cycle — proving the WIRING specifically,
// not the mechanism that produces the shape (wake-engine.test.mjs's own cells own that).
test("ready: a held wake-engine row at/below its firm's own checkpoint WARNs on /ready (never a FAIL)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now()");
    const w = await rig.buildFirm("ready-strand");
    const intent = await rig.makeConsumableIntent({ ownerSub: w.owner, client: w.client });
    const seq = Number(
      (await rig.rootQuery("select event_seq from clara.wake_intents where id=$1", [intent.intentId])).rows[0].event_seq,
    );
    const taskId = (
      await rig.rootQuery(
        "insert into clara.agent_tasks (origin_intent_id, kind, status) values ($1,'wake','held') returning id",
        [intent.intentId],
      )
    ).rows[0].id;
    await rig.rootQuery("insert into clara.wakes_outbox (intent_id, condition, status) values ($1,'background_review','held')", [
      intent.intentId,
    ]);
    await rig.rootQuery("update clara.wake_intents set status='consumed', consumed_by=$2 where id=$1", [intent.intentId, randomUUID()]);
    assert.ok(taskId, "mandatory setup: the held row exists");
    // Seed the wake_engine checkpoint directly AT this row's own seq — the exact strand shape
    // heldBelowCheckpoint exists to catch (readHeldWakeRows' own event_seq > lastSeq gate would
    // never surface this row again), constructed directly rather than via a full engine cycle.
    await rig.rootQuery(
      `insert into clara.relay_checkpoints (consumer, firm_id, last_seq) values ('wake_engine',$1,$2)
         on conflict (consumer,firm_id) do update set last_seq = greatest(clara.relay_checkpoints.last_seq, excluded.last_seq)`,
      [w.firm, seq],
    );
    const r = await checkReadiness();
    assert.equal(r.ready, true, "a strand is a WARN, never a /ready FAIL — the load-balancer must keep routing");
    assert.ok(
      r.warnings.some((x) => /held wake-engine row\(s\) sitting AT OR BELOW/.test(x)),
      `expected a heldBelowCheckpoint WARN line, got: ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: world ON with a STALE control beat FAILS (control listener dead)", { skip }, async () => {
  const prev = process.env.CLARA_START_WORLD;
  process.env.CLARA_START_WORLD = "1";
  try {
    await setBeat("world", "now()");
    await setBeat("control", "now() - interval '10 minutes'");
    const r = await checkReadiness();
    assert.equal(r.ready, false, "not ready when the control beat is stale");
    assert.equal(r.checks.control.ok, false, "control check failed");
  } finally {
    if (prev === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = prev;
  }
});

test("ready: a DB-only failure still hard-fails while storage is healthy", { skip }, async () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    runtimeDatabaseUrl: process.env.CLARA_RUNTIME_DATABASE_URL,
    pgHost: process.env.PGHOST,
    pgPort: process.env.PGPORT,
    startWorld: process.env.CLARA_START_WORLD,
  };
  delete process.env.DATABASE_URL;
  delete process.env.CLARA_RUNTIME_DATABASE_URL;
  delete process.env.CLARA_START_WORLD;
  process.env.PGHOST = "127.0.0.1";
  process.env.PGPORT = "1";
  _resetStorageProbeCacheForTest();
  try {
    await _waitForStorageProbeSettleForTest();
    await endPools();
    const r = await checkReadiness();
    assert.equal(r.ready, false, "DB unreachability remains a hard readiness failure");
    assert.deepEqual(r.checks.db, { ok: false, error: "db_timeout" });
    assert.equal(r.checks.storage_write.ok, true, "the failure is DB-only, not storage-derived");
  } finally {
    await endPools();
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.runtimeDatabaseUrl === undefined) delete process.env.CLARA_RUNTIME_DATABASE_URL;
    else process.env.CLARA_RUNTIME_DATABASE_URL = previous.runtimeDatabaseUrl;
    if (previous.pgHost === undefined) delete process.env.PGHOST;
    else process.env.PGHOST = previous.pgHost;
    if (previous.pgPort === undefined) delete process.env.PGPORT;
    else process.env.PGPORT = previous.pgPort;
    if (previous.startWorld === undefined) delete process.env.CLARA_START_WORLD;
    else process.env.CLARA_START_WORLD = previous.startWorld;
    _resetStorageProbeCacheForTest();
  }
});
