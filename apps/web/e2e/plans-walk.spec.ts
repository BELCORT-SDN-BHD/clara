import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { PLANS } from "./plans-mock.mjs";

/**
 * #640 · THE BROWSER LEG for journey C9 — "Plans list → purpose/basis/authority/schedule → next
 * occurrence preview → run history and revise/pause/cancel."
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real focus manager (the safe answer holds initial focus in a real dialog, and focus
 * RETURNS to the trigger when the dialog closes), a real address bar and Back, real layout
 * geometry at 320 CSS px and at 200% zoom, a real `prefers-reduced-motion` media query, and a
 * real re-read after a governed write (the preview must SWITCH to its paused explanation because
 * the surface re-read, not because it painted its own optimistic answer).
 *
 * WHAT IT DOES NOT PROVE. The plan doors are fixtures (`plans-mock.mjs`). Nothing here establishes
 * that `clara.wake_due_plan_occurrences` really converges two scans on one occurrence, that
 * `clara.pause_accounting_plan` really leaves an in-flight Work alone, or that
 * `clara.request_plan_catch_up` really refuses a window below `effective_from` —
 * `packages/db/tests/accounting-plan-occurrences.test.mjs`,
 * `packages/db/tests/accounting-plans.test.mjs` and
 * `packages/runtime/tests/plan-occurrence-e2e.mjs` own those against a real Postgres. This lane
 * owns what the browser does with their answers.
 *
 * THE BOUNDARY STATEMENT IS ASSERTED ON EVERY SURFACE, deliberately. Wayfinder #611's scope line
 * — a schedule creates journal Work and never initiates a bank payment or a mandate — is the one
 * sentence the acceptance requires to be persistent rather than transient, and a cell that checked
 * it once on one page would not be measuring "persistent".
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = PLANS.clientId;
const LIST_URL = `/clients/${CLIENT}/plans`;
const DETAIL_URL = `/clients/${CLIENT}/plans/${PLANS.planId}`;
const ENDED_URL = `/clients/${CLIENT}/plans/${PLANS.endedPlanId}`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
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

/** The fixture's pause state is per-SERVER, not per-test, so a spec that pauses must put it back.
 *  Driven through the app's own door rather than a backdoor: the same RPC the UI calls. */
async function resumeFixture(page: Page): Promise<void> {
  await page.goto(DETAIL_URL);
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  if (await resume.isVisible().catch(() => false)) {
    await resume.click();
    await page.getByRole("dialog").getByRole("button", { name: "Resume the plan" }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  }
}

test.afterEach(async ({ page }) => {
  await resumeFixture(page).catch(() => {});
});

// ===========================================================================================
// plans.walk.authority — the whole journey, on one screen at a time.
// ===========================================================================================

test("plans.walk.authority: the list names the schedule, its timezone and its next occurrence, and the payment boundary is persistent", async ({ page }) => {
  await signInTo(page, LIST_URL);

  // THE BOUNDARY, on first paint and not a toast.
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await expect(page.getByText(/no global switch that turns scheduling on or off/)).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: PLANS.purpose });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Monthly, day 1");
  await expect(row).toContainText("Asia/Kuala_Lumpur");
  await expect(row).toContainText("2026-07-01 onwards");
  await expect(row).toContainText("2026-10-01");
  await expect(row).toContainText("Active");

  // An ENDED plan is still listed, and it does NOT print a next date as though it will run.
  const ended = page.getByRole("row").filter({ hasText: PLANS.endedPurpose });
  await expect(ended).toContainText("Ended");
  await expect(ended).toContainText("Not being admitted");

  // NO GLOBAL AGENTIC SWITCH, measured in the real DOM (#640's own acceptance line).
  expect(await page.getByRole("switch").count(), "no toggle exists on the plans surface").toBe(0);
  expect(await page.getByRole("checkbox").count()).toBe(0);

  await scan(page, "plans list");
});

test("plans.walk.authority: the detail shows the basis, the authority and its instruction link, the preview and the occurrence history with its receipts", async ({ page }) => {
  await signInTo(page, LIST_URL);
  await page.getByRole("link", { name: PLANS.purpose }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${PLANS.planId}$`));

  // IDENTITY: purpose, kind, schedule + timezone, window, revision, authority, authoriser.
  await expect(page.getByRole("heading", { name: PLANS.purpose })).toBeVisible();
  await expect(page.getByText("Recurring journal").first()).toBeVisible();
  await expect(page.getByText(/Monthly, day 1 · Asia\/Kuala_Lumpur/)).toBeVisible();
  await expect(page.getByText("2026-07-01 onwards")).toBeVisible();
  await expect(page.getByText("Current revision")).toBeVisible();

  // THE AUTHORITY LINKS TO THE INSTRUCTION ITSELF — the acceptance's "authority source … and
  // instruction link", and it is the Work's own durable address.
  const instruction = page.getByRole("link", { name: "Open the instruction" });
  await expect(instruction).toHaveAttribute("href", `/clients/${CLIENT}/work/${PLANS.authorityWorkId}`);

  // THE BASIS, with the honest note about its stored date.
  await expect(page.getByText("6100").first()).toBeVisible();
  await expect(page.getByText(/placeholder the schedule replaces/)).toBeVisible();
  await expect(page.getByText("RM 1,200.00").first()).toBeVisible();

  // THE PREVIEW — the next three due dates, from the database's own arithmetic.
  await expect(page.getByText("2026-10-01")).toBeVisible();
  await expect(page.getByText("2026-11-01")).toBeVisible();
  await expect(page.getByText("2026-12-01")).toBeVisible();

  // THE OCCURRENCE HISTORY: one admitted occurrence with its Work and its entry, and one REFUSED
  // due event carrying the database's own typed reason and no Work at all.
  const admitted = page.getByRole("row").filter({ hasText: "2026-09-01" });
  await expect(admitted).toContainText("Completed");
  await expect(admitted.getByRole("link", { name: "Open work" }))
    .toHaveAttribute("href", `/clients/${CLIENT}/work/${PLANS.workId}`);
  await expect(admitted.getByRole("link", { name: "Open entry" }))
    .toHaveAttribute("href", `/clients/${CLIENT}/journals?tab=posted&entry=${PLANS.entryId}`);

  const refused = page.getByRole("row").filter({ hasText: "2026-08-01" });
  await expect(refused).toContainText("Refused");
  await expect(refused).toContainText("actor_not_active");
  await expect(refused).toContainText("No work created");

  // The boundary statement is here too.
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  await scan(page, "plan detail");
});

test("plans.walk.authority: pause switches the preview to a paused explanation that KEEPS the dates, and focus returns to the trigger", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await expect(page.getByText("2026-10-01")).toBeVisible();
  await expect(page.getByText(/these dates are not being admitted/)).toBeHidden();

  const trigger = page.getByRole("button", { name: "Pause", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Pause ${PLANS.purpose}?` })).toBeVisible();

  // THE SAFE ANSWER HOLDS INITIAL FOCUS — a destructive default is how a keyboard user stops a
  // schedule by pressing Enter.
  await expect(dialog.getByRole("button", { name: "Keep scheduling" })).toBeFocused();
  // PAUSE IS NOT CANCEL, said where the decision is made.
  await expect(dialog.getByText(/Accounting work that has already been created keeps running/)).toBeVisible();
  await scan(page, "pause dialog");

  await dialog.getByRole("button", { name: "Pause the plan" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // THE PREVIEW SWITCHED BECAUSE THE SURFACE RE-READ — and it kept the dates, because "the
  // schedule is not being admitted" and "there is nothing scheduled" are different facts.
  await expect(page.getByText(/these dates are not being admitted/)).toBeVisible();
  await expect(page.getByText("2026-10-01")).toBeVisible();
  await expect(page.getByText("the landlord is renegotiating")).toBeVisible();
  await expect(page.getByText("Paused").first()).toBeVisible();

  // FOCUS RETURNED. The Pause trigger unmounted (a paused plan offers Resume), so the browser
  // must not have dropped focus on <body> — §4's rule for a trigger that disappears.
  const active = await page.evaluate(() => document.activeElement?.tagName ?? null);
  expect(active, "focus must not be dumped on the document body when the trigger unmounts").not.toBe("BODY");

  // A paused plan offers Resume and End, and never Pause or Catch up.
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  expect(await page.getByRole("button", { name: "Catch up", exact: true }).count(),
    "a paused plan catches nothing up — the door would refuse plan_paused").toBe(0);
  await scan(page, "paused plan detail");
});

test("plans.walk.authority: a catch-up window below the authority is refused, and the refusal is readable INSIDE the dialog", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await page.getByRole("button", { name: "Catch up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Catch up ${PLANS.purpose}` })).toBeVisible();
  await expect(dialog.getByText(/A schedule does not authorise its own history/)).toBeVisible();
  await expect(dialog.getByText(/At most twelve occurrences/)).toBeVisible();

  // THE FORM'S OWN FIELD RULE FIRST: a window starting before the plan's authority is named at the
  // control, not sent to a door that would only refuse it.
  await dialog.getByLabel("From").fill("2026-05-01");
  await dialog.getByLabel("To").fill("2026-09-14");
  await dialog.getByRole("button", { name: "Catch up", exact: true }).click();
  await expect(dialog.getByText(/authority starts later than that/)).toBeVisible();
  await expect(page.getByRole("dialog"), "a refused window keeps its dialog open").toBeVisible();
  await scan(page, "catch-up dialog with a field refusal");

  // AND THE ADMITTED WINDOW GOES THROUGH.
  await dialog.getByLabel("From").fill("2026-07-01");
  await dialog.getByRole("button", { name: "Catch up", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("plans.walk.authority: an ENDED plan offers no lifecycle control and says why", async ({ page }) => {
  await signInTo(page, ENDED_URL);
  await expect(page.getByText("This plan has ended.")).toBeVisible();
  await expect(page.getByText("the client cancelled the standing instruction")).toBeVisible();
  for (const label of ["Pause", "Resume", "End plan", "Catch up", "Revise"]) {
    expect(await page.getByRole("button", { name: label, exact: true }).count(), `${label} button`).toBe(0);
    expect(await page.getByRole("link", { name: label, exact: true }).count(), `${label} link`).toBe(0);
  }
  await scan(page, "ended plan detail");
});

// ===========================================================================================
// Stable URL, Back, keyboard, geometry, motion.
// ===========================================================================================

test("plans.walk.authority: the plan has a stable address — reload lands on the same plan, and Back returns to the list", async ({ page }) => {
  await signInTo(page, LIST_URL);
  await page.getByRole("link", { name: PLANS.purpose }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${PLANS.planId}$`));

  await page.reload();
  await expect(page.getByRole("heading", { name: PLANS.purpose })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/plans$`));
  await expect(page.getByRole("row").filter({ hasText: PLANS.purpose })).toBeVisible();
});

test("plans.walk.authority: the journey is reachable by keyboard alone, and the dialog is dismissable by Escape", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await ensureRealFocus(page);

  // TAB TO THE PAUSE TRIGGER and open it with the keyboard — no pointer anywhere in this cell.
  const trigger = page.getByRole("button", { name: "Pause", exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep scheduling" })).toBeFocused();

  // ESCAPE DISMISSES AND CHANGES NOTHING — the plan is still active afterwards.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger, "focus returns to the trigger the dialog was opened from").toBeFocused();
  await expect(page.getByText(/these dates are not being admitted/)).toBeHidden();
});

test("plans.walk.authority: 320 CSS px and 200% zoom — the plan detail fits and the page never scrolls sideways", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await expect(page.getByRole("heading", { name: PLANS.purpose })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("heading", { name: PLANS.purpose })).toBeVisible();
  await expect(page.getByText(/never initiates a bank payment/)).toBeVisible();
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  // A TWO-DIMENSIONAL MONEY GRID MAY SCROLL INSIDE ITS OWN LABELLED VIEWPORT (appendix C §4), but
  // the PAGE may not — that is exactly the distinction this measurement makes.
  expect(narrow.scroll, "the page itself must never scroll sideways at 320px").toBeLessThanOrEqual(narrow.client + 1);
  await scan(page, "plan detail at 320px");

  // The dialog is opened at the wide viewport and then narrowed, for the reason
  // work-cancel-walk.spec.ts records: below `lg` the Clara rail is an overlay and intercepts a
  // click on a page control, which is shell behaviour this ticket neither introduced nor owns.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await expect(page.getByRole("dialog").getByRole("button", { name: "Pause the plan" })).toBeVisible();
  const zoomed = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(zoomed.scroll, "…and not at 200% zoom either").toBeLessThanOrEqual(zoomed.client + 1);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  await page.keyboard.press("Escape");
});

test("plans.walk.authority: reduced motion — nothing in the pause dialog MOVES, and the opacity that remains is allowed to", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, DETAIL_URL);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // MOVEMENT ONLY. Opacity and colour are allowed under reduced motion; transform and the
  // geometric properties are not — the token contract's own rule, measured as computed style.
  const transformed = await page.evaluate(() =>
    [...document.querySelectorAll("[role='dialog'], [role='dialog'] *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)";
    }).length,
  );
  expect(transformed, "an element inside the pause dialog is transformed under reduced motion").toBe(0);
  await page.keyboard.press("Escape");
});
