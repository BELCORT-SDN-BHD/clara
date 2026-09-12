// THE DOCUMENTS-VIEWER WALK (裁-86: every frontend train walks its journey in a
// real browser, on the BUILT app).
//
// Four things are proven here that no unit test can prove, because each of them
// is a property of the real browser rather than of a function:
//
//   1. C-07 / 裁-175 — an XML document is never OFFERED a tab, and no browsing
//      context appears while it is open. The unit test proves the library
//      returns `not_viewable`; only a browser can prove that the context count
//      does not grow and that nothing is ever navigated to a `blob:` URL in
//      this origin.
//   2. A PDF's "Open original" DOES open one — the vacuity control on (1),
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
  // #614: "Firm navigation" retired with the bespoke `<aside>` it named —
  // the sidebar's one landmark is now "Main" (lib/navigation/tree.ts).
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

test.describe("documents viewer — the MIME gate, the page overlay and the CSP", () => {
  test("C-07: an XML document is never OFFERED a tab — the reason stands, and no browsing context appears", async ({ page, context }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    await expect(page.getByRole("heading", { name: "Filed to this client" })).toBeVisible();
    await selectDocument(page, /myinvois-e-invoice\.xml/);

    // THE OFFER, NOT THE CLICK. Before the source-custody pass this control rendered for every
    // type and an XML's refusal appeared only AFTER pressing it — the person was told about the
    // wall by being walked into it. The wall itself (`VIEWABLE_IN_NEW_TAB`, enforced inside
    // `openDocumentInNewTab` against the RESPONSE's content-type) is unchanged and is measured by
    // `lib/documents/open-in-new-tab.test.ts`; what this cell measures is that the face agrees
    // with it before anybody presses anything.
    await expect(page.getByTestId("document-open-original")).toHaveCount(0);
    await expect(page.getByText(/can't be shown in a browser tab/)).toBeVisible();
    await expect(page.getByText(/application\/xml/)).toBeVisible();

    // THE MEASUREMENT: no browsing context appears at all. The XML row is now selected and the
    // only controls on the panel are the download and the extraction link — neither may open a tab.
    const pagesBefore = context.pages().length;
    await page.waitForTimeout(1000);
    expect(context.pages().length, "nothing on this panel may open a browsing context for an un-previewable type").toBe(pagesBefore);

    // …and the standing reason must not masquerade as either of the two failures it is not.
    await expect(page.getByText(/Could not open this document/)).toHaveCount(0);
    await expect(page.getByText(/blocked the new tab/)).toHaveCount(0);

    // THE FILE IS STILL OBTAINABLE, which is what the old refusal never had: an e-invoice XML is a
    // document a person legitimately needs the bytes of and can never be shown one of.
    await expect(page.getByTestId("document-download-original")).toBeVisible();

    // The honest alternative is a real control, and it opens the structured view.
    await page.getByRole("button", { name: "Show what was extracted" }).click();
    await expect(page.getByRole("button", { name: "Hide extraction text" })).toBeVisible();
  });

  test("VACUITY CONTROL: a PDF still opens in a new tab — the offer refuses a TYPE, not the feature", async ({ page, context }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await expect(page.getByTestId("document-open-original")).toBeVisible();

    const pagesBefore = context.pages().length;
    const popupPromise = context.waitForEvent("page", { timeout: 15_000 });
    await page.getByTestId("document-open-original").click();
    const popup = await popupPromise;

    // THE DISCRIMINATING PROPERTY IS THAT THE TAB SURVIVES, not what its URL string reads.
    // `openDocumentInNewTab` navigates by assigning `tab.location.href`, and Chromium's reported
    // URL for a popup navigated that way to a `blob:` PDF stays "about:blank" in headless —
    // measured, and asserting on it made this control flaky rather than strict.
    await page.waitForTimeout(1000);
    expect(popup.isClosed(), "a viewable document's tab must NOT be closed").toBe(false);
    expect(context.pages().length, "the opened tab must still be there").toBe(pagesBefore + 1);
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

    // SCOPED TO THE FACTS TABLE. The filed-document list also marks its own
    // current row, so an unscoped `tr[aria-selected]` matched two elements —
    // and the first cut of this cell was measuring the wrong table.
    const factsRows = page.locator("table tr[aria-selected='true']");
    await expect(factsRows, "no fact is highlighted before the click").toHaveCount(0);

    await page.getByRole("button", { name: "Invoice total" }).click();

    // DISCRIMINATING: the clicked fact's own row — and only it — becomes
    // aria-selected. The count-before-zero above is what makes the count-after-
    // one mean something.
    await expect(factsRows).toHaveCount(1);
    await expect(factsRows).toContainText("Invoice total");

    // The overlay is decoration: the <svg> is aria-hidden, so the FACT LIST is
    // what a keyboard and a screen reader reach. Proven by driving it with the
    // keyboard rather than the mouse.
    await ensureRealFocus(page);
    await page.getByRole("button", { name: "Supplier name" }).focus();
    await page.keyboard.press("Enter");
    await expect(factsRows).toContainText("Supplier name");
  });

  test("[MAJOR 1] the polygon layer stays on the page after a width change — the canvas is not pinned to a fixed pixel box", async ({ page }) => {
    // THE DEFECT: `renderPdfPageToCanvas` used to set `canvas.style.width/height`
    // inline, which beats the host's `w-full` class. The <svg> overlay is sized
    // to the HOST (`absolute inset-0`), so the moment the host moved — most
    // routinely when the vertical scrollbar appears in the `max-h-[32rem]`
    // scroller, ~15px on classic scrollbars, every single time — the two boxes
    // stopped agreeing and every polygon was drawn in the wrong place.
    //
    // The assertion is that the SVG's rendered width EQUALS the page element's,
    // measured from the browser, before AND after a real viewport change. If
    // the inline size ever comes back, the second pair diverges.
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await page.getByRole("button", { name: "Show page overlay" }).click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    // THE MEASURED ELEMENT IS SCOPED TO THE OVERLAY LAYER, and that is the whole
    // point of this edit. `document.querySelector("svg[aria-hidden='true']")`
    // takes the FIRST match in document order — which on this page is a
    // breakpoint-hidden `lucide-menu` icon of width 0, not the polygon layer.
    //
    // Measured on 2026-09-05: the page carries THREE aria-hidden svgs; index 0
    // is that icon at width 0, index 1 is the overlay at 125.5, exactly the
    // canvas's width. So the geometry was right and the assertion was reading
    // the wrong element — it passed on one tree and failed on pure main with
    // IDENTICAL code. A cell that passes by luck is worse than one that fails,
    // because it reports a fix that was never measured.
    //
    // `:has(polygon)` is the subject's own child, so the poll below and the
    // measurement now read the SAME locator, and the measurement asserts the
    // locator actually resolved to the layer before believing its width.
    const OVERLAY_SVG = "svg[aria-hidden='true']:has(polygon)";
    await expect.poll(() => page.locator(`${OVERLAY_SVG} polygon`).count(), { timeout: 20_000 }).toBeGreaterThan(0);

    const widths = async () => page.evaluate((selector) => {
      const svg = document.querySelector(selector);
      const canvas = document.querySelector("canvas");
      if (!svg || !canvas) return null;
      return {
        svg: svg.getBoundingClientRect().width,
        page: canvas.getBoundingClientRect().width,
        // Carried out so the assertion can prove WHICH element it measured
        // rather than trusting the selector to have found the right one.
        polygons: svg.querySelectorAll("polygon").length,
      };
    }, OVERLAY_SVG);

    const before = await widths();
    expect(before, "both the page element and its overlay must be on screen").not.toBeNull();
    expect(before!.polygons, "the measured svg must BE the overlay layer — a zero-polygon match is some other decorative icon").toBeGreaterThan(0);
    expect(Math.abs(before!.svg - before!.page), `svg ${before!.svg} vs canvas ${before!.page}`).toBeLessThanOrEqual(1);

    // A real width change, not a simulated one.
    //
    // THE POLL WAITS FOR A COMPLETE MEASUREMENT, not merely a different number.
    // Its first cut read `(await widths())?.page ?? 0` and stopped as soon as
    // that differed from `before` — which a NULL satisfies instantly, because
    // the overlay unmounts its <svg> for a frame while the reflowed page is
    // re-measured (the layer renders only once there are polygons AND a size).
    // The poll therefore passed on the empty state and the next line dereferenced
    // null. Waiting on all three facts — resolved, still the layer, and actually
    // resized — is what makes the assertion below about geometry rather than
    // about timing.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect
      .poll(async () => {
        const w = await widths();
        return w !== null && w.polygons > 0 && w.page !== before!.page;
      }, { timeout: 15_000 })
      .toBe(true);

    const after = await widths();
    expect(after, "the overlay must be back on screen after the reflow").not.toBeNull();
    expect(after!.polygons, "the overlay layer must still be the element measured after the resize").toBeGreaterThan(0);
    expect(
      Math.abs(after!.svg - after!.page),
      `after the resize the overlay drifted off the page: svg ${after!.svg} vs canvas ${after!.page}`,
    ).toBeLessThanOrEqual(1);
  });

  test("D3: the extraction view is tiered — facts up front, page text and the raw envelope collapsed", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);
    await page.getByRole("button", { name: "View extraction text" }).click();

    await expect(page.getByRole("heading", { name: "Page text" })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "Page text" })).toBeVisible();

    // OPEN THE RAW ENVELOPE BEFORE SCANNING. Its <pre> is a capped
    // `overflow-auto` block — the same scrollable-region class this train
    // already fixed on the page scroller — and while the <details> is closed it
    // is not in the accessibility tree at all, so a scan here proved nothing
    // about it. The fold's mutant panel is what caught that: removing the
    // pre's `tabIndex` left every cell green.
    await page.locator("details", { hasText: "Raw engine output (JSON)" }).first().locator("summary").click();
    await expect(page.locator("pre", { hasText: "schema_version" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

    // NO CARVE-OUT. It is deleted with #549 (`90b59cc1`), which fixed
    // `components/ui/table.tsx` at the source — its scroll container now takes
    // `tabIndex={0}`, plus `role="region"` and a name when one is given. This
    // train raised that finding and admitted exactly one violation for it while
    // it stood; the admission goes now that the cause has, which is what the
    // carve-out's own note said would happen.
    //
    // The OTHER violation this scan found was this train's own and was fixed
    // here: `filed-document-list.tsx` put `aria-selected` on a `role="button"`
    // row (aria-allowed-attr, CRITICAL) — now `aria-current`.
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});

// ============================================================================================
// #620 — THE SOURCE-CUSTODY JOURNEY: preview, download, and the state ladder.
//
// WHAT THIS BLOCK IS EVIDENCE OF, said plainly: the JOURNEY and this app's own wire code against a
// MOCK runtime (`documents-viewer-mock.mjs` serves every response shape the route contract names).
// It is NOT evidence that Postgres would admit any of these reads, that the door's membership or
// filing predicate holds, or that Storage's grants are what they claim. Those are permission
// claims and they belong to the db/runtime battery, not to a browser walk against a fake.
// What only a browser can prove, and what these cells therefore exist for:
//   · a download is a real `fetch` + object URL + synthetic click, with `disposition=attachment` on
//     the wire and the URL released afterwards — none of which a unit test can observe end to end
//     through a built bundle and a real same-origin proxy;
//   · six refusals rendering DISTINCTLY on one page, with the right recovery control on each;
//   · `?document=` surviving a real reload and the real browser Back button;
//   · no horizontal page scroll at 320px and at 200% zoom, measured from layout rather than
//     asserted about CSS.
// ============================================================================================

/** Installs an object-URL recorder BEFORE any app script runs, so a download's whole lifecycle is
 *  observable from the page. The sandbox blocks a real save — Playwright's `download` event needs a
 *  navigation the harness does not allow for a blob anchor — so the measurable facts are the ones
 *  that matter anyway: the request that went out, the anchor's `download` attribute, and whether
 *  the object URL was released. A cell that only asserted "no error appeared" would pass against a
 *  button that does nothing. */
async function instrumentDownloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __claraDownloads: { created: string[]; revoked: string[]; anchors: string[] };
    };
    w.__claraDownloads = { created: [], revoked: [], anchors: [] };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = createObjectURL(obj as Blob);
      w.__claraDownloads.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      w.__claraDownloads.revoked.push(url);
      revokeObjectURL(url);
    };
    // The anchor a download synthesises is appended, clicked and removed within a tick, so it can
    // never be found by a selector — its `download` attribute is captured at click time instead.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      if (this.download) {
        w.__claraDownloads.anchors.push(this.download);
        return; // the sandbox cannot complete the save; the intent is what is measured
      }
      return click.call(this);
    };
  });
}

function downloadState(page: Page) {
  return page.evaluate(() => (window as unknown as {
    __claraDownloads: { created: string[]; revoked: string[]; anchors: string[] };
  }).__claraDownloads);
}

/** The widest any element extends past the viewport, and the document's own scroll width. Measured
 *  from the browser's layout rather than reasoned about from CSS — a `max-w` class that is beaten
 *  by an inline width or by an unbreakable string looks correct in source and scrolls in fact. */
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

test.describe("#620 — source custody: preview, download and the state ladder (journey evidence against a mock, never permission evidence)", () => {
  test("DOWNLOAD: the original is fetched with disposition=attachment, handed to a save, and the object URL released", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/runtime/documents/")) requests.push(r.url()); });
    await instrumentDownloads(page);
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /invoice-april\.pdf/);

    const download = page.getByTestId("document-download-original");
    await expect(download).toBeVisible();
    await download.click();

    // THE REQUEST IS THE PIN. `disposition=attachment` is what the runtime maps onto the door's
    // `p_purpose='download'`, which is what the audit line records — remove the parameter and this
    // cell goes red while every visual assertion below still passes (that is the red-on-old-
    // definition proof this lane owes).
    await expect
      .poll(() => requests.filter((u) => u.includes("disposition=attachment")).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const attachmentUrl = requests.find((u) => u.includes("disposition=attachment"))!;
    expect(attachmentUrl, "the page's own client scope must travel with the read").toContain(`client=${DOCS.clientId}`);
    expect(attachmentUrl).toContain(`/api/runtime/documents/${DOCS.docPdf}/bytes`);
    // SAME-ORIGIN: the app's own origin, never a storage host.
    expect(new URL(attachmentUrl).origin).toBe(new URL(page.url()).origin);

    await expect.poll(async () => (await downloadState(page)).anchors.length, { timeout: 15_000 }).toBe(1);
    const saved = await downloadState(page);
    expect(saved.anchors[0], "the server's own derived filename must be what is offered to the person").toBe("invoice-april.pdf");
    expect(saved.created.length, "the bytes must be blobbed, not linked").toBeGreaterThan(0);

    // THE REVOKE, one tick after the click. Without it every download leaks an object URL for the
    // lifetime of the tab — invisible in a screenshot and real in a long session.
    await expect.poll(async () => (await downloadState(page)).revoked.length, { timeout: 10_000 }).toBeGreaterThan(0);

    // …and nothing failed: no state banner appeared beside the control.
    await expect(page.getByTestId("document-source-retry")).toHaveCount(0);
    await expect(page.getByText(/couldn't be reached|no longer matches the record|isn't available in this client/)).toHaveCount(0);
  });

  test("PREVIEW: a viewable original still opens its own tab, and an un-previewable one is never offered it", async ({ page, context }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    await selectDocument(page, /invoice-april\.pdf/);
    const pagesBefore = context.pages().length;
    const popupPromise = context.waitForEvent("page", { timeout: 15_000 });
    await page.getByTestId("document-open-original").click();
    const popup = await popupPromise;
    await page.waitForTimeout(500);
    expect(popup.isClosed(), "a viewable document's tab must survive").toBe(false);
    expect(context.pages().length).toBe(pagesBefore + 1);
    await popup.close();

    // The XML: no Open control at all, the standing reason, and the download beside it.
    await selectDocument(page, /myinvois-e-invoice\.xml/);
    await expect(page.getByTestId("document-open-original")).toHaveCount(0);
    await expect(page.getByText(/can't be shown in a browser tab/)).toBeVisible();
    await expect(page.getByTestId("document-download-original")).toBeVisible();
  });

  test("THE LADDER: denied, not-found, storage-unavailable, custody-pending, expired session and integrity render DISTINCTLY", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);

    const cases = [
      { file: /denied-membership\.pdf/, text: /no longer have access to this firm's documents/, retry: false, reauth: false },
      { file: /not-in-this-client\.pdf/, text: /isn't available in this client/, retry: false, reauth: false },
      { file: /store-unavailable\.pdf/, text: /document store couldn't be reached/, retry: true, reauth: false },
      { file: /custody-pending\.pdf/, text: /still verifying this file's stored copy/, retry: true, reauth: false },
      { file: /session-expired\.pdf/, text: /Your session expired while this file was being read/, retry: false, reauth: true },
      { file: /checksum-mismatch\.pdf/, text: /no longer matches the record Clara holds/, retry: false, reauth: false },
    ];

    const seen: string[] = [];
    for (const c of cases) {
      await selectDocument(page, c.file);
      await page.getByTestId("document-download-original").click();
      await expect(page.getByText(c.text)).toBeVisible({ timeout: 15_000 });

      // THE RECOVERY CONTROL IS PART OF THE STATE, not decoration beside it. A Retry next to a
      // checksum mismatch is a button that cannot work; its absence next to an unreachable store
      // strands a reader on a failure that fixes itself.
      await expect(page.getByTestId("document-source-retry")).toHaveCount(c.retry ? 1 : 0);
      await expect(page.getByTestId("document-source-reauthenticate")).toHaveCount(c.reauth ? 1 : 0);

      seen.push((await page.getByTestId("document-source-actions").innerText()).replace(/\s+/g, " ").trim());
    }

    // THE CONTROL ON ALL SIX. Each assertion above passes against a surface that renders one
    // constant sentence per document so long as each constant matches its own regex; six distinct
    // rendered panels is what says the ladder did not collapse.
    expect(new Set(seen).size, `six refusals must read six different ways:\n${seen.join("\n---\n")}`).toBe(6);
  });

  test("RETRY restores the read: the second attempt reaches the wire and the failure clears", async ({ page }) => {
    const byteReads: string[] = [];
    page.on("request", (r) => { if (/\/api\/runtime\/documents\/[^/]+\/bytes/.test(r.url())) byteReads.push(r.url()); });
    await instrumentDownloads(page);
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await selectDocument(page, /recovers-on-retry\.pdf/);

    await page.getByTestId("document-download-original").click();
    await expect(page.getByText(/document store couldn't be reached/)).toBeVisible({ timeout: 15_000 });
    const readsAfterFailure = byteReads.length;
    expect(readsAfterFailure).toBeGreaterThan(0);

    await page.getByTestId("document-source-retry").click();

    // A SECOND REQUEST, not a repaint of the first outcome.
    await expect.poll(() => byteReads.length, { timeout: 15_000 }).toBeGreaterThan(readsAfterFailure);
    await expect(page.getByText(/document store couldn't be reached/)).toHaveCount(0);
    await expect.poll(async () => (await downloadState(page)).anchors.length, { timeout: 15_000 }).toBe(1);
    expect((await downloadState(page)).anchors[0]).toBe("recovers-on-retry.pdf");
  });

  test("URL: ?document= survives a reload, and the browser's own Back button closes the detail", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await expect(page.getByText("Select a document to see its evidence")).toBeVisible();

    await selectDocument(page, /invoice-april\.pdf/);
    await expect(page).toHaveURL(new RegExp(`\\?document=${DOCS.docPdf}$`));

    // A REAL RELOAD — the property React state could never have had.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`\\?document=${DOCS.docPdf}$`));
    await expect(page.getByRole("heading", { name: "invoice-april.pdf" })).toBeVisible({ timeout: 20_000 });

    // THE BROWSER'S OWN BACK BUTTON, not the in-page control. `page.goBack()` pops the entry the
    // row click pushed; an implementation that used `replace` would leave this on /login or on the
    // previous page entirely, which is the defect this parameter exists to fix.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${DOCUMENTS_URL}$`));
    await expect(page.getByText("Select a document to see its evidence")).toBeVisible({ timeout: 15_000 });

    // FOCUS IS NOT STRANDED on <body> after the pop — the row that opened the detail takes it back.
    await expect.poll(async () => page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return "stranded";
      return (el.textContent ?? "").includes("invoice-april.pdf") ? "row" : el.tagName;
    }), { timeout: 10_000 }).toBe("row");
  });

  test("URL: a well-formed id this client cannot show renders the not-available state and CLEARS the parameter", async ({ page }) => {
    await signIn(page);
    await page.goto(`${DOCUMENTS_URL}?document=${DOCS.docUnknown}`);
    await expect(page.getByTestId("document-not-available")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`${DOCUMENTS_URL}$`), { timeout: 15_000 });

    // A MALFORMED id takes the same answer — a hand-edited or stale link is a not-found question,
    // never a database one (a non-uuid on a uuid column is a 400 the page would render as its own
    // error boundary).
    await page.goto(`${DOCUMENTS_URL}?document=not-a-uuid`);
    await expect(page.getByTestId("document-not-available")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`${DOCUMENTS_URL}$`), { timeout: 15_000 });
  });

  test("KEYBOARD ONLY: open a document, read it, go back, and download — without a mouse", async ({ page }) => {
    await signIn(page);
    await page.goto(DOCUMENTS_URL);
    await ensureRealFocus(page);

    // The row is a real keyboard control (`role="button"`, `tabIndex=0`) — activated with Enter.
    const row = page.getByRole("button", { name: /invoice-april\.pdf/ });
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`\\?document=${DOCS.docPdf}$`));
    await expect(page.getByRole("heading", { name: "invoice-april.pdf" })).toBeVisible({ timeout: 20_000 });

    // FOCUS LANDED IN WHAT WAS OPENED, not still on the row behind it.
    await expect.poll(async () => page.evaluate(() => document.activeElement?.id ?? ""), { timeout: 10_000 })
      .toBe("document-detail-heading");

    // Back out with the in-page control, reached by the keyboard.
    await page.getByTestId("document-detail-close").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Select a document to see its evidence")).toBeVisible({ timeout: 15_000 });

    // …and the download is reachable and operable from the keyboard too.
    await instrumentDownloads(page);
    await page.goto(`${DOCUMENTS_URL}?document=${DOCS.docPdf}`);
    const download = page.getByTestId("document-download-original");
    await download.focus();
    await expect(download).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await downloadState(page)).anchors.length, { timeout: 15_000 }).toBe(1);
  });

  test("RESPONSIVE: no horizontal page scroll at 320px, nor at 200% zoom, with a document open", async ({ page }) => {
    await signIn(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${DOCUMENTS_URL}?document=${DOCS.docPdf}`);
    await expect(page.getByRole("heading", { name: "invoice-april.pdf" })).toBeVisible({ timeout: 20_000 });
    const narrow = await horizontalOverflow(page);
    expect(
      narrow.docScrollWidth,
      `the page scrolls sideways at 320px. Widest offenders: ${JSON.stringify(narrow.widest, null, 2)}`,
    ).toBeLessThanOrEqual(narrow.docClientWidth + 1);

    // 200% ZOOM, emulated the way the spec means it: the CSS viewport halves while the layout keeps
    // its own rules. 1280x800 at 200% is a 640x400 CSS viewport.
    await page.setViewportSize({ width: 640, height: 400 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "invoice-april.pdf" })).toBeVisible({ timeout: 20_000 });
    const zoomed = await horizontalOverflow(page);
    expect(
      zoomed.docScrollWidth,
      `the page scrolls sideways at 200% zoom. Widest offenders: ${JSON.stringify(zoomed.widest, null, 2)}`,
    ).toBeLessThanOrEqual(zoomed.docClientWidth + 1);

    // BOTH CONTROLS ARE STILL REACHABLE at the narrow width — "no horizontal scroll" achieved by
    // pushing the primary action off the page would be a worse failure than the scroll.
    await expect(page.getByTestId("document-download-original")).toBeVisible();
    await expect(page.getByTestId("document-open-original")).toBeVisible();
  });

  test("REDUCED MOTION: the source panel moves nothing when the OS asks it not to", async ({ browser }) => {
    // MOVEMENT ONLY. A colour or opacity transition under reduced motion is not what the preference
    // is about; a control that slides, grows or repositions is. Two samples a frame apart around
    // the click, and the assertion is that no measured box CHANGED POSITION.
    const context = await browser.newContext({ reducedMotion: "reduce", ignoreHTTPSErrors: true });
    const page = await context.newPage();
    try {
      await instrumentDownloads(page);
      await signIn(page);
      await page.goto(`${DOCUMENTS_URL}?document=${DOCS.docUnavailable}`);
      await expect(page.getByTestId("document-download-original")).toBeVisible({ timeout: 20_000 });

      const boxes = () => page.evaluate(() => {
        const panel = document.querySelector('[data-testid="document-source-actions"]');
        if (!panel) return null;
        return [...panel.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y) };
        });
      });

      await page.getByTestId("document-download-original").click();
      await expect(page.getByText(/document store couldn't be reached/)).toBeVisible({ timeout: 15_000 });

      const first = await boxes();
      await page.waitForTimeout(120); // longer than the panel motion token's own duration
      const second = await boxes();
      expect(first).not.toBeNull();
      expect(second, "nothing in the source panel may still be moving after the outcome has settled").toEqual(first);

      // …and the reduced-motion run still reaches the same honest state, controls included.
      await expect(page.getByTestId("document-source-retry")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("axe: the documents tab with a document open and a refusal standing has no WCAG A/AA violations", async ({ page }) => {
    await signIn(page);
    await page.goto(`${DOCUMENTS_URL}?document=${DOCS.docIntegrity}`);
    await expect(page.getByTestId("document-download-original")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("document-download-original").click();
    await expect(page.getByText(/no longer matches the record Clara holds/)).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
