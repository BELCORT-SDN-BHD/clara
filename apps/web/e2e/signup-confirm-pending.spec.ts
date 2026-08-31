import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const APP_ORIGIN = "https://127.0.0.1:3100";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

test("signup -> explicit email confirmation -> holding page", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expectAccessible(page, "signup account");

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expectAccessible(page, "check email");

  const confirmResponse = await page.goto("/auth/confirm?token_hash=e2e-token-hash&type=email");
  expect(confirmResponse?.headers()["referrer-policy"]).toBe("strict-origin");
  await expect(page.getByRole("button", { name: "Confirm my email" })).toBeVisible();
  await expectAccessible(page, "confirmation");

  const confirmationPost = page.waitForRequest((request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/auth/confirm/verify",
  );
  await page.getByRole("button", { name: "Confirm my email" }).click();
  const posted = await confirmationPost;
  expect(posted.headers().origin).toBe(APP_ORIGIN);

  await expect(page).toHaveURL(`${APP_ORIGIN}/signup`);
  await expect(page.getByRole("heading", { name: "Tell us about your firm" })).toBeVisible();
  await expectAccessible(page, "firm registration");

  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Firm name").fill("E2E Accounting");
  await page.getByLabel("Anything we should know (optional)").fill("Playwright built-app walk");
  await page.getByRole("button", { name: "Register my firm" }).click();

  await expect(page).toHaveURL(`${APP_ORIGIN}/pending`);
  await expect(page.getByRole("heading", { name: "Your registration is with us" })).toBeVisible();
  await expect(page.getByText("E2E Accounting", { exact: true })).toBeVisible();
  await expectAccessible(page, "holding page");

  console.log(`CONFIRMATION POST ORIGIN: ${posted.headers().origin}`);
  console.log("E2E WALK: signup -> /auth/confirm click -> /signup firm step -> /pending");
  console.log("AXE: 5 journey faces scanned, 0 WCAG 2.1 A/AA violations");
});
