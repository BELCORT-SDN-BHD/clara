// @frozen
//
// Behavioral closure for documentIngest_v2 (ledger task #28 — the sidecar-before-retries
// ordering fix, REDESIGNED after an adversarial O-round found the first v2 attempt
// insufficient — see the "WHY A SIDECAR FIX ALONE IS NOT ENOUGH" section below).
//
// THE ORIGINAL DEFECT (measured against v1's live body, byte-identical in
// documentIngest.behavior.mjs, never edited by this file). On ANY failed attempt, v1's
// catch block: (1) persisted the failure to Postgres — `document_processing_tasks.status
// ='failed'`, unconditionally; (2) deleted the local JSON sidecar (spool.mjs's
// task-<id>.json — the ONLY place carrying storageKey/sha256/mime/format for a retry);
// (3) threw — which invites a durable-step retry (`"use step"` functions retry
// automatically on throw, by default up to 3 times: `workflow`'s own
// docs/foundations/errors-and-retries.mdx). The retry's first line, readTaskMeta, then
// found nothing and died with a generic "no durable runtime metadata" error, burying the
// real diagnostic code.
//
// WHY A SIDECAR FIX ALONE IS NOT ENOUGH — the O-round's blocker. Step (1) above does not
// just record a fact; `document_processing_tasks` has a BEFORE UPDATE/DELETE trigger
// (`_tf_processing_task_update`, 0007_document_pipeline.sql:641) that makes a 'failed' row
// IMMUTABLE — `raise exception 'terminal document processing task is immutable'
// using errcode='CLR16'`. `claim_document_processing_task` separately refuses to reclaim
// anything but a 'queued' row (0024_fail_classify.sql:264), the failed extraction already
// occupies the (document,engine,version,kind) key so a later success collides at
// 0026_lane_widen.sql:545 and skips the fact-persisting branch entirely (line 558), and
// the reservation `_refund_document_reservation` already released cannot be re-settled.
// So merely PRESERVING the sidecar (the first v2 attempt) fixes the DIAGNOSIS but not the
// RETRY: a retried attempt can re-download and re-analyze the document successfully, then
// die at `persist_document_extraction`'s `t.status<>'running'` guard trying to record that
// success — vendor work spent, DB write refused, workflow still fails. Half a fix.
//
// THE REDESIGN: classify retryability BEFORE ever touching Postgres, mirroring the
// ALREADY-SHIPPED `invoiceFacts.v1.behavior.mjs` (its own header: "Transient vendor/
// storage faults THROW so the step is retried... A bad/corrupt document is terminal
// immediately"). `RETRYABLE` below is copied from that file's own set, unchanged — this
// codebase already has one ratified answer to "which of these 8 codes is transient", and
// it belongs in exactly one place semantically, not reinvented per workflow.
//
//   - TRANSIENT (`RETRYABLE`: engine_error/timeout/engine_lost/storage_error) AND the
//     step's own retry budget is not yet exhausted: persist NOTHING to Postgres — the
//     task's DB row stays 'running', exactly as the original claim left it. Update the
//     sidecar (`noteTransientFailure` — spool.mjs) so the diagnosis survives even though
//     nothing failed durably yet, then re-throw the ORIGINAL error (a plain, retryable
//     throw). The next attempt's `persist_document_extraction(...,'done',...)` on success
//     now passes the `t.status<>'running'` guard, because status was NEVER moved off it —
//     the one property the O-round demanded be VERIFIED, not assumed; the real-rig test
//     suite proves it against live SQL, not a mock.
//   - TERMINAL (`corrupt`/`encrypted`/`bad_type`/`limit`/`internal`, OR a transient code on
//     the LAST allowed attempt — `getStepMetadata().attempt >= TOTAL_ATTEMPTS`, read via
//     `documentIngest.impl_v2.ts` and passed in as a plain parameter so this function stays
//     testable without any ambient workflow context): persist 'failed' (the honest,
//     durable record — Tier B, exactly as the terminal branch always did), keep the
//     sidecar (diagnostics — the named residual from the first v2 attempt stands
//     unchanged: no sidecar TTL reaper exists yet, `spool.mjs`'s `sweepSpoolTtl` only
//     targets `intake-*`), and throw a `FatalError` (from `"workflow"`) instead of a plain
//     one — `FatalError`'s own contract is exactly "cannot be retried... bubbled up to the
//     workflow logic", which is what "settle the step so the engine never launches a
//     doomed retry" means concretely. Recovery for a terminal failure is the re-enqueue
//     vocabulary (a NEW task row at a new version — the 0026 filed-bootstrap door) — a
//     human/operator act, never an automatic step retry.
//
// P3 (the op-key/differing-code finding) is now STRUCTURALLY closed, not merely patched:
// under this split, `persist_document_extraction(...,'failed',...)` is called AT MOST ONCE
// per task, ever — every transient attempt before the terminal one skips the DB entirely,
// and a FatalError prevents any attempt AFTER the terminal one. So the "attempt 1 records
// engine_error, attempt 2 records a DIFFERENT code, the op-key replay swallows it" scenario
// the O-round found cannot arise by construction. The one residual is the persist-failed
// call's OWN failure (a DB blip at the exact moment of recording the terminal outcome) —
// unchanged from v1's exposure, not solved here, but no longer silently swallowed: the
// caught error is folded into the sidecar's `lastErrorNote` (`noteTerminalFailure`), so a
// human sees "why did this fail" AND "did Postgres even hear about it", not a bare catch.
//
// NAMED RESIDUAL (same class as invoiceFacts_v1's own, unsolved there too): if a TRANSIENT
// failure recurs on every one of the step's allowed attempts, the LAST one is forced
// terminal (above) precisely to avoid this — but should that final terminal persist call
// ITSELF fail (the residual just above), the task can be left at 'running' in Postgres with
// a workflow run that has already permanently ended. reconciler-documents.mjs only retries
// a 'running' task whose run is `documentRunState === 'lost'` (RunNotFound) — a run that
// genuinely completed (even in failure) is not "lost" and is left alone. This is a narrow,
// pre-existing class of exposure this codebase already carries for invoiceFacts_v1; not
// introduced here, not solved here.

import { FatalError } from "workflow";

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

function opKey(prefix, taskId) {
  return `${prefix}:${taskId}`;
}

function processingFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted", "bad_type", "limit"].includes(code)
    ? code
    : "internal";
}

// Copied VERBATIM from invoiceFacts.v1.behavior.mjs's own `RETRYABLE` — one ratified
// classification, not reinvented here. `internal` (the catch-all for an uncategorised
// error) is deliberately NOT retryable, matching that file: fail closed on the unknown.
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The step's own retry budget (documentIngest.impl_v2.ts sets `.maxRetries` to this SAME
 *  number — single source of truth). 3 is the framework default; stated explicitly rather
 *  than left implicit, per `workflow`'s own docs. */
export const MAX_RETRIES = 3;
const TOTAL_ATTEMPTS = MAX_RETRIES + 1;

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** @param {number} attempt `getStepMetadata().attempt` from the calling step — 1 on the
 *  first execution, increasing by one on each WDK-driven retry. A plain parameter, not
 *  read from ambient context here, so this function stays unit-testable in isolation. */
export async function processDocumentTaskBehaviorV2(services, withRuntime, taskId, attempt) {
  const task = await services.readTaskMeta(taskId);
  if (!task) throw Object.assign(new Error(`document task ${taskId} has no durable runtime metadata`), { code: "internal" });

  if (task.lane === "none") {
    await callWriter(withRuntime, "select clara.complete_stored_document_task($1,$2) as receipt", [
      taskId,
      opKey("doc-store-complete", taskId),
    ]);
    await services.removeTaskMeta(taskId);
    return { taskId, status: "done", lane: "none" };
  }

  const tempPath = services.taskTempPath(taskId);
  try {
    await services.downloadCanonical(task.storageKey, tempPath, task.sha256);
    const result = task.lane === "ocr"
      ? await services.analyzeDocument(tempPath, task.mime, task)
      : await services.parseStructured(tempPath, task.format, task);
    await callWriter(
      withRuntime,
      "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
      [
        taskId,
        "done",
        result.pageCount,
        JSON.stringify(result.envelope),
        JSON.stringify(result.regions),
        null,
        result.vendorOpRef ?? null,
        opKey("doc-extract-done", taskId),
      ],
    );
    await services.removeTaskMeta(taskId);
    return { taskId, status: "done", lane: task.lane };
  } catch (err) {
    const code = processingFailureCode(err);
    const exhausted = Number(attempt) >= TOTAL_ATTEMPTS;

    if (RETRYABLE.has(code) && !exhausted) {
      // TRANSIENT, budget remains: Postgres is never touched — the task stays 'running'
      // under THIS run's claim, so a retried attempt's eventual 'done' persist will pass
      // the status guard. Only the local diagnostic record is updated.
      await services.noteTransientFailure(taskId, code).catch(() => {});
      throw err;
    }

    // TERMINAL — either the code itself is not retryable, or the retry budget is spent.
    // Persist the honest 'failed' record (best-effort: its own failure is folded into the
    // sidecar note below, never silently swallowed).
    let persistNote;
    try {
      await callWriter(
        withRuntime,
        "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
        [taskId, "failed", 0, "{}", "[]", code, null, opKey("doc-extract-failed", taskId)],
      );
    } catch (persistErr) {
      persistNote = `persist_document_extraction('failed') itself failed: ${String(persistErr?.message || persistErr)}`;
    }
    await services.noteTerminalFailure(taskId, code, persistNote).catch(() => {});
    throw Object.assign(new FatalError(`document ingest terminally failed (${code}): ${err?.message ?? err}`), { code });
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}
