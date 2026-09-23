import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, signInTo } from "./helpers";
import { D4 } from "./tax-boundary-mock.mjs";

// #997 — the client tax page's compliance-watch RECEIPT (acknowledge, snooze, resolve, then the
// disposition read that follows each) has never had a browser-level test. The three acts and
// their re-read are proven today by `compliance-watch-receipt.test.tsx` against STUBBED doors
// only — no end-to-end spec calls them, and `tax-boundary-walk.spec.ts`'s own five states cover
// the SST watch's READ faces, never this write-and-echo cycle.
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every line
// of client code — `TaxWorkbenchPage`, `SstWatchSection`, `ComplianceWatchAffordance` and its
// `WatchDispositionReceipt` — are REAL. PostgREST is `tax-boundary-mock.mjs`'s own `clientReceipt`
// fixture, including the three governed doors and `get_compliance_watch_disposition`. So this
// walk proves the WIRING — a write that succeeds and then shows something NEW on the very next
// read — which is exactly the failure a stubbed unit cell cannot see (an action that succeeds and
// then shows nothing new afterwards); the doors' own floors, refusal roster and DB-side state
// machine are out of scope here (this ticket's own brief) and proven elsewhere.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

/** A date safely inside `snoozeDateBounds()`'s own (tomorrow, +60 days] window
 *  (`compliance-watch-affordance.tsx`), computed from THIS clock rather than hand-picked, so the
 *  walk stays valid whenever it runs. */
function sevenDaysOut(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test("the compliance-watch receipt: acknowledge, snooze and resolve an open watch on the client tax page, each act's disposition read showing something the last one did not", async ({ page }) => {
  // One sign-in, three governed-write round trips each followed by a disposition re-read, plus
  // one full-page axe scan at the end.
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 3, scans: 1 }));

  await signInTo(page, `/clients/${D4.clientReceipt}/tax`);

  // EVERY LOCATOR BELOW IS SCOPED to this ONE landmark. `TurnoverClassificationPanel` — a
  // SIBLING control on this same page, bookkeeper+ and so rendered for the default owner
  // sign-in — carries its OWN real `<label>Evidence</label>` field (review-557 N8's own labelled-
  // not-placeholder rule), so an unscoped `page.getByLabel("Evidence")` resolves to two elements.
  // `SstWatchSection` renders as `<section aria-labelledby>`, named by its own heading — the
  // region `ComplianceWatchAffordance` and its receipt are the only things inside.
  const watchRegion = page.getByRole("region", { name: "Turnover watch" });

  // ── before any act: the honest "nothing recorded" reading ──────────────────────────────────
  // No "Disposition" heading yet either — `WatchDispositionReceipt`'s own null-act branch
  // renders ONLY the one sentence below; the heading lives inside `WatchDispositionLine`, which
  // mounts for the first time once there IS a recorded act.
  await expect(watchRegion.getByText("Nothing has been recorded on this watch yet.")).toBeVisible();
  await expect(watchRegion.getByText("Disposition")).toHaveCount(0);
  await expect(watchRegion.getByText(/Acknowledged by|Snoozed by|Resolved by/)).toHaveCount(0);

  // ── acknowledge ──────────────────────────────────────────────────────────────────────────────
  const ackRationale = "Client informed; SST registration is in progress.";
  await watchRegion.getByRole("button", { name: "Acknowledge" }).click();
  await watchRegion.getByLabel("Rationale").fill(ackRationale);
  await watchRegion.getByRole("button", { name: "Acknowledge" }).click();

  await expect(watchRegion.getByText("Disposition")).toBeVisible();
  await expect(watchRegion.getByText("Acknowledged by E2E Owner")).toBeVisible();
  await expect(watchRegion.getByText("State crossed → crossed.")).toBeVisible();
  await expect(watchRegion.getByText(`Rationale: ${ackRationale}`)).toBeVisible();
  await expect(watchRegion.getByText("This record carries no version number")).toBeVisible();
  // The wiring proof, not decoration: the pre-act reading is gone — this is a NEW disposition,
  // not the old one left standing beside a stray success toast.
  await expect(watchRegion.getByText("Nothing has been recorded on this watch yet.")).toHaveCount(0);

  // ── snooze ───────────────────────────────────────────────────────────────────────────────────
  const snoozeRationale = "Awaiting the client's registration certificate before resolving.";
  const snoozeUntil = sevenDaysOut();
  await watchRegion.getByRole("button", { name: "Snooze" }).click();
  await watchRegion.getByLabel("Snooze until").fill(snoozeUntil);
  await watchRegion.getByLabel("Rationale").fill(snoozeRationale);
  await watchRegion.getByRole("button", { name: "Snooze" }).click();

  await expect(watchRegion.getByText("Snoozed by E2E Owner")).toBeVisible();
  await expect(watchRegion.getByText(`Rationale: ${snoozeRationale}`)).toBeVisible();
  // The ack's own disposition line is gone — the receipt shows the LAST act, not a running log.
  await expect(watchRegion.getByText("Acknowledged by E2E Owner")).toHaveCount(0);

  // ── resolve ──────────────────────────────────────────────────────────────────────────────────
  const evidence = "Registered with Customs on 2026-09-01; certificate on file.";
  await watchRegion.getByRole("button", { name: "Resolve" }).click();
  await watchRegion.getByLabel("Evidence").fill(evidence);
  await watchRegion.getByRole("button", { name: "Resolve" }).click();

  await expect(watchRegion.getByText("Resolved by E2E Owner")).toBeVisible();
  await expect(watchRegion.getByText("State crossed → resolved.")).toBeVisible();
  await expect(watchRegion.getByText(`Evidence: ${evidence}`)).toBeVisible();
  await expect(watchRegion.getByText("Snoozed by E2E Owner")).toHaveCount(0);

  await expectAccessible(page, "client tax page, compliance-watch receipt after acknowledge, snooze and resolve");
});
