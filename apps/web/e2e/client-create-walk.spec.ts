import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, settleForScan, signInTo } from "./helpers";
import { CLIENT_CREATE } from "./client-create-mock.mjs";

/**
 * #649 · THE BROWSER LEG for journey A6's first step — "create a client" — which the suite had
 * NO walk for at all: `interview-walk.spec.ts` consumes pre-created fixtures (`:47-51`), so the
 * register's Add-client control, the duplicate face and the arity-1 acknowledgement had never
 * been driven in a real browser.
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one is a property the unit harness structurally cannot
 * hold: a real focus manager (focus RETURNS to the trigger when the dialog closes), a real
 * address bar and Back, real layout geometry at 320 CSS px and at 200% zoom, a real
 * `prefers-reduced-motion` media query, and a real keyboard-only path through a portalled dialog.
 *
 * WHAT IT DOES NOT PROVE. `clara.client_identity_candidates` and `clara.begin_client_onboarding`
 * are fixtures (`client-create-mock.mjs`). Nothing here establishes that Postgres really finds a
 * name family over clients UNION live counterparties, really refuses at arity >= 2, or really
 * births a client and its plan in one transaction —
 * `packages/db/tests/client-onboarding-identity.test.mjs` owns those against a real Postgres under
 * real least-privileged roles. This lane owns what the browser does with their answers.
 *
 * THE THREE ARITIES ARE THE JOURNEY, and they are the owner's ruling of 2026-09-15: 0 proceeds
 * silently, 1 is shown and acknowledged IN THE FACE, and >= 2 is the DATABASE's refusal rendered
 * verbatim with its code.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const REGISTER_URL = "/clients";

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

/** The register's own Add-client trigger, distinct from the dialog's Confirm which is labelled
 *  "Begin onboarding". */
const addTrigger = (page: Page) => page.getByRole("button", { name: "Add client", exact: true });
const dialog = (page: Page) => page.getByRole("dialog");
const confirm = (page: Page) => dialog(page).getByRole("button", { name: "Begin onboarding", exact: true });
const nameField = (page: Page) => dialog(page).getByLabel("Client name");

async function openAddClient(page: Page): Promise<void> {
  await expect(addTrigger(page)).toBeVisible({ timeout: 30_000 });
  await addTrigger(page).click();
  await expect(nameField(page)).toBeVisible();
}

/** The page never scrolls sideways. A genuinely two-dimensional table may have its own labelled
 *  horizontal viewport; the DOCUMENT may not. */
async function expectNoPageScroll(page: Page, what: string): Promise<void> {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what}: the page must not scroll sideways`).toBeLessThanOrEqual(1);
}

// ===========================================================================================
// client-create.walk.identity — the three arities, on one screen.
// ===========================================================================================

test("client-create.walk.identity: arity >= 2 refuses VERBATIM with its code beside the candidates, and renaming clears the check without clearing the name", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 8 }));
  await signInTo(page, REGISTER_URL);
  await openAddClient(page);

  await nameField(page).fill(CLIENT_CREATE.collidingName);
  await confirm(page).click();

  // THE DATABASE'S OWN WORDS, and its code. Not a re-worded summary.
  await expect(dialog(page).getByText(/matches 2 existing clients or counterparties/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog(page).getByText("CLR10", { exact: false }).first()).toBeVisible();

  // …BESIDE THE SAME LIST the successful answer would have rendered — carried by the refusal
  // itself, so the face issues no second read of the fact it is reporting.
  const candidate = dialog(page).getByRole("link", { name: CLIENT_CREATE.existingClientName });
  await expect(candidate).toBeVisible();
  await expect(candidate).toHaveAttribute("href", `/clients/${CLIENT_CREATE.existingClientId}`);
  await expect(dialog(page).getByText(CLIENT_CREATE.existingCounterpartyName)).toBeVisible();
  await expect(dialog(page).getByText("Counterparty").first()).toBeVisible();
  await expect(dialog(page).getByText("same leading word").first()).toBeVisible();

  // THE WALL IS HONOURED: Confirm is shut, and what was typed is still there to be corrected.
  await expect(confirm(page)).toBeDisabled();
  await expect(nameField(page)).toHaveValue(CLIENT_CREATE.collidingName);
  await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");

  await scan(page, "the refused candidate face");

  // A CHECK BELONGS TO A NAME. Changing it retires the candidates and the refusal — never the
  // typed text — and the next Confirm is a fresh question.
  await nameField(page).fill(CLIENT_CREATE.freeName);
  await expect(dialog(page).getByText(CLIENT_CREATE.existingClientName)).toBeHidden();
  await expect(confirm(page)).toBeEnabled();
  await expect(nameField(page)).toHaveValue(CLIENT_CREATE.freeName);

  // ARITY 0 — the same click goes on to the birth door, and the landing is the id the DATABASE
  // returned.
  await confirm(page).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_CREATE.newClientId}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: CLIENT_CREATE.freeName })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Onboarding").first()).toBeVisible();

  // STABLE URL AND BACK: the register is a real destination, and Back returns to it.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${REGISTER_URL}$`));
  await expect(addTrigger(page)).toBeVisible();
});

test("client-create.walk.identity: arity 1 SHOWS the candidate and waits for an explicit acknowledgement", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 8 }));
  await signInTo(page, REGISTER_URL);
  await openAddClient(page);

  await nameField(page).fill(CLIENT_CREATE.loneName);
  await confirm(page).click();

  await expect(dialog(page).getByText(/Already on your books under this name/)).toBeVisible({ timeout: 30_000 });
  const candidate = dialog(page).getByRole("link", { name: CLIENT_CREATE.existingClientName });
  await expect(candidate).toBeVisible();
  await expect(candidate).toHaveAttribute("href", `/clients/${CLIENT_CREATE.existingClientId}`);

  // NO REFUSAL HERE — the estate's own predicate is `count(*) > 1`, so one same-family party has
  // never been ambiguous anywhere in it. The wall at arity 1 is the human's own act.
  await expect(dialog(page).getByText("CLR10")).toHaveCount(0);
  await expect(confirm(page)).toBeDisabled();
  await expect(nameField(page)).toHaveValue(CLIENT_CREATE.loneName);

  await scan(page, "the arity-1 candidate face");

  const ack = dialog(page).getByLabel("This is a different business");
  await expect(ack).toBeVisible();
  await ack.check();
  await expect(confirm(page)).toBeEnabled();

  await confirm(page).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_CREATE.newClientId}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: CLIENT_CREATE.loneName })).toBeVisible({ timeout: 30_000 });
});

// ===========================================================================================
// client-create.walk.reach — the same journey at 320 CSS px, at 200% zoom, and with reduced
// motion. Geometry and media queries are exactly what a unit harness cannot measure.
// ===========================================================================================

test("client-create.walk.reach: the whole journey works at 320px, at 200% zoom and under prefers-reduced-motion", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 6 }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, REGISTER_URL);
  await expectNoPageScroll(page, "the register at 320px");

  await openAddClient(page);
  await nameField(page).fill(CLIENT_CREATE.loneName);
  await confirm(page).click();
  await expect(dialog(page).getByText(/Already on your books under this name/)).toBeVisible({ timeout: 30_000 });
  await expectNoPageScroll(page, "the candidate face at 320px");
  // The candidate, the acknowledgement and Confirm are all REACHABLE at this width — the three
  // things a person must see to make the decision.
  await expect(dialog(page).getByRole("link", { name: CLIENT_CREATE.existingClientName })).toBeVisible();
  await expect(dialog(page).getByLabel("This is a different business")).toBeVisible();
  await expect(confirm(page)).toBeVisible();
  await scan(page, "the candidate face at 320px");

  // 200% ZOOM, expressed the way a browser does it: half the CSS viewport at the same device
  // width. The same three controls must still be reachable.
  await page.setViewportSize({ width: 640, height: 480 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await expect(dialog(page).getByLabel("This is a different business")).toBeVisible();
  await expect(confirm(page)).toBeVisible();
  await expectNoPageScroll(page, "the candidate face at 200% zoom");
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  await dialog(page).getByLabel("This is a different business").check();
  await confirm(page).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_CREATE.newClientId}$`), { timeout: 30_000 });
  await expectNoPageScroll(page, "client Home at 320px");
});

// ===========================================================================================
// client-create.walk.keyboard — a keyboard-only path, and the focus return a portalled dialog
// owes its trigger.
// ===========================================================================================

test("client-create.walk.keyboard: the journey is reachable by keyboard alone, and focus RETURNS to the trigger when the dialog closes", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ polls: 2 }));
  await signInTo(page, REGISTER_URL);
  await ensureRealFocus(page);

  // OPENED FROM THE KEYBOARD, not clicked.
  await addTrigger(page).focus();
  await page.keyboard.press("Enter");
  await expect(nameField(page)).toBeVisible();

  // INITIAL FOCUS IS INSIDE THE DIALOG — a modal that left focus behind the backdrop is
  // unusable with a keyboard, and only a real focus manager can be asked.
  const focusedInsideDialog = await page.evaluate(() => {
    const el = document.activeElement;
    return el !== null && el.closest('[role="dialog"]') !== null;
  });
  expect(focusedInsideDialog, "initial focus lands inside the dialog").toBe(true);

  await nameField(page).fill(CLIENT_CREATE.loneName);
  await confirm(page).focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByLabel("This is a different business")).toBeVisible({ timeout: 30_000 });

  // ESCAPE CLOSES, and focus comes back to the control the person operated — never the body.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  const returned = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  expect(returned, "focus returns to the Add-client trigger").toBe("Add client");
});
