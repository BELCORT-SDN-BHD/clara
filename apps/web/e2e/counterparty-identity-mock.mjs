// #647's mock lane (the counterparty-identity walk) — a file-disjoint sibling of the other lane
// mocks, consulted by `serve-built.mjs` through ONE hook, exactly as those modules' own headers
// describe. Every id below is distinct from theirs and every handler is ID-SCOPED, so no walk can
// starve another's fixtures (e2e-fixture-ownership.test.ts enforces this mechanically — this
// file's declaration row is `{ unscopeable: [], debt: [] }`).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL: `ClientIdentitySection`, `CounterpartyIdentityPanel`, the shared
// `KnowledgeSourceBlock` reused verbatim from C13, `lib/registers/counterparty-identity.ts`'s
// three read wrappers and the two door wrappers, `useAsyncRead`'s reload-after-write and the door
// dialog's single-fire confirm. What is faked is PostgREST — including the 403 the denied face
// needs and the empty `documents` read the inaccessible-source face needs. So this walk proves
// the JOURNEY and what the surface does with each outcome; the doors' own floors, refusals,
// provenance walls and revision algebra are proven in
// packages/db/tests/counterparty-identity.test.mjs against a real Postgres under real
// least-privileged roles, not here.
//
// FOUR CLIENTS, ONE PER READ OUTCOME the surface must distinguish:
//   ok        — a real identity estate: a live vendor with four differently-sourced aliases, a
//               correction history, a merge lineage and two stated conflicts; a customer of the
//               same name; a merged party; and a pre-lineage legacy merge.
//   empty     — a real read, zero counterparties and zero identifiers (a successful empty).
//   denied    — `list_counterparty_identity` answers 403 (an RLS/grant refusal, not "no data").
//   vendorOnly — one VENDOR and nothing else, so the walk can prove that filtering to Customers
//               is a different sentence from an empty register.

export const CI = {
  clientOk: "647aa647-1111-4777-8777-647aa6470001",
  clientEmpty: "647aa647-1111-4777-8777-647aa6470002",
  clientDenied: "647aa647-1111-4777-8777-647aa6470003",
  clientVendorOnly: "647aa647-1111-4777-8777-647aa6470004",
  cpAcme: "647bb647-2222-4777-8777-647bb6470001",
  cpAcmeCustomer: "647bb647-2222-4777-8777-647bb6470002",
  cpMerged: "647bb647-2222-4777-8777-647bb6470003",
  cpLegacyMerged: "647bb647-2222-4777-8777-647bb6470004",
  cpVendorOnly: "647bb647-2222-4777-8777-647bb6470005",
  aliasHuman: "647cc647-3333-4777-8777-647cc6470001",
  aliasExtracted: "647cc647-3333-4777-8777-647cc6470002",
  aliasAgent: "647cc647-3333-4777-8777-647cc6470003",
  aliasLegacy: "647cc647-3333-4777-8777-647cc6470004",
  identifierSsm: "647dd647-4444-4777-8777-647dd6470001",
  missingDocument: "647ee647-5555-4777-8777-647ee6470001",
  siblingClient: "647aa647-1111-4777-8777-647aa6470009",
};

const CLIENT_NAMES = {
  [CI.clientOk]: "647 Identity OK Fixture",
  [CI.clientEmpty]: "647 Identity Empty Fixture",
  [CI.clientDenied]: "647 Identity Denied Fixture",
  [CI.clientVendorOnly]: "647 Identity Vendor-Only Fixture",
};

const AS_OF = "2026-09-16T10:30:00";

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

const NO_SOURCE = { document_id: null, extraction_id: null, region_id: null, field_path: null };

// MUTABLE, deliberately: the walk's Correct press must produce a PERSISTENT outcome the NEXT read
// returns — appendix C's "update the persistent object first; a Toast is never the only receipt".
// A fresh module load (one per `serve-built.mjs` process) starts from this state.
const state = {
  registrationNo: "201801012345",
  tin: "C24680135790",
  retiredAliases: new Set(),
  extraAliases: [],
  extraIdentifiers: [],
  revisions: [],
  // The walk's denied/failed faces are driven by ids, never by a control endpoint: a lane that
  // mutates shared state for any body at all is the exact shape the ownership census forbids.
};

function alias(over) {
  return {
    id: over.id,
    alias_display: over.alias_display,
    alias_normalized: over.alias_display.toLowerCase().replace(/[^a-z0-9]/g, ""),
    kind: "vendor",
    origin: "human",
    recorded_via: "human_ui",
    recorded_basis: null,
    created_by: "647-user-1",
    created_by_name: "Aisyah Rahman",
    created_at: "2026-02-01T02:00:00.000Z",
    retired_at: null,
    source: NO_SOURCE,
    ...over,
  };
}

const BASE_ALIASES = [
  alias({
    id: CI.aliasHuman, alias_display: "ACME TRADING",
    origin: "trade_name", recorded_via: "human_ui",
    recorded_basis: "the delivery orders are signed under the trade name",
  }),
  alias({
    id: CI.aliasExtracted, alias_display: "ACME SDN. BHD.",
    origin: "extracted", recorded_via: "human_ui",
    recorded_basis: "read off the letterhead on INV-4471",
    created_at: "2026-03-04T02:00:00.000Z",
    // THE INACCESSIBLE-SOURCE FACE'S OWN MECHANISM: the alias NAMES this document; the documents
    // read returns an empty set for it, which is exactly what RLS does when the row stops being
    // visible. The surface must say "named but unreadable", never fall silent.
    source: {
      document_id: CI.missingDocument, extraction_id: "647-ext-1",
      region_id: "647-rgn-1", field_path: "invoice.vendor_name",
    },
  }),
  alias({
    id: CI.aliasAgent, alias_display: "ACME HOLDINGS",
    origin: "agent_proposed", recorded_via: "agent",
    recorded_basis: "three bank narrations spell it this way",
    created_by: "647-agent-1", created_by_name: "Clara",
    created_at: "2026-04-09T02:00:00.000Z",
  }),
  alias({
    id: CI.aliasLegacy, alias_display: "ACME ENTERPRISE",
    origin: "former_name", recorded_via: "legacy_unknown", recorded_basis: null,
    created_at: "2025-11-20T02:00:00.000Z",
  }),
];

const BASE_REVISIONS = [
  {
    revision_n: 4, act: "merged",
    before_state: { merged_into: null },
    after_state: { merged_into: CI.cpAcme },
    basis: "merged into Acme Sdn Bhd: same SSM, two spellings",
    changed_by: "647-user-1", changed_by_name: "Aisyah Rahman", recorded_via: "human_ui",
    changed_at: "2026-05-02T02:00:00.000Z", alias_id: null, source: NO_SOURCE,
  },
  {
    revision_n: 3, act: "identifiers_set",
    before_state: { registration_no: null, registration_normalized: null, tin: null },
    after_state: { registration_no: "201801012345", registration_normalized: "201801012345", tin: "C24680135790" },
    basis: "identifiers corrected: registration (none) -> 201801012345, TIN (none) -> C24680135790",
    changed_by: "647-user-2", changed_by_name: "Tan Wei Ming", recorded_via: "human_ui",
    changed_at: "2026-04-01T02:00:00.000Z", alias_id: null, source: NO_SOURCE,
  },
  {
    revision_n: 2, act: "alias_added",
    before_state: {},
    after_state: { alias_id: CI.aliasAgent, alias_display: "ACME HOLDINGS", origin: "agent_proposed", kind: "vendor" },
    basis: "three bank narrations spell it this way",
    changed_by: "647-agent-1", changed_by_name: "Clara", recorded_via: "agent",
    changed_at: "2026-04-09T02:00:00.000Z", alias_id: CI.aliasAgent, source: NO_SOURCE,
  },
  {
    revision_n: 1, act: "rename",
    before_state: { name: "Acme Enterprise", name_normalized: "acmeenterprise" },
    after_state: { name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd" },
    basis: "renamed Acme Enterprise to Acme Sdn Bhd",
    changed_by: "647-user-1", changed_by_name: "Aisyah Rahman", recorded_via: "human_ui",
    changed_at: "2025-11-20T02:00:00.000Z", alias_id: null, source: NO_SOURCE,
  },
];

const MERGES = [
  {
    id: "647-merge-1", survivor_id: CI.cpAcme, survivor_name: "Acme Sdn Bhd",
    merged_id: CI.cpMerged, merged_name: "Acme Trading Enterprise",
    reason: "same SSM, two spellings", merged_by: "647-user-1", merged_by_name: "Aisyah Rahman",
    merged_at: "2026-05-02T02:00:00.000Z", alias_id: CI.aliasLegacy, unmerged_at: null,
    side: "survivor",
  },
];

const CONFLICTS = [
  {
    kind: "cross_client_identifier", identifier_kind: "tin", value: "C24680135790",
    other_client_id: CI.siblingClient, other_client_name: "Borneo Timber Holdings",
    other_counterparty_id: "647-other-cp-1", other_counterparty_name: "Acme Sdn Bhd",
    other_kind: "vendor",
  },
  {
    kind: "cross_kind_same_name", value: "Acme Sdn Bhd",
    other_client_id: CI.clientOk, other_client_name: CLIENT_NAMES[CI.clientOk],
    other_counterparty_id: CI.cpAcmeCustomer, other_counterparty_name: "Acme Sdn Bhd",
    other_kind: "customer",
  },
];

function liveAliases() {
  return [...BASE_ALIASES, ...state.extraAliases].map((a) =>
    (state.retiredAliases.has(a.id) ? { ...a, retired_at: "2026-09-16T10:00:00.000Z" } : a));
}

function revisions() {
  // Newest first, the way the read orders them, so a new revision appears at the top.
  return [...state.revisions, ...BASE_REVISIONS];
}

function identityFor(counterpartyId) {
  if (counterpartyId === CI.cpAcme) {
    return {
      client_id: CI.clientOk,
      as_of: AS_OF,
      current: {
        id: CI.cpAcme, kind: "vendor", name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd",
        registration_no: state.registrationNo, registration_normalized: state.registrationNo,
        tin: state.tin, payment_terms_days: 30, merged_into: null, retired_at: null,
        canonical_id: CI.cpAcme,
        created_at: "2025-11-01T02:00:00.000Z", updated_at: "2026-09-16T02:00:00.000Z",
      },
      aliases: liveAliases(),
      identifier_revisions: revisions(),
      merges: MERGES,
      conflicts: CONFLICTS,
    };
  }
  if (counterpartyId === CI.cpMerged) {
    return {
      client_id: CI.clientOk,
      as_of: AS_OF,
      current: {
        id: CI.cpMerged, kind: "vendor", name: "Acme Trading Enterprise",
        name_normalized: "acmetradingenterprise",
        registration_no: null, registration_normalized: null, tin: null,
        payment_terms_days: null, merged_into: CI.cpAcme, retired_at: "2026-05-02T02:00:00.000Z",
        canonical_id: CI.cpAcme,
        created_at: "2025-10-01T02:00:00.000Z", updated_at: "2026-05-02T02:00:00.000Z",
      },
      aliases: [],
      identifier_revisions: [BASE_REVISIONS[0]],
      merges: [{ ...MERGES[0], side: "merged" }],
      conflicts: [],
    };
  }
  if (counterpartyId === CI.cpVendorOnly) {
    return {
      client_id: CI.clientVendorOnly,
      as_of: AS_OF,
      current: {
        id: CI.cpVendorOnly, kind: "vendor", name: "Sole Vendor Sdn Bhd",
        name_normalized: "solevendorsdnbhd",
        registration_no: null, registration_normalized: null, tin: null,
        payment_terms_days: null, merged_into: null, retired_at: null,
        canonical_id: CI.cpVendorOnly,
        created_at: "2026-01-01T02:00:00.000Z", updated_at: "2026-01-01T02:00:00.000Z",
      },
      aliases: [],
      identifier_revisions: [],
      merges: [],
      conflicts: [],
    };
  }
  return null;
}

function listRow(over) {
  return {
    id: over.id, kind: over.kind, name: over.name,
    registration_no: null, tin: null, merged_into: null, retired_at: null, status: "live",
    alias_count: 0, live_alias_count: 0, revision_count: 0, last_revision_at: null,
    merge_count: 0, unsourced_alias_count: 0,
    ...over,
  };
}

function listFor(clientId) {
  if (clientId === CI.clientOk) {
    const live = liveAliases().filter((a) => a.retired_at === null);
    return {
      client_id: clientId, kind: null, as_of: AS_OF,
      counterparties: [
        listRow({
          id: CI.cpAcme, kind: "vendor", name: "Acme Sdn Bhd",
          registration_no: state.registrationNo, tin: state.tin,
          alias_count: liveAliases().length, live_alias_count: live.length,
          revision_count: revisions().length, last_revision_at: "2026-05-02T02:00:00.000Z",
          merge_count: 1,
          unsourced_alias_count: live.filter((a) => a.source.document_id === null).length,
        }),
        listRow({ id: CI.cpAcmeCustomer, kind: "customer", name: "Acme Sdn Bhd" }),
        listRow({
          id: CI.cpMerged, kind: "vendor", name: "Acme Trading Enterprise",
          merged_into: CI.cpAcme, retired_at: "2026-05-02T02:00:00.000Z", status: "merged",
          revision_count: 1, merge_count: 1,
        }),
        listRow({
          id: CI.cpLegacyMerged, kind: "vendor", name: "Pre-lineage Supplier",
          merged_into: CI.cpAcme, retired_at: "2024-03-02T02:00:00.000Z", status: "merged",
        }),
      ],
    };
  }
  if (clientId === CI.clientVendorOnly) {
    return {
      client_id: clientId, kind: null, as_of: AS_OF,
      counterparties: [listRow({ id: CI.cpVendorOnly, kind: "vendor", name: "Sole Vendor Sdn Bhd" })],
    };
  }
  return { client_id: clientId, kind: null, as_of: AS_OF, counterparties: [] };
}

function correctionsFor(clientId) {
  if (clientId !== CI.clientOk) return { client_id: clientId, as_of: AS_OF, merges: [] };
  return {
    client_id: clientId, as_of: AS_OF,
    merges: [
      {
        merged_id: CI.cpMerged, merged_name: "Acme Trading Enterprise", kind: "vendor",
        survivor_id: CI.cpAcme, survivor_name: "Acme Sdn Bhd",
        merged_at: "2026-05-02T02:00:00.000Z", merged_by: "647-user-1", merged_by_name: "Aisyah Rahman",
        merge_id: "647-merge-1", merge_reason: "same SSM, two spellings", alias_id: CI.aliasLegacy,
        representable: true, reason: "carrier_recorded", unmerged_at: null,
      },
      {
        merged_id: CI.cpLegacyMerged, merged_name: "Pre-lineage Supplier", kind: "vendor",
        survivor_id: CI.cpAcme, survivor_name: "Acme Sdn Bhd",
        merged_at: null, merged_by: null, merged_by_name: null,
        merge_id: null, merge_reason: null, alias_id: null,
        representable: false, reason: "legacy_no_carrier", unmerged_at: null,
      },
    ],
  };
}

function identifiersFor(clientId) {
  if (clientId !== CI.clientOk) return [];
  return [
    {
      id: CI.identifierSsm, client_id: clientId, kind: "ssm",
      value_normalized: "201801012345", added_by: "647-user-1", added_at: "2026-01-05T02:00:00.000Z",
    },
    ...state.extraIdentifiers,
  ];
}

/** The PostgREST half. Returns true when it answered, false to fall through — the ONE hook
 *  `serve-built.mjs` consults, and every branch below is scoped to a #647 id. */
export async function handleCounterpartyIdentitySupabase(request, response, path, url, sendJson, cors) {
  const eq = (v) => (v && v.startsWith("eq.") ? v.slice(3) : null);
  const idFilter = eq(url.searchParams.get("id"));
  const clientFilter = eq(url.searchParams.get("client_id"));

  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, idFilter)) {
      sendJson(response, 200, [clientRow(idFilter)], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, clientFilter)) {
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  // H-20's own read: the CLIENT's identifiers, straight off the table under RLS.
  if (request.method === "GET" && path === "/rest/v1/client_identifiers") {
    if (clientFilter && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, clientFilter)) {
      if (clientFilter === CI.clientDenied) {
        sendJson(response, 403, { message: "permission denied for table client_identifiers" }, cors);
        return true;
      }
      sendJson(response, 200, identifiersFor(clientFilter), cors);
      return true;
    }
    return false;
  }

  // The inaccessible-source face: a real read that returns nothing for a document the alias names.
  if (request.method === "GET" && path === "/rest/v1/documents") {
    if (idFilter === CI.missingDocument) {
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  // THE BODY IS READ INSIDE EACH VERB'S OWN MATCH, NEVER ONCE UP FRONT — serve-built.mjs's hook
  // comment states the rule and this lane learned it the expensive way. A single `await
  // readJson(request)` before the verb switch drains the request stream of EVERY /rest/v1/rpc/*
  // POST, including `list_client_knowledge`, which belongs to another handler further down the
  // chain: that handler then awaits a body that will never arrive, its socket never answers, and
  // after a few page loads Chromium's per-origin connection budget is exhausted and the NEXT
  // navigation hangs. Measured on the #647 rig (2026-09-16): with the up-front read, the walk's
  // fourth cell stalled in `page.goto` until the test budget expired while every cell that never
  // touches the Knowledge page passed in under ten seconds.

  if (verb === "list_counterparty_identity") {
    const body = await readJson(request);
    const client = body?.p_client ?? null;
    if (client === CI.clientDenied) {
      sendJson(response, 403, { message: "permission denied for function list_counterparty_identity" }, cors);
      return true;
    }
    if (client && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) {
      sendJson(response, 200, listFor(client), cors);
      return true;
    }
    return false;
  }

  if (verb === "list_counterparty_merge_corrections") {
    const body = await readJson(request);
    const client = body?.p_client ?? null;
    if (client === CI.clientDenied) {
      sendJson(response, 403, { message: "permission denied for function list_counterparty_merge_corrections" }, cors);
      return true;
    }
    if (client && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) {
      sendJson(response, 200, correctionsFor(client), cors);
      return true;
    }
    return false;
  }

  if (verb === "get_counterparty_identity") {
    const body = await readJson(request);
    const found = identityFor(body?.p_counterparty ?? null);
    if (!found) return false;
    sendJson(response, 200, found, cors);
    return true;
  }

  if (verb === "set_counterparty_identifiers") {
    const body = await readJson(request);
    if (body?.p_counterparty !== CI.cpAcme) return false;
    const reg = body?.p_registration_no ?? null;
    if (reg === "999999999999") {
      // A REAL GOVERNED REFUSAL, in the database's own words, so the walk can prove a refusal
      // renders verbatim in a persistent banner rather than as a generic red toast.
      sendJson(response, 400, {
        code: "CLR23",
        message: "another live counterparty of this client and kind already carries that registration number",
        details: '{"reason":"registration_collision"}',
      }, cors);
      return true;
    }
    state.registrationNo = reg;
    state.tin = body?.p_tin ?? null;
    state.revisions.unshift({
      revision_n: 5 + state.revisions.length, act: "identifiers_set",
      before_state: { registration_no: "201801012345", tin: "C24680135790" },
      after_state: { registration_no: reg, tin: body?.p_tin ?? null },
      basis: `identifiers corrected: registration 201801012345 -> ${reg ?? "(none)"}, TIN C24680135790 -> ${body?.p_tin ?? "(none)"}`,
      changed_by: "647-user-1", changed_by_name: "Aisyah Rahman", recorded_via: "human_ui",
      changed_at: "2026-09-16T10:20:00.000Z", alias_id: null, source: NO_SOURCE,
    });
    sendJson(response, 200, {
      counterparty_id: CI.cpAcme, registration_no: reg,
      registration_normalized: reg, tin: body?.p_tin ?? null,
    }, cors);
    return true;
  }

  if (verb === "retire_counterparty_alias") {
    const body = await readJson(request);
    const id = body?.p_alias ?? null;
    if (!liveAliases().some((a) => a.id === id)) return false;
    state.retiredAliases.add(id);
    state.revisions.unshift({
      revision_n: 5 + state.revisions.length, act: "alias_retired",
      before_state: { alias_id: id, retired_at: null },
      after_state: { alias_id: id, retired_at: "2026-09-16T10:25:00.000Z" },
      basis: "alias retired: ACME TRADING",
      changed_by: "647-user-1", changed_by_name: "Aisyah Rahman", recorded_via: "human_ui",
      changed_at: "2026-09-16T10:25:00.000Z", alias_id: id, source: NO_SOURCE,
    });
    sendJson(response, 200, { alias_id: id, status: "retired" }, cors);
    return true;
  }

  if (verb === "add_counterparty_alias") {
    const body = await readJson(request);
    if (body?.p_counterparty !== CI.cpAcme) return false;
    const display = String(body?.p_alias ?? "");
    const id = `647cc647-3333-4777-8777-647cc647${String(9000 + state.extraAliases.length)}`;
    state.extraAliases.push(alias({
      id, alias_display: display, origin: body?.p_origin ?? "human",
      recorded_via: "human_ui", recorded_basis: body?.p_basis ?? null,
      created_at: "2026-09-16T10:28:00.000Z",
    }));
    sendJson(response, 200, { alias_id: id, counterparty_id: CI.cpAcme }, cors);
    return true;
  }

  if (verb === "add_client_identifier") {
    const body = await readJson(request);
    const client = body?.p_client ?? null;
    if (!client || !Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) return false;
    const value = String(body?.p_value_normalized ?? "").toLowerCase().replace(/\s+/g, "");
    if (identifiersFor(client).some((r) => r.kind === body?.p_kind && r.value_normalized === value)) {
      // uq_client_identifiers_client_kind_value's typed refusal (0155:426-459), verbatim.
      sendJson(response, 400, {
        code: "CLR10",
        message: "this identifier is already recorded for this client",
        details: '{"reason":"already_recorded","class":"identifier"}',
      }, cors);
      return true;
    }
    const id = `647dd647-4444-4777-8777-647dd647${String(9000 + state.extraIdentifiers.length)}`;
    state.extraIdentifiers.push({
      id, client_id: client, kind: String(body?.p_kind ?? ""), value_normalized: value,
      added_by: "647-user-1", added_at: "2026-09-16T10:29:00.000Z",
    });
    sendJson(response, 200, { identifier_id: id }, cors);
    return true;
  }

  return false;
}
