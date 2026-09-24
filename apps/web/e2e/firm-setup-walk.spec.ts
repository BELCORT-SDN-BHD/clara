import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, settleForScan, signInTo } from "./helpers";
import { FIRM_SETUP_COOKIE, TIP_KEY, TIP_KEY_READ } from "./firm-setup-mock.mjs";

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

/**
 * A BUDGET FOR AN ASSERTION THAT HAS ALREADY PAID FOR A SECOND SIGN-IN — not a hope that slowness
 * eventually passes.
 *
 * `expect`'s default is 5s, which is a budget for a single-page interaction. The convergence cell
 * below is not one: two full sign-ins and two server renders happen inside it, which is why the
 * describe carries its own 180s test budget. On a host running twelve worktree lanes at once, the
 * 5s per-assertion default turns a slow-but-correct convergence into a reported missing one — the
 * same reason the SHARED `signInTo` (#804, `helpers.ts`) names `CELL_BUDGET.signIn` for its own
 * post-login wait rather than falling through to 5s. (#851 retired this file's local copy of that
 * helper; the budget reasoning it carried lives in `helpers.ts` now.)
 */
const CONVERGED = { timeout: 30_000 };

async function arm(context: BrowserContext): Promise<void> {
  const origin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
  await context.addCookies([{ name: FIRM_SETUP_COOKIE, value: "armed", url: origin }]);
}

/** #1017 — delegates to the shared settle-before-scan contract (./helpers) instead of this file's
 *  own animations-only wait, which never checked the enter/mount opacity fade settleForScan also
 *  covers. Dropping the (0,0) mouse park too: settleForScan's own header records why it is no
 *  longer needed — the hover-state contrast it used to dodge is fixed at the token now. */
async function settle(page: Page): Promise<void> {
  await settleForScan(page);
}

async function scan(page: Page, what: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

test.describe.serial("#648 · A5 firm setup", () => {
  // #864 — PER CELL, BUILT FROM cellBudgetMs, not one blanket describe-level number sized to the
  // heaviest cell alone. TWO FULL SIGN-INS AND TWO SERVER RENDERS live inside the "stale"
  // convergence cell, and the axe scans add their own passes — the 30s default is a budget for a
  // single-page cell, and a short budget reports "the app did not converge" for a run that had
  // simply not finished, which is a false finding. Each cell below states its own signIns/scans
  // count instead of borrowing the busiest cell's number.

  test("firmSetup.walk.start: the firm home tile is the authorised next step, and it gates nothing", async ({ page, context }) => {
    test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
    await arm(context);
    await signInTo(page, "/");

    // AC4 — the tile names the count and links to the section. It is not a gate: every other
    // firm-home destination is reachable while setup is untouched.
    const tile = page.getByTestId("firm-home-setup-tile");
    await expect(tile).toBeVisible();
    await expect(page.getByTestId("firm-home-setup-counter")).toContainText("of 3 required facts recorded");
    await expect(tile).toContainText("does not hold up anything else");
    // AC935 — THE TILE IGNORES TIPS. Two education tips are pending in this fixture's envelope;
    // the tile names neither, because it reads `required_outstanding` and a tip is never
    // `required_for_commit` (review L06-SPEC-13 asked for this to be evidence, not a corollary).
    await expect(tile).not.toContainText("Invite your colleagues");
    await expect(tile).not.toContainText("Where Clara keeps what it knows");
    await expect(page.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Work" })).toBeVisible();

    await scan(page, "firm home with the setup tile");

    await page.getByRole("link", { name: "Open firm setup" }).click();
    await expect(page).toHaveURL(new RegExp(`${SETUP_URL}$`));
  });

  test("firmSetup.walk.answer: one fact is a Field, a related set is a bounded walk, and a reload resumes without re-asking", async ({ page, context }) => {
    test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
    await arm(context);
    await signInTo(page, SETUP_URL);

    // NOT STARTED — distinct from completion, and the only action is the one that starts it.
    await expect(page.getByTestId("firm-setup-not-started")).toBeVisible();
    await page.getByTestId("firm-setup-seed").click();
    await expect(page.getByTestId("firm-setup-seeded-notice")).toBeVisible();
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("0 of 3 required facts recorded");
    await scan(page, "the seeded checklist");

    // AC935 — AN EDUCATION TIP: a title, a body, "Got it" and "Later", no answer form, and it
    // never touches the required counter. BOTH actions are walked here, because AC4 asks for
    // "reading and skipping a tip" and either one settles it (read-or-later, not "remind me
    // later"): the tip disappears from the list on the very next render whichever is pressed.
    const tip = page.getByTestId(`firm-setup-tip-${TIP_KEY}`);
    await expect(tip).toContainText("Invite your colleagues");
    await expect(tip).toContainText("Settings");
    await expect(page.getByTestId(`firm-setup-answer-${TIP_KEY}-action`)).toHaveCount(0);
    await expect(page.getByTestId(`firm-setup-skip-${TIP_KEY}`)).toHaveCount(0);
    await page.getByTestId(`firm-setup-tip-later-${TIP_KEY}`).click();
    await expect(tip).toHaveCount(0);
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("0 of 3 required facts recorded");

    // …AND READING ONE. "Got it" on the second tip settles it the same way, and with the last tip
    // gone the card itself goes with it rather than staying as a heading over an empty box
    // (review L06-SPEC-05/-07).
    const tipRead = page.getByTestId(`firm-setup-tip-${TIP_KEY_READ}`);
    await expect(tipRead).toContainText("Where Clara keeps what it knows");
    await expect(page.getByTestId(`firm-setup-tip-gotit-${TIP_KEY_READ}`)).toBeVisible();
    await page.getByTestId(`firm-setup-tip-gotit-${TIP_KEY_READ}`).click();
    await expect(tipRead).toHaveCount(0);
    await expect(page.getByTestId("firm-setup-group-tips")).toHaveCount(0);
    await expect(page.getByTestId("firm-setup-counter")).toHaveText("0 of 3 required facts recorded");

    // ONE FACT — a single Field, submitted from there.
    await page.getByTestId("firm-setup-answer-fye-action").click();
    // #934 — the form shows the owner-approved ACCOUNTANT sentence under the question, never the
    // engineer's own provenance note that rendered here before this ticket.
    await expect(page.getByTestId("firm-setup-item-form")).toContainText(
      "The month the firm's own financial year ends, 1 to 12. Clients keep their own year-end on their client record.",
    );
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

    // C48.5 — AND IT CAN STILL BE CORRECTED. "Never asked again" is not "never changeable": the
    // control comes back with a different word, and the form it opens starts from what is on
    // record rather than blank.
    const change = page.getByTestId("firm-setup-change-legal_name-action");
    await expect(change).toBeVisible();
    await expect(change).toHaveText("Change this answer");
    await change.click();
    await expect(page.getByRole("textbox").first()).toHaveValue("Rig & Co PLT");
    await page.getByRole("textbox").first().fill("Rig & Partners PLT");
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-answer-legal_name")).toHaveText("Rig & Partners PLT");
    // An accepted answer CLOSES its form and hands focus back to the control that opened it —
    // which is now the correction control, so the person can reach it without hunting.
    await expect(page.getByTestId("firm-setup-item-form")).toHaveCount(0);
    await expect(change).toBeFocused();

    // …AND BACK AGAIN. This is the leg a value-derived op key made permanently impossible: the
    // third attempt carries a key the door has already seen naming different arguments, and the
    // fixture models `_reserve_op`'s refusal of exactly that (firm-setup-mock.mjs).
    await change.click();
    await page.getByRole("textbox").first().fill("Rig & Co PLT");
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-answer-legal_name")).toHaveText("Rig & Co PLT");
    await expect(page.getByTestId("firm-setup-already-recorded")).toHaveCount(0);
  });

  test("firmSetup.walk.stale: a second browser context answers the same plan, and the first converges with its draft intact", async ({ page, context, browser }) => {
    // TWO FULL SIGN-INS: this context's own, plus the second browser context's below.
    test.setTimeout(cellBudgetMs({ signIns: 2, scans: 1 }));
    await arm(context);
    await signInTo(page, SETUP_URL);

    // The first context opens the currency fact — the one that reaches the Knowledge register —
    // and chooses an answer WITHOUT saving.
    await page.getByTestId("firm-setup-answer-currency-action").click();
    await page.getByRole("radio", { name: "USD" }).check();

    // A SECOND REAL CONTEXT answers THE SAME fact first, which rotates the plan's CAS token.
    const other = await browser.newContext({ ignoreHTTPSErrors: true });
    await arm(other);
    const otherPage = await other.newPage();
    try {
      await signInTo(otherPage, SETUP_URL);
      await otherPage.getByTestId("firm-setup-answer-currency-action").click();
      await otherPage.getByRole("radio", { name: "MYR" }).check();
      await otherPage.getByTestId("firm-setup-submit").click();
      await expect(otherPage.getByTestId("firm-setup-fact-default_currency")).toHaveText("MYR");
    } finally {
      await other.close();
    }

    // The first context's submit converges INLINE — never a toast, never a navigation — and the
    // authoritative plan it re-reads already carries the other editor's answer.
    await page.getByTestId("firm-setup-submit").click();
    await expect(page.getByTestId("firm-setup-stale")).toBeVisible(CONVERGED);
    await expect(page.getByTestId("firm-setup-answer-currency")).toHaveText("MYR", CONVERGED);
    await expect(page).toHaveURL(new RegExp(`${SETUP_URL}$`));

    // THE DRAFT SURVIVED the convergence: the radio the person chose is still chosen.
    await expect(page.getByRole("radio", { name: "USD" })).toBeChecked(CONVERGED);
    await scan(page, "the stale convergence with a preserved draft");

    // AC3 — the winner's fact is on the SAME canonical record Settings and Knowledge read, with
    // its scope, its source and its actor. The loser is deliberately NOT offered a second capture
    // of it: the real door refuses that with `knowledge_already_live`, and the honest next step is
    // the correction path on the fact itself, which is what this surface offers.
    await expect(page.getByTestId("firm-setup-fact-default_currency")).toHaveText("MYR", CONVERGED);
    await expect(page.getByTestId("firm-setup-fact-actor-default_currency")).toContainText("Aisyah Rahman", CONVERGED);
    // …and the checklist row for it does NOT offer a second capture: a live firm default is
    // corrected on the register, which the row names in words.
    await expect(page.getByTestId("firm-setup-change-currency-action")).toHaveCount(0);
    await expect(page.getByTestId("firm-setup-correct-on-register-currency")).toBeVisible(CONVERGED);
    await expect(page.getByTestId("firm-setup-confirmed-facts")).toContainText("Firm default");
    await expect(page.getByTestId("firm-setup-confirmed-facts")).toContainText("Stated by a user");
    await expect(page.getByTestId("firm-setup-correct-default_currency")).toBeVisible();
  });

  test("firmSetup.walk.responsive: 320 CSS px, 200% zoom, keyboard focus return and reduced motion", async ({ page, context }) => {
    test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
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
    // UNCONDITIONAL, deliberately: a leg wrapped in "if it happens to be visible" is vacuous the
    // day the state it depends on moves, and this cell runs BEFORE the commit precisely so the
    // optional TIN fact is still pending here.
    const answer = page.getByTestId("firm-setup-answer-tin-action");
    await expect(answer).toBeVisible();
    await answer.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("firm-setup-item-form")).toBeVisible();
    // #934/#1032 — a second item, the owner-approved ACCOUNTANT sentence again, never the engineer
    // note.
    await expect(page.getByTestId("firm-setup-item-form")).toContainText(
      "The firm's MyInvois TIN. Required once the firm's turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.",
    );
    await page.getByTestId("firm-setup-cancel").click();
    await expect(page.getByTestId("firm-setup-item-form")).toHaveCount(0);
    await expect(answer).toBeFocused();

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

  test("firmSetup.walk.finish: an optional fact is skipped with a reason, setup commits, and the tile clears", async ({ page, context }) => {
    // THREE scan() passes below (confirmed facts, the skip-reason dialog, and the finished
    // checklist) — the heaviest cell in this describe.
    test.setTimeout(cellBudgetMs({ signIns: 1, scans: 3 }));
    await arm(context);
    await signInTo(page, SETUP_URL);

    await scan(page, "the checklist with confirmed facts");

    // The skip Dialog: ONE focused, bounded decision (appendix D row 23), and the whole leg is
    // UNCONDITIONAL — the optional TIN fact is still pending at this point in the journey, and a
    // leg guarded by "if it happens to be visible" would pass in silence the day it is not.
    const trigger = page.getByTestId("firm-setup-skip-tin");
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await scan(page, "the skip dialog");
    await dialog.getByRole("textbox").fill("The firm is below the MyInvois threshold.");
    await page.getByTestId("firm-setup-skip-confirm").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("firm-setup-answer-tin")).toContainText("The firm is below the MyInvois threshold.");
    // …and the skipped fact is visibly SKIPPED, not silently blank.
    await expect(page.getByTestId("firm-setup-state-tin")).toHaveText("Skipped");

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
});
