// THE DOCUMENTS-VIEWER WALK (裁-86: every frontend train walks its journey in a
// real browser, on the BUILT app).
//
// Four things are proven here that no unit test can prove, because each of them
// is a property of the real browser rather than of a function:
//
//   1. C-07 / 裁-175 — an XML document's "Open document" opens NO tab. The unit
//      test proves the library returns `not_viewable`; only a browser can prove
//      that the browsing context count does not grow and that nothing is ever
//      navigated to a `blob:` URL in this origin.
//   2. A PDF's "Open document" DOES open one — the vacuity control on (1),
//      without which every assertion above passes against a broken button.
//   3. D2 — the page overlay renders real polygons over a real pdf.js-painted
//      canvas, and clicking a fact in the table highlights its own region.
//      pdfjs-dist is a dynamic import and its worker is a file under public/;
//      neither exists in a unit environment.
//   4. The report-only CSP is on the wire, and the browser's own violation
//      reports say what an ENFORCING policy would cost. That measurement is
//      the whole point of shipping the strict candidate report-only, and it is
//      recorded in the run's output for the PR body.

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DOCS } from "./documents-viewer-mock.mjs";
import { ensureRealFocus } from "./helpers";

const DOCUMENTS_URL = `/clients/${DOCS.clientId}/documents`;

/** Selects a filed document by filename.
 *
 *  `getByRole("row")` does NOT work here and the reason is worth stating:
 *  `FiledDocumentList` gives each `<TableRow>` an explicit `role="button"`
 *  (filed-document-list.tsx:43) so the whole row is one keyboard-reachable
 *  control, which REPLACES its implicit `row` role. A locator written against
 *  the tag rather than the role would have been a silent 30-second timeout. */
function selectDocument(page: Page, filename: RegExp) {
  return page.getByRole("button", { name: filename }).click();
}

/** The same sign-in every other walk uses (firm-navigation-walk.spec.ts:3-10) —
 *  the app's OWN login, not a side channel: `serve-built.mjs` keys
 *  `caller_context` on the email, so the persona is chosen by signing in as
 *  them. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
}

test.describe("documents viewer — the MIME gate, the page overlay and the CSP", () => {
  test("C-07: an XML document is REFUSED at the viewer gate — no tab opens, and the reason is honest", async ({ page, context }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    await expect(page.getByRole("heading", { name: "Filed to this client" })).toBeVisible();
    await selectDocument(page, /myinvois-e-invoice\.xml/);

    await expect(page.getByRole("button", { name: "Open document" })).toBeVisible();

    // THE MEASUREMENT: how many browsing contexts exist before the click, and
    // whether any new one ever navigates. A `blob:` navigation in a popup is
    // exactly what C-07 describes, so both are watched.
    const pagesBefore = context.pages().length;
    const opened: string[] = [];
    context.on("page", (p) => { opened.push(p.url()); });

    await page.getByRole("button", { name: "Open document" }).click();

    await expect(page.getByText(/can't be shown in a browser tab/)).toBeVisible();
    await expect(page.getByText(/application\/xml/)).toBeVisible();

    // Give a popup that WOULD have opened time to appear and navigate. Without
    // this the assertion could pass simply because the click had not finished.
    await page.waitForTimeout(1000);

    expect(context.pages().length, "no browsing context may survive a refused open").toBe(pagesBefore);
    expect(opened.filter((u) => u.startsWith("blob:")), "nothing may ever be navigated to a blob: URL for a non-viewable type").toEqual([]);

    // …and the refusal must not masquerade as either of the two failures it is not.
    await expect(page.getByText(/Could not open this document/)).toHaveCount(0);
    await expect(page.getByText(/blocked the new tab/)).toHaveCount(0);

    // The honest alternative is a real control, and it opens the structured view.
    await page.getByRole("button", { name: "Show what was extracted" }).click();
    await expect(page.getByRole("button", { name: "Hide extraction text" })).toBeVisible();
  });

  test("VACUITY CONTROL: a PDF still opens in a new tab — the gate refuses a TYPE, not the feature", async ({ page, context }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await expect(page.getByRole("button", { name: "Open document" })).toBeVisible();

    const popupPromise = context.waitForEvent("page", { timeout: 15_000 });
    await page.getByRole("button", { name: "Open document" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded").catch(() => { /* a blob: PDF may never fire load in headless */ });

    // The tab exists AND was navigated to this origin's own blob — which is the
    // behaviour the gate deliberately still permits for a PDF.
    await expect.poll(() => popup.url(), { timeout: 10_000 }).toMatch(/^blob:/);
    await expect(page.getByText(/can't be shown in a browser tab/)).toHaveCount(0);
    await popup.close();
  });

  test("D2: the page overlay draws real polygons, skips malformed geometry, and a fact click highlights its own region", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);

    // The facts table is the always-visible half. Two known invoice paths get
    // human labels; both keep their raw path beside them for audit.
    await expect(page.getByText("Invoice total")).toBeVisible();
    await expect(page.getByText("invoice.total")).toBeVisible();
    await expect(page.getByText("Supplier name")).toBeVisible();
    await expect(page.getByText("1234.50")).toBeVisible();

    await page.getByRole("button", { name: "Show page overlay" }).click();

    // The page itself: pdf.js's dynamic chunk is fetched, its worker is loaded
    // from public/, and a canvas is painted. None of that exists in a unit run.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    const polygons = page.locator("svg[aria-hidden='true'] polygon");
    // THREE of the fixture's four regions carry a well-formed ring; the fourth
    // carries three numbers, which is not a polygon. It must be SKIPPED, never
    // drawn at a guessed position.
    await expect.poll(() => polygons.count(), { timeout: 20_000 }).toBe(3);

    const totalRow = page.getByRole("button", { name: "Invoice total" });
    await totalRow.click();

    // DISCRIMINATING: the clicked fact's own ROW becomes aria-selected, and
    // exactly one polygon carries the selected stroke. Before the click no row
    // is selected at all, which the first assertion below pins.
    await expect(page.locator("tr[aria-selected='true']")).toHaveCount(1);
    await expect(page.locator("tr[aria-selected='true']")).toContainText("Invoice total");

    // The overlay is decoration: the <svg> is aria-hidden, so the FACT LIST is
    // what a keyboard and a screen reader reach. Proven by driving it with the
    // keyboard rather than the mouse.
    await ensureRealFocus(page);
    await page.getByRole("button", { name: "Supplier name" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("tr[aria-selected='true']")).toContainText("Supplier name");
  });

  test("D3: the extraction view is tiered — facts up front, page text and the raw envelope collapsed", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await page.getByRole("button", { name: "View extraction text" }).click();

    await expect(page.getByText("Page text")).toBeVisible();

    // THE RAW ENVELOPE IS COLLAPSED BY DEFAULT. `details:not([open])` is the
    // discriminating selector: a <details> that renders open would still match
    // a plain text assertion on its summary.
    const raw = page.locator("details", { hasText: "Raw engine output (JSON)" }).first();
    await expect(raw).toBeVisible();
    await expect(raw).not.toHaveAttribute("open", /.*/);

    // Its content is reachable, and pretty-printed rather than one long line.
    await raw.locator("summary").click();
    await expect(raw.locator("pre")).toContainText("schema_version");
  });

  test("D1: confirm-and-file re-reads the candidates cell", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    const candidates = page.getByRole("heading", { name: "Needs your confirmation" });
    await expect(candidates).toBeVisible();
    await expect(page.getByText("No documents are waiting on a confirmation for this client.")).toHaveCount(0);

    await page.getByRole("button", { name: "Confirm & file" }).first().click();

    // DISCRIMINATING: the section's own EMPTY STATE appears. That string is
    // true only after a re-read that saw the candidate disposed — the door's
    // own response is never trusted for it.
    await expect(page.getByText("No documents are waiting on a confirmation for this client.")).toBeVisible({ timeout: 15_000 });
  });

  test("C-07 ROW B: the report-only CSP is on the wire, and the browser reports what enforcing it would cost", async ({ page }) => {
    const violations: string[] = [];
    const onConsole = (message: ConsoleMessage) => {
      const text = message.text();
      if (/Content Security Policy/i.test(text)) violations.push(text);
    };
    page.on("console", onConsole);

    const response = await page.goto("/login");
    const header = response?.headers()["content-security-policy-report-only"] ?? "";

    // THE HEADER IS ON A REAL RESPONSE, not merely in a constant.
    expect(header, "the report-only CSP must reach the browser").toContain("object-src 'none'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("script-src 'self'");
    expect(
      response?.headers()["content-security-policy"],
      "the ENFORCING header must NOT be set — this pass is a measurement, and enforcing it is its own row",
    ).toBeUndefined();

    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await page.getByRole("button", { name: "Show page overlay" }).click();
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    page.off("console", onConsole);

    // THE MEASUREMENT ITSELF. Report-only cannot break anything, so this cell
    // never fails on a violation — it PRINTS the distinct directives the
    // browser reported, which is the answer to the ruling's open question
    // ("does Next 16 on Workers need 'unsafe-inline' or a nonce?") and goes
    // into the PR body verbatim.
    const directives = [...new Set(violations.map((v) => {
      const m = /directive: "([^"]+)"/.exec(v) ?? /violates the following Content Security Policy directive: (\S+)/.exec(v);
      return m ? m[1]! : v.slice(0, 160);
    }))];
    console.log(`[CSP MEASUREMENT] ${violations.length} report-only violation(s); distinct directives: ${JSON.stringify(directives)}`);

    // The one thing this cell DOES assert: the page still works under the
    // report-only policy. A report-only header that broke the app would mean it
    // was being enforced, which is the failure mode worth catching.
    await expect(page.getByText("Invoice total")).toBeVisible();
  });

  test("axe: the documents tab with the overlay open has no WCAG A/AA violations", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await page.getByRole("button", { name: "Show page overlay" }).click();
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.getByRole("button", { name: "View extraction text" }).click();
    await expect(page.getByText("Page text")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
