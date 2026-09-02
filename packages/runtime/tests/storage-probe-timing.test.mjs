import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  _resetStorageProbeCacheForTest,
  _waitForStorageProbeSettleForTest,
  startStorageProbe,
} from "../lib/storage-probe.mjs";

test("storage probe timing docs: DR runbook carries the clamped range and 3T fallback", async () => {
  const drPath = fileURLToPath(new URL("../../../docs/ops/DR.md", import.meta.url));
  const dr = await readFile(drPath, "utf8");
  assert.match(dr, /clamped to Node's safe `1000\.\.2147483647` ms range/);
  assert.match(dr, /final pair must satisfy `3 \* timeout <= cache`/);
  assert.match(dr, /falls back to the\s+`3000` ms timeout[\s\S]*`60000` ms cache/);
});

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
      "[storage-probe] CLARA_STORAGE_PROBE_CACHE_MS adjusted to final 2147483647ms " +
        "(accepted range 1000..2147483647; requires 3 * timeout <= cache)",
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

test("storage probe timing: Node's exact maximum cache delay is accepted unchanged", async () => {
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
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "2147483647";
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "3000";
  try {
    startStorageProbe();
    await _waitForStorageProbeSettleForTest();
    assert.equal(intervalDelays[0], 2147483647);
    assert.deepEqual(warnings, []);
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

test("storage probe timing: a cache below the floor logs only its final fallback", async () => {
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
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "999";
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "3000";
  try {
    startStorageProbe();
    await _waitForStorageProbeSettleForTest();
    assert.equal(intervalDelays[0], 60000, "the final cache must preserve 3 * timeout <= cache");
    assert.deepEqual(timeoutDelays, [3000, 6000]);
    assert.deepEqual(warnings, [
      "[storage-probe] CLARA_STORAGE_PROBE_CACHE_MS adjusted to final 60000ms " +
        "(accepted range 1000..2147483647; requires 3 * timeout <= cache)",
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

test("storage probe timing: timeout values below the floor schedule at 1000ms with one warning", async () => {
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
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "60000";
  try {
    for (const configured of ["999", "1"]) {
      timeoutDelays.length = 0;
      intervalDelays.length = 0;
      warnings.length = 0;
      process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = configured;
      startStorageProbe();
      await _waitForStorageProbeSettleForTest();
      assert.equal(intervalDelays[0], 60000);
      assert.deepEqual(timeoutDelays, [1000, 2000], `${configured}ms must schedule at the lower clamp`);
      assert.deepEqual(warnings, [
        "[storage-probe] CLARA_STORAGE_PROBE_TIMEOUT_MS adjusted to final 1000ms " +
          "(accepted range 1000..2147483647; requires 3 * timeout <= cache)",
      ]);
      _resetStorageProbeCacheForTest();
    }
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
      "[storage-probe] CLARA_STORAGE_PROBE_TIMEOUT_MS adjusted to final 3000ms " +
        "(accepted range 1000..2147483647; requires 3 * timeout <= cache)",
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
