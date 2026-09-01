import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CLIENT_SEG_KEYS } from "../lib/interview/api";

/**
 * FS-5's 裁-86 built-app walk for the durable client interview.
 *
 * COVERED ARMS: a fresh/idempotently-resumed client run through every
 * CLIENT_SEG_KEYS segment and its confirmations to the reachable checklist
 * commit door; a separate client's typed two-step cancellation; a third
 * client's same-park, two-browser-context race through the GH #152 409
 * disambiguation; and an axe WCAG 2.1 A/AA scan of the interview card.
 *
 * FS-8 PR-1 (裁-86 e2e leg, P6-T IA shell) ADDS one more arm: a SEPARATE
 * test() that calls `establishSession(page)` itself (Playwright gives every
 * test its own fresh page/context — nothing is shared across `test()`
 * blocks) on the SAME COMPLETE fixture's client id, then walks nav-click and
 * ⌘K to the new Tax tab and asserts its three honest notes actually render.
 * No interview segment is answered by this arm — it only needs the
 * fixture's authenticated client, not its thread.
 *
 * FS-8 PR-2 (裁-97) ADDS a further arm, firm-altitude this time: nav-click
 * through FirmNav's Admin link to the new /admin/settings surface, asserting
 * the high-stakes-threshold control and the capabilities honest note both
 * render. `establishSession` mints a JWT for the SAME sub `rig.buildFirm`
 * creates as the fixture's OWNER, so this session genuinely holds owner
 * rank — the control is asserted rendered and reachable, not merely visible-
 * but-refused.
 *
 * DELIBERATELY DEFERRED: execution against the live runtime/DB estate. This
 * file consumes three isolated, already-open review fixtures supplied via the
 * environment below. Per the FS-5 order, that run happens in the review/merge
 * ceremony, not during authorship. The sample-invoice slot is asserted in the
 * completion walk, but binary upload transport is covered by useUploadQueue's
 * own battery rather than mutating the interview fixture with a throwaway file.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Fixture = { clientId: string; threadId: string };

function fixture(name: "COMPLETE" | "CANCEL" | "RACE"): Fixture | null {
  const clientId = process.env[`CLARA_E2E_INTERVIEW_${name}_CLIENT_ID`];
  const threadId = process.env[`CLARA_E2E_INTERVIEW_${name}_THREAD_ID`];
  return clientId && threadId ? { clientId, threadId } : null;
}

function fixturePath(value: Fixture): string {
  return `/clients/${encodeURIComponent(value.clientId)}/clara/${encodeURIComponent(value.threadId)}`;
}

// N4 (review round 1): api.ts's own `CLIENT_SEG_KEYS` export stays
// `readonly string[]` on purpose (segmentProgress's `.indexOf(seg: string)`
// call needs the wider type against a runtime-supplied segment), so
// `(typeof CLIENT_SEG_KEYS)[number]` resolves to plain `string` and gave
// ANSWERS below zero compile-time exhaustiveness — a typo'd or omitted key
// was only ever caught by the runtime `if (answer === undefined) throw`
// further down, never by tsc. This is a literal, `as const` mirror scoped to
// this file only, so ANSWERS can be typed over a real union and a missing/
// misspelled key becomes a compile error. The mirror is checked against the
// live export below so the two cannot silently drift, and the runtime throw
// stays exactly where it was — a type-level guarantee here is not a licence
// to drop the defense against whatever segment the LIVE runtime actually
// sends (accountingBasis's own `completeAccountingBasis`, below, is the
// documented case of exactly that: a real segment outside this list).
const KNOWN_CLIENT_SEGS = [
  "legal_name", "entity_type", "ssm", "turnover", "tin", "msic", "sst_regime",
  "sst_no", "statutory", "banks", "currency", "fye", "framework", "coa_seed",
  "opening_position", "fa_depreciation", "sample_invoices",
] as const;

if (
  KNOWN_CLIENT_SEGS.length !== CLIENT_SEG_KEYS.length ||
  KNOWN_CLIENT_SEGS.some((seg, i) => seg !== CLIENT_SEG_KEYS[i])
) {
  throw new Error("KNOWN_CLIENT_SEGS (interview-walk.spec.ts) has drifted from CLIENT_SEG_KEYS (lib/interview/api.ts) — update both together");
}

type KnownClientSeg = (typeof KNOWN_CLIENT_SEGS)[number];

const ANSWERS: Record<KnownClientSeg, string> = {
  legal_name: "ROME PUBLIC ADVISORY",
  entity_type: "sole_prop",
  ssm: "202401047756",
  turnover: "<RM1M",
  tin: "skip",
  msic: "69200",
  sst_regime: "not_registered",
  sst_no: "skip",
  statutory: "skip",
  banks: "Maybank 1234567890",
  currency: "MYR",
  fye: "12",
  framework: "special_purpose",
  coa_seed: "yes",
  opening_position: "new_first_year",
  fa_depreciation: "no",
  sample_invoices: "skip",
};

const SKIPS_CONFIRMATION = new Set(["sst_no", "statutory", "sample_invoices"]);

function card(page: Page): Locator {
  return page.locator('[aria-label="Client onboarding interview"]');
}

function latestTurn(page: Page): Locator {
  return page.getByRole("log", { name: "Interview activity" }).locator(":scope > div").last();
}

/** Establishes a real, cookie-backed session before the first navigation to
 *  a fixture route — `openFixture` itself assumes one already exists (it
 *  goes straight to the client route and expects the authenticated "Clara"
 *  heading). Mirrors signup-confirm-pending.spec.ts's own explicit-confirm
 *  precedent: navigate to /auth/confirm, click the explicit "Confirm my
 *  email" button (never auto-submitted — the login-CSRF binding this
 *  confirm face carries requires the click), which POSTs to
 *  /auth/confirm/verify and drives the REAL @supabase/ssr client through
 *  its own cookie-writing code — nothing here guesses the cookie format.
 *  The live-stack harness's own serve-live.mjs answers the matching
 *  `token_hash` with a genuinely-signed JWT for the fixture owner. Only
 *  needs to run once per browser CONTEXT — the RACE test's second context
 *  is opened with `storageState: await context.storageState()`, so it
 *  inherits this session rather than needing its own confirm click. */
async function establishSession(page: Page): Promise<void> {
  await page.goto("/auth/confirm?token_hash=e2e-live-token-hash&type=email");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).not.toHaveURL(/\/auth\/confirm/, { timeout: 30_000 });
}

async function openFixture(page: Page, value: Fixture): Promise<void> {
  await page.goto(fixturePath(value));
  await expect(page.getByRole("heading", { name: "Clara" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Client onboarding" })).toBeVisible();
  await page.getByRole("button", { name: "Start / continue interview" }).click();
  await expect(page.getByLabel("Your answer")).toBeVisible({ timeout: 30_000 });
}

async function answerCurrentPark(page: Page, value: string): Promise<void> {
  const field = page.getByLabel("Your answer");
  await field.fill(value);
  // Scoped to the interview card (test-spec fix, first surfaced by this
  // walk's own real-browser run, never caught by the unit harness's
  // first-match `find`): the underlying Clara thread composer carries its
  // OWN, separate "Send" button (Clara.thread's composer, always mounted
  // alongside this card) — an unscoped getByRole("button", {name:"Send"})
  // is a genuine Playwright strict-mode ambiguity between the two, not a
  // product defect.
  await card(page).getByRole("button", { name: "Send", exact: true }).click();
}

async function completeTrackedSegment(
  page: Page,
  index: number,
  seg: KnownClientSeg,
): Promise<void> {
  const progress = page.getByText(`step ${index + 1} · ${seg}`, { exact: true });
  await expect(progress).toBeVisible({ timeout: 30_000 });

  if (seg === "sample_invoices") {
    await expect(page.getByLabel("Attach sample invoices")).toBeVisible();
  }

  const answer = ANSWERS[seg];
  if (answer === undefined) throw new Error(`missing Playwright answer for ${seg}`);
  await answerCurrentPark(page, answer);
  if (!SKIPS_CONFIRMATION.has(seg)) {
    await expect(latestTurn(page)).toContainText("I recorded:", { timeout: 30_000 });
    await answerCurrentPark(page, "yes");
  }
  await expect(progress).toHaveCount(0, { timeout: 30_000 });
}

async function completeAccountingBasis(page: Page): Promise<void> {
  // This runtime question is intentionally not in CLIENT_SEG_KEYS, so its
  // progress line degrades to null by contract. It still has to be answered
  // before the next tracked segment can become current.
  // Test-spec fix (first surfaced by this walk's own real-browser run): the
  // live runtime's actual question text capitalizes BASIS — this was a
  // guess made before ever seeing the real prompt, and the live walk is
  // exactly the instrument that catches that class of mistake.
  await expect(latestTurn(page)).toContainText("On what BASIS", { timeout: 30_000 });
  await answerCurrentPark(page, "accrual");
  await expect(latestTurn(page)).toContainText("I recorded:", { timeout: 30_000 });
  await answerCurrentPark(page, "yes");
}

test("client interview completes every tracked segment, unlocks Commit, and passes an axe scan", async ({ page }) => {
  const target = fixture("COMPLETE");
  test.skip(!target, "review/merge supplies the isolated COMPLETE client/thread fixture");
  await establishSession(page);
  await openFixture(page, target!);

  for (let index = 0; index < KNOWN_CLIENT_SEGS.length; index += 1) {
    const seg = KNOWN_CLIENT_SEGS[index];
    if (seg === undefined) throw new Error(`missing KNOWN_CLIENT_SEGS entry at ${index}`);
    await completeTrackedSegment(page, index, seg);
    if (seg === "framework") await completeAccountingBasis(page);
  }

  await expect(card(page).getByText("The interview is complete.")).toBeVisible({ timeout: 30_000 });

  const commitTrigger = page.getByRole("button", { name: "Commit onboarding", exact: true }).first();
  await commitTrigger.click();
  const commitButtons = page.getByRole("button", { name: "Commit onboarding", exact: true });
  await expect(commitButtons).toHaveCount(2);
  const commitConfirm = commitButtons.last();
  await expect(commitConfirm).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Client onboarding interview"]')
    .withTags(WCAG_TAGS)
    .analyze();
  expect(axe.violations, "completed interview card axe violations").toEqual([]);
});

test("a separate interview run performs typed runtime-then-DB cancellation", async ({ page }) => {
  const target = fixture("CANCEL");
  test.skip(!target, "review/merge supplies the isolated CANCEL client/thread fixture");
  await establishSession(page);
  await openFixture(page, target!);

  await page.getByRole("button", { name: "Cancel onboarding", exact: true }).click();
  await page.getByLabel("Reason for cancelling").fill("FS-5 Playwright cancellation arm");
  const cancelButtons = page.getByRole("button", { name: "Cancel onboarding", exact: true });
  await expect(cancelButtons).toHaveCount(2);
  await cancelButtons.last().click();

  await expect(card(page).getByText("This interview was cancelled.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/This onboarding plan was cancelled: FS-5 Playwright cancellation arm/)).toBeVisible({ timeout: 30_000 });
});

test("two browser contexts answering the same park converge on confirmed state without a false success or refusal", async ({ browser, context, page }) => {
  const target = fixture("RACE");
  test.skip(!target, "review/merge supplies the isolated RACE client/thread fixture");

  await establishSession(page);
  await openFixture(page, target!);
  const secondContext = await browser.newContext({
    storageState: await context.storageState(),
    ignoreHTTPSErrors: true,
    baseURL: process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100",
  });
  const secondPage = await secondContext.newPage();
  try {
    await openFixture(secondPage, target!);
    await expect(page.getByText("step 1 · legal_name", { exact: true })).toBeVisible();
    await expect(secondPage.getByText("step 1 · legal_name", { exact: true })).toBeVisible();

    const racedAnswer = "ROME PUBLIC ADVISORY RACE FIXTURE";
    await page.getByLabel("Your answer").fill(racedAnswer);
    await secondPage.getByLabel("Your answer").fill(racedAnswer);
    // Scoped to the interview card — see answerCurrentPark's own note: an
    // unscoped "Send" also matches the underlying Clara thread composer's
    // own, separate Send button.
    await Promise.all([
      card(page).getByRole("button", { name: "Send", exact: true }).click(),
      card(secondPage).getByRole("button", { name: "Send", exact: true }).click(),
    ]);

    // Both contexts converge on the same echo-confirm park (test-spec fix:
    // legal_name is NOT in SKIPS_CONFIRMATION, so the answer above only
    // reaches the 'c' phase — it is not yet durable/echoed until BOTH
    // contexts also race the confirm itself, exactly like
    // completeTrackedSegment's own answer-then-confirm shape, just doing
    // both halves concurrently across two contexts).
    for (const candidate of [page, secondPage]) {
      await expect(latestTurn(candidate)).toContainText("I recorded:", { timeout: 30_000 });
    }
    await Promise.all([
      answerCurrentPark(page, "yes"),
      answerCurrentPark(secondPage, "yes"),
    ]);

    // Positive proof, not absence alone: both contexts hydrate the same
    // durable echo. Because the card never appends locally, this rendered
    // answer can only have come from /state.
    for (const candidate of [page, secondPage]) {
      await expect(candidate.getByRole("log", { name: "Interview activity" }).getByText(racedAnswer, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(candidate.getByLabel("Your answer")).toHaveValue("");
      await expect(card(candidate).getByRole("alert")).toHaveCount(0);
    }
  } finally {
    await secondContext.close();
  }
});

test("the Tax tab is reachable by nav-click and by ⌘K, and its three honest notes render (FS-8, P6-T IA shell)", async ({ page }) => {
  const target = fixture("COMPLETE");
  test.skip(!target, "review/merge supplies the isolated COMPLETE client/thread fixture");
  await establishSession(page);
  const workspaceHref = `/clients/${encodeURIComponent(target!.clientId)}`;
  const taxHref = `${workspaceHref}/tax`;

  // Arm 1 — nav-click. The workspace home is enough; the interview segments
  // above are never touched by this arm.
  await page.goto(workspaceHref);
  await page
    .getByRole("navigation", { name: "Client workspace navigation" })
    .getByRole("link", { name: "Tax", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${taxHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.getByRole("heading", { name: "SST", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Income tax computation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Turnover classification", exact: true })).toBeVisible();
  await expect(page.getByText("F-T1 PR-2 onward, paused", { exact: false })).toBeVisible();
  await expect(page.getByText("F-T3 PR-2…9, paused", { exact: false })).toBeVisible();
  await expect(page.getByText("Track B's Tax tab UI resumes", { exact: false })).toBeVisible();

  // Arm 2 — ⌘K, from the workspace home (not the tax tab itself), proving
  // the palette's OWN client-scoped route also reaches it, independent of
  // the nav strip walked above.
  await page.goto(workspaceHref);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Search or ask Clara…").fill("tax");
  await dialog.getByText("Tax", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${taxHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});

test("the firm settings surface is reachable via the Admin nav, and the threshold control renders for the owner fixture (FS-8 PR-2, 裁-97)", async ({ page }) => {
  const target = fixture("COMPLETE");
  test.skip(!target, "review/merge supplies the isolated COMPLETE client/thread fixture");
  await establishSession(page);

  // Nav: firm home -> Admin (FirmNav) -> Firm settings (the /admin index's
  // own link, added this PR) -> /admin/settings. `establishSession` mints a
  // JWT for the SAME sub `rig.buildFirm` created as the fixture's OWNER
  // (createFirm(owner, ...)), so this session genuinely holds owner rank —
  // the threshold control is expected to render fully, not just be visible-
  // but-refused.
  await page.goto("/");
  await page.getByRole("navigation", { name: "Firm navigation" }).getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Firm settings", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);

  await expect(page.getByRole("heading", { name: "High-stakes threshold", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change threshold", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signing capabilities", exact: true })).toBeVisible();
  await expect(page.getByText("grant_firm_capability and revoke_firm_capability are live", { exact: false })).toBeVisible();
});
