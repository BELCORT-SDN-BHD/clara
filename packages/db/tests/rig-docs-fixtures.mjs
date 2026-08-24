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
 *  filingId, sha256 }. Signature contract-silent → adaptive named call.
 *
 *  [Wave-F Track A, F-A7 gamma] `_seed_verified_document`'s own filing write, when a `client`
 *  is passed, bypasses `file_document` entirely (a raw superuser insert, never the audited
 *  writer) and so never auto-enqueues a classify task — gamma's gate cannot see it either way.
 *  An UNFILED document (`client: null`, the pre-activation class D-21) is the one shape a
 *  caller can still hand straight to the classify lane themselves (`enqueue_invoice_facts` /
 *  `clara._enqueue_invoice_facts_core`, as several TOCTOU/race cells do) — for exactly that
 *  shape this also grants the firm's firm-narrow 'attribution' consent by default (opt out
 *  with `grantClassifyConsent: false`), mirroring `fileDocument`'s client-scoped convenience. */
export async function seedVerifiedDocument({
  firm, client = null, sha256 = null, filename = "rig.pdf", mime = "application/pdf",
  bytes = 2048, storagePath = null, pageCount = 1, kind = null, financialDate = null, resolution = null,
  grantClassifyConsent = true,
} = {}) {
  const digest = sha256 ?? sha(randomUUID());
  const path = storagePath ?? `firms/${firm}/docs/${digest}.pdf`;
  const receipt = await callFnAdaptive("_seed_verified_document", {
    firm, client, sha256: digest, filename, mime, bytes,
    storage_path: path, page_count: pageCount, document_kind: kind, financial_date: financialDate,
    resolution,
  }, { label: "seed_verified_document" });
  if (grantClassifyConsent && client == null && firm) await ensureFirmNarrowAttribution({ firm });
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
// [Wave-F Track A, F-A7 gamma, D1-gamma] fixture convenience — ADR-0075's own framing: every
// test firm is a CONSENTED fixture. `fileDocument` grants the filing client's
// `document_processing` typed egress consent by default, through the REAL governed verbs
// (classify_consent_evidence_document -> grant_client_egress_purpose ->
// activate_client_egress_purpose — never a raw table write), so gamma's classify-lane
// enqueue-time consent gate does not park every pre-existing fixture that files a null-kind
// document (0009's own auto-enqueue). Pass `grantClassifyConsent: false` to construct a
// deliberately UNCONSENTED firm/client for a cell that must prove the gate actually refuses —
// mandatory for gamma's own differential pair (packages/db/tests/f-a7-gamma-egress.test.mjs).
//
// GATED, not unconditional: a database below gamma's frontier has neither the purpose value
// nor classify_consent_evidence_document, so this checks liveness once (memoized) and is a
// silent no-op below that frontier — the pre-gamma behaviour (classify always proceeds) is
// unchanged for every earlier-frontier test in this estate.
// ---------------------------------------------------------------------------

let _gammaLive = null;
async function gammaReady() {
  if (_gammaLive !== null) return _gammaLive;
  const r = await rootQuery(
    `select to_regprocedure('clara.classify_consent_evidence_document(uuid,text,text)') is not null
       and exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid
                    join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='clara' and c.relname='client_egress_purpose_consents'
                     and con.contype='c' and con.conname='ck_client_egress_purpose_consents_purpose_f_a1'
                     and pg_get_constraintdef(con.oid) like '%document_processing%') as ok`);
  _gammaLive = r.rows[0]?.ok === true;
  return _gammaLive;
}

const _classifyConsentGranted = new Set(); // dedupe within a process: `${firm}:${client}`

/** Grant + activate 'document_processing' for (firm, client) through the real governed verbs,
 *  mirroring wave-b/wb-0020-helpers.mjs's own consentEvidenceDoc/lightSynthesis idiom for the
 *  wiki purpose. Idempotent (a second call for the same firm+client is a no-op) and a silent
 *  no-op below gamma's frontier.
 *
 *  Grants as the FIRM'S OWNER, resolved internally — never as `sub`. `fileDocument`'s own floor
 *  is `clara_authenticated` (filing is routine bookkeeper work), so `sub` there is very often a
 *  bookkeeper/viewer, not an owner; the three consent-lane verbs this helper calls are all
 *  owner-floored (`_human_ctx(role_rank('owner'))`), so using `sub` directly would raise CLR04
 *  on exactly the fixtures this convenience exists to unblock. A firm with no active owner
 *  membership is a fixture defect this helper surfaces loudly rather than swallowing. */
export async function ensureClassifyConsent(sub, { firm, client }) {
  if (!(await gammaReady())) return;
  const key = `${firm}:${client}`;
  if (_classifyConsentGranted.has(key)) return;
  const live = await rootQuery(
    `select 1 from clara.client_egress_purpose_activations a
       join clara.client_egress_purpose_consents c
         on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
      where a.firm_id=$1 and a.client_id=$2 and a.purpose='document_processing'
        and a.deactivated_at is null and c.revoked_at is null`,
    [firm, client]);
  if (live.rowCount > 0) { _classifyConsentGranted.add(key); return; }

  // MEASURED (full-estate battery): grant_client_egress_purpose requires client.status=
  // 'active' (a pre-existing 0020-era CLR11 check, unrelated to gamma). Many pre-existing
  // fixtures deliberately file a document to a client that is not yet active (their own test
  // intent has nothing to do with classify). This convenience is additive, never a NEW hard
  // requirement: fail SOFT here — the classify gate still holds normally
  // (document_processing_consent_inactive) for such a client, exactly as it would with no
  // convenience at all; only an ACTIVE client is worth the grant attempt.
  const clientActive = await rootQuery("select 1 from clara.clients where id=$1 and status='active'", [client]);
  if (clientActive.rowCount === 0) return;

  const ownerRow = await rootQuery(
    `select user_id from clara.firm_memberships
      where firm_id=$1 and role='owner' and status='active' order by created_at limit 1`,
    [firm]);
  const owner = ownerRow.rows[0]?.user_id;
  if (!owner) throw new Error(`ensureClassifyConsent: firm ${firm} has no active owner membership — cannot grant document_processing consent`);

  const { human } = await import("./rig-docs-helpers.mjs");
  // grantClassifyConsent: false — evidence minting must NOT recurse into
  // ensureFirmNarrowAttribution (an unfiled, client-null seed would otherwise re-trigger it).
  const evidence = await seedVerifiedDocument({ firm, grantClassifyConsent: false });
  await runAs(human(owner),
    "select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2, p_op_key => $3) as r",
    [evidence.documentId, "rig fixture consent letter (F-A7 gamma classify convenience)", opk("cce-dp")]);
  const grant = await runAs(human(owner),
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r`,
    [client, evidence.documentId, "rig fixture classify consent", opk("gdp")]);
  const consentId = grant.rows[0].r.consent_id;
  await runAs(human(owner),
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_consent => $2, p_op_key => $3) as r`,
    [client, consentId, opk("adp")]);
  _classifyConsentGranted.add(key);
}

const _firmNarrowGranted = new Set(); // dedupe within a process: firm id

/** Grant + activate the firm-narrow 'attribution' moment for `firm` through the real governed
 *  verbs (grant/activate_firm_egress_purpose), the unfiled-document sibling of
 *  ensureClassifyConsent above. Idempotent and a silent no-op below gamma's frontier. Grants as
 *  the firm's owner, resolved internally. */
export async function ensureFirmNarrowAttribution({ firm }) {
  if (!(await gammaReady())) return;
  if (_firmNarrowGranted.has(firm)) return;
  const live = await rootQuery(
    `select 1 from clara.firm_egress_purpose_activations a
       join clara.firm_egress_purpose_consents c
         on c.id=a.consent_id and c.firm_id=a.firm_id and c.purpose=a.purpose and c.moment=a.moment
      where a.firm_id=$1 and a.purpose='firm_narrow_intake' and a.moment='attribution'
        and a.deactivated_at is null and c.revoked_at is null`,
    [firm]);
  if (live.rowCount > 0) { _firmNarrowGranted.add(firm); return; }

  const ownerRow = await rootQuery(
    `select user_id from clara.firm_memberships
      where firm_id=$1 and role='owner' and status='active' order by created_at limit 1`,
    [firm]);
  const owner = ownerRow.rows[0]?.user_id;
  if (!owner) throw new Error(`ensureFirmNarrowAttribution: firm ${firm} has no active owner membership — cannot grant firm_narrow_intake consent`);

  const { human } = await import("./rig-docs-helpers.mjs");
  const evidence = await seedVerifiedDocument({ firm, grantClassifyConsent: false });
  await runAs(human(owner),
    "select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2, p_op_key => $3) as r",
    [evidence.documentId, "rig fixture consent letter (F-A7 gamma firm-narrow convenience)", opk("cce-fn")]);
  const grant = await runAs(human(owner),
    `select clara.grant_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'attribution',
       p_evidence_document => $1, p_scope_note => $2, p_op_key => $3) as r`,
    [evidence.documentId, "rig fixture firm-narrow attribution consent", opk("gfn")]);
  const consentId = grant.rows[0].r.consent_id;
  await runAs(human(owner),
    `select clara.activate_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'attribution',
       p_consent => $1, p_op_key => $2) as r`,
    [consentId, opk("afn")]);
  _firmNarrowGranted.add(firm);
}

// ---------------------------------------------------------------------------
// §3.1 filings.
// ---------------------------------------------------------------------------

/** file_document (human lane): an uploader's explicit client choice IS a human
 *  attribution act; the writer records/uses a resolution ABOUT the document.
 *  Params contract-silent → adaptive. Returns the filing id.
 *
 *  [F-A7 gamma] Grants the filing client's classify consent first (see ensureClassifyConsent
 *  above) unless `grantClassifyConsent: false` is passed — the opt-out a cell needs to
 *  construct a deliberately unconsented firm and prove the gate refuses.
 *
 *  MEASURED (full-estate battery): the grant ONLY fires when the document's kind is still
 *  NULL — the one condition under which 0009's auto-enqueue can ever reach the classify lane
 *  at all (`_enqueue_invoice_facts_core`'s classify arm is `if d.document_kind is null`; a
 *  document filed with a kind already set — an invoice, a receipt, whatever the caller
 *  declared — never touches the classify gate, so granting consent for it is pure pollution:
 *  it left an unexpected document_processing row for pre-existing 0020-era tests asserting an
 *  EXACT closed-world count on client_egress_purpose_consents for a client that also happened
 *  to file an already-kinded document via this same helper). */
export async function fileDocument(sub, {
  document, client, resolution = null, opKey = null, grantClassifyConsent = true,
}) {
  const { human } = await import("./rig-docs-helpers.mjs");
  if (grantClassifyConsent) {
    const docRow = await rootQuery("select firm_id, document_kind from clara.documents where id=$1", [document]);
    const firm = docRow.rows[0]?.firm_id;
    const kind = docRow.rows[0]?.document_kind;
    if (firm && kind == null) await ensureClassifyConsent(sub, { firm, client });
  }
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
