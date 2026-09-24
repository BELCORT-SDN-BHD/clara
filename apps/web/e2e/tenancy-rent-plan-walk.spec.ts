import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { settleForScan, signInTo } from "./helpers";
import { P949 } from "./tenancy-rent-plan-mock.mjs";

// #949's browser leg (AC8) — reading a tenancy and confirming its rent plan, on the Documents
// detail's FACTS view.
//
// WHAT IS REAL AND WHAT IS FAKE: the browser, the built Next bundle and every line of client code
// are REAL — the document detail's whole read set, the tab routing, the tenancy panel's two
// reads, the terms rendering with their regions, the Confirm button, the door call and the
// refusal renderer. PostgREST is `tenancy-rent-plan-mock.mjs`. So this leg proves the JOURNEY —
// a person opens a tenancy, sees each term and WHERE ON THE PAGE it was read from, reads what the
// standard says, and confirms the plan — and what the surface does with a refusal; it proves
// NOTHING about whether Postgres would give those answers. The lessee branch, the append-only
// record, the plan a confirmation authorises and the bank-credit refusal are exercised for real
// against real Postgres in `packages/db/tests/tenancy-rent-plan.test.mjs`.
//
// THE TWO LEGS:
//   1. Read and confirm: the panel renders the four terms with their basis and their regions, the
//      MPERS Section 20 branch, and the drafted plan's two legs; confirming posts
//      confirm_tenancy_rent_plan with this client and this document and a fresh op_key.
//   2. A refusal (the payable named is really a bank account) renders VISIBLY, verbatim, with its
//      code — never a silent un-busy.

const CLIENT = P949.clientId;
const FACTS = `/clients/${CLIENT}/documents?document=${P949.documentId}&tab=facts`;
const REFUSED = `/clients/${CLIENT}/documents?document=${P949.refusedDocumentId}&tab=facts`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  await settleForScan(page);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

test("reads a tenancy's terms with the regions they came from, and confirms its rent plan", async ({ page }) => {
  const sent: { p_client?: string; p_document?: string; p_judgement?: string | null; p_op_key?: string }[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rest/v1/rpc/confirm_tenancy_rent_plan")) return;
    try {
      const body = req.postDataJSON() as (typeof sent)[number] | null;
      if (body) sent.push(body);
    } catch { /* a body this leg cannot parse is not a key it can assert on */ }
  });

  await signInTo(page, FACTS);

  const panel = page.getByTestId("tenancy-rent-plan-panel");
  await expect(panel).toBeVisible();

  // THE TERMS, each with what it is, what the page printed, and where it came from.
  const rent = page.getByTestId("contract-term-monthly_rent");
  await expect(rent).toContainText("Monthly rent");
  await expect(rent).toContainText("RM 3,600.00");
  await expect(rent).toContainText("as printed: 3,600.00");
  await expect(rent).toContainText("Read from the page");
  await expect(rent).toContainText("1 region on the page");
  await expect(rent).toHaveAttribute("data-region-ids", P949.regionRent);

  const deposit = page.getByTestId("contract-term-deposit");
  await expect(deposit).toContainText("RM 7,200.00");
  await expect(deposit).toHaveAttribute("data-region-ids", P949.regionDeposit);

  // A DERIVATION SAYS SO rather than passing itself off as a reading, and names BOTH regions.
  const termEnd = page.getByTestId("contract-term-term_end");
  await expect(termEnd).toContainText("2028-01-04");
  await expect(termEnd).toContainText("Derived from what the page prints");
  await expect(termEnd).toContainText("2 regions on the page");
  await expect(termEnd).toHaveAttribute("data-region-ids", `${P949.regionDate} ${P949.regionMonths}`);

  // WHAT THE STANDARD SAYS, on the face, before anything is confirmed.
  await expect(page.getByTestId("tenancy-standard")).toContainText("MPERS Section 20");
  await expect(page.getByTestId("tenancy-basis")).toContainText("straight-line");
  await expect(page.getByTestId("tenancy-basis")).toContainText("MFRS 16");

  // THE PLAN CLARA DRAFTS: its schedule and both legs, crediting the payable and never the bank.
  const plan = page.getByTestId("tenancy-plan-draft");
  await expect(plan).toContainText("RM 3,600.00 a month, from 2026-01-05 to 2028-01-04 (24 months)");
  await expect(plan).toContainText("Debit 6100 RM 3,600.00");
  await expect(plan).toContainText("Credit 2050 RM 3,600.00");

  await expectAccessible(page, "documents facts view, tenancy rent-plan panel");

  await page.getByTestId("tenancy-confirm-plan").click();

  await expect(page.getByText(P949.refusalBankCredit)).toHaveCount(0);
  expect(sent.length, "the door was called once").toBeGreaterThanOrEqual(1);
  const last = sent[sent.length - 1]!;
  expect(last.p_client).toBe(CLIENT);
  expect(last.p_document).toBe(P949.documentId);
  expect(last.p_judgement, "no judgement is owed when the branch drafts").toBeNull();
  expect(typeof last.p_op_key, "a fresh op_key accompanies this decision").toBe("string");
  expect((last.p_op_key ?? "").length).toBeGreaterThan(0);
});

test("a confirmation refusal renders VISIBLY with its code, never silently", async ({ page }) => {
  await signInTo(page, REFUSED);

  await expect(page.getByTestId("tenancy-rent-plan-panel")).toBeVisible();
  await page.getByTestId("tenancy-confirm-plan").click();

  // SCOPED TO THE PANEL'S OWN feedback: the facts view carries a second DoorFeedback of its own
  // (the revision cell's), and a refusal that rendered in the wrong box would still be a refusal
  // a person never connects to the button they pressed.
  const feedback = page.getByTestId("tenancy-rent-plan-panel").getByTestId("door-feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText("may not credit 1010");
  await expect(feedback).toContainText("double-counts");
  await expect(feedback).toContainText("CLR10");
});
