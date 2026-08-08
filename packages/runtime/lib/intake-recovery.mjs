// THE INTAKE RECOVERY DOOR, runtime half (migration 0051 §2 — §7-A finding F6 / task #31 +
// the ADR-062 extraction-recovery-door registration).
//
// Split out of intake.mjs for the reason intake-lanes.mjs was: this is a small, self-contained
// policy with its own rationale, and it reads far better next to that rationale than buried
// between the upload state machine and the failure mapper. intake.mjs is also at the repo's
// 500-line module budget.
//
// WHAT THE DB HALF DOES, so the refusals below are readable. clara.finalize_document_intake's
// ADOPTED branch (a re-upload of bytes the firm already holds) used to mint nothing, which
// left a document whose ONLY ingest attempt died terminally with no way back into the
// pipeline. Migration 0051 §2 opens that door: when the adopted document's newest task on its
// own ingest lane is status='failed' and nothing is in flight on that lane, the DB mints a
// fresh attempt (version_n+1, 'queued') and returns a `recovery` fragment on the otherwise
// unchanged 'adopted' receipt:
//     {task_id, lane, version_n, engine_id, storage_path, sha256, mime_type}
//
// WHY THE RUNTIME MUST DO ANYTHING AT ALL. documentIngest_v2 is FROZEN and deployed. Its
// processing step hard-fails on a task with no spool sidecar (documentIngest.behavior_v2.mjs:
// 176-177) and reads storageKey/sha256/mime/format off it (:190-193); its claim step keeps
// only `result.status` from the claim receipt (documentIngest.impl.ts:56-59), so the transport
// metadata clara.claim_document_processing_task returns is discarded inside frozen code; and
// the runtime holds no SELECT on clara.documents (PIN-AB-6, reconciler-documents.mjs:157-162).
// A DB-minted ingest task is therefore undispatchable unless something materialises its
// sidecar. THIS is that something — and it needs no new grant, because a re-upload already
// carries every input in hand.
//
// EVERY VALUE IS DB-SOURCED EXCEPT ONE, and the exception is stated rather than hidden:
// `format` has no column in clara.documents (it is an intake-time detection, intake.mjs:348).
// It comes from THIS upload's own detection over the same bytes — and the lane it implies is
// cross-checked against the lane the DB actually minted on, because handing the frozen
// workflow a reader its lane disagrees with is how you get parseStructured pointed at a PDF.
//
// THE storage_path NAMESPACE, ANSWERED BY A SCHEMA CONSTRAINT AND NOT BY INFERENCE. The
// sidecar's storageKey is the receipt's `recovery.storage_path` — clara.documents.storage_path
// — not this process's freshly computed key. The two are provably the same string:
//   * clara.documents carries ck_documents_storage_path_v2 (0007_document_pipeline.sql:53-54):
//     `storage_path ~ ('^firms/' || firm_id::text || '/docs/' || sha256 || '[.][a-z0-9]{1,12}$')`
//     — the DB ENFORCES the content-addressed layout.
//   * intake.mjs:273 computes exactly that template:
//     `firms/${meta.firmId}/docs/${meta.sha256}.${detected.ext}`.
// "Adopted" MEANS same firm + same sha256, so only the extension is free, and that comes from
// detectDocument over identical bytes. The fresh upload therefore discards nothing:
// putCanonical (intake.mjs:274) re-writes the SAME content-addressed object and verifyCanonical
// (:275/:280) has already proven it hashes correctly in this very call.
// The DB value is used anyway, for two reasons that survive even if that equality stopped
// holding: it is what the DOCUMENT row asserts and therefore what
// clara.claim_document_processing_task hands every other lane (0038:6851-6852), and it is a
// positive read of the durable record rather than a recomputation. On any divergence the
// object is re-verified before use, and an unverifiable one refuses to start.
//
// FAIL-CLOSED IS ALWAYS "RETURN NULL", NEVER "THROW". A recovery that cannot be verified must
// not take down the intake request that carried it — the document really was adopted and that
// receipt is still the caller's honest answer. The DB row simply stays queued; nothing has
// been started against inputs nobody checked.

import { laneSnapshot } from "./intake-lanes.mjs";
import { verifyCanonical } from "./storage.mjs";

const NOOP = /** @type {(message: string) => void} */ (() => {});

/**
 * The spool sidecar for a recovery task named by a finalize receipt, or null when there is no
 * recovery — or when one is present but cannot be positively verified.
 *
 * @param {Record<string, any>|null|undefined} finalized  the clara.finalize_document_intake receipt
 * @param {object} opts
 * @param {string} opts.firmId
 * @param {{format: string, mime: string}} opts.detected   THIS upload's own detection
 * @param {{lane: string, engineId: string, engineConfig: object}} opts.snapshot  laneSnapshot(detected.format)
 * @param {string|null} [opts.canonicalKey]  the key this upload computed, for the divergence check
 * @param {(message: string) => void} [opts.log]
 */
export async function recoveryTaskMeta(finalized, { firmId, detected, snapshot, canonicalKey = null, log = NOOP } = {}) {
  const r = finalized?.recovery ?? null;
  if (!r) return null;

  const say = (message) => { (log === NOOP ? console.error : log)(`[clara-runtime] ${message}`); };

  const taskId = r.task_id ? String(r.task_id) : null;
  const lane = r.lane ? String(r.lane) : null;
  const storageKey = r.storage_path ? String(r.storage_path) : null;
  const sha256 = r.sha256 ? String(r.sha256) : null;
  const mime = r.mime_type ? String(r.mime_type) : null;
  const documentId = finalized?.document_id ? String(finalized.document_id) : null;
  // NOT `Number(r.version_n)`: `Number(null)` is 0, which is finite — so a null version would
  // have passed a Number.isFinite guard and been stamped into the extraction envelope
  // (egress.mjs:152) as version 0. The schema's version_n is an integer >= 1, so that is what
  // is required, positively. (Caught by this module's own unit cell, not by review.)
  const rawVersion = r.version_n;
  const versionN = (rawVersion === null || rawVersion === undefined || rawVersion === "")
    ? Number.NaN : Number(rawVersion);

  // (1) EVERY transport field must be PRESENT. A partial fragment is not a reason to guess the
  // rest from local state — the whole point of sourcing them from the DB is that they describe
  // the row the workflow will claim.
  if (!taskId || !lane || !storageKey || !sha256 || !mime || !documentId
      || !Number.isInteger(versionN) || versionN < 1) {
    say(`intake recovery IGNORED: the receipt's recovery fragment is incomplete (task=${taskId ?? "?"}) — refusing to start a run on a partial transport record`);
    return null;
  }

  // (2) The lane the DB minted on must be the lane THIS upload's own detection implies.
  // documentIngest branches on the sidecar's lane (behavior_v2.mjs:191-193): 'ocr' runs
  // analyzeDocument(mime), anything else runs parseStructured(format). A disagreement here
  // means one of the two is about to read the file with the wrong reader.
  const detectedLane = laneSnapshot(detected.format).lane;
  if (detectedLane !== lane) {
    say(`intake recovery ABANDONED task=${taskId}: the DB minted lane='${lane}' but this upload's detection maps format='${detected.format}' to lane='${detectedLane}' — refusing to hand the workflow a reader its lane disagrees with`);
    return null;
  }

  // (3) The engine the DB copied from the failed attempt must be the engine this image would
  // use. egress.mjs:152 stamps the persisted envelope with `engine: {id: task.engineId,
  // version_n: task.versionN}`, so starting a read on today's model while labelling it with
  // yesterday's engine id would put a false provenance claim into the extraction record.
  if (snapshot?.engineId && r.engine_id && String(r.engine_id) !== String(snapshot.engineId)) {
    say(`intake recovery ABANDONED task=${taskId}: the recovered task carries engine_id='${r.engine_id}' but this image's snapshot for lane='${lane}' is '${snapshot.engineId}' — the envelope would claim a read the named engine did not perform`);
    return null;
  }

  // (4) The storage namespace. Provably identical (see the header), so a divergence means the
  // premise broke — re-verify the durable object before trusting it, and refuse if it does not
  // hash to the sha256 the document row asserts.
  if (canonicalKey && storageKey !== canonicalKey) {
    try {
      await verifyCanonical(storageKey, sha256);
      say(`intake recovery task=${taskId}: the document row's storage_path differs from this upload's computed key; the durable object re-verified against its sha256 and the DB value is being used`);
    } catch (err) {
      say(`intake recovery ABANDONED task=${taskId}: the document row's storage_path could not be verified against its sha256: ${String(err?.message || err)}`);
      return null;
    }
  }

  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId,
    documentId,
    firmId,
    storageKey,
    sha256,
    mime,
    // The one non-DB field, by necessity — clara.documents has no format column. Cross-checked
    // against `lane` at (2) above before it is allowed this far.
    format: detected.format,
    lane,
    engineId: String(r.engine_id ?? snapshot?.engineId ?? ""),
    // Also not a DB-sourced value for this path: the task row's engine_config is not carried on
    // the receipt. (3) has already proven the engine ids agree, so this image's own snapshot for
    // that engine is the same configuration by construction. Nothing reads it before the
    // reconciler's next merge overwrites it from the task row anyway (reconciler-documents.mjs).
    engineConfig: snapshot?.engineConfig ?? {},
    versionN,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
}
