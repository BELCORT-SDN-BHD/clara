import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";
import { SAR } from "./staff-advances-register-mock.mjs";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// #879 — no browser coverage existed for `?tab=staffAdvances` at all: `staffAdvancesHref` had a
// URL builder and `StaffAdvancesRegister` had a full write surface, but the tab was reachable only
// through the sidebar's silence (it names four OTHER register tabs, deliberately not this one —
// `registers-workbench.tsx`'s own comment) and a unit-mounted component. This walk drives the four
// doors (enrol, book application, complete particulars, retire) through the real dialogs, against
// `staff-advances-register-mock.mjs`'s own client and enrolled account.
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every line
// of client code under test are REAL; PostgREST behind them is FAKED (see the mock's own header).
// So this proves the register's JOURNEY — the tab renders, each dialog's governed call lands with
// the right shape, the summary and the per-account statement re-read and reflect it — and nothing
// about whether Postgres would accept any of the four calls. `packages/db/tests/staff-advances*
// .test.mjs` (migration 0043) owns that.
//
// ONE SERVER, ONE WORKER (`playwright.config.ts`: `fullyParallel: false`, `workers: 1`), so these
// three cells run in file order and the mutations the second cell makes are what the third reads —
// the same "the mock is a real, persistent server" property every stateful lane in this suite
// leans on (`e2e-fixture-ownership.test.ts`'s whole premise).

const CLIENT = SAR.clientId;
const REGISTER_URL = `/clients/${CLIENT}/registers?tab=staffAdvances`;

async function openDialog(page: Page, triggerName: string) {
  await page.getByRole("button", { name: triggerName, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await signInTo(page, REGISTER_URL);
});

test("[879] the staffAdvances tab renders: the ledger, the enrolled account and the statement panel", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Staff advances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enrolled accounts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Statement" })).toBeVisible();

  // The pre-seeded ledger row and its enrolled account are on screen — a real read, not an
  // empty-state placeholder. (The date and the amount both also appear in the statement panel's
  // own row below, so these are `.first()` rather than asserting exactly one match.)
  await expect(page.getByText("2026-02-01").first()).toBeVisible();
  await expect(page.getByText("RM 1,000.00").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: SAR.enrolledAccount, exact: true })).toBeVisible();
  await expect(page.getByText(SAR.enrolledPerson)).toBeVisible();
  await expect(page.getByText("The register ties to the general ledger.")).toBeVisible();

  // The statement panel defaults to the one enrolled account and shows its opening disbursement.
  await expect(page.getByText("Opening balance")).toBeVisible();
  await expect(page.getByText("Closing balance")).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "staffAdvances tab, collapsed").toEqual([]);
});

test("[879] enrol an account, retire it, book an application and complete particulars — end to end", async ({ page }) => {
  // ---- ENROL --------------------------------------------------------------------------------
  const enrolDialog = await openDialog(page, "Enrol account");
  await enrolDialog.getByLabel("Chart account", { exact: true }).selectOption({ label: `${SAR.freshAccount} — Staff advance — unallocated` });
  await enrolDialog.getByLabel("Person", { exact: true }).fill(SAR.freshPerson);
  await enrolDialog.getByLabel("Attestation", { exact: true }).fill("Dedicated to Halim alone; not a related-party balance.");
  await enrolDialog.getByRole("checkbox").check();
  await enrolDialog.getByRole("button", { name: "Enrol account", exact: true }).click();
  await expect(enrolDialog).toBeHidden();

  const freshRow = page.getByRole("row").filter({ hasText: SAR.freshAccount });
  await expect(freshRow).toContainText(SAR.freshPerson);
  await expect(freshRow).toContainText("Active");

  // ---- RETIRE (the account just enrolled has zero advances, so this never hits CLR10) --------
  await freshRow.getByRole("button", { name: "Retire" }).click();
  const retireDialog = page.getByRole("dialog");
  await expect(retireDialog).toBeVisible();
  await expect(retireDialog.getByRole("heading", { name: `Retire ${SAR.freshAccount}` })).toBeVisible();
  await retireDialog.getByLabel("Reason", { exact: true }).fill("Enrolled in error — no advances were ever issued on this account.");
  await retireDialog.getByRole("button", { name: "Retire account", exact: true }).click();
  await expect(retireDialog).toBeHidden();
  await expect(freshRow).toContainText("Retired");
  await expect(freshRow.getByRole("button", { name: "Retire" })).toHaveCount(0);

  // ---- BOOK APPLICATION: a 300.00 payroll deduction against the enrolled account's advance ---
  const bookDialog = await openDialog(page, "Book application");
  await bookDialog.getByLabel("Reason", { exact: true }).fill("March payroll deduction, per the signed instalment schedule.");

  const accountSelects = bookDialog.locator('select[aria-label="Account"]');
  await accountSelects.nth(0).selectOption({ label: `${SAR.wagesPayable} — Wages Payable` });
  await accountSelects.nth(1).selectOption({ label: `${SAR.enrolledAccount} — Staff advance — ${SAR.enrolledPerson}` });
  await bookDialog.locator('input[aria-label="Debit"]').nth(0).fill("300.00");
  await bookDialog.locator('input[aria-label="Credit"]').nth(1).fill("300.00");

  await bookDialog.getByRole("button", { name: "Add allocation" }).click();
  await bookDialog.locator('select[aria-label="Line"]').selectOption("2");
  await bookDialog.locator('select[aria-label="Advance"]').selectOption({ index: 1 });
  await bookDialog.locator('input[aria-label="Amount"]').fill("300.00");

  await bookDialog.getByRole("button", { name: "Book application", exact: true }).click();
  await expect(bookDialog).toBeHidden();

  // No error banner — a REFUSAL renders as a persistent StateBanner at the top of the register,
  // which a settled, accepted call must never leave behind.
  await expect(page.getByText(/CLR\d/)).toHaveCount(0);

  // ---- COMPLETE PARTICULARS on the ledger row the application was booked against -------------
  // Scoped to the LEDGER section, not just "any row with this date": the statement panel below
  // renders its own row for the same date, with a different shape (no Complete-particulars cell).
  const ledgerSection = page.locator("section", { has: page.getByRole("heading", { name: "Staff advances", exact: true }) });
  const ledgerRow = ledgerSection.getByRole("row").filter({ hasText: "2026-02-01" });
  await ledgerRow.getByRole("button", { name: "Complete particulars" }).click();
  const particularsDialog = page.getByRole("dialog");
  await expect(particularsDialog).toBeVisible();
  await particularsDialog.getByLabel("Purpose", { exact: true }).fill("March school-fee advance instalment");
  await particularsDialog.getByLabel("Reference", { exact: true }).fill("PAY-2026-03");
  await particularsDialog.getByRole("button", { name: "Save particulars", exact: true }).click();
  await expect(particularsDialog).toBeHidden();

  await expect(ledgerRow).toContainText("March school-fee advance instalment");
  await expect(ledgerRow.getByRole("button", { name: "Complete particulars" })).toHaveCount(0);

  // ---- THE SUMMARY RE-READ REFLECTS BOTH WRITES -----------------------------------------------
  await expect(page.getByText("RM 700.00 outstanding across every enrolled account")).toBeVisible();
  await expect(page.getByText(/advance\(s\) missing particulars/)).toHaveCount(0);
});

test("[879] the statement panel reflects the booked advance's balance", async ({ page }) => {
  // Fresh navigation, same server: the account selector already defaults to the one enrolled,
  // never-retired account ("1190" sorts before "1191") with the previous cell's own booking.
  await expect(page.getByLabel("Account", { exact: true })).toHaveValue(SAR.enrolledAccount);

  const statement = page.locator("table").filter({ has: page.getByText("Running balance") });
  await expect(statement.getByRole("cell", { name: "Disbursement" })).toBeVisible();
  await expect(statement).toContainText("Payroll deduction");
  await expect(statement).toContainText("-RM 300.00");
  await expect(page.getByText("RM 700.00").last()).toBeVisible();
});
