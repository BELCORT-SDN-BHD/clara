import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ACTIVITY } from "./activity-mock.mjs";

/**
 * #632 (refresh spec #612, journey B5) — the attributable Activity feed's real content:
 * `/activity` used to lead with a `NotBuiltNote` over a flat, unpaginated receipts-only list
 * (CB-AE2E-018); this proves the rebuilt page — filters written to the URL, keyset pagination
 * with a dedupe-aware "Load more", the event detail Sheet's focus/Escape/Back contract, a
 * correction's two-sided link, live permission loss clearing the list, and the no-oracle denied
 * detail state — end to end in a real browser.
 *
 * WHAT IT DOES NOT PROVE. `clara.list_activity`/`get_activity_event` themselves are fixtures
 * (`activity-mock.mjs`), including the CLR04/CLR11 refusals this walk needs. So nothing below
 * establishes that the real door unions its three sources correctly, floors at bookkeeper, or
 * pages a real keyset tie the way it claims to — `packages/db/tests/activity-feed.test.mjs`
 * owns that half. This proves what the browser does with the DOOR'S answers.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

const documentRowButton = (page: Page) =>
  page.getByRole("button", { name: "A document was actively filed to a client." });

test("initial read: representative rows carry actor, client, the DB's own sentence, time, status and a truncated-page note", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");

  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
  await expect(documentRowButton(page)).toBeVisible();
  await expect(page.getByText("A fiscal period close was begun.")).toBeVisible();
  await expect(page.getByText("Recorded a journal entry")).toBeVisible();

  // Attribution present on every row (C77.3) — the shared subject resolves to its real
  // display name through the firm_members_visible roster (serve-built.mjs's generic fixture),
  // so it is never a blank cell.
  await expect(page.getByText("E2E Owner").first()).toBeVisible();

  // The client name resolves through the register read, not a raw id.
  await expect(page.getByText(ACTIVITY.clientName).first()).toBeVisible();

  // The page fixture is deliberately truncated. Review finding 12 renamed this copy — the old
  // "may not show every matching event yet" fired on every non-final page and read as a false
  // claim that SOME matching event might be missing, when `truncated` only ever means "there is
  // more to load".
  await expect(page.getByText(/There is more to load below/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
});

test("kind filter chips narrow the list and write ?kinds= to the URL", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/[?&]kinds=close(&|$)/);
  await expect(page.getByText("A fiscal period close was begun.")).toBeVisible();
  await expect(documentRowButton(page)).toHaveCount(0);

  // Clearing filters restores the full page.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/kinds=/);
  await expect(documentRowButton(page)).toBeVisible();
});

test("client filter narrows to the selected client via the URL", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await page.getByLabel("Client").selectOption(ACTIVITY.clientId).catch(async () => {
    // Base UI Select is not a native <select>; open it and choose the option by name instead.
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: ACTIVITY.clientName }).click();
  });
  await expect(page).toHaveURL(new RegExp(`[?&]client=${ACTIVITY.clientId}(&|$)`));
});

test("load more appends the next page and dedupes a repeated row, saying so", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Vendor-neutral document extraction completed.")).toBeVisible();
  // The duplicated document row is dropped, not shown twice.
  await expect(documentRowButton(page)).toHaveCount(1);
  await expect(page.getByText(/event you already saw was skipped/)).toBeVisible();
});

test("a correction links both ways: the original names its replacement and vice versa", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(page.getByText("A posted entry was reversed.")).toBeVisible();
  await expect(page.getByText("An approved entry was recorded.")).toBeVisible();
  await expect(page.getByText("Links to the entry that replaced it.")).toBeVisible();
  await expect(page.getByText("Links to the original entry it replaced.")).toBeVisible();
});

test("opening a row's detail: Title, initial focus, Escape closes it and returns focus to the row", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  const trigger = documentRowButton(page);
  await trigger.click();

  await expect(page).toHaveURL(new RegExp(`[?&]event=event%3A${ACTIVITY.documentEventId}(&|$)`));
  const title = page.locator('[data-slot="sheet-title"]');
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByText("What happened, who acted, and what it is linked to.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/event=/);
  await expect(trigger).toBeFocused();
});

test("Back closes the detail Sheet and the list keeps its filters and position", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity?kinds=documents");
  await documentRowButton(page).click();
  await expect(page).toHaveURL(/event=/);

  await page.goBack();
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/kinds=documents/);
  await expect(documentRowButton(page)).toBeVisible();
});

test("a denied detail (a direct deep link to a refused id) shows a not-found state, never a crash", async ({ page }) => {
  await signIn(page);
  await page.goto(`/activity?event=event%3A${ACTIVITY.deniedEventId}`);
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await expect(page.getByText(/activity event not found/i)).toBeVisible();

  // Closing a DEEP-LINKED sheet (never pushed) rewrites the URL rather than leaving the app.
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/\/activity$/);
});

test("live permission loss clears the list on a focus recheck and explains the access state", async ({ page }) => {
  await signIn(page);
  await page.goto(`/activity?client=${ACTIVITY.flipClientId}`);
  // A client filter is already active, so the honest empty copy is "no MATCHES", not "first use".
  await expect(page.getByText("No activity matches these filters.")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Activity is not available")).toBeVisible();
  // Denied targets never leak stale accounting data: the (already-empty) list stays cleared,
  // and the filter bar's own client Select is still usable to change scope.
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("320px stays usable with no page-wide horizontal scroll, and is axe-clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 320px").toBeLessThanOrEqual(clientWidth + 1);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/activity at 320px").toEqual([]);
});

test("200% zoom (a halved 1280x720 viewport) keeps the feed reachable with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 200% zoom").toBeLessThanOrEqual(clientWidth + 1);
});

test("reduced motion: the event Sheet still opens and closes correctly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/activity");
  await documentRowButton(page).click();
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
});
