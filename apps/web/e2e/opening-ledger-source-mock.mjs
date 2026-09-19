// #656's mock lane — the FIRST fixture set for `?tab=opening`. A file-disjoint sibling of the
// other lane mocks, consulted by `serve-built.mjs` through TWO hooks (one Supabase, one runtime),
// exactly as those modules' own headers describe for themselves. Every id below is distinct from
// every other lane's and every handler is ID-SCOPED, so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the tie-document picker and its `Field` composition, the runtime wire and
// its typed outcomes, the target panel's provenance and coverage, the four tie gates, the dialog
// wrappers. What is faked is PostgREST and the runtime route, INCLUDING the named refusal this
// walk needs. So this walk proves the JOURNEY and what the surface does with each answer; it
// proves NOTHING about whether Postgres would raise that refusal, or whether the producer would
// read that document. Those live in `packages/db/tests/opening-ledger-source.test.mjs` and
// `packages/runtime/tests/opening-ledger-source-e2e.mjs`, which run against real Postgres.
//
// WHY THIS LANE DISPATCHES ABOVE `home-board-mock.mjs` (DECISIONS §6.1, #657's ruling made
// general): that module's `EMPTY_RELATIONS` answers `/rest/v1/opening_seed_registry` AND
// `/rest/v1/coa_accounts` with an honest `[]` for EVERY subject, unconditionally. A lane
// dispatched below it would find its own basis missing and its chart empty — silently, as an
// empty page rather than an error. The same note sits at the hook site in `serve-built.mjs`.

import { matchVerb, readCachedJson as readJson } from "./mock-dispatch.mjs";

export const P656 = {
  firmId: "65656565-6565-4565-8565-656565656565",
  // A client id no other lane mints (the client-id census in e2e-fixture-ownership.test.ts).
  clientId: "656c656c-6565-4565-8565-656565656565",
  planId: "6501a201-6565-4565-8565-656565656565",
  seedId: "65ee0001-6565-4565-8565-656565656565",
  documentId: "65d0c001-6565-4565-8565-656565656565",
  sha256: "65a6f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c",
  extractionId: "65e47001-6565-4565-8565-656565656565",
  asOf: "2026-01-01",
};

/** The printed trial balance this lane's document states. Five lines, DR 130,000.00 = CR
 *  130,000.00 — the same figures the runtime's own e2e reads off the measured geometry, so a
 *  reader comparing the two sees one fixture rather than two. */
const LINES = [
  { key: "r:65f1", code: "310-000", label: "CASH AT BANK", dr: 10_500_000, cr: 0, region: "65f10001-6565-4565-8565-656565656565" },
  { key: "r:65f2", code: "400-000", label: "TRADE DEBTORS", dr: 2_500_000, cr: 0, region: "65f10002-6565-4565-8565-656565656565" },
  { key: "r:65f3", code: "500-000", label: "TRADE CREDITORS", dr: 0, cr: 2_425_203, region: "65f10003-6565-4565-8565-656565656565" },
  { key: "r:65f4", code: "900-RE", label: "RETAINED EARNINGS", dr: 0, cr: 6_574_797, region: "65f10004-6565-4565-8565-656565656565" },
  { key: "r:65f5", code: "910-000", label: "SHARE CAPITAL", dr: 0, cr: 4_000_000, region: "65f10005-6565-4565-8565-656565656565" },
];

const ACCOUNTS = LINES.map((l) => ({
  account_code: l.code, name: l.label,
  account_type: l.code.startsWith("9") ? "equity" : l.code.startsWith("5") ? "liability" : "asset",
  account_class: null, special_acc_type: l.code === "900-RE" ? "retained_earnings" : null, is_active: true,
})).concat([{
  account_code: "900-OBE", name: "Opening Balance Equity", account_type: "equity",
  account_class: null, special_acc_type: "opening_balance_equity", is_active: true,
}]);

/** MUTABLE lane state. The walk drives a real journey — create a basis, read the document, see the
 *  targets — so the fixture has to move the way the database would. Reset between specs. */
const state = {
  seedCreated: false,
  parsed: false,
  /** The next answer `POST /api/opening/parse-targets` gives. The walk flips it to exercise the
   *  refusal branch, which is the branch this whole slice exists for. */
  parseAnswer: "ok",
};

export function resetP656() {
  state.seedCreated = false;
  state.parsed = false;
  state.parseAnswer = "ok";
}

export function p656SetParseAnswer(answer) {
  state.parseAnswer = answer;
}

/** The FIVE rpc verbs this lane's dispatch recognises — the allow-list `matchVerb` guards the
 *  `readJson` call site with (#722's idiom). Exported so a unit can drive an unrecognised verb and
 *  assert the request body is left untouched. */
export const P656_RPC_VERBS = new Set([
  "create_opening_seed", "record_opening_target", "get_opening_dryrun",
  "approve_opening_seed", "cancel_opening_seed",
  // THE FIXTURE CONTROL (fix-round finding A3). `serve-built.mjs` is ONE server for the whole run,
  // so this lane's state survives from cell to cell — and `state.seedCreated` is exactly the fact
  // every cell starts by changing. Without a reset, the FIRST cell created the basis and every
  // later cell waited fifty seconds for a "Create opening seed" trigger that was gone, which is
  // what made six of this walk's seven legs fail. Each cell now resets first, through a verb
  // SCOPED to this lane's own client id — a control that answered for anybody would be able to
  // reset a sibling lane's fixture, which is what `e2e-fixture-ownership.test.ts` exists to
  // prevent. Same shape as `reset_document_correction_fixture` next door.
  "reset_opening_ledger_source_fixture",
]);

const CLIENT = () => ({
  id: P656.clientId,
  name: "P656 OPENING FIXTURE",
  status: "onboarding",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

const SEED = () => ({
  id: P656.seedId, firm_id: P656.firmId, client_id: P656.clientId, plan_id: P656.planId,
  as_of: P656.asOf, state: "open",
  tie_document_id: P656.documentId, tie_document_sha256: P656.sha256,
  created_by: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-01-02T00:00:00.000Z", batch_n: 0,
  finalized_at: null, finalized_by: null, tie_asserted_at: null, through_event_seq: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
});

const TARGETS = () => (state.parsed ? LINES.map((l, i) => ({
  id: `657a000${i + 1}-6565-4565-8565-656565656565`,
  firm_id: P656.firmId, client_id: P656.clientId, seed_id: P656.seedId,
  line_key: l.key, account_code: l.code, source_label: l.label,
  debit_cents: l.dr, credit_cents: l.cr,
  provenance_kind: "document", document_id: P656.documentId, source_sha256: P656.sha256,
  extraction_ref: { extraction_id: P656.extractionId, region_id: l.region },
  entered_by: null, created_at: "2026-01-03T00:00:00.000Z",
})) : []);

/** `clara.get_opening_dryrun`'s envelope. With nothing read, gate 1 fails (no targets). Once the
 *  document is read, the targets stand but NOTHING has been drafted against them, so every delta
 *  is off — which is the honest state of a basis whose lines have been read and not yet posted,
 *  and exactly the state that must NOT paint a pass. */
const DRYRUN = () => ({
  seed_id: P656.seedId, client_id: P656.clientId, as_of: P656.asOf, state: "open",
  obe_net_cents: 0,
  deltas: state.parsed
    ? LINES.map((l) => ({
      account_code: l.code,
      target_debit: l.dr, target_credit: l.cr,
      actual_debit: 0, actual_credit: 0,
      delta_debit: -l.dr, delta_credit: -l.cr,
    }))
    : [],
  unmapped_labels: [],
  missing_must_asks: [],
});

const NAMED_REFUSAL =
  "2 opening_tb.line region(s) did not parse: 65f10003-6565-4565-8565-656565656565, "
  + "65f10004-6565-4565-8565-656565656565";

const EMPTY_RELATIONS = new Set([
  "/rest/v1/opening_items",
  "/rest/v1/counterparties",
  "/rest/v1/journal_entries",
  "/rest/v1/lint_findings",
]);

/**
 * The Supabase half. Returns `true` when it answered, `false` to fall through — every branch is
 * gated on this lane's own ids, so it answers for nobody else.
 */
export async function handleP656Supabase(request, response, path, url, sendJson, cors) {
  const eq = (param) => {
    const raw = url.searchParams.get(param);
    return raw?.startsWith("eq.") ? raw.slice(3) : null;
  };
  const mine = () => eq("client_id") === P656.clientId || eq("id") === P656.clientId;
  // …and the reads this lane makes that are scoped by the BASIS rather than by the client. The
  // workbench's combined read fetches `opening_items` with `seed_id=eq.<seed>` and NOTHING else
  // (`lib/registers/opening.ts:44-51`), so a `client_id`-only guard never matched it: the request
  // fell through to a 404, `useAsyncRead` classified it `not_found`, and the whole tied-basis
  // surface — the document panel, the read action, the items panel — never rendered at all. That
  // is the defect that made six of this walk's seven legs fail (fix-round finding A3); it was in
  // the FIXTURE, not in the app, and this is the one-line guard it needed.
  const mineSeed = () => eq("seed_id") === P656.seedId || eq("bound_scope_id") === P656.seedId;

  // EVERY handler below opens on its own path and then GUARDS with an explicit `return false;`
  // fall-through on a subject this lane did not mint. That shape is what `e2e-fixture-ownership.
  // test.ts`'s N5 census reads, and it is also what keeps this lane from answering another walk's
  // read with this lane's fixture.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (eq("id") !== P656.clientId) return false;
    sendJson(response, 200, [CLIENT()], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/opening_seed_registry") {
    if (!mine()) return false;
    sendJson(response, 200, state.seedCreated ? [SEED()] : [], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/opening_tb_targets") {
    if (eq("seed_id") !== P656.seedId) return false;
    sendJson(response, 200, TARGETS(), cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/onboarding_plans") {
    if (!mine()) return false;
    sendJson(response, 200, [{
      id: P656.planId, state: "open", revision_token: "65rev0001",
      created_at: "2026-01-01T00:00:00.000Z",
    }], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/onboarding_plan_items") {
    if (eq("plan_id") !== P656.planId) return false;
    // No opening-position item: the gate falls to its third, honest branch (neither
    // first-year-zero nor deferred), which is the one that offers Create.
    sendJson(response, 200, [], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (!mine()) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }
  // The tie-document picker's two reads.
  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    if (!mine()) return false;
    sendJson(response, 200, [{
      id: "65f11001-6565-4565-8565-656565656565", document_id: P656.documentId,
      client_id: P656.clientId, filed_at: "2026-01-02T00:00:00.000Z",
      filed_by: "11111111-1111-1111-1111-111111111111", basis: "human",
      retired_at: null, retirement_reason: null, revision_token: "65fil0001",
    }], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/documents") {
    if (!(url.searchParams.get("id") ?? "").includes(P656.documentId)) return false;
    sendJson(response, 200, [{
      id: P656.documentId, sha256: P656.sha256, original_filename: "TB-2025-P656.pdf",
      mime_type: "application/pdf", byte_size: 40960, storage_path: "p656/tb.pdf",
      uploaded_by: "11111111-1111-1111-1111-111111111111",
      created_at: "2026-01-02T00:00:00.000Z", bytes_verified_at: "2026-01-02T00:00:01.000Z",
      page_count: 1, extraction_status: "done", document_kind: "opening_balance_doc",
      financial_date: null, retention_state: "unanchored", retain_until: null,
      retention_basis: null, legal_hold: false, legal_hold_reason: null,
    }], cors);
    return true;
  }
  // The keyed-resolution read is scoped by the SEED, not by the client — `loadOpeningKeyedResolution`
  // filters on `bound_scope_id` (lib/registers/opening.ts:180). A tied basis has none, and saying
  // so is what lets the workbench settle instead of hanging on an unanswered read.
  if (request.method === "GET" && path === "/rest/v1/client_resolutions") {
    if (eq("bound_scope_id") !== P656.seedId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }
  // The other reads this tab makes that this lane deliberately answers EMPTY for its own client,
  // and falls through for everybody else's.
  if (request.method === "GET" && EMPTY_RELATIONS.has(path) && (mine() || mineSeed())) {
    sendJson(response, 200, [], cors);
    return true;
  }

  // --- the governed writers, each scoped to this lane's own ids ------------------------------
  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(P656_RPC_VERBS, verb)) return false;
  const body = await readJson(request);

  if (verb === "reset_opening_ledger_source_fixture") {
    if (body?.p_client !== P656.clientId) return false;
    resetP656();
    sendJson(response, 200, { ok: true }, cors);
    return true;
  }
  if (verb === "create_opening_seed") {
    if (body?.p_client !== P656.clientId) return false;
    state.seedCreated = true;
    sendJson(response, 200, { seed_id: P656.seedId, batch_n: 0 }, cors);
    return true;
  }
  if (verb === "get_opening_dryrun") {
    if (body?.p_seed !== P656.seedId) return false;
    sendJson(response, 200, DRYRUN(), cors);
    return true;
  }
  if (verb === "record_opening_target") {
    if (body?.p_seed !== P656.seedId) return false;
    // THE TIED-BASIS WALL, answered the way the database answers it. This verb is reachable on
    // this lane only if a surface offers the keyed door on a tied basis — which is exactly the
    // defect the panel split exists to prevent, so the mock refuses rather than succeeding.
    sendJson(response, 400, {
      code: "CLR31", message: "a parsed target writer is required for a tied opening seed",
      details: JSON.stringify({ reason: "parsed_target_writer_required" }), hint: null,
    }, cors);
    return true;
  }
  if (verb === "approve_opening_seed") {
    if (body?.p_seed !== P656.seedId) return false;
    // The basis has targets and no drafted items, so the tie cannot hold — and the refusal is
    // the DB's own token, which the strip's gates already name.
    sendJson(response, 400, {
      code: "CLR31", message: "opening trial balance does not tie to the target",
      details: JSON.stringify({ reason: "tie_mismatch" }), hint: null,
    }, cors);
    return true;
  }
  if (verb === "cancel_opening_seed") {
    if (body?.p_seed !== P656.seedId) return false;
    state.seedCreated = false;
    state.parsed = false;
    sendJson(response, 200, { seed_id: P656.seedId, state: "cancelled" }, cors);
    return true;
  }
  return false;
}

/**
 * The runtime half — ONE route, `POST /api/opening/parse-targets`, scoped to this lane's seed.
 * It answers every branch the surface renders, chosen by `state.parseAnswer`, so the walk can see
 * the named refusal and the successful read on the same built bundle.
 */
export async function handleP656Runtime(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/opening/parse-targets") return false;
  const body = await readJson(request);
  if (body?.seedId !== P656.seedId) return false;

  const send = (status, payload) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (state.parseAnswer === "refused") {
    send(422, { status: "unparseable", reason: NAMED_REFUSAL });
    return true;
  }
  if (state.parseAnswer === "no_lines") {
    send(422, { status: "unparseable", reason: "no_opening_tb_lines" });
    return true;
  }
  state.parsed = true;
  send(202, { status: "parsed", lines: LINES.length });
  return true;
}
