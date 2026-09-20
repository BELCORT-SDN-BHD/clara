#!/usr/bin/env node
// #1026 — THE ONE PLACE A LIVE-GATES WORLD LEG GETS ITS HEAP BUDGET, AND THE ONE PLACE A DEATH BY
// THAT BUDGET BECOMES ATTRIBUTABLE.
//
// WHY THIS EXISTS, MEASURED. Every `db-live-gates` step that boots a durable World runs the runtime
// bundle, the Workflow world, the leader loop, the engine and (in the intake legs) a hundred
// concurrent document ingests in ONE Node process, and none of them declared a heap budget — so all
// of them inherited the host default, which the CI runner reports as ~4130-4148 MB. Peak memory for
// one run of ONE such leg varies between ~2.0 GB and ~4.4 GB depending only on when V8 chooses to
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
// added without one, and `HEAP_BUDGET_MB` is the single number to review. The figure and how it was
// measured are recorded in `packages/runtime/README.md` ("#1026 — the live gates' heap budget").
//
// AND A DEATH BY IT IS ATTRIBUTABLE. A child that aborts (exit 134 / SIGABRT — what V8's
// `Reached heap limit` fatal error produces) or is killed outright (SIGKILL — what an OOM killer
// produces) is reported with the step, the command, the pid and the budget it ran under, as a
// GitHub `::error::` annotation, instead of leaving a native abort trace as the only evidence.
//
//   node scripts/ci/world-gate.mjs tests/intake-batch-e2e.mjs
//   node scripts/ci/world-gate.mjs --test tests/body-census-guard-db.test.mjs
//   CLARA_GATE_HEAP_MB=3072 node scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs
//
// Everything after the script path is handed to `node` verbatim. `CLARA_GATE_STEP` names the step
// in the annotation; `CLARA_GATE_HEAP_MB` overrides the budget for one leg that has been measured
// to need a different one.

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/** THE BUDGET, in MB of V8 old space. MEASURED (see the README section named above): the intake
 *  batch leg's peak old-space occupancy under this ceiling is ~1.0-1.2 GB across three consecutive
 *  passes, i.e. roughly half of it, and the leg is FASTER than at the host default because the
 *  collector never has to sweep a 4 GB heap. */
export const HEAP_BUDGET_MB = 2048;

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
  const nodeBin = env.CLARA_GATE_NODE || process.execPath;
  const child = spawn(nodeBin, argv, { stdio: "inherit", env: childEnv(env, budgetMb) });
  child.on("error", (err) => {
    process.stderr.write(`world-gate: could not start the leg — ${err?.message ?? err}\n`);
    process.exit(2);
  });
  child.on("exit", (code, signal) => {
    if (isHeapDeath(code, signal)) {
      const line = attribution({ step, argv, pid: child.pid, budgetMb, code, signal });
      process.stderr.write(`${env.GITHUB_ACTIONS === "true" ? "::error::" : ""}${line}\n`);
    }
    process.exit(signal ? 128 + (({ SIGABRT: 6, SIGKILL: 9, SIGTERM: 15, SIGINT: 2 })[signal] ?? 0) : (code ?? 0));
  });
}

if (isEntryPoint()) main();
