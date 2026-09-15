// #640's C9 lane mock — a file-disjoint sibling of `bank-close-registers-mock.mjs` and
// `journal-work-mock.mjs`, consulted by `serve-built.mjs` through ONE hook, exactly as those
// modules' own headers describe for themselves. Every id below is distinct from theirs and EVERY
// handler is ID-SCOPED (each one falls through with `return false` for a subject that is not this
// lane's), so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the list, the detail, the preview's paused explanation, the four lifecycle
// Dialogs, the focus manager, the layout at 320 CSS px. What is faked is PostgREST: the four plan
// read doors and the four write doors. So this walk proves the JOURNEY and what the surface does
// with the database's answers; it proves NOTHING about whether Postgres really converges two
// scans on one occurrence, really refuses a catch-up below `effective_from`, or really leaves an
// in-flight Work alone when a plan is paused. `packages/db/tests/accounting-plan-occurrences.test.mjs`,
// `packages/db/tests/accounting-plans.test.mjs` and `packages/runtime/tests/plan-occurrence-e2e.mjs`
// own those against a real Postgres.
//
// THE FIXTURE IS STATEFUL IN EXACTLY ONE WAY: `pause_accounting_plan` flips the plan to `paused`
// and makes the next `preview_accounting_plan` answer `admitting:false`. That is the walk's second
// journey — the preview must SWITCH to a paused explanation while still showing the dates — and
// making it a real transition rather than two canned plans is what proves the surface re-reads
// after the write instead of painting its own optimistic answer.

export const PLANS = {
  firmId: "64064064-6400-4640-8640-640640640640",
  clientId: "64c0c0c0-6400-4640-8640-640640640640",
  planId: "64111111-6400-4640-8640-640640640640",
  endedPlanId: "64222222-6400-4640-8640-640640640640",
  workId: "64333333-6400-4640-8640-640640640640",
  authorityWorkId: "64444444-6400-4640-8640-640640640640",
  entryId: "64555555-6400-4640-8640-640640640640",
  purpose: "Monthly office rent",
  endedPurpose: "Retired quarterly retainer",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readJson`'s own call
 *  site guards on, so a verb this lane does not own never has its request stream drained (the
 *  #632 finding-10 root cause, stated in full in `bank-close-registers-mock.mjs`). */
export const PLANS_RPC_VERBS = new Set([
  "list_accounting_plans",
  "get_accounting_plan",
  "preview_accounting_plan",
  "list_accounting_plan_occurrences",
  "get_work_plan_origin",
  "pause_accounting_plan",
  "resume_accounting_plan",
  "end_accounting_plan",
  "request_plan_catch_up",
]);

const state = { paused: false, catchUps: 0 };

export function resetPlans() {
  state.paused = false;
  state.catchUps = 0;
}

export function plansCatchUps() {
  return state.catchUps;
}

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

const CLIENT = () => ({
  id: PLANS.clientId,
  name: "C9 PLANS FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

const BASIS = () => ({
  posting_date: "2026-07-01",
  memo: "Monthly office rent, Level 8 Menara ABC",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
    { account_code: "1150", debit_cents: 0, credit_cents: 120000, description: "Maybank current" },
  ],
});

const LIVE_REVISION = () => ({
  revision: 2,
  frequency: "monthly",
  day_rule: "day_of_month",
  day_of_month: 1,
  timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-07-01",
  effective_to: null,
  basis: BASIS(),
  basis_digest: "b".repeat(64),
  auto_reverse: false,
  reversal_day_rule: null,
  created_by: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-08-15T02:00:00.000Z",
  superseded_at: null,
});

const status = () => (state.paused ? "paused" : "active");

const PLAN_LIST = () => [
  {
    plan_id: PLANS.planId,
    kind: "recurring_journal",
    status: status(),
    purpose: PLANS.purpose,
    authority_kind: "explicit_instruction",
    authorised_by: "11111111-1111-1111-1111-111111111111",
    authorised_at: "2026-06-28T02:00:00.000Z",
    created_at: "2026-06-28T02:00:00.000Z",
    revision: 2,
    frequency: "monthly",
    day_rule: "day_of_month",
    day_of_month: 1,
    timezone: "Asia/Kuala_Lumpur",
    effective_from: "2026-07-01",
    effective_to: null,
    auto_reverse: false,
    next_occurrence: "2026-10-01",
    occurrence_count: 2,
  },
  {
    plan_id: PLANS.endedPlanId,
    kind: "reversing_journal",
    status: "ended",
    purpose: PLANS.endedPurpose,
    authority_kind: "explicit_instruction",
    authorised_by: "11111111-1111-1111-1111-111111111111",
    authorised_at: "2026-02-01T02:00:00.000Z",
    created_at: "2026-02-01T02:00:00.000Z",
    revision: 1,
    frequency: "quarterly",
    day_rule: "last_day_of_month",
    day_of_month: null,
    timezone: "Asia/Kuala_Lumpur",
    effective_from: "2026-01-01",
    effective_to: "2026-06-30",
    auto_reverse: true,
    next_occurrence: null,
    occurrence_count: 2,
  },
];

const PLAN_DETAIL = () => ({
  plan_id: PLANS.planId,
  client_id: PLANS.clientId,
  kind: "recurring_journal",
  status: status(),
  purpose: PLANS.purpose,
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: PLANS.authorityWorkId },
  authorised_by: "11111111-1111-1111-1111-111111111111",
  authorised_at: "2026-06-28T02:00:00.000Z",
  authority_from: "2026-07-01",
  // The last period this plan has already run through — the revise form's own mirror of 0193's
  // `period_already_covered` reads it (review finding SHOULD-1).
  covered_through: "2026-09-30",
  created_by: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-06-28T02:00:00.000Z",
  paused_at: state.paused ? "2026-09-14T02:00:00.000Z" : null,
  paused_by: state.paused ? "11111111-1111-1111-1111-111111111111" : null,
  paused_reason: state.paused ? "the landlord is renegotiating" : null,
  ended_at: null,
  ended_by: null,
  ended_reason: null,
  current_revision: 2,
  live_revision: LIVE_REVISION(),
  // The predecessor is PRESERVED — the acceptance's "revision preserves predecessor and past runs".
  revisions: [
    LIVE_REVISION(),
    { ...LIVE_REVISION(), revision: 1, day_of_month: 5, superseded_at: "2026-08-15T02:00:00.000Z" },
  ],
});

const ENDED_DETAIL = () => ({
  ...PLAN_DETAIL(),
  plan_id: PLANS.endedPlanId,
  purpose: PLANS.endedPurpose,
  kind: "reversing_journal",
  status: "ended",
  paused_at: null,
  paused_by: null,
  paused_reason: null,
  ended_at: "2026-07-02T02:00:00.000Z",
  ended_by: "11111111-1111-1111-1111-111111111111",
  ended_reason: "the client cancelled the standing instruction",
  current_revision: 1,
  live_revision: { ...LIVE_REVISION(), revision: 1, auto_reverse: true, reversal_day_rule: "next_period_first_day" },
  revisions: [{ ...LIVE_REVISION(), revision: 1 }],
});

const PREVIEW = (planId) => ({
  plan_id: planId,
  status: planId === PLANS.endedPlanId ? "ended" : status(),
  revision: 2,
  timezone: "Asia/Kuala_Lumpur",
  today: "2026-09-14",
  from_date: "2026-10-01",
  admitting: planId === PLANS.endedPlanId ? false : !state.paused,
  occurrences:
    planId === PLANS.endedPlanId
      ? []
      : [
          { due_date: "2026-10-01", leg: "primary", basis: BASIS() },
          { due_date: "2026-11-01", leg: "primary", basis: BASIS() },
          { due_date: "2026-12-01", leg: "primary", basis: BASIS() },
        ],
});

const OCCURRENCES = (planId) => ({
  plan_id: planId,
  occurrences:
    planId === PLANS.endedPlanId
      ? []
      : [
          {
            occurrence_id: "64a1a1a1-6400-4640-8640-640640640640",
            due_date: "2026-09-01",
            leg: "primary",
            period_key: "2026-09-01",
            attempt: 1,
            revision: 2,
            intent_key: `plan:${PLANS.planId}:r2:2026-09-01`,
            work_id: PLANS.workId,
            admitted_at: "2026-09-01T00:00:12.000Z",
            outcome: { state: "admitted", logical_op_id: `work:${PLANS.workId}:journal_entry:1`, replayed: false },
            created_at: "2026-09-01T00:00:12.000Z",
            work_status: "completed",
            work_error: null,
            receipt_id: "64b1b1b1-6400-4640-8640-640640640640",
            entry_id: PLANS.entryId,
          },
          {
            // A REFUSED due event: recorded history with the database's own typed reason, and no
            // Work at all. This is the row the acceptance's "permission loss" case produces.
            occurrence_id: "64a2a2a2-6400-4640-8640-640640640640",
            due_date: "2026-08-01",
            leg: "primary",
            period_key: "2026-08-01",
            attempt: 1,
            revision: 1,
            intent_key: `plan:${PLANS.planId}:r1:2026-08-01`,
            work_id: null,
            admitted_at: null,
            outcome: {
              state: "refused",
              code: "CLR04",
              reason: "actor_not_active",
              message: "the author is not an active member of this firm",
            },
            created_at: "2026-08-01T00:00:09.000Z",
            work_status: null,
            work_error: null,
            receipt_id: null,
            entry_id: null,
          },
        ],
});

/** The C9 lane's PostgREST half. Returns true when it answered, so the server's delegate chain
 *  falls through to every other lane for anything that is not this fixture's. */
export async function handlePlansSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === `eq.${PLANS.clientId}`) {
      sendJson(response, 200, [CLIENT()], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!PLANS_RPC_VERBS.has(verb)) return false;
  const body = await readJson(request);

  if (verb === "list_accounting_plans") {
    if (body.p_client !== PLANS.clientId) return false;
    sendJson(response, 200, { client_id: PLANS.clientId, plans: PLAN_LIST() }, cors);
    return true;
  }

  if (verb === "get_accounting_plan") {
    if (body.p_plan === PLANS.planId) { sendJson(response, 200, PLAN_DETAIL(), cors); return true; }
    if (body.p_plan === PLANS.endedPlanId) { sendJson(response, 200, ENDED_DETAIL(), cors); return true; }
    return false;
  }

  if (verb === "preview_accounting_plan") {
    if (body.p_plan !== PLANS.planId && body.p_plan !== PLANS.endedPlanId) return false;
    sendJson(response, 200, PREVIEW(body.p_plan), cors);
    return true;
  }

  if (verb === "list_accounting_plan_occurrences") {
    if (body.p_plan !== PLANS.planId && body.p_plan !== PLANS.endedPlanId) return false;
    sendJson(response, 200, OCCURRENCES(body.p_plan), cors);
    return true;
  }

  // #638 — clara.get_work_claim_origin, on the SAME footing as the plan-origin row beside it and
  // for the same reason: the Work detail asks both, and this lane's Work is a PLAN occurrence, not
  // a staff expense claim. NULL is the door's own honest answer. Declared in
  // e2e-fixture-ownership.test.ts's `SHARED_RPC_VERBS`.
  if (verb === "get_work_claim_origin") {
    if (body?.p_work !== PLANS.workId) return false;
    sendJson(response, 200, null, cors);
    return true;
  }

  if (verb === "get_work_plan_origin") {
    if (body.p_work !== PLANS.workId) return false;
    sendJson(response, 200, {
      plan_id: PLANS.planId, purpose: PLANS.purpose, kind: "recurring_journal", status: status(),
      occurrence_id: "64a1a1a1-6400-4640-8640-640640640640", revision: 2, leg: "primary",
      due_date: "2026-09-01", authorised_by: "11111111-1111-1111-1111-111111111111",
      authority_kind: "explicit_instruction",
    }, cors);
    return true;
  }

  if (verb === "pause_accounting_plan") {
    if (body.p_plan !== PLANS.planId) return false;
    state.paused = true;
    sendJson(response, 200, { plan_id: PLANS.planId, status: "paused", changed: true }, cors);
    return true;
  }

  if (verb === "resume_accounting_plan") {
    if (body.p_plan !== PLANS.planId) return false;
    state.paused = false;
    sendJson(response, 200, { plan_id: PLANS.planId, status: "active", changed: true }, cors);
    return true;
  }

  if (verb === "end_accounting_plan") {
    if (body.p_plan !== PLANS.planId) return false;
    sendJson(response, 200, { plan_id: PLANS.planId, status: "ended", changed: true }, cors);
    return true;
  }

  // THE REFUSAL THE THIRD JOURNEY NEEDS — PostgREST's own error envelope, and the exact shape
  // `lib/doors.ts` classifies as a governed DoorRefusal: a CLR code in `code`, the database's
  // message verbatim, and the reason token inside `details`. The form's own field rule catches a
  // window below `effective_from` first, so the walk drives a window the FORM admits and the DOOR
  // refuses — which is the only way to exercise the refusal path at all.
  if (verb === "request_plan_catch_up") {
    if (body.p_plan !== PLANS.planId) return false;
    state.catchUps += 1;
    if (body.p_from === "2026-07-01" && body.p_to === "2026-09-14") {
      sendJson(response, 200, {
        plan_id: PLANS.planId, from: body.p_from, to: body.p_to, admitted: 1, cap: 12,
        events: [{ admitted: true, due_date: "2026-07-01", leg: "primary", work_id: PLANS.workId }],
      }, cors);
      return true;
    }
    sendJson(response, 400, {
      code: "CLR10",
      message: "this plan's authority starts on 2026-07-01; a catch-up cannot reach back past it",
      details: '{"reason":"catch_up_before_authority","effective_from":"2026-07-01"}',
    }, cors);
    return true;
  }

  return false;
}
