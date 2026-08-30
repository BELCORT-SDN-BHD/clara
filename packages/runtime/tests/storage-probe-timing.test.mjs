import { test } from "node:test";
import assert from "node:assert/strict";
import {
  _resetStorageProbeCacheForTest,
  _waitForStorageProbeSettleForTest,
  startStorageProbe,
} from "../lib/storage-probe.mjs";

test("storage probe timing: oversized cache is scheduled at Node's maximum delay, never its 1ms overflow", async () => {
  const previous = {
    cacheMs: process.env.CLARA_STORAGE_PROBE_CACHE_MS,
    timeoutMs: process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS,
  };
  const originalInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalWarn = console.warn;
  const intervalDelays = [];
  const warnings = [];
  globalThis.setInterval = (_fn, delay) => {
    intervalDelays.push(delay);
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};
  console.warn = (...args) => warnings.push(args.join(" "));
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "2147483648";
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "3000";
  try {
    startStorageProbe();
    await _waitForStorageProbeSettleForTest();
    assert.equal(intervalDelays[0], 2147483647, "Node must receive its maximum safe delay, not an overflowing value");
    assert.deepEqual(warnings, [
      "[storage-probe] CLARA_STORAGE_PROBE_CACHE_MS clamped to [1000, 2147483647]: 2147483647ms",
    ]);
  } finally {
    _resetStorageProbeCacheForTest();
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClearInterval;
    console.warn = originalWarn;
    if (previous.cacheMs === undefined) delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
    else process.env.CLARA_STORAGE_PROBE_CACHE_MS = previous.cacheMs;
    if (previous.timeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
    else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previous.timeoutMs;
  }
});

test("storage probe timing: a timeout whose 3x ownership exceeds cache falls back before scheduling", async () => {
  const previous = {
    cacheMs: process.env.CLARA_STORAGE_PROBE_CACHE_MS,
    timeoutMs: process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS,
  };
  const originalTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalWarn = console.warn;
  const timeoutDelays = [];
  const intervalDelays = [];
  const warnings = [];
  const fakeTimer = () => ({ unref() {} });
  globalThis.setTimeout = (_fn, delay) => {
    timeoutDelays.push(delay);
    return fakeTimer();
  };
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = (_fn, delay) => {
    intervalDelays.push(delay);
    return fakeTimer();
  };
  globalThis.clearInterval = () => {};
  console.warn = (...args) => warnings.push(args.join(" "));
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "10000";
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "4000";
  try {
    startStorageProbe();
    await _waitForStorageProbeSettleForTest();
    assert.equal(intervalDelays[0], 10000);
    assert.deepEqual(timeoutDelays, [3000, 6000], "deadline + settlement ownership must use the safe default timeout");
    assert.deepEqual(warnings, [
      "[storage-probe] CLARA_STORAGE_PROBE_TIMEOUT_MS violates 3 * timeout <= CLARA_STORAGE_PROBE_CACHE_MS; using 3000ms",
    ]);
  } finally {
    _resetStorageProbeCacheForTest();
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClearInterval;
    console.warn = originalWarn;
    if (previous.cacheMs === undefined) delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
    else process.env.CLARA_STORAGE_PROBE_CACHE_MS = previous.cacheMs;
    if (previous.timeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
    else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previous.timeoutMs;
  }
});
