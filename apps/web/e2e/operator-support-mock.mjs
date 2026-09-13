// #615's mock lane — a file-disjoint sibling of `tax-boundary-mock.mjs` and the other lane mocks,
// consulted by `serve-built.mjs` through ONE hook. Every branch below is scoped to ITS OWN verbs
// and ids and falls through otherwise, and a request body is read only INSIDE a matched verb — so
// this lane starves nothing and is starved by nothing (`e2e-fixture-ownership.test.ts` enforces
// that mechanically; this file's declaration row is `{ unscopeable: [], debt: [] }`).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of
// `components/operator/*` / `lib/operator/*` under test are REAL — the six read states, the
// permitted-act judgement, the deterministic op keys, the Sheet's focus/Escape/Back contract, the
// URL model. What is faked is PostgREST: `clara.list_operator_support_queue` and
// `clara.get_operator_support_case` themselves, including the CLR-shaped refusals the denial and
// concurrency cells need. So this walk proves the JOURNEY — and nothing about whether Postgres
// would actually return this union or refuse that caller; `packages/db/tests/operator-support.
// test.mjs` owns that half, under real least-privileged roles.
//
// THE PERSONA SPLIT IS `serve-built.mjs`'s OWN, not this lane's: its `caller_context` fixture
// answers `is_operator: true` for `owner@…` and `is_operator: false` for `bookkeeper@…`. The
// bookkeeper leg of this walk therefore meets the app's real affordance gate, and — because the
// handlers below answer CLR04 to that persona too — the DEEP-LINK leg meets a real refusal at the
// door rather than a fixture that quietly hands over the data.
//
// THREE ARMS, ONE CASE EACH, plus one settled case for the receipt view:
//   OPERATOR.registration — an undecided registration: Approve and Reject are both offered.
//   OPERATOR.payment      — a paid, unclaimed registration: NO supported act, named as such.
//   OPERATOR.problem      — an open `duplicate_payment`: Resolve is offered, and the SECOND
//                           resolution attempt answers CLR09 (the concurrent-provider-event cell:
//                           something else settled it while the operator was looking at it).
//   OPERATOR.settledProblem — already resolved: no act, and a readable support receipt.
//   OPERATOR.deniedCase   — always CLR11, for the no-existence-oracle deep link.

export const OPERATOR = {
  registration: "0f615a00-1111-4777-8777-0f615a000001",
  payment: "0f615a00-1111-4777-8777-0f615a000002",
  problem: "0f615a00-1111-4777-8777-0f615a000003",
  settledProblem: "0f615a00-1111-4777-8777-0f615a000004",
  deniedCase: "0f615a00-1111-4777-8777-0f615a00ffff",
  applicant: "0f615a00-2222-4777-8777-0f615a000010",
  firmName: "Rome Public Advisory",
  paidFirmName: "Kuala Lumpur Bookkeepers",
  problemFirmName: "Penang Advisory",
};

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

/** A governed refusal framed exactly as PostgREST frames one, so `lib/wire.ts` classifies it into
 *  a real `RefusalError` with its code and `detail.reason` rather than a generic wire failure. */
function clr(code, message, reason) {
  return { code, message, details: reason ? JSON.stringify({ reason }) : undefined };
}

const base = (over) => ({
  case_kind: "registration",
  case_id: OPERATOR.registration,
  occurred_at: "2026-09-12T04:00:00+00:00",
  registration_id: OPERATOR.registration,
  applicant: OPERATOR.applicant,
  firm_name: OPERATOR.firmName,
  request_status: "open",
  firm_id: null,
  intent_status: null,
  intent_status_at: null,
  intent_status_reason: null,
  payment_recorded_at: null,
  payment_consumed_at: null,
  problem_kind: null,
  problem_noticed_at: null,
  problem_detail: null,
  decided_by: null,
  decided_at: null,
  decided_reason: null,
  settled: false,
  ...over,
});

const REGISTRATION_ROW = base({ });

const PAYMENT_ROW = base({
  case_kind: "payment",
  case_id: OPERATOR.payment,
  firm_name: OPERATOR.paidFirmName,
  occurred_at: "2026-09-11T02:00:00+00:00",
  intent_status: "paid",
  intent_status_at: "2026-09-11T02:00:00+00:00",
  payment_recorded_at: "2026-09-11T02:00:00+00:00",
});

const PROBLEM_ROW = base({
  case_kind: "problem",
  case_id: OPERATOR.problem,
  firm_name: OPERATOR.problemFirmName,
  occurred_at: "2026-09-10T02:00:00+00:00",
  problem_kind: "duplicate_payment",
  problem_noticed_at: "2026-09-10T02:00:00+00:00",
  problem_detail: { registration_id: OPERATOR.registration, constraint: "uq_frp_registration" },
});

const SETTLED_PROBLEM_ROW = base({
  case_kind: "problem",
  case_id: OPERATOR.settledProblem,
  firm_name: OPERATOR.problemFirmName,
  occurred_at: "2026-09-09T02:00:00+00:00",
  problem_kind: "intent_mismatch",
  problem_noticed_at: "2026-09-09T02:00:00+00:00",
  settled: true,
  decided_by: "0f615a00-3333-4777-8777-0f615a000020",
  decided_at: "2026-09-09T06:00:00+00:00",
  decided_reason: "Reconciled against the provider dashboard by hand.",
});

const OPEN_ROWS = [REGISTRATION_ROW, PAYMENT_ROW, PROBLEM_ROW];
const ALL_ROWS = [...OPEN_ROWS, SETTLED_PROBLEM_ROW];

/** The case ids this lane MINTED — `deniedCase` included, because the no-oracle cell needs a real
 *  CLR11 from this lane rather than an unhandled route. Anything else falls through. */
const OWNED_CASE_IDS = new Set([
  OPERATOR.registration, OPERATOR.payment, OPERATOR.problem, OPERATOR.settledProblem,
  OPERATOR.deniedCase,
]);

const DETAIL_EXTRA = {
  [OPERATOR.registration]: {
    note: "Referred by an existing client.",
    intent_id: null, stripe_session_id: null, stripe_event_id: null, event_type: null,
  },
  [OPERATOR.payment]: {
    note: null, intent_id: "0f615a00-4444-4777-8777-0f615a000030",
    stripe_session_id: "cs_test_615_paid", stripe_event_id: "evt_615_paid", event_type: null,
    consumed_firm_id: null,
  },
  [OPERATOR.problem]: {
    note: null, intent_id: "0f615a00-4444-4777-8777-0f615a000031",
    stripe_session_id: "cs_test_615_dup", stripe_event_id: "evt_615_dup",
    event_type: "checkout.session.async_payment_succeeded", livemode: false, payment_status: "paid",
  },
  [OPERATOR.settledProblem]: {
    note: null, intent_id: "0f615a00-4444-4777-8777-0f615a000032",
    stripe_session_id: "cs_test_615_mismatch", stripe_event_id: "evt_615_mismatch",
    event_type: "checkout.session.completed", livemode: false, payment_status: "paid",
  },
};

/** Per-server-lifetime state. Safe ONLY because `playwright.config.ts` pins `workers: 1` — the
 *  same precondition `activity-mock.mjs` and `journal-work-mock.mjs` state for their own counters.
 *  `reset` below is the control surface every spec calls before it walks. */
const state = { decided: null, resolveAttempts: 0, resolvedProblems: new Set(), capacity: { max_firms: null, reason: null } };

export function resetOperatorLane() {
  state.decided = null;
  state.resolveAttempts = 0;
  state.resolvedProblems = new Set();
  state.capacity = { max_firms: null, reason: null };
}

function rowsFor(includeSettled) {
  const rows = (includeSettled ? ALL_ROWS : OPEN_ROWS).map((row) => {
    if (row.case_id === OPERATOR.registration && state.decided) {
      return { ...row, request_status: state.decided.status, settled: true,
        decided_by: state.decided.by, decided_at: state.decided.at, decided_reason: state.decided.reason,
        firm_id: state.decided.firm_id ?? null };
    }
    if (row.case_id === OPERATOR.problem && state.resolvedProblems.has(OPERATOR.problem)) {
      return { ...row, settled: true, decided_by: OPERATOR.applicant,
        decided_at: "2026-09-13T00:00:00+00:00", decided_reason: "Refunded through the provider." };
    }
    return row;
  });
  // A DECIDED registration leaves the open queue, exactly as `clara._operator_support_cases`'s own
  // `v_all or r.status = 'open'` arm decides it — the discriminating post-condition the walk's
  // approve/reject cells assert on.
  return includeSettled ? rows : rows.filter((r) => !r.settled);
}

export async function handleOperatorSupportSupabase(request, response, path, url, sendJson, cors) {
  // THIS LANE'S OWN CONTROL ENDPOINT — the `fs4-checkout-mock.mjs` idiom, on a path under the
  // Supabase prefix so it needs no change to `serve-built.mjs`'s app-origin routing. Every cell in
  // `operator-support-walk.spec.ts` calls it first: `workers: 1` means one server for the whole
  // file, and three of the cells DECIDE a registration or RESOLVE a problem, which would otherwise
  // leave the next cell reading a queue the previous one emptied.
  if (request.method === "POST" && path === "/e2e-operator/reset") {
    resetOperatorLane();
    sendJson(response, 200, { reset: true }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/list_operator_support_queue") {
    const body = await readJson(request);
    // The BOOKKEEPER persona meets the door's own CLR04, not a fixture that hands over the estate.
    if (isBookkeeper(request)) {
      sendJson(response, 400, clr("CLR04", "insufficient role", "not_operator_firm"), cors);
      return true;
    }
    sendJson(response, 200, rowsFor(body.p_include_settled === true), cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_operator_support_case") {
    const body = await readJson(request);
    // ID-SCOPED: a case id this lane did not mint belongs to nobody here, so the request falls
    // through rather than being answered on this lane's behalf. `OPERATOR.deniedCase` IS one of
    // this lane's own ids, which is what lets the no-oracle cell drive a real CLR11.
    if (!OWNED_CASE_IDS.has(body.p_id)) return false;
    if (isBookkeeper(request)) {
      sendJson(response, 400, clr("CLR04", "insufficient role", "not_operator_firm"), cors);
      return true;
    }
    const row = rowsFor(true).find((r) => r.case_kind === body.p_kind && r.case_id === body.p_id);
    if (!row) {
      // NO EXISTENCE ORACLE — an unknown id, a foreign kind and a mismatched pair are ONE answer.
      sendJson(response, 400, clr("CLR11", "support case not found", "support_case_not_found"), cors);
      return true;
    }
    sendJson(response, 200, { ...row, ...(DETAIL_EXTRA[row.case_id] ?? {}) }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/approve_firm_registration") {
    const body = await readJson(request);
    if (body.p_request !== OPERATOR.registration) return false;
    if (state.decided) {
      sendJson(response, 400, clr("CLR09", `this request is no longer open (status: ${state.decided.status})`), cors);
      return true;
    }
    state.decided = { status: "approved", by: OPERATOR.applicant, at: "2026-09-13T01:00:00+00:00",
      reason: null, firm_id: "0f615a00-5555-4777-8777-0f615a000040" };
    sendJson(response, 200, {
      request_id: OPERATOR.registration, firm_id: state.decided.firm_id,
      plan_id: "0f615a00-6666-4777-8777-0f615a000050",
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/reject_firm_registration") {
    const body = await readJson(request);
    if (body.p_request !== OPERATOR.registration) return false;
    if (state.decided) {
      sendJson(response, 400, clr("CLR09", `this request is no longer open (status: ${state.decided.status})`), cors);
      return true;
    }
    state.decided = { status: "rejected", by: OPERATOR.applicant, at: "2026-09-13T01:00:00+00:00",
      reason: body.p_reason, firm_id: null };
    sendJson(response, 200, { request_id: OPERATOR.registration, status: "rejected" }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/resolve_stripe_event_problem") {
    const body = await readJson(request);
    if (body.p_problem !== OPERATOR.problem) return false;
    state.resolveAttempts += 1;
    // THE CONCURRENT PROVIDER EVENT, at the UI seam: the FIRST resolution lands; a SECOND one
    // meets the estate's own "already resolved" refusal, which is what an operator sees when
    // something else settled the case while they were looking at it.
    if (state.resolvedProblems.has(OPERATOR.problem)) {
      sendJson(response, 400, clr("CLR09", "stripe event problem is already resolved"), cors);
      return true;
    }
    state.resolvedProblems.add(OPERATOR.problem);
    sendJson(response, 200, { problem_id: OPERATOR.problem, event_id: "evt_615_dup", resolved: true }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_admission_capacity") {
    if (isBookkeeper(request)) {
      sendJson(response, 400, clr("CLR04", "insufficient role", "not_operator_firm"), cors);
      return true;
    }
    sendJson(response, 200, {
      max_firms: state.capacity.max_firms, firms_count: 4,
      full: state.capacity.max_firms !== null && 4 >= state.capacity.max_firms,
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/set_admission_capacity") {
    const body = await readJson(request);
    if (isBookkeeper(request)) {
      sendJson(response, 400, clr("CLR04", "insufficient role", "not_operator_firm"), cors);
      return true;
    }
    state.capacity = { max_firms: body.p_max_firms ?? null, reason: body.p_reason ?? null };
    sendJson(response, 200, {
      status: "set", max_firms: state.capacity.max_firms, reason: state.capacity.reason,
      firms_count: 4, full: state.capacity.max_firms !== null && 4 >= state.capacity.max_firms,
      updated_at: "2026-09-13T02:00:00+00:00",
    }, cors);
    return true;
  }

  return false;
}

/** The walk's persona, read off the bearer token `serve-built.mjs` actually mints: an unsigned JWT
 *  whose base64url payload carries the signed-in `email`. `serve-built.mjs`'s own `caller_context`
 *  fixture keys on the SAME fact (`state.email.startsWith("bookkeeper@")`), so this lane and the
 *  shell agree on who the caller is without a second source of truth — and the bookkeeper leg of
 *  the walk therefore meets a real CLR04 at the door, not just the app's affordance gate.
 *
 *  Fails CLOSED on an unreadable token: a request this lane cannot attribute is treated as the
 *  lower-privileged persona, so a decoding change can only ever make the walk refuse, never leak. */
function isBookkeeper(request) {
  const auth = request.headers?.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = token.split(".")[1];
  if (!payload) return true;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.email !== "string" || claims.email.startsWith("bookkeeper@");
  } catch {
    return true;
  }
}
