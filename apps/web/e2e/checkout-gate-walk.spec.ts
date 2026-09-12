import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Read from the environment, matching `signup-confirm-pending.spec.ts` and the
// Playwright config. A hardcoded origin here silently defeats the lane's
// assigned port range: the browser follows `baseURL` and passes, while this
// file's own `page.request` calls keep dialling 3100 and refuse the connection.
// Measured the hard way on ports 3220-3222 — five cells, one cause.
const APP_ORIGIN = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
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
  /** #621: one acceptance PER AGREEMENT (the version accepted, or null). */
  legalAccepted: { terms: number | null; dpa: number | null };
  /** What `open_checkout_intent` would refuse on right now. */
  missingLegal: string[];
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
  // THE POINTER IS DELIBERATELY LEFT WHERE THE LAST CLICK PUT IT. This used to
  // park it at (0,0) first, because a cursor resting on an acceptance control
  // made axe measure that button HOVERED — `hover:bg-primary/80` composites to
  // #4a71e0 under white 14px text = 4.440:1, under AA's 4.5. That shortfall was
  // real and estate-wide, and it is now FIXED AT THE SOURCE
  // (`components/ui/button.tsx`, `components/ui/badge.tsx`: `/90`, composites
  // to #3460dc = 5.451:1, pinned by `scripts/check-token-contrast.mjs`'s
  // `primary-foreground-on-primary-hover` row). Removing the workaround is the
  // point: a scan that dodges the hover state cannot catch the next one.
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, `${label} has a11y violations`).toEqual([]);
}

/** No page-wide horizontal scroll at whatever width the caller just set — the
 *  same instrument `responsive-shell-walk.spec.ts` and `work-question-walk`
 *  use, and the property the legal stage owed and never had. */
async function expectNoSidewaysScroll(page: Page, face: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${face}: the document scrolls sideways (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

/** What currently holds focus, described the way an assertion can read it. */
function focusDescription(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName ?? "NONE",
      role: el?.getAttribute("role") ?? "",
      text: (el?.textContent ?? "").trim().slice(0, 120),
    };
  });
}

/** Sign up, confirm and register — the only way to reach the legal stage. Every
 *  selector matches `signup-confirm-pending.spec.ts`'s, which is the file that
 *  owns this half of the journey. */
async function reachLegalStage(page: Page, email: string) {
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

  // PR 541 stage 7, IN A REAL BROWSER: the holding card must not tell the
  // person there is nothing to do while its own next-step control is on
  // screen beside the sentence. The unit cell derives the roster from the
  // render; this proves the rendered page a real applicant sees.
  await expect(page.getByText(/nothing more for you to do/i)).toHaveCount(0);
  await expect(page.getByText(/it's yours to take below/i)).toBeVisible();

  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page.getByRole("heading", { name: "Two agreements before checkout" })).toBeVisible();
}

/** Accept ONE agreement, named the way the CONTROL names it (the agreement's
 *  short name, which `Common` owns and both this stage and /pending's refusal
 *  card read). The wait is on the control DISAPPEARING, which is the property
 *  that matters: an accepted agreement stops offering an acceptance, and it
 *  stops offering it because the server was re-read — not because this browser
 *  remembered a click. */
async function acceptAgreement(page: Page, shortName: string) {
  const control = page.getByRole("button", { name: `I have read and accept the ${shortName}` });
  await control.click();
  await expect(control).toHaveCount(0, NAV);
}

test.beforeEach(async ({ page }) => {
  await control(page, { reset: true });
});

test("THE WHOLE JOURNEY: confirm → DPA → checkout → success → the firm opens", async ({ page }) => {
  const email = `e2e-checkout-${Date.now()}@example.test`;
  await reachLegalStage(page, email);

  // ── ② the confirm leg actually went through C-5's ONE endpoint ────────────
  const afterConfirm = await control(page, {});
  expect(afterConfirm.authWallRequests.length, "the confirm POST did not reach the auth wall").toBe(1);
  const wallCall = afterConfirm.authWallRequests[0]!;
  expect(Object.keys(wallCall.body).sort()).toEqual(["email", "token"]);
  expect(wallCall.authorization).toBe("Bearer e2e-auth-wall-service-token");
  // M1: the address `apps/web`'s OWN edge observed, forwarded for the C2 limb
  // — never the Origin header, which is one value for the whole deployment.
  //
  // THE NEEDLE FOLLOWS THE ORIGIN, and the reason is the same class as the
  // hardcoded `APP_ORIGIN` two dozen lines up (rev-lane-b r3, N-1). This read
  // `"127.0.0.1:3100"` as a literal: on any port but 3100 that string can never
  // appear in ANY value, so the assertion held for every input and the cell that
  // exists to catch M1 stopped catching it. The reviewer proved it — with the
  // defect injected (`const clientIp = proof.origin`) the browser leg stayed
  // 55/0 on their range, while the unit layer caught it at 2280/2.
  //
  // A needle spelled against one deployment is not a needle. Derived from
  // APP_ORIGIN so it moves with the range and the assertion keeps discriminating.
  expect(wallCall.clientIp, "no client address was forwarded to the wall").toBeTruthy();
  expect(wallCall.clientIp).not.toContain("clarabook");
  expect(wallCall.clientIp).not.toContain(new URL(APP_ORIGIN).host);

  // ── ④ the LEGAL STAGE — two agreements, two acceptances (#621) ────────────
  await scan(page, "the legal stage");
  // 裁-129's follow-up line is GONE because the thing it named now exists: both
  // documents are presented, and each is accepted on its own.
  await expect(page.getByText(/separate document/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ClaraBook Beta Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ClaraBook Beta Data Processing Agreement" })).toBeVisible();
  // NEITHER ACCEPTED ⇒ NO ROUTE TO CHECKOUT. Not a disabled-looking button: the
  // control is absent, and the card says what is still owed.
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toHaveCount(0);
  await expect(page.getByText(/Both agreements have to be accepted/i)).toBeVisible();

  // ONE of two is still not enough — the state the single-document step could
  // not even express.
  await acceptAgreement(page, "Terms of Service");

  // ── FOCUS AFTER AN ACCEPTANCE, IN A REAL BROWSER ─────────────────────────
  // The control the person just pressed is REMOVED and replaced by the accepted
  // banner, so without a deliberate move the browser drops focus on `<body>`
  // and a keyboard user restarts at the top of the page. The component's rule
  // (its own header, and `signup-legal-stage.test.tsx` pins it at unit level)
  // is: focus goes to THAT agreement's accepted banner — the receipt — never
  // past it to the other agreement's control. Polled, because the move happens
  // after `router.refresh()` is asked for.
  await expect.poll(async () => (await focusDescription(page)).text, {
    message: "focus was dumped on <body> (or skipped past the receipt) after an acceptance",
  }).toContain("Accepted on");
  const afterAccept = await focusDescription(page);
  expect(afterAccept.tag, "the accepted receipt is not what holds focus").toBe("DIV");
  expect(afterAccept.role, "the focused receipt lost its announcement role").toBe("status");
  // AND NOT THE NEXT CONTROL: the other agreement is still outstanding and
  // still offers its own control, which focus deliberately did NOT jump to.
  await expect(
    page.getByRole("button", { name: "I have read and accept the Data Processing Agreement" }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Continue to checkout" })).toHaveCount(0);
  expect((await control(page, {})).missingLegal, "the terms acceptance never reached the door").toEqual(["dpa"]);

  await acceptAgreement(page, "Data Processing Agreement");
  expect((await control(page, {})).missingLegal, "accept_legal_document was never called for both").toEqual([]);
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();
  await scan(page, "the accepted legal stage");

  // A RELOAD RESUMES FROM WHAT THE SERVER HOLDS, not from anything this browser
  // remembers: both receipts and the checkout control survive a fresh GET, and
  // no acceptance control comes back.
  await page.reload();
  await expect(page.getByText(/Accepted on /).first()).toBeVisible();
  expect(await page.getByText(/Accepted on /).count()).toBe(2);
  await expect(page.getByRole("button", { name: /I have read and accept/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();

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
  expect(afterCheckout.missingLegal).toEqual([]);
  // ── BROWSER BACK KEEPS WHAT WAS SIGNED ───────────────────────────────────
  // The card invites a retry, and the way a person retries is the Back button.
  // The acceptances are the DB's fact, re-derived on every load (the stage
  // holds nothing in this browser), so Back must land on a legal stage that
  // still shows two receipts and still offers checkout — never one asking for
  // signatures already recorded, and never a bfcache snapshot of the
  // pre-acceptance page.
  await page.goBack();
  await expect(page).toHaveURL(`${APP_ORIGIN}/signup`, NAV);
  await expect(page.getByRole("heading", { name: "Two agreements before checkout" })).toBeVisible();
  expect(await page.getByText(/Accepted on /).count(), "Back lost an acceptance").toBe(2);
  await expect(page.getByRole("button", { name: /I have read and accept/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();

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

test("THE LEGAL STAGE AT 320 CSS px, AT 200% ZOOM, AND UNDER REDUCED MOTION", async ({ page }) => {
  // The journey-state gap this round closed: the stage that asks somebody to
  // sign two agreements had no geometry and no motion assertion at all. It is
  // ONE extra reach of the existing journey rather than a second copy of it —
  // `reachLegalStage` is the same helper every other cell here uses.
  //
  // REDUCED MOTION FIRST, and it is emulated BEFORE the navigation so every
  // load-time decision this page makes runs under it. The claim being pinned is
  // deliberately narrow and checkable: the stage renders IDENTICALLY under
  // `reduce` — same cards, same controls, same acceptance path — because it
  // animates nothing of its own. No animation class is required of it; a stage
  // that started animating would have to come back here and say what it does
  // under `reduce`.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = `e2e-narrow-${Date.now()}@example.test`;
  await reachLegalStage(page, email);
  await expect(page.getByRole("heading", { name: "ClaraBook Beta Terms of Service" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I have read and accept the Terms of Service" }),
  ).toBeVisible();

  for (const [label, size] of [
    ["320 CSS px", { width: 320, height: 640 }],
    // 200% browser zoom IS a halving of the CSS viewport, so 640×512 is the
    // 1280×720-at-200% case (`responsive-shell-walk.spec.ts`'s own note).
    ["200% zoom", { width: 640, height: 512 }],
  ] as const) {
    await page.setViewportSize(size);
    await expectNoSidewaysScroll(page, `the legal stage at ${label}`);
    // THE PRIMARY ACT IS ON SCREEN. A long agreement must not push the thing
    // the person came here to press off the viewport — the stage's scrollable
    // text region is capped precisely so it cannot.
    const accept = page.getByRole("button", { name: "I have read and accept the Terms of Service" });
    await accept.scrollIntoViewIfNeeded();
    await expect(accept).toBeInViewport();
    await scan(page, `the legal stage at ${label} under reduced motion`);
  }

  // ── THE HOVERED PRIMARY BUTTON, SCANNED ON PURPOSE ───────────────────────
  // This file used to park the pointer at (0,0) before every scan precisely so
  // axe would never measure this. `hover:bg-primary/80` composited to #4a71e0
  // under white 14px text = 4.440:1, under AA — a real, estate-wide failure
  // that the workaround hid. The alpha is `/90` now (#3460dc = 5.451:1,
  // measured by `scripts/check-token-contrast.mjs` and pinned there as
  // `primary-foreground-on-primary-hover`), so the pointer is put ON the
  // control DELIBERATELY and the scan is allowed to see it. This is the cell
  // that would go red if the alpha drifted back.
  await page.setViewportSize({ width: 1280, height: 720 });
  const hovered = page.getByRole("button", { name: "I have read and accept the Terms of Service" });
  await hovered.hover();
  await scan(page, "the legal stage with the pointer ON a primary button");

  // AND IT STILL WORKS at the narrow width under `reduce` — a layout cell that
  // never drives the act would pass on a stage whose control had stopped
  // functioning.
  await page.setViewportSize({ width: 320, height: 640 });
  await acceptAgreement(page, "Terms of Service");
  expect((await control(page, {})).missingLegal).toEqual(["dpa"]);
  await expect(page.getByText(/Accepted on /)).toBeVisible();
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

test("REFUSAL POLARITY — checkout before the agreements are accepted lands on a card with a WAY BACK", async ({ page }) => {
  const email = `e2e-unaccepted-${Date.now()}@example.test`;
  await reachLegalStage(page, email);

  // The legal stage's own control is the only route to /checkout, so drive the
  // route the way /pending's resume arm does — a real same-origin form POST —
  // without accepting first. `open_checkout_intent` refuses CLR09 with
  // `legal_not_accepted`, which is the ONE checkout refusal whose fix belongs
  // to the person: it names what is outstanding and links back to the stage.
  await page.goto("/pending");
  await control(page, { checkoutOpen: true });
  await page.reload();
  await page.getByRole("button", { name: "Resume checkout" }).click();

  await expect(page).toHaveURL(/\/pending\?checkout=/, NAV);
  await expect(page.getByText(/needs every agreement accepted first/i)).toBeVisible();
  // THE DOOR'S OWN LIST, rendered by name.
  await expect(page.getByRole("listitem").filter({ hasText: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Data Processing Agreement" })).toBeVisible();
  const back = page.getByRole("link", { name: "Go back and accept them" });
  await expect(back).toBeVisible();
  await scan(page, "the legal-not-accepted card");

  // The refusal never rides the URL: the marker is opaque and carries nothing.
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["checkout"]);
  expect(url.search).not.toContain("CLR09");
  expect(url.search).not.toContain("agreement");

  // AND THE WAY BACK ACTUALLY LEADS SOMEWHERE THE PERSON CAN ACT.
  await back.click();
  await expect(page.getByRole("heading", { name: "Two agreements before checkout" })).toBeVisible();
});

test("AN UNPUBLISHED AGREEMENT IS PREVIEWED, NEVER ACCEPTED, and closes checkout", async ({ page }) => {
  // The draft arm is the one this train exists for: the estate used to present
  // ONE agreement and say in print that the terms of service were coming. A
  // draft is now shown — so a person can read where it is heading — as a
  // labelled preview with no acceptance control at all, because the door would
  // refuse it (`CLR09 not_published`) and inviting the acceptance anyway is how
  // somebody ends up believing they signed something still being written.
  const email = `e2e-draft-${Date.now()}@example.test`;
  await reachLegalStage(page, email);

  await expect(page.getByText(/Not final/i)).toBeVisible();
  await expect(page.getByText(/can't be accepted until it is published/i)).toBeVisible();
  await expect(page.getByText(/DRAFT: these beta terms of service/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I have read and accept the Terms of Service" }),
  ).toHaveCount(0);
  await scan(page, "the draft legal stage");

  // The OTHER agreement is published and still acceptable — a draft closes the
  // stage, it does not blank it.
  await acceptAgreement(page, "Data Processing Agreement");
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toHaveCount(0);
  expect((await control(page, {})).missingLegal).toEqual(["terms"]);
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
  await reachLegalStage(page, email);
  await acceptAgreement(page, "Terms of Service");
  await acceptAgreement(page, "Data Processing Agreement");

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
