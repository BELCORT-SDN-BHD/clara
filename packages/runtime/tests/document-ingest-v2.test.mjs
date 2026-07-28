// documentIngest v1 -> v2 (ledger task #28): the sidecar-before-retries ordering fix. Pure
// unit tests against processDocumentTaskBehavior[V2] directly (no DB, no WDK) — the function
// takes `services`/`withRuntime` as plain parameters, so its contract is testable in full
// isolation. Full rationale in documentIngest.behavior_v2.mjs's own header.
//
// Two layers: a fully-mocked `services` double for fast, exhaustive contract cells (section 1),
// and the REAL spool.mjs-backed sidecar I/O (via lib/intake.mjs's makeDocumentServices, with
// only the vendor-touching methods faked) for one end-to-end proof that a retry genuinely
// works post-fix, and genuinely does not pre-fix (section 2) — the strongest form of the
// "failing-on-v1-shape / passing-on-v2" cell the work order asked for.

process.env.RELAY_TEST_MODE ??= "1";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { processDocumentTaskBehavior } from "../workflows/documentIngest.behavior.mjs";
import { processDocumentTaskBehaviorV2 } from "../workflows/documentIngest.behavior_v2.mjs";
import { readTaskMeta, removeTaskMeta, writeTaskMeta } from "../lib/spool.mjs";
import { makeDocumentServices } from "../lib/intake.mjs";

// ======================================================================================
// Section 1 — fully-mocked services: fast, exhaustive contract cells
// ======================================================================================

const TASK = Object.freeze({ storageKey: "canonical/key", sha256: "a".repeat(64), mime: "application/pdf", format: "pdf", lane: "ocr" });

/** A `services` double recording every call. `analyze`/`download` may be overridden to throw. */
function mockServices({ task = TASK, missingTask = false, download, analyze, parse } = {}) {
  const calls = { removeTaskMeta: [], noteTaskFailure: [], removeTempFile: [] };
  return {
    calls,
    noteClaim: async () => {},
    readTaskMeta: async () => (missingTask ? null : task),
    removeTaskMeta: async (taskId) => { calls.removeTaskMeta.push(taskId); },
    taskTempPath: (taskId) => `/fake-spool/task-${taskId}.bin`,
    removeTempFile: async (path) => { calls.removeTempFile.push(path); },
    downloadCanonical: download ?? (async () => {}),
    analyzeDocument: analyze ?? (async () => ({ pageCount: 1, envelope: { ok: true }, regions: [] })),
    parseStructured: parse ?? (async () => ({ pageCount: 1, envelope: { ok: true }, regions: [] })),
    noteTaskFailure: async (taskId, code) => { calls.noteTaskFailure.push({ taskId, code }); },
  };
}

/** A `withRuntime` double whose `client.query` either always succeeds or always throws. */
function mockWithRuntime({ queryThrows = false } = {}) {
  return async (fn) =>
    fn({
      query: async () => {
        if (queryThrows) throw Object.assign(new Error("db unavailable"), { code: "internal" });
        return { rows: [{ receipt: { task_id: "x", status: "ok" } }], rowCount: 1 };
      },
    });
}

const engineError = () => Object.assign(new Error("Azure DI engine error"), { code: "engine_error" });

test("v1 (documentIngest.behavior.mjs, unedited) — a failed attempt DESTROYS the sidecar: the pinned defect", async () => {
  const taskId = randomUUID();
  const services = mockServices({ analyze: async () => { throw engineError(); } });
  await assert.rejects(
    processDocumentTaskBehavior(services, mockWithRuntime(), taskId),
    (err) => err.code === "engine_error",
  );
  assert.deepEqual(services.calls.removeTaskMeta, [taskId], "v1 removes the sidecar on this very failure, before any retry runs");
  assert.deepEqual(services.calls.noteTaskFailure, [], "v1 never records the failure onto the sidecar on this path");
});

test("v2 — a failed attempt NEVER destroys the sidecar; it records the failure code onto it instead", async () => {
  const taskId = randomUUID();
  const services = mockServices({ analyze: async () => { throw engineError(); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId),
    (err) => err.code === "engine_error",
  );
  assert.deepEqual(services.calls.removeTaskMeta, [], "the sidecar must survive a failure — a retry needs it");
  assert.deepEqual(services.calls.noteTaskFailure, [{ taskId, code: "engine_error" }]);
});

test("v2 — an UNCATEGORISED error still maps to 'internal' and is still recorded, never silently dropped", async () => {
  const taskId = randomUUID();
  const services = mockServices({ analyze: async () => { throw new Error("something unexpected"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId));
  assert.deepEqual(services.calls.noteTaskFailure, [{ taskId, code: "internal" }]);
  assert.deepEqual(services.calls.removeTaskMeta, []);
});

test("v2 — a download failure (before the vendor call) behaves identically to an analyze failure", async () => {
  const taskId = randomUUID();
  const services = mockServices({ download: async () => { throw Object.assign(new Error("storage read failed"), { code: "storage_error" }); } });
  await assert.rejects(processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId));
  assert.deepEqual(services.calls.noteTaskFailure, [{ taskId, code: "storage_error" }]);
  assert.deepEqual(services.calls.removeTaskMeta, []);
});

test("v2 — when the DB persist-failure write ITSELF throws, the sidecar is STILL updated and the ORIGINAL error still wins", async () => {
  const taskId = randomUUID();
  const services = mockServices({ analyze: async () => { throw engineError(); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(services, mockWithRuntime({ queryThrows: true }), taskId),
    (err) => err.code === "engine_error" && err.message === "Azure DI engine error",
    "the DB write's own failure must never mask the real diagnostic error",
  );
  assert.deepEqual(services.calls.noteTaskFailure, [{ taskId, code: "engine_error" }], "unconditional — runs whether or not the DB write above succeeded");
  assert.deepEqual(services.calls.removeTaskMeta, []);
});

test("v2 — the temp file is ALWAYS cleaned up, success or failure (unchanged from v1 — never the bug)", async () => {
  const taskId = randomUUID();
  const failing = mockServices({ analyze: async () => { throw engineError(); } });
  await assert.rejects(processDocumentTaskBehaviorV2(failing, mockWithRuntime(), taskId));
  assert.deepEqual(failing.calls.removeTempFile, [`/fake-spool/task-${taskId}.bin`]);

  const succeeding = mockServices();
  await processDocumentTaskBehaviorV2(succeeding, mockWithRuntime(), taskId);
  assert.deepEqual(succeeding.calls.removeTempFile, [`/fake-spool/task-${taskId}.bin`]);
});

test("v2 — a SUCCESSFUL extraction removes the sidecar exactly as v1 does (terminal-success behaviour is unchanged)", async () => {
  const taskId = randomUUID();
  const services = mockServices();
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId);
  assert.deepEqual(result, { taskId, status: "done", lane: "ocr" });
  assert.deepEqual(services.calls.removeTaskMeta, [taskId]);
  assert.deepEqual(services.calls.noteTaskFailure, []);
});

test("v2 — the lane==='none' store-only completion removes the sidecar exactly as v1 does", async () => {
  const taskId = randomUUID();
  const services = mockServices({ task: { ...TASK, lane: "none" } });
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId);
  assert.deepEqual(result, { taskId, status: "done", lane: "none" });
  assert.deepEqual(services.calls.removeTaskMeta, [taskId]);
});

test("v2 — structured_parse lane calls parseStructured, not analyzeDocument, and still succeeds/cleans up the same way", async () => {
  const taskId = randomUUID();
  let parseCalled = false;
  const services = mockServices({ task: { ...TASK, lane: "structured_parse" }, parse: async () => { parseCalled = true; return { pageCount: 1, envelope: {}, regions: [] }; } });
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId);
  assert.equal(parseCalled, true);
  assert.deepEqual(result, { taskId, status: "done", lane: "structured_parse" });
});

test("v1 and v2 — a missing sidecar at the START throws the SAME 'no durable runtime metadata' error (unchanged base case, both versions)", async () => {
  const taskId = randomUUID();
  for (const fn of [processDocumentTaskBehavior, processDocumentTaskBehaviorV2]) {
    await assert.rejects(fn(mockServices({ missingTask: true }), mockWithRuntime(), taskId), (err) => /has no durable runtime metadata/.test(err.message));
  }
});

// ======================================================================================
// Section 2 — REAL sidecar I/O (lib/spool.mjs + lib/intake.mjs's makeDocumentServices),
// only the vendor-touching methods faked. This is the end-to-end proof: a real retry, using
// the REAL read-merge-write sidecar semantics, works after the fix and is broken before it.
// ======================================================================================

let root;
let previousSpool;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-doc-ingest-v2-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
});

after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  await rm(root, { recursive: true, force: true });
});

/** The real production DocumentServices, with only the vendor/storage calls faked. */
function realServicesWith({ download, analyze } = {}) {
  return {
    ...makeDocumentServices(),
    downloadCanonical: download ?? (async () => {}),
    analyzeDocument: analyze ?? (async () => ({ pageCount: 1, envelope: {}, regions: [] })),
  };
}

test("THE FIX, end to end: a real sidecar survives a failed v2 attempt, and a real retry then succeeds using it", async () => {
  const taskId = randomUUID();
  await writeTaskMeta(taskId, { taskId, ...TASK, status: "running" });

  // Attempt 1: the vendor call fails.
  const attempt1 = realServicesWith({ analyze: async () => { throw engineError(); } });
  await assert.rejects(processDocumentTaskBehaviorV2(attempt1, mockWithRuntime(), taskId), (err) => err.code === "engine_error");

  // The REAL sidecar on disk must still exist, with its transport fields intact AND the
  // diagnostic code recorded — exactly what a retry (or a human) needs.
  const afterAttempt1 = await readTaskMeta(taskId);
  assert.ok(afterAttempt1, "the sidecar must still exist after a failed attempt");
  assert.equal(afterAttempt1.storageKey, TASK.storageKey);
  assert.equal(afterAttempt1.sha256, TASK.sha256);
  assert.equal(afterAttempt1.lastError, "engine_error", "the diagnostic code is readable without touching the DB");

  // Attempt 2 — the retry: the SAME taskId, no re-seeding, the transient error now resolved.
  const attempt2 = realServicesWith({ analyze: async () => ({ pageCount: 2, envelope: {}, regions: [] }) });
  const result = await processDocumentTaskBehaviorV2(attempt2, mockWithRuntime(), taskId);
  assert.deepEqual(result, { taskId, status: "done", lane: "ocr" });

  // A genuine terminal success removes the sidecar — the ONLY point it should ever disappear.
  assert.equal(await readTaskMeta(taskId), null);

  await removeTaskMeta(taskId).catch(() => {}); // idempotent cleanup safety net
});

test("THE DEFECT, end to end (v1, unedited): the SAME retry sequence fails on the SECOND attempt with a masked, generic error", async () => {
  const taskId = randomUUID();
  await writeTaskMeta(taskId, { taskId, ...TASK, status: "running" });

  const attempt1 = realServicesWith({ analyze: async () => { throw engineError(); } });
  await assert.rejects(processDocumentTaskBehavior(attempt1, mockWithRuntime(), taskId), (err) => err.code === "engine_error");

  // v1 already deleted the sidecar during attempt 1 — the defect, proven against real spool I/O.
  assert.equal(await readTaskMeta(taskId), null, "v1's real sidecar is gone after just one failure");

  // Attempt 2 (the retry WDK's step-retry would issue): the vendor call would now succeed, but
  // it never gets the chance — the function fails before it can even try, on a DIFFERENT,
  // uninformative error that buries the real "engine_error" diagnosis from attempt 1.
  const attempt2 = realServicesWith({ analyze: async () => ({ pageCount: 2, envelope: {}, regions: [] }) });
  await assert.rejects(
    processDocumentTaskBehavior(attempt2, mockWithRuntime(), taskId),
    (err) => /has no durable runtime metadata/.test(err.message),
    "the retry cannot even attempt the real work — its failure reason is generic, not 'engine_error'",
  );
});
