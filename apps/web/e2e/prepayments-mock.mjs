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
  purpose: "Annual software subscription",
  refusingPurpose: "Annual software subscription",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readJson`'s own call
 *  site guards on, so a verb this lane does not own never has its request stream drained (the
 *  #632 finding-10 root cause, stated in full in `bank-close-registers-mock.mjs`). */
export const PREPAY_RPC_VERBS = new Set([
  "list_prepayment_schedules",
  "get_prepayment_schedule",
  "list_prepayment_attention",
  "create_prepayment_schedule",
  "pause_accounting_plan",
  "resume_accounting_plan",
  "end_accounting_plan",
  "request_plan_catch_up",
]);

const state = { paused: false, created: false, refusedOnce: false, catchUps: 0 };

export function resetPrepayments() {
  state.paused = false;
  state.created = false;
  state.refusedOnce = false;
  state.catchUps = 0;
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

const ACCOUNTS = () => [
  { client_id: PREPAY.clientId, account_code: "19000001", name: "Prepayments", account_type: "asset", is_active: true },
  { client_id: PREPAY.clientId, account_code: "59000001", name: "Software subscriptions", account_type: "expense", is_active: true },
  { client_id: PREPAY.clientId, account_code: "59000002", name: "Insurance", account_type: "expense", is_active: true },
];

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

const LIST = () => [{
  schedule_id: PREPAY.scheduleId,
  plan_id: PREPAY.planId,
  purpose: PREPAY.purpose,
  status: status(),
  source_entry_id: PREPAY.entryId,
  document_id: PREPAY.documentId,
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
const ATTENTION_UNSCHEDULED = () => (state.created ? [] : [{
  arm: "unscheduled",
  entry_id: PREPAY.unscheduledEntryId,
  posting_date: "2026-04-14",
  memo: "annual insurance premium, paid in advance",
  document_id: PREPAY.documentId,
  prepaid_account_code: "19000001",
  amount_cents: 240000,
  has_live_term: state.refusedOnce,
}]);

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

  // The instruction the authority Select reads (`lib/plans/api.ts`'s `listAuthorityCandidates`),
  // scoped to this lane's own client exactly as `journal-work-mock.mjs` and `work-list-mock.mjs`
  // scope their own copies of this route.
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
    if (body.p_schedule !== PREPAY.scheduleId) return false;
    sendJson(response, 200, DETAIL(), cors);
    return true;
  }

  if (verb === "create_prepayment_schedule") {
    if (body.p_client !== PREPAY.clientId) return false;
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
