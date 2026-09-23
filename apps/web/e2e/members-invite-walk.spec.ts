import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CELL_BUDGET, grantCellBudget, settleForScan, signIn as sharedSignIn, watchReactFaults } from "./helpers";
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
 * AND THE INVITE LEG'S OWN CEILING (#1022 raised it). `/api/invite` is a REAL route, and
 * `e2e/run.mjs` now enables the courier's mail capability with THREE harness-only placeholders
 * plus two loopback overrides (`CLARA_E2E_INVITE_MAIL_ENDPOINT` #874, `CLARA_E2E_INVITE_IDENTITY_
 * ENDPOINT` #1022) that fence both outbound calls `productionInviteMailer` can make — `send()`
 * and `admin()`'s `listUsers`/`generateLink` — to `members-lifecycle-mock.mjs`'s own handlers, on
 * this same process. So the invite cell below now drives the real dialog, the real courier round
 * trip, and the REAL `clara.invite_member` verb this lane answers, all the way to a SETTLED
 * SUCCESS banner and a NEW pending row rendering — with no outbound call to a real Supabase
 * project or a real mail provider anywhere in the journey (see that mock's own header for what
 * each intercept proves and does not). The invite door's own behaviour — the token's real shape,
 * every refusal wall — is still `packages/db/tests/p4t1-invite.test.mjs`'s claim, not this walk's.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** SIGN IN AND LAND — the setup every cell in this walk repeats, and after #851 the sign-in half
 *  is the SHARED helper's (`helpers.ts`, #804) rather than a fourteenth copy of the login form.
 *  The shared helper carries the `CELL_BUDGET.signIn` grant, the explicit post-login wait and the
 *  landmark proof this copy used to spell for itself; what remains here is this lane's own
 *  destination — the members register — which is not a sign-in at all. */
async function signInToMembers(page: Page): Promise<void> {
  await sharedSignIn(page, MEMBERS_LIFECYCLE.email);
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
  // 1 · INVITE — the real dialog, the real courier round trip (#1022: both outbound legs
  // intercepted locally), a settled PERSISTENT banner and a new pending row.
  // ---------------------------------------------------------------------------------------
  const inviteTrigger = page.getByRole("button", { name: "Invite someone", exact: true });
  await expect(inviteTrigger).toBeVisible();
  await inviteTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Email address").fill(MEMBERS_LIFECYCLE.newInviteEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();

  // THE SETTLED RESULT IS A BANNER ON THE PAGE, NOT A TOAST — R4's house law, and the reason
  // `members-panel.tsx` records for refusing Bonsai's "Invite sent." toast. It is still there
  // after the dialog is gone, which is what "persistent" means.
  await expect(page.getByText(`The invitation to ${MEMBERS_LIFECYCLE.newInviteEmail} was sent.`)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // FOCUS RETURNED TO THE TRIGGER. A real focus manager is the only thing that can say so.
  await expect(inviteTrigger).toBeFocused();
  // …and the NEW invite is a PENDING row, from the re-read the act performed — never painted
  // optimistically, the same hydrate-never-trust contract the other three acts below rely on.
  const newInviteRow = page.getByRole("row").filter({ hasText: MEMBERS_LIFECYCLE.newInviteEmail });
  await expect(newInviteRow.getByText("Pending")).toBeVisible();

  // #1022's OWN CLAIM: BOTH outbound legs were actually exercised, not merely configured — the
  // identity-provisioning call (`listUsers` then `generateLink`) and the mail transport, with
  // NEITHER call ever having left this process. Read through the lane's own control endpoint
  // (`members-lifecycle-mock.mjs`'s header), the same shape `resetLane` above already uses.
  const origin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
  const traceAnswer = await page.request.post(
    `${origin}/e2e-supabase/rest/v1/rpc/e2e_members_lifecycle_invite_trace`,
    { data: { persona: MEMBERS_LIFECYCLE.email } },
  );
  expect(traceAnswer.ok(), "the lane's own trace control must answer").toBe(true);
  const trace = await traceAnswer.json();
  expect(trace.identityCalls.listUsers, "canMintFor drove at least one listUsers page").toBeGreaterThanOrEqual(1);
  expect(trace.identityCalls.generateLink, "mintSupabaseTokenHash drove exactly one generateLink").toBe(1);
  // send() actually posted HERE — no real Resend call was ever attempted.
  expect(trace.capturedMail?.to).toBe(MEMBERS_LIFECYCLE.newInviteEmail);
  expect(trace.capturedMail?.subject).toBe("You have been invited to ClaraBook");
  expect(trace.capturedMail?.html).toContain(`/invite/${MEMBERS_LIFECYCLE.newInviteHashedToken}`);

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

  // …AND THE ROW IS UNTOUCHED — asserted after the dialog is dismissed, not through it. A Base UI
  // dialog is modal: while it is open the rest of the document is `aria-hidden`, so a ROLE query
  // for the row behind it finds nothing at all. Measured here (the first cut asserted through the
  // open modal and failed "element(s) not found", which reads like a missing row and is not one).
  // Dismissing first also proves the refusal is escapable rather than a trap.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(ownerRow).toContainText("Active");
});

test("#625: the roster and both confirmations scan clean, and the row menu drops its movement under reduced motion", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.scan * 2 + CELL_BUDGET.poll);
  await signInToMembers(page);

  await settleForScan(page);
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
  // WAIT FOR THE MENU TO FINISH LEAVING BEFORE SCANNING. Choosing a menu item closes the menu and
  // opens the dialog in the same act, and the menu's EXIT keeps its popup mounted at a reduced
  // opacity for the length of the transition. Measured here: a scan taken immediately reported
  // three `color-contrast` violations against menu items carrying `data-closed`, which is the
  // scan catching an animation rather than a defect. `settleForScan` waits for every finite
  // animation; the detachment assertion is the second, independent statement of the same fact.
  await expect(popup).toHaveCount(0);
  await settleForScan(page);
  const withDialog = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(withDialog.violations, "the remove confirmation, open").toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// THE PREVIEW STEP, IN A REAL BROWSER (round-1 F4).
//
// Migration 0224 exists for exactly ONE caller, and until these two cells every proof of it was
// jsdom with a stubbed global `fetch`: no browser leg drove `/invite/:token` past `verifyOtp`, so
// the first governed door call made on a session minted moments earlier was never exercised end
// to end — and because an INDEFINITE read degrades silently to "password form, no preview block",
// a deployment where that session token was not yet readable would have looked identical to a
// working one in all shipped evidence.
//
// What these cells add over the jsdom ones is the part jsdom cannot hold: a real
// `createSupabaseClient()`, a real `verifyOtp` round trip, the real session store it writes, and
// the real `Authorization` header the next request carries — asserted on the wire below, not
// inferred. What they still do NOT prove: the door itself. It is answered by
// `members-lifecycle-mock.mjs`, and `clara.preview_invite`'s own behaviour (the JWT-email wall,
// the no-oracle refusal, the mask, the effective status) is the DB battery's claim under real
// least-privileged roles. LOCAL, mock-backed, never AC7 evidence.
// ---------------------------------------------------------------------------------------------

/** The invitation URL as `invite-mail.ts` builds it: Supabase's `token_hash` in the PATH, Clara's
 *  own token in the `ct` QUERY parameter. The two are not interchangeable and this harness keeps
 *  them distinct for the same reason the product does. */
function inviteUrl(claraToken: string): string {
  return `/invite/${MEMBERS_LIFECYCLE.supabaseToken}?ct=${claraToken}`;
}

test("#625: the preview step runs in a REAL browser — firm, role and masked address render ABOVE the password fields, on the session verifyOtp just minted", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.poll * 2);
  const faults = watchReactFaults(page);

  // Every request the browser really makes to the preview door, with the header that carries the
  // session — the claim under test is not "the block rendered" but "the door was called, as this
  // person, before the fields existed".
  const doorCalls: { auth: string }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/rest/v1/rpc/preview_invite")) {
      doorCalls.push({ auth: request.headers()["authorization"] ?? "" });
    }
  });

  await page.goto(inviteUrl(MEMBERS_LIFECYCLE.previewPendingToken));
  await expect(page.getByRole("heading", { name: "Accept your invitation", level: 1 })).toBeVisible();
  // NOTHING TO TYPE A PASSWORD INTO YET, and this is the half of AC2 the jsdom cell can only
  // assert about a virtual DOM: the confirm stage is a single button.
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(doorCalls, "no door is called before the person acts").toHaveLength(0);

  await page.getByRole("button", { name: "Accept invitation" }).click();

  const preview = page.getByRole("region", { name: "Your invitation" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(MEMBERS_LIFECYCLE.firmName);
  await expect(preview).toContainText("Bookkeeper");
  // The MASK the door sends, rendered as-is: one leading character, three fixed stars, the domain.
  await expect(preview).toContainText("n***@larkin.test");
  await expect(preview).not.toContainText(MEMBERS_LIFECYCLE.inviteeEmail);

  // …and ONLY NOW do the fields exist.
  const password = page.locator("input[type=password]");
  await expect(password).toHaveCount(1);

  // ABOVE, as the document really orders them — not "both are present somewhere".
  const order = await page.evaluate(() => {
    const block = document.querySelector('section[aria-labelledby="invite-preview-heading"]');
    const field = document.querySelector('input[type="password"]');
    if (!block || !field) return null;
    // 4 === Node.DOCUMENT_POSITION_FOLLOWING: the field comes AFTER the block.
    return (block.compareDocumentPosition(field) & 4) !== 0;
  });
  expect(order, "the preview block must precede the password field in document order").toBe(true);

  // THE WIRE. One call, carrying the access token `verifyOtp` minted for the INVITEE — which is
  // the whole "a session minted moments earlier is readable by the next governed call" claim.
  expect(doorCalls, "the preview door is called exactly once").toHaveLength(1);
  const bearer = doorCalls[0]!.auth.replace(/^Bearer /, "");
  const claims = JSON.parse(Buffer.from(bearer.split(".")[1] ?? "", "base64url").toString("utf8"));
  expect(claims.email, "the door is called as the invited person, not as nobody").toBe(MEMBERS_LIFECYCLE.inviteeEmail);
  expect(claims.sub).toBe(MEMBERS_LIFECYCLE.inviteeSubject);

  expect(faults.faults(), "no React fault on the invite surface").toEqual([]);
});

test("#625: a REVOKED preview BLOCKS in the browser — its own face, naming the firm, and no password field anywhere", async ({ page }) => {
  grantCellBudget(CELL_BUDGET.poll);
  const faults = watchReactFaults(page);

  await page.goto(inviteUrl(MEMBERS_LIFECYCLE.previewRevokedToken));
  await page.getByRole("button", { name: "Accept invitation" }).click();

  await expect(page.getByRole("heading", { name: "This invitation was revoked", level: 1 })).toBeVisible();
  // The face NAMES the firm it was for: a dead invitation still answers "which firm was this?".
  await expect(page.getByText(new RegExp(`Someone at ${MEMBERS_LIFECYCLE.firmName} withdrew it`))).toBeVisible();

  // THE POINT OF THE WHOLE STEP: a definite negative leaves NOTHING to fill in. A control that
  // can only refuse is not rendered.
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your invitation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);

  expect(faults.faults(), "no React fault on the blocked face").toEqual([]);
});
