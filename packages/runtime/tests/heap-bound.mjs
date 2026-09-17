// THE HEAP BOUND for a standalone e2e that boots the durable world IN-PROCESS.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS IS FOR, MEASURED RATHER THAN ASSUMED.
//
// `tests/interview-e2e.mjs` is not an ordinary HTTP test: it imports `.output/server/index.mjs`,
// so the WDK engine, the Postgres world and every leader loop run inside the SAME process that
// asserts on them. Driving one client interview to `interview_complete` takes ~92 durable steps
// (counted on the rig: `select count(*) from workflow.workflow_steps where run_id = …`), and the
// engine re-evaluates the WHOLE workflow bundle against a FRESH vm context once per step.
//
// That is the WDK's own design, stated in `@workflow/core/dist/vm/script-cache.js`: "Replaying a
// workflow re-evaluates the workflow bundle against a fresh VM context on every iteration of the
// inline replay loop … The bundle is a single string that contains every workflow function in the
// app." The cache it adds there is over the COMPILED `vm.Script` only — the EVALUATION, which is
// what allocates, is paid every time. This image's bundle is
// `node_modules/.nitro/workflow/workflows.mjs`, 7.7 MB of source covering all 53 registered
// bodies, and its module top level builds every tool schema, every prompt table and four
// `sha256Hex(canonicalJson(CLARA_WORK_BUNDLE_Vn))` digests before the first step runs.
//
// Probed on the real leg (a forced full collection every 3 s while the drive ran):
//
//     steady live set ............ 119 MB, flat across all four scenarios
//     single evaluation in flight  309-533 MB live
//     churn while a run is driving ~60-70 MB/s, ALL of it collectable
//
// Nothing leaks. The heap grows because V8 has no reason to collect: with the default ~4 GB
// old-space ceiling, 60 MB/s of garbage simply accumulates until the ceiling, and a bundle
// evaluation that needs a few hundred MB of headroom then has nowhere to put it. That is exactly
// how run 35225394786 died — `Mark-Compact 4016.5 (4132.6) -> 4004.7 (4138.4) MB`, twice,
// recovering ~12 MB each time, then `Reached heap limit`, exit 134, 77 s in. The same leg on the
// same commit passes at `--max-old-space-size=2048` WITH a forced collection every 3 s, holding a
// flat 119 MB.
//
// SO THE BOUND BELONGS TO THE HARNESS, NOT TO A WORKFLOW BODY. A deployed runtime serves one step
// per invocation and never stacks 92 evaluations inside one heap; a test that drives all 92 in
// process is the only place this churn can pile up, and it is the test's job to keep its own
// process inside the ceiling it was given. No `clientOnboarding_v5` change would move this: v4
// pays the same cost per step, and the cut's own contribution (the known-facts pre-read plus the
// `fye_day` segment, six extra steps) is ~2 % of the drive.
//
// WHY `HeapProfiler.collectGarbage` RATHER THAN `global.gc`. `global.gc` needs `--expose-gc`, and
// the CI step runs a bare `node tests/interview-e2e.mjs` — a fix that only works behind a flag the
// workflow does not pass is not a fix. The inspector's own collector needs no flag and no port: a
// `node:inspector` Session connected in-process accepts `HeapProfiler.collectGarbage` and runs a
// full collection synchronously (verified: 51 MB -> 4 MB on a throwaway heap).
//
// IT IS BEST-EFFORT BY CONSTRUCTION. A collector that cannot connect, a `collect` that throws and
// a `memoryUsage()` that throws are each survived silently and counted, because a diagnostic aid
// that can fail a green run is worse than the red it was added for. Below the threshold it does
// nothing at all — this is a ceiling, not a metronome, so a quiet process never pays for a full GC
// it does not need.
// ---------------------------------------------------------------------------------------------

import { Session } from "node:inspector";

/** Bytes in a mebibyte — exported so a caller states thresholds in the units the probe reported. */
export const MiB = 1024 * 1024;

/** The default ceiling. The live set is 119 MB and one evaluation wants a few hundred MB on top,
 *  so 512 MB leaves a whole evaluation of headroom under the threshold and still keeps the process
 *  an order of magnitude below the ~4 GB ceiling CI could not survive. */
export const DEFAULT_THRESHOLD_BYTES = 512 * MiB;

/** How often the heap is looked at. One second is ~60-70 MB of churn at the measured rate, so the
 *  observed maximum is the threshold plus about one tick — and a collection at that size costs far
 *  less than one at 4 GB (the CI log's own Mark-Compacts took 1.8 s and 3.0 s). */
export const DEFAULT_INTERVAL_MS = 1000;

/**
 * A full-collection function backed by the in-process inspector, or `null` when this process
 * cannot have one. Never throws on construction: a harness that cannot collect must still run.
 */
export function inspectorCollector() {
  let session;
  try {
    session = new Session();
    session.connect();
  } catch {
    return null;
  }
  return () => {
    // `post` without a callback still dispatches the command; the collection itself is synchronous
    // inside the VM, so by the time this returns the heap has been swept.
    session.post("HeapProfiler.collectGarbage");
    return true;
  };
}

/**
 * Watch this process's heap and force a full collection whenever it is over `thresholdBytes`.
 *
 * Every collaborator is injectable so the cells in `heap-bound.test.mjs` drive it over a fake heap
 * and a hand-cranked timer — a guard against an unbounded heap must not itself be timing-dependent.
 *
 * @returns {{ stop(): void, stats(): { collections: number, failures: number, ticks: number, peakBytes: number, available: boolean } }}
 */
export function startHeapBound(options = {}) {
  const thresholdBytes = options.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const measure = options.measure ?? (() => process.memoryUsage().heapUsed);
  const collect = options.collect ?? inspectorCollector();
  const setTimer = options.setTimer ?? setInterval;
  const clearTimer = options.clearTimer ?? clearInterval;

  const stats = { collections: 0, failures: 0, ticks: 0, peakBytes: 0, available: typeof collect === "function" };
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    stats.ticks += 1;
    let used;
    try {
      used = measure();
    } catch {
      // An unreadable heap is not an over-threshold heap. Say nothing and look again next tick.
      return;
    }
    if (typeof used !== "number" || !Number.isFinite(used)) return;
    if (used > stats.peakBytes) stats.peakBytes = used;
    if (used <= thresholdBytes) return;
    if (typeof collect !== "function") return;
    try {
      collect();
      stats.collections += 1;
    } catch {
      // The collector refused. Count it so the harness can print an honest line at the end, and
      // never let a diagnostic aid fail a run that is otherwise passing.
      stats.failures += 1;
    }
  };

  const handle = setTimer(tick, intervalMs);
  // NEVER HOLD THE PROCESS OPEN. `interview-e2e.mjs` owns its lifecycle and exits explicitly; a
  // ref'd interval here would turn a passing leg into a CI hang, which is a worse red than the OOM.
  if (handle && typeof handle.unref === "function") handle.unref();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer(handle);
    },
    stats() {
      return { ...stats };
    },
  };
}
