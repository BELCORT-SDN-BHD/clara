// @frozen
//
// Behavioral closure for documentIngest_v1. Lane selection, vendor/parser
// orchestration, persistence arguments, failure mapping, and cleanup live here.
// `services` contains infrastructure adapters only (Storage/Azure/parser/spool),
// and `withRuntime` is the same injected pool boundary used by chatTurn_v1.

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

export async function processDocumentTaskBehavior(services, withRuntime, taskId) {
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
    try {
      await callWriter(
        withRuntime,
        "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
        [taskId, "failed", 0, "{}", "[]", code, null, opKey("doc-extract-failed", taskId)],
      );
      await services.removeTaskMeta(taskId);
    } catch {
      await services.noteTaskFailure(taskId, code).catch(() => {});
    }
    throw err;
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}
