import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus, settleForScan, signInTo } from "./helpers";
import { ACC } from "./accrual-mock.mjs";

/**
 * #652 · THE BROWSER LEG for journeys C3/C8 — "locate the accrual route, state the amount, the
 * accounts, the service period, the authority and the schedule, and see the accrual, its due dates
 * and the reversal bound to the entry it undoes."
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real focus manager (a refused control is FOCUSED, not merely marked), a real address bar
 * and Back, a real `sessionStorage` surviving a real reload, real layout geometry at 320 CSS px and
 * at 200% zoom, a real `prefers-reduced-motion` media query, and a real re-read after a governed
 * write (the list must SHOW the new accrual because the destination re-read, not because the form
 * painted its own optimistic answer).
 *
 * IT CARRIES THE CREATE CELL `plans-walk.spec.ts` DOES NOT HAVE. That walk's nine cells are all
 * list/detail/lifecycle — `grep '/new'` in it returns nothing — so the multi-section create surface
 * this whole family of journeys centres on was unproven end to end before this file. The hole is
 * named here rather than quietly inherited.
 *
 * WHAT IT DOES NOT PROVE. The accrual doors are fixtures (`accrual-mock.mjs`). Nothing here
 * establishes that `clara.create_accrual_adjustment` really refuses a silent term, really writes
 * plan + revision + accrual + occurrence + Work in one commit, or that a reversal is really bound
 * to a posted entry — `packages/db/tests/accrual-adjustments.test.mjs` and
 * `packages/runtime/tests/accrual-e2e.mjs` own those against a real Postgres. This lane owns what
 * the browser does with their answers.
 *
 * BOTH BOUNDARY SENTENCES ARE ASSERTED ON EVERY SURFACE, deliberately. "A configuration receipt is
 * not an executed occurrence" and "an accrual is not a periodic stock adjustment" are the two the
 * acceptance requires to be persistent rather than transient, and a cell that checked either once
 * on one page would not be measuring "persistent".
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = ACC.clientId;
const LIST_URL = `/clients/${CLIENT}/accruals`;
const NEW_URL = `/clients/${CLIENT}/accruals/new`;
const DETAIL_URL = `/clients/${CLIENT}/accruals/${ACC.accrualId}`;
const UNPOSTED_URL = `/clients/${CLIENT}/accruals/${ACC.unpostedAccrualId}`;
const CORRECTABLE_URL = `/clients/${CLIENT}/accruals/${ACC.correctableAccrualId}`;
const CORRECTABLE_CORRECT_URL = `${CORRECTABLE_URL}/correct`;
const CORRECTED_URL = `/clients/${CLIENT}/accruals/${ACC.correctedAccrualId}`;

const CONFIG_BOUNDARY = /Accepting this configuration records the accrual/;
const SHAPE_BOUNDARY = /has no schedule and no future occurrence/;

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

/** Fill every control the door needs, by its ACCESSIBLE NAME — which is also the assertion that
 *  each control HAS one. `liability` is a parameter because the refusal cell drives a leg the form
 *  admits and the door refuses; that is the only way to reach the server-refusal path at all. */
async function fillForm(page: Page, opts: { liability?: string; purpose?: string } = {}): Promise<void> {
  await page.getByLabel("What is being accrued").fill(opts.purpose ?? "Monthly cleaning contract accrual");
  await page.getByLabel("Instruction that authorises this").selectOption(ACC.authorityWorkId);
  await page.getByLabel("From", { exact: true }).fill("2026-07-01");
  await page.getByLabel("To", { exact: true }).fill("2026-07-31");
  await page.getByLabel("Amount accrued").fill("880.00");
  await page.getByLabel("Expense account").selectOption("6100");
  await page.getByLabel("Liability account").selectOption(opts.liability ?? "2020");
  await page.getByLabel("The instruction, in the client's own terms")
    .fill("The client's standing instruction of 2026-06-30, minuted by the engagement partner.");
  // THE AUTHORITY WINDOW SITS INSIDE THE STATED TERM (0222's SIXTH MEASUREMENT): the form
  // refuses a schedule that would post outside the period it names, before any round trip.
  await page.getByLabel("Authority starts").fill("2026-07-01");
  await page.getByLabel("Authority ends").fill("2026-07-31");
}

// ===========================================================================================
// accrual.walk.evidenced — the whole journey, one screen at a time.
// ===========================================================================================

test("accrual.walk.evidenced: the list names what is accrued, its service period, its money and whether it has POSTED, and both boundaries are persistent", async ({ page }) => {
  await signInTo(page, LIST_URL);

  // BOTH BOUNDARIES, on first paint and not a toast.
  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  await expect(page.getByText(SHAPE_BOUNDARY)).toBeVisible();

  const posted = page.getByRole("row").filter({ hasText: ACC.purpose });
  await expect(posted).toBeVisible();
  await expect(posted).toContainText("2026-07-01 to 2026-07-31");
  await expect(posted).toContainText("1,200.00");
  await expect(posted).toContainText("Dr 6100 / Cr 2020");
  await expect(posted).toContainText("Posted");

  // THE OTHER SIDE OF THE BOUNDARY, as a row rather than as a sentence: an accrual that has been
  // CONFIGURED and has posted nothing.
  const unposted = page.getByRole("row").filter({ hasText: ACC.unpostedPurpose });
  await expect(unposted).toContainText("Configured");
  await expect(unposted).toContainText("4,500.00");
  await expect(unposted).toContainText("The amount stated here, accrued in every period of the authority window");

  await scan(page, "accrual list");
});

test("accrual.walk.evidenced: the detail carries the particulars, the authority, the whole occurrence lineage and the reversal's binding", async ({ page }) => {
  await signInTo(page, DETAIL_URL);

  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  await expect(page.getByText(SHAPE_BOUNDARY)).toBeVisible();
  await expect(page.getByRole("heading", { name: ACC.purpose })).toBeVisible();

  // THE TERM AND ITS LAW, together. The term appears TWICE on this page — once as the service
  // period and once as the authority window — because this accrual accrues one stated period and
  // its schedule runs exactly inside it (0222's SIXTH MEASUREMENT: the window is bracketed by the
  // term, so every entry posts within the period it names).
  await expect(page.getByText("2026-07-01 to 2026-07-31")).toHaveCount(2);
  await expect(page.getByText("2026-07-01 to 2026-07-31").first()).toBeVisible();
  await expect(page.getByText(/Stated by a person; a period read off a document by a model is never recorded here\./)).toBeVisible();
  await expect(page.getByText("The amount stated here, accrued in every period of the authority window")).toBeVisible();
  await expect(page.getByText("1,200.00")).toBeVisible();

  // THE AUTHORITY IS A ROW, and it links to the Work that carries it.
  await expect(page.getByRole("link", { name: ACC.authorityWorkId })).toBeVisible();
  await expect(page.getByText(/minuted by the engagement partner/)).toBeVisible();

  // THE LINEAGE: the accrual leg names its Work and its posted entry; the reversal names the entry
  // it undoes. Both facts come from the door's own join, and both are on screen.
  const accrualRow = page.getByRole("row").filter({ hasText: "2026-07-31" });
  await expect(accrualRow).toContainText("Accrual");
  await expect(accrualRow).toContainText("completed");
  const reversalRow = page.getByRole("row").filter({ hasText: "2026-08-01" });
  await expect(reversalRow).toContainText("Reversal");
  await expect(reversalRow).toContainText(`Reverses entry ${ACC.entryId}`);
  await expect(page.getByText(new RegExp(`The reversal due on 2026-08-01 reverses entry ${ACC.entryId}`))).toBeVisible();

  await scan(page, "accrual detail");
});

test("accrual.walk.evidenced: a CONFIGURED accrual says so, and a refused reversal shows the database's own typed reason", async ({ page }) => {
  await signInTo(page, UNPOSTED_URL);

  await expect(page.getByText(/Nothing has been posted for this accrual yet\./)).toBeVisible();
  // THE ORPHAN WALL AS HISTORY. `primary_state` is the fact a reader most needs: "admitted but
  // nothing posted yet" is a different next move from "no occurrence at all".
  const refused = page.getByRole("row").filter({ hasText: "2026-10-01" });
  await expect(refused).toContainText("reversal_before_primary");
  await expect(refused).toContainText("Accrual state: not_posted");
  await expect(refused).toContainText("this reversal has no posted accrual behind it to reverse");
  await scan(page, "configured-but-unposted accrual detail");
});

// ===========================================================================================
// THE CREATE CELL — the hole in plans-walk.spec.ts, filled.
// ===========================================================================================

test("accrual.walk.evidenced: the form refuses a SILENT TERM before admission, focuses the control that holds it, and keeps everything else typed", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await ensureRealFocus(page);

  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  await expect(page.getByText(SHAPE_BOUNDARY)).toBeVisible();

  await fillForm(page);
  // …and then TAKE THE TERM AWAY. This is the ticket's own acceptance line: a silent term is
  // refused, and refused HERE rather than admitted hoping a Work question completes the basis.
  await page.getByLabel("From", { exact: true }).fill("");
  await page.getByRole("button", { name: "Record the accrual" }).click();

  await expect(page.getByText("State the service period this cost belongs to.")).toBeVisible();
  await expect(page.getByLabel("From", { exact: true })).toBeFocused();
  // NOTHING ELSE WAS LOST (§3: "preserve user input").
  await expect(page.getByLabel("What is being accrued")).toHaveValue("Monthly cleaning contract accrual");
  await expect(page.getByLabel("Amount accrued")).toHaveValue("880.00");
  // AND NOTHING WAS RECORDED: the list still holds the two it started with.
  await page.goto(LIST_URL);
  await expect(page.getByRole("row").filter({ hasText: "Monthly cleaning contract accrual" })).toHaveCount(0);
});

test("accrual.walk.evidenced: a stated ZERO is a TERM refusal at the amount, not an unbalanced-basis one", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await ensureRealFocus(page);
  await fillForm(page);
  await page.getByLabel("Amount accrued").fill("0.00");
  await page.getByRole("button", { name: "Record the accrual" }).click();

  await expect(page.getByText("State the amount accrued. An accrual of zero accrues nothing.")).toBeVisible();
  await expect(page.getByLabel("Amount accrued")).toBeFocused();
});

test("accrual.walk.evidenced: a SERVER refusal renders as a persistent banner on the control it names — never a toast", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await ensureRealFocus(page);
  // A liability leg the FORM ADMITS — 2050 is an active liability of this client, and the account
  // CLASS is a database fact the browser does not hold — and the DOOR REFUSES as a control account.
  await fillForm(page, { liability: "2050" });
  await page.getByRole("button", { name: "Record the accrual" }).click();

  const refusal = page.getByText(/names the payable control account; an accrual carries no identified open item/);
  await expect(refusal).toBeVisible();
  await expect(page.getByLabel("Liability account")).toBeFocused();
  // PERSISTENT: it is still there after a settle, and after the pointer has moved away.
  await settle(page);
  await page.mouse.move(400, 400);
  await expect(refusal).toBeVisible();
  await scan(page, "accrual form with a server refusal");
});

test("accrual.walk.evidenced: a complete accrual is recorded, the destination RE-READS it, and the list shows it", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await fillForm(page);
  await page.getByRole("button", { name: "Record the accrual" }).click();

  // THE DESTINATION IS THE ACCRUAL'S OWN DURABLE ADDRESS, and it re-reads rather than painting the
  // door's answer: what is on screen is `get_accrual_adjustment`'s, not `create_`'s.
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.createdAccrualId}$`));
  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  await expect(page.getByText(/Nothing has been posted for this accrual yet\./)).toBeVisible();

  await page.goto(LIST_URL);
  await expect(page.getByRole("row").filter({ hasText: "Monthly cleaning contract accrual" })).toBeVisible();
});

test("accrual.walk.evidenced: the derived lines are on screen and cannot be edited", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await fillForm(page);
  await expect(page.getByText(/These two lines follow from the amount and the accounts/)).toBeVisible();
  const enabled = await page.evaluate(() =>
    [...document.querySelectorAll("input[id^='journal-line-'], select[id^='journal-line-']")]
      .filter((el) => !(el as HTMLInputElement).disabled).length);
  expect(enabled, "the derived preview holds no enabled control").toBe(0);
});

// ===========================================================================================
// Stable URL, Back, the draft, keyboard, geometry, motion.
// ===========================================================================================

test("accrual.walk.evidenced: the accrual has a stable address — reload lands on the same accrual, and Back returns to the list", async ({ page }) => {
  await signInTo(page, LIST_URL);
  await page.getByRole("link", { name: ACC.purpose }).click();
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.accrualId}$`));

  await page.reload();
  await expect(page.getByRole("heading", { name: ACC.purpose })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/accruals$"));
  await expect(page.getByRole("row").filter({ hasText: ACC.purpose })).toBeVisible();
});

test("accrual.walk.evidenced: a half-typed accrual SURVIVES a reload, and never crosses into another client", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await page.getByLabel("What is being accrued").fill("Half-typed quarterly insurance accrual");
  await page.getByLabel("Amount accrued").fill("640.00");
  await page.getByLabel("From", { exact: true }).fill("2026-07-01");

  await page.reload();
  await expect(page.getByLabel("What is being accrued")).toHaveValue("Half-typed quarterly insurance accrual");
  await expect(page.getByLabel("Amount accrued")).toHaveValue("640.00");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-07-01");

  // A SCOPE CHANGE NEVER TRANSFERS A DRAFT. The key carries user+firm+client, so another client's
  // form simply has no draft of this one's to find — and coming back still finds it.
  await page.goto(`/clients/${ACC.otherClientId}/accruals/new`);
  await expect(page.getByLabel("What is being accrued")).toHaveValue("");
  await page.goto(NEW_URL);
  await expect(page.getByLabel("What is being accrued")).toHaveValue("Half-typed quarterly insurance accrual");
});

test("accrual.walk.evidenced: the journey is reachable by keyboard alone, and every control has a name", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await ensureRealFocus(page);

  // NO POINTER ANYWHERE IN THIS CELL. Focus the first control, then walk forward with Tab and
  // assert the order the eye reads is the order the keyboard takes.
  const purpose = page.getByLabel("What is being accrued");
  await purpose.focus();
  await expect(purpose).toBeFocused();
  await page.keyboard.type("Keyboard-only accrual");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Instruction that authorises this")).toBeFocused();

  // AND THE SUBMIT IS REACHABLE AND OPERABLE BY KEYBOARD: the refusal that follows is the form
  // refusing an incomplete accrual, which is exactly the outcome a keyboard user must be able to
  // reach without a mouse.
  await page.getByRole("button", { name: "Record the accrual" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Choose the instruction that authorises this accrual.")).toBeVisible();
});

test("accrual.walk.evidenced: 320 CSS px and 200% zoom — the form fits and the page never scrolls sideways", async ({ page }) => {
  await signInTo(page, NEW_URL);
  await expect(page.getByLabel("What is being accrued")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByLabel("What is being accrued")).toBeVisible();
  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  await expect(page.getByText(SHAPE_BOUNDARY)).toBeVisible();
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  // A TWO-DIMENSIONAL MONEY GRID MAY SCROLL INSIDE ITS OWN LABELLED VIEWPORT (appendix C §4), but
  // the PAGE may not — that is exactly the distinction this measurement makes.
  expect(narrow.scroll, "the page itself must never scroll sideways at 320px").toBeLessThanOrEqual(narrow.client + 1);
  await scan(page, "accrual form at 320px");

  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await expect(page.getByRole("button", { name: "Record the accrual" })).toBeVisible();
  const zoomed = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(zoomed.scroll, "…and not at 200% zoom either").toBeLessThanOrEqual(zoomed.client + 1);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
});

test("accrual.walk.evidenced: 320 CSS px on the detail — the whole lineage table stays readable", async ({ page }) => {
  await signInTo(page, DETAIL_URL);
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("heading", { name: ACC.purpose })).toBeVisible();
  await expect(page.getByText(CONFIG_BOUNDARY)).toBeVisible();
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(narrow.scroll, "the page itself must never scroll sideways at 320px").toBeLessThanOrEqual(narrow.client + 1);
  await scan(page, "accrual detail at 320px");
});

test("accrual.walk.evidenced: reduced motion — nothing on the form MOVES, and the opacity that remains is allowed to", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, NEW_URL);
  await fillForm(page, { liability: "2050" });
  await page.getByRole("button", { name: "Record the accrual" }).click();
  await expect(page.getByText(/names the payable control account/)).toBeVisible();

  // MOVEMENT ONLY. Opacity and colour are allowed under reduced motion; transform and the
  // geometric properties are not — the token contract's own rule, measured as computed style.
  const transformed = await page.evaluate(() =>
    [...document.querySelectorAll("main, main *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)";
    }).length,
  );
  expect(transformed, "an element on the accrual form is transformed under reduced motion").toBe(0);
});

// ===========================================================================================
// #936 — THE DEDICATED ACCRUAL-CORRECTION DOOR. The seams this file's own header names for
// CREATE apply again here: a real focus manager, a real navigation and a real re-read after the
// governed write — plus one this journey adds, the CORRECTION LINEAGE rendered on two different
// rows' own detail pages. What is FAKED is still PostgREST; `clara.correct_accrual_adjustment`'s
// own contract — the plan revision and the accrual detail agreeing, occurrences unmoved, one
// correction per target — is `packages/db/tests/accrual-correction.test.mjs`'s to prove.
// ===========================================================================================

test("accrual.walk.correction: the lineage renders on BOTH sides of an already-corrected pair, and reads back through a real navigation", async ({ page }) => {
  await signInTo(page, CORRECTED_URL);
  await expect(page.getByRole("heading", { name: ACC.correctedPurpose })).toBeVisible();
  const successorLink = page.getByRole("link", { name: ACC.correctedSuccessorId });
  await expect(successorLink).toBeVisible();
  // AN ALREADY-CORRECTED ROW OFFERS NO CORRECTION CONTROL — the successor is where a further
  // correction belongs, never a second write to a row a correction has already superseded.
  await expect(page.getByRole("link", { name: "Correct this accrual" })).toHaveCount(0);

  await successorLink.click();
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.correctedSuccessorId}$`));
  await expect(page.getByRole("link", { name: ACC.correctedAccrualId })).toBeVisible();
  // …and THIS row, being the live end of the chain, DOES offer the control.
  await expect(page.getByRole("link", { name: "Correct this accrual" })).toBeVisible();

  await scan(page, "corrected accrual detail with lineage");
});

test("accrual.walk.correction: an already-corrected accrual's own /correct route shows the refusal face, never a form that can only refuse", async ({ page }) => {
  await signInTo(page, `${CORRECTED_URL}/correct`);
  await expect(page.getByText("This accrual has already been corrected")).toBeVisible();
  // 裁-187: no control whose only possible outcome is a refusal.
  await expect(page.getByLabel("Amount accrued")).toHaveCount(0);
  const open = page.getByRole("link", { name: "Open the successor" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.correctedSuccessorId}$`));
});

test("accrual.walk.correction: the correction form is SEEDED from the live accrual, and a SERVER refusal renders as a persistent banner on the control it names", async ({ page }) => {
  await signInTo(page, CORRECTABLE_CORRECT_URL);
  await ensureRealFocus(page);
  await expect(page.getByLabel("Amount accrued")).toHaveValue("2,500.00");
  await expect(page.getByLabel("Expense account")).toHaveValue("6100");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-07-01");
  // THE FROZEN FACTS — no purpose control, and no schedule control: this door takes neither.
  await expect(page.getByLabel("What is being accrued")).toHaveCount(0);
  await expect(page.getByLabel("Authority starts")).toHaveCount(0);

  // THE SAME server-refusal path CREATE exercises, reached the identical way: a liability leg the
  // FORM admits and the DOOR refuses.
  await page.getByLabel("Liability account").selectOption("2050");
  await page.getByRole("button", { name: "Record the correction" }).click();
  const refusal = page.getByText(/names the payable control account; an accrual carries no identified open item/);
  await expect(refusal).toBeVisible();
  await expect(page.getByLabel("Liability account")).toBeFocused();
  await scan(page, "accrual correction form with a server refusal");
});

test("accrual.walk.correction: correcting an accrual is a real transition — the destination is the NEW accrual's own address, the lineage names the row it supersedes, and the ORIGINAL now says so and offers no further correction", async ({ page }) => {
  await signInTo(page, CORRECTABLE_URL);
  await expect(page.getByRole("heading", { name: ACC.correctablePurpose })).toBeVisible();
  await page.getByRole("link", { name: "Correct this accrual" }).click();
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.correctableAccrualId}/correct$`));

  await page.getByLabel("Amount accrued").fill("2,750.00");
  await page.getByRole("button", { name: "Record the correction" }).click();

  // THE DESTINATION IS THE NEW ACCRUAL'S OWN ADDRESS, and it RE-READS: what is on screen is
  // `get_accrual_adjustment`'s answer for the SUCCESSOR, never the correction door's own.
  await expect(page).toHaveURL(new RegExp(`/accruals/${ACC.correctableSuccessorId}$`));
  await expect(page.getByRole("link", { name: ACC.correctableAccrualId })).toBeVisible();
  await expect(page.getByRole("link", { name: "Correct this accrual" })).toBeVisible();

  // THE ORIGINAL NOW NAMES ITS SUCCESSOR, read through a REAL navigation back to it — never
  // inferred from the write's own answer.
  await page.goto(CORRECTABLE_URL);
  await expect(page.getByRole("link", { name: ACC.correctableSuccessorId })).toBeVisible();
  await expect(page.getByRole("link", { name: "Correct this accrual" })).toHaveCount(0);

  // …and the LIST shows the new row too, exactly as the create journey's own destination re-read
  // does — a governed write's effect is proven by a re-read, never by the write's own optimistic
  // answer.
  // Both the original and its successor are now recorded rows.
  await page.goto(LIST_URL);
  await expect(page.getByRole("row").filter({ hasText: ACC.correctablePurpose })).toHaveCount(2);
});

// #1073 — THE THIRD REMEDY, on the Accruals page's own conflict item. It runs BEFORE the "reverse
// now" cell below on purpose: this lane answers `reverse_plan_occurrence` with a REFUSAL, so
// nothing about the derived row moves and the next cell still has its row to clear.
//
// WHAT ONLY A BROWSER SHOWS HERE. That the third control is on THIS surface at all (the ticket's
// AC1 names both surfaces, and the Needs-you inbox mounts the very same component — asserted in
// components/firm/accrual-bill-conflict-affordance.test.tsx), and that a governed refusal reaches
// the person VERBATIM — code, reason and the database's own sentence — instead of the act
// appearing to have worked. The walk had no refusal cell of any kind before this one. What it does
// NOT prove is the remedy's effect: `packages/db/tests/plan-occurrence-reversal-door.test.mjs`
// owns that against a real Postgres, seven cells of it.
test("accrual.walk.reversePeriod: the third remedy is offered on the Accruals page, and its refusal reaches the person verbatim rather than looking like success", async ({ page }) => {
  await signInTo(page, LIST_URL);

  const conflict = page.getByText(/A document-sourced entry posted inside the accrued period/);
  await expect(conflict).toBeVisible();

  // THE CONTROL, AND THE SENTENCE THAT SAYS WHAT MAKES IT DIFFERENT. It claims no different
  // ledger outcome, because there is none on this lane — only a different ACT.
  const reversePeriod = page.getByRole("button", { name: "Reverse this period only" });
  await expect(reversePeriod).toBeVisible();
  await expect(page.getByText(/books the reversing entry for this period alone/)).toBeVisible();
  await expect(page.getByText(/same amount on the books/)).toBeVisible();

  await scan(page, "accrual bill conflict, the third remedy offered");

  await reversePeriod.click();

  // THE REFUSAL, VERBATIM: the CLR code, the typed reason and the database's own sentence. Nothing
  // is re-worded and nothing pretends the period was reversed.
  await expect(page.getByText("CLR10 · not_yet_due")).toBeVisible();
  await expect(
    page.getByText("this period's reversal was not admitted (not_yet_due)"),
  ).toBeVisible();

  // …AND THE CONFIGURED-ACCRUALS TABLE BELOW IT IS UNTOUCHED: a refused remedy moved nothing.
  await expect(page.getByRole("row").filter({ hasText: ACC.purpose })).toContainText("Posted");
});

// #938 — "a bill posted inside an accrued period", rendered on the SAME Accruals page beside the
// configured-accruals table (accrual-mock.mjs's own list_review_queue handler: ONE
// accrual_bill_conflict row for POSTED's own plan, until "reverse now" is driven). Only one of
// the two remedies is walked here — "reverse now" — because the SAME real door
// (request_plan_catch_up) and its real catch_up_in_future refusal are the DB battery's own claim
// (packages/db/tests/accrual-bill-conflict.test.mjs); this cell owns what the BROWSER does with
// the answer: the item is on screen with the accrual, the bill and the period named, the act is a
// real governed write, and the destination RE-READS — the row is gone because a fresh
// list_review_queue answered without it, never because the client painted an optimistic remove.
test("accrual.walk.billConflict: a bill posted inside the accrued period is named on the Accruals page, and 'reverse now' is a real write whose destination RE-READS the row away", async ({ page }) => {
  await signInTo(page, LIST_URL);

  const conflict = page.getByText(/A document-sourced entry posted inside the accrued period/);
  await expect(conflict).toBeVisible();
  await expect(page.getByText("Accrued period: 2026-07-31")).toBeVisible();
  await expect(page.getByText("Accrual amount: 1,200.00")).toBeVisible();
  await expect(page.getByRole("link", { name: "View the document" })).toBeVisible();
  // #942 fix round 1 — the section is TWO-SIDED now: its heading and its sentence must be true of
  // an accrued fee as well as of a cost, and the item says which way this one runs.
  await expect(page.getByText("Documents posted inside an accrued period")).toBeVisible();
  await expect(page.getByText(/hit this accrual.s own profit-and-loss account/)).toBeVisible();
  await expect(page.getByText("Expense accrual", { exact: true })).toBeVisible();
  // …and what each remedy actually settles (ADV-02).
  await expect(page.getByText(/Skipping affects the NEXT period only/)).toBeVisible();

  await scan(page, "accrual bill conflict, before reverse now");

  await page.getByRole("button", { name: "Reverse now" }).click();

  // THE RE-READ, not an optimistic remove: the row is gone because list_review_queue's NEXT
  // answer (accrual-mock.mjs's own `state.reversed` law) does not carry it.
  await expect(conflict).toHaveCount(0);
  // AND THE CONFIGURED-ACCRUALS TABLE BELOW IT IS UNTOUCHED — "reverse now" is scoped to the
  // derived conflict row alone.
  await expect(page.getByRole("row").filter({ hasText: ACC.purpose })).toContainText("Posted");
});

// ===========================================================================================
// accrual.walk.revenue — #942: the SIDE, in a real browser.
//
// The DB battery owns what each side posts; this cell owns what the BROWSER does with a lane that
// now runs two ways: the register says which way each accrual runs and can be narrowed to one, and
// the form's side control re-labels both account legs and changes which accounts they offer — so a
// preparer cannot choose an expense account for an accrued fee at all.
// ===========================================================================================

test("accrual.walk.revenue: the register names each accrual's side and filters to one, and the form's side control changes which accounts each leg offers", async ({ page }) => {
  await signInTo(page, LIST_URL);

  // THE REGISTER CARRIES BOTH SIDES AT ONCE, and each row says which it is.
  const expenseRow = page.getByRole("row").filter({ hasText: ACC.purpose });
  const revenueRow = page.getByRole("row").filter({ hasText: ACC.revenuePurpose });
  await expect(expenseRow).toContainText("Expense");
  await expect(revenueRow).toContainText("Revenue");
  // THE LEGS READ IN POSTING ORDER: a revenue accrual debits the accrued-income asset.
  await expect(revenueRow).toContainText("Dr 1180 / Cr 4000");
  await expect(expenseRow).toContainText("Dr 6100 / Cr 2020");

  await scan(page, "accruals register carrying both sides");

  // AND IT NARROWS TO ONE SIDE.
  await page.getByLabel("Show").selectOption("revenue");
  await expect(revenueRow).toHaveCount(1);
  await expect(expenseRow).toHaveCount(0);
  await page.getByLabel("Show").selectOption("");
  await expect(expenseRow).toHaveCount(1);

  // THE FORM. Choosing the revenue side re-labels both legs and re-fills both pickers.
  await page.goto(NEW_URL);
  await expect(page.getByLabel("Expense account")).toBeVisible();
  await page.getByLabel("Which way this accrues").selectOption("revenue");
  await expect(page.getByLabel("Expense account")).toHaveCount(0);
  const income = page.getByLabel("Revenue account");
  await expect(income).toBeVisible();
  await expect(income.locator("option")).toHaveText(["Choose an account", "4000 Sales / Fees Income"]);
  const asset = page.getByLabel("Accrued income account");
  await expect(asset.locator("option")).toHaveText([
    "Choose an account", "1150 Maybank current", "1180 Accrued Income",
  ]);

  await scan(page, "accrual form on the revenue side");
});
