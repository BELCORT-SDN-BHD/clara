import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";

const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THREAD_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

test("client A to B clears the draft, never paints A under B, and chooses the caller's own thread", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.getByText("Client: Rome Properties")).toBeVisible();
  await expect(page.getByText("Own message for client A")).toBeVisible();
  await expect(page.getByText("Colleague message must not auto-open")).toHaveCount(0);

  const composer = page.getByLabel("Ask Clara");
  await composer.fill("draft belonging only to client A");

  const fullScreen = page.getByRole("link", { name: "Open full screen" });
  await fullScreen.focus();
  await expect(fullScreen).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Collapse Clara" })).toBeFocused();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByRole("link", { name: "Bee Creative Solution" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}$`));
  await expect(page.getByText("Client: Bee Creative Solution")).toBeVisible();
  await expect(page.getByLabel("Ask Clara")).toHaveValue("");
  await expect(page.getByText("Own message for client A")).toHaveCount(0);
  await expect(page.getByText("Own message for client B")).toBeVisible();
});

test("the docked rail owns width in the shell row and never covers the workbench", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.locator("[data-clara-rail]")).toBeVisible();

  const openWorkbench = await page.locator("[data-firm-workbench]").boundingBox();
  const rail = await page.locator("[data-clara-rail]").boundingBox();
  expect(openWorkbench).not.toBeNull();
  expect(rail).not.toBeNull();
  expect((openWorkbench?.x ?? 0) + (openWorkbench?.width ?? 0)).toBeLessThanOrEqual((rail?.x ?? 0) + 1);
  await expect.poll(async () => page.locator("[data-clara-rail]").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.right - document.documentElement.clientWidth;
  })).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Collapse Clara" }).click();
  await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  const closedWorkbench = await page.locator("[data-firm-workbench]").boundingBox();
  expect(closedWorkbench).not.toBeNull();
  const recoveredWidth = (closedWorkbench?.width ?? 0) - (openWorkbench?.width ?? 0);
  expect(recoveredWidth).toBeGreaterThanOrEqual(318);
  expect(recoveredWidth).toBeLessThanOrEqual(322);

  await page.getByRole("button", { name: "Open Clara" }).click();
  await expect(page.locator("[data-clara-rail]")).toBeVisible();
});

test("a client/thread mismatch is indistinguishable from not found", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT_A}`);
  const response = await page.goto(`/clients/${CLIENT_B}/clara/${THREAD_A}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible();
});

test("password recovery keyboard, refusal, success, callback, and password-policy paths work in the built app", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (route) => route.fulfill({
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({ message: "Email rate limit exceeded" }),
  }));
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expectAccessible(page, "password recovery request");

  // Same fresh-page focus-grant race entry-faces-walk.spec.ts's keyboard-pass
  // cells close (PR #510) -- anchor on it rather than relying on the axe scan
  // above to have incidentally spent enough time for the race to have closed.
  await ensureRealFocus(page);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeFocused();

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Email rate limit exceeded")).toBeVisible();

  await page.unroute("**/auth/v1/recover**");
  await page.reload();
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto("/auth/recover?code=e2e-recovery-code");
  await expect(page).toHaveURL(/\/auth\/recover\/password$/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password").fill("compromised-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Password is known to be compromised")).toBeVisible();

  await page.getByLabel("New password").fill("A-valid-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await expectAccessible(page, "password-updated confirmation");
});

test("the reset face refuses a sessionless arrival with the typed invalid-link state", async ({ page }) => {
  // F2 of the independent review of #507, measured on the built app in a fresh
  // context — no recovery cookie exists, which is exactly the bookmarked-URL and
  // expired-session shape. This is the cell that executes the PAGE's own fork;
  // the unit cells drive the extracted route function.
  await page.goto("/auth/recover/password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByText("That reset link is invalid or has expired. Request a new one.")).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save new password" })).toHaveCount(0);
  // The raw provider string the review measured here before the fold.
  await expect(page.getByText("Auth session missing!")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expectAccessible(page, "sessionless password reset");
});

test("a thrown entry page renders the route error boundary with a safe digest", async ({ page }) => {
  const response = await page.goto("/forgot-password?status=trigger-error");
  expect(response?.status()).toBe(500);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText(/Support code:/)).toBeVisible();
  await expect(page.getByText(/intentional e2e route-boundary probe/)).toHaveCount(0);
});
