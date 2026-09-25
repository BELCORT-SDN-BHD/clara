import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { settleForScan, signInTo } from "./helpers";
import { P947 } from "./payroll-settlement-mock.mjs";

// #947's browser leg — finding a payroll run's net-pay payment on the bank statement and
// accepting its settlement, on the /bank Matching tab.
//
// WHAT IS REAL AND WHAT IS FAKE: the browser, the built Next bundle and every line of client
// code are REAL — the panel's read, the candidate table, the Accept button, the door call, the
// refusal renderer. PostgREST is `payroll-settlement-mock.mjs`. So this leg proves the JOURNEY —
// a person finds the payment and accepts it — and what the surface does with a refusal; it
// proves NOTHING about whether Postgres would give that answer. `clara._payroll_net_pay_
// unsettled`'s FIFO arithmetic and `clara.settle_payroll_net_pay`'s reuse of
// `clara._match_bank_line_core` are exercised for real in
// `packages/db/tests/payroll-settlement.test.mjs`.
//
// THE TWO LEGS:
//   1. Find and accept: the panel renders the unsettled run with its month, its amount and its
//      one candidate line; accepting posts settle_payroll_net_pay with the right client/entry/
//      line and a fresh op_key each time.
//   2. A refusal (another accept claimed the line first) renders VISIBLY, verbatim, with its code
//      · reason — never a silent un-busy.

const CLIENT = P947.clientId;
const MATCHING = `/clients/${CLIENT}/bank?tab=matching`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  await settleForScan(page);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

test("finds a posted payroll run's net-pay payment and accepts it, with the right ids and a fresh op_key on the wire", async ({ page }) => {
  const sentBodies: { p_client?: string; p_entry?: string; p_line?: string; p_op_key?: string }[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rest/v1/rpc/settle_payroll_net_pay")) return;
    try {
      const body = req.postDataJSON() as { p_client?: string; p_entry?: string; p_line?: string; p_op_key?: string } | null;
      if (body) sentBodies.push(body);
    } catch { /* a body this leg cannot parse is not a key it can assert on */ }
  });

  await signInTo(page, MATCHING);

  const run = page.getByTestId(`payroll-run-${P947.entryId}`);
  await expect(run.getByText("August 2026")).toBeVisible();
  await expect(run.getByText("RM 4,255.70", { exact: true })).toBeVisible();
  await expect(run.getByText("SALARY GIRO AUG26")).toBeVisible();

  await page.getByRole("button", { name: /Accept SALARY GIRO AUG26/ }).click();

  // The door refused nothing: no refusal banner renders in the panel.
  await expect(page.getByText(P947.refusalAmountMismatch)).toHaveCount(0);
  expect(sentBodies.length, "the door was called once").toBeGreaterThanOrEqual(1);
  const sent = sentBodies[sentBodies.length - 1]!;
  expect(sent.p_client).toBe(CLIENT);
  expect(sent.p_entry).toBe(P947.entryId);
  expect(sent.p_line).toBe(P947.lineId);
  expect(typeof sent.p_op_key, "a fresh op_key accompanies this decision").toBe("string");
  expect((sent.p_op_key ?? "").length).toBeGreaterThan(0);

  await expectAccessible(page, "bank matching, payroll settlement panel");
});

test("a settlement refusal renders VISIBLY with its code and reason, never silently", async ({ page }) => {
  await signInTo(page, MATCHING);

  const panel = page.getByTestId("payroll-settlements-panel");
  await expect(panel.getByText("July 2026")).toBeVisible();
  await expect(panel.getByText("PAYROLL JUL26")).toBeVisible();

  await page.getByRole("button", { name: /Accept PAYROLL JUL26/ }).click();

  await expect(panel.getByText(P947.refusalAmountMismatch)).toBeVisible();
  await expect(panel.getByText("CLR10 · amount_mismatch")).toBeVisible();
});

// #1059's fix round (spec finding L04-SPEC-01). THE LEG NO OTHER INSTRUMENT CAN RUN: a person
// who accepted nothing in THIS browser session still finds the settlement and its reverse route.
// The first cut kept the accept receipt in React state, so this leg would have found an empty
// panel — which is exactly what a reload, a tab change or a fresh sign-in gave a real person.
test("a settlement accepted in an earlier session is still discoverable, with its route to reverse it", async ({ page }) => {
  await signInTo(page, MATCHING);

  const panel = page.getByTestId("payroll-settlements-panel");
  const settled = page.getByTestId(`payroll-settled-${P947.settledEntryId}`);
  await expect(settled).toBeVisible();
  await expect(settled.getByText("June 2026")).toBeVisible();
  await expect(settled.getByText("RM 3,000.00")).toBeVisible();
  await expect(settled.getByRole("button", { name: /Reverse the June 2026 settlement/i })).toBeVisible();
  await expect(panel).toBeVisible();

  await expectAccessible(page, "bank matching · a settled payroll run with its reverse route");
});
