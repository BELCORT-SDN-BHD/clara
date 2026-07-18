import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { analyzeDocument, AZURE_ENGINE_SNAPSHOT } from "./egress.mjs";
import { detectDocument, IntakeScanError, scanFile } from "./scan.mjs";
import {
  intakePaths,
  listIntakeMetas,
  readIntakeMeta,
  readTaskMeta,
  removeIntakeSpool,
  removeTaskMeta,
  spoolConfig,
  spoolRequest,
  tryEnterIngress,
  writeIntakeMeta,
  writeTaskMeta,
} from "./spool.mjs";
import { downloadCanonical, putCanonical, StorageError, verifyCanonical } from "./storage.mjs";
import { parseStructured } from "./structured.mjs";

const MAX_BYTES = 20 * 1024 * 1024;
const CAPABILITY_TTL_MS = 15 * 60_000;
const activeIntakes = new Set();
/** @type {(message: string) => void} */
const NOOP_LOG = () => {};

const STRUCTURED_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "clara-structured:v1",
  engineConfig: { provider: "clara", parser: "values-only", version: 1 },
  versionN: 1,
});

const STORE_ONLY_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "clara-store-only:v1",
  engineConfig: { provider: "clara", parser: "none", version: 1 },
  versionN: 1,
});

const MIME_ALIASES = new Map([
  ["application/pdf", "application/pdf"],
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/webp", "image/webp"],
  ["image/tiff", "image/tiff"],
  ["image/heic", "image/heic"],
  ["application/xml", "application/xml"],
  ["text/xml", "application/xml"],
  ["text/csv", "text/csv"],
  ["text/tab-separated-values", "text/tab-separated-values"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

export class IntakeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "IntakeError";
    this.status = status;
    this.code = code;
  }
}

function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function tokenMatches(token, expected) {
  const actual = tokenHash(token);
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(String(expected || ""), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function opKey(prefix, id = randomUUID()) {
  return `${prefix}:${id}`;
}

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

function validateBegin(input) {
  const filename = typeof input?.filename === "string" ? input.filename.trim() : "";
  const declaredMime = typeof input?.mime === "string" ? input.mime.toLowerCase().split(";", 1)[0].trim() : "";
  const mime = MIME_ALIASES.get(declaredMime);
  const declaredBytes = Number(input?.declared_bytes);
  const origin = input?.origin;
  const sessionId = input?.session_id ?? null;
  if (!filename || filename.length > 255 || [...filename].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new IntakeError(400, "bad_request", "filename must be 1-255 printable characters");
  }
  if (!mime) throw new IntakeError(415, "bad_type", "declared MIME is not in the intake allowlist");
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0 || declaredBytes > MAX_BYTES) {
    throw new IntakeError(413, "too_large", "declared_bytes must be between 1 and 20971520");
  }
  if (origin !== "chat" && origin !== "documents_tab") throw new IntakeError(400, "bad_request", "origin is invalid");
  if ((origin === "chat") !== (typeof sessionId === "string" && sessionId.length > 0)) {
    throw new IntakeError(400, "bad_request", "session_id is required only for chat intake");
  }
  return { filename, mime, declaredBytes, origin, sessionId };
}

function enterIntake(id) {
  if (activeIntakes.has(id)) throw new IntakeError(409, "intake_busy", "intake operation is already in progress");
  activeIntakes.add(id);
  return () => activeIntakes.delete(id);
}

async function requireCapability(intakeId, token) {
  const meta = await readIntakeMeta(intakeId).catch(() => null);
  if (!meta || !tokenMatches(token, meta.tokenHash)) throw new IntakeError(404, "not_found", "not found");
  if (Date.parse(meta.expiresAt) <= Date.now()) throw new IntakeError(404, "not_found", "not found");
  return meta;
}

async function requireCapabilityHash(intakeId, expectedHash) {
  const meta = await readIntakeMeta(intakeId).catch(() => null);
  const a = Buffer.from(String(expectedHash || ""), "hex");
  const b = Buffer.from(String(meta?.tokenHash || ""), "hex");
  if (!meta || a.length !== b.length || !timingSafeEqual(a, b) || Date.parse(meta.expiresAt) <= Date.now()) {
    throw new IntakeError(404, "not_found", "not found");
  }
  return meta;
}

function laneSnapshot(format) {
  if (["xlsx", "docx", "csv", "tsv"].includes(format)) {
    return { lane: "structured_parse", ...STRUCTURED_ENGINE_SNAPSHOT };
  }
  if (format === "xml") return { lane: "none", ...STORE_ONLY_ENGINE_SNAPSHOT };
  return { lane: "ocr", ...AZURE_ENGINE_SNAPSHOT };
}

function failureCode(err) {
  const code = String(err?.code || "internal");
  return ["too_large", "bad_type", "limit", "checksum_mismatch", "storage_error", "expired", "malware_detected", "quarantined"].includes(code)
    ? code
    : "internal";
}

function processingFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted", "bad_type", "limit"].includes(code)
    ? code
    : "internal";
}

async function callWriter(client, sql, params) {
  const out = await client.query(sql, params);
  return receipt(out.rows[0]);
}

export async function beginDocumentIntake(client, principal, input) {
  const body = validateBegin(input);
  const uploadToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(uploadToken);
  const expiresAt = new Date(Date.now() + CAPABILITY_TTL_MS).toISOString();
  const beginOp = opKey("doc-intake-begin");
  const out = await callWriter(
    client,
    "select clara.create_document_intake($1,$2,$3,$4,$5,$6,$7,$8,$9) as receipt",
    [principal.sub, body.origin, body.sessionId, body.filename, body.mime, body.declaredBytes, hash, expiresAt, beginOp],
  );
  const intakeId = String(out.intake_id);
  try {
    await writeIntakeMeta(intakeId, {
      schemaVersion: 1,
      intakeId,
      firmId: principal.firmId,
      uploadedBy: principal.sub,
      filename: body.filename,
      declaredMime: body.mime,
      declaredBytes: body.declaredBytes,
      origin: body.origin,
      sessionId: body.sessionId,
      tokenHash: hash,
      expiresAt,
      beginOp,
      status: "uploading",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    await callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt", [
      intakeId,
      "internal",
      opKey("doc-intake-sidecar-fail"),
    ]).catch(() => {});
    throw err;
  }
  return { intake_id: intakeId, upload_token: uploadToken, expires_at: expiresAt };
}

export async function uploadDocumentBytes({ withRuntime, intakeId, token, readable }) {
  const leaveIntake = enterIntake(intakeId);
  let releaseIngress;
  let meta;
  try {
    meta = await requireCapability(intakeId, token);
    releaseIngress = tryEnterIngress(meta.uploadedBy);
    if (!releaseIngress) throw new IntakeError(429, "limit", "intake concurrency limit reached");
    const leaseOwner = `${process.pid}:${randomUUID()}`;
    await withRuntime((client) =>
      callWriter(client, "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt", [
        intakeId,
        meta.tokenHash,
        leaseOwner,
        900,
        opKey("doc-intake-claim"),
      ]),
    );
    await writeIntakeMeta(intakeId, { ...meta, leaseOwner, status: "receiving", updatedAt: new Date().toISOString() });
    const stored = await spoolRequest(readable, { intakeId, declaredBytes: meta.declaredBytes, maxBytes: MAX_BYTES });
    await writeIntakeMeta(intakeId, {
      ...meta,
      leaseOwner,
      status: "spooled",
      sha256: stored.sha256,
      byteSize: stored.byteSize,
      updatedAt: new Date().toISOString(),
    });
    return { intake_id: intakeId, received_bytes: stored.byteSize };
  } catch (err) {
    if (err instanceof IntakeError || err instanceof IntakeScanError || err instanceof StorageError) throw err;
    if (err?.code === "too_large") {
      if (meta) {
        await withRuntime((client) =>
          callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt", [
            intakeId,
            "too_large",
            opKey("doc-intake-upload-size-fail"),
          ]),
        ).catch(() => {});
        await removeIntakeSpool(intakeId);
      }
      throw new IntakeError(413, "too_large", "upload size does not match its declaration");
    }
    throw err;
  } finally {
    releaseIngress?.();
    leaveIntake();
  }
}

export async function finalizeDocumentIntake(options) {
  const { withRuntime, intakeId, enqueue } = options;
  const token = options.token ?? null;
  const expectedHash = options.tokenHash ?? null;
  const leaveIntake = enterIntake(intakeId);
  let meta;
  let canonicalReached = false;
  try {
    meta = expectedHash ? await requireCapabilityHash(intakeId, expectedHash) : await requireCapability(intakeId, token);
    if (!["spooled", "canonical", "received", "verifying", "verified", "duplicate"].includes(meta.status)) {
      throw new IntakeError(409, "intake_not_spooled", "upload bytes before finalizing");
    }
    const path = intakePaths(intakeId).bytes;
    let detected = meta.detected;
    let key = meta.storageKey;
    if (meta.status === "spooled") {
      detected = await detectDocument(path, { originalFilename: meta.filename });
      if (detected.mime !== meta.declaredMime) throw new IntakeScanError("bad_type", "declared MIME does not match the file signature", 415);
      await scanFile(path);
      key = `firms/${meta.firmId}/docs/${meta.sha256}.${detected.ext}`;
      await putCanonical(path, key, detected.mime);
      await verifyCanonical(key, meta.sha256);
      meta = { ...meta, status: "canonical", detected, storageKey: key, updatedAt: new Date().toISOString() };
      await writeIntakeMeta(intakeId, meta);
    } else {
      if (!detected || !key) throw Object.assign(new Error("canonical intake metadata is incomplete"), { code: "internal" });
      await verifyCanonical(key, meta.sha256);
    }
    canonicalReached = true;

    const leaseOwner = meta.leaseOwner || `${process.pid}:${randomUUID()}`;
    if (meta.status === "canonical") {
      try {
        await withRuntime((client) =>
          callWriter(client, "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt", [
            intakeId,
            meta.tokenHash,
            leaseOwner,
            900,
            opKey("doc-intake-reclaim"),
          ]),
        );
        await withRuntime((client) =>
          callWriter(client, "select clara.mark_document_intake_received($1,$2,$3,$4,$5,$6) as receipt", [
            intakeId,
            meta.tokenHash,
            leaseOwner,
            meta.sha256,
            key,
            opKey("doc-intake-received"),
          ]),
        );
      } catch (err) {
        if (err?.code !== "CLR16") throw err;
      }
      meta = { ...meta, status: "received", leaseOwner, updatedAt: new Date().toISOString() };
      await writeIntakeMeta(intakeId, meta);
    }
    if (meta.status === "received") {
      try {
        await withRuntime((client) =>
          callWriter(client, "select clara.begin_document_intake_verification($1,$2) as receipt", [
            intakeId,
            opKey("doc-intake-verifying"),
          ]),
        );
      } catch (err) {
        if (err?.code !== "CLR16") throw err;
      }
      meta = { ...meta, status: "verifying", updatedAt: new Date().toISOString() };
      await writeIntakeMeta(intakeId, meta);
    }
    if (meta.status === "verifying") {
      let verified;
      try {
        verified = await withRuntime((client) =>
          callWriter(client, "select clara.verify_document_intake($1,$2,$3,$4) as receipt", [
            intakeId,
            meta.tokenHash,
            detected.pages,
            opKey("doc-intake-verified"),
          ]),
        );
      } catch (err) {
        if (err?.code !== "CLR16") throw err;
      }
      meta = { ...meta, status: verified?.status === "duplicate" ? "duplicate" : "verified", updatedAt: new Date().toISOString() };
      await writeIntakeMeta(intakeId, meta);
    }

    const snapshot = laneSnapshot(detected.format);
    const finalized = await withRuntime((client) =>
      callWriter(client, "select clara.finalize_document_intake($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) as receipt", [
        intakeId,
        meta.tokenHash,
        snapshot.engineId,
        JSON.stringify(snapshot.engineConfig),
        snapshot.versionN,
        snapshot.lane,
        null,
        null,
        opKey("doc-intake-finalize"),
      ]),
    );

    const needsStart = finalized.status === "finalized" || finalized.upgraded === true;
    if (needsStart && finalized.task_id) {
      const task = {
        schemaVersion: 1,
        taskId: String(finalized.task_id),
        documentId: String(finalized.document_id),
        firmId: meta.firmId,
        storageKey: key,
        sha256: meta.sha256,
        mime: detected.mime,
        format: detected.format,
        lane: snapshot.lane,
        engineId: snapshot.engineId,
        engineConfig: snapshot.engineConfig,
        versionN: snapshot.versionN,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeTaskMeta(task.taskId, task);
      try {
        const run = await enqueue(task.taskId);
        await writeTaskMeta(task.taskId, { ...task, runId: run?.runId ?? null, updatedAt: new Date().toISOString() });
      } catch (err) {
        console.error(`[clara-runtime] document enqueue deferred task=${task.taskId}: ${String(err?.message || err)}`);
      }
    }
    await removeIntakeSpool(intakeId);
    return finalized;
  } catch (err) {
    const code = failureCode(err);
    if (meta) {
      try {
        await withRuntime((client) =>
          callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt", [intakeId, code, opKey("doc-intake-fail")]),
        );
      } catch {
        // The original failure remains authoritative; terminal/replayed intakes may
        // legitimately refuse a second failure transition.
      }
      if (!canonicalReached || code === "malware_detected" || code === "quarantined" || code === "bad_type") {
        await removeIntakeSpool(intakeId);
      }
    }
    throw err;
  } finally {
    leaveIntake();
  }
}

/** Resume durable post-upload intakes after a process crash. The sidecar carries
 * only the capability HASH, which is exactly what the runtime-only SQL writers
 * accept; the plaintext browser token is neither retained nor reconstructed. */
export async function recoverPendingDocumentIntakes({ withRuntime, enqueue, log = NOOP_LOG }) {
  const out = { recovered: 0, deferred: 0, expired: 0 };
  const rows = (await listIntakeMetas()).filter((row) => row && !row.corrupt && row.intakeId);
  for (const meta of rows.slice(0, 10)) {
    if (Date.parse(meta.expiresAt) <= Date.now()) {
      await withRuntime((client) =>
        callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt", [
          meta.intakeId,
          "expired",
          opKey("doc-intake-expired", meta.intakeId),
        ]),
      ).catch(() => {});
      await removeIntakeSpool(meta.intakeId);
      out.expired += 1;
      continue;
    }
    if (!["spooled", "canonical", "received", "verifying", "verified", "duplicate"].includes(meta.status)) continue;
    const age = Date.now() - Date.parse(meta.updatedAt || meta.createdAt || "");
    if (Number.isFinite(age) && age < 5000) continue;
    try {
      await finalizeDocumentIntake({ withRuntime, intakeId: meta.intakeId, tokenHash: meta.tokenHash, enqueue });
      out.recovered += 1;
    } catch (err) {
      out.deferred += 1;
      log(`[reconcile] intake recovery deferred intake=${meta.intakeId}: ${err?.message ?? err}`);
    }
  }
  return out;
}

async function updateTask(taskId, patch) {
  const current = await readTaskMeta(taskId);
  if (!current) throw Object.assign(new Error(`document task ${taskId} has no durable runtime metadata`), { code: "internal" });
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeTaskMeta(taskId, next);
  return next;
}

export async function noteDocumentTaskClaim(taskId, status, runId) {
  return updateTask(taskId, { status, runId: runId ?? null, startedAt: status === "running" ? new Date().toISOString() : undefined });
}

export async function processDocumentTask(withRuntime, taskId) {
  const task = await readTaskMeta(taskId);
  if (!task) throw Object.assign(new Error(`document task ${taskId} has no durable runtime metadata`), { code: "internal" });
  if (task.lane === "none") {
    await withRuntime((client) =>
      callWriter(client, "select clara.complete_stored_document_task($1,$2) as receipt", [taskId, opKey("doc-store-complete", taskId)]),
    );
    await removeTaskMeta(taskId);
    return { taskId, status: "done", lane: "none" };
  }

  const tempPath = join(spoolConfig().dir, `task-${taskId}-${randomUUID()}.bin`);
  try {
    await downloadCanonical(task.storageKey, tempPath, task.sha256);
    const result = task.lane === "ocr"
      ? await analyzeDocument(tempPath, task.mime, task)
      : await parseStructured(tempPath, task.format, task);
    await withRuntime((client) =>
      callWriter(client, "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt", [
        taskId,
        "done",
        result.pageCount,
        JSON.stringify(result.envelope),
        JSON.stringify(result.regions),
        null,
        result.vendorOpRef ?? null,
        opKey("doc-extract-done", taskId),
      ]),
    );
    await removeTaskMeta(taskId);
    return { taskId, status: "done", lane: task.lane };
  } catch (err) {
    const code = processingFailureCode(err);
    try {
      await withRuntime((client) =>
        callWriter(client, "select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt", [
          taskId,
          "failed",
          0,
          "{}",
          "[]",
          code,
          null,
          opKey("doc-extract-failed", taskId),
        ]),
      );
      await removeTaskMeta(taskId);
    } catch {
      await updateTask(taskId, { status: "running", lastError: code }).catch(() => {});
    }
    throw err;
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export function makeDocumentServices(withRuntime) {
  return Object.freeze({
    noteClaim: noteDocumentTaskClaim,
    process: (taskId) => processDocumentTask(withRuntime, taskId),
  });
}

export function bearerCapability(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  if (!match) throw new IntakeError(404, "not_found", "not found");
  return match[1].trim();
}

export function mapIntakeError(err) {
  if (err instanceof IntakeError || err instanceof IntakeScanError || err instanceof StorageError) {
    return { status: err.status || 500, code: err.code || "internal", message: err.message };
  }
  if (err?.code === "CLR16") return { status: 404, code: "not_found", message: "not found" };
  if (err?.code === "CLR18") return { status: 429, code: "limit", message: "intake limit reached" };
  if (err?.code === "CLR11") return { status: 403, code: "forbidden", message: "not authorized" };
  return { status: 500, code: "internal", message: "internal error" };
}
