import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
}

test("operator owner sees the full sidebar and reaches Members in two navigation clicks", async ({ page }) => {
  await signIn(page, "owner@example.test");
  const nav = page.getByRole("navigation", { name: "Firm navigation" });

  await expect(nav.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Needs you", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole("link", { name: "Members", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm registrations", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Compliance register", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Vendor identity bindings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm settings", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();

  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("members");
  await expect(page.getByRole("option", { name: "Members", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Admin", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
});

test("bookkeeper sidebar shows viewer/bookkeeper reads and hides admin- and owner-only destinations", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Firm navigation" });

  // E-7 (裁-187): the section entry is still THERE — its destinations really are
  // reachable at this rank — but it no longer calls itself "Admin", because a
  // bookkeeper administers nothing under it.
  await expect(nav.getByRole("link", { name: "Firm", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Firm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Firm", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Compliance register", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Vendor identity bindings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm settings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Firm registrations", exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// E-7 / CB-AE2E-014 / CB-AE2E-033 — a bookkeeper's DOM and accessibility tree
// carry NO control their rank cannot use.
//
// Asserted BY ROLE and BY TEXT, deliberately both. A role query answers "is
// there a button the assistive tree exposes"; a text query answers "is the
// STRING anywhere on the page". A control rendered as a non-button, or a label
// left behind in a disabled span, would slip past one of the two.
// ---------------------------------------------------------------------------

test("a bookkeeper reaches /admin/members by URL and is offered NO role menu and NO invite trigger", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  await page.goto("/admin/members");
  // The ROSTER read is bookkeeper+, so the page is not empty — which is what
  // makes every absence below a finding rather than a blank screen.
  await expect(page.getByRole("heading", { name: "Everyone with access", level: 2 })).toBeVisible();
  await expect(page.getByText("E2E Bookkeeper")).toBeVisible();

  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toHaveCount(0);
  await expect(page.getByText("Admin or owner can invite someone")).toHaveCount(0);
  await expect(page.getByText("Remove from firm")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/admin/members as a bookkeeper").toEqual([]);
});

test("an owner IS offered the role menu on the same page — the gate shapes by rank, it does not delete the control", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/admin/members");
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/admin/members as an owner").toEqual([]);
});

test("the high-stakes threshold control is GONE from /admin/settings for every rank (裁-187)", async ({ page }) => {
  for (const email of ["owner@example.test", "bookkeeper@example.test"]) {
    await signIn(page, email);
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Firm settings", level: 1 })).toBeVisible();
    // BY ROLE and BY TEXT — 裁-187 retired the verb and its control outright,
    // so neither a live trigger nor a leftover label may survive anywhere.
    await expect(page.getByRole("button", { name: "Change threshold", exact: true })).toHaveCount(0);
    await expect(page.getByText("Change threshold")).toHaveCount(0);
    await expect(page.getByText(/the amount above which a posting needs a second person's approval/)).toHaveCount(0);
    // …and the page says what replaced it, rather than going silent — but only
    // as much as is TRUE in the pre-裁-188 window. `_approve_entry_core` (LIVE,
    // 0016:1425-1443) still raises CLR05 on a solo high-stakes approval, so the
    // page names the retirement of the CONTROL and the survival of the WALL.
    await expect(page.getByText(/Change-threshold control is retired/)).toBeVisible();
    await expect(page.getByText(/still refuses a solo approval on a high-stakes entry/)).toBeVisible();

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `/admin/settings as ${email}`).toEqual([]);
    await page.context().clearCookies();
  }
});

// ---------------------------------------------------------------------------
// E-3 / E-2 — the two surfaces the owner reported as contentless.
//
// Both fixtures are installed with `page.route` rather than by editing
// `e2e/serve-built.mjs`: the shared mock is a merge surface every lane in this
// sprint touches, and a spec that carries its own rows cannot collide with one.
// ---------------------------------------------------------------------------

const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** One `open_question` row carrying every column the row now renders. */
function reviewQueueEnvelope(agedSince: string) {
  return {
    watermark: "w1",
    counts: {
      ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0,
      open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 0,
    },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows: [{
      row_kind: "open_question", section: "needs_you", client_id: CLIENT_ID, counterparty_id: null,
      filing_id: null, entry_id: null, question_id: "11111111-1111-4111-8111-111111111111",
      task_id: null, document_id: null, lane: "needs_you", auto: true, rule_backed: true,
      high_stakes: false, aged_since: agedSince, amount_cents: null, period: null,
      question_text: "Which account should this bank fee post to?",
      created_at: agedSince, id: "11111111-1111-4111-8111-111111111111",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
      advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
    }],
    next_cursor: null,
  };
}

test("a Needs-you row answers WHAT, WHY, NEXT and WHEN on the built app", async ({ page }) => {
  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000 - 60_000).toISOString();
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewQueueEnvelope(sixDaysAgo)) }));
  // The two 0137 gap reads NeedsYouGaps performs. The shared mock does not
  // answer them (this page had no walk before), so they are stubbed empty here
  // rather than left to 404 into an error banner that would drown the row.
  for (const relation of ["firm_open_questions_visible", "client_identifier_promotions_visible"]) {
    await page.route(`**/e2e-supabase/rest/v1/${relation}**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  }

  await signIn(page, "owner@example.test");
  await page.goto("/needs-you");

  // WHAT — the client's own NAME, merged from the register (`clients` in the
  // shared mock: CLIENT_A is "Rome Properties"). Before this train the
  // cross-client queue never named the client at all.
  await expect(page.getByText(/Client: ?Rome Properties/)).toBeVisible();
  await expect(page.getByText("Open question").first()).toBeVisible();
  // WHY — the derived sentence and the two flag chips.
  await expect(page.getByText("Clara could not settle this on its own, so it is waiting on a person.")).toBeVisible();
  await expect(page.getByText("Clara raised this unattended")).toBeVisible();
  await expect(page.getByText("A saved coding rule already matched")).toBeVisible();
  // NEXT — the owning-tab link, named as the action it is.
  await expect(page.getByText("Next:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the documents tab" })).toBeVisible();
  // WHEN — the age, never a deadline this queue does not have.
  await expect(page.getByText("Waiting 6 days")).toBeVisible();

  // The sweep panel now sits BELOW the queue, leads with a definition, and no
  // longer points at a message nothing produces.
  await expect(page.getByText(/A sweep is one unattended pass/)).toBeVisible();
  await expect(page.getByText(/never produced by the agent runtime/)).toBeVisible();
  await expect(page.getByText("acknowledge the run there")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/needs-you").toEqual([]);
});

test("/activity opens the agent-task drawer and logs NO MISSING_MESSAGE", async ({ page }) => {
  const consoleText: string[] = [];
  page.on("console", (msg) => consoleText.push(msg.text()));

  await page.route("**/e2e-supabase/rest/v1/agent_tasks_visible**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "3f2a1b8c-0000-4000-8000-000000000001",
        kind: "autodraft", status: "running", client_id: CLIENT_ID,
        error_code: "timeout",
        created_at: "2026-09-01T02:00:00Z", updated_at: "2026-09-02T03:30:00Z",
        cancelled_by: null, cancelled_at: null,
        session_id: "5e551011-0000-4000-8000-000000000003",
        created_by: "11111111-0000-4000-8000-000000000004",
      }]),
    }));
  await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await signIn(page, "owner@example.test");
  await page.goto("/activity");

  // The honest note for the firm-wide timeline the database does not ship.
  await expect(page.getByRole("heading", { name: "Everything that happened", level: 2 })).toBeVisible();
  // The note names the READ it needs (`clara.list_firm_timeline`), not a
  // relation that does not exist — review-550 nit 6, so the note cannot stay
  // true-and-stale once #552 mints that read.
  await expect(page.getByText(/clara\.list_firm_timeline/)).toBeVisible();

  // THE DRAWER. Discriminating: its fields must be absent before the click.
  await expect(page.getByText("Agent task detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("Agent task detail")).toBeVisible();
  await expect(page.getByText(/ran past its time limit and was stopped/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the client" })).toBeVisible();
  await expect(page.getByText(/no read joins a task id to the receipts/)).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/activity with the task drawer open").toEqual([]);

  // Escape, not a click on "Close": `DialogContent` ships its own icon-only
  // dismiss whose accessible name is ALSO "Close", so a role+name click is a
  // strict-mode violation between the footer button and the corner X (measured
  // — this is what the first run of this walk failed on). Escape drives the
  // dialog's real dismiss path and needs no disambiguation.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Agent task detail")).toHaveCount(0);

  // H-25: the walk that minted this saw MISSING_MESSAGE four times on this
  // page, all from `CodingQuestionsSignals.agentTasks.loading`.
  const missing = consoleText.filter((line) => /MISSING_MESSAGE/.test(line));
  expect(missing, `console MISSING_MESSAGE on /activity:\n${missing.join("\n")}`).toEqual([]);

  // POSITIVE CONTROL for the collector itself. A console assertion that has
  // never been SEEN to catch anything is an assumption — this proves the
  // listener above really does observe this page's console.
  await page.evaluate(() => console.log("MISSING_MESSAGE probe: the collector is live"));
  await expect
    .poll(() => consoleText.filter((line) => /MISSING_MESSAGE/.test(line)).length)
    .toBeGreaterThan(0);
});
