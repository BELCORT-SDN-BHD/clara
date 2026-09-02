// P6-5's browser leg (裁-86) — the agentic surface finish, walked in real Chromium against
// the BUILT app. What the node suite proves in isolation, this proves in composition: the
// real bundle, the real router, the real ⌘K keybinding, real navigation between clients.
//
// Five journeys, one per acceptance line in the work order:
//   1. ⌘K "Do" — the row ABSENT for a caller the database ranks below the door's admin floor,
//      and OFFERED (and dispatched) for one it ranks above. The two arms sign in as different
//      personas through the real login, because `serve-built.mjs` answers `caller_context`
//      from the login email — so the allowlist genuinely changes in the DATABASE between
//      them, with nothing redeployed. The verbatim rendering of a DoorRefusal is proved in
//      the node suite instead (`components/command/command-do.test.tsx`), where a refusal can
//      be produced without a mock re-implementing a Postgres floor.
//   2. A reload during a parked clarify re-attaching the question — the journey that only
//      exists because the SSE buffer is gone after a page load.
//   3. A client switch across the structural boundary — A→B and A→firm.
//   4. An amend on a settled onboarding item, showing what it supersedes.
//   5. The apply-standard-chart button (裁-128), through its family fieldset.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT: `agentic-finish-mock.mjs`'s header states the line.
// Postgres is not in this walk, so no refusal, floor or RLS policy is exercised — only the
// calls made to them and what the surface does with the answers.

import { expect, test, type Page } from "@playwright/test";

import { P6_5 } from "./agentic-finish-mock.mjs";

const CLIENT_A = `/clients/${P6_5.clientA}`;
const CLIENT_B = `/clients/${P6_5.clientB}`;

/** Resets THIS lane's own fixtures (the chart adoption, the amendment trail). The caller's
 *  ROLE is not among them — see `agentic-finish-mock.mjs`'s header. */
async function resetFixtures(page: Page): Promise<void> {
  const response = await page.request.post("/e2e-p6-5/reset", { data: {} });
  expect(response.ok()).toBe(true);
}

/** THE REAL SIGN-IN, through the real login form — the same helper shape
 *  `chat-parity-walk.spec.ts` uses, and for the same reason: a hand-planted localStorage
 *  session would prove the walk, not the app.
 *
 *  THE PERSONA IS THE ALLOWLIST. `serve-built.mjs` answers `/rest/v1/caller_context` from the
 *  email that signed in — `bookkeeper@` is rank 1, `owner@` is rank 3 — so "what the database
 *  says this caller may do" is changed here by signing in as someone else, through the app's
 *  own session, with nothing mocked on the side. */
async function signIn(page: Page, email = "owner@example.test"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** The composer's accessible name, as `chat-parity-walk.spec.ts` pins it after the
 *  #507/#508 auto-merge took one of two values. Main's value is canonical. */
const COMPOSER = "Ask Clara";

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  // The palette is a Base UI Popup whose only heading is sr-only, so its own search input
  // is what proves it is open — the thing a human would type into.
  await expect(page.getByPlaceholder("Search or ask Clara…")).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await resetFixtures(page);
});

test("裁-37 · ⌘K Do follows the DATABASE: absent below the door's floor, offered above it", async ({ page }) => {
  // ARM 1 — the database says BOOKKEEPER. `begin_client_onboarding` floors at ADMIN
  // (`_human_ctx(role_rank('admin'))`, 0017:2497), so the row is ABSENT and the section says
  // what it looked for, rather than showing a greyed promise the caller could never keep.
  await signIn(page, "bookkeeper@example.test");
  await openPalette(page);
  await page.keyboard.type("ROME PUBLIC ADVISORY");
  await expect(page.getByText(/Nothing to dispatch from here/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Open a new client file for/)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // ARM 2 — a caller the DATABASE ranks differently. Nothing was redeployed and no cache was
  // invalidated: the palette read `caller_context` again on this open and followed it.
  await signIn(page, "owner@example.test");
  await openPalette(page);
  await page.keyboard.type("ROME PUBLIC ADVISORY");
  const doRow = page.getByText('Open a new client file for "ROME PUBLIC ADVISORY"');
  await expect(doRow).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Nothing to dispatch from here/)).toHaveCount(0);

  // And it DISPATCHES: the door is called and the human lands on the client the DATABASE
  // returned, not on a path the palette guessed.
  await doRow.click();
  await page.waitForURL(new RegExp(`/clients/${P6_5.newClientId}`), { timeout: 15_000 });
});

test("the parked question survives a RELOAD — re-read from the database, answerable in the thread", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_A);

  // A cold load with no stream open anywhere: everything on screen came from a read.
  await expect(page.getByText(P6_5.question)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Answer" })).toBeVisible({ timeout: 20_000 });

  // 裁-132's own line, on the PARKED wording, counting from the runtime's created_at.
  await expect(page.getByText(/Clara has been waiting on your answer for 1:3[0-9]\./)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Clara has been working on this for/)).toHaveCount(0);

  // A SECOND reload lands on the same state — the question is a durable fact, not a
  // one-shot the first render happened to catch.
  await page.reload();
  await expect(page.getByText(P6_5.question)).toBeVisible({ timeout: 20_000 });
});

test("the structural boundary: A -> B and A -> firm carry nothing client-owned across", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_A);
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toBeVisible({ timeout: 20_000 });

  const composer = page.getByLabel(COMPOSER);
  await composer.fill("a half-written note about client A");
  await expect(composer).toHaveValue("a half-written note about client A");

  // A -> B, through the real router.
  await page.goto(CLIENT_B);
  await expect(page.getByText("CLIENT B TRANSCRIPT")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toHaveCount(0);
  await expect(page.getByLabel(COMPOSER)).toHaveValue("");
  // Client A's parked question belongs to client A's thread and must not follow.
  await expect(page.getByText(P6_5.question)).toHaveCount(0);

  // A -> firm, the altitude change.
  await page.goto(CLIENT_A);
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(COMPOSER).fill("client A again");
  await page.goto("/");
  await expect(page.getByText("FIRM TRANSCRIPT")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toHaveCount(0);
  await expect(page.getByLabel(COMPOSER)).toHaveValue("");
});

test("裁-27 · an amend records a NEW resolution and shows what it supersedes", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_A);
  await expect(page.getByText("Which banks does this client use?")).toBeVisible({ timeout: 20_000 });

  // BOTH plan items are settled, so both rows offer an amend — the locator is scoped to the
  // row under test rather than made lenient, which would click whichever came first.
  const banksRow = page.locator("li").filter({ hasText: "Which banks does this client use?" });
  await banksRow.getByRole("button", { name: "Amend resolution" }).click();
  // Scoped to the OPEN DIALOG. "Maybank only" is also the row's own rendered answer behind
  // it, so an unscoped match would be satisfied by the page the dialog opened OVER — a
  // match that was already true before the click is a vacuous green.
  const dialog = page.getByLabel("Amend this item's resolution");
  await expect(dialog.getByText("The answer standing now")).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("Maybank only")).toBeVisible();
  // The append-only trail, read live — the answer this one supersedes. It exists NOWHERE on
  // the page outside this dialog, which is what makes it the discriminating assertion.
  await expect(dialog.getByText(/CIMB only/)).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText(/Amending records a NEW resolution/)).toBeVisible();

  // Both rows carry an "Amend resolution" textarea label, so the field is addressed inside
  // the dialog that is actually open.
  await dialog.getByLabel("Amend resolution").fill("Maybank, CIMB and HSBC");
  await dialog.getByRole("button", { name: "Record the amendment" }).click();

  // THE ROW re-read, and it now carries the corrected answer. Scoped to the row, because the
  // dialog renders the same text as "the answer standing now" — an unscoped match would be
  // satisfied by the dialog echoing back what was just typed, which proves nothing about
  // whether the card ever re-read the database.
  await expect(banksRow.getByText("Maybank, CIMB and HSBC")).toBeVisible({ timeout: 15_000 });
  await expect(banksRow.getByText("Maybank only")).toHaveCount(0, { timeout: 15_000 });
});

test("裁-128 · the apply-standard-chart button plants the confirmed families and shows the door's own receipt", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_A);
  await expect(page.getByText("Apply the firm's standard chart of accounts to this client")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Apply the standard chart" }).click();
  await page.getByLabel("Chart template").selectOption(P6_5.templateId);

  // The plan's own axis reading, said out loud rather than presented as a confident default.
  await expect(page.getByText(/Clara could not read every fact her proposal depends on\. Missing: msic\./)).toBeVisible({ timeout: 10_000 });

  const core = page.getByRole("checkbox").first();
  await expect(core).toBeChecked();
  await expect(core).toBeDisabled();

  await page.getByRole("button", { name: "Apply the chart" }).click();
  await expect(page.getByText(/Applied: 51 accounts across 1 families/)).toBeVisible({ timeout: 15_000 });
});
