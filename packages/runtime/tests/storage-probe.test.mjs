// R9 storage write probe (docs/plan/active/harness-audit-rulings-2026-08-26.md — follow-up (a)
// of docs/ops/incident-2026-07-26-intake-storage.md). Unit-level: exercises storageProbeHealth()
// directly against storage.mjs's own RELAY_TEST_MODE seams (local-fs fallback + the injectable
// globalThis.__claraStorageForTest shim already defined in storage.mjs), so no DB rig and no
// live Supabase credential are needed. checkReadiness()'s own wiring of checks.storage is
// exercised end to end in ready.test.mjs alongside the rest of the check set (rig-gated, since
// checkReadiness needs the runtime pool).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { StorageError } from "../lib/storage.mjs";
import { storageProbeHealth, _resetStorageProbeCacheForTest } from "../lib/storage-probe.mjs";

let root;
let previousStorageDir;
let previousMode;
let previousCacheMs;
let previousTimeoutMs;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-storage-probe-"));
  previousStorageDir = process.env.CLARA_TEST_STORAGE_DIR;
  previousMode = process.env.RELAY_TEST_MODE;
  previousCacheMs = process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  previousTimeoutMs = process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
  // Caching would hide the failure/timeout/mismatch arms behind the success arm's cached
  // verdict (all four hit the same fixed probe key/process) — disabled by default here; the
  // dedicated caching test below opts back in explicitly.
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "0";
});

after(async () => {
  if (previousStorageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorageDir;
  if (previousMode === undefined) delete process.env.RELAY_TEST_MODE;
  else process.env.RELAY_TEST_MODE = previousMode;
  if (previousCacheMs === undefined) delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  else process.env.CLARA_STORAGE_PROBE_CACHE_MS = previousCacheMs;
  if (previousTimeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
  else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previousTimeoutMs;
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  delete globalThis.__claraStorageForTest;
  _resetStorageProbeCacheForTest();
});

test("storage probe: success arm — write, read back, bytes match -> ok:true", async () => {
  const r = await storageProbeHealth();
  assert.equal(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
  assert.equal(r.cached, false, "a fresh (uncached) probe reports cached:false");
});

test("storage probe: storage-failure arm — a write rejection reports not-ok with a reason, never throws", async () => {
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError("storage_error", "simulated permission denied (403)");
    },
  };
  const r = await storageProbeHealth();
  assert.equal(r.ok, false, "a write failure must not report ok:true");
  assert.equal(r.reason, "storage_error");
});

test("storage probe: timeout arm — a hung storage call resolves not-ok within the bound, never hangs", async () => {
  globalThis.__claraStorageForTest = {
    // Settles well after the shortened hard-timeout below, simulating a wedged/slow-to-answer
    // storage backend — long enough to prove the RACE (the timeout branch wins), but not
    // eternal: node:test flags a truly-never-settling promise left dangling past a test's own
    // completion as a leak, and the abandoned call (like health.mjs's own bounded()) is left to
    // finish in the background regardless, exactly as it would in production.
    put: () => new Promise((resolve) => setTimeout(() => resolve({ created: true, existed: false }), 200)),
  };
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "50";
  try {
    const startedAt = Date.now();
    const r = await storageProbeHealth();
    const elapsedMs = Date.now() - startedAt;
    assert.equal(r.ok, false, "a timed-out probe must not report ok:true");
    assert.equal(r.reason, "storage_probe_timeout");
    assert.ok(elapsedMs < 2_000, `expected the timeout bound (50ms) to cap latency, took ${elapsedMs}ms`);
  } finally {
    // Restore the default deadline so it cannot bleed into a later test's timing budget.
    if (previousTimeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
    else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previousTimeoutMs;
  }
});

test("storage probe: read-back-mismatch arm — tampered bytes on readback report not-ok, never a silent pass", async () => {
  globalThis.__claraStorageForTest = {
    // put is left un-injected (falls through to the real local-fs write); only the readback
    // is tampered with, isolating the mismatch check from the write check.
    get: async () => Readable.from([Buffer.from("this-is-not-the-probe-payload")]),
  };
  const r = await storageProbeHealth();
  assert.equal(r.ok, false, "a readback mismatch must not report ok:true");
  assert.equal(r.reason, "storage_probe_readback_mismatch");
});

test("storage probe: the verdict is cached — a second call inside the cache window skips the network round trip", async () => {
  let putCalls = 0;
  globalThis.__claraStorageForTest = {
    put: async () => {
      putCalls += 1;
      return { created: true, existed: false };
    },
    get: async () => Readable.from([Buffer.from("clara-ready-storage-probe-v1\n")]),
  };
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "60000";
  try {
    const first = await storageProbeHealth();
    assert.equal(first.ok, true);
    assert.equal(first.cached, false, "the first call after a reset must be a live probe");
    assert.equal(putCalls, 1);

    const second = await storageProbeHealth();
    assert.equal(second.ok, true);
    assert.equal(second.cached, true, "a call inside the cache window must be served from cache");
    assert.equal(putCalls, 1, "a cached verdict must not re-touch storage");

    _resetStorageProbeCacheForTest();
    const third = await storageProbeHealth();
    assert.equal(third.cached, false, "resetting the cache forces the next call to re-probe");
    assert.equal(putCalls, 2);
  } finally {
    process.env.CLARA_STORAGE_PROBE_CACHE_MS = "0";
  }
});
