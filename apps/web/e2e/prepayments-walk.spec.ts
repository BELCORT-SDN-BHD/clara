import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, settleForScan, signInTo } from "./helpers";
import { PREPAY } from "./prepayments-mock.mjs";

/**
 * #653 · THE BROWSER LEG for journeys C8 and C9 — "supported typed action → source/basis and dates
 * → schedule preview → accepted plan / current run", and "run history and revise/pause/cancel".
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real focus manager (the safe answer holds initial focus in a real dialog, and focus
 * RETURNS when it closes), a real address bar and Back, real layout geometry at 320 CSS px and at
 * 200% zoom, a real `prefers-reduced-motion` media query, real form state across a failed submit,
 * and a real re-read after a governed write.
 *
 * WHAT IT DOES NOT PROVE. The prepayment doors are fixtures (`prepayments-mock.mjs`). Nothing here
 * establishes that `clara.create_prepayment_schedule` really derives an exact-cent allocation,
 * that `clara.list_prepayment_attention` really reaches a refused period, or that the frozen
 * evaluator really refuses a term the document does not state.
 * `packages/db/tests/prepayment-schedule.test.mjs`,
 * `packages/db/tests/prepayment-occurrences.test.mjs` and
 * `packages/runtime/tests/prepayment-occurrence-e2e.mjs` own those against a real Postgres. This
 * lane owns what the browser does with their answers.
 *
 * BOTH BOUNDARY STATEMENTS ARE ASSERTED ON EVERY SURFACE, deliberately: the bank-payment line and
 * the configuration-is-not-a-posting line are the two sentences this acceptance requires to be
 * PERSISTENT rather than transient, and a cell that checked either once on one page would not be
 * measuring "persistent".
 *
 * THE FIXTURE IS STATEFUL PER-SERVER, NOT PER-TEST, and one server serves every walk in the suite.
 * Cells that need a precondition ASSERT it and repair it through the product's own doors rather
 * than assuming the previous cell left it alone — `plans-walk.spec.ts`'s own discipline, for the
 * same reason: a cell that fails mid-way never reaches an `afterEach`.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = PREPAY.clientId;
const LIST_URL = `/clients/${CLIENT}/prepayments`;
const DETAIL_URL = `/clients/${CLIENT}/prepayments/${PREPAY.scheduleId}`;
const NEW_URL = `/clients/${CLIENT}/prepayments/new`;

/** #1017 — delegates to the shared settle-before-scan contract (./helpers) instead of this file's
 *  own animations-only wait, which never checked the enter/mount opacity fade settleForScan also
 *  covers. Dropping the (0,0) mouse park too: settleForScan's own header records why it is no
 *  longer needed — the hover-state contrast it used to dodge is fixed at the token now. */
async function settle(page: Page): Promise<void> {
  await settleForScan(page);
}

async function scan(page: Page, what: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

/** The schedule must be ACTIVE for the lifecycle cells. Repaired through the product's own Resume
 *  door, never by reaching into the fixture. */
async function ensureActive(page: Page): Promise<void> {
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  if (await resume.isVisible().catch(() => false)) {
    await resume.click();
    await page.getByRole("dialog").getByRole("button", { name: "Resume the plan" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
}

// ===========================================================================================
// prepayments.walk.attention — the band is the first thing on the page, and both arms are there.
// ===========================================================================================

test("prepayments.walk.attention: both persistent statements render, the attention band names a period that charged nothing AND a prepayment nothing amortises, and the progress column counts POSTED periods", async ({ page }) => {
  await signInTo(page, LIST_URL);

  // BOTH boundary statements, on the LIST.
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/An accepted schedule is not a posted period/)).toBeVisible();

  // ARM A — the typed reason is the DATABASE's own word, on screen.
  await expect(page.getByText(/Last period refused: write_into_closed_period/)).toBeVisible();
  await expect(page.getByText(/Work was created on 2026-03-31 and the books refused it/)).toBeVisible();

  // ARM B — and it names the NEXT act rather than offering a form that can only refuse.
  // #939 — THE BAND NOW CARRIES TWO CANDIDATES, one per term carrier, so the shared badge text is
  // no longer unique on the page. The count is asserted rather than the uniqueness relied on: a
  // strict-mode failure would have been this cell noticing the new row by accident, and the row is
  // the point.
  await expect(page.getByTestId("prepayment-attention-unscheduled")).toHaveCount(2);
  await expect(page.getByText(/Posted, not yet amortised/).first()).toBeVisible();
  await expect(page.getByText(/states no service period yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the document" })).toBeVisible();
  // …and the memo-only one names the OTHER act, because it has no document to send anyone to.
  await expect(page.getByText(/This prepayment binds no document/)).toBeVisible();
  await expect(page.getByRole("link", { name: "State the service period" })).toBeVisible();

  // POSTED IS NOT ADMITTED, as a number: two of three periods reached the books.
  await expect(page.getByText("2 of 3 periods")).toBeVisible();

  await scan(page, "prepayments list");
});

// ===========================================================================================
// prepayments.walk.refusal — the create-time residue: the draft survives and the prepayment is
// still posted.
// ===========================================================================================

test("prepayments.walk.refusal: a refused configure keeps every field, prints the database's own words, says the prepayment is STILL posted, and the retry succeeds and shows the derived allocation", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 2 }));
  await signInTo(page, NEW_URL);

  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/An accepted schedule is not a posted period/)).toBeVisible();
  // THE CADENCE IS DERIVED, AND THE FORM SAYS SO rather than offering a control for it.
  await expect(page.getByText(/Monthly, on each period's own month end/)).toBeVisible();

  const basis = "the invoice narrates a three-month software subscription";
  await page.getByLabel("Recognised prepayment").selectOption(PREPAY.unscheduledEntryId);
  // THE INSTRUCTION IS CHOSEN, never derived. The mock's own door refuses any other reference with
  // `authority_ref_unresolved`, exactly as 0193 does — so a walk that skipped this control could
  // not reach the term refusal below at all.
  await page.getByLabel("The instruction that authorises this schedule").selectOption(PREPAY.workId);
  await page.getByLabel("Expense account").selectOption("59000001");
  await page.getByLabel("Why that account").fill(basis);
  await page.getByLabel("Purpose", { exact: true }).fill("Annual software subscription");
  await page.getByRole("button", { name: "Configure the schedule" }).click();

  // THE REFUSAL. Its own words, and the sentence that matters most: the money did not go away.
  await expect(page.getByText(/no live service period is recorded/)).toBeVisible();
  await expect(page.getByText(/A person records the service period on the document first/)).toBeVisible();
  await expect(page.getByText(/The prepayment itself is still posted and still needs a schedule/)).toBeVisible();
  // …AND THE DRAFT SURVIVED, every field of it.
  await expect(page.getByLabel("Why that account")).toHaveValue(basis);
  await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("Annual software subscription");
  await expect(page.getByLabel("Expense account")).toHaveValue("59000001");
  await expect(page.getByLabel("The instruction that authorises this schedule")).toHaveValue(PREPAY.workId);
  await scan(page, "prepayments form after a refusal");

  // THE RETRY, once the term exists. The derived allocation appears as a DISABLED preview.
  await page.getByRole("button", { name: "Configure the schedule" }).click();
  await expect(page).toHaveURL(new RegExp(`/prepayments/${PREPAY.scheduleId}$`), { timeout: 30_000 });
  await expect(page.getByText("Period-by-period charge")).toBeVisible();
  await expect(page.getByText(/Final period — carries the remainder/)).toBeVisible();
});

// ===========================================================================================
// prepayments.walk.memo_only — #939, end to end: a prepayment posted with NO document is found in
// the band, its service period is stated by the person at the screen, the schedule is configured
// off that statement, and every surface afterwards says the term came from a person.
// ===========================================================================================

test("prepayments.walk.memo_only: a prepayment with no document is found in the band, a person states its service period, the schedule is configured off that statement, and the detail and the list both say the term came from a person rather than a document", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 3 }));
  await signInTo(page, LIST_URL);

  // THE BAND FINDS IT. Before #939 this prepayment was not listed at all: posted, unamortised, and
  // nothing on any screen saying so.
  await expect(page.getByText(/This prepayment binds no document/)).toBeVisible();
  await page.getByRole("link", { name: "State the service period" }).click();
  await expect(page).toHaveURL(new RegExp(`entry=${PREPAY.memoEntryId}$`), { timeout: 30_000 });

  // THE FORM SAYS WHY IT IS ASKING. The option itself carries "(no document)", so a person meets
  // the reason before the question.
  await expect(page.getByLabel("Recognised prepayment")).toHaveValue(PREPAY.memoEntryId);
  await expect(page.getByRole("option", { name: /no document/ })).toBeAttached();
  await expect(page.getByText(/A person states the service period for this prepayment/)).toBeVisible();

  // THE STATEMENT ITSELF — two dates and the grounds, all typed by the person. Clara may ask the
  // question; she never answers it, and this form prefills none of it.
  await page.getByLabel("First day covered").fill("2026-05-01");
  await page.getByLabel("Last day covered").fill("2026-07-31");
  await page.getByLabel("Why that period").fill(
    "the client paid twelve months of cover by bank transfer and confirmed the dates by e-mail");
  await scan(page, "prepayments form with the stated-term statement open");
  await page.getByRole("button", { name: "State the service period" }).click();

  // THE PROMPT IS GONE BECAUSE THE DATABASE SAYS A TERM STANDS, not because the form decided so:
  // the attention read runs again after the write and the surface renders its answer.
  await expect(page.getByText(/A person states the service period for this prepayment/)).toBeHidden();

  // …AND THE SCHEDULE CONFIGURES OFF THAT STATEMENT, through the same door and the same form.
  await page.getByLabel("The instruction that authorises this schedule").selectOption(PREPAY.workId);
  await page.getByLabel("Expense account").selectOption("59000002");
  await page.getByLabel("Why that account").fill("an insurance premium is charged to insurance");
  await page.getByLabel("Purpose", { exact: true }).fill("Prepaid insurance, no invoice");
  await page.getByRole("button", { name: "Configure the schedule" }).click();
  await expect(page).toHaveURL(new RegExp(`/prepayments/${PREPAY.memoScheduleId}$`), { timeout: 30_000 });

  // THE DETAIL SAYS WHERE THE TERM CAME FROM, WHO SAID SO AND WHY — and offers no link to a
  // document that does not exist.
  await expect(page.getByText("A person's statement")).toBeVisible();
  await expect(page.getByText(/confirmed the dates by e-mail/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the document" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open the entry" })).toBeVisible();
  // The memo-only lane rides the second evaluator, and the surface reports which one derived it.
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await scan(page, "prepayment detail, human-stated term");

  // THE LIST MARKS IT, AND THE FILTER NARROWS TO IT.
  await page.goto(LIST_URL);
  await expect(page.getByTestId("prepayment-row-term-stated")).toHaveCount(1);
  await expect(page.getByText("Prepaid insurance, no invoice")).toBeVisible();
  await expect(page.getByText("Annual software subscription").first()).toBeVisible();
  await page.getByLabel("Term came from").selectOption("human_stated");
  await expect(page.getByText("Prepaid insurance, no invoice")).toBeVisible();
  await expect(page.getByRole("link", { name: "Annual software subscription" })).toHaveCount(0);
  await page.getByLabel("Term came from").selectOption("document_service_period");
  await expect(page.getByRole("link", { name: "Prepaid insurance, no invoice" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Annual software subscription" })).toBeVisible();
  await scan(page, "prepayments list filtered by term source");
});

// ===========================================================================================
// prepayments.walk.detail — the allocation, the execution, and the explain-and-choose surface.
// ===========================================================================================

test("prepayments.walk.detail: the derived facts, the judged account WITH its grounds, the allocation joined to its execution, and a refused period's explain-and-choose surface", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await ensureActive(page);

  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/An accepted schedule is not a posted period/)).toBeVisible();

  // WHAT WAS DERIVED, AND FROM WHAT.
  await expect(page.getByText("2026-01-01 – 2026-03-31").first()).toBeVisible();
  await expect(page.getByText("Stated by a person")).toBeVisible();
  await expect(page.getByText(/the invoice narrates a three-month software subscription/)).toBeVisible();

  // THE ALLOCATION, EXACT TO THE CENT, with the residual NAMED on the final period.
  await expect(page.getByText("RM 333.33").first()).toBeVisible();
  await expect(page.getByText("RM 333.35")).toBeVisible();
  await expect(page.getByText(/Final period — carries the remainder/)).toBeVisible();
  // …and no mismatch banner, because the three lines sum to the recognised amount.
  await expect(page.getByText(/do not sum to the recognised amount/)).toHaveCount(0);

  // THE EXPLAIN-AND-CHOOSE SURFACE, with the DATABASE's own reason and the two honest choices.
  await expect(page.getByText("This period charged nothing")).toBeVisible();
  await expect(page.getByText(/The database's own reason: write_into_closed_period/)).toBeVisible();
  await expect(page.getByText(/That period is closed\. Reopen it/)).toBeVisible();
  await expect(page.getByText(/never reaches back past 2026-01-31/)).toBeVisible();

  await scan(page, "prepayment detail");
});

// ===========================================================================================
// prepayments.walk.lifecycle — a real dialog, real focus return, and a real re-read.
// ===========================================================================================

test("prepayments.walk.lifecycle: the pause dialog holds initial focus on the SAFE answer, Escape restores focus to its trigger, and an accepted pause is a RE-READ rather than an optimistic paint", async ({ page }) => {
  // THE LONGEST CELL IN THIS FILE, and it takes the harness's own long budget rather than the
  // 30-second default: a server-rendered sign-in, two real dialogs and two re-reads, on a host
  // that runs several rigs at once. A short budget here reports "the dialog did not open" for a
  // page that had simply not finished, which is a false finding.
  test.slow();
  await signInTo(page, DETAIL_URL);
  await ensureActive(page);

  const trigger = page.getByRole("button", { name: "Pause", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Pause Annual software subscription?")).toBeVisible();
  // PAUSE IS NOT CANCEL, and the dialog says so in words.
  await expect(dialog.getByText(/Pausing stops future occurrences only/)).toBeVisible();
  // THE SAFE ANSWER HOLDS INITIAL FOCUS: a destructive default is how a keyboard user ends a
  // schedule by pressing Enter.
  await ensureRealFocus(page);
  await expect(dialog.getByRole("button", { name: "Keep scheduling" })).toBeFocused();

  // ESCAPE DISMISSES AND FOCUS RETURNS TO THE TRIGGER.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // THE ACCEPTED PAUSE IS A RE-READ. The status, the controls and the attention band all move
  // because the surface read again — not because it painted its own answer.
  await trigger.click();
  // "Pause the plan", not "Pause the schedule": these are #640's OWN dialogs, reused rather than
  // re-cut, so they speak the plan lane's words. That is deliberate — a prepayment schedule IS an
  // `amortisation_schedule` accounting plan — and the duplicate strings this lane briefly carried
  // in its own namespace were DELETED rather than left as a second copy nothing reads.
  await page.getByRole("dialog").getByRole("button", { name: "Pause the plan" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Paused").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();

  // …and restored, so the next cell starts where this one found the world.
  await ensureActive(page);
});

// ===========================================================================================
// prepayments.walk.geometry — 320px, 200% zoom, reduced motion, Back.
// ===========================================================================================

test("prepayments.walk.geometry: the list and the detail hold at 320 CSS px with no horizontal overflow, and at 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, LIST_URL);
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/Last period refused/)).toBeVisible();
  // NO HORIZONTAL OVERFLOW on the document itself. A table wider than the viewport is admissible
  // only inside its own scroll region, which is what `DataTableCard` provides.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the list must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await scan(page, "prepayments list at 320px");

  await page.goto(DETAIL_URL);
  await expect(page.getByText("This period charged nothing")).toBeVisible();
  const detailOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(detailOverflow, "the detail must not scroll horizontally at 320px").toBeLessThanOrEqual(1);

  // 200% ZOOM, which is a different measurement from a narrow viewport: the same CSS pixels with
  // everything twice the size.
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/The database's own reason/)).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
});

test("prepayments.walk.motion_and_back: under prefers-reduced-motion nothing animates indefinitely, the URL is stable, and Back returns from the detail to the list", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 4 }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, LIST_URL);
  await settle(page);

  // A STABLE URL: opening a schedule is a navigation, so Back is the browser's own and works.
  await page.getByRole("link", { name: "Annual software subscription" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/prepayments/${PREPAY.scheduleId}$`), { timeout: 30_000 });
  await expect(page.getByText("Period-by-period charge")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/prepayments$"), { timeout: 30_000 });
  await expect(page.getByText(/Last period refused/)).toBeVisible();

  // A RELOAD LANDS ON THE SAME PLACE — the URL is the whole of this surface's state.
  //
  // IT ASSERTS THE LIST'S OWN UNCONDITIONAL CONTENT, not an attention residue: the fixture is
  // stateful PER SERVER (see this file's header), and `prepayments.walk.refusal` above CLOSES the
  // arm-B residue by configuring the schedule it was asking for. A cell that asserted arm B here
  // would be asserting the order the file happens to run in rather than what a reload does.
  await page.reload();
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/An accepted schedule is not a posted period/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Annual software subscription" }).first()).toBeVisible();
});
