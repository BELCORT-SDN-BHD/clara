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

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { P6_5 } from "./agentic-finish-mock.mjs";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

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
  // N6 — THE CLAIM IS NOW ASSERTED. This walk's whole point is that the question arrives from a
  // READ rather than from the SSE buffer a page load discards, and the PR body said "asserted:
  // zero stream opens" while nothing counted anything. Every request the page makes is recorded
  // here, and the count is checked below — the instrument exists before the claim.
  const streamOpens: string[] = [];
  const interruptionReads: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/\/api\/tasks\/[^/]+\/stream/.test(u)) streamOpens.push(u);
    if (u.includes("/rest/v1/agent_interruptions")) interruptionReads.push(u);
  });

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

  // N6 — THE TWO HALVES, together. Zero stream opens is only evidence alongside a POSITIVE
  // count of the read that did the work: an empty list on its own is equally consistent with a
  // collector that never fired, which is the "absence from the wrong instrument" class.
  expect(interruptionReads.length, "the parked question was fetched, by a read").toBeGreaterThan(0);
  expect(streamOpens, "no SSE attachment was opened — the question came from the database").toEqual([]);
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
  //
  // THIS LEG NO LONGER RENDERS A FIRM TRANSCRIPT, and the reason is N4. Getting one would need a
  // session row matching `(created_by === callerSubject, client_id: null)` in the ONE shared
  // list — and this lane holding that row is exactly what made every other walk's firm-altitude
  // rail resolve this lane's thread. The row now carries a distinct subject, so nothing here is
  // resolvable, which is the pre-PR world restored.
  //
  // The boundary is still proved, and by its own claim rather than by a convenient fixture: the
  // altitude genuinely changed (the client workspace header is gone), and NOTHING client-owned
  // crossed — not A's transcript, not A's draft, not A's parked question.
  await page.goto(CLIENT_A);
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Client: ROME PROPERTIES")).toBeVisible();
  await page.getByLabel(COMPOSER).fill("client A again");

  await page.goto("/");
  await expect(page.getByText("Client: ROME PROPERTIES")).toHaveCount(0);
  await expect(page.getByText("CLIENT A TRANSCRIPT")).toHaveCount(0);
  await expect(page.getByText(P6_5.question)).toHaveCount(0);
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

// =============================================================================================
// The onboarding train's own arms (H-26/27/28/30/50/51 · CB-AE2E-008/023/024).
// =============================================================================================

/** Nothing that reaches a person's eyes may be a wire artefact. Asserted on the WHOLE rendered
 *  text of a face rather than on one element: the defect was a rendering DEFAULT, so a locator
 *  scoped to the row that was known to be broken would have missed the next one. */
async function assertNoWireArtefacts(page: Page, what: string): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body, `${what} must never render "[object Object]"`).not.toContain("[object Object]");
  expect(body, `${what} must never render raw JSON`).not.toContain('{"');
}

test("CB-AE2E-008 · a structured answer reads as prose on the built app — no [object Object], no raw JSON", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_A);

  // The `coa_chart_apply` row's stored answer is the OBJECT `{chart:"firm_template",
  // applied:false}` — every interview-written answer is one, and this row rendered
  // "[object Object]" before this train.
  await expect(page.getByText("Apply the firm's standard chart of accounts to this client")).toBeVisible({ timeout: 20_000 });
  // DISCRIMINATING: this sentence exists only because the formatter recognised the shape.
  await expect(page.getByText("The firm's standard chart is not applied yet")).toBeVisible({ timeout: 20_000 });
  await assertNoWireArtefacts(page, "the client A onboarding card");

  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations, "client A workspace axe violations").toEqual([]);
});

test("CB-AE2E-023 · a COMMITTED plan renders a receipt, with no Commit or Cancel trigger and the answers collapsed", async ({ page }) => {
  await signIn(page);
  await page.goto(CLIENT_B);

  await expect(page.getByRole("heading", { name: "Client onboarding" })).toBeVisible({ timeout: 20_000 });
  // The receipt's own fields — every one of them read off the plan row.
  await expect(page.getByText("This onboarding plan was committed on", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Sole practitioner — reviewed against the SSM certificate.")).toBeVisible();
  await expect(page.getByText("Plan revision", { exact: true })).toBeVisible();

  // THE DOORS THAT COULD ONLY BE REFUSED ARE GONE — not disabled, gone.
  await expect(page.getByRole("button", { name: "Commit onboarding", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel onboarding", exact: true })).toHaveCount(0);
  // And the interview is not offered on a closed plan either.
  await expect(page.getByRole("button", { name: "Start / continue interview" })).toHaveCount(0);

  // H-28 — the internal binding row is neither shown nor counted: two real items, both
  // settled. Counting the binding row would read "3 / 3" over a list of three.
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await expect(page.getByText("interview_run")).toHaveCount(0);

  // Collapsed, then opened — the answer text exists nowhere until the disclosure is used.
  await expect(page.getByText("Registration 202401047756", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: /Show the 2 recorded answers/ }).click();
  await expect(page.getByText("Registration 202401047756 — format checked", { exact: false })).toBeVisible({ timeout: 10_000 });
  await assertNoWireArtefacts(page, "the settled onboarding receipt");

  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations, "settled onboarding receipt axe violations").toEqual([]);
});

test("H-30 · the apply-chart dialog's Confirm stays inside a 1280x720 viewport with a many-family template", async ({ page }) => {
  // THE ONLY INSTRUMENT THAT CAN SEE THIS DEFECT. jsdom lays nothing out, so the node suite
  // can pin the classes and nothing more; whether the button is REACHABLE is a layout fact and
  // needs a real engine at a real viewport.
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page);
  await page.goto(CLIENT_A);
  await expect(page.getByText("Apply the firm's standard chart of accounts to this client")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Apply the standard chart" }).click();
  await page.getByLabel("Chart template").selectOption(P6_5.templateId);

  // THE POSITIVE CONTROL ON THE FIXTURE ITSELF, and it is not optional. A first cut of this
  // cell used a 15-family roster, which still FITS inside 1280x720 — so the walk passed
  // against a deliberately un-fixed dialog and was measuring nothing. The premise is that the
  // content genuinely overflows the popup; that is asserted here, before anything is claimed
  // about where the button sits.
  const boxes = page.getByRole("checkbox");
  expect(await boxes.count(), "the fixture must carry a long family roster").toBeGreaterThan(30);
  //
  // MEASURED ON THE FIELDSET, deliberately — a fix-INDEPENDENT quantity. The popup's own
  // `scrollHeight` is not the premise: with the fix it equals the capped `clientHeight`
  // (the BODY scrolls, not the box), so asserting on it would red a correct build. The
  // fieldset's laid-out height is the same either way, and it is what the content weighs.
  const familiesHeight = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dialog-content"] fieldset');
    return el ? el.getBoundingClientRect().height : null;
  });
  expect(familiesHeight, "the family fieldset").not.toBeNull();
  expect(
    familiesHeight!,
    "the family roster alone must be TALLER than the viewport, or this cell proves nothing",
  ).toBeGreaterThan(720);

  const confirm = page.getByRole("button", { name: "Apply the chart" });
  await expect(confirm).toBeVisible();
  const box = await confirm.boundingBox();
  expect(box, "the Confirm button must have a box at all").not.toBeNull();
  expect(box!.y, "Confirm must start inside the viewport, not below its bottom edge").toBeLessThan(720);
  expect(box!.y + box!.height, "and its whole height must be inside it").toBeLessThanOrEqual(720);
  expect(box!.y, "and it must not have run off the TOP either — a centred box overflows symmetrically").toBeGreaterThanOrEqual(0);

  // The header stays put while the body scrolls — the property `scrollBody` buys over a
  // blanket overflow on the whole popup.
  const title = page.getByText("Apply the firm's standard chart of accounts", { exact: true }).last();
  await expect(title).toBeVisible();

  // Reachable means CLICKABLE, not merely on screen.
  await expect(confirm).toBeEnabled();

  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations, "apply-chart dialog axe violations").toEqual([]);
});

test("H-51 / CB-AE2E-024 · /clients offers Add client above the register, follows the DATABASE's floor, and dispatches the SAME flow ⌘K does", async ({ page }) => {
  // ARM 1 — below the door's admin floor (0017:2497), the control is ABSENT. Not greyed: a
  // caller is never offered a control they could not use.
  await signIn(page, "bookkeeper@example.test");
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Add client", exact: true })).toHaveCount(0);

  // ARM 2 — a caller the DATABASE ranks above it. Nothing redeployed; `caller_context` was
  // read again and followed.
  await signIn(page, "owner@example.test");
  await page.goto("/clients");
  const addClient = page.getByRole("button", { name: "Add client", exact: true });
  await expect(addClient).toBeVisible({ timeout: 20_000 });

  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations, "/clients register axe violations").toEqual([]);

  await addClient.click();
  await page.getByLabel("Client name").fill("ROME PUBLIC ADVISORY");
  await page.getByRole("button", { name: "Begin onboarding", exact: true }).click();

  // THE SAME dispatch seam ⌘K uses — so the human lands on the client the DATABASE returned,
  // exactly as the palette arm above proves for its own entry point.
  await page.waitForURL(new RegExp(`/clients/${P6_5.newClientId}`), { timeout: 15_000 });
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
