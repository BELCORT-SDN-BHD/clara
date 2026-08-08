import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { analyzeDocument } from "./egress.mjs";
import { detectDocument, IntakeScanError, scanFile } from "./scan.mjs";
import {
  intakePaths,
  listIntakeMetas,
  mergeTaskMeta,
  noteTerminalFailure,
  noteTransientFailure,
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
import { laneSnapshot } from "./intake-lanes.mjs";
import { recoveryTaskMeta } from "./intake-recovery.mjs";
import { processDocumentTaskBehavior } from "../workflows/documentIngest.behavior.mjs";

const MAX_BYTES = 20 * 1024 * 1024;
const CAPABILITY_TTL_MS = 15 * 60_000;
const activeIntakes = new Set();
const NOOP_LOG = /** @type {(message: string) => void} */ (() => {});

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
  // OFX / QFX (Wave C-b §4.3). Every spelling a portal may declare canonicalizes to ONE
  // value: the declared MIME is compared byte-for-byte against the DETECTED one, so an
  // alias table admitting two spellings would reject half the uploads it appears to allow.
  ...["application/x-ofx", "application/ofx", "application/vnd.intu.qfx", "application/x-qfx"]
    .map((declared) => [declared, "application/x-ofx"]),
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

function requireContinuableIntakeReceipt(value) {
  if (value?.status === "failed") throw new IntakeError(404, "not_found", "not found");
  return value;
}

async function replayFinalizationWithoutSidecar(withRuntime, intakeId, token) {
  if (!token) return null;
  const hash = tokenHash(token);
  return withRuntime(async (client) => {
    const durable = await client.query(
      `select op_key from clara.document_intakes
        where id=$1 and token_hash=$2 and expires_at>now()
          and status in ('finalized','adopted')`,
      [intakeId, hash],
    );
    const fixedOp = durable.rows[0]?.op_key;
    if (!fixedOp) return null;
    return callWriter(
      client,
      "select clara.finalize_document_intake(p_intake=>$1,p_token_hash=>$2,p_op_key=>$3) as receipt",
      [intakeId, hash, fixedOp],
    );
  });
}

function failureCode(err) {
  const code = String(err?.code || "internal");
  return ["too_large", "bad_type", "limit", "checksum_mismatch", "storage_error", "expired", "malware_detected", "quarantined"].includes(code)
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
    await callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt",
      [intakeId, "internal", opKey("doc-intake-sidecar-fail")]).catch(() => {});
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
    const claimed = await withRuntime((client) =>
      callWriter(client, "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt", [
        intakeId,
        meta.tokenHash,
        leaseOwner,
        900,
        opKey("doc-intake-claim"),
      ]),
    );
    requireContinuableIntakeReceipt(claimed);
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
          callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt",
            [intakeId, "too_large", opKey("doc-intake-upload-size-fail")]),
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
    try {
      meta = expectedHash ? await requireCapabilityHash(intakeId, expectedHash) : await requireCapability(intakeId, token);
    } catch (err) {
      const replayed = expectedHash ? null : await replayFinalizationWithoutSidecar(withRuntime, intakeId, token).catch(() => null);
      if (replayed) return replayed;
      throw err;
    }
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
        const claimed = await withRuntime((client) =>
          callWriter(client, "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt", [
            intakeId,
            meta.tokenHash,
            leaseOwner,
            900,
            opKey("doc-intake-reclaim"),
          ]),
        );
        requireContinuableIntakeReceipt(claimed);
        const received = await withRuntime((client) =>
          callWriter(client, "select clara.mark_document_intake_received($1,$2,$3,$4,$5,$6) as receipt", [
            intakeId,
            meta.tokenHash,
            leaseOwner,
            meta.sha256,
            key,
            opKey("doc-intake-received"),
          ]),
        );
        requireContinuableIntakeReceipt(received);
      } catch (err) {
        if (err?.code !== "CLR16") throw err;
      }
      meta = { ...meta, status: "received", leaseOwner, updatedAt: new Date().toISOString() };
      await writeIntakeMeta(intakeId, meta);
    }
    if (meta.status === "received") {
      try {
        const verifying = await withRuntime((client) =>
          callWriter(client, "select clara.begin_document_intake_verification($1,$2) as receipt", [
            intakeId,
            opKey("doc-intake-verifying"),
          ]),
        );
        requireContinuableIntakeReceipt(verifying);
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
        requireContinuableIntakeReceipt(verified);
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
        meta.beginOp,
      ]),
    );
    requireContinuableIntakeReceipt(finalized);

    // 0051 §2 — the intake recovery door, runtime half. Rationale + every refusal:
    // intake-recovery.mjs. Returns the recovery task's sidecar, or null (fail-closed).
    const recovery = await recoveryTaskMeta(finalized, {
      firmId: meta.firmId, detected, snapshot, canonicalKey: key,
    });
    const needsStart = finalized.status === "finalized" || finalized.upgraded === true || recovery !== null;
    if (needsStart && (recovery?.taskId || finalized.task_id)) {
      const task = recovery ?? {
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
      // Sidecar BEFORE enqueue, as the fresh path has always done — documentIngest_v2 claims
      // via noteClaim -> mergeTaskMeta{requireExists:true} and hard-fails on a null
      // readTaskMeta (behavior_v2.mjs:176-177). The crash-between-commit-and-write residual
      // is the fresh path's own, unchanged: not a new class.
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
    // 2026-07-26 outage: only `code` reaches the DB and the codes are coarse — `storage_error`
    // covers a bad key, missing config, an expired credential, a refused upload AND a failed
    // read-back. The err MESSAGE separates them ("Storage upload failed (403)") and was dropped,
    // so two production failures produced ZERO log lines. `canonicalReached` localises the
    // failure either side of the storage write. No filename — it can identify a client.
    console.error(`[clara-runtime] intake FAILED intake=${intakeId} code=${code} canonicalReached=${canonicalReached} detail=${String(err?.message || err)}`);
    if (meta) {
      try {
        await withRuntime((client) =>
          callWriter(client, "select clara.fail_document_intake($1,$2,$3) as receipt", [intakeId, code, opKey("doc-intake-fail")]),
        );
      } catch {
        // The original failure stays authoritative; a terminal/replayed intake may refuse a second fail transition.
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

/** Resume durable post-upload intakes after a crash. The sidecar carries only the capability HASH (the plaintext token is gone). */
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

// A claim with no sidecar at all is a real bug worth surfacing loud — requireExists:true
// (unlike the reconciler's own merge, deliberately lenient since it may race a task with
// none yet; see spool.mjs's own header on mergeTaskMeta).
export async function noteDocumentTaskClaim(taskId, status, runId) {
  return mergeTaskMeta(taskId, { status, runId: runId ?? null, startedAt: status === "running" ? new Date().toISOString() : undefined }, { requireExists: true });
}

export async function processDocumentTask(withRuntime, taskId) {
  return processDocumentTaskBehavior(makeDocumentServices(), withRuntime, taskId);
}

export function makeDocumentServices() {
  return Object.freeze({
    noteClaim: noteDocumentTaskClaim,
    readTaskMeta,
    removeTaskMeta,
    taskTempPath: (taskId) => join(spoolConfig().dir, `task-${taskId}-${randomUUID()}.bin`),
    removeTempFile: (path) => rm(path, { force: true }),
    downloadCanonical,
    analyzeDocument,
    parseStructured,
    noteTaskFailure: noteTransientFailure, // v1 alias, same shape v1 always got
    noteTransientFailure, noteTerminalFailure, // v2 (task #28) — see spool.mjs's header
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
