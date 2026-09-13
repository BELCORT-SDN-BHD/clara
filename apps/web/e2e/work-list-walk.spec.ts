import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { WORK_LIST } from "./work-list-mock.mjs";

/**
 * #641 (refresh spec #612, journey B3) — the durable Work list's real journey: `/work` and
 * `/clients/:id/work` used to lead with a `NotBuiltNote` over two live queues; this proves the
 * rebuilt list end to end in a real browser — filters written to the URL, the two Empty states
 * told apart, keyset Pagination with Back, the narrow filter Sheet, list-to-detail with Back
 * restoring the exact filtered page, keyboard reach, 320 px, 200 % zoom and reduced motion.
 *
 * WHAT IT DOES NOT PROVE. `clara.list_accounting_work`/`clara.get_accounting_work_row` are
 * fixtures (`work-list-mock.mjs`), including the CLR04/CLR10 refusals this walk needs. So nothing
 * below establishes that the real door pages a keyset correctly, floors at bookkeeper, or derives
 * `attempts` from real runs — `packages/db/tests/work-list.test.mjs` owns that half. This proves
 * what the browser does with the DOOR'S answers.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

const workTable = (page: Page) => page.getByRole("table", { name: "Durable work" });
const rowLink = (page: Page, memo: string) => workTable(page).getByRole("link", { name: memo });

test("the firm list renders the door's rows with their state WORD, client and origin", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");

  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Durable work", level: 2 })).toBeVisible();

  // The parked row, the retrying row and the failed row are all on page 1 of the fixture.
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  await expect(workTable(page).getByText("Needs you")).toBeVisible();
  // AC2: "technically retrying" is derived from `attempts`, and it is a WORD on the badge — never
  // a colour alone (C08.6).
  await expect(workTable(page).getByText("Retrying")).toBeVisible();
  await expect(workTable(page).getByText("period_locked")).toBeVisible();
  // The client column resolves through the door, not through a second register read. Addressed as
  // a CELL whose whole text is the name, not as any text node containing it: the row primary cell
  // also carries the client name in the `md:hidden` stacked line that re-expresses the withdrawn
  // columns at narrow widths, and that node is present-but-hidden here.
  await expect(
    workTable(page).getByRole("cell", { name: WORK_LIST.clientName, exact: true }).first(),
  ).toBeVisible();
  // #629's finding: a Work started from a conversation is listed like any other, and says so.
  await expect(workTable(page).getByText("Asked of Clara").first()).toBeVisible();
});

test("a status facet narrows the list and writes ?status= to the URL; Clear filters restores it", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");
  await expect(rowLink(page, "Utilities accrual")).toBeVisible();

  await page.getByRole("button", { name: "Needs you", exact: true }).first().click();
  await expect(page).toHaveURL(/[?&]status=awaiting_input(&|$)/);
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  await expect(rowLink(page, "Utilities accrual")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(rowLink(page, "Utilities accrual")).toBeVisible();
});

test("free text over the memo is a form, and lands in the URL as ?q=", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");
  await page.getByLabel("Search the memo").fill("payroll");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=payroll(&|$)/);
  await expect(rowLink(page, "Payroll journal")).toBeVisible();
  await expect(rowLink(page, "Utilities accrual")).toHaveCount(0);
});

test("the two EMPTY states are different: no filter matches vs a client with no work at all", async ({ page }) => {
  await signIn(page);

  // A filtered read with zero rows KEEPS the filters and offers Clear filters.
  await page.goto("/work?status=cancelled");
  await expect(page.getByText("No work matches these filters")).toBeVisible();
  await expect(page.getByText("Your filters are still applied")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear filters" }).first()).toBeVisible();

  // A client with no durable Work at all reads as FIRST USE — what will appear here, and no
  // control to clear filters that were never applied.
  await page.goto(`/clients/${WORK_LIST.emptyClient}/work`);
  // A LONGER WINDOW THAN THE 5 s DEFAULT, and it buys nothing but patience: a cold client route
  // mounts the shell, the client layout's own server read, the review queue, the Clara rail and
  // this list at once, and on a loaded host the list's first read had not settled inside the
  // default expect timeout (measured: the sr-only "Loading this firm's durable work…" was still
  // the standing state at 5 s). Nothing about the ASSERTION is weakened — the first-use Empty is
  // still what must appear, and a hang would still fail here.
  await expect(page.getByText("No work yet")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Every job Clara is asked to do/)).toBeVisible();
  await expect(page.getByText("No work matches these filters")).toHaveCount(0);
});

test("a permission loss clears the rows and explains the access state, offering nothing that could only refuse", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${WORK_LIST.deniedClient}/work`);
  await expect(page.getByText("Work is not available")).toBeVisible();
  await expect(page.getByText(/your access to this firm's work changed/i)).toBeVisible();
  await expect(page.getByRole("table", { name: "Durable work" })).toHaveCount(0);
});

test("pagination is a keyset: Next writes ?cursor=, Back returns to the first page, and no total is claimed", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  await expect(rowLink(page, "Opening balances tie-out")).toHaveCount(0);

  const pager = page.getByRole("navigation", { name: "Work list pages" });
  await expect(pager).toBeVisible();
  // ROLE "button", NOT "link", and that is the vendored primitive being measured rather than a
  // preference: shadcn base-nova's `PaginationLink` renders a real `<a href>` through Base UI's
  // Button with `nativeButton={false}`, which stamps `role="button"` onto the anchor. So the
  // control navigates like a link (the href is real, middle-click and open-in-new-tab work) while
  // assistive tech announces it as a button. Asserted as it actually is; the mismatch is reported
  // as a follow-up rather than patched into a primitive other lanes also install.
  await pager.getByRole("button", { name: "Next page" }).click();

  await expect(page).toHaveURL(/[?&]cursor=/);
  await expect(rowLink(page, "Opening balances tie-out")).toBeVisible();
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toHaveCount(0);

  // Appendix D row 42: never infer a total from the current page.
  await expect(page.getByText(/of \d+ pages?/)).toHaveCount(0);

  // Paging is a real history entry, so Back is the page before it.
  await page.goBack();
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
});

test("a deep link to a FILTERED page renders that page, and Back from the detail restores the identical query", async ({ page }) => {
  await signIn(page);
  // AC5's own line: a deep link, then list-to-detail, then Back with the same Work and the prior
  // list position — which here is literally the same query string, because the cursor and every
  // filter live in the URL.
  const listUrl = `/work?status=awaiting_input&client=${WORK_LIST.clientId}`;
  await page.goto(listUrl);
  await expect(page).toHaveURL(new RegExp(`[?&]client=${WORK_LIST.clientId}(&|$)`));
  const link = rowLink(page, "Quarterly rent — which Maybank account?");
  await expect(link).toBeVisible();

  await link.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${WORK_LIST.clientId}/work/${WORK_LIST.parkedWorkId}$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`[?&]status=awaiting_input(&|$)`));
  await expect(page).toHaveURL(new RegExp(`[?&]client=${WORK_LIST.clientId}(&|$)`));
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
});

test("saved views: the built-in Needs you view is a real link marked current, and All returns", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");
  const views = page.getByRole("navigation", { name: "Saved views" });
  await views.getByRole("link", { name: "Needs you", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=needs-you(&|$)/);
  await expect(views.getByRole("link", { name: "Needs you", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  await expect(rowLink(page, "Utilities accrual")).toHaveCount(0);

  await views.getByRole("link", { name: "All", exact: true }).click();
  await expect(rowLink(page, "Utilities accrual")).toBeVisible();
});

test("the client surface pins its own client: the list is scoped and no client picker is offered", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${WORK_LIST.clientId}/work`);
  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  await expect(rowLink(page, "Bank charges, August")).toBeVisible();
  await expect(page.getByLabel("Client", { exact: true })).toHaveCount(0);
});

test("keyboard: the list is reachable and a row opens its own durable address with Enter", async ({ page }) => {
  await signIn(page);
  await page.goto("/work");
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  await ensureRealFocus(page);

  const link = rowLink(page, "Quarterly rent — which Maybank account?");
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/work/${WORK_LIST.parkedWorkId}$`));
});

test("narrow (320px): filters move into a Sheet that says how many are applied, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto("/work?status=failed");

  // The trigger names the count, so a person arriving on a filtered deep link can SEE the list is
  // filtered without opening anything.
  const trigger = page.getByRole("button", { name: /Filters \(1 applied\)/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await expect(page.getByText("Filter this work list")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 320px").toBeLessThanOrEqual(clientWidth + 1);
});

test("narrow list-to-detail uses the full primary region and Back restores the list", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto(`/clients/${WORK_LIST.clientId}/work?status=completed`);
  const link = rowLink(page, "Bank charges, August");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/work/${WORK_LIST.completedWorkId}$`));

  await page.goBack();
  await expect(page).toHaveURL(/[?&]status=completed(&|$)/);
  await expect(rowLink(page, "Bank charges, August")).toBeVisible();
});

test("200% zoom (a halved 1280x720 viewport) keeps the list reachable with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await signIn(page);
  await page.goto("/work");
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 200% zoom").toBeLessThanOrEqual(clientWidth + 1);
});

test("reduced motion: the filter Sheet still opens and closes correctly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto("/work");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
});

test("the Work detail keeps the current question ABOVE the Results/Sources/Activity tabs", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${WORK_LIST.clientId}/work?status=awaiting_input`);
  await rowLink(page, "Quarterly rent — which Maybank account?").click();
  await expect(page).toHaveURL(new RegExp(`/work/${WORK_LIST.parkedWorkId}$`));

  const tablist = page.getByRole("tablist", { name: "Views of this work" });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole("tab", { name: "Results" })).toBeVisible();
  await expect(tablist.getByRole("tab", { name: "Sources" })).toBeVisible();
  await expect(tablist.getByRole("tab", { name: "Activity" })).toBeVisible();

  // AC3's ORDER, measured in the document rather than in the layout: the parked-question region
  // must precede the tab strip.
  const order = await page.evaluate(() => {
    const list = document.querySelector('[data-slot="tabs-list"]');
    const parked = [...document.querySelectorAll("*")].find((el) =>
      /asked a question and is parked/.test(el.textContent ?? ""));
    if (!list || !parked) return null;
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: `list` comes AFTER `parked`.
    return (parked.compareDocumentPosition(list) & 4) !== 0;
  });
  expect(order, "the current question precedes the tab strip in DOM order").toBe(true);
});

test("/work is axe-clean at 320px with the list rendered", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto("/work");
  await expect(rowLink(page, "Quarterly rent — which Maybank account?")).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/work at 320px").toEqual([]);
});
