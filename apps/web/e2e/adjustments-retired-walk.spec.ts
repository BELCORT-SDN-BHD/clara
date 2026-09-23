import { expect, test } from "@playwright/test";

import { signInTo } from "./helpers";
import { AR } from "./adjustments-retired-mock.mjs";

// #927 (riders wave 3) — the retired Adjustments register (`/clients/:id/registers?tab=adjustments`).
// No sidebar entry points here (`lib/navigation/tree.ts:382` — #640 repointed the sidebar's
// "Adjustments" row to `/clients/:id/plans`), so the tab is reachable only through the registers
// workbench's own in-page tab strip — the same "no browser coverage existed" gap #879 closed for
// `?tab=staffAdvances`. This walk is what closes it here, proving in a REAL browser against the
// REAL built bundle: the retirement notice renders, Propose/Sign/Run-now are genuinely gone from
// the DOM (not merely disabled or hidden behind a role check), and Retire — the one write D6
// leaves standing — still submits end to end.
//
// WHAT THIS WALK PROVES, and what it does not: see `adjustments-retired-mock.mjs`'s own header.

const REGISTER_URL = `/clients/${AR.clientId}/registers?tab=adjustments`;

test.beforeEach(async ({ page }) => {
  await signInTo(page, REGISTER_URL);
});

test("#927: the retired tab renders the notice and its history, and offers only Retire — Propose/Sign/Run now are gone from the DOM", async ({ page }) => {
  await expect(page.getByText(/This lane is retired\./)).toBeVisible();
  await expect(page.getByText(/Client → Plans/).first()).toBeVisible();

  // [#927/#928 fix round] THE DUE ORACLE'S OWN BANNER, on a client that really does carry an
  // unposted period: it may report the fact, and it may NOT invite an act no mechanism can take.
  await expect(page.getByText(/An adjustment run is due/)).toHaveCount(0);
  await expect(page.getByText(/nothing will post it/)).toBeVisible();

  // Both historical rows still render — D6: the history stays readable.
  const liveRow = page.locator("li").filter({ hasText: AR.liveTemplateName });
  const proposedRow = page.locator("li").filter({ hasText: AR.proposedTemplateName });
  await expect(liveRow).toBeVisible();
  await expect(proposedRow).toBeVisible();
  await expect(liveRow).toContainText("Live");
  await expect(proposedRow).toContainText("Proposed");

  // NOT disabled, NOT hidden by a role check — genuinely absent from the DOM. The proposed row is
  // the exact shape that used to render Sign; proving it is gone even there is the point.
  await expect(page.getByRole("button", { name: "Propose template" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run now" })).toHaveCount(0);

  // Retire is offered on BOTH non-retired rows — D6: the door is untouched.
  await expect(liveRow.getByRole("button", { name: "Retire" })).toHaveCount(1);
  await expect(proposedRow.getByRole("button", { name: "Retire" })).toHaveCount(1);
});

test("#927: Retire — the one write the retired tab still offers — submits end to end through the real dialog", async ({ page }) => {
  const liveRow = page.locator("li").filter({ hasText: AR.liveTemplateName });
  await liveRow.getByRole("button", { name: "Retire" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reason", { exact: true }).fill("e2e: standing down a stray live template");
  await dialog.getByRole("button", { name: "Retire", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(liveRow).toContainText("Retired");
  // Retired rows offer no further Retire trigger.
  await expect(liveRow.getByRole("button", { name: "Retire" })).toHaveCount(0);
  // The OTHER (still-proposed) row is untouched by this call.
  const proposedRow = page.locator("li").filter({ hasText: AR.proposedTemplateName });
  await expect(proposedRow).toContainText("Proposed");
  await expect(proposedRow.getByRole("button", { name: "Retire" })).toHaveCount(1);
});
