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

export async function handleWorkListSupabase(request, response, path, url, sendJson, cors) {
  if (request.method === "POST" && path === "/rest/v1/rpc/list_accounting_work") {
    const body = await readJson(request);
    const client = body.p_client ?? null;

    if (client === WORK_LIST.deniedClient) {
      const { status, body: refusal } = clr(400, "CLR04", "insufficient role", "e2e_work_list_denied");
      sendJson(response, status, refusal, cors);
      return true;
    }
    if (client === WORK_LIST.emptyClient) {
      sendJson(response, 200, { rows: [], next_cursor: null, truncated: false }, cors);
      return true;
    }
    // The firm-wide read (no client) and this lane's own client both answer from the same nine
    // rows: `/work` lists every client's Work, and this lane owns the only fixture Work there is.
    if (client !== null && client !== WORK_LIST.clientId) return false;

    if (Array.isArray(body.p_status)) {
      const bad = body.p_status.find((s) => !KNOWN_STATUSES.has(s));
      if (bad !== undefined) {
        const { status, body: refusal } = clr(400, "CLR10", `unknown work status ${bad}`, "invalid_status");
        sendJson(response, status, refusal, cors);
        return true;
      }
    }

    const filtered = applyFilters(ROWS, body);
    const start = body.p_cursor === PAGE_2_CURSOR ? PAGE_SIZE : 0;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    const truncated = filtered.length > start + PAGE_SIZE;
    sendJson(response, 200, {
      rows: slice,
      next_cursor: truncated ? PAGE_2_CURSOR : null,
      truncated,
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_accounting_work_row") {
    const body = await readJson(request);
    const match = ROWS.find((r) => r.id === body.p_work);
    if (match) {
      sendJson(response, 200, match, cors);
      return true;
    }
    return false;
  }

  return false;
}
