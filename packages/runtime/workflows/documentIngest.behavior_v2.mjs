// @frozen
//
// Behavioral closure for documentIngest_v2 (ledger task #28 — the sidecar-before-retries
// ordering fix). `services` contains infrastructure adapters only (Storage/Azure/parser/spool),
// and `withRuntime` is the same injected pool boundary used by chatTurn_v1.
//
// THE DEFECT THIS FILE FIXES (measured against v1's live body, byte-identical in
// documentIngest.behavior.mjs — never edited by this file). On a FAILED attempt, v1's catch
// block did, in order:
//   1. persist_document_extraction(..., 'failed', ..., code, ...) — records the failure DURABLY
//      in Postgres (document_processing_tasks.status='failed', .error_code=code). Correct.
//   2. services.removeTaskMeta(taskId) — DELETES the local JSON sidecar (spool.mjs's
//      task-<id>.json) that is the ONLY place carrying storageKey/sha256/mime/format/lane: the
//      transport fields a RETRY needs to re-download and re-attempt the same document, and the
//      diagnostic record a human reads when a task fails (reconciler-documents.mjs's own
//      comment: "the sidecar for transport fields... the task-only snapshot no longer carries").
//   3. throw err — the step FAILS, which is exactly the shape a durable-execution engine's
//      automatic step-retry acts on: `"use step"` functions are retried by the WDK engine on
//      throw, calling processDocumentTaskStep(taskId) again — a genuine retry, immediately
//      following the SAME failed attempt, well before any human "looks".
//
// So the sidecar was destroyed BEFORE the retry that needed it, not after: step 2 ran
// unconditionally on every failure, while step 3's throw is precisely what invites another
// attempt. That retry's very first line — `readTaskMeta(taskId)` — then finds nothing and
// throws a NEW, generic "has no durable runtime metadata" error, which is what actually
// surfaces (the LAST exception wins): the true diagnostic code (`processingFailureCode(err)` —
// engine_error / timeout / corrupt / encrypted / storage_error / ...) is buried under an
// unrelated, uninformative one, and the retry cannot even attempt the real work again because
// it no longer knows where to download from. "A failed ingest's diagnosis is gone by the time
// anyone looks" is exactly this: destroyed on attempt 1, before attempt 2 (or 3, or a human)
// ever reads it.
//
// THE FIX. Sidecar destruction moves to ONLY the genuinely terminal SUCCESS outcomes (`lane===
// 'none'`'s store-only completion, and the download+analyze/parse 'done' completion) — both
// unchanged from v1, both correct there (nothing will ever look for this task's transport
// fields again once it is durably 'done'). On FAILURE, the sidecar is never removed: it is
// instead UPDATED via `services.noteTaskFailure(taskId, code)` — existing vocabulary
// (lib/intake.mjs's makeDocumentServices, untouched by this change), which already does exactly
// the right thing (`updateTask(taskId, {status:'running', lastError: code})`): it reads the
// CURRENT sidecar, merges in the diagnostic code, and writes the WHOLE record back — so
// storageKey/sha256/mime/format/lane survive intact for the next attempt, and lastError is now
// readable by anyone inspecting the sidecar without needing the DB at all. v1 only ever called
// this on the rarer inner failure (the persist-to-DB call itself throwing); v2 calls it on
// EVERY failure, unconditionally, which is the actual ordering fix.
//
// WHY THIS IS SAFE, NOT JUST SAFER. A retry that re-attempts `persist_document_extraction`
// with the SAME op_key (`doc-extract-failed:<taskId>`) and the SAME failure code replays
// idempotently — `_reserve_op` returns the cached receipt before the function's own
// `t.status<>'running'` guard is ever reached (0026_lane_widen.sql), so a second identical
// failure record is a no-op, never a duplicate write. A retry that reaches a DIFFERENT outcome
// (a new op_key, or a genuinely different failure) is a live write like any other. Nothing here
// depends on knowing whether the engine will retry again — the sidecar simply survives until a
// real 'done' says otherwise, and every attempt in between behaves exactly as if it were the
// first.
//
// THE NAMED RESIDUAL. Sidecars for permanently-failed tasks (ones nothing will ever retry
// again) are no longer auto-deleted, so they now persist on local disk indefinitely — there is
// no TTL reaper for `task-<id>.json` today (spool.mjs's `sweepSpoolTtl` only targets
// `intake-*.{bin,json}`, verified by reading its regex). That is a deliberate, bounded trade:
// a small JSON file's disk residue against a masked diagnosis and a broken retry, and it is
// consistent with the file it replaces — v1 already leaves sidecars behind forever for any task
// that CRASHES before reaching this code at all (the crash never runs any deletion). Recorded
// here rather than solved: a future TTL sweep for task sidecars (mirroring the intake one) is a
// separate, independent change, out of this fix's scope.

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

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

export async function processDocumentTaskBehaviorV2(services, withRuntime, taskId) {
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
    // THE FIX: record the failure durably in Postgres first (best-effort — a write hiccup here
    // must never mask the ORIGINAL error, which is why it is swallowed and `err` still governs
    // what this function ultimately throws)...
    try {
      await callWriter(
        withRuntime,
        "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
        [taskId, "failed", 0, "{}", "[]", code, null, opKey("doc-extract-failed", taskId)],
      );
    } catch {
      // The original failure stays authoritative; a terminal/replayed persist may refuse a
      // second failure transition (or the write itself failed) — either way this is not the
      // error to surface.
    }
    // ...then, UNCONDITIONALLY and REGARDLESS of whether the DB write above succeeded, update
    // the sidecar in place — never remove it. This is the ordering fix: destruction moves from
    // "every failure" to "never, on failure" — only a genuine 'done' above ever removes it.
    await services.noteTaskFailure(taskId, code).catch(() => {});
    throw err;
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}
