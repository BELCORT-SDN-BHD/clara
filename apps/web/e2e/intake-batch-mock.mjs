// #636's own mock lane — a file-disjoint sibling of `documents-intake-mock.mjs`, consulted by
// `serve-built.mjs` through TWO hooks (one PostgREST, one runtime). Every branch below is scoped
// to THIS lane's own batch ids and falls through otherwise (`e2e-fixture-ownership.test.ts`'s own
// discipline).
//
// IT READS THE REQUEST BODY ONLY INSIDE A MATCHED VERB, and through the SHARED reader
// (`mock-dispatch.mjs`'s `readCachedJson`). A private reader would DRAIN the stream for every lane
// dispatched after this one — the measured hazard `work-list-mock.mjs`'s own header records.
//
// IT REUSES `documents-intake-mock.mjs`'s CLIENT, deliberately. The batch card mounts INSIDE that
// lane's workbench, and a second client id would mean re-answering that lane's whole surface (the
// filed list, the candidates, the firm clients, the receipts, the capability registry) just to get
// a card on screen. The ONE new verb this lane answers is `get_intake_batch`; every other read on
// that page stays the documents-intake lane's, which is why `SHARED_RPC_VERBS` gains nothing.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of
// `components/documents/intake-batch-*.tsx` / `lib/documents/intake-batch*.ts` under test are REAL.
// What is faked is PostgREST's `clara.get_intake_batch` and the runtime's two batch routes. So this
// walk proves the JOURNEY — the derived summary, the deep link, Back, the facet filter's
// no-results face, the denied face, stopping-then-receipts, 320 px, 200 % zoom, reduced motion,
// keyboard and axe — and nothing about whether Postgres would return this envelope;
// `packages/db/tests/intake-batch.test.mjs` owns that half and
// `packages/runtime/tests/intake-batch-e2e.mjs` owns the real-World one.

import { readCachedJson as readJson } from "./mock-dispatch.mjs";
import { DOCS_INTAKE } from "./documents-intake-mock.mjs";

// THIS LANE MINTS NO CLIENT ID, and that is the point of reusing the documents-intake lane's: the
// `clientIdCensus` gate in `e2e-fixture-ownership.test.ts` forbids two lanes minting one client,
// and re-declaring that lane's id here would be exactly the collision it exists to catch. The walk
// spec names the client; this file gates only on its OWN batch ids.
export const INTAKE_BATCH = {
  /** The MIXED batch: children settling, waiting, failing and unassigned at once. */
  batchId: "b6360000-6360-4360-8360-b63600000001",
  /** A batch whose facets are all zero — the successful-EMPTY face. */
  emptyBatchId: "b6360000-6360-4360-8360-b63600000002",
  /** Every read of this one refuses CLR04 — the DENIED face. */
  deniedBatchId: "b6360000-6360-4360-8360-b63600000003",
  /** A well-formed id this lane deliberately did not mint — the not-found arm. */
  missingBatchId: "b6360000-6360-4360-8360-b63600000fff",
  workId: "b6360000-7360-4360-8360-b63600000101",
  settledWorkId: "b6360000-7360-4360-8360-b63600000102",
  documentId: "b6360000-8360-4360-8360-b63600000201",
};

// The client the walk drives, imported from the lane that MINTS it rather than re-declared here.
const WALK_CLIENT = DOCS_INTAKE.clientId;

const OWNED = new Set([INTAKE_BATCH.batchId, INTAKE_BATCH.emptyBatchId, INTAKE_BATCH.deniedBatchId]);

/** The parent's state, advanced ONLY by this lane's own cancel route — so the walk can press Stop
 *  and then observe `cancelling` on the very next read, exactly as the real card does. */
let batchState = "open";
export function resetIntakeBatchMock() { batchState = "open"; }

const facet = (count, rows, extra = {}) => ({
  status: "ok", count, coverage: "ok", coverage_reason: null, rows, ...extra,
});

function mixedBody() {
  return {
    computed_at: "2026-04-05T02:00:00.000Z",
    preview_limit: 10,
    // FIX ROUND 1: the door answers these two, so the mock does too — a fixture that omits a key
    // the real read returns is how a surface comes to depend on a shape production never sends.
    cancel_blocked: null,
    pending_members: 0,
    batch: {
      id: INTAKE_BATCH.batchId, label: "April sources", origin: "documents_tab",
      state: batchState, opened_by: "11111111-1111-1111-1111-111111111111",
      opened_at: "2026-04-05T01:00:00.000Z",
      cancel_requested_at: batchState === "open" ? null : "2026-04-05T02:00:00.000Z",
    },
    facets: {
      admitted: facet(2, [
        {
          member_id: "m6360001", work_id: INTAKE_BATCH.workId, client_id: WALK_CLIENT,
          document_id: INTAKE_BATCH.documentId, work_status: "running", purpose: "journal_entry",
          memo: "April rent", attempts: 2, current_run_status: "running", retrying: true,
          created_at: "2026-04-05T01:10:00.000Z",
        },
        {
          member_id: "m6360002", work_id: INTAKE_BATCH.settledWorkId, client_id: WALK_CLIENT,
          document_id: INTAKE_BATCH.documentId, work_status: "completed", purpose: "journal_entry",
          memo: "April utilities", attempts: 1, current_run_status: null, retrying: false,
          created_at: "2026-04-05T01:11:00.000Z",
        },
      ]),
      settled: facet(1, [
        {
          member_id: "m6360002", work_id: INTAKE_BATCH.settledWorkId, client_id: WALK_CLIENT,
          receipt_id: "r6360001", entry_id: "e6360001", committed_at: "2026-04-05T01:40:00.000Z",
        },
      ], { uncounted_completions: 0 }),
      waiting: facet(1, [
        {
          member_id: "m6360003", intake_id: "i6360003", document_id: "d6360003", work_id: null,
          client_id: null, dependency: "awaiting_capacity",
          dependency_reason: "document daily limit reached (docs)", filename: "receipt-88.pdf",
          intake_status: "finalized", intake_failure_code: null, has_open_question: false,
          created_at: "2026-04-05T01:20:00.000Z",
        },
      ]),
      // ZERO rows while the others have rows — the NO-RESULTS face the facet filter must render.
      failed: facet(0, []),
      unassigned: facet(1, [
        {
          member_id: "m6360004", intake_id: "i6360004", document_id: "d6360004",
          filename: "unknown-scan.pdf", intake_status: "finalized",
          created_at: "2026-04-05T01:30:00.000Z",
        },
      ]),
    },
    waiting_basis: {
      by_question: 0,
      by_dependency: { awaiting_fact: 0, awaiting_attribution: 0, awaiting_capacity: 1 },
      by_unfiled: 1, by_capacity_failure: 0,
    },
    // #964: the daily window moved from a UTC day (utc_day/08:00) to an Asia/Kuala_Lumpur day.
    capacity: { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" },
  };
}

function emptyBody() {
  return {
    computed_at: "2026-04-05T02:00:00.000Z",
    preview_limit: 10,
    cancel_blocked: null,
    pending_members: 0,
    batch: {
      id: INTAKE_BATCH.emptyBatchId, label: "May sources", origin: "documents_tab", state: "open",
      opened_by: "11111111-1111-1111-1111-111111111111", opened_at: "2026-05-01T01:00:00.000Z",
      cancel_requested_at: null,
    },
    facets: {
      admitted: facet(0, []), settled: facet(0, [], { uncounted_completions: 0 }),
      waiting: facet(0, []), failed: facet(0, []), unassigned: facet(0, []),
    },
    waiting_basis: {
      by_question: 0,
      by_dependency: { awaiting_fact: 0, awaiting_attribution: 0, awaiting_capacity: 0 },
      by_unfiled: 0, by_capacity_failure: 0,
    },
    // #964: the daily window moved from a UTC day (utc_day/08:00) to an Asia/Kuala_Lumpur day.
    capacity: { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" },
  };
}

/** PostgREST half — ONE new verb, and it falls through on a batch this lane did not mint. */
export async function handleIntakeBatchSupabase(request, response, path, url, sendJson, cors) {
  void url;
  if (request.method !== "POST" || path !== "/rest/v1/rpc/get_intake_batch") return false;
  const body = await readJson(request);
  const batch = body?.p_batch;
  if (typeof batch !== "string" || !OWNED.has(batch)) return false; // not mine — the next lane may answer
  if (batch === INTAKE_BATCH.deniedBatchId) {
    sendJson(response, 400, {
      code: "CLR04", message: "insufficient role", details: null,
      hint: null, detail: JSON.stringify({ reason: "insufficient_role" }),
    }, cors);
    return true;
  }
  sendJson(response, 200, batch === INTAKE_BATCH.emptyBatchId ? emptyBody() : mixedBody(), cors);
  return true;
}

/** Runtime half — TWO routes. Both are matched by REGEX because the cancel path carries an id, so
 *  `e2e-fixture-ownership.test.ts`'s path census cannot see either of them at all; the lane's own
 *  declaration says so in those words rather than claiming a clean file (the
 *  `journal-work-mock.mjs` precedent recorded at `e2e-fixture-ownership.test.ts:303-309`). */
const OPEN_RE = /^\/api\/intake\/batches\/?$/;
const CANCEL_RE = /^\/api\/intake\/batches\/([0-9a-f-]{36})\/cancel$/i;

export async function handleIntakeBatchRuntime(request, response, url) {
  if (request.method !== "POST") return false;
  const path = url.pathname;

  if (OPEN_RE.test(path)) {
    const body = await readJson(request);
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({
      batch_id: INTAKE_BATCH.batchId, label: body?.label ?? "April sources",
      origin: body?.origin ?? "documents_tab", state: "open",
      opened_at: "2026-04-05T01:00:00.000Z", replayed: false,
    }));
    return true;
  }

  const cancel = CANCEL_RE.exec(path);
  if (cancel) {
    const batch = cancel[1];
    if (!OWNED.has(batch)) return false; // an id this lane did not mint is nobody's business here
    await readJson(request);
    batchState = "cancelling";
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({
      batch_id: batch, state: "cancelling", cancel_op_key: "walk-decision",
      cancel_requested_by: "11111111-1111-1111-1111-111111111111",
      children: [{ member_id: "m6360001", work_id: INTAKE_BATCH.workId }],
      pending_members: 0,
      fanned_out: 1, deferred: 0, refused: 0,
    }));
    return true;
  }
  return false;
}
