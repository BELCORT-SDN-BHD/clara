import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";
import { P657 } from "./bank-match-mock.mjs";

// #657's browser leg — matching bank evidence to an already-approved booking.
//
// WHAT IS REAL AND WHAT IS FAKE: the browser, the built Next bundle and every line of client
// code are REAL — the URL-as-truth tab strip, the account/period selector, the intent-hash op
// key, the residual, the refusal renderer, the persistent outcome. PostgREST is
// `bank-match-mock.mjs`, including the two governed refusals it answers. So these legs prove the
// JOURNEY and what the surface does with an answer; they prove NOTHING about whether Postgres
// would give that answer. `clara.match_bank_line`'s own capacity wall and `line_excepted` are
// exercised in `packages/db/tests/bank-line-existing-booking.test.mjs`.
//
// THE LEGS, one per acceptance claim a node cell cannot fully carry:
//   1. URL as truth — land on ?tab=matching, reload, and still be there (D14).
//   2. Source facts beside candidates — the line's statement, filename, digest, coverage and the
//      deterministic basis, all on one screen (AC1/AC6/AC7).
//   3. Match a unique sufficient candidate and READ the persistent no-new-cash outcome (AC3/AC5/AC8).
//   4. Submit the same thing twice ⇒ the SAME op key on the wire (AC4/AC10, D15).
//   5. An over-capacity pick shows the refusal VERBATIM with its code · reason, and the typed
//      cents survive it (AC2/AC10).
//   6. An excepted line stays visible and pending with its recovery LINK, and no resolve control
//      (AC12 / C-40).
//   7. A keyboard-only path, focus return, 320px, 200% zoom, reduced motion and an axe scan (AC14).

const CLIENT = P657.clientId;
const MATCHING = `/clients/${CLIENT}/bank?tab=matching`;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

/** Open the detail pane for one line by URL — which is also the assertion that `?line=` is an
 *  address rather than component state. */
async function openLine(page: Page, lineId: string): Promise<void> {
  await page.goto(`${MATCHING}&line=${lineId}`);
  await expect(page.getByTestId("matching-detail")).toBeVisible();
}

test("the six-way sub-nav is URL as truth: a reload keeps the Matching tab and the open line", async ({ page }) => {
  await signInTo(page, MATCHING);

  // The strip is a tablist, and Matching is the selected tab because the URL says so — this is
  // the whole of D14's six-URL change. Before #657 this was `useState`, so the same URL landed
  // on Accounts every time and a shared link could not reach this tab at all.
  await expect(page.getByRole("tab", { name: "Matching" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Unmatched lines" })).toBeVisible();

  await openLine(page, P657.cleanLine);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Matching" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("matching-detail")).toBeVisible();

  // …and Back leaves the PAGE rather than stepping backwards through tabs: `router.replace`
  // creates no history entry, which is the house's existing behaviour on the registers
  // workbench and the right answer for a sub-nav (a tab is a view of one page, not a place).
  await expectAccessible(page, "bank matching, line open");
});

test("the line's source facts sit beside the candidates, with the filename, the digest, the coverage and a deterministic basis", async ({ page }) => {
  await signInTo(page, MATCHING);
  await openLine(page, P657.cleanLine);

  const detail = page.getByTestId("matching-detail");
  await expect(detail.getByText("MBB SERVICE CHARGE APR")).toBeVisible();
  await expect(page.getByTestId("detail-filename")).toHaveText("maybank-514420657001-2026-04.pdf");
  await expect(detail.getByText(/^6570000000/)).toBeVisible();
  await expect(page.getByTestId("detail-coverage")).toContainText("3 lines");
  await expect(page.getByTestId("detail-coverage")).toContainText("still unmatched");

  // The candidate facts AC7 names, on the same screen as the line.
  await expect(detail.getByText("Malayan Banking Berhad")).toBeVisible();
  await expect(detail.getByText("Bank charges — April")).toBeVisible();
  await expect(page.getByTestId(`basis-${P657.exactEntry}`)).toContainText("Amount matches exactly");
  await expect(page.getByTestId(`basis-${P657.exactEntry}`)).toContainText("Counterparty name appears in the line");
  await expect(page.getByTestId(`history-${P657.spentEntry}`)).toContainText("live");
  await expect(page.getByTestId(`high-stakes-${P657.spentEntry}`)).toBeVisible();

  // AC8's "unique sufficient", and it is a DISPLAY of the same fact the agent's own rung reads.
  await expect(page.getByTestId("candidate-sufficiency"))
    .toHaveText("One candidate matches this line's amount exactly.");

  // Q3 / SYNTHESIS J2: never a score. No percentage anywhere in the detail pane.
  await expect(detail).not.toContainText("%");
});

test("matching a unique sufficient candidate states 'no new cash entry was created', sourced from the door's own field", async ({ page }) => {
  // The key the app SENDS is observed off the request, so the op key the outcome block shows can
  // be compared with the real one rather than with a string this file made up (review A6).
  const sent: string[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rest/v1/rpc/match_bank_line")) return;
    try {
      const body = req.postDataJSON() as { p_op_key?: string } | null;
      if (body?.p_op_key) sent.push(body.p_op_key);
    } catch { /* a body this leg cannot parse is not a key it can assert on */ }
  });

  await signInTo(page, MATCHING);
  await openLine(page, P657.cleanLine);

  await page.getByRole("checkbox", { name: /Select the line MBB SERVICE CHARGE APR/ }).check();
  await page.getByRole("checkbox", { name: /Select the entry Bank charges/ }).check();
  await page.getByRole("textbox", { name: /Amount to match against Bank charges/ }).fill("-150.00");

  // The residual is a PREVIEW and says so — the database is named as the authority.
  await expect(page.getByTestId("matching-residual")).toContainText("The database enforces the tie");
  await expect(page.getByTestId("matching-residual-value")).toHaveText("RM 0.00");

  await page.getByRole("button", { name: "Match", exact: true }).click();

  const outcome = page.getByTestId("matching-outcome");
  await expect(outcome).toBeVisible();
  await expect(page.getByTestId("matching-outcome-no-new-cash"))
    .toHaveText("No new cash entry was created. This line was allocated to a booking that was already in the books.");
  await expect(outcome).toContainText(P657.matchId);
  await expect(outcome).toContainText(P657.exactEntry);
  await expect(outcome).toContainText("maybank-514420657001-2026-04.pdf");
  await expect(outcome).toContainText("Malayan Banking Berhad");

  // …and the OPERATION KEY this act was submitted under, so a human can quote it (AC10).
  expect(sent.length, "the door was called once").toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("matching-outcome-op-key")).toHaveText(sent[sent.length - 1]!);

  // PERSISTENT, not a toast: it is still there after a beat, and it is a status region.
  await page.waitForTimeout(1200);
  await expect(outcome).toBeVisible();
  await expect(outcome).toHaveAttribute("role", "status");
  await expectAccessible(page, "bank matching, after a successful match");
});

test("an over-capacity pick shows the refusal VERBATIM with its code · reason, the typed cents survive, and the retry carries the SAME op key", async ({ page }) => {
  // The op keys are read off the REQUESTS rather than by intercepting them: a route handler
  // that re-issues the call would be proving something about Playwright request replay, and this
  // leg is about what the app sends. `page.on("request")` observes and changes nothing.
  const keys: string[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rest/v1/rpc/match_bank_line")) return;
    try {
      const body = req.postDataJSON() as { p_op_key?: string } | null;
      if (body?.p_op_key) keys.push(body.p_op_key);
    } catch { /* a body this leg cannot parse is not a key it can assert on */ }
  });

  await signInTo(page, MATCHING);
  await openLine(page, P657.overLine);

  await page.getByRole("checkbox", { name: /Select the line MBB TRANSFER FEE APR/ }).check();
  await page.getByRole("checkbox", { name: /Select the entry Transfer fee/ }).check();
  const cents = page.getByRole("textbox", { name: /Amount to match against Transfer fee/ });
  await cents.fill("-153.00");
  await page.getByRole("button", { name: "Match", exact: true }).click();

  // VERBATIM, with the discriminant beside it. `lib/doors.ts` parses `details` into
  // DoorRefusal.reason and action-refusal.tsx renders `code · reason` in the chip.
  //
  // SCOPED TO THE DETAIL PANE ON PURPOSE. match_bank_line and unmatch_bank_match act through the
  // SAME part, so BLOCKER-2's fix paints the refusal in every card that acts on it — three of
  // them here. An unscoped getByText is a strict-mode violation, and `.first()` would assert
  // only that SOME card has it; the claim is that the card the human is standing in does.
  const pane = page.getByTestId("matching-detail");
  await expect(pane.getByText(P657.refusalOverCapacity)).toBeVisible();
  await expect(pane.getByText("CLR10 · already_matched")).toBeVisible();

  // THE DRAFT SURVIVES — the typed cents and both ticks. Retyping an amount you already typed
  // is how a human ends up typing a different one.
  await expect(cents).toHaveValue("-153.00");
  await expect(page.getByRole("checkbox", { name: /Select the line MBB TRANSFER FEE APR/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Select the entry Transfer fee/ })).toBeChecked();

  // …and the resubmit is the SAME operation (D15), because the key is derived from the intent.
  await page.getByRole("button", { name: "Match", exact: true }).click();
  await expect(pane.getByText(P657.refusalOverCapacity)).toBeVisible();
  expect(keys.length, "both submissions reached the door").toBeGreaterThanOrEqual(2);
  expect(keys[0], "an unchanged draft resubmits under the SAME p_op_key").toBe(keys[1]);

  await expectAccessible(page, "bank matching, refused over-capacity pick");
});

test("an excepted line stays visible and pending with a LINKED recovery, and no resolve control is offered", async ({ page }) => {
  await signInTo(page, MATCHING);

  // It is NOT in the unmatched report — `list_unmatched_lines` excludes an open-excepted line
  // by design. The context read is what keeps it reachable and on screen.
  await expect(page.getByText("MBB UNKNOWN CREDIT APR")).toHaveCount(0);

  await openLine(page, P657.exceptedLine);
  const face = page.getByTestId("matching-exception-face");
  await expect(face).toBeVisible();
  await expect(page.getByTestId("exception-reason")).toContainText("the client says this credit is not theirs");
  await expect(page.getByTestId("exception-token")).toHaveText("exception_booking_outstanding");
  await expect(face).toContainText("A booking made from this line is still outstanding");

  const remedy = page.getByTestId("exception-remedy-link").first();
  await expect(remedy).toBeVisible();
  await expect(remedy).toHaveAttribute("href", `/clients/${CLIENT}/bank?tab=exceptions`);
  await expect(face).toContainText("Exceptions are resolved in the Exceptions tab, not here.");
  await expect(face.getByRole("button")).toHaveCount(0);

  // The door still refuses, by name. Nothing on this surface is a bypass.
  await page.getByRole("checkbox", { name: /Select the entry Bank charges/ }).check();
  await page.getByRole("textbox", { name: /Amount to match against Bank charges/ }).fill("200.00");
  await page.getByRole("button", { name: "Match", exact: true }).click();
  await expect(page.getByText(/Select at least one line and one entry\./)).toBeVisible();

  await expectAccessible(page, "bank matching, excepted line");
});

test("the matching surface holds at 320px, at 200% zoom, under reduced motion, and on a keyboard-only path", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, MATCHING);
  await openLine(page, P657.cleanLine);

  // 320px: no horizontal overflow of the document itself.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal page scroll at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "bank matching at 320px");

  // 200% zoom is emulated the way the rest of this suite does it — half the CSS viewport.
  await page.setViewportSize({ width: 640, height: 480 });
  await expect(page.getByTestId("matching-detail")).toBeVisible();
  const zoomedOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(zoomedOverflow, "no horizontal page scroll at 200% zoom").toBeLessThanOrEqual(1);

  // KEYBOARD ONLY: reach the line checkbox by tabbing and toggle it with the space bar, then
  // confirm focus is still on the control the human acted on — a surface that moves focus after
  // a selection is a surface a keyboard user loses their place in.
  await page.setViewportSize({ width: 1280, height: 900 });
  const lineBox = page.getByRole("checkbox", { name: /Select the line MBB SERVICE CHARGE APR/ });
  await lineBox.focus();
  await page.keyboard.press("Space");
  await expect(lineBox).toBeChecked();
  await expect(lineBox).toBeFocused();

  await expectAccessible(page, "bank matching, keyboard path");
});
