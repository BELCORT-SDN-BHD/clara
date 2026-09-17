// #646's own mock lane — the SOURCE-CORRECTION journey (C2 · B3 · C13), a file-disjoint sibling
// of `documents-viewer-mock.mjs`, consulted by `serve-built.mjs` through ONE Supabase hook.
//
// EVERY HANDLER IS ID-SCOPED and falls through otherwise, so this lane cannot starve another
// walk's fixtures in either direction. Its client id and document ids share the prefix
// `c0ee0c0c-` and are distinct from every id in every sibling lane and from `serve-built.mjs`'s
// own CLIENT_A/CLIENT_B.
//
// FIVE RPC VERBS ARE SHARED with a sibling lane, and all five are declared in
// `SHARED_RPC_VERBS` (`e2e-fixture-ownership.test.ts`), whose verb-ownership census reds on any
// undeclared claimant. Four are shared with `documents-viewer-mock.mjs` — `get_document_state`,
// `get_document_extract`, `list_source_revisions`, `list_source_dependents` — because BOTH lanes
// render the same document panel, which reads all four on mount; each lane answers only for its
// OWN document ids and falls through on anything else. The fifth, `record_client_resolution`, is
// shared with `chat-parity-mock.mjs`, whose arm is UNSCOPED (declared debt there) and dispatched
// first, so that lane is what actually answers the wizard's first step today — immaterial only
// because the wizard treats the returned id as an opaque handle. See the declaration for the
// full argument.
//
// THE DISPATCH VARIABLE IS CALLED `verb` ON PURPOSE. The census reads lane mocks as TEXT and
// recognises exactly three dispatch spellings (`verb`, `fn`, or a literal rpc path compared with
// `===`, all three spelled out in that file's own RPC_VERB_OPENER); a fourth spelling
// makes a whole lane invisible to it, which is how these five shares went undeclared through
// round 1. The exact-verb allow-list below runs BEFORE `readJson`, so a verb this lane does not
// own never touches the request stream (the L7 hazard `e2e-fixture-ownership.test.ts` N7 fences).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the routed views, the tab
// parameter, both dialogs, the Sheet, the correction band and every line of client code under test
// are REAL. What is faked is PostgREST behind them. So this walk proves the JOURNEY and the
// client's own wire shapes; the DATABASE half of the same journey is proven against real Postgres
// under real least-privileged roles by `packages/db/tests/rig-docs-source-revision.test.mjs`, and
// neither stands in for the other.
//
// THE FIXTURE IS A STATE MACHINE ON PURPOSE. A revision MOVES the facts version, which is exactly
// the thing a stale-revision refusal is about, so `state.factsVersion` is what the walk drives:
// the first revision is accepted and bumps it, and a second call quoting the old number is refused
// CLR19 with both numbers and the attempted value — the same shape `clara.revise_document_fact`
// raises. `resetDocumentCorrection()` puts every mutable field back.

import { matchVerb, readCachedJson as readJson } from "./mock-dispatch.mjs";

export const CORR = {
  clientId: "c0ee0c0c-0000-4000-8000-000000000000",
  firmId: "33333333-3333-3333-3333-333333333333",
  subject: "11111111-1111-1111-1111-111111111111",
  /** The invoice the whole walk works on: typed facts, one live entry, one open question. */
  doc: "c0ee0c0c-1111-4111-8111-111111111111",
  /** A second document whose only classification question is ORPHANED — its filing was retired,
   *  so no other door in the estate can close it. */
  docOrphan: "c0ee0c0c-2222-4222-8222-222222222222",
  filing: "c0ee0c0c-f111-4111-8111-111111111111",
  filingOrphan: "c0ee0c0c-f222-4222-8222-222222222222",
  machineExtraction: "c0ee0c0c-e111-4111-8111-111111111111",
  humanExtraction: "c0ee0c0c-e222-4222-8222-222222222222",
  regionTotal: "c0ee0c0c-4e61-4111-8111-111111111111",
  regionVendor: "c0ee0c0c-4e61-4222-8222-222222222222",
  regionStatement: "c0ee0c0c-4e61-4333-8333-333333333333",
  entry: "c0ee0c0c-a111-4111-8111-111111111111",
  question: "c0ee0c0c-9111-4111-8111-111111111111",
  questionOrphan: "c0ee0c0c-9222-4222-8222-222222222222",
  knowledge: "c0ee0c0c-4b11-4111-8111-111111111111",
  correction: "c0ee0c0c-c011-4111-8111-111111111111",
  destination: "c0ee0c0c-0001-4000-8000-000000000001",
};

const LANE_PREFIX = "c0ee0c0c-";

/** The verbs this lane owns. Checked BEFORE the body is read so a sibling lane's POST reaches it
 *  with the stream intact, in any hook order. */
export const CORRECTION_RPC_VERBS = new Set([
  "get_document_state",
  "list_source_revisions",
  "list_source_dependents",
  "revise_document_fact",
  "dismiss_orphaned_classification_question",
  "set_document_kind",
  "preview_wrong_client_correction",
  "record_client_resolution",
  "propose_wrong_client_correction",
  "approve_wrong_client_correction",
  "get_document_extract",
  // THE FIXTURE CONTROL. `serve-built.mjs` is ONE server for the whole run, so this lane's state
  // survives from cell to cell — and this lane's state is the POINT (an accepted revision moves the
  // source version, which is what a stale refusal is about). Each cell therefore resets it first,
  // through a verb SCOPED to this lane's own client id: a control that answered for any body would
  // be able to reset a sibling lane's fixture, which is exactly what `e2e-fixture-ownership.test.ts`
  // exists to prevent.
  "reset_document_correction_fixture",
]);

const state = {
  factsVersion: 1,
  revisions: [],
  kind: "invoice",
  total: "1050.00",
  totalCents: 105000,
  questionOpen: true,
  orphanOpen: true,
  transferred: false,
  /** op_key -> receipt, so a REPLAY answers the original receipt byte-identically rather than
   *  minting a second effect — the lost-response half of AC2, at the wire. */
  receipts: new Map(),
};

export function resetDocumentCorrection() {
  state.factsVersion = 1;
  state.revisions = [];
  state.kind = "invoice";
  state.total = "1050.00";
  state.totalCents = 105000;
  state.questionOpen = true;
  state.orphanOpen = true;
  state.transferred = false;
  state.receipts = new Map();
}

const DOC_ROWS = {
  [CORR.doc]: {
    id: CORR.doc, sha256: "c".repeat(64), original_filename: "supplier-bill-april.pdf",
    mime_type: "application/pdf", byte_size: 20480, storage_path: `firms/${CORR.firmId}/c.pdf`,
    uploaded_by: CORR.subject, created_at: "2026-04-01T00:00:00.000Z",
    bytes_verified_at: "2026-04-01T00:00:01.000Z", page_count: 1, extraction_status: "done",
    document_kind: "invoice", financial_date: "2026-04-01", retention_state: "unanchored",
    retain_until: null, retention_basis: null, legal_hold: false, legal_hold_reason: null,
  },
  [CORR.docOrphan]: {
    id: CORR.docOrphan, sha256: "d".repeat(64), original_filename: "unreadable-scan.pdf",
    mime_type: "application/pdf", byte_size: 1024, storage_path: `firms/${CORR.firmId}/d.pdf`,
    uploaded_by: CORR.subject, created_at: "2026-04-02T00:00:00.000Z",
    bytes_verified_at: "2026-04-02T00:00:01.000Z", page_count: 1, extraction_status: "done",
    document_kind: null, financial_date: null, retention_state: "unanchored",
    retain_until: null, retention_basis: null, legal_hold: false, legal_hold_reason: null,
  },
};

const FILINGS = [
  {
    id: CORR.filing, document_id: CORR.doc, client_id: CORR.clientId,
    filed_at: "2026-04-01T00:00:02.000Z", filed_by: CORR.subject, basis: "human",
    retired_at: null, retirement_reason: null, revision_token: "rev-1",
  },
  {
    id: CORR.filingOrphan, document_id: CORR.docOrphan, client_id: CORR.clientId,
    filed_at: "2026-04-02T00:00:02.000Z", filed_by: CORR.subject, basis: "human",
    retired_at: "2026-04-03T00:00:00.000Z", retirement_reason: "filed in error",
    revision_token: "rev-2",
  },
];

/** The regions of the CURRENT facts extraction. `invoice.total` is the one the walk revises; the
 *  statement path is here for the row that must say Read-only rather than offer a control the
 *  door would refuse. */
function currentRegions() {
  const extraction = state.factsVersion === 1 ? CORR.machineExtraction : CORR.humanExtraction;
  return [
    {
      id: CORR.regionTotal, extraction_id: extraction, field_path: "invoice.total",
      text_content: state.total, engine_confidence: state.factsVersion === 1 ? 0.83 : 1,
      monetary_raw: state.total, monetary_cents: state.totalCents,
    },
    {
      id: CORR.regionVendor, extraction_id: extraction, field_path: "invoice.vendor_name",
      text_content: "ACME SUPPLIES SDN BHD", engine_confidence: 0.83,
      monetary_raw: null, monetary_cents: null,
    },
    {
      id: CORR.regionStatement, extraction_id: extraction, field_path: "statement.closing_balance",
      text_content: "RM 12.00", engine_confidence: 0.4, monetary_raw: null, monetary_cents: null,
    },
  ];
}

function extractionsFor(document) {
  if (document !== CORR.doc) return [];
  const rows = [{
    id: CORR.machineExtraction, document_id: CORR.doc, engine_id: "azure-di:prebuilt-invoice:2024-11-30",
    engine_kind: "invoice_facts", version_n: 1, status: "done", page_count: 1,
    superseded_by: state.factsVersion > 1 ? CORR.humanExtraction : null,
    extracted_at: "2026-04-01T00:00:02.000Z",
  }];
  if (state.factsVersion > 1) {
    rows.push({
      id: CORR.humanExtraction, document_id: CORR.doc, engine_id: "clara-fact-human:v1",
      engine_kind: "invoice_facts", version_n: 1, status: "done", page_count: 1,
      superseded_by: null, extracted_at: "2026-04-05T00:00:00.000Z",
    });
  }
  return rows;
}

function lineage() {
  const rows = state.revisions.map((r) => ({
    entry_kind: r.kind, at: r.at, revision_id: r.id, client_id: CORR.clientId,
    field_path: r.field_path ?? null, prior_value: r.prior_value ?? null,
    new_value: r.new_value ?? null, observed_extraction_id: CORR.machineExtraction,
    observed_version_n: r.observed, resulting_extraction_id: CORR.humanExtraction,
    reason: r.reason, recorded_by: CORR.subject,
  }));
  if (state.transferred) {
    rows.push({
      entry_kind: "wrong_client_correction", at: "2026-04-06T00:00:00.000Z",
      correction_id: CORR.correction, status: "completed",
      from_client: CORR.clientId, to_client: CORR.destination,
      reason: "this bill belongs to the other client", maker: CORR.subject, checker: CORR.subject,
      proposed_at: "2026-04-06T00:00:00.000Z", approved_at: "2026-04-06T00:00:00.000Z",
      completed_at: "2026-04-06T00:00:00.000Z",
      retired_filings: [{
        filing_id: CORR.filing, client_id: CORR.clientId,
        retired_at: "2026-04-06T00:00:00.000Z", retirement_reason: "wrong client",
      }],
    });
  }
  return rows;
}

function json(sendJson, response, body, cors) {
  sendJson(response, 200, body, cors);
  return true;
}

/** A governed refusal, in PostgREST's own shape: the SQLSTATE in `code`, the DB's sentence in
 *  `message`, the typed discriminant + its payload in `details`. Nothing here invents a shape the
 *  real wire cannot produce. */
function refuse(sendJson, response, cors, code, message, details) {
  sendJson(response, 400, { code, message, details: JSON.stringify(details) }, cors);
  return true;
}

function eqParam(url, key) {
  const raw = url.searchParams.get(key);
  return raw?.startsWith("eq.") ? raw.slice(3) : null;
}

function inParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw?.startsWith("in.(")) return null;
  return raw.slice(4, -1).split(",").map((v) => decodeURIComponent(v.trim()));
}

/** The Supabase/PostgREST hook. Returns true when it answered. */
export async function handleDocumentCorrectionSupabase(request, response, path, url, sendJson, cors) {
  // The client register is SHARED and this lane does not claim it: only the by-id form for its own
  // client, which the workspace layout asks for after a direct navigation.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (eqParam(url, "id") !== CORR.clientId) return false;
    return json(sendJson, response, [{
      id: CORR.clientId, name: "Correction Fixture Sdn Bhd", status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    const client = eqParam(url, "client_id");
    const document = eqParam(url, "document_id");
    if (client === CORR.clientId) {
      return json(sendJson, response, FILINGS.filter((f) => f.retired_at === null || document !== null), cors);
    }
    if (document !== null && document.startsWith(LANE_PREFIX)) {
      return json(sendJson, response, FILINGS.filter((f) => f.document_id === document), cors);
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/documents") {
    const ids = inParam(url, "id");
    if (!ids || ids.length === 0) return false;
    if (!ids.every((id) => id.startsWith(LANE_PREFIX))) return false;
    return json(sendJson, response, ids.map((id) => DOC_ROWS[id]).filter(Boolean), cors);
  }

  if (request.method === "GET" && path === "/rest/v1/attribution_candidates") {
    if (eqParam(url, "client_id") !== CORR.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_extractions") {
    const document = eqParam(url, "document_id");
    if (document === null || !document.startsWith(LANE_PREFIX)) return false;
    return json(sendJson, response, extractionsFor(document), cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_regions") {
    const ids = inParam(url, "extraction_id");
    if (!ids?.some((id) => id.startsWith(LANE_PREFIX))) return false;
    return json(sendJson, response, currentRegions().filter((r) => ids.includes(r.extraction_id)), cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_processing_tasks_visible") {
    const document = eqParam(url, "document_id");
    if (document === null || !document.startsWith(LANE_PREFIX)) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    const client = eqParam(url, "client_id");
    const document = eqParam(url, "document_id");
    if (client !== CORR.clientId && (document === null || !document.startsWith(LANE_PREFIX))) return false;
    return json(sendJson, response, [{
      id: CORR.entry, client_id: CORR.clientId, document_id: CORR.doc, status: "approved",
      posting_date: "2026-04-01", memo: "ACME SUPPLIES SDN BHD — April bill", origin: "coding",
      reversed_by: null, reversal_of: null,
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/entry_evidence_links") {
    const document = eqParam(url, "document_id");
    if (document === null || !document.startsWith(LANE_PREFIX)) return false;
    return json(sendJson, response, document === CORR.doc
      ? [{ entry_id: CORR.entry, client_id: CORR.clientId }] : [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/coding_tasks_visible") {
    if (eqParam(url, "client_id") !== CORR.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/lint_findings") {
    if (eqParam(url, "client_id") !== CORR.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "POST" && path.startsWith("/rest/v1/rpc/")) {
    const verb = path.slice("/rest/v1/rpc/".length);
    // THE ALLOW-LIST RUNS BEFORE `readJson`, so a verb this lane does not own reaches the next
    // hook with its request stream intact, in ANY hook order (the N7 hazard).
    if (!matchVerb(CORRECTION_RPC_VERBS, verb)) return false;
    const body = await readJson(request);

    if (verb === "get_document_state") {
      if (body.p_document !== CORR.doc && body.p_document !== CORR.docOrphan) return false;
      return json(sendJson, response, {
        document_id: body.p_document, document_kind: state.kind, mime_type: "application/pdf",
        format: "pdf",
        capability: { typed_facts: "supported", custody: "supported", byte_extraction: "supported",
          business_operation: "supported", known_pair: true, kind_known: true, limits: {},
          registry_version: 1, basis: "invoice facts are read from a PDF." },
        custody: { state: "verified", sha256: "c".repeat(64), byte_size: 20480,
          bytes_verified_at: "2026-04-01T00:00:01.000Z", legal_hold: false, legal_hold_reason: null,
          retention_state: "unanchored", retain_until: null, capability: "supported" },
        byte_extraction: { status: "done", page_count: 1, capability: "supported",
          engine_id: "azure-di:prebuilt-layout:2024-11-30", tasks: [] },
        facts: { capability: "supported", limits: {}, extractions: extractionsFor(CORR.doc).map((e) => ({
          id: e.id, engine_kind: e.engine_kind, engine_id: e.engine_id, version_n: e.version_n,
          status: e.status, superseded_by: e.superseded_by, extracted_at: e.extracted_at,
          region_count: 3,
        })), validations: [] },
        operation: { capability: "supported", codeable_kind: true,
          entries: [{ entry_id: CORR.entry, status: "approved" }], statements: [] },
        lineage: { sha256: "c".repeat(64), intakes: [], filings: FILINGS, corrections: [],
          authoritative_extraction_id: state.factsVersion === 1 ? CORR.machineExtraction : CORR.humanExtraction },
      }, cors);
    }

    if (verb === "list_source_revisions") {
      if (body.p_document !== CORR.doc && body.p_document !== CORR.docOrphan) return false;
      return json(sendJson, response, {
        document_id: body.p_document, document_kind: state.kind,
        facts_version: body.p_document === CORR.doc ? state.factsVersion : 0,
        authoritative_extraction_id: state.factsVersion === 1 ? CORR.machineExtraction : CORR.humanExtraction,
        current_facts_extraction_id: state.factsVersion === 1 ? CORR.machineExtraction : CORR.humanExtraction,
        lineage: body.p_document === CORR.doc ? lineage() : [],
      }, cors);
    }

    if (verb === "list_source_dependents") {
      if (body.p_document !== CORR.doc && body.p_document !== CORR.docOrphan) return false;
      const orphan = body.p_document === CORR.docOrphan;
      return json(sendJson, response, {
        document_id: body.p_document,
        current_facts_extraction_id: state.factsVersion === 1 ? CORR.machineExtraction : CORR.humanExtraction,
        facts_version: orphan ? 0 : state.factsVersion,
        knowledge_records: orphan ? [] : [{
          id: CORR.knowledge, record_id: CORR.knowledge, revision_n: 1,
          knowledge_key: "supplier_payment_terms", scope_kind: "client", client_id: CORR.clientId,
          kind: "extracted_fact", state: "live", trust: "extracted",
          source_extraction_id: CORR.machineExtraction, source_region_id: CORR.regionVendor,
          source_field_path: "invoice.vendor_name", recorded_at: "2026-04-01T00:05:00.000Z",
          superseded_by: null, source_superseded: state.factsVersion > 1,
        }],
        open_questions: orphan
          ? (state.orphanOpen ? [{
            id: CORR.questionOrphan, client_id: CORR.clientId, origin: "classification",
            status: "open", question_text: "What kind of document is this? The classifier was not confident.",
            opened_at: "2026-04-02T00:01:00.000Z", live_filings: 0, orphaned: true,
          }] : [])
          : (state.questionOpen ? [{
            id: CORR.question, client_id: CORR.clientId, origin: "manual", status: "open",
            question_text: "Whose bill is this, Rome or Bee?",
            opened_at: "2026-04-01T00:06:00.000Z", live_filings: 1, orphaned: false,
          }] : []),
        work_questions: [],
      }, cors);
    }

    if (verb === "revise_document_fact") {
      if (body.p_document !== CORR.doc) return false;
      const replay = state.receipts.get(`revise:${body.p_op_key}`);
      if (replay) return json(sendJson, response, replay, cors);
      if (body.p_observed_version !== state.factsVersion) {
        return refuse(sendJson, response, cors, "CLR19",
          `this revision was written against facts version ${body.p_observed_version}, the current version is ${state.factsVersion}`,
          {
            reason: "stale_source_version", observed_version: body.p_observed_version,
            current_version: state.factsVersion,
            current_extraction_id: CORR.humanExtraction,
            field_path: body.p_field_path, attempted_value: body.p_value,
          });
      }
      if (body.p_field_path === "invoice.total" && !/^[0-9.,]+$/.test(String(body.p_value))) {
        return refuse(sendJson, response, cors, "CLR10",
          "a revised monetary value must be readable as cents",
          { reason: "monetary_value_malformed", field_path: body.p_field_path, attempted_value: body.p_value });
      }
      const prior = { text: state.total, cents: state.totalCents };
      state.total = String(body.p_value);
      state.totalCents = Math.round(Number(String(body.p_value).replace(/,/g, "")) * 100);
      state.factsVersion += 1;
      const revision = {
        id: `c0ee0c0c-4e41-4111-8111-00000000000${state.revisions.length + 1}`,
        kind: "fact", at: "2026-04-05T00:00:00.000Z", field_path: body.p_field_path,
        prior_value: prior, new_value: { text: state.total, cents: state.totalCents },
        observed: body.p_observed_version, reason: body.p_reason,
      };
      state.revisions.push(revision);
      const receipt = {
        document_id: CORR.doc, revision_id: revision.id, field_path: body.p_field_path,
        prior_value: prior, new_value: revision.new_value, extraction_id: CORR.humanExtraction,
        observed_extraction_id: CORR.machineExtraction, observed_version: body.p_observed_version,
        facts_version: state.factsVersion, carried_regions: 2,
      };
      state.receipts.set(`revise:${body.p_op_key}`, receipt);
      return json(sendJson, response, receipt, cors);
    }

    if (verb === "dismiss_orphaned_classification_question") {
      if (body.p_question !== CORR.questionOrphan && body.p_question !== CORR.question) return false;
      if (body.p_question === CORR.question) {
        return refuse(sendJson, response, cors, "CLR10",
          "this question still has a live filing -- answer it through resolve_open_question",
          { reason: "filing_still_live", live_filings: 1 });
      }
      state.orphanOpen = false;
      return json(sendJson, response, {
        question_id: CORR.questionOrphan, status: "dismissed",
        document_id: CORR.docOrphan, client_id: CORR.clientId,
      }, cors);
    }

    if (verb === "set_document_kind") {
      if (body.p_document !== CORR.doc && body.p_document !== CORR.docOrphan) return false;
      state.kind = body.p_kind;
      state.revisions.push({
        id: `c0ee0c0c-4b11-4111-8111-00000000000${state.revisions.length + 1}`,
        kind: "kind", at: "2026-04-05T01:00:00.000Z", field_path: null,
        prior_value: "invoice", new_value: body.p_kind, observed: state.factsVersion,
        reason: body.p_reason,
      });
      return json(sendJson, response, {
        document_id: body.p_document, document_kind: body.p_kind, prior_kind: "invoice",
        extraction_id: CORR.humanExtraction, resolved_questions: [], resolved_question_count: 0,
        revision_id: "c0ee0c0c-4b11-4111-8111-000000000001",
        observed_extraction_id: CORR.machineExtraction, observed_version: state.factsVersion,
      }, cors);
    }

    if (verb === "preview_wrong_client_correction") {
      if (body.p_document !== CORR.doc) return false;
      return json(sendJson, response, {
        correction_id: null, document_id: CORR.doc, from_client: CORR.clientId,
        to_client: body.p_to_client, filing_id: CORR.filing, books_version: 42,
        items: [{
          entry_id: CORR.entry, entry_state_hash: "a".repeat(64), action: "reverse",
          posting_date: "2026-04-01", status: "approved", period_state: "open",
        }],
        period_model: "calendar", closed_period_blockers: [], subledger_model: "none",
      }, cors);
    }

    if (verb === "record_client_resolution") {
      if (body.p_subject !== CORR.doc) return false;
      return json(sendJson, response, { resolution_id: "c0ee0c0c-4e50-4111-8111-111111111111" }, cors);
    }

    if (verb === "propose_wrong_client_correction") {
      if (body.p_document !== CORR.doc) return false;
      return json(sendJson, response, {
        correction_id: CORR.correction, plan_hash: "b".repeat(64), books_version: 42,
        status: "proposed",
      }, cors);
    }

    if (verb === "approve_wrong_client_correction") {
      if (body.p_correction !== CORR.correction) return false;
      state.transferred = true;
      return json(sendJson, response, { correction_id: CORR.correction, status: "completed" }, cors);
    }

    if (verb === "reset_document_correction_fixture") {
      if (body.p_client !== CORR.clientId) return false;
      resetDocumentCorrection();
      return json(sendJson, response, { ok: true }, cors);
    }

    if (verb === "get_document_extract") {
      if (body.p_document !== CORR.doc && body.p_document !== CORR.docOrphan) return false;
      return json(sendJson, response, null, cors);
    }
  }

  return false;
}
