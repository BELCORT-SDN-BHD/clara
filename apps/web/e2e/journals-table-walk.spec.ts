import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { JOURNALS } from "./journals-table-mock.mjs";

/**
 * 裁-190 · THE BROWSER LEG for the journals repair (裁-86).
 *
 * Everything here needs what the unit harness does not have: a real DOM that
 * reorders keyed rows, a real focus manager, real layout geometry for
 * axe's target-size rule, and the BUILT bundle rather than a tsx-transpiled
 * module graph. The unit cells prove the rules; this proves the journey.
 *
 *   owner       the Posted tab is a real table with sortable headers and
 *               working filters — "没有一个UIUX table for journal entry?"
 *   flaw (b)    the default order is posting_date DESC even though the READ
 *               hands rows over in created_at order (the fixture's backdated
 *               entry is created LAST on purpose).
 *   CB-AE2E-021 exactly one control named Approve on an expanded draft, and
 *               NO attestation field until a door asks for one (裁-187).
 *   H-32        the clarification renders its QUESTION TEXT, not a JSON blob,
 *               with a LABELLED expiry that keeps its time of day.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const JOURNALS_URL = `/clients/${JOURNALS.clientId}/journals`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** The memo text of the table's first BODY row — the one read that
 *  discriminates one ordering from the other. */
function firstRow(page: Page) {
  return page.locator("table tbody tr").first();
}

async function openPostedTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Posted" }).click();
  await expect(page.getByRole("table", { name: "Journal entries" })).toBeVisible();
}

test("the Posted tab is a real table, sorted by POSTING date and not by the read's own order", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  await expect(page.getByText("Client: ROME PUBLIC ADVISORY")).toBeVisible();
  await openPostedTab(page);

  // The fixture's backdated entry is the FIRST row the read returns
  // (created_at.desc) and must be the LAST row on screen.
  await expect(firstRow(page)).toContainText("RECENT April utilities");
  await expect(page.locator("table tbody tr").last()).toContainText("BACKDATED January rent");

  const dateHeader = page.getByRole("columnheader", { name: /Posting date/ });
  await expect(dateHeader).toHaveAttribute("aria-sort", "descending");

  // A click FLIPS it, asserted by first-row text — the post-condition that is
  // true only after the reorder actually happened in the DOM.
  await dateHeader.getByRole("button").click();
  await expect(dateHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(firstRow(page)).toContainText("BACKDATED January rent");

  // And back again, so a passing flip is not a one-way accident.
  await dateHeader.getByRole("button").click();
  await expect(dateHeader).toHaveAttribute("aria-sort", "descending");
  await expect(firstRow(page)).toContainText("RECENT April utilities");
});

test("a filter narrows the table, and the status filter is the only route to a WITHDRAWN or DRAFT entry", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  await openPostedTab(page);

  // Three posted rows out of four entries; the draft is behind the filter. The count line
  // states the hidden rows as a FACT, and there is nothing to "clear" yet — the tab opening on
  // its own status is the tab's contract, not something the reader did.
  await expect(page.locator("table tbody tr")).toHaveCount(3);
  await expect(page.getByText("Showing 3 of 4 entries")).toBeVisible();
  await expect(page.getByText("DRAFT office supplies")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

  await page.getByLabel("Source").selectOption("document");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(firstRow(page)).toContainText("RECENT April utilities");
  await expect(page.getByText("Showing 1 of 4 entries")).toBeVisible();

  // Clearing returns to what the TAB promised, never past it: a control named "Clear filters"
  // that widened Posted into drafts and withdrawn entries would show more than the tab says it
  // holds.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(3);
  await expect(page.getByText("DRAFT office supplies")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

  // The draft is still REACHABLE — the status filter is live, it is just not what Clear does.
  await page.getByLabel("Status").selectOption("draft");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(firstRow(page)).toContainText("DRAFT office supplies");
});

test("a row discloses its own lines, and the posted rows keep the reversal door", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  await openPostedTab(page);

  const row = page.locator("table tbody tr").filter({ hasText: "RECENT April utilities" }).first();
  await row.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("5000 — Office expenses")).toBeVisible();

  // LAW 6: reverse, never delete. There is no delete affordance to find.
  await expect(row.getByRole("button", { name: "Reverse" })).toBeVisible();
  await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
});

test("an expanded draft offers ONE Approve and NO attestation field (CB-AE2E-021 · 裁-187)", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);

  // The drafts tab is the default landing tab.
  await page.getByRole("button", { name: /DRAFT office supplies/ }).click();
  await expect(page.getByRole("button", { name: "Revise" })).toBeVisible();

  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Approve (routine)" })).toHaveCount(0);
  await expect(page.getByLabel("Attestation")).toHaveCount(0);

  // The legend says what the tab's own word means.
  await page.getByText("What these statuses mean").click();
  await expect(page.getByText("Posted — approved and in the books")).toBeVisible();
});

test("a clarification shows its QUESTION TEXT and a labelled expiry, never a raw JSON blob (H-32)", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  await page.getByRole("tab", { name: /Clarifications/ }).click();

  await expect(page.getByText(JOURNALS.question)).toBeVisible();
  await expect(page.getByText("this client's year end is 31 March")).toBeVisible();
  await expect(page.locator("pre")).toHaveCount(0);
  await expect(page.getByText("Clara is asking for a clarification")).toHaveCount(0);

  // The deadline is labelled and carries a time of day — <FormattedDate> used
  // to drop it, because that component exists for `date` columns.
  await expect(page.getByText(/Answer by\s+Sep 17, 2026/)).toBeVisible();
  await expect(page.getByText(/Answer by[^]*\d{1,2}:\d{2}/)).toBeVisible();

  // H-33: this control's accessible name says WHERE it is, so it can never
  // collide with the rail's own "Your answer" on this same route.
  await expect(page.getByLabel("Your answer (Journals clarifications)")).toBeVisible();
});

test("axe is clean on all three journals tabs", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  for (const tab of ["Drafts & review queue", "Posted", /Clarifications/] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForLoadState("networkidle");
    // Wait out `enter-content`'s fade: an axe colour-contrast read started
    // mid-transition measures the COMPOSITED mid-fade colour and reports a
    // violation that does not exist (a11y-finish-walk.spec.ts's own note).
    await expect
      .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
      .toBe(0);
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `journals tab ${String(tab)} axe violations`).toEqual([]);
  }
});
