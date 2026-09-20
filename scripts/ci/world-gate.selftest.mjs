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

import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  HEAP_BUDGET_MB, budgetFrom, childEnv, isHeapDeath, attribution, isEntryPoint,
  parseVmHwmKb, startPeakWatch, peakLine,
} from "./world-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAUNCHER = join(HERE, "world-gate.mjs");
const ACTION = join(HERE, "..", "..", ".github", "actions", "db-live-gates", "action.yml");

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

console.log("unit level -- the per-leg peak measurement (#1026 AC2, review SPEC-1026-01):");

const PROC_STATUS = [
  "Name:\tnode", "State:\tS (sleeping)", "VmPeak:\t 2103456 kB", "VmSize:\t 2003456 kB",
  "VmHWM:\t 1113100 kB", "VmRSS:\t  903456 kB", "Threads:\t11",
].join("\n") + "\n";

testCase("VmHWM is read out of a real /proc/<pid>/status shape, and nothing else is mistaken for it", () => {
  eq(parseVmHwmKb(PROC_STATUS), 1113100, "VmHWM");
  eq(parseVmHwmKb("VmPeak:\t 2103456 kB\n"), null, "VmPeak is NOT the resident high-water mark");
  eq(parseVmHwmKb(""), null, "empty");
  eq(parseVmHwmKb(undefined), null, "absent");
  eq(parseVmHwmKb("VmHWM: not-a-number kB"), null, "junk");
});

testCase("the watcher keeps the maximum, counts its samples, and is unref'd", () => {
  const timer = { fn: null, cleared: false, unrefs: 0 };
  let n = 0;
  const readings = ["VmHWM:\t 100 kB\n", "VmHWM:\t 900 kB\n", "VmHWM:\t 400 kB\n"];
  const watch = startPeakWatch(4242, {
    enabled: true,
    read: () => readings[Math.min(n++, readings.length - 1)],
    setTimer: (fn) => { timer.fn = fn; return { unref: () => { timer.unrefs += 1; } }; },
    clearTimer: () => { timer.cleared = true; },
  });
  timer.fn(); timer.fn();
  watch.stop();
  eq(watch.peakKb(), 900, "peak");
  eq(timer.unrefs, 1, "the timer is unref'd so it can never hold the job open");
  eq(timer.cleared, true, "stop() clears it");
});

testCase("A READ THAT THROWS CANNOT FAIL A LEG: it is counted and the line says unavailable", () => {
  const watch = startPeakWatch(4242, {
    enabled: true,
    read: () => { throw new Error("ESRCH"); },
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  });
  watch.stop();
  eq(watch.peakKb(), null, "no peak");
  if (watch.failures() < 1) throw new Error("the failed read was not counted");
  has(peakLine({ step: "s", argv: ["tests/x.mjs"], budgetMb: 2048, peakKb: null, code: 0, signal: null }),
    "unavailable", "the line");
});

testCase("the peak line carries the step, the command, the budget, the figure and the percentage", () => {
  const line = peakLine({
    step: "#636 intake batch e2e", argv: ["tests/intake-batch-e2e.mjs"],
    budgetMb: 2048, peakKb: 1113100, code: 0, signal: null,
  });
  has(line, "[world-gate] peak", "the grep anchor");
  has(line, "#636 intake batch e2e", "step");
  has(line, "tests/intake-batch-e2e.mjs", "command");
  has(line, "budget 2048 MB", "budget");
  has(line, "peak RSS 1087 MB", "the figure");
  has(line, "(53% of budget)", "the percentage");
});

testCase("the watcher does nothing at all where there is no /proc — no reads, no cost", () => {
  let reads = 0;
  const watch = startPeakWatch(1, {
    enabled: false,
    read: () => { reads += 1; return PROC_STATUS; },
    setTimer: () => { throw new Error("no timer must be armed off Linux"); },
    clearTimer: () => {},
  });
  watch.stop();
  eq(reads, 0, "reads");
  eq(watch.peakKb(), null, "peak");
});

console.log("the wiring guard -- a new gate cannot be added without a budget (review SPEC-1026-04):");

testCase("EVERY node invocation of a tests/ entry point in db-live-gates goes through this launcher", () => {
  const yml = readFileSync(ACTION, "utf8");
  const invocations = yml.split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => !line.startsWith("#"))
    .filter(({ line }) => /(^|\s)node\s/.test(line) && /\btests\/\S+\.mjs/.test(line));
  // The guard must never pass because it found nothing to check.
  if (invocations.length < 20) {
    throw new Error(`expected the live-gates action to carry its 20+ World legs, found ${invocations.length}`);
  }
  const unwired = invocations.filter(({ line }) => !line.includes("scripts/ci/world-gate.mjs"));
  if (unwired.length > 0) {
    throw new Error(
      "these live-gates legs run node directly instead of through scripts/ci/world-gate.mjs, so they "
      + "would inherit the host's default heap ceiling (#1026):\n"
      + unwired.map(({ n, line }) => `  action.yml:${n}  ${line}`).join("\n"));
  }
});

testCase("[inverse] the same guard REJECTS an unwired leg — it is not just counting lines", () => {
  const fake = [
    "    - name: a new gate",
    "      run: |",
    "        cd packages/runtime",
    "        node tests/brand-new-leg.mjs",
  ].join("\n");
  const invocations = fake.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .filter((line) => /(^|\s)node\s/.test(line) && /\btests\/\S+\.mjs/.test(line));
  eq(invocations.length, 1, "the fake leg is seen at all");
  eq(invocations.filter((line) => !line.includes("scripts/ci/world-gate.mjs")).length, 1,
    "…and it is classified as unwired");
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
    const seen = JSON.parse(r.stdout.split("\n").find((l) => l.trim().startsWith("{")) ?? "null");
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

  testCase("EVERY leg prints its peak line, pass or fail — that is the AC2 measurement", () => {
    // It HOLDS the memory for most of a second on purpose: the peak is SAMPLED from /proc, so a
    // child that exits inside one sample interval can only ever report its first sample. Every leg
    // this launcher wraps runs for minutes; this cell has to live long enough to be sampled twice.
    const hungry = child("hungry.mjs",
      "const held = [];\nfor (let i = 0; i < 40; i += 1) held.push(Buffer.alloc(4 * 1024 * 1024, 1));\n"
      + "console.log('allocated', held.length * 4, 'MB');\n"
      + "setTimeout(() => { if (held.length !== 40) throw new Error('held'); }, 800);\n");
    const r = run([hungry], { CLARA_GATE_HEAP_MB: "512" });
    eq(r.status, 0, `launcher exit (stderr: ${r.stderr})`);
    const line = r.stdout.split("\n").find((l) => l.includes("[world-gate] peak"));
    if (!line) throw new Error(`no peak line in:\n${r.stdout}`);
    has(line, "budget 512 MB", "the budget");
    has(line, "#636 intake batch e2e", "the step");
    if (process.platform === "linux") {
      const mb = Number(/peak RSS (\d+) MB/.exec(line)?.[1] ?? 0);
      if (mb < 100) throw new Error(`a child that held 160 MB reported ${mb} MB: ${line}`);
      has(line, "% of budget", "the percentage");
    } else {
      has(line, "unavailable", "off Linux the line is honest about having no figure");
    }

    // …and on a leg that FAILS on its own terms, too: a peak that only appears on green runs is
    // useless exactly when someone is reading the log.
    const failing = child("red2.mjs", "process.exit(1);\n");
    const r2 = run([failing]);
    eq(r2.status, 1, "the leg's own exit code still survives");
    if (!r2.stdout.includes("[world-gate] peak")) throw new Error(`no peak line on a red leg:\n${r2.stdout}`);
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
