import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
}

test("operator owner sees the full sidebar and reaches Members in two navigation clicks", async ({ page }) => {
  await signIn(page, "owner@example.test");
  const nav = page.getByRole("navigation", { name: "Firm navigation" });

  await expect(nav.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Needs you", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole("link", { name: "Members", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm registrations", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Compliance register", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Vendor identity bindings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm settings", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();

  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("members");
  await expect(page.getByRole("option", { name: "Members", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Admin", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
});

test("bookkeeper sidebar shows viewer/bookkeeper reads and hides admin- and owner-only destinations", async ({ page }) => {
  await signIn(page, "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Firm navigation" });

  await nav.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole("link", { name: "Compliance register", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Vendor identity bindings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Firm settings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Firm registrations", exact: true })).toHaveCount(0);
});
