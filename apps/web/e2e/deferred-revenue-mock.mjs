// #941's deferred-revenue lane mock — a file-disjoint sibling of `prepayments-mock.mjs`, consulted
// by `serve-built.mjs` through ONE hook, exactly as that module's own header describes for itself.
// Every id below carries the `-9411-4941-8941-941941941941` tail, so this lane's address space is
// its own and `e2e-fixture-ownership.test.ts`'s client-id census sees one lane per address. EVERY
// handler is ID-SCOPED (each falls through with `return false` for a subject that is not this
// lane's), so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the attention band, the term-source filter, the configure form and its
// validator, the disabled allocation preview, the schedule detail, the layout. What is faked is
// PostgREST: the three recognition read doors and the one write door. So this walk proves the
// JOURNEY and what the surface does with the database's answers; it proves NOTHING about whether
// Postgres really derives a twelve-month allocation that clears the liability to zero, really
// leaves the SST output leg where the invoice put it, or really refuses a pattern other than
// straight line. `packages/db/tests/revenue-recognition.test.mjs` owns those against a real
// Postgres, cell by cell.
//
// THE FIXTURE IS STATEFUL IN EXACTLY ONE WAY, and it is the walk's own journey:
// `create_revenue_recognition_schedule` REFUSES the first attempt with the database's own
// `deferred_revenue_term_underivable` and succeeds on the second. That is the create-time residue:
// the advance has posted and the schedule has not, so the form must keep the draft, name the
// refusal verbatim and say the liability is still on the books.

// THE SHARED READER AND THE NAMED GUARD (`mock-dispatch.mjs`). `matchVerb` runs BEFORE
// `readCachedJson`, so a verb this lane does not own never touches the stream.
import { readCachedJson as readJson, matchVerb } from "./mock-dispatch.mjs";

export const DEFREV = {
  firmId: "94100000-9411-4941-8941-941941941941",
  clientId: "94133333-9411-4941-8941-941941941941",
  scheduleId: "94111111-9411-4941-8941-941941941941",
  planId: "94122222-9411-4941-8941-941941941941",
  /** The advance the FULL-YEAR schedule recognises. */
  entryId: "94144444-9411-4941-8941-941941941941",
  /** The advance the walk configures: posted, enrolled account, a live term, no schedule yet. */
  unrecognisedEntryId: "94155555-9411-4941-8941-941941941941",
  /** A memo-only advance: it binds no document, so a person states its service period. */
  memoEntryId: "94166666-9411-4941-8941-941941941941",
  documentId: "94177777-9411-4941-8941-941941941941",
  workId: "94188888-9411-4941-8941-941941941941",
  enrolmentId: "94199999-9411-4941-8941-941941941941",
  newScheduleId: "941aaaaa-9411-4941-8941-941941941941",
  newPlanId: "941bbbbb-9411-4941-8941-941941941941",
  purpose: "Annual membership, recognised monthly",
  newPurpose: "Rent received in advance, recognised monthly",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readJson`'s own call
 *  site guards on, so a verb this lane does not own never has its request stream drained. */
export const DEFREV_RPC_VERBS = new Set([
  "list_revenue_recognition_schedules",
  "get_revenue_recognition_schedule",
  "list_revenue_recognition_attention",
  "create_revenue_recognition_schedule",
]);

const state = { refusedOnce: false, created: false };

export function resetDeferredRevenue() {
  state.refusedOnce = false;
  state.created = false;
}

const CLIENT = () => ({
  id: DEFREV.clientId,
  name: "C8 DEFERRED REVENUE FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

// `account_class` and `special_acc_type` are SPELLED, not omitted: the revenue Select offers active
// INCOME accounts, and the SST output leg is kept out of the candidate set by the estate's own
// stamp rather than by its name.
const ACCOUNTS = () => [
  { client_id: DEFREV.clientId, account_code: "2030", name: "Deferred revenue", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
  { client_id: DEFREV.clientId, account_code: "2150", name: "SST output tax payable", account_type: "liability", account_class: null, special_acc_type: "sst_output", is_active: true },
  { client_id: DEFREV.clientId, account_code: "4500", name: "Membership income", account_type: "income", account_class: null, is_active: true },
  { client_id: DEFREV.clientId, account_code: "4600", name: "Rental income", account_type: "income", account_class: null, is_active: true },
];

/** The per-client roster, DEFERRED-REVENUE arm. Live from the start: this walk is about
 *  recognising an advance, and the enrolment journey is the Registers panel's own (its cells live
 *  in `components/registers/prepayment-accounts-panel.test.tsx`). */
const ROSTER_ROWS = () => [{
  id: DEFREV.enrolmentId,
  account_code: "2030",
  purpose: "deferred_revenue",
  reason: "memberships and rent are billed a year ahead and earned monthly",
  active: true,
  enrolled_at: "2026-01-02T00:00:00.000Z",
  created_by: DEFREV.firmId,
  retired_at: null,
}];

/** A FULL YEAR: 1,200,005 cents over twelve whole calendar months — 100,000 a month with the five
 *  cent remainder wholly in the FINAL period, and the twelve summing back to the advance, which is
 *  the one arithmetic fact the walk can read off the screen. */
const MONTH_ENDS = [
  ["2026-01-01", "2026-01-31"], ["2026-02-01", "2026-02-28"], ["2026-03-01", "2026-03-31"],
  ["2026-04-01", "2026-04-30"], ["2026-05-01", "2026-05-31"], ["2026-06-01", "2026-06-30"],
  ["2026-07-01", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"],
  ["2026-10-01", "2026-10-31"], ["2026-11-01", "2026-11-30"], ["2026-12-01", "2026-12-31"],
];

const LINES = () => MONTH_ENDS.map(([start, end], i) => ({
  period_start: start,
  period_end: end,
  // A LIABILITY IS RELEASED BY DEBIT, which is the whole difference from the expense side.
  debit_cents: i === 11 ? 100005 : 100000,
  credit_cents: 0,
  account_code: "2030",
  amount_cents: i === 11 ? 100005 : 100000,
  deferred_account_code: "2030",
  revenue_account_code: "4500",
}));

const POSTED_OCC = (due) => ({
  occurrence_id: `941c1c1c-9411-4941-8941-${due.replace(/-/g, "").slice(0, 12)}`,
  due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`, attempt: 1, revision: 1,
  intent_key: `plan:${DEFREV.planId}:r1:${due}`, work_id: DEFREV.workId,
  admitted_at: `${due}T00:00:12.000Z`,
  outcome: { state: "admitted", logical_op_id: `work:${DEFREV.workId}:journal_entry:1`, replayed: false },
  created_at: `${due}T00:00:12.000Z`, attempts: [],
  work_status: "completed", work_error: null,
  receipt_id: "941d1d1d-9411-4941-8941-941941941941", entry_id: DEFREV.entryId,
});

/** THE REFUSED PERIOD. Admitted, then the POSTING core refused it — the case that is invisible
 *  everywhere else in the estate, and the reason the attention read has a posting arm at all. */
const REFUSED_OCC = (due) => ({
  occurrence_id: `941e2e2e-9411-4941-8941-${due.replace(/-/g, "").slice(0, 12)}`,
  due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`, attempt: 1, revision: 1,
  intent_key: `plan:${DEFREV.planId}:r1:${due}`, work_id: DEFREV.workId,
  admitted_at: `${due}T00:00:09.000Z`,
  outcome: { state: "admitted", logical_op_id: `work:${DEFREV.workId}:journal_entry:1`, replayed: false },
  created_at: `${due}T00:00:09.000Z`, attempts: [],
  work_status: "refused",
  work_error: {
    reason: "write_into_closed_period", code: "CLR19",
    message: "the period containing 2026-03-31 is closed for this client",
  },
  receipt_id: null, entry_id: null,
});

const OCCURRENCES = () => [
  POSTED_OCC("2026-01-31"), POSTED_OCC("2026-02-28"), REFUSED_OCC("2026-03-31"),
];

/** The term a NAMED PERSON stated: this advance binds no document of its own, and the schedule
 *  behaves exactly like one derived from an invoice — provenance is the whole difference. */
const STATED = {
  start: "2026-01-01",
  end: "2026-12-31",
  reason: "the member paid twelve months of subscription up front and confirmed the dates by e-mail",
  statedAt: "2026-01-03T02:00:00.000Z",
  statedBy: "11111111-1111-1111-1111-111111111111",
};

const LIST = () => [
  {
    schedule_id: DEFREV.scheduleId,
    plan_id: DEFREV.planId,
    purpose: DEFREV.purpose,
    status: "active",
    source_entry_id: DEFREV.entryId,
    document_id: null,
    term_source: "human_stated",
    stated_term_id: "941f3f3f-9411-4941-8941-941941941941",
    term_stated_by: STATED.statedBy,
    term_stated_at: STATED.statedAt,
    term_reason: STATED.reason,
    term_live: true,
    term_superseded_by: null,
    term_moved: false,
    term_current_start: STATED.start,
    term_current_end: STATED.end,
    term_start: STATED.start,
    term_end: STATED.end,
    deferred_account_code: "2030",
    revenue_account_code: "4500",
    recognition_pattern: "straight_line",
    total_cents: 1200005,
    period_count: 12,
    basis_kind: "human_stated",
    created_at: "2026-01-03T02:10:00.000Z",
    effective_from: "2026-01-31",
    effective_to: "2026-12-31",
    // TWO of the three periods that have fallen due put money on the books; the third refused.
    // The difference between `posted_periods` and `period_count` is the "admitted is not posted"
    // fact, as a number a reader can see.
    posted_periods: 2,
    occurrence_count: 3,
    next_due: "2026-04-30",
  },
  ...(state.created ? [{
    schedule_id: DEFREV.newScheduleId,
    plan_id: DEFREV.newPlanId,
    purpose: DEFREV.newPurpose,
    status: "active",
    source_entry_id: DEFREV.unrecognisedEntryId,
    // THIS one rides the DOCUMENT's own service period, so the list carries both provenances and
    // the term-source filter has something to narrow.
    document_id: DEFREV.documentId,
    term_source: "document_service_period",
    stated_term_id: null,
    term_stated_by: null,
    term_stated_at: null,
    term_reason: null,
    term_live: true,
    term_superseded_by: null,
    term_moved: false,
    term_current_start: "2026-07-01",
    term_current_end: "2027-06-30",
    term_start: "2026-07-01",
    term_end: "2027-06-30",
    deferred_account_code: "2030",
    revenue_account_code: "4600",
    recognition_pattern: "straight_line",
    total_cents: 1200005,
    period_count: 12,
    basis_kind: "extracted",
    created_at: "2026-06-30T02:10:00.000Z",
    effective_from: "2026-07-31",
    effective_to: "2027-06-30",
    posted_periods: 0,
    occurrence_count: 0,
    next_due: "2026-07-31",
  }] : []),
];

const DETAIL = () => {
  const lines = LINES();
  const occurrences = OCCURRENCES();
  return {
    schedule_id: DEFREV.scheduleId,
    client_id: DEFREV.clientId,
    plan_id: DEFREV.planId,
    revision: 1,
    kind: "revenue_recognition_schedule",
    status: "active",
    purpose: DEFREV.purpose,
    source_entry_id: DEFREV.entryId,
    source_posting_date: "2026-01-02",
    source_memo: "annual membership received in advance",
    source_status: "approved",
    document_id: null,
    service_period_id: null,
    term_source: "human_stated",
    stated_term_id: "941f3f3f-9411-4941-8941-941941941941",
    term_stated_by: STATED.statedBy,
    term_stated_at: STATED.statedAt,
    term_reason: STATED.reason,
    term_live: true,
    term_superseded_by: null,
    term_moved: false,
    term_current_start: STATED.start,
    term_current_end: STATED.end,
    term_start: STATED.start,
    term_end: STATED.end,
    basis_kind: "human_stated",
    deferred_account_code: "2030",
    revenue_account_code: "4500",
    revenue_account_basis: "a membership fee earned month by month is membership income",
    total_cents: 1200005,
    period_count: 12,
    remainder_placement: "final_period",
    recognition_pattern: "straight_line",
    schedule_version: "prepayment_schedule_v2",
    created_by: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-01-03T02:10:00.000Z",
    authority_kind: "explicit_instruction",
    authority_ref: { kind: "accounting_work", id: DEFREV.workId },
    authorised_by: "11111111-1111-1111-1111-111111111111",
    authorised_at: "2026-01-03T02:10:00.000Z",
    authority_from: "2026-01-31",
    covered_through: "2026-02-28",
    paused_at: null, paused_by: null, paused_reason: null,
    ended_at: null, ended_by: null, ended_reason: null,
    live_revision: {
      revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
      timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-12-31",
      basis: {
        posting_date: "2026-01-31",
        memo: "Revenue recognition: Annual membership, recognised monthly",
        currency: "MYR",
        lines: [
          { account_code: "2030", debit_cents: 100000, credit_cents: 0, description: "deferred revenue released" },
          { account_code: "4500", debit_cents: 0, credit_cents: 100000, description: "revenue recognised" },
        ],
      },
      basis_digest: "d".repeat(64),
    },
    periods: lines.map((l, i) => ({ ...l, occurrence: occurrences[i] ?? null })),
    occurrences,
    configuration_only: true,
  };
};

/** THE SCHEDULE THE WALK ITSELF CONFIGURES, read back on its own address after the create. Twelve
 *  whole months from the DOCUMENT's own service period, none of them due yet: the walk lands here
 *  from the form and reads the full-year allocation off the screen. */
const NEW_DETAIL = () => ({
  ...DETAIL(),
  schedule_id: DEFREV.newScheduleId,
  plan_id: DEFREV.newPlanId,
  purpose: DEFREV.newPurpose,
  source_entry_id: DEFREV.unrecognisedEntryId,
  source_posting_date: "2026-06-30",
  source_memo: "twelve months of rent received in advance",
  document_id: DEFREV.documentId,
  service_period_id: "941ddddd-9411-4941-8941-941941941941",
  term_source: "document_service_period",
  stated_term_id: null,
  term_stated_by: null,
  term_stated_at: null,
  term_reason: null,
  term_current_start: "2026-07-01",
  term_current_end: "2027-06-30",
  term_start: "2026-07-01",
  term_end: "2027-06-30",
  basis_kind: "extracted",
  revenue_account_code: "4600",
  revenue_account_basis: "rent received in advance is rental income as the months are served",
  created_at: "2026-06-30T02:10:00.000Z",
  authority_from: "2026-07-31",
  covered_through: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-07-31", effective_to: "2027-06-30",
    basis: {
      posting_date: "2026-07-31",
      memo: "Revenue recognition: Rent received in advance, recognised monthly",
      currency: "MYR",
      lines: [
        { account_code: "2030", debit_cents: 100000, credit_cents: 0, description: "deferred revenue released" },
        { account_code: "4600", debit_cents: 0, credit_cents: 100000, description: "revenue recognised" },
      ],
    },
    basis_digest: "e".repeat(64),
  },
  // NOT ONE PERIOD HAS FALLEN DUE, so every one of the twelve is "Not yet due" and none carries an
  // occurrence: an accepted schedule is not a posted period, which is the sentence the surface
  // keeps on screen and this shape is what makes it true.
  periods: RENT_MONTHS.map(([start, end], i) => ({
    period_start: start,
    period_end: end,
    debit_cents: i === 11 ? 100005 : 100000,
    credit_cents: 0,
    account_code: "2030",
    amount_cents: i === 11 ? 100005 : 100000,
    deferred_account_code: "2030",
    revenue_account_code: "4600",
    occurrence: null,
  })),
  occurrences: [],
});

/** ARM A — the last period did not post. */
const ATTENTION_REFUSING = () => [{
  arm: "refusing",
  schedule_id: DEFREV.scheduleId,
  plan_id: DEFREV.planId,
  purpose: DEFREV.purpose,
  status: "active",
  occurrence_id: REFUSED_OCC("2026-03-31").occurrence_id,
  due_date: "2026-03-31",
  period_key: "2026-03-01",
  attempt: 1,
  work_id: DEFREV.workId,
  stage: "posting",
  code: "CLR19",
  reason: "write_into_closed_period",
  message: "the period containing 2026-03-31 is closed for this client",
  work_status: "refused",
  catch_up_from: "2026-03-31",
  catch_up_to: "2026-03-31",
}];

/** ARM B — received in advance, not yet recognised. Two receipts with two different next acts: one
 *  whose term stands and one that binds no document and so needs a person's statement. The first
 *  disappears once the walk has configured it, because the read only offers what the door admits. */
const ATTENTION_UNRECOGNISED = () => [
  ...(state.created ? [] : [{
    arm: "unrecognised",
    entry_id: DEFREV.unrecognisedEntryId,
    posting_date: "2026-06-30",
    memo: "twelve months of rent received in advance",
    document_id: DEFREV.documentId,
    deferred_account_code: "2030",
    amount_cents: 1200005,
    term_carrier: "document_service_period",
    has_live_term: true,
    next_step: "configure_schedule",
  }]),
  {
    arm: "unrecognised",
    entry_id: DEFREV.memoEntryId,
    posting_date: "2026-08-14",
    memo: "membership renewal received, no invoice issued yet",
    document_id: null,
    deferred_account_code: "2030",
    amount_cents: 600000,
    term_carrier: "human_stated",
    has_live_term: false,
    next_step: "state_service_period",
  },
];

/** The ONE instruction this client has recorded — the authority picker's candidates. The door
 *  RESOLVES `p_authority_ref` against `clara.accounting_work`, so the walk must pick a real one. */
const AUTHORITIES = () => ([{
  id: DEFREV.workId,
  intent_key: "instruction:recognise-advances",
  created_at: "2026-01-02T02:00:00.000Z",
  basis: { memo: "the client instructed us to recognise advances received over their service period" },
}]);

/** The DATABASE's own refusal envelope, in PostgREST's shape — the walk must see the real thing
 *  rather than a message this fixture wrote. */
const TERM_REFUSAL = {
  code: "CLR10",
  message: "no live service period stands for the advance this entry records",
  details: JSON.stringify({
    reason: "deferred_revenue_term_underivable",
    reason_text: "no live service period stands for the advance this entry records",
    missing: "document_service_periods",
    document_id: DEFREV.documentId,
    source_entry: DEFREV.unrecognisedEntryId,
    remedy: "clara.record_document_service_period",
  }),
  hint: null,
};

/** The TERM the walk's own schedule rides: twelve whole calendar months from the document's own
 *  service period, 2026-07-01 to 2027-06-30, so the allocation crosses a year boundary exactly as
 *  a real service period commonly does. */
const RENT_MONTHS = [
  ["2026-07-01", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"],
  ["2026-10-01", "2026-10-31"], ["2026-11-01", "2026-11-30"], ["2026-12-01", "2026-12-31"],
  ["2027-01-01", "2027-01-31"], ["2027-02-01", "2027-02-28"], ["2027-03-01", "2027-03-31"],
  ["2027-04-01", "2027-04-30"], ["2027-05-01", "2027-05-31"], ["2027-06-01", "2027-06-30"],
];

const CREATED = () => ({
  term_source: "document_service_period",
  stated_term_id: null,
  schedule_id: DEFREV.newScheduleId,
  plan_id: DEFREV.newPlanId,
  revision_id: "941ccccc-9411-4941-8941-941941941941",
  revision: 1,
  status: "active",
  kind: "revenue_recognition_schedule",
  client_id: DEFREV.clientId,
  source_entry_id: DEFREV.unrecognisedEntryId,
  document_id: DEFREV.documentId,
  service_period_id: "941ddddd-9411-4941-8941-941941941941",
  basis_kind: "extracted",
  term_start: "2026-07-01",
  term_end: "2027-06-30",
  deferred_account_code: "2030",
  revenue_account_code: "4600",
  revenue_account_basis: "rent received in advance is rental income as the months are served",
  total_cents: 1200005,
  period_count: 12,
  remainder_placement: "final_period",
  recognition_pattern: "straight_line",
  schedule_version: "prepayment_schedule_v2",
  period_lines: RENT_MONTHS.map(([start, end], i) => ({
    period_start: start,
    period_end: end,
    debit_cents: i === 11 ? 100005 : 100000,
    credit_cents: 0,
    account_code: "2030",
    amount_cents: i === 11 ? 100005 : 100000,
    deferred_account_code: "2030",
    revenue_account_code: "4600",
  })),
  frequency: "monthly",
  day_rule: "last_day_of_month",
  day_of_month: null,
  timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-07-31",
  effective_to: "2027-06-30",
  next_occurrences: [{ due_date: "2026-07-31", leg: "primary" }],
  overlap_warning: null,
  configuration_only: true,
});

/** #809's shape: the authority picker walks `clara.list_accounting_work`, so this lane answers that
 *  door for its OWN client — the same single instruction above, in the door's own row shape.
 *  Returning null means "not this lane's client", so the next lane answers. */
export function deferredRevenueWorkListPage(body) {
  if ((body.p_client ?? null) !== DEFREV.clientId) return null;
  return {
    status: 200,
    body: {
      rows: AUTHORITIES().map((w) => ({
        id: w.id,
        client_id: DEFREV.clientId,
        client_name: "C8 DEFERRED REVENUE FIXTURE",
        purpose: "journal_entry",
        status: "completed",
        initiator: "11111111-1111-1111-1111-111111111111",
        initiated_by: "11111111-1111-1111-1111-111111111111",
        initiator_role: "bookkeeper",
        basis_origin: "user_direct",
        intent_key: w.intent_key,
        memo: w.basis.memo,
        posting_date: null,
        currency: "MYR",
        source_ref_count: 0,
        current_task_id: null,
        entry_id: null,
        receipt_id: null,
        error_code: null,
        error_reason: null,
        attempts: 1,
        current_run_status: null,
        pending_question_id: null,
        pending_question_version: null,
        created_at: w.created_at,
        updated_at: w.created_at,
      })),
      next_cursor: null,
      truncated: false,
    },
  };
}

/** The deferred-revenue lane's PostgREST half. Returns true when it answered, so the server's
 *  delegate chain falls through to every other lane for anything that is not this fixture's. */
export async function handleDeferredRevenueSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter !== `eq.${DEFREV.clientId}`) return false;
    sendJson(response, 200, [CLIENT()], cors);
    return true;
  }

  // The chart the revenue Select reads, scoped to this lane's own client.
  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter !== `eq.${DEFREV.clientId}`) return false;
    sendJson(response, 200, ACCOUNTS(), cors);
    return true;
  }

  // The roster relation the configure form reads to tell "nothing is waiting" apart from "nothing
  // could ever be configured". A real SELECT grant under forced RLS, so a relation read rather
  // than an rpc — which is also why the verb census cannot see it.
  if (request.method === "GET" && path === "/rest/v1/prepayment_account_enrolments") {
    if (clientFilter !== `eq.${DEFREV.clientId}`) return false;
    sendJson(response, 200, ROSTER_ROWS(), cors);
    return true;
  }

  // The Work DETAIL read's own route (`lib/work/reads.ts`), scoped to this lane's own client
  // exactly as the sibling lanes scope their copies of it.
  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (clientFilter !== `eq.${DEFREV.clientId}`) return false;
    sendJson(response, 200, AUTHORITIES(), cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(DEFREV_RPC_VERBS, verb)) return false;
  const body = await readJson(request);

  if (verb === "list_revenue_recognition_schedules") {
    if (body.p_client !== DEFREV.clientId) return false;
    sendJson(response, 200, { client_id: DEFREV.clientId, schedules: LIST() }, cors);
    return true;
  }

  if (verb === "list_revenue_recognition_attention") {
    if (body.p_client !== DEFREV.clientId) return false;
    sendJson(response, 200, {
      client_id: DEFREV.clientId,
      refusing: ATTENTION_REFUSING(),
      unrecognised: ATTENTION_UNRECOGNISED(),
      refusing_truncated: false,
      unrecognised_truncated: false,
    }, cors);
    return true;
  }

  if (verb === "get_revenue_recognition_schedule") {
    if (body.p_schedule === DEFREV.newScheduleId) {
      sendJson(response, 200, NEW_DETAIL(), cors);
      return true;
    }
    if (body.p_schedule !== DEFREV.scheduleId) return false;
    sendJson(response, 200, DETAIL(), cors);
    return true;
  }

  if (verb === "create_revenue_recognition_schedule") {
    if (body.p_client !== DEFREV.clientId) return false;
    // THE CREATE-TIME RESIDUE, ONCE. The advance has posted; the schedule has not. The form must
    // keep the draft, print the database's own words and say the liability is still on the books.
    if (!state.refusedOnce) {
      state.refusedOnce = true;
      sendJson(response, 400, TERM_REFUSAL, cors);
      return true;
    }
    state.created = true;
    sendJson(response, 200, CREATED(), cors);
    return true;
  }

  return false;
}
