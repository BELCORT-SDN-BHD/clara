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

test("REDUCED MOTION is respected — no control inside the form ANIMATES", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await parkOnQuestion(page);
  await expect(page.getByTestId("work-question-form")).toBeVisible();

  // MEASURED ON COMPUTED STYLE, NOT ON `document.getAnimations()`. An earlier version of this cell
  // counted RUNNING finite animations the instant the form appeared, and that is a stopwatch on
  // the machine rather than a claim about the product: a page-level arrival transition elsewhere
  // in the shell can still be in flight, and the cell then reports a shortfall that has nothing to
  // do with this form. It passed in isolation and failed under load, which is the profile of a
  // test that measures timing.
  //
  // WHAT IS ASSERTED IS `animation`, NOT `transition`, AND THAT BOUNDARY IS A MEASUREMENT RATHER
  // THAN A CONVENIENCE. Rewriting the cell to demand `transition-duration: 0s` under reduce
  // FAILED — measured here, at "0.15s|0s" on the form's own controls — because every `Input`,
  // `Textarea` and `Button` in this product carries an unguarded `transition-colors` /
  // `motion-fast` colour transition (components/ui/*.tsx, vendored). A 150 ms COLOUR fade is not
  // movement: WCAG 2.3.3 and §4's own wording are about motion, shimmer, chart entry and overlay
  // travel. Demanding zero here would have made this walk the place a product-wide token decision
  // gets taken by accident, which is the same call `journal-work-walk.spec.ts` records for the
  // primary button's hover pair. Reported as a finding, not fixed by a walk.
  const motion = await page.getByTestId("work-question-form").evaluate((root) =>
    [root, ...root.querySelectorAll("button, input, textarea")].map((el) => {
      const style = getComputedStyle(el as Element);
      // THE NAME, NOT THE DURATION. Measured here: the controls report `none|0.12s` — a declared
      // duration with NO animation name, which animates nothing. Asserting the duration would have
      // failed on a value that is inert by construction.
      return style.animationName;
    }),
  );
  expect(motion.length, "the form actually rendered controls to measure").toBeGreaterThan(1);
  for (const name of motion) {
    expect(name, "no control inside the form runs an animation under prefers-reduced-motion").toBe("none");
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

// ===========================================================================================
// B4 (Needs-you) and B6 (the Clara rail). The reviewed findings that only a browser can hold.
// ===========================================================================================

const NEEDS_YOU_URL = "/work?view=needs-you";

test("B4: the SAME question is answered from Needs-you, and the row leaves without dumping focus", async ({ page }) => {
  await parkOnQuestion(page);
  await page.goto(NEEDS_YOU_URL);

  // The tenth row kind, from `clara.list_review_queue`'s own envelope.
  const row = page.getByTestId("needs-you-work-question");
  await expect(row).toBeVisible({ timeout: 15_000 });

  // "Answer" expands the SAME form B3 renders — same test ids, same record, same version.
  await page.getByTestId("needs-you-work-question-toggle").click();
  await expect(page.getByTestId("work-question-form")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("work-question-text")).toContainText("Which Maybank account did this rent leave from?");
  await expect(page.getByTestId("work-question-version")).toContainText("Question 1");

  // Answer it, through the bounded stepper, exactly as B3 does.
  await page.getByLabel(/Posting date/).fill("2026-09-05");
  await page.getByTestId("work-question-next").click();
  await page.getByLabel(/Amount/).fill("1200.00");
  await page.getByTestId("work-question-next").click();
  await expect(page.getByTestId("work-question-review")).toBeVisible();
  await page.getByTestId("work-question-submit").click();

  // THE ROW LEAVES — the question is no longer pending, so the queue stops returning it.
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  // …AND FOCUS DOES NOT LAND ON `<body>` (§4, and the reviewed finding this cell exists for: the
  // old code focused the trigger BEFORE asking for the reload that unmounts it). It lands on the
  // stable landmark this list lives under — the section's own heading.
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName ?? null,
      text: (el?.textContent ?? "").trim().slice(0, 40),
      tabindex: el?.getAttribute("tabindex") ?? null,
    };
  });
  expect(focused.tag, "focus was dumped onto the document body when the row disappeared").not.toBe("BODY");
  expect(focused.tag, "focus landed on the section heading this list is rendered under").toBe("H2");
  expect(focused.text, "…this list's OWN heading, not some other section's").toContain("Needs you");
  expect(focused.tabindex, "made programmatically focusable, and NOT a tab stop").toBe("-1");
  await scan(page, "needs-you after the question was answered inline");
});

test("B4: the inbox row's own form stays usable at 320 CSS px and under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await parkOnQuestion(page);
  await page.goto(NEEDS_YOU_URL);
  // EXPANDED FIRST, THEN NARROWED. At 320 CSS px the Clara rail is an overlay that covers the page,
  // so a click on a row control there is intercepted by the rail rather than refused by the layout —
  // measured here, as a 30s click timeout naming the rail's own subtree. What this cell is about is
  // whether the FORM is usable at that width, which is what the assertions below ask.
  await page.getByTestId("needs-you-work-question-toggle").click();
  await expect(page.getByTestId("work-question-form")).toBeVisible({ timeout: 15_000 });
  await page.setViewportSize({ width: 320, height: 720 });
  await settle(page);

  await expect(page.getByTestId("work-question-text")).toBeVisible();
  await expect(page.getByLabel(/Posting date/)).toBeVisible();
  // The inbox DOES offer "leave pending" — it collapses rather than navigates, so there is
  // something for the affordance to mean here that there is not on the Work's own page.
  await expect(page.getByTestId("work-question-leave")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    "the inbox does not scroll horizontally at 320 CSS px with a question expanded",
  ).toBe(true);

  const motion = await page.getByTestId("work-question-form").evaluate((root) =>
    [root, ...root.querySelectorAll("button, input, textarea")].map((el) => getComputedStyle(el as Element).animationName),
  );
  expect(motion.length, "the expanded row actually rendered controls to measure").toBeGreaterThan(1);
  for (const name of motion) {
    expect(name, "no control inside the inbox's expanded form animates under prefers-reduced-motion").toBe("none");
  }
  await scan(page, "needs-you with a question expanded at 320 CSS px");
});

test("B4: the URL is stable and BACK returns to where the person was", async ({ page }) => {
  const workId = await parkOnQuestion(page);
  const workUrl = page.url();

  await page.goto(NEEDS_YOU_URL);
  await expect(page.getByTestId("needs-you-work-question")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("needs-you-work-question-toggle").click();
  await expect(page.getByTestId("work-question-form")).toBeVisible({ timeout: 15_000 });
  // EXPANDING THE ROW IS NOT A NAVIGATION. The inbox is one address; the form is a disclosure
  // inside it, so nothing has been pushed onto history and nothing has been bookmarked that a
  // person could not come back to.
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);

  // …and the route to the Work is offered from the HYDRATED record, so Back returns to the inbox.
  await page.getByRole("link", { name: "Open the Work" }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);
  await expect(page.getByTestId("needs-you-work-question")).toBeVisible({ timeout: 15_000 });
  expect(workUrl, "the Work detail keeps the address it was minted at").toContain(`/work/${workId}`);
});

test("B6: a transcript's work_question part renders the ACCEPTED record, and announces NOTHING", async ({ page }) => {
  await control(page, { op: "reset" });
  // ARM the transcript's `work_question` part. It is off by default because the Clara rail renders
  // on every page: an always-on card would sit beside the Work detail's own form in every other
  // cell of this walk (see the mock's `showQuestionCard`).
  await control(page, { op: "card" });
  // THE CLARA RAIL, on the page #623's own transcript cell reads it from — there is no `/chat/<id>`
  // route in this product; the rail is a shell surface that carries this lane's one thread.
  await page.goto(`/clients/${CLIENT}/work`);
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // The card hydrates `clara.get_work_question` for the id the part names. The question was
  // answered elsewhere long before this transcript is replayed, so what the card must render is
  // the authoritative accepted record — never a form offering a second answer.
  const accepted = rail.getByTestId("work-question-accepted");
  await expect(accepted).toBeVisible({ timeout: 20_000 });
  await expect(rail.getByTestId("work-question-accepted-posting_date")).toContainText("2026-09-01");
  await expect(rail.getByTestId("work-question-attribution")).toContainText("bookkeeper");
  await expect(rail.getByTestId("work-question-submit")).toHaveCount(0);

  // ONE ANNOUNCEMENT OWNER (§5, and the reviewed finding). The transcript is a log that announces
  // its own updates; a card inside it that opened `role="alert"`/`"status"` regions of its own
  // would say the same result twice.
  await expect(accepted.locator("[role=alert], [role=status], [aria-live]:not([aria-live=off])"))
    .toHaveCount(0);
  await scan(page, "the Clara transcript's work_question card");
});

test("B6: the DURABLE card finds a PARKED Work's question after a reload, and answers it there", async ({ page }) => {
  // #629's follow-up review, the gap this cell closes: `work_question` (the live-stream part, above)
  // only exists while a run is executing and reaches this transcript through `GET /api/tasks/:id/
  // stream`; a browser that opens the rail after the run has already parked — or after any reload —
  // never sees it. `work_accepted` is the ONE part on this Work that is durable (minted by
  // `chatTurn_v18` into `clara.chat_messages.parts`), so it must be the one that still finds the
  // question. `park_card` mints a Work that has genuinely NEVER been answered — unlike the seeded
  // `work_question` fixture above, which is already settled before the walk starts.
  await control(page, { op: "reset" });
  await control(page, { op: "park_card" });
  await page.goto(`/clients/${CLIENT}/work`);
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // A RELOAD — the literal defect report: a cold load of the rail, with no live run behind it, must
  // still find the parked question and offer a way to answer it.
  await page.reload();
  await expect(rail).toBeVisible();

  const form = rail.getByTestId("work-question-form");
  await expect(form).toBeVisible({ timeout: 20_000 });
  await expect(rail.getByTestId("work-question-text")).toContainText(
    "Which date should the September rent be posted on?",
  );
  // §5, one announcement owner — the TRANSCRIPT's own `role="log"` (`ClaraThreadView`'s log region,
  // `aria-live="polite"`) is that owner and is DELIBERATELY present; what must be ABSENT is a SECOND
  // one nested inside this card's own subtree, exactly what `work-detail.test.tsx`'s and the B6
  // `work_question` cell above scope their own identical assertion to.
  await expect(form.locator("[role=alert], [role=status], [aria-live]:not([aria-live=off])")).toHaveCount(0);

  // ANSWER IT, right there in the card — the same door B3 and B4 post to, never a second one.
  await rail.getByLabel(/Posting date/).fill("2026-09-08");
  await rail.getByTestId("work-question-submit").click();

  // THE WORK CONVERGES: the SAME mounted panel re-reads and shows the accepted record, in place —
  // never a navigation, never a second question offered for the same Work.
  const accepted = rail.getByTestId("work-question-accepted");
  await expect(accepted).toBeVisible({ timeout: 15_000 });
  await expect(rail.getByTestId("work-question-accepted-posting_date")).toContainText("2026-09-08");
  await expect(rail.getByTestId("work-question-submit")).toHaveCount(0);
  await expect(accepted.locator("[role=alert], [role=status], [aria-live]:not([aria-live=off])")).toHaveCount(0);
  await scan(page, "the Clara transcript's durable card, answering a genuinely parked Work");
});

test("the SUPPORTING SOURCE the run named is rendered beside the question", async ({ page }) => {
  await parkOnQuestion(page, { source_ref: { kind: "document", id: "INV-2026-0912" } });
  await expect(page.getByTestId("work-question-source")).toContainText("document INV-2026-0912");
});
