import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { D4 } from "./tax-boundary-mock.mjs";

// #627 — "present the real tax reads and the honest not-enabled capability boundary".
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every
// line of client code — `TaxWorkbenchPage`, `SstWatchSection`'s five-state branching,
// `CapabilityBoundarySection`'s hash-focus effect, the legacy `/admin/compliance` redirect —
// are REAL. PostgREST is `tax-boundary-mock.mjs`, including the 403/500 the denied/technical-
// failure cases need. So this walk proves the JOURNEY and what the surface does with each
// outcome; `list_review_queue`'s own viewer floor and the DB's actual 403 are proven in the
// db battery, not here.

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
// "ok" — a real, enabled read: the SST watch's own figures, effective-dated fields included.
// ---------------------------------------------------------------------------
test("ok: the SST turnover watch renders the database's own figures, source, and effective-dated fields", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientOk}/tax`);
  await expect(page.getByText("digital_services")).toBeVisible();
  await expect(page.getByText("Threshold crossed")).toBeVisible();
  await expect(page.getByText("550,000.00")).toBeVisible();
  await expect(page.getByText("Read from your firm's SST compliance monitor")).toBeVisible();
  await expectAccessible(page, "tax tab, enabled read with data");
});

// ---------------------------------------------------------------------------
// "successful, no data" — a real read, zero watch rows for this client.
// ---------------------------------------------------------------------------
test("empty: zero watch rows renders as its own labelled status region, never a caught error", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientEmpty}/tax`);
  const empty = page.getByRole("status").filter({ hasText: "No SST turnover watch is open for this client." });
  await expect(empty).toBeVisible();
  await expectAccessible(page, "tax tab, empty read");
});

// ---------------------------------------------------------------------------
// "stale effective-dated source" — the evaluator has not run in >48h.
// ---------------------------------------------------------------------------
test("stale: the evaluator-staleness warning renders as its own alert", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientStale}/tax`);
  const stale = page.getByRole("alert").filter({ hasText: "recalculated more than 48 hours ago" });
  await expect(stale).toBeVisible();
  await expectAccessible(page, "tax tab, stale read");
});

// ---------------------------------------------------------------------------
// "denied read" — a 403 (RLS/grant refusal), never mistaken for "no data".
// ---------------------------------------------------------------------------
test("denied: a 403 read is its own alert, distinct from the empty state's wording", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientDenied}/tax`);
  const denied = page.getByRole("alert").filter({ hasText: "Your account can't read this yet." });
  await expect(denied).toBeVisible();
  await expect(page.getByText("No SST turnover watch is open for this client.")).toHaveCount(0);
  await expectAccessible(page, "tax tab, denied read");
});

// ---------------------------------------------------------------------------
// "technical failure" — a genuine 5xx, distinct from the denied state.
// ---------------------------------------------------------------------------
test("technical failure: a 500 read is its own alert, distinct from the denied state's wording", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientError}/tax`);
  const failed = page.getByRole("alert").filter({ hasText: "Something went wrong" });
  await expect(failed).toBeVisible();
  await expect(page.getByText("compliance_watches evaluator crashed")).toBeVisible();
  await expect(page.getByText("Your account can't read this yet.")).toHaveCount(0);
  await expectAccessible(page, "tax tab, technical failure");
});

// ---------------------------------------------------------------------------
// The capability-boundary deep link — click activation, hash update, and focus return.
// ---------------------------------------------------------------------------
test("the not-enabled note's link deep-links to the ONE capability-boundary section and moves focus there", async ({ page }) => {
  await signInTo(page, `/clients/${D4.clientOk}/tax`);
  const link = page.getByRole("link", { name: "See the capability boundary" }).first();
  await link.scrollIntoViewIfNeeded();
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#capability-boundary$/);
  const heading = page.getByRole("heading", { name: "Capability boundary" });
  await expect(heading).toBeFocused();
  // `{ exact: true }` — the page's own subheading prose ("...and what is not enabled yet.")
  // contains this same phrase as a substring, so a loose match resolves to two elements.
  await expect(page.getByText("Enabled today", { exact: true })).toBeVisible();
  await expect(page.getByText("Not enabled yet", { exact: true })).toBeVisible();
  await expectAccessible(page, "tax tab, capability boundary open");
});

// ---------------------------------------------------------------------------
// A FRESH navigation carrying the anchor (an old bookmark, or a link from elsewhere) — the
// mount-time focus effect, not the click-driven native fragment behaviour above.
// ---------------------------------------------------------------------------
test("a fresh navigation straight to #capability-boundary focuses the section's own heading", async ({ page }) => {
  // Sign in to a NEUTRAL destination first, then navigate to the hashed tax-tab URL as a
  // SEPARATE `page.goto` — a genuinely different route, so Next mounts `TaxWorkbenchPage` and
  // `CapabilityBoundarySection` fresh with the hash already present, exercising the mount-time
  // focus effect rather than the click-driven native fragment behaviour the test above covers.
  await signInTo(page, "/");
  await page.goto(`/clients/${D4.clientOk}/tax#capability-boundary`);
  const heading = page.getByRole("heading", { name: "Capability boundary" });
  await expect(heading).toBeFocused();
});

// ---------------------------------------------------------------------------
// Narrow (320px) and reduced motion — the two remaining Appendix-C contracts this ticket owns.
// ---------------------------------------------------------------------------
test("320px: the enabled read and its status stay readable with no page-wide horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, `/clients/${D4.clientOk}/tax`);
  await expect(page.getByText("digital_services")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page body must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "tax tab, 320px");
});

test("reduced motion: the tab renders the same content with prefers-reduced-motion: reduce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, `/clients/${D4.clientStale}/tax`);
  await expect(page.getByText("recalculated more than 48 hours ago")).toBeVisible();
  await expectAccessible(page, "tax tab, reduced motion");
});

// ---------------------------------------------------------------------------
// The #614 legacy redirect into a surface this ticket rebuilt — /admin/compliance still lands
// on /settings/compliance, and its empty read is now its own labelled status region too.
// ---------------------------------------------------------------------------
test("legacy route: /admin/compliance redirects to /settings/compliance, whose empty read is its own status region", async ({ page }) => {
  // Sign in to a NEUTRAL destination first, then follow the OLD address separately — the
  // redirect is a 307 the app issues once already signed in, not a login-flow behaviour, and
  // this is the same shape shell-migration-walk.spec.ts's own D5 redirect matrix uses.
  await signInTo(page, "/");
  await page.goto("/admin/compliance");
  await expect(page).toHaveURL(/\/settings\/compliance$/);
  await expect(page.getByRole("heading", { name: "Compliance register" })).toBeVisible();
  const empty = page.getByRole("status").filter({ hasText: "No open compliance watches for this firm." });
  await expect(empty).toBeVisible();
  await expectAccessible(page, "settings/compliance via legacy redirect, empty read");
});
