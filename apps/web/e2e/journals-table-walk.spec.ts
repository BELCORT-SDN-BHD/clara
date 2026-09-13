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

/** #619 — the SAME click, without the table-visible assertion: a client with no journal
 *  entries at all renders the empty state INSTEAD of a table, so `openPostedTab`'s own
 *  post-condition would fail for the one cell that means to reach exactly that state. */
async function openPostedTabAllowingEmpty(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Posted" }).click();
}

test("the Posted tab is a real table, sorted by POSTING date and not by the read's own order", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  // #614 removed the layout's own "Client: <name>" heading — the CB-AE2E-019
  // route-announcer strict-mode hazard this cell used to work around is
  // retired with it (there is now exactly one h1 on this route, and it is not
  // this string). Client identity now lives in the sidebar's own group label,
  // which this cell reads instead. The same change was made in
  // parity-holes.spec.ts and agentic-finish-walk.spec.ts.
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("ROME PUBLIC ADVISORY", { exact: true })).toBeVisible();
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

test("t634: an expanded posted row discloses its Work, its receipt and its source — both honest answers", async ({ page }) => {
  // #634 asks the journals surface to expose purpose, source, Work, receipt and
  // the correction chain. Only a browser can prove the DISCLOSURE actually paints
  // them: the unit cells hold the model, and the mock lane holds the rows.
  await signInTo(page, JOURNALS_URL);
  await openPostedTab(page);

  // 1 · THE WORK-RECORDED ENTRY, with no source. "No document" is written out —
  // an entry recorded without evidence is a legitimate state, not a gap.
  const fromWork = page.locator("table tbody tr").filter({ hasText: "BACKDATED January rent" }).first();
  await fromWork.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("Purpose", { exact: true })).toBeVisible();
  await expect(page.getByText("Journal entry", { exact: true })).toBeVisible();
  await expect(page.getByText("Typed by a person", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the Work" })).toBeVisible();
  await expect(page.getByText("No document", { exact: true })).toBeVisible();

  // THE RECEIPT IS OBTAINABLE, not merely recognisable: the short form to read,
  // and a copy control for the whole id — which is what a professional quotes to
  // somebody else. A `title` tooltip is unreachable by keyboard and invisible on
  // touch, which is why it is not the only affordance.
  await expect(page.getByText("Receipt", { exact: true })).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy", exact: true });
  await expect(copy).toBeVisible();
  // THE PERMISSION IS GRANTED EXPLICITLY, because the control's own honesty rule
  // depends on it: `navigator.clipboard.writeText` REJECTS without
  // `clipboard-write`, and the component's `.catch` then leaves the label alone
  // rather than claiming a copy that did not happen. Without the grant this cell
  // would be measuring the refusal path while claiming to measure the copy.
  await page.context().grantPermissions(["clipboard-write"]);
  await copy.click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  // …and the WHOLE id reached the clipboard, not the eight characters on screen.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  expect(pasted).toBe(JOURNALS.receiptId);

  // 2 · THE DOCUMENT-CODED ENTRY, whose source came from the OTHER lane — the
  // surface names the lane rather than guessing from a non-null id.
  await fromWork.getByRole("button", { name: "Hide" }).click();
  const fromDocument = page.locator("table tbody tr").filter({ hasText: "RECENT April utilities" }).first();
  await fromDocument.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("Coded from the document", { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// #619 (AC2) — journals' three missing table states: the Posted tab's pagination boundary
// (present but inert on the fixture's single page), an honest empty-population state (no
// entries at all, not an empty table), and a stale/refused `list_entry_links` envelope (the
// evidence read fails; the database's own figures still render).
// ---------------------------------------------------------------------------

test("the Posted tab's pagination controls are present and correctly INERT on the fixture's one page", async ({ page }) => {
  await signInTo(page, JOURNALS_URL);
  await openPostedTab(page);

  // Three approved rows (the default Posted filter), and PAGE_SIZES' smallest step is 25 — so
  // this fixture can never reach a SECOND page without inflating it well past what the other
  // cells in this file depend on (first/last row ordering, a 3-of-4 filtered count). The
  // reachable, honest state today is the BOUNDARY: exactly one page, and both navigation
  // controls correctly disabled rather than merely absent.
  await expect(page.getByText("Page 1 of 1 · 3 entries")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("a client with no journal entries at all shows the honest empty state, never an empty table", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/journal_entries**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/e2e-supabase/rest/v1/journal_lines**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await signInTo(page, JOURNALS_URL);
  await openPostedTabAllowingEmpty(page);

  await expect(page.getByText("No posted entries yet.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Journal entries" })).toHaveCount(0);
});

test("t634: a stale or refused list_entry_links envelope is said out loud, and the database's own figures still render", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/rpc/list_entry_links", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "e2e: links read refused" }) }));

  await signInTo(page, JOURNALS_URL);
  await openPostedTab(page);

  // SAID OUT LOUD, above the table — "we could not read it" is a different fact from "there is
  // none", and journal-entries-table.tsx's own header says why the two must never render the
  // same way.
  await expect(
    page.getByText(
      "We could not read the Work, receipt and source links for these entries. The amounts and dates below are still the database's own.",
    ),
  ).toBeVisible();
  // THE DEGRADATION IS NARROW: the refusal fails only the evidence columns. The database's OWN
  // figures — every row, in the right order — still render exactly as the happy-path cell above
  // asserts them.
  await expect(firstRow(page)).toContainText("RECENT April utilities");
  await expect(page.locator("table tbody tr").last()).toContainText("BACKDATED January rent");
});
