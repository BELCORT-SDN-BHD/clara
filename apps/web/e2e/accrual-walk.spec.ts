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
