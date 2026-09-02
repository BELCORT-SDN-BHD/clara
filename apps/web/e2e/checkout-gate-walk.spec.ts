import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const APP_ORIGIN = "https://127.0.0.1:3100";
const CONTROL = `${APP_ORIGIN}/e2e-supabase/e2e-control`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CODE = "654321";

/**
 * Every URL assertion in this file waits on a REAL full-page navigation that a
 * form POST has to complete first — a route handler, a door call over the mock
 * transport, a 303, and the next render. Playwright's default `expect` timeout
 * is 5 s, and on 2026-09-02 the whole-journey walk lost that race ONCE on this
 * host (the firm-registration submit; the page was still on `/signup` with an
 * EMPTY live region, so nothing had refused — the round trip simply had not
 * landed). The same spec then passed 5/5 twice in isolation and again in a full
 * ordered run, which is the signature of a load-dependent instrument rather
 * than a defect in the app.
 *
 * This raises the WAIT, never the bar: each assertion still demands the exact
 * URL, so a route that refuses, redirects elsewhere, or never navigates still
 * fails. Scoped to this file deliberately — a global `expect.timeout` would
 * slow every other spec's genuine failures down with it.
 */
const NAV = { timeout: 20_000 };

/**
 * FS-4 C-6 Lane B — 裁-86's MANDATORY BROWSER LEG for the paid-firm gate,
 * walked against the BUILT app in real Chromium.
 *
 * WHAT IS REAL HERE. Every line of `apps/web` the journey touches: the confirm
 * verify POST and its one runtime call, the DPA step's client door call, the
 * `POST /checkout` route handler with its same-origin wall and its trusted-IP
 * courier, the paint-only success page, the claim POST, and every flash cookie
 * and card.
 *
 * THE TRUSTED HEADER IS ONE NOTHING ELSE FILLS IN, and that is deliberate.
 * The harness first named `x-forwarded-for`, which Next 16.3.3 synthesizes from
 * the socket (`base-server.js`, `??=`) — so the header was always present, the
 * walk's digest came from a value the framework supplied, and the fail-closed
 * arm could never be reached. It now names `x-clara-e2e-client-ip`, set by the
 * browser context in `playwright.config.ts`, so a spec that drops it actually
 * reaches the refusal (see the FAIL CLOSED test below).
 *
 * WHAT IS STOOD IN FOR, and it is named rather than implied: the C-3/C-6
 * doors and C-5's confirm endpoint — see `fs4-checkout-mock.mjs`'s header. The
 * doors' OWN refusals are celled against a real Postgres in
 * `packages/db/tests/checkout-gate-c6.test.mjs`; this walk proves the app, not
 * the database.
 *
 * WHAT IS NOT WALKED AT ALL, AND WHY — stated precisely, because this is the
 * one place a green run could be read as more than it measured.
 *
 * The Stripe HTTP call is not made. It happens SERVER-side, so `page.route`
 * cannot intercept it, and `lib/checkout/stripe-session.ts` deliberately
 * carries no base override: an earlier cut had one, fenced behind the estate's
 * dev/loopback carve-out, and `next start` sets `NODE_ENV=production`, so the
 * fence correctly ignored it. Loosening the fence to make a test pass is what
 * hard constraint 14 forbids, so the override was removed rather than relaxed.
 * `STRIPE_SECRET_KEY` is then left unset in the harness on purpose (`run.mjs`
 * says why), which means the Stripe seam refuses `unconfigured` BEFORE any
 * network call.
 *
 * SO WHAT THIS WALK ACTUALLY PROVES ABOUT ⑤: `POST /checkout` runs for real
 * through its same-origin wall, its session resolution, its own registration
 * read, the trusted-IP courier's digest, `open_checkout_intent`,
 * `get_current_checkout_plan` and the plan comparison — and then, when the
 * Stripe seam refuses, it renders the design's typed card and leaves the
 * one-shot intent UNSTAMPED so the retry the card invites is safe. What it
 * does NOT prove is the Stripe request's own shape; that is pinned field by
 * field in `lib/checkout/stripe-session.test.ts` against the shipped body.
 * The return leg (⑧, ⑨) IS walked for real from `/checkout/success`, which is
 * exactly the GET Stripe's `success_url` produces.
 */

type ControlState = {
  authWallRequests: Array<{ body: { email?: string; token?: string }; authorization: string | null; clientIp: string | null }>;
  doorCalls: string[];
  dpaSigned: boolean;
  checkoutOpen: boolean;
  paidUnconsumed: boolean;
  firmOpened: boolean;
};

async function control(page: Page, body: Record<string, unknown>): Promise<ControlState> {
  const response = await page.request.post(CONTROL, { data: body });
  expect(response.ok(), "the e2e control surface did not answer").toBeTruthy();
  return (await response.json()) as ControlState;
}

/** The checkout route's own doors — the three it calls once it gets past its
 *  input walls. Used to assert that a refusal happened BEFORE any of them. */
function assertNoCheckoutDoors(state: ControlState) {
  const checkoutDoors = state.doorCalls.filter((fn) =>
    ["open_checkout_intent", "get_current_checkout_plan", "record_checkout_session"].includes(fn),
  );
  expect(checkoutDoors, "the refusal happened AFTER a checkout door ran").toEqual([]);
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, `${label} has a11y violations`).toEqual([]);
}

/** Sign up, confirm and register — the only way to reach the DPA step. Every
 *  selector matches `signup-confirm-pending.spec.ts`'s, which is the file that
 *  owns this half of the journey. */
async function reachDpaStep(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();

  await page.goto("/auth/confirm");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Six-digit code").fill(CODE);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/signup`, NAV);

  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Firm name").fill("E2E Accounting");
  await page.getByRole("button", { name: "Register my firm" }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/pending`, NAV);

  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page.getByRole("heading", { name: "One more thing before checkout" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await control(page, { reset: true });
});

test("THE WHOLE JOURNEY: confirm → DPA → checkout → success → the firm opens", async ({ page }) => {
  const email = `e2e-checkout-${Date.now()}@example.test`;
  await reachDpaStep(page, email);

  // ── ② the confirm leg actually went through C-5's ONE endpoint ────────────
  const afterConfirm = await control(page, {});
  expect(afterConfirm.authWallRequests.length, "the confirm POST did not reach the auth wall").toBe(1);
  const wallCall = afterConfirm.authWallRequests[0]!;
  expect(Object.keys(wallCall.body).sort()).toEqual(["email", "token"]);
  expect(wallCall.authorization).toBe("Bearer e2e-auth-wall-service-token");
  // M1: the address `apps/web`'s OWN edge observed, forwarded for the C2 limb
  // — never the Origin header, which is one value for the whole deployment.
  expect(wallCall.clientIp, "no client address was forwarded to the wall").toBeTruthy();
  expect(wallCall.clientIp).not.toContain("clarabook");
  expect(wallCall.clientIp).not.toContain("127.0.0.1:3100");

  // ── ④ the DPA step ────────────────────────────────────────────────────────
  await scan(page, "the DPA step");
  // 裁-129: the terms are NAMED and not signed — the follow-up line, not a
  // second checkbox recording nothing.
  await expect(page.getByText(/separate document/i)).toBeVisible();
  await page.getByRole("button", { name: "I have read this and agree" }).click();
  await expect(page.getByText(/signature is recorded/i)).toBeVisible();
  expect((await control(page, {})).dpaSigned, "sign_dpa was never called").toBe(true);
  await scan(page, "the signed DPA step");

  // ── ⑤ POST /checkout, driven for real up to the Stripe seam ──────────────
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  // The Stripe seam refuses on this harness (see this file's header), so the
  // design's own typed card is what must render — never a spinner, never a
  // silent stay. The person is back on the holding page with a true sentence.
  await expect(page).toHaveURL(/\/pending\?checkout=/, NAV);
  await expect(page.getByText(/could not reach the payment provider/i)).toBeVisible();
  await scan(page, "the stripe-unavailable card");

  const afterCheckout = await control(page, {});
  // THE ORDER, on the real wire: the checkout route opened the intent and read
  // the plan IMMEDIATELY after, before it reached for Stripe. Asserted as an
  // adjacency rather than as the tail — the redirect back to /pending renders
  // that page, which legitimately reads the progress door afterwards, and a
  // tail assertion would have been measuring the page load instead of the
  // route (it did, on the first run).
  const opened = afterCheckout.doorCalls.indexOf("open_checkout_intent");
  expect(opened, "open_checkout_intent never ran").toBeGreaterThanOrEqual(0);
  expect(afterCheckout.doorCalls[opened + 1]).toBe("get_current_checkout_plan");
  expect(afterCheckout.doorCalls, "the intent was stamped").not.toContain("record_checkout_session");
  // THE PROPERTY THAT MATTERS ON THIS ARM: the one-shot intent was NOT stamped,
  // so the retry the card invites is safe. A route that stamped before the
  // Session existed would leave the applicant holding a spent intent.
  expect(afterCheckout.checkoutOpen, "the intent was stamped for a Session that does not exist").toBe(false);
  // And the doors BEFORE Stripe did run — otherwise the arm above would be
  // green for the wrong reason (a route that refused earlier).
  expect(afterCheckout.dpaSigned).toBe(true);

  // ── ⑥/⑦ the payment lands (the applier's effect, stood in for) ────────────
  // A real run replays a signed `checkout.session.completed` through C-5's
  // webhook; on this harness the applier's OBSERVABLE effect — an unconsumed
  // payment row — is set directly, and the PR body says so.
  await control(page, { paidUnconsumed: true, checkoutOpen: true });

  // ── ⑧ the return leg, exactly as Stripe's success_url produces it ─────────
  await page.goto("/checkout/success");
  await expect(page.getByRole("heading", { name: "Your payment went through" })).toBeVisible();
  await scan(page, "the success page");
  // THE GET CREATED NOTHING. M9's whole point: only the explicit POST may.
  expect((await control(page, {})).firmOpened, "the paint-only GET created a firm").toBe(false);

  await page.getByRole("button", { name: "Open my firm" }).click();
  const after = await control(page, {});
  expect(after.firmOpened, "claim_paid_firm never ran").toBe(true);
  expect(after.paidUnconsumed, "the payment was not consumed").toBe(false);
});

test("REFUSAL POLARITY — a wrong code and a LOCKED wall render their own cards", async ({ page }) => {
  const email = `e2e-wrong-${Date.now()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Create account" }).click();

  // A wrong code: the wall ALLOWED the attempt and the verification failed.
  await page.goto("/auth/confirm");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Six-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(/\/auth\/confirm\?flash=/, NAV);
  await expect(page.getByText("That code didn't work")).toBeVisible();
  await scan(page, "the wrong-code card");

  // A LOCKED wall: a DIFFERENT card, carrying the door's own wait. 裁-109's
  // three-state law — a lockout must never render as a generic invalid state.
  await control(page, { authWall: { mode: "locked", scope: "email", retryAfterSeconds: 300, remaining: 0 } });
  await page.goto("/auth/confirm");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Six-digit code").fill(CODE);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(/\/auth\/confirm\?flash=/, NAV);
  await expect(page.getByText("Too many attempts")).toBeVisible();
  await scan(page, "the locked card");

  // AND THE TWO ARE DIFFERENT PAGES, which is the property a single-card
  // implementation would still pass every assertion above on.
  await control(page, { authWall: { mode: "unconfigured" } });
  await page.goto("/auth/confirm");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Six-digit code").fill(CODE);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Too many attempts")).toHaveCount(0);
  await expect(page.getByText("That code didn't work")).toHaveCount(0);
});

test("REFUSAL POLARITY — checkout before a signature refuses VERBATIM on /pending", async ({ page }) => {
  const email = `e2e-unsigned-${Date.now()}@example.test`;
  await reachDpaStep(page, email);

  // The DPA step's own control is the only route to /checkout, so drive the
  // route the way /pending's resume arm does — a real same-origin form POST —
  // without signing first. `open_checkout_intent` refuses CLR09.
  await page.goto("/pending");
  await control(page, { checkoutOpen: true });
  await page.reload();
  await page.getByRole("button", { name: "Resume checkout" }).click();

  await expect(page).toHaveURL(/\/pending\?checkout=/, NAV);
  // The DOOR'S OWN sentence and code, verbatim — never re-worded.
  await expect(page.getByText("the data processing agreement is not signed")).toBeVisible();
  await expect(page.getByText("CLR09")).toBeVisible();
  await scan(page, "the checkout refusal card");

  // The refusal never rides the URL: the marker is opaque and carries nothing.
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["checkout"]);
  expect(url.search).not.toContain("CLR09");
  expect(url.search).not.toContain("agreement");
});

test("FAIL CLOSED in a real browser: no trusted client-IP header ⇒ checkout refuses", async ({ page }) => {
  // THIS ARM WAS UNREACHABLE BEFORE (review NIT 4). The harness pointed
  // `CLARA_TRUSTED_CLIENT_IP_HEADER` at `x-forwarded-for`, which Next 16.3.3
  // synthesizes from the socket (`base-server.js`, `??=`) — so the header was
  // ALWAYS present, the walk's digest came from one the framework filled in,
  // and the fail-closed branch could not be driven at all. The harness now
  // names a header nothing else fills, which is what makes this test possible.
  //
  // Design part 3 §3: "absent ⇒ checkout refuses". A wall that cannot be
  // reached is a wall nobody has seen work.
  // The signup and confirm legs NEED the header (the confirm wall keys C2 on
  // it), so the journey runs with it and it is cleared for the checkout POST
  // alone. Cleared at the CONTEXT level, which REPLACES the context's extra
  // headers — `page.setExtraHTTPHeaders({})` merges rather than removes, and
  // the first cut of this test read `stripe_unavailable` instead of the
  // refusal because the header was still there.
  const email = `e2e-nodigest-${Date.now()}@example.test`;
  await reachDpaStep(page, email);
  await page.getByRole("button", { name: "I have read this and agree" }).click();
  await expect(page.getByText(/signature is recorded/i)).toBeVisible();

  await page.context().setExtraHTTPHeaders({});
  await page.getByRole("button", { name: "Continue to checkout" }).click();

  await expect(page).toHaveURL(/\/pending\?checkout=/, NAV);
  await expect(page.getByText(/missing the configuration the abuse wall needs/i)).toBeVisible();
  // AND NOT A SINGLE CHECKOUT DOOR RAN. The digest is checked before any of
  // them, so no rate-wall attempt is spent on a request the wall cannot key.
  assertNoCheckoutDoors(await control(page, {}));
});

test("A GET can never open a Checkout Session, and never create a firm", async ({ page }) => {
  // The two POST-only entries, probed as GETs. A prefetch, a mail scanner or a
  // restored tab must not be able to spend a rate-wall attempt, create a
  // Stripe object, or mint a tenant.
  for (const path of ["/checkout", "/checkout/success/claim"]) {
    const response = await page.request.get(`${APP_ORIGIN}${path}`, { maxRedirects: 0 });
    // NOT 2xx. Measured on the built app: the proxy answers an unauthenticated
    // GET with a 307 to /login before the route is reached, and a signed-in GET
    // gets 405 from a route.ts with no GET export. Either is a refusal; what
    // must never happen is a 200 — and the two side-effect assertions below are
    // what make this cell discriminating rather than a status check.
    expect(response.status(), `${path} answered a GET with 2xx`).not.toBeLessThan(300);
  }
  const after = await control(page, {});
  // NO DOOR RAN. The status assertions above would still hold for a route that
  // called every door and then refused; this is what makes the cell about the
  // side effect rather than the response.
  expect(after.doorCalls, "a GET reached a door").toEqual([]);
  expect(after.firmOpened, "a GET created a firm").toBe(false);
});
