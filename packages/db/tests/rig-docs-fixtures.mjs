// Slice-5 rig — fixture creators + fn wrappers for the document-pipeline surface
// (NOT a test file). Re-exports rig-docs-helpers so a test file imports ONE
// module. Contract-blind: every fn the contract NAMES is called with its literal
// name; where the contract is SILENT on a writer's name or params the wrapper
// resolves the as-built name from a candidate list and builds a named call
// ADAPTIVELY from pg_proc, recording a LANE_NOTE on every divergence (a finding).
//
// Dog-fooding law (brief §4): firms/clients/CoA/documents-citing-entries are built
// THROUGH the audited writers. Documents in S5 lose the SQL ingest path (both
// legacy ingest writers are retired, §3.0.6) — the rig mints verified documents
// via `_seed_verified_document` through rootQuery (companion §3.11: the fn is
// granted to NO app role, so superuser context is the intended rig path). Direct
// bytes_verified_at seeding outside that fn is forbidden (it would bypass the
// citability proof) — so this module NEVER raw-inserts into clara.documents.

import { randomUUID } from "node:crypto";
import {
  ROLES,
  rootActor,
  runAs,
  rootQuery,
  roleQuery,
  opk,
  sha,
  noteLane,
  adaptiveInsert,
  withSessionAuth,
  docFnArgs,
  resolveFn,
} from "./rig-docs-helpers.mjs";

export * from "./rig-docs-helpers.mjs";

// ---------------------------------------------------------------------------
// Adaptive named-call builder for contract-silent signatures. Reads the fn's real
// param names from pg_proc and maps the caller's semantic `desired` map (keyed by
// the p_-stripped name) onto whatever params exist; jsonb params get a ::jsonb
// cast. Named args let us omit defaulted params, so the call depends only on the
// names that actually exist. An unmapped desired key or a wholly-missing fn is a
// FINDING (noted / thrown), never a silent skip.
// ---------------------------------------------------------------------------

/** Match a param name (e.g. 'p_client', 'client', 'p_document_id') to a desired key. */
function paramMatches(paramName, key) {
  const p = paramName.replace(/^p_/, "");
  return p === key || paramName === key || p === `${key}_id` || p.endsWith(`_${key}`);
}

export async function callFnAdaptive(fnName, desired, { persona = rootActor, label } = {}) {
  const overloads = await docFnArgs(fnName);
  if (!overloads.length) throw new Error(`clara.${fnName} does not exist (contract names/implies it — finding)`);
  if (overloads.length > 1) noteLane(`${label ?? fnName}: clara.${fnName} has ${overloads.length} overloads (S5 forbids overloads — finding)`);
  const { names, types } = overloads[0];
  const specs = [];
  const vals = [];
  const usedKeys = new Set();
  names.forEach((pname, i) => {
    if (pname == null) return;
    const type = types[i] ?? "";
    for (const [key, value] of Object.entries(desired)) {
      if (value === undefined || usedKeys.has(key)) continue;
      if (!paramMatches(pname, key)) continue;
      const cast = /json/.test(type) ? "::jsonb" : "";
      specs.push(`${pname} => $${vals.length + 1}${cast}`);
      vals.push(/json/.test(type) && typeof value !== "string" ? JSON.stringify(value) : value);
      usedKeys.add(key);
      break;
    }
  });
  for (const key of Object.keys(desired)) {
    if (desired[key] !== undefined && !usedKeys.has(key)) {
      noteLane(`${label ?? fnName}: desired field '${key}' matched no param of clara.${fnName}(${names.join(", ")}) — interface expectation`);
    }
  }
  const sql = `select clara.${fnName}(${specs.join(", ")}) as result`;
  const r = await runAs(persona, sql, vals);
  return r.rows[0].result;
}

/** Extract an id from a writer receipt (jsonb {..._id} | uuid | {id}). */
export function idOf(receipt, ...keys) {
  if (receipt == null) return null;
  if (typeof receipt === "string") return receipt;
  for (const k of keys) if (receipt[k] != null) return receipt[k];
  return receipt.id ?? null;
}

// ---------------------------------------------------------------------------
// §3.11 document minting — the ONLY rig document-creation path (verified docs).
// ---------------------------------------------------------------------------

/** Mint a verified document (+ optional filing) via _seed_verified_document as
 *  superuser (granted to no app role — companion §3.11). Returns { documentId,
 *  filingId, sha256 }. Signature contract-silent → adaptive named call. */
export async function seedVerifiedDocument({
  firm, client = null, sha256 = null, filename = "rig.pdf", mime = "application/pdf",
  bytes = 2048, storagePath = null, pageCount = 1, kind = null, financialDate = null, resolution = null,
} = {}) {
  const digest = sha256 ?? sha(randomUUID());
  const path = storagePath ?? `firms/${firm}/docs/${digest}.pdf`;
  const receipt = await callFnAdaptive("_seed_verified_document", {
    firm, client, sha256: digest, filename, mime, bytes,
    storage_path: path, page_count: pageCount, document_kind: kind, financial_date: financialDate,
    resolution,
  }, { label: "seed_verified_document" });
  return {
    documentId: idOf(receipt, "document_id", "document"),
    filingId: idOf(receipt, "filing_id", "filing"),
    sha256: digest,
    storagePath: path,
  };
}

/** A legacy claim-only document (bytes_verified_at NULL) minted the pre-0007 way,
 *  for the UPGRADE-branch tests. Because both legacy ingest writers are retired in
 *  0007, this can only be produced by the migration's own backfill — so the
 *  reset-gated upgrade drill builds these on the 0001–0006 schema BEFORE applying
 *  0007. On a post-0007 DB there is no supported claim-only minting path; callers
 *  that need one must run in the upgrade lane. Documented as an interface note. */
export function claimOnlyUnsupportedPost0007() {
  noteLane("claim-only documents can only be produced pre-0007 (ingest writers retired) — the upgrade lane builds them on 0001–0006");
}

// ---------------------------------------------------------------------------
// §3.1 filings.
// ---------------------------------------------------------------------------

/** file_document (human lane): an uploader's explicit client choice IS a human
 *  attribution act; the writer records/uses a resolution ABOUT the document.
 *  Params contract-silent → adaptive. Returns the filing id. */
export async function fileDocument(sub, { document, client, resolution = null, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  const receipt = await callFnAdaptive("file_document", {
    document, client, resolution, op_key: opKey ?? opk("file"),
  }, { persona: human(sub), label: "file_document" });
  return idOf(receipt, "filing_id", "filing");
}

/** retire_document_filing(filing_id, reason, expected_revision, op_key) — the S5-D3
 *  primitive (CAS + structured blockers). Contract states the arg list; house style
 *  is p_-prefixed → try p_filing_id / p_filing. Returns the raw receipt (blockers
 *  are structured). */
export async function retireDocumentFiling(sub, { filing, reason = "rig retire", expectedRevision, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("retire_document_filing", {
    filing, reason, expected_revision: expectedRevision, op_key: opKey ?? opk("retire"),
  }, { persona: human(sub), label: "retire_document_filing" });
}

// ---------------------------------------------------------------------------
// §3.2 intakes (runtime-control; NO domain events). Base inserts via the runtime
// lane (adaptive on silent columns); the finalizer is the sole document creator.
// ---------------------------------------------------------------------------

/** A raw intake row (setup only) via the runtime lane. Contract-named columns are
 *  used verbatim; silent ones adaptive. Never an assertion path. */
export async function seedIntake({
  firm, uploadedBy = null, origin = "documents_tab", status = "uploading",
  chatSession = null, filename = "rig.pdf", mime = "application/pdf", bytes = 2048,
  sha256 = null, storageKey = null, opKey = null, extra = {}, lane = "runtime",
}) {
  const desired = {
    firm_id: firm, origin, status,
    original_filename: filename, declared_mime: mime, declared_bytes: bytes,
    op_key: opKey ?? opk("intake"), ...extra,
  };
  if (uploadedBy != null) desired.uploaded_by = uploadedBy;
  if (chatSession != null) desired.chat_session_id = chatSession;
  if (sha256 != null) desired.sha256 = sha256;
  if (storageKey != null) desired.storage_key = storageKey;
  const r = await adaptiveInsert("document_intakes", desired, { lane, label: "seed intake" });
  return r.rows[0].id;
}

/** finalize_document_intake (runtime-only): creates document + processing task +
 *  document.ingested in ONE txn; duplicate → adopt/upgrade. Params silent → adaptive. */
export async function finalizeIntake({ intake, client = null, resolution = null, opKey = null }) {
  const receipt = await callFnAdaptive("finalize_document_intake", {
    intake, client, resolution, op_key: opKey ?? opk("finalize"),
  }, { persona: { kind: "role", role: ROLES.runtime }, label: "finalize_document_intake" });
  return receipt;
}

/** Resolve the masked human-facing intake view name (definer view WITHOUT
 *  chat_session_id — §3.2/§R6). Candidate names; returns null if none. */
export async function intakeViewName() {
  const r = await rootQuery(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relkind IN ('v','m')
        and c.relname ~ 'intake' order by c.relname`,
  );
  return r.rows.map((x) => x.relname);
}

// ---------------------------------------------------------------------------
// §3.3 extractions + regions (runtime-written; persist path idempotent by
// (document, engine, version)). Setup inserts via the runtime lane, adaptive.
// ---------------------------------------------------------------------------

export async function seedExtraction({
  firm, document, engineId = "azure-di:prebuilt-layout:4.0", engineKind = "ocr",
  versionN = 1, status = "done", pageCount = 1, envelope = {}, lane = "runtime", extra = {},
}) {
  const desired = {
    firm_id: firm, document_id: document, engine_id: engineId, engine_kind: engineKind,
    version_n: versionN, status, page_count: pageCount, envelope, ...extra,
  };
  const r = await adaptiveInsert("document_extractions", desired, { lane, label: "seed extraction" });
  return r.rows[0].id;
}

export async function seedRegion({
  firm, extraction, locatorKind = "page_polygon", locator = { page: 1, polygon: [0, 0, 1, 1] },
  fieldPath = "total", textContent = "100.00", engineConfidence = 0.97, lane = "runtime", extra = {},
}) {
  const desired = {
    firm_id: firm, extraction_id: extraction, locator_kind: locatorKind, locator,
    field_path: fieldPath, text_content: textContent, engine_confidence: engineConfidence, ...extra,
  };
  const r = await adaptiveInsert("document_regions", desired, { lane, label: "seed region" });
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------
// §3.4 attribution.
// ---------------------------------------------------------------------------

/** client_identifiers audited human writer (name contract-silent → candidates). */
export async function addClientIdentifier(sub, { client, kind = "tin", value, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  const fn = await resolveFn(
    ["add_client_identifier", "record_client_identifier", "upsert_client_identifier", "register_client_identifier"],
    { required: true, label: "client_identifiers writer" },
  );
  return callFnAdaptive(fn, { client, kind, value_normalized: value, value, op_key: opKey ?? opk("cid") },
    { persona: human(sub), label: fn });
}

/** client_aliases audited human writer (name contract-silent → candidates). */
export async function addClientAlias(sub, { client, alias, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  const fn = await resolveFn(
    ["add_client_alias", "record_client_alias", "upsert_client_alias", "register_client_alias"],
    { required: true, label: "client_aliases writer" },
  );
  return callFnAdaptive(fn, { client, alias_normalized: alias, alias, op_key: opKey ?? opk("alias") },
    { persona: human(sub), label: fn });
}

/** record_rule_resolution(p_document, p_op_key) — CONTRACT-NAMED; runtime-login-only
 *  EXECUTE. Recomputes the lane-1 predicate server-side (callers never supply
 *  client/confidence). Runs via the runtime LOGIN shell bare (its direct EXECUTE
 *  grant), falling back to the clara_runtime group on a grant divergence (noted). */
export async function recordRuleResolution({ document, opKey = null }) {
  const key = opKey ?? opk("rule");
  const sql = "select clara.record_rule_resolution(p_document => $1, p_op_key => $2) as result";
  try {
    return await withSessionAuth("clara_runtime_login", async (c) => {
      const r = await c.query(sql, [document, key]);
      return r.rows[0].result;
    });
  } catch (e) {
    if (e.code === "42501") {
      noteLane("record_rule_resolution: bare clara_runtime_login lacked EXECUTE — falling back to clara_runtime group (grant divergence to record)");
      const r = await roleQuery(ROLES.runtime, sql, [document, key]);
      return r.rows[0].result;
    }
    throw e;
  }
}

export async function seedAttempt({ firm, document, matcherVersion = 1, inputFingerprint = null, lane = "runtime", extra = {} }) {
  const desired = {
    firm_id: firm, document_id: document, matcher_version: matcherVersion,
    input_fingerprint: inputFingerprint ?? sha(randomUUID()), ...extra,
  };
  const r = await adaptiveInsert("attribution_attempts", desired, { lane, label: "seed attempt" });
  return r.rows[0].id;
}

export async function seedCandidate({ firm, attempt, client, rank = 1, ruleKind = "name_exact", disposition = "open", lane = "runtime", extra = {} }) {
  const desired = {
    firm_id: firm, attempt_id: attempt, client_id: client, rank,
    rule_kind: ruleKind, disposition, ...extra,
  };
  const r = await adaptiveInsert("attribution_candidates", desired, { lane, label: "seed candidate" });
  return r.rows[0].id;
}

export async function confirmCandidate(sub, { candidate, client = null, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("confirm_attribution_candidate", {
    candidate, client, op_key: opKey ?? opk("confirm"),
  }, { persona: human(sub), label: "confirm_attribution_candidate" });
}

export async function dismissCandidate(sub, { candidate, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("dismiss_attribution_candidate", {
    candidate, op_key: opKey ?? opk("dismiss"),
  }, { persona: human(sub), label: "dismiss_attribution_candidate" });
}

// ---------------------------------------------------------------------------
// §3.5 correction case.
// ---------------------------------------------------------------------------

export async function previewCorrection(sub, { document, fromClient, toClient }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("preview_wrong_client_correction", {
    document, from_client: fromClient, to_client: toClient,
  }, { persona: human(sub), label: "preview_wrong_client_correction" });
}

export async function proposeCorrection(sub, { document, fromClient, toClient, reason = "rig correction", opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("propose_wrong_client_correction", {
    document, from_client: fromClient, to_client: toClient, reason, op_key: opKey ?? opk("propose"),
  }, { persona: human(sub), label: "propose_wrong_client_correction" });
}

export async function approveCorrection(sub, { correction, planHash, attestation = null, opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("approve_wrong_client_correction", {
    correction, plan_hash: planHash, attestation, op_key: opKey ?? opk("approvecorr"),
  }, { persona: human(sub), label: "approve_wrong_client_correction" });
}

// ---------------------------------------------------------------------------
// §3.6 metering — limits + reservations.
// ---------------------------------------------------------------------------

/** Operator-set per-firm document limits (writer name silent → adaptiveInsert as
 *  root; the ruling-4 defaults+override pattern). */
export async function setDocLimits(firm, { docsPerDay = 100, pagesPerDay = 500, ocrConcurrency = 2, extra = {} } = {}) {
  const desired = {
    firm_id: firm, docs_per_day: docsPerDay, pages_per_day: pagesPerDay, ocr_concurrency: ocrConcurrency, ...extra,
  };
  const r = await adaptiveInsert("firm_document_limits", desired, { lane: "root", returning: "firm_id", label: "set doc limits" });
  return r.rows[0]?.firm_id ?? firm;
}

/** Resolve a reservation writer name from candidates (all silent). */
export async function reservationFn(kind) {
  const map = {
    reserve: ["reserve_document_ingest", "reserve_document_pages", "create_ingest_reservation", "reserve_ingest"],
    resize: ["resize_ingest_reservation", "resize_document_reservation", "resize_reservation"],
    settle: ["settle_ingest_reservation", "settle_document_reservation", "settle_reservation"],
    refund: ["refund_ingest_reservation", "refund_document_reservation", "refund_reservation"],
  };
  return resolveFn(map[kind], { label: `reservation ${kind} writer` });
}

// ---------------------------------------------------------------------------
// §4.7 retention + legal hold (contract-named).
// ---------------------------------------------------------------------------

export async function placeLegalHold(sub, { document, reason = "rig legal hold", opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("place_legal_hold", {
    document, reason, op_key: opKey ?? opk("hold"),
  }, { persona: human(sub), label: "place_legal_hold" });
}

export async function releaseLegalHold(sub, { document, reason = "rig release", opKey = null }) {
  const { human } = await import("./rig-docs-helpers.mjs");
  return callFnAdaptive("release_legal_hold", {
    document, reason, op_key: opKey ?? opk("release"),
  }, { persona: human(sub), label: "release_legal_hold" });
}

// ---------------------------------------------------------------------------
// Readers (root — superuser bypasses RLS, sees every firm).
// ---------------------------------------------------------------------------

/** The whole documents row by id (post-0007 the client_id column is gone). */
export async function documentRow(id) {
  const r = await rootQuery("select to_jsonb(d) as row from clara.documents d where d.id = $1", [id]);
  return r.rows[0]?.row ?? null;
}

/** Active (non-retired) filings for a document. */
export async function activeFilings(document) {
  const r = await rootQuery(
    "select to_jsonb(f) as row from clara.document_filings f where f.document_id = $1 and f.retired_at is null order by f.filed_at",
    [document],
  );
  return r.rows.map((x) => x.row);
}

/** All filings (any state) for a document — historical. */
export async function allFilings(document) {
  const r = await rootQuery(
    "select to_jsonb(f) as row from clara.document_filings f where f.document_id = $1 order by f.filed_at",
    [document],
  );
  return r.rows.map((x) => x.row);
}
