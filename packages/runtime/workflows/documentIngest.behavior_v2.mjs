// @frozen
//
// Behavioral closure for documentIngest_v2 (ledger task #28 — the sidecar-before-retries
// ordering fix, REDESIGNED TWICE after adversarial review — see "WHY A SIDECAR FIX ALONE
// IS NOT ENOUGH" (the O-round blocker) and "CRASH-REDELIVERY" (the Q-round finding) below).
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
// immediately"). `RETRYABLE` below is copied from that file's own set, unchanged.
//
//   - TRANSIENT (`RETRYABLE`: engine_error/timeout/engine_lost/storage_error) AND the
//     step's own retry budget is not yet exhausted: persist NOTHING to Postgres — the
//     task's DB row stays 'running', exactly as the original claim left it. Update the
//     sidecar (`noteTransientFailure` — spool.mjs) so the diagnosis survives even though
//     nothing failed durably yet, then re-throw the ORIGINAL error (a plain, retryable
//     throw). The next attempt's `persist_document_extraction(...,'done',...)` on success
//     now passes the `t.status<>'running'` guard, because status was NEVER moved off it —
//     proved against live SQL, not a mock, in the real-rig test suite.
//   - TERMINAL (`corrupt`/`encrypted`/`bad_type`/`limit`/`internal`, OR a transient code on
//     the LAST allowed attempt — `getStepMetadata().attempt >= TOTAL_ATTEMPTS`, read via
//     `documentIngest.impl_v2.ts` and passed in as a plain parameter so this function stays
//     testable without ambient workflow context): persist 'failed' (the honest, durable
//     record — Tier B), keep the sidecar (diagnostics — the named residual from the first
//     v2 attempt stands unchanged: no sidecar TTL reaper exists yet, `sweepSpoolTtl` only
//     targets `intake-*`), and throw a `FatalError` instead of a plain one — its own
//     contract is "cannot be retried... bubbled up to the workflow logic", which is what
//     "settle the step so the engine never launches a doomed retry" means concretely.
//     Recovery for a terminal failure is the re-enqueue vocabulary (a NEW task row at a new
//     version — the 0026 filed-bootstrap door), never an automatic step retry.
//
// CRASH-REDELIVERY (the Q-round finding) — the honest form of the "at most once" claim.
// A durable step can be RE-EXECUTED after its own body already completed but before the
// engine durably recorded that completion (a crash between the two). If that happens
// AFTER the terminal branch's `persist_document_extraction(...,'failed',...)` already
// committed, the re-execution repeats the WHOLE try block — a fresh download/analyze that
// may fail with a DIFFERENT code than the first — and reaches the SAME terminal branch
// again with a DIFFERENT `code`. The op_key (`doc-extract-failed:<taskId>`) is identical
// (deterministic, keyed only by taskId), so `_reserve_op` (0004_governed_fns.sql:46) sees
// the SAME key with a DIFFERENT request hash and raises CLR10 "op_key reused with
// different args" — BEFORE even reaching the status guard. So the claim is not "at most
// once, ever, full stop" — it is **at most once, except crash-redelivery, where the
// re-execution's own persist attempt is a DETECTED, HANDLED no-op**.
//
// R1 (the R-round's blocker) — CLR10/CLR16 are NOT proof of redelivery by themselves.
// `persist_document_extraction` raises CLR16 from several genuinely DIFFERENT causes that
// share the identical errcode and near-identical message (0026_lane_widen.sql:508 "task
// not found", :531 "status is not running" — which fires for queued/held_egress/done
// alike, plus the lane-mismatch refusals for store-only/classify tasks at :525/:533/:538).
// Trusting the bare code would misclassify a GENUINE fresh failure as a handled no-op —
// noting it away and FatalError-ing a task that was never actually settled — or worse,
// stamp a local 'failed' over a task Postgres has ALREADY recorded as 'done'. So on
// catching CLR10/CLR16 here, `readTaskStatus` RE-READS the task's actual row through the
// runtime's own granted surface (0008_runtime_read_surface.sql:49 — plain SELECT, no new
// grant needed) before deciding anything:
//   - status === 'failed' -> a confirmed prior terminal commit. (For CLR10 specifically,
//     this is doubly certain: `_reserve_op`'s "reused with different args" branch cannot
//     fire at all unless a committed op_receipts row already exists at this exact op_key —
//     our own call always supplies a valid, non-empty op_key/status, so no OTHER CLR10 site
//     in persist_document_extraction can be the source here.) Handled, detected, noted —
//     never a silent swallow.
//   - status === 'done' -> the task actually SUCCEEDED. The realistic path there: the
//     OUTER try's persist('done') committed cleanly, then `removeTaskMeta` itself threw
//     (e.g. a spool I/O hiccup), landing in this SAME catch(err) with a status Postgres
//     already closed out as a win. Stamping 'failed' would contradict a fact the DB already
//     settled. Take the clean success path instead — same shape the top of this function
//     returns on a first-try win.
//   - anything else (a genuinely different status, or the re-read itself failing) -> a
//     fresh, unverified problem. Never no-op what isn't proven — fall through to the SAME
//     honest shape Q4 uses below.
//
// Q4 — the persist call's OWN failure must not be read as DB confirmation of anything.
// If `persist_document_extraction` throws for a reason OTHER than a VERIFIED already-
// terminal shape above (a genuine connectivity blip, an unexpected error, or an R1 re-read
// that confirms neither 'failed' nor 'done'), the DB's actual state is UNKNOWN — it may
// still be 'running'. Stamping the sidecar 'failed' in that case would be a claim Postgres
// never confirmed, inverting the whole honesty point of this file. That branch uses the
// TRANSIENT shape instead (`noteTransientFailure`, status stays 'running'), carrying BOTH
// the original diagnosis and the persist failure in one note — an honest "I don't know",
// not a guess dressed as a fact.

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

/** CLR10 = `_reserve_op`'s op_key-reused-with-different-args refusal (0004_governed_fns.sql
 *  :57). CLR16 = `persist_document_extraction`'s own guards (0026_lane_widen.sql:508/531 —
 *  task-not-found and status-not-running, PLUS the lane-mismatch refusals at :525/533/538).
 *  Both codes are OVERLOADED with fresh, non-redelivery causes (R1) — this is a filter that
 *  decides whether the state re-read in `readTaskStatus` is even worth doing, never a
 *  verdict on its own. */
function isPossiblyAlreadyTerminalRefusal(err) {
  return err?.code === "CLR10" || err?.code === "CLR16";
}

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** R1: re-read the task's OWN status through the runtime's granted SELECT
 *  (0008_runtime_read_surface.sql:49) — the only way to tell a genuine CLR10/CLR16 cause
 *  apart from a handled redelivery. Never throws: a failed re-read is itself "unverified",
 *  reported as `status: null` so the caller falls through to the honest, never-guess shape. */
async function readTaskStatus(withRuntime, taskId) {
  try {
    return await withRuntime(async (client) => {
      const out = await client.query("select status from clara.document_processing_tasks where id=$1", [taskId]);
      return out.rows[0]?.status ?? null;
    });
  } catch {
    return null;
  }
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
    try {
      await callWriter(
        withRuntime,
        "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
        [taskId, "failed", 0, "{}", "[]", code, null, opKey("doc-extract-failed", taskId)],
      );
      // Persist SUCCEEDED (a fresh write, or an identical-args replay) — Postgres is
      // KNOWN 'failed', with THIS code.
      await services.noteTerminalFailure(taskId, code).catch(() => {});
    } catch (persistErr) {
      let verifiedStatus = null;
      if (isPossiblyAlreadyTerminalRefusal(persistErr)) {
        verifiedStatus = await readTaskStatus(withRuntime, taskId);
      }

      if (verifiedStatus === "failed") {
        // R1: CONFIRMED — a fresh read shows Postgres already closed this task out as
        // 'failed'. An earlier execution (crash-redelivery) already committed this task's
        // terminal outcome. The DB plane IS known terminal — just not confirmed to carry
        // THIS execution's own code, since the earlier one may have recorded a different one.
        await services.noteTerminalFailure(
          taskId, code,
          `redelivery detected: an earlier execution already committed this task's terminal outcome (persist refused: ${persistErr?.code ?? "?"} ${String(persistErr?.message || persistErr)}; re-read confirms status='failed')`,
        ).catch(() => {});
      } else if (verifiedStatus === "done") {
        // R1: CONFIRMED — the task actually SUCCEEDED (a prior attempt's 'done' persist
        // already committed; THIS execution only failed later, e.g. on its own sidecar
        // cleanup). Stamping 'failed' here would contradict a fact Postgres already
        // settled. Take the clean success path — same shape a first-try win returns.
        await services.removeTaskMeta(taskId).catch(() => {});
        return { taskId, status: "done", lane: task.lane };
      } else {
        // Q4 (and R1's "anything else" branch): NOT a verified redelivery — either
        // persistErr wasn't CLR10/16 at all, or the re-read came back neither 'failed' nor
        // 'done' (a genuinely different status, a missing row, or the re-read itself
        // failing). The DB plane is UNKNOWN in every one of these shapes. Never stamp
        // 'failed' on a claim Postgres didn't confirm, and never no-op an unverified state
        // as if it were a known-handled redelivery.
        await services.noteTransientFailure(
          taskId, code,
          `persist_document_extraction('failed') itself failed: ${String(persistErr?.message || persistErr)} (original diagnosis: ${code} ${err?.message ?? ""})`
            + (isPossiblyAlreadyTerminalRefusal(persistErr) ? `; re-read status=${JSON.stringify(verifiedStatus)}, not a confirmed redelivery` : ""),
        ).catch(() => {});
      }
    }
    throw Object.assign(new FatalError(`document ingest terminally failed (${code}): ${err?.message ?? err}`), { code });
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}
