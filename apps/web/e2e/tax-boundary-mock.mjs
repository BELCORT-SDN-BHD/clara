// #627's mock lane — a file-disjoint sibling of `bank-close-registers-mock.mjs` and the
// other lane mocks, consulted by `serve-built.mjs` through ONE hook, exactly as those modules'
// own headers describe for themselves. Every id below is distinct from theirs and every
// handler is ID-SCOPED, so no walk can starve another's fixtures (e2e-fixture-ownership.test.ts
// enforces this mechanically — this file's declaration row is `{ unscopeable: [], debt: [] }`).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, and every line of client
// code under test are REAL — `TaxWorkbenchPage`, `SstWatchSection`'s five-state branching,
// `classifyTaxReadOutcome`, `CapabilityBoundarySection`'s hash-focus effect. What is faked is
// PostgREST: its reads, including the 403/500 this walk needs for the denied/technical-failure
// states. So this walk proves the JOURNEY and what the surface does with each outcome; it
// proves NOTHING about whether Postgres would actually return a 403 here — `list_review_queue`'s
// own viewer floor is exercised in the db battery, not here.
//
// FIVE CLIENTS, ONE PER STATE this ticket's own five/six-state model distinguishes (not-enabled
// is a static note with no fetch at all, so it needs no client of its own):
//   ok      — a real SST watch with one open row, both cents figures and the effective-dated
//             crossing/due columns.
//   empty   — a real read, zero watch rows for this client (a successful "no data").
//   stale   — a real read, `stale_evaluator: true` (the evaluator has not run in >48h).
//   denied  — `list_review_queue` answers 403 (an RLS/grant refusal, not "no data").
//   error   — `list_review_queue` answers 500 (a genuine operational failure).

export const D4 = {
  clientOk: "d4d4d4d4-1111-4777-8777-d4d4d4d40001",
  clientEmpty: "d4d4d4d4-1111-4777-8777-d4d4d4d40002",
  clientStale: "d4d4d4d4-1111-4777-8777-d4d4d4d40003",
  clientDenied: "d4d4d4d4-1111-4777-8777-d4d4d4d40004",
  clientError: "d4d4d4d4-1111-4777-8777-d4d4d4d40005",
};

const CLIENT_NAMES = {
  [D4.clientOk]: "D4 Tax OK Fixture",
  [D4.clientEmpty]: "D4 Tax Empty Fixture",
  [D4.clientStale]: "D4 Tax Stale Fixture",
  [D4.clientDenied]: "D4 Tax Denied Fixture",
  [D4.clientError]: "D4 Tax Error Fixture",
};

function clientRow(id) {
  return {
    id,
    name: CLIENT_NAMES[id],
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  };
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

const OK_ENVELOPE = () => ({
  watermark: "d4-ok",
  counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: {
    stale_evaluator: false,
    clients: [{
      client_id: D4.clientOk, service_group: "digital_services", state: "crossed",
      confirmed_included_cents: 55_000_000, unknown_or_mixed_cents: 1_200_000,
      screening_proxy_cents: 56_200_000, earliest_crossing_month: "2026-06",
      application_due: "2026-07-31", future_method_status: "not_assessed",
    }],
  },
  rows: [{
    row_kind: "compliance_watch", section: "needs_you", client_id: D4.clientOk, counterparty_id: null,
    filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: true, high_stakes: false, aged_since: "2026-06-01T00:00:00Z",
    amount_cents: null, period: null, question_text: null, created_at: "2026-06-01T00:00:00Z",
    id: "d4-watch-ok", coding_kind: null, watch_id: "d4-watch-ok", tier: "crossed", finding_id: null,
    asset_id: null, advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
  }],
  next_cursor: null,
});

const EMPTY_ENVELOPE = () => ({
  watermark: "d4-empty",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: { stale_evaluator: false, clients: [] },
  rows: [], next_cursor: null,
});

const STALE_ENVELOPE = () => ({
  watermark: "d4-stale",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: {
    stale_evaluator: true,
    clients: [{
      client_id: D4.clientStale, service_group: "digital_services", state: "monitored",
      confirmed_included_cents: 1_000_000, unknown_or_mixed_cents: 0,
      screening_proxy_cents: 1_000_000, earliest_crossing_month: null,
      application_due: null, future_method_status: "not_assessed",
    }],
  },
  rows: [], next_cursor: null,
});

/** The response body PostgREST/PostgREST-rpc sends on a real refusal — no `code` field means
 *  neither `parseClrCode` finds a CLR match, so `lib/doors.ts`/`lib/read.ts` classify purely by
 *  HTTP status: 403 -> "forbidden", 500 -> "server_error". */
function refusalBody(message) {
  return { message };
}

/** The PostgREST half. Returns true when it answered, false to fall through — the ONE hook
 *  `serve-built.mjs` consults, and every branch below is scoped to a D4 id. */
export async function handleD4Supabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, id)) {
      sendJson(response, 200, [clientRow(id)], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client && Object.prototype.hasOwnProperty.call(CLIENT_NAMES, client)) {
      // Empty is a real, honest answer — this walk asserts nothing about the turnover-
      // classification control's own account list, only that it does not crash the page.
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  if (verb === "list_review_queue") {
    const body = await readJson(request);
    const client = body?.p_scope?.client_id ?? null;
    if (client === D4.clientOk) { sendJson(response, 200, OK_ENVELOPE(), cors); return true; }
    if (client === D4.clientEmpty) { sendJson(response, 200, EMPTY_ENVELOPE(), cors); return true; }
    if (client === D4.clientStale) { sendJson(response, 200, STALE_ENVELOPE(), cors); return true; }
    if (client === D4.clientDenied) {
      sendJson(response, 403, refusalBody("permission denied for function list_review_queue"), cors);
      return true;
    }
    if (client === D4.clientError) {
      sendJson(response, 500, refusalBody("compliance_watches evaluator crashed"), cors);
      return true;
    }
    return false;
  }

  return false;
}
