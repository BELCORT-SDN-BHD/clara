import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { OPERATOR } from "./operator-support-mock.mjs";

/**
 * #615 (refresh spec #612, journey D3) — THE OPERATOR SUPPORT DESTINATION, walked in a real
 * browser: an explicitly authorised destination of its own, a queue across three admission arms, a
 * case detail with only the permitted act, an attributable receipt, and a visible isolation
 * boundary — with the denial, the concurrent provider event, keyboard/focus, 320px, 200% zoom and
 * reduced motion each driven rather than asserted about.
 *
 * WHAT IT DOES NOT PROVE. `clara.list_operator_support_queue` / `clara.get_operator_support_case`
 * and the three governed acts are FIXTURES here (`operator-support-mock.mjs`), including the
 * CLR04/CLR09/CLR11 refusals this walk needs. So nothing below establishes that the real doors
 * union the three arms correctly, floor at owner+operator, or refuse a second decision —
 * `packages/db/tests/operator-support.test.mjs` owns that half, under real least-privileged
 * Postgres roles against migrations at 0188. This proves what the BROWSER does with the doors'
 * answers.
 *
 * THE BOOKKEEPER LEG MEETS A REAL REFUSAL, not just the app's affordance gate: the mock lane reads
 * the persona off the same bearer token `serve-built.mjs` mints and answers CLR04 to
 * `bookkeeper@…`, so the deep-link cell exercises the denial path end to end.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Read from the environment, matching `checkout-gate-walk.spec.ts` and the Playwright config: a
// hardcoded origin silently defeats this lane's assigned port range — the browser follows
// `baseURL` and passes while this file's own `page.request` calls keep dialling the default.
const APP_ORIGIN = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
const RESET = `${APP_ORIGIN}/e2e-supabase/e2e-operator/reset`;

// `playwright.config.ts` pins `workers: 1`, so ONE mock server serves this whole file and three of
// the cells below genuinely decide a registration or resolve a problem. Each cell therefore starts
// from the lane's own declared state rather than from whatever its predecessor left behind.
//
// THE RETRY RAISES THE WAIT, NEVER THE BAR (the same reasoning `checkout-gate-walk.spec.ts`'s own
// header records for its raised `expect` timeouts): the control POST is a fresh TLS handshake
// against this harness's self-signed local server, and on a loaded host one of thirteen handshakes
// lost that race ONCE (measured 2026-09-14: the reduced-motion cell's `beforeEach` timed out at
// 30 s while the same hook succeeded for the other twelve, with `net_error -202` handshake noise in
// the server log). Each attempt still demands a genuine `ok()` — an exhausted loop FAILS LOUDLY
// rather than letting a cell run against whatever the previous one left behind.
test.beforeEach(async ({ page }) => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.request.post(RESET, { timeout: 10_000 });
      expect(response.ok(), "the operator lane's control endpoint answered").toBe(true);
      return;
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw new Error(
    `the operator lane's control endpoint did not answer in 3 attempts: ${String(lastError)}`);
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  // RAISES THE WAIT, NEVER THE BAR — the same treatment, for the same measured reason, that
  // `checkout-gate-walk.spec.ts`'s own header records for this host: this assertion waits on a REAL
  // full-page navigation (a form POST, a door call over the mock transport, a 303 and the next
  // render), and on 2026-09-14 the FIRST cell of this file lost that race once while the other
  // twelve signed in fine — the page was still on `/login` with nothing refused, so the round trip
  // simply had not landed against a server that had just started. The assertion still demands the
  // exact destination; it only allows longer for it to arrive.
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

const asOperator = (page: Page) => signIn(page, "owner@example.test");
const asBookkeeper = (page: Page) => signIn(page, "bookkeeper@example.test");

const reviewRow = (page: Page, firm: string) =>
  page.getByRole("row", { name: new RegExp(firm) }).getByRole("button");

test("the queue carries all three arms, each with its own state, under a VISIBLE isolation statement", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");

  await expect(page.getByRole("heading", { name: "Operator support", level: 1 })).toBeVisible();

  // #615 AC1 — the boundary is on the screen, not only in a migration.
  await expect(page.getByRole("heading", { name: "This destination reaches admission only" })).toBeVisible();
  await expect(page.getByText(/does not open any firm's documents, ledger, Work or Knowledge/)).toBeVisible();

  // #615 AC2 — one row per support case, each naming its affected entity and current state.
  await expect(page.getByText(OPERATOR.firmName)).toBeVisible();
  await expect(page.getByText("Awaiting your decision")).toBeVisible();
  await expect(page.getByText(OPERATOR.paidFirmName)).toBeVisible();
  await expect(page.getByText("Paid, firm not yet opened")).toBeVisible();
  await expect(page.getByText(OPERATOR.problemFirmName)).toBeVisible();
  await expect(page.getByText("Needs operator attention")).toBeVisible();

  // #733's sweep — the server-rendered `<h1>` carries the literal id the console falls back to
  // when a Sheet closes onto a row that is gone. See `lib/navigation/heading-ids.ts` for why a
  // plain value must not cross the `"use client"` boundary to get here.
  await expect(page.locator("h1#operator-support-heading")).toBeVisible();

  // The operator's own estate-policy control rides the same destination and the same wall.
  await expect(page.getByRole("heading", { name: "Admission capacity" })).toBeVisible();
  await expect(page.getByText(/Limit: Unlimited/)).toBeVisible();
});

test("#615 AC1 — a bookkeeper is refused, sees NO support data and is offered NO action, even on a deep link", async ({ page }) => {
  await asBookkeeper(page);
  await page.goto(`/operator?case=problem%3A${OPERATOR.problem}`);

  await expect(page.getByText(/does not carry that authority/)).toBeVisible();
  // NO EXISTENCE LEAK: the refusal says nothing about whether that case exists, and no arm of the
  // estate's own data reaches the page.
  await expect(page.getByText(OPERATOR.problemFirmName)).toHaveCount(0);
  await expect(page.getByText(OPERATOR.firmName)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/operator refusal state").toEqual([]);
});

test("opening a case: Title, initial focus, Escape closes it and returns focus to the row", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");
  const trigger = reviewRow(page, OPERATOR.firmName);
  await trigger.click();

  await expect(page).toHaveURL(new RegExp(`[?&]case=registration%3A${OPERATOR.registration}(&|$)`));
  const title = page.locator('[data-slot="sheet-title"]');
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByText("Referred by an existing client.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/case=/);
  await expect(trigger).toBeFocused();
});

test("Back closes the detail and the queue keeps its filters and position", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator?kind=problem");
  // The arm filter narrowed the queue to one row before the Sheet was opened.
  await expect(page.getByText(OPERATOR.firmName)).toHaveCount(0);
  const trigger = reviewRow(page, OPERATOR.problemFirmName);
  await trigger.click();
  await expect(page).toHaveURL(/case=/);

  await page.goBack();
  await expect(page).not.toHaveURL(/case=/);
  await expect(page).toHaveURL(/kind=problem/);
  await expect(page.getByText(OPERATOR.problemFirmName)).toBeVisible();
  await expect(page.getByText(OPERATOR.firmName)).toHaveCount(0);
  // The physical Back path never itself held DOM focus, so without the console's own focus-return
  // effect an SPA re-render after the pop leaves focus on <body>.
  await expect(trigger).toBeFocused();
});

test("#615 AC3 — a case with no supported action NAMES the absence instead of offering a control", async ({ page }) => {
  await asOperator(page);
  await page.goto(`/operator?case=payment%3A${OPERATOR.payment}`);

  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await expect(page.getByText(/No supported action for this state/)).toBeVisible();
  await expect(page.getByText(/claimed by the applicant themselves/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("#615 AC2/AC4 — resolving a provider problem records an attributable receipt, and the case leaves the open queue", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");
  await reviewRow(page, OPERATOR.problemFirmName).click();
  await expect(page.getByText("duplicate_payment")).toBeVisible();

  await page.getByRole("button", { name: "Resolve" }).click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  // The DB is the wall on content; the disabled Confirm is the courtesy that saves a round trip.
  await expect(page.getByRole("button", { name: "Record resolution" })).toBeDisabled();
  await page.getByLabel("Reason", { exact: true }).fill("Refunded through the provider dashboard.");
  await page.getByRole("button", { name: "Record resolution" }).click();

  await expect(page.getByText(/Provider event evt_615_dup is recorded as resolved/)).toBeVisible();
  // THE DISCRIMINATING POST-CONDITION: the queue was re-read and the case has left it.
  await page.keyboard.press("Escape");
  await expect(page.getByText(OPERATOR.problemFirmName)).toHaveCount(0);

  // …and the receipt is readable in the settled view, attributably. Row-scoped: the settled view
  // holds BOTH problem rows, so a bare `getByText("Resolved")` would match two and Playwright's
  // strict mode would (correctly) refuse to guess which one this cell means.
  await page.getByRole("button", { name: "Include settled" }).click();
  await expect(page).toHaveURL(/settled=1/);
  const resolvedRow = page.getByRole("row", { name: new RegExp(OPERATOR.problemFirmName) });
  await expect(resolvedRow).toBeVisible();
  await expect(resolvedRow.getByText("Resolved")).toBeVisible();
});

test("#615 AC3/AC5 — a CONCURRENT provider event: a second resolution of the same case is refused as stale, verbatim, and repeats no effect", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");

  // First operator tab resolves it.
  await reviewRow(page, OPERATOR.problemFirmName).click();
  await page.getByRole("button", { name: "Resolve" }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Refunded through the provider dashboard.");
  await page.getByRole("button", { name: "Record resolution" }).click();
  await expect(page.getByText(/recorded as resolved/)).toBeVisible();
  await page.keyboard.press("Escape");

  // A SECOND attempt on the same case — the shape of another operator, or a retried tab, acting on
  // a case something else already settled. The settled view is where it is still reachable.
  await page.getByRole("button", { name: "Include settled" }).click();
  await reviewRow(page, OPERATOR.problemFirmName).click();
  // A settled case offers no act at all: the refusal is prevented rather than merely reported.
  await expect(page.getByText(/No supported action for this state/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resolve" })).toHaveCount(0);
  // …and the FIRST resolution's receipt is what the case reports.
  await expect(page.getByText(/Refunded through the provider dashboard\./)).toBeVisible();
});

test("#615 AC2 — approving a registration shows the door's own receipt and the row leaves the open queue", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");
  await reviewRow(page, OPERATOR.firmName).click();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/was created, with onboarding plan/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(OPERATOR.firmName)).toHaveCount(0);

  await page.getByRole("button", { name: "Include settled" }).click();
  await expect(page.getByText(OPERATOR.firmName)).toBeVisible();
  await expect(page.getByText("Decided")).toBeVisible();
});

test("#615 AC1/AC5 — a deep link to a case the door refuses shows ONE not-found state, never a crash", async ({ page }) => {
  await asOperator(page);
  await page.goto(`/operator?case=problem%3A${OPERATOR.deniedCase}`);
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await expect(page.getByText(/No support case is available at this address/)).toBeVisible();

  // Closing a DEEP-LINKED sheet (never pushed) rewrites the URL rather than leaving the app.
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/case=/);
  await expect(page).toHaveURL(/\/operator$/);
});

test("the admission capacity panel writes the estate's limit and reads it back", async ({ page }) => {
  await asOperator(page);
  await page.goto("/operator");
  await expect(page.getByText(/Limit: Unlimited/)).toBeVisible();

  await page.getByLabel("Firm limit").fill("12");
  await page.getByLabel("Reason for the limit").fill("Beta cohort cap.");
  await page.getByRole("button", { name: "Save capacity" }).click();

  await expect(page.getByText(/Admission capacity is now 12/)).toBeVisible();
  await expect(page.getByText(/Limit: 12/)).toBeVisible();
});

test("320px stays usable with no page-wide horizontal scroll, and is axe-clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await asOperator(page);
  await page.goto("/operator");
  await expect(page.getByText(OPERATOR.firmName)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 320px").toBeLessThanOrEqual(clientWidth + 1);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/operator at 320px").toEqual([]);
});

test("200% zoom (a halved 1280x720 viewport) keeps the queue and its actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await asOperator(page);
  await page.goto("/operator");
  await expect(page.getByText(OPERATOR.firmName)).toBeVisible();
  await reviewRow(page, OPERATOR.firmName).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 200% zoom").toBeLessThanOrEqual(clientWidth + 1);
});

test("reduced motion: the case Sheet still opens and closes correctly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await asOperator(page);
  await page.goto("/operator");
  await reviewRow(page, OPERATOR.firmName).click();
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
});
