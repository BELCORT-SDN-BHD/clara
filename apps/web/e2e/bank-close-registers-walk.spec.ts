import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// L7's 裁-86 browser leg. Three journeys on the BUILT app, one per defect whose
// evidence a node cell cannot fully carry — a modal's real focus trap, a real
// backdrop, and what a human can actually READ after a door refuses.
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built bundle and
// every line of client code are real; PostgREST is `bank-close-registers-mock.mjs`,
// including the CLR41 it answers. So the refusal's HANDLING is proven here and the
// refusal's ORIGIN is not — `clara.abandon_close`'s own precondition lives in the db
// battery.

const CLIENT = "77c7c7c7-7777-4777-8777-777777777777";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

// ---------------------------------------------------------------------------
// CB-AE2E-004 — a refused door keeps its dialog open, and the refusal is readable
// where the human is standing.
// ---------------------------------------------------------------------------
//
// Every one of the fifteen wrappers used to close the moment the confirm click
// SETTLED. `act()` catches a governed refusal and resolves, so a refusal and a
// success were indistinguishable to `runOnce`'s single boolean — the dialog closed on
// both, taking the reason the refusal was asking the human to correct with it. And
// once it closes, the page-level banner it left behind is the only place the message
// exists, which a browser can prove and a static render cannot: while the dialog
// stands, that banner is behind the modal backdrop.
test("a refused door keeps its dialog OPEN, with the typed reason intact and the refusal readable inside it", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT}/close`);

  // The picker defaults to the highest ordinal — FY2025, whose run is in progress —
  // so Abandon is on screen without a click.
  await expect(page.getByRole("tab", { name: /FY2025/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Abandon close" })).toBeVisible();
  await expectAccessible(page, "close plan, collapsed");

  await page.getByRole("button", { name: "Abandon close" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const reason = dialog.getByRole("textbox", { name: "Abandon close" });
  const typed = "the client resent April's statements";
  await reason.fill(typed);
  await dialog.getByRole("button", { name: "Abandon", exact: true }).click();

  // (1) STILL OPEN — the discriminating post-condition. Before the fix this dialog
  // was gone by now.
  await expect(dialog).toBeVisible();
  // (2) THE INPUT SURVIVED.
  await expect(reason).toHaveValue(typed);
  // (3) THE REFUSAL IS READABLE INSIDE THE DIALOG — code, reason token and the DB's
  // own message, all verbatim. `dialog.getByText` scopes the read to the modal, so a
  // copy of the same text on the page behind it cannot satisfy this.
  await expect(dialog.getByText("CLR41 · close_not_in_progress")).toBeVisible();
  await expect(dialog.getByText("this close run is already abandoned")).toBeVisible();

  await expectAccessible(page, "close plan, refused abandon dialog open");

  // …and the human can still leave, which is the whole reason a refusal does not
  // close the dialog FOR them.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// H-11 / CB-AE2E-016 — the stranded year.
// ---------------------------------------------------------------------------
test("a year whose latest close run was ABANDONED offers a door again, named Restart close", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT}/close`);
  await page.getByRole("tab", { name: /FY2024/ }).click();
  await expect(page.getByRole("tab", { name: /FY2024/ })).toHaveAttribute("aria-selected", "true");

  // Before the fix this row was EMPTY: `close_run.state` reads 'present' on an
  // abandoned run, so canBegin was false; run_state is not 'in_progress', so
  // finalize/abandon were false; and the year reads 'open', not 'closed', so reopen
  // was false too.
  const restart = page.getByRole("button", { name: "Restart close" });
  await expect(restart).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin close" })).toHaveCount(0);

  // The copy the trigger opens says what beginning actually does to the year.
  await restart.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/freezes the year again/i)).toBeVisible();
  await expect(dialog.getByText(/write_into_closed_period/)).toBeVisible();
  await expectAccessible(page, "close plan, restart dialog open");
});

// ---------------------------------------------------------------------------
// CB-AE2E-028 — the raw uuid a professional was asked to read.
// ---------------------------------------------------------------------------
test("the close-prep hold names the member who holds it, never the raw users(id) uuid", async ({ page }) => {
  await signInTo(page, `/clients/${CLIENT}/close`);

  const hold = page.getByText(/held by/i).first();
  await expect(hold).toContainText("E2E Owner");
  // The uuid itself must not be on screen. It is the fixture's own `held_by`, and
  // the resolver reads the SAME roster view (clara.firm_members_visible) the members
  // panel already used — the id below resolving to a name is the whole journey.
  await expect(page.getByText("11111111-1111-1111-1111-111111111111")).toHaveCount(0);
});
