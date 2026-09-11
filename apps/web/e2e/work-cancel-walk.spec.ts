import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { JOURNAL_WORK } from "./journal-work-mock.mjs";

/**
 * #630 · THE BROWSER LEG for cancelling Work — journey B3 (the durable Work detail) and the
 * separately named acts B7's rail carries.
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real focus manager (the safe action holds initial focus in a real dialog, and focus
 * RETURNS when the trigger unmounts because the status moved under it), real timers driving the
 * 3-second poll that converges `stopping` onto a terminal, a real address bar and Back, real layout
 * geometry at 320 CSS px and at 200% zoom, and a real `prefers-reduced-motion` media query.
 *
 * WHAT IT DOES NOT PROVE. The runtime's `/api/work/:id/cancel|take-over` legs are fixtures
 * (`journal-work-mock.mjs`). Nothing here establishes that `clara.cancel_accounting_work` really
 * serialises against a posting on one row lock, that a receipt really outranks a cancellation, or
 * that the boundary refuses `work_cancelled` — `packages/db/tests/work-cancel.test.mjs` and
 * `packages/runtime/tests/work-cancel-e2e.mjs` own those against a real Postgres. This lane owns
 * what the browser does with their answers.
 *
 * THE TWO LABELS ARE THE TICKET'S OWN ACCEPTANCE LINE, and the last cell is about nothing else:
 * "Stop reply" and "Cancel Work" are distinct strings, they do different things, and closing the
 * rail does neither.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = JOURNAL_WORK.clientId;
const COMPOSER_URL = `/clients/${CLIENT}/accounting/journal/new`;
const WORK_LIST_URL = `/clients/${CLIENT}/work`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** Drive the fixture through the app's OWN proxy, with the real session — see journal-work-walk's
 *  own note on why this is not an app-origin backdoor. */
async function control(page: Page, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return await page.evaluate(
    async (call: { path: string; payload: Record<string, unknown> }) => {
      const res = await fetch(call.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.payload),
      });
      return (await res.json()) as Record<string, unknown>;
    },
    { path: "/api/runtime/e2e-journal-work/control", payload: { client: CLIENT, ...body } },
  );
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

async function fillBalancedBasis(page: Page): Promise<void> {
  await page.getByLabel("Posting date").fill("2026-09-01");
  await page.getByLabel("Memo").fill("Office rent paid from Maybank");
  await page.getByLabel("Account, line 1").selectOption(JOURNAL_WORK.rentAccount);
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await page.getByLabel("Account, line 2").selectOption(JOURNAL_WORK.bankAccount);
  await page.getByLabel("Credit, line 2").fill("1200.00");
}

function workIdIn(url: string): string {
  const found = /\/work\/([0-9a-f-]{36})(?:$|[?#])/i.exec(url);
  expect(found, `no work id in ${url}`).toBeTruthy();
  return found![1]!;
}

/** Compose one Work and land on its detail page. Every cell starts here, because the walk must
 *  never learn a Work id any way but off the address bar. */
async function composeWork(page: Page): Promise<string> {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  return workIdIn(page.url());
}

test.beforeEach(async ({ page }) => {
  await signInTo(page, WORK_LIST_URL);
  await control(page, { op: "reset" });
});

test("B3 cancel: the dialog asks before it acts, the SAFE action holds focus, and Escape leaves the Work alone", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  const trigger = page.getByRole("button", { name: "Cancel Work" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // THE TITLE IS THE QUESTION, and the body says what STAYS before what stops.
  await expect(dialog.getByRole("heading", { name: "Cancel this Work?" })).toBeVisible();
  await expect(dialog.getByText("Anything already recorded stays recorded")).toBeVisible();

  // INITIAL FOCUS IS ON THE SAFE ACTION. Enter must not cancel somebody's Work for them.
  const keep = dialog.getByRole("button", { name: "Keep it running" });
  await expect(keep).toBeFocused();
  await scan(page, "work detail, cancel dialog open");

  // ESCAPE DISMISSES AND CHANGES NOTHING — the door was never called.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  const keys = (await control(page, { op: "cancel_keys" })).keys as string[];
  expect(keys, "opening and dismissing a dialog must never reach the door").toEqual([]);
  // …and focus RETURNS to the trigger that opened it.
  await ensureRealFocus(page);
  await expect(page.getByRole("button", { name: "Cancel Work" })).toBeFocused();
});

test("B3 cancel: STOPPING is shown while an admitted operation settles, and only then the terminal", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Cancel Work" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel this Work" }).click();

  // THE STOPPING ARM, not a terminal. This is the acceptance line that says a cancellation must not
  // be reported before the boundary is known.
  await expect(page.getByText("Stopping", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("already accepted is finishing")).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toHaveCount(0);
  // …and there is no second cancel to press while it is settling.
  await expect(page.getByRole("button", { name: "Cancel Work" })).toHaveCount(0);
  // FOCUS IS NOT LOST when the trigger unmounts under a status change.
  await ensureRealFocus(page);
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).not.toBe("BODY");
  await scan(page, "work detail, stopping");

  // THE ADDRESS DID NOT MOVE — a cancel is not a navigation.
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));

  // The boundary becomes known; the page's own 3-second poll converges on it.
  const settled = await control(page, { op: "settle_stopping", workId, outcome: "cancelled" });
  expect(settled.status, "the fixture actually settled the Work").toBe("cancelled");
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nothing was posted.")).toBeVisible();
  // …CARRYING WHAT THE RUN ASKED FOR, which `clara.settle_work_run` superseded. Asserted on the
  // WIRE first and on the page second: the two are different claims, and a page assertion alone
  // could fail for a rendering reason while the data was fine — or pass while the estate had
  // quietly dropped the fact.
  const wire = await page.evaluate(async (id: string) => {
    const res = await fetch(`/api/runtime/work/${id}`, { cache: "no-store" });
    return (await res.json()) as { work?: { error?: { superseded?: { outcome?: string } } } };
  }, workId);
  expect(wire.work?.error?.superseded?.outcome,
    "the run's own requested outcome rides under error.superseded").toBe("failed");
  await expect(page.getByText("The run reported failed as it stopped.")).toBeVisible({ timeout: 20_000 });
  await scan(page, "work detail, cancelled");

  // STABLE BACK: the composer is one step back, and the Work address is still the Work address.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(COMPOSER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
});

test("B3 cancel: a cancel that LOST the race shows the receipt and links the entry — never a cancellation", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await control(page, { op: "cancel_answer", mode: "already_completed" });

  await page.getByRole("button", { name: "Cancel Work" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel this Work" }).click();

  await expect(page.getByText("This Work completed before the cancellation reached it")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("a correction is a separate, linked operation")).toBeVisible();
  await expect(page.getByRole("link", { name: "View the entry" })).toBeVisible();
  // The Work converges on `completed`, and the page NEVER says the opposite of the books.
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nothing was posted.")).toHaveCount(0);
  await scan(page, "work detail, completed after a cancel");
});

test("B3 cancel: a DENIED cancel is a persistent banner, and the Work is untouched", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await control(page, { op: "cancel_answer", mode: "denied" });

  await page.getByRole("button", { name: "Cancel Work" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel this Work" }).click();

  await expect(page.getByText("You cannot cancel this Work")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("needs a bookkeeper role in this firm")).toBeVisible();
  // A REFUSAL IS A RECORD, not a toast: it is still there after the poll has run.
  await page.waitForTimeout(3_500);
  await expect(page.getByText("You cannot cancel this Work")).toBeVisible();
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  await scan(page, "work detail, cancel denied");
});

test("B3 take-over: an orphaned Work offers it, and an INTERPRETED basis is confirmed before it is taken", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "orphan", workId, origin: "clara_interpreted" });
  await expect(page.getByText("Refused", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("waiting for someone who can finish it")).toBeVisible();

  await page.getByRole("button", { name: "Take responsibility" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Take responsibility for this Work?" })).toBeVisible();
  await expect(dialog.getByText("Clara interpreted this basis from a conversation")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Not now" })).toBeFocused();
  await scan(page, "work detail, take-over confirm");

  await dialog.getByRole("button", { name: "take responsibility", exact: false }).last().click();
  await expect(page.getByText("You are responsible for this Work")).toBeVisible({ timeout: 15_000 });
  // A NEW RUN OF THE SAME WORK, at the SAME address.
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
  await expect(page.getByText("Queued", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});

test("320 CSS px and 200% zoom: the cancel dialog fits, and the page does not scroll sideways", async ({ page }) => {
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // THE DIALOG IS OPENED AT THE WIDE VIEWPORT AND THEN NARROWED, deliberately. At 320 px the Clara
  // rail becomes an OVERLAY (`fixed inset-y-0 right-0 z-40`) and covers the page behind it, so a
  // click on a page control is intercepted by the rail rather than reaching the button — a shell
  // behaviour this ticket neither introduced nor owns. What #630 has to prove at 320 px is that the
  // DIALOG fits and stays operable, and resizing with it open measures exactly that.
  await page.getByRole("button", { name: "Cancel Work" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel this Work" })).toBeVisible();
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(narrow.scroll, "the page itself must never scroll sideways at 320px").toBeLessThanOrEqual(narrow.client + 1);
  await scan(page, "cancel dialog at 320px");
  // NARROW DISMISSAL still works, and still changes nothing.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // 200% zoom is the same measurement at half the CSS viewport, and the dialog is opened at the
  // wide viewport for the same reason as above.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Cancel Work" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Cancel this Work?" })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Cancel this Work?" })).toBeVisible();
  const zoomed = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(zoomed.scroll, "…and not at 200% zoom either").toBeLessThanOrEqual(zoomed.client + 1);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
});

test("reduced motion: the cancel dialog does not MOVE, and the opacity that remains is allowed to", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workId = await composeWork(page);
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Cancel Work" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // MOVEMENT ONLY. Opacity and colour are allowed under reduced motion; transform and the
  // geometric properties are not — the token contract's own rule ("reduced motion removes
  // position, scale, stagger and parallax; opacity remains"), measured as computed style.
  const transformed = await page.evaluate(() =>
    [...document.querySelectorAll("[role='dialog'], [role='dialog'] *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)";
    }).length,
  );
  expect(transformed, "an element inside the cancel dialog is transformed under reduced motion").toBe(0);

  // …and the same on the page behind it, once the Work is stopping.
  await page.getByRole("dialog").getByRole("button", { name: "Cancel this Work" }).click();
  await expect(page.getByText("Stopping", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const moved = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)";
    }).length,
  );
  expect(moved, "an element on the stopping Work detail is transformed under reduced motion").toBe(0);
});
