import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";
import { CI } from "./counterparty-identity-mock.mjs";

// #647 — journeys C13 (knowledge/identity), A6, C1, C4 and C6 at their identity seam:
// "search or category list → fact/identity/policy detail → source/history/conflict → correction".
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every line
// of client code — `ClientIdentitySection`, `CounterpartyIdentityPanel`, the `KnowledgeSourceBlock`
// reused VERBATIM from C13, `lib/registers/counterparty-identity.ts`'s three read wrappers, the
// two door wrappers, `useAsyncRead`'s reload-after-write and the door dialog's single-fire
// confirm — are REAL. PostgREST is `counterparty-identity-mock.mjs`, including the 403 the denied
// face needs, the empty documents read the inaccessible-source face needs and the CLR23 the
// registration-collision refusal needs. So this walk proves the JOURNEY and what the surface does
// with each outcome; the doors' own floors, provenance walls, refusal roster and revision algebra
// are proven against a real Postgres under real least-privileged roles in
// packages/db/tests/counterparty-identity.test.mjs.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// EVERY CELL BELOW SIGNS IN FROM SCRATCH AND MOST RUN A FULL AXE PASS, so the 30 s default is a
// property of the harness, not of the code under test. MEASURED on this machine (2026-09-16,
// twelve wave worktrees sharing one host): a populated face costs ~20 s cold and the sign-in
// redirect alone outran `toHaveURL`'s 5 s default. The a11y walk sets its own budget the same
// way (e2e/a11y-finish-walk.spec.ts:77). A budget changes no assertion.
test.describe.configure({ timeout: 150_000 });

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

const identityHref = (client: string, counterparty: string) =>
  `/clients/${client}/knowledge/parties/${counterparty}`;

// ---------------------------------------------------------------------------
// The normal journey: ONE Identity section on Knowledge, carrying both halves.
// ---------------------------------------------------------------------------
test("the Identity section carries BOTH halves — the client's own identifiers and its counterparties — with every count from a read that ran", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientOk}/knowledge`);

  // (a) H-20's half: the client's OWN identifiers, listed at last.
  await expect(page.getByRole("heading", { name: "This client's own identifiers" })).toBeVisible();
  await expect(page.getByText("201801012345").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add identifier" })).toBeVisible();

  // (b) the counterparty half, with the DATABASE's own counts rather than a filtered array's
  // length: four live aliases, four corrections, and how many of those aliases name no source.
  // The fixture is MUTABLE and the config is `workers: 1, fullyParallel: false`, so these are the
  // counts at FIRST read; the retirement cell below re-measures them after it writes.
  await expect(page.getByText("Acme Sdn Bhd").first()).toBeVisible();
  await expect(page.getByText("4 live aliases").first()).toBeVisible();
  await expect(page.getByText("4 corrections").first()).toBeVisible();
  await expect(page.getByText("3 live aliases name no source").first()).toBeVisible();

  // …and AC3's bounded discovery, which says out loud that no reversal exists anywhere.
  await expect(page.getByText("There is no un-merge action anywhere in Clara")).toBeVisible();
  await expect(page.getByText("A correction could be described: the merge recorded what it did")).toBeVisible();
  await expect(page.getByText("A correction cannot be described: this merge predates the lineage record")).toBeVisible();

  await expectAccessible(page, "identity section, populated");
});

test("empty: a successful read with no counterparties and no identifiers is an empty state, never an error", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientEmpty}/knowledge`);
  await expect(page.getByText("No counterparties are recorded for this client yet")).toBeVisible();
  await expect(page.getByText("No identifier has been recorded for this client yet")).toBeVisible();
  await expect(page.getByText("Your account can't read this yet.")).toHaveCount(0);
  await expectAccessible(page, "identity section, empty");
});

test("denied: a 403 read is its own alert, distinct from the empty state's wording", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientDenied}/knowledge`);
  const denied = page.getByRole("alert").filter({ hasText: "Your account can't read this yet." });
  await expect(denied.first()).toBeVisible();
  await expect(page.getByText("No counterparties are recorded for this client yet")).toHaveCount(0);
  await expectAccessible(page, "identity section, denied");
});

test("filtered to nothing is NOT the empty state: it says how many exist, keeps the filter and offers the way back", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientVendorOnly}/knowledge`);
  await expect(page.getByText("Sole Vendor Sdn Bhd")).toBeVisible();
  await page.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByText("1 counterparty is recorded for this client, but none is a customer")).toBeVisible();
  await expect(page.getByText("No counterparties are recorded for this client yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Show both roles" }).click();
  await expect(page.getByText("Sole Vendor Sdn Bhd")).toBeVisible();
  await expectAccessible(page, "identity section, filtered to nothing");
});

// ---------------------------------------------------------------------------
// The routed detail: a STABLE URL, reached by a real link, with Back intact.
// ---------------------------------------------------------------------------
test("the identity detail is a stable URL reached by a real link, and Back returns to Knowledge", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientOk}/knowledge`);
  await page.getByRole("link", { name: "Open identity" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${identityHref(CI.clientOk, CI.cpAcme)}$`));
  await expect(page.getByRole("heading", { name: "Counterparty identity" })).toBeVisible();
  // The breadcrumb NAMES the leaf rather than stopping at Knowledge, which is the whole reason
  // the route carries a literal `parties` segment (lib/navigation/tree.ts's leafFor).
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Counterparty identity")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/clients/${CI.clientOk}/knowledge$`));

  // …and the URL is durable: typed straight in, it renders the same identity.
  await page.goto(identityHref(CI.clientOk, CI.cpAcme));
  await expect(page.getByText("Acme Sdn Bhd").first()).toBeVisible();
  await expectAccessible(page, "identity detail");
});

test("every alias carries its lane, its basis and its source — and all four lanes read as English", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  await expect(page.getByText("entered in the app").first()).toBeVisible();
  await expect(page.getByText("written by Clara").first()).toBeVisible();
  await expect(page.getByText("lane not recorded").first()).toBeVisible();
  // The agent alias's basis is ALSO revision 2's basis, so this sentence is on screen twice —
  // the alias row and the correction it appended. `.first()` names that instead of hiding it.
  await expect(page.getByText("three bank narrations spell it this way").first()).toBeVisible();
  await expect(page.getByText("the delivery orders are signed under the trade name")).toBeVisible();
  // …and the alias carries the DAY it was recorded, in the business timezone: the human-stated
  // trade name went in at 2026-02-01T02:00:00Z, which is 1 Feb 2026 in Asia/Kuala_Lumpur.
  await expect(page.getByText("1 Feb 2026", { exact: false }).first()).toBeVisible();
  // The origin vocabulary 0215 widened is readable too, including the value no door writes here.
  await expect(page.getByText("Proposed by Clara").first()).toBeVisible();
  await expect(page.getByText("Read off a document").first()).toBeVisible();
  // A raw message key on screen is the H-25 defect the message-key gate exists for.
  await expect(page.getByText("ClientKnowledge.recordedVia")).toHaveCount(0);
  await expect(page.getByText("ArApCounterparty.recordedVia")).toHaveCount(0);
});

test("inaccessible source: an alias that NAMES a document it cannot open says so, with the id, rather than falling silent", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  const alert = page.getByRole("alert").filter({ hasText: "cannot read right now" });
  await expect(alert.first()).toBeVisible();
  await expect(alert.first()).toContainText(CI.missingDocument);
  // The alias itself is still fully rendered — an unreadable source is not a missing alias.
  await expect(page.getByText("ACME SDN. BHD.")).toBeVisible();
  await expect(page.getByText("invoice.vendor_name", { exact: false })).toBeVisible();
  await expectAccessible(page, "identity detail, inaccessible source");
});

test("the CONFLICT face states cross-client ambiguity and the same-name-other-role pair, and never resolves either", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  await expect(page.getByText("Borneo Timber Holdings also records TIN C24680135790", { exact: false })).toBeVisible();
  await expect(page.getByText("deliberately NOT linked", { exact: false })).toBeVisible();
  await expect(page.getByText("is a customer of this client with the same name", { exact: false })).toBeVisible();
  // AC4, STATED on the surface rather than merely true underneath.
  await expect(page.getByText("never settles an invoice, nets an open item or grants accounting permission")).toBeVisible();
  await expectAccessible(page, "identity detail, conflicts");
});

test("merge lineage is rendered from BOTH sides, and the absorbed party's own page says where its identity went", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  // AC6's EXACT DATE clause: businessDateTime renders the merge instant in Asia/Kuala_Lumpur,
  // so 2026-05-02T02:00:00Z reads "2 May 2026". The clock time is deliberately left out of the
  // match — ICU puts a narrow no-break space before am/pm and that is not the fact under test.
  await expect(page.getByText("Absorbed Acme Trading Enterprise on 2 May 2026", { exact: false })).toBeVisible();
  await expect(page.getByText("same SSM, two spellings").first()).toBeVisible();

  await page.goto(identityHref(CI.clientOk, CI.cpMerged));
  await expect(page.getByText("Merged into Acme Sdn Bhd", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("reads now resolve to that party", { exact: false })).toBeVisible();
  await expectAccessible(page, "identity detail, merged party");
});

// ---------------------------------------------------------------------------
// The correction: keyboard-reachable, a PERSISTENT outcome, and a refusal that keeps the draft.
// ---------------------------------------------------------------------------
test("Correct identifiers is a governed act with a PERSISTENT outcome: keyboard-reachable, and still there after a reload", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  const trigger = page.getByRole("button", { name: "Correct identifiers" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The fields are SEEDED from the current values: the door replaces the pair, so a form that
  // showed one empty box would silently clear the other.
  await expect(dialog.getByLabel("Registration number")).toHaveValue("201801012345");
  await expect(dialog.getByLabel("TIN")).toHaveValue("C24680135790");
  // A correction that would change nothing is gated at the CONFIRM, never at the trigger.
  await expect(dialog.getByRole("button", { name: "Correct", exact: true })).toBeDisabled();

  await dialog.getByLabel("Registration number").fill("202001019876");
  await expect(dialog.getByRole("button", { name: "Correct", exact: true })).toBeEnabled();
  await expectAccessible(page, "identity detail, correct dialog open");
  await dialog.getByRole("button", { name: "Correct", exact: true }).click();

  // The PERSISTENT object carries the outcome — not a toast — and the timeline gains a revision
  // naming BOTH values.
  await expect(page.getByText("202001019876").first()).toBeVisible();
  await expect(page.getByText("registration 201801012345 -> 202001019876", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("202001019876").first()).toBeVisible();
  await expect(page.getByText("5 corrections").first()).toBeVisible();
});

test("a governed refusal renders VERBATIM with its CLR code in a persistent banner, and the dialog keeps the typed draft", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  await page.getByRole("button", { name: "Correct identifiers" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Registration number").fill("999999999999");
  await dialog.getByRole("button", { name: "Correct", exact: true }).click();

  await expect(page.getByText("CLR23", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("already carries that registration number", { exact: false }).first(),
  ).toBeVisible();
  // The dialog stays OPEN with the typed input intact — the refusal is asking for a change.
  await expect(dialog.getByLabel("Registration number")).toHaveValue("999999999999");
  await expectAccessible(page, "identity detail, refusal");
});

test("CANCELLED correction and recovery: Escape closes the dialog, writes nothing, and the identity is untouched", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  const trigger = page.getByRole("button", { name: "Correct identifiers" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("TIN").fill("C00000000000");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // FOCUS RETURNS to the trigger that opened it, rather than being stranded on the document body.
  await expect(trigger).toBeFocused();
  // Nothing was written: the identity on screen is the one the read returned.
  await expect(page.getByText("C24680135790").first()).toBeVisible();
  await expect(page.getByText("C00000000000")).toHaveCount(0);
  // …and the act is recoverable — reopening starts from the CURRENT values, not the abandoned draft.
  await trigger.click();
  await expect(page.getByRole("dialog").getByLabel("TIN")).toHaveValue("C24680135790");
});

test("retiring an alias keeps its history and is still retired after a reload", async ({ page }) => {
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  const row = page.locator("li").filter({ hasText: "ACME TRADING" }).first();
  await row.getByRole("button", { name: "Retire" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("It stays in the record as history", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Retire alias" }).click();

  // `exact` on purpose: the merge lineage on this page reads "Absorbed Acme Trading Enterprise
  // on …", which the default case-insensitive SUBSTRING match would also hit. Exact text keeps
  // this assertion about the alias itself, and it still fails if the alias disappears.
  await expect(page.getByText("ACME TRADING", { exact: true })).toBeVisible();
  await expect(page.getByText("Retired", { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Alias retired").first()).toBeVisible();
  await expect(page.getByText("3 live aliases").first()).toBeVisible();
});

test("H-20: adding an identifier is a governed act, and a duplicate renders the database's own refusal", async ({ page }) => {
  await signInTo(page, `/clients/${CI.clientOk}/knowledge`);
  await page.getByRole("button", { name: "Add identifier" }).click();
  const dialog = page.getByRole("dialog");
  // The kind is a CLOSED choice over clara.client_identifiers.kind's three-value CHECK, so it is
  // selected, never typed (AddClientIdentifierDialog's header says why).
  await dialog.getByLabel("Kind").selectOption("tin");
  await dialog.getByLabel("Value").fill("C24680135790");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("C24680135790").first()).toBeVisible();

  // …and the SAME pair again is refused by uq_client_identifiers_client_kind_value, verbatim.
  await page.getByRole("button", { name: "Add identifier" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("Kind").selectOption("tin");
  await again.getByLabel("Value").fill("C24680135790");
  await again.getByRole("button", { name: "Add", exact: true }).click();
  // The refusal renders in BOTH places on purpose, and this names them rather than hiding the
  // pair behind `.first()`: the section's own persistent banner, and a copy inside the dialog
  // that is still open — because that banner sits behind the modal backdrop
  // (CB-AE2E-004, ArApCounterpartyDoorDialog's own header).
  const duplicate = "this identifier is already recorded for this client";
  await expect(page.getByRole("dialog").getByText(duplicate)).toBeVisible();
  await expect(page.locator("#main-content").getByText(duplicate)).toBeVisible();
  await expect(page.getByText("CLR10", { exact: false }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Narrow width, 200% zoom and reduced motion (appendix C §4).
// ---------------------------------------------------------------------------
test("320px: the identity detail reads without a page-wide horizontal scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  await expect(page.getByText("Acme Sdn Bhd").first()).toBeVisible();
  // `exact` on purpose: the merge lineage on this page reads "Absorbed Acme Trading Enterprise
  // on …", which the default case-insensitive SUBSTRING match would also hit. Exact text keeps
  // this assertion about the alias itself, and it still fails if the alias disappears.
  await expect(page.getByText("ACME TRADING", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "identity detail, 320px");
});

test("200% zoom: the identity's own controls stay reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 512 });
  await signInTo(page, identityHref(CI.clientOk, CI.cpAcme));
  await expect(page.getByRole("button", { name: "Correct identifiers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add alias" })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the detail must not scroll horizontally at the 200%-zoom equivalent").toBeLessThanOrEqual(1);
});

test("reduced motion: the identity section renders every face with no motion preference at all", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, `/clients/${CI.clientOk}/knowledge`);
  await expect(page.getByText("Acme Sdn Bhd").first()).toBeVisible();
  await page.getByRole("link", { name: "Open identity" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${identityHref(CI.clientOk, CI.cpAcme)}$`));
  // `exact` on purpose: the merge lineage on this page reads "Absorbed Acme Trading Enterprise
  // on …", which the default case-insensitive SUBSTRING match would also hit. Exact text keeps
  // this assertion about the alias itself, and it still fails if the alias disappears.
  await expect(page.getByText("ACME TRADING", { exact: true })).toBeVisible();
  await expectAccessible(page, "identity detail, reduced motion");
});
