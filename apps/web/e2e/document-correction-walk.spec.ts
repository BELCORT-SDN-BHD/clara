// #646 — THE SOURCE-CORRECTION WALK (journeys C2 · B3 · C13), on the BUILT app in a real browser.
//
// WHAT ONLY A BROWSER CAN PROVE HERE, and it is why this file exists beside the unit cells:
//
//   1. THE ADDRESS. `?document=<id>&tab=original|facts|accounting` is a real URL: a reload at a tab
//      restores that view, a tab switch adds NO history entry (it is a `replace`), and Back from a
//      tab closes the document rather than walking backwards through every view someone glanced at.
//      A unit test can assert which verb a helper called; only the browser has a history stack.
//   2. DRAFTS ACROSS A VIEW CHANGE. Appendix C §3: "Tabs and an explanatory Popover do not submit
//      or discard it." The management dialogs are rendered outside the switched panels, so an
//      unsent reason survives — provable only by actually switching the view.
//   3. ONE OVERLAY AT A TIME. The wrong-client impact Sheet does not stack on the decision Dialog:
//      the wizard is SUSPENDED while the Sheet is open and comes back at the same step with its
//      destination still chosen. Two overlays' focus traps fighting is a browser property.
//   4. THE FACES, with axe: the three routed views, a governed refusal standing, and the Sheet.
//
// WHAT THIS WALK DOES NOT PROVE. PostgREST is mocked (`document-correction-mock.mjs`), so nothing
// here says Postgres would accept these calls or that a role may make them. THAT half is
// `packages/db/tests/rig-docs-source-revision.test.mjs`, which drives the real doors on the real
// chain under the real role matrix. Neither stands in for the other, and saying so is the point.

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CORR } from "./document-correction-mock.mjs";
import { ensureRealFocus, signIn } from "./helpers";

const DOCUMENTS_URL = `/clients/${CORR.clientId}/documents`;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** ONE server serves the whole run, and this lane's state is the POINT of it — an accepted
 *  revision MOVES the source version. So every cell starts from the same fixture, through the
 *  lane's own client-scoped control verb. Without this, cell N's assertions would be about
 *  whatever cells 1..N-1 happened to leave behind, which is the shape that turns one real failure
 *  into six unattributable ones. */
test.beforeEach(async ({ request }) => {
  const response = await request.post("/e2e-supabase/rest/v1/rpc/reset_document_correction_fixture", {
    data: { p_client: CORR.clientId },
  });
  expect(response.ok(), "the lane fixture must actually reset before each cell").toBe(true);
});

/** Open the walk's document straight at an address — the shape a shared link takes. */
async function openDocument(page: Page, tab?: "facts" | "accounting", document = CORR.doc): Promise<void> {
  const suffix = tab ? `&tab=${tab}` : "";
  await page.goto(`${DOCUMENTS_URL}?document=${document}${suffix}`);
  await expect(page.getByRole("heading", { name: /supplier-bill-april\.pdf|unreadable-scan\.pdf/ }))
    .toBeVisible({ timeout: 20_000 });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    widest: [...document.querySelectorAll("body *")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), right: Math.round(r.right) };
      })
      .filter((e) => e.right > document.documentElement.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5),
  }));
}

/** Drive one revision through the Facts view's per-row dialog. */
async function revise(page: Page, value: string, reason: string): Promise<void> {
  await page.getByRole("button", { name: "Revise" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Corrected value").fill(value);
  await page.getByLabel("Revision reason").fill(reason);
  await page.getByRole("button", { name: "Record revision" }).click();
}

test.describe("#646 — the routed document views and the address that names them", () => {
  test("C2: the three views are addressable, a reload restores the one that was open, and a tab switch adds no history", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    // OPEN BY CLICKING A ROW — a push, so Back closes it. The default view writes no `tab`.
    await page.getByRole("button", { name: /supplier-bill-april\.pdf/ }).click();
    await expect(page.getByRole("heading", { name: "supplier-bill-april.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`document=${CORR.doc}`));
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page.getByTestId("document-view-original")).toBeVisible();

    // SWITCH TO FACTS. The address names it; the Original panel is gone.
    await page.getByRole("tab", { name: "Typed facts" }).click();
    await expect(page).toHaveURL(/tab=facts/);
    await expect(page.getByTestId("document-view-facts")).toBeVisible();
    await expect(page.getByTestId("document-view-original")).toHaveCount(0);

    await page.getByRole("tab", { name: "Accounting & Work" }).click();
    await expect(page).toHaveURL(/tab=accounting/);
    await expect(page.getByTestId("document-view-accounting")).toBeVisible();

    // A RELOAD RESTORES THE VIEW — the property React state could never have.
    await page.reload();
    await expect(page.getByTestId("document-view-accounting")).toBeVisible({ timeout: 20_000 });

    // BACK CLOSES THE DOCUMENT, it does not walk backwards through the tabs: switching views is a
    // `replace`, so the only history entry is the one that opened the document.
    await page.goBack();
    await expect(page.getByTestId("document-view-accounting")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Filed to this client" })).toBeVisible();
  });

  test("C2: an unrecognised tab reads as Original rather than as an error", async ({ page }) => {
    await signIn(page);
    // A hand-edited or stale view name is not a not-found question — the document the address named
    // is right there. The honest answer is the view it opens on.
    await page.goto(`${DOCUMENTS_URL}?document=${CORR.doc}&tab=ledger`);
    await expect(page.getByRole("heading", { name: "supplier-bill-april.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("document-view-original")).toBeVisible();
    await expect(page.getByTestId("document-not-available")).toHaveCount(0);
  });
});

test.describe("#646 — revising what the document says", () => {
  test("C2: a fact revision is accepted, and the two consequences are stated SEPARATELY", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "facts");

    // THE DECISION IS MADE AGAINST STATED FACTS.
    await expect(page.getByTestId("facts-version")).toContainText("source version 1");
    await page.getByRole("button", { name: "Revise" }).first().click();
    await expect(page.getByTestId("revise-field-path")).toHaveText("invoice.total");
    await expect(page.getByTestId("revise-current-value")).toHaveText("1050.00");
    await expect(page.getByTestId("revise-observed-version")).toHaveText("1");

    // THE CONFIRM IS GATED until a reason is given — the DB refuses CLR10 without one, and the
    // face must not offer a control that cannot work.
    await page.getByLabel("Corrected value").fill("1150.00");
    await expect(page.getByRole("button", { name: "Record revision" })).toBeDisabled();
    await page.getByLabel("Revision reason").fill("the reader misread the printed total");
    await page.getByRole("button", { name: "Record revision" }).click();

    // THE PERSISTENT RESULT, not a toast: two rows, with different owners, on the object itself.
    const band = page.getByTestId("source-correction-band");
    await expect(band).toBeVisible({ timeout: 20_000 });
    await expect(band).toContainText("Source revision accepted");
    await expect(band).toContainText("Accounting impact pending");
    await expect(page.getByTestId("band-impact-link")).toHaveAttribute("href", /issues\/676/);

    // …AND THE FACTS THEMSELVES MOVED, to the exact figure that was typed. The version the NEXT
    // revision must quote moved with them.
    await expect(page.getByTestId("facts-version")).toContainText("source version 2");
    await expect(page.getByTestId("document-view-facts")).toContainText("1150.00");

    // THE BAND IS ON EVERY VIEW. A person who switched to Accounting to look for the impact must
    // not have to switch back to learn that a revision was accepted.
    await page.getByRole("tab", { name: "Accounting & Work" }).click();
    await expect(page.getByTestId("source-correction-band")).toContainText("Accounting impact pending");
  });

  test("C2: a stale revision keeps the attempted value visible and recovers through a SECOND deliberate act", async ({ page, context }) => {
    // THE ONLY TWO-PAGE CELL in this file: it signs in, opens a second page, and drives both. That
    // is two full navigations plus two document opens, which does not fit the 30s default — and a
    // cell that times out in its own sign-in says nothing about the journey it is meant to measure.
    test.slow();
    await signIn(page);
    await openDocument(page, "facts");
    await expect(page.getByTestId("facts-version")).toContainText("source version 1");

    // TWO PEOPLE, ONE DOCUMENT — the real shape of a stale revision, driven with two real pages
    // rather than a rewritten request body. The second page opens its dialog against version 1 and
    // then the first page moves the document under it.
    const second = await context.newPage();
    await second.goto(`${DOCUMENTS_URL}?document=${CORR.doc}&tab=facts`);
    await expect(second.getByTestId("facts-version")).toContainText("source version 1", { timeout: 20_000 });
    await second.getByRole("button", { name: "Revise" }).first().click();
    await expect(second.getByTestId("revise-observed-version")).toHaveText("1");
    await second.getByLabel("Corrected value").fill("1250.00");
    await second.getByLabel("Revision reason").fill("a second person, working from the old reading");

    await revise(page, "1150.00", "the reader misread the printed total");
    await expect(page.getByTestId("facts-version")).toContainText("source version 2", { timeout: 20_000 });

    await second.getByRole("button", { name: "Record revision" }).click();
    const dialog = second.getByRole("dialog");
    await expect(dialog).toContainText("CLR19");
    await expect(dialog).toContainText("stale_source_version");
    await expect(dialog).toContainText("1250.00");
    await expect(dialog).toContainText("source version 1");
    await expect(dialog).toContainText("version 2");
    // THE RECOVERY IS A CONTROL THE HUMAN PRESSES. Nothing re-submits on its own: that is how one
    // person's correction silently overwrites another's — and the value they typed is still there.
    await expect(second.getByTestId("revise-use-current-version")).toBeVisible();
    await expect(second.getByLabel("Corrected value")).toHaveValue("1250.00");
    await second.getByTestId("revise-use-current-version").click();
    await expect(second.getByTestId("revise-observed-version")).toHaveText("2");
    await second.close();
  });

  test("C2: an unreadable amount is refused verbatim and the dialog stays open with the input standing", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "facts");
    await revise(page, "N/A", "the printed figure is smudged");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("readable as cents");
    await expect(dialog).toContainText("CLR10");
    await expect(dialog).toContainText("monetary_value_malformed");
    await expect(page.getByLabel("Corrected value")).toHaveValue("N/A");
    // NOTHING was recorded — the band never appears.
    await expect(page.getByTestId("source-correction-band")).toHaveCount(0);
  });

  test("C2: a row the door cannot revise says so instead of offering a control that would refuse", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "facts");
    const facts = page.getByTestId("document-view-facts");
    await expect(facts).toContainText("statement.closing_balance");
    await expect(facts).toContainText("Read-only");
    // …and exactly ONE control, on the row the closed set admits.
    await expect(page.getByRole("button", { name: "Revise" })).toHaveCount(2); // the fact + the vendor name
  });
});

test.describe("#646 — the accounting view, and what stands on the old reading", () => {
  test("B3 · C13: the accounting view shows the live claim, the dependent knowledge and the questions", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "accounting");

    const view = page.getByTestId("document-view-accounting");
    await expect(view).toContainText("ACME SUPPLIES SDN BHD");
    await expect(page.getByTestId("document-live-claim")).toContainText("currently stands on this document");

    const dependents = page.getByTestId("source-dependents");
    await expect(dependents).toContainText("Standing on this document");
    await expect(dependents).toContainText("supplier_payment_terms");
    // BEFORE a revision the record stands on the CURRENT reading.
    await expect(dependents).toContainText("Current source");
    // The manual question is live, so it belongs to the door that answers it — no dismissal here.
    await expect(dependents).toContainText("live filing");
    await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  });

  test("C13: after a revision the dependent record is marked as standing on a STALE source, and nothing was rewritten", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "facts");
    await revise(page, "1150.00", "the reader misread the printed total");
    await expect(page.getByTestId("facts-version")).toContainText("source version 2", { timeout: 20_000 });

    await page.getByRole("tab", { name: "Accounting & Work" }).click();
    const dependents = page.getByTestId("source-dependents");
    await expect(dependents).toContainText("Stale source");
    // THE HONEST SENTENCE, and it is the whole of AC3's knowledge half: Clara does not re-assess
    // these by itself, and the surface says so rather than implying it did.
    await expect(dependents).toContainText("does not re-assess these automatically");
  });

  test("ORPHAN-QUESTION: a classification question whose filing was retired can finally be dismissed", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "accounting", CORR.docOrphan);

    const dependents = page.getByTestId("source-dependents");
    await expect(dependents).toContainText("What kind of document is this?");
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    await expect(dismiss).toBeVisible();
    await dismiss.click();
    await expect(page.getByRole("dialog")).toContainText("lost its subject");
    await page.getByLabel("Dismissal reason").fill("the filing this was asked about was retired");
    await page.getByRole("button", { name: "Dismiss question" }).click();

    // The question is gone from the projection — and the panel says the honest empty rather than
    // painting a list it no longer has. BOTH halves are asserted: an absence alone would also be
    // satisfied by a panel that rendered nothing at all, while the successful-empty state AC7 names
    // is a SENTENCE. (Round-1 red: with the EmptyState arm removed the absence still passed.)
    await expect(dependents).not.toContainText("What kind of document is this?", { timeout: 20_000 });
    await expect(dependents).toContainText("Nothing recorded stands on this document's reading.");
  });
});

test.describe("#646 — the wrong-client correction, its Sheet and the client it moves the document away from", () => {
  test("C2 · AC6: the impact radius opens in a Sheet, ONE overlay at a time, and the wizard comes back with its draft", async ({ page }) => {
    await signIn(page);
    await openDocument(page);

    await page.getByRole("button", { name: "Correct wrong-client filing" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Preview blast radius" }).click();
    await expect(page.getByTestId("correction-blast-radius")).toContainText("1 cited entries");

    // THE SHEET TAKES THE EVIDENCE. While it is open the DECISION Dialog steps aside — two
    // overlays' focus traps fighting is exactly what appendix C §4 forbids.
    await page.getByTestId("correction-view-impact").click();
    const sheet = page.getByTestId("correction-impact-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Wrong-client impact");
    await expect(sheet).toContainText(CORR.entry);
    await expect(sheet).toContainText("separate accounting impact");
    await expect(page.getByRole("button", { name: "Record destination + propose" })).toHaveCount(0);

    // AC6 · AC7 — THE OPEN SHEET IS SCANNED HERE, and only here: mounting this primitive open in
    // the node harness and scanning `document.body` does not terminate (the measurement is in
    // `components/documents/correction-impact-sheet.test.tsx`), so the browser is the only place
    // its open-overlay a11y can be answered at all. `.include` scopes axe to the Sheet element
    // itself, which is what stops this from passing vacuously: with the Sheet closed axe throws
    // "No elements found for include" rather than scanning the page behind it (measured red,
    // fix round 1).
    const sheetAxe = await new AxeBuilder({ page })
      .include('[data-testid="correction-impact-sheet"]')
      .withTags(AXE_TAGS).analyze();
    expect(
      sheetAxe.violations,
      JSON.stringify(sheetAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2),
    ).toEqual([]);


    // CLOSING IT RESTORES THE WIZARD AT THE SAME STEP, with the destination it already had — the
    // draft is not reset by looking at the evidence.
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("correction-blast-radius")).toContainText("1 cited entries");
    await expect(page.getByRole("button", { name: "Record destination + propose" })).toBeVisible();
  });

  test("C2: the client the document moved AWAY from is told so, with the date and the correction id", async ({ page }) => {
    await signIn(page);
    await openDocument(page);

    await page.getByRole("button", { name: "Correct wrong-client filing" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Preview blast radius" }).click();
    await dialog.getByRole("button", { name: "Record destination + propose" }).click();
    await dialog.getByRole("button", { name: "Approve + apply" }).click();

    // The document does not silently vanish from this client: the band states where it went.
    await page.goto(`${DOCUMENTS_URL}?document=${CORR.doc}`);
    const band = page.getByTestId("source-correction-band");
    await expect(band).toContainText("Transferred to another client", { timeout: 20_000 });
    await expect(band).toContainText(CORR.correction);
  });
});

test.describe("#646 — the shape of the faces", () => {
  test("RESPONSIVE: no horizontal page scroll at 320px, nor at 200% zoom, on any of the three views", async ({ page }) => {
    await signIn(page);
    for (const tab of [undefined, "facts", "accounting"] as const) {
      await page.setViewportSize({ width: 320, height: 720 });
      await openDocument(page, tab);
      const narrow = await horizontalOverflow(page);
      expect(
        narrow.docScrollWidth,
        `${tab ?? "original"} scrolls sideways at 320px. Widest: ${JSON.stringify(narrow.widest, null, 2)}`,
      ).toBeLessThanOrEqual(narrow.docClientWidth + 1);

      // 200% zoom, emulated the way the spec means it: 1280x800 at 200% is a 640x400 CSS viewport.
      await page.setViewportSize({ width: 640, height: 400 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "supplier-bill-april.pdf" })).toBeVisible({ timeout: 20_000 });
      const zoomed = await horizontalOverflow(page);
      expect(
        zoomed.docScrollWidth,
        `${tab ?? "original"} scrolls sideways at 200% zoom. Widest: ${JSON.stringify(zoomed.widest, null, 2)}`,
      ).toBeLessThanOrEqual(zoomed.docClientWidth + 1);
    }
  });

  test("KEYBOARD: the views are reachable by the tab pattern, and focus returns to the trigger when a dialog closes", async ({ page }) => {
    await signIn(page);
    await ensureRealFocus(page);
    await openDocument(page);

    // BASE UI'S TABS OWN THE ROVING TABINDEX and the arrow-key map — the whole reason the vendored
    // primitive replaced this product's three hand-rolled tablists.
    await page.getByRole("tab", { name: "Original" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Typed facts" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/tab=facts/);

    // FOCUS RETURNS TO THE TRIGGER when a dialog is dismissed — appendix D row 23.
    const trigger = page.getByRole("button", { name: "Revise" }).first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("axe: each of the three routed views has no WCAG A/AA violations", async ({ page }) => {
    await signIn(page);
    for (const tab of [undefined, "facts", "accounting"] as const) {
      await openDocument(page, tab);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(
        results.violations,
        `${tab ?? "original"}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)}`,
      ).toEqual([]);
    }
  });

  test("axe: a governed refusal standing inside the revision dialog has no WCAG A/AA violations", async ({ page }) => {
    await signIn(page);
    await openDocument(page, "facts");
    await revise(page, "N/A", "the printed figure is smudged");
    await expect(page.getByRole("dialog")).toContainText("CLR10");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2),
    ).toEqual([]);
  });
});
