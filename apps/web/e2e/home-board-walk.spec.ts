import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import { cellBudgetMs, signInTo } from "./helpers";

// The Home boards' browser leg (裁-86): Firm Home -> a tile -> the surface that owns it -> back,
// then the client board for an ACTIVE and an ONBOARDING client, each at 1440 and at 1024 with
// the Clara rail open, with axe on both faces.
//
// THE FIXTURES ARE OVERLAID PER PAGE, NOT ON THE SHARED SERVER. `page.route` is scoped to one
// page in one test, so a populated firm here cannot reach another spec — which is exactly the
// ownership failure `e2e-fixture-ownership.test.ts` was written for. `e2e/home-board-mock.mjs`
// stays empty and answers only the honest-empty case for every OTHER walk.
//
// WHAT IS REAL. The browser, the built Next bundle, the routing, the layout, the container
// queries and every line of client code under test. What is faked is PostgREST behind them, so
// this proves the JOURNEY and the client's own wire shapes — never that Postgres would accept
// them.

const CLIENT_ACTIVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_ONBOARDING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CLIENTS = [
  { id: CLIENT_ACTIVE, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Bee Creative Solution", status: "active", created_at: "2026-02-01T00:00:00.000Z" },
  { id: CLIENT_ONBOARDING, name: "Kuching Kopitiam", status: "onboarding", created_at: "2026-08-20T00:00:00.000Z" },
];

const DRAFT_ROW = {
  row_kind: "draft", section: "needs_you", client_id: CLIENT_ACTIVE, counterparty_id: null,
  filing_id: null, entry_id: "e1", question_id: null, task_id: null, document_id: null,
  lane: null, auto: false, rule_backed: false, high_stakes: true, aged_since: "2026-08-01T00:00:00Z",
  amount_cents: 1_240_000, period: "2026-08", question_text: null, created_at: "2026-08-01T00:00:00Z",
  id: "e1", coding_kind: "draft", watch_id: null, tier: null, finding_id: null, asset_id: null,
  advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
};

const ENVELOPE = {
  watermark: "w",
  // `work_questions` is #629's Work-keyed count and the ONLY source the attention band's
  // "waiting on a person" tile reads — deliberately a DIFFERENT number from `needs_you`, so a
  // tile that took the wrong key off this envelope would print 3 where it should print 2.
  counts: { ready: 5, needs_review: 12, needs_you: 3, open_drafts: 2, open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 4, work_questions: 2 },
  sweep: { open_run: false, last_finalized_at: "2026-09-03T00:31:00Z", last_ack_at: null },
  compliance: { stale_evaluator: false, clients: [] },
  rows: [DRAFT_ROW], next_cursor: null,
};

// #659 (D18.f) — Recent activity reads `clara.list_activity` now, so the board can render WHO did
// each thing. This lane MUST overlay it: `activity-mock.mjs` answers a firm-wide `list_activity`
// unconditionally on the shared server (serve-built.mjs:609, far above the home-board hook at
// :720), so without a `page.route` here this walk would be asserting #632's fixtures.
const ACTIVITY_MEMBER = "11111111-1111-4111-8111-111111111111";
const ACTIVITY = {
  rows: [{
    id: "ev-9", source: "event", event_type: "entry_posted", description: "An entry was posted.",
    client_id: CLIENT_ACTIVE, actor: ACTIVITY_MEMBER, on_behalf_of: null, via_wake_kind: null,
    occurred_at: "2026-09-04T01:12:00Z", object_kind: "entry", object_id: "e1", work_id: null,
    receipt_id: null, document_id: null, original_entry_id: null, replacement_entry_id: null,
    status: "approved", kind: "journal",
  }],
  next_cursor: null, truncated: false,
};

const MEMBERS = [{
  membership_id: "m1", user_id: ACTIVITY_MEMBER, display_name: "Tao Belcort",
  email: "owner@example.test", role: "owner", status: "active",
  created_at: "2026-01-01T00:00:00Z", removed_at: null,
}];

/**
 * #659 — THE PORTFOLIO. A MIXED fixture on purpose: an active client with Work in all three
 * columns, an active client that is caught up, and an ONBOARDING client whose Work is counted here
 * while the needs-you chips above structurally exclude it. The counts are the ones `listWorkPage`
 * can actually serve, so each drilldown lands on the population its number described.
 */
const PORTFOLIO = {
  computed_at: "2026-09-16T02:00:00.000Z",
  preview_limit: 3,
  page_limit: 50,
  window: {
    from: "2026-09-09T16:00:00.000Z", to: "2026-09-16T16:00:00.000Z",
    from_date: "2026-09-10", to_date: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7,
  },
  rows: [
    {
      client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Bee Creative Solution",
      status: "active", active: 0, attention_failed: 0, failed: 0, refused: 0, recent_success: 0,
      uncounted_completions: 0, coverage: "ok", coverage_reason: null, preview: [],
    },
    {
      client_id: CLIENT_ONBOARDING, name: "Kuching Kopitiam", status: "onboarding",
      active: 1, attention_failed: 0, failed: 0, refused: 0, recent_success: 0,
      uncounted_completions: 0, coverage: "partial",
      coverage_reason: "onboarding_client_excluded_from_queue", preview: [],
    },
    {
      client_id: CLIENT_ACTIVE, name: "Rome Properties", status: "active",
      active: 3, attention_failed: 2, failed: 1, refused: 1, recent_success: 1,
      uncounted_completions: 0, coverage: "ok", coverage_reason: null, preview: [],
    },
  ],
  next_cursor: null, truncated: false, coverage: "ok", coverage_reason: null,
  sources: {
    work: { computed_at: "2026-09-16T02:00:00.000Z" },
    review_queue: { signal: "watermark", excludes: ["onboarding", "archived"] },
    compliance: { signal: "stale_evaluator", window_hours: 48 },
    lint: { signal: "stale_evaluator" },
    sweep: { signal: "last_finalized_at" },
  },
  needs_you_ref: { source: "list_review_queue.counts", floor: "viewer", excludes: ["onboarding", "archived"] },
};

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: CLIENT_ONBOARDING, state: "open",
  revision_token: "t", revision_n: 2, committed_at: null, committed_by: null, review_maker: null,
  reviewed_at: null, contributors: [], commit_attestation: null, cancelled_at: null,
  cancelled_by: null, cancel_reason: null, created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z", opened_by_agent: false, opener_model: null, opened_from_question: null,
};
const PLAN_ITEMS = [
  { id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "a", question: null, answer: null, state: "answered", required_for_commit: true, answered_by: null, answered_at: null, created_at: "", updated_at: "" },
  { id: "i2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "b", question: null, answer: null, state: "pending", required_for_commit: true, answered_by: null, answered_at: null, created_at: "", updated_at: "" },
];

// #650 — the Work attention band's own read, POPULATED. `active` at 3 over a two-row preview and
// `recent_success` at 1 over a one-row preview is the discriminating shape: a build that derived a
// tile from `rows.length` would print 2 and 1, and a build that derived either from the review
// queue's `counts.work_questions` (3 in ENVELOPE above? no — `needs_you` is 3 and
// `work_questions` is absent) would print something else again.
const WORK_PACK = {
  computed_at: "2026-09-16T02:00:00.000Z",
  preview_limit: 5,
  window: {
    from: "2026-09-09T16:00:00.000Z", to: "2026-09-16T16:00:00.000Z",
    from_date: "2026-09-10", to_date: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7,
  },
  facets: {
    active: {
      status: "ok", count: 3, coverage: "ok", coverage_reason: null,
      rows: [
        {
          work_id: "99999999-9999-4999-8999-999999999991", purpose: "journal_entry",
          status: "running", memo: "Office rent", attempts: 2, current_run_status: "running",
          retrying: true, created_at: "2026-09-16T01:00:00.000Z", updated_at: null,
        },
        {
          work_id: "99999999-9999-4999-8999-999999999992", purpose: "payroll_obligation",
          // The preview row and the list row below carry the SAME memo on purpose: the drilldown
          // leg asserts the population it lands on, and a fixture that spelled one Work two ways
          // would make that assertion about the fixture rather than about the journey.
          status: "queued", memo: "Payroll run", attempts: 1, current_run_status: null,
          retrying: false, created_at: "2026-09-16T00:00:00.000Z", updated_at: null,
        },
      ],
    },
    recent_success: {
      status: "ok", count: 1, coverage: "ok", coverage_reason: null, uncounted_completions: 0,
      rows: [{
        work_id: "99999999-9999-4999-8999-999999999993", purpose: "journal_entry",
        status: "completed", memo: "Bank fee", receipt_id: "r1", entry_id: "e1",
        committed_at: "2026-09-15T02:00:00.000Z",
      }],
    },
  },
  needs_you_ref: { source: "list_review_queue.counts.work_questions" },
};

/**
 * THE WORK LIST A DRILLDOWN ACTUALLY LANDS ON — answered from the SAME fixture the pack above is
 * built from, rather than from a hard-coded empty page (round-1 review, finding 650-S1).
 *
 * An empty list passes every URL assertion no matter what the URL means, which is precisely how
 * finding 650-B1 shipped green through a db battery, 48 web cells and a nine-leg walk. These rows
 * are `clara.list_accounting_work`'s own projection shape (0189:445-470) and the handler below
 * applies the door's own fences: `p_status` against `status`, and `p_since`/`p_until` against
 * `created_at` — the ADMISSION instant, which is the whole point.
 *
 * So the fixture carries the two divergence classes the rig measured
 * (`packages/db/tests/client-work-pack.test.mjs` `p650.pack.recent_success_drilldown`):
 *   · "Bank fee" is the recent-success tile's one row — a committed receipt on 2026-09-15 — and
 *     it was ADMITTED on 2026-08-20, before the window, so the list it links to drops it.
 *   · "Rates accrual" was admitted and completed inside the window with no receipt, so the list
 *     returns it and the tile never counted it.
 * A walk that asserted "the drilldown shows exactly the tile's Works" would be asserting a
 * falsehood; what it asserts instead is that the board SAID so before the person clicked.
 */
const LIST_ROW_BASE = {
  client_id: CLIENT_ACTIVE,
  client_name: "Rome Properties",
  purpose: "journal_entry",
  initiator: "11111111-1111-1111-1111-111111111111",
  initiated_by: "11111111-1111-1111-1111-111111111111",
  initiator_role: "bookkeeper",
  basis_origin: "user_direct",
  posting_date: "2026-09-01",
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
  updated_at: null,
};

const LIST_ROWS = [
  // The three the ACTIVE tile counts — its number is 3 and its preview is 2, so the drilldown is
  // also the proof that a count is never `rows.length`.
  { ...LIST_ROW_BASE, id: "99999999-9999-4999-8999-999999999991", status: "running",
    memo: "Office rent", attempts: 2, current_run_status: "running",
    created_at: "2026-09-16T01:00:00.000Z" },
  { ...LIST_ROW_BASE, id: "99999999-9999-4999-8999-999999999992", status: "queued",
    memo: "Payroll run", purpose: "payroll_obligation", created_at: "2026-09-16T00:00:00.000Z" },
  { ...LIST_ROW_BASE, id: "99999999-9999-4999-8999-999999999994", status: "queued",
    memo: "Depreciation posting", created_at: "2026-09-15T23:00:00.000Z" },
  // CLASS 1 — in the tile, not in the list.
  { ...LIST_ROW_BASE, id: "99999999-9999-4999-8999-999999999993", status: "completed",
    memo: "Bank fee", receipt_id: "r1", entry_id: "e1", created_at: "2026-08-20T02:00:00.000Z" },
  // CLASS 2 — in the list, not in the tile.
  { ...LIST_ROW_BASE, id: "99999999-9999-4999-8999-999999999995", status: "completed",
    memo: "Rates accrual", created_at: "2026-09-14T02:00:00.000Z" },
];

/** `clara.list_accounting_work`'s own fences, applied to the fixture: status membership, and a
 *  HALF-OPEN `[p_since, p_until)` over `created_at` (0189:427-428). */
function listWorkPage(body: unknown): { rows: unknown[]; next_cursor: null; truncated: false } {
  const b = (body ?? {}) as { p_status?: string[] | null; p_since?: string | null; p_until?: string | null };
  const status = Array.isArray(b.p_status) && b.p_status.length > 0 ? b.p_status : null;
  const since = typeof b.p_since === "string" ? Date.parse(b.p_since) : null;
  const until = typeof b.p_until === "string" ? Date.parse(b.p_until) : null;
  const rows = LIST_ROWS.filter((r) => {
    const at = Date.parse(r.created_at);
    if (status !== null && !status.includes(r.status)) return false;
    if (since !== null && at < since) return false;
    if (until !== null && at >= until) return false;
    return true;
  });
  return { rows, next_cursor: null, truncated: false };
}

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

/** Overlay a populated firm on top of the shared mock, for THIS page only. */
async function seed(page: Page): Promise<void> {
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) => json(route, ENVELOPE));
  // #659 — the three reads Firm Home gained. `list_activity` REPLACES `list_firm_timeline` here
  // (D18.f); the roster is what turns the actor uuid into a name; the pack is the portfolio.
  await page.route("**/e2e-supabase/rest/v1/rpc/list_activity", (route) => json(route, ACTIVITY));
  await page.route("**/e2e-supabase/rest/v1/firm_members_visible**", (route) => json(route, MEMBERS));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) => json(route, PORTFOLIO));
  await page.route("**/e2e-supabase/rest/v1/clients**", (route) => {
    const url = route.request().url();
    if (url.includes("fy_end_month")) {
      return json(route, [{ id: CLIENT_ACTIVE, name: "Rome Properties", fy_end_month: 12, fy_end_day: 31 }]);
    }
    const match = /id=eq\.([^&]+)/.exec(url);
    return json(route, match ? CLIENTS.filter((c) => c.id === decodeURIComponent(match[1]!)) : CLIENTS);
  });
  await page.route("**/e2e-supabase/rest/v1/onboarding_plans**", (route) =>
    json(route, route.request().url().includes(CLIENT_ONBOARDING) ? [PLAN] : []));
  await page.route("**/e2e-supabase/rest/v1/onboarding_plan_items**", (route) => json(route, PLAN_ITEMS));
  await page.route("**/e2e-supabase/rest/v1/rpc/list_fiscal_years", (route) =>
    json(route, [{ fiscal_year_id: "fy1", label: "FY 2026", ordinal: 2, starts_on: "2026-01-01", ends_on: "2026-12-31", status: "open", fy_end_source: "asserted", has_active_reopen_receipt: false }]));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_client_work_pack", (route) => json(route, WORK_PACK));
  await page.route("**/e2e-supabase/rest/v1/rpc/list_accounting_work", (route) =>
    json(route, listWorkPage(route.request().postDataJSON())));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_close_readiness", (route) =>
    json(route, { fiscal_year_id: "fy1", close_run_id: null, run_state: null, fy_end_source: "asserted", gates: [
      { check_key: "a", drawer: 1, state: "pass", measured: null, measured_digest: "x", attested: false },
      { check_key: "b", drawer: 1, state: "fail", measured: null, measured_digest: "y", attested: false },
    ] }));
}

/**
 * THE WORKBENCH, not the whole document — and this scoping is load-bearing, not tidiness.
 *
 * The Clara rail is mounted as a SIBLING of the page (`app/(firm)/layout.tsx`), and it renders
 * its own `BeginOnboardingCard` with an `<h2>` reading "Client onboarding". A first cut of this
 * spec asserted `getByRole("heading", { name: "Onboarding", level: 2 })` against the document
 * and matched THAT card — Playwright's `name` is a substring match by default — so the cell that
 * was meant to prove the board's own section is ABSENT for an active client failed against a
 * component in a different subtree. Spelling is not identity: every heading assertion below is
 * scoped to `[data-firm-workbench]`, the layout's own marker for the content column, so the rail
 * can neither satisfy nor break one.
 */
function workbench(page: Page) {
  return page.locator("[data-firm-workbench]");
}

/** Wait for the entrance transition before measuring COLOUR or GEOMETRY — a scan started
 *  mid-fade reads composited values (a11y-finish-walk.spec.ts's own measured lesson). */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect.poll(async () =>
    page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length),
  ).toBe(0);
}

test("Firm Home names the firm, scores the queue from the envelope, and every tile links to the surface that owns it", async ({ page }) => {
  await seed(page);
  await signInTo(page, "/");
  await settled(page);

  const board = workbench(page);
  await expect(board.getByRole("heading", { name: "E2E Accounting", level: 1 })).toBeVisible();
  await expect(board.getByText("3 items need you.")).toBeVisible();
  // The chips are the envelope's counts, not the one-row page.
  await expect(board.getByRole("link", { name: "Needs you: 3" })).toBeVisible();
  await expect(board.getByRole("link", { name: "Open coding tasks: 0" })).toBeVisible();
  // The triage row is link-only at this altitude.
  await expect(board.getByText("high stakes")).toBeVisible();
  await expect(board.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  // Recent activity prints the DB's own sentence — and, since #659, the PERSON beside it.
  await expect(board.getByText("An entry was posted.")).toBeVisible();
  await expect(board.getByText("Tao Belcort")).toBeVisible();
  // The close roll-up stays an honest note.
  await expect(board.getByText(/A firm-wide close status per client is still not built/)).toBeVisible();

  // A tile, then back — the journey the map's own test obligation names.
  // #614: the tile now lands on Work's saved "Needs you" view rather than a
  // route of its own (needs-you-scoreboard.tsx's own `INBOX_HREF`).
  await board.getByRole("link", { name: "Needs you: 3" }).click();
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await workbench(page).getByRole("link", { name: "Open the journals tab" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_ACTIVE}/journals$`));
});

test("the client board reads for an ACTIVE client: identity, the queue with its inline act, bank, close", async ({ page }) => {
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await settled(page);

  // ONE h1 ON A CLIENT ROUTE — #614 removed the layout's own "Client: <name>"
  // heading (the pre-#614 pin here was TWO, one from the layout and one from
  // this board; `components/shell-responsive.test.tsx` now pins ONE). The
  // board's own h1 is the client's name WITH its status badge in the
  // accessible name, which is also the check that the badge is not
  // colour-only.
  await expect(workbench(page).getByRole("heading", { name: /^Rome Properties\s*Active$/, level: 1 })).toBeVisible();
  await expect(workbench(page).getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(workbench(page).getByText("Client since 2026-01-01")).toBeVisible();
  await expect(workbench(page).getByText("Needs you: 3")).toBeVisible();
  await expect(workbench(page).getByText("FY 2026")).toBeVisible();
  await expect(workbench(page).getByText("1 of 2 measured gates passing")).toBeVisible();
  await expect(workbench(page).getByText("No bank accounts recorded for this client.")).toBeVisible();
  // The onboarding section is ABSENT for an established client — not an empty card. Scoped to
  // the workbench AND exact, so the rail's own "Client onboarding" card cannot answer for it.
  await expect(workbench(page).getByRole("heading", { name: "Onboarding", exact: true, level: 2 })).toHaveCount(0);
});

test("the client board lifts ONBOARDING progress for a client mid-interview", async ({ page }) => {
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ONBOARDING}`);
  await settled(page);

  // The same single h1 as the active arm — see that cell's note on why a
  // client route now carries exactly one.
  await expect(workbench(page).getByRole("heading", { name: /^Kuching Kopitiam\s*Onboarding$/, level: 1 })).toBeVisible();
  await expect(workbench(page).getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(workbench(page).getByRole("heading", { name: "Onboarding", exact: true, level: 2 })).toBeVisible();
  await expect(workbench(page).getByText("1 of 2 required answers recorded")).toBeVisible();
  await expect(workbench(page).getByText("The opening position is not finalised yet.")).toBeVisible();
});

test("both boards reflow on the CONTAINER query at 1440 and at 1024 with the rail open, with no horizontal scroll", async ({ page }) => {
  // #706 — TWO sign-ins and FOUR `settled()` passes (a `networkidle` wait plus an animation poll
  // each), which is well past a flat 30 s on a host running another suite.
  test.setTimeout(cellBudgetMs({ signIns: 2, polls: 4 }));
  for (const [face, url] of [["firm home", "/"], [`client home`, `/clients/${CLIENT_ACTIVE}`]] as const) {
    await seed(page);
    await signInTo(page, url);
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await settled(page);
      // The rail must be open for this measurement to mean anything — the whole reason the
      // grid uses a container query is that the rail's 320px changes the column's width
      // WITHOUT changing the viewport's.
      await expect(page.locator("[data-clara-rail]")).toBeVisible();
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${face} at ${width}px must not scroll horizontally`).toBeLessThanOrEqual(0);
      // The grid's own computed template is the reflow, read off the element rather than
      // inferred from the viewport.
      const columns = await workbench(page).locator("[class*='@3xl:grid-cols-']").first().evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      if (width === 1440) {
        expect(columns, `${face} at 1440 with the rail open must be two columns`).toBe(2);
      } else {
        expect(columns, `${face} at 1024 with the rail open must fall back to one column`).toBe(1);
      }
    }
  }
});

// review-557's BLOCKER: the ONBOARDING client joined this loop. It was absent, and its absence
// is exactly why the heading-order regression shipped — that arm is the only one rendering
// #546's escalation card, whose own `<h2>` sat above the `<h1>` this train moved into the
// identity band. A face that no scan mounts is a face with no a11y coverage at all.
test("all three boards are clean under the full WCAG 2.1 AA scan", async ({ page }) => {
  // #706 — THREE sign-ins, three `networkidle` settles and three full-page axe scans in one cell.
  // This is the shape the flat 30 s default was never sized for; the budget says so out loud.
  test.setTimeout(cellBudgetMs({ signIns: 3, polls: 3, scans: 3 }));
  const FACES = [
    ["firm home", "/"],
    ["client home (active)", `/clients/${CLIENT_ACTIVE}`],
    ["client home (onboarding)", `/clients/${CLIENT_ONBOARDING}`],
  ] as const;
  for (const [face, url] of FACES) {
    await seed(page);
    await signInTo(page, url);
    await settled(page);
    // POSITIVE CONTROL on the onboarding face specifically: the card whose heading caused the
    // regression must be on screen, or this scan proves nothing about the ordering it exists
    // to check.
    if (url.includes(CLIENT_ONBOARDING)) {
      // BY ROLE, not by text: the card names itself twice — once as its `<h2>` and once on its
      // rail-focus button — so a text locator is ambiguous. The HEADING is the right subject
      // anyway; it is the element whose position above the `<h1>` was the violation.
      await expect(
        workbench(page).getByRole("heading", { name: "Continue onboarding with Clara", level: 2 }),
      ).toBeVisible();
    }
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `${face} axe violations`).toEqual([]);
  }
});

// ==============================================================================================
// #650 — THE WORK ATTENTION BAND.
// ==============================================================================================

test("home.facets.drilldown — each count opens its OWN scoped list, and Back restores the home with focus on the control that left it", async ({ page }) => {
  // #706 — one sign-in, one settle, then three navigations and three Backs.
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 2 }));
  // THE FIXTURES ARE THIS FILE'S, AND THEY ARRIVE THROUGH `seed(page)` — NOT THROUGH THE SIGN-IN.
  // #804 (f6aaac73) replaced this file's LOCAL `signInTo`, which called `seed(page)` itself, with
  // the shared helper, and added `await seed(page);` back at the five call sites that existed then.
  // These four #650 cells (a948fb8b) were written against the local helper and never got one, so
  // they ran on home-board-mock.mjs's empty default: `get_client_work_pack` answered zero and
  // `list_review_queue` was never overlaid, which is why every count below was absent.
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await settled(page);
  const board = workbench(page);

  // The three counts, each a full noun phrase rather than a bare number beside a label — the
  // accessible NAME of each link IS the sentence.
  // EVERY LEG NAMES THE POPULATION IT EXPECTS TO LAND ON, not only the URL it expects to spell.
  // The list is answered from the same fixture as the band (`listWorkPage`), so a drilldown that
  // opened a different set of Works than its tile described reds HERE, in the browser — which an
  // empty-page mock could never do (round-1 review, 650-S1).
  const table = () => page.getByRole("table", { name: "Durable work" });
  const legs = [
    ["2 Works are waiting on a person", /\/work\?view=needs-you$/,
      // The needs-you count is the review queue's; this fixture mints no parked Work, so what is
      // proven here is the URL and the return journey, and the list is honestly empty.
      async () => { await expect(table()).toHaveCount(0); }],
    ["3 Works are queued or running", /\/work\?status=queued%2Crunning$/,
      async () => {
        // THE TILE SAID THREE AND THE LIST HOLDS THREE — while the tile's own preview showed two,
        // which is the count-is-never-rows.length rule seen from both ends in one journey.
        await expect(table().getByRole("link", { name: "Office rent" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Payroll run" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Depreciation posting" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Bank fee" })).toHaveCount(0);
      }],
    ["1 Work finished in the last 7 days", /\/work\?status=completed&since=2026-09-10&until=2026-09-16$/,
      async () => {
        // AND THE DISCLOSED CASE. The tile counted "Bank fee" (its receipt posted inside the
        // window); the list is fenced on when a Work was STARTED, so it drops that row and
        // returns "Rates accrual", which the tile never counted. The band said this on the home
        // before the click — asserted below — and that sentence is the whole fix for 650-B1.
        await expect(table().getByRole("link", { name: "Rates accrual" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Bank fee" })).toHaveCount(0);
      }],
  ] as const;

  // THE QUALIFICATION IS ON THE BOARD, beside the number, before anyone clicks it.
  await expect(board.getByText(/dated by when each Work started, not when it posted/)).toBeVisible();

  for (const [name, expected, landed] of legs) {
    const link = board.getByRole("link", { name });
    await expect(link, `${name} must be on the board as a link`).toBeVisible();
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(expected);
    await landed();

    await page.goBack();
    // THE HOME'S OWN URL, not merely "a client page": a Back that landed on the workspace root
    // with a stale query would be the "preserved return state" criterion silently unmet.
    await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_ACTIVE}$`));
    // AND THE FOCUS THAT LEFT IT. A keyboard user who opens a count and comes back must not be
    // returned to the top of the document with their place lost.
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""))
      .toContain(name);
  }
});

test("home.facets.responsive — 320px, 200% zoom and reduced motion keep every count reachable with no horizontal scroll, and the populated board is axe-clean", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 3, scans: 1 }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);

  for (const [label, width, height] of [
    ["320px", 320, 720],
    // 200% zoom, the repo's own idiom (`activity-feed-walk.spec.ts:215`): a HALVED viewport is
    // what a 200% page zoom actually does to the CSS pixel box.
    ["200% zoom (a halved 1280x720 viewport)", 640, 360],
  ] as const) {
    await page.setViewportSize({ width, height });
    await settled(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `the client board must not scroll horizontally at ${label}`).toBeLessThanOrEqual(1);
    // Every count is still on screen and still a link — a band that reflowed its numbers out of
    // the document would satisfy the overflow check and fail the person.
    for (const name of [
      "2 Works are waiting on a person",
      "3 Works are queued or running",
      "1 Work finished in the last 7 days",
    ]) {
      await expect(workbench(page).getByRole("link", { name }), `${name} at ${label}`).toBeVisible();
    }
  }

  // Back to a normal viewport for the scan, and scan the POPULATED band rather than an empty one.
  await page.setViewportSize({ width: 1440, height: 900 });
  await settled(page);
  await expect(workbench(page).getByText("Work attention")).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "populated Work attention band axe violations").toEqual([]);
});

test("home.facets.states — empty, unknown and denied are three different sentences, and the band dates its own read", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 3 }));

  // EMPTY — the door answered zero.
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await page.unroute("**/e2e-supabase/rest/v1/rpc/get_client_work_pack");
  await page.route("**/e2e-supabase/rest/v1/rpc/get_client_work_pack", (route) => json(route, {
    ...WORK_PACK,
    facets: {
      active: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
      recent_success: {
        status: "ok", count: 0, coverage: "ok", coverage_reason: null,
        uncounted_completions: 0, rows: [],
      },
    },
  }));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText("Nothing is running for this client right now.")).toBeVisible();
  await expect(workbench(page).getByText(/^Read at /)).toBeVisible();
  // The band NEVER claims to know the database's position — there is no Work lifecycle event in
  // this estate to derive one from.
  await expect(workbench(page).getByText(/up to date|watermark/i)).toHaveCount(0);

  // UNKNOWN — the read landed but the body could not be read. Distinct from zero.
  await page.unroute("**/e2e-supabase/rest/v1/rpc/get_client_work_pack");
  await page.route("**/e2e-supabase/rest/v1/rpc/get_client_work_pack", (route) =>
    json(route, { computed_at: "2026-09-16T02:00:00.000Z", facets: { active: "nope", recent_success: null } }));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText(/could not be read, so there is no number to show/)).toHaveCount(2);
  await expect(workbench(page).getByText("Nothing is running for this client right now.")).toHaveCount(0);

  // DENIED — a governed refusal. The viewer-floored tile beside it is UNTOUCHED, which is the
  // whole reason the needs-you number is not part of this read.
  await page.unroute("**/e2e-supabase/rest/v1/rpc/get_client_work_pack");
  await page.route("**/e2e-supabase/rest/v1/rpc/get_client_work_pack", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ code: "CLR04", message: "insufficient role" }),
  }));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText("Your role does not include this.")).toHaveCount(2);
  await expect(workbench(page).getByRole("link", { name: "2 Works are waiting on a person" })).toBeVisible();
});

test("home.facets.delayed — a minute with no successful read says the UPDATE is delayed, and keeps the dated numbers", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 2 }));
  // THE CLOCK IS INSTALLED BEFORE ANY NAVIGATION — Playwright's own rule: `install` overrides the
  // native Date/setInterval, so it must precede every clock-related call on the page.
  await page.clock.install();
  await seed(page);
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await settled(page);
  await expect(workbench(page).getByRole("link", { name: "3 Works are queued or running" })).toBeVisible();

  // From here the door fails. The band must keep the numbers it already has, dated, and after the
  // estate's own 60-second rule say that the UPDATE is delayed — a statement about the
  // connection, never about the Work.
  await page.unroute("**/e2e-supabase/rest/v1/rpc/get_client_work_pack");
  await page.route("**/e2e-supabase/rest/v1/rpc/get_client_work_pack", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ message: "upstream" }),
  }));

  await page.clock.fastForward("01:05");
  await expect(workbench(page).getByText(/Update delayed/)).toBeVisible();
  await expect(workbench(page).getByRole("link", { name: "3 Works are queued or running" })).toBeVisible();
});

// =================================================================================================
// #659 (journey B1) — THE PORTFOLIO. Appended beside #650's client-altitude cells; nothing above is
// restructured, and `home-board-mock.mjs` keeps its dispatch position and its EMPTY_RPCS arm.
// =================================================================================================

test("p659.home.portfolio — one row per client with the door's own counts, and the onboarding disclosure is on screen BEFORE any click", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 1 }));
  await seed(page);
  await signInTo(page, "/");
  await settled(page);
  const board = workbench(page);

  await expect(board.getByRole("heading", { name: "Client portfolio", level: 2 })).toBeVisible();
  const table = board.getByRole("table", { name: "Clients, with the Work waiting on each" });
  await expect(table).toBeVisible();
  // One row per client the door returned, in the door's own name order.
  for (const name of ["Bee Creative Solution", "Kuching Kopitiam", "Rome Properties"]) {
    await expect(table.getByRole("link", { name, exact: true })).toBeVisible();
  }

  // THE COUNTS ARE THE DOOR'S OWN, and each one is a link with a full noun phrase for its name.
  await expect(board.getByRole("link", { name: "3 Work running for Rome Properties" })).toBeVisible();
  await expect(board.getByRole("link", { name: "2 Work needing attention for Rome Properties" })).toBeVisible();
  await expect(board.getByRole("link", { name: "1 Work posted for Rome Properties in the last seven days" })).toBeVisible();

  // THE DISCLOSURE, BEFORE THE CLICK — both halves.
  await expect(board.getByText(/cover active clients only/)).toBeVisible();
  await expect(board.getByText(/dated by when each Work posted/)).toBeVisible();
  await expect(board.getByText(/exclude this client/)).toBeVisible();

  // AND NO MONEY ANYWHERE ON THE FIRM'S HOME.
  const text = (await board.innerText()).replace(/\s+/g, " ");
  expect(text, "Firm Home consolidates no client sums").not.toMatch(/RM\s?\d|MYR|\d+\.\d{2}/);
});

test("p659.home.drilldown — each count opens /work narrowed to exactly its population, and Back restores the home's own URL with focus on the control that left it", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 2 }));
  await seed(page);
  await signInTo(page, "/?attention=active");
  await settled(page);
  const board = workbench(page);
  const table = () => page.getByRole("table", { name: "Durable work" });

  const legs = [
    ["3 Work running for Rome Properties",
      new RegExp(`/work\\?client=${CLIENT_ACTIVE}&status=queued%2Crunning$`),
      async () => {
        await expect(table().getByRole("link", { name: "Office rent" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Payroll run" })).toBeVisible();
        await expect(table().getByRole("link", { name: "Bank fee" })).toHaveCount(0);
      }],
    ["2 Work needing attention for Rome Properties",
      new RegExp(`/work\\?client=${CLIENT_ACTIVE}&status=failed%2Crefused$`),
      // BOTH tokens, because the column counted both and the door published the split. A link
      // carrying only `failed` would open a smaller set than the number the person clicked.
      async () => { await expect(table()).toHaveCount(0); }],
    ["1 Work posted for Rome Properties in the last seven days",
      new RegExp(`/work\\?client=${CLIENT_ACTIVE}&status=completed&since=2026-09-10&until=2026-09-16$`),
      async () => { await expect(table().getByRole("link", { name: "Rates accrual" })).toBeVisible(); }],
  ] as const;

  for (const [name, expected, landed] of legs) {
    const link = board.getByRole("link", { name });
    await expect(link, `${name} must be on the board as a link`).toBeVisible();
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(expected);
    await landed();

    await page.goBack();
    // THE HOME'S OWN URL, WITH ITS FILTER INTACT — not merely "/" with the narrowing lost. That is
    // the whole of AC2's second half, and a Back that dropped `?attention=` would satisfy a
    // "returns to the home" assertion and fail the person.
    await expect(page).toHaveURL(/\/\?attention=active$/);
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""))
      .toContain("3");
  }
});

test("p659.home.responsive — 320px, 200% zoom and reduced motion keep every count reachable with no horizontal scroll, and the populated board is axe-clean", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 3, scans: 1 }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await signInTo(page, "/");

  for (const [label, width, height] of [
    ["320px", 320, 720],
    ["200% zoom (a halved 1280x720 viewport)", 640, 360],
  ] as const) {
    await page.setViewportSize({ width, height });
    await settled(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `Firm Home must not scroll horizontally at ${label}`).toBeLessThanOrEqual(1);
    for (const name of [
      "3 Work running for Rome Properties",
      "2 Work needing attention for Rome Properties",
      "1 Work posted for Rome Properties in the last seven days",
    ]) {
      await expect(workbench(page).getByRole("link", { name }), `${name} at ${label}`).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).include("[data-firm-workbench]").analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("p659.home.states — an EMPTY register, a caught-up firm and a DENIED read are three different sentences, and the board dates its own read", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 3 }));
  await seed(page);
  await signInTo(page, "/");
  await settled(page);
  // The populated board dates its read rather than looking permanently live.
  await expect(workbench(page).getByText(/^Read at /)).toBeVisible();

  // ZERO CLIENTS — the first-use Empty, with the creation affordance BESIDE it.
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) =>
    json(route, { ...PORTFOLIO, rows: [] }));
  await page.route("**/e2e-supabase/rest/v1/clients**", (route) => json(route, []));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText("No clients yet", { exact: true })).toBeVisible();
  await expect(workbench(page).getByText(/This firm has no clients yet\. Start with the first one\./)).toBeVisible();

  // ZERO WORKLOAD — a firm WITH clients and no Work. A DIFFERENT sentence from the queue's own.
  await page.route("**/e2e-supabase/rest/v1/clients**", (route) => json(route, CLIENTS));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) =>
    json(route, {
      ...PORTFOLIO,
      rows: PORTFOLIO.rows.map((r) => ({ ...r, active: 0, attention_failed: 0, failed: 0, refused: 0 })),
    }));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText(/Every client is clear/)).toBeVisible();
  await expect(workbench(page).getByText("No clients yet", { exact: true })).toHaveCount(0);

  // DENIED — a permission, not a failure, and the viewer-floored chips above it still render.
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) =>
    route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ code: "CLR04", message: "insufficient role", details: null }),
    }));
  await page.reload();
  await settled(page);
  await expect(workbench(page).getByText(/Work records need a bookkeeper role/)).toBeVisible();
  await expect(workbench(page).getByText(/read at a lower floor and are still yours/)).toBeVisible();
  await expect(workbench(page).getByRole("link", { name: "Needs you: 3" })).toBeVisible();
  await expect(workbench(page).getByText("No clients yet", { exact: true })).toHaveCount(0);
});

test("p659.home.zero_client_create — a firm with no clients reaches creation from the home and lands on the id the DATABASE returned; the draft survives a re-read", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 2 }));
  const BORN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await seed(page);
  // A firm with NO clients, which is the state this page ships in on day one.
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) =>
    json(route, { ...PORTFOLIO, rows: [] }));
  let registerCalls = 0;
  await page.route("**/e2e-supabase/rest/v1/clients**", (route) => {
    registerCalls += 1;
    // The FIRST read is empty; every later one carries a row — the transition that would unmount a
    // control hung off the zero-client branch and silently discard a typed name.
    return json(route, registerCalls === 1
      ? []
      : [{ id: BORN, name: "Penang Roastery", status: "onboarding", created_at: "2026-09-19T00:00:00.000Z" }]);
  });
  await page.route("**/e2e-supabase/rest/v1/rpc/client_identity_candidates", (route) =>
    json(route, { name: "Penang Roastery", arity: 0, candidates: [] }));
  await page.route("**/e2e-supabase/rest/v1/rpc/begin_client_onboarding", (route) =>
    json(route, { client_id: BORN, plan_id: "plan-659" }));

  await signInTo(page, "/");
  await settled(page);
  const board = workbench(page);
  await expect(board.getByText("No clients yet", { exact: true })).toBeVisible();

  await board.getByRole("button", { name: "Add client" }).click();
  const name = page.getByLabel("Client name");
  await expect(name).toBeVisible();
  await name.fill("Penang Roastery");

  // THE DRAFT SURVIVES A RE-READ. `focus` is one of this page's four re-read triggers, and the
  // register now answers with a row — exactly the frame in which a remounted control would lose
  // the typed name without a word.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForLoadState("networkidle");
  await expect(name, "the typed name must stand across a re-read that filled the register").toHaveValue("Penang Roastery");

  await page.getByRole("button", { name: "Begin onboarding" }).click();
  // AND THE HUMAN LANDS ON THE ID THE DATABASE RETURNED, never a guessed path.
  await expect(page).toHaveURL(new RegExp(`/clients/${BORN}$`));
});

test("p659.home.zero_client_create (bookkeeper) — no control, and no greyed promise in its place", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 1 }));
  await seed(page);
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_portfolio_pack", (route) =>
    json(route, { ...PORTFOLIO, rows: [] }));
  await signInTo(page, "/", "bookkeeper@example.test");
  await settled(page);
  const board = workbench(page);
  await expect(board.getByText("No clients yet", { exact: true })).toBeVisible();
  // NOT OFFERED AT ALL, rather than offered and refused — `firm-setup-tile.tsx`'s own precedent.
  await expect(board.getByRole("button", { name: "Add client", includeHidden: true })).toHaveCount(0);
});
