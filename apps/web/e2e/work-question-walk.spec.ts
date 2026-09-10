import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { JOURNAL_WORK } from "./journal-work-mock.mjs";

/**
 * #629 · THE BROWSER LEG for the shared Work question — journeys B3 (answer it where the Work is
 * read) and B4 (answer the same question from Needs-you).
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one of them is a property the RTL harness structurally
 * cannot hold: a real focus manager driving first-invalid focus and keyboard progression through a
 * bounded stepper, a real `localStorage` that survives a NAVIGATION rather than a remount, real
 * layout geometry at 320 CSS px and at 200% zoom, a real `prefers-reduced-motion` media query, and
 * a real URL that Back can return to. The unit cells prove the rules; this proves the journey.
 *
 * IT SHARES #623's FIXTURE LANE, deliberately. `journal-work-mock.mjs` already owns this client,
 * its Work, its task and its chat thread, and #629's question lives on the SAME
 * `clara.agent_interruptions` row #623's banner reads. A second lane claiming the same client would
 * be the exact fixture-ownership collision `e2e-fixture-ownership.test.ts` exists to catch.
 *
 * WHAT IT DOES NOT PROVE. PostgREST's three doors are fixtures, so nothing below establishes that
 * `clara.answer_work_question` really serialises two answers on a row lock, refuses a reused op key
 * or converges a loser on the winner's record. `packages/db/tests/work-question.test.mjs` owns
 * those against a real Postgres under the real least-privileged roles, and
 * `packages/runtime/tests/work-question-e2e.mjs` owns the delivery back to a real parked run.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = JOURNAL_WORK.clientId;
const COMPOSER_URL = `/clients/${CLIENT}/accounting/journal/new`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  // 20s, not the 5s default: sign-in is a real round trip through the mock auth server plus a
  // server-rendered redirect, and on a loaded box (this lane runs beside a Postgres migration
  // chain and a Node test suite) the default is a stopwatch on the machine rather than a claim
  // about the product. Every ASSERTION below keeps its own tighter bound.
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 20_000 });
}

/** Drive the fixture's state machine through the app's OWN proxy — the only door the browser has
 *  to the runtime, so the call carries the real session and passes the real firm-scope guard. */
async function control(page: Page, body: Record<string, unknown>): Promise<void> {
  const status = await page.evaluate(
    async (call: { path: string; payload: Record<string, unknown> }) => {
      const res = await fetch(call.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.payload),
      });
      return res.status;
    },
    { path: JOURNAL_WORK.controlPath, payload: { client: CLIENT, ...body } },
  );
  expect(status, `the fixture control endpoint answered ${status}`).toBe(200);
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
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), what).toEqual([]);
}

function workIdIn(url: string): string {
  const found = /\/work\/([0-9a-f-]{36})(?:$|[?#])/i.exec(url);
  expect(found, `no work id in ${url}`).toBeTruthy();
  return found![1]!;
}

/** Admit a Work through the real composer, then park it on a two-field question. Returns the
 *  Work's id, which is also the page the walk is left on. */
async function parkOnQuestion(page: Page, extra: Record<string, unknown> = {}): Promise<string> {
  await control(page, { op: "reset" });
  await page.goto(COMPOSER_URL);
  await page.getByLabel("Posting date").fill("2026-09-01");
  await page.getByLabel("Memo").fill("Office rent, September");
  // The account controls are native `<select>`s over this client's own chart, so they are
  // SELECTED rather than typed — the same helper #623's own walk uses, for the same reason.
  await page.getByLabel("Account, line 1").selectOption(JOURNAL_WORK.rentAccount);
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await page.getByLabel("Account, line 2").selectOption(JOURNAL_WORK.bankAccount);
  await page.getByLabel("Credit, line 2").fill("1200.00");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "ask", workId, ...extra });
  await expect(page.getByTestId("work-question-form")).toBeVisible({ timeout: 15_000 });
  return workId;
}

test.beforeEach(async ({ page }) => {
  await signInTo(page, COMPOSER_URL);
});

test("B3: the parked question is ANSWERED where the Work is read — a bounded keyboard walk", async ({ page }) => {
  const workId = await parkOnQuestion(page);

  // The question, its REASON and its version — the record every surface renders.
  await expect(page.getByTestId("work-question-text")).toContainText("Which Maybank account did this rent leave from?");
  await expect(page.getByTestId("work-question-reason")).toContainText("The admitted basis names no posting date");
  await expect(page.getByTestId("work-question-version")).toContainText("Question 1");
  await expect(page.getByTestId("work-question-progress")).toContainText("Question 1 of 2");
  await scan(page, "work detail, parked on a typed question");

  // KEYBOARD PROGRESSION. Nothing below uses the mouse: a person who reaches this form by tabbing
  // must be able to finish it, and a stepper that only advances on click is a dead end for them.
  await page.getByLabel(/Posting date/).focus();
  await page.keyboard.type("2026-09-05");
  await page.getByTestId("work-question-next").press("Enter");
  await expect(page.getByLabel(/Amount/)).toBeVisible();

  // FIRST-INVALID FOCUS, on a value only the browser can refuse: three decimal places is not an
  // amount this lane can represent, and the form must say so ON the control rather than round it.
  await page.getByLabel(/Amount/).fill("1200.555");
  await page.getByTestId("work-question-next").press("Enter");
  await expect(page.getByTestId("work-question-error-amount_cents")).toBeVisible();
  await expect(page.getByLabel(/Amount/)).toBeFocused();

  await page.getByLabel(/Amount/).fill("1200.00");
  await page.getByTestId("work-question-next").press("Enter");
  await expect(page.getByTestId("work-question-review")).toBeVisible();

  await page.getByTestId("work-question-submit").press("Enter");
  // A PERSISTENT OUTCOME, not a toast: who answered, when, and under which version.
  await expect(page.getByTestId("work-question-accepted")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("work-question-attribution")).toContainText("question 1");
  await expect(page.getByTestId("work-question-submit")).toHaveCount(0, { timeout: 5_000 });
  await scan(page, "work detail, question answered");
  expect(workIdIn(page.url()), "answering never navigates away from the Work").toBe(workId);
});

test("a still-useful DRAFT survives a navigation and comes back on the same question", async ({ page }) => {
  const workId = await parkOnQuestion(page);
  await page.getByLabel(/Posting date/).fill("2026-09-07");

  // A REAL navigation away and back — the property a remount cannot prove.
  await page.goto(`/clients/${CLIENT}/work`);
  await page.goto(`/clients/${CLIENT}/work/${workId}`);
  await expect(page.getByTestId("work-question-form")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/Posting date/)).toHaveValue("2026-09-07");
});

test("ANSWERED ELSEWHERE converges on the authoritative record and KEEPS what was typed", async ({ page }) => {
  await parkOnQuestion(page);
  await page.getByLabel(/Posting date/).fill("2026-09-05");
  await page.getByTestId("work-question-next").click();
  await page.getByLabel(/Amount/).fill("1200.00");
  await page.getByTestId("work-question-next").click();

  // Somebody else answered while this person was typing. Armed rather than provoked: two browsers
  // racing one fixture is not a thing a single-worker Playwright run can stage.
  await control(page, {
    op: "refuse_answer",
    code: "CLR13",
    reason: "already_answered",
    message: "this question is no longer open (answered)",
    current: { status: "answered", question_version: 1, answered_by: "someone-else" },
    settle: {
      status: "answered",
      answer: { posting_date: "2026-09-02", amount_cents: 90000 },
      answered_by: "someone-else",
      answered_role: "owner",
      answered_at: "2026-09-11T01:00:00.000Z",
    },
  });
  await page.getByTestId("work-question-submit").click();

  await expect(page.getByTestId("work-question-converged")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("work-question-converged")).toContainText("Somebody else answered this question first");
  // THE AUTHORITATIVE ANSWER, re-read — not the one this person typed.
  await expect(page.getByTestId("work-question-accepted-posting_date")).toContainText("2026-09-02");
  // …and the draft is KEPT, because it may be exactly what a correction needs.
  await expect(page.getByTestId("work-question-kept-draft")).toContainText("2026-09-05");
  await expect(page.getByTestId("work-question-submit")).toHaveCount(0);
  await scan(page, "work detail, converged on an answer made elsewhere");
});

test("a STALE version refuses without discarding the draft, and offers the Work", async ({ page }) => {
  await parkOnQuestion(page);
  await page.getByLabel(/Posting date/).fill("2026-09-05");
  await page.getByTestId("work-question-next").click();
  await page.getByLabel(/Amount/).fill("1200.00");
  await page.getByTestId("work-question-next").click();
  await control(page, {
    op: "refuse_answer",
    code: "CLR13",
    reason: "stale_question",
    message: "this answer is for question version 1, the current version is 2",
    current: { status: "pending", question_version: 2 },
  });
  await page.getByTestId("work-question-submit").click();
  await expect(page.getByTestId("work-question-converged")).toContainText("asked again while you were typing");
  await expect(page.getByTestId("work-question-kept-draft")).toContainText("2026-09-05");
});

test("a DENIED caller gets a read-only surface, and the draft is still theirs", async ({ page }) => {
  await parkOnQuestion(page);
  await page.getByLabel(/Posting date/).fill("2026-09-05");
  await page.getByTestId("work-question-next").click();
  await page.getByLabel(/Amount/).fill("1200.00");
  await page.getByTestId("work-question-next").click();
  await control(page, {
    op: "refuse_answer",
    code: "CLR04",
    reason: "client_inactive",
    message: "this client is not active",
  });
  await page.getByTestId("work-question-submit").click();
  await expect(page.getByTestId("work-question-denied")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("work-question-submit")).toHaveCount(0);
  await expect(page.getByTestId("work-question-kept-draft")).toContainText("2026-09-05");
});

test("320 CSS px and 200% zoom keep the question, its controls and its actions usable", async ({ page }) => {
  await parkOnQuestion(page);

  await page.setViewportSize({ width: 320, height: 720 });
  await settle(page);
  await expect(page.getByTestId("work-question-text")).toBeVisible();
  await expect(page.getByLabel(/Posting date/)).toBeVisible();
  await expect(page.getByTestId("work-question-next")).toBeVisible();
  // NO PAGE-WIDE HORIZONTAL SCROLL — §4's own rule. A form a person has to pan sideways to finish
  // is one they cannot finish on a phone.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    "the document does not scroll horizontally at 320 CSS px",
  ).toBe(true);
  await scan(page, "work question at 320 CSS px");

  // 200% ZOOM, modelled the way every sibling walk models it: half the CSS viewport at the same
  // device pixels is what a browser's 200% actually produces.
  await page.setViewportSize({ width: 640, height: 512 });
  await settle(page);
  await expect(page.getByTestId("work-question-text")).toBeVisible();
  await expect(page.getByTestId("work-question-next")).toBeVisible();
  await scan(page, "work question at 200% zoom");
});

test("REDUCED MOTION is respected — the form's own controls declare no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await parkOnQuestion(page);
  await expect(page.getByTestId("work-question-form")).toBeVisible();

  // MEASURED ON COMPUTED STYLE, NOT ON `document.getAnimations()`. The first version of this cell
  // counted RUNNING finite animations the instant the form appeared, and that is a race rather
  // than a measurement: a page-level arrival transition elsewhere in the shell can still be in
  // flight, and the cell then reports a shortfall that has nothing to do with this form. It
  // passed in isolation and failed under load — which is exactly the profile of a test that
  // measures timing instead of behaviour. What the contract actually asks is that the form's own
  // controls do not MOVE, and a computed `transition-duration` of 0s is that, deterministically.
  const durations = await page.getByTestId("work-question-form").evaluate((root) =>
    [root, ...root.querySelectorAll("button, input, textarea")].map((el) => {
      const style = getComputedStyle(el as Element);
      return `${style.transitionDuration}|${style.animationDuration}`;
    }),
  );
  expect(durations.length, "the form actually rendered controls to measure").toBeGreaterThan(1);
  for (const pair of durations) {
    expect(pair, "no control inside the form transitions or animates under prefers-reduced-motion")
      .toMatch(/^0s(?:, ?0s)*\|0s(?:, ?0s)*$/);
  }
});

test("LEAVE PENDING is not offered on the Work's own page — that page IS the question", async ({ page }) => {
  await parkOnQuestion(page);
  // §3's "do not force a guessed option" is satisfied here by simply LEAVING: the Work detail is
  // an address, not a modal, so navigating away is the leave-pending affordance and a second
  // button offering to do nothing would be noise. The inbox row, which collapses rather than
  // navigates, is where the explicit control lives.
  await expect(page.getByTestId("work-question-leave")).toHaveCount(0);
  await expect(page.getByText("You do not have to guess")).toBeVisible();
});
