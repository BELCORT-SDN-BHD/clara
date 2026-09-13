// #643's own mock lane — the periodic-adjustment journey (C8/C11: the form, its derived entry, its
// refusals and its history), a file-disjoint sibling of `journal-work-mock.mjs` and consulted by
// `serve-built.mjs` through the two hooks that module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin runtime
// proxy (`app/api/runtime/[...path]/route.ts`, with its firm-scope guard and header allow-list) and
// every line of client code under test are REAL — the form's state machine, the derivation, the
// refusal→control mapping, the draft in `sessionStorage`, the history table's disclosure. What is
// faked is what sits behind them: PostgREST's reads and the RUNTIME's
// `POST /api/work/periodic-adjustment`. So this walk proves the JOURNEY and the client's own wire
// shapes; it proves NOTHING about whether Postgres would accept a set of particulars, whether
// `clara._assert_adjustment_relationships` really refuses lines that contradict them, or whether
// the close gate flips. The db battery and the runtime world e2e own those.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, TRANSCRIBED FROM THE ROUTE — never a shape invented to
// make a cell go green. Two of them carry machine-readable slots the client acts on:
//
//   400 `{ "error": "invalid_basis", "field": "adjustment.<camelKey>", "reason": <token> }` —
//   `field` is the DATABASE's key re-spelled camelCase by `toWireField`, which is the ONE
//   translation that route performs for this prefix, and `apps/web/lib/work/periodic-adjustment.ts`'s
//   `fieldForAdjustmentPath` is the ONE mapper onto a control. A mock that made up a field name
//   would let a broken mapper pass a browser walk.
//
//   409 `{ "error": "intent_payload_conflict", "work_id" }` — the id of the Work that intent key
//   ALREADY names, which is what lets the form offer a route to it instead of an apology.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT — the CONTROL ENDPOINT INCLUDED, which is the
// one this file used to claim and not do (standards review): its five ops mutated shared state for
// any body at all, so the declaration in `e2e-fixture-ownership.test.ts` was ahead of the code. It
// now takes `client` and falls through when it is not this lane's, exactly as
// `journal-work-mock.mjs`'s own control endpoint does. Every handler falls through otherwise
// (`e2e-fixture-ownership.test.ts` exists because three lanes learned the hard way that a handler
// claiming a SHARED endpoint replaces everyone else's fixture). This lane claims no unfiltered
// register, no shared session list and no firm-wide read.

export const PA = {
  clientId: "64364364-6436-4643-8643-643643643643",
  clientName: "IPOH HARDWARE SUPPLY",
  inventory: "1200",
  cost: "5040",
  payrollExpense: "6010",
  liability: "2100",
  bank: "1150",
  /** A Work the walk's happy submit resolves to — the persistent outcome the form navigates to. */
  workId: "64309001-6430-4643-8643-643064309001",
  /** A Work already admitted under `seededIntentKey`: a draft carrying that key with DIFFERENT
   *  particulars is the conflict arm, and the 409 names this Work. */
  seededWorkId: "64309002-6430-4643-8643-643064309002",
  seededIntentKey: "pa-seeded-intent",
  /** One completed adjustment, for the history surface. */
  adjustmentId: "64309aaa-6430-4643-8643-643064309aaa",
  entryId: "64309bbb-6430-4643-8643-643064309bbb",
  receiptId: "64309ccc-6430-4643-8643-643064309ccc",
  /** A reversed one beside it, so the walk sees the correction chain rather than only a live row. */
  reversedAdjustmentId: "64309ddd-6430-4643-8643-643064309ddd",
  reversedEntryId: "64309eee-6430-4643-8643-643064309eee",
  correctionId: "64309fff-6430-4643-8643-643064309fff",
  /** #643's upload/reference entrance: one FREE filed document the walk cites, and one that
   *  already backs a posted entry so the chooser's disabled/advisory arm is exercised too. */
  documentId: "643d0001-643d-4643-8643-643d643d0001",
  documentName: "stocktake-2026-12.pdf",
  spokenForDocumentId: "643d0002-643d-4643-8643-643d643d0002",
  /** The control endpoint, as the BROWSER addresses it: the same-origin proxy maps
   *  `/api/runtime/<p>` onto the runtime's `/api/<p>`. */
  controlPath: "/api/runtime/e2e-periodic-adjustment/control",
};

const CLIENT = {
  id: PA.clientId,
  name: PA.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: PA.clientId, account_code: PA.inventory, name: "Inventory / Stock", account_type: "asset", is_active: true },
  { client_id: PA.clientId, account_code: PA.cost, name: "Cost of Sales", account_type: "expense", is_active: true },
  { client_id: PA.clientId, account_code: PA.payrollExpense, name: "EPF Contribution (Employer)", account_type: "expense", is_active: true },
  { client_id: PA.clientId, account_code: PA.liability, name: "EPF (KWSP) Payable", account_type: "liability", is_active: true },
  { client_id: PA.clientId, account_code: PA.bank, name: "Maybank current", account_type: "asset", is_active: true },
  { client_id: PA.clientId, account_code: "2020", name: "Accruals", account_type: "liability", is_active: true },
  { client_id: PA.clientId, account_code: "6000", name: "Salaries and Wages", account_type: "expense", is_active: true },
  // An INACTIVE row, so the form's `is_active` filter is exercised by a real fixture: it must never
  // appear as an option.
  { client_id: PA.clientId, account_code: "1299", name: "Inventory (retired)", account_type: "asset", is_active: false },
];

/** #643's UPLOAD/REFERENCE ENTRANCE — the two documents this client has FILED, in the shape
 *  `listDocumentsByIds` reads (`DOC_COLS`, column for column). One is free; the other already backs
 *  a posted entry, so the chooser must offer it DISABLED and say why — the advisory rule
 *  `mergeSpokenFor` states and the door enforces. */
const DOCUMENTS = [
  {
    id: PA.documentId, sha256: "a".repeat(64), original_filename: "stocktake-2026-12.pdf",
    mime_type: "application/pdf", byte_size: 20480, storage_path: `docs/${PA.documentId}.pdf`,
    uploaded_by: "00000000-0000-4000-8000-000000000001", created_at: "2026-12-31T03:00:00.000Z",
    bytes_verified_at: "2026-12-31T03:00:01.000Z", page_count: 1, extraction_status: "done",
    document_kind: "other", financial_date: "2026-12-31",
    retention_state: "anchored", retain_until: "2033-12-31", retention_basis: "statutory",
    legal_hold: false, legal_hold_reason: null,
  },
  {
    id: PA.spokenForDocumentId, sha256: "b".repeat(64), original_filename: "payroll-aug-2026.pdf",
    mime_type: "application/pdf", byte_size: 20481, storage_path: `docs/${PA.spokenForDocumentId}.pdf`,
    uploaded_by: "00000000-0000-4000-8000-000000000001", created_at: "2026-09-02T03:00:00.000Z",
    bytes_verified_at: "2026-09-02T03:00:01.000Z", page_count: 1, extraction_status: "done",
    document_kind: "other", financial_date: "2026-08-31",
    retention_state: "anchored", retain_until: "2033-08-31", retention_basis: "statutory",
    legal_hold: false, legal_hold_reason: null,
  },
];

/** The ACTIVE filings that make those documents THIS CLIENT's — `clara.documents` has no client
 *  column at all, so the filing is the binding (`listActiveFilingsForClient`'s own note). */
const FILINGS = DOCUMENTS.map((doc, i) => ({
  id: `64364f0${i + 1}-6436-4643-8643-64364364f0${i + 1}`,
  document_id: doc.id,
  client_id: PA.clientId,
  filed_at: doc.created_at,
  filed_by: "00000000-0000-4000-8000-000000000001",
  basis: "human",
  retired_at: null,
  retirement_reason: null,
  revision_token: `rev-filing-${i + 1}`,
}));

/** `clara.list_spoken_for_documents` (0183) — ADVISORY, never the law: the door's own conflict
 *  refusal is what actually protects the entry. One row, so the walk sees a disabled option with a
 *  reason rather than only a free list. */
const SPOKEN_FOR = [
  {
    document_id: PA.spokenForDocumentId,
    entry_id: PA.reversedEntryId,
    client_id: PA.clientId,
    client_name: PA.clientName,
    via: "evidence_link",
  },
];

/** The history `clara.list_periodic_adjustments` answers with — the function's own projection,
 *  field for field. One LIVE stocktake, one REVERSED one and the correction that replaced it, so
 *  the walk reads the chain in both directions rather than only a happy row. */
const HISTORY = [
  {
    id: PA.adjustmentId,
    work_id: PA.seededWorkId,
    logical_op_id: `work:${PA.seededWorkId}:periodic_stock_adjustment:1`,
    purpose: "periodic_stock_adjustment",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    basis: {
      purpose: "periodic_stock_adjustment",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      method: "opening_closing_count",
      opening_cents: 400000,
      closing_cents: 650000,
      counted_at: "2026-12-31",
      count_reference: "STOCKTAKE-2026-12",
      inventory_account_code: PA.inventory,
      cost_account_code: PA.cost,
      adjustment_cents: 250000,
      currency: "MYR",
      instruction: "Posting the 2026 year-end stocktake the supervisor signed off.",
      corrects_adjustment_id: null,
    },
    amount_cents: 250000,
    currency: "MYR",
    entry_id: PA.entryId,
    entry_status: "approved",
    posting_date: "2026-12-31",
    reversed_by: null,
    receipt_id: PA.receiptId,
    // THE SOURCE THE ADJUSTMENT WAS RECORDED FROM — `clara.periodic_adjustments.source_document_id`,
    // written by the posting core from the Work's own `source_refs`. The history discloses it, which
    // is what makes the upload/reference entrance visible after the fact rather than only at submit.
    source_document_id: PA.documentId,
    corrects_adjustment_id: null,
    corrected_by_adjustment_id: null,
    recorded_by: "00000000-0000-4000-8000-000000000001",
    on_behalf_of: "11111111-1111-1111-1111-111111111111",
    created_at: "2027-01-05T02:00:00.000Z",
  },
  {
    id: PA.reversedAdjustmentId,
    work_id: PA.seededWorkId,
    logical_op_id: `work:${PA.reversedAdjustmentId}:payroll_obligation:1`,
    purpose: "payroll_obligation",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    basis: {
      purpose: "payroll_obligation",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      obligation_kind: "epf",
      expense_account_code: PA.payrollExpense,
      liability_account_code: PA.liability,
      advance_account_code: null,
      payment_account_code: null,
      amount_cents: 130000,
      currency: "MYR",
      particulars_source: "Payroll summary for August 2026 supplied by the client's HR officer",
      instruction: "Book the employer EPF contribution for August 2026.",
      corrects_adjustment_id: null,
    },
    amount_cents: 130000,
    currency: "MYR",
    entry_id: PA.reversedEntryId,
    entry_status: "approved",
    posting_date: "2026-08-31",
    // A REVERSED original keeps `status = 'approved'` and gains `reversed_by` — the estate's own
    // shape, and the reason the history badges it rather than hiding it.
    reversed_by: "64309e11-6430-4643-8643-643064309e11",
    receipt_id: PA.receiptId,
    source_document_id: null,
    corrects_adjustment_id: null,
    corrected_by_adjustment_id: PA.correctionId,
    recorded_by: "00000000-0000-4000-8000-000000000001",
    on_behalf_of: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-09-02T02:00:00.000Z",
  },
];

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

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

/** The lane's own mutable state. `intents` is the mock's MODEL of
 *  `clara.admit_periodic_adjustment_work`'s `(firm, client, intent_key)` idempotency — modelled
 *  rather than asserted about, because that is the behaviour the form's lost-response arm is
 *  written against, so faking it faithfully is what makes that cell mean anything. */
const state = {
  intents: new Map(),
  /** Injected by the control endpoint: the NEXT admission answers this refusal instead. Nothing a
   *  browser can build reaches the route invalid, by construction, so a refusal has to be planted
   *  exactly as `journal-work-mock.mjs` plants its own. */
  nextRefusal: null,
  /** Every body this lane received, in order — read by the walk to prove the intent key did not
   *  rotate across a lost answer. */
  received: [],
  /** A SUCCESSFUL no-results read. `clara.list_periodic_adjustments` answers `[]` for a client that
   *  has recorded none, and the surface must render that as its own empty state rather than as a
   *  failure — so the walk needs to reach it, and a real read is the only honest way. */
  emptyHistory: false,
};

// ---------------------------------------------------------------------------------------------
// The PostgREST half.
// ---------------------------------------------------------------------------------------------

export async function handlePeriodicAdjustmentSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id === PA.clientId) {
      sendJson(response, 200, [CLIENT], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client === PA.clientId) {
      sendJson(response, 200, ACCOUNTS, cors);
      return true;
    }
    return false;
  }

  // #643's evidence chooser reads — the SAME two `lib/work/evidence.ts` makes on the composer's
  // door, because it is the same component. Both are scoped to THIS lane's client (the filings read
  // by `client_id`, the documents read by ids this module minted) and fall through otherwise.
  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== PA.clientId) return false;
    sendJson(response, 200, FILINGS, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/documents") {
    const inList = url.searchParams.get("id");
    if (inList === null || !inList.startsWith("in.(")) return false;
    const ids = inList.slice(4, -1).split(",").map((v) => decodeURIComponent(v));
    const rows = DOCUMENTS.filter((d) => ids.includes(d.id));
    if (rows.length === 0) return false;
    sendJson(response, 200, rows, cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  if (verb === "list_spoken_for_documents") {
    const body = await readJson(request);
    if (body?.p_client !== PA.clientId) return false;
    sendJson(response, 200, SPOKEN_FOR, cors);
    return true;
  }

  if (verb === "list_periodic_adjustments") {
    const body = await readJson(request);
    if (body?.p_client !== PA.clientId) return false;
    // THE WINDOW IS THE DATABASE'S FILTER, and the mock applies it for the same reason it models
    // the idempotency: the surface's own behaviour is written against a filtered answer.
    const from = typeof body?.p_from === "string" ? body.p_from : null;
    const to = typeof body?.p_to === "string" ? body.p_to : null;
    const rows = state.emptyHistory
      ? []
      : HISTORY.filter((r) => (from === null || r.period_end >= from) && (to === null || r.period_start <= to));
    sendJson(response, 200, rows, cors);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------------------------
// The RUNTIME half.
// ---------------------------------------------------------------------------------------------

export async function handlePeriodicAdjustmentRuntime(request, response, url) {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/e2e-periodic-adjustment/control") {
    const body = await readJson(request);
    // SCOPED LIKE EVERY OTHER HANDLER HERE, and for the reason the file's header now states: a
    // control endpoint that mutates shared fixture state for ANY body is a lane claiming a shared
    // endpoint, which is exactly what `e2e-fixture-ownership.test.ts` exists to prevent. The sibling
    // `journal-work-mock.mjs:645` is the shape (`if (body?.client !== JOURNAL_WORK.clientId) return
    // false;`) and this now matches it.
    if (body?.client !== PA.clientId) return false;
    if (body?.op === "refuse_next") {
      state.nextRefusal = { field: String(body.field ?? "adjustment.periodEnd"), reason: String(body.reason ?? "scope_overbroad") };
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "seed_intent") {
      // PLANTED WITH A PAYLOAD NOTHING CAN EQUAL, so every submit under this key is the CONFLICT
      // arm rather than a replay — which is the state the walk needs and the one the database
      // produces for a key that already names different particulars.
      state.intents.set(PA.seededIntentKey, { workId: PA.seededWorkId, payload: null });
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "received") {
      send(response, 200, { received: state.received });
      return true;
    }
    if (body?.op === "empty_history") {
      state.emptyHistory = true;
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "reset") {
      state.intents.clear();
      state.nextRefusal = null;
      state.received = [];
      state.emptyHistory = false;
      send(response, 200, { ok: true });
      return true;
    }
    return false;
  }

  if (request.method === "POST" && path === "/api/work/periodic-adjustment") {
    const body = await readJson(request);
    // SCOPED BY THE REQUEST'S OWN CLIENT — another lane's admission falls through to the shared
    // fallback rather than being answered with this lane's Work.
    if (body?.clientId !== PA.clientId) return false;
    const intentKey = String(body?.intentKey ?? "");
    state.received.push({
      intentKey,
      purpose: String(body?.purpose ?? ""),
      adjustment: body?.adjustment ?? null,
      basis: body?.basis ?? null,
      // #643's upload/reference entrance, as it crosses the wire. Recorded rather than asserted
      // about here: the walk reads it back and pins the exact shape the route's `toDbSourceRefs`
      // accepts, which is the only thing a browser can prove about a citation.
      sourceRefs: body?.sourceRefs ?? null,
    });
    // NO DROPPED-SOCKET ARM LIVES HERE, and its absence is a measurement rather than an omission.
    // A fixture that destroyed its own socket would reach the page as the same-origin proxy's OWN
    // 502 (`app/api/runtime/[...path]/route.ts` catches the failed fetch and answers
    // `{"error":"runtime_unreachable"}`), which `lib/work/api.ts` classifies as `unavailable` —
    // the server ANSWERED and said no. The form's `lost` arm needs the opposite: the request
    // REACHES this handler and the ANSWER vanishes on the way back. Only the browser's own network
    // layer can do that, so the walk performs it with `page.route` (`route.fetch()` +
    // `route.abort()`), exactly as `journal-work-walk.spec.ts`'s lost cell does.
    // THE INJECTED 400, BEFORE the idempotency arms: the route validates the particulars before it
    // reaches `clara.admit_periodic_adjustment_work`, so a refused shape never touches the intent
    // key and nothing is admitted.
    if (state.nextRefusal !== null) {
      const refusal = state.nextRefusal;
      state.nextRefusal = null;
      send(response, 400, { error: "invalid_basis", field: refusal.field, reason: refusal.reason });
      return true;
    }
    // THE PAYLOAD THIS KEY STANDS FOR. Compared as the JSON the client itself built, which is
    // deterministic across two submits of one draft — the fixture's stand-in for the database's
    // own intent-payload digest.
    const payload = JSON.stringify({
      purpose: body?.purpose ?? null,
      basis: body?.basis ?? null,
      adjustment: body?.adjustment ?? null,
      // THE CITATION IS PART OF THE INTENT, exactly as it is in the database: 0182 folded the
      // canonical source refs into the intent-payload comparison beside the basis digest, so one
      // key re-sent with a DIFFERENT document is a conflict rather than a replay.
      sourceRefs: body?.sourceRefs ?? null,
    });
    const known = state.intents.get(intentKey);
    if (known !== undefined) {
      // ONE INTENT KEY, TWO ARMS, as the database defines them: the SAME particulars REPLAY onto
      // the Work already admitted (`replayed: true` — which is what makes a lost answer safe to
      // re-send), and a DIFFERENT payload under that key is a typed conflict that admits nothing.
      if (known.payload !== null && known.payload === payload) {
        send(response, 202, {
          work_id: known.workId,
          task_id: "74309001-7430-4743-8743-743074309001",
          logical_op_id: `work:${known.workId}:${String(body?.purpose ?? "periodic_stock_adjustment")}:1`,
          status: "queued",
          replayed: true,
        });
        return true;
      }
      send(response, 409, { error: "intent_payload_conflict", work_id: known.workId });
      return true;
    }
    state.intents.set(intentKey, { workId: PA.workId, payload });
    send(response, 202, {
      work_id: PA.workId,
      task_id: "74309001-7430-4743-8743-743074309001",
      logical_op_id: `work:${PA.workId}:${String(body?.purpose ?? "periodic_stock_adjustment")}:1`,
      status: "queued",
      replayed: false,
    });
    return true;
  }

  return false;
}
