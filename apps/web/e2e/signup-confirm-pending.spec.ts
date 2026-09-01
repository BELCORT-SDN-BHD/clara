import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const APP_ORIGIN = "https://127.0.0.1:3100";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * FS-4 C-6 (裁-92) rewrote this spec's own subject: `/auth/confirm` is now a
 * six-digit CODE form, never a link, and confirming it goes through the
 * C1/C2 attempt wall BEFORE `verifyOtp` (checkout-gate-design.md §3.4/§3.6).
 * That wall is a Lane-B seam on this tip
 * (`app/(entry)/auth/confirm/verify/confirmation-wall.ts`) — its production
 * default HONESTLY refuses every attempt as `"unavailable"` rather than
 * letting one through unchecked, which means a real code can never be
 * verified end to end until a later train wires the runtime call.
 *
 * THE ARM THIS FILE GATES: everything from "submit the code" onward
 * (verifyOtp succeeding, the firm step, the DPA step, landing on /pending)
 * genuinely cannot pass today — not because the test is wrong, but because
 * the mechanism it drives is honestly not wired. Per this train's own
 * Lane A/B split, that arm is written as a SKELETON and SKIPPED until Lane B
 * lands the real wall, rather than either (a) deleting the coverage, which
 * would leave the completed feature unwalked, or (b) faking a pass by
 * stubbing the wall INSIDE this e2e (an e2e drives the BUILT app's real
 * code — stubbing it here would prove nothing about production).
 *
 * `CLARA_E2E_CONFIRM_WALL_WIRED=1` flips the gate once Lane B's runtime call
 * replaces the seam's `"unavailable"` default. No other change to this file
 * should be needed at that point.
 */
const CONFIRM_WALL_WIRED = process.env.CLARA_E2E_CONFIRM_WALL_WIRED === "1";

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

test("signup account step -> check-your-email, with the confirm code form reachable and honest", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expectAccessible(page, "signup account");

  const email = `owner-${Date.now()}@example.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expectAccessible(page, "check email");

  // The GET is paint-only regardless of the wall's own wiring: rendering the
  // code form, and W-H's own address wall, are pure client/paint concerns
  // that this Lane-A train DOES ship in full.
  await page.goto("/auth/confirm");
  await expect(page.getByRole("heading", { name: "Enter your confirmation code" })).toBeVisible();
  await expectAccessible(page, "confirmation code form");

  // W-H, in a real browser: this tab's OWN remembered address prefills —
  // never a value from a URL. sessionStorage is per-origin/per-tab, so the
  // prefill here is exactly what signup-email-storage.ts wrote a moment ago,
  // never a caller-supplied one.
  await expect(page.getByLabel("Email")).toHaveValue(email);

  // The address wall's refuse limb (part 1 §3.3 / cell W-H, part 3 §6 item 1):
  // a query-string email must not override the remembered one, and a fresh
  // load with no signup state must render blank, never a URL-sourced value.
  await page.goto(`/auth/confirm?email=${encodeURIComponent("victim@example.test")}&token=999999`);
  await expect(page.getByRole("heading", { name: "Enter your confirmation code" })).toBeVisible();
  await expect(page.getByLabel("Email")).not.toHaveValue("victim@example.test");

  console.log(`E2E WALK (Lane A scope): signup -> check-your-email -> confirm code form, W-H honoured`);
});

test("submitting an attempt while the wall is unwired renders the honest not-available card, never a fake success", async ({ page }) => {
  await page.goto("/auth/confirm");
  await page.getByLabel("Email").fill("aisyah@example.test");
  await page.getByLabel("Six-digit code").fill("123456");

  const confirmationPost = page.waitForRequest((request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/auth/confirm/verify",
  );
  await page.getByRole("button", { name: "Confirm my email" }).click();
  const posted = await confirmationPost;
  expect(posted.headers().origin).toBe(APP_ORIGIN);

  if (CONFIRM_WALL_WIRED) {
    test.skip(true, "the wall is wired; the SKELETON below covers this arm instead");
  }
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/confirm?status=unavailable`);
  await expect(page.getByText(/isn't available yet/i)).toBeVisible();
  await expectAccessible(page, "confirmation unavailable");
});

test.skip(
  !CONFIRM_WALL_WIRED,
  "SKELETON — the C1/C2 attempt wall (Lane B) is not wired on this tip; " +
  "set CLARA_E2E_CONFIRM_WALL_WIRED=1 once the runtime call replaces the seam's default",
);
test("SKELETON: signup -> confirm by code, in a SECOND browser context -> firm step -> DPA step -> /pending", async ({ browser }) => {
  // The cross-device journey 裁-92 bought (design §3.2): the code is read
  // "on a phone" and typed into a FRESH context, alongside the person's own
  // address — never the same browser the link flow required.
  const signupContext = await browser.newContext();
  const signupPage = await signupContext.newPage();
  const email = `e2e-${Date.now()}@example.test`;

  await signupPage.goto("/signup");
  await signupPage.getByLabel("Email").fill(email);
  await signupPage.getByLabel("Password").fill("Clara-e2e-password-1!");
  await signupPage.getByRole("button", { name: "Create account" }).click();
  await expect(signupPage.getByRole("heading", { name: "Confirm your email" })).toBeVisible();

  const confirmContext = await browser.newContext();
  const confirmPage = await confirmContext.newPage();
  await confirmPage.goto("/auth/confirm");
  await confirmPage.getByLabel("Email").fill(email);
  // A real Wave-G run reads the code from the test mailbox fixture; against
  // THIS harness's mock (serve-built.mjs) the fixed E2E_SIGNUP_CODE stands
  // in for "the code that was delivered".
  await confirmPage.getByLabel("Six-digit code").fill("654321" /* serve-built.mjs's E2E_SIGNUP_CODE */);
  await confirmPage.getByRole("button", { name: "Confirm my email" }).click();

  await expect(confirmPage).toHaveURL(`${APP_ORIGIN}/signup`);
  await expect(confirmPage.getByRole("heading", { name: "Tell us about your firm" })).toBeVisible();

  await confirmPage.getByLabel("Your name").fill("E2E Owner");
  await confirmPage.getByLabel("Firm name").fill("E2E Accounting");
  await confirmPage.getByRole("button", { name: "Register my firm" }).click();

  await expect(confirmPage).toHaveURL(`${APP_ORIGIN}/pending`);
  await expect(confirmPage.getByRole("heading", { name: "Your registration is with us" })).toBeVisible();

  await confirmPage.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(confirmPage.getByRole("heading", { name: "One more thing before checkout" })).toBeVisible();

  await signupContext.close();
  await confirmContext.close();
});
