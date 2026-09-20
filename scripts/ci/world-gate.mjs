#!/usr/bin/env node
// #1026 — THE ONE PLACE A LIVE-GATES WORLD LEG GETS ITS HEAP BUDGET, THE ONE PLACE A DEATH BY THAT
// BUDGET BECOMES ATTRIBUTABLE, AND THE PLACE EVERY LEG RECORDS WHAT IT ACTUALLY USED.
//
// WHY THIS EXISTS, MEASURED. Every `db-live-gates` step that boots a durable World runs the runtime
// bundle, the Workflow world, the leader loop, the engine and (in the intake legs) a hundred
// concurrent document ingests in ONE Node process, and none of them declared a heap budget — so all
// of them inherited the host default, which the CI runner reports as ~4130-4148 MB. Peak memory for
// one run of ONE such leg varies between ~2.2 GiB and ~4.2 GiB depending only on when V8 chooses to
// collect, and twice the job simply died: job 105215992382 (2026-09-17, Wave-B fault gates,
// `Mark-Compact 4016.5 -> 4004.7 MB` then `Reached heap limit`, exit 134) and job 106048901216
// (2026-09-20, the #636 intake batch leg, `Scavenge 4018.0 -> 4015.3 MB`, exit 134).
//
// THE LIVE SET IS NOWHERE NEAR THAT. V8 grows to whatever ceiling it is given because floating
// garbage costs it nothing until the ceiling; with the ceiling lowered the same work fits, and the
// collector simply does its job earlier. `packages/runtime/tests/heap-bound.mjs` measured the same
// thing from inside one of these legs: a 119 MB steady live set under a ~60-70 MB/s churn.
//
// SO THE BUDGET IS DECLARED HERE, ONCE. A new gate that is wired through this launcher cannot be
// added without one — and `world-gate.selftest.mjs` reads the action itself and refuses a leg that
// is not wired through it — so `HEAP_BUDGET_MB` is the single number to review. The figure and how
// it was measured are recorded in `packages/runtime/README.md` ("#1026 — the live gates' heap
// budget").
//
// A DEATH BY IT IS ATTRIBUTABLE. A child that aborts (exit 134 / SIGABRT — what V8's
// `Reached heap limit` fatal error produces) or is killed outright (SIGKILL — what an OOM killer
// produces) is reported with the step, the command, the pid and the budget it ran under, as a
// GitHub `::error::` annotation, instead of leaving a native abort trace as the only evidence.
//
// AND THE EVIDENCE IS CONTINUOUS, NOT A ONE-OFF TABLE. On Linux — which is what the runner is —
// every leg prints one greppable `[world-gate] peak` line carrying its own peak resident set, the
// budget and the percentage of it used, so a single CI run records all 24 legs instead of the three
// a human had time to measure by hand. It is best-effort by construction: no `/proc` (Windows, a
// developer's rig) means one honest "unavailable" in the line, a read that throws is counted and
// ignored, and nothing here can turn a green leg red. It SAMPLES (every 200 ms), so a process
// that lives less than one interval reports only its first sample; every leg this wraps runs for
// minutes and VmHWM is monotonic, so any later sample carries the whole run.
//
//   node scripts/ci/world-gate.mjs tests/intake-batch-e2e.mjs
//   node scripts/ci/world-gate.mjs --test tests/body-census-guard-db.test.mjs
//   CLARA_GATE_HEAP_MB=3072 node scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs
//
// Everything after the script path is handed to `node` verbatim. `CLARA_GATE_STEP` names the step
// in the annotation and in the peak line; `CLARA_GATE_HEAP_MB` overrides the budget for one leg
// that has been measured to need a different one, and must carry that measurement beside it.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { constants } from "node:os";
import { pathToFileURL } from "node:url";

/** THE BUDGET, in MB of V8 old space. MEASURED (see the README section named above): under this
 *  ceiling the intake batch leg peaks at 0.79-1.06 GiB of resident set across three consecutive
 *  passes, about half of it, and every one of the 24 legs passed at it on the Linux runner in CI
 *  run 35508993162 (job 106073526212, 21m29s, green). */
export const HEAP_BUDGET_MB = 2048;

const MB = 1024 * 1024;

/** @param {Record<string,string|undefined>} env */
export function budgetFrom(env = process.env) {
  const raw = env.CLARA_GATE_HEAP_MB;
  if (raw === undefined || String(raw).trim() === "") return HEAP_BUDGET_MB;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`world-gate: CLARA_GATE_HEAP_MB must be a positive whole number of MB, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * The child's environment: the budget is APPENDED to any NODE_OPTIONS already present rather than
 * replacing it, because the last `--max-old-space-size` wins in V8 and a caller that set its own
 * flags (a debugger, a CA bundle) must keep them.
 */
export function childEnv(env, budgetMb) {
  const existing = (env.NODE_OPTIONS ?? "").trim();
  return {
    ...env,
    NODE_OPTIONS: `${existing ? `${existing} ` : ""}--max-old-space-size=${budgetMb}`,
  };
}

/** A heap death is an abort or an outright kill. Any other non-zero exit is the leg's OWN failure
 *  and must never be blamed on memory — a gate that cries OOM at every red teaches nobody. */
export function isHeapDeath(code, signal) {
  return signal === "SIGABRT" || signal === "SIGKILL" || code === 134 || code === 137;
}

/** The kernel's own high-water mark for a process's resident set, in kB, out of /proc/<pid>/status.
 *  `null` for anything it cannot read — an absent field, a truncated read, a platform without
 *  /proc. Exported so the selftest drives it over text rather than over a live process. */
export function parseVmHwmKb(statusText) {
  const m = /^VmHWM:\s+(\d+)\s+kB\s*$/m.exec(String(statusText ?? ""));
  if (!m) return null;
  const kb = Number(m[1]);
  return Number.isFinite(kb) ? kb : null;
}

/**
 * Watch a child's peak resident set. Linux only by construction (VmHWM lives in /proc), and every
 * collaborator is injectable so the cells drive it without a real process or a real timer.
 * @returns {{ stop(): void, peakKb(): number|null, samples(): number, failures(): number }}
 */
export function startPeakWatch(pid, options = {}) {
  const read = options.read ?? ((p) => readFileSync(`/proc/${p}/status`, "utf8"));
  const setTimer = options.setTimer ?? setInterval;
  const clearTimer = options.clearTimer ?? clearInterval;
  const intervalMs = options.intervalMs ?? 200;
  const enabled = options.enabled ?? (process.platform === "linux");

  let peak = null; let samples = 0; let failures = 0; let stopped = false;
  const sample = () => {
    if (stopped || !enabled) return;
    try {
      const kb = parseVmHwmKb(read(pid));
      samples += 1;
      // VmHWM is monotonic, but take the max anyway: a read that lands after an exec would
      // otherwise be able to lower the figure this line reports.
      if (kb !== null && (peak === null || kb > peak)) peak = kb;
    } catch {
      // The process has gone, or /proc refused. Neither is a reason to say anything at all.
      failures += 1;
    }
  };
  const handle = enabled ? setTimer(sample, intervalMs) : null;
  // NEVER HOLD THE JOB OPEN: this is a diagnostic aid on a process that owns its own lifecycle.
  if (handle && typeof handle.unref === "function") handle.unref();
  if (enabled) sample();

  return {
    stop() {
      if (stopped) return;
      // One last look BEFORE the timer is dropped: the child is usually still reapable here, and
      // this is the sample that sees the whole run.
      sample();
      stopped = true;
      if (handle) clearTimer(handle);
    },
    peakKb: () => peak,
    samples: () => samples,
    failures: () => failures,
  };
}

/** ONE GREPPABLE LINE PER LEG — this is #1026's AC2 measurement, recorded by every CI run rather
 *  than by whoever had time to measure by hand. `grep '\[world-gate\] peak' <job log>`. */
export function peakLine({ step, argv, budgetMb, peakKb, code, signal }) {
  const how = signal ? `signal ${signal}` : `exit ${code ?? 0}`;
  const used = peakKb === null || peakKb === undefined
    ? "peak RSS unavailable (no /proc on this platform)"
    : `peak RSS ${Math.round(peakKb / 1024)} MB (${Math.round((peakKb * 1024 * 100) / (budgetMb * MB))}% of budget)`;
  return `[world-gate] peak ${step} | node ${argv.join(" ")} | budget ${budgetMb} MB | ${used} | ${how}`;
}

export function attribution({ step, argv, pid, budgetMb, code, signal }) {
  const how = signal ? `killed by ${signal}` : `exit ${code}`;
  return `db-live-gates step ${JSON.stringify(step)}: the World-booting process died (${how}). `
    + `command: node ${argv.join(" ")} (pid ${pid ?? "?"}), heap budget --max-old-space-size=${budgetMb}. `
    + "Exit 134 / SIGABRT is what V8's \"Reached heap limit\" fatal error produces and SIGKILL is what "
    + "an out-of-memory killer produces, so read this as the step exceeding the budget above unless "
    + "its own log says otherwise. Raise it deliberately with CLARA_GATE_HEAP_MB on THAT step and "
    + "record the new measurement beside the budget, or reduce what the leg holds.";
}

export function isEntryPoint(url = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 0) {
    process.stderr.write("world-gate: nothing to run — pass the node arguments for the leg\n");
    process.exit(2);
    return;
  }
  const budgetMb = budgetFrom(env);
  const step = env.CLARA_GATE_STEP || "db-live-gates";
  const child = spawn(process.execPath, argv, { stdio: "inherit", env: childEnv(env, budgetMb) });
  // Armed synchronously: `child.pid` is set the moment spawn() returns, and VmHWM is monotonic, so
  // an early sample can only ever be raised by a later one.
  const watch = child.pid ? startPeakWatch(child.pid) : { stop() {}, peakKb: () => null };
  child.on("error", (err) => {
    process.stderr.write(`world-gate: could not start the leg — ${err?.message ?? err}\n`);
    process.exit(2);
  });
  child.on("exit", (code, signal) => {
    watch.stop();
    process.stdout.write(`${peakLine({ step, argv, budgetMb, peakKb: watch.peakKb(), code, signal })}\n`);
    if (isHeapDeath(code, signal)) {
      const line = attribution({ step, argv, pid: child.pid, budgetMb, code, signal });
      process.stderr.write(`${env.GITHUB_ACTIONS === "true" ? "::error::" : ""}${line}\n`);
    }
    // The signal's own number rather than a hand-kept map (review STD-4), so no signal is ever
    // silently flattened to 128.
    process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : (code ?? 0));
  });
}

if (isEntryPoint()) main();
