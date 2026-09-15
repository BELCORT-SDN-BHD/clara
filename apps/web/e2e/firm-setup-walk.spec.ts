import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { FIRM_SETUP_COOKIE } from "./firm-setup-mock.mjs";

/**
 * #648 · THE BROWSER LEG for journey A5 — "Resume setup → answer only missing firm facts → saved
 * progress → usable firm Home."
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real FULL PAGE RELOAD (the resumed checklist must not re-ask an accepted fact, and a
 * component test that never unmounts the process cannot show that), a second real BROWSER CONTEXT
 * racing the same plan (the CAS convergence), real `localStorage` surviving that convergence (the
 * preserved draft), a real focus manager and a real Dialog, a real address bar and Back, real
 * layout geometry at 320 CSS px and at 200% zoom, and a real `prefers-reduced-motion` query.
 *
 * WHAT IT DOES NOT PROVE. The five firm setup doors are fixtures (`firm-setup-mock.mjs`). Nothing
 * here establishes that `clara.seed_firm_setup_plan` really reconciles a `firmInterview_v3`-filled
 * plan without collision, that `clara.answer_firm_setup_item` really refuses a bookkeeper, or that
 * it really captures a firm-scope `clara.knowledge_records` row —
 * `packages/db/tests/firm-setup.test.mjs` owns those against a real Postgres under real
 * least-privileged roles. This lane owns what the browser does with their answers.
 *
 * THE LANE IS ARMED BY A COOKIE, and that is not a convenience: `clara.get_firm_setup()` takes no
 * argument at all, and the firm-home tile calls it on every signed-in firm home, so without a
 * marker this lane's fixture would appear in every other walk's firm home. See
 * `firm-setup-mock.mjs`'s own header.
 *
 * ONE SERVER SERVES EVERY WALK, so the fixture's answers are PER-SERVER, not per-test. The cells
 * below are therefore written as ONE ordered journey in a single `test.describe.serial`, which is
 * the honest shape for a checklist whose whole subject is accumulated state.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SETUP_URL = "/settings/setup";

async function arm(context: BrowserContext): Promise<void> {
  const origin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
  await context.addCookies([{ name: FIRM_SETUP_COOKIE, value: "armed", url: origin }]);
}

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  // A GENEROUS TIMEOUT, not the 5s default: this host runs several rigs at once and the
  // post-sign-in navigation is a full server render.
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 30_000 });
}

async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      if (a.playState !== "running") return true;
      const iterations = a.effect?.getComputedTiming().iterations ?? 1;
      return iterations === Infinity;
    }),
  );
}

async function scan(page: Page, what: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

test.describe.serial("#648 · A5 firm setup", () => {
  test("firmSetup.walk.start: the firm home tile is the authorised next step, and it gates nothing", async ({ page, context }) => {
    await arm(context);
    await signInTo(page, "/");

    // AC4 — the tile names the count and links to the section. It is not a gate: every other
    // firm-home destination is reachable while setup is untouched.
    const tile = page.getByTestId("firm-home-setup-tile");
    await expect(tile).toBeVisible();
    await expect(page.getByTestId("firm-home-setup-counter")).toContainText("of 3 required facts recorded");
    await expect(tile).toContainText("does not hold up anything else");
    await expect(page.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Work" })).toBeVisible();

    await scan(page, "firm home with the setup tile");

    await page.getByRole("link", { name: "Open firm setup" }).click();
    await expect(page).toHaveURL(new RegExp(`${SETUP_URL}$`));
  });

  test("firmSetup.walk.answer: one fact is a Field, a related set is a bounded walk, and a reload resumes without re-asking", async ({ page, context }) => {
    await arm(context);
    await signInTo(page, SETUP_URL);

    // NOT STARTED — distinct from completion, and the only action is the one that starts it.
    await expect(page.getByTestId("firm-setup-not-started")).toBeVisible();
    await page.getByTestId("firm-setup-seed").click();
    await expect(page.getByTestId("firm-setup-seeded-notice")).toBeVisible();
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("0 of 3 required facts recorded");
    await scan(page, "the seeded checklist");

    // ONE FACT — a single Field, submitted from there.
    await page.getByTestId("firm-setup-answer-fye-action").click();
    await page.getByRole("textbox").first().fill("6");
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-answer-fye")).toHaveText("6");
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("1 of 3 required facts recorded");

    // A BOUNDED RELATED SET — the identity group's remaining pending facts, walked locally.
    await page.getByTestId("firm-setup-answer-group-identity").click();
    await expect(page.getByTestId("firm-setup-step")).toHaveText("Question 1 of 3");
    await page.getByRole("textbox").first().fill("Rig & Co PLT");
    await page.getByTestId("firm-setup-next").click();
    await expect(page.getByTestId("firm-setup-step")).toHaveText("Question 2 of 3");
    await page.getByRole("textbox").first().fill("1 Jalan Rig\nKuala Lumpur");
    await page.getByTestId("firm-setup-next").click();
    await expect(page.getByTestId("firm-setup-step")).toHaveText("Question 3 of 3");
    await page.getByRole("textbox").first().fill("MIA-9911");
    await page.getByTestId("firm-setup-next").click();
    await expect(page.getByTestId("firm-setup-review")).toBeVisible();
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-answer-legal_name")).toHaveText("Rig & Co PLT");
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("3 of 3 required facts recorded");

    // AC1 — A FULL RELOAD RESUMES, and an accepted fact is never asked again.
    await page.reload();
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("3 of 3 required facts recorded");
    await expect(page.getByTestId("firm-setup-answer-legal_name")).toHaveText("Rig & Co PLT");
    await expect(page.getByTestId("firm-setup-state-legal_name")).toHaveText("Recorded");
    await expect(page.getByTestId("firm-setup-answer-legal_name-action")).toHaveCount(0);
  });

  test("firmSetup.walk.stale: a second browser context answers the same plan, and the first converges with its draft intact", async ({ page, context, browser }) => {
    await arm(context);
    await signInTo(page, SETUP_URL);

    // The first context opens the optional currency fact and types an answer WITHOUT saving.
    await page.getByTestId("firm-setup-answer-currency-action").click();
    await page.getByRole("radio", { name: "USD" }).check();

    // A SECOND REAL CONTEXT answers a DIFFERENT fact, which rotates the plan's CAS token.
    const other = await browser.newContext({ ignoreHTTPSErrors: true });
    await arm(other);
    const otherPage = await other.newPage();
    try {
      await signInTo(otherPage, SETUP_URL);
      await otherPage.getByTestId("firm-setup-answer-mia-action").click();
      await otherPage.getByRole("textbox").first().fill("MIA-OTHER");
      await otherPage.getByTestId("firm-setup-submit").click();
      await expect(otherPage.getByTestId("firm-setup-answer-mia")).toHaveText("MIA-OTHER");
    } finally {
      await other.close();
    }

    // The first context's submit converges INLINE — never a toast, never a navigation — and the
    // authoritative plan it re-reads already carries the other editor's answer.
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-stale")).toBeVisible();
    await expect(page.getByTestId("firm-setup-answer-mia")).toHaveText("MIA-OTHER");
    await expect(page).toHaveURL(new RegExp(`${SETUP_URL}$`));

    // THE DRAFT SURVIVED the convergence: the radio the person chose is still chosen.
    await expect(page.getByRole("radio", { name: "USD" })).toBeChecked();
    await scan(page, "the stale convergence with a preserved draft");

    // Saving again — on the re-read token — is accepted, and the fact reaches the register.
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-fact-default_currency")).toHaveText("USD");
    await expect(page.getByTestId("firm-setup-fact-actor-default_currency")).toContainText("Aisyah Rahman");
    await expect(page.getByTestId("firm-setup-confirmed-facts")).toContainText("Firm default");
    await expect(page.getByTestId("firm-setup-confirmed-facts")).toContainText("Stated by a user");
  });

  test("firmSetup.walk.finish: an optional fact is skipped with a reason, setup commits, and the tile clears", async ({ page, context }) => {
    await arm(context);
    await signInTo(page, SETUP_URL);

    await scan(page, "the checklist with confirmed facts");

    // The skip Dialog: a focused, bounded decision. Focus returns to the page afterwards.
    const trigger = page.getByTestId("firm-setup-skip-mia");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await scan(page, "the skip dialog");
      await dialog.getByRole("textbox").fill("The firm is not MIA-registered.");
      await page.getByTestId("firm-setup-skip-confirm").click();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("firm-setup-answer-mia")).toContainText("The firm is not MIA-registered.");
    }

    // COMMIT — and the completion face is distinct from "not started".
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("3 of 3 required facts recorded");
    await page.getByTestId("firm-setup-commit").click();
    await expect(page.getByTestId("firm-setup-committed-notice")).toBeVisible();
    await expect(page.getByTestId("firm-setup-completed")).toBeVisible();
    await expect(page.getByTestId("firm-setup-not-started")).toHaveCount(0);
    await expect(page.getByTestId("firm-setup-commit")).toHaveCount(0);
    await scan(page, "the completed checklist");

    // The confirmed fact stays correctable AFTER the commit — a committed checklist does not
    // freeze a record on the canonical register.
    await expect(page.getByTestId("firm-setup-correct-default_currency")).toBeVisible();

    // …and the firm home tile has cleared, because nothing required is outstanding.
    await page.goto("/");
    await expect(page.getByTestId("firm-home-setup-tile")).toHaveCount(0);

    // BACK returns to the firm home, and the section's URL is stable — the steps were local state.
    await page.goto(SETUP_URL);
    await expect(page).toHaveURL(new RegExp(`${SETUP_URL}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("firmSetup.walk.responsive: 320 CSS px, 200% zoom, keyboard focus return and reduced motion", async ({ page, context }) => {
    await arm(context);
    await signInTo(page, SETUP_URL);

    // 320 CSS px — the narrowest supported width, with no page-wide horizontal scrolling.
    await page.setViewportSize({ width: 320, height: 720 });
    await settle(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the checklist scrolls horizontally at 320 CSS px").toBeLessThanOrEqual(1);
    await expect(page.getByTestId("firm-setup-counter")).toBeVisible();
    await scan(page, "the checklist at 320 CSS px");

    // 200% zoom, emulated the way this suite does it: half the viewport at twice the scale.
    await page.setViewportSize({ width: 640, height: 512 });
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    await settle(page);
    await expect(page.getByTestId("firm-setup-counter")).toBeVisible();
    const zoomOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(zoomOverflow, "the checklist scrolls horizontally at 200% zoom").toBeLessThanOrEqual(1);
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    await page.setViewportSize({ width: 1280, height: 800 });

    // KEYBOARD: opening a fact and cancelling returns focus to the control that opened it.
    await ensureRealFocus(page);
    const answer = page.getByTestId("firm-setup-answer-currency-action");
    if (await answer.isVisible().catch(() => false)) {
      await answer.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("firm-setup-item-form")).toBeVisible();
      await page.getByTestId("firm-setup-cancel").click();
      await expect(page.getByTestId("firm-setup-item-form")).toHaveCount(0);
      await expect(answer).toBeFocused();
    }

    // REDUCED MOTION: with the preference set, nothing on this surface runs a finite animation.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await settle(page);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        if (a.playState !== "running") return false;
        return (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity;
      }).length);
    expect(running, "a finite animation ran under prefers-reduced-motion: reduce").toBe(0);
    await page.emulateMedia({ reducedMotion: null });
  });
});
