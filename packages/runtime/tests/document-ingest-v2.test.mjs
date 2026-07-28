// documentIngest v1 -> v2 (ledger task #28): the sidecar-before-retries ordering fix,
// REDESIGNED after an O-round adversarial finding (P1, blocker) proved sidecar
// preservation alone insufficient — see documentIngest.behavior_v2.mjs's own header for
// the full diagnosis. Pure unit tests against processDocumentTaskBehavior[V2] directly (no
// DB, no WDK) — the function takes `services`/`withRuntime`/`attempt` as plain parameters,
// so its contract is testable in full isolation. The load-bearing, end-to-end proofs
// (a real retry landing 'done' against live SQL; the doomed-retry reproduction on v1) live
// in document-ingest-v2-db.test.mjs, against a real rig — a mock cannot prove a DB guard.

process.env.RELAY_TEST_MODE ??= "1";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { FatalError } from "workflow";

import { processDocumentTaskBehavior } from "../workflows/documentIngest.behavior.mjs";
import { MAX_RETRIES, processDocumentTaskBehaviorV2 } from "../workflows/documentIngest.behavior_v2.mjs";
import { makeDocumentServices } from "../lib/intake.mjs";
import { readTaskMeta, writeTaskMeta } from "../lib/spool.mjs";

// ======================================================================================
// Section 1 — fully-mocked services: fast, exhaustive contract cells
// ======================================================================================

const TASK = Object.freeze({ storageKey: "canonical/key", sha256: "a".repeat(64), mime: "application/pdf", format: "pdf", lane: "ocr" });

/** A `services` double recording every call. `analyze`/`download` may be overridden to throw. */
function mockServices({ task = TASK, missingTask = false, download, analyze, parse } = {}) {
  const calls = { removeTaskMeta: [], noteTransientFailure: [], noteTerminalFailure: [], removeTempFile: [] };
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
    noteTransientFailure: async (taskId, code, note) => { calls.noteTransientFailure.push({ taskId, code, note }); },
    noteTerminalFailure: async (taskId, code, note) => { calls.noteTerminalFailure.push({ taskId, code, note }); },
  };
}

/** A `withRuntime` double whose `client.query` either always succeeds or always throws
 *  `queryError` (defaulting to a generic, non-CLR10/CLR16 failure) for the WRITE call
 *  (persist_document_extraction). R1: a SEPARATE query — the state re-read
 *  (`select status from clara.document_processing_tasks`) — is answered independently via
 *  `taskStatusOnReread`, matched by inspecting the SQL text so both calls can be scripted
 *  distinctly in one test. Leaving `taskStatusOnReread` undefined simulates the re-read
 *  itself finding no row (rowCount 0) — the "genuinely couldn't verify" shape. */
function mockWithRuntime({ queryThrows = false, queryError = errOf("internal", "db unavailable"), taskStatusOnReread } = {}) {
  return async (fn) =>
    fn({
      query: async (sql) => {
        if (typeof sql === "string" && /select\s+status\s+from\s+clara\.document_processing_tasks/i.test(sql)) {
          return taskStatusOnReread === undefined ? { rows: [], rowCount: 0 } : { rows: [{ status: taskStatusOnReread }], rowCount: 1 };
        }
        if (queryThrows) throw queryError;
        return { rows: [{ receipt: { task_id: "x", status: "ok" } }], rowCount: 1 };
      },
    });
}

const errOf = (code, message = "boom") => Object.assign(new Error(message), { code });

test("v1 (documentIngest.behavior.mjs, unedited) — a failed attempt DESTROYS the sidecar: the pinned defect", async () => {
  const taskId = "11111111-1111-1111-1111-111111111111";
  const services = mockServicesLikeV1();
  await assert.rejects(processDocumentTaskBehavior(services, mockWithRuntime(), taskId), (err) => err.code === "engine_error");
  assert.deepEqual(services.calls.removeTaskMeta, [taskId], "v1 removes the sidecar on this very failure, before any retry runs");
});

/** v1's own (unedited) services shape — it still calls `noteTaskFailure`, not the v2 split. */
function mockServicesLikeV1() {
  const calls = { removeTaskMeta: [] };
  return {
    calls,
    noteClaim: async () => {},
    readTaskMeta: async () => TASK,
    removeTaskMeta: async (taskId) => { calls.removeTaskMeta.push(taskId); },
    taskTempPath: (taskId) => `/fake-spool/task-${taskId}.bin`,
    removeTempFile: async () => {},
    downloadCanonical: async () => {},
    analyzeDocument: async () => { throw errOf("engine_error", "Azure DI engine error"); },
    parseStructured: async () => ({}),
    noteTaskFailure: async () => {},
  };
}

// ======================================================================================
// P1 (blocker) — retryability classification, mirroring invoiceFacts.v1.behavior.mjs's
// OWN `RETRYABLE` set verbatim: engine_error/timeout/engine_lost/storage_error retry;
// corrupt/encrypted/bad_type/limit/internal are terminal on the first attempt.
// ======================================================================================

test("v2 — TRANSIENT codes (engine_error/timeout/engine_lost/storage_error) never touch Postgres, note the sidecar, and re-throw the ORIGINAL retryable error", async () => {
  for (const code of ["engine_error", "timeout", "engine_lost", "storage_error"]) {
    const taskId = `xxxxxxxx-xxxx-xxxx-xxxx-${code.padEnd(12, "0").slice(0, 12)}`;
    const services = mockServices({ analyze: async () => { throw errOf(code); } });
    await assert.rejects(
      processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1),
      (err) => err.code === code && !(err instanceof FatalError),
      code,
    );
    assert.deepEqual(services.calls.removeTaskMeta, [], `${code}: the sidecar must survive — a retry needs it`);
    assert.deepEqual(services.calls.noteTransientFailure, [{ taskId, code, note: undefined }], code);
    assert.deepEqual(services.calls.noteTerminalFailure, [], code);
  }
});

test("v2 — TERMINAL codes (corrupt/encrypted/bad_type/limit/internal) persist 'failed', keep the sidecar, and throw a FatalError (settles the step, invites no retry)", async () => {
  for (const code of ["corrupt", "encrypted", "bad_type", "limit", "internal", "something-uncategorised"]) {
    const taskId = `yyyyyyyy-yyyy-yyyy-yyyy-000000000000`;
    const services = mockServices({ analyze: async () => { throw errOf(code === "internal" ? undefined : code); } });
    await assert.rejects(
      processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1),
      (err) => err instanceof FatalError,
      code,
    );
    assert.deepEqual(services.calls.removeTaskMeta, [], `${code}: never removed on failure — diagnostics survive`);
    assert.equal(services.calls.noteTerminalFailure.length, 1, code);
    assert.equal(services.calls.noteTransientFailure.length, 0, code);
  }
});

test("v2 — an uncategorised/unrecognised error code maps to 'internal' and is TERMINAL (fail closed on the unknown)", async () => {
  const taskId = "22222222-2222-2222-2222-222222222222";
  const services = mockServices({ analyze: async () => { throw new Error("something truly unexpected"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1), (err) => err instanceof FatalError);
  assert.deepEqual(services.calls.noteTerminalFailure, [{ taskId, code: "internal", note: undefined }]);
});

test("v2 — a download failure (before the vendor call) is classified identically to an analyze failure", async () => {
  const taskId = "33333333-3333-3333-3333-333333333333";
  const services = mockServices({ download: async () => { throw errOf("storage_error"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1), (err) => !(err instanceof FatalError));
  assert.deepEqual(services.calls.noteTransientFailure, [{ taskId, code: "storage_error", note: undefined }]);
});

// ======================================================================================
// The retry-budget exhaustion safety net: even a RETRYABLE code becomes terminal on the
// LAST allowed attempt, using `workflow`'s own getStepMetadata().attempt (threaded in as a
// plain parameter by documentIngest.impl_v2.ts) — closing the "stuck at running forever"
// gap a purely code-based split would leave open once WDK's own retries run out.
// ======================================================================================

test(`v2 — MAX_RETRIES is 3 (the framework default, stated explicitly): TOTAL_ATTEMPTS is 4`, () => {
  assert.equal(MAX_RETRIES, 3);
});

test("v2 — a TRANSIENT code on attempts 1-3 stays retryable; the SAME code on attempt 4 (budget exhausted) is forced terminal", async () => {
  for (const attempt of [1, 2, 3]) {
    const taskId = `44444444-4444-4444-4444-00000000000${attempt}`;
    const services = mockServices({ analyze: async () => { throw errOf("timeout"); } });
    await assert.rejects(processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, attempt), (err) => !(err instanceof FatalError), `attempt ${attempt}`);
    assert.deepEqual(services.calls.noteTerminalFailure, [], `attempt ${attempt} must not go terminal yet`);
  }
  const taskId = "44444444-4444-4444-4444-000000000004";
  const lastAttempt = mockServices({ analyze: async () => { throw errOf("timeout"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(lastAttempt, mockWithRuntime(), taskId, 4), (err) => err instanceof FatalError, "attempt 4 (== TOTAL_ATTEMPTS) must be forced terminal");
  assert.deepEqual(lastAttempt.calls.noteTerminalFailure, [{ taskId, code: "timeout", note: undefined }]);
  assert.deepEqual(lastAttempt.calls.noteTransientFailure, []);
});

test("Q4 — a GENUINE persist-'failed' write failure never masks the original error, and never claims the DB plane it couldn't confirm", async () => {
  const taskId = "55555555-5555-5555-5555-555555555555";
  const services = mockServices({ analyze: async () => { throw errOf("corrupt", "the file is corrupt"); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(services, mockWithRuntime({ queryThrows: true, queryError: errOf("internal", "db unavailable") }), taskId, 1),
    (err) => err instanceof FatalError && err.code === "corrupt" && err.message.includes("corrupt"),
    "the DB write's own failure must never mask the real diagnostic error",
  );
  // The DB plane is UNKNOWN (a generic failure, not a known-terminal refusal) — Q4:
  // stamping 'failed' here would be a claim Postgres never confirmed.
  assert.deepEqual(services.calls.noteTerminalFailure, [], "never stamp 'failed' on an unconfirmed write");
  const [note] = services.calls.noteTransientFailure;
  assert.equal(note.code, "corrupt");
  assert.ok(note.note && /persist_document_extraction.*itself failed/.test(note.note) && /corrupt/.test(note.note), "BOTH the original diagnosis and the persist failure are recorded, never discarded");
});

test("Q3/R1 — crash-redelivery: a DIFFERENT code replaying the SAME op_key hits CLR10, and the state re-read CONFIRMS status='failed' — detected as already-terminal, not swallowed as a generic error", async () => {
  const taskId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const services = mockServices({ analyze: async () => { throw errOf("encrypted", "the file is encrypted"); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(
      services,
      mockWithRuntime({ queryThrows: true, queryError: errOf("CLR10", "op_key reused with different args"), taskStatusOnReread: "failed" }),
      taskId, 1,
    ),
    (err) => err instanceof FatalError && err.code === "encrypted",
    "still settles the step — no second attempt is invited",
  );
  assert.deepEqual(services.calls.noteTransientFailure, [], "a CONFIRMED redelivery refusal is a KNOWN terminal shape, not an unconfirmed write (Q4 does not apply here)");
  const [note] = services.calls.noteTerminalFailure;
  assert.equal(note.code, "encrypted");
  assert.ok(/redelivery detected/.test(note.note) && /CLR10/.test(note.note), "the redelivery is named, not mistaken for a generic DB failure");
});

test("Q3/R1 — the SAME shape holds for CLR16 (the status guard's own already-terminal refusal), ALSO gated on the re-read confirming status='failed'", async () => {
  const taskId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const services = mockServices({ analyze: async () => { throw errOf("bad_type"); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(
      services,
      mockWithRuntime({ queryThrows: true, queryError: errOf("CLR16", "processing task is not running"), taskStatusOnReread: "failed" }),
      taskId, 1,
    ),
    (err) => err instanceof FatalError,
  );
  const [note] = services.calls.noteTerminalFailure;
  assert.ok(/redelivery detected/.test(note.note) && /CLR16/.test(note.note));
});

// ======================================================================================
// R1 (the R-round's blocker) — CLR10/CLR16 alone are NEVER proof of redelivery; the bare
// codes are overloaded with genuinely fresh causes (0026_lane_widen.sql:508-538: missing
// task, wrong lane, queued/held/done status). The two cells above prove the CONFIRMED-
// redelivery branch; these prove the other two branches the state re-read must produce.
// ======================================================================================

test("R1 — a CLR10/CLR16 refusal that re-reads as ALREADY-DONE takes the clean success path: no failure stamp, no contradiction of a fact Postgres already settled", async () => {
  const taskId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const services = mockServices({ analyze: async () => { throw errOf("corrupt", "the file is corrupt"); } });
  const result = await processDocumentTaskBehaviorV2(
    services,
    mockWithRuntime({ queryThrows: true, queryError: errOf("CLR16", "processing task is not running"), taskStatusOnReread: "done" }),
    taskId, 1,
  );
  assert.deepEqual(result, { taskId, status: "done", lane: "ocr" }, "the task ACTUALLY succeeded — this execution's own failure must not overrule it");
  assert.deepEqual(services.calls.noteTerminalFailure, [], "never stamp 'failed' on a task the DB confirms is 'done'");
  assert.deepEqual(services.calls.noteTransientFailure, [], "the state IS confirmed here — this is not an 'unknown DB plane' case");
  assert.deepEqual(services.calls.removeTaskMeta, [taskId], "the sidecar is cleared exactly like any other genuine success");
});

test("R1 — a CLR10/CLR16 refusal that re-reads as NEITHER 'failed' nor 'done' is a genuine fresh problem: never no-op'd, surfaced via the same honest both-errors shape as Q4", async () => {
  const taskId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const services = mockServices({ analyze: async () => { throw errOf("bad_type", "wrong type"); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(
      services,
      mockWithRuntime({ queryThrows: true, queryError: errOf("CLR16", "processing task is not running"), taskStatusOnReread: "queued" }),
      taskId, 1,
    ),
    (err) => err instanceof FatalError && err.code === "bad_type",
  );
  assert.deepEqual(services.calls.noteTerminalFailure, [], "never claim a redelivery was confirmed when the re-read shows something else entirely");
  const [note] = services.calls.noteTransientFailure;
  assert.equal(note.code, "bad_type");
  assert.ok(note.note && /processing task is not running/.test(note.note) && /re-read status="queued"/.test(note.note), "both the original diagnosis and the unexplained re-read state are recorded, never silently accepted as a handled redelivery");
});

test("R1 — a CLR10/CLR16 refusal whose state re-read finds NO ROW AT ALL is treated the same as 'anything else' — never assumed to be a handled redelivery from silence", async () => {
  const taskId = "11111111-2222-3333-4444-555555555555";
  const services = mockServices({ analyze: async () => { throw errOf("limit", "page limit exceeded"); } });
  await assert.rejects(
    processDocumentTaskBehaviorV2(
      services,
      mockWithRuntime({ queryThrows: true, queryError: errOf("CLR16", "processing task is not running") }), // taskStatusOnReread left undefined -> rowCount 0
      taskId, 1,
    ),
    (err) => err instanceof FatalError && err.code === "limit",
  );
  assert.deepEqual(services.calls.noteTerminalFailure, []);
  const [note] = services.calls.noteTransientFailure;
  assert.equal(note.code, "limit");
  assert.ok(/re-read status=null/.test(note.note), "an unresolvable re-read is recorded as null, not silently treated as confirmation of anything");
});

test("v2 — the temp file is ALWAYS cleaned up: transient, terminal, and success paths alike", async () => {
  const taskId = "66666666-6666-6666-6666-666666666666";
  const transient = mockServices({ analyze: async () => { throw errOf("timeout"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(transient, mockWithRuntime(), taskId, 1));
  assert.deepEqual(transient.calls.removeTempFile, [`/fake-spool/task-${taskId}.bin`]);

  const terminal = mockServices({ analyze: async () => { throw errOf("corrupt"); } });
  await assert.rejects(processDocumentTaskBehaviorV2(terminal, mockWithRuntime(), taskId, 1));
  assert.deepEqual(terminal.calls.removeTempFile, [`/fake-spool/task-${taskId}.bin`]);

  const succeeding = mockServices();
  await processDocumentTaskBehaviorV2(succeeding, mockWithRuntime(), taskId, 1);
  assert.deepEqual(succeeding.calls.removeTempFile, [`/fake-spool/task-${taskId}.bin`]);
});

test("v2 — a SUCCESSFUL extraction removes the sidecar exactly as v1 does (terminal-success behaviour is unchanged)", async () => {
  const taskId = "77777777-7777-7777-7777-777777777777";
  const services = mockServices();
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1);
  assert.deepEqual(result, { taskId, status: "done", lane: "ocr" });
  assert.deepEqual(services.calls.removeTaskMeta, [taskId]);
  assert.deepEqual(services.calls.noteTransientFailure, []);
  assert.deepEqual(services.calls.noteTerminalFailure, []);
});

test("v2 — the lane==='none' store-only completion removes the sidecar exactly as v1 does", async () => {
  const taskId = "88888888-8888-8888-8888-888888888888";
  const services = mockServices({ task: { ...TASK, lane: "none" } });
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1);
  assert.deepEqual(result, { taskId, status: "done", lane: "none" });
  assert.deepEqual(services.calls.removeTaskMeta, [taskId]);
});

test("v2 — structured_parse lane calls parseStructured, not analyzeDocument, and still succeeds/cleans up the same way", async () => {
  const taskId = "99999999-9999-9999-9999-999999999999";
  let parseCalled = false;
  const services = mockServices({ task: { ...TASK, lane: "structured_parse" }, parse: async () => { parseCalled = true; return { pageCount: 1, envelope: {}, regions: [] }; } });
  const result = await processDocumentTaskBehaviorV2(services, mockWithRuntime(), taskId, 1);
  assert.equal(parseCalled, true);
  assert.deepEqual(result, { taskId, status: "done", lane: "structured_parse" });
});

test("v1 and v2 — a missing sidecar at the START throws the SAME 'no durable runtime metadata' error (unchanged base case, both versions)", async () => {
  const taskId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  await assert.rejects(processDocumentTaskBehavior(mockServices({ missingTask: true }), mockWithRuntime(), taskId), (err) => /has no durable runtime metadata/.test(err.message));
  await assert.rejects(processDocumentTaskBehaviorV2(mockServices({ missingTask: true }), mockWithRuntime(), taskId, 1), (err) => /has no durable runtime metadata/.test(err.message));
});

// ======================================================================================
// Q1 — the noteTaskFailure alias must be v1-IDENTICAL: throw on a missing sidecar and
// create NOTHING, never silently manufacture a phantom sidecar for a workflow
// (invoiceFacts_v1) that is sidecar-free by design (PIN-AB-6). Real spool.mjs I/O against
// a temp dir — no DB needed, this is a pure filesystem contract.
// ======================================================================================

let q1Root;
let q1PreviousSpool;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  q1Root = await mkdtemp(join(base, "clara-doc-ingest-v2-q1-"));
  q1PreviousSpool = process.env.CLARA_SPOOL_DIR;
  process.env.CLARA_SPOOL_DIR = join(q1Root, "spool");
});

after(async () => {
  if (q1PreviousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = q1PreviousSpool;
  await rm(q1Root, { recursive: true, force: true });
});

test("Q1 — makeDocumentServices().noteTaskFailure (the v1 alias) on a MISSING sidecar throws and creates NOTHING — real spool.mjs, no mock", async () => {
  const taskId = randomUUID();
  assert.equal(await readTaskMeta(taskId), null, "precondition: genuinely no sidecar for this id");
  const services = makeDocumentServices();
  await assert.rejects(services.noteTaskFailure(taskId, "engine_error"), (err) => /has no durable runtime metadata/.test(err.message));
  assert.equal(await readTaskMeta(taskId), null, "still nothing on disk — no phantom sidecar was manufactured");
});

test("Q1 — the SAME alias on an EXISTING sidecar updates it exactly as v1's old updateTask did (status stays 'running')", async () => {
  const taskId = randomUUID();
  await writeTaskMeta(taskId, { taskId, lane: "ocr", status: "running" });
  const services = makeDocumentServices();
  await services.noteTaskFailure(taskId, "timeout");
  const meta = await readTaskMeta(taskId);
  assert.equal(meta.status, "running");
  assert.equal(meta.lastError, "timeout");
});

test("Q1 — noteTransientFailure and noteTerminalFailure (v2's own vocabulary) are equally strict: missing sidecar throws, nothing is created", async () => {
  const taskId = randomUUID();
  const services = makeDocumentServices();
  await assert.rejects(services.noteTransientFailure(taskId, "timeout"), (err) => /has no durable runtime metadata/.test(err.message));
  await assert.rejects(services.noteTerminalFailure(taskId, "corrupt"), (err) => /has no durable runtime metadata/.test(err.message));
  assert.equal(await readTaskMeta(taskId), null);
});
