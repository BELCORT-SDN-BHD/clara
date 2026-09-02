import { expect, test } from "@playwright/test";

test("the migrated journal money door accepts exact cents and visibly refuses ambiguous input", async ({ page }) => {
  await page.goto("/signup?moneyInputE2E=1");
  await expect(page.getByRole("heading", { name: "Money input browser harness" })).toBeVisible();

  const debit = page.getByLabel("Debit");
  const acceptedCents = page.getByTestId("accepted-debit-cents");
  const moneyRefusal = page.getByRole("alert").filter({ hasText: /Enter an amount|Enter zero or a positive amount/ });

  await debit.fill("1,234.56");
  await expect(acceptedCents).toHaveText("123456");
  await expect(moneyRefusal).toHaveCount(0);

  await debit.fill("1e3");
  await expect(moneyRefusal).toContainText("Exponents");
  await expect(debit).toHaveAttribute("aria-invalid", "true");
  await expect(acceptedCents).toHaveText("123456");

  await debit.fill("-50.00");
  await expect(moneyRefusal).toContainText("zero or a positive amount");
  await expect(acceptedCents).toHaveText("123456");

  await debit.fill("1234.56");
  await expect(acceptedCents).toHaveText("123456");
  await expect(moneyRefusal).toHaveCount(0);
});
