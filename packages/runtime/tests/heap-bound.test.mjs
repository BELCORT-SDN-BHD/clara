// THE HEAP BOUND — the guard the standalone World e2es need, and the cells that hold it honest.
//
// WHY THIS EXISTS, MEASURED. `tests/interview-e2e.mjs` boots the durable world IN-PROCESS and then
// drives ~92 durable steps per interview run. The WDK re-evaluates the WHOLE workflow bundle
// (`node_modules/.nitro/workflow/workflows.mjs`, 7.7 MB, every body in the image) against a FRESH
// vm context on every step — `@workflow/core`'s own `vm/script-cache.js` says so in as many words,
// and caches only the COMPILED Script, never the evaluation. A forced-GC probe over the real leg
// measured the steady live set at 119 MB and single evaluations transiently holding 300-530 MB, so
// the process churns ~60-70 MB/s of collectable garbage for as long as a run is in flight.
//
// Under the default ~4 GB old-space ceiling V8 has no reason to collect any of it until the
// ceiling, and on a loaded CI host it reached the ceiling first: run 35225394786 died at
// `Mark-Compact 4016.5 -> 4004.7 MB` after 77 s. The same leg, at `--max-old-space-size=2048` with
// a forced collection every 3 s, holds a flat 119 MB and passes. The garbage is the engine's, the
// unbounded heap is the harness's — an in-process engine driven by a test is the only place this
// churn is allowed to accumulate, because a deployed runtime serves one step per invocation.
//
// SO THE HARNESS BOUNDS ITS OWN HEAP, and this file drives that bound over injected time and an
// injected collector — no real timers, no real GC, nothing that could make a cell flaky.

import { test } from "node:test";
import assert from "node:assert/strict";

import { startHeapBound, MiB } from "./heap-bound.mjs";

/** A hand-cranked interval: `startHeapBound` gets these instead of node's timers, so a cell drives
 *  ticks itself and never waits on wall-clock time. */
function fakeTimer() {
  const state = { fn: null, ms: null, cleared: false, unrefs: 0 };
  return {
    state,
    setTimer(fn, ms) {
      state.fn = fn;
      state.ms = ms;
      return { unref: () => { state.unrefs += 1; } };
    },
    clearTimer() {
      state.cleared = true;
    },
    tick() {
      state.fn();
    },
  };
}

/** A collector that records its calls instead of collecting. */
function fakeCollector(behaviour = () => true) {
  const calls = [];
  return {
    calls,
    collect() {
      calls.push(Date.now());
      return behaviour();
    },
  };
}

test("heap-bound: a heap ABOVE the threshold is collected, one collection per tick", () => {
  const timer = fakeTimer();
  const collector = fakeCollector();
  let heap = 600 * MiB;
  const bound = startHeapBound({
    thresholdBytes: 512 * MiB,
    intervalMs: 1000,
    measure: () => heap,
    collect: collector.collect,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  timer.tick();
  assert.equal(collector.calls.length, 1, "over the threshold ⇒ collect");
  timer.tick();
  assert.equal(collector.calls.length, 2, "and again on the next tick while it is still over");
  assert.equal(bound.stats().collections, 2);
  bound.stop();
});

test("heap-bound: a heap BELOW the threshold is left alone — the bound is a ceiling, not a metronome", () => {
  const timer = fakeTimer();
  const collector = fakeCollector();
  let heap = 100 * MiB;
  const bound = startHeapBound({
    thresholdBytes: 512 * MiB,
    intervalMs: 1000,
    measure: () => heap,
    collect: collector.collect,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  timer.tick();
  timer.tick();
  assert.equal(collector.calls.length, 0, "a quiet process must not pay for a full GC it does not need");

  // …and it starts the moment the churn crosses the line.
  heap = 513 * MiB;
  timer.tick();
  assert.equal(collector.calls.length, 1);
  bound.stop();
});

test("heap-bound: THE RUNAWAY SHAPE — a run-length drive never leaves the heap unbounded", () => {
  // The leg that died: ~60 MB/s of engine garbage for ~90 s with nothing collecting it. Driven
  // here over a fake heap that grows exactly like the measured one, the bound must keep the
  // observed maximum under the ceiling the CI host could not survive. WITHOUT a bound the same
  // 90 ticks reach 5.5 GB, which is the red this cell exists to keep out.
  const timer = fakeTimer();
  const GROWTH_PER_TICK = 60 * MiB;
  const THRESHOLD = 512 * MiB;
  let heap = 120 * MiB;
  let peak = 0;
  const bound = startHeapBound({
    thresholdBytes: THRESHOLD,
    intervalMs: 1000,
    measure: () => heap,
    // A real collection returns the process to its live set; the probe measured that at 119 MB.
    collect: () => { heap = 119 * MiB; return true; },
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  for (let tick = 0; tick < 90; tick += 1) {
    heap += GROWTH_PER_TICK;
    peak = Math.max(peak, heap);
    timer.tick();
  }

  // THE GUARANTEE IS A CEILING, NOT A CADENCE. A collection returns the heap to the live set, so
  // the next one is a whole sawtooth away; what the bound promises is that the heap is never more
  // than one tick's growth past the threshold, which is the only property the OOM cared about.
  assert.ok(peak <= THRESHOLD + GROWTH_PER_TICK,
    `the heap stays within one tick's growth of the threshold (peak ${Math.round(peak / MiB)} MB)`);
  assert.ok(peak < 1024 * MiB, `and nowhere near the ceiling the CI host hit (peak ${Math.round(peak / MiB)} MB)`);
  assert.ok(bound.stats().collections >= 10,
    `it collected once per sawtooth rather than once per tick (got ${bound.stats().collections})`);
  assert.equal(Math.round(bound.stats().peakBytes / MiB), Math.round(peak / MiB), "and it reports the peak it saw");
  bound.stop();
});

test("heap-bound: a collector that throws is not a test failure — the bound is best-effort", () => {
  const timer = fakeTimer();
  let heap = 600 * MiB;
  const bound = startHeapBound({
    thresholdBytes: 512 * MiB,
    intervalMs: 1000,
    measure: () => heap,
    collect: () => { throw new Error("no inspector in this process"); },
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  assert.doesNotThrow(() => timer.tick(), "a harness must not fail because a diagnostic aid is unavailable");
  assert.equal(bound.stats().collections, 0, "…and it does not claim a collection it did not get");
  assert.equal(bound.stats().failures, 1, "…it counts the refusal instead, so the e2e can say so at the end");
  bound.stop();
});

test("heap-bound: a measure that throws is survived the same way", () => {
  const timer = fakeTimer();
  const collector = fakeCollector();
  const bound = startHeapBound({
    thresholdBytes: 512 * MiB,
    intervalMs: 1000,
    measure: () => { throw new Error("no memoryUsage"); },
    collect: collector.collect,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  assert.doesNotThrow(() => timer.tick());
  assert.equal(collector.calls.length, 0, "an unreadable heap is not an over-threshold heap");
  bound.stop();
});

test("heap-bound: the timer is unref'd and stop() clears it — the bound can never hold the process open", () => {
  // `interview-e2e.mjs` owns its own lifecycle and exits explicitly. A ref'd interval in the
  // harness would turn a passing run into a CI hang, which is a worse red than the one this fixes.
  const timer = fakeTimer();
  const bound = startHeapBound({
    thresholdBytes: 512 * MiB,
    intervalMs: 1000,
    measure: () => 0,
    collect: () => true,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  assert.equal(timer.state.unrefs, 1, "unref'd the moment it is armed");
  assert.equal(timer.state.ms, 1000, "…at the interval it was given");
  bound.stop();
  assert.equal(timer.state.cleared, true, "and stop() clears it");

  // stop() twice is not an error — the harness calls it from a finally.
  assert.doesNotThrow(() => bound.stop());
});

test("heap-bound: a stopped bound does nothing, even if its tick is called again", () => {
  const timer = fakeTimer();
  const collector = fakeCollector();
  const bound = startHeapBound({
    thresholdBytes: 0,
    intervalMs: 1000,
    measure: () => 1024 * MiB,
    collect: collector.collect,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  bound.stop();
  timer.tick();
  assert.equal(collector.calls.length, 0, "a late tick after stop() must not collect");
});
