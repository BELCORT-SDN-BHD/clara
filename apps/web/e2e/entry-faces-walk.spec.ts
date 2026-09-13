import { expect, test } from "@playwright/test";

import { ensureRealFocus } from "./helpers";

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
 * e-sign moved to a later step, and #621 replaced it with the two-agreement
 * `components/entry/signup-legal-stage.tsx`) and the confirm face
 * is now a six-digit code form, never a link — the cells below are trued to
 * both, and W-H's own e2e leg (the address never comes from a URL) is added
 * here since it is pure GET rendering, in scope for this file.
 *
 * SCOPE, DELIBERATELY: pre-auth rendering, client-side validation, and
 * routing/refusal faces only. The signup SUBMISSION arm (mail -> confirm ->
 * /signup) is excluded — that is `signup-confirm-pending.spec.ts`'s walk.
 *
 * #622 ONE NAMED EXCEPTION: a real sign-in submission, because the thing
 * under test — the auth wall's `?next=` round trip (#698) — can only be
 * observed by actually crossing the unauthenticated -> authenticated
 * boundary. `firm-navigation-walk.spec.ts` owns the broader authenticated
 * surface; this file's own `signIn` below is a one-shot walk, not a new
 * pattern this file otherwise adopts.
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
  // `exact: true` since P6-6's copy pass: the face now says the product name
  // twice — once as the lockup's wordmark and once inside "Sign in to your
  // ClaraBook account." — and a substring match resolves to both. The wordmark
  // is the one this cell is about.
  await expect(page.getByText("ClaraBook", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("login keyboard pass: tab order is Email -> Password -> Sign in, with a visible focus indicator", async ({ page }) => {
  await page.goto("/login");
  // A freshly navigated page is not guaranteed OS-level window focus yet; an
  // unfocused page silently drops the first keyboard event rather than
  // erroring, which reads as a wrong tab order instead of what it really is.
  // `ensureRealFocus` (./helpers.ts) anchors on the browser's own
  // `document.hasFocus()` -- a positive precondition, not a sleep -- see that
  // file's header for the measured race this closes (PR #510: 6/10 base-side
  // failures, all at this exact FIRST Tab, all "Received: inactive").
  await ensureRealFocus(page);

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

// #698, folded into #622 — the auth wall used to drop the query string from
// `?next=`: `lib/supabase/proxy.ts`'s unauthenticated redirect wrote `next`
// from `request.nextUrl.pathname` ALONE, so a signed-out saved-view link
// landed on the BARE destination after sign-in. `tests/
// proxy-recover-next-query.test.ts` pins the redirect's own `Location`
// header at the unit level; this is the round trip a unit test cannot
// see — a real sign-in submission, through the real proxy redirect, back
// through `login-form.tsx`'s `resolveSameOriginPath` read.
test("sign in from a `next=` with a query string lands on that exact destination, with its saved view selected (#698)", async ({ page }) => {
  await page.goto("/login?next=%2Fwork%3Fview%3Dneeds-you");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();

  // THE EXACT DESTINATION — proving the round trip, not merely "somewhere
  // under /work".
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);
  // AND the saved view is genuinely SELECTED, not a coincidence of the URL:
  // `components/common/nav-pills.tsx`'s own `aria-current="page"` is the real
  // selection signal a set of LINKS owes (its header explains why this is
  // `aria-current`, not `aria-selected` — these navigate, they do not swap a
  // panel in place), and `WorkViews`'s "Needs you" heading is the view's own
  // — neither renders for the default `/work` list.
  await expect(page.getByRole("link", { name: "Needs you" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Needs you", level: 2 })).toBeVisible();
});

// #622 review round — the validated same-origin return target used to
// survive the DIRECT sign-in path (the cell above) but was DROPPED through
// the recovery path entirely: the "Forgot password?" link carried no `next`
// at all, so a person blocked at `/work?view=needs-you` landed on Home after
// resetting. `app/(entry)/auth/recover/next-cookie.ts`'s own header carries
// the full journey (a cookie planted on `/forgot-password?next=`, read and
// cleared by `handler.ts` on a successful code exchange, forwarded as this
// app's OWN `?next=` — never the Supabase-facing `redirectTo`).
//
// "CLICKING THE LINK IN THE EMAIL" IS SIMULATED, not mocked away: this test
// never intercepts the recovery cookie or the code exchange. It plants the
// SAME cookie a real "Forgot password?" click would (step 1-2), then
// navigates the SAME browser context straight to `/auth/recover?code=…` —
// exactly what the browser does the instant a person clicks the link in
// their inbox, mail client rendering aside. The mock auth server
// (`e2e/serve-built.mjs`) accepts ANY `grant_type=pkce` exchange
// unconditionally (it does not validate a PKCE code_verifier), which is
// what makes a fabricated `code` value sufficient here — the THING under
// test is this app's OWN cookie-to-query-string relay, not GoTrue's code
// validity, which is out of this repo's control to fake convincingly anyway.
test("recovery preserves the return target end to end: forgot password -> reset -> lands on next (#622)", async ({ page }) => {
  await page.goto("/login?next=%2Fwork%3Fview%3Dneeds-you");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?next=%2Fwork%3Fview%3Dneeds-you$/);

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // The cookie planted on the `/forgot-password?next=` visit above is still
  // in THIS browser context — the same one a real inbox click would carry.
  await page.goto("/auth/recover?code=e2e-fake-recovery-code");
  await expect(page).toHaveURL(/\/auth\/recover\/password\?next=%2Fwork%3Fview%3Dneeds-you$/);

  await page.getByLabel("New password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

  await page.getByRole("link", { name: "Continue to ClaraBook" }).click();
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);
  await expect(page.getByRole("link", { name: "Needs you" })).toHaveAttribute("aria-current", "page");
});

test("the signup face renders on the identity canvas with Create account open — no DPA gate on this step", async ({ page }) => {
  // FS-4 C-6: the DPA e-sign moved OFF this step (checkout-gate-design.md
  // §1.1) to a later one reached once a registration is open — #621's
  // two-agreement legal stage (`components/entry/signup-legal-stage.tsx`);
  // the account step gates on ordinary field validation only.
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
  // Same OS-focus caveat as the login keyboard pass above -- same helper.
  await ensureRealFocus(page);

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
