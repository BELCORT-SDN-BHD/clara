// R9 storage write probe (docs/plan/active/harness-audit-rulings-2026-08-26.md — the
// MEASUREMENT half of follow-up (a) of docs/ops/incident-2026-07-26-intake-storage.md). Unit-
// level: exercises storage-probe.mjs directly against storage.mjs's own RELAY_TEST_MODE seams
// (local-fs fallback + the injectable globalThis.__claraStorageForTest shim already defined in
// storage.mjs), so no DB rig and no live Supabase credential are needed. checkReadiness()'s own
// wiring of checks.storage_write is presence-pinned in ready.test.mjs's fresh-beats cell (rig-gated).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Readable } from "node:stream";
import { StorageError } from "../lib/storage.mjs";
import { readinessHasHardFailure } from "../lib/readiness-policy.mjs";
import {
  _currentProbeForTest,
  _probeStorageOnceForTest,
  _refreshStorageProbeForTest,
  _resetStorageProbeCacheForTest,
  _waitForStorageProbeSettleForTest,
  storageProbeHealth,
} from "../lib/storage-probe.mjs";

let root;
let previousStorageDir;
let previousMode;
let previousCacheMs;
let previousTimeoutMs;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-storage-probe-"));
  previousStorageDir = process.env.CLARA_TEST_STORAGE_DIR;
  previousMode = process.env.RELAY_TEST_MODE;
  previousCacheMs = process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  previousTimeoutMs = process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
  // Leave CLARA_STORAGE_PROBE_CACHE_MS at its real (60s) default: the correctness arms below
  // use _probeStorageOnceForTest(), which bypasses the cache/interval facade entirely, so the
  // cache duration is irrelevant to them. The facade tests that DO care about the interval
  // override this locally and restore it — a short GLOBAL default here would instead leave
  // every facade test's background interval free-running at ~0ms between tests (each
  // `beforeEach` only clears an ALREADY-SCHEDULED interval; it cannot un-invoke a timer callback
  // that already started), which is exactly what caused a stray cross-test probe call the first
  // time this file was written this way.
});

after(async () => {
  _resetStorageProbeCacheForTest();
  if (previousStorageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorageDir;
  if (previousMode === undefined) delete process.env.RELAY_TEST_MODE;
  else process.env.RELAY_TEST_MODE = previousMode;
  if (previousCacheMs === undefined) delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  else process.env.CLARA_STORAGE_PROBE_CACHE_MS = previousCacheMs;
  if (previousTimeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
  else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previousTimeoutMs;
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  delete globalThis.__claraStorageForTest;
  _resetStorageProbeCacheForTest();
});

// --- the round-trip itself (bypasses the cache/interval facade for determinism) ------------

test("storage probe: success arm — write, read back, bytes match -> ok:true", async () => {
  const r = await _probeStorageOnceForTest();
  assert.equal(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
});

test("storage probe: storage-failure arm — a write rejection reports not-ok with a reason, never throws", async () => {
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError("storage_error", "simulated permission denied (403)");
    },
  };
  const r = await _probeStorageOnceForTest();
  assert.equal(r.ok, false, "a write failure must not report ok:true");
  assert.equal(r.reason, "storage_error");
});

test("storage probe: timeout arm — a hung storage call resolves not-ok within the bound, never hangs", async () => {
  globalThis.__claraStorageForTest = {
    // Settles well after the shortened hard-timeout below, simulating a wedged/slow-to-answer
    // storage backend — long enough to prove the RACE (the timeout branch wins), but not
    // eternal: node:test flags a truly-never-settling promise left dangling past a test's own
    // completion as a leak, and the abandoned call is left to finish in the background
    // regardless, exactly as it would in production.
    put: () => new Promise((resolve) => setTimeout(() => resolve({ created: true, existed: false }), 200)),
  };
  process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = "50";
  try {
    const startedAt = Date.now();
    const r = await _probeStorageOnceForTest();
    const elapsedMs = Date.now() - startedAt;
    assert.equal(r.ok, false, "a timed-out probe must not report ok:true");
    assert.equal(r.reason, "storage_probe_timeout");
    assert.ok(elapsedMs < 2_000, `expected the timeout bound (50ms) to cap latency, took ${elapsedMs}ms`);
  } finally {
    if (previousTimeoutMs === undefined) delete process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS;
    else process.env.CLARA_STORAGE_PROBE_TIMEOUT_MS = previousTimeoutMs;
  }
});

test("storage probe: read-back-mismatch arm — tampered bytes on readback report not-ok, never a silent pass", async () => {
  globalThis.__claraStorageForTest = {
    // put is left un-injected (falls through to the real local-fs write); only the readback
    // is tampered with, isolating the mismatch check from the write check.
    get: async () => Readable.from([Buffer.from("this-is-not-the-probe-payload")]),
  };
  const r = await _probeStorageOnceForTest();
  assert.equal(r.ok, false, "a readback mismatch must not report ok:true");
  assert.equal(r.reason, "storage_probe_readback_mismatch");
});

// --- the sync/interval facade health.mjs actually calls -------------------------------------

test("storage probe facade: cold start is optimistic (ok:true, pending:true) and returns synchronously", async () => {
  const r = storageProbeHealth();
  assert.deepEqual(r, { ok: true, reason: null, pending: true, consecutive_failures: 0 });
  // storageProbeHealth() kicked off a real background cycle as a side effect of the call
  // above; drain it before this test returns so it cannot land, unawaited, inside the NEXT
  // test's window (that stray-call race is exactly what production the busy guard prevents
  // for OVERLAPPING cycles, but a cross-test leak needs the test itself to drain).
  await _waitForStorageProbeSettleForTest();
});

test("storage probe facade: consecutive failures count upward and the first success resets the count", async () => {
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError("storage_error", "simulated write rejection");
    },
  };
  const first = await _waitForStorageProbeSettleForTest();
  assert.deepEqual(first, { ok: false, reason: "storage_error", pending: false, consecutive_failures: 1 });
  assert.equal(
    readinessHasHardFailure({ db: { ok: true }, storage_write: first }, false),
    false,
    "the first storage failure remains inside the readiness tolerance",
  );

  const second = await _refreshStorageProbeForTest();
  assert.deepEqual(second, { ok: false, reason: "storage_error", pending: false, consecutive_failures: 2 });
  assert.equal(
    readinessHasHardFailure({ db: { ok: true }, storage_write: second }, false),
    true,
    "the second consecutive storage failure is a hard readiness failure",
  );

  delete globalThis.__claraStorageForTest;
  const recovered = await _refreshStorageProbeForTest();
  assert.deepEqual(recovered, { ok: true, reason: null, pending: false, consecutive_failures: 0 });
  assert.equal(
    readinessHasHardFailure({ db: { ok: true }, storage_write: recovered }, false),
    false,
    "the first successful probe resets readiness",
  );
  assert.equal(
    readinessHasHardFailure({ db: { ok: false }, storage_write: recovered }, false),
    true,
    "a DB-only failure remains a hard readiness failure",
  );
});

test("storage probe facade: settles once, then repeat calls stay synchronous (no re-probe) until the cache expires", async () => {
  // Correctness of the round trip itself is already covered by the success/failure/timeout/
  // mismatch arms above (via _probeStorageOnceForTest, which bypasses this cache entirely).
  // This test's only job is call-count discipline, so the injected put need not be
  // byte-correct — it only needs to be COUNTABLE.
  let putCalls = 0;
  globalThis.__claraStorageForTest = {
    put: async () => {
      putCalls += 1;
      return { created: true, existed: false };
    },
  };
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "60000";
  try {
    const settled = await _waitForStorageProbeSettleForTest();
    assert.equal(settled.pending, false, "must have settled out of the cold-start pending state");
    assert.equal(putCalls, 1, "the first-ever call must trigger exactly one probe cycle");

    storageProbeHealth();
    storageProbeHealth();
    assert.equal(putCalls, 1, "calls inside the cache window must not re-touch storage");
  } finally {
    // Stop the interval immediately rather than leaving it to fire again (at the 60s override
    // above) somewhere inside a later test's window.
    _resetStorageProbeCacheForTest();
    delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  }
});

test("storage probe facade: logs via console.error only on a red<->green transition, never on a steady-state repeat", async () => {
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError("storage_error", "simulated permission denied");
    },
  };
  process.env.CLARA_STORAGE_PROBE_CACHE_MS = "20";
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const first = await _waitForStorageProbeSettleForTest();
    assert.equal(first.ok, false);
    assert.equal(logs.length, 1, `expected exactly one transition log for the cold(green)->red flip, got ${JSON.stringify(logs)}`);
    assert.match(logs[0], /GREEN -> RED/);

    // Let the background interval fire several more times while still red — steady state,
    // no new transition, so no new log line.
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(logs.length, 1, `a still-red repeat must not log again, got ${JSON.stringify(logs)}`);
  } finally {
    console.error = originalError;
    // Stop the fast (20ms) interval immediately — otherwise it keeps ticking into later tests'
    // windows until their own beforeEach happens to clear it.
    _resetStorageProbeCacheForTest();
    delete process.env.CLARA_STORAGE_PROBE_CACHE_MS;
  }
});

test("storage probe facade: neither logs nor the public verdict carry raw credential or URL-query material", async () => {
  const rawCredentialMaterial = "synthetic-role-material";
  const rawUrlQuery = "https://storage.invalid/object?signature=synthetic-query-material";
  globalThis.__claraStorageForTest = {
    put: async () => {
      throw new StorageError(
        `vendor_code_${rawCredentialMaterial}_${rawUrlQuery}`,
        `vendor echoed ${rawCredentialMaterial} at ${rawUrlQuery}`,
      );
    },
  };
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const settled = await _waitForStorageProbeSettleForTest();
    assert.deepEqual(settled, { ok: false, reason: "storage_error", pending: false, consecutive_failures: 1 });
    assert.deepEqual(logs, ["[storage-probe] GREEN -> RED (storage_error)"]);
    assert.equal(logs[0].includes(rawCredentialMaterial), false);
    assert.equal(logs[0].includes(rawUrlQuery), false);
    assert.equal("detail" in storageProbeHealth(), false, "the unauthenticated /ready shape must not carry raw detail");
  } finally {
    console.error = originalError;
  }
});

// --- the probe key is pinned to the LIVE policy grammar, never retyped (review law 3) -------

test("storage probe: PROBE_KEY is pinned against the LIVE storage-provision.sql RLS policy, not retyped from a comment", async () => {
  const sqlPath = fileURLToPath(new URL("../../db/deploy/storage-provision.sql", import.meta.url));
  const sql = await readFile(sqlPath, "utf8");
  const predicates = [...sql.matchAll(/name\s*~\s*'(\^firms[^']+)'/g)].map((m) => m[1]);
  assert.equal(
    predicates.length,
    2,
    `expected exactly 2 policy predicates (insert+select) parsed out of storage-provision.sql, found ${predicates.length}`,
  );
  assert.equal(predicates[0], predicates[1], "the insert and select policy predicates must stay identical (mirrored, per the file's own comment)");

  const livePolicy = new RegExp(predicates[0]);
  const probe = _currentProbeForTest();
  assert.ok(livePolicy.test(probe.key), `the live storage RLS policy must accept today's probe key: ${probe.key}`);

  // Mutants prove the pin is non-vacuous: each must be REJECTED by the live policy, so a
  // regression that loosens PROBE_FIRM_ID or the extension would be caught here instead of
  // silently shipping a probe that no longer proves what it claims to (safeKey in storage.mjs
  // is case-insensitive; the live SQL policy is NOT — the uppercase-extension case below is
  // exactly the gap that would otherwise go unnoticed).
  const mutantVersionNibble0 = probe.key.replace(probe.firmId, "00000000-0000-0000-0000-000000000000");
  assert.equal(livePolicy.test(mutantVersionNibble0), false, "a version-nibble-0 firm id must be rejected by the live policy");

  const mutantVariantNibble0 = probe.key.replace(probe.firmId, "00000000-0000-4000-0000-000000000000");
  assert.equal(livePolicy.test(mutantVariantNibble0), false, "a variant-nibble-0 firm id must be rejected by the live policy");

  const mutantUppercaseExt = probe.key.replace(".probe", ".PROBE");
  assert.equal(livePolicy.test(mutantUppercaseExt), false, "the live policy is case-sensitive — an uppercase extension must be rejected");
});
