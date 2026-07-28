// Slice-6 scanner degrade (PIN-AB-2) — pure unit tests (no DB). Verifies that (a) an
// unreachable clamd makes a scan FAIL CLOSED honestly (503 scanner_unavailable —
// nothing bypasses scanning), and (b) the supervisor RESTARTS clamd with bounded
// backoff on exit instead of taking the runtime down, and `done` settles only on stop.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanFile, IntakeScanError, startManagedScanner } from "../lib/scan.mjs";

/** Start a throwaway TCP "clamd" on an ephemeral loopback port; `onConn(socket)` decides
 *  how it (mis)behaves. Returns { addr, close } where addr is "127.0.0.1:<port>". */
function fakeClamd(onConn) {
  return new Promise((resolve) => {
    const server = net.createServer(onConn);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ addr: `127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function tempFile(bytes) {
  const p = path.join(os.tmpdir(), `clara-scan-${process.pid}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(p, Buffer.alloc(bytes, 0x41));
  return p;
}

/** Poll `predicate` until it is true or `timeoutMs` elapses (rig triage, task #10 —
 *  a fixed wall-clock sleep is not a bound on spawn()/backoff timing under box load).
 *  Never throws: a timeout just stops polling, so the caller's OWN assertion reports
 *  the true observed state honestly instead of this helper masking a real regression. */
async function waitUntil(predicate, { timeoutMs = 5000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return predicate();
}

async function withRealScanPath(addr, extraEnv, fn) {
  const saved = { mode: process.env.RELAY_TEST_MODE, socket: process.env.CLARA_CLAMD_SOCKET, ...Object.fromEntries(Object.keys(extraEnv).map((k) => [k, process.env[k]])) };
  delete process.env.RELAY_TEST_MODE; // exercise the REAL clamd path
  process.env.CLARA_CLAMD_SOCKET = addr;
  for (const [k, v] of Object.entries(extraEnv)) process.env[k] = v;
  try {
    return await fn();
  } finally {
    if (saved.mode === undefined) delete process.env.RELAY_TEST_MODE;
    else process.env.RELAY_TEST_MODE = saved.mode;
    if (saved.socket === undefined) delete process.env.CLARA_CLAMD_SOCKET;
    else process.env.CLARA_CLAMD_SOCKET = saved.socket;
    for (const k of Object.keys(extraEnv)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("scanFile FAILS CLOSED (no crash) when clamd dies MID-STREAM after connect", async () => {
  // The server accepts, then kills the connection on the first bytes (RST) — modelling an
  // OOM kill during INSTREAM. scanFile must resolve to a 503 refusal via its persistent
  // 'error' handler, never letting an unhandled socket 'error' reach the process handler.
  const clamd = await fakeClamd((socket) => {
    socket.once("data", () => {
      if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
      else socket.destroy();
    });
  });
  const file = tempFile(256 * 1024); // large enough that streaming is still in flight
  try {
    await withRealScanPath(clamd.addr, {}, () =>
      assert.rejects(
        () => scanFile(file),
        (err) => err instanceof IntakeScanError && err.status === 503,
        "a mid-stream clamd death fails closed (503) without crashing the runtime",
      ),
    );
  } finally {
    fs.rmSync(file, { force: true });
    await clamd.close();
  }
});

test("scanFile FAILS CLOSED on a WEDGED scanner (connected but silent) via the scan-wide deadline", async () => {
  // The server accepts and then never responds or closes. Without a scan-wide deadline the
  // scan would hang forever; the deadline turns it into a fail-closed 503.
  const held = [];
  const clamd = await fakeClamd((socket) => held.push(socket)); // accept, never reply/close
  const file = tempFile(1024);
  try {
    await withRealScanPath(clamd.addr, { CLARA_CLAMD_SCAN_DEADLINE_MS: "120" }, () =>
      assert.rejects(
        () => scanFile(file),
        (err) => err instanceof IntakeScanError && err.code === "scanner_unavailable" && err.status === 503,
        "a wedged scanner trips the deadline and fails closed (503), never hangs",
      ),
    );
  } finally {
    for (const s of held) s.destroy();
    fs.rmSync(file, { force: true });
    await clamd.close();
  }
});

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

  // Condition-based wait (rig triage, task #10): a fixed 200ms sleep flaked under box
  // load — spawn()/backoff timing is not guaranteed within any fixed wall-clock window.
  // Poll until at least 2 restart cycles are OBSERVED, bounded so a genuine regression
  // (the supervisor stops restarting) still fails the assertion below rather than
  // hanging the test forever.
  await waitUntil(() => restarts >= 2);
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
