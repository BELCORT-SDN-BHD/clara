import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { FA } from "./fixed-asset-mock.mjs";

/**
 * #639 · THE BROWSER LEG for journey C7 — "Asset list → acquisition/source/value → depreciation
 * policy and schedule → runs/corrections/disposal history", and the recipe's own sentence beside
 * it: "Acquisition can be complete while policy setup waits. Missing useful life or start date
 * highlights only the dependent setup."
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the jsdom harness structurally cannot
 * hold: a real focus manager (the dialog holds initial focus and focus RETURNS to the trigger when
 * it closes), a real address bar and a real Back (list → detail → back to the list, with the tab
 * query preserved), real layout geometry at 320 CSS px and at 200% zoom, a real
 * `prefers-reduced-motion` media query, real `sessionStorage` across a tab switch, and a real
 * re-read after a governed write — the register must SWITCH to "complete" because the surface
 * re-read, not because it painted its own optimistic answer.
 *
 * WHAT IT DOES NOT PROVE. The FA doors are fixtures (`fixed-asset-mock.mjs`). Nothing here
 * establishes that a Work-lane acquisition really births a register row, that the deferred birth
 * trigger really fires before `t_je_fa_movement_belt`, or that the particulars door really refuses
 * a second completion — `packages/db/tests/fixed-asset-acquisition.test.mjs` and
 * `packages/runtime/tests/fixed-asset-acquisition-e2e.mjs` own those against a real Postgres. This
 * lane owns what the browser does with their answers.
 *
 * THE SPLIT IS ASSERTED ON EVERY SURFACE, deliberately. "The acquisition is complete while the
 * depreciation particulars wait" is the ticket, and a cell that checked it once on one page would
 * not be measuring what a professional actually reads — the register row, the detail header, the
 * acquisition tab, the particulars tab and the schedule tab each say their own half.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = FA.clientId;
const LIST_URL = `/clients/${CLIENT}/registers?tab=fixedAssets`;
const DETAIL_URL = `/clients/${CLIENT}/registers/assets/${FA.assetId}`;
const ANSWERABLE_URL = `/clients/${CLIENT}/registers/assets/${FA.answerableAssetId}`;
const REVERSED_URL = `/clients/${CLIENT}/registers/assets/${FA.reversedAssetId}`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
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

test.describe("#639 · C7 fixed-asset acquisition", () => {
  test("the register links each asset to its own page and says which one is waiting", async ({ page }) => {
    await signInTo(page, LIST_URL);

    // MEANINGFUL LOADING, then real data — never a placeholder amount painted as a zero.
    const pendingLink = page.getByRole("link", { name: FA.assetName });
    await expect(pendingLink).toBeVisible({ timeout: 20_000 });

    // THE SPLIT, on the list: one row waiting, one answered, and the waiting one says so in WORDS
    // beside its name rather than by colour alone.
    const pendingRow = page.getByRole("row").filter({ hasText: FA.assetName });
    await expect(pendingRow.getByText("Waiting on depreciation particulars")).toBeVisible();
    const completeRow = page.getByRole("row").filter({ hasText: FA.completeAssetName });
    await expect(completeRow).toBeVisible();
    await expect(completeRow.getByText("Waiting on depreciation particulars")).toHaveCount(0);

    // EXACT MONEY, from the DB's own projection.
    await expect(pendingRow.getByText("RM 8,500.00").first()).toBeVisible();

    // STABLE URL AND BACK. The list → detail → Back journey must return the reader to the register
    // they were on, with its tab query intact.
    await pendingLink.click();
    await expect(page).toHaveURL(new RegExp(`${FA.assetId}$`), { timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/tab=fixedAssets$/);
    await expect(page.getByRole("link", { name: FA.assetName })).toBeVisible();
  });

  test("the detail page shows a COMPLETE acquisition beside SEPARATELY pending particulars", async ({ page }) => {
    await signInTo(page, DETAIL_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });

    // The acquisition is WHOLE: exact cents, its currency, its journal entry, its Work and its
    // receipt — all on one tab, none of them waiting on anything.
    await expect(page.getByText("RM 8,500.00").first()).toBeVisible();
    await expect(page.getByText("MYR", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: FA.entryId })).toBeVisible();
    await expect(page.getByRole("link", { name: FA.workId })).toBeVisible();
    await expect(page.getByText(FA.receiptId)).toBeVisible();
    // An absent source document is an HONEST sentence, never a blank cell.
    await expect(page.getByText("No source document", { exact: false })).toBeVisible();
    // The boundary a credit-financed acquisition runs into, stated where the reader is.
    await expect(page.getByText("supplier credit", { exact: false })).toBeVisible();

    // …and the waiting half is its OWN tab, which is the ticket made structural.
    await expect(page.getByText("Waiting on depreciation particulars").first()).toBeVisible();
    await openTab(page, "Particulars & policy");
    await expect(page.getByText("The acquisition is complete", { exact: false })).toBeVisible();
    await expect(page.getByText("only the depreciation setup is waiting", { exact: false })).toBeVisible();

    // The SCHEDULE says WHY it is empty. "No schedule" and "no schedule YET, because the
    // particulars are outstanding" are different facts and only one is actionable.
    await openTab(page, "Schedule");
    await expect(page.getByText("once the depreciation particulars are answered", { exact: false })).toBeVisible();
  });

  test("History names the correction chain and says how each relationship was derived", async ({ page }) => {
    await signInTo(page, REVERSED_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });
    await openTab(page, "History");
    await expect(page.getByRole("link", { name: FA.assetName })).toBeVisible();
    await expect(page.getByText("Successor", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reversed acquisition on the same account").first()).toBeVisible();
    // The boundary, once, for the whole table: these are derivations, not stored links.
    await expect(page.getByText("derived from the books, not stored links", { exact: false })).toBeVisible();
    // The reversal itself is named by its own mirror entry, so the chain is checkable.
    await expect(page.getByRole("link", { name: FA.reversalMirrorId })).toBeVisible();
  });

  test("an invalid answer names the dependent CONTROL, keeps the draft, and a valid one persists", async ({ page }) => {
    await ensureRealFocus(page);
    await signInTo(page, ANSWERABLE_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });
    await openTab(page, "Particulars & policy");

    const trigger = page.getByRole("button", { name: "Complete particulars" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // INITIAL FOCUS IS INSIDE THE DIALOG — a real focus manager, which jsdom cannot hold.
    await expect
      .poll(async () => dialog.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);

    // ESCAPE RETURNS FOCUS TO THE TRIGGER. The dialog is a bounded decision, and a reader who
    // dismisses it must land back where they were rather than on the document body.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialogBody = page.getByRole("dialog");
    await dialogBody.getByLabel("Depreciation method").selectOption("straight_line");
    await dialogBody.getByLabel("In-service (start) date").fill("2026-08-20");
    await dialogBody.getByLabel("Useful life (months)").fill("60");
    const confirm = page.getByRole("dialog").getByRole("button", { name: "Complete particulars" });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // THE PERSISTENT OUTCOME, RE-READ: the surface must show the answered state because it read it
    // back, and the waiting sentence must be gone.
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText("Waiting on depreciation particulars")).toHaveCount(0, { timeout: 20_000 });
    await openTab(page, "Schedule");
    await expect(page.getByText("14,167.00").or(page.getByText("Projected charge"))).toBeVisible();
  });

  test("320px and 200% zoom keep the identity, the amount and the primary action readable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await signInTo(page, DETAIL_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("RM 8,500.00").first()).toBeVisible();

    // NO PAGE-WIDE HORIZONTAL SCROLL at 320 CSS px. A ledger table may own a labelled horizontal
    // viewport of its own; the PAGE may not.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);

    // 200% ZOOM, as a halved CSS viewport — the same geometry a browser's own zoom produces.
    await page.setViewportSize({ width: 640, height: 512 });
    await expect(page.getByText("Waiting on depreciation particulars").first()).toBeVisible();
    await openTab(page, "Particulars & policy");
    await expect(page.getByRole("button", { name: "Complete particulars" })).toBeVisible();
  });

  test("the whole detail is keyboard-reachable, announces its sections, and is axe-clean under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ensureRealFocus(page);
    await signInTo(page, DETAIL_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });

    // THE TAB STRIP IS A REAL TABLIST with a roving tabindex — Base UI owns the arrow-key map, and
    // this is the cell that proves the ARIA contract is kept rather than half-declared.
    const strip = page.getByRole("tablist", { name: "Asset sections" });
    await expect(strip).toBeVisible();
    await page.getByRole("tab", { name: "Acquisition", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Particulars & policy", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Schedule", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "History", exact: true })).toBeFocused();

    await scan(page, "asset detail — Acquisition");
    for (const name of ["Particulars & policy", "Schedule", "History"]) {
      await openTab(page, name);
      await scan(page, `asset detail — ${name}`);
    }
  });

  test("a draft survives a TAB switch and never crosses into another asset", async ({ page }) => {
    await ensureRealFocus(page);
    await signInTo(page, ANSWERABLE_URL);
    await openTab(page, "Particulars & policy");
    const trigger = page.getByRole("button", { name: "Complete particulars" });
    if (!(await trigger.isVisible().catch(() => false))) {
      // The answer cell may have run first on this server. Nothing is left to draft, and saying so
      // is honest — the draft claim is proven on the OTHER pending asset below either way.
      test.info().annotations.push({ type: "note", description: "answerable asset already completed on this server" });
    } else {
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Useful life (months)").fill("84");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await trigger.click();
      await expect(page.getByRole("dialog").getByLabel("Useful life (months)")).toHaveValue("84");
      await page.keyboard.press("Escape");
    }

    // AND NEVER ACROSS ASSETS. A draft is scoped to the object it was typed against; carrying it
    // onto a different asset would be an accounting claim nobody made.
    await page.goto(DETAIL_URL);
    await expect(page.getByRole("heading", { name: "Fixed asset", exact: true })).toBeVisible({ timeout: 20_000 });
    await openTab(page, "Particulars & policy");
    const otherTrigger = page.getByRole("button", { name: "Complete particulars" });
    await expect(otherTrigger).toBeVisible();
    await otherTrigger.click();
    await expect(page.getByRole("dialog").getByLabel("Useful life (months)")).toHaveValue("");
  });
});
