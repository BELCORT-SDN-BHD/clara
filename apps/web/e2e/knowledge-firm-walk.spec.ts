import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { KN } from "./knowledge-mock.mjs";

// #654 — journeys C13 ("show current scope, source, status and applicability… corrections show
// affected work") and D2 ("settings destination → firm responsibility → current authorised state
// and supported actions"), for the one act neither journey had a surface for: promoting a client's
// practice to a firm-wide default and keeping every established client exception.
//
// WHAT THIS WALK PROVES, and what it does not: the browser, the built Next bundle and every line
// of client code — `KnowledgeFirmPanel`, `KnowledgePromoteDialog`, `KnowledgeExceptionPair`, the
// shared badge/applicability presentation, the door wrappers, `useAsyncRead`'s reload-after-write
// and the door dialog's single-fire confirm — are REAL. PostgREST is `knowledge-mock.mjs`,
// including the CLR10 the refusal leg needs. So this walk proves the JOURNEY and what the surface
// does with each outcome; the two walls, the promotion floor, revoked membership and the exception
// algebra are proven against a real Postgres under real least-privileged roles in
// packages/db/tests/knowledge-firm-defaults.test.mjs.
//
// THE FILE IS ORDER-DEPENDENT ON PURPOSE, and the config is what makes that sound: `workers: 1`
// and `fullyParallel: false` (playwright.config.ts) run these in declaration order in one process.
// A promotion is a PERSISTENT outcome — that is the product claim — so the empty register has to
// be read before it exists and the populated one after. The lane's ids are disjoint from #644's,
// so no other spec can see this state.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const FIRM_REGISTER = "/settings/knowledge";
const SOURCE_RECORD = `/clients/${KN.clientFirmSource}/knowledge/${KN.recordFirmSource}`;
const RACED_RECORD = `/clients/${KN.clientFirmRaced}/knowledge/${KN.recordFirmRaced}`;
const EXCEPTION_REGISTER = `/clients/${KN.clientFirmException}/knowledge`;

async function signInTo(page: Page, destination: string, email = "owner@example.test"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

// ---------------------------------------------------------------------------
// 1 — the firm register before anything has been promoted
// ---------------------------------------------------------------------------
test("the firm register opens on a real SUCCESSFUL-EMPTY read that says what to do next", async ({ page }) => {
  await signInTo(page, FIRM_REGISTER);
  await expect(page.getByRole("heading", { name: "Firm knowledge", exact: true })).toBeVisible();
  await expect(page.getByText("has not promoted any knowledge to a firm-wide default yet")).toBeVisible();
  // The deferred re-evaluation engine is STATED (PRD:123), never implied by absence.
  await expect(page.getByText("does not re-run work by itself", { exact: false })).toBeVisible();
  await expectAccessible(page, "firm knowledge register, empty");
});

// ---------------------------------------------------------------------------
// 2 — who may act
// ---------------------------------------------------------------------------
test("a bookkeeper is not offered the promote control, and is told who can", async ({ page }) => {
  await signInTo(page, SOURCE_RECORD, "bookkeeper@example.test");
  await expect(page.getByText("MYR").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Promote to firm default" })).toHaveCount(0);
  await expect(page.getByText("Administrator access required")).toBeVisible();
  await expect(page.getByText("administrator or owner of this firm can promote", { exact: false })).toBeVisible();
  await expectAccessible(page, "knowledge detail, promote denied");
});

// ---------------------------------------------------------------------------
// 3 — the act itself
// ---------------------------------------------------------------------------
test("promote: the dialog requires an AUTHORED reason, defaults its window to the server's Kuala Lumpur date, and states that client exceptions survive", async ({ page }) => {
  await signInTo(page, SOURCE_RECORD);
  await page.getByRole("button", { name: "Promote to firm default" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The client's own narrative stays with the client: the reason starts empty.
  const reason = dialog.getByLabel("Why does this apply to the whole firm?");
  await expect(reason).toHaveValue("");
  await expect(dialog.getByText("told us on the phone")).toHaveCount(0);
  // …and the act cannot fire without one.
  await expect(dialog.getByRole("button", { name: "Record firm default" })).toBeDisabled();

  // THE SERVER'S calendar day, not the browser's clock.
  await expect(dialog.getByLabel("In effect from")).toHaveValue("2026-09-16");
  await expect(dialog.getByText("Client exceptions survive this")).toBeVisible();
  // The number a promotion is DECIDED against: clients already holding their own value.
  await expect(
    dialog.getByText("2 client(s) already hold their own value for this key", { exact: false }),
  ).toBeVisible();
  await expectAccessible(page, "promote dialog, open");

  await reason.fill("Partner meeting 2026-09-16: ringgit presentation unless a client says otherwise");
  await expect(dialog.getByRole("button", { name: "Record firm default" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Record firm default" }).click();

  // THE PERSISTENT OBJECT carries the outcome — the dialog closes and the register re-reads.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Promote to firm default" })).toHaveCount(0);
});

test("the firm register now shows the rule with the authority the act recorded, and the client that overrides it", async ({ page }) => {
  await signInTo(page, FIRM_REGISTER);
  await expect(page.getByText("default_currency").first()).toBeVisible();
  await expect(page.getByText("MYR", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Authority the act required")).toBeVisible();
  await expect(page.getByText("E2E Owner", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("Partner meeting 2026-09-16: ringgit presentation unless a client says otherwise"),
  ).toBeVisible();
  // The human-review affordance: WHO holds an exception, by name and by link. BOTH clients
  // that recorded their own value for this key keep it — including the one the rule was
  // promoted FROM, whose record is still its own record.
  await expect(page.getByText("2 clients hold an exception to this rule.")).toBeVisible();
  await expect(page.getByRole("link", { name: "654 Firm Promotion Source" })).toBeVisible();
  await expect(page.getByRole("link", { name: "654 Firm Exception Holder" })).toBeVisible();
  await expect(page.getByText("Their value: USD")).toBeVisible();
  await expect(page.getByText("No Work is currently running on this key.")).toBeVisible();
  await expectAccessible(page, "firm knowledge register, populated");
});

// ---------------------------------------------------------------------------
// 4 — what the two clients see afterwards
// ---------------------------------------------------------------------------
test("the client that already had its own value keeps it, BESIDE the labelled firm rule — and that is not a conflict", async ({ page }) => {
  await signInTo(page, EXCEPTION_REGISTER);
  await expect(page.getByText("USD").first()).toBeVisible();
  await expect(page.getByText("Firm rule for this key")).toBeVisible();
  await expect(page.getByText("Firm rule: MYR")).toBeVisible();
  await expect(page.getByText("Overridden by this client")).toBeVisible();
  // THE LINE THAT MUST NOT MOVE: a decided pair is not an undecided conflict.
  await expect(page.getByText("Conflicting", { exact: false })).toHaveCount(0);
  await page.getByRole("link", { name: "Open Firm knowledge" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${FIRM_REGISTER}$`));
  await expectAccessible(page, "client register with the exception pair");
});

test("the client with no record of its own now reads the firm rule, labelled as one", async ({ page }) => {
  await signInTo(page, `/clients/${KN.clientFirmPlain}/knowledge`);
  await expect(page.getByText("MYR").first()).toBeVisible();
  await expect(page.getByText("Firm default").first()).toBeVisible();
  // It has no record of its own, so there is nothing to override and no pair is drawn.
  await expect(page.getByText("Overridden by this client")).toHaveCount(0);
  await expectAccessible(page, "recipient client register");
});

// ---------------------------------------------------------------------------
// 5 — refusal, draft and focus
// ---------------------------------------------------------------------------
test("a governed refusal renders VERBATIM with its CLR code; the dialog stays open and the typed reason survives", async ({ page }) => {
  await signInTo(page, RACED_RECORD);
  await page.getByRole("button", { name: "Promote to firm default" }).click();
  const dialog = page.getByRole("dialog");
  const reason = dialog.getByLabel("Why does this apply to the whole firm?");
  await reason.fill("the firm seeds a manual chart for every client");
  await dialog.getByRole("button", { name: "Record firm default" }).click();

  await expect(page.getByText("CLR10", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("correct it instead of capturing a second one", { exact: false }).first(),
  ).toBeVisible();
  // The dialog is asking for a change, so it stays open with what was typed intact.
  await expect(dialog).toBeVisible();
  await expect(reason).toHaveValue("the firm seeds a manual chart for every client");
  await expectAccessible(page, "promote dialog, refused");
});

test("cancelling keeps the unsent draft under the same record, and focus returns to the trigger", async ({ page }) => {
  await signInTo(page, RACED_RECORD);
  const trigger = page.getByRole("button", { name: "Promote to firm default" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Why does this apply to the whole firm?")
    .fill("half a sentence the partner was still writing");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // FOCUS RETURNS TO THE TRIGGER (appendix C §4: "return focus must be verified").
  await expect(trigger).toBeFocused();

  // …and the draft is still there when it reopens — the state lives on the surface, not
  // inside the dialog.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Why does this apply to the whole firm?"))
    .toHaveValue("half a sentence the partner was still writing");
  // Escape closes it the same way, and focus comes back again.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// ---------------------------------------------------------------------------
// 6 — stable URL/Back
// ---------------------------------------------------------------------------
test("the firm register has its own address, and Back returns to the record it was reached from", async ({ page }) => {
  await signInTo(page, EXCEPTION_REGISTER);
  await page.getByRole("link", { name: "Open Firm knowledge" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${FIRM_REGISTER}$`));
  await expect(page.getByText("default_currency").first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${EXCEPTION_REGISTER}$`));
  await expect(page.getByText("USD").first()).toBeVisible();
  // …and the register's own address survives a reload, unchanged.
  await page.goto(FIRM_REGISTER);
  await page.reload();
  await expect(page.getByText("default_currency").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 7 — narrow width and 200% zoom (appendix C §4)
// ---------------------------------------------------------------------------
test("320px: the firm register reads without a page-wide horizontal scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, FIRM_REGISTER);
  await expect(page.getByText("default_currency").first()).toBeVisible();
  await expect(page.getByText("Authority the act required")).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "firm knowledge register, 320px");
});

test("200% zoom: the promote dialog's fields and confirm stay reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 512 });
  await signInTo(page, RACED_RECORD);
  await page.getByRole("button", { name: "Promote to firm default" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Why does this apply to the whole firm?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Record firm default" })).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the dialog must not scroll the page horizontally at the 200%-zoom equivalent")
    .toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// 8 — reduced motion (appendix C §4; review round 1, SPEC F2)
// ---------------------------------------------------------------------------
test("reduced motion: the promote dialog still opens, takes focus and closes", async ({ page }) => {
  // The dialog family this lane composes (`ArApCounterpartyDoorDialog`) animates its
  // open/close. A viewer who asked the operating system for less motion must still
  // get the dialog, its initial focus and its Escape — the state, not the animation,
  // is the product claim.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, RACED_RECORD);
  const trigger = page.getByRole("button", { name: "Promote to firm default" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Why does this apply to the whole firm?")).toBeVisible();
  await expectAccessible(page, "promote dialog, reduced motion");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// ---------------------------------------------------------------------------
// 9 — correcting and withdrawing the firm rule, from the register that owns it
//     (review round 1, adversarial finding 654-ADV-3). DECISIONS §2/#654 binds
//     the entrance to "firm register, Promote dialog, Correct/Withdraw, and the
//     firm-rule-vs-client-exception pair"; a firm record has no client and so no
//     detail route, which is why these two acts can only live here.
//
//     THESE LEGS RUN LAST ON PURPOSE: a withdrawal is terminal and takes the rule
//     off the register, so every leg that reads the populated register has to have
//     read it already.
// ---------------------------------------------------------------------------
test("a bookkeeper may READ the firm register but is offered neither Correct nor Withdraw, and is told who can", async ({ page }) => {
  await signInTo(page, FIRM_REGISTER, "bookkeeper@example.test");
  await expect(page.getByText("default_currency").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
  await expect(page.getByText("administrator or owner of this firm can change this rule", { exact: false })).toBeVisible();
  await expectAccessible(page, "firm knowledge register, acts denied");
});

test("correct then withdraw: the register is the persistent receipt for both, and the rule leaves it", async ({ page }) => {
  await signInTo(page, FIRM_REGISTER);
  await expect(page.getByText("MYR", { exact: false }).first()).toBeVisible();

  // CORRECT — a revision, not an edit: the reason is required and the value opens on
  // what the rule currently says.
  await page.getByRole("button", { name: "Correct" }).click();
  const correct = page.getByRole("dialog");
  await expect(correct).toBeVisible();
  await expect(correct.getByLabel("Corrected value")).toHaveValue("MYR");
  await expect(correct.getByText("Their exception still wins where it applies", { exact: false })).toBeVisible();
  await expect(correct.getByRole("button", { name: "Record correction" })).toBeDisabled();
  await expectAccessible(page, "firm rule correct dialog, open");
  await correct.getByLabel("Why is it being corrected?")
    .fill("the partners moved the firm's presentation currency to SGD from 1 October");
  await correct.getByRole("button", { name: "Record correction" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("SGD", { exact: false }).first()).toBeVisible();

  // WITHDRAW — terminal, and the register says what it does to the clients it reached.
  await page.getByRole("button", { name: "Withdraw" }).click();
  const withdraw = page.getByRole("dialog");
  await expect(withdraw).toBeVisible();
  await expect(withdraw.getByText("no work is re-run", { exact: false })).toBeVisible();
  await expect(withdraw.getByText("hold their own value for this key and are unaffected", { exact: false })).toBeVisible();
  await expect(withdraw.getByRole("button", { name: "Withdraw rule" })).toBeDisabled();
  await withdraw.getByLabel("Why is it being withdrawn?")
    .fill("superseded by the 2027 engagement policy");
  await withdraw.getByRole("button", { name: "Withdraw rule" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  // THE PERSISTENT OBJECT carries it: the rule is gone from the register, and the
  // successful-empty face is what a real read now returns.
  await expect(page.getByText("has not promoted any knowledge to a firm-wide default yet")).toBeVisible();
  await page.reload();
  await expect(page.getByText("has not promoted any knowledge to a firm-wide default yet")).toBeVisible();
  await expectAccessible(page, "firm knowledge register, after withdrawal");
});
