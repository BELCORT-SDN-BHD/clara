import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

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
  counts: { ready: 5, needs_review: 12, needs_you: 3, open_drafts: 2, open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 4 },
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
  await board.getByRole("link", { name: "Needs you: 3" }).click();
  await expect(page).toHaveURL(/\/needs-you$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await workbench(page).getByRole("link", { name: "Open the journals tab" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_ACTIVE}/journals$`));
});

test("the client board reads for an ACTIVE client: identity, the queue with its inline act, bank, close", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT_ACTIVE}`);
  await settled(page);

  await expect(workbench(page).getByRole("heading", { name: /Rome Properties/, level: 1 })).toBeVisible();
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

  await expect(workbench(page).getByRole("heading", { name: /Kuching Kopitiam/, level: 1 })).toBeVisible();
  await expect(workbench(page).getByRole("heading", { name: "Onboarding", exact: true, level: 2 })).toBeVisible();
  await expect(workbench(page).getByText("1 of 2 required answers recorded")).toBeVisible();
  await expect(workbench(page).getByText("The opening position is not finalised yet.")).toBeVisible();
});

test("both boards reflow on the CONTAINER query at 1440 and at 1024 with the rail open, with no horizontal scroll", async ({ page }) => {
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
