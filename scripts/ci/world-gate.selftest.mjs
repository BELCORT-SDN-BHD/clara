#!/usr/bin/env node
// Self-test for the live-gates World launcher (#1026).
//
//   node scripts/ci/world-gate.selftest.mjs   # exit 0 green, 1 red
//
// HERMETIC — no database, no network, no runtime bundle. The unit cells drive the pure functions;
// the end-to-end cells spawn the REAL launcher against throwaway children (one that reports the
// heap ceiling it was actually given, one that aborts the way V8's `Reached heap limit` does, one
// that fails on its own terms), because the two things this launcher must never get wrong are
// "the budget reached the process" and "a normal red is not blamed on memory".

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  HEAP_BUDGET_MB, budgetFrom, childEnv, isHeapDeath, attribution, isEntryPoint,
} from "./world-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAUNCHER = join(HERE, "world-gate.mjs");

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}
const eq = (actual, expected, what) => {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};
const has = (haystack, needle, what) => {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${what}: no ${JSON.stringify(needle)} in:\n${haystack}`);
  }
};

console.log("unit level -- budgetFrom / childEnv / isHeapDeath / attribution:");

testCase("the committed budget is the default, and it is a sane ceiling", () => {
  eq(budgetFrom({}), HEAP_BUDGET_MB, "default budget");
  if (!Number.isInteger(HEAP_BUDGET_MB) || HEAP_BUDGET_MB < 256) {
    throw new Error(`HEAP_BUDGET_MB is not a sane ceiling: ${HEAP_BUDGET_MB}`);
  }
});

testCase("one leg may state its own measured budget", () => {
  eq(budgetFrom({ CLARA_GATE_HEAP_MB: "3072" }), 3072, "override");
  eq(budgetFrom({ CLARA_GATE_HEAP_MB: "" }), HEAP_BUDGET_MB, "empty override falls back");
});

testCase("a junk budget REFUSES loudly rather than silently restoring the host default", () => {
  for (const bad of ["lots", "-1", "0", "2048MB", "1.5"]) {
    let threw = false;
    try {
      budgetFrom({ CLARA_GATE_HEAP_MB: bad });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`${JSON.stringify(bad)} was accepted as a budget`);
  }
});

testCase("the budget is APPENDED to NODE_OPTIONS, never a replacement for what the caller set", () => {
  eq(childEnv({}, 2048).NODE_OPTIONS, "--max-old-space-size=2048", "absent NODE_OPTIONS");
  eq(childEnv({ NODE_OPTIONS: "--use-openssl-ca" }, 2048).NODE_OPTIONS,
    "--use-openssl-ca --max-old-space-size=2048", "existing NODE_OPTIONS");
  eq(childEnv({ PGDATABASE: "clara_intake_ci" }, 512).PGDATABASE, "clara_intake_ci",
    "the rest of the environment reaches the leg untouched");
});

testCase("a heap death is an abort or a kill — and NOTHING else is called one", () => {
  eq(isHeapDeath(134, null), true, "exit 134");
  eq(isHeapDeath(null, "SIGABRT"), true, "SIGABRT");
  eq(isHeapDeath(null, "SIGKILL"), true, "SIGKILL");
  eq(isHeapDeath(137, null), true, "exit 137");
  // THE POSITIVE CONTROL: an ordinary assertion failure must never be reported as an OOM.
  eq(isHeapDeath(1, null), false, "exit 1 (an ordinary red)");
  eq(isHeapDeath(0, null), false, "exit 0");
  eq(isHeapDeath(2, null), false, "exit 2");
});

testCase("the attribution names the step, the command, the pid and the budget", () => {
  const line = attribution({
    step: "#636 intake batch e2e",
    argv: ["tests/intake-batch-e2e.mjs"],
    pid: 4242,
    budgetMb: 2048,
    code: 134,
    signal: null,
  });
  has(line, "#636 intake batch e2e", "step");
  has(line, "tests/intake-batch-e2e.mjs", "command");
  has(line, "--max-old-space-size=2048", "budget");
  has(line, "4242", "pid");
});

testCase("isEntryPoint is false without an argv1 and true for this launcher's own path", () => {
  eq(isEntryPoint("file:///x/world-gate.mjs", undefined), false, "no argv1");
  eq(isEntryPoint(new URL("./world-gate.mjs", import.meta.url).href, LAUNCHER), true, "own path");
});

console.log("end to end -- the launcher, spawned:");

const scratch = mkdtempSync(join(tmpdir(), "world-gate-selftest-"));
const child = (name, body) => {
  const p = join(scratch, name);
  writeFileSync(p, body);
  return p;
};
const run = (args, env = {}) => spawnSync(process.execPath, [LAUNCHER, ...args], {
  encoding: "utf8",
  env: { ...process.env, CLARA_GATE_STEP: "#636 intake batch e2e", ...env },
});

try {
  testCase("THE BUDGET REACHES THE PROCESS: the child's own heap ceiling is the one we declared", () => {
    const probe = child("probe.mjs",
      "import v8 from 'node:v8';\n"
      + "console.log(JSON.stringify({ limit: v8.getHeapStatistics().heap_size_limit, opts: process.env.NODE_OPTIONS }));\n");
    const r = run([probe], { CLARA_GATE_HEAP_MB: "256" });
    eq(r.status, 0, `launcher exit (stderr: ${r.stderr})`);
    const seen = JSON.parse(r.stdout.trim().split("\n").pop());
    has(seen.opts, "--max-old-space-size=256", "the child's NODE_OPTIONS");
    const limitMb = seen.limit / (1024 * 1024);
    if (limitMb > 400) {
      throw new Error(`the child still had a ${limitMb.toFixed(0)} MB ceiling — the budget did not reach it`);
    }
  });

  testCase("AN ABORT IS ATTRIBUTABLE: the step, the command and the budget are named", () => {
    const dying = child("abort.mjs", "process.abort();\n");
    const r = run([dying], { CLARA_GATE_HEAP_MB: "256", GITHUB_ACTIONS: "true" });
    if (r.status === 0) throw new Error("an aborting leg must not pass");
    has(r.stderr, "::error::", "the GitHub annotation");
    has(r.stderr, "#636 intake batch e2e", "the step");
    has(r.stderr, "abort.mjs", "the command");
    has(r.stderr, "--max-old-space-size=256", "the budget");
  });

  testCase("AN ORDINARY RED IS NOT BLAMED ON MEMORY: exit 1 passes through, silently", () => {
    const failing = child("red.mjs",
      "console.error('AssertionError: something the leg proves');\nprocess.exit(1);\n");
    const r = run([failing], { GITHUB_ACTIONS: "true" });
    eq(r.status, 1, "the leg's own exit code survives");
    if (r.stderr.includes("heap budget") || r.stderr.includes("::error::")) {
      throw new Error(`an ordinary red was reported as a budget death:\n${r.stderr}`);
    }
    has(r.stderr, "AssertionError", "the leg's own stderr still reaches the log");
  });

  testCase("stdout is the leg's own: the job log still carries what the leg prints", () => {
    const talker = child("talk.mjs", "console.log('[p636] a line the job log must carry');\n");
    const r = run([talker]);
    eq(r.status, 0, "exit");
    has(r.stdout, "[p636] a line the job log must carry", "the leg's stdout");
  });

  testCase("no arguments is a refusal, not a silent success", () => {
    const r = run([]);
    eq(r.status, 2, "exit");
    has(r.stderr, "nothing to run", "the reason");
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failures === 0
  ? "\nworld-gate selftest: OK"
  : `\nworld-gate selftest: FAIL — ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
