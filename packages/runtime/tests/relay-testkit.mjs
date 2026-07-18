// Shared harness for the Slice-3 relay suite (NOT a test file — no `.test.`
// segment). Split out so each *.test.mjs stays small; the suite is run with
// `node --test --test-concurrency=1 tests/` so files execute SEQUENTIALLY —
// required because several cases mutate GLOBAL state (the singleton taxonomy
// pointer) or hold the shared `router` advisory lock via a spawned runner, and
// must never overlap. Every relay here is FIRM-SCOPED so it only drains its own
// fresh fixture firm. Contract: docs/plan/slice3-event-spine-contract.md §2.9.

import { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { runRelayCycle, routeBatchForFirm } from "../lib/relay.mjs";
import * as fx from "./relay-fixtures.mjs";

export { sleep };

// SKIP cleanly when the 0005 schema is absent (probe once per file/process).
export const READY = await fx.probeReady();
export const skip = READY ? false : "Slice-3 (0005) schema absent — migrate the target first";

after(async () => {
  await fx.endPool();
});

// ---------------------------------------------------------------------------
// Child-process (runner) harness — used by the kill / split-brain / reconnect /
// halt cases. RELAY_TEST_MODE=1 unlocks the test-only knobs (X3).
// ---------------------------------------------------------------------------

const RELAY_SCRIPT = fileURLToPath(new URL("../scripts/relay.mjs", import.meta.url));
const RUNTIME_CWD = fileURLToPath(new URL("..", import.meta.url));

export function spawnRelay(extraEnv = {}) {
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: RUNTIME_CWD,
    env: { ...process.env, RELAY_TEST_MODE: "1", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { lines: [], stderr: [], exited: false, exitInfo: null };
  const wire = (stream, sink) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        sink.push(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
  };
  wire(child.stdout, state.lines);
  wire(child.stderr, state.stderr);
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  return { child, state };
}

export function hasLine(state, substr) {
  return [...state.lines, ...state.stderr].some((l) => l.includes(substr));
}

export function countLines(state, substr) {
  return state.lines.filter((l) => l.includes(substr)).length;
}

export async function waitForLine(state, substr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = state.lines.find((l) => l.includes(substr));
    if (hit) return hit;
    if (state.exited) {
      await sleep(50);
      const late = state.lines.find((l) => l.includes(substr));
      if (late) return late;
      throw new Error(
        `relay child exited (code=${state.exitInfo?.code} signal=${state.exitInfo?.signal}) before "${substr}". ` +
          `stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`,
      );
    }
    await sleep(40);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for "${substr}". stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`);
}

/** Wait until at least `n` stdout lines contain `substr` (a reconnect prints a 2nd). */
export async function waitForCount(state, substr, n, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (countLines(state, substr) >= n) return;
    if (state.exited) {
      await sleep(50);
      if (countLines(state, substr) >= n) return;
      throw new Error(
        `relay child exited (code=${state.exitInfo?.code}) before ${n}× "${substr}". ` +
          `stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`,
      );
    }
    await sleep(40);
  }
  throw new Error(`timeout waiting for ${n}× "${substr}". stdout=[${state.lines.join(" | ")}] stderr=[${state.stderr.join(" | ")}]`);
}

export function waitExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for relay child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export async function pollUntil(pred, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pred()) return;
    await sleep(200);
  }
  throw new Error(`pollUntil timeout (${timeoutMs}ms): ${label}`);
}

/** Invoke the D3 redrive via the actual CLI (`relay.mjs redrive <id>`) and parse its JSON. */
export function runRedriveCli(eventId, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RELAY_SCRIPT, "redrive", eventId], {
      cwd: RUNTIME_CWD,
      env: { ...process.env, RELAY_TEST_MODE: "1", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("redrive CLI timeout"));
    }, 15000);
    child.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`redrive CLI exit ${code}: ${err}`));
      const line = out.split("\n").map((s) => s.trim()).filter(Boolean).find((s) => s.startsWith("{"));
      if (!line) return reject(new Error(`redrive CLI produced no JSON: stdout=[${out}] stderr=[${err}]`));
      resolve(JSON.parse(line));
    });
  });
}

// ---------------------------------------------------------------------------
// In-process drain helpers (clara_runtime role).
// ---------------------------------------------------------------------------

/** Drain a firm to head in-process, looping cycles (each bounded by the per-firm cap). */
export async function drainInProcess(firm, opts = {}) {
  const head = await fx.headSeq(firm);
  for (let i = 0; i < 50; i++) {
    await fx.asRuntime((c) => runRelayCycle(c, { onlyFirm: firm, batchSize: 3, ...opts }));
    if ((await fx.checkpointSeq(firm)) === head) return;
  }
  throw new Error(`drainInProcess: firm ${firm} did not reach head ${head} within 50 cycles`);
}

/** Commit exactly `nBatches` batches for a firm in-process (deterministic progress). */
export async function advanceBatches(firm, nBatches, batchSize = 3) {
  return fx.asRuntime(async (c) => {
    let last = (await fx.checkpointSeq(firm)) ?? 0;
    let done = 0;
    for (let i = 0; i < nBatches; i++) {
      const res = await routeBatchForFirm(c, { firmId: firm, lastSeq: last, batchSize, testBatchDelayMs: 0 });
      if (res.processed === 0) break;
      last = res.maxSeq;
      done += 1;
    }
    return done;
  });
}

/** Shared final assertions: exactly one intent per wake-bound event, no dupes/gaps. */
export async function assertExactlyOnce(firm, expectedWakeBound) {
  const intents = await fx.wakeIntentsForFirm(firm);
  const wb = await fx.wakeBoundEventIds(firm);
  const av = await fx.activeTaxonomyVersion();

  assert.equal(intents.length, expectedWakeBound, `intent count == wake-bound event count (${expectedWakeBound})`);
  const ids = new Set(intents.map((i) => i.eventId));
  assert.equal(ids.size, intents.length, "no duplicate wake_intents (unique event_id)");
  assert.deepEqual(ids, new Set(wb.map((e) => e.id)), "intents cover exactly the wake-bound event set (no gaps, no extras)");
  for (const it of intents) assert.equal(it.taxonomyVersion, av, `intent stamped active taxonomy version ${av}`);

  assert.equal(await fx.checkpointSeq(firm), await fx.headSeq(firm), "checkpoint == firm head seq");
  assert.equal((await fx.deadLettersForFirm(firm)).length, 0, "zero dead-letters");
}
