import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";

// #656's browser leg — THE FIRST WALK EVER TO REACH `?tab=opening`.
//
// Before this ticket the opening tab had no Playwright coverage of any kind: the workbench was
// exercised only at its default `aging` tab, and the document half of the lane was unreachable
// from a browser in three separate places. So these legs are not a regression net over something
// that worked; they are the first proof that the journey exists at all.
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built bundle and every line of
// client code are real — the tie-document picker and its `Field` composition, the runtime wire's
// typed outcomes, the target panel's provenance and coverage footer, the four tie gates, the
// dialog wrappers and their focus behaviour. PostgREST and the runtime route are
// `opening-ledger-source-mock.mjs`, including the named refusal. So the JOURNEY and the surface's
// HANDLING of each answer are proven here; whether Postgres would raise that refusal, and whether
// the producer would read that document, are proven against real Postgres in
// `packages/db/tests/opening-ledger-source.test.mjs` and
// `packages/runtime/tests/opening-ledger-source-e2e.mjs`.

const CLIENT = "656c656c-6565-4565-8565-656565656565";
const OPENING = `/clients/${CLIENT}/registers?tab=opening`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

/** Create the basis with its tie document — the leg every other leg stands on. */
async function createBasisWithDocument(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create opening seed" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // THE PICKER EXISTS, names the filed document and offers the keyed path as a real choice.
  const picker = dialog.getByLabel("Opening source document");
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("No document");
  await expect(picker).toContainText("TB-2025-P656.pdf");

  // Selected by VALUE (the document id), not by a label pattern: the option's text carries the
  // filed date and the sha, which are fixture detail a selector should not depend on.
  await picker.selectOption("65d0c001-6565-4565-8565-656565656565");
  // The hint moves with the selection: the person is told what binding this document means.
  await expect(dialog).toContainText(/bound to TB-2025-P656\.pdf/i);

  await dialog.getByRole("button", { name: "Create opening seed", exact: true }).click();
  await expect(dialog).toBeHidden();
}

// ---------------------------------------------------------------------------------------------
// 1 — the whole journey, on the tab a client-Home link already points at.
// ---------------------------------------------------------------------------------------------

test("a basis is bound to a filed document, read, and shows every line with its provenance", async ({ page }) => {
  await signInTo(page, OPENING);

  // The tab is the URL's, and the URL is the truth.
  await expect(page).toHaveURL(/tab=opening/);
  await expect(page.getByRole("heading", { name: "Opening balances & carry-down" })).toBeVisible();
  await expectAccessible(page, "opening tab, no basis");

  await createBasisWithDocument(page);

  // THE SOURCE IS ON THE BASIS ITSELF, before anything has been read.
  await expect(page.getByTestId("opening-source-header")).toContainText(/nothing read yet/i);
  // …and the tied basis renders the DOCUMENT panel, not the keyed one. Before #656 it rendered
  // nothing at all.
  await expect(page.getByTestId("opening-target-document-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add target line" })).toHaveCount(0);

  // THE READ.
  await page.getByRole("button", { name: "Read this document" }).click();
  await expect(page.getByText(/5 line\(s\) were read/)).toBeVisible();

  // Every line, with the label AS PRINTED and its provenance.
  const panel = page.getByTestId("opening-target-document-panel");
  await expect(panel).toContainText("CASH AT BANK");
  await expect(panel).toContainText("RETAINED EARNINGS");
  await expect(panel.getByText("Document").first()).toBeVisible();
  await expect(panel).toContainText("TB-2025-P656.pdf");
  await expect(panel).toContainText("65a6f1e2d3c4");

  // COVERAGE, not a tie — counts and cents, and no percentage anywhere on the page.
  await expect(panel).toContainText("Mapped");
  await expect(panel).toContainText("5 line(s)");
  await expect(panel).toContainText("105,000.00");
  expect(await panel.textContent()).not.toMatch(/%/);

  // THE TIE GATES STILL SAY THE TRUTH: the lines are read and nothing is posted against them, so
  // the basis does NOT tie, and the strip names the database's own token.
  const strip = page.getByTestId("opening-dryrun-strip");
  await expect(strip).toContainText("tie_mismatch");
  expect(await strip.textContent()).not.toMatch(/Ready to approve/i);

  await expectAccessible(page, "opening tab, basis read");
});

// ---------------------------------------------------------------------------------------------
// 2 — the refusal, which is the branch this slice exists for.
// ---------------------------------------------------------------------------------------------

test("a named refusal renders VERBATIM as a persistent block and the basis stays usable", async ({ page }) => {
  await signInTo(page, OPENING);
  await createBasisWithDocument(page);

  // Drive the refusal at the wire, so the surface under test is the real one.
  await page.route("**/api/runtime/opening/parse-targets", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        status: "unparseable",
        reason: "2 opening_tb.line region(s) did not parse: 65f10003-6565-4565-8565-656565656565, 65f10004-6565-4565-8565-656565656565",
      }),
    }));

  await page.getByRole("button", { name: "Read this document" }).click();

  // VERBATIM — the count AND every failing row id. This is the producer's whole value.
  await expect(page.getByText(/2 opening_tb\.line region\(s\) did not parse/)).toBeVisible();
  await expect(page.getByText(/65f10003-6565-4565-8565-656565656565/)).toBeVisible();
  await expect(page.getByText(/one unreadable line forfeits the whole document/)).toBeVisible();

  // PERSISTENT — still standing after a settle, and the action is still operable.
  await page.waitForTimeout(500);
  await expect(page.getByText(/2 opening_tb\.line region\(s\) did not parse/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Read this document" })).toBeEnabled();

  await expectAccessible(page, "opening tab, named refusal");
});

test("`no_opening_tb_lines` is INFORMATION with the keyed path named, not an error", async ({ page }) => {
  await signInTo(page, OPENING);
  await createBasisWithDocument(page);
  await page.route("**/api/runtime/opening/parse-targets", (route) =>
    route.fulfill({
      status: 422, contentType: "application/json",
      body: JSON.stringify({ status: "unparseable", reason: "no_opening_tb_lines" }),
    }));

  await page.getByRole("button", { name: "Read this document" }).click();
  await expect(page.getByText(/Nothing to read/)).toBeVisible();
  await expect(page.getByText(/Key the balances instead/)).toBeVisible();
});

// ---------------------------------------------------------------------------------------------
// 3 — the URL, the keyboard and the small viewport.
// ---------------------------------------------------------------------------------------------

test("?tab=opening survives a reload, and Back leaves the page rather than the tab", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT}/registers`);
  await page.goto(page.url().replace(/\/registers.*/, "/registers?tab=opening"));
  await expect(page.getByRole("heading", { name: "Opening balances & carry-down" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/tab=opening/);
  await expect(page.getByRole("heading", { name: "Opening balances & carry-down" })).toBeVisible();

  // `registers-workbench.tsx` uses `router.replace`, so a tab change creates NO history entry:
  // Back goes to the previous PAGE. That is the behaviour, stated rather than wished for.
  await page.goBack();
  await expect(page).not.toHaveURL(/tab=opening/);
});

test("the create dialog is reachable and completable by keyboard alone, and focus returns to its trigger", async ({ page }) => {
  await signInTo(page, OPENING);

  const trigger = page.getByRole("button", { name: "Create opening seed" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Focus moved INTO the dialog — a modal that leaves focus behind traps a keyboard user outside
  // the thing they just opened.
  await expect(dialog).toContainText("Opening source document");
  const inside = await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null);
  expect(inside, "focus must move into the dialog").toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // AND IT COMES BACK. A dismissed modal that drops focus on the body strands the keyboard.
  await expect(trigger).toBeFocused();
});

test("the whole journey works at 320px, and the tab is accessible there", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, OPENING);
  await expect(page.getByRole("heading", { name: "Opening balances & carry-down" })).toBeVisible();

  await createBasisWithDocument(page);
  await page.getByRole("button", { name: "Read this document" }).click();
  await expect(page.getByText(/5 line\(s\) were read/)).toBeVisible();
  await expect(page.getByTestId("opening-target-document-panel")).toContainText("CASH AT BANK");

  // NO HORIZONTAL PAGE SCROLL at the narrowest supported width.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the opening tab must not scroll horizontally at 320px").toBeLessThanOrEqual(1);

  await expectAccessible(page, "opening tab at 320px");
});

test("the tab is accessible at 200% zoom", async ({ page }) => {
  // 200% zoom modelled the way WCAG 1.4.4 means it: half the CSS viewport at the same content.
  await page.setViewportSize({ width: 640, height: 512 });
  await signInTo(page, OPENING);
  await createBasisWithDocument(page);
  await page.getByRole("button", { name: "Read this document" }).click();
  await expect(page.getByText(/5 line\(s\) were read/)).toBeVisible();
  await expectAccessible(page, "opening tab at 200% zoom");
});
