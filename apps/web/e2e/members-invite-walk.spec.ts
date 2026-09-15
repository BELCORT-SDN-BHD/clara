import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CELL_BUDGET, grantCellBudget, watchReactFaults } from "./helpers";
import { MEMBERS_LIFECYCLE } from "./members-lifecycle-mock.mjs";

/**
 * #625 — THE MEMBERSHIP LIFECYCLE, DRIVEN IN A BROWSER TO SETTLEMENT.
 *
 * Until this file, NO walk drove a single member RPC: `firm-navigation-walk.spec.ts` reaches
 * `/settings/members` for two personas and scans it, but the fixtures behind it were fixed — one
 * roster row, an empty invite list — so "invite, revoke, change a role, remove someone" had never
 * been done in a browser at all. `members-lifecycle-mock.mjs` supplies a MUTABLE roster and invite
 * list for this walk's own persona (see that file's header for the CORE handover that makes it
 * possible, and for the scope that keeps it out of every other walk's way).
 *
 * WHAT EACH CELL NEEDS A BROWSER FOR — the standing rule in this suite, because a claim a jsdom
 * cell can make belongs in a jsdom cell:
 *   · a REAL focus manager (focus return after a dialog closes; focus not dumped on <body> when
 *     the row that opened it disappears);
 *   · a REAL HTTP round trip through the app's own `/api/invite` route;
 *   · a REAL `prefers-reduced-motion` media query;
 *   · a REAL history stack (the URL never moves across four governed acts, and Back still works).
 *
 * WHAT THIS WALK DOES NOT PROVE, stated rather than implied. The doors are mocked. Every wall
 * (the admin floor, the role ceiling, the target-rank wall, the last-owner trigger, the replay
 * contract) is proven in `packages/db/tests/p4t1-invite.test.mjs` and `mdrw-rank-walls.test.mjs`
 * under real least-privileged Postgres roles, which is where AC7 evidence lives. A mock-backed
 * walk is never AC7 evidence.
 *
 * AND THE INVITE LEG'S OWN CEILING. `/api/invite` is a REAL route and this harness deliberately
 * configures no mail transport (`e2e/run.mjs` sets no `RESEND_API_KEY`, for the same reason it
 * sets no `STRIPE_SECRET_KEY`: a key here posts to a third party from every run). So the invite
 * cell drives the real dialog and the real courier round trip to the settled outcome this harness
 * can honestly produce — `mail_not_configured`, which creates nothing — and the pending-invite
 * half of the journey is walked over a row the lane seeds. The invite door's own behaviour is the
 * DB battery's claim.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signInToMembers(page: Page): Promise<void> {
  grantCellBudget(CELL_BUDGET.signIn);
  await page.goto("/login");
  await page.getByLabel("Email").fill(MEMBERS_LIFECYCLE.email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { name: "Everyone with access", level: 2 })).toBeVisible();
}

/** The lane's own control — scoped on a persona named in its body, so it cannot mutate anybody
 *  else's fixtures (`members-lifecycle-mock.mjs`'s own note). Called through the API context
 *  rather than the page so it never disturbs the document under test. */
async function resetLane(page: Page): Promise<void> {
  const origin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
  const answer = await page.request.post(`${origin}/e2e-supabase/rest/v1/rpc/e2e_members_lifecycle_reset`, {
    data: { persona: MEMBERS_LIFECYCLE.email },
  });
  expect(answer.ok(), "the lane's own control must answer").toBe(true);
}

test.beforeEach(async ({ page }) => {
  await resetLane(page);
});

test("#625: invite, revoke, change a role and remove — each act reaches a settled, persistent result", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.poll * 4);
  const faults = watchReactFaults(page);
  await signInToMembers(page);
  const url = page.url();

  // ---------------------------------------------------------------------------------------
  // 1 · INVITE — the real dialog, the real courier round trip, a settled PERSISTENT banner.
  // ---------------------------------------------------------------------------------------
  const inviteTrigger = page.getByRole("button", { name: "Invite someone", exact: true });
  await expect(inviteTrigger).toBeVisible();
  await inviteTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Email address").fill("another-hire@larkin.test");
  await page.getByRole("button", { name: "Send invitation" }).click();

  // THE SETTLED RESULT IS A BANNER ON THE PAGE, NOT A TOAST — R4's house law, and the reason
  // `members-panel.tsx` records for refusing Bonsai's "Invite sent." toast. It is still there
  // after the dialog is gone, which is what "persistent" means.
  await expect(page.getByText("The invitation was not sent")).toBeVisible();
  await expect(page.getByText(/no invitation mail set up/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // FOCUS RETURNED TO THE TRIGGER. A real focus manager is the only thing that can say so.
  await expect(inviteTrigger).toBeFocused();
  // …and nothing was created: the seeded invitation is still the only row.
  await expect(page.getByText("another-hire@larkin.test")).toHaveCount(0);

  // ---------------------------------------------------------------------------------------
  // 2 · REVOKE — a governed act driven to settlement, asserted on the RE-READ.
  // ---------------------------------------------------------------------------------------
  const inviteRow = page.getByRole("row").filter({ hasText: MEMBERS_LIFECYCLE.pendingInviteEmail });
  await expect(inviteRow.getByText("Pending")).toBeVisible();
  const revokeTrigger = inviteRow.getByRole("button", { name: "Revoke" });
  await revokeTrigger.click();
  const revokeDialog = page.getByRole("dialog");
  // AC3: the confirmation names the invitation AND the firm.
  await expect(revokeDialog).toContainText(MEMBERS_LIFECYCLE.pendingInviteEmail);
  await expect(revokeDialog).toContainText(MEMBERS_LIFECYCLE.firmName);
  await revokeDialog.getByRole("button", { name: "Revoke" }).click();

  // THE DURABLE RESULT: the row's own status, from the re-read the act performed — never from
  // the receipt, and never painted optimistically.
  await expect(inviteRow.getByText("Revoked")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The trigger is GONE (a revoked invitation offers no Revoke), so the contract is the other
  // half of appendix C's rule: focus moves to a logical element, never onto the bare document.
  await expect.poll(async () => page.evaluate(() => document.activeElement?.tagName ?? "NONE")).not.toBe("BODY");

  // ---------------------------------------------------------------------------------------
  // 3 · ROLE CHANGE — the row menu, keyboard-reachable, driven to a settled re-read.
  // ---------------------------------------------------------------------------------------
  const rosterRow = page.getByRole("row").filter({ hasText: MEMBERS_LIFECYCLE.bookkeeperName });
  await expect(rosterRow).toContainText("Bookkeeper");
  const roleTrigger = rosterRow.getByRole("button", { name: `Actions for ${MEMBERS_LIFECYCLE.bookkeeperName}` });
  await roleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Admin", exact: true }).click();
  await expect(rosterRow).toContainText("Admin");
  await expect(roleTrigger).toBeFocused();

  // ---------------------------------------------------------------------------------------
  // 4 · REMOVE — the second destructive confirmation, and the roster the re-read returns.
  // ---------------------------------------------------------------------------------------
  const viewerRow = page.getByRole("row").filter({ hasText: MEMBERS_LIFECYCLE.viewerName });
  await viewerRow.getByRole("button", { name: `Actions for ${MEMBERS_LIFECYCLE.viewerName}` }).click();
  await page.getByRole("menuitem", { name: "Remove from firm" }).click();
  const removeDialog = page.getByRole("dialog");
  await expect(removeDialog).toContainText(MEMBERS_LIFECYCLE.viewerName);
  await expect(removeDialog).toContainText(MEMBERS_LIFECYCLE.firmName);
  await removeDialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(viewerRow).toContainText("Removed");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ---------------------------------------------------------------------------------------
  // THE URL NEVER MOVED, across four governed acts — AC6's "stable URL/Back". A dialog is not a
  // destination, and a settled act is not a navigation.
  // ---------------------------------------------------------------------------------------
  expect(page.url()).toBe(url);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/settings\/members$/);
  // …and the roster is still what the estate says it is after the return trip.
  await expect(page.getByRole("row").filter({ hasText: MEMBERS_LIFECYCLE.viewerName })).toContainText("Removed");

  expect(faults.faults(), "no React fault during the lifecycle walk").toEqual([]);
});

test("#625: a REFUSED act keeps its dialog open with the DB's own sentence inside it", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.poll * 2);
  await signInToMembers(page);

  // The LAST OWNER is the one member whose removal the estate refuses — `_tf_guard_last_owner`
  // (`0003:415`), modelled by the lane with the trigger's own message. It is the only refusal a
  // single-session walk can reach without a second actor.
  const ownerRow = page.getByRole("row").filter({ hasText: "Tao Lim" });
  await ownerRow.getByRole("button", { name: "Actions for Tao Lim" }).click();
  await page.getByRole("menuitem", { name: "Remove from firm" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();

  // THE DIALOG STAYS OPEN AND CARRIES THE REFUSAL — CB-AE2E-004, and #625's own AC3 clause. The
  // assertion is on the DIALOG's subtree, because the panel's page-level banner sits behind the
  // modal backdrop and a page-wide text query cannot tell the two apart.
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("cannot demote/remove the last active owner");
  await expect(dialog).toContainText("CLR09");
  // …and the row is untouched.
  await expect(ownerRow).toContainText("Active");
});

test("#625: the roster and both confirmations scan clean, and the row menu drops its movement under reduced motion", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.scan * 2 + CELL_BUDGET.poll);
  await signInToMembers(page);

  const scanned = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(scanned.violations, "/settings/members with a populated roster and a pending invite").toEqual([]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const roleTrigger = page.getByRole("button", { name: `Actions for ${MEMBERS_LIFECYCLE.bookkeeperName}` });
  await roleTrigger.click();
  const popup = page.locator("[data-slot=dropdown-menu-content]");
  await expect(popup).toBeVisible();
  const reduced = await popup.evaluate((el) => {
    const s = getComputedStyle(el);
    return { transform: s.transform, duration: s.animationDuration };
  });
  // `motion-safe:` compiles to `@media (prefers-reduced-motion: no-preference)`, so under
  // `reduce` the zoom and slide keyframes are not applied at all and the element is untransformed.
  expect(reduced.transform === "none" || reduced.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  expect(reduced.duration).toBe("0.16s");

  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(roleTrigger).toBeFocused();

  // The OPEN remove dialog is its own face and gets its own scan — the one the wide walk never
  // had, because no walk had ever opened it.
  await roleTrigger.click();
  await page.getByRole("menuitem", { name: "Remove from firm" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const withDialog = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(withDialog.violations, "the remove confirmation, open").toEqual([]);
});
