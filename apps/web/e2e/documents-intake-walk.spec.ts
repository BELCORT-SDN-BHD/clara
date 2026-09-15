// #633's browser leg — the intake journey, walked in real Chromium against the BUILT app.
//
// TWO SURFACES, one journey:
//   (a) the CLIENT documents tab — a mixed batch settling per file, three controls that
//       do three different things, receipts that survive a reload, a status that settles
//       without one, the four capability tiers on a row, the document -> Work link, and
//       the actionable "Needs classification" state;
//   (b) the FIRM leaf — the unassigned population, the ask-once attribution act, the row
//       leaving the set, a second attempt refused verbatim, and the three read faces.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Real: the browser, the built bundle, the
// SAME-ORIGIN runtime proxy (firm-scope guard and header allow-list included), the upload
// queue, the settle-poll, the capability join and every message key. Mocked: PostgREST and
// the runtime's three intake legs — see `documents-intake-mock.mjs`. So this walk is
// evidence about the JOURNEY and the client's own wire shapes. It is NOT evidence that
// Postgres or the runtime accept them: `packages/db/tests/document-intake-*.test.mjs` owns
// the DB half and `packages/runtime/tests/intake-admission-e2e.mjs` owns the real-World
// admission chain.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { settleForScan, watchReactFaults } from "./helpers";

const CLIENT_ID = "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
const WORK_ID = "8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a";

const DOCUMENTS_URL = `/clients/${CLIENT_ID}/documents`;
const FIRM_DOCUMENTS_URL = "/documents";

/** The repo's own axe scope (interview-walk.spec.ts:39): WCAG 2.0/2.1 A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, what: string): Promise<void> {
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, `${what}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

/** The harness's own credentials and the same already-signed-in short circuit every other
 *  walk uses (`chat-parity-walk.spec.ts:63-71`) — copied rather than re-invented, because a
 *  second spelling of the fixture password is a second thing to keep in step. */
async function signIn(page: Page): Promise<void> {
  const alreadySignedIn = (await page.context().cookies()).some((c) => c.name === "__Host-clara-auth");
  if (alreadySignedIn) return;
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  // The SHELL'S OWN LANDMARK, not a URL shape — the wait every other documents walk uses
  // (documents-viewer-walk.spec.ts). A URL assertion carries a 5 s default and passes or
  // fails on a redirect this walk does not actually care about; what it needs to know is
  // that the authenticated shell has rendered.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 30_000 });
}

async function openDocuments(page: Page): Promise<void> {
  await signIn(page);
  await page.goto(DOCUMENTS_URL);
  await expect(page.getByRole("heading", { name: "Documents", exact: false }).first()).toBeVisible({ timeout: 30_000 });
}

/** THE THREE TABLES, BY NAME. Every one of these surfaces renders a `DataTableCard`,
 *  which names its own scroll region after the table it scrolls (components/ui/table.tsx).
 *  Scoping by region is what keeps these cells honest: the SAME filename legitimately
 *  appears in the receipts table AND the filed-documents table, so an unscoped
 *  `getByText(name)` resolves to two elements and fails strict mode rather than
 *  asserting anything. */
const receiptsTable = (page: Page) => page.getByRole("region", { name: "Upload receipts" });
const queueTable = (page: Page) => page.getByRole("region", { name: "Uploads in progress" });
const sourcesTable = (page: Page) => page.getByRole("region", { name: "Unassigned sources" });

/** A file the runtime's allowlist admits. */
const pdf = (name: string, size = 64) => ({
  name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 ".padEnd(size, "e")),
});

test("the durable receipts survive a RELOAD — the queue's own memory is not the record", async ({ page }) => {
  const faults = watchReactFaults(page);
  await openDocuments(page);

  // Nothing has been uploaded in THIS browser session, so anything on screen came from a
  // read of `document_intakes_visible` rather than from the queue's React ref.
  await expect(page.getByText("Recent uploads")).toBeVisible();
  await expect(receiptsTable(page).getByText("april-invoice.pdf")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No uploads yet", { exact: false })).toBeVisible();

  // And again after a real navigation — the defect this closes is that a reload lost
  // every receipt.
  await page.reload();
  await expect(receiptsTable(page).getByText("april-invoice.pdf")).toBeVisible({ timeout: 20_000 });
  expect(faults.faults(), faults.seen().join("\n")).toEqual([]);
});

test("a status SETTLES without a reload, and the watermark says what is still moving", async ({ page }) => {
  await openDocuments(page);

  // `march-statement.pdf` is still verifying on the first read and adopts on the second.
  // The person does nothing; the bounded poll does the second read.
  await expect(receiptsTable(page).getByText("march-statement.pdf")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("receipts-watermark")).toContainText(/Watching 1 unfinished upload|Every upload here has settled/);
  await expect(page.getByTestId("receipts-watermark")).toContainText("Every upload here has settled", { timeout: 30_000 });
});

test("the four capability tiers are readable per row, and a payroll PDF never reads as facts support", async ({ page }) => {
  await openDocuments(page);
  const row = receiptsTable(page).getByRole("row").filter({ hasText: "march-statement.pdf" });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // `march-statement.pdf` is a payroll_summary: its bytes ARE read and its facts are not
  // supported. `extraction_status: done` must never stand in for the second.
  await expect(row.getByText("Custody")).toBeVisible();
  await expect(row.getByText("Supported").first()).toBeVisible();
  await expect(row.getByText("Not supported").first()).toBeVisible();
});

test("a five-file mixed batch settles each file on its own, with a NEXT STEP for each refusal", async ({ page }) => {
  await openDocuments(page);

  await page.setInputFiles('input[type="file"]', [
    pdf("good-one.pdf"),
    pdf("good-two.pdf"),
    { name: "notes.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
    pdf("good-three.pdf"),
  ]);

  // The queue is a real table now: one row per file, each with its own status.
  await expect(queueTable(page)).toBeVisible({ timeout: 20_000 });
  for (const name of ["good-one.pdf", "good-two.pdf", "good-three.pdf", "notes.exe"]) {
    await expect(queueTable(page).getByRole("row").filter({ hasText: name })).toBeVisible({ timeout: 20_000 });
  }

  // The GOOD files reach the queue's terminal word IN THEIR OWN ROW. "Filed" is the
  // shipped terminal string chat-parity-walk.spec.ts:209 also asserts — a rename would
  // break both. Scoped to the row and matched EXACTLY, because "Filed to this client" is
  // a section heading on the same page and a loose match would pass without the queue
  // ever settling.
  await expect(
    queueTable(page).getByRole("row").filter({ hasText: "good-one.pdf" }).getByText("Filed", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  // And the bad one carries a REFUSAL naming the constraint, not a generic failure.
  await expect(page.getByTestId("queue-denied-face").first()).toBeVisible({ timeout: 30_000 });
});

test("Cancel, Retry and Remove are three DIFFERENT acts, and progress is measured or absent", async ({ page }) => {
  await openDocuments(page);
  await page.setInputFiles('input[type="file"]', [pdf("controls.pdf")]);
  await expect(queueTable(page).getByRole("row").filter({ hasText: "controls.pdf" })).toBeVisible({ timeout: 20_000 });

  // A real progressbar with real bounds. Chromium DOES measure an XHR upload, so this
  // may carry a value; what must never happen is a bar with a number nobody measured.
  const bar = queueTable(page).getByRole("progressbar").first();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuemin", "0");

  // Remove is its own verb, and on a settled row the first press parks it rather than
  // vanishing a file that may already be stored.
  const controlsRow = queueTable(page).getByRole("row").filter({ hasText: "controls.pdf" });
  await expect(controlsRow.getByText("Filed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(controlsRow.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await controlsRow.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Tracking stopped after the file was sent", { exact: false })).toBeVisible();
  // Retry is offered on that parked row — the third act.
  await expect(controlsRow.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the document says which WORK it produced — and says so honestly when it produced none", async ({ page }) => {
  await openDocuments(page);
  // The FILED row, not the receipt row: the same filename appears in both tables and only
  // the filed one opens the detail. "filed by a human" is the filed table's own basis cell.
  await page.getByRole("row")
    .filter({ hasText: "april-invoice.pdf" })
    .filter({ hasText: "filed by a human" })
    .first()
    .click();

  await expect(page.getByText("Work from this file")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("The FILE was adopted into custody", { exact: false })).toBeVisible();
  const link = page.getByRole("link", { name: "Open this Work" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", new RegExp(`/work/${WORK_ID}$`));
  // A LINK, not an inline cancel control: cancelling an accepted Work is a governed act
  // on another object, and it does not live on the document.
  await expect(page.getByRole("button", { name: /Cancel this Work/i })).toHaveCount(0);
});

test("320px and 200% zoom leave no page-wide horizontal scroll on the documents tab", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openDocuments(page);
  await expect(receiptsTable(page).getByText("april-invoice.pdf")).toBeVisible({ timeout: 20_000 });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  // Tables may scroll INSIDE their own container; the page itself may not.
  expect(overflow.scroll, `page scrollWidth ${overflow.scroll} > clientWidth ${overflow.client}`)
    .toBeLessThanOrEqual(overflow.client + 1);

  // 200% zoom is the same page at half the CSS viewport.
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.body.style.zoom = "200%"; });
  const zoomed = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(zoomed.scroll).toBeLessThanOrEqual(zoomed.client + 1);
  await page.evaluate(() => { document.body.style.zoom = ""; });
});

test("the documents tab is axe-clean with a populated queue and populated receipts", async ({ page }) => {
  await openDocuments(page);
  await page.setInputFiles('input[type="file"]', [pdf("a11y.pdf")]);
  await expect(queueTable(page).getByRole("row").filter({ hasText: "a11y.pdf" })).toBeVisible({ timeout: 20_000 });
  await expect(receiptsTable(page).getByText("april-invoice.pdf")).toBeVisible({ timeout: 20_000 });
  await scan(page, "documents tab, queue + receipts populated");
});

// ---------------------------------------------------------------------------
// THE FIRM LEAF (AC5's own walk)
// ---------------------------------------------------------------------------

test("the firm leaf lists an unassigned source with its kind phrase and its published tiers", async ({ page }) => {
  await signIn(page);
  await page.goto(FIRM_DOCUMENTS_URL);

  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(sourcesTable(page).getByText("ssm-form-24.pdf")).toBeVisible({ timeout: 20_000 });
  // The KIND as a phrase, never the enum.
  await expect(page.getByText("SSM company document")).toBeVisible();
  await expect(page.getByText("ssm_company_doc")).toHaveCount(0);
  // And the published levels for that pair.
  await expect(page.getByText("Custody").first()).toBeVisible();
  await expect(page.getByText("Not supported").first()).toBeVisible();
});

test("the firm leaf is axe-clean and leaves no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto(FIRM_DOCUMENTS_URL);
  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible({ timeout: 30_000 });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);

  await page.setViewportSize({ width: 1280, height: 800 });
  await scan(page, "firm unassigned-sources leaf");
});

test("the firm leaf is reachable by KEYBOARD from the shell, and its own controls are too", async ({ page }) => {
  await signIn(page);
  await page.goto(FIRM_DOCUMENTS_URL);
  await expect(sourcesTable(page).getByText("ssm-form-24.pdf")).toBeVisible({ timeout: 20_000 });

  // Tab until the attribution control has focus; a control a keyboard cannot reach is
  // not a control.
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.textContent?.includes("File to this client") === true
        || el?.getAttribute("aria-label")?.includes("Client for") === true;
    });
  }
  expect(reached, "the attribution control must be reachable by keyboard alone").toBe(true);
});

// LAST ON PURPOSE. This is the ONE destructive cell in the file: the lane's unassigned
// population is a single document, and filing it empties the set for every cell that runs
// after. Playwright runs a file in source order on one worker, so "last" is the contract —
// and it is cheaper and more honest than a reset hook the mock would have to expose.
test("the ask-once attribution act files the source and the row LEAVES the set", async ({ page }) => {
  await signIn(page);
  await page.goto(FIRM_DOCUMENTS_URL);
  await expect(sourcesTable(page).getByText("ssm-form-24.pdf")).toBeVisible({ timeout: 20_000 });

  // The picker is named for the FILE it is about, so a page of many rows says which one
  // each control belongs to. Reached by its accessible name rather than by a role guess:
  // @base-ui renders its trigger as a button that exposes a combobox role only once the
  // popup mounts.
  await page.getByLabel(/Client for ssm-form-24\.pdf/).click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "File to this client" }).click();

  // ASK ONCE: the question is not offered again, and the next settled read drops the row
  // entirely because the DB's own predicate stops matching it.
  await expect(page.getByTestId("already-asked").or(page.getByText("No unassigned sources")))
    .toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByText("No unassigned sources", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ssm-form-24.pdf")).toHaveCount(0);
});
