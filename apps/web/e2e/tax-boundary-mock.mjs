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
// SIX CLIENTS now: the original five, one per read state this ticket's own five/six-state model
// distinguishes (not-enabled is a static note with no fetch at all, so it needs no client of its
// own), plus a SIXTH #997 adds for the receipt walk:
//   ok       — a real SST watch with one open row, both cents figures and the effective-dated
//              crossing/due columns.
//   empty    — a real read, zero watch rows for this client (a successful "no data").
//   stale    — a real read, `stale_evaluator: true` (the evaluator has not run in >48h).
//   denied   — `list_review_queue` answers 403 (an RLS/grant refusal, not "no data").
//   error    — `list_review_queue` answers 500 (a genuine operational failure).
//   receipt  — #997: an open, actionable watch whose `compliance-watch-receipt` (the
//              acknowledge/snooze/resolve disposition echo, `WatchDispositionReceipt` in
//              `components/firm/compliance-watch-affordance.tsx`) this lane never drove. #627's
//              own five clients each prove a READ state; this one proves the THREE WRITES plus
//              the disposition re-read that follows each, against this served build rather than
//              a stub. #627, the lane that once recorded owning this fixture, closed 2026-09-10
//              (ticket #997's own correction) — there is no other lane to coordinate this add
//              with.
//
// #997's own three governed-write handlers below keep the SAME "ID-SCOPED, falls through
// otherwise" shape every handler in this file already has: each reads `p_watch` from its POST
// body and answers only for `RECEIPT_WATCH_ID`, never for a watch id another lane might mint.
// Their MUTABLE state (`receiptAck`/`receiptSnooze`/`receiptResolve` below) is exactly the shape
// this suite's own README already documents and accepts ("The mock server keeps mutable fixture
// state for the life of the process") — safe here because `playwright.config.ts` pins
// `reuseExistingServer: false`, so every `pnpm --filter @clara/web e2e` run starts this module
// fresh, and no other spec in the suite ever calls `RECEIPT_WATCH_ID`'s three doors.

export const D4 = {
  clientOk: "d4d4d4d4-1111-4777-8777-d4d4d4d40001",
  clientEmpty: "d4d4d4d4-1111-4777-8777-d4d4d4d40002",
  clientStale: "d4d4d4d4-1111-4777-8777-d4d4d4d40003",
  clientDenied: "d4d4d4d4-1111-4777-8777-d4d4d4d40004",
  clientError: "d4d4d4d4-1111-4777-8777-d4d4d4d40005",
  clientReceipt: "d4d4d4d4-1111-4777-8777-d4d4d4d40006",
};

const CLIENT_NAMES = {
  [D4.clientOk]: "D4 Tax OK Fixture",
  [D4.clientEmpty]: "D4 Tax Empty Fixture",
  [D4.clientStale]: "D4 Tax Stale Fixture",
  [D4.clientDenied]: "D4 Tax Denied Fixture",
  [D4.clientError]: "D4 Tax Error Fixture",
  [D4.clientReceipt]: "D4 Tax Receipt Fixture",
};

/** #997 — the one open watch the receipt walk acts on. A plain lane-scoped string id, the same
 *  shape `OK_ENVELOPE`'s own `d4-watch-ok` already uses (`get_compliance_watch_disposition`'s
 *  mocked door below keys on this string verbatim; it is never parsed as a uuid). */
const RECEIPT_WATCH_ID = "d4-watch-receipt";

/** The SUBJECT `serve-built.mjs`'s own mock auth server signs every e2e session in as
 *  (`serve-built.mjs`'s `SUBJECT` — read there, not respelled here as a literal so the two can
 *  never drift), and the same id `/rest/v1/firm_members_visible`'s CORE handler resolves to
 *  "E2E Owner" for the default sign-in address. The three governed-write handlers below stamp
 *  every event's `actor` with it, so `MemberName`'s roster lookup resolves a real name rather
 *  than falling back to the shortened-id treatment. */
const RECEIPT_ACTOR = "11111111-1111-1111-1111-111111111111";

/** #997's own mutable disposition trail — `null` until the matching act runs, exactly mirroring
 *  the real table's own nullable columns (`acknowledged_by`/`acknowledged_at`, etc., hydrated by
 *  `lib/firm/compliance-disposition.ts`'s `hydrateWatchDisposition`). Each act handler below
 *  fills its own slot from the POST body it actually received — an ECHO of what the browser
 *  typed, not a canned literal — so the disposition read that follows only shows something new
 *  because the write actually carried it. */
let receiptAck = null; // { rationale, at }
let receiptSnooze = null; // { until, rationale, at }
let receiptResolve = null; // { conclusion, evidence, at }

function clientRow(id) {
  return {
    id,
    name: CLIENT_NAMES[id],
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

import { readCachedJson as readJson } from "./mock-dispatch.mjs";

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

/** #997 — the receipt client's own envelope: ONE open, actionable `compliance_watch` row (the
 *  only carrier of `watch_id`, `lib/tax/sst-watch.ts`'s own header), so `SstWatchSection` mounts
 *  `ComplianceWatchAffordance` rather than the `noOpenWatchRow` note. `state: "crossed"` matches
 *  `OK_ENVELOPE`'s own choice — a real threshold crossing is the state a professional would
 *  actually act on. */
const RECEIPT_ENVELOPE = () => ({
  watermark: "d4-receipt",
  counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: {
    stale_evaluator: false,
    clients: [{
      client_id: D4.clientReceipt, service_group: "digital_services", state: "crossed",
      confirmed_included_cents: 60_000_000, unknown_or_mixed_cents: 900_000,
      screening_proxy_cents: 60_900_000, earliest_crossing_month: "2026-07",
      application_due: "2026-08-31", future_method_status: "not_assessed",
    }],
  },
  rows: [{
    row_kind: "compliance_watch", section: "needs_you", client_id: D4.clientReceipt, counterparty_id: null,
    filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: true, high_stakes: false, aged_since: "2026-07-01T00:00:00Z",
    amount_cents: null, period: null, question_text: null, created_at: "2026-07-01T00:00:00Z",
    id: RECEIPT_WATCH_ID, coding_kind: null, watch_id: RECEIPT_WATCH_ID, tier: "crossed", finding_id: null,
    asset_id: null, advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
  }],
  next_cursor: null,
});

/** #997 — `clara.get_compliance_watch_disposition`'s mocked answer, composed FRESH on every call
 *  from `receiptAck`/`receiptSnooze`/`receiptResolve` rather than from a call-index — so the
 *  browser gets the SAME answer a real re-read would: whatever has actually been written so far,
 *  however many times the receipt happens to re-read it. `events` carries the evaluator's own
 *  `created` sweep row first (never a person's act — `lib/firm/compliance-disposition.ts`'s
 *  `DISPOSITION_EVENT_KINDS` excludes it, which is what makes "nothing recorded yet" the honest
 *  reading before any act), then each act event in the order it actually happened. `resolve`
 *  carries no rationale of its own (the real door takes `p_evidence`, not `p_rationale` —
 *  `lib/firm-admin/compliance.ts`'s own grounding note), matching the real column's shape rather
 *  than inventing one. */
function receiptDispositionBody() {
  const events = [
    { event_kind: "created", state_before: null, state_after: "monitored", actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z" },
  ];
  if (receiptAck) {
    events.push({
      event_kind: "acknowledged", state_before: "crossed", state_after: "crossed",
      actor: RECEIPT_ACTOR, rationale: receiptAck.rationale, created_at: receiptAck.at,
    });
  }
  if (receiptSnooze) {
    events.push({
      event_kind: "snoozed", state_before: "crossed", state_after: "crossed",
      actor: RECEIPT_ACTOR, rationale: receiptSnooze.rationale, created_at: receiptSnooze.at,
    });
  }
  if (receiptResolve) {
    events.push({
      event_kind: "resolved", state_before: "crossed", state_after: "resolved",
      actor: RECEIPT_ACTOR, rationale: null, created_at: receiptResolve.at,
    });
  }
  return {
    watch_id: RECEIPT_WATCH_ID, client_id: D4.clientReceipt, service_group: "digital_services",
    watch_kind: "sst_registration", state: receiptResolve ? "resolved" : "crossed",
    acknowledged_by: receiptAck ? RECEIPT_ACTOR : null, acknowledged_at: receiptAck?.at ?? null,
    snoozed_until: receiptSnooze?.until ?? null,
    resolved_conclusion: receiptResolve?.conclusion ?? null,
    resolved_by: receiptResolve ? RECEIPT_ACTOR : null, resolved_at: receiptResolve?.at ?? null,
    resolved_evidence: receiptResolve?.evidence ?? null,
    updated_at: receiptResolve?.at ?? receiptSnooze?.at ?? receiptAck?.at ?? "2026-07-01T00:00:00Z",
    events,
  };
}

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
    if (client === D4.clientReceipt) { sendJson(response, 200, RECEIPT_ENVELOPE(), cors); return true; }
    return false;
  }

  // #997 — `clara.get_compliance_watch_disposition`. Scoped to `p_watch`, never to a client:
  // the real door takes only the watch id (`lib/firm/compliance-disposition.ts`'s own header),
  // so that is the one thing this handler can gate on too.
  if (verb === "get_compliance_watch_disposition") {
    const body = await readJson(request);
    if (body?.p_watch !== RECEIPT_WATCH_ID) return false;
    sendJson(response, 200, receiptDispositionBody(), cors);
    return true;
  }

  // #997 — the three governed writes. Each is scoped to `p_watch` and, on a match, records what
  // the browser actually typed before answering 200 — the receipt's next re-read (above) is what
  // proves the wiring, not this response body, which `callDoor`'s own caller discards
  // (hydrate-never-trust: `compliance-watch-affordance.tsx`'s `submitAck`/`submitSnooze`/
  // `submitResolve` each call `.then(() => undefined)`).
  if (verb === "ack_compliance_watch") {
    const body = await readJson(request);
    if (body?.p_watch !== RECEIPT_WATCH_ID) return false;
    receiptAck = { rationale: String(body.p_rationale ?? ""), at: new Date().toISOString() };
    sendJson(response, 200, { watch_id: RECEIPT_WATCH_ID, op_key: body.p_op_key ?? null }, cors);
    return true;
  }
  if (verb === "snooze_compliance_watch") {
    const body = await readJson(request);
    if (body?.p_watch !== RECEIPT_WATCH_ID) return false;
    receiptSnooze = {
      until: String(body.p_until ?? ""), rationale: String(body.p_rationale ?? ""),
      at: new Date().toISOString(),
    };
    sendJson(response, 200, { watch_id: RECEIPT_WATCH_ID, op_key: body.p_op_key ?? null }, cors);
    return true;
  }
  if (verb === "resolve_compliance_watch") {
    const body = await readJson(request);
    if (body?.p_watch !== RECEIPT_WATCH_ID) return false;
    receiptResolve = {
      conclusion: String(body.p_conclusion ?? ""), evidence: String(body.p_evidence ?? ""),
      at: new Date().toISOString(),
    };
    sendJson(response, 200, { watch_id: RECEIPT_WATCH_ID, op_key: body.p_op_key ?? null }, cors);
    return true;
  }

  return false;
}
