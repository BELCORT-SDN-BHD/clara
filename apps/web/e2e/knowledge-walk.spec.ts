import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";
import { KN } from "./knowledge-mock.mjs";

// #644 — journey C13: "search or category list → fact/identity/policy detail → source/history/
// conflict → correction or withdrawal" (acceptance appendix C, row C13).
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every line
// of client code — `KnowledgePanel`, `KnowledgeDetail`, the shared badge/applicability/source
// presentation, the door wrappers, `useAsyncRead`'s reload-after-write and the door dialog's
// single-fire confirm — are REAL. PostgREST is `knowledge-mock.mjs`, including the 403 the denied
// face needs, the empty documents read the inaccessible-source face needs, and the CLR10 the
// trust wall's refusal needs. So this walk proves the JOURNEY and what the surface does with each
// outcome; the doors' own floors, refusal roster and revision algebra are proven against a real
// Postgres under real least-privileged roles in packages/db/tests/knowledge-records.test.mjs.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

// ---------------------------------------------------------------------------
// The normal journey: the typed register, at desktop width.
// ---------------------------------------------------------------------------
test("the register renders typed categories, scope and trust for every record the database returned", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);

  // A stated fact, its corrected value, and who supplied it.
  await expect(page.getByText("47211")).toBeVisible();
  await expect(page.getByText("Aisyah Rahman", { exact: false }).first()).toBeVisible();
  // A firm default is labelled as one — a change there touches other clients.
  await expect(page.getByText("Firm default").first()).toBeVisible();
  // …and the typed categories are on screen, not merely in the payload.
  await expect(page.getByText("Preference").first()).toBeVisible();
  await expect(page.getByText("Stated fact").first()).toBeVisible();
  // The version the read actually used.
  await expect(page.getByText("Knowledge version 11")).toBeVisible();
  await expectAccessible(page, "knowledge register, populated");
});

test("an INFERRED record is badged unverified and never borrows a confirmed fact's words", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await expect(page.getByText("Unverified inference").first()).toBeVisible();
  // The meaning is available without colour: the badge carries it as a title.
  await expect(page.locator('[title*="advisory"]').first()).toHaveCount(1);
  await expectAccessible(page, "knowledge register, unverified inference");
});

test("a LEGACY client fact rides the same register, says it is the one in force, and offers no control the database has no door for", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await expect(page.getByText("Recorded as a client fact before the Knowledge register")).toBeVisible();
  await expect(page.getByText("Recorded before the Knowledge register existed", { exact: false })).toBeVisible();
  // …and the register says which row Clara acts on. `clara.client_facts` is still what
  // get_context_pack, the closing-stock gate, the name-only guard and the bank-registry ledger
  // read, so the legacy row is never shadowed and never reads as merely historical.
  const inForce = page.getByRole("alert").filter({ hasText: "This client fact is the one in force" });
  await expect(inForce).toBeVisible();
});

// ---------------------------------------------------------------------------
// The CONFLICT face — both live records, and the applicability that distinguishes them.
// ---------------------------------------------------------------------------
test("two live records of one key render BOTH under a conflict alert; nothing picks a winner", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  const conflict = page.getByRole("alert").filter({ hasText: "These records disagree" });
  await expect(conflict).toBeVisible();
  await expect(page.getByText("service_tax")).toBeVisible();
  await expect(page.getByText("not_registered")).toBeVisible();
  await expect(page.getByText("segment = digital")).toBeVisible();
  await expectAccessible(page, "knowledge register, conflict");
});

// ---------------------------------------------------------------------------
// The three remaining read outcomes, each its own face.
// ---------------------------------------------------------------------------
test("empty: a successful read with no records is an empty state, never an error", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientEmpty}/knowledge`);
  await expect(page.getByText("No knowledge has been recorded for this client yet.")).toBeVisible();
  await expect(page.getByText("Your account can't read this yet.")).toHaveCount(0);
  await expectAccessible(page, "knowledge register, empty");
});

test("denied: a 403 read is its own alert, distinct from the empty state's wording", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientDenied}/knowledge`);
  const denied = page.getByRole("alert").filter({ hasText: "Your account can't read this yet." });
  await expect(denied).toBeVisible();
  await expect(page.getByText("No knowledge has been recorded for this client yet.")).toHaveCount(0);
  await expectAccessible(page, "knowledge register, denied");
});

test("inaccessible source: a record that NAMES a source it cannot open says so, rather than falling silent", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientSourceGone}/knowledge`);
  const alert = page.getByRole("alert").filter({ hasText: "cannot read right now" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(KN.missingDocument);
  // The record itself is still fully rendered — an unreadable source is not a missing record.
  await expect(page.getByText("46900")).toBeVisible();
  await expect(page.getByText("Extracted from a document")).toBeVisible();
  await expectAccessible(page, "knowledge register, inaccessible source");
});

// ---------------------------------------------------------------------------
// The category filter, its no-results state, and that the filter survives it.
// ---------------------------------------------------------------------------
test("the category filter narrows the register, and filtering to nothing is NOT the empty state", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Policy" }).click();
  await expect(page.getByText("No records of that category.", { exact: false })).toBeVisible();
  // …and it is a DIFFERENT sentence from a genuinely empty read.
  await expect(page.getByText("No knowledge has been recorded for this client yet.")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filter" }).click();
  await expect(page.getByText("47211")).toBeVisible();
  await expectAccessible(page, "knowledge register, filtered to nothing");
});

// ---------------------------------------------------------------------------
// Detail → history → withdrawal: the durable outcome, at a stable URL.
// ---------------------------------------------------------------------------
test("the detail route is a stable URL showing the current value, its source and every revision", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await page.getByRole("link", { name: "Open record" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/clients/${KN.clientOk}/knowledge/${KN.recordMsic}$`));
  await expect(page.getByRole("heading", { name: "Knowledge record" })).toBeVisible();
  await expect(page.getByText("Revision 1")).toBeVisible();
  await expect(page.getByText("Revision 2")).toBeVisible();
  await expect(page.getByText("Tan Wei Ming", { exact: false })).toBeVisible();
  await expect(page.getByText("the client corrected the code by email on 12 Sep", { exact: false }).first()).toBeVisible();
  // Back returns to the register, with the URL intact.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/clients/${KN.clientOk}/knowledge$`));
  await expectAccessible(page, "knowledge detail");
});

test("Withdraw is a governed act with a PERSISTENT outcome: keyboard-reachable, reason-required, and still there after a reload", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordMsic}`);
  const trigger = page.getByRole("button", { name: "Withdraw", exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("A withdrawal is final for this record", { exact: false })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Withdraw record" });
  // THE REASON IS REQUIRED, and the affordance says so before the door has to.
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Why is it being withdrawn?").fill("the client ceased that trade on 30 June");
  await expect(confirm).toBeEnabled();
  await expectAccessible(page, "knowledge detail, withdraw dialog open");
  await confirm.click();

  // The PERSISTENT object carries the outcome — not a toast.
  await expect(page.getByText("This record was withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("This record was withdrawn")).toBeVisible();
  await expect(page.getByText("the client ceased that trade on 30 June", { exact: false }).first()).toBeVisible();
});

test("a governed refusal renders VERBATIM with its CLR code, never a generic red toast", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordInferred}`);
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Corrected value").fill("RM5M-25M");
  await dialog.getByLabel("Why is it being corrected?").fill("the client confirmed the higher band");
  await dialog.getByRole("button", { name: "Record correction" }).click();
  await expect(page.getByText("CLR10", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("is authority-bearing; a model_inference source is inferred", { exact: false }).first(),
  ).toBeVisible();
  // The dialog stays open with the typed input intact — the refusal is asking for a change.
  await expect(dialog.getByLabel("Corrected value")).toHaveValue("RM5M-25M");
});

// ---------------------------------------------------------------------------
// Narrow width and 200% zoom — the amount, identity, status and primary action stay reachable
// without a page-wide horizontal scroll (appendix C §4).
// ---------------------------------------------------------------------------
test("320px: the register reads without a page-wide horizontal scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await expect(page.getByText("47211")).toBeVisible();
  await expect(page.getByText("Unverified inference").first()).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "knowledge register, 320px");
});

test("200% zoom: the detail's controls stay reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 512 });
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordConflictA}`);
  await expect(page.getByRole("button", { name: "Correct", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the detail must not scroll horizontally at the 200%-zoom equivalent").toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// #658 — FRESHNESS: the version, the as-of date, and the out-of-effect mark.
// ---------------------------------------------------------------------------
test("the register prints the version WITH the Kuala Lumpur as-of date, and marks a rule that is not in effect", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  // A VERSION WITH NO AS-OF IS HALF AN ANSWER: which revision, and which calendar day the
  // in-effect marks below were computed for.
  await expect(page.getByText("Knowledge version 11")).toBeVisible();
  await expect(page.getByText("As of", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Kuala Lumpur", { exact: false }).first()).toBeVisible();
  // …and the EXPIRED rule is PRESENT and MARKED, never dropped. A word, not a colour.
  await expect(page.getByTestId("knowledge-not-in-effect").first()).toBeVisible();
  await expect(page.getByText("Not in effect on", { exact: false }).first()).toBeVisible();
  await expectAccessible(page, "knowledge register, freshness and out-of-effect mark");
});

test("320px: the as-of line and the out-of-effect mark stay readable with no page-wide horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, `/clients/${KN.clientOk}/knowledge`);
  await expect(page.getByText("As of", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("knowledge-not-in-effect").first()).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "knowledge register, freshness at 320px");
});

// ---------------------------------------------------------------------------
// #658 — "WORK THAT READ THIS RECORD" on the detail route the walk already visits.
// DECISIONS.md:83's seventh door: the ONLY human path into a FORCE-RLS relation.
// ---------------------------------------------------------------------------
test("the record detail lists the Work that read it, with its version and face word, and links to the Work", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordMsic}`);
  // It sits BELOW the revision timeline — what the record IS comes before who consumed it.
  await expect(page.getByRole("heading", { name: "Work that read this record" })).toBeVisible();
  await expect(page.getByText("Read partial")).toBeVisible();
  await expect(page.getByText("Read at version 11")).toBeVisible();
  await expect(page.getByText("for 2026-09-18", { exact: false })).toBeVisible();
  await expect(page.getByText("remainder truncated", { exact: false })).toBeVisible();
  // BOUNDED: the door caps at 100 and says exactly how many it withheld.
  await expect(page.getByTestId("knowledge-record-reads-truncated")).toContainText("12 older read");
  // READ-ONLY: the Work is a LINK, never an act.
  const link = page.getByRole("link", { name: "Open this Work" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", new RegExp(`/clients/${KN.clientOk}/work/`));
  // …and the revision timeline above it is untouched.
  await expect(page.getByText("Revision 1")).toBeVisible();
  await expectAccessible(page, "knowledge detail, reads list");
});

test("a record NO Work has read says so — never `unused`, and never as an error", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordReadsEmpty}`);
  await expect(page.getByTestId("knowledge-record-reads-empty")).toBeVisible();
  await expect(page.getByText("No Work has recorded a read of this record.")).toBeVisible();
  // The empty face is NOT an alert: a record nobody has read yet is an ordinary state.
  await expect(
    page.getByRole("alert").filter({ hasText: "No Work has recorded a read" }),
  ).toHaveCount(0);
  await expectAccessible(page, "knowledge detail, reads list empty");
});

test("a DENIED reads-read gets its own banner and leaves the revision timeline readable beside it", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientOk}/knowledge/${KN.recordReadsDenied}`);
  await expect(page.getByText("You do not have access to this list")).toBeVisible();
  // THE OTHER TWO READS ON THIS PAGE ARE UNAFFECTED — this read fails independently.
  await expect(page.getByText("The month this client closes its financial year.").first()).toBeVisible();
  await expect(page.getByText("Revision 1")).toBeVisible();
  await expectAccessible(page, "knowledge detail, reads list denied");
});
