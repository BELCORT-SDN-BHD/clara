// An adapter/filesystem operation can ignore AbortSignal (mkdtemp and rm have no signal
// option in the Node 20 contract). Such a cycle must time out as RED and eventually release
// refresh ownership, while a settleable timed-out cycle still keeps the no-overlap guarantee.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readinessHasHardFailure } from "../lib/readiness-policy.mjs";
import {
  _refreshStorageProbeForTest,
  _resetStorageProbeCacheForTest,
  _waitForStorageProbeSettleForTest,
  storageProbeHealth,
} from "../lib/storage-probe.mjs";

function within(promise, ms, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

test("STORAGE-PROBE-UNABORTABLE: a wedged cycle releases the slot and late settlement cannot recover it", async () => {
  const previous = {
    mode: process.env.RELAY_TEST_MODE,
    storageDir: process.env.CLARA_TEST_STORAGE_DIR,
    timeoutMs: process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS,
    cacheMs: process.env.CLARA_STORAGE_PROBE_CACHE_MS,
  };
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  const storageDir = await mkdtemp(join(base, "clara-storage-unabortable-"));
  const lateResolvers = [];
  process.env.RELAY_TEST_MODE = "1";
  process.env.CLARA_TEST_STORAGE_DIR = storageDir;
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "1000";

  try {
    const warm = await _waitForStorageProbeSettleForTest();
    assert.deepEqual(warm, { ok: true, reason: null, pending: false, consecutive_failures: 0 });
    process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "100";

    globalThis.__claraStorageForTest = {
      // Deliberately ignores options.signal: this models an unabortable filesystem/storage hang.
      put: () => new Promise((resolve) => lateResolvers.push(resolve)),
    };

    const first = await within(
      _refreshStorageProbeForTest(),
      1000,
      "the first unabortable timeout kept refresh ownership forever",
    );
    assert.deepEqual(first, {
      ok: false,
      reason: "storage_probe_timeout",
      pending: false,
      consecutive_failures: 1,
    });

    const second = await within(
      _refreshStorageProbeForTest(),
      1000,
      "the second deterministic refresh never acquired the released slot",
    );
    assert.deepEqual(second, {
      ok: false,
      reason: "storage_probe_timeout",
      pending: false,
      consecutive_failures: 2,
    });
    assert.equal(
      readinessHasHardFailure({ db: { ok: true }, storage_write: second }, false),
      true,
      "two unabortable timeouts must hard-fail readiness",
    );

    // The timed-out operation later reports success, but only its timeout verdict may mutate
    // the cache. Resolving both hangs also lets their scratch cleanup finish before teardown.
    for (const resolve of lateResolvers) resolve({ created: true, existed: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(
      storageProbeHealth(),
      second,
      "late success must not reset the failure counter or mutate the settled pending state",
    );

    _resetStorageProbeCacheForTest();
    lateResolvers.length = 0;
    globalThis.__claraStorageForTest = {
      put: () => new Promise((resolve) => lateResolvers.push(resolve)),
    };
    const cold = await within(
      _waitForStorageProbeSettleForTest(),
      1000,
      "a cold unabortable timeout kept refresh ownership forever",
    );
    assert.equal(cold.pending, true, "a failed cold proof must remain pending");
    lateResolvers[0]({ created: true, existed: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(
      storageProbeHealth(),
      cold,
      "late success after a cold timeout must not clear pending or reset the count",
    );
  } finally {
    for (const resolve of lateResolvers) resolve({ created: true, existed: false });
    delete globalThis.__claraStorageForTest;
    _resetStorageProbeCacheForTest();
    if (previous.mode === undefined) delete process.env.RELAY_TEST_MODE;
    else process.env.RELAY_TEST_MODE = previous.mode;
    if (previous.storageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
    else process.env.CLARA_TEST_STORAGE_DIR = previous.storageDir;
    if (previous.timeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
    else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previous.timeoutMs;
    if (previous.cacheMs === undefined) delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
    else process.env.CLARA_STORAGE_PROBE_CACHE_MS = previous.cacheMs;
    await rm(storageDir, { recursive: true, force: true });
  }
});
