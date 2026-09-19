import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { DEP } from "./depreciation-mock.mjs";

/**
 * #651 · THE BROWSER LEG for the depreciation half of journeys C7/C8 — "run depreciation under an
 * explicit policy, and keep the estimate-change history".
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the jsdom harness structurally cannot
 * hold: a real focus manager (the preview dialog holds initial focus and focus RETURNS to the
 * trigger when it closes), a real address bar and a real Back (the five readings of one asset live
 * in `?tab=`, and Back must return to the one the reader came from), real layout geometry at 320
 * CSS px and at 200% zoom, a real `prefers-reduced-motion` media query, and a real re-read after a
 * governed write — the runs table must gain its row because the surface RE-READ, not because it
 * painted its own optimistic answer.
 *
 * WHAT IT DOES NOT PROVE. The depreciation doors are fixtures (`depreciation-mock.mjs`). Nothing
 * here establishes that Postgres really refuses a run into a closed fiscal year at the door, that
 * the due oracle really skips it and offers the next open period, or that the authority window
 * really floors the belt — `packages/db/tests/depreciation-history.test.mjs` owns those against a
 * real Postgres, cell for cell. This lane owns what the browser does with their answers.
 *
 * THE LOCKED-PERIOD CELL IS THE ONE THE TICKET IS ABOUT, and what it asserts is an ABSENCE: after
 * the refusal, the runs table must not have gained a row. Before migration 0227 the refusal arrived
 * from a `journal_lines` trigger after the whole computation had run, naming an entry id and
 * offering no remedy; the wall now sits at the door, names the fiscal year, and says how to get
 * back in.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = DEP.clientId;
const LIST_URL = `/clients/${CLIENT}/registers?tab=fixedAssets`;
const LOCKED_LIST_URL = `/clients/${DEP.lockedClientId}/registers?tab=fixedAssets`;
const DETAIL_URL = `/clients/${CLIENT}/registers/assets/${DEP.assetId}`;

async function signInTo(page: Page, destination: string, who = "owner@example.test"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(who);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  // A GENEROUS TIMEOUT, not the 5s default: this host runs several rigs at once and the
  // post-sign-in navigation is a full server render. A short wait reports "the app did not sign
  // in" for a page that had simply not finished, which is a false finding.
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 30_000 });
}

async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      if (a.playState !== "running") return true;
      const iterations = a.effect?.getComputedTiming().iterations ?? 1;
      return iterations === Infinity;
    }),
  );
}

async function scan(page: Page, what: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), what).toEqual([]);
}

/** Open a tab by its visible name, the way a keyboard user reaches it. */
async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}

test.describe("#651 · depreciation under an explicit policy", () => {
  test("the authority card names its window and its instruction, and the preview shows the period the DATABASE chose before anything is written", async ({ page }) => {
    await signInTo(page, LIST_URL);

    // THE WINDOW, ON THE SURFACE. A person reading "nothing is due" on a client with old
    // uncharged assets must be able to find out WHY here rather than from a refusal.
    await expect(page.getByTestId("fa-authority-window")).toContainText(DEP.authorityFrom, { timeout: 20_000 });
    await expect(page.getByTestId("fa-authority-ref")).toBeVisible();

    const trigger = page.getByRole("button", { name: "Run depreciation" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // THE PERIOD IS THE DATABASE'S — and the two date inputs this dialog used to carry are gone,
    // because the only lawful value a person could type was the one the database already knew.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("fa-preview-period")).toContainText(DEP.periodStart);
    await expect(dialog.getByTestId("fa-preview-period")).toContainText(DEP.periodEnd);
    await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
    await expect(dialog.getByText("RM 750.00").first()).toBeVisible();
    await expect(dialog.getByText(DEP.expenseAccount)).toBeVisible();
    await expect(dialog.getByText(DEP.accumAccount)).toBeVisible();

    // EVERY SKIP REASON IN WORDS, including the fifth — the one the per-asset arithmetic can never
    // return — and the skipped list is OPEN because one of them is work somebody still owes.
    await expect(dialog.getByText("waiting on depreciation particulars")).toBeVisible();
    await expect(dialog.getByText("a disposal draft is waiting on this asset")).toBeVisible();
    await expect(dialog.getByTestId("fa-preview-skipped")).toHaveAttribute("data-starts-open", "true");

    // …and a period the ORACLE skipped for a closed financial year is STATED, with its year.
    await expect(dialog.getByTestId("fa-preview-skipped-closed")).toContainText(DEP.fyLabel);
    await expect(dialog.getByTestId("fa-preview-skipped-closed")).toContainText(DEP.closedPeriodStart);

    // CONFIRM, then the RE-READ. The runs table gains the row because the surface re-read.
    await dialog.getByRole("button", { name: "Run this period" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
    const runRow = page.getByRole("row").filter({ hasText: `${DEP.periodStart} – ${DEP.periodEnd}` });
    await expect(runRow).toBeVisible({ timeout: 20_000 });
    await expect(runRow.getByRole("link")).toBeVisible();
  });

  test("a CLOSED period is refused BEFORE anything is drafted, and the refusal names the year and the way back in", async ({ page }) => {
    // A SEPARATE CLIENT, not a toggle on the one above: this cell's claim is an ABSENCE, and an
    // absence cannot be asserted on a world a sibling cell may have moved.
    await signInTo(page, LOCKED_LIST_URL);

    const before = await page.getByRole("row").count();
    await page.getByRole("button", { name: "Run depreciation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("fa-preview-period")).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Run this period" }).click();

    // THE REFUSAL TRAVELS INTO THE DIALOG WITH THE HUMAN and renders VERBATIM with its code —
    // never re-worded, never reduced to "something went wrong".
    await expect(dialog).toContainText("CLR38", { timeout: 20_000 });
    await expect(dialog).toContainText(DEP.fyLabel);
    await expect(dialog).toContainText("reopen_fiscal_year");
    await expect(dialog, "the dialog STAYS OPEN on a refusal — the human has to be able to read it").toBeVisible();

    // …AND NOTHING WAS WRITTEN. This is the assertion the whole locked-period slice exists for.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.getByRole("row").count(), "no run row was created by a refused run").toBe(before);
    // …and the runs panel for this client is still HONESTLY empty rather than showing a phantom.
    await expect(page.getByText("No depreciation runs yet.", { exact: false })).toBeVisible();
  });

  test("the asset detail separates the revision timeline from the charge ledger, and ?tab= survives Back", async ({ page }) => {
    await signInTo(page, DETAIL_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });

    // THE REVISION TIMELINE — its own tab, because "never revised" and "no particulars yet" are
    // different facts and a merged section can show only one of them.
    await openTab(page, "Policy & effective revisions");
    await expect(page).toHaveURL(/tab=revisions/);
    await expect(page.getByText("Estimate change")).toBeVisible();
    await expect(page.getByText("the plant survey revised the remaining life")).toBeVisible();
    // The PREDECESSOR is a root generation and carries no class — it reads as NOT RECORDED rather
    // than as an accounting claim this surface invented.
    await expect(page.getByText("Not recorded")).toBeVisible();
    await expect(page.getByText("Current")).toBeVisible();

    // THE IMMUTABLE CHARGE LEDGER — append-only, so an unwound charge is struck through beside the
    // row that unwound it rather than removed.
    await openTab(page, "History");
    await expect(page).toHaveURL(/tab=history/);
    await expect(page.getByText("Charge ledger")).toBeVisible();
    // SCOPED TO THE ROWS, not to the page: the append-only caption beneath the table says the word
    // "unwinding" too, and an unscoped text match resolves to two nodes and reports a strict-mode
    // violation rather than the fact under test. What this cell is about is which ROW carries
    // which label — the unwinding row, and the row it struck through.
    const unwindRow = page.getByTestId(`fa-charge-row-${DEP.unwindChargeId}`);
    const unwoundRow = page.getByTestId(`fa-charge-row-${DEP.unwoundChargeId}`);
    await expect(unwindRow.getByText("Unwinding")).toBeVisible();
    await expect(unwoundRow.getByText("Unwound")).toBeVisible();
    await expect(unwoundRow).toHaveAttribute("data-unwound", "true");
    const ledgerRow = page.getByRole("row").filter({ hasText: "2026-03-01" }).first();
    await expect(ledgerRow.getByRole("link")).toBeVisible();

    // STABLE URL, AND ONE BACK. A pasted link lands on the reading it names — and the tab moves
    // REPLACE rather than push, so a reader who glanced at four tabs is ONE Back from the register
    // they arrived from rather than four. That is the whole reason `replace` was chosen, and it is
    // the half a jsdom harness cannot measure: `fa-detail-tab-url.test.tsx` can prove the history
    // VERB is `replace`, only a real address bar can prove where Back actually lands.
    await page.goto(LIST_URL);
    await expect(page.getByRole("button", { name: "Run depreciation" })).toBeVisible({ timeout: 20_000 });
    await page.goto(`${DETAIL_URL}?tab=revisions`);
    await expect(page.getByText("Estimate change")).toBeVisible({ timeout: 20_000 });
    await openTab(page, "Schedule");
    await expect(page).toHaveURL(/tab=schedule/);
    await openTab(page, "History");
    await expect(page).toHaveURL(/tab=history/);
    await page.goBack();
    await expect(page).toHaveURL(/\/registers\?tab=fixedAssets$/);
  });

  test("keyboard reaches the preview and focus RETURNS to the trigger; 320px and 200% zoom keep the reading; the axe scan is clean under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInTo(page, LIST_URL);
    await ensureRealFocus(page);

    const trigger = page.getByRole("button", { name: "Run depreciation" });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("fa-preview-period")).toBeVisible();
    await scan(page, "the preview dialog under prefers-reduced-motion");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // FOCUS RETURNS TO THE TRIGGER — the half a jsdom harness cannot have, and the reason this cell
    // is in a browser at all.
    await expect(trigger).toBeFocused();

    // 320 CSS px: no horizontal page scroll, and the runs table still READS rather than clipping.
    await page.setViewportSize({ width: 320, height: 720 });
    await settle(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal page scroll at 320 CSS px").toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Run depreciation" })).toBeVisible();
    await scan(page, "the runs panel at 320 CSS px");

    // 200% zoom — the same content at half the effective width.
    await page.setViewportSize({ width: 640, height: 720 });
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    await settle(page);
    await expect(page.getByRole("button", { name: "Run depreciation" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });

    // …and the asset detail's two new tables are named, so a screen reader does not meet two
    // unnamed tables on one route.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${DETAIL_URL}?tab=history`);
    await expect(page.getByRole("table", { name: /Depreciation charges/i })).toBeVisible({ timeout: 20_000 });
    await scan(page, "the asset detail's charge ledger");
    await openTab(page, "Policy & effective revisions");
    await expect(page.getByRole("table", { name: /revisions/i })).toBeVisible();
  });
});
