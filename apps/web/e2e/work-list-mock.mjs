// #641's own mock lane — a file-disjoint sibling of `activity-mock.mjs`/`home-board-mock.mjs`,
// consulted by `serve-built.mjs` through ONE hook. Every branch below is scoped to THIS lane's
// own client ids and falls through otherwise (e2e-fixture-ownership.test.ts's own discipline).
//
// IT READS THE REQUEST BODY ONLY INSIDE A MATCHED VERB. `readJson`'s `for await (const chunk of
// request)` drains the stream exactly once, so a lane that parses on EVERY `/rest/v1/rpc/` POST
// starves every lane ordered after it — the measured hazard `serve-built.mjs` records twice
// against `bank-close-registers-mock.mjs`. This module never does that: the two path checks come
// first, and only then is a body read.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of
// `components/work/*`/`lib/work/work-list*.ts` under test are REAL. What is faked is PostgREST:
// `clara.list_accounting_work` and `clara.get_accounting_work_row` themselves, including the
// keyset paging and the CLR-shaped refusals. So this walk proves the JOURNEY — filters written to
// the URL, the two Empty states, Pagination, the narrow Sheet, list-to-detail and Back, keyboard,
// 320 px, 200 % zoom, reduced motion — and nothing about whether Postgres would actually return
// this page; `packages/db/tests/work-list.test.mjs` owns that half.
//
// THE FIXTURE IS BUILT TO MAKE EACH STATE REACHABLE BY A URL:
//   WORK_LIST.clientId    — nine rows across six states, paged 5 + 4 so Next/First are both real.
//                           `?status=awaiting_input` narrows to exactly one row (the parked one),
//                           `?status=cancelled` narrows to ZERO (the no-results Empty), and the
//                           unfiltered read is non-empty (so first-use is NOT what a filtered
//                           empty renders).
//   WORK_LIST.emptyClient — a client with no Work at all: the FIRST-USE Empty, which must read
//                           differently from the filtered one above.
//   WORK_LIST.deniedClient— every read refuses CLR04, for the permission-loss cell.

export const WORK_LIST = {
  clientId: "c641c641-1111-4777-8777-c641c6410001",
  clientName: "Work List Fixture",
  emptyClient: "c641c641-1111-4777-8777-c641c6410002",
  emptyClientName: "Work List Empty Fixture",
  deniedClient: "c641c641-1111-4777-8777-c641c6410003",
  deniedClientName: "Work List Denied Fixture",
  // The rows the spec addresses by name.
  parkedWorkId: "c641c641-2222-4777-8777-c641c6410101",
  failedWorkId: "c641c641-2222-4777-8777-c641c6410102",
  retryingWorkId: "c641c641-2222-4777-8777-c641c6410103",
  completedWorkId: "c641c641-2222-4777-8777-c641c6410104",
  chatOriginWorkId: "c641c641-2222-4777-8777-c641c6410105",
  oldestWorkId: "c641c641-2222-4777-8777-c641c6410109",
};

const PAGE_2_CURSOR = "work-list-mock-page-2";
const SUBJECT = "11111111-1111-1111-1111-111111111111";

function clientRow(id, name) {
  return { id, name, status: "active", created_at: "2026-01-01T00:00:00.000Z" };
}

/** Spliced into `serve-built.mjs`'s own shared `clients` array — the SAME append shape
 *  `ACTIVITY_CLIENTS` takes, and for the same reason: the firm Work list's client Select reads the
 *  UNFILTERED register, and a lane that ANSWERED that route with its own data would narrow every
 *  other walk's client list. Appending, never replacing. */
export const WORK_LIST_CLIENTS = [
  clientRow(WORK_LIST.clientId, WORK_LIST.clientName),
  clientRow(WORK_LIST.emptyClient, WORK_LIST.emptyClientName),
  clientRow(WORK_LIST.deniedClient, WORK_LIST.deniedClientName),
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

function workRow(over) {
  return {
    client_id: WORK_LIST.clientId,
    client_name: WORK_LIST.clientName,
    purpose: "journal_entry",
    status: "queued",
    initiator: SUBJECT,
    initiated_by: SUBJECT,
    initiator_role: "bookkeeper",
    basis_origin: "user_direct",
    memo: "Office rent, September",
    posting_date: "2026-09-01",
    currency: "MYR",
    source_ref_count: 0,
    current_task_id: null,
    entry_id: null,
    receipt_id: null,
    error_code: null,
    error_reason: null,
    attempts: 1,
    current_run_status: "queued",
    pending_question_id: null,
    pending_question_version: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
    ...over,
  };
}

// Newest first, the order the door itself guarantees.
const ROWS = [
  workRow({
    id: WORK_LIST.parkedWorkId,
    status: "awaiting_input",
    memo: "Quarterly rent — which Maybank account?",
    pending_question_id: "c641c641-3333-4777-8777-c641c6410201",
    pending_question_version: 1,
    current_task_id: "c641c641-4444-4777-8777-c641c6410301",
    current_run_status: "awaiting_input",
    created_at: "2026-09-09T09:00:00.000Z",
  }),
  workRow({
    id: WORK_LIST.retryingWorkId,
    status: "running",
    attempts: 2,
    memo: "Utilities accrual",
    current_run_status: "running",
    created_at: "2026-09-08T09:00:00.000Z",
  }),
  workRow({
    id: WORK_LIST.failedWorkId,
    status: "failed",
    memo: "Depreciation for August",
    error_code: "CLR13",
    error_reason: "period_locked",
    created_at: "2026-09-07T09:00:00.000Z",
  }),
  workRow({
    id: WORK_LIST.completedWorkId,
    status: "completed",
    memo: "Bank charges, August",
    entry_id: "c641c641-5555-4777-8777-c641c6410401",
    receipt_id: "c641c641-6666-4777-8777-c641c6410501",
    created_at: "2026-09-06T09:00:00.000Z",
  }),
  workRow({
    id: WORK_LIST.chatOriginWorkId,
    status: "completed",
    basis_origin: "clara_interpreted",
    memo: "Asked in a conversation: record the deposit",
    source_ref_count: 1,
    created_at: "2026-09-05T09:00:00.000Z",
  }),
  workRow({ id: "c641c641-2222-4777-8777-c641c6410106", status: "refused", memo: "Stationery", created_at: "2026-09-04T09:00:00.000Z" }),
  workRow({ id: "c641c641-2222-4777-8777-c641c6410107", status: "expired", memo: "Insurance prepayment", created_at: "2026-09-03T09:00:00.000Z" }),
  workRow({ id: "c641c641-2222-4777-8777-c641c6410108", status: "queued", memo: "Payroll journal", created_at: "2026-09-02T09:00:00.000Z" }),
  workRow({ id: WORK_LIST.oldestWorkId, status: "completed", memo: "Opening balances tie-out", created_at: "2026-09-01T09:00:00.000Z" }),
];

const PAGE_SIZE = 5;

function clr(status, code, message, reason) {
  return { status, body: { code, message, details: JSON.stringify({ reason }) } };
}

/** The door's own filter semantics, restated on the fixture so the spec's URL cells measure the
 *  REAL browser -> URL -> door argument path rather than a mock that answers page 1 whatever it is
 *  asked. An unknown status is refused exactly as 0189 refuses it. */
function applyFilters(rows, body) {
  let out = rows;
  if (Array.isArray(body.p_status) && body.p_status.length > 0) {
    out = out.filter((r) => body.p_status.includes(r.status));
  }
  if (Array.isArray(body.p_purpose) && body.p_purpose.length > 0) {
    out = out.filter((r) => body.p_purpose.includes(r.purpose));
  }
  if (typeof body.p_initiator === "string" && body.p_initiator !== "") {
    out = out.filter((r) => r.initiator === body.p_initiator);
  }
  if (typeof body.p_q === "string" && body.p_q !== "") {
    const needle = body.p_q.toLowerCase();
    out = out.filter((r) => (r.memo ?? "").toLowerCase().includes(needle));
  }
  if (typeof body.p_since === "string" && body.p_since !== "") {
    out = out.filter((r) => r.created_at >= new Date(body.p_since).toISOString());
  }
  if (typeof body.p_until === "string" && body.p_until !== "") {
    out = out.filter((r) => r.created_at < new Date(body.p_until).toISOString());
  }
  return out;
}

const KNOWN_STATUSES = new Set([
  "queued", "running", "awaiting_input", "stopping",
  "completed", "refused", "failed", "cancelled", "expired",
]);

/**
 * THIS LANE'S ANSWER to ONE `list_accounting_work` call, as a PURE function of an
 * already-parsed request body: `{status, body}` when the call names a client this lane owns, and
 * `null` when it does not.
 *
 * WHY NOT A HANDLER LIKE ITS SIBLINGS. Two lane mocks now own durable Work for their own clients —
 * this one's fixture rows and `journal-work-mock.mjs`'s runtime-minted ones — and `readJson`'s
 * `for await (const chunk of request)` drains the stream exactly once. Whichever lane read the body
 * first would leave the other reading `{}`, whose undefined `p_client` satisfies a permissive match
 * and answers the WRONG fixture with no error anywhere: the measured consume-then-fall-through
 * hazard `serve-built.mjs` already records twice against `bank-close-registers-mock.mjs`. So
 * serve-built.mjs reads the body ONCE and offers it to each lane's answerer in turn; neither lane
 * touches the request itself.
 */
export function answerWorkListPage(body) {
  const client = body.p_client ?? null;

  if (client === WORK_LIST.deniedClient) {
    return clr(400, "CLR04", "insufficient role", "e2e_work_list_denied");
  }
  if (client === WORK_LIST.emptyClient) {
    return { status: 200, body: { rows: [], next_cursor: null, truncated: false } };
  }
  // The firm-wide read (no client) and this lane's own client both answer from the same nine rows:
  // `/work` lists every client's Work, and among the lanes that own any, this one owns the fixture
  // roster. A call naming ANOTHER lane's client returns null and falls through to that lane.
  if (client !== null && client !== WORK_LIST.clientId) return null;

  if (Array.isArray(body.p_status)) {
    const bad = body.p_status.find((s) => !KNOWN_STATUSES.has(s));
    if (bad !== undefined) {
      return clr(400, "CLR10", `unknown work status ${bad}`, "invalid_status");
    }
  }

  const filtered = applyFilters(ROWS, body);
  const start = body.p_cursor === PAGE_2_CURSOR ? PAGE_SIZE : 0;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const truncated = filtered.length > start + PAGE_SIZE;
  return {
    status: 200,
    body: { rows: slice, next_cursor: truncated ? PAGE_2_CURSOR : null, truncated },
  };
}

export async function handleWorkListSupabase(request, response, path, url, sendJson, cors) {
  if (request.method === "POST" && path === "/rest/v1/rpc/get_accounting_work_row") {
    const body = await readJson(request);
    const match = ROWS.find((r) => r.id === body.p_work);
    if (match) {
      sendJson(response, 200, match, cors);
      return true;
    }
    return false;
  }

  // ── the DETAIL page's own four relation reads ────────────────────────────────────────────
  //
  // The list links every row to `/clients/:id/work/:workId`, and that page reads
  // `clara.accounting_work` DIRECTLY through PostgREST (`lib/work/reads.ts` — a plain filtered
  // GET, not this ticket's door). Its loader runs four reads in one `Promise.all` and only TWO of
  // them are wrapped in a `.catch`: an unanswered `operation_receipts` or `accounting_work` would
  // reject the whole loader and render the page's read-failure banner instead of the Work. So the
  // lane answers both, plus the two journal relations a completed Work's result id reaches for.
  //
  // EVERY ONE IS SCOPED TO THIS LANE'S OWN CLIENT and falls through otherwise, so
  // `journal-work-mock.mjs` (which owns the same four routes for ITS ids) keeps answering its own
  // walk unchanged.
  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (eq(url, "client_id") !== WORK_LIST.clientId) return false;
    const id = eq(url, "id");
    const rows = ROWS.filter((r) => id === null || r.id === id).map(detailRow);
    sendJson(response, 200, rows, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/operation_receipts") {
    if (eq(url, "client_id") !== WORK_LIST.clientId) return false;
    // Honestly empty: this lane models no committed receipt, and the detail page renders the
    // absence of one as "no receipt yet" rather than as a failed read.
    sendJson(response, 200, [], cors);
    return true;
  }

  // TWO BRANCHES, NOT ONE `||` LINE, and that is about the GATE rather than about style:
  // `e2e-fixture-ownership.test.ts`'s census reads ONE handler opener per source LINE, and
  // cross-checks that count against a whole-source match — so two `path === "…"` tests sharing a
  // line make the two instruments disagree and red the gate that watches every lane.
  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    if (eq(url, "client_id") !== WORK_LIST.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_lines") {
    if (eq(url, "client_id") !== WORK_LIST.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  return false;
}

/** `?client_id=eq.<value>` -> `<value>`, or null when the parameter is absent or not an `eq.`. */
function eq(url, key) {
  const raw = url.searchParams.get(key);
  return raw !== null && raw.startsWith("eq.") ? raw.slice(3) : null;
}

/** The DETAIL page's row shape (`AccountingWorkRow`, `lib/work/types.ts`) built from this lane's
 *  own list row — the two projections share a client, a status and a memo, and the columns only
 *  the detail reads (`basis`, `basis_digest`, `intent_key`, `logical_op_id`, `bundle`, `result`,
 *  `error`) are filled in here rather than duplicated into the list fixture above.
 *
 *  `result` IS LEFT NULL even for the completed rows, and that is deliberate rather than lazy:
 *  this lane answers `journal_entries` with an honest empty, so a `result.entry_id` would name an
 *  entry the fixture does not have and the page would render a posted section with nothing in it.
 *  The posted-entry surface belongs to `journal-work-mock.mjs`'s own walk, which owns that half. */
function detailRow(row) {
  return {
    id: row.id,
    firm_id: "11111111-1111-4111-8111-111111111111",
    client_id: row.client_id,
    purpose: row.purpose,
    status: row.status,
    initiator: row.initiator,
    initiated_by: row.initiated_by,
    initiator_role: row.initiator_role,
    intent_key: `intent-${row.id}`,
    logical_op_id: `work:${row.id}:journal_entry:1`,
    basis: {
      posting_date: row.posting_date,
      memo: row.memo,
      currency: row.currency,
      lines: [
        { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "rent" },
        { account_code: "1150", debit_cents: 0, credit_cents: 120000, description: "bank" },
      ],
    },
    basis_digest: "a".repeat(64),
    basis_origin: row.basis_origin,
    source_refs: row.basis_origin === "clara_interpreted" ? [{ kind: "clara_chat" }] : [],
    current_task_id: row.current_task_id,
    bundle: null,
    result: null,
    error: row.error_code === null
      ? null
      : { code: row.error_code, reason: row.error_reason, message: "the period is locked", recoverable: false },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
