// #636's browser leg — the DURABLE BATCH, walked in real Chromium against the BUILT app.
//
// ONE SURFACE, one journey: the client Documents tab with `?batch=<uuid>` on it. The card is a
// VIEW of the sources that tab already shows, which is why there is no new route and no new
// navigation leaf to walk to.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Real: the browser, the built bundle, the URL state, the
// facet filter, the derived summary, the card's eight faces, the same-origin runtime proxy for the
// cancel decision, and every message key. Mocked: PostgREST's `get_intake_batch` and the runtime's
// two batch routes — see `intake-batch-mock.mjs`. So this walk is evidence about the JOURNEY. It is
// NOT evidence that Postgres returns this envelope (`packages/db/tests/intake-batch.test.mjs` owns
// that) or that the fan-out survives a kill (`packages/runtime/tests/intake-batch-e2e.mjs` does).

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { settleForScan, watchReactFaults } from "./helpers";

const CLIENT_ID = "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
const BATCH_ID = "b6360000-6360-4360-8360-b63600000001";
const EMPTY_BATCH_ID = "b6360000-6360-4360-8360-b63600000002";
const DENIED_BATCH_ID = "b6360000-6360-4360-8360-b63600000003";
const MISSING_BATCH_ID = "b6360000-6360-4360-8360-b63600000fff";
const WORK_ID = "b6360000-7360-4360-8360-b63600000101";

const DOCUMENTS_URL = `/clients/${CLIENT_ID}/documents`;
const BATCH_URL = `${DOCUMENTS_URL}?batch=${BATCH_ID}`;

/** The repo's own axe scope (interview-walk.spec.ts:39): WCAG 2.0/2.1 A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, what: string): Promise<void> {
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, `${what}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  if (!page.url().includes("/login")) return; // already signed in
  await page.getByLabel(/email/i).fill("owner@example.test");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

const card = (page: Page) => page.getByRole("region", { name: /Source batch/i });

test.describe("#636 the durable intake batch", () => {
  test.beforeEach(async ({ page }) => {
    watchReactFaults(page);
    await signIn(page);
  });

  test("a mixed batch: the parent summary is DERIVED, every child names its own state, and it survives a reload", async ({ page }) => {
    await page.goto(BATCH_URL);
    await expect(card(page)).toBeVisible();

    // The facet counts, labelled and NOT summed.
    await expect(card(page)).toContainText("Admitted");
    await expect(card(page)).toContainText("Committed");
    await expect(card(page)).toContainText("Waiting");
    await expect(card(page)).toContainText("Unassigned");

    // NO Progress element and NO percentage-shaped string, anywhere on the card.
    await expect(card(page).locator("[role='progressbar']")).toHaveCount(0);
    expect(await card(page).innerText()).not.toMatch(/\d+\s*%/);

    // Every child names its OWN state (UI-30) and offers its OWN address (UI-31).
    await expect(card(page)).toContainText("Running");
    await expect(card(page)).toContainText("Awaiting the daily quota");
    await expect(card(page).getByRole("link", { name: /Open the work/i }).first()).toBeVisible();

    // The capacity sentence names 08:00 and never "midnight" or "tomorrow".
    const text = await card(page).innerText();
    expect(text).toContain("08:00");
    expect(text.toLowerCase()).not.toContain("midnight");
    expect(text.toLowerCase()).not.toContain("tomorrow");

    // RE-READ AFTER A RELOAD: the summary is durable, not the browser's memory of an upload.
    await page.reload();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText("April sources");
  });

  test("`?batch=` is a deep link; the facet is a REPLACE, so filtering never grows history", async ({ page }) => {
    // The two parameters answer to two different rules, and the walk holds both.
    //   `?batch=`      — opening a batch is a PUSH, so Back closes it (nothing in this walk opens
    //                    one from inside the app yet; what IS proven here is that the address
    //                    alone renders the card, which is what a shared link has to do).
    //   `?batchFacet=` — a FILTER is a `router.replace`: it rewrites the current entry rather than
    //                    stacking one, or a person who tried four facets would need four Backs to
    //                    leave the page.
    await page.goto(DOCUMENTS_URL);
    await expect(card(page)).toHaveCount(0, { timeout: 15_000 });
    await page.goto(BATCH_URL);
    await expect(card(page)).toBeVisible();

    // Base UI's Toggle renders a BUTTON with `aria-pressed`, not a radio; the facet COUNT above
    // carries the same word as a span, so the role is what disambiguates them.
    await card(page).getByRole("button", { name: "Waiting", exact: true }).click();
    await expect(page).toHaveURL(/batchFacet=waiting/);
    await expect(page).toHaveURL(new RegExp(`batch=${BATCH_ID}`));

    // DURABLE: the filtered view is an address, so it survives a reload.
    await page.reload();
    await expect(page).toHaveURL(/batchFacet=waiting/);
    await expect(card(page)).toBeVisible();

    // …and the filter grew NO history entry: one Back leaves the batch entirely.
    await page.goBack();
    await expect(page).not.toHaveURL(/batchFacet=/);
    await expect(page).not.toHaveURL(/batch=/);
  });

  test("a facet with NO rows while others have rows is a no-results face, not an Empty", async ({ page }) => {
    await page.goto(`${DOCUMENTS_URL}?batch=${BATCH_ID}&batchFacet=failed`);
    await expect(card(page)).toContainText(/No sources in this batch are Failed right now/i);
    await expect(card(page)).toContainText(/Other groups still have rows/i);
    await expect(card(page).getByRole("button", { name: /Show all/i })).toBeVisible();
    await card(page).getByRole("button", { name: /Show all/i }).click();
    await expect(page).not.toHaveURL(/batchFacet=/);
  });

  test("a batch with no members yet says what will appear", async ({ page }) => {
    await page.goto(`${DOCUMENTS_URL}?batch=${EMPTY_BATCH_ID}`);
    await expect(card(page)).toContainText(/No sources have joined this batch yet/i);
    await expect(card(page)).toContainText(/will appear here/i);
  });

  test("the DENIED face clears the rows and offers nothing that could only refuse", async ({ page }) => {
    await page.goto(`${DOCUMENTS_URL}?batch=${DENIED_BATCH_ID}`);
    await expect(card(page)).toContainText(/cannot read this batch/i);
    await expect(card(page)).not.toContainText("April sources");
    await expect(card(page).getByRole("button")).toHaveCount(0);
  });

  test("a batch this firm does not hold reads as a failure, never as an empty batch", async ({ page }) => {
    await page.goto(`${DOCUMENTS_URL}?batch=${MISSING_BATCH_ID}`);
    await expect(card(page)).toContainText(/could not be read|cannot read this batch/i);
    await expect(card(page)).not.toContainText(/No sources have joined this batch yet/i);
  });

  test("cancel-remaining shows STOPPING and reveals the completed receipts", async ({ page }) => {
    await page.goto(BATCH_URL);
    await card(page).getByRole("button", { name: /Stop this batch/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/keeps its receipt/i);
    await dialog.getByRole("button", { name: /^Stop the batch$/ }).click();
    // FIX ROUND 1 (STANDARDS `chinese-string-in-en-json`): this leg used to assert the Chinese
    // half of a shipped `en` string. The banner says it in English now, and the walk checks the
    // whole rendered card carries no CJK at all.
    await expect(card(page)).toContainText(/Stopping this batch/);
    await expect(card(page)).not.toContainText(/[\u4e00-\u9fff]/);
    await expect(card(page)).toContainText(/already been committed and their receipts are kept/i);
    // NOT terminal: the door writes `cancelled` only when nothing is live.
    await expect(card(page)).not.toContainText(/This batch was stopped/);
  });

  test("keyboard: the card is walkable and focus returns to the trigger from the dialog", async ({ page }) => {
    await page.goto(BATCH_URL);
    const trigger = card(page).getByRole("button", { name: /Stop this batch/i });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("320px: the card fits with NO page-level horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(BATCH_URL);
    await expect(card(page)).toBeVisible();
    await settleForScan(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the PAGE does not scroll horizontally at 320px").toBeLessThanOrEqual(1);
    // The withdrawn columns are re-expressed in the row's own primary cell rather than clipped.
    await expect(card(page)).toContainText("receipt-88.pdf");
  });

  test("200% zoom keeps every number and every row link readable", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto(BATCH_URL);
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("link", { name: /Open the work/i }).first()).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  });

  test("reduced motion: the card renders the same states with no animation dependency", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BATCH_URL);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText("April sources");
    await expect(card(page)).toContainText("Running");
  });

  test("axe at 320px, on the mixed batch", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(BATCH_URL);
    await expect(card(page)).toBeVisible();
    await scan(page, "intake batch card at 320px");
  });

  test("the Work each child links to is the child's own address", async ({ page }) => {
    await page.goto(BATCH_URL);
    const link = card(page).getByRole("link", { name: /Open the work/i }).first();
    await expect(link).toHaveAttribute("href", new RegExp(`/clients/${CLIENT_ID}/work/${WORK_ID}`));
  });
});
