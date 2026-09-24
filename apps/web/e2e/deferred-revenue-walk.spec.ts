import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, settleForScan, signInTo } from "./helpers";
import { DEFREV } from "./deferred-revenue-mock.mjs";

/**
 * #941 · THE BROWSER LEG for the revenue side of the release lane: an advance a customer paid ahead,
 * recognised as revenue over its service period, month by month, for a FULL YEAR.
 *
 * WHY THESE CLAIMS NEED A BROWSER. Each is a property the unit harness structurally cannot hold: a
 * real address bar (an attention row's action carries the receipt in its query string and the form
 * on the other side is already about that receipt), real form state across a FAILED submit, a real
 * re-read after a governed write, a real select whose options come from a real read, and a real
 * page a real axe run can measure.
 *
 * WHAT IT DOES NOT PROVE. The recognition doors are fixtures (`deferred-revenue-mock.mjs`). Nothing
 * here establishes that `clara.create_revenue_recognition_schedule` really derives twelve exact-cent
 * periods that clear the liability to zero, that it really excludes the SST output leg from the
 * candidate set, or that it really refuses a pattern other than straight line.
 * `packages/db/tests/revenue-recognition.test.mjs` owns all three against a real Postgres.
 *
 * ALL THREE PERSISTENT STATEMENTS ARE ASSERTED ON MORE THAN ONE SURFACE, deliberately: the
 * no-invoice boundary, the configuration-is-not-a-posting boundary and this lane's own tax boundary
 * are the sentences this acceptance requires to be PERSISTENT rather than transient, and a cell that
 * read one of them once on one page would not be measuring "persistent".
 *
 * THE CELLS RUN IN ORDER and the fixture is stateful per server (`fullyParallel: false`,
 * `workers: 1`): the list cell reads the estate before anything is configured, the configure cell
 * makes the one transition, and the detail cell reads a schedule neither of them touched.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = DEFREV.clientId;
const LIST_URL = `/clients/${CLIENT}/deferred-revenue`;
const DETAIL_URL = `/clients/${CLIENT}/deferred-revenue/${DEFREV.scheduleId}`;

async function scan(page: Page, what: string): Promise<void> {
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

// ===========================================================================================
// deferred-revenue.walk.list — the band is the first thing on the page, both arms are there, and
// the provenance filter narrows the answer the page already holds.
// ===========================================================================================

test("deferred-revenue.walk.list: all three persistent statements render, both attention arms name their own next act, the progress column counts POSTED periods, and the term-source filter narrows without a second read", async ({ page }) => {
  await signInTo(page, LIST_URL);

  // THE THREE BOUNDARY STATEMENTS, on the LIST. The tax one is this lane's own.
  await expect(page.getByText(/Recognition schedules, not invoices/)).toBeVisible();
  await expect(page.getByText(/An accepted schedule is not a posted period/)).toBeVisible();
  await expect(page.getByText(/Service tax is never recognised as revenue/)).toBeVisible();

  // ARM A — the typed reason is the DATABASE's own word, on screen.
  await expect(page.getByText(/Last period refused: write_into_closed_period/)).toBeVisible();
  await expect(page.getByText(/Work was created on 2026-03-31 and the books refused it/)).toBeVisible();

  // ARM B — two receipts, two DIFFERENT next acts, each named rather than guessed.
  await expect(page.getByTestId("deferred-revenue-attention-unrecognised")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Configure the schedule" })).toBeVisible();
  await expect(page.getByRole("link", { name: "State the service period" })).toBeVisible();
  await expect(page.getByText(/It binds no document, so a person states the service period/)).toBeVisible();

  // POSTED IS NOT ADMITTED, as a number: two of twelve periods reached the books.
  await expect(page.getByText("2 of 12 periods")).toBeVisible();
  // …and the schedule says WHERE its term came from.
  await expect(page.getByTestId("deferred-revenue-row-term-stated")).toHaveCount(1);

  // THE FILTER IS OVER THE ANSWER THE PAGE ALREADY HOLDS. The one live schedule rode a person's
  // statement, so narrowing to the document lane must empty the table — and narrowing back must
  // restore it without the row having been re-read from anywhere.
  await page.getByLabel("Term came from").selectOption("document_service_period");
  await expect(page.getByText(/No advance is being recognised for this client yet/)).toBeVisible();
  await page.getByLabel("Term came from").selectOption("human_stated");
  await expect(page.getByRole("link", { name: DEFREV.purpose })).toBeVisible();

  await scan(page, "deferred revenue list");
});

// ===========================================================================================
// deferred-revenue.walk.configure — the create-time residue, then a full YEAR on the books.
// ===========================================================================================

test("deferred-revenue.walk.configure: an attention row lands on a form that already knows the receipt, a refused configure keeps every field and says the advance is STILL posted, and the retry recognises twelve whole months with the remainder in the final one", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 2 }));
  await signInTo(page, LIST_URL);

  // THE ACTION CARRIES THE RECEIPT. A person who pressed "Configure the schedule" on a row should
  // not have to find that receipt again in a dropdown.
  await page.getByRole("link", { name: "Configure the schedule" }).click();
  await expect(page).toHaveURL(new RegExp(`/deferred-revenue/new\\?entry=${DEFREV.unrecognisedEntryId}$`));
  // By ROLE, not by text: Next mirrors the page title into an aria-live route announcer, so the
  // same words are on the page twice and a text match is a strict-mode violation.
  await expect(page.getByRole("heading", { name: "Recognise an advance" })).toBeVisible();

  const receipt = page.locator("#deferred-revenue-sourceEntry");
  await expect(receipt).toHaveValue(DEFREV.unrecognisedEntryId);

  // THE FIVE JUDGEMENTS, and nothing else: there is no amount field, no date field and no pattern
  // control on this form at all, because every one of them is derived.
  await expect(page.getByText(/The periods, the amounts and the due dates come from/)).toBeVisible();
  await page.locator("#deferred-revenue-authority").selectOption(DEFREV.workId);
  await page.locator("#deferred-revenue-revenueAccount").selectOption("4600");
  await page.locator("#deferred-revenue-revenueBasis")
    .fill("rent received in advance is rental income as the months are served");
  await page.locator("#deferred-revenue-purpose").fill(DEFREV.newPurpose);

  // THE CREATE-TIME RESIDUE. The advance is posted and the schedule is not, so the refusal must
  // keep the draft, print the database's own words and say the liability is still on the books.
  await page.getByRole("button", { name: "Configure the schedule" }).click();
  await expect(page.getByText(/The schedule was not configured/)).toBeVisible();
  await expect(page.getByText(/no live service period stands for the advance this entry records/)).toBeVisible();
  await expect(page.getByText(/The advance itself is still posted and the liability is still on the books/)).toBeVisible();
  await expect(page.locator("#deferred-revenue-purpose")).toHaveValue(DEFREV.newPurpose);
  await expect(page.locator("#deferred-revenue-revenueBasis"))
    .toHaveValue("rent received in advance is rental income as the months are served");

  // THE RETRY, and the surface lands on the schedule's own address.
  await page.getByRole("button", { name: "Configure the schedule" }).click();
  await expect(page).toHaveURL(new RegExp(`/deferred-revenue/${DEFREV.newScheduleId}$`));

  // A FULL YEAR, derived: twelve periods, the first and the last named, and the remainder wholly
  // in the final one. Nothing on this page was typed by the person who configured it.
  await expect(page.getByRole("table", { name: "Derived recognition periods" })).toBeVisible();
  await expect(page.getByTestId("deferred-revenue-period-pending")).toHaveCount(12);
  await expect(page.getByText("2026-07-01 – 2026-07-31")).toBeVisible();
  await expect(page.getByText("2027-06-01 – 2027-06-30")).toBeVisible();
  await expect(page.getByText(/Final period — carries the remainder/)).toBeVisible();
  await expect(page.getByText("Straight line, whole calendar months")).toBeVisible();
  // The boundary statements travel with the surface rather than living on the list alone.
  await expect(page.getByText(/Service tax is never recognised as revenue/)).toBeVisible();
});

// ===========================================================================================
// deferred-revenue.walk.detail — a running schedule: what each period produced, and the evidence
// behind the term it rode.
// ===========================================================================================

test("deferred-revenue.walk.detail: a running full-year schedule shows its twelve derived periods, tells a POSTED period from a REFUSED one in the database's own word, and renders the who/when/why behind a person-stated term", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ scans: 1 }));
  await signInTo(page, DETAIL_URL);

  await expect(page.getByText(DEFREV.purpose).first()).toBeVisible();
  await expect(page.getByText("Straight line, whole calendar months")).toBeVisible();

  // THE EVIDENCE BEHIND THE TERM. This advance binds no document, so a named person stated the
  // service period — and the schedule says so rather than letting it read as an invoice's word.
  await expect(page.getByTestId("deferred-revenue-term-stated")).toHaveCount(1);
  await expect(page.getByText(/the member paid twelve months of subscription up front/)).toBeVisible();
  await expect(page.getByTestId("deferred-revenue-term-superseded")).toHaveCount(0);

  // TWELVE PERIODS, three of which have fallen due: two posted, one refused with its own reason.
  await expect(page.getByTestId("deferred-revenue-period-posted")).toHaveCount(2);
  await expect(page.getByTestId("deferred-revenue-period-refused")).toHaveCount(1);
  await expect(page.getByTestId("deferred-revenue-period-pending")).toHaveCount(9);
  await expect(page.getByText(/write_into_closed_period/).first()).toBeVisible();
  await expect(page.getByText(/Final period — carries the remainder/)).toBeVisible();

  await scan(page, "deferred revenue detail");
});
