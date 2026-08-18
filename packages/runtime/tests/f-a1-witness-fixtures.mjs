// F-A1 witnessFacts_v1 — shared runtime-rig fixtures (NOT a test file: no `.test.` segment, so
// `node --test` ignores it).
//
// Builds a REAL witness situation on a REAL Postgres migrated 0001→0095: a firm, a client, a
// filed document with a done OCR extraction and numbered regions, a claimed `llm_witness` task,
// and (optionally) a live typed `witness_extraction` consent + activation minted through the
// AUDITED owner verbs — never a hand-inserted consent row, because the consent surface is
// exactly the thing the egress cells are testing.
//
// Documents / extractions / regions / filings / tasks ARE seeded as root. They are not books
// rows, no audited writer exists for the shapes a witness task needs mid-pipeline, and the
// sibling DB battery (packages/db/tests/f-a1-writer.test.mjs) seeds the same way — mirroring it
// keeps a divergence between the two lanes visible as a finding rather than as two different
// fixtures quietly testing two different things.

import { randomUUID } from "node:crypto";
import * as fx from "./relay-fixtures.mjs";
import { WITNESS_ENGINE_SNAPSHOT } from "../workflows/witnessFacts.v1.services.mjs";

export const WITNESS_PURPOSE = "witness_extraction";

/** THE ENGINE ID THE ROUTER MUST STAMP — the real snapshot constant, not a rig invention. The
 *  behaviour refuses to egress when the task's stamp and this image's model disagree, so using
 *  the true value here is what makes these cells test the CONTRACT rather than a stand-in (the
 *  PR-1 assembly lesson: a scaffold the real dependency later diverges from). It carries the
 *  `llm-` prefix the lane↔engine CHECK (0090 §3) demands; the 4-column unique is per-DOCUMENT,
 *  so every cell may share it. */
export const rigEngineId = () => WITNESS_ENGINE_SNAPSHOT.engineId;

/** A live-shaped `clara.documents` row. `storage_path` must satisfy ck_documents_storage_path_v2
 *  (`^firms/<firm>/docs/<sha>.<ext>$`), so it is built from the sha rather than invented. */
export async function seedDocument({ firm, kind = "invoice", mime = "application/pdf", pageCount = 1 }) {
  const sha = fx.sha(`witness-${randomUUID()}`);
  const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");
  const r = await fx.rootQuery(
    `insert into clara.documents
       (firm_id, sha256, original_filename, mime_type, byte_size, storage_path, status,
        bytes_verified_at, page_count, document_kind)
     values ($1,$2,$3,$4,$5,$6,'ingested', now(), $7, $8) returning id`,
    [firm, sha, `witness.${ext}`, mime, 4096, `firms/${firm}/docs/${sha}.${ext}`, pageCount, kind],
  );
  return { documentId: r.rows[0].id, sha256: sha, mime, storagePath: `firms/${firm}/docs/${sha}.${ext}` };
}

/** File the document to ONE client (basis 'legacy-0007' — the only basis that takes a null
 *  resolution, per ck_document_filings_resolution). */
export async function fileTo({ firm, documentId, client }) {
  const r = await fx.rootQuery(
    `insert into clara.document_filings (firm_id, document_id, client_id, basis)
     values ($1,$2,$3,'legacy-0007') returning id`,
    [firm, documentId, client],
  );
  return r.rows[0].id;
}

export async function seedOcrExtraction({ firm, documentId, pageCount = 1, versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_extractions
       (firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
     values ($1,$2,'azure-di:prebuilt-layout:2024-11-30','ocr',$3,'done',$4,'{}'::jsonb)
     returning id`,
    [firm, documentId, versionN, pageCount],
  );
  return r.rows[0].id;
}

export async function seedOcrRegion({ firm, extraction, fieldPath, textContent, locator = { page: 1, polygon: [0, 0, 5, 0, 5, 5, 0, 5] } }) {
  const r = await fx.rootQuery(
    `insert into clara.document_regions
       (firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
     values ($1,$2,'page_polygon',$3::jsonb,$4,$5,0.97) returning id`,
    [firm, extraction, JSON.stringify(locator), fieldPath, textContent],
  );
  return r.rows[0].id;
}

/** A CLAIMED (`running`) llm_witness task — the state `persist_witness_facts` requires. Built
 *  directly rather than through `claim_document_processing_task` because nothing mints an
 *  llm_witness task at this frontier (PR-3's router does); the claim body's own witness arms are
 *  proven in packages/db/tests/f-a1-walls.test.mjs. */
export async function runningWitnessTask({ firm, documentId, engineId = rigEngineId(), versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_processing_tasks
       (firm_id, document_id, engine_id, version_n, lane, status, workflow_run_id, started_at)
     values ($1,$2,$3,$4,'llm_witness','running',$5, now()) returning id`,
    [firm, documentId, engineId, versionN, `rig-witness-${randomUUID().slice(0, 8)}`],
  );
  return { taskId: r.rows[0].id, engineId, versionN };
}

/** A live typed `witness_extraction` consent + activation through the AUDITED owner verbs
 *  (0090 §7c widened their in-body allowlists — this is what proves the widening reaches the
 *  runtime). The evidence document is a verified consent-evidence artifact, which
 *  `grant_client_egress_purpose` refuses to proceed without. */
export async function liveWitnessConsent(ownerSub, { firm, client }) {
  const evidence = await seedDocument({ firm, kind: "consent_evidence" });
  const granted = await fx.humanQuery(
    ownerSub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_evidence_document => $3, p_scope_note => $4, p_op_key => $5) as r`,
    [client, WITNESS_PURPOSE, evidence.documentId, "runtime rig witness consent", fx.opk("gwc")],
  );
  const consentId = granted.rows[0].r.consent_id;
  const activated = await fx.humanQuery(
    ownerSub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_consent => $3, p_op_key => $4) as r`,
    [client, WITNESS_PURPOSE, consentId, fx.opk("awa")],
  );
  return { evidence, consentId, activation: activated.rows[0].r };
}

/** The whole situation in one call. `regions` is a list of {label, text} — the labels become
 *  `ocr_<label>` field paths so a cell can look an idx up by name. */
export async function buildWitnessSituation(label, {
  consent = true, mime = "application/pdf", pageCount = 1,
  regions = [], ocr = true, engineId = rigEngineId(),
} = {}) {
  const { owner, firm, client } = await fx.buildFirm(label);
  const doc = await seedDocument({ firm, mime, pageCount });
  await fileTo({ firm, documentId: doc.documentId, client });
  // `ocr: false` seeds NO extraction at all — the absent-substrate shape. It cannot be produced
  // by deleting one afterwards: clara.document_extractions is append-only (CLR08 'document
  // extractions are historical'), which is itself worth knowing about this rig.
  const ocrId = ocr ? await seedOcrExtraction({ firm, documentId: doc.documentId, pageCount }) : null;
  const ids = {};
  for (const r of regions) {
    ids[r.label] = await seedOcrRegion({ firm, extraction: ocrId, fieldPath: `ocr_${r.label}`, textContent: r.text });
  }
  // The citation ordinal is `row_number() over (order by id)` over uuids, so it is NOT insertion
  // order — read the published numbering back rather than assuming it (the whole point of M5).
  const numbered = ocrId
    ? (await fx.rootQuery(
      "select idx, region_id, text_content from clara.witness_citation_regions($1) order by idx", [ocrId])).rows
    : [];
  const idxOf = {};
  for (const [name, id] of Object.entries(ids)) {
    idxOf[name] = numbered.find((row) => row.region_id === id)?.idx;
  }
  const task = await runningWitnessTask({ firm, documentId: doc.documentId, engineId });
  const consentRecord = consent ? await liveWitnessConsent(owner, { firm, client }) : null;
  return {
    owner, firm, client,
    documentId: doc.documentId, sha256: doc.sha256, mime, storagePath: doc.storagePath,
    ocrId, regionIds: ids, idxOf, numbered,
    taskId: task.taskId, engineId: task.engineId, versionN: task.versionN,
    consent: consentRecord,
    /** The claim-receipt-shaped `doc` the frozen behaviour consumes. */
    claimDoc: {
      document_id: doc.documentId, firm_id: firm, lane: "llm_witness",
      storage_path: doc.storagePath, sha256: doc.sha256, mime_type: mime, byte_size: 4096,
    },
  };
}

/** Root reads for assertions (bypass RLS so a cell sees every firm). */
export const readTask = (id) =>
  fx.rootQuery("select * from clara.document_processing_tasks where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readUsageRows = (taskId) =>
  fx.rootQuery("select * from clara.llm_usage_events where task_id=$1 order by created_at, id", [taskId]).then((r) => r.rows);
export const readExtractions = (documentId) =>
  fx.rootQuery(
    "select id, engine_kind, engine_id, version_n, status, envelope, superseded_by, extracted_at, page_count"
    + " from clara.document_extractions where document_id=$1 order by extracted_at", [documentId],
  ).then((r) => r.rows);
export const readFactRegions = (extractionId) =>
  fx.rootQuery(
    "select field_path, text_content, monetary_raw, monetary_cents, engine_confidence, locator"
    + " from clara.document_regions where extraction_id=$1 order by field_path", [extractionId],
  ).then((r) => r.rows);
export const readDispatchAuthorizations = (firm) =>
  fx.rootQuery(
    "select purpose, event_type, event_seq, document_sha256, consumed_at from clara.egress_dispatch_authorizations"
    + " where firm_id=$1 order by issued_at", [firm],
  ).then((r) => r.rows);
export const readWitnessState = (documentId, textId, visionId) =>
  fx.rootQuery("select clara.evaluate_witness_fact_state_v1($1,$2,$3) as v", [documentId, textId, visionId])
    .then((r) => r.rows[0].v);
