// The Home boards' fixture lane — a file-disjoint sibling of `chat-parity-mock.mjs` and
// `agentic-finish-mock.mjs`, consulted by `serve-built.mjs` through one hook.
//
// WHY THIS FILE EXISTS AT ALL. Before this train `/` performed ZERO reads and `/clients/:id`
// performed two. Both now read for real, which means every walk in the suite that merely LANDS
// on one of those routes — and several do, including the axe walk, whose `FACES` list starts
// with `/` — suddenly issues a dozen requests the shared mock server had never been asked for.
// An unanswered route is a 404, which the app correctly renders as a failure banner. So these
// routes need an answer, and the honest answer for a mock estate with no seeded data is the
// EMPTY one.
//
// WHY THE ANSWERS ARE UNSCOPED, AND WHY THAT IS SAFE HERE. The ownership rule
// (`e2e-fixture-ownership.test.ts`) exists because a lane that ANSWERS a shared endpoint with
// ITS OWN DATA replaces everyone else's. Nothing here has any data: every handler returns `[]`
// or a null-shaped envelope, which is exactly what `serve-built.mjs` already does for
// `/rest/v1/client_facts` and `/rest/v1/onboarding_plans`. Two properties keep it safe:
//   1. THE HOOK RUNS LAST. `serve-built.mjs` consults it after every other lane's hook and after
//      its own generic fixtures, so a lane that owns one of these routes for its own ids has
//      already answered and this module never sees the request.
//   2. NO FIXTURE, NO IDENTITY. There is no row here for anyone to resolve as "their own", which
//      is the shape of the third ownership failure that rule was written for.
//
// A WALK THAT WANTS REAL DATA OVERLAYS IT PER PAGE. `home-board-walk.spec.ts` uses Playwright's
// own `page.route`, which is scoped to ONE page in ONE test — it cannot reach another spec's
// server at all. That is the right instrument for "this walk needs a populated firm", and it is
// why this module stays empty rather than growing a persona.

/**
 * THE ONE FIXTURE ROW THIS LANE OWNS, and why it cannot be a `page.route` overlay like every
 * other row the walk needs.
 *
 * `app/(firm)/clients/[clientId]/layout.tsx` reads `loadClientById` on the SERVER, before the
 * page renders, and calls `notFound()` when it comes back empty. That request leaves the Next
 * server, not the browser, so Playwright's `page.route` cannot see it — a walk that wants an
 * ONBOARDING client has to be able to name one this server knows about, or it meets a 404 page
 * and proves nothing.
 *
 * IT IS SCOPED BY ITS OWN ID, which is the discipline `e2e-fixture-ownership.test.ts` exists to
 * enforce: the handler answers ONLY for this id and falls through for every other, so the
 * UNFILTERED `/rest/v1/clients` register — the shared fixture whose capture broke another
 * walk's navigation cell — is left exactly as `serve-built.mjs` has it, and no other lane's
 * client can resolve to this row.
 */
const HOME_ONBOARDING_CLIENT = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  name: "Kuching Kopitiam",
  status: "onboarding",
  created_at: "2026-08-20T00:00:00.000Z",
};

/** Table/view reads the two boards make that no other handler owns. Empty array each. */
const EMPTY_RELATIONS = [
  "/rest/v1/agent_tasks_visible",
  "/rest/v1/attribution_candidates",
  "/rest/v1/client_fact_keys",
  "/rest/v1/close_prep_holds",
  "/rest/v1/coa_accounts",
  "/rest/v1/coding_tasks_visible",
  "/rest/v1/lint_findings",
  "/rest/v1/onboarding_plan_items",
  "/rest/v1/opening_seed_registry",
];

/**
 * #650 — THE HONEST-EMPTY WORK PACK, and the one handler in this file the ownership census can
 * see.
 *
 * `clara.get_client_work_pack` returns a scalar JSONB OBJECT, not a SETOF, so `[]` would be a
 * malformed body rather than an empty answer — the browser would degrade both facets to
 * `unknown` and every client route in the suite would grow two "could not be read" tiles. This is
 * the empty ENVELOPE instead: two facets that were read and found empty, with a window and a read
 * instant.
 *
 * DELIBERATELY UNSCOPED, and declared as such in `e2e-fixture-ownership.test.ts`. The request
 * DOES carry a discriminant (`p_client`), so this could be scoped and is not — which is why it is
 * recorded as debt rather than as "unscopeable", a reason that would be false. What makes it safe
 * is the property this whole file rests on: there is no fixture in it. A walk that wants a
 * POPULATED band overlays its own `page.route`, which is scoped to one page in one test and
 * cannot reach another spec's server.
 *
 * The dates are fixed rather than derived from `Date.now()` so two runs of one spec see the same
 * board; nothing asserts on them, because there is nothing in this envelope to count.
 */
const EMPTY_WORK_PACK = {
  computed_at: "2026-09-16T02:00:00.000Z",
  preview_limit: 5,
  window: {
    from: "2026-09-09T16:00:00.000Z", to: "2026-09-16T16:00:00.000Z",
    from_date: "2026-09-10", to_date: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7,
  },
  facets: {
    active: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    recent_success: {
      status: "ok", count: 0, coverage: "ok", coverage_reason: null,
      uncounted_completions: 0, rows: [],
    },
  },
  needs_you_ref: { source: "list_review_queue.counts.work_questions" },
};

/**
 * #659 — THE HONEST-EMPTY FIRM PORTFOLIO PACK, and the second handler in this file the ownership
 * census can see.
 *
 * `clara.get_firm_portfolio_pack` returns a scalar JSONB OBJECT, not a SETOF, so `[]` would be a
 * malformed body rather than an empty answer — the browser would degrade the whole board and every
 * walk that merely LANDS on `/` (the axe walk's `FACES` list starts there) would grow a "could not
 * be read" portfolio. This is the empty ENVELOPE instead: a register that was read and found empty.
 *
 * IT CANNOT BE SCOPED, and that is a fact about the door rather than a convenience. The pack takes
 * NO client argument at all — its subject is the caller's own firm, which arrives as a JWT claim,
 * not as a discriminant in the request — so there is nothing in the body to gate on. It holds no
 * fixture either: zero rows, so nothing in it can be resolved by a sibling walk as its own.
 *
 * The dates are fixed rather than derived from `Date.now()` so two runs of one spec see the same
 * board; nothing asserts on them, because there is nothing in this envelope to count.
 */
const EMPTY_PORTFOLIO_PACK = {
  computed_at: "2026-09-16T02:00:00.000Z",
  preview_limit: 3,
  page_limit: 50,
  window: {
    from: "2026-09-09T16:00:00.000Z", to: "2026-09-16T16:00:00.000Z",
    from_date: "2026-09-10", to_date: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7,
  },
  rows: [],
  next_cursor: null,
  truncated: false,
  coverage: "ok",
  coverage_reason: null,
  sources: {
    work: { computed_at: "2026-09-16T02:00:00.000Z" },
    review_queue: { signal: "watermark", excludes: ["onboarding", "archived"] },
    compliance: { signal: "stale_evaluator", window_hours: 48 },
    lint: { signal: "stale_evaluator" },
    sweep: { signal: "last_finalized_at" },
  },
  needs_you_ref: { source: "list_review_queue.counts", floor: "viewer", excludes: ["onboarding", "archived"] },
};

/** Read RPCs the two boards (and the Tax tab) call. Every one returns a SETOF/TABLE, so an
 *  empty array is the shape the wire really carries — never `null`, which several of the typed
 *  wrappers would report as a malformed body rather than as an empty result. */
const EMPTY_RPCS = [
  "/rest/v1/rpc/list_agent_act_receipts",
  "/rest/v1/rpc/list_bank_account_proposals",
  "/rest/v1/rpc/list_bank_accounts",
  "/rest/v1/rpc/list_bank_statements",
  "/rest/v1/rpc/list_fiscal_years",
  "/rest/v1/rpc/list_uncoded_filings",
];

/**
 * Answer one request, or return false to let `serve-built.mjs` fall through to its 404.
 *
 * `list_firm_timeline` is DELIBERATELY NOT HANDLED. This mock exercises the compatibility arm
 * for a database that predates migration 0174, so Firm Home renders its "not available yet"
 * note for the resulting 404. Timeline-specific walks supply their own handler.
 */
export async function handleHomeBoardSupabase(request, response, path, url, sendJson, cors) {
  // ID-SCOPED, and it falls through for every id but its own — including the UNFILTERED
  // register read, which this lane never answers.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    const filter = url.searchParams.get("id");
    if (filter === `eq.${HOME_ONBOARDING_CLIENT.id}`) {
      sendJson(response, 200, [HOME_ONBOARDING_CLIENT], cors);
      return true;
    }
    return false;
  }
  if (request.method === "GET" && EMPTY_RELATIONS.includes(path)) {
    sendJson(response, 200, [], cors);
    return true;
  }
  if (request.method === "POST" && path === "/rest/v1/rpc/get_client_work_pack") {
    sendJson(response, 200, EMPTY_WORK_PACK, cors);
    return true;
  }
  // #659 — APPENDED beside its client-altitude sibling, and deliberately NOT folded into
  // `EMPTY_RPCS` below: that arm answers `[]`, which is the wrong shape for a scalar JSONB door.
  if (request.method === "POST" && path === "/rest/v1/rpc/get_firm_portfolio_pack") {
    sendJson(response, 200, EMPTY_PORTFOLIO_PACK, cors);
    return true;
  }
  if (request.method === "POST" && EMPTY_RPCS.includes(path)) {
    sendJson(response, 200, [], cors);
    return true;
  }
  return false;
}
