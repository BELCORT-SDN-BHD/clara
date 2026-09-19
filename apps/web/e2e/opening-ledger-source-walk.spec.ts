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

// ── MEASURED STATUS OF THIS FILE, 2026-09-19 (fix round), and it is now WHOLE ───────────────
// Run: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3350 CLARA_E2E_NEXT_PORT=3351
// CLARA_E2E_RUNTIME_PORT=3352 pnpm --filter @clara/web e2e opening-ledger-source
// --reporter=line --workers=1`, against the real built bundle on this ticket's own rig:
//
//   7 passed (21.7s) — every leg live, none `fixme`, none skipped.
//
// The first cut of this file shipped six of the seven legs as `test.fixme` with the failing
// assertion unread. Reading them one at a time found FOUR defects, and only one of them was in
// the spec:
//
//   1 · THE FIXTURE. `loadOpeningItems` reads `opening_items` by `seed_id` and nothing else, and
//       the mock's empty-relation guard was `client_id`-only, so that read fell through to a 404
//       and `useAsyncRead` classified the whole combined read `not_found`: the entire tied-basis
//       surface rendered "This isn't available yet." The mock now guards on this lane's SEED too.
//   2 · THE APP, and it is AC5's own law. After a successful read the settled outcome VANISHED:
//       `DataState` renders its LoadingState INSTEAD of children, and every `act()` flips
//       `loading` on the reload it fires, so the reload that follows the read unmounted
//       `OpeningParseAction` and took its persistent banner with it. Fixed in
//       `opening-seed-workbench.tsx` with `opening-register.tsx`'s own `hasSeedsData` precedent.
//       No component cell could see this: they mount the action alone, where nothing re-reads.
//   3 · THE APP AGAIN. The panel was mounted with `documentName={null}`, so every provenance cell
//       read "Document <sha12> (sha <sha12>)" — the hash twice — and the footer said "Bound to
//       (sha …)" with a hole where the filename belongs. The workbench now reads the tie
//       document's name, in a SEPARATE read whose failure costs only the name.
//   4 · THE APP, caught by axe. The dry-run strip rendered its refusal token at `opacity-70`,
//       taking `text-warning` on `bg-warning-muted` to 3.33:1 — under WCAG AA for 12px text, and
//       invisible to `scripts/check-token-contrast.mjs`, which only reads globals.css.
//
// And the one spec defect: `not.toMatch(/Ready to approve/i)` fails on the honest state it exists
// to require, because "Not ready to approve" contains it.
//
// LANE STATE: `serve-built.mjs` is ONE server for the whole run, so every cell resets this lane
// first through `reset_opening_ledger_source_fixture` (scoped to this lane's own client id) —
// without it the first cell's basis made every later cell wait fifty seconds for a "Create
// opening seed" trigger that was gone.

const CLIENT = "656c656c-6565-4565-8565-656565656565";
const OPENING = `/clients/${CLIENT}/registers?tab=opening`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// ONE SERVER FOR THE WHOLE RUN, so this lane's fixture state (above all `seedCreated`) survives
// from cell to cell — and every cell below starts by creating the basis. Each cell therefore
// resets the lane first, through the verb scoped to this lane's own client
// (`opening-ledger-source-mock.mjs`), exactly as `document-correction-walk.spec.ts` does.
test.beforeEach(async ({ request }) => {
  const response = await request.post("/e2e-supabase/rest/v1/rpc/reset_opening_ledger_source_fixture", {
    data: { p_client: CLIENT },
  });
  expect(response.ok(), "the lane fixture must actually reset before each cell").toBe(true);
});

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
  // The NEGATIVE has to be written against the copy, not against a substring of it: the honest
  // sentence is "Not ready to approve — …", which contains "ready to approve". Measured on the
  // first run that ever reached this line (fix-round): the loose `/Ready to approve/i` would fail
  // on the very state it exists to require.
  await expect(strip).toContainText(/Not ready to approve/);
  expect(await strip.textContent()).not.toMatch(/all four checks the approval enforces are satisfied/);

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
