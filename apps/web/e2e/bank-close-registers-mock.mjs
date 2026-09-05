// L7's mock lane — a file-disjoint sibling of `agentic-finish-mock.mjs` and
// `chat-parity-mock.mjs`, consulted by `serve-built.mjs` through ONE hook, exactly as
// those modules' own headers describe for themselves. Every id below is distinct from
// theirs and every handler is ID-SCOPED, so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, and every line of
// client code under test are REAL — the dialog wrappers, `runOnce`, `act()`, the close
// predicates, the member-name resolver. What is faked is PostgREST: its reads and its
// RPC answers, INCLUDING the governed refusal this walk needs. So this walk proves the
// JOURNEY and what the surface does with a refusal — it proves NOTHING about whether
// Postgres would actually raise that refusal. `clara.abandon_close`'s own CLR41 and
// `clara._human_ctx`'s floors are exercised in the db battery, not here.
//
// THE THREE JOURNEYS, one per defect this lane fixed:
//   1. CB-AE2E-004 — a REFUSED door keeps its dialog open, with the typed reason still
//      in the field and the DB's own code + message readable INSIDE the dialog.
//   2. H-11 / CB-AE2E-016 — a year whose latest close run was ABANDONED offers a door
//      again, labelled "Restart close" rather than "Begin close".
//   3. CB-AE2E-028 — the close-prep hold's `held_by` renders a member's display name,
//      not the raw `clara.users(id)` uuid it carries.

export const L7 = {
  firmId: "77777777-7777-4777-8777-777777777777",
  clientId: "77c7c7c7-7777-4777-8777-777777777777",
  fyInProgress: "7f171717-7777-4777-8777-777777777777",
  fyAbandoned: "7f272727-7777-4777-8777-777777777777",
  closeRunId: "7c1c1c1c-7777-4777-8777-777777777777",
  // The uuid the hold carries. It MUST match `serve-built.mjs`'s own
  // `/rest/v1/firm_members_visible` SUBJECT for the resolver to find a name — that is
  // the point of the third journey, and using a different id here would prove only
  // that the fallback works.
  heldBy: "11111111-1111-1111-1111-111111111111",
  refusalMessage: "this close run is already abandoned",
};

/** Whether the abandon door has been attempted yet — the walk drives the refusal, so
 *  the fixture never mutates. Kept for symmetry with the sibling lanes and reset
 *  between specs by `resetL7`. */
const state = { abandonAttempts: 0 };

export function resetL7() {
  state.abandonAttempts = 0;
}

export function l7AbandonAttempts() {
  return state.abandonAttempts;
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
  id: L7.clientId,
  name: "L7 CLOSE FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

const FISCAL_YEARS = () => [
  // OLDEST FIRST is the DB's own ordering, and the picker takes the first row: the
  // ABANDONED year leads, so journey 2 lands without a click.
  {
    fiscal_year_id: L7.fyAbandoned, label: "FY2024", ordinal: 1,
    starts_on: "2024-01-01", ends_on: "2024-12-31", status: "open",
    fy_end_source: "asserted", has_active_reopen_receipt: false,
  },
  {
    fiscal_year_id: L7.fyInProgress, label: "FY2025", ordinal: 2,
    starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closing",
    fy_end_source: "asserted", has_active_reopen_receipt: false,
  },
];

/** THE ABANDONED YEAR — the exact shape `get_close_plan` returns after an Abandon:
 *  the LATEST run in ANY state (0064:182-184) is 'abandoned', and the fiscal year is
 *  back to 'open' (0120:1186-1189). Every branch of the old `canBegin` predicate read
 *  false on this document, so the door row rendered empty. */
const PLAN_ABANDONED = () => ({
  fiscal_year: {
    id: L7.fyAbandoned, client_id: L7.clientId, label: "FY2024", ordinal: 1,
    starts_on: "2024-01-01", ends_on: "2024-12-31", status: "open", fy_end_source: "asserted",
  },
  close_run: {
    state: "present", close_run_id: "7c0c0c0c-7777-4777-8777-777777777777",
    run_state: "abandoned", started_by: L7.heldBy, started_at: "2026-02-01T00:00:00.000Z",
    ended_by: L7.heldBy, ended_at: "2026-02-02T00:00:00.000Z",
    end_reason: "the client resent the statements",
  },
  checks: [],
  receipt: { state: "absent" },
});

/** THE IN-PROGRESS YEAR — Finalize + Abandon are offered, and Abandon is the door the
 *  first journey drives to a refusal. One drawer-1 gate is deliberately `unknown`, so
 *  the pre-flight banner (H-54) has something true to report. */
const PLAN_IN_PROGRESS = () => ({
  fiscal_year: {
    id: L7.fyInProgress, client_id: L7.clientId, label: "FY2025", ordinal: 2,
    starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closing", fy_end_source: "asserted",
  },
  close_run: {
    state: "present", close_run_id: L7.closeRunId, run_state: "in_progress",
    started_by: L7.heldBy, started_at: "2026-03-01T00:00:00.000Z",
    ended_by: null, ended_at: null, end_reason: null,
  },
  checks: [
    {
      check_key: "ar_control_tie", drawer: 1, title: "AR control tie", applies_when: "always",
      result: { state: "unknown", measured: {}, measured_digest: "d1", evaluated_at: "2026-03-01T00:00:00.000Z" },
      items: [],
    },
  ],
  receipt: { state: "absent" },
});

/** `get_close_readiness`'s OWN shape (lib/close/types.ts's CloseReadiness): a
 *  `gates[]` array, not a `checks[]` one. The first cut of this fixture invented
 *  `checks` and `as_of`, and CloseReadinessPanel threw on the missing array — the
 *  whole close route rendered its error boundary, which is exactly the "a fixture
 *  that does not match the read's contract proves nothing" trap. Keyed on the
 *  fiscal year so each plan gets a consistent one. */
const READINESS = (fiscalYearId) => ({
  fiscal_year_id: fiscalYearId,
  close_run_id: fiscalYearId === L7.fyInProgress ? L7.closeRunId : null,
  run_state: fiscalYearId === L7.fyInProgress ? "in_progress" : "abandoned",
  fy_end_source: "asserted",
  gates: fiscalYearId === L7.fyInProgress
    ? [{ check_key: "ar_control_tie", drawer: 1, state: "unknown", measured: {}, measured_digest: "d1", attested: false }]
    : [],
});

/** THE HOLD. `held_by` is a uuid — `close_prep_holds.held_by` is
 *  `uuid not null references clara.users(id)` (0138:575) — and it used to render raw,
 *  beside the words "Held by". */
const HOLD = () => [{
  id: "7h7h7h7h-7777-4777-8777-777777777777",
  client_id: L7.clientId,
  purpose: "close_prep",
  held_by: L7.heldBy,
  reason: "waiting on the April bank statement",
  held_at: "2026-03-02T00:00:00.000Z",
  released_by: null,
  released_at: null,
  release_reason: null,
}];

/** The PostgREST half. Returns true when it answered, false to fall through. */
export async function handleL7Supabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  // ID-SCOPED ONLY (the sibling lanes' own rule): the UNFILTERED /clients read is the
  // client register every walk shares, and claiming it would replace another walk's
  // fixture. This walk navigates by URL and never reads the register.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === `eq.${L7.clientId}`) {
      sendJson(response, 200, [CLIENT()], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/close_prep_holds") {
    if (clientFilter !== `eq.${L7.clientId}`) return false;
    sendJson(response, 200, HOLD(), cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/close_proposals") {
    const run = url.searchParams.get("close_run_id");
    if (run !== `eq.${L7.closeRunId}` && run !== `eq.7c0c0c0c-7777-4777-8777-777777777777`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  // THE TWO NAMED EXCEPTIONS. Neither request carries a subject this lane could scope
  // on: `close_gate_checks` is the firm-wide gate CATALOG (no filter at all) and
  // `report_agent_receipts` is read unfiltered by the close page's receipt panel.
  // Both are reachable ONLY from `/clients/:id/close`, and this is the only walk in
  // `apps/web/e2e` that opens that route — measured by
  // `e2e-fixture-ownership.test.ts`, which reads this file and reds if either name
  // stops being declared there. Scoping by a label instead would be the
  // "spelling is not identity" mistake applied to a fixture.
  if (request.method === "GET" && path === "/rest/v1/close_gate_checks") {
    sendJson(response, 200, [{ check_key: "ar_control_tie", drawer: 1, title: "AR control tie", applies_when: "always" }], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/report_agent_receipts") {
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  const body = await readJson(request);

  if (verb === "list_fiscal_years") {
    if (body.p_client !== L7.clientId) return false;
    sendJson(response, 200, FISCAL_YEARS(), cors);
    return true;
  }

  if (verb === "get_close_plan") {
    if (body.p_fiscal_year_id === L7.fyAbandoned) { sendJson(response, 200, PLAN_ABANDONED(), cors); return true; }
    if (body.p_fiscal_year_id === L7.fyInProgress) { sendJson(response, 200, PLAN_IN_PROGRESS(), cors); return true; }
    return false;
  }

  if (verb === "get_close_readiness") {
    if (body.p_client !== L7.clientId) return false;
    sendJson(response, 200, READINESS(body.p_fy), cors);
    return true;
  }

  if (verb === "list_agent_act_receipts") {
    if (body.p_client !== L7.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  // THE REFUSAL THE FIRST JOURNEY NEEDS. PostgREST's own error envelope, and the exact
  // shape `lib/doors.ts` classifies as a governed DoorRefusal: a CLR code in `code`,
  // the DB's message verbatim, and the reason token inside `details`.
  if (verb === "abandon_close") {
    if (body.p_close_run !== L7.closeRunId) return false;
    state.abandonAttempts += 1;
    sendJson(response, 400, {
      code: "CLR41",
      message: L7.refusalMessage,
      details: '{"reason":"close_not_in_progress"}',
    }, cors);
    return true;
  }

  return false;
}
