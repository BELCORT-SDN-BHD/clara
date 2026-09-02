import { expect, test } from "@playwright/test";

/**
 * FS-2's 裁-86 e2e leg for #461 — the entry group's pre-auth faces, walked in
 * a real browser against the built app. This spec encodes the walk an
 * orchestrator ran manually via the session's Playwright MCP tools on
 * 2026-08-31 (login, signup, an incomplete invite link, an unknown route, the
 * holding page's anonymous-visitor redirect, and a keyboard-only pass over
 * both forms) — see README.md in this directory for why the CI leg itself
 * lands at FS-12, not here.
 *
 * FS-4 C-6 (裁-92) UPDATE: the account step's DPA checkbox is gone (the real
 * e-sign moved to a later step, `signup-dpa-form.tsx`) and the confirm face
 * is now a six-digit code form, never a link — the cells below are trued to
 * both, and W-H's own e2e leg (the address never comes from a URL) is added
 * here since it is pure GET rendering, in scope for this file.
 *
 * SCOPE, DELIBERATELY: pre-auth rendering, client-side validation, and
 * routing/refusal faces only. The signup SUBMISSION arm (mail -> confirm ->
 * /signup) is excluded — that is `signup-confirm-pending.spec.ts`'s walk.
 */

/**
 * KNOWN RACE, NEVER A FALSE RED: Playwright delivers a page's `console` events
 * asynchronously over CDP, so a message logged just before a test's final
 * `await` can arrive AFTER that `await` resolves — the `errors` array this
 * returns may still be empty when a test's last assertion reads it, even
 * though the browser genuinely logged something a moment earlier. That
 * direction is safe: it can only make a real error UNDER-REPORTED, never
 * invent one, so no assertion below can red on a message that never
 * happened. It CANNOT be trusted to prove a face is clean by absence alone
 * without the positive control below, which proves the collector fires at
 * all rather than that every face happened to stay quiet.
 */
function collectConsoleErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // A missing favicon is a static-asset 404 every one of these faces will
    // hit in this harness; it is not evidence about the app's own code.
    if (msg.type() === "error" && !msg.text().includes("favicon.ico")) {
      errors.push(msg.text());
    }
  });
  return errors;
}

test("POSITIVE CONTROL: the console-error collector actually observes an error when one fires", async ({ page }) => {
  // Review law 2: an `errors` array reading `[]` on every other test in this
  // file is not evidence the collector works -- it is equally what a broken,
  // never-firing listener would produce. This proves the instrument itself
  // catches a REAL console.error, on a throwaway page, waited for
  // deterministically rather than raced against the async-delivery note above.
  const errors = collectConsoleErrors(page);
  await page.goto("/login");
  const sawIt = page.waitForEvent(
    "console",
    (msg) => msg.type() === "error" && msg.text().includes("FS-2-POSITIVE-CONTROL"),
  );
  await page.evaluate(() => console.error("FS-2-POSITIVE-CONTROL: proving the collector fires"));
  await sawIt;
  expect(errors).toContain("FS-2-POSITIVE-CONTROL: proving the collector fires");
});

test("POSITIVE CONTROL: a valid signup submission actually reaches the mock auth endpoint", async ({ page }) => {
  // The refusal tests below only prove `signupCalls === 0` -- which a route
  // glob that never matched ANYTHING would also produce. This proves the
  // glob can fire at all: a genuinely valid submission must count as exactly
  // one call, not zero.
  let signupCalls = 0;
  await page.route("**/auth/v1/signup**", (route) => {
    signupCalls += 1;
    return route.continue();
  });

  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-positive-control-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  expect(signupCalls).toBe(1);
});

test("the login face renders on the identity canvas with no console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("main.bg-identity-canvas")).toBeVisible();
  await expect(page.getByText("ClaraBook")).toBeVisible();
  expect(errors).toEqual([]);
});

test("login keyboard pass: tab order is Email -> Password -> Sign in, with a visible focus indicator", async ({ page }) => {
  await page.goto("/login");
  // A freshly navigated page is not guaranteed OS-level window focus yet; an
  // unfocused page silently drops the first keyboard event rather than
  // erroring, which reads as a wrong tab order instead of what it really is.
  // `bringToFront()` only activates the CDP TARGET -- its promise can resolve
  // before the renderer has actually been GRANTED input focus, so a Tab
  // dispatched immediately after can lose the race and never move focus off
  // <body> at all (measured: 6/10 base-side failures, always at this exact
  // assertion, "Received: inactive" after the full 5s retry window -- not a
  // late focus, an ABSENT one, because a native Tab-driven focus move is a
  // one-shot browser action with nothing left to retry once it has already
  // fired against an unfocused document). The positive precondition below
  // anchors on the actual browser-reported focus state instead of a sleep.
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.keyboard.press("Tab");
  const signInButton = page.getByRole("button", { name: "Sign in" });
  await expect(signInButton).toBeFocused();

  // A discriminating check, not a cosmetic one: a focus indicator that was
  // silently removed (outline AND box-shadow both "none") would still pass
  // every assertion above.
  const hasVisibleFocus = await signInButton.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  expect(hasVisibleFocus).toBe(true);
});

test("the signup face renders on the identity canvas with Create account open — no DPA gate on this step", async ({ page }) => {
  // FS-4 C-6: the DPA e-sign moved OFF this step (checkout-gate-design.md
  // §1.1) to a later one reached once a registration is open
  // (`signup-dpa-form.tsx`); the account step gates on ordinary field
  // validation only.
  const errors = collectConsoleErrors(page);

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.locator("main.bg-identity-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("signup client-side validation refuses an empty submit and an invalid email before any network call", async ({ page }) => {
  let signupCalls = 0;
  await page.route("**/auth/v1/signup**", (route) => {
    signupCalls += 1;
    return route.abort();
  });

  await page.goto("/signup");
  const createButton = page.getByRole("button", { name: "Create account" });
  await expect(createButton).toBeEnabled();
  const emailField = page.getByLabel("Email");

  // Empty submit.
  await createButton.click();
  expect(await emailField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  expect(signupCalls).toBe(0);

  // Invalid email.
  await emailField.fill("not-an-email");
  await page.getByLabel("Password").fill("SomePassword1!");
  await createButton.click();
  expect(await emailField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  expect(signupCalls).toBe(0);
});

test("signup keyboard pass: tab order is Email -> Password -> Create account, Enter submits", async ({ page }) => {
  await page.goto("/signup");
  // Same OS-focus caveat as the login keyboard pass above.
  await page.bringToFront();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.keyboard.press("Tab");
  const createButton = page.getByRole("button", { name: "Create account" });
  await expect(createButton).toBeFocused();

  await page.keyboard.press("Enter");
  // Enter activated the button from the keyboard: the same native validation
  // must fire (the email field is still empty).
  const emailField = page.getByLabel("Email");
  expect(await emailField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
});

test("an incomplete invite link shows the typed refusal face, not a crash or a blank page", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto("/invite/this-is-a-garbage-token-12345");
  await expect(page.getByRole("heading", { name: "This invite link is incomplete" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  await expect(page.locator("main.bg-identity-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unknown route under a public prefix hits the registered not-found page", async ({ page }) => {
  const response = await page.goto("/signup/this-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible();
});

test("the holding page redirects an unauthenticated visitor to login with the return path preserved", async ({ page }) => {
  await page.goto("/pending");
  await expect(page).toHaveURL(/\/login\?next=%2Fpending/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the confirm face renders the six-digit code form (裁-92) and makes no auth call on GET", async ({ page }) => {
  // FS-4 C-6 / 裁-92 superseded this file's own "missing-token" link-flow
  // cell — there is no link and no token in the URL any more. The GET
  // renders a plain email+code form; only the explicit POST (FS-4's own e2e)
  // reaches `verifyOtp`.
  const errors = collectConsoleErrors(page);
  let verifyCalls = 0;
  await page.route("**/auth/v1/verify**", (route) => {
    verifyCalls += 1;
    return route.abort();
  });

  await page.goto("/auth/confirm");
  await expect(page.getByRole("heading", { name: "Enter your confirmation code" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  expect(verifyCalls).toBe(0);
  expect(errors).toEqual([]);
});

test("W-H: a query-string email is never accepted or pre-filled on the confirm face", async ({ page }) => {
  // checkout-gate-design.md §3.3 / cell W-H — the ONE caller-supplied value
  // this code flow still has is the address, and it must never come from a
  // URL. `page.tsx` never reads `email`/`token` from `searchParams` at all.
  await page.goto("/auth/confirm?email=victim@example.test&token=999999");
  await expect(page.getByRole("heading", { name: "Enter your confirmation code" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
});
