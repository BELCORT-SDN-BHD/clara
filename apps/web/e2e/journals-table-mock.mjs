// The journals-table walk's own mock lane (裁-190) — a file-disjoint sibling of
// `chat-parity-mock.mjs` and `agentic-finish-mock.mjs`, consulted by
// `serve-built.mjs` through one hook, exactly as those modules describe for
// themselves.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real
// same-origin runtime proxy and every line of client code under test are REAL.
// What is faked is PostgREST behind them. So this walk proves the JOURNEY and
// the client's own wire shapes; it proves nothing about whether Postgres would
// accept them. In particular it does NOT exercise `_approve_entry_core`'s
// CLR05 arms or `revise_entry`'s CLR21 gates — the unit cells pin those
// against the migration text, and the DB's own suite pins the doors.
//
// EVERY HANDLER IS SCOPED, and each one says how. `e2e-fixture-ownership.test.ts`
// exists because three lanes learned the hard way that a handler claiming a
// SHARED endpoint replaces everyone else's fixture, and the walk that loses is
// whichever one reads a list instead of navigating by id.
//
// THE ONE HANDLER THAT CANNOT SCOPE BY SUBJECT is the FIRM-WIDE pending
// `agent_interruptions` read (`status=eq.pending` with no `task_id` and no
// `id`). It carries no client and no subject BY CONSTRUCTION — the table has no
// `client_id` column at all (lib/journals/types.ts's own header), which is why
// the Clarifications tab labels itself firm-wide. It is scoped by SHAPE
// instead: this module answers only that exact read, and falls through for the
// task-scoped and by-id reads the chat rail makes. Measured: the firm-wide read
// has exactly ONE caller in the app (lib/journals/governance-doors.ts's
// `listPendingInterruptions`, used only by lib/journals/use-journals-workbench.ts),
// and no other spec in this suite loads that tab.

export const JOURNALS = {
  clientId: "e6e6e6e6-6666-4666-8666-666666666666",
  taskId: "e7e7e7e7-7777-4777-8777-777777777777",
  interruptionId: "e8e8e8e8-8888-4888-8888-888888888888",
  backdated: "b1b1b1b1-1111-4111-8111-111111111111",
  recent: "a1a1a1a1-1111-4111-8111-111111111111",
  march: "c1c1c1c1-3333-4333-8333-333333333333",
  draft: "d1d1d1d1-4444-4444-8444-444444444444",
  question: "Which financial year does this invoice belong to?",
};

const CLIENT = {
  id: JOURNALS.clientId,
  name: "ROME PUBLIC ADVISORY",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

function entry(over) {
  return {
    client_id: JOURNALS.clientId, status: "approved", posting_date: "2026-04-01", memo: null,
    origin: "manual", document_id: null, coding_kind: null, revision_token: `rev-${over.id}`,
    maker_actor: null, checker_actor: null, approved_at: "2026-04-01T00:00:00.000Z",
    reversal_of: null, reversed_by: null, reversal_reason: null,
    withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00.000Z",
    ...over,
  };
}

// THE ORDERING FIXTURE. The READ hands rows back in `created_at.desc` order
// (lib/journals/api.ts:83) and the BACKDATED entry was created LAST, so it
// arrives first. The table must still show the most recent POSTING date at the
// top — that mismatch is the whole defect this walk exists to prove closed.
const ENTRIES = [
  entry({ id: JOURNALS.backdated, posting_date: "2026-01-15", memo: "BACKDATED January rent", created_at: "2026-04-09T00:00:00.000Z" }),
  entry({ id: JOURNALS.recent, posting_date: "2026-04-08", memo: "RECENT April utilities", origin: "document", document_id: "doc-1", created_at: "2026-04-08T00:00:00.000Z" }),
  entry({ id: JOURNALS.march, posting_date: "2026-03-03", memo: "MARCH bank charges", created_at: "2026-03-03T00:00:00.000Z" }),
  entry({ id: JOURNALS.draft, posting_date: "2026-04-10", memo: "DRAFT office supplies", status: "draft", approved_at: null, created_at: "2026-04-10T00:00:00.000Z" }),
];

function pair(entryId, cents, n) {
  return [
    { id: `${entryId}-1`, entry_id: entryId, line_no: 1, account_code: "5000", debit_cents: cents, credit_cents: 0, description: `expense ${n}`, counterparty_id: null },
    { id: `${entryId}-2`, entry_id: entryId, line_no: 2, account_code: "1000", debit_cents: 0, credit_cents: cents, description: null, counterparty_id: null },
  ];
}

const LINES = [
  ...pair(JOURNALS.backdated, 250_000, "rent"),
  ...pair(JOURNALS.recent, 43_150, "utilities"),
  ...pair(JOURNALS.march, 1_200, "charges"),
  ...pair(JOURNALS.draft, 8_800, "supplies"),
];

const ACCOUNTS = [
  { client_id: JOURNALS.clientId, account_code: "1000", name: "Cash at bank", account_type: "asset", is_active: true },
  { client_id: JOURNALS.clientId, account_code: "5000", name: "Office expenses", account_type: "expense", is_active: true },
];

/** The queue row for the ONE draft. `high_stakes: false`, so the single Approve
 *  control routes to the guarded routine door — the routing this walk observes
 *  only through the button's presence, since it never clicks it. */
const QUEUE_ROW = {
  row_kind: "draft", section: "needs_review", sort: [], client_id: JOURNALS.clientId,
  entry_id: JOURNALS.draft, document_id: null, filing_id: null, lane: "needs_review",
  high_stakes: false, aged_since: null, amount_cents: 8_800, period: "2026-04",
  created_at: "2026-04-10T00:00:00.000Z", id: JOURNALS.draft, coding_kind: null,
};

/** Transcribed from the LIVE writer's literal — `openInterruptionStep` at
 *  packages/runtime/workflows/chatTurn.v10.impl.ts:328. The panel used to read
 *  `question.text`, which no writer produces, so every card fell to the raw
 *  JSON dump. A fixture written to the panel's old expectation would have kept
 *  that green. */
const INTERRUPTION = {
  id: JOURNALS.interruptionId,
  task_id: JOURNALS.taskId,
  kind: "clarify",
  question: {
    type: "clarify",
    question: JOURNALS.question,
    context: "The invoice is dated 2026-03-31 and this client's year end is 31 March.",
    framing: "This question and its answer are visible to your firm.",
  },
  answer: null, status: "pending", asked_of: null, answered_by: null,
  expires_at: "2026-09-17T14:45:00.000Z", created_at: "2026-09-03T00:00:00.000Z", answered_at: null,
};

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

/** The PostgREST half. Returns true when it answered. */
export async function handleJournalsTableSupabase(request, response, path, url, sendJson, cors) {
  const client = url.searchParams.get("client_id");
  const ours = `eq.${JOURNALS.clientId}`;

  if (request.method === "GET" && path === "/rest/v1/clients") {
    // ID-SCOPED ONLY. The UNFILTERED read is the client REGISTER every walk
    // shares; claiming it broke another lane's navigation cell once already.
    if (url.searchParams.get("id") !== ours) return false;
    sendJson(response, 200, [CLIENT], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    if (client !== ours) return false;
    sendJson(response, 200, ENTRIES, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_lines") {
    if (client !== ours) return false;
    sendJson(response, 200, LINES, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (client !== ours) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/counterparties") {
    if (client !== ours) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_tasks_visible") {
    // The journals tab resolves each interruption's task to a client with
    // `id=in.(…)`; the chat rail reads the same relation with `session_id`.
    // Scoping on OUR task id keeps the two disjoint.
    const idFilter = url.searchParams.get("id") ?? "";
    if (!idFilter.startsWith("in.(") || !idFilter.includes(JOURNALS.taskId)) return false;
    sendJson(response, 200, [{ id: JOURNALS.taskId, client_id: JOURNALS.clientId }], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_interruptions") {
    // SHAPE-SCOPED — see this module's header for why a subject scope does not
    // exist for this read, and for the measurement that it has exactly one
    // caller. The rail's two reads both carry a filter this one never does.
    if (url.searchParams.get("status") !== "eq.pending") return false;
    if (url.searchParams.get("task_id") || url.searchParams.get("id")) return false;
    sendJson(response, 200, [INTERRUPTION], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/list_review_queue") {
    // SCOPE-SCOPED, by the RPC's own argument. `serve-built.mjs` owns the
    // firm-wide/other-client case with an empty envelope; this answers only for
    // this walk's client.
    const body = await readJson(request);
    if (body?.p_scope?.client_id !== JOURNALS.clientId) return false;
    sendJson(response, 200, {
      counts: { needs_you: 0, needs_review: 1, ready: 0, open_drafts: 1, drafts: 1, uncoded_filings: 0, open_questions: 0, compliance_watches: 0, lint_findings: 0 },
      sweep: null, compliance: null, lint: null,
      rows: [QUEUE_ROW],
      next_cursor: null,
    }, cors);
    return true;
  }

  return false;
}
