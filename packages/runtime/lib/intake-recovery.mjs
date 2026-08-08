// THE INTAKE RECOVERY DOOR, runtime half (migration 0051 §2 — §7-A finding F6 / task #31 +
// the ADR-062 extraction-recovery-door registration).
//
// Split out of intake.mjs for the reason intake-lanes.mjs was: this is a small, self-contained
// policy with its own rationale, and intake.mjs is at the repo's 500-line module budget.
//
// WHAT THE DB HALF DOES. clara.finalize_document_intake's ADOPTED branch (a re-upload of bytes
// the firm already holds) used to mint nothing, leaving a document whose only ingest attempt
// died terminally with no way back into the pipeline. Migration 0051 §2 opens that door and
// returns a `recovery` fragment on the otherwise unchanged 'adopted' receipt:
//     {task_id, lane, version_n, engine_id, storage_path, sha256, mime_type, format, mode}
// `mode` is 'mint' (a fresh attempt was created and this re-upload's reservation bound to it)
// or 'echo' (the lane's newest task was ALREADY queued — a previous mint whose sidecar may
// have been lost in the post-commit crash window; nothing new is created or charged, the
// transport is simply handed back so this process can rebuild the sidecar).
//
// WHY THE RUNTIME MUST DO ANYTHING AT ALL. documentIngest_v2 is frozen and deployed. Its
// processing step hard-fails on a task with no spool sidecar (documentIngest.behavior_v2.mjs:
// 176-177) and reads storageKey/sha256/mime/format off it (:190-193); its claim step keeps
// only `result.status` from the claim receipt (documentIngest.impl.ts:56-59), so the transport
// metadata clara.claim_document_processing_task returns is discarded inside frozen code; and
// the runtime holds no SELECT on clara.documents (PIN-AB-6, reconciler-documents.mjs:157-162).
// A DB-minted ingest task is therefore undispatchable unless something materialises its
// sidecar. THIS is that something — and it needs no new grant, because a re-upload already
// carries every input in hand.
//
// EVERY VALUE COMES FROM THE DOCUMENT'S DURABLE IDENTITY. NOTHING IS DERIVED HERE.
// The first cut wrote the fresh upload's own `detected.format` into the sidecar, and the
// cross-model review found the hole: detection is FILENAME-SENSITIVE for the ambiguous text
// formats, so identical bytes sent once as `.csv` and again as `.tsv` keep the same sha256,
// the same lane and the same engine — every check passed, the old `.csv` storage object was
// used, and the frozen worker parsed a CSV document as TSV. So this module now derives
// nothing at all: `mime` is clara.documents.mime_type and `format` is the extension of
// clara.documents.storage_path, which ck_documents_storage_path_v2 (0007:53-54) pins to
// `^firms/<firm>/docs/<sha256>.<ext>$`. The DB additionally REFUSES the recovery outright when
// the re-upload's declared mime disagrees with the durable one, so the mismatch never reaches
// this module — the derivation is removed here as well because a second, independent way to
// get the answer wrong is not defence in depth, it is another way to get it wrong.
//
// WHAT IS *NOT* CROSS-CHECKED, AND WHY (corrected by review). An earlier cut refused when the
// fragment's engine_id differed from this image's snapshot. That is wrong for the ECHO mode:
// a task minted before an engine-snapshot bump legitimately carries the older engine, and
// refusing it would make the crash-heal impossible for exactly the deploy that caused the
// crash. The task's own engine_id is its truth and is passed through verbatim; egress.mjs:152
// stamps it into the envelope, which is then honest about which engine owns the attempt.
//
// WHAT *IS* CROSS-CHECKED: that THIS image's lane mapping still agrees with the lane the DB
// minted on. That is not an identity-by-construction — the DB's lane was decided by whichever
// image ran the ORIGINAL intake, and packages/runtime/lib/intake-lanes.mjs is a policy that
// can change between deploys (Wave C-b moved OFX from structured_parse to none). If a format's
// lane has since moved, the sidecar would send the file to a reader the DB's lane disagrees
// with. Fail closed on the skew.
//
// FAIL-CLOSED IS "RETURN NULL", NEVER "THROW". A recovery that cannot be verified must not take
// down the intake request that carried it — the document really was adopted and that receipt is
// still the caller's honest answer. The CALLER decides how loud to be (intake.mjs raises, and
// deliberately retains the intake spool, precisely because a queued DB task is left unserved).

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
 * @param {string|null} [opts.canonicalKey]  the key this upload computed, for the divergence check
 * @param {(message: string) => void} [opts.log]
 */
export async function recoveryTaskMeta(finalized, { firmId, canonicalKey = null, log = NOOP } = {}) {
  const r = finalized?.recovery ?? null;
  if (!r) return null;

  const say = (message) => { (log === NOOP ? console.error : log)(`[clara-runtime] ${message}`); };

  const taskId = r.task_id ? String(r.task_id) : null;
  const lane = r.lane ? String(r.lane) : null;
  const storageKey = r.storage_path ? String(r.storage_path) : null;
  const sha256 = r.sha256 ? String(r.sha256) : null;
  const mime = r.mime_type ? String(r.mime_type) : null;
  const format = r.format ? String(r.format) : null;
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
  if (!taskId || !lane || !storageKey || !sha256 || !mime || !format || !documentId
      || !Number.isInteger(versionN) || versionN < 1) {
    say(`intake recovery IGNORED: the receipt's recovery fragment is incomplete (task=${taskId ?? "?"}) — refusing to start a run on a partial transport record`);
    return null;
  }

  // (2) DEPLOY SKEW. The lane the DB minted on was chosen by whichever image ran the original
  // intake; this image's own policy may since have moved that format to another lane.
  // documentIngest branches on the sidecar's lane (behavior_v2.mjs:191-193): 'ocr' runs
  // analyzeDocument(mime), anything else runs parseStructured(format). A disagreement means one
  // of the two is about to read the file with the wrong reader.
  const laneNow = laneSnapshot(format).lane;
  if (laneNow !== lane) {
    say(`intake recovery ABANDONED task=${taskId}: the task's lane is '${lane}' but this image maps the document's durable format '${format}' to lane '${laneNow}' — the lane policy moved under an existing task; refusing to hand the workflow a reader its lane disagrees with`);
    return null;
  }

  // (3) The storage namespace. The DB value and this upload's computed key are the same string
  // by construction (see the header), so a divergence means the premise broke — read the
  // durable object before trusting it, and refuse if it does not hash to the document's sha.
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
    format,
    lane,
    // The TASK's own engine, passed through verbatim — see the header on why this is not
    // compared against this image's snapshot.
    engineId: String(r.engine_id ?? ""),
    // Not carried on the fragment and not needed before the reconciler's next merge overwrites
    // it from the task row; the frozen readers never consult it.
    engineConfig: {},
    versionN,
    status: "queued",
    mode: r.mode ? String(r.mode) : null,
    createdAt: now,
    updatedAt: now,
  };
}
