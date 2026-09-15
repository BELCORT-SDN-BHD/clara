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
  // #654's OWN ids, deliberately disjoint from the four above. The firm-default walk
  // MUTATES module state (a promotion is a persistent outcome the next read returns),
  // and Playwright runs specs against ONE `serve-built.mjs` process — so sharing #644's
  // four clients would let this lane's promotion change what #644's thirteen walks read.
  // Three new clients, two new records, no ordering coupling.
  clientFirmSource: "654aa654-1111-4777-8777-654aa6540001",
  clientFirmPlain: "654aa654-1111-4777-8777-654aa6540002",
  clientFirmRaced: "654aa654-1111-4777-8777-654aa6540003",
  clientFirmException: "654aa654-1111-4777-8777-654aa6540004",
  recordFirmSource: "654bb654-2222-4777-8777-654bb6540001",
  recordFirmRaced: "654bb654-2222-4777-8777-654bb6540002",
  recordFirmException: "654bb654-2222-4777-8777-654bb6540003",
};

const CLIENT_NAMES = {
  [KN.clientOk]: "644 Knowledge OK Fixture",
  [KN.clientEmpty]: "644 Knowledge Empty Fixture",
  [KN.clientDenied]: "644 Knowledge Denied Fixture",
  [KN.clientSourceGone]: "644 Knowledge Source-Gone Fixture",
  [KN.clientFirmSource]: "654 Firm Promotion Source",
  [KN.clientFirmPlain]: "654 Firm Default Recipient",
  [KN.clientFirmRaced]: "654 Firm Promotion Race",
  [KN.clientFirmException]: "654 Firm Exception Holder",
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
    correctable: true,
    ...over,
  };
}

// MUTABLE, deliberately: the walk's Withdraw press must produce a PERSISTENT outcome the next
// read returns — appendix C's "update the persistent object first; a Toast is never the only
// receipt". A fresh module load (one per `serve-built.mjs` process) starts from this state.
const state = {
  withdrawn: new Map(),
  corrections: new Map(),
  // #654 — the PERSISTENT outcome of a promotion, keyed by knowledge_key. A promote is not
  // a toast: the firm register, the source client's exception pair and the recipient
  // client's own register all have to change, and they change because THIS is what the next
  // read returns.
  firmRules: new Map(),
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
      // DERIVED server-side in the real door: a withdrawal is terminal, so no control is offered.
      correctable: false,
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

// A legacy `client_facts` row is UNIONed in by clara.list_client_knowledge and is never
// shadowed: the estate still reads that table for all five carried keys, so it carries
// `authoritative: true` and the register says which of the two rows Clara acts on.
const LEGACY = rec({
  record_id: KN.legacyFact, knowledge_key: "entity_type", value: "sdn_bhd",
  source_kind: "legacy_client_fact", basis: "the SSM certificate", editable: false, correctable: false,
  authoritative: true,
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

// =============================================================================================
// #654 — THE FIRM-DEFAULT LANE (0205_firm_knowledge_defaults.sql).
// =============================================================================================

/** The client record a human promotes. A promotion carries the RECORD'S OWN VALUE firm-wide
 *  — that is what promoting means — so this is the value the firm rule ends up holding, and
 *  the basis is the CLIENT'S narrative: the string the promote dialog must never carry across
 *  into the firm rule's reason. */
const FIRM_SOURCE = rec({
  record_id: KN.recordFirmSource, client_id: KN.clientFirmSource,
  knowledge_key: "default_currency", value: "MYR",
  basis: "the client told us on the phone they present in ringgit",
  asserted_by_name: "Aisyah Rahman",
  key_description: "The default presentation currency the interview recorded.",
});

/** THE ESTABLISHED EXCEPTION: a DIFFERENT client that already recorded a different value for
 *  the same key. It is what the firm default must not touch, and what the C13 pair has to
 *  render beside the labelled firm rule. */
const FIRM_EXCEPTION = rec({
  record_id: KN.recordFirmException, client_id: KN.clientFirmException,
  knowledge_key: "default_currency", value: "USD",
  basis: "this client invoices in dollars and asked for dollar accounts",
  asserted_by_name: "Tan Wei Ming",
  key_description: "The default presentation currency the interview recorded.",
});

/** The record whose promotion RACES. `clara.capture_knowledge` at firm scope names NO client
 *  (that is what firm scope means), so the race is keyed on the KEY: another admin promoted
 *  `coa_seed_decision` between this dialog's read and its confirm, and the door answers
 *  CLR10 `knowledge_already_live`. The walk proves it renders verbatim with its code, that
 *  the dialog stays open, and that the typed reason survives. */
const FIRM_RACED = rec({
  record_id: KN.recordFirmRaced, client_id: KN.clientFirmRaced,
  knowledge_key: "coa_seed_decision", kind: "preference", value: { seed: "manual" },
  basis: "this client keeps a hand-built chart",
  key_description: "The chart-of-accounts seed decision the interview recorded.",
});

/** Every client-scope record this lane owns, so the firm register's exception list and the
 *  applicability pairing are DERIVED from one place rather than spelled twice. */
const LANE_RECORDS = [FIRM_SOURCE, FIRM_EXCEPTION, FIRM_RACED];

/** The key the race refuses, and the key the success promotes. */
const RACED_KEY = "coa_seed_decision";
const PROMOTED_KEY = "default_currency";

/** Today in Asia/Kuala_Lumpur, as `clara.get_knowledge_applicability` computes it SERVER-side.
 *  The promote dialog's effective-from default is read from here, never from the browser. */
const MYT_TODAY = "2026-09-16";

/** The firm rule a promotion produced, in `clara.list_firm_knowledge`'s own shape. */
function firmRuleRow(key, promoted) {
  const exceptions = LANE_RECORDS.filter((r) => r.knowledge_key === key).map((r) => ({
    client_id: r.client_id, client_name: CLIENT_NAMES[r.client_id],
    record_id: r.record_id, value: r.value, recorded_at: r.recorded_at,
  }));
  return {
    ...rec({
      record_id: `654-firm-${key}`, knowledge_key: key, scope_kind: "firm", client_id: null,
      kind: key === RACED_KEY ? "preference" : "assertion",
      value: promoted.value, applies_when: promoted.applies_when,
      applies_when_digest: "654-d-empty",
      effective_from: promoted.effective_from, effective_to: promoted.effective_to,
      basis: promoted.basis, asserted_by: "644-user-owner", asserted_by_name: "E2E Owner",
      knowledge_version: "21",
      key_description: "The default presentation currency the interview recorded.",
    }),
    authority: {
      promoter: "644-user-owner", promoter_name: "E2E Owner", recorded_via: "human_ui",
      recorded_at: "2026-09-16T02:00:00.000Z", reason: promoted.basis,
      required_role: "admin", promoter_role_now: "owner", promoter_active: true,
    },
    exception_count: exceptions.length,
    exceptions,
    live_work: [],
    firm_defaultable_reason:
      "The presentation currency the firm uses unless a client says otherwise.",
    in_effect_today: true,
  };
}

function firmRegister() {
  return {
    firm_id: "654ff654-5555-4777-8777-654ff6540001",
    as_of: MYT_TODAY,
    knowledge_version: state.firmRules.size === 0 ? "11" : "21",
    records: [...state.firmRules.entries()].map(([key, promoted]) => firmRuleRow(key, promoted)),
  };
}

const CURRENCY_KEY_DEF = {
  knowledge_key: PROMOTED_KEY, kind: "assertion", value_shape: "string",
  validated_against: "enum:CURRENCIES_V1", allowed_values: ["MYR", "USD", "SGD"],
  description: "The default presentation currency the interview recorded.",
  authority_bearing: false,
};

/** `clara.get_knowledge_applicability` for ONE client and ONE key. The pairing is the same
 *  key + applies_when_digest match the SQL shadow performs, so the surface cannot claim an
 *  override the register does not actually perform. */
function applicabilityFor(clientId, key) {
  const promoted = state.firmRules.get(key) ?? null;
  const firmRule = promoted ? firmRuleRow(key, promoted) : null;
  const clientRow = LANE_RECORDS.find(
    (r) => r.client_id === clientId && r.knowledge_key === key) ?? null;
  const entries = [];
  if (firmRule || clientRow) {
    entries.push({
      applies_when: {},
      applies_when_digest: "654-d-empty",
      firm_rule: firmRule,
      client_exception: clientRow,
      in_force: clientRow ? "client_exception" : firmRule ? "firm_default" : "none",
      reason: clientRow && firmRule ? "client_exception_shadows_firm_default"
        : clientRow ? "client_record_only"
          : firmRule ? "firm_default_applies" : "no_live_record",
      in_effect_today: true,
    });
  }
  return {
    client_id: clientId,
    knowledge_key: key,
    as_of: MYT_TODAY,
    knowledge_version: promoted ? "21" : "11",
    key: {
      ...(KEY_DEFINITIONS[key] ?? CURRENCY_KEY_DEF),
      // 0205's eligibility rule, as the catalog answers it: a preference or a firm-level
      // default is promotable, an identity fact (msic, entity_type, sst_regime, the keys
      // #644's own fixtures carry) is not. This is what keeps the promote control off a
      // record the door could only refuse.
      firm_defaultable: key === PROMOTED_KEY || key === RACED_KEY,
      firm_defaultable_reason: key === PROMOTED_KEY
        ? "The presentation currency the firm uses unless a client says otherwise."
        : key === RACED_KEY
          ? "A durable preference about how this firm's charts are seeded."
          : null,
    },
    applicabilities: entries,
    exception_count: firmRule ? firmRule.exception_count : 0,
    // The number the promote dialog is decided against: clients holding their OWN record
    // of this key, firm rule or no.
    client_record_count: LANE_RECORDS.filter((r) => r.knowledge_key === key).length,
    live_work: [],
  };
}

function registerFor(clientId) {
  // #654 — the promotion's persistent outcome, read back.
  if (clientId === KN.clientFirmSource || clientId === KN.clientFirmRaced
      || clientId === KN.clientFirmException) {
    // The client's OWN record still governs: the firm row it overrides is filtered out in
    // SQL (0192:1355-1363), which is exactly why the exception PAIR is a second read.
    return {
      client_id: clientId,
      knowledge_version: state.firmRules.size === 0 ? "11" : "21",
      records: LANE_RECORDS.filter((r) => r.client_id === clientId),
    };
  }
  if (clientId === KN.clientFirmPlain) {
    // No record of its own, so a promoted firm rule REACHES it — and before the promotion
    // this is a real successful-empty read.
    const promoted = state.firmRules.get(PROMOTED_KEY);
    return {
      client_id: clientId,
      knowledge_version: promoted ? "21" : "0",
      records: promoted ? [firmRuleRow(PROMOTED_KEY, promoted)] : [],
    };
  }
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
  return { client_id: clientId, knowledge_version: "0", records: [] };
}

function recordById(id) {
  if (id === KN.recordMsic) return msicLive();
  if (id === KN.recordInferred) return INFERRED;
  if (id === KN.recordFirmDefault) return FIRM_DEFAULT;
  if (id === KN.recordConflictA) return CONFLICT_A;
  if (id === KN.recordConflictB) return CONFLICT_B;
  if (id === KN.recordSourceGone) return SOURCE_GONE;
  if (id === KN.recordFirmSource) return FIRM_SOURCE;
  if (id === KN.recordFirmException) return FIRM_EXCEPTION;
  if (id === KN.recordFirmRaced) return FIRM_RACED;
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
  // #654's own key: the one this lane promotes.
  default_currency: { knowledge_key: "default_currency", kind: "assertion", value_shape: "string",
    validated_against: "enum:CURRENCIES_V1", allowed_values: ["MYR", "USD", "SGD"],
    description: "The default presentation currency the interview recorded.",
    authority_bearing: false },
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

  // #654 — THE FIRM REGISTER. `clara.list_firm_knowledge()` takes NO arguments at all, so the
  // request carries no subject to scope on; it is declared `unscopeable` in the ownership
  // census for the same reason `list_coa_templates()` is, and no other lane names this verb.
  if (verb === "list_firm_knowledge") {
    sendJson(response, 200, firmRegister(), cors);
    return true;
  }

  if (verb === "get_knowledge_applicability") {
    const body = await readJson(request);
    const client = body?.p_client ?? null;
    if (!client || !Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) return false;
    sendJson(response, 200, applicabilityFor(client, String(body?.p_knowledge_key ?? "")), cors);
    return true;
  }

  // #654 — THE PROMOTION: the FIRM-scope arm of the shipped `clara.capture_knowledge`. A
  // client-scope capture belongs to no walk in this lane and falls through, as does any key
  // outside this lane's own two.
  if (verb === "capture_knowledge") {
    const body = await readJson(request);
    if (body?.p_scope_kind !== "firm") return false;
    const key = String(body?.p_knowledge_key ?? "");
    if (key !== PROMOTED_KEY && key !== RACED_KEY) return false;
    if (key === RACED_KEY) {
      // A REAL GOVERNED REFUSAL, in the door's own words (0192's `knowledge_already_live`
      // arm, `_knowledge_capture_core`): another admin promoted this key between the
      // dialog's read and its confirm.
      sendJson(response, 400, {
        code: "CLR10",
        message: "this client already holds a live coa_seed_decision record for that applicability -- correct it instead of capturing a second one",
        details: '{"reason":"knowledge_already_live"}',
      }, cors);
      return true;
    }
    state.firmRules.set(key, {
      value: body?.p_value,
      basis: String(body?.p_basis ?? ""),
      applies_when: body?.p_applies_when ?? {},
      effective_from: body?.p_effective_from ?? null,
      effective_to: body?.p_effective_to ?? null,
    });
    sendJson(response, 200, {
      status: "captured", record_id: `654-firm-${key}`, revision_id: `654-firm-${key}-rev1`,
      knowledge_key: key, scope_kind: "firm", client_id: null,
    }, cors);
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
