import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Reads the harness's own origin (interview-walk.spec.ts's precedent) instead of
// re-hardcoding the default. The literal made this file green ONLY on port 3100, and
// TWO trains hit it independently on the same day — chat parity's browser leg ran on
// 3110 because another lane held 3100, and P6-6's ran on 3140 for the same reason.
// Both saw the same thing: false reds about a same-origin wall that was working
// perfectly. Recorded together because one train fixing it looks like a local tidy-up;
// two trains fixing it the same way is the harness telling you the literal was wrong.
const APP_ORIGIN = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
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
 *
 * M1, fix round 2026-09-01 — THE SKIP-SCOPING BUG AND WHAT IT COST. An
 * earlier cut called `test.skip(!CONFIRM_WALL_WIRED, ...)` at FILE SCOPE,
 * between two tests. Playwright 1.62.1 treats a non-function first argument
 * at file scope as a STATIC ANNOTATION ON THE ENCLOSING SUITE — the whole
 * FILE, when there is no `test.describe()` — not on "whatever test follows
 * it" (verified empirically: unwired gave "3 skipped", not "2 passed, 1
 * skipped"). So EVERY test in this file was skipped, always, including the
 * two meant to run today, and `e2e/run.mjs` asserts no floor count, so
 * Playwright still exited 0. THE FIX: the gate now lives INSIDE the
 * skeleton's own test body (`test.skip(condition, reason)` called from
 * within an async test callback skips only that one test — the same idiom
 * the second test below already used correctly). Restored alongside it: the
 * referrer-policy header assertion (belongs in a RUNNABLE test — the GET
 * needs no wall) and, inside the skeleton, the firm-registration and
 * holding-page axe scans, the firm-name echo on /pending, and the optional
 * notes field — all five were on `main`'s original spec and silently
 * dropped by the rewrite (a diff read alone would have shown them "moved to
 * the skeleton"; they were not there either).
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

  // H-35 — THE CARD IS HONEST ABOUT THE RESEND. The build refuses every
  // resend (`lib/registration/confirmation-resend.ts`'s production default),
  // so the card may say so and may NOT tell the person to ask for one.
  await expect(page.getByText(/can't resend one from here/i)).toBeVisible();
  await expect(page.getByText(/request a new (one|code)/i)).toHaveCount(0);

  // H-35 — AND THE PERSON CAN ACTUALLY REACH THE CODE FORM. Before this the
  // card had no route to /auth/confirm at all and the mail carries no link
  // (裁-92), so the only way there was typing the URL. This is the arm the
  // `page.goto()` below can never prove: a goto establishes that the page
  // renders, never that anybody can get to it.
  const enterCode = page.getByRole("link", { name: "Enter my code" });
  await expect(enterCode).toBeVisible();
  await enterCode.click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/confirm`);
  await expect(page.getByRole("heading", { name: "Enter your confirmation code" })).toBeVisible();
  // The address travelled with them — the person types six digits, nothing
  // more. `rememberSignupEmail` wrote it on the previous screen and the code
  // form reads it from THIS BROWSER's sessionStorage (the W-H wall), so the
  // control needs no query parameter and carries none.
  await expect(page.getByLabel("Email")).toHaveValue(email);
  expect(new URL(page.url()).search).toBe("");

  // A `<Link>` click is a CLIENT-SIDE navigation in the App Router: it fetches
  // an RSC payload, not a document, so the middleware response headers below
  // cannot be read off it (measured — `waitForResponse` on a document response
  // times out at 30 s). The reachability proof is the click above; the header
  // proof needs a real document GET, which is this one. Two instruments, two
  // properties, neither standing in for the other.
  const confirmResponse = await page.goto("/auth/confirm");
  expect(confirmResponse?.headers()["referrer-policy"]).toBe("strict-origin");
  // F3 (fresh opus review, 2026-09-01) — FOLD 2's DELIVERY pin. The unit
  // test only proves `confirmCacheHeadersForPath` RETURNS the right pair;
  // this is the instrument that proves it is actually WIRED into a real
  // response, the same way this file already pins referrer-policy off a
  // real `/auth/confirm` GET rather than a unit-level function call.
  expect(confirmResponse?.headers()["cache-control"]).toBe("private, no-store");
  // PR #499 round 2 (2026-09-02) — CONFIRMED, not hypothetical: Next
  // 16.3.3's App Router REPLACES `Vary` for this dynamic route with its
  // own RSC content-negotiation tokens rather than merging with whatever
  // `lib/supabase/proxy.ts`'s middleware appended (documented Next
  // behaviour, `node_modules/next/dist/docs/01-app/02-guides/
  // cdn-caching.md` — "Next.js sets a Vary header on responses to signal
  // this to CDNs"). Proven two ways: this e2e AND a bare `curl` against
  // the built app with no browser involved at all, both returning
  // `vary: rsc, next-router-state-tree, next-router-prefetch,
  // next-router-segment-prefetch, Accept-Encoding` — "Cookie" absent, not
  // merely diluted. Two follow-up fix attempts also lost to the same
  // clobbering: `next.config.ts`'s `headers()` (framework-level, still
  // overwritten) and there is no route-segment-level header hook for a
  // plain Server Component page in the App Router (only Route Handlers
  // can set response headers) — converting this page to one is a real
  // architecture change, out of scope for this close-out round.
  //
  // `Vary: Cookie` was DEFENSE IN DEPTH, never the primary control — the
  // primary control is `Cache-Control: private, no-store` above, which
  // Next does NOT clobber and which alone is sufficient to forbid a
  // shared cache from storing this response at all. This is not a
  // regression: `Vary: Cookie` never reached a real client before someone
  // finally pointed a real browser (and a bare curl) at a real response.
  //
  // This assertion now deliberately pins the CURRENT (undesired) reality
  // rather than the desired one, so it acts as an early-warning trip
  // wire: if a future Next version stops overwriting `Vary` and "Cookie"
  // starts surviving again, THIS LINE GOES RED — that is the signal to
  // come back and tighten it to `toContain`, not a false alarm to
  // silence by reverting it. `lib/supabase/proxy.ts` keeps `append`
  // regardless (never `set`) — it costs nothing today and is exactly
  // right the moment Next stops clobbering it.
  expect(confirmResponse?.headers()["vary"]).not.toContain("Cookie");
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

  console.log("E2E WALK (Lane A scope): signup -> check-your-email -> confirm code form (referrer-policy + W-H honoured)");
  console.log("AXE: 3 journey faces scanned, 0 WCAG 2.1 A/AA violations");
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
  // N1, fix round 2026-09-01 (裁-109): the URL no longer names the outcome —
  // only a bare, non-authoritative `flash` marker; the real answer lives in
  // an httpOnly cookie this test cannot (and need not) inspect directly.
  // The visible-text assertion below is the real behavioural proof.
  await expect(page).toHaveURL(new RegExp(`^${APP_ORIGIN}/auth/confirm\\?flash=`));
  await expect(page.getByText(/isn't available yet/i)).toBeVisible();
  await expectAccessible(page, "confirmation unavailable");
});

test("SKELETON: signup -> confirm by code, in a SECOND browser context -> firm step -> DPA step -> /pending", async ({ browser }) => {
  // M1: the skip is IN-BODY, scoped to only this test — never file-scope.
  test.skip(
    !CONFIRM_WALL_WIRED,
    "the C1/C2 attempt wall (Lane B) is not wired on this tip; set " +
    "CLARA_E2E_CONFIRM_WALL_WIRED=1 once the runtime call replaces the seam's default",
  );

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
  await expectAccessible(confirmPage, "firm registration");

  await confirmPage.getByLabel("Your name").fill("E2E Owner");
  await confirmPage.getByLabel("Firm name").fill("E2E Accounting");
  await confirmPage.getByLabel("Anything we should know (optional)").fill("Playwright built-app walk");
  await confirmPage.getByRole("button", { name: "Register my firm" }).click();

  await expect(confirmPage).toHaveURL(`${APP_ORIGIN}/pending`);
  await expect(confirmPage.getByRole("heading", { name: "Your registration is with us" })).toBeVisible();
  // The DB's own firm_name reaching the holding card verbatim — not merely
  // that SOME registration exists.
  await expect(confirmPage.getByText("E2E Accounting", { exact: true })).toBeVisible();
  await expectAccessible(confirmPage, "holding page");

  await confirmPage.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(confirmPage.getByRole("heading", { name: "One more thing before checkout" })).toBeVisible();

  console.log("AXE (SKELETON): 2 further journey faces scanned, 0 WCAG 2.1 A/AA violations");

  await signupContext.close();
  await confirmContext.close();
});
