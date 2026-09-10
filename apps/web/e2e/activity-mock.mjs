// #632's own mock lane — a file-disjoint sibling of `home-board-mock.mjs`/`tax-boundary-mock.mjs`,
// consulted by `serve-built.mjs` through ONE hook. Every branch below is scoped to THIS lane's
// own client ids and falls through otherwise (e2e-fixture-ownership.test.ts's own discipline).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of
// `components/firm/activity/*`/`lib/firm/activity.ts` under test are REAL. What is faked is
// PostgREST: `clara.list_activity`/`clara.get_activity_event` themselves, including the 400
// CLR-shaped refusals this walk needs for the permission-flip and denied-detail states. So this
// walk proves the JOURNEY — filters, pagination, the event Sheet, keyboard/focus/narrow layout,
// reduced motion, stable URL/Back — and nothing about whether Postgres would actually return
// this union; `packages/db/tests/activity-feed.test.mjs` owns that half.
//
// TWO CLIENTS:
//   ACTIVITY.clientId      — the main fixture: an 8-row first page (upload, posting, a
//                            correction PAIR, a close event, an agent-receipt, a conversation-
//                            maintenance event, and a report-kind row) that is `truncated`, and
//                            a second page carrying one new row PLUS a DELIBERATE duplicate of
//                            the first page's document row (the load-more dedupe cell).
//   ACTIVITY.flipClientId  — a second, otherwise-empty client whose `list_activity` call COUNT
//                            (per this server's lifetime — safe only because playwright.config.ts
//                            pins `workers: 1`, the same precondition journal-work-mock.mjs's own
//                            header states for its equivalent counter) succeeds ONCE and then
//                            answers CLR04 — the live permission-loss cell fires a focus/
//                            visibilitychange event and expects that SECOND call to be the one
//                            that clears the list.
//
// get_activity_event: an id-scoped happy path for the main client's own rows, PLUS one FIXED id
// (`ACTIVITY.deniedEventId`) that always refuses CLR11 — the denied-detail cell opens that id via
// a direct `?event=` deep link (never through a row click), so its own close path (no push to pop)
// is exercised for real too.

export const ACTIVITY = {
  clientId: "a2a2a2a2-1111-4777-8777-a2a2a2a20001",
  clientName: "Activity Feed Fixture",
  flipClientId: "a2a2a2a2-1111-4777-8777-a2a2a2a20002",
  flipClientName: "Activity Permission-Flip Fixture",
  deniedEventId: "00000000-0000-0000-0000-00000000ffff",
  // The document/entry/work ids the fixture rows below name — exported so the spec can assert
  // against them without re-deriving a literal.
  documentEventId: "a2a2a2a2-2222-4777-8777-a2a2a2a20101",
  documentId: "a2a2a2a2-2222-4777-8777-a2a2a2a20102",
  workReceiptId: "a2a2a2a2-2222-4777-8777-a2a2a2a20103",
  workId: "a2a2a2a2-2222-4777-8777-a2a2a2a20104",
  entryOriginalId: "a2a2a2a2-2222-4777-8777-a2a2a2a20105",
  entryReplacementId: "a2a2a2a2-2222-4777-8777-a2a2a2a20106",
  correctionOriginalEventId: "a2a2a2a2-2222-4777-8777-a2a2a2a20107",
  correctionReplacementEventId: "a2a2a2a2-2222-4777-8777-a2a2a2a20108",
  closeEventId: "a2a2a2a2-2222-4777-8777-a2a2a2a20109",
  page2NewEventId: "a2a2a2a2-2222-4777-8777-a2a2a2a2010a",
};

const PAGE_2_CURSOR = "activity-mock-page-2";

const SUBJECT = "11111111-1111-1111-1111-111111111111";

function clientRow(id, name) {
  return { id, name, status: "active", created_at: "2026-01-01T00:00:00.000Z" };
}

/** Spliced into `serve-built.mjs`'s own shared `clients` array — the SAME append shape that
 *  file's `sessions` array already takes for `P6_5_SESSIONS`/`JOURNAL_WORK_SESSIONS`. That
 *  array (unlike `sessions`) has no lane-contribution mechanism today, so the Activity feed's
 *  own client Select — the one consumer in this whole train that reads the UNFILTERED register
 *  rather than one id — is the first to need one. Appending, never replacing, is what keeps this
 *  lane from being the "answers a shared endpoint with its own data" hazard
 *  `e2e-fixture-ownership.test.ts` exists to catch: `firm-navigation-walk.spec.ts` and others
 *  still see exactly Rome Properties/Bee Creative Solution plus these two, never a narrowed list. */
export const ACTIVITY_CLIENTS = [
  clientRow(ACTIVITY.clientId, ACTIVITY.clientName),
  clientRow(ACTIVITY.flipClientId, ACTIVITY.flipClientName),
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

function eventRow(over) {
  return {
    source: "event", event_type: null, description: null, client_id: ACTIVITY.clientId,
    actor: SUBJECT, on_behalf_of: null, via_wake_kind: null, object_kind: null, object_id: null,
    work_id: null, receipt_id: null, document_id: null, original_entry_id: null,
    replacement_entry_id: null, status: null, kind: "documents",
    ...over,
  };
}

const DOCUMENT_ROW = eventRow({
  id: ACTIVITY.documentEventId,
  event_type: "document.filed",
  description: "A document was actively filed to a client.",
  occurred_at: "2026-09-01T01:00:00.000Z",
  object_kind: "document", object_id: ACTIVITY.documentId, document_id: ACTIVITY.documentId,
  kind: "documents",
});

const WORK_ROW = eventRow({
  id: ACTIVITY.workReceiptId,
  source: "operation_receipt",
  event_type: "journal_entry",
  occurred_at: "2026-09-01T02:00:00.000Z",
  object_kind: "entry", object_id: ACTIVITY.entryOriginalId,
  work_id: ACTIVITY.workId, receipt_id: ACTIVITY.workReceiptId,
  status: "approved", kind: "work",
});

// A CORRECTION PAIR — the original (now reversed) and its replacement, exactly the two-sided
// link `packages/db/tests/activity-feed.test.mjs`'s af.7 cell proves against the real door.
const CORRECTION_ORIGINAL_ROW = eventRow({
  id: ACTIVITY.correctionOriginalEventId,
  event_type: "entry.reversed",
  description: "A posted entry was reversed.",
  occurred_at: "2026-09-01T03:00:00.000Z",
  object_kind: "entry", object_id: ACTIVITY.entryOriginalId,
  status: "reversed", replacement_entry_id: ACTIVITY.entryReplacementId,
  kind: "journal",
});
const CORRECTION_REPLACEMENT_ROW = eventRow({
  id: ACTIVITY.correctionReplacementEventId,
  event_type: "entry.approved",
  description: "An approved entry was recorded.",
  occurred_at: "2026-09-01T03:00:01.000Z",
  object_kind: "entry", object_id: ACTIVITY.entryReplacementId,
  status: "approved", original_entry_id: ACTIVITY.entryOriginalId,
  kind: "journal",
});

const CLOSE_ROW = eventRow({
  id: ACTIVITY.closeEventId,
  event_type: "close.begun",
  description: "A fiscal period close was begun.",
  occurred_at: "2026-09-01T04:00:00.000Z",
  kind: "close",
});

// Conversation-maintenance-shaped knowledge upkeep — falls into this door's 'documents' catch-all
// grouping (0181's own header: "account./client./firm./wiki. ... falls into 'documents'").
const CONVERSATION_MAINTENANCE_ROW = eventRow({
  id: "a2a2a2a2-2222-4777-8777-a2a2a2a2010b",
  event_type: "client.fact_recorded",
  description: "A client fact was recorded.",
  occurred_at: "2026-09-01T05:00:00.000Z",
  kind: "documents",
});

const AGENT_RECEIPT_ROW = eventRow({
  id: "agent_filing:a2a2a2a2-2222-4777-8777-a2a2a2a2010c",
  source: "agent_receipt",
  receipt_id: "agent_filing:a2a2a2a2-2222-4777-8777-a2a2a2a2010c",
  occurred_at: "2026-09-01T06:00:00.000Z",
  kind: "agent",
});

// A 'report' kind row — report_agent is an UNWIRED receipt kind on the real estate today
// (lib/firm/receipt-kinds.ts's own census), so this is a REPRESENTATIVE fixture for the filter
// group, not a claim that a real report_agent row exists anywhere yet.
const REPORT_ROW = eventRow({
  id: "report_agent:a2a2a2a2-2222-4777-8777-a2a2a2a2010d",
  source: "agent_receipt",
  receipt_id: "report_agent:a2a2a2a2-2222-4777-8777-a2a2a2a2010d",
  occurred_at: "2026-09-01T07:00:00.000Z",
  kind: "report",
});

const PAGE_1 = [
  REPORT_ROW, AGENT_RECEIPT_ROW, CONVERSATION_MAINTENANCE_ROW, CLOSE_ROW,
  CORRECTION_REPLACEMENT_ROW, CORRECTION_ORIGINAL_ROW, WORK_ROW, DOCUMENT_ROW,
].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

const PAGE_2_NEW_ROW = eventRow({
  id: ACTIVITY.page2NewEventId,
  event_type: "document.extraction_completed",
  description: "Vendor-neutral document extraction completed.",
  occurred_at: "2026-08-31T23:00:00.000Z",
  object_kind: "document", object_id: ACTIVITY.documentId, document_id: ACTIVITY.documentId,
  kind: "documents",
});

// PAGE 2 carries the new row AND a DUPLICATE of page 1's document row — the load-more
// dedupe-by-(source,id) cell.
const PAGE_2 = [PAGE_2_NEW_ROW, DOCUMENT_ROW];

let flipCallCount = 0;

function clr(status, code, message) {
  return { status, body: { code, message, details: JSON.stringify({ reason: "e2e_permission_flip" }) } };
}

export async function handleActivitySupabase(request, response, path, url, sendJson, cors) {
  // `/rest/v1/clients` (both id-scoped and unfiltered) is answered by serve-built.mjs's OWN
  // generic handler now that `ACTIVITY_CLIENTS` is spliced into its shared `clients` array — see
  // that export's own header for why this lane does not intercept the route itself.

  if (request.method === "POST" && path === "/rest/v1/rpc/list_activity") {
    const body = await readJson(request);
    if (body.p_client === ACTIVITY.flipClientId) {
      flipCallCount += 1;
      if (flipCallCount === 1) {
        sendJson(response, 200, { rows: [], next_cursor: null, truncated: false }, cors);
        return true;
      }
      const { status, body: refusal } = clr(400, "CLR04", "insufficient role");
      sendJson(response, status, refusal, cors);
      return true;
    }
    if (body.p_client === ACTIVITY.clientId || body.p_client === null || body.p_client === undefined) {
      if (body.p_cursor === PAGE_2_CURSOR) {
        sendJson(response, 200, { rows: PAGE_2, next_cursor: null, truncated: false }, cors);
        return true;
      }
      const kinds = Array.isArray(body.p_kinds) ? body.p_kinds : null;
      const rows = kinds ? PAGE_1.filter((r) => kinds.includes(r.kind)) : PAGE_1;
      sendJson(response, 200, { rows, next_cursor: kinds ? null : PAGE_2_CURSOR, truncated: !kinds }, cors);
      return true;
    }
    return false;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_activity_event") {
    const body = await readJson(request);
    if (body.p_source === "event" && body.p_id === ACTIVITY.deniedEventId) {
      const { status, body: refusal } = clr(400, "CLR11", "activity event not found");
      sendJson(response, status, refusal, cors);
      return true;
    }
    const all = [...PAGE_1, ...PAGE_2];
    const match = all.find((r) => r.source === body.p_source && r.id === body.p_id);
    if (match) {
      sendJson(response, 200, { ...match, client_name: ACTIVITY.clientName }, cors);
      return true;
    }
    return false;
  }

  return false;
}
