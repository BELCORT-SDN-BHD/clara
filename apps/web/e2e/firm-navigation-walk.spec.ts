import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  // #614: the sidebar's ONE navigation landmark, over the one registry
  // (lib/navigation/tree.ts) — "Firm navigation" retired with the bespoke
  // `<aside>` it named.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

test("operator owner sees the full sidebar and reaches Members in two navigation clicks", async ({ page }) => {
  await signIn(page, "owner@example.test");
  const nav = page.getByRole("navigation", { name: "Main" });

  await expect(nav.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Work", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
  // "Needs you" is no longer a sidebar destination of its own — #614 folded it
  // into Work as a saved view (/work?view=needs-you), reached from Work's own
  // view strip rather than from a second sidebar row.
  await expect(nav.getByRole("link", { name: "Needs you", exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // The six settings sections are now cards on the hub, not sidebar rows — the
  // sidebar's Settings entry is one destination, and its sections are the
  // CONTENTS of that destination (components/settings/settings-hub.tsx).
  // Asserted on each card's own `<h2>`, not the wrapping `<Link>` — the link's
  // accessible name is its whole card (title AND description concatenated),
  // and several descriptions say "firm" in passing, which would make a
  // substring match on the link's name ambiguous for the "Firm" section.
  const heading = (name: string) => page.getByRole("heading", { name, exact: true, level: 2 });
  await expect(heading("Members")).toBeVisible();
  await expect(heading("Registrations")).toBeVisible();
  await expect(heading("Compliance")).toBeVisible();
  await expect(heading("Vendor identity bindings")).toBeVisible();
  await expect(heading("Firm")).toBeVisible();

  // Clicking anywhere inside the card's `<Link>` navigates — the heading is a
  // descendant of it, and a click there bubbles to the anchor exactly as a
  // click anywhere else in the card would.
  await heading("Members").click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();

  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("members");
  await expect(page.getByRole("option", { name: "Members", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
});

test("bookkeeper sidebar shows viewer/bookkeeper reads and hides admin- and owner-only destinations", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Main" });

  // #614 retired the "Admin"/"Firm" rank-shaped rename outright (E-7 / 裁-187's
  // predecessor problem) — the destination is "Settings" at every rank, so
  // neither retired label may resurface for a bookkeeper or for anyone else.
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Firm", exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  // Asserted on each card's own `<h2>` — see the operator-owner test above
  // for why the wrapping `<Link>`'s own accessible name is not the right
  // subject here.
  const sectionHeading = (name: string) => page.getByRole("heading", { name, exact: true, level: 2 });
  await expect(sectionHeading("Compliance")).toBeVisible();
  await expect(sectionHeading("Vendor identity bindings")).toBeVisible();
  await expect(sectionHeading("Firm")).toBeVisible();
  await expect(sectionHeading("Members")).toHaveCount(0);
  await expect(sectionHeading("Registrations")).toHaveCount(0);
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

test("a bookkeeper reaches /settings/members by URL and is offered NO role menu and NO invite trigger", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  await page.goto("/settings/members");
  // The ROSTER read is bookkeeper+, so the page is not empty — which is what
  // makes every absence below a finding rather than a blank screen.
  await expect(page.getByRole("heading", { name: "Everyone with access", level: 2 })).toBeVisible();
  await expect(page.getByText("E2E Bookkeeper")).toBeVisible();

  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toHaveCount(0);
  await expect(page.getByText("Admin or owner can invite someone")).toHaveCount(0);
  await expect(page.getByText("Remove from firm")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/members as a bookkeeper").toEqual([]);
});

test("an owner IS offered the role menu on the same page — the gate shapes by rank, it does not delete the control", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await page.goto("/settings/members");
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Invite someone", exact: true })).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/members as an owner").toEqual([]);
});

test("the high-stakes threshold control is GONE from /settings/firm for every rank (裁-187)", async ({ page }) => {
  for (const email of ["owner@example.test", "bookkeeper@example.test"]) {
    await signIn(page, email);
    await page.goto("/settings/firm");
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
    expect(result.violations, `/settings/firm as ${email}`).toEqual([]);
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
  // #614: the cross-client review queue is no longer its own route — it is
  // Work's saved "Needs you" view (lib/navigation/legacy-routes.ts redirects
  // the old /needs-you here).
  await page.goto("/work?view=needs-you");

  // WHAT — the client's own NAME, merged from the register (`clients` in the
  // shared mock: CLIENT_A is "Rome Properties"). Before this train the
  // cross-client queue never named the client at all. The row's own rendering
  // is unchanged by #614 (components/firm/needs-you-row.tsx) — only the route
  // it lives on moved.
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
  expect(result.violations, "/work?view=needs-you").toEqual([]);
});

// #614: the agent-task queue (and its "Details" drawer) moved from /activity
// to /work — /activity is an audit trail of what already happened again, and
// the live queue of what is running now lives where the rest of "what is
// open" lives. See lib/navigation/tree.ts's own header and
// app/(firm)/activity/page.tsx / app/(firm)/work/page.tsx for the split.
test("/activity is an audit trail again — no agent-task panel, no Details button", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await signIn(page, "owner@example.test");
  await page.goto("/activity");

  // The Activity page names its remaining UI connection gap without claiming
  // that the firm timeline read is absent from the database.
  await expect(page.getByRole("heading", { name: "Everything that happened", level: 2 })).toBeVisible();
  await expect(page.getByText(/Activity page has not been connected/)).toBeVisible();
  // The note now says explicitly where the live queue went, not just that it
  // is not here — the retirement of the panel this train left behind.
  await expect(page.getByText(/running agent tasks are on Work/)).toBeVisible();

  // THE RETIRED ENTRY: the drawer and its trigger are gone from THIS page —
  // BY ROLE and BY TEXT, so neither a live trigger nor a leftover label may
  // survive here.
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveCount(0);
  await expect(page.getByText("Agent task detail")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/activity").toEqual([]);
});

test("/work opens the agent-task drawer and logs NO MISSING_MESSAGE", async ({ page }) => {
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
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        watermark: "w2",
        counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
        sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
        rows: [],
        next_cursor: null,
      }),
    }));

  await signIn(page, "owner@example.test");
  await page.goto("/work");

  // THE DRAWER. Discriminating: its fields must be absent before the click.
  await expect(page.getByText("Agent task detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("Agent task detail")).toBeVisible();
  await expect(page.getByText(/ran past its time limit and was stopped/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the client" })).toBeVisible();
  await expect(page.getByText(/no read joins a task id to the receipts/)).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/work with the task drawer open").toEqual([]);

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
  expect(missing, `console MISSING_MESSAGE on /work:\n${missing.join("\n")}`).toEqual([]);

  // POSITIVE CONTROL for the collector itself. A console assertion that has
  // never been SEEN to catch anything is an assumption — this proves the
  // listener above really does observe this page's console.
  await page.evaluate(() => console.log("MISSING_MESSAGE probe: the collector is live"));
  await expect
    .poll(() => consoleText.filter((line) => /MISSING_MESSAGE/.test(line)).length)
    .toBeGreaterThan(0);
});
