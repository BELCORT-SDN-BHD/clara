// Slice-6 scanner degrade (PIN-AB-2) — pure unit tests (no DB). Verifies that (a) an
// unreachable clamd makes a scan FAIL CLOSED honestly (503 scanner_unavailable —
// nothing bypasses scanning), and (b) the supervisor RESTARTS clamd with bounded
// backoff on exit instead of taking the runtime down, and `done` settles only on stop.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFile, IntakeScanError, startManagedScanner } from "../lib/scan.mjs";

test("scanFile fails closed HONESTLY (503 scanner_unavailable) when clamd is unreachable", async () => {
  const savedMode = process.env.RELAY_TEST_MODE;
  const savedSocket = process.env.CLARA_CLAMD_SOCKET;
  delete process.env.RELAY_TEST_MODE; // exercise the REAL clamd path
  process.env.CLARA_CLAMD_SOCKET = "127.0.0.1:1"; // nothing listens -> connection refused
  try {
    await assert.rejects(
      () => scanFile("nonexistent-file-path.bin"),
      (err) => err instanceof IntakeScanError && err.code === "scanner_unavailable" && err.status === 503,
      "an unreachable scanner is a retryable 503, not a generic 500 — and nothing is stored unscanned",
    );
  } finally {
    if (savedMode === undefined) delete process.env.RELAY_TEST_MODE;
    else process.env.RELAY_TEST_MODE = savedMode;
    if (savedSocket === undefined) delete process.env.CLARA_CLAMD_SOCKET;
    else process.env.CLARA_CLAMD_SOCKET = savedSocket;
  }
});

test("startManagedScanner RESTARTS clamd on exit with bounded backoff; done never rejects", async () => {
  const saved = {
    mode: process.env.RELAY_TEST_MODE,
    managed: process.env.CLARA_CLAMD_MANAGED,
    clamd: process.env.CLARA_CLAMD_BIN,
    fresh: process.env.CLARA_FRESHCLAM_BIN,
    min: process.env.CLARA_CLAMD_MIN_BACKOFF_MS,
    max: process.env.CLARA_CLAMD_MAX_BACKOFF_MS,
  };
  delete process.env.RELAY_TEST_MODE;
  process.env.CLARA_CLAMD_MANAGED = "1";
  // A "clamd"/"freshclam" that exits immediately: node with an unknown flag errors and
  // exits fast, so the supervise loop sees repeated exits and must restart each time.
  process.env.CLARA_CLAMD_BIN = process.execPath;
  process.env.CLARA_FRESHCLAM_BIN = process.execPath;
  process.env.CLARA_CLAMD_MIN_BACKOFF_MS = "10";
  process.env.CLARA_CLAMD_MAX_BACKOFF_MS = "40";

  let restarts = 0;
  let sawFailClosedNote = false;
  const scanner = startManagedScanner({
    log: (m) => {
      if (/restarting in/.test(m)) restarts += 1;
      if (/intake fails closed/.test(m)) sawFailClosedNote = true;
    },
  });
  assert.ok(scanner, "managed scanner starts when CLARA_CLAMD_MANAGED=1 outside test mode");

  let rejected = false;
  scanner.done.then(
    () => {},
    () => {
      rejected = true;
    },
  );

  await new Promise((r) => setTimeout(r, 200)); // ~several fast exit/backoff cycles
  await scanner.stop();

  try {
    assert.ok(restarts >= 2, `clamd should have restarted on exit (bounded backoff); saw ${restarts} restarts`);
    assert.ok(sawFailClosedNote, "each restart notes that intake fails closed while clamd is down");
    assert.equal(rejected, false, "a clamd exit is NO LONGER runtime-fatal — done must not reject");
  } finally {
    for (const [k, v] of Object.entries({
      RELAY_TEST_MODE: saved.mode,
      CLARA_CLAMD_MANAGED: saved.managed,
      CLARA_CLAMD_BIN: saved.clamd,
      CLARA_FRESHCLAM_BIN: saved.fresh,
      CLARA_CLAMD_MIN_BACKOFF_MS: saved.min,
      CLARA_CLAMD_MAX_BACKOFF_MS: saved.max,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
