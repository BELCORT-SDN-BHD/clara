// #638's own mock lane — the staff-expense-claim journey (C1/C3/C6: the form, its derived entry,
// its refusals and its register), a file-disjoint sibling of `periodic-adjustment-mock.mjs` and
// consulted by `serve-built.mjs` through the two hooks that module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin runtime
// proxy (`app/api/runtime/[...path]/route.ts`, with its firm-scope guard and header allow-list) and
// every line of client code under test are REAL — the form's state machine, the derivation, the
// refusal→control mapping, the draft in `sessionStorage`, the register's disclosure. What is faked
// is what sits behind them: PostgREST's reads and the RUNTIME's
// `POST /api/work/staff-expense-claim`. So this walk proves the JOURNEY and the client's own wire
// shapes; it proves NOTHING about whether Postgres would accept a claim, whether
// `clara._assert_claim_basis` really refuses a control payable, or whether the advance birth
// trigger mints its allocation. `packages/db/tests/staff-expense-claim.test.mjs` and
// `packages/runtime/tests/staff-expense-claim-e2e.mjs` own those.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, TRANSCRIBED FROM THE ROUTE — never a shape invented to
// make a cell go green. Two of them carry machine-readable slots the client acts on:
//
//   400 `{ "error": "invalid_basis", "field": "claim.<camelKey>", "reason": <token> }` — `field` is
//   the DATABASE's key re-spelled camelCase by `toWireField`, which is the ONE translation that
//   route performs for this prefix, and `apps/web/lib/work/staff-expense-claim.ts`'s
//   `fieldForClaimPath` is the ONE mapper onto a control. A mock that made up a field name would
//   let a broken mapper pass a browser walk.
//
//   409 `{ "error": "intent_payload_conflict", "work_id" }` — the id of the Work that intent key
//   ALREADY names, which is what lets the form offer a route to it instead of an apology.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT, the control endpoint included, and falls
// through otherwise (`e2e-fixture-ownership.test.ts` exists because three lanes learned the hard
// way that a handler claiming a SHARED endpoint replaces everyone else's fixture). This lane claims
// no unfiltered register, no shared session list and no firm-wide read.
//
// ONE VERB IS DECLARED SHARED rather than owned: `list_accounting_work` is read by surfaces other
// lanes also drive, so this module answers it NEITHER. `staff_advance_summary` used to be shared
// the same way, until #930 gave this form's own advance-application arm a CHOOSER fed by that
// exact read: this module now answers it for its OWN client id (`SEC.clientId`) below, exactly as
// `staff-advances-register-mock.mjs` answers it for its own (`SAR.clientId`) — the two never
// collide, because each falls through the instant the request's `p_client` is not its own.
import { readCachedJson } from "./mock-dispatch.mjs";


export const SEC = {
  clientId: "63863863-6386-4638-8638-638638638638",
  clientName: "PERAK TIMBER TRADING",
  travel: "6200",
  meals: "6210",
  payable: "2010",
  control: "2000",
  bank: "1150",
  /** The account Farah's advance sits on — ENROLLED, so the form asks no enrol questions for her. */
  advance: "1190",
  /** The same shape, NEVER enrolled: choosing it is the auto-enrolment arm, and the form must ask
   *  for the three things 0043's register requires before it will enrol anybody. */
  advanceFresh: "1191",
  enrolmentId: "63863e01-6386-4638-8638-63863863e01a",
  advanceId: "63863a01-6386-4638-8638-63863863a01a",
  /** #930's own advance-chooser fixture: Farah's outstanding advance, as `staff_advance_summary`
   *  states it — booked before this walk's own claims, still carrying a balance. */
  advanceIssueDate: "2026-02-01",
  advanceOutstandingCents: 40000,
  /** #931 — Farah's SECOND open advance, booked EARLIER, so "suggest by date" has a real ordering
   *  to get right rather than a one-element list that is oldest-first by accident. */
  olderAdvanceId: "63863a02-6386-4638-8638-63863863a02a",
  olderAdvanceIssueDate: "2026-01-10",
  olderAdvanceOutstandingCents: 30000,
  /** A Work the walk's happy submit resolves to — the persistent outcome the form navigates to. */
  workId: "63809001-6380-4638-8638-638063809001",
  claimId: "63809aaa-6380-4638-8638-638063809aaa",
  /** A Work already admitted under `seededIntentKey`: a draft carrying that key with a DIFFERENT
   *  claim is the conflict arm, and the 409 names this Work. */
  seededWorkId: "63809002-6380-4638-8638-638063809002",
  seededIntentKey: "sec-seeded-intent",
  /** The register's rows: one posted claim, one still waiting on an item, one reversed. */
  postedClaimId: "63809bbb-6380-4638-8638-638063809bbb",
  waitingClaimId: "63809ccc-6380-4638-8638-638063809ccc",
  reversedClaimId: "63809ddd-6380-4638-8638-638063809ddd",
  correctionClaimId: "63809eee-6380-4638-8638-638063809eee",
  entryId: "63809f01-6380-4638-8638-638063809f01",
  receiptId: "63809f02-6380-4638-8638-638063809f02",
  reversedEntryId: "63809f03-6380-4638-8638-638063809f03",
  /** The control endpoint, as the BROWSER addresses it: the same-origin proxy maps
   *  `/api/runtime/<p>` onto the runtime's `/api/<p>`. */
  controlPath: "/api/runtime/e2e-staff-expense-claim/control",
};

const CLIENT = {
  id: SEC.clientId,
  name: SEC.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: SEC.clientId, account_code: SEC.travel, name: "Travel and Accommodation", account_type: "expense", is_active: true },
  { client_id: SEC.clientId, account_code: SEC.meals, name: "Staff Meals and Entertainment", account_type: "expense", is_active: true },
  { client_id: SEC.clientId, account_code: SEC.payable, name: "Other Payables", account_type: "liability", is_active: true },
  // THE CONTROL ACCOUNT, offered by the chart exactly as a real one is: the form does NOT hide it,
  // because hiding it would be a second, quieter answer to a question the door answers by name
  // (`payable_account_is_control`). The walk chooses it and reads that refusal.
  { client_id: SEC.clientId, account_code: SEC.control, name: "Trade Payables Control", account_type: "liability", is_active: true },
  { client_id: SEC.clientId, account_code: SEC.bank, name: "Maybank current", account_type: "asset", is_active: true },
  { client_id: SEC.clientId, account_code: SEC.advance, name: "Staff advance — Farah", account_type: "asset", is_active: true },
  { client_id: SEC.clientId, account_code: SEC.advanceFresh, name: "Staff advance — unallocated", account_type: "asset", is_active: true },
  // An INACTIVE row, so the form's `is_active` filter is exercised by a real fixture.
  { client_id: SEC.clientId, account_code: "6299", name: "Travel (retired)", account_type: "expense", is_active: false },
];

/** `clara.staff_advance_accounts` as the browser reads it under RLS — ONE live enrolment, so the
 *  form can tell "this person already has an account" from "this is somebody new". */
const ENROLMENTS = [
  { id: SEC.enrolmentId, account_code: SEC.advance, person_label: "Farah binti Idris" },
];

/** The register `clara.list_staff_expense_claims` answers with — the function's own projection,
 *  field for field. Three rows, so the walk reads the three states a claim can be in rather than
 *  only a happy one. */
const HISTORY = [
  {
    id: SEC.postedClaimId,
    work_id: SEC.seededWorkId,
    logical_op_id: `work:${SEC.seededWorkId}:journal_entry:1`,
    claimant_enrolment_id: SEC.enrolmentId,
    claimant_label: "Farah binti Idris",
    claimant_identifier: "EMP-0042",
    source_kind: "instruction",
    source_document_id: null,
    instruction: "Farah's March travel claim, two receipts she emailed in.",
    incurred_date: "2026-03-04",
    posting_date: "2026-03-31",
    items: [
      { description: "KL–Penang return flight", expense_account_code: SEC.travel, amount_cents: 48000,
        supplied_tax: { note: "SR 6% shown as RM28.80" } },
      { description: "Client dinner", expense_account_code: SEC.meals, amount_cents: 12500 },
    ],
    amount_cents: 60500,
    currency: "MYR",
    settlement: "reimbursement",
    payable_account_code: SEC.payable,
    advance_account_code: null,
    payment_account_code: null,
    advance_id: null,
    corrects_claim_id: null,
    corrected_by_claim_id: null,
    recorded_by: "00000000-0000-4000-8000-000000000001",
    on_behalf_of: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-04-01T02:00:00.000Z",
    receipt_id: SEC.receiptId,
    entry_id: SEC.entryId,
    entry_status: "approved",
    reversed_by: null,
    pending_item_count: 0,
  },
  {
    id: SEC.waitingClaimId,
    work_id: "63809003-6380-4638-8638-638063809003",
    logical_op_id: "work:63809003-6380-4638-8638-638063809003:journal_entry:1",
    claimant_enrolment_id: SEC.enrolmentId,
    claimant_label: "Farah binti Idris",
    claimant_identifier: "EMP-0042",
    source_kind: "instruction",
    source_document_id: null,
    instruction: "April claim; the taxi receipt has no date on it.",
    incurred_date: "2026-04-02",
    posting_date: "2026-04-30",
    items: [
      { description: "Airport transfer", expense_account_code: SEC.travel, amount_cents: 9000 },
      // AC6's EXPLICIT MISSING FACT: the line is on the record, it posted nothing, and it says what
      // it is waiting for rather than being given an invented date.
      { description: "Taxi, receipt undated", pending_fact: "incurred_date" },
    ],
    amount_cents: 9000,
    currency: "MYR",
    settlement: "advance_application",
    payable_account_code: null,
    advance_account_code: SEC.advance,
    payment_account_code: null,
    advance_id: SEC.advanceId,
    corrects_claim_id: null,
    corrected_by_claim_id: null,
    recorded_by: "00000000-0000-4000-8000-000000000001",
    on_behalf_of: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-05-01T02:00:00.000Z",
    receipt_id: SEC.receiptId,
    entry_id: SEC.entryId,
    entry_status: "approved",
    reversed_by: null,
    pending_item_count: 1,
  },
  {
    id: SEC.reversedClaimId,
    work_id: "63809004-6380-4638-8638-638063809004",
    logical_op_id: "work:63809004-6380-4638-8638-638063809004:journal_entry:1",
    claimant_enrolment_id: SEC.enrolmentId,
    claimant_label: "Farah binti Idris",
    claimant_identifier: "EMP-0042",
    source_kind: "instruction",
    source_document_id: null,
    instruction: "February claim, wrong amount.",
    incurred_date: "2026-02-04",
    posting_date: "2026-02-28",
    items: [{ description: "Hotel", expense_account_code: SEC.travel, amount_cents: 33000 }],
    amount_cents: 33000,
    currency: "MYR",
    settlement: "already_settled",
    payable_account_code: null,
    advance_account_code: null,
    payment_account_code: SEC.bank,
    advance_id: null,
    corrects_claim_id: null,
    // THE CORRECTION CHAIN, BOTH WAYS — the database keeps both pointers so a reader arriving at
    // either end can reach the other.
    corrected_by_claim_id: SEC.correctionClaimId,
    recorded_by: "00000000-0000-4000-8000-000000000001",
    on_behalf_of: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-03-01T02:00:00.000Z",
    receipt_id: SEC.receiptId,
    entry_id: SEC.reversedEntryId,
    entry_status: "approved",
    // A REVERSED original keeps `status='approved'` and gains `reversed_by` — the estate's own
    // shape, and the reason the register badges it rather than hiding it.
    reversed_by: "63809f04-6380-4638-8638-638063809f04",
    pending_item_count: 0,
  },
];

/** THE PARSE IS CACHED ON THE REQUEST — `periodic-adjustment-mock.mjs`'s own measured note applies
 *  verbatim: `for await (const chunk of request)` drains the stream exactly once, so an uncached
 *  re-read after a sibling hook has already read it sees `{}` and falls through silently. */
function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

/** The lane's own mutable state. `intents` is the mock's MODEL of
 *  `clara.admit_staff_expense_claim_work`'s `(firm, client, intent_key)` idempotency — modelled
 *  rather than asserted about, because that is the behaviour the form's lost-response arm is
 *  written against, so faking it faithfully is what makes that cell mean anything. */
const state = {
  intents: new Map(),
  nextRefusal: null,
  received: [],
  emptyHistory: false,
};

// ---------------------------------------------------------------------------------------------
// The PostgREST half.
// ---------------------------------------------------------------------------------------------

export async function handleStaffExpenseClaimSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id === SEC.clientId) {
      sendJson(response, 200, [CLIENT], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client === SEC.clientId) {
      sendJson(response, 200, ACCOUNTS, cors);
      return true;
    }
    return false;
  }

  // THE ENROLMENT REGISTER, read DIRECTLY under RLS rather than through a wrapper door (DECISIONS
  // §1.7's rule for `entry_evidence_links`, applied to the two columns this form needs).
  if (request.method === "GET" && path === "/rest/v1/staff_advance_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== SEC.clientId) return false;
    sendJson(response, 200, ENROLMENTS, cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  if (verb === "list_staff_expense_claims") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SEC.clientId) return false;
    // THE WINDOW IS THE DATABASE'S FILTER, and the mock applies it for the same reason it models
    // the idempotency: the surface's own behaviour is written against a filtered answer.
    const from = typeof body?.p_from === "string" ? body.p_from : null;
    const to = typeof body?.p_to === "string" ? body.p_to : null;
    const rows = state.emptyHistory
      ? []
      : HISTORY.filter((r) => (from === null || r.posting_date >= from) && (to === null || r.posting_date <= to));
    sendJson(response, 200, rows, cors);
    return true;
  }

  if (verb === "get_staff_expense_claim") {
    const body = await readCachedJson(request);
    const row = HISTORY.find((r) => r.id === body?.p_claim) ?? null;
    if (row === null) return false;
    sendJson(response, 200, { ...row, status: [], advance_applications: [] }, cors);
    return true;
  }

  if (verb === "get_work_claim_origin") {
    const body = await readCachedJson(request);
    const row = HISTORY.find((r) => r.work_id === body?.p_work) ?? null;
    if (row === null) return false;
    sendJson(response, 200, {
      claim_id: row.id,
      settlement: row.settlement,
      claimant_enrolment_id: row.claimant_enrolment_id,
      claimant_label: row.claimant_label,
      amount_cents: row.amount_cents,
      currency: row.currency,
      incurred_date: row.incurred_date,
      posting_date: row.posting_date,
      item_count: row.items.length,
      pending_item_count: row.pending_item_count,
      corrects_claim_id: row.corrects_claim_id,
      corrected_by_claim_id: row.corrected_by_claim_id,
    }, cors);
    return true;
  }

  // #930 — THE ADVANCE CHOOSER'S OWN READ, owned here for `SEC.clientId` only (this file's own
  // header explains why this verb is no longer left to the register lane alone). #931 gives Farah
  // a SECOND open advance, booked earlier: two real options, so the date-ordered suggestion has an
  // ordering to get right and the allocation list has something to split.
  if (verb === "staff_advance_summary") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SEC.clientId) return false;
    sendJson(response, 200, {
      client_id: SEC.clientId,
      as_of: typeof body?.p_as_of === "string" ? body.p_as_of : "2026-03-31",
      advances: [
        {
          enrolment_id: SEC.enrolmentId,
          account_code: SEC.advance,
          person_label: "Farah binti Idris",
          advance_id: SEC.advanceId,
          issue_date: SEC.advanceIssueDate,
          amount_cents: 100000,
          outstanding_cents: SEC.advanceOutstandingCents,
          days_outstanding: 30,
          purpose: null,
          reference: null,
          voided: false,
          particulars_complete: false,
          enrolment_active: true,
        },
        {
          enrolment_id: SEC.enrolmentId,
          account_code: SEC.advance,
          person_label: "Farah binti Idris",
          advance_id: SEC.olderAdvanceId,
          issue_date: SEC.olderAdvanceIssueDate,
          amount_cents: 60000,
          outstanding_cents: SEC.olderAdvanceOutstandingCents,
          days_outstanding: 80,
          purpose: null,
          reference: null,
          voided: false,
          particulars_complete: true,
          enrolment_active: true,
        },
      ],
      outstanding_cents: SEC.advanceOutstandingCents + SEC.olderAdvanceOutstandingCents,
      incomplete_count: 1,
      policy_notes: [],
    }, cors);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------------------------
// The RUNTIME half.
// ---------------------------------------------------------------------------------------------

export async function handleStaffExpenseClaimRuntime(request, response, url) {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/e2e-staff-expense-claim/control") {
    const body = await readCachedJson(request);
    // SCOPED LIKE EVERY OTHER HANDLER HERE: a control endpoint that mutates shared fixture state
    // for ANY body is a lane claiming a shared endpoint.
    if (body?.client !== SEC.clientId) return false;
    if (body?.op === "refuse_next") {
      state.nextRefusal = {
        field: String(body.field ?? "claim.payableAccountCode"),
        reason: String(body.reason ?? "payable_account_is_control"),
      };
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "seed_intent") {
      // PLANTED WITH A PAYLOAD NOTHING CAN EQUAL, so every submit under this key is the CONFLICT
      // arm rather than a replay — the state the database produces for a key that already names a
      // different claim.
      state.intents.set(SEC.seededIntentKey, { workId: SEC.seededWorkId, payload: null });
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

  if (request.method === "POST" && path === "/api/work/staff-expense-claim") {
    const body = await readCachedJson(request);
    // SCOPED BY THE REQUEST'S OWN CLIENT — another lane's admission falls through to the shared
    // fallback rather than being answered with this lane's Work.
    if (body?.clientId !== SEC.clientId) return false;
    const intentKey = String(body?.intentKey ?? "");
    state.received.push({
      intentKey,
      claim: body?.claim ?? null,
      sourceRefs: body?.sourceRefs ?? null,
    });
    // NO DROPPED-SOCKET ARM LIVES HERE — `periodic-adjustment-mock.mjs`'s measured note applies
    // verbatim: a fixture that destroyed its own socket reaches the page as the proxy's OWN 502,
    // which the client classifies as `unavailable`. The `lost` arm needs the request to REACH this
    // handler and the ANSWER to vanish on the way back, which only `page.route` can do.
    if (state.nextRefusal !== null) {
      const refusal = state.nextRefusal;
      state.nextRefusal = null;
      send(response, 400, { error: "invalid_basis", field: refusal.field, reason: refusal.reason });
      return true;
    }
    // THE PAYLOAD THIS KEY STANDS FOR — the JSON the client itself built, deterministic across two
    // submits of one draft, as the fixture's stand-in for the database's own canonical claim.
    const payload = JSON.stringify({ claim: body?.claim ?? null, sourceRefs: body?.sourceRefs ?? null });
    const known = state.intents.get(intentKey);
    if (known !== undefined) {
      // ONE INTENT KEY, TWO ARMS, as the database defines them.
      if (known.payload !== null && known.payload === payload) {
        send(response, 202, {
          work_id: known.workId,
          task_id: "73809001-7380-4738-8738-738073809001",
          logical_op_id: `work:${known.workId}:journal_entry:1`,
          status: "queued",
          replayed: true,
          claim_id: SEC.claimId,
        });
        return true;
      }
      send(response, 409, { error: "intent_payload_conflict", work_id: known.workId });
      return true;
    }
    state.intents.set(intentKey, { workId: SEC.workId, payload });
    send(response, 202, {
      work_id: SEC.workId,
      task_id: "73809001-7380-4738-8738-738073809001",
      // THE UNWIDENED PURPOSE, on the wire, exactly as the database mints it: a staff expense claim
      // is a `journal_entry` Work (migration 0221's header says why a fourth purpose cannot post).
      logical_op_id: `work:${SEC.workId}:journal_entry:1`,
      status: "queued",
      replayed: false,
      claim_id: SEC.claimId,
    });
    return true;
  }

  return false;
}
