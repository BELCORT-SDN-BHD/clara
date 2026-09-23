// #653's C8/C9 lane mock — a file-disjoint sibling of `plans-mock.mjs`, consulted by
// `serve-built.mjs` through ONE hook, exactly as that module's own header describes for itself.
// Every id below is distinct from every other lane's and EVERY handler is ID-SCOPED (each one
// falls through with `return false` for a subject that is not this lane's), so no walk can starve
// another's fixtures.
//
// THAT FIRST SENTENCE WAS NOT TRUE WHEN THIS LANE MET ITS SIBLINGS, and the repair is why every id
// here now carries the `-6536-4653-8653-653653653653` tail. This lane and `accrual-mock.mjs`
// (#652) were written on parallel branches, both derived their space from `plans-mock.mjs`'s
// `64c0c0c0-…` by bumping the stem, so both lanes' client rows arrived at ONE address —
// 65c0c0c0-6500-4650-8650-650650650650. Neither branch's walk could fail: each was
// alone on its own tree. On the merged tree `handleAccrualSupabase` is consulted FIRST, so it
// answered this lane's `/rest/v1/accounting_work` and `/rest/v1/coa_accounts` with the accrual
// fixtures and `prepayments.walk.refusal` timed out selecting an authority option that was never
// rendered. ID-SCOPING IS ONLY AS GOOD AS THE IDS: two lanes at one address behave exactly like
// the unscoped claim N4 bans, whichever way each handler is written. The client id is this lane's
// ADDRESS, and `e2e-fixture-ownership.test.ts`'s client-id census now measures that no two lanes
// share one.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the attention band, the configure form and its validator, the disabled
// allocation preview, the explain-and-choose surface, the four lifecycle Dialogs, the focus
// manager, the layout at 320 CSS px. What is faked is PostgREST: the three prepayment read doors,
// the one write door and the plan lifecycle doors this lane reuses. So this walk proves the
// JOURNEY and what the surface does with the database's answers; it proves NOTHING about whether
// Postgres really derives an exact-cent allocation, really refuses a term the document does not
// state, or really leaves a refused period reachable. `packages/db/tests/prepayment-schedule.test.mjs`,
// `packages/db/tests/prepayment-occurrences.test.mjs` and
// `packages/runtime/tests/prepayment-occurrence-e2e.mjs` own those against a real Postgres.
//
// THE FIXTURE IS STATEFUL IN EXACTLY TWO WAYS, and both are the walk's own journeys:
//   1. `create_prepayment_schedule` REFUSES the first time with the database's own
//      `prepayment_term_underivable`, and succeeds on the second attempt. That is the create-time
//      residue: the recognition has posted and the schedule did not, so the form must keep the
//      draft, name the refusal verbatim and say the prepayment is still posted.
//   2. `pause_accounting_plan` flips the schedule to `paused`, so the next read must SWITCH to the
//      paused controls while still showing the allocation. Making it a real transition rather than
//      two canned schedules is what proves the surface re-reads after the write instead of
//      painting its own optimistic answer.

// THE SHARED READER AND THE NAMED GUARD (`mock-dispatch.mjs`). `matchVerb` runs BEFORE
// `readCachedJson`, so a verb this lane does not own never touches the stream; and for the four
// verbs it DOES share with `plans-mock.mjs`, the body is parsed once and re-served to whichever
// lane asks second — which is the whole reason that module exists.
import { readCachedJson as readJson, matchVerb } from "./mock-dispatch.mjs";

export const PREPAY = {
  firmId: "65065065-6536-4653-8653-653653653653",
  clientId: "65365365-6536-4653-8653-653653653653",
  scheduleId: "65111111-6536-4653-8653-653653653653",
  planId: "65222222-6536-4653-8653-653653653653",
  entryId: "65333333-6536-4653-8653-653653653653",
  unscheduledEntryId: "65444444-6536-4653-8653-653653653653",
  documentId: "65555555-6536-4653-8653-653653653653",
  workId: "65666666-6536-4653-8653-653653653653",
  postedEntryId: "65777777-6536-4653-8653-653653653653",
  // #939 — THE MEMO-ONLY LANE. A prepayment posted with NO document: the ledger admits the memo
  // journal, nothing can read a term off it, and until a named person states the service period
  // there is no schedule to configure. Same id space, same tail, so the ownership census still
  // sees one lane.
  memoEntryId: "65888888-6536-4653-8653-653653653653",
  memoScheduleId: "65999999-6536-4653-8653-653653653653",
  memoPlanId: "65aaaaaa-6536-4653-8653-653653653653",
  statedTermId: "65bbbbbb-6536-4653-8653-653653653653",
  // #940 — THE ROSTER LANE'S OWN RECOGNITION AND SCHEDULE. Its own ids, so the roster walk can
  // drive a full enrol -> amortise journey without consuming either of the two transitions the
  // refusal and memo-only cells own. Same id space, same tail, so the ownership census still sees
  // one lane.
  rosterEntryId: "65ccc0cc-6536-4653-8653-653653653653",
  rosterScheduleId: "65ddd0dd-6536-4653-8653-653653653653",
  rosterPlanId: "65eee0ee-6536-4653-8653-653653653653",
  enrolmentId: "65fff0ff-6536-4653-8653-653653653653",
  rosterPurpose: "Prepaid rent, amortised after enrolment",
  purpose: "Annual software subscription",
  refusingPurpose: "Annual software subscription",
  memoPurpose: "Prepaid insurance, no invoice",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readJson`'s own call
 *  site guards on, so a verb this lane does not own never has its request stream drained (the
 *  #632 finding-10 root cause, stated in full in `bank-close-registers-mock.mjs`). */
export const PREPAY_RPC_VERBS = new Set([
  "list_prepayment_schedules",
  "get_prepayment_schedule",
  "list_prepayment_attention",
  "create_prepayment_schedule",
  "record_prepayment_stated_term",
  "pause_accounting_plan",
  "resume_accounting_plan",
  "end_accounting_plan",
  "request_plan_catch_up",
  // #940 — the two roster doors. Bookkeeper floor in the real estate; this fixture fakes only the
  // transport, exactly as it does for every other door here.
  "enrol_prepayment_account",
  "retire_prepayment_account",
]);

const state = {
  paused: false, created: false, refusedOnce: false, catchUps: 0,
  // #939 — THE MEMO-ONLY LANE'S OWN TWO TRANSITIONS, and both are the walk's journey rather than
  // canned answers: a person states the service period, and only then can the schedule be
  // configured. Making them real transitions is what proves the surface RE-READS after each write
  // instead of painting its own optimistic answer.
  statedTerm: false, memoCreated: false,
  // #940 — THE ROSTER'S OWN TWO TRANSITIONS. `enrolled` starts TRUE because every other cell in
  // this walk configures a schedule, and a client with an empty roster can configure nothing: the
  // roster gates amortisation ahead of the shared eligibility wall. The roster cell retires it,
  // watches the consequence, enrols it again and amortises — and leaves it true.
  enrolled: true, rosterCreated: false,
};

export function resetPrepayments() {
  state.paused = false;
  state.created = false;
  state.refusedOnce = false;
  state.catchUps = 0;
  state.statedTerm = false;
  state.memoCreated = false;
}

export function prepaymentCatchUps() {
  return state.catchUps;
}


const CLIENT = () => ({
  id: PREPAY.clientId,
  name: "C8 PREPAYMENTS FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

// #940 — `account_class` is SPELLED, not omitted. The prepayment-account panel offers only
// non-control accounts (`account_class === null`), which an absent field is not: a row without it
// would leave the enrol dropdown empty and the cell would fail for the wrong reason.
const ACCOUNTS = () => [
  { client_id: PREPAY.clientId, account_code: "19000001", name: "Prepayments", account_type: "asset", account_class: null, is_active: true },
  { client_id: PREPAY.clientId, account_code: "59000001", name: "Software subscriptions", account_type: "expense", account_class: null, is_active: true },
  { client_id: PREPAY.clientId, account_code: "59000002", name: "Insurance", account_type: "expense", account_class: null, is_active: true },
];

/** #940 — THE PER-CLIENT PREPAYMENT-ACCOUNT ROSTER, as the panel reads it: the LIVE population
 *  only, which is exactly what the schedule door asks. Empty while retired, which is the state the
 *  roster cell drives the form into. */
const ROSTER_ROWS = () => (state.enrolled ? [{
  id: PREPAY.enrolmentId,
  account_code: "19000001",
  purpose: "prepayment",
  reason: "this account holds the client's prepaid insurance and prepaid rent, and nothing else",
  active: true,
  enrolled_at: "2026-04-01T00:00:00.000Z",
  created_by: PREPAY.firmId,
  retired_at: null,
}] : []);

const status = () => (state.paused ? "paused" : "active");

/** 100,001 cents over three months: 33,333 / 33,333 / 33,335 — the residual is VISIBLE, which is
 *  the one arithmetic fact the walk can read off the screen. */
const LINE = (start, end, cents) => ({
  period_start: start,
  period_end: end,
  debit_cents: 0,
  credit_cents: cents,
  account_code: "19000001",
  amount_cents: cents,
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
});

const LINES = () => [
  LINE("2026-01-01", "2026-01-31", 33333),
  LINE("2026-02-01", "2026-02-28", 33333),
  LINE("2026-03-01", "2026-03-31", 33335),
];

const POSTED_OCC = (due) => ({
  occurrence_id: `65a1a1a1-6500-4650-8650-${due.replace(/-/g, "").slice(0, 12)}`,
  due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`, attempt: 1, revision: 1,
  intent_key: `plan:${PREPAY.planId}:r1:${due}`, work_id: PREPAY.workId,
  admitted_at: `${due}T00:00:12.000Z`,
  outcome: { state: "admitted", logical_op_id: `work:${PREPAY.workId}:journal_entry:1`, replayed: false },
  created_at: `${due}T00:00:12.000Z`, attempts: [],
  work_status: "completed", work_error: null,
  receipt_id: "65b1b1b1-6536-4653-8653-653653653653", entry_id: PREPAY.postedEntryId,
});

/** THE REFUSED PERIOD. Admitted, then the POSTING core refused it — the case that is invisible
 *  everywhere else in the estate, and the reason the attention read has a posting arm at all. */
const REFUSED_OCC = (due) => ({
  occurrence_id: `65a2a2a2-6500-4650-8650-${due.replace(/-/g, "").slice(0, 12)}`,
  due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`, attempt: 1, revision: 1,
  intent_key: `plan:${PREPAY.planId}:r1:${due}`, work_id: PREPAY.workId,
  admitted_at: `${due}T00:00:09.000Z`,
  outcome: { state: "admitted", logical_op_id: `work:${PREPAY.workId}:journal_entry:1`, replayed: false },
  created_at: `${due}T00:00:09.000Z`, attempts: [],
  work_status: "refused",
  work_error: {
    reason: "write_into_closed_period", code: "CLR19",
    message: "the period containing 2026-03-31 is closed for this client",
  },
  receipt_id: null, entry_id: null,
});

const DETAIL = () => {
  const lines = LINES();
  const occurrences = [POSTED_OCC("2026-01-31"), POSTED_OCC("2026-02-28"), REFUSED_OCC("2026-03-31")];
  return {
    schedule_id: PREPAY.scheduleId,
    client_id: PREPAY.clientId,
    plan_id: PREPAY.planId,
    revision: 1,
    kind: "amortisation_schedule",
    status: status(),
    purpose: PREPAY.purpose,
    source_entry_id: PREPAY.entryId,
    source_posting_date: "2026-01-14",
    source_memo: "annual software subscription, paid in advance",
    source_status: "approved",
    document_id: PREPAY.documentId,
    service_period_id: "65e1e1e1-6536-4653-8653-653653653653",
    term_source: "document_service_period",
    stated_term_id: null,
    term_stated_by: null,
    term_stated_at: null,
    term_reason: null,
    term_live: true,
    term_superseded_by: null,
    term_moved: false,
    term_current_start: "2026-01-01",
    term_current_end: "2026-03-31",
    term_start: "2026-01-01",
    term_end: "2026-03-31",
    basis_kind: "human_stated",
    prepaid_account_code: "19000001",
    expense_account_code: "59000001",
    expense_account_basis: "the invoice narrates a three-month software subscription",
    total_cents: 100001,
    period_count: 3,
    remainder_placement: "final_period",
    schedule_version: "v1",
    created_by: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-01-15T02:00:00.000Z",
    authority_kind: "explicit_instruction",
    authority_ref: { kind: "accounting_work", id: PREPAY.workId },
    authorised_by: "11111111-1111-1111-1111-111111111111",
    authorised_at: "2026-01-15T02:00:00.000Z",
    authority_from: "2026-01-31",
    covered_through: "2026-02-28",
    paused_at: state.paused ? "2026-04-01T02:00:00.000Z" : null,
    paused_by: state.paused ? "11111111-1111-1111-1111-111111111111" : null,
    paused_reason: state.paused ? "waiting for the closed period to be reopened" : null,
    ended_at: null, ended_by: null, ended_reason: null,
    live_revision: {
      revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
      timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-03-31",
      basis: {
        posting_date: "2026-01-31", memo: "Prepayment amortisation: Annual software subscription",
        currency: "MYR",
        lines: [
          { account_code: "59000001", debit_cents: 33333, credit_cents: 0, description: "amortisation charge" },
          { account_code: "19000001", debit_cents: 0, credit_cents: 33333, description: "prepaid release" },
        ],
      },
      basis_digest: "c".repeat(64),
    },
    periods: lines.map((l, i) => ({ ...l, occurrence: occurrences[i] ?? null })),
    occurrences,
    configuration_only: true,
  };
};

const LIST = () => [...(state.memoCreated ? [MEMO_LIST_ROW()] : []), {
  schedule_id: PREPAY.scheduleId,
  plan_id: PREPAY.planId,
  purpose: PREPAY.purpose,
  status: status(),
  source_entry_id: PREPAY.entryId,
  document_id: PREPAY.documentId,
  // #939 — this schedule's term came from the document's own service period, which is what the
  // list marker and the term-source filter distinguish it by.
  term_source: "document_service_period",
  stated_term_id: null,
  term_stated_by: null,
  term_stated_at: null,
  term_reason: null,
  term_live: true,
  term_superseded_by: null,
  term_moved: false,
  term_current_start: "2026-01-01",
  term_current_end: "2026-03-31",
  term_start: "2026-01-01",
  term_end: "2026-03-31",
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
  total_cents: 100001,
  period_count: 3,
  basis_kind: "human_stated",
  created_at: "2026-01-15T02:00:00.000Z",
  effective_from: "2026-01-31",
  effective_to: "2026-03-31",
  // TWO of three periods put money on the books; the third refused. The difference between
  // `posted_periods` and `occurrence_count` is the "admitted is not posted" fact, as a number.
  posted_periods: 2,
  occurrence_count: 3,
  next_due: null,
}];

/** #939 — THE STATED TERM this lane's memo-only recognition is amortised over, once a person has
 *  stated it. Three whole months, so its allocation is the same 33,333 / 33,333 / 33,335 the
 *  document-backed schedule shows — provenance is the ONLY difference, which is the ticket's own
 *  sentence and the thing the walk reads off the screen. */
const STATED = {
  start: "2026-05-01",
  end: "2026-07-31",
  reason: "the client paid twelve months of cover by bank transfer and confirmed the dates by e-mail",
  statedAt: "2026-04-20T02:00:00.000Z",
  statedBy: "11111111-1111-1111-1111-111111111111",
};

const MEMO_LINES = () => [
  { period_start: "2026-05-01", period_end: "2026-05-31", debit_cents: 0, credit_cents: 33333,
    account_code: "19000001", amount_cents: 33333,
    prepaid_account_code: "19000001", expense_account_code: "59000002" },
  { period_start: "2026-06-01", period_end: "2026-06-30", debit_cents: 0, credit_cents: 33333,
    account_code: "19000001", amount_cents: 33333,
    prepaid_account_code: "19000001", expense_account_code: "59000002" },
  { period_start: "2026-07-01", period_end: "2026-07-31", debit_cents: 0, credit_cents: 33335,
    account_code: "19000001", amount_cents: 33335,
    prepaid_account_code: "19000001", expense_account_code: "59000002" },
];

const MEMO_LIST_ROW = () => ({
  schedule_id: PREPAY.memoScheduleId,
  plan_id: PREPAY.memoPlanId,
  purpose: PREPAY.memoPurpose,
  status: "active",
  source_entry_id: PREPAY.memoEntryId,
  // NULL, and that is the point: there is no document, so the surface must not offer one.
  document_id: null,
  term_source: "human_stated",
  stated_term_id: PREPAY.statedTermId,
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
  prepaid_account_code: "19000001",
  expense_account_code: "59000002",
  total_cents: 100001,
  period_count: 3,
  basis_kind: "human_stated",
  created_at: "2026-04-20T02:10:00.000Z",
  effective_from: "2026-05-31",
  effective_to: "2026-07-31",
  posted_periods: 0,
  occurrence_count: 0,
  next_due: "2026-05-31",
});

const MEMO_DETAIL = () => ({
  schedule_id: PREPAY.memoScheduleId,
  client_id: PREPAY.clientId,
  plan_id: PREPAY.memoPlanId,
  revision: 1,
  kind: "amortisation_schedule",
  status: "active",
  purpose: PREPAY.memoPurpose,
  source_entry_id: PREPAY.memoEntryId,
  source_posting_date: "2026-04-20",
  source_memo: "annual insurance premium, paid in advance, no invoice received",
  source_status: "approved",
  document_id: null,
  service_period_id: null,
  term_source: "human_stated",
  stated_term_id: PREPAY.statedTermId,
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
  prepaid_account_code: "19000001",
  expense_account_code: "59000002",
  expense_account_basis: "an insurance premium is charged to insurance",
  total_cents: 100001,
  period_count: 3,
  remainder_placement: "final_period",
  // v2, because the memo-only lane rides clara.prepayment_schedule_v2 — the same formula with the
  // amount and the term supplied rather than read.
  schedule_version: "v2",
  created_by: STATED.statedBy,
  created_at: "2026-04-20T02:10:00.000Z",
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: PREPAY.workId },
  authorised_by: STATED.statedBy,
  authorised_at: "2026-04-20T02:10:00.000Z",
  authority_from: "2026-05-31",
  covered_through: null,
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-05-31", effective_to: "2026-07-31",
    basis: {
      posting_date: "2026-05-31", memo: "Prepayment amortisation: Prepaid insurance, no invoice",
      currency: "MYR",
      lines: [
        { account_code: "59000002", debit_cents: 33333, credit_cents: 0, description: "amortisation charge" },
        { account_code: "19000001", debit_cents: 0, credit_cents: 33333, description: "prepaid release" },
      ],
    },
    basis_digest: "d".repeat(64),
  },
  periods: MEMO_LINES().map((l) => ({ ...l, occurrence: null })),
  occurrences: [],
  configuration_only: true,
});

const MEMO_CREATED = () => ({
  ...MEMO_DETAIL(),
  revision_id: "65cccccc-6536-4653-8653-653653653653",
  period_lines: MEMO_LINES(),
  frequency: "monthly",
  day_rule: "last_day_of_month",
  day_of_month: null,
  timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-05-31",
  effective_to: "2026-07-31",
  next_occurrences: [],
  overlap_warning: null,
});

/** #940 — the roster lane's schedule, once it exists. A document-bound one, so the ONLY thing that
 *  ever stood between it and the books was the roster. */
const ROSTER_DETAIL = () => ({
  ...MEMO_DETAIL(),
  schedule_id: PREPAY.rosterScheduleId,
  plan_id: PREPAY.rosterPlanId,
  purpose: PREPAY.rosterPurpose,
  source_entry_id: PREPAY.rosterEntryId,
  source_posting_date: "2026-04-22",
  source_memo: "quarterly rent, paid in advance",
  document_id: PREPAY.documentId,
  service_period_id: PREPAY.documentId,
  term_source: "document_service_period",
  stated_term_id: null,
  term_stated_by: null,
  term_stated_at: null,
  term_reason: null,
  basis_kind: "document_stated",
  schedule_version: "v1",
  expense_account_code: "59000001",
  expense_account_basis: "rent is charged to rent",
});

const ROSTER_CREATED = () => ({
  ...MEMO_CREATED(),
  ...ROSTER_DETAIL(),
  revision_id: "65bbb0bb-6536-4653-8653-653653653653",
});

/** #940 — the ROSTER refusal, with 0140's own `prepayment_source_unfit` token and the NEW axis
 *  that names the enrolment door and the panel. One axis, not a second vocabulary. */
const NOT_ENROLLED_REFUSAL = {
  code: "CLR10",
  message: "account 19000001 is not enrolled as a prepayment account for this client",
  details: JSON.stringify({
    reason: "prepayment_source_unfit",
    reason_text: "account 19000001 is not enrolled as a prepayment account for this client",
    axis: "prepaid_account_not_enrolled",
    prepaid_account_code: "19000001",
    source_entry: PREPAY.rosterEntryId,
    remedy: "clara.enrol_prepayment_account",
    panel: "client_registers_prepayment_accounts",
  }),
  hint: null,
};

/** #939 — the memo-only lane's own create-time refusal: no document AND no stated term, so the
 *  payload names the CARRIER and the DOOR that fills it rather than `journal_entries.document_id`,
 *  which is what the old answer named and which told a firm its prepayment could never be
 *  amortised at all. */
const STATED_TERM_REFUSAL = {
  code: "CLR10",
  message: "this recognition binds no document and nobody has stated its service period",
  details: JSON.stringify({
    reason: "prepayment_term_underivable",
    reason_text: "this recognition binds no document and nobody has stated its service period",
    missing: "prepayment_stated_terms",
    remedy: "clara.record_prepayment_stated_term",
    source_entry: PREPAY.memoEntryId,
  }),
  hint: null,
};

/** ARM A — the live schedule whose most recent period charged nothing, at the POSTING core. */
const ATTENTION_REFUSING = () => (state.paused ? [] : [{
  arm: "refusing",
  schedule_id: PREPAY.scheduleId,
  plan_id: PREPAY.planId,
  purpose: PREPAY.refusingPurpose,
  status: status(),
  occurrence_id: REFUSED_OCC("2026-03-31").occurrence_id,
  due_date: "2026-03-31",
  period_key: "2026-03-01",
  attempt: 1,
  work_id: PREPAY.workId,
  stage: "posting",
  code: "CLR19",
  reason: "write_into_closed_period",
  message: "the period containing 2026-03-31 is closed for this client",
  work_status: "refused",
  catch_up_from: "2026-03-31",
  catch_up_to: "2026-03-31",
}]);

/** ARM B — the posted prepayment nothing amortises. Its document states NO term until the walk's
 *  first create attempt has been refused; that is what makes the two halves of the arm visible
 *  in one journey. */
// #940 — EVERY ARM-B ROW IS GATED ON THE ROSTER, because every one of them is an OFFER: the
// surface renders it with a "configure the schedule" action, and the door would refuse it on an
// account nobody enrolled. That is the database's own predicate (migration 0306 recuts
// `clara.list_prepayment_attention` to ask the SAME `clara._prepayment_account_enrolled` the door
// asks); this fixture mirrors it so the walk cannot show an offer the estate would not.
const ATTENTION_UNSCHEDULED = () => (!state.enrolled ? [] : [
  ...(state.created ? [] : [{
    arm: "unscheduled",
    entry_id: PREPAY.unscheduledEntryId,
    posting_date: "2026-04-14",
    memo: "annual insurance premium, paid in advance",
    document_id: PREPAY.documentId,
    // #939 — this one's term belongs to its document, so its next act is that document.
    term_carrier: "document_service_period",
    prepaid_account_code: "19000001",
    amount_cents: 240000,
    has_live_term: state.refusedOnce,
    next_step: state.refusedOnce ? "configure_schedule" : "record_document_service_period",
  }]),
  // #939 — THE MEMO-ONLY CANDIDATE. Before this ticket arm B filtered `document_id is not null`,
  // so this prepayment was invisible: posted, unamortised, and nothing on any screen saying so.
  ...(state.memoCreated ? [] : [{
    arm: "unscheduled",
    entry_id: PREPAY.memoEntryId,
    posting_date: "2026-04-20",
    memo: "annual insurance premium, paid in advance, no invoice received",
    document_id: null,
    term_carrier: "human_stated",
    prepaid_account_code: "19000001",
    amount_cents: 100001,
    has_live_term: state.statedTerm,
    next_step: state.statedTerm ? "configure_schedule" : "state_service_period",
  }]),
  // #940 — THE ROSTER LANE'S OWN CANDIDATE: document-bound, term already stated, and waiting only
  // on the account being on the roster. It is the recognition the roster cell amortises once it has
  // enrolled the account again.
  ...(state.rosterCreated ? [] : [{
    arm: "unscheduled",
    entry_id: PREPAY.rosterEntryId,
    posting_date: "2026-04-22",
    memo: "quarterly rent, paid in advance",
    document_id: PREPAY.documentId,
    term_carrier: "document_service_period",
    prepaid_account_code: "19000001",
    amount_cents: 100001,
    has_live_term: true,
    next_step: "configure_schedule",
  }]),
]);

const CREATED = () => ({
  schedule_id: PREPAY.scheduleId,
  plan_id: PREPAY.planId,
  revision_id: "65d1d1d1-6536-4653-8653-653653653653",
  revision: 1,
  status: "active",
  kind: "amortisation_schedule",
  client_id: PREPAY.clientId,
  source_entry_id: PREPAY.unscheduledEntryId,
  document_id: PREPAY.documentId,
  service_period_id: "65e2e2e2-6536-4653-8653-653653653653",
  term_source: "document_service_period",
  stated_term_id: null,
  basis_kind: "human_stated",
  term_start: "2026-01-01",
  term_end: "2026-03-31",
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
  expense_account_basis: "the invoice narrates a three-month software subscription",
  total_cents: 100001,
  period_count: 3,
  remainder_placement: "final_period",
  schedule_version: "v1",
  period_lines: LINES(),
  frequency: "monthly",
  day_rule: "last_day_of_month",
  day_of_month: null,
  timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-01-31",
  effective_to: "2026-03-31",
  next_occurrences: [],
  overlap_warning: null,
  configuration_only: true,
});

/** THE ONE INSTRUCTION this client has recorded — the authority picker's candidates. The door
 *  RESOLVES `p_authority_ref` against `clara.accounting_work`, so the walk must pick a real one. */
const AUTHORITIES = () => ([{
  id: PREPAY.workId,
  intent_key: "instruction:annual-subscription",
  created_at: "2026-01-10T02:00:00.000Z",
  basis: { memo: "the client instructed us to amortise the annual subscription over its term" },
}]);

/** #809 MOVED THE PICKER'S READ. `lib/plans/api.ts`'s `listAuthorityCandidates` (a direct
 *  `/rest/v1/accounting_work` GET) is deleted: migration 0203 widened `clara.list_accounting_work`
 *  with `intent_key`, the last field that direct read was kept for, and `listPlanAuthorityWork`
 *  walks the DOOR now. So this lane answers the door for its own client — the SAME single
 *  instruction above, in the door's own row shape, one fixture fact in two projections — and keeps
 *  the table handler below for the detail read (`getAccountingWork`), which has no door.
 *  Returning null means "not this lane's client", so the next lane answers. */
export function prepaymentWorkListPage(body) {
  const client = body.p_client ?? null;
  if (client !== PREPAY.clientId) return null;
  return {
    status: 200,
    body: {
      rows: AUTHORITIES().map((w) => ({
        id: w.id,
        client_id: PREPAY.clientId,
        client_name: "C8 PREPAYMENTS FIXTURE",
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

/** The door's own refusal when the reference resolves to nothing — 0193's `authority_ref_unresolved`
 *  carried through `clara.create_prepayment_schedule`. The walk must be able to reach it, because a
 *  surface that fabricated an authority (the recognition entry's own id, say) would meet exactly
 *  this and nothing else. */
const AUTHORITY_REFUSAL = {
  code: "CLR10",
  message: "the instruction this plan cites does not exist for this client",
  details: JSON.stringify({
    reason: "authority_ref_unresolved",
    reason_text: "the instruction this plan cites does not exist for this client",
  }),
  hint: null,
};

/** The DATABASE's own refusal envelope, in PostgREST's shape — the walk must see the real thing
 *  rather than a message this fixture wrote. */
const TERM_REFUSAL = {
  code: "CLR10",
  message: "no live service period is recorded for the document this entry binds",
  details: JSON.stringify({
    reason: "prepayment_term_underivable",
    reason_text: "no live service period is recorded for the document this entry binds",
    missing: "document_service_periods",
    document_id: PREPAY.documentId,
    source_entry: PREPAY.unscheduledEntryId,
  }),
  hint: null,
};

/** The C8/C9 lane's PostgREST half. Returns true when it answered, so the server's delegate chain
 *  falls through to every other lane for anything that is not this fixture's. */
export async function handlePrepaymentsSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === `eq.${PREPAY.clientId}`) {
      sendJson(response, 200, [CLIENT()], cors);
      return true;
    }
    return false;
  }

  // The chart the expense Select reads, scoped to this lane's own client.
  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter === `eq.${PREPAY.clientId}`) {
      sendJson(response, 200, ACCOUNTS(), cors);
      return true;
    }
    return false;
  }

  // #940 — THE ROSTER RELATION, read directly by the Registers panel and by the configure form.
  // `clara.prepayment_account_enrolments` carries a real SELECT grant to clara_authenticated under
  // forced RLS, so this is a relation read rather than an rpc — which is also why the verb census
  // in `e2e-fixture-ownership.test.ts` cannot see it.
  if (request.method === "GET" && path === "/rest/v1/prepayment_account_enrolments") {
    if (clientFilter === `eq.${PREPAY.clientId}`) {
      sendJson(response, 200, ROSTER_ROWS(), cors);
      return true;
    }
    return false;
  }

  // #940 — THE FIXED-ASSET HALF OF THE REGISTERS TAB, answered EMPTY for this lane's client only.
  // The prepayment-account panel lives beside the fixed-asset account profiles, so the roster cell
  // has to render that whole tab; these four reads are what it asks for, and every one of them
  // answers the honest empty shape its own door answers for a client with no fixed assets. The
  // FIXTURES for those surfaces belong to `fixed-asset-mock.mjs` and `depreciation-mock.mjs`, which
  // run FIRST in `serve-built.mjs`'s chain and fall through for a client that is not theirs.
  if (request.method === "GET" && path === "/rest/v1/fa_account_profiles") {
    if (clientFilter !== `eq.${PREPAY.clientId}`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }
  if (request.method === "GET" && path === "/rest/v1/fa_account_depreciation_policies") {
    if (clientFilter !== `eq.${PREPAY.clientId}`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  // The DETAIL read's own route, scoped to this lane's own client exactly as
  // `journal-work-mock.mjs` and `work-list-mock.mjs` scope their own copies of it. The authority
  // Select no longer arrives here (#809 — see `prepaymentWorkListPage` above).
  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (clientFilter === `eq.${PREPAY.clientId}`) {
      sendJson(response, 200, AUTHORITIES(), cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(PREPAY_RPC_VERBS, verb)) return false;
  const body = await readJson(request);

  // #940 — THE TWO ROSTER DOORS. Bookkeeper floor in the real estate; this fixture fakes the
  // transport only. Both are real TRANSITIONS rather than canned answers: the panel and the form
  // both RE-READ afterwards, and what they then show is this state, never their own optimism.
  if (verb === "enrol_prepayment_account") {
    if (body.p_client !== PREPAY.clientId) return false;
    state.enrolled = true;
    sendJson(response, 200, {
      enrolment_id: PREPAY.enrolmentId, client_id: PREPAY.clientId,
      account_code: body.p_account, purpose: body.p_purpose, reason: body.p_reason,
      enrolled_by: PREPAY.firmId, active: true,
    }, cors);
    return true;
  }
  if (verb === "retire_prepayment_account") {
    if (body.p_client !== PREPAY.clientId) return false;
    state.enrolled = false;
    sendJson(response, 200, {
      enrolment_id: PREPAY.enrolmentId, client_id: PREPAY.clientId,
      account_code: body.p_account, purpose: body.p_purpose,
      retired_by: PREPAY.firmId, active: false,
    }, cors);
    return true;
  }

  // #940 — the four FIXED-ASSET reads the Registers tab makes, empty for this lane's client.
  if (verb === "list_fixed_assets") {
    if (body.p_client !== PREPAY.clientId) return false;
    sendJson(response, 200, {
      client_id: PREPAY.clientId, as_of: "2026-04-22", assets: [], incomplete_count: 0,
    }, cors);
    return true;
  }
  if (verb === "fa_register_tie") {
    if (body.p_client !== PREPAY.clientId) return false;
    sendJson(response, 200, {
      client_id: PREPAY.clientId, as_of: "2026-04-22", tie: true, accounts: [],
      incomplete_count: 0, pending_draft_count: 0,
    }, cors);
    return true;
  }
  if (verb === "get_depreciation_authority") {
    if (body.p_client !== PREPAY.clientId) return false;
    sendJson(response, 200, {
      client_id: PREPAY.clientId, authority: null, ramp_earned: false,
      fy_end: { month: 12, day: 31, fallback: true }, high_stakes_threshold_cents: 1000000,
    }, cors);
    return true;
  }
  if (verb === "list_depreciation_runs") {
    if (body.p_client !== PREPAY.clientId) return false;
    sendJson(response, 200, { client_id: PREPAY.clientId, runs: [] }, cors);
    return true;
  }

  if (verb === "list_prepayment_schedules") {
    if (body.p_client !== PREPAY.clientId) return false;
    sendJson(response, 200, { client_id: PREPAY.clientId, schedules: LIST() }, cors);
    return true;
  }

  if (verb === "list_prepayment_attention") {
    if (body.p_client !== PREPAY.clientId) return false;
    const refusing = ATTENTION_REFUSING();
    const unscheduled = ATTENTION_UNSCHEDULED();
    sendJson(response, 200, {
      client_id: PREPAY.clientId, refusing, unscheduled,
      attention: [...refusing, ...unscheduled],
    }, cors);
    return true;
  }

  if (verb === "get_prepayment_schedule") {
    if (body.p_schedule === PREPAY.rosterScheduleId) {
      sendJson(response, 200, ROSTER_DETAIL(), cors);
      return true;
    }
    if (body.p_schedule === PREPAY.memoScheduleId) {
      sendJson(response, 200, MEMO_DETAIL(), cors);
      return true;
    }
    if (body.p_schedule !== PREPAY.scheduleId) return false;
    sendJson(response, 200, DETAIL(), cors);
    return true;
  }

  // #939 — THE ONE HUMAN DOOR that makes a memo-only prepayment schedulable. Bookkeeper floor,
  // no agent grant, no wake wrapper: every value here was typed by the person at the screen.
  if (verb === "record_prepayment_stated_term") {
    if (body.p_client !== PREPAY.clientId) return false;
    if (body.p_source_entry !== PREPAY.memoEntryId) return false;
    state.statedTerm = true;
    sendJson(response, 200, {
      stated_term_id: PREPAY.statedTermId,
      client_id: PREPAY.clientId,
      source_entry_id: PREPAY.memoEntryId,
      period_start: body.p_period_start,
      period_end: body.p_period_end,
      reason: body.p_reason,
      stated_by: STATED.statedBy,
      superseded_id: null,
    }, cors);
    return true;
  }

  if (verb === "create_prepayment_schedule") {
    if (body.p_client !== PREPAY.clientId) return false;
    // #939 — THE MEMO-ONLY LANE. With no stated term the door refuses and the payload names the
    // stating door as the remedy; once a term stands the SAME door configures the schedule off
    // clara.prepayment_schedule_v2.
    if (body.p_source_entry === PREPAY.memoEntryId) {
      if (!state.statedTerm) {
        sendJson(response, 400, STATED_TERM_REFUSAL, cors);
        return true;
      }
      state.memoCreated = true;
      sendJson(response, 200, MEMO_CREATED(), cors);
      return true;
    }
    // #940 — THE ROSTER, ASKED WHERE THE DOOR ASKS IT: after the branch on the source entry and
    // BEFORE the authority is resolved, which is the real body's own order (0306 §D inserts the
    // roster question immediately before the shared eligibility wall, and both sit ahead of the
    // expense-target and authority half).
    if (body.p_source_entry === PREPAY.rosterEntryId) {
      if (!state.enrolled) {
        sendJson(response, 400, NOT_ENROLLED_REFUSAL, cors);
        return true;
      }
      state.rosterCreated = true;
      sendJson(response, 200, ROSTER_CREATED(), cors);
      return true;
    }
    // THE DOOR RESOLVES THE AUTHORITY FIRST, so this fixture does too: a payload citing anything
    // but this client's own instruction Work is answered `authority_ref_unresolved`, which is what
    // the real door answers and the only thing a fabricated authority could ever get.
    if (body.p_authority_ref?.id !== PREPAY.workId
        || body.p_authority_ref?.kind !== "accounting_work") {
      sendJson(response, 400, AUTHORITY_REFUSAL, cors);
      return true;
    }
    // THE CREATE-TIME RESIDUE, ONCE. The recognition has posted; the schedule has not. The form
    // must keep the draft, print the database's own words and say the prepayment still needs one.
    if (!state.refusedOnce) {
      state.refusedOnce = true;
      sendJson(response, 400, TERM_REFUSAL, cors);
      return true;
    }
    state.created = true;
    sendJson(response, 200, CREATED(), cors);
    return true;
  }

  // THE PLAN LIFECYCLE DOORS THIS LANE REUSES, scoped to this lane's own plan id.
  if (verb === "pause_accounting_plan") {
    if (body.p_plan !== PREPAY.planId) return false;
    state.paused = true;
    sendJson(response, 200, { plan_id: PREPAY.planId, status: "paused", changed: true }, cors);
    return true;
  }
  if (verb === "resume_accounting_plan") {
    if (body.p_plan !== PREPAY.planId) return false;
    state.paused = false;
    sendJson(response, 200, { plan_id: PREPAY.planId, status: "active", changed: true }, cors);
    return true;
  }
  if (verb === "end_accounting_plan") {
    if (body.p_plan !== PREPAY.planId) return false;
    sendJson(response, 200, { plan_id: PREPAY.planId, status: "ended", changed: true }, cors);
    return true;
  }
  if (verb === "request_plan_catch_up") {
    if (body.p_plan !== PREPAY.planId) return false;
    state.catchUps += 1;
    sendJson(response, 200, {
      plan_id: PREPAY.planId, from: body.p_from, to: body.p_to, admitted: 0, cap: 12,
      events: [{
        admitted: false, due_date: body.p_from, leg: "primary",
        reason: "write_into_closed_period", code: "CLR19",
      }],
    }, cors);
    return true;
  }

  return false;
}
