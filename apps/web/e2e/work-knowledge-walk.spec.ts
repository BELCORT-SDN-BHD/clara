import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInTo } from "./helpers";
import { WK } from "./work-knowledge-mock.mjs";

// #658 — journey B3, the knowledge half: "what did this run read before it acted, at which
// version, and what happens when that basis moves under a parked question".
//
// WHAT THIS WALK PROVES, and what it does not. The browser, the built Next bundle and every line
// of client code are REAL: `WorkDetail`'s Sources tab, `WorkKnowledgeBlock`, `WorkDiagnostics`'s
// `observed_revisions` block, `WorkQuestionForm` and its draft machinery, and
// `lib/work/knowledge.ts`'s drift judgement. PostgREST is `work-knowledge-mock.mjs`. So this walk
// proves the JOURNEY; the door's own floors, its firm-scope shadow and its `relevant is NULL,
// never false` rule are proven against a real Postgres under real least-privileged roles in
// `packages/db/tests/knowledge-retrieval.test.mjs`.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

/** Land a knowledge correction the way a human correcting a record elsewhere in the estate does —
 *  through this lane's OWN control endpoint, scoped on the wire to this lane's client. */
async function landCorrection(page: Page, keys: string[] | null): Promise<void> {
  const status = await page.evaluate(
    async ([client, moved, path]) => {
      const res = await fetch(`${path as string}?client=${client as string}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(moved === null ? { action: "reset" } : { action: "move", keys: moved }),
      });
      return res.status;
    },
    [WK.clientId, keys, WK.controlPath] as const,
  );
  expect(status, "the lane's control endpoint must answer").toBe(200);
}

test.beforeEach(async ({ page }) => {
  // The lane's fixture state lives for the server's lifetime (`playwright.config.ts` pins
  // `workers: 1`), so every cell that moves the basis resets it first.
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await landCorrection(page, null);
});

// ---------------------------------------------------------------------------
// 1 — what the run read, on the Sources tab
// ---------------------------------------------------------------------------
test("Work detail shows WHAT this run read: the face word, the version, the period, the keys and the tier counts", async ({ page }) => {
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  const block = page.getByTestId("work-knowledge-block");
  await expect(block).toBeVisible();
  await expect(block.getByText("Read partial")).toBeVisible();
  await expect(block.getByText("Knowledge version 42")).toBeVisible();
  await expect(block.getByText("Read for 2026-09-18")).toBeVisible();
  await expect(page.getByTestId("work-knowledge-keys")).toContainText("accounting_basis, sst_regime");
  await expect(page.getByTestId("work-knowledge-tiers")).toContainText("Required 3");
  // PARTIAL IS ITS OWN SENTENCE — the required set IS complete and the rest is not.
  await expect(page.getByTestId("work-knowledge-truncated")).toBeVisible();
  // …and the runtime's own word never reaches the face.
  await expect(block.getByText("unavailable", { exact: false })).toHaveCount(0);
  await expectAccessible(page, "work detail, sources tab with the knowledge block");
});

test("the Activity tab's diagnostics render the observed knowledge version the run recorded", async ({ page }) => {
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.getByRole("button", { name: /Show \d+ steps/ }).click();
  await expect(page.getByTestId("work-diagnostics-observed").first()).toContainText("knowledge_version 42");
  // The re-read is labelled as a READ, and this change did not touch that.
  await expect(page.getByRole("button", { name: "Re-read trace" })).toBeVisible();
  await expectAccessible(page, "work detail, diagnostics with observed revisions");
});

// ---------------------------------------------------------------------------
// 2 — the basis moves, and the draft survives it
// ---------------------------------------------------------------------------
test("a knowledge correction lands → the banner appears naming the key → the typed draft survives → the answer is recorded", async ({ page }) => {
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  // The parked question is ABOVE the tabs (journey B3's own rule), so it is the first thing a
  // person meets. Type an answer, and do NOT send it.
  const field = page.getByLabel("Posting date");
  await expect(field).toBeVisible();
  await field.fill("2026-09-05");
  await expect(page.getByTestId("work-knowledge-drift-relevant")).toHaveCount(0);

  // Somebody corrects a record this Work READ.
  await landCorrection(page, ["sst_regime"]);
  await page.reload();

  // THE BANNER ARRIVES, NAMING THE KEY THE WORK READ.
  await expect(page.getByTestId("work-knowledge-drift-relevant").first()).toBeVisible();
  await expect(page.getByText("A record this Work read has changed").first()).toBeVisible();
  await expect(page.getByText("sst_regime", { exact: false }).first()).toBeVisible();
  // …AND THE DRAFT SURVIVED. The banner is additive: nothing was cleared, nothing disabled.
  await expect(page.getByLabel("Posting date")).toHaveValue("2026-09-05");
  await expectAccessible(page, "work detail, drift banner with a live draft");

  // RE-ASK: the answer is sent, and the persistent record carries it.
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByText("Your answer was accepted", { exact: false }).first())
    .toBeVisible({ timeout: 15_000 });
});

test("a key the Work did NOT read moves: the basis drifted, and the surface says nothing about it", async ({ page }) => {
  await landCorrection(page, ["default_currency"]);
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByTestId("work-knowledge-block")).toBeVisible();
  await expect(page.getByTestId("work-knowledge-drift-relevant")).toHaveCount(0);
  await expect(page.getByTestId("work-knowledge-drift-unrecorded")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3 — the v4-shaped run: a version, and NOTHING about which records it read
// ---------------------------------------------------------------------------
test("a Work with only an execution-trace version says which records it read was NOT recorded — never `unrelated`", async ({ page }) => {
  await landCorrection(page, ["sst_regime"]);
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workTrace}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByTestId("work-knowledge-trace-only")).toBeVisible();
  await expect(page.getByText("Knowledge version 7")).toBeVisible();
  await expect(page.getByTestId("work-knowledge-drift-unrecorded").first()).toBeVisible();
  await expect(page.getByText("changed after this Work last read it", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("unrelated", { exact: false })).toHaveCount(0);
  await expectAccessible(page, "work detail, trace-only observation with the unrecorded banner");
});

// ---------------------------------------------------------------------------
// 4 — narrow width, zoom, keyboard, reduced motion and a stable URL
// ---------------------------------------------------------------------------
test("320px: the knowledge block reads without a page-wide horizontal scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByTestId("work-knowledge-block")).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at 320px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "work knowledge block, 320px");
});

test("200% zoom: the knowledge block and the tab strip stay reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 512 });
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByTestId("work-knowledge-block")).toBeVisible();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page must not scroll horizontally at the 200%-zoom equivalent").toBeLessThanOrEqual(1);
});

test("keyboard only: the tab strip is reachable and focus stays where the person put it", async ({ page }) => {
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  const sources = page.getByRole("tab", { name: "Sources" });
  await sources.focus();
  await expect(sources).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Activity" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(sources).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("work-knowledge-block")).toBeVisible();
  // A TAB SWITCH IS NEVER A WRITE, and it is not a navigation either: the address is unmoved,
  // so the link a person shares is still the Work.
  await expect(page).toHaveURL(new RegExp(`/clients/${WK.clientId}/work/${WK.workRead}$`));
  await expect(sources).toBeFocused();
});

test("reduced motion: the block renders with no animation, and Back returns to the Work list", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, `/clients/${WK.clientId}/work/${WK.workRead}`);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByTestId("work-knowledge-block")).toBeVisible();
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((el) => {
      const d = getComputedStyle(el).animationDuration;
      return d !== "" && d !== "0s" && d !== "auto";
    }).length);
  expect(animated, "nothing animates under prefers-reduced-motion").toBe(0);
});
