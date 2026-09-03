// P6-5's mock lane — a file-disjoint sibling of `chat-parity-mock.mjs`, consulted by
// `serve-built.mjs` through one hook, exactly as that module's own header describes for
// itself. Every id below is distinct from the chat-parity ones and every handler is
// ID-SCOPED, so the two walks cannot starve each other's fixtures in either direction.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin
// runtime proxy and every line of client code under test are REAL. What is faked is what sits
// behind them: PostgREST's reads and RPCs, and the chat/stream legs. So this walk proves the
// JOURNEY and the client's own wire shapes — it proves NOTHING about whether Postgres would
// accept them. `clara.apply_coa_template`'s nine rungs, `clara.resolve_onboarding_plan_item`'s
// CLR10s and `clara._human_ctx`'s floors are not exercised here, only the calls made to them.
//
// THE CALLER'S ROLE IS NOT MOCKED HERE, and that is deliberate. `serve-built.mjs` already owns
// `/rest/v1/caller_context` and keys it on the LOGIN EMAIL (`owner@` -> owner/rank 3,
// `bookkeeper@` -> bookkeeper/rank 1), and its handler runs BEFORE this hook. So the walk
// changes what the database says about the caller by signing in as a different persona,
// through the app's own real login — not through a side channel this lane would have had to
// invent and that would have proved the side channel instead of the surface.

export const P6_5 = {
  firmId: "33333333-3333-3333-3333-333333333333",
  userId: "11111111-1111-1111-1111-111111111111",
  clientA: "c1c1c1c1-1111-4111-8111-111111111111",
  clientB: "c2c2c2c2-2222-4222-8222-222222222222",
  threadFirm: "f0f0f0f0-0000-4000-8000-000000000000",
  threadA: "a0a0a0a0-1111-4111-8111-111111111111",
  threadB: "b0b0b0b0-2222-4222-8222-222222222222",
  planA: "d1d1d1d1-1111-4111-8111-111111111111",
  taskA: "e1e1e1e1-1111-4111-8111-111111111111",
  interruptionA: "e2e2e2e2-2222-4222-8222-222222222222",
  templateId: "70707070-7777-4777-8777-777777777777",
  newClientId: "9c9c9c9c-9999-4999-8999-999999999999",
  question: "Which financial year does this invoice belong to?",
};

/** THIS LANE'S THREE THREADS, exported so `serve-built.mjs` can APPEND them to its ONE shared
 *  `/api/chat/sessions` list rather than this lane claiming that endpoint for itself. A lane
 *  that claimed it starved the parity-holes walk of its own thread — `selectOwnSession` then
 *  resolved a different session and #507's cell went red. `created_by` is the shared SUBJECT
 *  and each row carries its OWN client id, so both walks' `(created_by, client_id)` selections
 *  stay disjoint. */
export const P6_5_SESSIONS = [
  // THE FIRM-ALTITUDE ROW CARRIES A DISTINCT `created_by`, AND THAT IS THE WHOLE POINT.
  // `selectOwnSession` (lib/clara/useActiveThread.ts) takes the first row matching
  // `created_by === callerSubject && client_id === null`. Before this PR the shared list held
  // ZERO such rows; with the shared SUBJECT here it held exactly one — MINE — so every walk in
  // the suite that opened the rail at firm altitude resolved this lane's thread. That is the
  // third instance of the very rule §1 of the PR proposes ("a lane must not claim a shared
  // endpoint"), and a fixture, not a handler, is where it bit.
  //
  // With a distinct subject the row is unreachable as "the caller's own" — by any walk,
  // including this one — which restores the pre-PR world exactly. This lane's own A→firm leg
  // therefore proves the boundary by what does NOT cross (client A's transcript and draft) plus
  // the client header being gone, rather than by rendering a firm transcript it would have had
  // to claim the shared list to get. `e2e-fixture-ownership.test.ts` reds if this ever carries
  // the shared subject again.
  { id: "f0f0f0f0-0000-4000-8000-000000000000", firm_id: "33333333-3333-3333-3333-333333333333", client_id: null, created_by: "5e55e55e-5555-4555-8555-555555555555", visibility: "private", title: "P6-5 firm (unreachable by design)", created_at: "2026-09-01T00:00:00.000Z" },
  { id: "a0a0a0a0-1111-4111-8111-111111111111", firm_id: "33333333-3333-3333-3333-333333333333", client_id: "c1c1c1c1-1111-4111-8111-111111111111", created_by: "11111111-1111-1111-1111-111111111111", visibility: "private", title: "P6-5 A", created_at: "2026-09-01T00:00:00.000Z" },
  { id: "b0b0b0b0-2222-4222-8222-222222222222", firm_id: "33333333-3333-3333-3333-333333333333", client_id: "c2c2c2c2-2222-4222-8222-222222222222", created_by: "11111111-1111-1111-1111-111111111111", visibility: "private", title: "P6-5 B", created_at: "2026-09-01T00:00:00.000Z" },
];

/** This lane's own mutable fixture state — see the header for why the caller's role is not
 *  one of its fields. */
const state = {
  chartState: "pending",
  appliedFamilies: null,
  amendments: [],
  bankAnswer: "Maybank only",
};

export function resetP6_5() {
  state.chartState = "pending";
  state.appliedFamilies = null;
  state.amendments = [];
  state.bankAnswer = "Maybank only";
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

const CLIENTS = () => [
  { id: P6_5.clientA, name: "ROME PROPERTIES", status: "onboarding", created_at: "2026-01-01T00:00:00.000Z" },
  { id: P6_5.clientB, name: "ROME SECRETARY", status: "onboarding", created_at: "2026-01-02T00:00:00.000Z" },
];

const PLAN = () => ({
  id: P6_5.planA, firm_id: P6_5.firmId, scope_kind: "client", client_id: P6_5.clientA,
  state: "open", revision_token: "rev-1", revision_n: 3 + state.amendments.length,
  committed_at: null, committed_by: null, review_maker: null, reviewed_at: null,
  contributors: [], commit_attestation: null, cancelled_at: null, cancelled_by: null,
  cancel_reason: null, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
});

const ITEMS = () => ([
  {
    id: "item-banks", plan_id: P6_5.planA, firm_id: P6_5.firmId, item_kind: "must_ask",
    item_key: "banks", question: "Which banks does this client use?",
    answer: state.bankAnswer, state: "resolved", required_for_commit: false,
    answered_by: P6_5.userId, answered_at: "2026-09-02T01:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T01:00:00.000Z",
  },
  {
    id: "item-coa", plan_id: P6_5.planA, firm_id: P6_5.firmId, item_kind: "todo",
    item_key: "coa_chart_apply",
    question: "Apply the firm's standard chart of accounts to this client",
    answer: { chart: "firm_template", applied: false }, state: "deferred",
    required_for_commit: false, answered_by: P6_5.userId, answered_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
  },
]);

/** The append-only trail, oldest first — one real supersession plus whatever the walk adds. */
const REVISIONS = () => {
  const rows = [
    { revision_n: 1, snapshot: { plan: {}, items: [{ item_key: "banks", state: "pending", answer: null, answered_at: null }] }, created_at: "2026-09-01T00:00:00.000Z" },
    { revision_n: 2, snapshot: { plan: {}, items: [{ item_key: "banks", state: "resolved", answer: "CIMB only", answered_at: "2026-09-01T05:00:00.000Z" }] }, created_at: "2026-09-01T05:00:00.000Z" },
    { revision_n: 3, snapshot: { plan: {}, items: [{ item_key: "banks", state: "resolved", answer: "Maybank only", answered_at: "2026-09-02T01:00:00.000Z" }] }, created_at: "2026-09-02T01:00:00.000Z" },
  ];
  state.amendments.forEach((text, i) => {
    rows.push({ revision_n: 4 + i, snapshot: { plan: {}, items: [{ item_key: "banks", state: "resolved", answer: text, answered_at: `2026-09-02T0${2 + i}:00:00.000Z` }] }, created_at: `2026-09-02T0${2 + i}:00:00.000Z` });
  });
  return rows;
};

/** The PostgREST half. Returns true when it answered. */
export async function handleP6_5Supabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    // ID-SCOPED ONLY. An UNFILTERED read is the client REGISTER, which every walk shares —
    // claiming it replaced the parity-holes fixture's own clients and its navigation cell
    // could no longer find the link it clicks. This walk navigates by URL and never reads a
    // register, so the unfiltered case falls through to whoever owns it.
    if (idFilter === `eq.${P6_5.clientA}`) { sendJson(response, 200, [CLIENTS()[0]], cors); return true; }
    if (idFilter === `eq.${P6_5.clientB}`) { sendJson(response, 200, [CLIENTS()[1]], cors); return true; }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_tasks_visible") {
    // THREAD-SCOPED, like everything else in this lane: an unscoped claim on a relation every
    // walk's rail now reads would answer for threads this lane does not own. Only the three
    // ids below are ours; anything else falls through.
    const session = url.searchParams.get("session_id");
    const ours = [P6_5.threadA, P6_5.threadB, P6_5.threadFirm].map((id) => `eq.${id}`);
    if (!session || !ours.includes(session)) return false;
    // THE REHYDRATION READ. Only client A's thread carries a parked run.
    if (session === `eq.${P6_5.threadA}`) {
      sendJson(response, 200, [{
        id: P6_5.taskA,
        status: "awaiting_input",
        created_at: new Date(Date.now() - 95_000).toISOString(),
      }], cors);
      return true;
    }
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_interruptions") {
    if (url.searchParams.get("task_id") !== `eq.${P6_5.taskA}`) return false;
    sendJson(response, 200, [{
      id: P6_5.interruptionA, task_id: P6_5.taskA, kind: "clarify",
      question: { type: "clarify", question: P6_5.question, context: null, framing: "" },
      answer: null, status: "pending", asked_of: null, answered_by: null,
      expires_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-02T00:00:00.000Z", answered_at: null,
    }], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/onboarding_plans") {
    // CLIENT-SCOPED, and falling through rather than answering `[]` for someone else's
    // client: an empty answer is still an ANSWER, and it would tell another walk's card that
    // its client has no plan.
    if (clientFilter !== `eq.${P6_5.clientA}`) return false;
    sendJson(response, 200, [PLAN()], cors);
    return true;
  }

  // PLAN-SCOPED. Both reads carry `plan_id=eq.<id>`, so this lane answers only for its own
  // plan and every other walk's checklist card is untouched.
  const planFilter = url.searchParams.get("plan_id");
  if (request.method === "GET" && path === "/rest/v1/onboarding_plan_items") {
    if (planFilter !== `eq.${P6_5.planA}`) return false;
    sendJson(response, 200, ITEMS(), cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/onboarding_plan_revisions") {
    if (planFilter !== `eq.${P6_5.planA}`) return false;
    sendJson(response, 200, REVISIONS(), cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/opening_seed_registry") {
    if (planFilter !== `eq.${P6_5.planA}`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/resolve_onboarding_plan_item") {
    const body = await readJson(request);
    if (body.p_plan !== P6_5.planA) return false;
    state.amendments.push(String(body.p_resolution ?? ""));
    state.bankAnswer = String(body.p_resolution ?? "");
    sendJson(response, 200, { plan_id: P6_5.planA, item_id: "item-banks", state: "resolved" }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/coa_chart_state") {
    if ((await readJson(request)).p_client !== P6_5.clientA) return false;
    sendJson(response, 200, {
      client_id: P6_5.clientA, seed_decision: "firm_template", seed_wants_template: true,
      accounts: state.appliedFamilies ? 51 : 0,
      adoption_id: state.appliedFamilies ? "adopt-1" : null,
      adoption_state: state.appliedFamilies ? "adopted" : null,
      template_id: state.appliedFamilies ? P6_5.templateId : null,
      template_version: state.appliedFamilies ? 1 : null,
      families: state.appliedFamilies, adopted_at: null,
      state: state.appliedFamilies ? "adopted" : state.chartState,
    }, cors);
    return true;
  }

  // EXCEPTION 1 of 2, named rather than silent. `clara.list_coa_templates()` takes NO ARGUMENTS,
  // so the request carries no subject to scope by — clause 1 of the ownership rule cannot be
  // applied to it, and pretending otherwise with a `return false` on some invented condition
  // would be worse than saying so. Measured: no other spec in `apps/web/e2e` calls it
  // (`grep -rn list_coa_templates apps/web/e2e` returns this file and this lane's walk only), and
  // `e2e-fixture-ownership.test.ts` holds that measurement as a cell — the day another walk needs
  // it, the census reds and the two lanes settle who owns the list.
  if (request.method === "POST" && path === "/rest/v1/rpc/list_coa_templates") {
    sendJson(response, 200, [{
      template_id: P6_5.templateId, scope: "platform", firm_id: null,
      template_key: "my_sme_starter", version: 1, title: "Malaysian SME starter",
      framework_hint: "MPERS", basis: "reviewed", state: "published",
      content_sha256: "abc", forked_from: null, created_at: "2026-01-01T00:00:00.000Z",
      published_at: "2026-01-01T00:00:00.000Z", retired_at: null, families: 3, accounts: 42,
    }], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_coa_template") {
    if ((await readJson(request)).p_template !== P6_5.templateId) return false;
    sendJson(response, 200, {
      template_id: P6_5.templateId,
      families: [
        { family_key: "core_ledger", label: "Core ledger", inclusion: "core", basis: "always", sort_ordinal: 1 },
        { family_key: "retail", label: "Retail trade", inclusion: "by_industry", basis: "msic 47", sort_ordinal: 2 },
      ],
      accounts: [],
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/coa_template_family_plan") {
    const plan = await readJson(request);
    if (plan.p_client !== P6_5.clientA || plan.p_template !== P6_5.templateId) return false;
    sendJson(response, 200, {
      template_id: P6_5.templateId, client_id: P6_5.clientA, axes: {}, msic_division: null,
      absent_axes: ["msic"], axis: "partial", keep: ["core_ledger"], drop: ["retail"],
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/apply_coa_template") {
    const body = await readJson(request);
    if (body.p_client !== P6_5.clientA) return false;
    state.appliedFamilies = body.p_families ?? [];
    sendJson(response, 200, {
      client_id: P6_5.clientA, template_id: P6_5.templateId, template_version: 1,
      adoption_id: "adopt-1", families: state.appliedFamilies, families_source: "caller",
      accounts: 51, account_codes: [], plan: {},
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/begin_client_onboarding") {
    const body = await readJson(request);
    // EXCEPTION 2 of 2, and the one the review agreed is separately justified. Its only
    // argument is `p_name` — a free-text client name, not an id — so there is no SUBJECT to
    // scope by: any walk creating any client would carry a different name, and keying on this
    // lane's own string would be scoping by a label rather than by identity ("spelling is not
    // identity", applied to a fixture). Measured: no other spec calls it.
    //
    // NO FLOOR CHECK HERE either, and that absence is deliberate rather than lax. The floor
    // this door enforces (`_human_ctx(role_rank('admin'))`, 0017:2497) is Postgres's, and
    // Postgres is not in this walk — a mock re-implementing it would be a SECOND copy of a
    // wall, which the review laws forbid, and greening it would prove the copy. What the
    // browser leg proves is the SURFACE property: below the floor the row is not offered at
    // all, so this door is never reached. The verbatim rendering of a real refusal is proved
    // where one can be produced honestly — `components/command/command-do.test.tsx`.
    sendJson(response, 200, { client_id: P6_5.newClientId, plan_id: "plan-new", name: body.p_name }, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/chat_sessions") {
    const wanted = idFilter?.replace("eq.", "");
    const map = { [P6_5.threadA]: P6_5.clientA, [P6_5.threadB]: P6_5.clientB, [P6_5.threadFirm]: null };
    if (!wanted || !(wanted in map)) return false;
    sendJson(response, 200, [{
      id: wanted, firm_id: P6_5.firmId, client_id: map[wanted], created_by: P6_5.userId,
      visibility: "private", title: "P6-5", created_at: "2026-09-02T01:00:00.000Z",
    }], cors);
    return true;
  }

  return false;
}

/** This lane's ONE app-origin control endpoint. Not a runtime route and never was —
 *  the walk POSTs it directly to reset the lane's own fixture state. */
export async function handleP6_5App(request, response, url) {
  if (request.method === "POST" && url.pathname === "/e2e-p6-5/reset") {
    resetP6_5();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ reset: true }));
    return true;
  }
  return false;
}

/** The chat legs for this walk's three threads, AS THE RUNTIME SEES THEM. They moved out
 *  of the app-origin handler above when the chat lane was repointed at the same-origin
 *  proxy: the browser now asks for `/api/runtime/chat/sessions/<id>/messages`, which the
 *  proxy forwards here as `/api/chat/sessions/<id>/messages` (route.ts:53). Paths
 *  unchanged; the hop that reaches them is real. */
export async function handleP6_5Runtime(request, response, url) {
  const path = url.pathname;

  // `/api/chat/sessions` is DELIBERATELY NOT CLAIMED HERE — see `P6_5_SESSIONS`. There is one
  // session list per server, and this lane's rows are appended to it rather than answered
  // from a second one that would starve every other walk.

  const threadMessages = {
    [P6_5.threadA]: "CLIENT A TRANSCRIPT",
    [P6_5.threadB]: "CLIENT B TRANSCRIPT",
    [P6_5.threadFirm]: "FIRM TRANSCRIPT",
  };
  for (const [threadId, text] of Object.entries(threadMessages)) {
    if (request.method === "GET" && path === `/api/chat/sessions/${threadId}/messages`) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        messages: [{ id: `m-${threadId}`, role: "assistant", parts: [{ type: "text", text }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00.000Z" }],
      }));
      return true;
    }
  }

  return false;
}
