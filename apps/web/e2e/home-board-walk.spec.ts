import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import { cellBudgetMs } from "./helpers";

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

const OWNER = "owner@example.test";
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

const TIMELINE = [
  { seq: 9, event_type: "entry_posted", event_description: "An entry was posted.", client_id: CLIENT_ACTIVE, actor: "u1", on_behalf_of: null, via_wake_kind: null, created_at: "2026-09-04T01:12:00Z" },
];

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
          status: "queued", memo: null, attempts: 1, current_run_status: null,
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

/** An empty Work-list page, so a facet drilldown lands on a real list rather than on a 404 this
 *  walk is not about. The LIST's own behaviour is `work-list-walk.spec.ts`'s subject; what is
 *  under test here is the URL the home spells and the return journey. */
const EMPTY_WORK_PAGE = { rows: [], next_cursor: null, truncated: false };

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

/** Overlay a populated firm on top of the shared mock, for THIS page only. */
async function seed(page: Page): Promise<void> {
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) => json(route, ENVELOPE));
  await page.route("**/e2e-supabase/rest/v1/rpc/list_firm_timeline", (route) => json(route, TIMELINE));
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
  await page.route("**/e2e-supabase/rest/v1/rpc/list_accounting_work", (route) => json(route, EMPTY_WORK_PAGE));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_close_readiness", (route) =>
    json(route, { fiscal_year_id: "fy1", close_run_id: null, run_state: null, fy_end_source: "asserted", gates: [
      { check_key: "a", drawer: 1, state: "pass", measured: null, measured_digest: "x", attested: false },
      { check_key: "b", drawer: 1, state: "fail", measured: null, measured_digest: "y", attested: false },
    ] }));
}

async function signInTo(page: Page, destination: string): Promise<void> {
  await seed(page);
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
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
  // The timeline prints the DB's own sentence.
  await expect(board.getByText("An entry was posted.")).toBeVisible();
  // The close roll-up stays an honest note.
  await expect(board.getByText(/A firm-wide close status per client is not built/)).toBeVisible();

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
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await settled(page);
  const board = workbench(page);

  // The three counts, each a full noun phrase rather than a bare number beside a label — the
  // accessible NAME of each link IS the sentence.
  const legs = [
    ["2 Works are waiting on a person", /\/work\?view=needs-you$/],
    ["3 Works are queued or running", /\/work\?status=queued%2Crunning$/],
    ["1 Work finished in the last 7 days", /\/work\?status=completed&since=2026-09-10&until=2026-09-16$/],
  ] as const;

  for (const [name, expected] of legs) {
    const link = board.getByRole("link", { name });
    await expect(link, `${name} must be on the board as a link`).toBeVisible();
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(expected);

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
