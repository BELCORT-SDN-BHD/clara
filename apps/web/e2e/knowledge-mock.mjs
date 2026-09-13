// #644's mock lane (the C13 Knowledge walk) — a file-disjoint sibling of the other lane mocks,
// consulted by `serve-built.mjs` through ONE hook, exactly as those modules' own headers describe.
// Every id below is distinct from theirs and every handler is ID-SCOPED, so no walk can starve
// another's fixtures (e2e-fixture-ownership.test.ts enforces this mechanically — this file's
// declaration row is `{ unscopeable: [], debt: [] }`).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL: `KnowledgePanel`, `KnowledgeDetail`, the shared badge/applicability/source
// presentation, `lib/registers/knowledge.ts`'s door wrappers, `useAsyncRead`'s reload-after-write
// and the door dialog's single-fire confirm. What is faked is PostgREST — including the 403 the
// denied face needs and the empty `documents` read the inaccessible-source face needs. So this
// walk proves the JOURNEY and what the surface does with each outcome; the doors' own floors,
// refusals and revision algebra are proven in packages/db/tests/knowledge-records.test.mjs
// against a real Postgres under real least-privileged roles, not here.
//
// FOUR CLIENTS, ONE PER READ OUTCOME the surface must distinguish:
//   ok          — a real register: a corrected record, an unverified inference, a firm default,
//                 a legacy client_fact, and a CONFLICTING pair (two live rows of one key).
//   empty       — a real read, zero records (a successful "nothing recorded yet").
//   denied      — `list_client_knowledge` answers 403 (an RLS/grant refusal, not "no data").
//   sourceGone  — a record that NAMES a source document the documents read cannot return.

export const KN = {
  clientOk: "644aa644-1111-4777-8777-644aa6440001",
  clientEmpty: "644aa644-1111-4777-8777-644aa6440002",
  clientDenied: "644aa644-1111-4777-8777-644aa6440003",
  clientSourceGone: "644aa644-1111-4777-8777-644aa6440004",
  recordMsic: "644bb644-2222-4777-8777-644bb6440001",
  recordInferred: "644bb644-2222-4777-8777-644bb6440002",
  recordFirmDefault: "644bb644-2222-4777-8777-644bb6440003",
  recordConflictA: "644bb644-2222-4777-8777-644bb6440004",
  recordConflictB: "644bb644-2222-4777-8777-644bb6440005",
  recordSourceGone: "644bb644-2222-4777-8777-644bb6440006",
  legacyFact: "644cc644-3333-4777-8777-644cc6440001",
  missingDocument: "644dd644-4444-4777-8777-644dd6440001",
};

const CLIENT_NAMES = {
  [KN.clientOk]: "644 Knowledge OK Fixture",
  [KN.clientEmpty]: "644 Knowledge Empty Fixture",
  [KN.clientDenied]: "644 Knowledge Denied Fixture",
  [KN.clientSourceGone]: "644 Knowledge Source-Gone Fixture",
};

function clientRow(id) {
  return { id, name: CLIENT_NAMES[id], status: "active", created_at: "2026-01-01T00:00:00.000Z" };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const NO_SOURCE = { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null };

function rec(over) {
  return {
    record_id: over.record_id,
    revision_id: `${over.record_id}-rev${over.revision_n ?? 1}`,
    revision_n: 1,
    scope_kind: "client",
    client_id: KN.clientOk,
    kind: "assertion",
    applies_when: {},
    applies_when_digest: `d-${over.record_id}`,
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: NO_SOURCE,
    basis: "the rig fixture's own basis",
    asserted_by: "644-user-1",
    asserted_by_name: "Aisyah Rahman",
    recorded_via: "human_ui",
    recorded_at: "2026-09-12T02:00:00.000Z",
    knowledge_version: "7",
    revision_kind: "capture",
    revision_reason: null,
    supersedes_id: null,
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    ...over,
  };
}

// MUTABLE, deliberately: the walk's Withdraw press must produce a PERSISTENT outcome the next
// read returns — appendix C's "update the persistent object first; a Toast is never the only
// receipt". A fresh module load (one per `serve-built.mjs` process) starts from this state.
const state = {
  withdrawn: new Map(),
  corrections: new Map(),
};

const MSIC_REVISION_1 = rec({
  record_id: KN.recordMsic, revision_n: 1, knowledge_key: "msic", value: "46900",
  basis: "the SSM profile the client sent", asserted_by: "644-user-2", asserted_by_name: "Tan Wei Ming",
  state: "superseded", superseded_by: `${KN.recordMsic}-rev2`, superseded_at: "2026-09-12T02:00:00.000Z",
  recorded_at: "2026-09-01T01:00:00.000Z", knowledge_version: "3",
  key_description: "Five-digit MSIC industry code.",
});

function msicLive() {
  const correction = state.corrections.get(KN.recordMsic);
  const base = rec({
    record_id: KN.recordMsic, revision_n: 2, knowledge_key: "msic",
    value: correction?.value ?? "47211",
    revision_kind: "correction",
    revision_reason: correction?.reason ?? "the client corrected the code by email on 12 Sep",
    supersedes_id: `${KN.recordMsic}-rev1`,
    key_description: "Five-digit MSIC industry code.",
  });
  if (correction) {
    base.revision_n = 3;
    base.revision_id = `${KN.recordMsic}-rev3`;
    base.knowledge_version = "11";
  }
  const withdrawal = state.withdrawn.get(KN.recordMsic);
  if (withdrawal) {
    return {
      ...base,
      revision_n: base.revision_n + 1,
      revision_id: `${KN.recordMsic}-rev-withdrawn`,
      revision_kind: "withdrawal",
      state: "withdrawn",
      revision_reason: withdrawal,
    };
  }
  return base;
}

const INFERRED = rec({
  record_id: KN.recordInferred, knowledge_key: "turnover_band", value: "RM1M-5M",
  source_kind: "model_inference", trust: "inferred",
  basis: "Clara read three months of sales and estimated the band",
  key_description: "The annual turnover BAND, as the interview records it.",
});

const FIRM_DEFAULT = rec({
  record_id: KN.recordFirmDefault, knowledge_key: "coa_seed_decision", kind: "preference",
  scope_kind: "firm", client_id: null, value: { seed: "lhdn_mpers_standard" },
  basis: "the firm standardises on the LHDN-aligned chart",
  key_description: "The chart-of-accounts seed decision the interview recorded.",
});

const CONFLICT_A = rec({
  record_id: KN.recordConflictA, knowledge_key: "sst_regime", value: "service_tax",
  basis: "the client's SST certificate", applies_when: {}, applies_when_digest: "d-empty",
  key_description: "The SST registration status the interview recorded.",
});
const CONFLICT_B = rec({
  record_id: KN.recordConflictB, knowledge_key: "sst_regime", value: "not_registered",
  basis: "the client's own letter of 2 September", applies_when: { segment: "digital" },
  applies_when_digest: "d-digital",
  key_description: "The SST registration status the interview recorded.",
});

const LEGACY = rec({
  record_id: KN.legacyFact, knowledge_key: "entity_type", value: "sdn_bhd",
  source_kind: "legacy_client_fact", basis: "the SSM certificate", editable: false,
  basis_kind: "owner_instruction",
  key_description: "The client's legal form.",
});

const SOURCE_GONE = rec({
  record_id: KN.recordSourceGone, client_id: KN.clientSourceGone, knowledge_key: "msic",
  value: "46900", kind: "extracted_fact", source_kind: "document_extraction", trust: "extracted",
  source: { document_id: KN.missingDocument, extraction_id: "644-ext-1", region_id: null,
    field_path: "entity.msic", work_id: null },
  basis: "read from the SSM profile the firm holds",
  key_description: "Five-digit MSIC industry code.",
});

function registerFor(clientId) {
  if (clientId === KN.clientOk) {
    return {
      client_id: clientId,
      knowledge_version: "11",
      records: [msicLive(), INFERRED, FIRM_DEFAULT, CONFLICT_A, CONFLICT_B, LEGACY],
    };
  }
  if (clientId === KN.clientSourceGone) {
    return { client_id: clientId, knowledge_version: "5", records: [SOURCE_GONE] };
  }
  return { client_id: clientId, knowledge_version: 0, records: [] };
}

function recordById(id) {
  if (id === KN.recordMsic) return msicLive();
  if (id === KN.recordInferred) return INFERRED;
  if (id === KN.recordFirmDefault) return FIRM_DEFAULT;
  if (id === KN.recordConflictA) return CONFLICT_A;
  if (id === KN.recordConflictB) return CONFLICT_B;
  if (id === KN.recordSourceGone) return SOURCE_GONE;
  return null;
}

function historyFor(id) {
  if (id === KN.recordMsic) {
    const live = msicLive();
    const middle = state.corrections.has(KN.recordMsic)
      ? [rec({ record_id: KN.recordMsic, revision_n: 2, knowledge_key: "msic", value: "47211",
          revision_kind: "correction", revision_reason: "the client corrected the code by email on 12 Sep",
          supersedes_id: `${KN.recordMsic}-rev1`, state: "superseded" })]
      : [];
    return [MSIC_REVISION_1, ...middle, live];
  }
  const one = recordById(id);
  return one ? [one] : [];
}

const KEY_DEFINITIONS = {
  msic: { knowledge_key: "msic", kind: "assertion", value_shape: "string", validated_against: "format_only",
    allowed_values: null, description: "Five-digit MSIC industry code. Format-only: no official registry is checked.",
    authority_bearing: false },
  turnover_band: { knowledge_key: "turnover_band", kind: "assertion", value_shape: "string",
    validated_against: "enum:TURNOVER_BANDS_V1",
    allowed_values: ["<RM1M", "RM1M-5M", "RM5M-25M", "RM25M-100M", "RM100M+"],
    description: "The annual turnover BAND, as the interview records it.", authority_bearing: false },
  coa_seed_decision: { knowledge_key: "coa_seed_decision", kind: "preference", value_shape: "object",
    validated_against: "shape_only", allowed_values: null,
    description: "The chart-of-accounts seed decision the interview recorded.", authority_bearing: false },
  sst_regime: { knowledge_key: "sst_regime", kind: "assertion", value_shape: "string",
    validated_against: "enum:SST_REGIMES_V1",
    allowed_values: ["not_registered", "sales_tax", "service_tax", "both"],
    description: "The SST registration status the interview recorded.", authority_bearing: false },
  entity_type: { knowledge_key: "entity_type", kind: "assertion", value_shape: "string",
    validated_against: "enum:ENTITY_TYPES_V2", allowed_values: ["sdn_bhd", "llp"],
    description: "The client's legal form.", authority_bearing: false },
};

function refusalBody(message) {
  return { message };
}

/** The PostgREST half. Returns true when it answered, false to fall through — the ONE hook
 *  `serve-built.mjs` consults, and every branch below is scoped to a #644 id. */
export async function handleKnowledgeSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");
  const eq = (v) => (v && v.startsWith("eq.") ? v.slice(3) : null);

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = eq(idFilter);
    if (id && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, id)) {
      sendJson(response, 200, [clientRow(id)], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = eq(clientFilter);
    if (client && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) {
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  // THE INACCESSIBLE-SOURCE FACE'S OWN MECHANISM. The record NAMES this document; the documents
  // read returns an empty set for it, which is exactly what RLS does when the row is no longer
  // visible. The surface must say "named but unreadable", never fall silent.
  if (request.method === "GET" && path === "/rest/v1/documents") {
    const id = eq(idFilter);
    if (id === KN.missingDocument) {
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  if (verb === "list_client_knowledge") {
    const body = await readJson(request);
    const client = body?.p_client ?? null;
    if (client === KN.clientDenied) {
      sendJson(response, 403, refusalBody("permission denied for function list_client_knowledge"), cors);
      return true;
    }
    if (client && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) {
      sendJson(response, 200, registerFor(client), cors);
      return true;
    }
    return false;
  }

  if (verb === "get_knowledge_record") {
    const body = await readJson(request);
    const row = recordById(body?.p_record ?? null);
    if (!row) return false;
    sendJson(response, 200, {
      record: row,
      key: KEY_DEFINITIONS[row.knowledge_key],
      revision_count: historyFor(row.record_id).length,
    }, cors);
    return true;
  }

  if (verb === "get_knowledge_history") {
    const body = await readJson(request);
    const id = body?.p_record ?? null;
    if (!recordById(id)) return false;
    sendJson(response, 200, { record_id: id, revisions: historyFor(id) }, cors);
    return true;
  }

  if (verb === "correct_knowledge") {
    const body = await readJson(request);
    const id = body?.p_record ?? null;
    if (!recordById(id)) return false;
    if (id === KN.recordInferred) {
      // A REAL GOVERNED REFUSAL, in the DB's own words: this fixture's inferred record is a
      // stand-in for the trust wall, so the walk can prove a refusal renders verbatim rather
      // than as a generic red toast.
      sendJson(response, 400, {
        code: "CLR10",
        message: "knowledge key turnover_band is authority-bearing; a model_inference source is inferred and cannot become one",
        details: '{"reason":"knowledge_trust_insufficient"}',
      }, cors);
      return true;
    }
    state.corrections.set(id, { value: body?.p_value, reason: body?.p_reason });
    sendJson(response, 200, { status: "corrected", record_id: id, revision_id: `${id}-rev3`, revision_n: 3 }, cors);
    return true;
  }

  if (verb === "withdraw_knowledge") {
    const body = await readJson(request);
    const id = body?.p_record ?? null;
    if (!recordById(id)) return false;
    state.withdrawn.set(id, String(body?.p_reason ?? ""));
    sendJson(response, 200, { status: "withdrawn", record_id: id, revision_n: 4 }, cors);
    return true;
  }

  return false;
}
